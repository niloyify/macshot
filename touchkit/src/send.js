// Send files between devices on the same Wi-Fi (like LocalSend). Jhuli runs a small
// web server; a phone (or another computer) opens its page by scanning a QR code,
// then sends files here or downloads the files offered here. A 6-digit code keeps
// strangers on the network out.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PAGE = path.join(__dirname, 'send', 'index.html');
let server = null;
let state = { port: 0, pin: '', url: '' };
let offered = []; // { id, name, size, file }
let received = []; // { name, size, file, time }
let saveDir = '';
let onReceived = () => {};

function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
  const pick = all.find((i) => /^192\.168\./.test(i.address)) || all.find((i) => /^10\./.test(i.address)) || all[0];
  return pick ? pick.address : '127.0.0.1';
}
const newPin = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
function pinOk(url) {
  const a = Buffer.from(String(url.searchParams.get('pin') || '')), b = Buffer.from(state.pin);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanName = (n) => (path.basename(String(n || 'file')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 180) || 'file');
function freeName(dir, name) {
  const { name: base, ext } = path.parse(name);
  let f = path.join(dir, name);
  for (let i = 2; fs.existsSync(f); i++) f = path.join(dir, `${base} (${i})${ext}`);
  return f;
}
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(PAGE).pipe(res);
  }
  if (!url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('Not found'); }
  if (!pinOk(url)) return json(res, 401, { error: 'Wrong code' });
  if (req.method === 'GET' && url.pathname === '/api/info') {
    return json(res, 200, { name: os.hostname(), files: offered.map(({ id, name, size }) => ({ id, name, size })) });
  }
  if (req.method === 'GET' && url.pathname === '/api/file') {
    const f = offered.find((x) => x.id === url.searchParams.get('id'));
    if (!f || !fs.existsSync(f.file)) return json(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(f.file).size, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` });
    return fs.createReadStream(f.file).pipe(res);
  }
  if (req.method === 'POST' && url.pathname === '/api/upload') {
    fs.mkdirSync(saveDir, { recursive: true });
    const name = cleanName(url.searchParams.get('name'));
    const file = freeName(saveDir, name);
    const out = fs.createWriteStream(file);
    let size = 0;
    req.on('data', (c) => { size += c.length; });
    req.pipe(out);
    out.on('finish', () => {
      const item = { name: path.basename(file), size, file, time: Date.now() };
      received.unshift(item); received = received.slice(0, 200);
      onReceived(item);
      json(res, 200, { ok: true, name: item.name, size });
    });
    out.on('error', () => json(res, 500, { error: 'Could not save' }));
    return;
  }
  json(res, 404, { error: 'Not found' });
}

async function start(dir, cb) {
  saveDir = dir; onReceived = cb || onReceived;
  if (server) return info();
  server = http.createServer(handle);
  state.pin = newPin();
  const listen = (port) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => { server.removeListener('error', reject); resolve(server.address().port); });
  });
  try { state.port = await listen(7778); } catch { server = http.createServer(handle); state.port = await listen(0); }
  state.url = `http://${lanAddress()}:${state.port}/#${state.pin}`;
  return info();
}

function offer(files) {
  for (const file of files) {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    offered.push({ id: crypto.randomBytes(6).toString('hex'), name: path.basename(file), size: fs.statSync(file).size, file });
  }
  return info();
}
function unoffer(id) { offered = offered.filter((f) => f.id !== id); return info(); }
function newCode() { state.pin = newPin(); state.url = state.url.replace(/#\d+$/, '#' + state.pin); return info(); }
function stop() { if (server) server.close(); server = null; state = { port: 0, pin: '', url: '' }; }
function info() {
  return { ...state, running: !!server, dir: saveDir,
    offered: offered.map(({ id, name, size }) => ({ id, name, size })),
    received: received.map(({ name, size, file, time }) => ({ name, size, file, time })) };
}
const qr = () => QRCode.toDataURL(state.url, { margin: 1, width: 320 });

module.exports = { start, stop, offer, unoffer, newCode, info, qr };
