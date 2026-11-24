// TouchKit: an all-in-one helper for everyday computer work, for Windows,
// macOS and Linux, with a phone remote that works on any phone browser.
//
//   Alt+Shift+Space  open TouchKit (all tools)
//   Alt+Shift+1      screenshot          Alt+Shift+5  start / stop recording
//   Alt+Shift+T      on-screen Touch Bar Alt+Shift+V  clipboard history
//   Alt+Shift+←/→/↑  window to the left half / right half / full screen
//
// Screenshots and photos: Pictures/TouchKit. Recordings: Videos/TouchKit.

const {
  app, BrowserWindow, Tray, Menu, globalShortcut, desktopCapturer, screen,
  clipboard, shell, ipcMain, nativeImage, session, Notification, dialog, systemPreferences,
  powerSaveBlocker,
} = require('electron');
const path = require('path');
const fs = require('fs');
const input = require('./input');
const remote = require('./remote');

// While developing (not in the built app), write messages to dev.log.
function devLog(...a) {
  if (app.isPackaged) return;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'dev.log'), a.join(' ') + '\n'); } catch {}
}
app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_ev, level, message, line, source) => devLog('[page]', level, message, source + ':' + line));
  wc.on('preload-error', (_ev, p, err) => devLog('[preload-error]', p, err));
});

const shotsDir = path.join(app.getPath('pictures'), 'TouchKit');
const videosDir = path.join(app.getPath('videos'), 'TouchKit');

let tray = null;
let hubWin = null;
let barWin = null;
let recorderWin = null;
let recording = false;
let recordFile = null;
let recordStream = null;
let awakeId = null;
let phones = []; // reply functions of connected phones

// Only one copy at a time; a second launch opens the window of the first.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => openHub());

function icon(name) {
  return nativeImage.createFromPath(path.join(__dirname, 'icons', name));
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
}

function toPhones(text) { phones.forEach((reply) => { try { reply({ t: 'toast', text }); } catch {} }); }

function currentDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

async function screenSourceFor(display, thumbnailSize = { width: 0, height: 0 }) {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  return sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
}

// MARK: Screenshot

async function takeScreenshot() {
  try {
    const display = currentDisplay();
    const size = {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    };
    // Give the tray menu time to close so it is not in the picture.
    await new Promise((r) => setTimeout(r, 300));
    // The first capture after start can come back empty (seen on macOS), so try a few times.
    let source = null;
    for (let i = 0; i < 4 && (!source || source.thumbnail.isEmpty()); i++) {
      if (i) await new Promise((r) => setTimeout(r, 200));
      source = await screenSourceFor(display, size);
    }
    if (!source || source.thumbnail.isEmpty()) throw new Error('The screen could not be captured.');
    fs.mkdirSync(shotsDir, { recursive: true });
    const file = path.join(shotsDir, `Screenshot ${stamp()}.png`);
    fs.writeFileSync(file, source.thumbnail.toPNG());
    clipboard.writeImage(source.thumbnail);
    notify('Screenshot saved', `${path.basename(file)} (also copied to the clipboard)`); toPhones('Screenshot saved');
    return file;
  } catch (err) {
    showPermissionHelp(err);
    return null;
  }
}

// MARK: Screen recording

async function startRecording() {
  if (recording) return;
  const display = currentDisplay();
  const source = await screenSourceFor(display);
  if (!source) return showPermissionHelp(new Error('No screen was found to record.'));

  if (process.platform === 'darwin') {
    // Ask for the microphone; recording still works without it.
    try { await systemPreferences.askForMediaAccess('microphone'); } catch {}
  }

  // The recorder page asks for the screen with getDisplayMedia; answer with this screen.
  // 'loopback' adds the computer's own sound (works on Windows; ignored elsewhere).
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    callback(process.platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source });
  });

  fs.mkdirSync(videosDir, { recursive: true });
  recording = true;
  updateTray();

  recorderWin = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  recorderWin.loadFile(path.join(__dirname, 'recorder.html'));
}

function stopRecording() {
  if (!recording || !recorderWin) return;
  recorderWin.webContents.send('stop');
}

function toggleRecording() {
  if (recording) stopRecording(); else startRecording();
}

ipcMain.handle('recording-started', (_e, ext) => {
  recordFile = path.join(videosDir, `Recording ${stamp()}.${ext}`);
  recordStream = fs.createWriteStream(recordFile);
  notify('Recording started', 'Press Alt+Shift+5 or use the tray menu to stop.'); toPhones('Recording…');
});

ipcMain.handle('recording-chunk', (_e, data) => {
  if (recordStream) recordStream.write(Buffer.from(data));
});

