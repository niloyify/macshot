// Digital safety and file tools. Everything runs on the device; nothing is uploaded
// unless a tool says so (speed test, leaked-password check, OCR language download).
/* global calcTool, logTool, rowsEditor, tool, head, add, $, $$, esc, store, result, num, taka, today, toast, copy, tk, LETTERS */

// Load a script from vendor/ once (big libraries load only when their tool opens).
const loaded = {};
function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }));
}
const fileBytes = (f) => f.arrayBuffer().then((b) => new Uint8Array(b));
const download = (name, data, type) => { const r = new FileReader(); r.onload = () => tk.call('saveAs', { name, dataUrl: r.result }); r.readAsDataURL(data instanceof Blob ? data : new Blob([data], { type })); };
const kb = (n) => (n > 1048576 ? `${num(n / 1048576, 1)} MB` : `${num(n / 1024, 0)} KB`);

// MARK: Password strength
const COMMON = ['123456', 'password', '12345678', 'qwerty', '111111', '123123', 'abc123', 'iloveyou', 'admin', 'welcome', 'bangladesh', 'dhaka', 'allah', 'bismillah', 'pakhi', 'sonia', 'shakib', 'tamim', 'football', 'cricket', 'monkey', 'dragon', 'letmein', 'love', 'pass'];
tool({ id: 'pwcheck', name: 'Password Strength Check', icon: '🛡', group: 'Safety & Files', desc: 'How long would it take to crack your password?',
  render(el) {
    head(el, this, 'Your password stays on this device. Only the optional leak check sends the first 5 characters of a scrambled code (never the password).');
    const p = add(el, '<div class="panel row"><input type="password" id="pw" class="grow" placeholder="Type a password" autocomplete="off" style="font-size:18px"><button id="show">👁</button><button id="leak">Check if leaked</button></div><div id="r"></div>');
    const run = () => {
      const pw = $(p, '#pw').value; if (!pw) { $(el, '#r').innerHTML = result({ tip: 'A long sentence you can remember (like "my-cat-eats-rice-at-9pm") is stronger than a short messy password.' }); return; }
      let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
      let bits = pw.length * Math.log2(pool || 1); const bad = [];
      const low = pw.toLowerCase();
      if (COMMON.some((w) => low.includes(w))) { bits = Math.min(bits, 20); bad.push('Contains a very common word or number'); }
      if (/(.)\1{2,}/.test(pw)) { bits -= 10; bad.push('Same character repeated'); }
      if (/(012|123|234|345|456|567|678|789|abc|qwe|asd)/i.test(pw)) { bits -= 10; bad.push('Has a simple sequence (123, abc, qwe)'); }
      if (/(19|20)\d\d/.test(pw)) { bits -= 8; bad.push('Has a year — maybe your birth year?'); }
      if (/01[3-9]\d{8}/.test(pw)) { bits = Math.min(bits, 25); bad.push('Looks like a phone number'); }
      if (pw.length < 10) bad.push('Shorter than 10 characters');
      const secs = 2 ** Math.max(0, bits) / 1e10; // fast offline attack: 10 billion guesses per second
      const t = secs < 1 ? 'Instantly' : secs < 3600 ? `${num(secs / 60, 0)} minutes` : secs < 86400 * 365 ? `${num(secs / 86400, 0)} days` : secs < 3.15e7 * 1e6 ? `${num(secs / 3.15e7, 0)} years` : 'Millions of years';
      const lvl = bits < 35 ? ['Weak', 'bad'] : bits < 60 ? ['OK', 'warn'] : ['Strong', 'ok'];
      $(el, '#r').innerHTML = result({ cards: [['Strength', lvl[0]], ['Time to crack', t, 'by a fast computer'], ['Length', `${pw.length} characters`]], warn: bad.join(' · '), tip: 'Use a different password for every account and turn on two-step verification (2FA) for email, Facebook and bKash.' });
    };
    $(p, '#pw').oninput = run;
    $(p, '#show').onclick = () => { const i = $(p, '#pw'); i.type = i.type === 'password' ? 'text' : 'password'; };
    $(p, '#leak').onclick = async () => {
      const pw = $(p, '#pw').value; if (!pw) return toast('Type a password first');
      try {
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const txt = await (await fetch('https://api.pwnedpasswords.com/range/' + h.slice(0, 5))).text();
        const line = txt.split('\n').find((l) => l.startsWith(h.slice(5)));
        const n = line ? +line.split(':')[1] : 0;
        add($(el, '#r'), result(n ? { warn: `⚠️ This password was found in ${num(n, 0)} data leaks. Do not use it anywhere — change it now.` } : { tip: '✅ Not found in known leaks.' }));
      } catch { toast('No internet — could not check'); }
    };
    run();
  } });

