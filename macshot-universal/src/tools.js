// MacShot Tools window: clipboard history, quick notes, timer and stopwatch, QR codes,
// text from images (OCR), colours and an image converter.
const $ = (sel) => document.querySelector(sel);
const api = window.macshot;
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const isMac = navigator.userAgent.includes('Mac');

// Windows and Linux show "Alt+Shift+" instead of the Mac key symbols.
if (!isMac) for (const k of document.querySelectorAll('kbd')) k.textContent = k.textContent.replace('⌥⇧', 'Alt+Shift+');

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return new Date(t).toLocaleDateString();
}
const stampName = () => new Date().toISOString().slice(0, 19).replace('T', ' at ').replace(/:/g, '.');

// MARK: Tabs

function showTab(name) {
  if (!document.getElementById(name)) name = 'clipboard';
  for (const s of document.querySelectorAll('section')) s.classList.toggle('on', s.id === name);
  for (const b of document.querySelectorAll('nav [data-tab]')) b.classList.toggle('on', b.dataset.tab === name);
  api.call('tab-shown', name);
  if (name === 'clipboard') { renderClips(); setTimeout(() => $('#clipSearch').focus(), 50); }
  if (name === 'notes') setTimeout(() => $('#noteText').focus(), 50);
  if (name === 'qr') qrFromClipboardIfEmpty();
  if (name === 'colors') loadColors();
}
for (const b of document.querySelectorAll('nav [data-tab]')) b.onclick = () => showTab(b.dataset.tab);
api.on('tab', showTab);
$('#goAnnotate').onclick = () => api.call('capture-annotate');
$('#goAnnotateLast').onclick = () => api.call('annotate-open');

// MARK: Clipboard history