ipcMain.handle('recording-stopped', async (_e, error) => {
  const file = recordFile;
  await new Promise((r) => (recordStream ? recordStream.end(r) : r()));
  recordStream = null;
  recordFile = null;
  recording = false;
  updateTray();
  if (recorderWin) { recorderWin.destroy(); recorderWin = null; }
  if (error) {
    showPermissionHelp(new Error(error));
    if (app.testDone) app.testDone(null);
    return;
  }
  if (file && fs.existsSync(file)) {
    notify('Recording saved', path.basename(file));
    if (!process.env.SHOTKIT_TEST) shell.showItemInFolder(file);
  }
  if (app.testDone) app.testDone(file);
});

// MARK: Keep awake

function toggleAwake() {
  if (awakeId !== null && powerSaveBlocker.isStarted(awakeId)) {
    powerSaveBlocker.stop(awakeId); awakeId = null;
  } else {
    awakeId = powerSaveBlocker.start('prevent-display-sleep');
  }
  const on = awakeId !== null;
  toPhones(on ? 'Keep awake: on' : 'Keep awake: off');
  updateTray();
  broadcast('state');
  return on;
}

// MARK: Clipboard history (text, newest first)

const clipFile = () => path.join(app.getPath('userData'), 'clipboard.json');
let clips = [];
let lastClip = '';

function loadClips() {
  try { clips = JSON.parse(fs.readFileSync(clipFile(), 'utf8')); } catch { clips = []; }
  lastClip = clipboard.readText();
}
function saveClips() {
  try { fs.writeFileSync(clipFile(), JSON.stringify(clips)); } catch {}
}
function watchClipboard() {
  setInterval(() => {
    const t = clipboard.readText();
    if (!t || t === lastClip || t.length > 20000) { lastClip = t; return; }
    lastClip = t;
    const pinned = clips.find((c) => c.text === t)?.pinned || false;
    clips = [{ text: t, time: Date.now(), pinned }, ...clips.filter((c) => c.text !== t)];
    // Keep pinned items and the 100 newest.
    clips = clips.filter((c, i) => c.pinned || i < 100);
    saveClips();
    broadcast('clips');
  }, 700);
}

// MARK: Phone remote

function onPhone(msg, reply) {
  if (!phones.includes(reply)) phones.push(reply);
  switch (msg.t) {
    case 'move': return input.send(`move ${+msg.dx || 0} ${+msg.dy || 0}`);
    case 'scroll': return input.send(`scroll ${+msg.dx || 0} ${+msg.dy || 0}`);
    case 'click': return input.send(`click ${['left', 'right', 'double'].includes(msg.button) ? msg.button : 'left'}`);
    case 'down': return input.send('down');
    case 'up': return input.send('up');
    case 'key': return /^[a-z0-9]+$/.test(msg.key) && input.send(`key ${msg.key}`);
    case 'snap': return /^[a-z]+$/.test(msg.where) && input.send(`snap ${msg.where}`);
    case 'type': return typeof msg.text === 'string' && input.send(`type ${msg.text}`);
    case 'tool':
      if (msg.tool === 'screenshot') return takeScreenshot();
      if (msg.tool === 'record') return toggleRecording();
      if (msg.tool === 'awake') return toggleAwake();
  }
}

async function startRemote() {
  await remote.start(onPhone, () => {
    if (!remote.info().clients) phones = [];
    broadcast('remote');
  });
  devLog('Phone remote:', remote.info().url);
  return { ...remote.info(), qr: await remote.qr() };
}

// MARK: Windows

function broadcast(what) {
  for (const w of [hubWin, barWin]) if (w && !w.isDestroyed()) w.webContents.send('changed', what);
}

function openHub(tool) {
  if (hubWin && !hubWin.isDestroyed()) {
    if (tool) hubWin.webContents.send('open-tool', tool);
    hubWin.show(); hubWin.focus();
    return;
  }
  hubWin = new BrowserWindow({
    width: 1100, height: 720, minWidth: 760, minHeight: 520,
    title: 'TouchKit', backgroundColor: '#0b1220', show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'hub-preload.js') },
  });
  hubWin.loadFile(path.join(__dirname, '..', 'web', 'index.html'), { hash: tool || '' });
  hubWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  hubWin.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  hubWin.once('ready-to-show', () => hubWin.show());
  hubWin.on('closed', () => { hubWin = null; });
  if (process.platform === 'darwin') app.dock.show();
  hubWin.on('closed', () => { if (process.platform === 'darwin' && !hubWin) app.dock.hide(); });
}

