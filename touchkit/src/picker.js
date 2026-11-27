// Colour picker: shows a frozen picture of the screen with a magnifier; a click copies
// the colour under the pointer as #RRGGBB.
const screenCanvas = document.getElementById('screen');
const zoom = document.getElementById('zoom');
const lens = document.getElementById('lens');
const hexText = document.getElementById('hex');
const swatch = document.getElementById('swatch');
const test = new URLSearchParams(location.search).has('test');
let pixels = null; // full-resolution picture, read pixel by pixel
let scale = 1;
let pos = { x: 0, y: 0 };

const hex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();

function colorAt(x, y) {
  const px = Math.min(pixels.width - 1, Math.max(0, Math.round(x * scale)));
  const py = Math.min(pixels.height - 1, Math.max(0, Math.round(y * scale)));
  const [r, g, b] = pixels.ctx.getImageData(px, py, 1, 1).data;
  return { hex: '#' + hex2(r) + hex2(g) + hex2(b), px, py };
}

function draw() {
  if (!pixels) return;
  const { hex, px, py } = colorAt(pos.x, pos.y);
  const z = zoom.getContext('2d');
  z.imageSmoothingEnabled = false;
  z.clearRect(0, 0, 11, 11);
  z.drawImage(pixels.canvas, px - 5, py - 5, 11, 11, 0, 0, 11, 11);
  hexText.textContent = hex;
  swatch.style.background = hex;
  // Keep the magnifier on screen.
  const left = pos.x + 24 + 154 > innerWidth ? pos.x - 24 - 154 : pos.x + 24;
  const top = pos.y + 24 + 190 > innerHeight ? pos.y - 24 - 190 : pos.y + 24;
  Object.assign(lens.style, { display: 'block', left: left + 'px', top: top + 'px' });
}

window.macshot.on('picker-image', (dataURL) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    pixels = { canvas: c, ctx, width: c.width, height: c.height };
    scale = c.width / innerWidth;
    screenCanvas.width = c.width; screenCanvas.height = c.height;
    screenCanvas.getContext('2d').drawImage(img, 0, 0);
    pos = { x: innerWidth / 2, y: innerHeight / 2 };
    draw();
    if (test) setTimeout(() => window.macshot.colorPicked(colorAt(pos.x, pos.y).hex), 500);
  };
  img.src = dataURL;
});

window.addEventListener('mousemove', (e) => { pos = { x: e.clientX, y: e.clientY }; draw(); });
window.addEventListener('mousedown', (e) => {
  if (!pixels) return;
  if (e.button !== 0) return window.macshot.colorPicked(null);
  window.macshot.colorPicked(colorAt(e.clientX, e.clientY).hex);
});
window.addEventListener('keydown', (e) => {
  const step = 1 / scale; // one real pixel
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (e.key === 'Escape') window.macshot.colorPicked(null);
  else if (e.key === 'Enter' && pixels) window.macshot.colorPicked(colorAt(pos.x, pos.y).hex);
  else if (moves[e.key]) { pos.x += moves[e.key][0]; pos.y += moves[e.key][1]; draw(); }
});