let clips = [];
let clipSel = 0;
async function loadClips() {
  const data = await api.call('clips');
  clips = data.clips; $('#clipPause').checked = data.paused;
  renderClips();
}
function visibleClips() {
  const q = $('#clipSearch').value.trim().toLowerCase();
  return q ? clips.filter((c) => c.type === 'text' && c.text.toLowerCase().includes(q)) : clips;
}
function renderClips() {
  const list = visibleClips();
  clipSel = Math.min(clipSel, Math.max(0, list.length - 1));
  $('#clipList').innerHTML = list.length ? list.map((c, i) => `
    <div class="clip${i === clipSel ? ' sel' : ''}" data-id="${c.id}">
      <div class="body">${c.type === 'text' ? `<div class="txt">${esc(c.text.slice(0, 600))}</div>` : `<img src="${c.thumb}" alt="">`}
        <div class="meta">${c.pinned ? '<span class="pinned">📌 pinned · </span>' : ''}${c.type === 'image' ? `picture ${c.width}×${c.height} · ` : `${c.text.length} characters · `}${ago(c.time)}</div></div>
      <div class="acts"><button class="small" data-act="pin" title="Pin">${c.pinned ? 'Unpin' : '📌'}</button><button class="small danger" data-act="delete" title="Delete">✕</button></div>
    </div>`).join('') : `<div class="empty">${clips.length ? 'Nothing matches.' : 'Copy some text or a picture and it shows up here.'}</div>`;
}
async function copyClip(id) {
  if (await api.call('clip-copy', id)) toast('Copied ✓');
}
$('#clipList').onclick = async (e) => {
  const row = e.target.closest('.clip'); if (!row) return;
  const act = e.target.dataset.act;
  if (act === 'pin') return api.call('clip-pin', row.dataset.id);
  if (act === 'delete') return api.call('clip-delete', row.dataset.id);
  copyClip(row.dataset.id);
};
$('#clipSearch').oninput = () => { clipSel = 0; renderClips(); };
$('#clipSearch').onkeydown = (e) => {
  const list = visibleClips();
  if (e.key === 'ArrowDown') { clipSel = Math.min(list.length - 1, clipSel + 1); renderClips(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { clipSel = Math.max(0, clipSel - 1); renderClips(); e.preventDefault(); }
  if (e.key === 'Enter' && list[clipSel]) copyClip(list[clipSel].id);
  const sel = $('#clipList .sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
};
$('#clipClear').onclick = () => { if (confirm('Clear the clipboard history? Pinned items stay.')) api.call('clip-clear'); };
$('#clipPause').onchange = (e) => api.call('clip-pause', e.target.checked);
api.on('clips-changed', loadClips);
setInterval(() => { if ($('#clipboard').classList.contains('on')) renderClips(); }, 30000); // refresh "x min ago"

// MARK: Quick notes

let notes = [];
let noteId = null;
let saveTimer = null;
const noteTitle = (n) => (n.text.trim().split('\n')[0] || 'Empty note').slice(0, 60);
async function loadNotes() {
  notes = await api.call('notes-load');
  if (!notes.length) notes = [{ id: Date.now().toString(36), text: '', updated: Date.now() }];
  noteId = notes[0].id;
  renderNotes(); $('#noteText').value = currentNote().text;
}
const currentNote = () => notes.find((n) => n.id === noteId) || notes[0];
function renderNotes() {
  const q = $('#noteSearch').value.trim().toLowerCase();
  const list = notes.filter((n) => !q || n.text.toLowerCase().includes(q)).sort((a, b) => b.updated - a.updated);
  $('#noteList').innerHTML = list.map((n) => `<div data-id="${n.id}" class="${n.id === noteId ? 'on' : ''}"><b>${esc(noteTitle(n))}</b><small>${ago(n.updated)}</small></div>`).join('')
    || '<div class="muted">No notes</div>';
}
function saveNotesSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => api.call('notes-save', notes), 400); }
$('#noteText').oninput = () => { const n = currentNote(); n.text = $('#noteText').value; n.updated = Date.now(); renderNotes(); saveNotesSoon(); };
$('#noteList').onclick = (e) => { const d = e.target.closest('[data-id]'); if (!d) return; noteId = d.dataset.id; $('#noteText').value = currentNote().text; renderNotes(); $('#noteText').focus(); };
$('#noteNew').onclick = () => { const n = { id: Date.now().toString(36), text: '', updated: Date.now() }; notes.unshift(n); noteId = n.id; $('#noteText').value = ''; renderNotes(); saveNotesSoon(); $('#noteText').focus(); };
$('#noteDelete').onclick = () => {
  const n = currentNote();
  if (n.text.trim() && !confirm(`Delete the note "${noteTitle(n)}"?`)) return;
  notes = notes.filter((x) => x !== n);
  if (!notes.length) notes = [{ id: Date.now().toString(36), text: '', updated: Date.now() }];
  noteId = notes[0].id; $('#noteText').value = currentNote().text; renderNotes(); saveNotesSoon();
};
$('#noteCopy').onclick = () => { api.call('copy-text', $('#noteText').value); toast('Note copied ✓'); };
$('#noteSearch').oninput = renderNotes;

// MARK: Timer and stopwatch

const two = (n) => String(Math.floor(n)).padStart(2, '0');
function fmt(ms, tenths) {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60;
  return (h ? two(h) + ':' : '') + two(m) + ':' + two(s) + (tenths ? '.' + Math.floor(t / 100) % 10 : '');
}
const timer = { end: 0, left: 0, running: false, done: false, onDone: null };
const inputMs = () => ((+$('#tH').value || 0) * 3600 + (+$('#tM').value || 0) * 60 + (+$('#tS').value || 0)) * 1000;
function timerShow() {
  const left = timer.running ? timer.end - Date.now() : (timer.left || inputMs());
  $('#tClock').textContent = fmt(timer.running ? left + 999 : left);
  $('#tClock').classList.toggle('done', timer.done);
  $('#tStart').textContent = timer.running ? 'Pause' : (timer.left ? 'Resume' : 'Start');
  document.title = timer.running ? `⏱ ${fmt(left + 999)} · MacShot Tools` : 'MacShot Tools';
}
function beep() {
  try {
    const ac = new AudioContext();
    [0, 0.35, 0.7, 1.05].forEach((t) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.25);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.3);
    });
    setTimeout(() => ac.close(), 2000);
  } catch {}
}
function timerStart(ms) {
  timer.done = false;
  if (timer.running) { timer.left = timer.end - Date.now(); timer.running = false; return timerShow(); }
  const total = ms || timer.left || inputMs();
  if (total <= 0) return;
  timer.end = Date.now() + total; timer.left = 0; timer.running = true; timerShow();
}
setInterval(() => {
  if (timer.running && Date.now() >= timer.end) {
    timer.running = false; timer.left = 0; timer.done = true;
    const label = $('#tLabel').value.trim();
    if (!TEST) beep();
    api.call('notify', '⏰ Time is up', label || 'Your MacShot timer has finished.');
    if (timer.onDone) { timer.onDone(); timer.onDone = null; }
  }
  timerShow();
  swShow();
}, 100);
$('#tStart').onclick = () => timerStart();
$('#tReset').onclick = () => { timer.running = false; timer.left = 0; timer.done = false; timerShow(); };
for (const id of ['#tH', '#tM', '#tS']) $(id).oninput = () => { if (!timer.running) { timer.left = 0; timer.done = false; timerShow(); } };
for (const m of [1, 3, 5, 10, 15, 25, 30, 60]) {
  const b = document.createElement('button'); b.className = 'small'; b.textContent = m < 60 ? m + ' min' : '1 hour';
  b.onclick = () => { $('#tH').value = Math.floor(m / 60); $('#tM').value = m % 60; $('#tS').value = 0; timer.running = false; timer.left = 0; timerStart(); };
  $('#presets').appendChild(b);
}
const sw = { start: 0, acc: 0, running: false, laps: [] };
const swNow = () => sw.acc + (sw.running ? Date.now() - sw.start : 0);
function swShow() { $('#sClock').textContent = fmt(swNow(), true); $('#sStart').textContent = sw.running ? 'Stop' : (sw.acc ? 'Resume' : 'Start'); }
$('#sStart').onclick = () => { if (sw.running) { sw.acc = swNow(); sw.running = false; } else { sw.start = Date.now(); sw.running = true; } swShow(); };
$('#sLap').onclick = () => {
  if (!sw.running) return;
  const now = swNow(); const prev = sw.laps.length ? sw.laps[0].at : 0;
  sw.laps.unshift({ at: now, lap: now - prev });
  $('#laps').innerHTML = sw.laps.map((l, i) => `<div><span>Lap ${sw.laps.length - i}</span><span>${fmt(l.lap, true)}</span><span class="muted">${fmt(l.at, true)}</span></div>`).join('');
};
$('#sReset').onclick = () => { Object.assign(sw, { start: 0, acc: 0, running: false, laps: [] }); $('#laps').innerHTML = ''; swShow(); };

