// Annotate: draw arrows, boxes, pen lines, highlights, text, numbered steps and blur
// on a screenshot, then save it (Pictures/TouchKit) or copy it.
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const textInput = document.getElementById('textInput');
const test = new URLSearchParams(location.search).has('test');
const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#AF52DE', '#000000', '#FFFFFF'];

let base = null;        // the screenshot
let shapes = [];        // what has been drawn
let undone = [];
let current = null;     // shape being drawn
let tool = 'arrow';
let color = COLORS[0];
let unit = 1;           // image pixels per screen point, so lines look the same on any screen

const widthOf = () => Number(document.getElementById('width').value) * unit;

// Colour dots
const colorsBox = document.getElementById('colors');
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'dot' + (c === color ? ' on' : '');
  b.style.background = c;
  b.title = c;
  b.onclick = () => { color = c; for (const d of colorsBox.children) d.classList.toggle('on', d === b); };
  colorsBox.appendChild(b);
}

function setTool(name) {
  commitText();
  tool = name;
  for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === name);
}
for (const b of document.querySelectorAll('.tool')) b.onclick = () => setTool(b.dataset.tool);

function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
}

function drawArrow(s) {
  const { x1, y1, x2, y2, w } = s;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(14 * unit, w * 3.2);
  ctx.strokeStyle = ctx.fillStyle = s.color;
  ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(angle) * head * 0.8, y2 - Math.sin(angle) * head * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
  ctx.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
  ctx.closePath(); ctx.fill();
}

function pixelate(x, y, w, h) {
  if (w < 1 || h < 1) return;
  const block = Math.max(8, Math.round(10 * unit));
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w / block)); small.height = Math.max(1, Math.round(h / block));
  const s = small.getContext('2d');
  s.drawImage(base, x, y, w, h, 0, 0, small.width, small.height);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.restore();
}

const norm = (s) => ({ x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) });

function drawShape(s) {
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (s.type === 'arrow') drawArrow(s);
  else if (s.type === 'box') { const r = norm(s); ctx.strokeStyle = s.color; ctx.lineWidth = s.w; ctx.strokeRect(r.x, r.y, r.w, r.h); }
  else if (s.type === 'blur') { const r = norm(s); pixelate(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); }
  else if (s.type === 'pen' || s.type === 'mark') {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.type === 'mark' ? s.w * 3.5 : s.w;
    if (s.type === 'mark') { ctx.globalAlpha = 0.35; ctx.lineCap = 'square'; }
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  } else if (s.type === 'text') {
    ctx.fillStyle = s.color;
    ctx.font = `600 ${s.size}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    // A soft outline keeps text readable on any background.
    ctx.lineWidth = Math.max(2, s.size / 8); ctx.strokeStyle = s.color === '#FFFFFF' ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.75)';
    s.text.split('\n').forEach((line, i) => { ctx.strokeText(line, s.x, s.y + i * s.size * 1.2); ctx.fillText(line, s.x, s.y + i * s.size * 1.2); });
  } else if (s.type === 'step') {
    const r = s.size;
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(2, r / 8); ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = s.color === '#FFFFFF' || s.color === '#FFCC00' ? '#000' : '#fff';
    ctx.font = `700 ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(s.n), s.x, s.y + r * 0.05);
  }
  ctx.restore();
}

function render() {
  if (!base) return;
  ctx.drawImage(base, 0, 0);
  // Blur first so it never hides the arrows drawn on top of it.
  for (const s of shapes) if (s.type === 'blur') drawShape(s);
  for (const s of shapes) if (s.type !== 'blur') drawShape(s);
  if (current) drawShape(current);
}

function add(shape) { shapes.push(shape); undone = []; render(); }

