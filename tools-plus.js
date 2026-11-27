// More everyday tools that replace separate apps: a Pomodoro focus timer with a
// menu bar countdown (Flow), One Thing in the menu bar, text snippets (PastePal),
// mail shortcuts (Outlook / Gmail), a wallpaper changer (Unsplash Wallpapers),
// sending files over Wi-Fi (LocalSend), a simple video editor (CapCut basics)
// and an audio recorder with a level meter (RODE basics).
/* global TK, tk, esc, add, $, $$, store, tool, toast, copy, head, uid */

// MARK: menu bar text (desktop) / tab title (web)
const trayParts = { flow: '', one: '' };
let trayLast = null;
function trayUpdate() {
  trayParts.one = (store.get('onething', '') || '').trim();
  const text = [trayParts.flow, trayParts.one && '☝ ' + trayParts.one.slice(0, 40)].filter(Boolean).join('  ');
  if (text === trayLast) return;
  trayLast = text;
  if (window.TK_PLATFORM === 'desktop') tk.call('trayText', { text, keep: trayParts.one ? '☝ ' + trayParts.one.slice(0, 40) : '' });
  else if (trayParts.flow) document.title = trayParts.flow + ' — Jhuli';
}

// MARK: Flow — focus timer engine. It runs for the whole page, so the countdown keeps
// going while you use other tools (and in the menu bar on the desktop app).
const Flow = (() => {
  const conf = () => ({ work: 25, short: 5, long: 15, every: 4, auto: true, ...store.get('flowConf', {}) });
  const s = { mode: 'idle', end: 0, left: 0, paused: false, round: 0, listeners: [] };
  const label = { work: 'Focus', short: 'Short break', long: 'Long break', idle: 'Ready', stopwatch: 'Stopwatch' };
  const mins = (m) => conf()[m === 'work' ? 'work' : m === 'short' ? 'short' : 'long'] * 60e3;
  const fmt = (ms) => { const v = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
  const remaining = () => (s.mode === 'idle' ? mins('work') : s.mode === 'stopwatch' ? (s.paused ? s.left : Date.now() - s.end) : s.paused ? s.left : s.end - Date.now());
  const emit = () => s.listeners.forEach((f) => { try { f(); } catch {} });
  function beep() {
    try { const a = new AudioContext(); [0, .25, .5].forEach((t) => { const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = 880; g.gain.value = .2; o.connect(g); g.connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + .15); }); setTimeout(() => a.close(), 1500); } catch {}
  }
  function notify(text) {
    beep();
    if (window.TK_PLATFORM === 'desktop') tk.call('notify', { title: 'Jhuli focus timer', body: text });
    else try { if (window.Notification && Notification.permission === 'granted') new Notification('Jhuli', { body: text }); } catch {}
    toast(text);
  }
  function start(mode) {
    s.mode = mode; s.paused = false;
    s.end = mode === 'stopwatch' ? Date.now() : Date.now() + mins(mode);
    if (window.Notification && Notification.permission === 'default' && window.TK_PLATFORM !== 'desktop') Notification.requestPermission().catch(() => {});
    emit(); tick();
  }
  function next() {
    if (s.mode === 'work') {
      s.round++; store.set('focusDone', store.get('focusDone', 0) + 1);
      const long = s.round % conf().every === 0;
      notify(long ? 'Great work! Take a long break. · লম্বা বিরতি নিন' : 'Time for a short break. · একটু বিরতি নিন');
      if (conf().auto) start(long ? 'long' : 'short'); else { s.mode = long ? 'long' : 'short'; s.paused = true; s.left = mins(s.mode); }
    } else {
      notify('Break is over — back to focus. · আবার কাজে ফিরুন');
      if (conf().auto) start('work'); else { s.mode = 'work'; s.paused = true; s.left = mins('work'); }
    }
  }
  function tick() {
    if (s.mode !== 'idle' && s.mode !== 'stopwatch' && !s.paused && Date.now() >= s.end) next();
    const icon = s.mode === 'work' ? '🎯' : s.mode === 'stopwatch' ? '⏱' : '☕';
    trayParts.flow = s.mode === 'idle' || s.paused ? '' : `${icon} ${fmt(remaining())}`;
    trayUpdate(); emit();
  }
  setInterval(tick, 1000);
  return {
    s, conf, label, fmt, remaining, start, next,
    toggle() { if (s.mode === 'idle') return start('work'); if (s.paused) { s.paused = false; s.end = s.mode === 'stopwatch' ? Date.now() - s.left : Date.now() + s.left; } else { s.paused = true; s.left = remaining(); } tick(); },
    stop() { s.mode = 'idle'; s.paused = false; s.round = 0; tick(); },
    skip() { if (s.mode === 'work' || s.mode === 'short' || s.mode === 'long') next(); tick(); },
    on(f) { s.listeners.push(f); return () => { s.listeners = s.listeners.filter((x) => x !== f); }; },
  };
})();

