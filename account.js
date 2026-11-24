// Accounts: sign up, log in, log out, and keep tool data in sync on every
// device (phone, laptop, desktop app, website) through the TouchKit server.
/* global TK, store, toast, esc, add, $ */
(() => {
  const AUTH = 'tk-auth';
  const conf = window.TK_CONFIG || {};
  let auth = null;
  try { auth = JSON.parse(localStorage.getItem(AUTH) || 'null'); } catch {}
  let syncing = false, pending = false, timer = 0;
  const listeners = [];

  const server = () => (auth && auth.server) || localStorage.getItem('tk-server') || conf.server || '';
  const deviceName = () => {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Win/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
    return `${os} · ${window.TK_PLATFORM === 'desktop' ? 'desktop app' : 'browser'}`;
  };

  // Firebase is used unless the user entered their own TouchKit server.
  const useFirebase = (base) => !!window.TK_FIREBASE && !(base ?? ((auth && auth.server) || localStorage.getItem('tk-server')));

  async function api(method, path, body, base) {
    if (useFirebase(base)) {
      try { return await window.TK_FIREBASE(method, path, body, () => auth); }
      catch (e) { if (e.status === 401 && auth && !path.includes('login')) setAuth(null); throw e; }
    }
    const res = await fetch((base ?? server()) + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && auth && !path.includes('login')) { setAuth(null); }
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    return data;
  }

  function setAuth(a) {
    auth = a;
    try { a ? localStorage.setItem(AUTH, JSON.stringify(a)) : localStorage.removeItem(AUTH); } catch {}
    listeners.forEach((f) => f());
  }

  // MARK: sync

  async function sync() {
    if (!auth) return;
    if (syncing) { pending = true; return; }
    syncing = true;
    try {
      // 1. Bring down what changed elsewhere.
      const r = await api('GET', `/api/data?since=${auth.cursor || 0}`);
      let changedHere = false;
      for (const it of r.items) {
        if (it.updated > store.updated(it.key)) {
          store.set(it.key, it.value, true);
          localStorage.setItem('tkm.' + it.key, String(it.updated));
          changedHere = true;
        }
      }
      auth.cursor = r.cursor;
      // 2. Send up what changed here since the last sync.
      const since = auth.pushed || 0;
      const items = store.keys().filter((k) => store.updated(k) > since).map((k) => ({ key: k, value: store.get(k), updated: store.updated(k) }));
      const startedAt = Date.now();
      for (let i = 0; i < items.length; i += 200) await api('PUT', '/api/data', { items: items.slice(i, i + 200) });
      auth.pushed = startedAt;
      auth.lastSync = Date.now();
      setAuth(auth);
      if (changedHere && TK.refresh) TK.refresh();
    } catch (e) {
      if (auth) { auth.syncError = e.message; listeners.forEach((f) => f()); }
    } finally {
      syncing = false;
      if (pending) { pending = false; schedule(); }
    }
  }
  function schedule(ms = 1500) { clearTimeout(timer); timer = setTimeout(sync, ms); }

  window.addEventListener('tk-store', () => schedule());
  window.addEventListener('focus', () => schedule(200));
  window.addEventListener('online', () => schedule(200));
  setInterval(() => auth && document.visibilityState === 'visible' && sync(), 30e3);

  // MARK: actions

  async function login(kind, email, password, name, base) {
    const r = await api('POST', `/api/${kind}`, { email, password, name, device: deviceName() }, base);
    // A new login uploads everything on this device once, then keeps it in sync.
    setAuth({ token: r.token, fb: r.fb, user: r.user, server: base || '', cursor: 0, pushed: 0 });
    await sync();
    return r.user;
  }
  async function logout(all) {
    try { await api('POST', all ? '/api/logout-all' : '/api/logout'); } catch {}
    setAuth(null);
  }

  TK.account = {
    get user() { return auth && auth.user; },
    get info() { return auth; },
    login, logout, sync, api,
    onChange: (f) => listeners.push(f),
  };

  // MARK: the Account screen

  TK.tools.unshift({
    id: 'account', name: 'Account', icon: '👤', group: 'Account', desc: 'Log in to use your tools and data on every device',
    render(el) {
      const draw = () => {
        el.innerHTML = '';
        if (auth) {
          const p = add(el, `<div><h1>👤 ${esc(auth.user.name || auth.user.email)}</h1><p class="sub">${esc(auth.user.email)}</p>
            <div class="panel"><b>☁️ Sync is on</b><p class="muted" id="st"></p><div class="row"><button class="primary" id="now">Sync now</button></div></div>
            <div class="panel"><b>Your devices</b><div class="list" id="dev" style="margin-top:8px"><span class="muted">Loading…</span></div></div>
            <div class="panel row"><button id="out">Log out</button><button id="outall">Log out on all devices</button><div class="grow"></div><button class="danger" id="del">Delete account</button></div></div>`);
          const st = () => { $(p, '#st').textContent = auth ? (auth.syncError ? '⚠️ ' + auth.syncError : auth.lastSync ? `Last synced ${new Date(auth.lastSync).toLocaleTimeString()}. Notes, to-dos, time tracking, invoices and settings follow you to every device.` : 'Syncing…') : ''; };
          st(); listeners.push(st);
          $(p, '#now').onclick = async () => { auth.syncError = ''; await sync(); st(); toast('Synced'); };
          $(p, '#out').onclick = async () => { await logout(false); draw(); };
          $(p, '#outall').onclick = async () => { await logout(true); draw(); };
          $(p, '#del').onclick = async () => {
            const pw = prompt('This deletes your account and all synced data. Type your password to confirm:');
            if (!pw) return;
            try { await api('POST', '/api/delete-account', { password: pw }); setAuth(null); draw(); toast('Account deleted'); } catch (e) { toast(e.message); }
          };
          api('GET', '/api/me').then((r) => {
            $(p, '#dev').innerHTML = r.devices.map((d) => `<div class="item"><span class="t">💻 ${esc(d.device || 'Device')}</span><span class="muted">since ${new Date(d.created).toLocaleDateString()}</span></div>`).join('');
          }).catch(() => {});
          return;
        }
        let mode = 'login';
        const p = add(el, `<div style="max-width:420px;margin:0 auto">
          <h1 style="text-align:center">👀 TouchKit</h1><p class="sub" style="text-align:center">One account for your phone, laptop and the web. Your notes, to-dos, time tracking and invoices follow you everywhere.</p>
          <div class="panel"><div class="row tabs"><button class="primary grow" data-m="login">Log in</button><button class="grow" data-m="register">Create account</button></div>
          <form id="f" style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
            <div class="field" id="nameF" style="display:none"><label>Your name</label><input id="name" autocomplete="name"></div>
            <div class="field"><label>Email</label><input id="email" type="email" autocomplete="email" required></div>
            <div class="field"><label>Password</label><input id="pw" type="password" autocomplete="current-password" required minlength="8"></div>
            <p id="err" style="color:var(--bad);margin:0"></p>
            <button class="primary big" id="go">Log in</button>
          </form>
          <details style="margin-top:12px"><summary class="muted">Server</summary><input id="srv" style="width:100%;margin-top:6px" placeholder="Same as this website"></details></div>
          <p class="muted" style="text-align:center">You can use every tool without an account — logging in only adds sync.</p>
          ${conf.accounts === false && !window.TK_FIREBASE ? '<p class="muted" style="text-align:center">Accounts are not switched on for this website yet. Enter a TouchKit server under “Server”, or use the tools without an account.</p>' : ''}</div>`);
        $(p, '#srv').value = localStorage.getItem('tk-server') || (window.TK_FIREBASE ? '' : conf.server || '');
        if (window.TK_FIREBASE) $(p, '#srv').placeholder = 'TouchKit cloud (default)';
        p.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
          mode = b.dataset.m;
          p.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('primary', x === b));
          $(p, '#nameF').style.display = mode === 'register' ? '' : 'none';
          $(p, '#go').textContent = mode === 'register' ? 'Create account' : 'Log in';
          $(p, '#pw').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
        });
        $(p, '#f').onsubmit = async (e) => {
          e.preventDefault();
          const base = $(p, '#srv').value.trim().replace(/\/+$/, '');
          try { localStorage.setItem('tk-server', base); } catch {}
          $(p, '#go').disabled = true; $(p, '#err').textContent = '';
          try {
            await login(mode, $(p, '#email').value.trim(), $(p, '#pw').value, $(p, '#name').value.trim(), base);
            toast('Welcome!'); draw(); if (TK.refreshNav) TK.refreshNav();
          } catch (err) {
            $(p, '#err').textContent = /fetch|network|Load failed/i.test(err.message) ? 'Cannot reach the server. Check your internet.' : err.message;
          } finally { $(p, '#go').disabled = false; }
        };
      };
      draw();
    },
  });
  if (!TK.groups.includes('Account')) TK.groups.unshift('Account');
  if (auth) schedule(300);
})();
