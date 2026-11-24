// All TouchKit tools. Each tool: { id, name, icon, group, desc, render(el) → optional cleanup }.
/* global tk */
const TK = { groups: ['Control', 'Capture', 'Work', 'Freelance', 'Text & Data', 'Images'], tools: [] };

// MARK: helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('tk.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tk.' + k, JSON.stringify(v)); } catch {} },
};
function toast(text) {
  const t = document.getElementById('toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}
function copy(text) { tk.call('copyText', { text }); toast('Copied'); }
function head(el, tool, sub) { el.innerHTML = `<h1>${tool.icon} ${esc(tool.name)}</h1><p class="sub">${esc(sub || tool.desc)}</p>`; }
// Append HTML; returns the new element (or a wrapper div when there are several).
function add(el, html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  if (d.children.length === 1) { el.appendChild(d.firstElementChild); return el.lastElementChild; }
  el.appendChild(d); return d;
}
function tool(t) { TK.tools.push(t); return t; }
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDur = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const money = (n, cur) => `${cur || ''}${(Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function accessBanner(el) {
  const slot = add(el, '<div></div>'); // keeps the banner near the top
  const s = await tk.call('state');
  if (s.accessibility) return slot.remove();
  const b = add(slot, `<div class="banner"><div class="grow"><b>One-time permission needed.</b><br><span class="muted">To move the mouse, press keys and arrange windows, allow TouchKit under System Settings → Privacy &amp; Security → Accessibility. Then quit and reopen TouchKit.</span></div><button class="primary">Allow</button></div>`);
  $(b, 'button').onclick = () => tk.call('askAccess');
}

// MARK: Home
TK.home = {
  render(el) {
    el.innerHTML = `<h1>👋 Welcome to TouchKit</h1><p class="sub">Everything you need to use your computer easily — in one place. Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> any time to open it.</p>`;
    accessBanner(el);
    for (const g of TK.groups) {
      add(el, `<h2>${esc(g)}</h2>`);
      const cards = add(el, '<div class="cards"></div>');
      for (const t of TK.tools.filter((x) => x.group === g)) {
        const c = add(cards, `<div class="card"><div class="ic">${t.icon}</div><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></div>`);
        c.onclick = () => TK.open(t.id);
      }
    }
  },
};

// MARK: Control

tool({ id: 'remote', name: 'Phone Remote', icon: '📱', group: 'Control', desc: 'Use your phone as a touchpad, Touch Bar and keyboard',
  render(el) {
    head(el, this, 'Scan the code with your phone camera. Your phone becomes a touchpad, Touch Bar and keyboard — no app to install. Phone and computer must be on the same Wi‑Fi.');
    accessBanner(el);
    const p = add(el, `<div class="panel row" style="align-items:flex-start;gap:24px">
      <img class="qr" alt="QR code">
      <div class="grow">
        <label>Or open this address on your phone</label><div class="mono" id="url" style="font-size:15px;word-break:break-all"></div>
        <label style="margin-top:14px">Code</label><div class="pin" id="pin"></div>
        <p><span class="dot" id="dot"></span> <span id="who"></span></p>
        <div class="row"><button id="copyUrl">Copy address</button><button id="newCode">New code (disconnect phones)</button></div>
      </div></div>`);
    add(el, `<div class="panel"><b>On the phone</b><ul class="muted"><li>Touchpad: one finger moves, tap clicks, two-finger tap right-clicks, two fingers scroll.</li><li>Touch Bar: volume, brightness, music, windows, screenshot.</li><li>Keyboard: type or use voice typing on the phone, then Send.</li><li>Tip: “Add to Home Screen” to open it like an app.</li></ul></div>`);
    const show = async (cmd) => {
      const r = await tk.call(cmd);
      $(p, 'img').src = r.qr; $(p, '#url').textContent = r.url.replace(/#.*/, '');
      $(p, '#pin').textContent = r.pin;
      $(p, '#dot').classList.toggle('on', r.clients > 0);
      $(p, '#who').textContent = r.clients ? `${r.clients} phone${r.clients > 1 ? 's' : ''} connected` : 'Waiting for a phone…';
      $(p, '#copyUrl').onclick = () => copy(r.url);
    };
    $(p, '#newCode').onclick = () => show('remoteNewCode');
    show('remoteStart');
    const t = setInterval(() => show('remoteStart'), 2000);
    return () => clearInterval(t);
  } });

tool({ id: 'touchbar', name: 'Touch Bar', icon: '🎛', group: 'Control', desc: 'A Touch Bar on your screen: volume, brightness, music, windows',
  render(el) {
    head(el, this, 'For computers without a Touch Bar (or with a broken one). It floats at the bottom of the screen and never steals focus.');
    accessBanner(el);
    const p = add(el, `<div class="panel row"><button class="primary" id="t">Show / hide Touch Bar</button><span class="muted">Shortcut: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> · drag it by the ⋮⋮ handle</span></div>`);
    $(p, '#t').onclick = () => tk.call('bar');
    add(el, `<h2>Try the keys here</h2>`);
    const g = add(el, `<div class="row"></div>`);
    for (const [k, l] of [['brightdown', '🔅'], ['brightup', '🔆'], ['voldown', '🔉'], ['mute', '🔇'], ['volup', '🔊'], ['prev', '⏮'], ['play', '⏯'], ['next', '⏭'], ['missioncontrol', '🗂'], ['desktop', '🖥']]) {
      const b = add(g, `<button class="big">${l}</button>`); b.onclick = () => tk.call('key', { key: k });
    }
  } });

tool({ id: 'windows', name: 'Window Snap', icon: '🪟', group: 'Control', desc: 'Put any window on the left, right or full screen in one click',
  render(el) {
    head(el, this, 'Click a layout, then click the window you want — or use the keyboard shortcuts from any app.');
    accessBanner(el);
    const g = add(el, `<div class="cards"></div>`);
    for (const [w, ic, n, k] of [['left', '◧', 'Left half', 'Alt+Shift+←'], ['right', '◨', 'Right half', 'Alt+Shift+→'], ['max', '⬜', 'Full screen', 'Alt+Shift+↑'], ['top', '⬒', 'Top half', ''], ['bottom', '⬓', 'Bottom half', ''], ['center', '▣', 'Centre', '']]) {
      const c = add(g, `<div class="card"><div class="ic">${ic}</div><b>${n}</b><span>${k ? 'Shortcut: ' + k : 'From the menu or phone'}</span></div>`);
      c.onclick = () => { toast('Click the window to arrange within 3 seconds'); setTimeout(() => tk.call('snap', { where: w }), 3000); };
    }
  } });

tool({ id: 'awake', name: 'Keep Awake', icon: '☕', group: 'Control', desc: 'Stop the screen from sleeping during calls, downloads and renders',
  render(el) {
    head(el, this);
    const p = add(el, `<div class="panel row"><div class="big-num" id="st"></div><div class="grow"></div><button class="primary big" id="t"></button></div>`);
    const show = async () => { const s = await tk.call('state'); $(p, '#st').textContent = s.awake ? 'ON ☕' : 'OFF'; $(p, '#t').textContent = s.awake ? 'Turn off' : 'Turn on'; };
    $(p, '#t').onclick = async () => { await tk.call('awake'); show(); };
    show();
  } });

// MARK: Capture

tool({ id: 'capture', name: 'Screenshot & Record', icon: '📸', group: 'Capture', desc: 'Capture or record the screen with sound',
  render(el) {
    head(el, this);
    const p = add(el, `<div class="grid2">
      <div class="panel"><h2 style="margin-top:0">📸 Screenshot</h2><p class="muted">Saved to Pictures/TouchKit and copied, ready to paste. Shortcut <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>.</p><div class="row"><button class="primary" id="s">Take screenshot</button><button id="sf">Open folder</button></div><img id="last" style="max-width:100%;margin-top:12px;border-radius:10px"></div>
      <div class="panel"><h2 style="margin-top:0">⏺ Screen recording</h2><p class="muted">Screen + microphone (and computer sound on Windows). Saved to Videos/TouchKit. Shortcut <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>5</kbd>.</p><div class="row"><button class="primary" id="r"></button><button id="rf">Open folder</button></div></div></div>`);
    $(p, '#s').onclick = async () => { const f = await tk.call('screenshot'); if (f) toast('Screenshot saved'); };
    $(p, '#sf').onclick = () => tk.call('openFolder', { which: 'pictures' });
    $(p, '#rf').onclick = () => tk.call('openFolder', { which: 'videos' });
    const show = async () => { const s = await tk.call('state'); $(p, '#r').textContent = s.recording ? '⏹ Stop recording' : '⏺ Start recording'; };
    $(p, '#r').onclick = async () => { await tk.call('record'); setTimeout(show, 400); };
    show();
    const t = setInterval(show, 1500);
    return () => clearInterval(t);
  } });

tool({ id: 'camera', name: 'Camera', icon: '🤳', group: 'Capture', desc: 'Take a photo with the webcam',
  render(el) {
    head(el, this, 'Photos are saved to Pictures/TouchKit.');
    const p = add(el, `<div class="panel"><video autoplay playsinline muted style="width:100%;max-height:60vh;transform:scaleX(-1)"></video>
      <div class="row" style="margin-top:12px"><button class="primary big" id="snap">📸 Take photo</button><label class="row" style="margin:0"><input type="checkbox" id="timer"> 3-second timer</label><select id="cam"></select><div class="grow"></div><span id="msg" class="muted"></span></div></div>`);
    const video = $(p, 'video');
    let stream = null;
    const startCam = async (deviceId) => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      try {
        await tk.call('cameraAccess');
        stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId }, width: 1920 } : { width: 1920 } });
        video.srcObject = stream;
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        $(p, '#cam').innerHTML = devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Camera ' + (i + 1))}</option>`).join('');
        if (deviceId) $(p, '#cam').value = deviceId;
      } catch (e) {
        $(p, '#msg').textContent = 'Camera not available. Allow TouchKit to use the camera in your system settings.';
      }
    };
    $(p, '#cam').onchange = (e) => startCam(e.target.value);
    $(p, '#snap').onclick = async () => {
      if ($(p, '#timer').checked) { for (let i = 3; i > 0; i--) { $(p, '#msg').textContent = i + '…'; await new Promise((r) => setTimeout(r, 1000)); } }
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      const ctx = c.getContext('2d'); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0);
      const file = await tk.call('savePhoto', { dataUrl: c.toDataURL('image/png') });
      $(p, '#msg').innerHTML = ''; const a = add($(p, '#msg'), `<a href="#" style="color:var(--accent)">Saved — show in folder</a>`);
      a.onclick = (e) => { e.preventDefault(); tk.call('showFile', { file }); };
    };
    startCam();
    return () => stream && stream.getTracks().forEach((t) => t.stop());
  } });