// MARK: Scam link checker
const BRANDS = { bkash: ['bkash.com'], nagad: ['nagad.com.bd'], rocket: ['dutchbanglabank.com'], facebook: ['facebook.com', 'fb.com', 'fb.me'], google: ['google.com', 'goo.gl'], gmail: ['google.com', 'gmail.com'], whatsapp: ['whatsapp.com', 'wa.me'], instagram: ['instagram.com'], youtube: ['youtube.com', 'youtu.be'], daraz: ['daraz.com.bd'], grameenphone: ['grameenphone.com'], robi: ['robi.com.bd'], banglalink: ['banglalink.net'], sonalibank: ['sonalibank.com.bd'], islamibank: ['islamibankbd.com'], bracbank: ['bracbank.com'], paypal: ['paypal.com'], binance: ['binance.com'], kucoin: ['kucoin.com'], microsoft: ['microsoft.com', 'live.com'], apple: ['apple.com', 'icloud.com'], netflix: ['netflix.com'], amazon: ['amazon.com'], telegram: ['telegram.org', 't.me'] };
const SHORT = ['bit.ly', 'tinyurl.com', 'cutt.ly', 't.co', 'rb.gy', 'is.gd', 'ow.ly', 'shorturl.at', 'tiny.cc', 'rebrand.ly', 's.id', 'v.gd'];
const BADTLD = ['xyz', 'top', 'click', 'live', 'buzz', 'icu', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'rest', 'cam', 'monster', 'sbs', 'cfd', 'quest', 'bond'];
tool({ id: 'linkcheck', name: 'Scam Link Checker', icon: '🎣', group: 'Safety & Files', desc: 'Is this link real or a phishing trap? Check before you click',
  render(el) {
    head(el, this, 'Paste a link from SMS, WhatsApp, Messenger or email. TouchKit checks it on your device — it does not open it.');
    const p = add(el, '<div class="panel"><input type="text" id="u" style="width:100%;font-size:16px" placeholder="https://…"></div><div id="r"></div>');
    const run = () => {
      let raw = $(p, '#u').value.trim(); if (!raw) { $(el, '#r').innerHTML = result({ tip: 'Never give your PIN, OTP or password through a link. bKash, Nagad and banks never ask for them.' }); return; }
      if (!/^[a-z]+:\/\//i.test(raw)) raw = 'http://' + raw;
      let u; try { u = new URL(raw); } catch { $(el, '#r').innerHTML = result({ warn: 'This is not a valid link.' }); return; }
      const host = u.hostname.toLowerCase(); const flags = []; let score = 0;
      const flag = (pts, msg) => { score += pts; flags.push([pts >= 3 ? '🔴' : '🟡', msg]); };
      if (u.protocol !== 'https:') flag(2, 'Not secure (no https) — never enter passwords here');
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) flag(4, 'Uses a number (IP address) instead of a name');
      if (host.includes('xn--')) flag(4, 'Uses look-alike letters from other alphabets');
      if (u.username || raw.includes('@')) flag(3, 'Has an @ — the real site is after it');
      if (SHORT.some((s) => host === s || host.endsWith('.' + s))) flag(2, 'Short link — hides where it really goes');
      if (BADTLD.includes(host.split('.').pop())) flag(2, `Ends in .${host.split('.').pop()} — cheap domains often used by scammers`);
      if (host.split('.').length > 4) flag(2, 'Many parts in the name (e.g. bkash.com.login.xyz)');
      if (/(login|verify|secure|update|bonus|free|gift|lottery|prize|offer|reward|claim|win|kyc|unlock|suspend)/.test(host)) flag(2, 'Name has bait words (verify, bonus, prize, gift…)');
      const clean = host.replace(/0/g, 'o').replace(/1/g, 'l').replace(/-/g, '');
      for (const [b, ok] of Object.entries(BRANDS)) if (clean.includes(b) && !ok.some((d) => host === d || host.endsWith('.' + d))) flag(5, `Pretends to be ${b} but is not ${ok[0]}`);
      if (raw.length > 120) flag(1, 'Very long link');
      const lvl = score >= 5 ? ['Dangerous — do not open', 'bad'] : score >= 2 ? ['Suspicious — be careful', 'warn'] : ['No red flags found', 'ok'];
      $(el, '#r').innerHTML = result({ cards: [['Result', lvl[0]], ['Real website', host]] }) + (flags.length ? `<div class="panel"><b>Why</b><ul>${flags.map(([i, m]) => `<li>${i} ${esc(m)}</li>`).join('')}</ul></div>` : '') + result({ tip: 'Even a clean-looking link can be fake. If a message says you won a prize, your account is blocked, or someone sent money by mistake — it is almost always a scam. Call the official number instead.' });
    };
    $(p, '#u').oninput = run; run();
  } });

