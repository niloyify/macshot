// Firebase back end for accounts and sync (free, hosted by Google), used when
// TK_CONFIG.firebase is set. It answers the same calls as the Jhuli server
// (/api/login, /api/data …), so account.js works the same with either.
// Uses the plain Firebase REST APIs; no SDK needed.
(() => {
  const conf = (window.TK_CONFIG || {}).firebase;
  if (!conf || !conf.apiKey) return;
  const KEY = conf.apiKey;
  const DOCS = `https://firestore.googleapis.com/v1/projects/${conf.projectId}/databases/(default)/documents`;
  const ERRORS = {
    EMAIL_EXISTS: 'This email already has an account. Log in instead.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.', INVALID_PASSWORD: 'Wrong email or password.', EMAIL_NOT_FOUND: 'Wrong email or password.',
    WEAK_PASSWORD: 'Use a password of at least 8 characters.', INVALID_EMAIL: 'Enter a valid email address.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes.', USER_DISABLED: 'This account is disabled.',
  };

  async function call(url, body, method = 'POST', token) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = String((data.error && data.error.message) || '').split(' ')[0];
      const err = new Error(ERRORS[code] || (res.status === 401 || res.status === 403 ? 'Please log in.' : (data.error && data.error.message) || `Server error (${res.status})`));
      err.status = res.status; throw err;
    }
    return data;
  }
  const idt = (path) => `https://identitytoolkit.googleapis.com/v1/accounts:${path}?key=${KEY}`;

  // Keep the 1-hour Firebase token fresh.
  async function token(fb) {
    if (fb.exp - Date.now() > 120e3) return fb.idToken;
    const r = await call(`https://securetoken.googleapis.com/v1/token?key=${KEY}`, { grant_type: 'refresh_token', refresh_token: fb.refreshToken });
    fb.idToken = r.id_token; fb.refreshToken = r.refresh_token; fb.exp = Date.now() + (+r.expires_in || 3600) * 1000;
    return fb.idToken;
  }
  const fromSignIn = (r) => ({ idToken: r.idToken, refreshToken: r.refreshToken, uid: r.localId, exp: Date.now() + (+r.expiresIn || 3600) * 1000, loginAt: Date.now() });
  const str = (v) => ({ stringValue: String(v) });
  const deviceId = () => { let d = localStorage.getItem('tk-device'); if (!d) { d = Math.random().toString(36).slice(2, 12); try { localStorage.setItem('tk-device', d); } catch {} } return d; };

  async function saveDevice(fb, device) {
    const t = await token(fb);
    await call(`${DOCS}/users/${fb.uid}/devices/${deviceId()}`, { fields: { device: str(device || 'Device'), created: { integerValue: String(Date.now()) } } }, 'PATCH', t);
  }

  async function listAll(fb, collection) {
    const t = await token(fb); let out = []; let page = '';
    do {
      const r = await call(`${DOCS}/users/${fb.uid}/${collection}?pageSize=300${page ? '&pageToken=' + page : ''}`, null, 'GET', t);
      out = out.concat(r.documents || []); page = r.nextPageToken || '';
    } while (page);
    return out;
  }

  // auth.fb holds the Firebase tokens; `getAuth` reads the current login.
  window.TK_FIREBASE = async function fbApi(method, path, body, getAuth) {
    const route = `${method} ${path.split('?')[0]}`;
    if (route === 'POST /api/register') {
      if (String(body.password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
      const r = await call(idt('signUp'), { email: body.email, password: body.password, returnSecureToken: true });
      const fb = fromSignIn(r);
      if (body.name) await call(idt('update'), { idToken: fb.idToken, displayName: body.name, returnSecureToken: false });
      await saveDevice(fb, body.device);
      return { token: 'firebase', fb, user: { email: r.email, name: body.name || '' } };
    }
    if (route === 'POST /api/login') {
      const r = await call(idt('signInWithPassword'), { email: body.email, password: body.password, returnSecureToken: true });
      const fb = fromSignIn(r);
      await saveDevice(fb, body.device);
      return { token: 'firebase', fb, user: { email: r.email, name: r.displayName || '' } };
    }
    const auth = getAuth();
    const fb = auth && auth.fb;
    if (!fb) { const e = new Error('Please log in.'); e.status = 401; throw e; }
    const t = await token(fb);
    const userDoc = `${DOCS}/users/${fb.uid}`;

    switch (route) {
      case 'GET /api/me': {
        const devs = await listAll(fb, 'devices');
        return { user: auth.user, devices: devs.map((d) => ({ device: d.fields.device.stringValue, created: +d.fields.created.integerValue })).sort((a, b) => b.created - a.created) };
      }
      case 'POST /api/logout':
        await call(`${userDoc}/devices/${deviceId()}`, null, 'DELETE', t).catch(() => {});
        return { ok: true };
      case 'POST /api/logout-all': {
        // Other devices see this time and log themselves out at their next sync.
        await call(`${userDoc}?updateMask.fieldPaths=loggedOutAt`, { fields: { loggedOutAt: { integerValue: String(Date.now()) } } }, 'PATCH', t);
        for (const d of await listAll(fb, 'devices')) await call(`https://firestore.googleapis.com/v1/${d.name}`, null, 'DELETE', t).catch(() => {});
        return { ok: true };
      }
      case 'GET /api/data': {
        // Logged out everywhere from another device?
        const u = await call(userDoc, null, 'GET', t).catch(() => null);
        if (u && u.fields && u.fields.loggedOutAt && +u.fields.loggedOutAt.integerValue > fb.loginAt) { const e = new Error('Please log in.'); e.status = 401; throw e; }
        const since = new URLSearchParams(path.split('?')[1] || '').get('since');
        const q = { structuredQuery: { from: [{ collectionId: 'data' }], orderBy: [{ field: { fieldPath: 'changed' } }] } };
        if (since && since !== '0') q.structuredQuery.where = { fieldFilter: { field: { fieldPath: 'changed' }, op: 'GREATER_THAN', value: { timestampValue: since } } };
        const rows = await call(`${userDoc}:runQuery`, q, 'POST', t);
        const items = rows.filter((r) => r.document).map((r) => {
          const f = r.document.fields;
          let value = null; try { value = JSON.parse(f.value.stringValue); } catch {}
          return { key: r.document.name.split('/').pop(), value, updated: +f.updated.integerValue, changed: f.changed.timestampValue };
        });
        return { items, cursor: items.length ? items[items.length - 1].changed : (since || 0) };
      }
      case 'PUT /api/data': {
        const writes = (body.items || []).filter((it) => /^[\w.:-]{1,100}$/.test(it.key)).map((it) => ({
          update: { name: `projects/${conf.projectId}/databases/(default)/documents/users/${fb.uid}/data/${it.key}`, fields: { value: str(JSON.stringify(it.value ?? null)), updated: { integerValue: String(Math.round(+it.updated || Date.now())) } } },
          updateTransforms: [{ fieldPath: 'changed', setToServerValue: 'REQUEST_TIME' }],
        }));
        for (let i = 0; i < writes.length; i += 400) {
          await call(`https://firestore.googleapis.com/v1/projects/${conf.projectId}/databases/(default)/documents:commit`, { writes: writes.slice(i, i + 400) }, 'POST', t);
        }
        return { saved: writes.length };
      }
      case 'POST /api/delete-account': {
        // Check the password, delete the data, then the login itself.
        await call(idt('signInWithPassword'), { email: auth.user.email, password: body.password, returnSecureToken: true });
        for (const col of ['data', 'devices']) for (const d of await listAll(fb, col)) await call(`https://firestore.googleapis.com/v1/${d.name}`, null, 'DELETE', t).catch(() => {});
        await call(userDoc, null, 'DELETE', t).catch(() => {});
        await call(idt('delete'), { idToken: await token(fb) });
        return { ok: true };
      }
    }
    throw new Error('Not found');
  };
})();
