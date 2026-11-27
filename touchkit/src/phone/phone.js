// Jhuli phone remote. Turns the phone into a touchpad, Touch Bar and keyboard
// for the computer that served this page.
(() => {
  const $ = (s) => document.querySelector(s);
  const status = $('#status');
  let ws = null;
  let pin = (location.hash.slice(1) || localStorage.getItem('tk-pin') || '').replace(/\D/g, '');
  let retry = 0;

  function setStatus(text, cls) { status.textContent = text; status.className = 'status ' + (cls || ''); }
  function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  function buzz() { if (navigator.vibrate) navigator.vibrate(8); }

  function showPair() {
    $('#pair').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#tabs').classList.add('hidden');
    setStatus('Not connected', 'bad');
  }

  function connect() {
    if (!/^\d{6}$/.test(pin)) return showPair();
    setStatus('Connecting…');
    ws = new WebSocket(`ws://${location.host}/ws?pin=${pin}`);
    let opened = false;
    ws.onopen = () => {
      opened = true; retry = 0;
      try { localStorage.setItem('tk-pin', pin); } catch {}
      history.replaceState(null, '', location.pathname);
      $('#pair').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#tabs').classList.remove('hidden');
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'hello') setStatus('● ' + m.name.replace(/\.local$/, ''), 'ok');
      if (m.t === 'toast') setStatus(m.text, 'ok');
    };
    ws.onclose = () => {
      if (!opened) { try { localStorage.removeItem('tk-pin'); } catch {} pin = ''; return showPair(); }
      setStatus('Reconnecting…', 'bad');
      setTimeout(connect, Math.min(5000, 500 * ++retry));
    };
  }

  $('#pairBtn').onclick = () => { pin = $('#pin').value.replace(/\D/g, ''); connect(); };

  // Tabs
  document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('nav button, .tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); $('#tab-' + b.dataset.tab).classList.add('active');
  });

  // Buttons
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.key) { send({ t: 'key', key: b.dataset.key }); buzz(); }
    if (b.dataset.snap) { send({ t: 'snap', where: b.dataset.snap }); buzz(); }
    if (b.dataset.click) { send({ t: 'click', button: b.dataset.click }); buzz(); }
    if (b.dataset.tool) { send({ t: 'tool', tool: b.dataset.tool }); buzz(); }
  });
  const drag = $('#drag');
  drag.onclick = () => { drag.classList.toggle('on'); send({ t: drag.classList.contains('on') ? 'down' : 'up' }); buzz(); };

  // Keyboard
  $('#sendText').onclick = () => { const t = $('#text').value; if (t) { send({ t: 'type', text: t }); $('#text').value = ''; buzz(); } };
  $('#clearText').onclick = () => { $('#text').value = ''; };

  // Touchpad
  const pad = $('#pad');
  let touches = {}, start = 0, moved = 0, maxFingers = 0, accX = 0, accY = 0, sX = 0, sY = 0, frame = 0;
  const speed = (d) => d * (1.4 + Math.min(Math.abs(d), 30) * 0.12); // a little acceleration

  function flush() {
    frame = 0;
    if (accX || accY) { send({ t: 'move', dx: Math.round(accX), dy: Math.round(accY) }); accX = accY = 0; }
    if (sX || sY) { send({ t: 'scroll', dx: Math.round(sX), dy: Math.round(sY) }); sX = sY = 0; }
  }
  function queue() { if (!frame) frame = requestAnimationFrame(flush); }

  pad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!Object.keys(touches).length) { start = Date.now(); moved = 0; maxFingers = 0; }
    for (const t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
    maxFingers = Math.max(maxFingers, Object.keys(touches).length);
  }, { passive: false });

  pad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const n = Object.keys(touches).length;
    let dx = 0, dy = 0;
    for (const t of e.changedTouches) {
      const p = touches[t.identifier]; if (!p) continue;
      dx += t.clientX - p.x; dy += t.clientY - p.y;
      p.x = t.clientX; p.y = t.clientY;
    }
    dx /= e.changedTouches.length; dy /= e.changedTouches.length;
    moved += Math.abs(dx) + Math.abs(dy);
    if (n >= 2) { sX += dx * 2; sY += dy * 2; } else { accX += speed(dx); accY += speed(dy); }
    queue();
  }, { passive: false });

  function end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) delete touches[t.identifier];
    if (Object.keys(touches).length) return;
    if (Date.now() - start < 250 && moved < 10) {
      send({ t: 'click', button: maxFingers >= 2 ? 'right' : 'left' }); buzz();
    }
  }
  pad.addEventListener('touchend', end, { passive: false });
  pad.addEventListener('touchcancel', end, { passive: false });

  // Mouse fallback, so the page can be tried in a desktop browser too.
  let mdown = false, lx = 0, ly = 0, mmoved = 0;
  pad.addEventListener('mousedown', (e) => { mdown = true; lx = e.clientX; ly = e.clientY; mmoved = 0; });
  window.addEventListener('mousemove', (e) => {
    if (!mdown) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; mmoved += Math.abs(dx) + Math.abs(dy);
    accX += speed(dx); accY += speed(dy); queue();
  });
  window.addEventListener('mouseup', () => { if (mdown && mmoved < 4) send({ t: 'click', button: 'left' }); mdown = false; });

  connect();
})();
