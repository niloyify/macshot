// On-screen Touch Bar: works like the Mac Touch Bar, for any computer.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.key) tk.call('key', { key: b.dataset.key });
  if (b.dataset.snap) tk.call('snap', { where: b.dataset.snap });
  if (b.dataset.do) tk.call(b.dataset.do);
});
async function refresh() {
  const s = await tk.call('state');
  document.getElementById('rec').classList.toggle('rec', s.recording);
}
tk.onChange(refresh);
refresh();
setInterval(refresh, 2000);