tool({ id: 'timer', name: 'Focus Timer', icon: '🎯', group: 'Work', desc: 'Pomodoro: focus, short and long breaks in cycles, countdown in the menu bar',
  render(el) {
    head(el, this, 'Work in focus sessions with breaks in between. The countdown keeps running while you use other tools (and shows in the menu bar / tray on the desktop app).');
    const c = Flow.conf();
    const p = add(el, `<div class="panel" style="text-align:center">
      <div class="muted" id="mode" style="font-size:18px"></div>
      <div class="big-num" id="n" style="font-size:min(110px,22vw);margin:6px 0 10px"></div>
      <div class="row" style="justify-content:center"><button class="primary big" id="go"></button><button class="big" id="skip">⏭ Skip</button><button class="big" id="stop">⏹ Stop</button></div>
      <div class="row" style="justify-content:center;margin-top:12px"><button data-m="work">🎯 Focus</button><button data-m="short">☕ Short break</button><button data-m="long">🌴 Long break</button><button data-m="stopwatch">⏱ Stopwatch</button></div>
      <p class="muted" id="done"></p></div>
      <div class="panel"><b>Settings</b><div class="row" style="margin-top:8px">
      <div class="field"><label>Focus (min)</label><input type="number" id="w" min="1" value="${c.work}"></div>
      <div class="field"><label>Short break</label><input type="number" id="sb" min="1" value="${c.short}"></div>
      <div class="field"><label>Long break</label><input type="number" id="lb" min="1" value="${c.long}"></div>
      <div class="field"><label>Long break after</label><input type="number" id="ev" min="1" value="${c.every}"></div>
      <label class="row check"><input type="checkbox" id="auto"${c.auto ? ' checked' : ''}> Start the next one by itself</label></div></div>`);
    const draw = () => {
      const s = Flow.s;
      $(p, '#n').textContent = Flow.fmt(Flow.remaining());
      $(p, '#mode').textContent = `${Flow.label[s.mode]}${s.paused ? ' · paused' : ''}${s.mode === 'work' ? ` · round ${s.round + 1}` : ''}`;
      $(p, '#go').textContent = s.mode === 'idle' ? '▶ Start focus' : s.paused ? '▶ Resume' : '⏸ Pause';
      $(p, '#done').textContent = `Focus sessions finished: ${store.get('focusDone', 0)}`;
    };
    $(p, '#go').onclick = () => Flow.toggle();
    $(p, '#skip').onclick = () => Flow.skip();
    $(p, '#stop').onclick = () => Flow.stop();
    $$(p, '[data-m]').forEach((b) => b.onclick = () => Flow.start(b.dataset.m));
    const save = () => store.set('flowConf', { work: +$(p, '#w').value || 25, short: +$(p, '#sb').value || 5, long: +$(p, '#lb').value || 15, every: +$(p, '#ev').value || 4, auto: $(p, '#auto').checked });
    $$(p, 'input').forEach((i) => i.onchange = () => { save(); draw(); });
    draw();
    return Flow.on(draw);
  } });

