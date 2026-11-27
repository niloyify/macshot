// Shared building blocks for the "life tools" (tools-*.js): form calculators,
// record books and editable rows. Loaded after tools.js, so esc/add/store/tool exist.
/* global TK, esc, add, $, store, tool, toast, uid, head */

// Bangladesh style numbers: 1,00,000. num(x, decimals), taka(x) → "৳ 1,00,000".
const num = (n, d = 2) => (Number.isFinite(n) ? (+n.toFixed(d)).toLocaleString('en-IN', { maximumFractionDigits: d }) : '—');
const taka = (n, d = 0) => (Number.isFinite(n) ? '৳ ' + num(n, d) : '—');
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isoDate = (d) => { const x = new Date(d); return new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// MARK: fields
// A field: { k, l: label, v: default, type: number|text|date|time|select|check|textarea, opts, step, wide, ph, clear } or { h: 'Heading' }.
function fieldHtml(f, s = {}) {
  if (f.h) return `<div style="grid-column:1/-1;margin-top:4px"><b>${esc(f.h)}</b>${f.sub ? ` <span class="muted">${esc(f.sub)}</span>` : ''}</div>`;
  const val = s[f.k] ?? (typeof f.v === 'function' ? f.v() : f.v) ?? '';
  const a = `data-k="${f.k}"`;
  let inp;
  if (f.type === 'select') inp = `<select ${a}>${f.opts.map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.type === 'check') return `<div class="field" style="justify-content:flex-end"><label class="row check"><input type="checkbox" ${a}${val ? ' checked' : ''}> ${esc(f.l)}</label></div>`;
  else if (f.type === 'textarea') inp = `<textarea ${a} style="min-height:${f.rows || 5}em;font-family:inherit;font-size:15px" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`;
  else inp = `<input type="${f.type || 'number'}" ${a} value="${esc(val)}"${!f.type ? ` step="${f.step || 'any'}" inputmode="decimal"` : ''}${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}>`;
  return `<div class="field"${f.wide || f.type === 'textarea' ? ' style="grid-column:1/-1"' : ''}><label>${esc(f.l)}</label>${inp}</div>`;
}
function readFields(root, fields) {
  const v = {};
  for (const f of fields) {
    if (!f.k) continue;
    const x = root.querySelector(`[data-k="${f.k}"]`); if (!x) continue;
    if (f.type === 'check') v[f.k] = x.checked;
    else if (!f.type) v[f.k] = x.value === '' ? 0 : +x.value;
    else if (f.type === 'select') v[f.k] = x.value !== '' && !isNaN(x.value) ? +x.value : x.value;
    else v[f.k] = x.value;
  }
  return v;
}

// MARK: results
// An array of cards [label, value, small] or { cards, warn, tip, table: { title, head, rows }, html }.
function result(r) {
  if (!r) return '';
  if (Array.isArray(r)) r = { cards: r };
  let h = '';
  if (r.cards && r.cards.length) h += `<div class="cards res">${r.cards.map((c, i) => `<div class="card${i === 0 && !r.flat ? ' main' : ''}"><span>${esc(c[0])}</span><b>${esc(c[1])}</b>${c[2] ? `<small>${esc(c[2])}</small>` : ''}</div>`).join('')}</div>`;
  if (r.warn) h += `<div class="banner">${esc(r.warn)}</div>`;
  if (r.tip) h += `<div class="banner info">${esc(r.tip)}</div>`;
  if (r.table && r.table.rows.length) h += `${r.table.title ? `<h2>${esc(r.table.title)}</h2>` : ''}<table><thead><tr>${r.table.head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${r.table.rows.map((row) => `<tr>${row.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  if (r.html) h += r.html;
  return h;
}

// MARK: calculator tools
// Fields in, result out; the last values are remembered (and synced).
function calcTool(t) {
  return tool({ ...t, render(el) {
    head(el, this, t.intro);
    const s = store.get('c.' + t.id, {});
    const form = add(el, `<div class="panel grid3">${t.fields.map((f) => fieldHtml(f, s)).join('')}</div>`);
    const out = add(el, '<div class="out"></div>');
    if (t.note) add(el, `<p class="muted note">ℹ️ ${esc(t.note)}</p>`);
    const run = () => {
      const v = readFields(form, t.fields);
      store.set('c.' + t.id, v);
      try { out.innerHTML = result(t.calc(v)); } catch (e) { out.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
      if (t.after) t.after(out, v);
    };
    form.addEventListener('input', run); form.addEventListener('change', run);
    run();
    if (t.timer) { const i = setInterval(run, t.timer); return () => clearInterval(i); }
  } });
}

// MARK: record books
// Add entries, see a summary, delete entries. Rows are saved (and synced) under l.<id>.
function logTool(t) {
  return tool({ ...t, render(el) {
    head(el, this, t.intro);
    const key = 'l.' + t.id;
    const rows = () => store.get(key, []);
    const form = add(el, `<div class="panel"><div class="grid3">${t.fields.map((f) => fieldHtml(f, {})).join('')}</div><div class="row" style="margin-top:12px"><button class="primary" id="add">＋ ${esc(t.addLabel || 'Add')}</button></div></div>`);
    const sum = add(el, '<div></div>');
    const list = add(el, '<div></div>');
    if (t.note) add(el, `<p class="muted note">ℹ️ ${esc(t.note)}</p>`);
    const draw = () => {
      const rs = rows().slice().sort(t.sort || ((a, b) => b.at - a.at));
      sum.innerHTML = t.summary ? result(t.summary(rs)) : '';
      list.innerHTML = rs.length ? `<h2>${esc(t.listTitle || 'Entries')} (${rs.length})</h2><table><thead><tr>${t.head.map((x) => `<th>${esc(x)}</th>`).join('')}<th></th></tr></thead><tbody>${rs.map((r) => `<tr data-id="${r.id}">${t.cols(r).map((c) => `<td>${esc(c)}</td>`).join('')}<td style="white-space:nowrap">${t.rowAction ? `<button class="act small">${esc(t.rowAction.label(r))}</button> ` : ''}<button class="del small" title="Delete">✕</button></td></tr>`).join('')}</tbody></table>` : `<p class="muted">${esc(t.empty || 'Nothing added yet.')}</p>`;
      list.querySelectorAll('.del').forEach((b) => b.onclick = () => { if (!confirm('Delete this entry?')) return; const id = b.closest('tr').dataset.id; store.set(key, rows().filter((r) => r.id !== id)); draw(); });
      list.querySelectorAll('.act').forEach((b) => b.onclick = () => { const id = b.closest('tr').dataset.id; store.set(key, rows().map((r) => (r.id === id ? t.rowAction.run(r) : r))); draw(); });
      if (t.after) t.after(sum, rs);
    };
    $(form, '#add').onclick = () => {
      const v = readFields(form, t.fields);
      const err = t.check && t.check(v); if (err) return toast(err);
      store.set(key, [...rows(), { id: uid(), at: Date.now(), ...(t.make ? t.make(v) : v) }]);
      t.fields.forEach((f) => { if (f.k && f.clear) { const x = form.querySelector(`[data-k="${f.k}"]`); if (x) x.value = ''; } });
      draw(); toast('Saved');
    };
    draw();
    if (t.timer) { const i = setInterval(draw, t.timer); return () => clearInterval(i); }
  } });
}

// MARK: editable rows
// A small table the user can grow (appliances, people, ingredients…). cols: [{ k, l, type, opts, v, w }]
function rowsEditor(root, key, cols, defaults, onChange) {
  let data = store.get(key, defaults);
  const box = add(root, '<div class="rowsed"></div>');
  const save = () => { store.set(key, data); onChange(data); };
  const draw = () => {
    box.innerHTML = `<div style="overflow-x:auto"><table><thead><tr>${cols.map((c) => `<th>${esc(c.l)}</th>`).join('')}<th></th></tr></thead><tbody>${data.map((r, i) => `<tr data-i="${i}">${cols.map((c) => `<td>${c.type === 'select' ? `<select data-c="${c.k}">${c.opts.map((o) => `<option${o === r[c.k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<input data-c="${c.k}" type="${c.type || 'number'}" value="${esc(r[c.k] ?? '')}" style="width:${c.w || 90}px"${c.type ? '' : ' step="any" inputmode="decimal"'}>`}</td>`).join('')}<td><button class="small" data-del title="Remove">✕</button></td></tr>`).join('')}</tbody></table></div><button class="small" data-add style="margin-top:8px">＋ Add row</button>`;
    box.querySelectorAll('input,select').forEach((x) => x.oninput = x.onchange = () => { const r = data[x.closest('tr').dataset.i]; const c = cols.find((c) => c.k === x.dataset.c); r[c.k] = c.type ? x.value : +x.value; save(); });
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { data.splice(+b.closest('tr').dataset.i, 1); save(); draw(); });
    $(box, '[data-add]').onclick = () => { data.push(Object.fromEntries(cols.map((c) => [c.k, c.v ?? (c.type === 'select' ? c.opts[0] : c.type ? '' : 0)]))); save(); draw(); };
  };
  draw(); onChange(data);
  return { get: () => data, set: (d) => { data = d; save(); draw(); } };
}

// Show a system notification (works while the app or tab is open).
async function notify(title, body) {
  try {
    if (!('Notification' in window)) return toast(title);
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') new Notification(title, { body, icon: 'icon-192.png' }); else toast(title);
  } catch { toast(title); }
}

// New groups, in the order they appear on the home screen.
TK.groups = ['Work', 'Calculate', 'Money', 'Shop', 'Health', 'Study & Job', 'Faith & Calendar', 'Home & Land', 'Farming', 'Daily Life', 'Safety & Files', 'Text & Data', 'Media', 'Capture', 'Freelance', 'Control'];
