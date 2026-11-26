// MacShot (universal): screenshots, screen recording and sound recording for
// Windows, macOS and Linux. Lives in the system tray (menu bar on macOS);
// the tray icon is a pair of eyes that turns red while recording.
//
//   Alt+Shift+1  capture an area (drag a rectangle)
//   Alt+Shift+3  capture the whole screen
//   Alt+Shift+5  start / stop screen recording
//   Alt+Shift+6  start / stop sound recording (microphone only)
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
const videosDir = path.join(app.getPath('videos'), 'MacShot');
const TEST = () => !!process.env.MACSHOT_TEST;

let tray = null;

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

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
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

function saveImage(image) {
  fs.mkdirSync(shotsDir, { recursive: true });
  const file = path.join(shotsDir, `Screenshot ${stamp()}.png`);
  fs.writeFileSync(file, image.toPNG());
  clipboard.writeImage(image);
  notify('Screenshot saved', `${path.basename(file)} (also copied to the clipboard)`);
  return file;
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

async function captureArea() {
  if (areaWin) return null;
  try {
    await wait(300);
    const display = currentDisplay();
    const picture = await grabDisplay(display); // taken before the picker appears
    const { x, y, width, height } = display.bounds;
    areaWin = new BrowserWindow({
      x, y, width, height, frame: false, transparent: true, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, enableLargerThanScreen: true,
      fullscreenable: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    areaWin.setAlwaysOnTop(true, 'screen-saver');
    areaWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    areaWin.loadFile(path.join(__dirname, 'area.html'));
    areaWin.once('ready-to-show', () => {
      areaWin.show(); areaWin.focus();
      // Self-test picks a fixed 400 × 300 area by itself.
      if (TEST()) setTimeout(() => areaResolve && areaResolve({ x: 100, y: 100, width: 400, height: 300 }), 800);
    });
    const rect = await new Promise((resolve) => {
      areaResolve = resolve;
      areaWin.on('closed', () => resolve(null));
    });
    if (areaWin && !areaWin.isDestroyed()) areaWin.destroy();
    areaWin = null;
    if (!rect) return null;
    const s = picture.getSize().width / width; // pixels per screen point
    const crop = {
      x: Math.round(rect.x * s), y: Math.round(rect.y * s),
      width: Math.round(rect.width * s), height: Math.round(rect.height * s),
    };
    return saveImage(picture.crop(crop));
  } catch (err) {
    if (areaWin && !areaWin.isDestroyed()) areaWin.destroy();
    areaWin = null;
    showPermissionHelp(err);
    return null;
  }
}

ipcMain.handle('area-picked', (_e, rect) => { if (areaResolve) areaResolve(rect); areaResolve = null; });

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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
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
    { type: 'separator' },
    { label: rec.screen.on ? 'Stop Recording' : 'Start Recording', accelerator: 'Alt+Shift+5', click: () => toggle('screen') },
    { label: rec.sound.on ? 'Stop Sound Recording' : 'Start Sound Recording', accelerator: 'Alt+Shift+6', click: () => toggle('sound') },
    { type: 'separator' },
    { label: 'Open Screenshots Folder', click: open(shotsDir) },
    { label: 'Open Recordings Folder', click: open(videosDir) },
    { type: 'separator' },
    {
      label: 'Start at Login', type: 'checkbox', visible: process.platform !== 'linux',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: 'Quit MacShot', click: quit },
  ]));
}

function quit() {
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

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide(); // menu bar only

  tray = new Tray(icon('tray.png'));
  updateTray();
  if (process.platform !== 'darwin') tray.on('click', () => tray.popUpContextMenu());

  globalShortcut.register('Alt+Shift+1', () => captureArea());
  globalShortcut.register('Alt+Shift+3', () => captureFull());
  globalShortcut.register('Alt+Shift+5', () => toggle('screen'));
  globalShortcut.register('Alt+Shift+6', () => toggle('sound'));

  // Self-test: `MacShot --test` takes a full and an area screenshot, records 4 s of screen
  // and 4 s of sound, prints the files and quits.
  if (process.argv.includes('--test')) {
    process.env.MACSHOT_TEST = '1';
    setTimeout(() => { console.log('test timed out'); app.exit(2); }, 60000);
    const size = (f) => (f && fs.existsSync(f) ? fs.statSync(f).size : 0);
    const shot = await captureFull();
    console.log('screenshot:', shot, size(shot), 'bytes');
    const area = await captureArea();
    console.log('area:', area, size(area), 'bytes');
    const video = await recordFor('screen', 4000);
    console.log('recording:', video, size(video), 'bytes');
    const sound = await recordFor('sound', 4000);
    console.log('sound:', sound, size(sound), 'bytes');
    app.exit(size(shot) && size(area) && size(video) && size(sound) ? 0 : 1);
  }
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the tray
app.on('will-quit', () => globalShortcut.unregisterAll());
