// MacShot (universal): screenshots, screen recording, sound recording and everyday
// tools for Windows, macOS and Linux. Lives in the system tray (menu bar on macOS);
// the tray icon is a pair of eyes that turns red while recording.
//
//   Alt+Shift+1  capture an area (drag a rectangle)
//   Alt+Shift+2  copy text from the screen (OCR)
//   Alt+Shift+3  capture the whole screen
//   Alt+Shift+4  capture an area and draw on it (annotate)
//   Alt+Shift+5  start / stop screen recording
//   Alt+Shift+6  start / stop sound recording (microphone only)
//   Alt+Shift+C  pick a colour from the screen
//   Alt+Shift+V  clipboard history
//   Alt+Shift+N  quick notes
//   Alt+Shift+T  timer and stopwatch
//   Alt+Shift+Q  QR code
//   Alt+Shift+M  all MacShot tools
//
// Screenshots: PNG in Pictures/MacShot, also copied to the clipboard.
// Recordings:  Videos/MacShot (Movies/MacShot on macOS).

const {
  app, BrowserWindow, Tray, Menu, globalShortcut, desktopCapturer, screen,
  clipboard, shell, ipcMain, nativeImage, session, Notification, dialog, systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');

const shotsDir = path.join(app.getPath('pictures'), 'MacShot');
const convertedDir = path.join(shotsDir, 'Converted');
const videosDir = path.join(app.getPath('videos'), 'MacShot');
const dataDir = () => app.getPath('userData');
const TEST = () => !!process.env.MACSHOT_TEST;

let tray = null;
let quitting = false;
let paused = false; // clipboard history paused
let lastTab = 'clipboard';
let lastShot = null; // newest screenshot file, for "Annotate Last Screenshot"

// One state object per kind of recording, so screen and sound can run together.
const rec = {
  screen: { on: false, win: null, file: null, stream: null, done: null },
  sound: { on: false, win: null, file: null, stream: null, done: null },
};
const anyRecording = () => rec.screen.on || rec.sound.on;

// Only one copy of MacShot at a time.
if (!app.requestSingleInstanceLock()) app.quit();

const icon = (name) => nativeImage.createFromPath(path.join(__dirname, 'icons', name));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const preload = path.join(__dirname, 'preload.js');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
}

// Small JSON files in the app's data folder (clipboard history, notes, colours).
function loadJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir(), name), 'utf8')); } catch { return fallback; }
}
function saveJSON(name, value) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const file = path.join(dataDir(), name);
  fs.writeFileSync(file + '.tmp', JSON.stringify(value));
  fs.renameSync(file + '.tmp', file);
}

// The display under the mouse pointer, so multi-screen setups capture the right one.
const currentDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

async function screenSourceFor(display, thumbnailSize = { width: 0, height: 0 }) {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  return sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
}

// A full-resolution picture of one display.
async function grabDisplay(display) {
  const size = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
  // The first capture after start can come back empty (seen on macOS), so try a few times.
  let source = null;
  for (let i = 0; i < 4 && (!source || source.thumbnail.isEmpty()); i++) {
    if (i) await wait(200);
    source = await screenSourceFor(display, size);
  }
  if (!source || source.thumbnail.isEmpty()) throw new Error('The screen could not be captured.');
  return source.thumbnail;
}

function saveImage(image, prefix = 'Screenshot') {
  fs.mkdirSync(shotsDir, { recursive: true });
  const file = path.join(shotsDir, `${prefix} ${stamp()}.png`);
  fs.writeFileSync(file, image.toPNG());
  clipboard.writeImage(image);
  lastShot = file;
  notify(`${prefix} saved`, `${path.basename(file)} (also copied to the clipboard)`);
  return file;
}

// A full-screen window over one display, used by the area picker and the colour picker.
function overlayWindow(display, page, query) {
  const { x, y, width, height } = display.bounds;
  const clear = page === 'area.html';
  const win = new BrowserWindow({
    x, y, width, height, frame: false, transparent: clear, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, enableLargerThanScreen: true,
    fullscreenable: false, show: false, backgroundColor: clear ? '#00000000' : '#000000',
    webPreferences: { preload },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, page), { query });
  return win;
}

