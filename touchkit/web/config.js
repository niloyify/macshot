// Where the account server lives. Empty = the same address the web app was opened from.
// The desktop app opens the app from a file, so it needs a full address here.
// On GitHub Pages there is no server yet, so accounts are switched off there.
(() => {
  const onPages = location.hostname.endsWith('github.io') || !!window.AndroidTK;
  window.TK_CONFIG = {
    version: '3.0.0',
    server: location.protocol.startsWith('http') ? '' : 'http://localhost:8080',
    accounts: !onPages,
    downloads: 'https://github.com/niloyify/macshot/releases?q=touchkit',
  };
})();
