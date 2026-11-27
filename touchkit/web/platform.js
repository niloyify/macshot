// Platform layer. In the desktop app, window.tk comes from Electron (native
// screenshots, phone remote, Touch Bar…). In a browser or on a phone, this file
// provides the same calls with web features, so every tool runs everywhere.
(() => {
  if (window.tk) { window.TK_PLATFORM = 'desktop'; return; }
  window.TK_PLATFORM = 'web';

  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : /Win/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'web';
  let rec = null;      // { recorder, streams, chunks }
  let wakeLock = null;
  const listeners = [];
  const changed = (what) => listeners.forEach((f) => f(what));

  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  }
  function download(href, name) {
    const a = document.createElement('a');
    a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  const canCaptureScreen = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  async function screenshot() {
    if (!canCaptureScreen()) throw new Error('This browser cannot capture the screen. Use the desktop app, or your phone’s own screenshot buttons.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
      const v = document.createElement('video');
      v.srcObject = stream; v.muted = true; await v.play();
      await new Promise((r) => setTimeout(r, 300));
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const url = c.toDataURL('image/png');
      download(url, `Screenshot ${stamp()}.png`);
      try { const blob = await (await fetch(url)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch {}
      return `Screenshot ${stamp()}.png`;
    } finally { stream.getTracks().forEach((t) => t.stop()); }
  }

  async function record() {
    if (rec) { rec.recorder.stop(); return null; }
    if (!canCaptureScreen()) throw new Error('This browser cannot record the screen. Use the desktop app.');
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    let mic = null;
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
    const tracks = [...screen.getVideoTracks()];
    const audio = [screen, mic].filter((s) => s && s.getAudioTracks().length);
    let ctx = null;
    if (audio.length) {
      ctx = new AudioContext(); const mix = ctx.createMediaStreamDestination();
      audio.forEach((s) => ctx.createMediaStreamSource(s).connect(mix));
      tracks.push(...mix.stream.getAudioTracks());
    }
    const type = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const recorder = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      [screen, mic].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
      if (ctx) ctx.close();
      const blob = new Blob(chunks, { type: recorder.mimeType });
      download(URL.createObjectURL(blob), `Recording ${stamp()}.${recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
      rec = null; changed('state');
    };
    screen.getVideoTracks()[0].onended = () => recorder.state !== 'inactive' && recorder.stop();
    recorder.start(1000);
    rec = { recorder }; changed('state');
    return null;
  }

  async function awake() {
    if (wakeLock) { await wakeLock.release(); wakeLock = null; changed('state'); return false; }
    if (!('wakeLock' in navigator)) throw new Error('This browser cannot keep the screen awake.');
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; changed('state'); });
    changed('state');
    return true;
  }

  function printPdf(html) {
    // The browser's print window has “Save as PDF”.
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60e3); }, 300);
    return 'print';
  }

  window.tk = {
    async call(cmd, arg = {}) {
      switch (cmd) {
        case 'state': return { platform: os, web: true, version: (window.TK_CONFIG || {}).version || '', recording: !!rec, awake: !!wakeLock, accessibility: true, canCapture: canCaptureScreen() };
        case 'screenshot': return screenshot();
        case 'record': return record();
        case 'awake': return awake();
        case 'copyText': await navigator.clipboard.writeText(String(arg.text)); return true;
        case 'cameraAccess': return true;
        case 'savePhoto': { const name = `Photo ${stamp()}.${String(arg.dataUrl).startsWith('data:image/jpeg') ? 'jpg' : 'png'}`; download(arg.dataUrl, name); return name; }
        case 'saveVideo': download(arg.dataUrl, arg.name || `Video ${stamp()}.webm`); return arg.name;
        case 'notify': try { if (window.Notification && Notification.permission === 'granted') new Notification(String(arg.title || 'Jhuli'), { body: String(arg.body || '') }); } catch {} return true;
        case 'saveAs': {
          const href = arg.dataUrl || URL.createObjectURL(new Blob([String(arg.text ?? '')], { type: 'text/plain' }));
          download(href, arg.name || 'file'); return arg.name;
        }
        case 'pdf': return printPdf(arg.html);
        case 'qr': return window.QRCode.toDataURL(String(arg.text || ' '), { margin: 1, width: Math.min(+arg.size || 320, 1200) });
        case 'openUrl': window.open(arg.url, '_blank', 'noopener'); return true;
        default: return null; // desktop-only features
      }
    },
    onChange(fn) { listeners.push(fn); },
    onOpenTool() {},
  };
})();
