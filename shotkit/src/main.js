// ShotKit: screenshot and screen recording tool for Windows, macOS and Linux.
// Lives in the system tray (menu bar on macOS).
//
//   Alt+Shift+1  take a screenshot of the whole screen
//   Alt+Shift+5  start / stop screen recording
//
// Screenshots: PNG in Pictures/ShotKit, also copied to the clipboard.
// Recordings:  video in Videos/ShotKit (Movies/ShotKit on macOS), with the
//              microphone and, where the OS allows it, the computer's sound.

const {
  app, BrowserWindow, Tray, Menu, globalShortcut, desktopCapturer, screen,
  clipboard, shell, ipcMain, nativeImage, session, Notification, dialog, systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');

const shotsDir = path.join(app.getPath('pictures'), 'ShotKit');
const videosDir = path.join(app.getPath('videos'), 'ShotKit');

let tray = null;
let recorderWin = null;
let recording = false;
let recordFile = null;
let recordStream = null;

// Only one copy of ShotKit at a time.
if (!app.requestSingleInstanceLock()) app.quit();

function icon(name) {
  const img = nativeImage.createFromPath(path.join(__dirname, 'icons', name));
  return img;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
}

// The display under the mouse pointer, so multi-screen setups capture the right one.
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
    notify('Screenshot saved', `${path.basename(file)} (also copied to the clipboard)`);
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
  notify('Recording started', 'Press Alt+Shift+5 or use the tray menu to stop.');
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

// MARK: Tray

function updateTray() {
  if (!tray) return;
  tray.setImage(icon(recording ? 'tray-red.png' : 'tray.png'));
  tray.setToolTip(recording ? 'ShotKit — recording' : 'ShotKit');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Capture Screen', accelerator: 'Alt+Shift+1', click: takeScreenshot },
    { type: 'separator' },
    { label: recording ? 'Stop Recording' : 'Start Recording', accelerator: 'Alt+Shift+5', click: toggleRecording },
    { type: 'separator' },
    { label: 'Open Screenshots Folder', click: () => { fs.mkdirSync(shotsDir, { recursive: true }); shell.openPath(shotsDir); } },
    { label: 'Open Recordings Folder', click: () => { fs.mkdirSync(videosDir, { recursive: true }); shell.openPath(videosDir); } },
    { type: 'separator' },
    { label: 'Quit ShotKit', click: quit },
  ]));
}

function quit() {
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
    ? 'Allow ShotKit under System Settings → Privacy & Security → Screen & System Audio Recording (and Microphone), then quit and reopen ShotKit.'
    : 'Check that screen capture is allowed on this computer, then try again.');
  if (process.env.SHOTKIT_TEST) { console.error('ERROR', detail); return; }
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    message: 'ShotKit could not capture the screen',
    detail,
    buttons: mac ? ['Open Settings', 'Cancel'] : ['OK'],
  });
  if (mac && choice === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
}

// MARK: Start

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide(); // menu bar only

  tray = new Tray(icon('tray.png'));
  updateTray();
  tray.on('click', () => tray.popUpContextMenu());

  globalShortcut.register('Alt+Shift+1', takeScreenshot);
  globalShortcut.register('Alt+Shift+5', toggleRecording);

  // Self-test: `ShotKit --test` takes one screenshot and records 4 seconds, then quits.
  if (process.argv.includes('--test')) {
    process.env.SHOTKIT_TEST = '1';
    const shot = await takeScreenshot();
    console.log('screenshot:', shot);
    app.testDone = (file) => {
      const size = file && fs.existsSync(file) ? fs.statSync(file).size : 0;
      console.log('recording:', file, size, 'bytes');
      app.exit(shot && size > 0 ? 0 : 1);
    };
    await startRecording();
    setTimeout(stopRecording, 4000);
    setTimeout(() => { console.log('test timed out'); app.exit(2); }, 30000);
  }
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the tray
app.on('will-quit', () => globalShortcut.unregisterAll());