canvas.addEventListener('mousedown', (e) => {
  if (!base || e.button !== 0) return;
  const p = point(e);
  if (tool === 'text') { e.preventDefault(); return startText(p, e); }
  commitText();
  if (tool === 'step') {
    const n = shapes.filter((s) => s.type === 'step').length + 1;
    return add({ type: 'step', x: p.x, y: p.y, n, color, size: Math.max(14 * unit, widthOf() * 2.4) });
  }
  current = tool === 'pen' || tool === 'mark'
    ? { type: tool, color, w: widthOf(), points: [p] }
    : { type: tool, color, w: widthOf(), x1: p.x, y1: p.y, x2: p.x, y2: p.y };
});
window.addEventListener('mousemove', (e) => {
  if (!current) return;
  const p = point(e);
  if (current.points) current.points.push(p);
  else { current.x2 = p.x; current.y2 = p.y; }
  render();
});
window.addEventListener('mouseup', () => {
  if (!current) return;
  const s = current; current = null;
  const big = s.points ? s.points.length > 1 : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 4;
  if (big) add(s); else render();
});

// Text: type in a box on the picture, Enter or a click elsewhere places it.
let textAt = null;
function startText(p, e) {
  commitText();
  textAt = p;
  const size = Math.max(16, Number(document.getElementById('width').value) * 4);
  Object.assign(textInput.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px', color, fontSize: size + 'px' });
  textInput.value = '';
  setTimeout(() => textInput.focus(), 0);
}
function commitText() {
  if (!textAt) return;
  const text = textInput.value.trim();
  const r = canvas.getBoundingClientRect();
  const size = parseFloat(textInput.style.fontSize) * (canvas.width / r.width);
  if (text) add({ type: 'text', x: textAt.x, y: textAt.y, text, color, size });
  textAt = null;
  textInput.style.display = 'none';
}
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitText(); }
  if (e.key === 'Escape') { textAt = null; textInput.style.display = 'none'; }
  e.stopPropagation();
});
textInput.addEventListener('blur', () => commitText());

function undo() { if (shapes.length) { undone.push(shapes.pop()); render(); } }
function redo() { if (undone.length) { shapes.push(undone.pop()); render(); } }
document.getElementById('undo').onclick = undo;
document.getElementById('redo').onclick = redo;

async function save(copyOnly) {
  commitText(); render();
  return window.macshot.call('annotate-save', canvas.toDataURL('image/png'), copyOnly);
}
document.getElementById('copy').onclick = () => save(true);
document.getElementById('save').onclick = async () => {
  const file = await save(false);
  if (file) { document.getElementById('save').textContent = 'Saved ✓'; setTimeout(() => { document.getElementById('save').textContent = 'Save'; }, 1500); }
};

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); document.getElementById('save').click(); return; }
  if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); save(true); return; }
  if (mod) return;
  const keys = { a: 'arrow', r: 'box', p: 'pen', h: 'mark', t: 'text', n: 'step', b: 'blur' };
  if (keys[e.key.toLowerCase()]) setTool(keys[e.key.toLowerCase()]);
});

window.macshot.on('annotate-image', (dataURL, scaleFactor) => {
  const img = new Image();
  img.onload = async () => {
    base = img;
    unit = scaleFactor || 1;
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    // Show it at its real size on screen when it fits.
    canvas.style.width = Math.round(img.naturalWidth / unit) + 'px';
    render();
    if (test) {
      const w = canvas.width, h = canvas.height;
      add({ type: 'box', color: '#FF3B30', w: 6, x1: w * 0.1, y1: h * 0.1, x2: w * 0.6, y2: h * 0.6 });
      add({ type: 'arrow', color: '#0A84FF', w: 6, x1: w * 0.9, y1: h * 0.9, x2: w * 0.5, y2: h * 0.5 });
      add({ type: 'blur', x1: w * 0.6, y1: h * 0.1, x2: w * 0.9, y2: h * 0.4 });
      add({ type: 'text', x: w * 0.1, y: h * 0.7, text: 'TouchKit test', color: '#FF3B30', size: 28 });
      add({ type: 'step', x: w * 0.8, y: h * 0.8, n: 1, color: '#34C759', size: 20 });
      window.macshot.call('test-done', await save(false));
    }
  };
  img.src = dataURL;
});