// MARK: QR code

let qrTimer;
async function makeQR() {
  const text = $('#qrText').value;
  const c = $('#qrCanvas');
  $('#qrOut').style.display = text.trim() ? '' : 'none';
  if (!text.trim()) return false;
  await window.QRCode.toCanvas(c, text, { width: +$('#qrSize').value, margin: 2, errorCorrectionLevel: 'M' });
  c.style.width = Math.min(+$('#qrSize').value, 384) + 'px';
  return true;
}
$('#qrText').oninput = () => { clearTimeout(qrTimer); qrTimer = setTimeout(() => makeQR().catch((e) => toast(e.message)), 150); };
$('#qrSize').onchange = () => makeQR();
$('#qrPaste').onclick = async () => { $('#qrText').value = await api.call('read-clipboard-text'); makeQR(); };
async function qrFromClipboardIfEmpty() {
  if ($('#qrText').value.trim()) return;
  const t = (await api.call('read-clipboard-text')).trim();
  if (t && t.length < 1500) { $('#qrText').value = t; makeQR(); }
}
$('#qrCopy').onclick = async () => { if (await makeQR()) { await api.call('copy-image', $('#qrCanvas').toDataURL()); toast('QR picture copied ✓'); } };
$('#qrSave').onclick = async () => {
  if (!(await makeQR())) return;
  const blob = await new Promise((r) => $('#qrCanvas').toBlob(r, 'image/png'));
  const file = await api.call('save-picture', `QR ${stampName()}.png`, new Uint8Array(await blob.arrayBuffer()));
  api.call('show-file', file);
};
const wifiEsc = (s) => s.replace(/([\;,:"])/g, '\\$1');
$('#wifiMake').onclick = () => {
  const name = $('#wifiName').value.trim(); if (!name) return toast('Type the Wi-Fi name');
  const pass = $('#wifiPass').value;
  $('#qrText').value = `WIFI:T:${pass ? 'WPA' : 'nopass'};S:${wifiEsc(name)};P:${wifiEsc(pass)};;`;
  makeQR();
};

// MARK: Text from image (OCR). The reader loads once; language data downloads once.

const workers = {};
async function ocrWorker(lang) {
  if (!workers[lang]) {
    const base = new URL('vendor/tesseract/', location.href).href;
    workers[lang] = window.Tesseract.createWorker(lang, 1, {
      workerPath: base + 'worker.min.js', corePath: base, workerBlobURL: false,
      logger: (m) => { if (m.status) $('#ocrStatus').textContent = `${m.status[0].toUpperCase() + m.status.slice(1)}… ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`; },
    }).catch((err) => { delete workers[lang]; throw err; });
  }
  return workers[lang];
}
let ocrBusy = false;
async function readText(src, autoCopy) {
  if (ocrBusy) return null;
  ocrBusy = true;
  $('#ocrImageBox').innerHTML = `<img src="${src}" alt="">`;
  $('#ocrText').value = '';
  $('#ocrStatus').textContent = 'Reading…';
  try {
    const worker = await ocrWorker($('#ocrLang').value);
    const { data } = await worker.recognize(src);
    const text = data.text.replace(/\n{3,}/g, '\n\n').trim();
    $('#ocrText').value = text;
    if (!text) $('#ocrStatus').textContent = 'No text found in this picture.';
    else if (autoCopy) { await api.call('copy-text', text); $('#ocrStatus').textContent = `Copied ✓  ${text.length} characters are on the clipboard.`; }
    else $('#ocrStatus').textContent = `Done: ${text.length} characters.`;
    return text;
  } catch (err) {
    $('#ocrStatus').textContent = 'Could not read the text: ' + (err && err.message ? err.message : err) + ' (the first time needs the internet to download the language).';
    return null;
  } finally { ocrBusy = false; }
}
api.on('ocr-image', (dataURL) => { showTab('ocr'); readText(dataURL, true); });
$('#ocrScreen').onclick = () => api.call('read-screen-text');
$('#ocrOpen').onclick = () => $('#ocrFile').click();
$('#ocrFile').onchange = (e) => { const f = e.target.files[0]; if (f) fileToDataURL(f).then((u) => readText(u, false)); e.target.value = ''; };
$('#ocrCopy').onclick = () => { api.call('copy-text', $('#ocrText').value); toast('Text copied ✓'); };
$('#ocrLang').onchange = () => { const img = $('#ocrImageBox img'); if (img) readText(img.src, false); };
const ocrBox = $('#ocr');
ocrBox.ondragover = (e) => e.preventDefault();
ocrBox.ondrop = (e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) fileToDataURL(f).then((u) => readText(u, false)); };

function fileToDataURL(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
}

// MARK: Colours

let colors = [];
function rgbOf(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hslOf([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}
async function loadColors() { colors = await api.call('colors-load'); renderColors(); }
function renderColors() {
  $('#swatches').innerHTML = colors.length ? colors.map((hex) => {
    const rgb = rgbOf(hex);
    return `<div class="sw"><div class="chip" style="background:${hex}"></div><div class="vals">
      <span data-copy="${hex}">${hex} <small>copy</small></span>
      <span data-copy="rgb(${rgb.join(', ')})">rgb(${rgb.join(', ')}) <small>copy</small></span>
      <span data-copy="${hslOf(rgb)}">${hslOf(rgb)} <small>copy</small></span>
      <span data-del="${hex}" class="muted">remove</span></div></div>`;
  }).join('') : '<div class="empty">No colours yet. Press Pick from Screen.</div>';
}
$('#swatches').onclick = (e) => {
  const t = e.target.closest('[data-copy],[data-del]'); if (!t) return;
  if (t.dataset.copy) { api.call('copy-text', t.dataset.copy); toast(t.dataset.copy + ' copied ✓'); }
  else { colors = colors.filter((c) => c !== t.dataset.del); api.call('colors-save', colors); renderColors(); }
};
$('#colorPick').onclick = () => api.call('pick-color');
$('#colorInput').onchange = (e) => { const hex = e.target.value.toUpperCase(); colors = [hex, ...colors.filter((c) => c !== hex)]; api.call('colors-save', colors); renderColors(); };
$('#colorClear').onclick = () => { if (confirm('Remove all colours?')) { colors = []; api.call('colors-save', colors); renderColors(); } };
api.on('colors-changed', loadColors);

// MARK: Image converter

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
async function convertOne(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('not a picture')); i.src = url; });
    const size = $('#convSize').value;
    let k = 1;
    if (size.startsWith('w')) k = Math.min(1, Number(size.slice(1)) / img.naturalWidth); else k = Number(size);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const x = c.getContext('2d');
    const type = $('#convFormat').value;
    if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } // JPG has no see-through parts
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, type, Math.min(1, Math.max(0.1, +$('#convQuality').value / 100))));
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + EXT[type];
    const saved = await api.call('save-picture', name, new Uint8Array(await blob.arrayBuffer()), 'converted');
    return { name, saved, before: file.size, after: blob.size, w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
async function convertFiles(files) {
  for (const f of files) {
    const row = document.createElement('div'); row.className = 'out'; row.textContent = `${f.name} …`;
    $('#convOut').prepend(row);
    try {
      const r = await convertOne(f);
      row.innerHTML = `<span>${esc(f.name)} → <b>${esc(r.saved.split(/[\\/]/).pop())}</b> <span class="muted">${r.w}×${r.h}, ${kb(r.before)} → ${kb(r.after)}</span></span>`;
      const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Show'; b.onclick = () => api.call('show-file', r.saved); row.appendChild(b);
    } catch (err) { row.textContent = `${f.name}: could not convert (${err.message})`; }
  }
}
const drop = $('#drop');
drop.onclick = () => $('#convFiles').click();
$('#convFiles').onchange = (e) => { convertFiles([...e.target.files]); e.target.value = ''; };
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); convertFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); };
$('#convOpen').onclick = () => api.call('open-folder', 'converted');

