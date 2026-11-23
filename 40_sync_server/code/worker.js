// Horizon's account server: a Cloudflare Worker with one SQLite-backed Durable Object holding every account.
//
// The server never sees a password or a plan. The browser derives two keys from the password (PBKDF2-SHA-256, 600,000
// iterations, a random salt per account): an authentication key, sent here and stored only as SHA-256(key, server
// salt), and an encryption key, which never leaves the browser and seals the plans with AES-256-GCM before upload.
// The server stores the sealed data, a version for each save (a save naming an older version is refused, so two
// devices cannot overwrite each other unseen), and sessions as hashes of random tokens, 30 days each.
//
// Routes (JSON in and out; the session token in "Authorization: Bearer"):
//   POST /salt     {username}                         -> {salt, iterations}  (a stable decoy salt for unknown names)
//   POST /signup   {username, salt, auth}             -> {token}
//   POST /login    {username, auth}                   -> {token, data, version}
//   GET  /data                                        -> {data, version}
//   PUT  /data     {data, version}                    -> {version}         (409 with the stored version on a conflict)
//   POST /password {salt, auth, data, version}        -> {token, version}  (re-sealed data; other sessions end)
//   POST /logout                                      -> {}
//   POST /delete   {auth}                             -> {}
// Ten wrong logins in a row lock a username for 15 minutes.

const ORIGINS = ['https://bryceaspringfield.github.io', 'http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:8765'];
const MAX_DATA = 5_000_000;
const SESSION_DAYS = 30;
const ITERATIONS = 600_000;

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (...parts) => hex(await crypto.subtle.digest('SHA-256', enc.encode(parts.join('|'))));
const random = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const b64ok = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9+/=]+$/.test(s);
const nameOk = (u) => typeof u === 'string' && /^[a-z0-9._-]{1,30}$/.test(u);

/** Equal-time comparison of two hex strings. */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function cors(req) {
  const o = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('all'));
    const res = await stub.fetch(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors(req))) headers.set(k, v);
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  },
};