// MARK: One Thing
tool({ id: 'onething', name: 'One Thing', icon: '☝️', group: 'Work', desc: 'The one task you are doing now, always visible in the menu bar',
  render(el) {
    head(el, this, 'Write the one thing you are working on. On the desktop app it stays next to the eyes in the menu bar / tray, so you do not forget it.');
    const p = add(el, `<div class="panel"><input id="t" class="grow" style="width:100%;font-size:22px" maxlength="80" placeholder="e.g. Finish the KuCoin translations · কুকয়েনের অনুবাদ শেষ করা" value="${esc(store.get('onething', ''))}">
      <div class="row" style="margin-top:12px"><button class="primary" id="save">Show it</button><button id="done">✅ Done — clear it</button></div></div>
      <div class="panel"><b>Recent</b><div class="list" id="h"></div></div>`);
    const hist = () => store.get('onethingHist', []);
    const drawHist = () => { $(el, '#h').innerHTML = hist().map((t) => `<div class="item"><span class="t">${esc(t)}</span><button data-t="${esc(t)}">Use again</button></div>`).join('') || '<p class="muted">Nothing yet.</p>'; $$(el, '#h [data-t]').forEach((b) => b.onclick = () => { $(p, '#t').value = b.dataset.t; set(b.dataset.t); }); };
    const set = (t) => { store.set('onething', t); if (t) store.set('onethingHist', [t, ...hist().filter((x) => x !== t)].slice(0, 10)); trayUpdate(); drawHist(); toast(t ? 'Shown in the menu bar' : 'Cleared'); };
    $(p, '#save').onclick = () => set($(p, '#t').value.trim());
    $(p, '#t').onkeydown = (e) => { if (e.key === 'Enter') set($(p, '#t').value.trim()); };
    $(p, '#done').onclick = () => { $(p, '#t').value = ''; set(''); };
    drawHist();
  } });

// MARK: Snippets (PastePal-style saved texts)
tool({ id: 'snippets', name: 'Snippets', icon: '📌', group: 'Work', desc: 'Texts you paste often — addresses, replies, bank details, links',
  render(el) {
    head(el, this, 'Save texts you use again and again. Click one to copy it, then paste anywhere.');
    const p = add(el, `<div class="panel"><div class="row"><input id="n" placeholder="Name (e.g. My address)" class="grow"></div><textarea id="x" style="width:100%;min-height:5em;margin-top:8px;font-family:inherit;font-size:15px" placeholder="Text to save"></textarea><div class="row" style="margin-top:8px"><button class="primary" id="add">Save snippet</button><span class="grow"></span><input id="q" placeholder="Search…"></div></div><div class="list" id="l"></div>`);
    let editing = null;
    const all = () => store.get('snippets', []);
    const draw = () => {
      const q = $(p, '#q').value.toLowerCase();
      const items = all().filter((s) => (s.name + ' ' + s.text).toLowerCase().includes(q));
      $(el, '#l').innerHTML = items.map((s) => `<div class="item" data-id="${s.id}"><span class="t"><b>${esc(s.name || 'Snippet')}</b><br><span class="muted">${esc(s.text.slice(0, 160))}</span></span><button data-a="copy" class="primary">Copy</button><button data-a="edit">✏️</button><button data-a="del">✕</button></div>`).join('') || '<p class="muted">No snippets yet.</p>';
      $$(el, '#l .item').forEach((row) => row.onclick = (e) => {
        const s = all().find((x) => x.id === row.dataset.id); const a = e.target.dataset.a;
        if (a === 'del') { store.set('snippets', all().filter((x) => x.id !== s.id)); draw(); }
        else if (a === 'edit') { editing = s.id; $(p, '#n').value = s.name; $(p, '#x').value = s.text; $(p, '#add').textContent = 'Update snippet'; }
        else copy(s.text);
      });
    };
    $(p, '#add').onclick = () => {
      const text = $(p, '#x').value; if (!text.trim()) return toast('Write some text first');
      const item = { id: editing || uid(), name: $(p, '#n').value.trim(), text };
      store.set('snippets', editing ? all().map((x) => (x.id === editing ? item : x)) : [item, ...all()]);
      editing = null; $(p, '#n').value = ''; $(p, '#x').value = ''; $(p, '#add').textContent = 'Save snippet'; draw();
    };
    $(p, '#q').oninput = draw;
    draw();
  } });