tool({ id: 'color', name: 'Color Picker', icon: '🎨', group: 'Capture', desc: 'Pick any color on the screen and copy HEX / RGB / HSL',
  render(el) {
    head(el, this);
    const p = add(el, `<div class="panel row"><div class="swatch" id="sw"></div><div class="grow mono" id="vals"></div><button class="primary" id="pick">🎯 Pick from screen</button><input type="color" id="manual"></div><h2>History</h2><div class="row" id="hist"></div>`);
    const hist = store.get('colors', []);
    const show = (hex) => {
      const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
      let h = 0, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
      if (d) { const R = r / 255, G = g / 255, B = b / 255; h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; h = Math.round(h * 60 + 360) % 360; }
      const vals = [hex.toUpperCase(), `rgb(${r}, ${g}, ${b})`, `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`];
      $(p, '#sw').style.background = hex;
      $(p, '#vals').innerHTML = vals.map((v) => `<div><a href="#" data-v="${v}" style="color:inherit">${v}</a></div>`).join('');
      $$(p, '#vals a').forEach((a) => a.onclick = (e) => { e.preventDefault(); copy(a.dataset.v); });
    };
    const drawHist = () => { $(el, '#hist').innerHTML = hist.map((h) => `<div class="swatch" title="${h}" data-h="${h}" style="background:${h};width:36px;height:36px;cursor:pointer"></div>`).join('') || '<span class="muted">No colors yet</span>'; $$(el, '#hist [data-h]').forEach((s) => s.onclick = () => { show(s.dataset.h); copy(s.dataset.h); }); };
    const use = (hex) => { show(hex); copy(hex.toUpperCase()); hist.unshift(hex); store.set('colors', [...new Set(hist)].slice(0, 24)); hist.splice(0, hist.length, ...store.get('colors', [])); drawHist(); };
    $(p, '#pick').onclick = async () => {
      if (!window.EyeDropper) return toast('Picking from the screen is not supported here — use the color box');
      try { const r = await new EyeDropper().open(); use(r.sRGBHex); } catch {}
    };
    $(p, '#manual').oninput = (e) => show(e.target.value);
    $(p, '#manual').onchange = (e) => use(e.target.value);
    show(hist[0] || '#3d7bff'); drawHist();
  } });

// MARK: Work