function focusApp() {
  if (process.platform === 'darwin') app.focus({ steal: true });
}

// MARK: Screenshots

async function captureFull() {
  try {
    await wait(300); // let the tray menu close so it is not in the picture
    return saveImage(await grabDisplay(currentDisplay()));
  } catch (err) {
    showPermissionHelp(err);
    return null;
  }
}

let areaWin = null;
let areaResolve = null;

// Freezes the screen under the pointer, lets the user drag a rectangle and returns that
// part of the picture (or null when cancelled). `mode` only changes the hint text.
async function pickArea(mode = 'shot') {
  if (areaWin) return null;
  await wait(300);
  const display = currentDisplay();
  const picture = await grabDisplay(display); // taken before the picker appears
  const { width } = display.bounds;
  try {
    areaWin = overlayWindow(display, 'area.html', { mode });
    areaWin.once('ready-to-show', () => {
      areaWin.show(); areaWin.focus();
      // Self-test picks a fixed 400 × 300 area by itself.
      if (TEST()) setTimeout(() => areaResolve && areaResolve({ x: 100, y: 100, width: 400, height: 300 }), 800);
    });
    const rect = await new Promise((resolve) => {
      areaResolve = resolve;
      areaWin.on('closed', () => resolve(null));
    });
    if (!rect) return null;
    const s = picture.getSize().width / width; // pixels per screen point
    return picture.crop({
      x: Math.round(rect.x * s), y: Math.round(rect.y * s),
      width: Math.round(rect.width * s), height: Math.round(rect.height * s),
    });
  } finally {
    if (areaWin && !areaWin.isDestroyed()) areaWin.destroy();
    areaWin = null; areaResolve = null;
  }
}

ipcMain.handle('area-picked', (_e, rect) => { if (areaResolve) areaResolve(rect); areaResolve = null; });

async function captureArea() {
  try {
    const image = await pickArea('shot');
    return image ? saveImage(image) : null;
  } catch (err) { showPermissionHelp(err); return null; }
}

// Alt+Shift+2: choose an area, MacShot reads the text in it and copies it.
async function captureText() {
  try {
    const image = await pickArea('text');
    if (!image) { if (toolsWin && !toolsWin.isDestroyed() && lastTab === 'ocr') toolsWin.show(); return; }
    const win = openTools('ocr');
    const send = () => win.webContents.send('ocr-image', image.toDataURL());
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
  } catch (err) { showPermissionHelp(err); }
}

// Alt+Shift+4: choose an area and draw on it.
async function captureAnnotate() {
  try {
    const image = await pickArea('annotate');
    if (image) openAnnotate(image);
  } catch (err) { showPermissionHelp(err); }
}