// MARK: Mail (Outlook / Gmail shortcuts)
tool({ id: 'mail', name: 'Mail', icon: '✉️', group: 'Work', desc: 'Open Gmail or Outlook, or write an email quickly',
  render(el) {
    head(el, this, 'Opens your own mail (Gmail, Outlook, Yahoo) in the browser, or your mail app for a new email.');
    const p = add(el, `<div class="panel"><b>Open my inbox</b><div class="row" style="margin-top:8px"><button data-u="https://mail.google.com/">📮 Gmail</button><button data-u="https://outlook.live.com/mail/">📧 Outlook.com</button><button data-u="https://outlook.office.com/mail/">🏢 Outlook (work)</button><button data-u="https://mail.yahoo.com/">🟣 Yahoo</button></div></div>
      <div class="panel"><b>Write an email</b><div class="field"><label>To</label><input id="to" type="email" placeholder="name@example.com"></div><div class="field"><label>Subject</label><input id="su"></div><div class="field"><label>Message</label><textarea id="bo" style="min-height:8em;font-family:inherit;font-size:15px"></textarea></div>
      <div class="row"><button class="primary" id="gm">Write in Gmail</button><button id="ol">Write in Outlook</button><button id="app">Mail app</button></div></div>`);
    const v = (id) => encodeURIComponent($(p, id).value);
    $$(p, '[data-u]').forEach((b) => b.onclick = () => tk.call('openUrl', { url: b.dataset.u }));
    $(p, '#gm').onclick = () => tk.call('openUrl', { url: `https://mail.google.com/mail/?view=cm&fs=1&to=${v('#to')}&su=${v('#su')}&body=${v('#bo')}` });
    $(p, '#ol').onclick = () => tk.call('openUrl', { url: `https://outlook.live.com/mail/0/deeplink/compose?to=${v('#to')}&subject=${v('#su')}&body=${v('#bo')}` });
    $(p, '#app').onclick = () => { const u = `mailto:${$(p, '#to').value.trim()}?subject=${v('#su')}&body=${v('#bo')}`; if (window.TK_PLATFORM === 'desktop' || window.AndroidTK) tk.call('openUrl', { url: u }); else location.href = u; };
  } });

