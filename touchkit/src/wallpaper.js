// Wallpaper changer (like Unsplash Wallpapers): downloads a free photo from
// picsum.photos (photos from Unsplash) and sets it as the desktop picture,
// by hand or once a day.
const { net, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 30000 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout).trim())));
});

// JavaScript for Automation talks to macOS directly (no extra permission needed).
const macSet = (file) => run('osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit');
const url = $.NSURL.fileURLWithPath(${JSON.stringify(file)});
const screens = $.NSScreen.screens; let ok = true;
for (let i = 0; i < screens.count; i++) ok = $.NSWorkspace.sharedWorkspace.setDesktopImageURLForScreenOptionsError(url, screens.objectAtIndex(i), $({}), null) && ok;
ok ? 'ok' : 'failed';`]);
const macGet = () => run('osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit');
$.NSWorkspace.sharedWorkspace.desktopImageURLForScreen($.NSScreen.mainScreen).path.js`]);

const winScript = (file) => `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class W { [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int SystemParametersInfo(int a, int b, string c, int d); }'; [W]::SystemParametersInfo(20, 0, '${file.replace(/'/g, "''")}', 3)`;

async function setWallpaper(file) {
  if (process.platform === 'darwin') { const r = await macSet(file); if (r !== 'ok') throw new Error('macOS did not accept the picture'); return; }
  if (process.platform === 'win32') { await run('powershell', ['-NoProfile', '-Command', winScript(file)]); return; }
  const uri = 'file://' + file; // GNOME, Ubuntu, Cinnamon and similar
  try { await run('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri', uri]); } catch {}
  try { await run('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri]); } catch {}
}

async function currentWallpaper() {
  try {
    if (process.platform === 'darwin') return await macGet();
    if (process.platform === 'linux') return (await run('gsettings', ['get', 'org.gnome.desktop.background', 'picture-uri'])).replace(/^'file:\/\/|'$/g, '');
  } catch {}
  return '';
}

// Downloads a new photo the size of the main screen and sets it.
async function newWallpaper(dir, topic) {
  const d = screen.getPrimaryDisplay();
  const w = Math.min(3840, Math.round(d.size.width * d.scaleFactor));
  const h = Math.min(2400, Math.round(d.size.height * d.scaleFactor));
  const res = await net.fetch(`https://picsum.photos/${w}/${h}${topic === 'gray' ? '?grayscale' : ''}`);
  if (!res.ok) throw new Error('Could not download a picture (' + res.status + ')');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error('The downloaded picture is too small');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(dir, `Wallpaper ${stamp}.jpg`);
  fs.writeFileSync(file, buf);
  // Keep the newest 30 pictures.
  const old = fs.readdirSync(dir).filter((f) => f.startsWith('Wallpaper ')).sort().reverse().slice(30);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  await setWallpaper(file);
  return file;
}

module.exports = { newWallpaper, setWallpaper, currentWallpaper };