function toggleBar() {
  if (barWin && !barWin.isDestroyed()) { barWin.close(); return; }
  const d = currentDisplay();
  const w = Math.min(940, d.workArea.width - 40), h = 62;
  barWin = new BrowserWindow({
    width: w, height: h,
    x: Math.round(d.workArea.x + (d.workArea.width - w) / 2),
    y: Math.round(d.workArea.y + d.workArea.height - h - 12),
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, hasShadow: false, fullscreenable: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: { preload: path.join(__dirname, 'hub-preload.js') },
  });
  barWin.setAlwaysOnTop(true, 'screen-saver');
  barWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  barWin.loadFile(path.join(__dirname, 'touchbar', 'index.html'));
  barWin.on('closed', () => { barWin = null; updateTray(); });
  updateTray();
}

// MARK: Messages from the TouchKit windows

ipcMain.handle('tk', async (_e, cmd, arg = {}) => {
  switch (cmd) {
    case 'state': return {
      platform: process.platform, version: app.getVersion(), recording,
      awake: awakeId !== null, bar: !!barWin, accessibility: await input.hasPermission(),
      remote: remote.info(),
    };
    case 'screenshot': return takeScreenshot();
    case 'record': return toggleRecording();
    case 'awake': return toggleAwake();
    case 'bar': return toggleBar();
    case 'open': return openHub(arg.tool);
    case 'key': return input.send(`key ${String(arg.key).replace(/\W/g, '')}`);
    case 'snap': return input.send(`snap ${String(arg.where).replace(/\W/g, '')}`);
    case 'askAccess': {
      await input.askPermission();
      if (process.platform === 'darwin') shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      return true;
    }
    case 'remoteStart': return startRemote();
    case 'remoteNewCode': remote.newCode(); return startRemote();
    case 'clips': return clips;
    case 'clipCopy': clipboard.writeText(String(arg.text)); lastClip = String(arg.text); return true;
    case 'clipPin': clips = clips.map((c) => c.text === arg.text ? { ...c, pinned: !c.pinned } : c); saveClips(); return clips;
    case 'clipDelete': clips = clips.filter((c) => c.text !== arg.text); saveClips(); return clips;
    case 'clipClear': clips = clips.filter((c) => c.pinned); saveClips(); return clips;
    case 'copyText': clipboard.writeText(String(arg.text)); return true;
    case 'cameraAccess':
      if (process.platform === 'darwin') return systemPreferences.askForMediaAccess('camera');
      return true;
    case 'savePhoto': {
      fs.mkdirSync(shotsDir, { recursive: true });
      const file = path.join(shotsDir, `Photo ${stamp()}.png`);
      fs.writeFileSync(file, Buffer.from(String(arg.dataUrl).split(',')[1], 'base64'));
      notify('Photo saved', path.basename(file));
      return file;
    }
    case 'saveAs': {
      // arg: { name, dataUrl | text }
      const res = await dialog.showSaveDialog(hubWin, { defaultPath: path.join(app.getPath('downloads'), arg.name || 'file') });
      if (res.canceled || !res.filePath) return null;
      if (arg.dataUrl) fs.writeFileSync(res.filePath, Buffer.from(String(arg.dataUrl).split(',')[1], 'base64'));
      else fs.writeFileSync(res.filePath, String(arg.text ?? ''));
      return res.filePath;
    }
    case 'pdf': {
      // Turn an HTML page (invoice etc.) into a PDF the user saves.
      const res = await dialog.showSaveDialog(hubWin, { defaultPath: path.join(app.getPath('downloads'), arg.name || 'document.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (res.canceled || !res.filePath) return null;
      const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(arg.html));
      const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
      w.destroy();
      fs.writeFileSync(res.filePath, pdf);
      shell.showItemInFolder(res.filePath);
      return res.filePath;
    }
    case 'showFile': return shell.showItemInFolder(String(arg.file));
    case 'openFolder': {
      const dir = arg.which === 'videos' ? videosDir : shotsDir;
      fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir);
    }
    case 'qr': return require('qrcode').toDataURL(String(arg.text || ' '), { margin: 1, width: Math.min(+arg.size || 320, 1200) });
    case 'openUrl': if (/^https?:\/\//.test(arg.url)) shell.openExternal(arg.url); return true;
  }
  return null;
});

// MARK: Tray

function updateTray() {
  broadcast('state');
  if (!tray) return;
  tray.setImage(icon(recording ? 'tray-red.png' : 'tray.png'));
  tray.setToolTip(recording ? 'TouchKit — recording' : 'TouchKit');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open TouchKit', accelerator: 'Alt+Shift+Space', click: () => openHub() },
    { type: 'separator' },
    { label: 'Capture Screen', accelerator: 'Alt+Shift+1', click: takeScreenshot },
    { label: recording ? 'Stop Recording' : 'Start Recording', accelerator: 'Alt+Shift+5', click: toggleRecording },
    { label: 'Take a Photo (Camera)', click: () => openHub('camera') },
    { type: 'separator' },
    { label: 'On-screen Touch Bar', type: 'checkbox', checked: !!barWin, accelerator: 'Alt+Shift+T', click: toggleBar },
    { label: 'Phone Remote…', click: () => openHub('remote') },
    { label: 'Clipboard History', accelerator: 'Alt+Shift+V', click: () => openHub('clipboard') },
    { label: 'Window', submenu: [
      { label: 'Left Half', accelerator: 'Alt+Shift+Left', click: () => input.send('snap left') },
      { label: 'Right Half', accelerator: 'Alt+Shift+Right', click: () => input.send('snap right') },
      { label: 'Full Screen', accelerator: 'Alt+Shift+Up', click: () => input.send('snap max') },
      { label: 'Centre', click: () => input.send('snap center') },
    ] },
    { label: 'Keep Awake', type: 'checkbox', checked: awakeId !== null, click: toggleAwake },
    { type: 'separator' },
    { label: 'Open Screenshots Folder', click: () => { fs.mkdirSync(shotsDir, { recursive: true }); shell.openPath(shotsDir); } },
    { label: 'Open Recordings Folder', click: () => { fs.mkdirSync(videosDir, { recursive: true }); shell.openPath(videosDir); } },
    { type: 'separator' },
    { label: 'Quit TouchKit', click: quit },
  ]));
}