// MARK: Wallpaper changer (desktop)
tool({ id: 'wallpaper', only: 'desktop', name: 'Wallpaper Changer', icon: '🏞', group: 'Media', desc: 'A beautiful new free photo as your desktop wallpaper, by hand or every day',
  render(el) {
    head(el, this, 'Free photos from Unsplash (through picsum.photos). Pictures are kept in Pictures/Jhuli/Wallpapers.');
    const p = add(el, `<div class="panel"><img id="pv" style="width:100%;max-height:46vh;object-fit:cover;border-radius:12px;background:#0002;display:none">
      <div class="row" style="margin-top:12px"><button class="primary big" id="go">🏞 New wallpaper now</button><select id="topic"><option value="any">Colour</option><option value="gray">Black &amp; white</option></select><label class="row check"><input type="checkbox" id="daily"> Change every day</label><button id="dir">Open folder</button></div><p class="muted" id="m"></p></div>`);
    const show = (file) => { if (!file) return; const i = $(p, '#pv'); i.src = 'file://' + encodeURI(file.replace(/\\/g, '/')).replace(/#/g, '%23'); i.style.display = ''; };
    tk.call('wallpaperGet').then((w) => { $(p, '#daily').checked = !!w.daily; $(p, '#topic').value = w.topic || 'any'; show(w.current); });
    $(p, '#daily').onchange = (e) => tk.call('wallpaperSet', { daily: e.target.checked });
    $(p, '#topic').onchange = (e) => tk.call('wallpaperSet', { topic: e.target.value });
    $(p, '#dir').onclick = async () => tk.call('openPath', { path: (await tk.call('wallpaperGet')).dir });
    $(p, '#go').onclick = async () => {
      $(p, '#m').textContent = 'Downloading a new picture…'; $(p, '#go').disabled = true;
      const r = await tk.call('wallpaperNow', { topic: $(p, '#topic').value });
      $(p, '#go').disabled = false;
      if (r.error) { $(p, '#m').textContent = 'Could not change the wallpaper: ' + r.error; return; }
      $(p, '#m').textContent = 'Done! Your desktop has a new picture.'; show(r.file); tk.call('wallpaperSet', { last: Date.now() });
    };
  } });

// MARK: Send files over Wi-Fi (LocalSend-style)
tool({ id: 'send', name: 'Send Files (Wi-Fi)', icon: '📡', group: 'Safety & Files', desc: 'Send photos and files between your phone and computer on the same Wi-Fi',
  render(el) {
    head(el, this, 'No cable, no internet upload: files go straight over your Wi-Fi.');
    if (window.TK_PLATFORM !== 'desktop') {
      add(el, `<div class="panel"><b>How to send · কীভাবে পাঠাবেন</b><ol class="muted"><li>On your computer, open Jhuli → <b>Send Files (Wi-Fi)</b>.</li><li>Scan the QR code with this phone's camera (same Wi-Fi).</li><li>Choose photos or files to send, or download what the computer shares.</li></ol><p class="muted">কম্পিউটারে Jhuli খুলে “Send Files” চাপুন, তারপর ফোনের ক্যামেরা দিয়ে QR কোড স্ক্যান করুন।</p></div>`);
      return;
    }
    const p = add(el, `<div class="grid2"><div class="panel" style="text-align:center"><img id="qr" style="width:220px;height:220px;background:#fff;border-radius:12px"><p><b id="code"></b></p><p class="muted" id="url" style="word-break:break-all"></p><button id="nc">New code</button></div>
      <div class="panel"><b>From this computer</b><p class="muted">Choose files; they appear on the phone page to download.</p><button class="primary" id="share">📤 Share files…</button><div class="list" id="off" style="margin-top:10px"></div></div></div>
      <div class="panel"><div class="row"><b class="grow">Received · পাওয়া ফাইল</b><button id="open">Open folder</button></div><div class="list" id="rec"></div></div>`);
    const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const draw = (s) => {
      if (s.qr) $(p, '#qr').src = s.qr;
      $(p, '#code').textContent = 'Code ' + s.pin; $(p, '#url').textContent = s.url;
      $(p, '#off').innerHTML = s.offered.map((f) => `<div class="item"><span class="t">${esc(f.name)}</span><span class="muted">${kb(f.size)}</span><button data-id="${f.id}">✕</button></div>`).join('') || '<p class="muted">Nothing shared.</p>';
      $$(p, '#off [data-id]').forEach((b) => b.onclick = async () => draw(await tk.call('sendUnoffer', { id: b.dataset.id })));
      $(el, '#rec').innerHTML = s.received.map((f) => `<div class="item"><span class="t">${esc(f.name)}</span><span class="muted">${kb(f.size)} · ${new Date(f.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><button data-f="${esc(f.file)}">Show</button></div>`).join('') || '<p class="muted">Files sent from your phone appear here (saved in Downloads/Jhuli).</p>';
      $$(el, '#rec [data-f]').forEach((b) => b.onclick = () => tk.call('showFile', { file: b.dataset.f }));
    };
    tk.call('sendStart').then(draw);
    $(p, '#nc').onclick = async () => draw(await tk.call('sendNewCode'));
    $(p, '#share').onclick = async () => draw(await tk.call('sendOffer'));
    $(el, '#open').onclick = async () => tk.call('openPath', { path: (await tk.call('sendInfo')).dir });
    tk.onChange(async (what) => { if (what === 'send' && el.isConnected) draw(await tk.call('sendInfo')); });
  } });

// MARK: Video editor (trim, merge, caption, audio) — plays the clips onto a canvas
// and records the result, so it works in every browser without big downloads.
const videoType = () => ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
const waitEvent = (elm, ev) => new Promise((res, rej) => { elm.addEventListener(ev, res, { once: true }); elm.addEventListener('error', () => rej(new Error('Could not read this video')), { once: true }); });

// clips: [{ url, start, end }], opts: { caption, pos, size, color, audio: 'keep'|'mute'|'music', music: url, musicVol, height }
async function videoExport(clips, opts = {}, onProgress = () => {}) {
  if (!clips.length) throw new Error('Add a video first');
  const first = document.createElement('video'); first.src = clips[0].url; first.muted = true; await waitEvent(first, 'loadedmetadata');
  let W = first.videoWidth || 1280, H = first.videoHeight || 720;
  if (opts.height && H > opts.height) { W = Math.round(W * opts.height / H); H = opts.height; }
  W -= W % 2; H -= H % 2;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
  const silent = ac.createConstantSource(); const sg = ac.createGain(); sg.gain.value = 0; silent.connect(sg); sg.connect(dest); silent.start(); // keeps the audio track alive
  let music = null;
  if (opts.audio === 'music' && opts.music) {
    music = new Audio(opts.music); music.loop = true;
    const g = ac.createGain(); g.gain.value = opts.musicVol ?? 1; ac.createMediaElementSource(music).connect(g); g.connect(dest);
  }
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const type = videoType();
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 6e6 });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const total = clips.reduce((t, c) => t + Math.max(0.1, c.end - c.start), 0);
  let doneSec = 0;
  const caption = () => {
    if (!opts.caption) return;
    const size = Math.round(H * (opts.size || 0.07));
    ctx.font = `700 ${size}px system-ui, "Noto Sans Bengali", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = opts.pos === 'top' ? size * 1.2 : opts.pos === 'middle' ? H / 2 : H - size * 1.2;
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(opts.caption, W / 2, y, W * 0.92);
    ctx.fillStyle = opts.color || '#fff'; ctx.fillText(opts.caption, W / 2, y, W * 0.92);
  };
  rec.start(500);
  if (music) { music.currentTime = 0; await music.play().catch(() => {}); }
  for (const c of clips) {
    const v = document.createElement('video'); v.src = c.url; v.playsInline = true; v.preload = 'auto';
    await waitEvent(v, 'loadedmetadata');
    const g = ac.createGain(); g.gain.value = opts.audio === 'keep' || !opts.audio ? 1 : 0;
    try { ac.createMediaElementSource(v).connect(g); g.connect(dest); } catch {}
    v.currentTime = c.start || 0; await waitEvent(v, 'seeked');
    await v.play();
    await new Promise((resolve) => {
      const t = setInterval(() => {
        const vw = v.videoWidth || W, vh = v.videoHeight || H; const k = Math.min(W / vw, H / vh);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(v, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k);
        caption();
        onProgress(Math.min(1, (doneSec + Math.max(0, v.currentTime - c.start)) / total));
        if (v.ended || v.currentTime >= c.end) { clearInterval(t); v.pause(); resolve(); }
      }, 1000 / 30);
    });
    doneSec += Math.max(0.1, c.end - c.start);
  }
  if (music) music.pause();
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  silent.stop(); ac.close();
  onProgress(1);
  return new Blob(chunks, { type: rec.mimeType || 'video/webm' });
}

tool({ id: 'video', name: 'Video Editor', icon: '🎬', group: 'Media', desc: 'Trim and join clips, add a caption, mute or add music, save as MP4',
  render(el) {
    head(el, this, 'Simple video editing on your device — nothing is uploaded. Saving takes about as long as the video plays.');
    const p = add(el, `<div class="panel"><div class="row"><input type="file" id="f" accept="video/*" multiple hidden><button class="primary" id="addb">➕ Add videos</button><span class="muted">Clips are joined in this order. ক্লিপগুলো এই ক্রমে জোড়া লাগবে।</span></div><div id="clips" style="display:grid;gap:10px;margin-top:10px"></div></div>
      <div class="grid2"><div class="panel"><b>Caption · লেখা</b><input id="cap" style="width:100%;margin-top:8px" placeholder="Text on the video"><div class="row" style="margin-top:8px"><select id="pos"><option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option></select><select id="sz"><option value="0.05">Small</option><option value="0.07" selected>Medium</option><option value="0.1">Large</option></select><input type="color" id="col" value="#ffffff"></div></div>
      <div class="panel"><b>Sound · শব্দ</b><div class="row" style="margin-top:8px"><select id="aud"><option value="keep">Keep the sound</option><option value="mute">Mute</option><option value="music">Replace with music</option></select><input type="file" id="mus" accept="audio/*" hidden><button id="musb">🎵 Choose music</button><span class="muted" id="musn"></span></div><div class="row"><select id="hgt"><option value="0">Same size</option><option value="1080">1080p</option><option value="720" selected>720p</option><option value="480">480p (small file)</option></select></div></div></div>
      <div class="panel"><div class="row"><button class="primary big" id="go">💾 Make video</button><progress id="pr" max="1" value="0" style="flex:1;display:none"></progress><span class="muted" id="m"></span></div><video id="out" controls playsinline style="width:100%;max-height:50vh;margin-top:10px;display:none"></video></div>`);
    const clips = []; let musicUrl = null;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const draw = () => {
      const box = $(p, '#clips'); box.innerHTML = '';
      clips.forEach((c, i) => {
        const row = add(box, `<div class="item" style="flex-wrap:wrap;align-items:center"><video src="${c.url}" muted playsinline style="width:160px;max-height:90px;border-radius:8px;background:#000"></video>
          <div style="flex:1;min-width:200px"><b>${i + 1}. ${esc(c.name)}</b><div class="row"><label>Start <input type="number" step="0.1" min="0" data-k="start" value="${c.start.toFixed(1)}" style="width:80px"></label><label>End <input type="number" step="0.1" min="0" data-k="end" value="${c.end.toFixed(1)}" style="width:80px"></label><span class="muted">of ${fmt(c.dur)}</span></div></div>
          <button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button></div>`);
        $$(row, 'input').forEach((inp) => inp.onchange = () => { c[inp.dataset.k] = Math.min(c.dur, Math.max(0, +inp.value || 0)); if (c.end <= c.start) c.end = Math.min(c.dur, c.start + 0.5); draw(); });
        $$(row, '[data-a]').forEach((b) => b.onclick = () => { const a = b.dataset.a; if (a === 'del') clips.splice(i, 1); else { const j = a === 'up' ? i - 1 : i + 1; if (j >= 0 && j < clips.length) [clips[i], clips[j]] = [clips[j], clips[i]]; } draw(); });
      });
      if (!clips.length) box.innerHTML = '<p class="muted">No videos yet.</p>';
    };
    $(p, '#addb').onclick = () => $(p, '#f').click();
    $(p, '#f').onchange = async (e) => {
      for (const f of e.target.files) {
        const url = URL.createObjectURL(f); const v = document.createElement('video'); v.src = url; v.muted = true;
        try { await waitEvent(v, 'loadedmetadata'); } catch { toast('Could not open ' + f.name); continue; }
        const dur = Number.isFinite(v.duration) ? v.duration : 60;
        clips.push({ url, name: f.name, dur, start: 0, end: dur });
      }
      e.target.value = ''; draw();
    };
    $(p, '#musb').onclick = () => $(p, '#mus').click();
    $(p, '#mus').onchange = (e) => { const f = e.target.files[0]; if (!f) return; musicUrl = URL.createObjectURL(f); $(p, '#musn').textContent = f.name; $(p, '#aud').value = 'music'; };
    $(p, '#go').onclick = async () => {
      if (!clips.length) return toast('Add a video first');
      $(p, '#go').disabled = true; $(p, '#pr').style.display = ''; $(p, '#m').textContent = 'Making your video…';
      try {
        const blob = await videoExport(clips, { caption: $(p, '#cap').value.trim(), pos: $(p, '#pos').value, size: +$(p, '#sz').value, color: $(p, '#col').value, audio: $(p, '#aud').value, music: musicUrl, height: +$(p, '#hgt').value }, (x) => { $(p, '#pr').value = x; });
        const out = $(p, '#out'); out.src = URL.createObjectURL(blob); out.style.display = '';
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        await tk.call('saveVideo', { name: `Jhuli video ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, dataUrl });
        $(p, '#m').textContent = `Saved (${(blob.size / 1048576).toFixed(1)} MB, ${ext.toUpperCase()})`;
      } catch (err) { $(p, '#m').textContent = 'Could not make the video: ' + err.message; }
      $(p, '#go').disabled = false; $(p, '#pr').style.display = 'none';
    };
    draw();
  } });

