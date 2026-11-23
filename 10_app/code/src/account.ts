// Accounts on Horizon's server (40_sync_server): a username and a password, with the plans end-to-end encrypted.
//
// The password never leaves the browser. PBKDF2-SHA-256 (600,000 iterations, the account's random salt) turns it into
// 64 bytes: the first 32 are the authentication key the server checks (it stores only a hash of it), the last 32 the
// AES-256-GCM key which seals the plans before they are uploaded. The server holds only sealed data, so neither it nor
// anyone reading its storage can read a plan, and a forgotten password cannot be recovered.
//
// The session (the server's token, the account's version, and the encryption key) lives in this tab's session storage,
// or in local storage when "Stay signed in" is ticked. A sealed copy of the plans stays on the device for offline use;
// edits upload a second and a half after the last change, naming the version they replace, and a save from another
// device in between is reported as a conflict instead of being overwritten.
import { SYNC_URL } from './syncConfig';

const ITERATIONS = 600_000;
const SESSION_KEY = 'horizon-account';
const CACHE_KEY = 'horizon-account-cache';
export const MODE_KEY = 'horizon-mode';

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

interface Session { username: string; token: string; version: number; key: string; remember: boolean }
interface Sealed { iv: string; ct: string }

let session: Session | null = null;
let cryptoKey: CryptoKey | null = null;
let plain: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: string | null = null;

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'conflict' | 'signedOut';
let status: SyncStatus = 'saved';
const listeners = new Set<(s: SyncStatus) => void>();
const setStatus = (s: SyncStatus) => { status = s; listeners.forEach((f) => f(s)); };
export const syncStatus = () => status;
export const onSyncStatus = (f: (s: SyncStatus) => void) => { listeners.add(f); return () => listeners.delete(f); };
export const signedIn = () => session !== null;
export const accountName = () => session?.username ?? '';

async function api(path: string, method: string, body?: unknown, token?: string) {
  const res = await fetch(SYNC_URL + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** The authentication key (sent) and the encryption key (kept) from a password and the account's salt. */
async function keys(password: string, salt: string) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt) as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, base, 512));
  return { auth: b64(bits.slice(0, 32)), enc: bits.slice(32) };
}

const importKey = (raw: Uint8Array) => crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function seal(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey!, new TextEncoder().encode(text)));
  return JSON.stringify({ iv: b64(iv), ct: b64(ct) } satisfies Sealed);
}

async function unseal(text: string): Promise<string> {
  const f = JSON.parse(text) as Sealed;
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) as BufferSource }, cryptoKey!, unb64(f.ct) as BufferSource));
}

function store(s: Session) {
  session = s;
  const text = JSON.stringify(s);
  if (s.remember) { localStorage.setItem(SESSION_KEY, text); sessionStorage.removeItem(SESSION_KEY); }
  else { sessionStorage.setItem(SESSION_KEY, text); localStorage.removeItem(SESSION_KEY); }
}

async function begin(username: string, token: string, version: number, enc: Uint8Array, remember: boolean, data: string | null) {
  cryptoKey = await importKey(enc);
  store({ username, token, version, key: b64(enc), remember });
  plain = data ? await unseal(data) : null;
  if (data) localStorage.setItem(CACHE_KEY, data);
  localStorage.setItem(MODE_KEY, 'account');
  setStatus('saved');
}

const clean = (u: string) => u.trim().toLowerCase();

/** Creates an account; the plans on this device become its first copy. */
export async function signUp(username: string, password: string, remember: boolean, initial: string | null): Promise<string | null> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const k = await keys(password, salt);
  const r = await api('/signup', 'POST', { username: clean(username), salt, auth: k.auth }).catch(() => null);
  if (!r) return 'The server cannot be reached.';
  if (!r.ok) return r.data.error ?? 'Sign-up failed.';
  await begin(clean(username), r.data.token, 0, k.enc, remember, null);
  if (initial) { plain = initial; await upload(initial); }
  return null;
}

/** Signs in; null on success, else the reason. */
export async function signIn(username: string, password: string, remember: boolean): Promise<string | null> {
  const s = await api('/salt', 'POST', { username: clean(username) }).catch(() => null);
  if (!s) return 'The server cannot be reached.';
  if (!s.ok) return s.data.error ?? 'Sign-in failed.';
  const k = await keys(password, s.data.salt);
  const r = await api('/login', 'POST', { username: clean(username), auth: k.auth }).catch(() => null);
  if (!r) return 'The server cannot be reached.';
  if (!r.ok) return r.data.error ?? 'Sign-in failed.';
  try {
    await begin(clean(username), r.data.token, r.data.version, k.enc, remember, r.data.data);
  } catch {
    return 'The plans on the server could not be decrypted.';
  }
  return null;
}

