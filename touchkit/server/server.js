// TouchKit account server: sign up, log in, log out and sync tool data between
// devices. Also serves the TouchKit web app. No dependencies: Node 22 + node:sqlite.
//
//   PORT=8080 DATA_DIR=./data WEB_DIR=../web node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 8080;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '..', 'web'));
const TOKEN_DAYS = 90;
const MAX_BODY = 2 * 1024 * 1024;       // 2 MB per request
const MAX_VALUE = 1024 * 1024;          // 1 MB per stored item
const MAX_USER_BYTES = 20 * 1024 * 1024; // 20 MB per account

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'touchkit.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
    pass TEXT NOT NULL, created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS data (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, changed INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  CREATE INDEX IF NOT EXISTS data_changed ON data(user_id, changed);
`);

const q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  addUser: db.prepare('INSERT INTO users (email, name, pass, created) VALUES (?, ?, ?, ?)'),
  addSession: db.prepare('INSERT INTO sessions (hash, user_id, device, created, expires) VALUES (?, ?, ?, ?, ?)'),
  session: db.prepare('SELECT u.id, u.email, u.name, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ?'),
  dropSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
  dropSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  dropExpired: db.prepare('DELETE FROM sessions WHERE expires < ?'),
  sessions: db.prepare('SELECT device, created FROM sessions WHERE user_id = ? ORDER BY created DESC'),
  dataSince: db.prepare('SELECT key, value, updated, changed FROM data WHERE user_id = ? AND changed > ? ORDER BY changed'),
  dataOne: db.prepare('SELECT updated FROM data WHERE user_id = ? AND key = ?'),
  putData: db.prepare(`INSERT INTO data (user_id, key, value, updated, changed) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated = excluded.updated, changed = excluded.changed`),
  userBytes: db.prepare('SELECT COALESCE(SUM(LENGTH(value)), 0) AS n FROM data WHERE user_id = ?'),
  dropUser: db.prepare('DELETE FROM users WHERE id = ?'),
  rename: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
};

// MARK: helpers

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [, salt, key] = String(stored).split('$');
  if (!salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}
// Same work for unknown emails, so timing does not reveal which emails exist.
const DUMMY = hashPassword(crypto.randomBytes(12).toString('hex'));

function newSession(userId, device) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  q.addSession.run(sha(token), userId, String(device || '').slice(0, 80), now, now + TOKEN_DAYS * 864e5);
  return token;
}

function auth(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const s = q.session.get(sha(m[1]));
  if (!s || s.expires < Date.now()) return null;
  return { id: s.id, email: s.email, name: s.name, tokenHash: sha(m[1]) };
}

// Simple limit on login / sign-up attempts per address.
const attempts = new Map();
function limited(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  a.push(now); attempts.set(ip, a);
  return a.length > 20;
}
setInterval(() => { attempts.clear(); q.dropExpired.run(Date.now()); }, 60 * 60e3).unref();

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const publicUser = (u) => ({ email: u.email, name: u.name });
const validEmail = (e) => typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// MARK: API

async function api(req, res, url) {
  const ip = req.socket.remoteAddress || '';
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/health') return send(res, 200, { ok: true });

  if (route === 'POST /api/register' || route === 'POST /api/login') {
    if (limited(ip)) return send(res, 429, { error: 'Too many tries. Wait 15 minutes.' });
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    const pw = String(b.password || '');
    if (!validEmail(email)) return send(res, 400, { error: 'Enter a valid email address.' });
    if (route === 'POST /api/register') {
      if (pw.length < 8) return send(res, 400, { error: 'Use a password of at least 8 characters.' });
      if (q.userByEmail.get(email)) return send(res, 409, { error: 'This email already has an account. Log in instead.' });
      const name = String(b.name || '').trim().slice(0, 80);
      const r = q.addUser.run(email, name, hashPassword(pw), Date.now());
      const token = newSession(Number(r.lastInsertRowid), b.device);
      return send(res, 201, { token, user: { email, name } });
    }
    const u = q.userByEmail.get(email);
    const ok = checkPassword(pw, u ? u.pass : DUMMY) && !!u;
    if (!ok) return send(res, 401, { error: 'Wrong email or password.' });
    return send(res, 200, { token: newSession(u.id, b.device), user: publicUser(u) });
  }

  const user = auth(req);
  if (!user) return send(res, 401, { error: 'Please log in.' });

  switch (route) {
    case 'GET /api/me': return send(res, 200, { user: publicUser(user), devices: q.sessions.all(user.id) });
    case 'POST /api/logout': q.dropSession.run(user.tokenHash); return send(res, 200, { ok: true });
    case 'POST /api/logout-all': q.dropSessions.run(user.id); return send(res, 200, { ok: true });
    case 'PATCH /api/me': {
      const b = await readJson(req);
      q.rename.run(String(b.name || '').trim().slice(0, 80), user.id);
      return send(res, 200, { ok: true });
    }
    case 'GET /api/data': {
      const since = +url.searchParams.get('since') || 0;
      const items = q.dataSince.all(user.id, since).map((r) => ({ key: r.key, value: JSON.parse(r.value), updated: r.updated, changed: r.changed }));
      return send(res, 200, { items, cursor: items.length ? items[items.length - 1].changed : since });
    }
    case 'PUT /api/data': {
      const b = await readJson(req);
      const items = Array.isArray(b.items) ? b.items.slice(0, 500) : [];
      let used = q.userBytes.get(user.id).n;
      let saved = 0;
      db.exec('BEGIN');
      try {
        for (const it of items) {
          const key = String(it.key || '');
          if (!/^[\w.:-]{1,100}$/.test(key)) continue;
          const value = JSON.stringify(it.value ?? null);
          if (value.length > MAX_VALUE) continue;
          const updated = Math.min(+it.updated || Date.now(), Date.now() + 60e3);
          const cur = q.dataOne.get(user.id, key);
          if (cur && cur.updated >= updated) continue; // the server already has newer data
          used += value.length;
          if (used > MAX_USER_BYTES) break;
          q.putData.run(user.id, key, value, updated, Date.now() * 1000 + saved);
          saved++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return send(res, 200, { saved, full: used > MAX_USER_BYTES });
    }
    case 'POST /api/delete-account': {
      const b = await readJson(req);
      const u = q.userByEmail.get(user.email);
      if (!checkPassword(String(b.password || ''), u.pass)) return send(res, 401, { error: 'Wrong password.' });
      q.dropUser.run(user.id);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

// MARK: static web app

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.join(WEB_DIR, path.normalize(rel));
  if (!full.startsWith(WEB_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(full, (err, st) => {
    const file = !err && st.isFile() ? full : path.join(WEB_DIR, 'index.html');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': /\.(html|webmanifest)$|sw\.js$/.test(file) ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self)',
    });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    // The desktop app and phones call the API from other origins with a Bearer token (no cookies).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try { await api(req, res, url); } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'Server error' }); if (!e.status) console.error(e); }
    return;
  }
  serveStatic(req, res, url);
}).listen(PORT, () => console.log(`TouchKit server on http://localhost:${PORT} (data: ${DATA_DIR})`));
