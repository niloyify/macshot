// Phone remote: a small web server on the local network. A phone opens the page
// (by scanning the QR code), and its touches arrive here over a WebSocket.
// Only devices that know the 6-digit code shown on the computer can connect.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PAGE_DIR = path.join(__dirname, 'phone');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let server = null;
let wss = null;
let state = { port: 0, pin: '', url: '', clients: 0 };

function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
  // Prefer the usual home / office network ranges.
  const pick = all.find((i) => /^192\.168\./.test(i.address)) || all.find((i) => /^10\./.test(i.address)) || all[0];
  return pick ? pick.address : '127.0.0.1';
}

function newPin() { return String(crypto.randomInt(0, 1e6)).padStart(6, '0'); }

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function listen(port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => { server.removeListener('error', reject); resolve(server.address().port); });
  });
}

/**
 * @param {(msg: object) => void} onMessage  called for every command from a phone
 * @param {() => void} onChange  called when a phone connects or leaves
 */
async function start(onMessage, onChange) {
  if (server) return state;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PAGE_DIR, file);
    if (!full.startsWith(PAGE_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  });
  wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws' || !safeEqual(url.searchParams.get('pin') || '', state.pin)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      state.clients++; onChange && onChange();
      ws.send(JSON.stringify({ t: 'hello', name: os.hostname(), platform: process.platform }));
      ws.on('message', (data) => {
        try { onMessage(JSON.parse(data), (reply) => ws.send(JSON.stringify(reply))); } catch {}
      });
      ws.on('close', () => { state.clients--; onChange && onChange(); });
    });
  });
  state.pin = newPin();
  try { state.port = await listen(7777); } catch { state.port = await listen(0); }
  state.url = `http://${lanAddress()}:${state.port}/#${state.pin}`;
  return state;
}

async function qr() {
  return QRCode.toDataURL(state.url, { margin: 1, width: 320 });
}

function newCode() {
  state.pin = newPin();
  state.url = state.url.replace(/#\d+$/, '#' + state.pin);
  // Drop phones that used the old code.
  if (wss) wss.clients.forEach((c) => c.close());
}

function stop() {
  if (wss) wss.clients.forEach((c) => c.terminate());
  if (server) server.close();
  server = null; wss = null; state = { port: 0, pin: '', url: '', clients: 0 };
}

module.exports = { start, stop, qr, newCode, info: () => ({ ...state, running: !!server }) };