/** Resumes a session this tab or device kept; refreshes from the server when it answers, else uses the sealed copy. */
export async function resume(): Promise<boolean> {
  const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  const s = JSON.parse(raw) as Session;
  cryptoKey = await importKey(unb64(s.key));
  session = s;
  const r = await api('/data', 'GET', undefined, s.token).catch(() => null);
  if (r?.status === 401) { forget(); return false; }
  try {
    if (r?.ok) {
      store({ ...s, version: r.data.version });
      plain = r.data.data ? await unseal(r.data.data) : null;
      if (r.data.data) localStorage.setItem(CACHE_KEY, r.data.data);
      setStatus('saved');
    } else {
      const cached = localStorage.getItem(CACHE_KEY);
      plain = cached ? await unseal(cached) : null;
      setStatus('offline');
    }
  } catch {
    forget();
    return false;
  }
  return true;
}

async function upload(text: string) {
  if (!session) return;
  setStatus('saving');
  const sealed = await seal(text);
  localStorage.setItem(CACHE_KEY, sealed);
  const r = await api('/data', 'PUT', { data: sealed, version: session.version }, session.token).catch(() => null);
  if (!r) { setStatus('offline'); timer = setTimeout(() => upload(pending ?? text), 15000); return; }
  if (r.status === 409) { setStatus('conflict'); return; }
  if (r.status === 401) { setStatus('signedOut'); return; }
  if (r.ok) { store({ ...session, version: r.data.version }); setStatus(pending && pending !== text ? 'saving' : 'saved'); }
}

/** Keeps the newer copy from the server after a conflict, dropping this device's unsaved edits. */
export async function takeServerCopy() {
  if (!session) return;
  const r = await api('/data', 'GET', undefined, session.token).catch(() => null);
  if (!r?.ok) return;
  store({ ...session, version: r.data.version });
  if (r.data.data) localStorage.setItem(CACHE_KEY, r.data.data);
  location.reload();
}

/** Keeps this device's copy after a conflict, replacing the server's. */
export async function keepThisCopy() {
  if (!session || plain === null) return;
  const r = await api('/data', 'GET', undefined, session.token).catch(() => null);
  if (!r?.ok) return;
  store({ ...session, version: r.data.version });
  await upload(plain);
}

/** Changes the password: new salt and keys, the plans re-sealed, and every other session signed out. */
export async function changePassword(password: string): Promise<string | null> {
  if (!session || plain === null) return 'Not signed in.';
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const k = await keys(password, salt);
  const old = cryptoKey;
  cryptoKey = await importKey(k.enc);
  const data = await seal(plain);
  const r = await api('/password', 'POST', { salt, auth: k.auth, data, version: session.version }, session.token).catch(() => null);
  if (!r?.ok) { cryptoKey = old; return r?.data?.error ?? 'The server cannot be reached.'; }
  store({ ...session, token: r.data.token, version: r.data.version, key: b64(k.enc) });
  localStorage.setItem(CACHE_KEY, data);
  return null;
}

export async function deleteAccount(password: string): Promise<string | null> {
  if (!session) return 'Not signed in.';
  const s = await api('/salt', 'POST', { username: session.username });
  const k = await keys(password, s.data.salt);
  const r = await api('/delete', 'POST', { auth: k.auth }, session.token).catch(() => null);
  if (!r?.ok) return r?.data?.error ?? 'The server cannot be reached.';
  forget();
  localStorage.removeItem(MODE_KEY);
  location.reload();
  return null;
}

function forget() {
  session = null; cryptoKey = null; plain = null;
  sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); localStorage.removeItem(CACHE_KEY);
}

export async function signOut() {
  if (session) await api('/logout', 'POST', {}, session.token).catch(() => null);
  forget();
  location.reload();
}

/** The storage the app persists through while signed in: the decrypted plans in memory, uploads debounced. */
export const accountStorage = {
  getItem: async (): Promise<string | null> => plain,
  setItem: async (_name: string, value: string): Promise<void> => {
    if (!session || value === plain) return;
    plain = value;
    pending = value;
    if (timer) clearTimeout(timer);
    setStatus('saving');
    timer = setTimeout(() => { const v = pending!; pending = null; upload(v); }, 1500);
  },
  removeItem: async (): Promise<void> => {},
};