export class Accounts {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, salt TEXT, auth TEXT, server_salt TEXT,
      data TEXT, version INTEGER, failures INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0, created INTEGER)`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, name TEXT, expires INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
  }

  secret() {
    const row = this.sql.exec("SELECT v FROM meta WHERE k = 'pepper'").toArray()[0];
    if (row) return row.v;
    const v = random(32);
    this.sql.exec("INSERT INTO meta (k, v) VALUES ('pepper', ?)", v);
    return v;
  }

  user(name) {
    return this.sql.exec('SELECT * FROM users WHERE name = ?', name).toArray()[0];
  }

  async newSession(name) {
    const token = random(32);
    this.sql.exec('INSERT INTO sessions (token, name, expires) VALUES (?, ?, ?)', await sha256(token), name, Date.now() + SESSION_DAYS * 864e5);
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', Date.now());
    return token;
  }

  async session(req) {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('Authorization') ?? '');
    if (!m) return null;
    const row = this.sql.exec('SELECT name, expires FROM sessions WHERE token = ?', await sha256(m[1])).toArray()[0];
    if (!row || row.expires < Date.now()) return null;
    return this.user(row.name) ?? null;
  }

  /** Checks an authentication key, counting failures toward the lock. */
  async check(u, auth) {
    if (u.locked_until > Date.now()) return 'locked';
    const ok = b64ok(auth, 40, 60) && same(await sha256(auth, u.server_salt), u.auth);
    if (ok) this.sql.exec('UPDATE users SET failures = 0 WHERE name = ?', u.name);
    else {
      const f = u.failures + 1;
      this.sql.exec('UPDATE users SET failures = ?, locked_until = ? WHERE name = ?', f >= 10 ? 0 : f, f >= 10 ? Date.now() + 15 * 6e4 : 0, u.name);
    }
    return ok ? 'ok' : 'wrong';
  }

  async fetch(req) {
    const url = new URL(req.url);
    const json = (body, status = 200) => Response.json(body, { status });
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_DATA + 10_000) return json({ error: 'too large' }, 413);
      try { body = JSON.parse(text || '{}'); } catch { return json({ error: 'bad json' }, 400); }
    }
    const route = `${req.method} ${url.pathname}`;
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';

    if (route === 'POST /salt') {
      if (!nameOk(username)) return json({ error: 'bad username' }, 400);
      const u = this.user(username);
      // An unknown name gets a stable decoy salt, so the answer does not reveal which names exist.
      const salt = u ? u.salt : btoa(String.fromCharCode(...(await sha256(this.secret(), username)).slice(0, 32).match(/../g).map((h) => parseInt(h, 16)))).slice(0, 24);
      return json({ salt, iterations: ITERATIONS });
    }
    if (route === 'POST /signup') {
      if (!nameOk(username)) return json({ error: 'Usernames are 1 to 30 letters, digits, dots, dashes, or underscores.' }, 400);
      if (!b64ok(body.salt, 16, 64) || !b64ok(body.auth, 40, 60)) return json({ error: 'bad request' }, 400);
      if (this.user(username)) return json({ error: 'That username is taken.' }, 409);
      const serverSalt = random(16);
      this.sql.exec('INSERT INTO users (name, salt, auth, server_salt, data, version, created) VALUES (?, ?, ?, ?, NULL, 0, ?)',
        username, body.salt, await sha256(body.auth, serverSalt), serverSalt, Date.now());
      return json({ token: await this.newSession(username) });
    }
    if (route === 'POST /login') {
      const u = nameOk(username) ? this.user(username) : null;
      if (!u) return json({ error: 'Wrong username or password.' }, 401);
      const r = await this.check(u, body.auth);
      if (r === 'locked') return json({ error: 'Too many wrong passwords. Try again in 15 minutes.' }, 429);
      if (r !== 'ok') return json({ error: 'Wrong username or password.' }, 401);
      return json({ token: await this.newSession(u.name), data: u.data, version: u.version });
    }

    const u = await this.session(req);
    if (!u) return json({ error: 'Signed out. Sign in again.' }, 401);
    if (route === 'GET /data') return json({ data: u.data, version: u.version });
    if (route === 'PUT /data') {
      if (typeof body.data !== 'string' || body.data.length > MAX_DATA) return json({ error: 'bad data' }, 400);
      if (body.version !== u.version) return json({ error: 'conflict', version: u.version, data: u.data }, 409);
      this.sql.exec('UPDATE users SET data = ?, version = ? WHERE name = ?', body.data, u.version + 1, u.name);
      return json({ version: u.version + 1 });
    }
    if (route === 'POST /password') {
      if (!b64ok(body.salt, 16, 64) || !b64ok(body.auth, 40, 60) || typeof body.data !== 'string' || body.data.length > MAX_DATA) return json({ error: 'bad request' }, 400);
      if (body.version !== u.version) return json({ error: 'conflict', version: u.version }, 409);
      const serverSalt = random(16);
      this.sql.exec('UPDATE users SET salt = ?, auth = ?, server_salt = ?, data = ?, version = ? WHERE name = ?',
        body.salt, await sha256(body.auth, serverSalt), serverSalt, body.data, u.version + 1, u.name);
      this.sql.exec('DELETE FROM sessions WHERE name = ?', u.name);
      return json({ token: await this.newSession(u.name), version: u.version + 1 });
    }
    if (route === 'POST /logout') {
      const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('Authorization') ?? '');
      if (m) this.sql.exec('DELETE FROM sessions WHERE token = ?', await sha256(m[1]));
      return json({});
    }
    if (route === 'POST /delete') {
      const r = await this.check(u, body.auth);
      if (r !== 'ok') return json({ error: 'Wrong password.' }, 401);
      this.sql.exec('DELETE FROM sessions WHERE name = ?', u.name);
      this.sql.exec('DELETE FROM users WHERE name = ?', u.name);
      return json({});
    }
    return json({ error: 'not found' }, 404);
  }
}