// MARK: Photo privacy (EXIF)
function readExif(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2; while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null; const mk = bytes[i + 1]; const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (mk === 0xe1 && String.fromCharCode(...bytes.slice(i + 4, i + 8)) === 'Exif') {
      const t = i + 10; const dv = new DataView(bytes.buffer, bytes.byteOffset + t); const le = dv.getUint16(0) === 0x4949;
      const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
      const ifd = (off) => { const out = {}; const n = u16(off); for (let k = 0; k < n; k++) { const e = off + 2 + k * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), val: e + 8 }; } return out; };
      const str = (e) => { const o = e.count > 4 ? u32(e.val) : e.val; let s = ''; for (let k = 0; k < e.count - 1; k++) s += String.fromCharCode(dv.getUint8(o + k)); return s.trim(); };
      const rats = (e) => { const o = u32(e.val); return [0, 1, 2].map((k) => u32(o + k * 8) / (u32(o + k * 8 + 4) || 1)); };
      const r = {}; const main = ifd(u32(4));
      if (main[0x010f]) r.make = str(main[0x010f]); if (main[0x0110]) r.model = str(main[0x0110]);
      if (main[0x8769]) { const ex = ifd(u32(main[0x8769].val)); if (ex[0x9003]) r.date = str(ex[0x9003]); }
      if (main[0x8825]) { const g = ifd(u32(main[0x8825].val)); if (g[2] && g[4]) { const d = (a) => a[0] + a[1] / 60 + a[2] / 3600; r.lat = d(rats(g[2])) * (str(g[1]) === 'S' ? -1 : 1); r.lng = d(rats(g[4])) * (str(g[3]) === 'W' ? -1 : 1); } }
      return r;
    }
    i += 2 + len;
  }
  return null;
}
tool({ id: 'photoprivacy', name: 'Photo Privacy', icon: '📍', group: 'Safety & Files', desc: 'See and remove hidden location and phone details from photos',
  render(el) {
    head(el, this, 'Photos from phones often hide your exact home location. Clean them before posting or sending to strangers.');
    const p = add(el, '<div class="panel"><input type="file" id="f" accept="image/*" multiple></div><div id="r"></div>');
    $(p, '#f').onchange = async (e) => {
      const box = $(el, '#r'); box.innerHTML = '';
      for (const f of e.target.files) {
        let info = null; try { info = readExif(await fileBytes(f)); } catch {}
        const row = add(box, `<div class="panel row"><img src="${URL.createObjectURL(f)}" style="width:90px;height:90px;object-fit:cover;border-radius:10px"><div class="grow"><b>${esc(f.name)}</b><br>${info && info.lat != null ? `<span class="pill bad">📍 Has location</span> <a href="https://maps.google.com/?q=${info.lat},${info.lng}" target="_blank" rel="noopener">${num(info.lat, 5)}, ${num(info.lng, 5)}</a>` : '<span class="pill ok">No location</span>'}<div class="muted">${esc([info?.make, info?.model, info?.date].filter(Boolean).join(' · ') || 'No camera details')}</div></div><button class="primary">Save clean copy</button></div>`);
        row.querySelector('button').onclick = async () => {
          const img = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
          const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)); download(f.name.replace(/\.\w+$/, '') + '-clean.jpg', blob); toast('Clean copy saved');
        };
      }
    };
  } });

// MARK: Checksum
tool({ id: 'checksum', name: 'File Checksum', icon: '🔐', group: 'Safety & Files', desc: 'Check a downloaded file is genuine (SHA-256)',
  render(el) {
    head(el, this, 'Websites often show a SHA-256 code for downloads. If your code matches, the file is genuine and not damaged.');
    const p = add(el, '<div class="panel grid2"><div class="field"><label>File</label><input type="file" id="f"></div><div class="field"><label>Code from the website (optional)</label><input type="text" id="x" placeholder="paste SHA-256 here"></div></div><div id="r"></div>');
    let got = {};
    const show = () => { const x = $(p, '#x').value.trim().toLowerCase(); const m = x && Object.values(got).includes(x); $(el, '#r').innerHTML = got.sha256 ? result({ cards: [['SHA-256', got.sha256], ['SHA-1', got.sha1], ...(x ? [['Match?', m ? '✅ Yes — genuine' : '❌ No — do not open']] : [])], flat: true }) + '<button id="c">Copy SHA-256</button>' : ''; const c = $(el, '#c'); if (c) c.onclick = () => copy(got.sha256); };
    $(p, '#f').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return; if (f.size > 1.5e9) return toast('File too big for the browser (1.5 GB max)');
      $(el, '#r').textContent = 'Working…'; const b = await f.arrayBuffer();
      const hex = async (a) => [...new Uint8Array(await crypto.subtle.digest(a, b))].map((x) => x.toString(16).padStart(2, '0')).join('');
      got = { sha256: await hex('SHA-256'), sha1: await hex('SHA-1') }; show();
    };
    $(p, '#x').oninput = show;
  } });

// MARK: Speed test
tool({ id: 'speed', name: 'Internet Speed Test', icon: '🚀', group: 'Safety & Files', desc: 'Download, upload speed and ping',
  render(el) {
    head(el, this, 'Uses Cloudflare’s speed servers. Uses about 40 MB of data.');
    const p = add(el, '<div class="panel" style="text-align:center"><div class="big-num" id="v">—</div><p class="muted" id="m">Mbps</p><button class="primary big" id="go">Start test</button></div><div id="r"></div>');
    const base = 'https://speed.cloudflare.com/';
    const dl = async (bytes) => { const t = performance.now(); const r = await fetch(`${base}__down?bytes=${bytes}`, { cache: 'no-store' }); await r.arrayBuffer(); return bytes * 8 / ((performance.now() - t) / 1000) / 1e6; };
    const ul = async (bytes) => { const body = new Uint8Array(bytes); const t = performance.now(); await fetch(`${base}__up`, { method: 'POST', body, cache: 'no-store' }); return bytes * 8 / ((performance.now() - t) / 1000) / 1e6; };
    $(p, '#go').onclick = async () => {
      const b = $(p, '#go'); b.disabled = true; const v = $(p, '#v'), m = $(p, '#m');
      try {
        m.textContent = 'Ping…'; const pings = []; for (let i = 0; i < 5; i++) { const t = performance.now(); await fetch(`${base}__down?bytes=0`, { cache: 'no-store' }); pings.push(performance.now() - t); }
        const ping = Math.min(...pings);
        m.textContent = 'Download…'; let d = 0; for (const s of [1e6, 5e6, 1e7, 2.5e7]) { d = Math.max(d, await dl(s)); v.textContent = num(d, 1); }
        m.textContent = 'Upload…'; let u = 0; for (const s of [5e5, 2e6, 5e6]) { u = Math.max(u, await ul(s)); v.textContent = num(u, 1); }
        v.textContent = num(d, 1); m.textContent = 'Mbps download';
        $(el, '#r').innerHTML = result({ cards: [['Download', `${num(d, 1)} Mbps`], ['Upload', `${num(u, 1)} Mbps`], ['Ping', `${num(ping, 0)} ms`]], tip: d < 5 ? 'Slow: fine for WhatsApp and browsing, not for HD video.' : d < 25 ? 'Good: HD video and video calls work.' : 'Fast: 4K video, big downloads, many devices.' });
      } catch { m.textContent = 'Could not reach the test server. Check your internet.'; }
      b.disabled = false;
    };
  } });