tool({ id: 'clipboard', name: 'Clipboard History', icon: '📋', group: 'Work', desc: 'Everything you copied — search, pin and copy again',
  render(el) {
    head(el, this, 'Shortcut: Alt+Shift+V. Click an item to copy it again. Pinned items are kept forever.');
    const p = add(el, `<div><div class="row" style="margin-bottom:10px"><input class="grow" id="q" placeholder="Search…"><button class="danger" id="clear">Clear (keep pinned)</button></div><div class="list" id="l"></div></div>`);
    let clips = [];
    const draw = () => {
      const q = $(p, '#q').value.toLowerCase();
      const items = clips.filter((c) => c.text.toLowerCase().includes(q)).sort((a, b) => (b.pinned - a.pinned) || (b.time - a.time));
      $(p, '#l').innerHTML = items.map((c, i) => `<div class="item" data-i="${i}"><span class="t" title="${esc(c.text.slice(0, 500))}">${esc(c.text.slice(0, 300))}</span><span class="muted">${new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><button data-a="pin">${c.pinned ? '📌' : '📍'}</button><button data-a="del">✕</button></div>`).join('') || '<p class="muted">Copy some text and it will show up here.</p>';
      $$(p, '.item').forEach((row) => {
        const c = items[row.dataset.i];
        row.onclick = async (e) => {
          const a = e.target.dataset.a;
          if (a === 'pin') clips = await tk.call('clipPin', { text: c.text });
          else if (a === 'del') clips = await tk.call('clipDelete', { text: c.text });
          else { await tk.call('clipCopy', { text: c.text }); toast('Copied'); }
          draw();
        };
      });
    };
    const load = async () => { clips = await tk.call('clips'); draw(); };
    $(p, '#q').oninput = draw;
    $(p, '#clear').onclick = async () => { clips = await tk.call('clipClear'); draw(); };
    load(); $(p, '#q').focus();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  } });

tool({ id: 'notes', name: 'Quick Notes', icon: '📝', group: 'Work', desc: 'Notes that save by themselves',
  render(el) {
    head(el, this);
    let notes = store.get('notes', [{ id: uid(), title: 'My first note', body: '', time: Date.now() }]);
    let cur = notes[0]?.id;
    const p = add(el, `<div class="row" style="align-items:stretch;gap:14px"><div style="width:220px" class="list" id="l"></div><div class="grow panel" style="margin:0"><input id="title" style="width:100%;font-size:18px;font-weight:600;margin-bottom:8px"><textarea id="body" style="min-height:50vh;font-family:inherit;font-size:14px" placeholder="Write anything…"></textarea><div class="row" style="margin-top:8px"><button id="cp">Copy</button><button class="danger" id="del">Delete note</button><div class="grow"></div><span class="muted" id="saved"></span></div></div></div>`);
    const save = () => { store.set('notes', notes); $(p, '#saved').textContent = 'Saved'; };
    const draw = () => {
      $(p, '#l').innerHTML = `<button class="primary" id="new">+ New note</button>` + notes.map((n) => `<div class="item" data-id="${n.id}" style="cursor:pointer;${n.id === cur ? 'border-color:var(--accent)' : ''}"><span class="t">${esc(n.title || 'Untitled')}</span></div>`).join('');
      $(p, '#new').onclick = () => { const n = { id: uid(), title: '', body: '', time: Date.now() }; notes.unshift(n); cur = n.id; save(); draw(); $(p, '#title').focus(); };
      $$(p, '#l .item').forEach((r) => r.onclick = () => { cur = r.dataset.id; draw(); });
      const n = notes.find((x) => x.id === cur);
      $(p, '#title').value = n ? n.title : ''; $(p, '#body').value = n ? n.body : '';
      $(p, '#title').disabled = $(p, '#body').disabled = !n;
    };
    const edit = () => { const n = notes.find((x) => x.id === cur); if (!n) return; n.title = $(p, '#title').value; n.body = $(p, '#body').value; n.time = Date.now(); save(); $(p, `#l .item[data-id="${cur}"] .t`).textContent = n.title || 'Untitled'; };
    $(p, '#title').oninput = edit; $(p, '#body').oninput = edit;
    $(p, '#cp').onclick = () => copy($(p, '#body').value);
    $(p, '#del').onclick = () => { if (!confirm('Delete this note?')) return; notes = notes.filter((x) => x.id !== cur); cur = notes[0]?.id; save(); draw(); };
    draw();
  } });

tool({ id: 'todo', name: 'To-do', icon: '✅', group: 'Work', desc: 'A simple task list for today',
  render(el) {
    head(el, this);
    let todos = store.get('todos', []);
    const p = add(el, `<div class="panel"><form class="row" id="f"><input class="grow" id="t" placeholder="Add a task and press Enter"><button class="primary">Add</button></form></div><div class="list" id="l"></div><div class="row" style="margin-top:10px"><span class="muted" id="c"></span><div class="grow"></div><button id="cl">Remove done</button></div>`);
    const save = () => store.set('todos', todos);
    const draw = () => {
      $(el, '#l').innerHTML = todos.map((t, i) => `<div class="item ${t.done ? 'done' : ''}" data-i="${i}"><input type="checkbox" ${t.done ? 'checked' : ''}><span class="t">${esc(t.text)}</span><button data-a="del">✕</button></div>`).join('') || '<p class="muted">Nothing to do. 🎉</p>';
      $$(el, '#l .item').forEach((r) => {
        const i = +r.dataset.i;
        $(r, 'input').onchange = () => { todos[i].done = !todos[i].done; save(); draw(); };
        $(r, 'button').onclick = () => { todos.splice(i, 1); save(); draw(); };
      });
      $(el, '#c').textContent = `${todos.filter((t) => !t.done).length} left`;
    };
    $(p, '#f').onsubmit = (e) => { e.preventDefault(); const v = $(p, '#t').value.trim(); if (!v) return; todos.unshift({ text: v, done: false }); $(p, '#t').value = ''; save(); draw(); };
    $(el, '#cl').onclick = () => { todos = todos.filter((t) => !t.done); save(); draw(); };
    draw(); $(p, '#t').focus();
  } });

