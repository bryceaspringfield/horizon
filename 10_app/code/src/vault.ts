// Optional password protection of everything the app stores, in the browser only, the scheme of Bryce's other locked
// pages: a key derived from the password with PBKDF2-SHA-256 (600,000 iterations, a random 16-byte salt per vault),
// and AES-256-GCM with a fresh 12-byte nonce on each save. The password is never stored; the derived key lives in
// memory while the app is open, and in local storage only when "Remember this device" is ticked.
export const VAULT_KEY = 'horizon-vault';
export const PLAIN_KEY = 'horizon-v1';
const REMEMBER_KEY = 'horizon-key';
const ITERATIONS = 600_000;

export interface VaultFile {
  v: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let sessionKey: CryptoKey | null = null;
let sessionSalt: string | null = null;

export async function deriveKey(password: string, salt: Uint8Array, iterations = ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, salt: string, text: string, iterations = ITERATIONS): Promise<VaultFile> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  return { v: 1, kdf: 'PBKDF2-SHA-256', iterations, salt, iv: b64(iv), ct: b64(ct) };
}

export async function open(key: CryptoKey, f: VaultFile): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) as BufferSource }, key, unb64(f.ct) as BufferSource);
  return new TextDecoder().decode(pt);
}

export const hasVault = () => localStorage.getItem(VAULT_KEY) !== null;
export const isUnlocked = () => sessionKey !== null;
const readVault = (): VaultFile | null => {
  const raw = localStorage.getItem(VAULT_KEY);
  return raw ? (JSON.parse(raw) as VaultFile) : null;
};

/** Unlocks the vault with a password; false when the password is wrong. */
export async function unlock(password: string, remember: boolean): Promise<boolean> {
  const f = readVault();
  if (!f) return false;
  const key = await deriveKey(password, unb64(f.salt), f.iterations);
  try {
    await open(key, f);
  } catch {
    return false;
  }
  sessionKey = key;
  sessionSalt = f.salt;
  if (remember) localStorage.setItem(REMEMBER_KEY, b64(new Uint8Array(await crypto.subtle.exportKey('raw', key))));
  return true;
}

/** Unlocks with a key this device remembered; false when there is none or it no longer fits. */
export async function unlockRemembered(): Promise<boolean> {
  const raw = localStorage.getItem(REMEMBER_KEY);
  const f = readVault();
  if (!raw || !f) return false;
  try {
    const key = await crypto.subtle.importKey('raw', unb64(raw) as BufferSource, 'AES-GCM', true, ['encrypt', 'decrypt']);
    await open(key, f);
    sessionKey = key;
    sessionSalt = f.salt;
    return true;
  } catch {
    localStorage.removeItem(REMEMBER_KEY);
    return false;
  }
}

/** Turns protection on, or changes the password: the data is sealed under a new salt and key. */
export async function setPassword(password: string, data: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  sessionKey = await deriveKey(password, salt);
  sessionSalt = b64(salt);
  localStorage.setItem(VAULT_KEY, JSON.stringify(await seal(sessionKey, sessionSalt, data)));
  localStorage.removeItem(PLAIN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

/** Turns protection off: the data is stored in the clear again. */
export function removePassword(data: string): void {
  localStorage.setItem(PLAIN_KEY, data);
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionKey = null;
  sessionSalt = null;
}

/** Removes this device's own copy of the plans (after they moved to an account); no reload. */
export function clearDevice(): void {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(PLAIN_KEY);
  sessionKey = null;
  sessionSalt = null;
}

export function lock(): void {
  localStorage.removeItem(REMEMBER_KEY);
  sessionKey = null;
  location.reload();
}

/** Erases the vault when the password is lost; nothing can recover its contents. */
export function erase(): void {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(PLAIN_KEY);
  location.reload();
}

/** The storage the app's state persists through: sealed while a vault exists, plain otherwise. */
export const vaultStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const f = readVault();
    if (!f) return localStorage.getItem(name);
    if (!sessionKey) return null;
    return open(sessionKey, f);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (hasVault()) {
      // Locked: never overwrite the sealed data with the empty state of a locked screen.
      if (!sessionKey || !sessionSalt) return;
      localStorage.setItem(VAULT_KEY, JSON.stringify(await seal(sessionKey, sessionSalt, value)));
      return;
    }
    localStorage.setItem(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    localStorage.removeItem(name);
  },
};

/** An encrypted export: the same scheme, under the export password, as a file. */
export async function sealExport(password: string, data: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  return JSON.stringify({ horizonEncryptedBackup: await seal(key, b64(salt), data) });
}

export async function openExport(password: string, text: string): Promise<string> {
  const f = (JSON.parse(text) as { horizonEncryptedBackup: VaultFile }).horizonEncryptedBackup;
  const key = await deriveKey(password, unb64(f.salt), f.iterations);
  return open(key, f);
}