// MARK: Data pack compare
tool({ id: 'datapack', name: 'Data Pack Compare', icon: '📶', group: 'Safety & Files', desc: 'Which internet pack is the best value for you',
  render(el) {
    head(el, this, 'Copy packs from the operator app. TouchKit finds the cheapest way to get the data you use in a month.');
    const s = store.get('datapack', { need: 30 });
    const p = add(el, `<div class="panel"><div class="field"><label>Data you use per month (GB)</label><input type="number" id="n" value="${s.need}" style="width:120px"></div><div id="t" style="margin-top:12px"></div></div>`); const out = add(el, '<div></div>'); let rows = [];
    const calc = () => {
      s.need = +$(p, '#n').value || 1; store.set('datapack', s);
      const per = rows.filter((r) => r.price && r.gb && r.days).map((r) => { const packs = Math.max(Math.ceil(30 / r.days), Math.ceil(s.need / r.gb)); return { ...r, gbp: r.price / r.gb, month: packs * r.price, packs }; });
      const best = per.reduce((a, b) => (!a || b.month < a.month ? b : a), null);
      out.innerHTML = result({ cards: best ? [['Best for you', best.name || '?', `${taka(best.month)} a month (${best.packs} × pack)`]] : [], table: { head: ['Pack', 'Per GB', 'Monthly cost for you'], rows: per.map((r) => [r.name + (r === best ? ' ✅' : ''), taka(r.gbp, 1), taka(r.month)]) } });
    };
    rowsEditor($(p, '#t'), 'datapack.rows', [{ k: 'name', l: 'Pack', type: 'text', w: 130 }, { k: 'price', l: 'Price', w: 70 }, { k: 'gb', l: 'GB', w: 60 }, { k: 'days', l: 'Days', w: 60 }],
      [{ name: '7-day 10 GB', price: 199, gb: 10, days: 7 }, { name: '30-day 30 GB', price: 499, gb: 30, days: 30 }, { name: '30-day 60 GB', price: 699, gb: 60, days: 30 }], (r) => { rows = r; calc(); });
    $(p, '#n').oninput = calc;
  } });

// MARK: PDF tools (pdf-lib and pdf.js load only when needed)
const needPdfLib = () => loadScript('vendor/pdf-lib.min.js').then(() => window.PDFLib);
const needPdfJs = () => loadScript('vendor/pdf.min.js').then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; return window.pdfjsLib; });
tool({ id: 'pdfmerge', name: 'PDF Merge & Split', icon: '📑', group: 'Safety & Files', desc: 'Join PDFs into one, or take out the pages you need',
  render(el) {
    head(el, this, 'Nothing is uploaded — it all happens on your device.');
    const p = add(el, `<div class="grid2"><div class="panel"><b>Merge</b><p class="muted">Pick PDFs in the order you want.</p><input type="file" id="m" accept="application/pdf" multiple><div class="list" id="ml" style="margin:10px 0"></div><button class="primary" id="mg" disabled>Merge into one PDF</button></div>
      <div class="panel"><b>Split / pick pages</b><p class="muted">e.g. <span class="mono">1-3, 5, 8-</span></p><input type="file" id="s" accept="application/pdf"><div class="field" style="margin-top:10px"><label>Pages</label><input type="text" id="pg" placeholder="1-3, 5"></div><div class="row" style="margin-top:10px"><button class="primary" id="sp" disabled>Save these pages</button><button id="each" disabled>Every page as its own PDF</button></div><p class="muted" id="si"></p></div></div>`);
    let files = [], one = null, count = 0;
    $(p, '#m').onchange = (e) => { files = [...e.target.files]; $(p, '#ml').innerHTML = files.map((f, i) => `<div class="item"><span class="t">${i + 1}. ${esc(f.name)}</span><span class="muted">${kb(f.size)}</span></div>`).join(''); $(p, '#mg').disabled = files.length < 2; };
    $(p, '#mg').onclick = async () => {
      try { const { PDFDocument } = await needPdfLib(); const out = await PDFDocument.create();
        for (const f of files) { const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((pg) => out.addPage(pg)); }
        download('Merged.pdf', await out.save(), 'application/pdf'); toast('Merged PDF saved'); } catch (err) { toast('Could not merge: ' + err.message); }
    };
    $(p, '#s').onchange = async (e) => { one = e.target.files[0]; if (!one) return; const { PDFDocument } = await needPdfLib(); count = (await PDFDocument.load(await one.arrayBuffer(), { ignoreEncryption: true })).getPageCount(); $(p, '#si').textContent = `${count} pages`; $(p, '#sp').disabled = $(p, '#each').disabled = false; };
    const parse = (t) => { const s = new Set(); t.split(',').forEach((x) => { const m = x.trim().match(/^(\d*)\s*-\s*(\d*)$/); if (m) { for (let i = +(m[1] || 1); i <= +(m[2] || count); i++) s.add(i); } else if (+x) s.add(+x); }); return [...s].filter((i) => i >= 1 && i <= count).sort((a, b) => a - b); };
    const pick = async (pages, name) => { const { PDFDocument } = await needPdfLib(); const src = await PDFDocument.load(await one.arrayBuffer(), { ignoreEncryption: true }); const out = await PDFDocument.create(); (await out.copyPages(src, pages.map((x) => x - 1))).forEach((pg) => out.addPage(pg)); download(name, await out.save(), 'application/pdf'); };
    $(p, '#sp').onclick = async () => { const pg = parse($(p, '#pg').value); if (!pg.length) return toast('Write page numbers'); await pick(pg, one.name.replace(/\.pdf$/i, '') + ` (pages ${$(p, '#pg').value.replace(/\s/g, '')}).pdf`); toast('Saved'); };
    $(p, '#each').onclick = async () => { for (let i = 1; i <= count; i++) await pick([i], one.name.replace(/\.pdf$/i, '') + ` - page ${i}.pdf`); toast(`${count} files saved`); };
  } });

