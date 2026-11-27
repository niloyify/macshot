// Jhuli app shell: home screen, sidebar / phone menu, search, favourites.
/* global TK, tk, store, esc, add, $, toast */
(() => {
  const nav = document.getElementById('nav');
  const main = document.getElementById('main');
  const search = document.getElementById('search');
  const desktop = window.TK_PLATFORM === 'desktop';
  let cleanup = null;
  let current = '';

  const visible = (t) => true; // every tool is listed; desktop-only ones explain themselves on the web
  const favs = () => store.get('favs', ['calc', 'notes', 'todo', 'currency', 'qr', desktop ? 'remote' : 'invoice'].filter((id) => TK.tools.some((t) => t.id === id)));
  // On the web, put the desktop-only group last so phones see useful tools first.
  if (!desktop) TK.groups = [...TK.groups.filter((g) => g !== 'Control'), 'Control'];
  const recent = () => store.get('recent', []);

  function card(t) {
    const off = t.only === 'desktop' && !desktop;
    return `<div class="card${off ? ' off' : ''}" data-id="${t.id}"><div class="ic">${t.icon}</div><b>${esc(t.name)}</b><span>${esc(t.desc)}</span>${off ? '<em>Desktop app</em>' : ''}</div>`;
  }
  function bindCards(root) { root.querySelectorAll('.card[data-id]').forEach((c) => c.onclick = () => open(c.dataset.id)); }

  // On iPhone / iPad (Safari) and Android browsers, show how to install Jhuli as an app.
  function installHint() {
    if (desktop || window.AndroidTK || !location.protocol.startsWith('http')) return '';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone || store.get('hideInstall', false)) return '';
    const ua = navigator.userAgent;
    const how = /iPhone|iPad|iPod/.test(ua) ? 'In Safari, tap <b>Share</b> (□↑) → <b>Add to Home Screen</b>. Jhuli then opens like an app and works offline.'
      : /Android/.test(ua) ? 'Tap the browser menu (⋮) → <b>Install app</b> or <b>Add to Home screen</b>, or get the Android app (APK) from the downloads page.'
      : '';
    if (!how) return '';
    setTimeout(() => { const b = document.getElementById('hideInstall'); if (b) b.onclick = () => { store.set('hideInstall', true, true); b.closest('.banner').remove(); }; });
    return `<div class="banner info"><div class="grow"><b>📲 Install Jhuli on this phone</b><br><span class="muted">${how} <a href="get/">All downloads</a></span></div><button id="hideInstall">OK</button></div>`;
  }

  // MARK: home
  function home(el) {
    const user = TK.account && TK.account.user;
    const hello = user ? `Hi ${esc((user.name || user.email).split(' ')[0])} 👋` : 'Welcome 👋';
    el.innerHTML = `<div class="hero"><h1>${hello}</h1><p class="sub">All your everyday tools in one place — on your phone, laptop and the web.${desktop ? '' : ' <a href="get/">Get the app for every device →</a>'}</p>
      <input id="hs" class="hero-search" type="search" placeholder="What do you want to do? e.g. invoice, QR, convert…" autocomplete="off"></div>
      ${user || ((window.TK_CONFIG || {}).accounts === false && !window.TK_FIREBASE) ? '' : `<div class="banner info"><div class="grow"><b>Use Jhuli on all your devices</b><br><span class="muted">Create a free account to sync notes, to-dos, time tracking and invoices between your phone and computer.</span></div><button class="primary" id="join">Log in / Sign up</button></div>`}
      ${installHint()}<div id="results"></div><div id="blocks"></div>`;
    const blocks = $(el, '#blocks');
    const f = favs().map((id) => TK.tools.find((t) => t.id === id)).filter(Boolean);
    if (f.length) { add(blocks, `<h2>⭐ Favourites</h2>`); bindCards(add(blocks, `<div class="cards">${f.map(card).join('')}</div>`)); }
    const r = recent().map((id) => TK.tools.find((t) => t.id === id)).filter((t) => t && !f.includes(t)).slice(0, 4);
    if (r.length) { add(blocks, `<h2>🕘 Recently used</h2>`); bindCards(add(blocks, `<div class="cards">${r.map(card).join('')}</div>`)); }
    for (const g of TK.groups.filter((g) => g !== 'Account')) {
      const ts = TK.tools.filter((t) => t.group === g && visible(t));
      if (!ts.length) continue;
      add(blocks, `<h2>${esc(g)}</h2>`);
      bindCards(add(blocks, `<div class="cards">${ts.map(card).join('')}</div>`));
    }
    const join = $(el, '#join'); if (join) join.onclick = () => open('account');
    const hs = $(el, '#hs');
    hs.oninput = () => {
      const q = hs.value.trim().toLowerCase();
      blocks.style.display = q ? 'none' : '';
      const res = $(el, '#results');
      if (!q) { res.innerHTML = ''; return; }
      const hits = TK.tools.filter((t) => (t.name + ' ' + t.desc + ' ' + t.group).toLowerCase().includes(q));
      res.innerHTML = hits.length ? `<div class="cards">${hits.map(card).join('')}</div>` : '<p class="muted">No tool found.</p>';
      bindCards(res);
    };
    hs.onkeydown = (e) => { if (e.key === 'Enter') { const c = $(el, '#results .card'); if (c) c.click(); } };
    if (!('ontouchstart' in window)) hs.focus();
  }

  // MARK: desktop-only tools on the web
  function desktopOnly(el, t) {
    el.innerHTML = `<h1>${t.icon} ${esc(t.name)}</h1><p class="sub">${esc(t.desc)}</p>
      <div class="panel"><b>This tool needs the Jhuli desktop app</b><p class="muted">It controls your computer (mouse, keys, windows or clipboard), which a website is not allowed to do. Install the free app for Windows, Mac or Linux — your account and data come with you.</p>
      <button class="primary big" id="dl">⬇ Download Jhuli</button></div>`;
    $(el, '#dl').onclick = () => tk.call('openUrl', { url: (window.TK_CONFIG || {}).downloads });
  }

  // MARK: navigation
  function renderNav() {
    const f = search.value.trim().toLowerCase();
    nav.innerHTML = '';
    const mk = (label, id) => { const a = document.createElement('a'); a.innerHTML = label; if (id === current) a.classList.add('active'); a.onclick = () => open(id); nav.appendChild(a); return a; };
    if (!f) mk('🏠 Home', '');
    for (const group of TK.groups) {
      const tools = TK.tools.filter((t) => t.group === group && visible(t) && (!f || (t.name + ' ' + t.desc).toLowerCase().includes(f)));
      if (!tools.length) continue;
      if (group !== 'Account') { const h = document.createElement('h4'); h.textContent = group; nav.appendChild(h); }
      for (const t of tools) {
        const user = t.id === 'account' && TK.account && TK.account.user;
        const a = mk(`${t.icon} ${esc(user ? (user.name || user.email) : t.name)}`, t.id);
        if (t.only === 'desktop' && !desktop) a.classList.add('dim');
      }
    }
  }

  function open(id) {
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    const t = TK.tools.find((x) => x.id === id);
    current = t ? id : '';
    if (location.hash.slice(1) !== current) history.replaceState(null, '', current ? '#' + current : location.pathname + location.search);
    document.body.classList.remove('menu-open');
    main.innerHTML = ''; main.scrollTop = 0; window.scrollTo(0, 0);
    if (!t) home(main);
    else if (t.only === 'desktop' && !desktop) desktopOnly(main, t);
    else {
      const res = t.render(main);
      if (typeof res === 'function') cleanup = res;
      if (t.id !== 'account') store.set('recent', [t.id, ...recent().filter((x) => x !== t.id)].slice(0, 8), true);
      addStar(t);
    }
    document.title = t ? `${t.name} — Jhuli` : 'Jhuli — all your everyday tools';
    renderNav();
  }

  function addStar(t) {
    const h1 = main.querySelector('h1'); if (!h1 || t.id === 'account') return;
    const on = favs().includes(t.id);
    const b = document.createElement('button'); b.className = 'star'; b.title = on ? 'Remove from favourites' : 'Add to favourites'; b.textContent = on ? '⭐' : '☆';
    b.onclick = () => { const f = favs(); store.set('favs', f.includes(t.id) ? f.filter((x) => x !== t.id) : [...f, t.id]); addStar(t); toast(f.includes(t.id) ? 'Removed from favourites' : 'Added to favourites'); };
    h1.querySelector('.star')?.remove(); h1.appendChild(b);
  }

  TK.open = open;
  TK.refresh = () => open(current);
  TK.refreshNav = renderNav;
  if (TK.account) TK.account.onChange(renderNav);

  search.addEventListener('input', renderNav);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = nav.querySelector('a:not(:first-child)') || nav.querySelector('a'); if (a) a.click(); } });
  document.getElementById('menu').onclick = () => document.body.classList.toggle('menu-open');
  document.getElementById('scrim').onclick = () => document.body.classList.remove('menu-open');
  document.getElementById('logo').onclick = () => open('');
  document.getElementById('me').onclick = () => open('account');
  window.addEventListener('hashchange', () => { if (location.hash.slice(1) !== current) open(location.hash.slice(1)); });
  tk.onOpenTool((id) => open(id));
  tk.call('state').then((s) => {
    const names = { darwin: 'macOS', win32: 'Windows', linux: 'Linux', mac: 'Mac', windows: 'Windows', ios: 'iPhone', android: 'Android' };
    document.getElementById('foot').textContent = `Jhuli ${s.version || ''} · ${names[s.platform] || 'Web'}${desktop ? ' app' : ''}`;
  });
  document.body.classList.add(desktop ? 'is-desktop' : 'is-web');
  if (desktop && navigator.userAgent.includes('Mac')) document.body.classList.add('is-mac');

  // Offline support and "Add to Home Screen" on phones.
  if (!desktop && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  open(location.hash.slice(1));
})();
