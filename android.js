// Android app layer. Inside the TouchKit Android app, window.AndroidTK comes
// from the native side. The phone's WebView cannot download files, print,
// share, show notifications, read aloud or listen by itself, so this file
// sends those calls to the native app. On the web this file does nothing.
(() => {
  const A = window.AndroidTK;
  if (!A) return;
  window.TK_PLATFORM = 'android';

  const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  async function save(name, href, text) {
    let data = href;
    if (!data) data = await toDataUrl(new Blob([String(text ?? '')], { type: 'text/plain' }));
    else if (!data.startsWith('data:')) data = await toDataUrl(await (await fetch(data)).blob());
    const where = A.saveFile(name || 'file', data);
    if (where === 'asking') return name; // Android is asking for storage access; it saves after.
    toast(where ? 'Saved to Downloads/TouchKit: ' + name : 'Could not save the file');
    return name;
  }

  // Links that would open a new tab, or try to download, go to the native app.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.hasAttribute('download')) { e.preventDefault(); save(a.getAttribute('download') || 'file', a.href); return; }
    if (a.target === '_blank' || !/^https:\/\/appassets\.androidplatform\.net\//.test(a.href)) { e.preventDefault(); A.openUrl(a.href); }
  }, true);
  window.open = (url) => { if (url) A.openUrl(String(url)); return null; };

  const base = window.tk.call.bind(window.tk);
  window.tk.call = async (cmd, arg = {}) => {
    switch (cmd) {
      case 'state': return Object.assign(await base(cmd, arg), { platform: 'android', app: 'android', canCapture: false });
      case 'saveAs': return save(arg.name, arg.dataUrl, arg.text);
      case 'savePhoto': return save(`Photo ${Date.now()}.png`, arg.dataUrl);
      case 'pdf': A.printHtml(String(arg.html || '')); return 'print';
      case 'openUrl': A.openUrl(String(arg.url)); return true;
      case 'copyText': A.copyText(String(arg.text ?? '')); return true;
      default: return base(cmd, arg);
    }
  };

  // Sharing text, links and files.
  navigator.share = async (d = {}) => {
    if (d.files && d.files.length) { const f = d.files[0]; A.shareFile(f.name || 'file', await toDataUrl(f)); return; }
    A.shareText([d.title, d.text, d.url].filter(Boolean).join('\n'));
  };
  navigator.canShare = () => true;

  // Notifications.
  function N(title, opt = {}) { A.notify(String(title), String(opt.body || '')); }
  Object.defineProperty(N, 'permission', { get: () => (A.canNotify() ? 'granted' : 'default') });
  N.requestPermission = () => new Promise((res) => { A.askNotify(); let n = 0; const t = setInterval(() => { if (A.canNotify() || ++n > 40) { clearInterval(t); res(A.canNotify() ? 'granted' : 'denied'); } }, 250); });
  window.Notification = N;

  // Read aloud (Android text-to-speech).
  const voices = [{ name: 'বাংলা', lang: 'bn-BD', default: false }, { name: 'English', lang: 'en-US', default: true }, { name: 'English (UK)', lang: 'en-GB', default: false }, { name: 'हिन्दी', lang: 'hi-IN', default: false }, { name: 'العربية', lang: 'ar-SA', default: false }];
  function Utt(text) { this.text = String(text || ''); this.lang = 'en-US'; this.rate = 1; this.voice = null; }
  window.SpeechSynthesisUtterance = Utt;
  // speechSynthesis is a read-only property, so it has to be redefined, not assigned.
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => voices, speak: (u) => A.speak(u.text, (u.voice && u.voice.lang) || u.lang, +u.rate || 1), cancel: () => A.stopSpeaking(), onvoiceschanged: null } });

  // Voice typing (Android speech recognition).
  let listener = null;
  window.__tkSpeech = (kind, text) => {
    const r = listener; if (!r) return;
    if (kind === 'result') { const alt = [{ transcript: text }]; alt.isFinal = true; r.onresult && r.onresult({ resultIndex: 0, results: [alt] }); }
    else if (kind === 'error') r.onerror && r.onerror({ error: text });
    else if (kind === 'end') { listener = null; r.onend && r.onend(); }
  };
  function SR() { this.lang = 'bn-BD'; }
  SR.prototype.start = function () { listener = this; A.listen(this.lang); };
  SR.prototype.stop = function () { A.stopListening(); };
  window.SpeechRecognition = window.webkitSpeechRecognition = SR;
})();