// MARK: Audio recorder with level meter, mic choice, gain and noise reduction
// Records from a microphone through optional clean-up into an audio file.
async function audioChain(deviceId, clean, gainValue) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, noiseSuppression: clean, echoCancellation: clean, autoGainControl: false } });
  const ac = new AudioContext();
  const src = ac.createMediaStreamSource(stream);
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = clean ? 90 : 10; // removes rumble and hum
  const gain = ac.createGain(); gain.gain.value = gainValue;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4; // stops loud peaks from clipping
  const meter = ac.createAnalyser(); meter.fftSize = 1024;
  const dest = ac.createMediaStreamDestination();
  src.connect(hp); hp.connect(gain); gain.connect(comp); comp.connect(meter); comp.connect(dest);
  return { stream, ac, gain, meter, dest, close() { stream.getTracks().forEach((t) => t.stop()); ac.close(); } };
}
const audioType = () => ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
function audioLevel(meter) { const d = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(d); let peak = 0; for (const x of d) peak = Math.max(peak, Math.abs(x)); return peak; }

tool({ id: 'voice', name: 'Audio Recorder', icon: '🎙', group: 'Media', desc: 'Record clear voice and sound: level meter, mic choice, volume boost, noise reduction',
  render(el) {
    head(el, this, 'Pick your microphone, watch the level meter (keep it out of the red), then record. Files are saved where you choose.');
    const p = add(el, `<div class="panel"><div class="row"><div class="field grow"><label>Microphone</label><select id="mic"><option value="">Default microphone</option></select></div><div class="field"><label>Volume boost <span id="gv">100%</span></label><input type="range" id="gain" min="50" max="400" value="100"></div><label class="row check"><input type="checkbox" id="clean" checked> Reduce noise</label></div>
      <div style="height:18px;border-radius:9px;background:var(--line, #8883);overflow:hidden;margin:12px 0"><div id="lvl" style="height:100%;width:0;background:linear-gradient(90deg,#22c55e 0 70%,#eab308 70% 88%,#ef4444 88%);transition:width .06s"></div></div>
      <div style="text-align:center"><div class="big-num" id="t">00:00</div><div class="row" style="justify-content:center;margin-top:8px"><button class="primary big" id="go">🎙 Record</button></div><p class="muted" id="m"></p></div></div><div class="list" id="l"></div>`);
    let chain = null, rec = null, startAt = 0, raf = 0, timer = 0;
    const clips = [];
    const meterLoop = () => { if (chain) { $(p, '#lvl').style.width = Math.min(100, audioLevel(chain.meter) * 110) + '%'; } raf = requestAnimationFrame(meterLoop); };
    const open = async () => {
      if (chain) chain.close();
      try {
        chain = await audioChain($(p, '#mic').value, $(p, '#clean').checked, +$(p, '#gain').value / 100);
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        const cur = $(p, '#mic').value;
        $(p, '#mic').innerHTML = devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Microphone ' + (i + 1))}</option>`).join('');
        if (cur) $(p, '#mic').value = cur;
        $(p, '#m').textContent = '';
      } catch { $(p, '#m').textContent = 'Microphone not available. Allow microphone access and try again.'; chain = null; }
    };
    const drawList = () => {
      $(el, '#l').innerHTML = '';
      clips.forEach((c) => { const it = add($(el, '#l'), `<div class="item"><audio controls src="${c.url}" style="flex:1"></audio><span class="muted">${c.len}</span><button>💾 Save</button></div>`); it.querySelector('button').onclick = () => tk.call('saveVideo', { name: c.name, dataUrl: c.data }); });
    };
    $(p, '#gain').oninput = (e) => { $(p, '#gv').textContent = e.target.value + '%'; if (chain) chain.gain.gain.value = e.target.value / 100; };
    $(p, '#mic').onchange = open; $(p, '#clean').onchange = open;
    $(p, '#go').onclick = async () => {
      if (rec) { rec.stop(); return; }
      if (!chain) await open(); if (!chain) return;
      const type = audioType();
      rec = new MediaRecorder(chain.dest.stream, type ? { mimeType: type, audioBitsPerSecond: 160000 } : undefined);
      const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        clearInterval(timer);
        const blob = new Blob(chunks, { type: rec.mimeType }); const len = $(p, '#t').textContent;
        const fr = new FileReader(); fr.onload = () => { clips.unshift({ url: URL.createObjectURL(blob), data: fr.result, len, name: `Audio ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${rec.mimeType.includes('mp4') ? 'm4a' : 'webm'}` }); rec = null; $(p, '#go').textContent = '🎙 Record'; drawList(); };
        fr.readAsDataURL(blob);
      };
      rec.start(500); startAt = Date.now(); $(p, '#go').textContent = '⏹ Stop';
      timer = setInterval(() => { const s = Math.floor((Date.now() - startAt) / 1000); $(p, '#t').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 250);
    };
    open(); meterLoop();
    return () => { if (rec && rec.state !== 'inactive') rec.stop(); cancelAnimationFrame(raf); clearInterval(timer); setTimeout(() => chain && chain.close(), 600); };
  } });

trayUpdate();