function annotateLast() {
  let file = lastShot && fs.existsSync(lastShot) ? lastShot : null;
  if (!file) {
    try {
      file = fs.readdirSync(shotsDir).filter((f) => f.endsWith('.png'))
        .map((f) => path.join(shotsDir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    } catch {}
  }
  if (!file) {
    const picked = dialog.showOpenDialogSync({
      title: 'Choose a picture to annotate', properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    file = picked && picked[0];
  }
  if (file) openAnnotate(nativeImage.createFromPath(file));
}

// MARK: Annotate window

let annotateWin = null;
function openAnnotate(image) {
  if (image.isEmpty()) return null;
  const dataURL = image.toDataURL();
  const { width, height } = image.getSize();
  const display = currentDisplay();
  const area = display.workArea;
  const w = Math.min(area.width - 40, Math.max(760, Math.round(width / display.scaleFactor) + 40));
  const h = Math.min(area.height - 40, Math.max(540, Math.round(height / display.scaleFactor) + 120));
  if (annotateWin && !annotateWin.isDestroyed()) annotateWin.destroy();
  const win = new BrowserWindow({
    width: w, height: h, title: 'MacShot Annotate', show: false, backgroundColor: '#1e1f22',
    webPreferences: { preload },
  });
  annotateWin = win;
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'annotate.html'), { query: TEST() ? { test: '1' } : {} });
  win.webContents.once('did-finish-load', () => win.webContents.send('annotate-image', dataURL, display.scaleFactor));
  win.once('ready-to-show', () => { win.show(); focusApp(); });
  win.on('closed', () => { if (annotateWin === win) annotateWin = null; });
  return win;
}

// MARK: Colour picker

let pickerWin = null;
let pickerResolve = null;

async function pickColor() {
  if (pickerWin) return null;
  try {
    await wait(300);
    const display = currentDisplay();
    const picture = await grabDisplay(display);
    pickerWin = overlayWindow(display, 'picker.html', TEST() ? { test: '1' } : {});
    pickerWin.webContents.once('did-finish-load', () => pickerWin.webContents.send('picker-image', picture.toDataURL()));
    pickerWin.once('ready-to-show', () => { pickerWin.show(); pickerWin.focus(); });
    const hex = await new Promise((resolve) => {
      pickerResolve = resolve;
      pickerWin.on('closed', () => resolve(null));
    });
    if (!hex) return null;
    clipboard.writeText(hex);
    const colors = [hex, ...loadJSON('colors.json', []).filter((c) => c !== hex)].slice(0, 40);
    saveJSON('colors.json', colors);
    if (toolsWin && !toolsWin.isDestroyed()) toolsWin.webContents.send('colors-changed');
    notify('Colour copied', `${hex} is on the clipboard`);
    return hex;
  } catch (err) {
    showPermissionHelp(err);
    return null;
  } finally {
    if (pickerWin && !pickerWin.isDestroyed()) pickerWin.destroy();
    pickerWin = null; pickerResolve = null;
  }
}

ipcMain.handle('color-picked', (_e, hex) => { if (pickerResolve) pickerResolve(hex); pickerResolve = null; });

// MARK: Clipboard history

const MAX_TEXT = 100;
const MAX_IMAGES = 20;
let clips = [];
let lastClipKey = null;
const clipsDir = () => path.join(dataDir(), 'clips');

function clipsChanged() {
  saveJSON('clipboard.json', clips);
  if (toolsWin && !toolsWin.isDestroyed()) toolsWin.webContents.send('clips-changed');
}

function removeClipFiles(list) {
  for (const c of list) if (c.type === 'image') fs.rm(path.join(clipsDir(), c.id + '.png'), { force: true }, () => {});
}

// Keeps the newest 100 texts and 20 pictures; pinned items always stay.
function trimClips() {
  let texts = 0, images = 0;
  const keep = [], drop = [];
  for (const c of clips) {
    if (c.pinned) { keep.push(c); continue; }
    const ok = c.type === 'image' ? ++images <= MAX_IMAGES : ++texts <= MAX_TEXT;
    (ok ? keep : drop).push(c);
  }
  clips = keep;
  removeClipFiles(drop);
}

// Looks at the clipboard once a second and remembers new text and pictures.
function watchClipboard() {
  if (paused) return;
  const text = clipboard.readText();
  let key, item, image;
  if (text && text.trim()) {
    key = 't:' + text;
    if (key === lastClipKey) return;
    item = { type: 'text', text: text.slice(0, 100000) };
  } else if (clipboard.availableFormats().some((f) => f.startsWith('image/'))) {
    image = clipboard.readImage();
    if (image.isEmpty()) return;
    const { width, height } = image.getSize();
    const thumb = image.resize({ width: Math.min(240, width) });
    const thumbURL = thumb.toDataURL();
    key = `i:${width}x${height}:${thumbURL.length}:${thumbURL.slice(-200)}`;
    if (key === lastClipKey) return;
    item = { type: 'image', width, height, thumb: thumbURL };
  } else return;
  lastClipKey = key;
  item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  item.time = Date.now();
  if (image) {
    fs.mkdirSync(clipsDir(), { recursive: true });
    fs.writeFileSync(path.join(clipsDir(), item.id + '.png'), image.toPNG());
  } else {
    // The same text copied again moves to the top instead of being stored twice.
    const old = clips.find((c) => c.type === 'text' && c.text === item.text);
    if (old) { item.pinned = old.pinned; clips = clips.filter((c) => c !== old); }
  }
  clips.unshift(item);
  trimClips();
  clipsChanged();
}

function copyClip(id) {
  const c = clips.find((x) => x.id === id);
  if (!c) return false;
  if (c.type === 'text') { clipboard.writeText(c.text); lastClipKey = 't:' + c.text; }
  else {
    const image = nativeImage.createFromPath(path.join(clipsDir(), c.id + '.png'));
    if (image.isEmpty()) return false;
    clipboard.writeImage(image);
  }
  clips = [c, ...clips.filter((x) => x !== c)]; // move it to the top
  clipsChanged();
  return true;
}

// MARK: Tools window (clipboard, notes, timer, QR, converter, text reader, colours)

let toolsWin = null;
function openTools(tab = 'clipboard') {
  if (!toolsWin || toolsWin.isDestroyed()) {
    toolsWin = new BrowserWindow({
      width: 960, height: 660, minWidth: 720, minHeight: 480, title: 'MacShot Tools', show: false,
      backgroundColor: '#1e1f22', webPreferences: { preload, backgroundThrottling: false },
    });
    toolsWin.setMenuBarVisibility(false);
    toolsWin.loadFile(path.join(__dirname, 'tools.html'), { query: { tab, ...(TEST() ? { test: '1' } : {}) } });
    toolsWin.once('ready-to-show', () => { if (!TEST()) { toolsWin.show(); focusApp(); } });
    // Closing only hides the window, so timers keep running.
    toolsWin.on('close', (e) => { if (!quitting) { e.preventDefault(); toolsWin.hide(); } });
  } else {
    toolsWin.webContents.send('tab', tab);
    if (!TEST()) { toolsWin.show(); toolsWin.focus(); focusApp(); }
  }
  return toolsWin;
}

const handle = (name, fn) => ipcMain.handle('tool:' + name, (_e, ...args) => fn(...args));

handle('clips', () => ({ clips, paused }));
handle('clip-copy', (id) => copyClip(id));
handle('clip-delete', (id) => {
  removeClipFiles(clips.filter((c) => c.id === id));
  clips = clips.filter((c) => c.id !== id);
  clipsChanged();
});
handle('clip-pin', (id) => { const c = clips.find((x) => x.id === id); if (c) c.pinned = !c.pinned; clipsChanged(); });
handle('clip-clear', () => { removeClipFiles(clips.filter((c) => !c.pinned)); clips = clips.filter((c) => c.pinned); clipsChanged(); });
handle('clip-pause', (value) => { paused = !!value; updateTray(); });
handle('notes-load', () => loadJSON('notes.json', []));
handle('notes-save', (notes) => saveJSON('notes.json', notes));
handle('colors-load', () => loadJSON('colors.json', []));
handle('colors-save', (colors) => saveJSON('colors.json', colors));
handle('pick-color', async () => {
  if (toolsWin) toolsWin.hide();
  try { return await pickColor(); } finally { if (toolsWin && !TEST()) toolsWin.show(); }
});
handle('read-screen-text', () => { if (toolsWin) toolsWin.hide(); return captureText(); });
handle('notify', (title, body) => notify(String(title), String(body)));
handle('copy-text', (text) => clipboard.writeText(String(text)));
handle('copy-image', (dataURL) => clipboard.writeImage(nativeImage.createFromDataURL(dataURL)));
handle('read-clipboard-text', () => clipboard.readText());
handle('show-file', (file) => shell.showItemInFolder(String(file)));
handle('open-folder', (which) => {
  const dir = which === 'converted' ? convertedDir : shotsDir;
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});
// Saves a picture made in a tool page. Names are cleaned so they stay inside the folder.
handle('save-picture', (name, bytes, where) => {
  const dir = where === 'converted' ? convertedDir : shotsDir;
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(String(name)).replace(/[\\/:*?"<>|]/g, '_') || 'picture.png';
  const { name: base, ext } = path.parse(safe);
  let file = path.join(dir, safe);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i})${ext}`);
  fs.writeFileSync(file, Buffer.from(bytes));
  return file;
});
handle('annotate-save', (dataURL, copyOnly) => {
  const image = nativeImage.createFromDataURL(dataURL);
  if (copyOnly) { clipboard.writeImage(image); notify('Copied', 'The picture is on the clipboard'); return null; }
  return saveImage(image, 'Annotated');
});
handle('annotate-open', () => annotateLast());
handle('capture-annotate', () => captureAnnotate());
handle('tab-shown', (tab) => { lastTab = String(tab); });

// Self-test results from the tool pages.
let testResolve = null;
handle('test-done', (result) => { if (testResolve) testResolve(result); testResolve = null; });

// MARK: Recording (screen or sound)

async function startRecording(kind) {
  const r = rec[kind];
  if (r.on) return;

  if (process.platform === 'darwin') {
    // Ask for the microphone; screen recording still works without it.
    let ok = true;
    try { ok = await systemPreferences.askForMediaAccess('microphone'); } catch {}
    if (!ok && kind === 'sound') return showMicHelp();
  }

  if (kind === 'screen') {
    const source = await screenSourceFor(currentDisplay());
    if (!source) return showPermissionHelp(new Error('No screen was found to record.'));
    // The recorder page asks for the screen with getDisplayMedia; answer with this screen.
    // 'loopback' adds the computer's own sound (works on Windows; ignored elsewhere).
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      callback(process.platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source });
    });
  }

  fs.mkdirSync(videosDir, { recursive: true });
  r.on = true;
  updateTray();
  r.win = new BrowserWindow({
    show: false,
    webPreferences: { preload, backgroundThrottling: false },
  });
  r.win.loadFile(path.join(__dirname, 'recorder.html'), { query: { kind } });
}

function stopRecording(kind) {
  const r = rec[kind];
  if (r.on && r.win) r.win.webContents.send('stop');
}

const toggle = (kind) => (rec[kind].on ? stopRecording(kind) : startRecording(kind));

ipcMain.handle('recording-started', (_e, kind, ext) => {
  const r = rec[kind];
  r.file = path.join(videosDir, `${kind === 'sound' ? 'Sound' : 'Recording'} ${stamp()}.${ext}`);
  r.stream = fs.createWriteStream(r.file);
  notify(kind === 'sound' ? 'Sound recording started' : 'Recording started',
    `Press ${kind === 'sound' ? 'Alt+Shift+6' : 'Alt+Shift+5'} or use the menu to stop.`);
});

ipcMain.handle('recording-chunk', (_e, kind, data) => {
  const r = rec[kind];
  if (r.stream) r.stream.write(Buffer.from(data));
});

ipcMain.handle('recording-stopped', async (_e, kind, error) => {
  const r = rec[kind];
  const file = r.file;
  await new Promise((done) => (r.stream ? r.stream.end(done) : done()));
  Object.assign(r, { on: false, file: null, stream: null });
  if (r.win) { r.win.destroy(); r.win = null; }
  updateTray();
  const finished = r.done; r.done = null;
  if (error) {
    if (kind === 'sound') showMicHelp(error); else showPermissionHelp(new Error(error));
    if (finished) finished(null);
    return;
  }
  if (file && fs.existsSync(file)) {
    notify(kind === 'sound' ? 'Sound saved' : 'Recording saved', path.basename(file));
    if (!TEST()) shell.showItemInFolder(file);
  }
  if (finished) finished(file);
});

// MARK: Tray

function updateTray() {
  if (!tray) return;
  tray.setImage(icon(anyRecording() ? 'tray-red.png' : 'tray.png'));
  tray.setToolTip(anyRecording() ? 'MacShot — recording' : 'MacShot');
  const open = (dir) => () => { fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Capture Area', accelerator: 'Alt+Shift+1', click: () => captureArea() },
    { label: 'Capture Full Screen', accelerator: 'Alt+Shift+3', click: () => captureFull() },
    { label: 'Capture and Annotate', accelerator: 'Alt+Shift+4', click: () => captureAnnotate() },
    { label: 'Annotate Last Screenshot', click: () => annotateLast() },
    { label: 'Copy Text from Screen', accelerator: 'Alt+Shift+2', click: () => captureText() },
    { label: 'Pick Colour from Screen', accelerator: 'Alt+Shift+C', click: () => pickColor() },
    { type: 'separator' },
    { label: rec.screen.on ? 'Stop Recording' : 'Start Recording', accelerator: 'Alt+Shift+5', click: () => toggle('screen') },
    { label: rec.sound.on ? 'Stop Sound Recording' : 'Start Sound Recording', accelerator: 'Alt+Shift+6', click: () => toggle('sound') },
    { type: 'separator' },
    { label: 'Clipboard History', accelerator: 'Alt+Shift+V', click: () => openTools('clipboard') },
    { label: 'Quick Notes', accelerator: 'Alt+Shift+N', click: () => openTools('notes') },
    { label: 'Timer and Stopwatch', accelerator: 'Alt+Shift+T', click: () => openTools('timer') },
    { label: 'QR Code', accelerator: 'Alt+Shift+Q', click: () => openTools('qr') },
    { label: 'Image Converter', click: () => openTools('convert') },
    { label: 'Colours', click: () => openTools('colors') },
    { label: 'All Tools…', accelerator: 'Alt+Shift+M', click: () => openTools(lastTab) },
    { type: 'separator' },
    { label: 'Open Screenshots Folder', click: open(shotsDir) },
    { label: 'Open Recordings Folder', click: open(videosDir) },
    { type: 'separator' },
    { label: 'Pause Clipboard History', type: 'checkbox', checked: paused, click: (item) => { paused = item.checked; } },
    {
      label: 'Start at Login', type: 'checkbox', visible: process.platform !== 'linux',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: `Quit MacShot ${app.getVersion()}`, click: quit },
  ]));
}

function quit() {
  quitting = true;
  const running = ['screen', 'sound'].filter((k) => rec[k].on);
  if (!running.length) return app.quit();
  let left = running.length;
  for (const k of running) { rec[k].done = () => { if (--left === 0) app.exit(0); }; stopRecording(k); }
  setTimeout(() => app.exit(0), 5000);
}

function showPermissionHelp(err) {
  const mac = process.platform === 'darwin';
  const detail = (err && err.message ? err.message + '\n\n' : '') + (mac
    ? 'Allow MacShot under System Settings → Privacy & Security → Screen & System Audio Recording (and Microphone), then quit and reopen MacShot.'
    : 'Check that screen capture is allowed on this computer, then try again.');
  if (TEST()) { console.error('ERROR', detail); return; }
  const choice = dialog.showMessageBoxSync({
    type: 'warning', message: 'MacShot could not capture the screen', detail,
    buttons: mac ? ['Open Settings', 'Cancel'] : ['OK'],
  });
  if (mac && choice === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
}

function showMicHelp(error) {
  const mac = process.platform === 'darwin';
  const detail = (error ? error + '\n\n' : '') + (mac
    ? 'Allow MacShot under System Settings → Privacy & Security → Microphone, then try again.'
    : 'Check that a microphone is connected and allowed for MacShot, then try again.');
  if (TEST()) { console.error('ERROR', detail); return; }
  const choice = dialog.showMessageBoxSync({
    type: 'warning', message: 'MacShot could not use the microphone', detail,
    buttons: mac ? ['Open Settings', 'Cancel'] : ['OK'],
  });
  if (mac && choice === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
}

// MARK: Start

const recordFor = (kind, ms) => new Promise((resolve) => {
  rec[kind].done = resolve;
  startRecording(kind).then(() => setTimeout(() => stopRecording(kind), ms));
});

const shortcuts = {
  'Alt+Shift+1': () => captureArea(),
  'Alt+Shift+2': () => captureText(),
  'Alt+Shift+3': () => captureFull(),
  'Alt+Shift+4': () => captureAnnotate(),
  'Alt+Shift+5': () => toggle('screen'),
  'Alt+Shift+6': () => toggle('sound'),
  'Alt+Shift+C': () => pickColor(),
  'Alt+Shift+V': () => openTools('clipboard'),
  'Alt+Shift+N': () => openTools('notes'),
  'Alt+Shift+T': () => openTools('timer'),
  'Alt+Shift+Q': () => openTools('qr'),
  'Alt+Shift+M': () => openTools(lastTab),
};

async function selfTest() {
  process.env.MACSHOT_TEST = '1';
  setTimeout(() => { console.log('test timed out'); app.exit(2); }, 240000);
  const size = (f) => (f && fs.existsSync(f) ? fs.statSync(f).size : 0);
  const results = {};
  const shot = await captureFull();
  console.log('screenshot:', shot, size(shot), 'bytes'); results.screenshot = size(shot) > 0;
  const area = await captureArea();
  console.log('area:', area, size(area), 'bytes'); results.area = size(area) > 0;

  // Clipboard history picks up new text.
  const marker = 'MacShot clipboard test ' + Date.now();
  clipboard.writeText(marker);
  await wait(1600);
  results.clipboard = !!clips.find((c) => c.text === marker);
  console.log('clipboard history:', results.clipboard ? 'ok' : 'missing', clips.length, 'items');

  const hex = await pickColor();
  console.log('colour picker:', hex); results.color = /^#[0-9A-F]{6}$/.test(hex || '');

  // Annotate: the page draws on the picture by itself and saves it.
  const annotated = await new Promise((resolve) => {
    testResolve = resolve;
    openAnnotate(nativeImage.createFromPath(area || shot));
  });
  console.log('annotate:', annotated, size(annotated), 'bytes'); results.annotate = size(annotated) > 0;
  if (annotateWin) annotateWin.destroy();

  // Tool page: QR code, text reader, image converter, notes, timer, stopwatch.
  const page = await new Promise((resolve) => { testResolve = resolve; openTools('clipboard'); });
  for (const [k, v] of Object.entries(page)) { console.log(`${k}:`, v.ok ? 'ok' : 'FAILED', v.info || ''); results[k] = v.ok; }

  const video = await recordFor('screen', 4000);
  console.log('recording:', video, size(video), 'bytes'); results.recording = size(video) > 0;
  const sound = await recordFor('sound', 4000);
  console.log('sound:', sound, size(sound), 'bytes'); results.sound = size(sound) > 0;

  const failed = Object.keys(results).filter((k) => !results[k]);
  console.log(failed.length ? `FAILED: ${failed.join(', ')}` : 'ALL OK');
  quitting = true;
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide(); // menu bar only

  // An Edit menu makes copy, paste and undo work in the tool windows on macOS.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]));

  clips = loadJSON('clipboard.json', []);
  const first = clips[0];
  lastClipKey = first && first.type === 'text' ? 't:' + first.text : null;

  tray = new Tray(icon('tray.png'));
  updateTray();
  if (process.platform !== 'darwin') tray.on('click', () => tray.popUpContextMenu());

  for (const [keys, fn] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(keys, fn)) console.warn('shortcut taken by another app:', keys);
  }

  setInterval(() => { try { watchClipboard(); } catch (err) { console.warn('clipboard', err.message); } }, 1000);

  // `MacShot --test` checks every feature, prints the results and quits.
  if (process.argv.includes('--test')) selfTest();
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the tray
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
