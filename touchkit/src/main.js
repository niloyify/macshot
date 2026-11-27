// Jhuli: an all-in-one helper for everyday computer work, for Windows,
// macOS and Linux, with a phone remote that works on any phone browser.
// Since 3.0 it also has everything from MacShot (screen capture tools).
//
//   Alt+Shift+Space / M  open Jhuli (all tools)
//   Alt+Shift+1  capture an area          Alt+Shift+3  capture the full screen
//   Alt+Shift+2  copy text from screen    Alt+Shift+4  capture and annotate
//   Alt+Shift+5  screen recording         Alt+Shift+6  sound recording (microphone)
//   Alt+Shift+C  colour picker            Alt+Shift+V  clipboard history
//   Alt+Shift+N  quick notes              Alt+Shift+T  timer and stopwatch
//   Alt+Shift+Q  QR code                  Alt+Shift+B  on-screen Touch Bar
//   Alt+Shift+←/→/↑  window to the left half / right half / full screen
//
// Screenshots and photos: Pictures/Jhuli. Recordings: Videos/Jhuli.

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

const shotsDir = path.join(app.getPath('pictures'), 'Jhuli');
const videosDir = path.join(app.getPath('videos'), 'Jhuli');

let tray = null;
let hubWin = null;
let barWin = null;
let awakeId = null;
let phones = []; // reply functions of connected phones

// Only one copy at a time; a second launch opens the window of the first.
// Jhuli used to be called TouchKit: bring its data (tool data, clipboard history) over once.
(() => {
  try {
    const now = app.getPath('userData');
    const old = path.join(app.getPath('appData'), 'TouchKit');
    if (!fs.existsSync(now) && fs.existsSync(old)) {
      fs.cpSync(old, now, { recursive: true, filter: (f) => !/Singleton|\.lock$|dev\.log$/.test(path.basename(f)) });
    }
  } catch {}
})();

if (!app.requestSingleInstanceLock()) app.quit();
// Opening Jhuli again shows its window (unless it was started hidden, e.g. at login).
app.on('second-instance', (_e, argv) => { if (!argv.includes('--hidden')) openHub(); });