// MARK: Start

loadClips(); loadNotes(); loadColors(); timerShow(); swShow();
showTab(params.get('tab') || 'clipboard');

// Self-test (MacShot --test): checks each tool on this page and reports back.
async function selfTest() {
  const out = {};
  const check = async (name, fn) => {
    try { const info = await fn(); out[name] = { ok: !!info, info: typeof info === 'string' ? info : '' }; }
    catch (err) { out[name] = { ok: false, info: String(err && err.message || err) }; }
  };
  await check('qr', async () => {
    $('#qrText').value = 'https://github.com/niloyify/macshot'; await makeQR();
    const c = $('#qrCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++;
    return dark > 1000 && `${c.width}px, ${dark} dark pixels`;
  });
  await check('ocr', async () => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 200;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 200);
    x.fillStyle = '#000'; x.font = '64px Arial, Helvetica, sans-serif'; x.fillText('Hello MacShot 2026', 30, 120);
    const text = await readText(c.toDataURL(), false);
    return /hello\s+macshot/i.test(text || '') && JSON.stringify(text);
  });
  await check('converter', async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const x = c.getContext('2d'); x.fillStyle = '#0A84FF'; x.fillRect(0, 0, 640, 480);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    $('#convFormat').value = 'image/webp'; $('#convSize').value = '0.5';
    const r = await convertOne(new File([blob], 'MacShot test.png', { type: 'image/png' }));
    return r.w === 320 && r.after > 0 && `${r.saved} ${r.w}×${r.h} ${r.after} bytes`;
  });
  await check('notes', async () => {
    const before = await api.call('notes-load');
    await api.call('notes-save', [...before, { id: 'test', text: 'MacShot note test', updated: Date.now() }]);
    const after = await api.call('notes-load');
    await api.call('notes-save', before); // put the user's notes back
    return after.some((n) => n.id === 'test') && `${before.length} notes kept`;
  });
  await check('timer', () => new Promise((resolve) => {
    const t0 = Date.now();
    timer.onDone = () => resolve(`finished after ${Date.now() - t0} ms`);
    timerStart(1500);
    setTimeout(() => resolve(false), 6000);
  }));
  await check('stopwatch', async () => {
    $('#sStart').click(); await new Promise((r) => setTimeout(r, 600)); $('#sLap').click(); $('#sStart').click();
    const t = swNow(); $('#sReset').click();
    return t >= 550 && `${t} ms`;
  });
  api.call('test-done', out);
}
if (TEST) setTimeout(selfTest, 500);
