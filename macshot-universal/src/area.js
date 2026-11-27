// Full-screen see-through window: drag a rectangle, MacShot saves that part of the screen.
const box = document.getElementById('box');
const shade = document.getElementById('shade');
const size = document.getElementById('size');
let start = null;

// The same picker is used for screenshots, reading text and annotating.
const mode = new URLSearchParams(location.search).get('mode');
document.getElementById('hint').textContent = {
  text: 'Drag over the text you want to copy · Esc to cancel',
  annotate: 'Drag to choose an area to draw on · Esc to cancel',
}[mode] || 'Drag to choose an area · Esc to cancel';

function rectFrom(e) {
  const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY);
  return { x, y, width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) };
}

window.addEventListener('mousedown', (e) => {
  start = { x: e.clientX, y: e.clientY };
  shade.style.display = 'none';
  document.getElementById('hint').style.display = 'none';
});
window.addEventListener('mousemove', (e) => {
  if (!start) return;
  const r = rectFrom(e);
  Object.assign(box.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' });
  Object.assign(size.style, { display: 'block', left: r.x + 'px', top: Math.max(0, r.y - 22) + 'px' });
  size.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
});
window.addEventListener('mouseup', (e) => {
  if (!start) return;
  const r = rectFrom(e);
  start = null;
  window.macshot.areaPicked(r.width > 3 && r.height > 3 ? r : null);
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.macshot.areaPicked(null); });