// MARK: Start at login. On macOS a small LaunchAgent opens Jhuli in the menu bar
// (hidden); on Windows the system login item does the same.
const loginPlist = path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'io.github.niloyify.jhuli.plist');
const appBundle = () => path.resolve(app.getPath('exe'), '..', '..', '..');
function startsAtLogin() {
  if (process.platform === 'darwin') return fs.existsSync(loginPlist);
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}
function setStartAtLogin(on) {
  if (process.platform === 'darwin') {
    if (!on) { fs.rmSync(loginPlist, { force: true }); return; }
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    fs.mkdirSync(path.dirname(loginPlist), { recursive: true });
    fs.writeFileSync(loginPlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.github.niloyify.jhuli</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/open</string><string>-a</string><string>${esc(appBundle())}</string><string>--args</string><string>--hidden</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`);
  } else {
    app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
  }
}

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

// MARK: Screen capture (screenshots, OCR, annotate, colours, screen and sound recording)

const isTest = () => !!process.env.SHOTKIT_TEST;
const cap = require('./capture')({
  shotsDir, videosDir, notify, isTest, openHub, broadcast,
  changed: () => { updateTray(); broadcast('state'); },
  permissionHelp: (err) => showPermissionHelp(err),
  micHelp: (err) => showMicHelp(err),
});
const takeScreenshot = () => cap.captureFull().then((f) => { if (f) toPhones('Screenshot saved'); return f; });
const toggleRecording = () => cap.toggle('screen');

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
    title: 'Jhuli', backgroundColor: '#0b1220', show: false,
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

// MARK: Messages from the Jhuli windows

ipcMain.handle('tk', async (_e, cmd, arg = {}) => {
  switch (cmd) {
    case 'state': return {
      platform: process.platform, version: app.getVersion(), recording: cap.isRecording('screen'), sound: cap.isRecording('sound'),
      awake: awakeId !== null, bar: !!barWin, accessibility: await input.hasPermission(),
      remote: remote.info(),
    };
    case 'screenshot': return takeScreenshot();
    case 'captureArea': hubWin && hubWin.hide(); return cap.captureArea().finally(() => hubWin && !hubWin.isDestroyed() && hubWin.show());
    case 'captureText': hubWin && hubWin.hide(); return cap.captureText();
    case 'captureAnnotate': hubWin && hubWin.hide(); return cap.captureAnnotate();
    case 'annotateLast': return cap.annotateLast();
    case 'annotateImage': return !!cap.annotateDataUrl(arg.dataUrl);
    case 'sound': return cap.toggle('sound');
    case 'pickColor': { hubWin && hubWin.hide(); try { return await cap.pickColor(); } finally { if (hubWin && !hubWin.isDestroyed()) hubWin.show(); } }
    case 'takeOcrImage': return cap.takeOcrImage();
    case 'takePickedColors': return cap.takePickedColors();
    case 'notify': return notify(String(arg.title || 'Jhuli'), String(arg.body || ''));
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
    case 'saveVideo': {
      fs.mkdirSync(videosDir, { recursive: true });
      const file = path.join(videosDir, path.basename(String(arg.name || `Video ${stamp()}.webm`)).replace(/[\\/:*?"<>|]/g, '_'));
      fs.writeFileSync(file, Buffer.from(String(arg.dataUrl).split(',')[1], 'base64'));
      notify('Video saved', path.basename(file));
      return file;
    }
    case 'savePhoto': {
      fs.mkdirSync(shotsDir, { recursive: true });
      const file = path.join(shotsDir, `Photo ${stamp()}.${String(arg.dataUrl).startsWith('data:image/jpeg') ? 'jpg' : 'png'}`);
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
  const busy = cap.isRecording();
  tray.setImage(icon(busy ? 'tray-red.png' : 'tray.png'));
  tray.setToolTip(busy ? 'Jhuli — recording' : 'Jhuli');
  const open = (dir) => () => { fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Jhuli (all tools)', accelerator: 'Alt+Shift+Space', click: () => openHub() },
    { type: 'separator' },
    { label: 'Capture Area', accelerator: 'Alt+Shift+1', click: () => cap.captureArea() },
    { label: 'Capture Full Screen', accelerator: 'Alt+Shift+3', click: () => takeScreenshot() },
    { label: 'Capture and Annotate', accelerator: 'Alt+Shift+4', click: () => cap.captureAnnotate() },
    { label: 'Annotate Last Screenshot', click: () => cap.annotateLast() },
    { label: 'Copy Text from Screen', accelerator: 'Alt+Shift+2', click: () => cap.captureText() },
    { label: 'Pick Colour from Screen', accelerator: 'Alt+Shift+C', click: () => cap.pickColor() },
    { label: 'Take a Photo (Camera)', click: () => openHub('camera') },
    { type: 'separator' },
    { label: cap.isRecording('screen') ? 'Stop Recording' : 'Start Screen Recording', accelerator: 'Alt+Shift+5', click: () => cap.toggle('screen') },
    { label: cap.isRecording('sound') ? 'Stop Sound Recording' : 'Start Sound Recording', accelerator: 'Alt+Shift+6', click: () => cap.toggle('sound') },
    { type: 'separator' },
    { label: 'Clipboard History', accelerator: 'Alt+Shift+V', click: () => openHub('clipboard') },
    { label: 'Quick Notes', accelerator: 'Alt+Shift+N', click: () => openHub('notes') },
    { label: 'Timer and Stopwatch', accelerator: 'Alt+Shift+T', click: () => openHub('timer') },
    { label: 'QR Code', accelerator: 'Alt+Shift+Q', click: () => openHub('qr') },
    { label: 'Image Converter', click: () => openHub('image') },
    { type: 'separator' },
    { label: 'On-screen Touch Bar', type: 'checkbox', checked: !!barWin, accelerator: 'Alt+Shift+B', click: toggleBar },
    { label: 'Phone Remote…', click: () => openHub('remote') },
    { label: 'Window', submenu: [
      { label: 'Left Half', accelerator: 'Alt+Shift+Left', click: () => input.send('snap left') },
      { label: 'Right Half', accelerator: 'Alt+Shift+Right', click: () => input.send('snap right') },
      { label: 'Full Screen', accelerator: 'Alt+Shift+Up', click: () => input.send('snap max') },
      { label: 'Centre', click: () => input.send('snap center') },
    ] },
    { label: 'Keep Awake', type: 'checkbox', checked: awakeId !== null, click: toggleAwake },
    { type: 'separator' },
    { label: 'Open Screenshots Folder', click: open(shotsDir) },
    { label: 'Open Recordings Folder', click: open(videosDir) },
    {
      label: 'Start at Login', type: 'checkbox', visible: process.platform !== 'linux',
      checked: startsAtLogin(),
      click: (item) => { setStartAtLogin(item.checked); updateTray(); },
    },
    { type: 'separator' },
    { label: `Quit Jhuli ${app.getVersion()}`, click: quit },
  ]));
}

function quit() {
  input.stop(); remote.stop();
  cap.stopAll(() => app.exit(0));
  setTimeout(() => app.exit(0), 5000);
}

function showPermissionHelp(err) {
  const mac = process.platform === 'darwin';
  const detail = (err && err.message ? err.message + '\n\n' : '') + (mac
    ? 'Allow Jhuli under System Settings → Privacy & Security → Screen & System Audio Recording (and Microphone), then quit and reopen Jhuli.'
    : 'Check that screen capture is allowed on this computer, then try again.');
  if (isTest()) { console.error('ERROR', detail); return; }
  const choice = dialog.showMessageBoxSync({
    type: 'warning', message: 'Jhuli could not capture the screen', detail,
    buttons: mac ? ['Open Settings', 'Cancel'] : ['OK'],
  });
  if (mac && choice === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
}

function showMicHelp(error) {
  const mac = process.platform === 'darwin';
  const detail = (error ? error + '\n\n' : '') + (mac
    ? 'Allow Jhuli under System Settings → Privacy & Security → Microphone, then try again.'
    : 'Check that a microphone is connected and allowed for Jhuli, then try again.');
  if (isTest()) { console.error('ERROR', detail); return; }
  const choice = dialog.showMessageBoxSync({
    type: 'warning', message: 'Jhuli could not use the microphone', detail,
    buttons: mac ? ['Open Settings', 'Cancel'] : ['OK'],
  });
  if (mac && choice === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
}

// MARK: Self-test (`Jhuli --test`): checks the capture features, the OCR and
// PDF tools inside the app, then quits with 0 when everything worked.

async function selfTest() {
  process.env.SHOTKIT_TEST = '1';
  setTimeout(() => { console.log('test timed out'); app.exit(2); }, 240000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const size = (f) => (f && fs.existsSync(f) ? fs.statSync(f).size : 0);
  const results = {};
  const note = (k, ok, info) => { results[k] = !!ok; console.log(`${k}:`, ok ? 'ok' : 'FAILED', info ?? ''); };

  const shot = await takeScreenshot(); note('screenshot', size(shot), shot);
  const area = await cap.captureArea(); note('area', size(area), area);
  const hex = await cap.pickColor(); note('colour picker', /^#[0-9A-F]{6}$/.test(hex || ''), hex);
  const annotated = await cap.annotateTest(area || shot); note('annotate', size(annotated), annotated);
  console.log('remote:', remote.info().url);

  // The hub (all tools) with OCR on a picture of known text, like Alt+Shift+2 does.
  openHub('home');
  await new Promise((r) => (hubWin.webContents.isLoading() ? hubWin.webContents.once('did-finish-load', r) : r()));
  await wait(800);
  const js = (code) => hubWin.webContents.executeJavaScript(code);
  const tools = await js('TK.tools.length'); note('tools', tools > 100, `${tools} tools`);
  const picture = await js(`(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 200); x.fillStyle = '#000'; x.font = '64px Arial'; x.fillText('Hello Jhuli 2026', 30, 120); return c.toDataURL(); })()`);
  cap.setOcrImage(picture); openHub('ocr'); broadcast('ocr');
  let text = '';
  for (let i = 0; i < 90 && !text; i++) { await wait(1000); text = await js(`(document.querySelector('#out') || {}).value || ''`); }
  note('ocr', /hello\s+jhuli/i.test(text), JSON.stringify(text));
  const pdf = await js(`(async () => { await loadScript('vendor/pdf-lib.min.js'); const d = await PDFLib.PDFDocument.create(); d.addPage([200, 200]); const bytes = await d.save(); await loadScript('vendor/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; const doc = await pdfjsLib.getDocument({ data: bytes }).promise; return doc.numPages; })()`).catch((e) => String(e));
  note('pdf', pdf === 1, pdf);
  hubWin.destroy();

  const video = await cap.recordFor('screen', 4000); note('recording', size(video), video);
  const sound = await cap.recordFor('sound', 4000); note('sound', size(sound), sound);
  const failed = Object.keys(results).filter((k) => !results[k]);
  console.log(failed.length ? `FAILED: ${failed.join(', ')}` : 'ALL OK');
  app.exit(failed.length ? 1 : 0);
}

// MARK: Start

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide(); // lives in the menu bar

  // The camera tool and the recorder ask for camera / microphone; allow them for our own pages.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'clipboard-read', 'clipboard-sanitized-write'].includes(perm)));

  // An Edit menu makes copy, paste and undo work in the windows on macOS.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' }, { role: 'windowMenu' },
  ]));

  // The installed app starts at login unless the user turned that off.
  const loginFlag = path.join(app.getPath('userData'), 'login-default-set');
  if (app.isPackaged && process.platform !== 'linux' && !process.argv.includes('--test') && !fs.existsSync(loginFlag)) {
    try { setStartAtLogin(true); fs.writeFileSync(loginFlag, '1'); } catch {}
  }

  tray = new Tray(icon('tray.png'));
  updateTray();
  tray.on('click', () => tray.popUpContextMenu());

  const keys = {
    'Alt+Shift+Space': () => openHub(), 'Alt+Shift+M': () => openHub(),
    'Alt+Shift+1': () => cap.captureArea(), 'Alt+Shift+2': () => cap.captureText(),
    'Alt+Shift+3': () => takeScreenshot(), 'Alt+Shift+4': () => cap.captureAnnotate(),
    'Alt+Shift+5': () => cap.toggle('screen'), 'Alt+Shift+6': () => cap.toggle('sound'),
    'Alt+Shift+C': () => cap.pickColor(), 'Alt+Shift+V': () => openHub('clipboard'),
    'Alt+Shift+N': () => openHub('notes'), 'Alt+Shift+T': () => openHub('timer'),
    'Alt+Shift+Q': () => openHub('qr'), 'Alt+Shift+B': toggleBar,
    'Alt+Shift+Left': () => input.send('snap left'), 'Alt+Shift+Right': () => input.send('snap right'),
    'Alt+Shift+Up': () => input.send('snap max'),
  };
  for (const [k, fn] of Object.entries(keys)) {
    try { if (!globalShortcut.register(k, fn)) devLog('shortcut taken:', k); } catch {}
  }

  loadClips();
  watchClipboard();
  startRemote().catch(() => {});

  if (process.argv.includes('--test')) return selfTest();
  if (process.argv.includes('--bar')) toggleBar();
  if (!process.argv.includes('--hidden')) openHub();
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the tray
app.on('will-quit', () => { globalShortcut.unregisterAll(); input.stop(); remote.stop(); });
