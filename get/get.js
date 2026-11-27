// Jhuli download page: shows the visitor's device first, fills in the newest
// release files from GitHub, and lets the logo's eyes follow the pointer.
(() => {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPads say "Macintosh"
  const os = /Android/i.test(ua) ? 'android'
    : /iPhone|iPad|iPod/.test(ua) || iPadOS ? 'ios'
    : /CrOS/.test(ua) ? 'web'
    : /Windows/.test(ua) ? 'windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'mac'
    : /Linux/.test(ua) ? 'linux' : 'web';
  const names = { android: 'Android', ios: 'iPhone / iPad', windows: 'Windows', mac: 'Mac', linux: 'Linux', web: 'your browser' };

  // Your device first, highlighted, and the big button points at it.
  const card = document.querySelector(`.dl[data-os="${os}"]`);
  if (card) {
    card.classList.add('mine');
    const grid = document.getElementById('dl'); grid.prepend(card);
    const main = card.querySelector('.btn.primary');
    const hero = document.getElementById('heroBtn');
    if (main && hero) {
      hero.href = main.getAttribute('href');
      hero.textContent = (os === 'ios' || os === 'web' ? '🚀 Open Jhuli for ' : '⬇ Download for ') + names[os];
      document.getElementById('heroNote').innerHTML = `Detected: <b>${names[os]}</b> · other devices <a href="#download">below</a> · অন্য ডিভাইসের জন্য নিচে দেখুন`;
    }
  }

  // Newest Jhuli release: exact file names, sizes and the version.
  const want = {
    apk: (n) => /^Jhuli\.apk$/.test(n) || /^Jhuli-[\d.]+\.apk$/.test(n),
    setup: (n) => /^Jhuli-Setup-[\d.]+\.exe$/.test(n), portable: (n) => /^Jhuli-Portable-[\d.]+\.exe$/.test(n),
    mac: (n) => n === 'Jhuli-mac.zip', appimage: (n) => /^Jhuli-[\d.]+\.AppImage$/.test(n), deb: (n) => /^jhuli_[\d.]+_amd64\.deb$/.test(n),
  };
  const mb = (b) => (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + ' MB';
  fetch('https://api.github.com/repos/niloyify/macshot/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((list) => {
      const rel = list.find((r) => !r.draft && !r.prerelease && /^jhuli-v/.test(r.tag_name));
      if (!rel) return;
      for (const a of document.querySelectorAll('[data-file]')) {
        const asset = rel.assets.find((x) => want[a.dataset.file](x.name));
        if (!asset) continue;
        a.href = asset.browser_download_url;
        if (!a.nextElementSibling || !a.nextElementSibling.classList.contains('size')) a.insertAdjacentHTML('afterend', `<span class="size">${asset.name} · ${mb(asset.size)}</span>`);
      }
      const hero = document.getElementById('heroBtn'); const mine = document.querySelector('.dl.mine .btn.primary');
      if (hero && mine) hero.href = mine.href;
      const d = new Date(rel.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      document.getElementById('ver').innerHTML = `Version <b>${rel.tag_name.replace('jhuli-v', '')}</b> · ${d} · <a href="${rel.html_url}">release notes</a>`;
    })
    .catch(() => {}); // the built-in links (latest release) still work

  // The eyes follow the pointer (and blink now and then).
  const eyes = document.querySelectorAll('.logo i');
  const look = (x, y) => eyes.forEach((e) => {
    const r = e.getBoundingClientRect(); const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1; const k = Math.min(1, d / 200);
    e.style.setProperty('--ex', (dx / d) * 2.6 * k + 'px'); e.style.setProperty('--ey', (dy / d) * 3 * k + 'px');
  });
  addEventListener('pointermove', (e) => look(e.clientX, e.clientY), { passive: true });
  setInterval(() => { eyes.forEach((e) => { e.style.transform = 'scaleY(.1)'; }); setTimeout(() => eyes.forEach((e) => { e.style.transform = ''; }), 140); }, 4200);
})();