tool({ id: 'timer', name: 'Focus Timer', icon: '⏱', group: 'Work', desc: 'Pomodoro focus timer and stopwatch',
  render(el) {
    head(el, this, 'Work 25 minutes, rest 5. A sound and notification tell you when time is up.');
    const p = add(el, `<div class="panel" style="text-align:center"><div class="row" style="justify-content:center"><button data-m="25">Focus 25</button><button data-m="50">Focus 50</button><button data-m="5">Break 5</button><button data-m="15">Break 15</button><button data-m="0">Stopwatch</button></div><div class="big-num" id="n" style="font-size:96px;margin:20px 0">25:00</div><div class="row" style="justify-content:center"><button class="primary big" id="go">Start</button><button class="big" id="reset">Reset</button></div><p class="muted" id="done"></p></div>`);
    let total = 25 * 60e3, left = total, running = false, last = 0, up = false;
    const draw = () => { const ms = up ? left : Math.max(left, 0); const s = Math.ceil(ms / 1000) - (up ? 0 : 0); const v = up ? Math.floor(ms / 1000) : s; $(p, '#n').textContent = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; $(p, '#go').textContent = running ? 'Pause' : 'Start'; document.title = running ? `${$(p, '#n').textContent} — TouchKit` : 'TouchKit'; };
    const beep = () => { try { const a = new AudioContext(); [0, .3, .6].forEach((t) => { const o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + .15); }); } catch {} };
    const tick = () => {
      if (!running) return; const now = Date.now(); const dt = now - last; last = now;
      left += up ? dt : -dt;
      if (!up && left <= 0) { running = false; left = 0; beep(); new Notification('TouchKit', { body: 'Time is up!' }); const d = store.get('focusDone', 0) + 1; store.set('focusDone', d); $(p, '#done').textContent = `Sessions finished: ${d}`; }
      draw();
    };
    $$(p, '[data-m]').forEach((b) => b.onclick = () => { up = b.dataset.m === '0'; total = +b.dataset.m * 60e3; left = up ? 0 : total; running = false; draw(); });
    $(p, '#go').onclick = () => { running = !running; last = Date.now(); draw(); };
    $(p, '#reset').onclick = () => { running = false; left = up ? 0 : total; draw(); };
    $(p, '#done').textContent = `Sessions finished: ${store.get('focusDone', 0)}`;
    const t = setInterval(tick, 250); draw();
    return () => { clearInterval(t); document.title = 'TouchKit'; };
  } });

tool({ id: 'clock', name: 'World Clock', icon: '🌍', group: 'Work', desc: 'Your clients’ time zones at a glance',
  render(el) {
    head(el, this, 'Add the cities of your clients. Use the slider to find a good meeting time.');
    const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    let list = store.get('zones', ['Asia/Dhaka', 'Europe/London', 'America/New_York', 'Asia/Kolkata']);
    const p = add(el, `<div class="panel row"><input list="zl" id="z" class="grow" placeholder="Add a city or time zone, e.g. Europe/Madrid"><datalist id="zl">${zones.map((z) => `<option value="${z}">`).join('')}</datalist><button class="primary" id="add">Add</button></div><div class="panel"><label>Shift time: <span id="sh">now</span></label><input type="range" id="r" min="-24" max="24" step="0.5" value="0" style="width:100%"></div><div class="cards" id="l"></div>`);
    const draw = () => {
      const shift = +$(p, '#r').value; const t = new Date(Date.now() + shift * 3600e3);
      $(p, '#sh').textContent = shift ? `${shift > 0 ? '+' : ''}${shift} h` : 'now';
      $(el, '#l').innerHTML = list.map((z, i) => {
        let time = '', day = '', hour = 12;
        try { time = t.toLocaleTimeString([], { timeZone: z, hour: '2-digit', minute: '2-digit' }); day = t.toLocaleDateString([], { timeZone: z, weekday: 'short', day: 'numeric', month: 'short' }); hour = +t.toLocaleString('en-US', { timeZone: z, hour: 'numeric', hour12: false }); } catch { time = '?'; }
        const work = hour >= 9 && hour < 18;
        return `<div class="card" data-i="${i}"><span>${esc(z.split('/').pop().replace(/_/g, ' '))} ${work ? '🟢' : hour >= 22 || hour < 7 ? '🌙' : '🟡'}</span><b style="font-size:26px">${time}</b><span>${day}</span><button data-i="${i}" style="margin-top:6px">Remove</button></div>`;
      }).join('');
      $$(el, '#l button').forEach((b) => b.onclick = () => { list.splice(+b.dataset.i, 1); store.set('zones', list); draw(); });
    };
    $(p, '#add').onclick = () => { const z = $(p, '#z').value.trim(); if (!z) return; try { new Date().toLocaleString([], { timeZone: z }); list.push(z); store.set('zones', list); $(p, '#z').value = ''; draw(); } catch { toast('Unknown time zone'); } };
    $(p, '#r').oninput = draw;
    draw(); const t = setInterval(draw, 15000);
    return () => clearInterval(t);
  } });

// MARK: Freelance

