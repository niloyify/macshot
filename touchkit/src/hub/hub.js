// TouchKit main window: a sidebar of tools (defined in tools.js) and the open tool.
(() => {
  const nav = document.getElementById('nav');
  const main = document.getElementById('main');
  const search = document.getElementById('search');
  let cleanup = null;
  let current = '';

  function renderNav(filter = '') {
    const f = filter.trim().toLowerCase();
    nav.innerHTML = '';
    const home = document.createElement('a');
    home.innerHTML = '🏠 Home'; home.onclick = () => open('');
    if (!current) home.classList.add('active');
    if (!f) nav.appendChild(home);
    for (const group of TK.groups) {
      const tools = TK.tools.filter((t) => t.group === group && (!f || (t.name + ' ' + t.desc).toLowerCase().includes(f)));
      if (!tools.length) continue;
      const h = document.createElement('h4'); h.textContent = group; nav.appendChild(h);
      for (const t of tools) {
        const a = document.createElement('a');
        a.textContent = `${t.icon} ${t.name}`;
        if (t.id === current) a.classList.add('active');
        a.onclick = () => open(t.id);
        nav.appendChild(a);
      }
    }
  }

  function open(id) {
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    current = TK.tools.some((t) => t.id === id) ? id : '';
    location.hash = current;
    main.innerHTML = '';
    main.scrollTop = 0;
    const tool = TK.tools.find((t) => t.id === current) || TK.home;
    const res = tool.render(main);
    if (typeof res === 'function') cleanup = res;
    renderNav(search.value);
  }

  TK.open = open;
  search.addEventListener('input', () => renderNav(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = nav.querySelector('a:not(:first-child)') || nav.querySelector('a');
    if (first) first.click();
  });
  tk.onOpenTool((id) => open(id));
  tk.call('state').then((s) => { document.getElementById('foot').textContent = `TouchKit ${s.version} · ${({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' })[s.platform] || s.platform}`; });
  open(location.hash.slice(1));
})();