function quit() {
  input.stop(); remote.stop();
  if (recording) {
    app.testDone = () => app.exit(0);
    stopRecording();
    setTimeout(() => app.exit(0), 5000);
  } else {
    app.quit();
  }
}

function showPermissionHelp(err) {
  const mac = process.platform === 'darwin';
  const detail = (err && err.message ? err.message + '\n\n' : '') + (mac
    ? 'Allow TouchKit under System Settings → Privacy & Security → Screen & System Audio Recording (and Microphone), then quit and reopen TouchKit.'
    : 'Check that screen capture is allowed on this computer, then try again.');
  if (process.env.SHOTKIT_TEST) { console.error('ERROR', detail); return; }
  const choice = dialog.showMessageBoxSync({
    type: 'warning', message: 'TouchKit could not capture the screen', detail,
    buttons: mac ? ['Open Settings', 'Cancel'] : ['OK'],
  });
  if (mac && choice === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
}

// MARK: Start

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide(); // lives in the menu bar

  // The camera tool and the recorder ask for camera / microphone; allow them for our own pages.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'clipboard-read', 'clipboard-sanitized-write'].includes(perm)));

  tray = new Tray(icon('tray.png'));
  updateTray();
  tray.on('click', () => tray.popUpContextMenu());

  const keys = {
    'Alt+Shift+Space': () => openHub(), 'Alt+Shift+1': takeScreenshot, 'Alt+Shift+5': toggleRecording,
    'Alt+Shift+T': toggleBar, 'Alt+Shift+V': () => openHub('clipboard'),
    'Alt+Shift+Left': () => input.send('snap left'), 'Alt+Shift+Right': () => input.send('snap right'),
    'Alt+Shift+Up': () => input.send('snap max'),
  };
  for (const [k, fn] of Object.entries(keys)) { try { globalShortcut.register(k, fn); } catch {} }

  loadClips();
  watchClipboard();
  startRemote().catch(() => {});

  // Self-test: `TouchKit --test` takes one screenshot and records 4 seconds, then quits.
  if (process.argv.includes('--test')) {
    process.env.SHOTKIT_TEST = '1';
    const shot = await takeScreenshot();
    console.log('screenshot:', shot);
    console.log('remote:', remote.info().url);
    app.testDone = (file) => {
      const size = file && fs.existsSync(file) ? fs.statSync(file).size : 0;
      console.log('recording:', file, size, 'bytes');
      app.exit(shot && size > 0 ? 0 : 1);
    };
    await startRecording();
    setTimeout(stopRecording, 4000);
    setTimeout(() => { console.log('test timed out'); app.exit(2); }, 30000);
    return;
  }
  if (process.argv.includes('--bar')) toggleBar();
  if (!process.argv.includes('--hidden')) openHub();
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the tray
app.on('will-quit', () => { globalShortcut.unregisterAll(); input.stop(); remote.stop(); });