tool({ id: 'tracker', name: 'Time Tracker', icon: '⏲', group: 'Freelance', desc: 'Track hours per client and project',
  render(el) {
    head(el, this, 'Start the timer when you work. Totals feed straight into the Invoice Maker.');
    let entries = store.get('time', []);
    let run = store.get('timeRun', null);
    const p = add(el, `<div class="panel row"><input id="client" placeholder="Client" list="cl"><datalist id="cl"></datalist><input id="task" class="grow" placeholder="What are you working on?"><input id="rate" type="number" min="0" placeholder="Rate / h" style="width:110px"><div class="big-num" id="n" style="font-size:28px;min-width:140px;text-align:center">00:00:00</div><button class="primary" id="go">Start</button></div>
      <div class="row" style="margin-bottom:8px"><b class="grow">Entries</b><button id="exp">Export CSV</button></div><table><thead><tr><th>Date</th><th>Client</th><th>Task</th><th>Time</th><th>Rate</th><th>Amount</th><th></th></tr></thead><tbody id="tb"></tbody></table><h2>Totals by client</h2><div class="cards" id="tot"></div>`);
    const save = () => { store.set('time', entries); store.set('timeRun', run); };
    const draw = () => {
      $(p, '#go').textContent = run ? 'Stop' : 'Start';
      $(p, '#go').className = run ? 'danger' : 'primary';
      if (run) { $(p, '#client').value = run.client; $(p, '#task').value = run.task; $(p, '#rate').value = run.rate || ''; }
      const clients = [...new Set(entries.map((e) => e.client).filter(Boolean))];
      $(p, '#cl').innerHTML = clients.map((c) => `<option value="${esc(c)}">`).join('');
      $(el, '#tb').innerHTML = entries.slice(0, 200).map((e, i) => `<tr><td>${new Date(e.start).toLocaleDateString()}</td><td>${esc(e.client)}</td><td>${esc(e.task)}</td><td class="mono">${fmtDur(e.ms)}</td><td>${e.rate || ''}</td><td>${e.rate ? money(e.ms / 3600e3 * e.rate) : ''}</td><td><button data-i="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No time tracked yet.</td></tr>';
      $$(el, '#tb button').forEach((b) => b.onclick = () => { entries.splice(+b.dataset.i, 1); save(); draw(); });
      const tot = {};
      for (const e of entries) { const k = e.client || 'No client'; tot[k] = tot[k] || { ms: 0, amt: 0 }; tot[k].ms += e.ms; tot[k].amt += e.rate ? e.ms / 3600e3 * e.rate : 0; }
      $(el, '#tot').innerHTML = Object.entries(tot).map(([k, v]) => `<div class="card"><span>${esc(k)}</span><b>${fmtDur(v.ms)}</b><span>${v.amt ? money(v.amt) : ''}</span></div>`).join('') || '<span class="muted">—</span>';
    };
    const tick = () => { $(p, '#n').textContent = fmtDur(run ? Date.now() - run.start : 0); };
    $(p, '#go').onclick = () => {
      if (run) { entries.unshift({ ...run, ms: Date.now() - run.start }); run = null; }
      else run = { client: $(p, '#client').value.trim(), task: $(p, '#task').value.trim(), rate: +$(p, '#rate').value || 0, start: Date.now() };
      save(); draw(); tick();
    };
    $(el, '#exp').onclick = () => {
      const rows = [['Date', 'Client', 'Task', 'Hours', 'Rate', 'Amount'], ...entries.map((e) => [new Date(e.start).toISOString().slice(0, 10), e.client, e.task, (e.ms / 3600e3).toFixed(2), e.rate, e.rate ? (e.ms / 3600e3 * e.rate).toFixed(2) : ''])];
      tk.call('saveAs', { name: 'time-tracking.csv', text: rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') });
    };
    draw(); tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  } });

tool({ id: 'invoice', name: 'Invoice Maker', icon: '🧾', group: 'Freelance', desc: 'Make a clean PDF invoice in a minute',
  render(el) {
    head(el, this, 'Your details are remembered for next time. “Add tracked time” pulls hours from the Time Tracker.');
    const me = store.get('invoiceMe', { name: '', email: '', address: '', currency: '$', note: 'Thank you for your business!' });
    const n = store.get('invoiceNo', 1);
    const inv = { no: `INV-${String(n).padStart(4, '0')}`, date: new Date().toISOString().slice(0, 10), due: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), client: '', clientInfo: '', items: [{ d: '', q: 1, p: 0 }], tax: 0, discount: 0 };
    const p = add(el, `<div class="grid2">
      <div class="panel"><b>From (you)</b><div class="field"><label>Name / business</label><input id="mn" value="${esc(me.name)}"></div><div class="field"><label>Email</label><input id="me" value="${esc(me.email)}"></div><div class="field"><label>Address / payment details</label><textarea id="ma" style="min-height:70px;font-family:inherit">${esc(me.address)}</textarea></div></div>
      <div class="panel"><b>To (client)</b><div class="field"><label>Client name</label><input id="cn"></div><div class="field"><label>Client details</label><textarea id="ci" style="min-height:70px;font-family:inherit"></textarea></div>
        <div class="grid3"><div class="field"><label>Invoice no.</label><input id="no" value="${inv.no}"></div><div class="field"><label>Date</label><input type="date" id="dt" value="${inv.date}"></div><div class="field"><label>Due</label><input type="date" id="du" value="${inv.due}"></div></div></div></div>
      <div class="panel"><table><thead><tr><th>Description</th><th style="width:80px">Qty / h</th><th style="width:110px">Price</th><th style="width:110px">Amount</th><th style="width:40px"></th></tr></thead><tbody id="it"></tbody></table>
      <div class="row" style="margin-top:10px"><button id="addi">+ Line</button><button id="addt">+ Add tracked time</button><div class="grow"></div><label style="margin:0">Currency</label><input id="cur" value="${esc(me.currency)}" style="width:60px"><label style="margin:0">Tax %</label><input id="tax" type="number" value="0" style="width:70px"><label style="margin:0">Discount</label><input id="dis" type="number" value="0" style="width:90px"></div>
      <div style="text-align:right;margin-top:12px;font-size:18px"><b>Total: <span id="tot"></span></b></div></div>
      <div class="panel"><div class="field"><label>Note</label><input id="note" value="${esc(me.note)}"></div></div>
      <div class="row"><button class="primary big" id="pdf">Save PDF</button></div>`);
    const val = (id) => $(p, '#' + id).value;
    const calc = () => { const sub = inv.items.reduce((s, i) => s + i.q * i.p, 0); const tax = sub * (+val('tax') || 0) / 100; return { sub, tax, dis: +val('dis') || 0, total: sub + tax - (+val('dis') || 0) }; };
    const drawItems = () => {
      const cur = val('cur');
      $(p, '#it').innerHTML = inv.items.map((i, k) => `<tr data-k="${k}"><td><input data-f="d" value="${esc(i.d)}" style="width:100%"></td><td><input data-f="q" type="number" step="0.25" value="${i.q}" style="width:100%"></td><td><input data-f="p" type="number" step="0.01" value="${i.p}" style="width:100%"></td><td class="mono">${money(i.q * i.p, cur)}</td><td><button>✕</button></td></tr>`).join('');
      $$(p, '#it tr').forEach((tr) => {
        const k = +tr.dataset.k;
        $$(tr, 'input').forEach((inp) => inp.oninput = () => { const f = inp.dataset.f; inv.items[k][f] = f === 'd' ? inp.value : +inp.value || 0; $(tr, '.mono').textContent = money(inv.items[k].q * inv.items[k].p, val('cur')); total(); });
        $(tr, 'button').onclick = () => { inv.items.splice(k, 1); drawItems(); };
      });
      total();
    };
    const total = () => { $(p, '#tot').textContent = money(calc().total, val('cur')); };
    $(p, '#addi').onclick = () => { inv.items.push({ d: '', q: 1, p: 0 }); drawItems(); };
    $(p, '#addt').onclick = () => {
      const client = val('cn').trim();
      const entries = store.get('time', []).filter((e) => !client || e.client === client);
      if (!entries.length) return toast(client ? 'No tracked time for this client' : 'No tracked time yet');
      const byTask = {};
      for (const e of entries) { const k = e.task || 'Work'; byTask[k] = byTask[k] || { h: 0, rate: e.rate }; byTask[k].h += e.ms / 3600e3; }
      inv.items = inv.items.filter((i) => i.d || i.p);
      for (const [d, v] of Object.entries(byTask)) inv.items.push({ d, q: Math.round(v.h * 100) / 100, p: v.rate || 0 });
      drawItems();
    };
    ['tax', 'dis', 'cur'].forEach((id) => $(p, '#' + id).oninput = drawItems);
    $(p, '#pdf').onclick = async () => {
      const m = { name: val('mn'), email: val('me'), address: val('ma'), currency: val('cur'), note: val('note') };
      store.set('invoiceMe', m);
      const c = calc(), cur = m.currency;
      const nl = (s) => esc(s).replace(/\n/g, '<br>');
      const html = `<!doctype html><meta charset="utf-8"><style>body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0}h1{font-size:30px;margin:0;color:#3d7bff}table{width:100%;border-collapse:collapse;margin-top:24px}th{text-align:left;font-size:11px;color:#666;text-transform:uppercase;border-bottom:2px solid #111;padding:6px}td{padding:8px 6px;border-bottom:1px solid #ddd}.r{text-align:right}.top{display:flex;justify-content:space-between}.box{margin-top:28px;display:flex;justify-content:space-between}.tot td{border:0}.big td{font-size:16px;font-weight:700;border-top:2px solid #111}</style>
        <div class="top"><div><h1>INVOICE</h1><div>${esc(val('no'))}</div></div><div class="r"><b>${esc(m.name)}</b><br>${esc(m.email)}<br>${nl(m.address)}</div></div>
        <div class="box"><div><div style="color:#666;font-size:11px">BILL TO</div><b>${esc(val('cn'))}</b><br>${nl(val('ci'))}</div><div class="r">Date: ${esc(val('dt'))}<br>Due: ${esc(val('du'))}</div></div>
        <table><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>${inv.items.map((i) => `<tr><td>${esc(i.d)}</td><td class="r">${i.q}</td><td class="r">${money(i.p, cur)}</td><td class="r">${money(i.q * i.p, cur)}</td></tr>`).join('')}
        <tr class="tot"><td></td><td></td><td class="r">Subtotal</td><td class="r">${money(c.sub, cur)}</td></tr>${c.tax ? `<tr class="tot"><td></td><td></td><td class="r">Tax ${+val('tax')}%</td><td class="r">${money(c.tax, cur)}</td></tr>` : ''}${c.dis ? `<tr class="tot"><td></td><td></td><td class="r">Discount</td><td class="r">−${money(c.dis, cur)}</td></tr>` : ''}<tr class="big"><td></td><td></td><td class="r">Total</td><td class="r">${money(c.total, cur)}</td></tr></table>
        <p style="margin-top:40px;color:#555">${esc(m.note)}</p>`;
      const f = await tk.call('pdf', { name: `${val('no')}.pdf`, html });
      if (f) { store.set('invoiceNo', n + 1); toast('Invoice saved'); }
    };
    drawItems();
  } });

tool({ id: 'rate', name: 'Rate Calculator', icon: '💰', group: 'Freelance', desc: 'Work out your hourly rate and project price',
  render(el) {
    head(el, this, 'What should you charge? Enter what you want to earn, the calculator does the rest.');
    const s = store.get('rate', { income: 1000, expenses: 100, hours: 25, weeks: 4.3, fee: 20, profit: 10 });
    const p = add(el, `<div class="panel grid3">
      ${[['income', 'Wanted monthly income'], ['expenses', 'Monthly costs (internet, tools…)'], ['hours', 'Billable hours per week'], ['weeks', 'Weeks per month'], ['fee', 'Platform fee % (Fiverr/Upwork)'], ['profit', 'Extra margin %']].map(([k, l]) => `<div class="field"><label>${l}</label><input type="number" data-k="${k}" value="${s[k]}"></div>`).join('')}</div>
      <div class="panel"><div class="muted">Your hourly rate</div><div class="big-num" id="r"></div><div class="muted" id="d"></div></div>
      <div class="panel row"><div class="field"><label>Project hours</label><input type="number" id="ph" value="10"></div><div class="grow"></div><div><div class="muted">Project price</div><div class="big-num" style="font-size:34px" id="pp"></div></div></div>`);
    const draw = () => {
      $$(p, '[data-k]').forEach((i) => s[i.dataset.k] = +i.value || 0); store.set('rate', s);
      const hours = s.hours * s.weeks || 1;
      const base = (s.income + s.expenses) / hours;
      const rate = base * (1 + s.profit / 100) / (1 - Math.min(s.fee, 90) / 100);
      $(p, '#r').textContent = money(rate) + ' / h';
      $(p, '#d').textContent = `${Math.round(hours)} billable hours a month · after the ${s.fee}% platform fee you keep ${money(rate * (1 - s.fee / 100))} / h`;
      $(p, '#pp').textContent = money(rate * (+$(p, '#ph').value || 0));
    };
    $$(p, 'input').forEach((i) => i.oninput = draw); draw();
  } });

// MARK: Text & Data

tool({ id: 'text', name: 'Text Tools', icon: '🔤', group: 'Text & Data', desc: 'Count words, change case, clean up and sort text',
  render(el) {
    head(el, this);
    const p = add(el, `<div class="panel"><textarea id="t" placeholder="Paste or type text here…" style="font-family:inherit;font-size:14px;min-height:220px">${esc(store.get('textTool', ''))}</textarea><p class="muted" id="st"></p>
      <div class="row">${[['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['sentence', 'Sentence case'], ['trim', 'Remove extra spaces'], ['lines', 'Remove empty lines'], ['sort', 'Sort lines A→Z'], ['uniq', 'Remove duplicate lines'], ['rev', 'Reverse lines'], ['slug', 'make-a-slug']].map(([a, l]) => `<button data-a="${a}">${l}</button>`).join('')}<button class="primary" id="cp">Copy</button></div></div>`);
    const t = $(p, '#t');
    const stats = () => {
      const v = t.value; store.set('textTool', v);
      const words = (v.match(/\S+/g) || []).length;
      $(p, '#st').textContent = `${words} words · ${v.length} characters · ${v.replace(/\s/g, '').length} without spaces · ${v ? v.split('\n').length : 0} lines · ~${Math.max(1, Math.round(words / 200))} min read`;
    };
    const ops = {
      upper: (v) => v.toUpperCase(), lower: (v) => v.toLowerCase(),
      title: (v) => v.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()),
      sentence: (v) => v.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()),
      trim: (v) => v.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n'),
      lines: (v) => v.split('\n').filter((l) => l.trim()).join('\n'),
      sort: (v) => v.split('\n').sort((a, b) => a.localeCompare(b)).join('\n'),
      uniq: (v) => [...new Set(v.split('\n'))].join('\n'),
      rev: (v) => v.split('\n').reverse().join('\n'),
      slug: (v) => v.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-'),
    };
    $$(p, '[data-a]').forEach((b) => b.onclick = () => { t.value = ops[b.dataset.a](t.value); stats(); });
    $(p, '#cp').onclick = () => copy(t.value);
    t.oninput = stats; stats();
  } });

tool({ id: 'password', name: 'Password Generator', icon: '🔑', group: 'Text & Data', desc: 'Strong passwords, made on your computer',
  render(el) {
    head(el, this, 'Passwords are made on this computer and never sent anywhere.');
    const p = add(el, `<div class="panel"><div class="row"><input id="pw" class="grow mono" readonly style="font-size:20px"><button class="primary" id="cp">Copy</button><button id="re">New</button></div>
      <div class="row" style="margin-top:12px"><label style="margin:0">Length <b id="lv">16</b></label><input type="range" id="len" min="6" max="64" value="16" class="grow"></div>
      <div class="row">${[['upper', 'A–Z', 1], ['lower', 'a–z', 1], ['digits', '0–9', 1], ['symbols', '!@#$', 1], ['similar', 'Avoid look-alikes (O/0, l/1)', 0]].map(([k, l, c]) => `<label class="row" style="margin:0"><input type="checkbox" data-k="${k}" ${c ? 'checked' : ''}> ${l}</label>`).join('')}</div><p class="muted" id="str"></p></div>`);
    const gen = () => {
      const o = {}; $$(p, '[data-k]').forEach((c) => o[c.dataset.k] = c.checked);
      let sets = [o.upper && 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', o.lower && 'abcdefghijklmnopqrstuvwxyz', o.digits && '0123456789', o.symbols && '!@#$%^&*()-_=+[]{};:,.?'].filter(Boolean);
      if (o.similar) sets = sets.map((s) => s.replace(/[O0Il1|]/g, ''));
      if (!sets.length) sets = ['abcdefghijklmnopqrstuvwxyz'];
      const len = +$(p, '#len').value; $(p, '#lv').textContent = len;
      const all = sets.join(''); const rnd = new Uint32Array(len); crypto.getRandomValues(rnd);
      let pw = [...rnd].map((r) => all[r % all.length]);
      sets.forEach((s, i) => { if (i < len) { const r = new Uint32Array(2); crypto.getRandomValues(r); pw[r[0] % len] = s[r[1] % s.length]; } });
      $(p, '#pw').value = pw.join('');
      const bits = Math.round(len * Math.log2(all.length));
      $(p, '#str').textContent = `Strength: ${bits < 50 ? 'weak' : bits < 80 ? 'good' : 'very strong'} (${bits} bits)`;
    };
    $$(p, 'input[type=checkbox], #len').forEach((i) => i.oninput = gen);
    $(p, '#re').onclick = gen; $(p, '#cp').onclick = () => copy($(p, '#pw').value);
    gen();
  } });

tool({ id: 'qr', name: 'QR Code Maker', icon: '🔳', group: 'Text & Data', desc: 'Turn a link, text or Wi‑Fi login into a QR code',
  render(el) {
    head(el, this);
    const p = add(el, `<div class="row" style="align-items:flex-start;gap:20px"><div class="panel grow"><div class="row" style="margin-bottom:10px"><button data-m="text" class="primary">Link / text</button><button data-m="wifi">Wi‑Fi</button></div>
      <div id="mt"><textarea id="t" style="min-height:100px;font-family:inherit" placeholder="https://…">https://</textarea></div>
      <div id="mw" style="display:none" class="grid2"><div class="field"><label>Wi‑Fi name</label><input id="ss"></div><div class="field"><label>Password</label><input id="wp"></div></div></div>
      <div class="panel" style="text-align:center"><img id="img" class="qr" style="width:280px;height:280px"><div class="row" style="justify-content:center;margin-top:10px"><button class="primary" id="sv">Save PNG</button></div></div></div>`);
    let mode = 'text', url = '';
    const data = () => mode === 'wifi' ? `WIFI:T:WPA;S:${$(p, '#ss').value.replace(/([\;,:"])/g, '\\$1')};P:${$(p, '#wp').value.replace(/([\;,:"])/g, '\\$1')};;` : $(p, '#t').value;
    const draw = async () => { url = await tk.call('qr', { text: data() || ' ', size: 1000 }); $(p, '#img').src = url; };
    $$(p, '[data-m]').forEach((b) => b.onclick = () => { mode = b.dataset.m; $$(p, '[data-m]').forEach((x) => x.classList.toggle('primary', x === b)); $(p, '#mt').style.display = mode === 'text' ? '' : 'none'; $(p, '#mw').style.display = mode === 'wifi' ? '' : 'none'; draw(); });
    $$(p, 'textarea, input').forEach((i) => i.oninput = draw);
    $(p, '#sv').onclick = () => tk.call('saveAs', { name: 'qr-code.png', dataUrl: url });
    draw();
  } });

tool({ id: 'json', name: 'JSON & Code', icon: '🧩', group: 'Text & Data', desc: 'Format, check and minify JSON',
  render(el) {
    head(el, this);
    const p = add(el, `<div class="panel"><textarea id="t" style="min-height:45vh" placeholder='{"paste": "json here"}'></textarea><p id="m" class="muted"></p><div class="row"><button class="primary" data-a="fmt">Format</button><button data-a="min">Minify</button><button data-a="sort">Sort keys</button><button id="cp">Copy</button></div></div>`);
    const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
    $$(p, '[data-a]').forEach((b) => b.onclick = () => {
      try {
        let v = JSON.parse($(p, '#t').value);
        if (b.dataset.a === 'sort') v = sortKeys(v);
        $(p, '#t').value = JSON.stringify(v, null, b.dataset.a === 'min' ? 0 : 2);
        $(p, '#m').textContent = '✓ Valid JSON'; $(p, '#m').style.color = 'var(--ok)';
      } catch (e) { $(p, '#m').textContent = '✗ ' + e.message; $(p, '#m').style.color = 'var(--bad)'; }
    });
    $(p, '#cp').onclick = () => copy($(p, '#t').value);
  } });

tool({ id: 'encode', name: 'Encode / Decode', icon: '🔁', group: 'Text & Data', desc: 'Base64, URL encoding and more',
  render(el) {
    head(el, this);
    const p = add(el, `<div class="grid2"><div class="panel"><label>Input</label><textarea id="a"></textarea></div><div class="panel"><label>Output</label><textarea id="b" readonly></textarea></div></div><div class="row">${[['b64e', 'Base64 encode'], ['b64d', 'Base64 decode'], ['urle', 'URL encode'], ['urld', 'URL decode'], ['html', 'HTML escape'], ['count', 'Character codes']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}<button class="primary" id="cp">Copy output</button></div>`);
    const ops = {
      b64e: (v) => btoa(String.fromCharCode(...new TextEncoder().encode(v))),
      b64d: (v) => new TextDecoder().decode(Uint8Array.from(atob(v.trim()), (c) => c.charCodeAt(0))),
      urle: encodeURIComponent, urld: decodeURIComponent, html: esc,
      count: (v) => [...v].map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('\n'),
    };
    $$(p, '[data-k]').forEach((b) => b.onclick = () => { try { $(el, '#b').value = ops[b.dataset.k]($(el, '#a').value); } catch (e) { $(el, '#b').value = 'Error: ' + e.message; } });
    $(el, '#cp').onclick = () => copy($(el, '#b').value);
  } });

tool({ id: 'units', name: 'Unit Converter', icon: '📏', group: 'Text & Data', desc: 'Length, weight, temperature, data size, area',
  render(el) {
    head(el, this);
    const U = {
      Length: { m: 1, km: 1000, cm: .01, mm: .001, inch: .0254, foot: .3048, yard: .9144, mile: 1609.344, hand: .1016 },
      Weight: { kg: 1, g: .001, ton: 1000, pound: .45359237, ounce: .028349523, maund: 37.3242, seer: .933 },
      Area: { 'm²': 1, 'km²': 1e6, 'ft²': .09290304, acre: 4046.8564, hectare: 1e4, decimal: 40.468564, katha: 66.89, bigha: 1337.8 },
      'Data size': { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 },
      Temperature: { '°C': 'c', '°F': 'f', K: 'k' },
    };
    const p = add(el, `<div class="panel"><div class="row"><select id="k">${Object.keys(U).map((k) => `<option>${k}</option>`).join('')}</select></div><div class="row" style="margin-top:12px"><input id="v" type="number" value="1" style="font-size:20px;width:160px"><select id="f"></select><span style="font-size:20px">=</span><b id="o" class="mono" style="font-size:20px"></b><select id="t"></select></div><div id="all" class="muted" style="margin-top:12px"></div></div>`);
    const temp = (v, f, t) => { const c = f === 'c' ? v : f === 'f' ? (v - 32) * 5 / 9 : v - 273.15; return t === 'c' ? c : t === 'f' ? c * 9 / 5 + 32 : c + 273.15; };
    const fill = () => { const units = Object.keys(U[$(p, '#k').value]); $(p, '#f').innerHTML = $(p, '#t').innerHTML = units.map((u) => `<option>${u}</option>`).join(''); $(p, '#t').selectedIndex = 1; calc(); };
    const conv = (v, f, t) => { const u = U[$(p, '#k').value]; return typeof u[f] === 'string' ? temp(v, u[f], u[t]) : v * u[f] / u[t]; };
    const fmt = (n) => Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n) ? n.toExponential(4) : +n.toFixed(6);
    const calc = () => { const v = +$(p, '#v').value || 0, f = $(p, '#f').value; $(p, '#o').textContent = fmt(conv(v, f, $(p, '#t').value)); $(p, '#all').innerHTML = Object.keys(U[$(p, '#k').value]).filter((u) => u !== f).map((u) => `${fmt(conv(v, f, u))} ${u}`).join(' · '); };
    $(p, '#k').onchange = fill; $$(p, '#v, #f, #t').forEach((i) => i.oninput = calc);
    fill();
  } });

// MARK: Images

tool({ id: 'image', name: 'Image Resizer', icon: '🖼', group: 'Images', desc: 'Resize, compress and convert images (JPG, PNG, WebP)',
  render(el) {
    head(el, this, 'Drop an image here. Everything happens on your computer.');
    const p = add(el, `<div class="panel" id="drop" style="text-align:center;padding:40px;border-style:dashed"><p>Drop an image here or</p><input type="file" id="file" accept="image/*"></div>
      <div id="ed" style="display:none"><div class="panel row"><div class="field"><label>Width</label><input type="number" id="w" style="width:100px"></div><div class="field"><label>Height</label><input type="number" id="h" style="width:100px"></div><label class="row" style="margin:0"><input type="checkbox" id="lock" checked> Keep ratio</label>
      <div class="field"><label>Format</label><select id="fmt"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="field"><label>Quality <span id="qv">85</span>%</label><input type="range" id="q" min="10" max="100" value="85"></div>
      <div class="row">${[1920, 1280, 1080, 800, 512].map((s) => `<button data-s="${s}">${s}px</button>`).join('')}</div></div>
      <div class="panel"><canvas class="preview" id="c"></canvas><p class="muted" id="info"></p><div class="row"><button class="primary big" id="sv">Save image</button><button id="cp">Copy</button></div></div></div>`);
    let img = null, name = 'image', ratio = 1, out = '';
    const render = () => {
      if (!img) return;
      const c = $(p, '#c'); c.width = +$(p, '#w').value || 1; c.height = +$(p, '#h').value || 1;
      const ctx = c.getContext('2d'); const fmt = $(p, '#fmt').value;
      if (fmt === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height);
      out = c.toDataURL(fmt, +$(p, '#q').value / 100);
      const kb = Math.round(out.length * 3 / 4 / 1024);
      $(p, '#info').textContent = `${c.width} × ${c.height} · about ${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'} (was ${img.naturalWidth} × ${img.naturalHeight})`;
    };
    const load = (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      name = file.name.replace(/\.[^.]+$/, '');
      const i = new Image(); i.onload = () => { img = i; ratio = i.naturalWidth / i.naturalHeight; $(p, '#w').value = i.naturalWidth; $(p, '#h').value = i.naturalHeight; $(p, '#ed').style.display = ''; render(); };
      i.src = URL.createObjectURL(file);
    };
    $(p, '#file').onchange = (e) => load(e.target.files[0]);
    const drop = $(p, '#drop');
    drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; };
    drop.ondragleave = () => { drop.style.borderColor = ''; };
    drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = ''; load(e.dataTransfer.files[0]); };
    $(p, '#w').oninput = () => { if ($(p, '#lock').checked) $(p, '#h').value = Math.round(+$(p, '#w').value / ratio); render(); };
    $(p, '#h').oninput = () => { if ($(p, '#lock').checked) $(p, '#w').value = Math.round(+$(p, '#h').value * ratio); render(); };
    $$(p, '[data-s]').forEach((b) => b.onclick = () => { const s = +b.dataset.s; if (ratio >= 1) { $(p, '#w').value = s; $(p, '#h').value = Math.round(s / ratio); } else { $(p, '#h').value = s; $(p, '#w').value = Math.round(s * ratio); } render(); });
    $$(p, '#fmt, #q').forEach((i) => i.oninput = () => { $(p, '#qv').textContent = $(p, '#q').value; render(); });
    $(p, '#sv').onclick = () => tk.call('saveAs', { name: `${name}-${$(p, '#w').value}.${{ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[$(p, '#fmt').value]}`, dataUrl: out });
    $(p, '#cp').onclick = () => $(p, '#c').toBlob((b) => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => toast('Copied'), () => toast('Could not copy')), 'image/png');
  } });
