// Screen capture for the Jhuli desktop app (this is what used to be the separate
// MacShot app): full-screen and area screenshots, copy text from the screen (OCR),
// capture and annotate, colour picker, screen recording and sound-only recording.
//
// main.js creates it with a few hooks:  const cap = require('./capture')({ … })

const { app, BrowserWindow, desktopCapturer, screen, clipboard, shell, ipcMain, nativeImage, session, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');

module.exports = function capture({ shotsDir, videosDir, notify, changed, openHub, broadcast, permissionHelp, micHelp, isTest }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const preload = path.join(__dirname, 'preload.js');
  let lastShot = null;
  let pendingOcr = null;   // picture waiting for the OCR tool
  let pickedColors = [];   // colours picked with the hotkey, for the Color Picker tool

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  }

  // The display under the mouse pointer, so multi-screen setups capture the right one.
  const currentDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  async function screenSourceFor(display, thumbnailSize = { width: 0, height: 0 }) {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    return sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  }

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

  // A full-screen window over one display, for the area and colour pickers.
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

  const focusApp = () => { if (process.platform === 'darwin') app.focus({ steal: true }); };

  // MARK: Screenshots

  async function captureFull() {
    try {
      await wait(300); // let the tray menu close so it is not in the picture
      return saveImage(await grabDisplay(currentDisplay()));
    } catch (err) { permissionHelp(err); return null; }
  }

  let areaWin = null;
  let areaResolve = null;

  // Freezes the screen under the pointer, lets the user drag a rectangle and returns
  // that part of the picture (null when cancelled). `mode` only changes the hint.
  async function pickArea(mode = 'shot') {
    if (areaWin) return null;
    await wait(300);
    const display = currentDisplay();
    const picture = await grabDisplay(display);
    try {
      areaWin = overlayWindow(display, 'area.html', { mode });
      areaWin.once('ready-to-show', () => {
        areaWin.show(); areaWin.focus();
        if (isTest()) setTimeout(() => areaResolve && areaResolve({ x: 100, y: 100, width: 400, height: 300 }), 800);
      });
      const rect = await new Promise((resolve) => { areaResolve = resolve; areaWin.on('closed', () => resolve(null)); });
      if (!rect) return null;
      const s = picture.getSize().width / display.bounds.width; // pixels per screen point
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
    try { const image = await pickArea('shot'); return image ? saveImage(image) : null; }
    catch (err) { permissionHelp(err); return null; }
  }

  // Choose an area; the OCR tool reads the text in it and copies it.
  async function captureText() {
    try {
      const image = await pickArea('text');
      if (!image) return;
      pendingOcr = image.toDataURL();
      openHub('ocr');
      broadcast('ocr');
    } catch (err) { permissionHelp(err); }
  }

  async function captureAnnotate() {
    try { const image = await pickArea('annotate'); if (image) openAnnotate(image); }
    catch (err) { permissionHelp(err); }
  }

  function annotateLast() {
    let file = lastShot && fs.existsSync(lastShot) ? lastShot : null;
    if (!file) {
      try {
        file = fs.readdirSync(shotsDir).filter((f) => f.endsWith('.png')).map((f) => path.join(shotsDir, f))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      } catch {}
    }
    if (!file) {
      const picked = dialog.showOpenDialogSync({ title: 'Choose a picture to annotate', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] });
      file = picked && picked[0];
    }
    if (file) openAnnotate(nativeImage.createFromPath(file));
  }

  // MARK: Annotate window

  let annotateWin = null;
  let annotateDone = null; // self-test waits for the saved file
  function openAnnotate(image) {
    if (!image || image.isEmpty()) return null;
    const dataURL = image.toDataURL();
    const { width, height } = image.getSize();
    const display = currentDisplay();
    const area = display.workArea;
    const w = Math.min(area.width - 40, Math.max(760, Math.round(width / display.scaleFactor) + 40));
    const h = Math.min(area.height - 40, Math.max(540, Math.round(height / display.scaleFactor) + 120));
    if (annotateWin && !annotateWin.isDestroyed()) annotateWin.destroy();
    const win = new BrowserWindow({ width: w, height: h, title: 'Jhuli Annotate', show: false, backgroundColor: '#1e1f22', webPreferences: { preload } });
    annotateWin = win;
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'annotate.html'), { query: isTest() ? { test: '1' } : {} });
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
      pickerWin = overlayWindow(display, 'picker.html', isTest() ? { test: '1' } : {});
      pickerWin.webContents.once('did-finish-load', () => pickerWin.webContents.send('picker-image', picture.toDataURL()));
      pickerWin.once('ready-to-show', () => { pickerWin.show(); pickerWin.focus(); });
      const hex = await new Promise((resolve) => { pickerResolve = resolve; pickerWin.on('closed', () => resolve(null)); });
      if (!hex) return null;
      clipboard.writeText(hex);
      pickedColors.push(hex);
      broadcast('color');
      notify('Colour copied', `${hex} is on the clipboard`);
      return hex;
    } catch (err) { permissionHelp(err); return null; }
    finally {
      if (pickerWin && !pickerWin.isDestroyed()) pickerWin.destroy();
      pickerWin = null; pickerResolve = null;
    }
  }
  ipcMain.handle('color-picked', (_e, hex) => { if (pickerResolve) pickerResolve(hex); pickerResolve = null; });

  // Pages using the shared preload call 'tool:<name>'.
  ipcMain.handle('tool:annotate-save', (_e, dataURL, copyOnly) => {
    const image = nativeImage.createFromDataURL(dataURL);
    if (copyOnly) { clipboard.writeImage(image); notify('Copied', 'The picture is on the clipboard'); return null; }
    return saveImage(image, 'Annotated');
  });
  ipcMain.handle('tool:test-done', (_e, result) => { if (annotateDone) annotateDone(result); annotateDone = null; });

  // MARK: Recording (screen or sound only; both can run at once)

  const rec = {
    screen: { on: false, win: null, file: null, stream: null, done: null },
    sound: { on: false, win: null, file: null, stream: null, done: null },
  };

  async function startRecording(kind) {
    const r = rec[kind];
    if (r.on) return;
    if (process.platform === 'darwin') {
      // Ask for the microphone; screen recording still works without it.
      let ok = true;
      try { ok = await systemPreferences.askForMediaAccess('microphone'); } catch {}
      if (!ok && kind === 'sound') return micHelp();
    }
    if (kind === 'screen') {
      const source = await screenSourceFor(currentDisplay());
      if (!source) return permissionHelp(new Error('No screen was found to record.'));
      // The recorder page asks with getDisplayMedia; answer with this screen.
      // 'loopback' adds the computer's own sound (Windows; ignored elsewhere).
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        callback(process.platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source });
      });
    }
    fs.mkdirSync(videosDir, { recursive: true });
    r.on = true;
    changed();
    r.win = new BrowserWindow({ show: false, webPreferences: { preload, backgroundThrottling: false } });
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
      `Press ${kind === 'sound' ? 'Alt+Shift+6' : 'Alt+Shift+5'} or use the tray menu to stop.`);
  });
  ipcMain.handle('recording-chunk', (_e, kind, data) => { const r = rec[kind]; if (r.stream) r.stream.write(Buffer.from(data)); });
  ipcMain.handle('recording-stopped', async (_e, kind, error) => {
    const r = rec[kind];
    const file = r.file;
    await new Promise((done) => (r.stream ? r.stream.end(done) : done()));
    Object.assign(r, { on: false, file: null, stream: null });
    if (r.win) { r.win.destroy(); r.win = null; }
    changed();
    const finished = r.done; r.done = null;
    if (error) {
      if (kind === 'sound') micHelp(error); else permissionHelp(new Error(error));
      if (finished) finished(null);
      return;
    }
    if (file && fs.existsSync(file)) {
      notify(kind === 'sound' ? 'Sound saved' : 'Recording saved', path.basename(file));
      if (!isTest()) shell.showItemInFolder(file);
    }
    if (finished) finished(file);
  });

  const recordFor = (kind, ms) => new Promise((resolve) => {
    rec[kind].done = resolve;
    startRecording(kind).then(() => setTimeout(() => stopRecording(kind), ms));
  });

  // Stops whatever is recording, then calls back (used when quitting).
  function stopAll(callback) {
    const running = ['screen', 'sound'].filter((k) => rec[k].on);
    if (!running.length) return callback();
    let left = running.length;
    for (const k of running) { rec[k].done = () => { if (--left === 0) callback(); }; stopRecording(k); }
  }

  // Self-test pieces that need a page: annotate draws and saves by itself.
  const annotateTest = (file) => new Promise((resolve) => {
    annotateDone = resolve;
    openAnnotate(nativeImage.createFromPath(file));
  }).finally(() => { if (annotateWin) annotateWin.destroy(); });

  return {
    captureFull, captureArea, captureText, captureAnnotate, annotateLast, pickColor, toggle, stopAll, recordFor, annotateTest,
    annotateDataUrl: (dataURL) => openAnnotate(nativeImage.createFromDataURL(String(dataURL))),
    isRecording: (kind) => (kind ? rec[kind].on : rec.screen.on || rec.sound.on),
    setOcrImage: (dataURL) => { pendingOcr = dataURL; },
    takeOcrImage: () => { const d = pendingOcr; pendingOcr = null; return d; },
    takePickedColors: () => { const c = pickedColors; pickedColors = []; return c; },
  };
};