// A tiny PDF writer: one JPEG per page (shared with PDF Compress).
async function jpegsToPdf(pages) {
  const enc = new TextEncoder(); const parts = []; const offs = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const ids = pages.map((_, i) => 3 + i * 3);
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${ids.map((i) => `${i} 0 R`).join(' ')}] /Count ${ids.length} >>`));
  pages.forEach((pg, i) => {
    const n = ids[i];
    obj(n, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pg.pw} ${pg.ph}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`));
    obj(n + 1, () => { push(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpg.length} >>\nstream\n`); push(pg.jpg); push('\nendstream'); });
    const c = `q ${pg.pw} 0 0 ${pg.ph} 0 0 cm /Im0 Do Q`;
    obj(n + 2, () => push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`));
  });
  const xref = len; const n = ids.length * 3 + 3;
  push(`xref\n0 ${n}\n0000000000 65535 f \n`); for (let i = 1; i < n; i++) push(`${String(offs[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
tool({ id: 'pdfcompress', name: 'PDF Compress', icon: '🗜', group: 'Safety & Files', desc: 'Make a big scanned PDF small enough to email or upload',
  render(el) {
    head(el, this, 'Best for scanned documents and photos. Text becomes an image, so you cannot select it afterwards.');
    const p = add(el, '<div class="panel row"><input type="file" id="f" accept="application/pdf"><div class="field"><label>Quality</label><select id="q"><option value="1.4,0.6">Smallest (for upload limits)</option><option value="2,0.7" selected>Balanced</option><option value="2.6,0.8">Clear</option></select></div><button class="primary" id="go" disabled>Compress</button></div><div id="r"></div>');
    let file = null;
    $(p, '#f').onchange = (e) => { file = e.target.files[0]; $(p, '#go').disabled = !file; };
    $(p, '#go').onclick = async () => {
      const r = $(el, '#r'); const [scale, q] = $(p, '#q').value.split(',').map(Number);
      try {
        const pdfjs = await needPdfJs(); const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; const pages = [];
        for (let i = 1; i <= doc.numPages; i++) {
          r.textContent = `Page ${i} of ${doc.numPages}…`;
          const pg = await doc.getPage(i); const vp1 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale });
          const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          await pg.render({ canvasContext: ctx, viewport: vp }).promise;
          const jpg = new Uint8Array(await (await new Promise((res) => c.toBlob(res, 'image/jpeg', q))).arrayBuffer());
          pages.push({ jpg, w: c.width, h: c.height, pw: vp1.width, ph: vp1.height });
        }
        const out = await jpegsToPdf(pages);
        r.innerHTML = result({ cards: [['New size', kb(out.size), out.size < file.size ? `${num((1 - out.size / file.size) * 100, 0)}% smaller` : 'Not smaller — try "Smallest"'], ['Old size', kb(file.size)]] });
        download(file.name.replace(/\.pdf$/i, '') + ' (small).pdf', out);
      } catch (err) { r.textContent = 'Could not read this PDF: ' + err.message; }
    };
  } });

// MARK: OCR (Tesseract, loads on demand; language data downloads once)
tool({ id: 'ocr', name: 'Photo to Text (OCR)', icon: '🔍', group: 'Safety & Files', desc: 'Copy text from a photo or scan — Bangla and English',
  render(el) {
    head(el, this, 'The first time, it downloads the language files (about 10–15 MB). After that it works offline. Your photo is not uploaded.');
    const p = add(el, '<div class="panel row"><input type="file" id="f" accept="image/*"><div class="field"><label>Language</label><select id="l"><option value="ben+eng">Bangla + English</option><option value="eng">English</option><option value="ben">Bangla</option></select></div><button class="primary" id="go" disabled>Read text</button></div><img id="pv" style="max-width:100%;max-height:300px;border-radius:10px;display:none"><p class="muted" id="st"></p><textarea id="out" style="min-height:14em;font-family:inherit;font-size:16px;display:none"></textarea><div class="row"><button id="c" style="display:none">Copy text</button></div>');
    let file = null;
    $(p, '#f').onchange = (e) => { file = e.target.files[0]; $(p, '#go').disabled = !file; if (file) { const i = $(el, '#pv'); i.src = URL.createObjectURL(file); i.style.display = ''; } };
    const run = async (autoCopy) => {
      const st = $(el, '#st'); $(p, '#go').disabled = true;
      try {
        st.textContent = 'Loading reader…'; await loadScript('vendor/tesseract/tesseract.min.js');
        const base = new URL('vendor/tesseract/', location.href).href;
        const w = await window.Tesseract.createWorker($(p, '#l').value, 1, { workerPath: base + 'worker.min.js', corePath: base, workerBlobURL: false, logger: (m) => { st.textContent = `${m.status} ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`; } });
        const { data } = await w.recognize(file); await w.terminate();
        const o = $(el, '#out'); o.value = data.text.trim(); o.style.display = ''; $(el, '#c').style.display = ''; st.textContent = `Done · confidence ${Math.round(data.confidence)}%`;
        if (autoCopy && o.value) { await tk.call('copyText', { text: o.value }); st.textContent += ' · copied to the clipboard'; }
      } catch (err) { st.textContent = 'Could not read: ' + (err.message || err) + ' — check your internet for the first use.'; }
      $(p, '#go').disabled = false;
    };
    $(p, '#go').onclick = () => run(false);
    $(el, '#c').onclick = () => copy($(el, '#out').value);
    // Desktop app: Alt+Shift+2 sends a part of the screen here; read it and copy the text.
    const fromScreen = async () => {
      if (!el.isConnected) return;
      const dataUrl = await tk.call('takeOcrImage'); if (!dataUrl) return;
      file = await (await fetch(dataUrl)).blob();
      const i = $(el, '#pv'); i.src = dataUrl; i.style.display = '';
      await run(true);
    };
    if (window.TK_PLATFORM === 'desktop') { fromScreen(); tk.onChange((what) => what === 'ocr' && fromScreen()); }
  } });

// MARK: Background remover (plain backgrounds)
tool({ id: 'bgremove', name: 'Background Remover', icon: '✂️', group: 'Safety & Files', desc: 'Remove a plain wall background, or make it white for passport photos',
  render(el) {
    head(el, this, 'Works best with a plain wall behind the person. Click on the background to choose its colour, then adjust the slider.');
    const p = add(el, '<div class="panel row"><input type="file" id="f" accept="image/*"><div class="field"><label>Strength <span id="tv">40</span></label><input type="range" id="t" min="5" max="120" value="40"></div><div class="field"><label>New background</label><select id="bg"><option value="">Transparent (PNG)</option><option value="#ffffff">White</option><option value="#2f6fd6">Blue</option><option value="#e8e8e8">Light grey</option></select></div><button class="primary" id="dl" disabled>Save</button></div><canvas id="c" class="preview" style="max-width:100%;cursor:crosshair;background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/20px 20px"></canvas>');
    const c = $(el, '#c'); const ctx = c.getContext('2d', { willReadFrequently: true }); let src = null, seeds = [];
    const run = () => {
      if (!src) return; const tol = +$(p, '#t').value; $(p, '#tv').textContent = tol;
      const W = c.width, H = c.height; const d = src.data; const out = new ImageData(new Uint8ClampedArray(d), W, H); const o = out.data;
      const cols = seeds.map((i) => [d[i], d[i + 1], d[i + 2]]); const near = (i) => cols.some(([r, g, b]) => Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) < tol * 1.5);
      const seen = new Uint8Array(W * H); const stack = [];
      for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
      seeds.forEach((i) => stack.push(i / 4));
      while (stack.length) { const q = stack.pop(); if (seen[q]) continue; seen[q] = 1; if (!near(q * 4)) continue; o[q * 4 + 3] = 0; const x = q % W; if (x > 0) stack.push(q - 1); if (x < W - 1) stack.push(q + 1); if (q >= W) stack.push(q - W); if (q < W * (H - 1)) stack.push(q + W); }
      const bg = $(p, '#bg').value; ctx.clearRect(0, 0, W, H); if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').putImageData(out, 0, 0); ctx.drawImage(t, 0, 0); } else ctx.putImageData(out, 0, 0);
    };
    $(p, '#f').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return; const img = await createImageBitmap(f); const sc = Math.min(1, 1200 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); ctx.drawImage(img, 0, 0, c.width, c.height); src = ctx.getImageData(0, 0, c.width, c.height);
      seeds = [0, (c.width - 1) * 4]; $(p, '#dl').disabled = false; run();
    };
    c.onclick = (e) => { if (!src) return; const r = c.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) * c.width / r.width), y = Math.floor((e.clientY - r.top) * c.height / r.height); seeds.push((y * c.width + x) * 4); run(); };
    $(p, '#t').oninput = run; $(p, '#bg').onchange = run;
    $(p, '#dl').onclick = () => c.toBlob((b) => download($(p, '#bg').value ? 'photo.jpg' : 'photo.png', b), $(p, '#bg').value ? 'image/jpeg' : 'image/png', 0.95);
  } });

// MARK: WiFi QR
calcTool({ id: 'wifiqr', name: 'WiFi QR', icon: '📶', group: 'Safety & Files', desc: 'Guests scan a code to join your WiFi — no need to tell the password',
  fields: [{ k: 'ssid', l: 'WiFi name', type: 'text', v: '' }, { k: 'pw', l: 'Password', type: 'text', v: '' }, { k: 'sec', l: 'Security', type: 'select', v: 'WPA', opts: [['WPA', 'WPA / WPA2 (most routers)'], ['WEP', 'WEP (old)'], ['nopass', 'No password']] }, { k: 'hid', l: 'Hidden network', type: 'check', v: false }],
  calc(v) { return v.ssid ? { html: '<div class="panel" style="text-align:center"><img id="q" class="qr" alt="WiFi QR"><p><b id="n"></b></p><div class="row" style="justify-content:center"><button class="primary" id="dl">Save image</button><button id="pr">Print</button></div></div>' } : { tip: 'Write your WiFi name and password.' }; },
  async after(out, v) {
    if (!v.ssid) return; const e = (s) => s.replace(/([\\;,:"])/g, '\\$1');
    const url = await tk.call('qr', { text: `WIFI:T:${v.sec};S:${e(v.ssid)};${v.sec === 'nopass' ? '' : `P:${e(v.pw)};`}${v.hid ? 'H:true;' : ''};`, size: 600 });
    $(out, '#q').src = url; $(out, '#n').textContent = `WiFi: ${v.ssid}`;
    $(out, '#dl').onclick = () => tk.call('saveAs', { name: 'WiFi QR.png', dataUrl: url });
    $(out, '#pr').onclick = () => tk.call('pdf', { html: `<div style="text-align:center;font-family:Arial;margin-top:60px"><h1>Scan for WiFi</h1><img src="${url}" style="width:320px"><h2>${esc(v.ssid)}</h2></div>`, name: 'WiFi QR.pdf' });
  } });

// MARK: Email writer
const EMAILS = {
  followup: { n: 'Follow up after applying', f: [['name', 'Their name', 'Mr. Rahman'], ['post', 'Post', 'Junior Officer'], ['date', 'When you applied', 'last week'], ['me', 'Your name', '']], s: (v) => `Follow-up on my application for ${v.post}`, t: (v) => `Dear ${v.name},\n\nI hope you are well. I applied for the ${v.post} position ${v.date} and wanted to check on the status of my application.\n\nI am still very interested in this role and would be glad to share any more information you need.\n\nThank you for your time.\n\nBest regards,\n${v.me}` },
  thanks: { n: 'Thank you after interview', f: [['name', 'Interviewer', 'Ms. Akter'], ['post', 'Post', 'Sales Executive'], ['point', 'Something you discussed', 'your plans to grow in Chattogram'], ['me', 'Your name', '']], s: (v) => `Thank you — ${v.post} interview`, t: (v) => `Dear ${v.name},\n\nThank you for meeting me today about the ${v.post} role. I enjoyed learning about ${v.point}.\n\nThe conversation made me even more excited about the chance to join your team. Please let me know if you need anything else from me.\n\nBest regards,\n${v.me}` },
  payment: { n: 'Payment reminder to a client', f: [['name', 'Client', 'Mr. Karim'], ['inv', 'Invoice number', 'INV-102'], ['amt', 'Amount', '৳25,000'], ['due', 'Due date', 'last Monday'], ['me', 'Your name', '']], s: (v) => `Reminder: invoice ${v.inv}`, t: (v) => `Dear ${v.name},\n\nThis is a friendly reminder that invoice ${v.inv} for ${v.amt} was due ${v.due}. If you have already paid, please ignore this message.\n\nYou can pay by bank transfer or bKash. Let me know if you need the invoice again.\n\nThank you,\n${v.me}` },
  sorry: { n: 'Apology to a customer', f: [['name', 'Customer', 'Sir/Madam'], ['what', 'What went wrong', 'your order arrived late'], ['fix', 'What you will do', 'we will give free delivery on your next order'], ['me', 'Your name / shop', '']], s: () => 'We are sorry', t: (v) => `Dear ${v.name},\n\nWe are truly sorry that ${v.what}. This is not the service we want to give you.\n\nTo make it right, ${v.fix}. We have also taken steps so it does not happen again.\n\nThank you for your patience and for staying with us.\n\nSincerely,\n${v.me}` },
  ooo: { n: 'Out of office auto-reply', f: [['from', 'Away from', '10 April'], ['to', 'Back on', '17 April'], ['alt', 'Contact instead', 'Rafiq (rafiq@company.com)'], ['me', 'Your name', '']], s: () => 'Out of office', t: (v) => `Hello,\n\nThank you for your email. I am out of office from ${v.from} to ${v.to} with limited access to email.\n\nFor anything urgent, please contact ${v.alt}. I will reply when I am back.\n\nBest regards,\n${v.me}` },
  request: { n: 'Polite request', f: [['name', 'To', 'Sir'], ['ask', 'What you need', 'a copy of my experience certificate'], ['why', 'Why', 'I am applying for a new job'], ['by', 'By when', 'next Thursday'], ['me', 'Your name', '']], s: (v) => `Request for ${v.ask}`, t: (v) => `Dear ${v.name},\n\nI am writing to kindly request ${v.ask}, as ${v.why}. It would be very helpful if I could have it by ${v.by}.\n\nPlease let me know if you need anything from me.\n\nThank you very much.\n\nBest regards,\n${v.me}` },
};
tool({ id: 'email', name: 'Email Writer', icon: '📧', group: 'Safety & Files', desc: 'Ready, polite emails for work — fill the blanks and copy',
  render(el) {
    head(el, this);
    const s = store.get('email', { kind: 'followup', v: {} });
    const p = add(el, `<div class="panel"><div class="field"><label>Email</label><select id="k">${Object.entries(EMAILS).map(([k, x]) => `<option value="${k}"${k === s.kind ? ' selected' : ''}>${esc(x.n)}</option>`).join('')}</select></div><div class="grid2" id="f" style="margin-top:12px"></div></div><div class="field"><label>Subject</label><input type="text" id="sub"></div><textarea id="out" style="min-height:18em;margin-top:12px;font-family:inherit;font-size:15px"></textarea><div class="row"><button class="primary" id="c">Copy</button><button id="m">Open in mail app</button></div>`);
    const run = () => { const E = EMAILS[s.kind]; const v = {}; $$(p, '[data-k]').forEach((x) => (v[x.dataset.k] = x.value)); s.v[s.kind] = v; store.set('email', s); $(el, '#sub').value = E.s(v); $(el, '#out').value = E.t(v); };
    const draw = () => { const E = EMAILS[s.kind]; const vals = s.v[s.kind] || {}; $(p, '#f').innerHTML = E.f.map(([k, l, d]) => `<div class="field"><label>${esc(l)}</label><input type="text" data-k="${k}" value="${esc(vals[k] ?? d)}"></div>`).join(''); run(); };
    $(p, '#k').onchange = (e) => { s.kind = e.target.value; draw(); }; $(p, '#f').oninput = run;
    $(el, '#c').onclick = () => copy($(el, '#out').value);
    $(el, '#m').onclick = () => tk.call('openUrl', { url: `mailto:?subject=${encodeURIComponent($(el, '#sub').value)}&body=${encodeURIComponent($(el, '#out').value)}` });
    draw();
  } });

// MARK: Emergency numbers + SOS
const HELP = [['999', 'National emergency — police, fire, ambulance (free)'], ['109', 'Violence against women and children'], ['1098', 'Child helpline'], ['16263', 'Shasthya Batayon — doctor on the phone'], ['333', 'Government info and services'], ['16430', 'Free legal aid'], ['106', 'Anti-Corruption Commission'], ['16163', 'Fire Service & Civil Defence'], ['1090', 'Disaster and weather warning']];
tool({ id: 'emergency', name: 'Emergency Numbers & SOS', icon: '🆘', group: 'Safety & Files', desc: 'Bangladesh helplines and a one-tap SOS message with your location',
  render(el) {
    head(el, this, 'Tap a number to call (on a phone).');
    add(el, `<div class="list">${HELP.map(([n, d]) => `<a class="item" href="tel:${n}" style="text-decoration:none;color:inherit"><b class="mono" style="font-size:20px;min-width:70px">${n}</b><span class="t">${esc(d)}</span><span>📞</span></a>`).join('')}</div><h2>My SOS card</h2>`);
    const F = [{ k: 'name', l: 'My name', type: 'text' }, { k: 'blood', l: 'Blood group', type: 'select', opts: ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] }, { k: 'who', l: 'Emergency contact name', type: 'text' }, { k: 'phone', l: 'Emergency contact phone', type: 'text' }, { k: 'med', l: 'Allergies / illness / medicines', type: 'text', wide: true }];
    const s = store.get('sos', {});
    const f = add(el, `<div class="panel grid2">${F.map((x) => fieldHtml(x, s)).join('')}</div><button class="primary big" id="go" style="background:var(--bad);border-color:var(--bad)">🆘 Send SOS with my location</button><p class="muted note">Opens your SMS or share menu with a ready message — you press send.</p>`);
    f.oninput = f.onchange = () => store.set('sos', readFields(f, F));
    $(el, '#go').onclick = () => {
      const v = readFields(f, F);
      const send = (loc) => {
        const msg = `🆘 SOS! ${v.name || 'I'} need${v.name ? 's' : ''} help now.${loc ? ` Location: https://maps.google.com/?q=${loc}` : ''}${v.blood ? ` Blood group: ${v.blood}.` : ''}${v.med ? ` Medical: ${v.med}.` : ''}`;
        if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else if (v.phone) location.href = `sms:${v.phone}?body=${encodeURIComponent(msg)}`; else copy(msg);
      };
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition((g) => send(`${g.coords.latitude.toFixed(5)},${g.coords.longitude.toFixed(5)}`), () => send(''), { timeout: 8000 }); else send('');
    };
  } });
