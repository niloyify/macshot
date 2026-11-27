// Shop & business books, and daily-life tools.
/* global calcTool, logTool, rowsEditor, tool, head, add, $, $$, esc, store, result, num, taka, today, fmtDate, daysBetween, addDays, isoDate, toast, copy, tk, words, uid, notify, fieldHtml, readFields */

const shopInfo = () => store.get('shop.info', { name: 'My Shop', phone: '', addr: '' });
function shopPanel(el) {
  const s = shopInfo();
  const p = add(el, `<details class="panel"><summary><b>🏪 Your shop / business details</b> <span class="muted">(${esc(s.name)})</span></summary><div class="grid3" style="margin-top:10px"><div class="field"><label>Name</label><input type="text" data-k="name" value="${esc(s.name)}"></div><div class="field"><label>Phone</label><input type="text" data-k="phone" value="${esc(s.phone)}"></div><div class="field"><label>Address</label><input type="text" data-k="addr" value="${esc(s.addr)}"></div></div></details>`);
  p.oninput = () => { const v = {}; $$(p, '[data-k]').forEach((x) => (v[x.dataset.k] = x.value)); store.set('shop.info', v); };
}
const docHead = (title, no, date) => { const s = shopInfo(); return `<div style="display:flex;justify-content:space-between;border-bottom:2px solid #3d7bff;padding-bottom:10px"><div><div style="font-size:22px;font-weight:700">${esc(s.name)}</div><div style="color:#555">${esc([s.addr, s.phone].filter(Boolean).join(' · '))}</div></div><div style="text-align:right"><div style="font-size:20px;font-weight:700;color:#3d7bff">${title}</div><div>No: ${esc(no)}</div><div>Date: ${fmtDate(date)}</div></div></div>`; };
const page = (body) => `<div style="font:14px/1.5 Arial,'Noto Sans Bengali',sans-serif;color:#111;max-width:720px;margin:20px auto">${body}</div>`;

// MARK: Due book (বাকির খাতা)
let dueNow = [];
logTool({ id: 'duebook', name: 'Due Book (বাকির খাতা)', icon: '📒', group: 'Shop', desc: 'Who owes you how much — with a reminder message',
  fields: [{ k: 'name', l: 'Customer', type: 'text', ph: 'Name' }, { k: 'phone', l: 'Phone', type: 'text', ph: '01…' }, { k: 'kind', l: 'Entry', type: 'select', v: 'gave', opts: [['gave', 'Sold on credit (বাকি দিলাম)'], ['got', 'Got payment (টাকা পেলাম)']] }, { k: 'amt', l: 'Amount', v: '', clear: true }, { k: 'note', l: 'Note', type: 'text', ph: 'e.g. rice 10 kg', clear: true }],
  check: (v) => (!v.name ? 'Write the customer name' : !v.amt ? 'Write the amount' : ''), addLabel: 'Save',
  head: ['Date', 'Customer', 'Entry', 'Amount'], cols: (r) => [fmtDate(r.at), r.name, r.note || (r.kind === 'gave' ? 'Credit' : 'Paid'), (r.kind === 'gave' ? '+ ' : '− ') + taka(r.amt)],
  summary(rs) {
    const by = {}; rs.slice().reverse().forEach((r) => { const k = r.name.trim().toLowerCase(); const x = (by[k] ||= { name: r.name.trim(), phone: '', bal: 0, last: 0 }); x.bal += r.kind === 'gave' ? r.amt : -r.amt; if (r.phone) x.phone = r.phone; x.last = Math.max(x.last, r.at); });
    const due = Object.values(by).filter((x) => x.bal > 0.5).sort((a, b) => b.bal - a.bal);
    dueNow = due;
    return { cards: [['Total to collect', taka(due.reduce((s, x) => s + x.bal, 0))], ['Customers with due', String(due.length)]], html: due.length ? `<table><thead><tr><th>Customer</th><th>Due</th><th>Since last entry</th><th></th></tr></thead><tbody>${due.map((x, i) => `<tr><td>${esc(x.name)}</td><td><b>${taka(x.bal)}</b></td><td>${daysBetween(isoDate(x.last), today())} days</td><td><button class="small" data-rem="${i}">💬 Remind</button></td></tr>`).join('')}</tbody></table>` : '' };
  },
  after(sum) {
    const due = dueNow;
    $$(sum, '[data-rem]').forEach((b) => b.onclick = () => {
      const x = due[b.dataset.rem]; const msg = `আসসালামু আলাইকুম ${x.name}, ${shopInfo().name}-এ আপনার বাকি ${taka(x.bal)}। সুবিধামতো পরিশোধ করার অনুরোধ রইল। ধন্যবাদ।`;
      if (x.phone) location.href = `sms:${x.phone}?body=${encodeURIComponent(msg)}`; else copy(msg);
    });
  } });

// MARK: Cash book
logTool({ id: 'cashbook', name: 'Cash Book', icon: '💵', group: 'Shop', desc: 'Daily income and expenses with today and month totals',
  fields: [{ k: 'kind', l: 'Type', type: 'select', v: 'in', opts: [['in', 'Cash in (sale, income)'], ['out', 'Cash out (expense)']] }, { k: 'cat', l: 'Category', type: 'select', v: 'Sales', opts: ['Sales', 'Purchase', 'Rent', 'Salary', 'Bills', 'Transport', 'Food', 'Owner took', 'Other'] }, { k: 'amt', l: 'Amount', v: '', clear: true }, { k: 'note', l: 'Note', type: 'text', clear: true }, { k: 'date', l: 'Date', type: 'date', v: today }],
  check: (v) => (!v.amt ? 'Write the amount' : ''), addLabel: 'Save', sort: (a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1),
  head: ['Date', 'Category', 'Note', 'Amount'], cols: (r) => [fmtDate(r.date), r.cat, r.note, (r.kind === 'in' ? '+ ' : '− ') + taka(r.amt)],
  summary(rs) {
    const t = today(); const m = t.slice(0, 7); const sum = (f, k) => rs.filter(f).filter((r) => r.kind === k).reduce((s, r) => s + r.amt, 0);
    const tin = sum((r) => r.date === t, 'in'), tout = sum((r) => r.date === t, 'out'), min = sum((r) => r.date.startsWith(m), 'in'), mout = sum((r) => r.date.startsWith(m), 'out');
    const bal = sum(() => true, 'in') - sum(() => true, 'out');
    const cats = {}; rs.filter((r) => r.date.startsWith(m) && r.kind === 'out').forEach((r) => (cats[r.cat] = (cats[r.cat] || 0) + r.amt));
    return { cards: [['Cash in hand', taka(bal)], ['Today', taka(tin - tout), `In ${taka(tin)} · Out ${taka(tout)}`], ['This month', taka(min - mout), `In ${taka(min)} · Out ${taka(mout)}`]], table: { title: 'This month’s expenses', head: ['Category', 'Amount'], rows: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, a]) => [c, taka(a)]) } };
  } });

// MARK: Stock
tool({ id: 'stock', name: 'Stock / Inventory', icon: '📦', group: 'Shop', desc: 'What is in stock, its value, and what to reorder',
  render(el) {
    head(el, this, '"Alert" = reorder when stock falls to this number.');
    const p = add(el, '<div class="panel"></div>'); const out = add(el, '<div></div>');
    rowsEditor(p, 'stock.rows', [{ k: 'name', l: 'Item', type: 'text', w: 140 }, { k: 'qty', l: 'In stock', w: 70 }, { k: 'unit', l: 'Unit', type: 'text', w: 60, v: 'pcs' }, { k: 'buy', l: 'Buy price', w: 80 }, { k: 'sell', l: 'Sell price', w: 80 }, { k: 'alert', l: 'Alert at', w: 60 }],
      [{ name: 'Rice (kg)', qty: 120, unit: 'kg', buy: 62, sell: 70, alert: 30 }, { name: 'Soybean oil 1L', qty: 8, unit: 'pcs', buy: 168, sell: 180, alert: 10 }],
      (rows) => {
        const low = rows.filter((r) => r.name && r.qty <= r.alert);
        out.innerHTML = result({ cards: [['Stock value (buy price)', taka(rows.reduce((s, r) => s + r.qty * r.buy, 0))], ['Profit if all sold', taka(rows.reduce((s, r) => s + r.qty * (r.sell - r.buy), 0))], ['Need to reorder', String(low.length), low.map((r) => r.name).join(', ')]], warn: low.length ? `Low stock: ${low.map((r) => `${r.name} (${r.qty} ${r.unit})`).join(', ')}` : '' });
      });
  } });

// MARK: Quotation
tool({ id: 'quotation', name: 'Quotation Maker', icon: '📝', group: 'Shop', desc: 'A professional price quotation (PDF) for clients',
  render(el) {
    head(el, this);
    shopPanel(el);
    const s = store.get('quote', { no: 'Q-' + new Date().getFullYear() + '-001', date: today(), to: '', valid: 15, terms: '50% advance, rest on delivery.\nDelivery within 7 days of work order.', vat: 0, disc: 0 });
    const F = [{ k: 'to', l: 'To (client name and address)', type: 'textarea', rows: 3 }, { k: 'no', l: 'Quotation no', type: 'text' }, { k: 'date', l: 'Date', type: 'date' }, { k: 'valid', l: 'Valid for (days)' }, { k: 'disc', l: 'Discount (৳)' }, { k: 'vat', l: 'VAT %' }, { k: 'terms', l: 'Terms', type: 'textarea', rows: 3 }];
    const f = add(el, `<div class="panel grid3">${F.map((x) => fieldHtml(x, s)).join('')}</div><div class="panel" id="items"></div><div id="tot"></div><div class="row"><button class="primary big" id="pdf">⬇ Save PDF</button></div>`);
    let items = [];
    const total = () => { const sub = items.reduce((t, r) => t + r.qty * r.rate, 0); const after = sub - s.disc; const vat = after * s.vat / 100; return { sub, vat, total: after + vat }; };
    const show = () => { const t = total(); $(el, '#tot').innerHTML = result({ cards: [['Total', taka(t.total, 2)], ['Subtotal', taka(t.sub, 2)], ['VAT', taka(t.vat, 2)]] }); };
    f.oninput = () => { Object.assign(s, readFields(f, F)); store.set('quote', s); show(); };
    rowsEditor($(f, '#items'), 'quote.items', [{ k: 'desc', l: 'Item / work', type: 'text', w: 220 }, { k: 'qty', l: 'Qty', w: 60, v: 1 }, { k: 'rate', l: 'Rate', w: 90 }], [{ desc: 'Item 1', qty: 1, rate: 1000 }], (r) => { items = r; show(); });
    $(el, '#pdf').onclick = () => {
      const t = total();
      const rows = items.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.desc)}</td><td style="text-align:right">${num(r.qty)}</td><td style="text-align:right">${num(r.rate)}</td><td style="text-align:right">${num(r.qty * r.rate)}</td></tr>`).join('');
      const td = 'style="padding:6px;border-bottom:1px solid #ddd"';
      tk.call('pdf', { name: `Quotation ${s.no}.pdf`, html: page(`${docHead('QUOTATION', s.no, s.date)}<p style="margin-top:16px"><b>To:</b><br>${esc(s.to).replace(/\n/g, '<br>')}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:10px"><thead><tr style="background:#eef3ff"><th ${td}>#</th><th ${td} align="left">Description</th><th ${td}>Qty</th><th ${td}>Rate</th><th ${td}>Amount</th></tr></thead><tbody>${rows.replace(/<td/g, `<td ${td}`)}</tbody></table>
        <table style="margin-left:auto;margin-top:10px"><tr><td>Subtotal</td><td align="right">${taka(t.sub, 2)}</td></tr>${s.disc ? `<tr><td>Discount</td><td align="right">− ${taka(s.disc, 2)}</td></tr>` : ''}${s.vat ? `<tr><td>VAT ${s.vat}%</td><td align="right">${taka(t.vat, 2)}</td></tr>` : ''}<tr><td><b>Total</b></td><td align="right"><b>${taka(t.total, 2)}</b></td></tr></table>
        <p><i>In words: ${esc(words(t.total, 'en'))} taka only.</i></p><p><b>Terms</b><br>${esc(s.terms).replace(/\n/g, '<br>')}<br>This quotation is valid for ${s.valid} days.</p><p style="margin-top:60px">______________________<br>Authorised signature</p>`) });
    };
    show();
  } });

// MARK: Money receipt
tool({ id: 'receipt', name: 'Money Receipt', icon: '🧾', group: 'Shop', desc: 'Print or save a money receipt with amount in words',
  render(el) {
    head(el, this);
    shopPanel(el);
    const n = store.get('receipt.no', 1);
    const F = [{ k: 'from', l: 'Received from', type: 'text' }, { k: 'amt', l: 'Amount (৳)', v: 0 }, { k: 'for', l: 'For', type: 'text', ph: 'e.g. House rent for March' }, { k: 'how', l: 'Paid by', type: 'select', v: 'Cash', opts: ['Cash', 'bKash', 'Nagad', 'Bank transfer', 'Cheque'] }, { k: 'ref', l: 'Cheque / transaction no.', type: 'text' }, { k: 'date', l: 'Date', type: 'date', v: today }];
    const f = add(el, `<div class="panel grid3">${F.map((x) => fieldHtml(x, {})).join('')}</div><p class="muted">Receipt no: <b>R-${String(n).padStart(4, '0')}</b></p><div class="row"><button class="primary big" id="pdf">⬇ Save / print</button></div>`);
    $(el, '#pdf').onclick = () => {
      const v = readFields(f, F); if (!v.from || !v.amt) return toast('Write who paid and how much');
      const no = 'R-' + String(store.get('receipt.no', 1)).padStart(4, '0'); store.set('receipt.no', store.get('receipt.no', 1) + 1);
      const line = (l, x) => `<p style="border-bottom:1px dotted #999;padding:6px 0;margin:6px 0"><b>${l}</b> ${x}</p>`;
      tk.call('pdf', { name: `Receipt ${no}.pdf`, html: page(`<div style="border:2px solid #3d7bff;border-radius:12px;padding:20px">${docHead('MONEY RECEIPT', no, v.date)}${line('Received with thanks from:', esc(v.from))}${line('The sum of taka:', `<b>${taka(v.amt, 2)}</b> (${esc(words(v.amt, 'en'))} taka only)`)}${line('For:', esc(v.for))}${line('By:', esc(v.how + (v.ref ? ' — ' + v.ref : '')))}<p style="margin-top:50px;text-align:right">______________________<br>Received by</p></div>`) });
      $(f, 'p.muted b').textContent = 'R-' + String(store.get('receipt.no', 1)).padStart(4, '0');
    };
  } });

// MARK: Staff attendance & salary
tool({ id: 'staff', name: 'Staff Attendance & Salary', icon: '👷', group: 'Shop', desc: 'Mark daily attendance; salary is worked out at month end',
  render(el) {
    head(el, this, 'Add your staff, then tap each day: ✓ present, ✗ absent, L paid leave. Absent days are cut from salary (salary ÷ 30 per day).');
    const s = store.get('staff', { month: today().slice(0, 7), att: {}, adv: {} });
    const top = add(el, `<div class="panel row"><div class="field"><label>Month</label><input type="month" id="m" value="${s.month}"></div></div><div class="panel" id="list"></div><div id="grid" style="overflow-x:auto"></div><div id="r"></div>`);
    let staff = [];
    const draw = () => {
      const [y, mo] = s.month.split('-').map(Number); const days = new Date(y, mo, 0).getDate();
      const cyc = { '': 'P', P: 'A', A: 'L', L: '' };
      let h = `<table style="font-size:12px;min-width:${days * 26 + 160}px"><thead><tr><th>Name</th>${Array.from({ length: days }, (_, i) => `<th style="text-align:center;padding:2px">${i + 1}</th>`).join('')}</tr></thead><tbody>`;
      staff.forEach((p, si) => { h += `<tr><td style="white-space:nowrap">${esc(p.name)}</td>`; for (let d = 1; d <= days; d++) { const k = `${s.month}|${p.name}|${d}`; const v = s.att[k] || ''; h += `<td data-k="${esc(k)}" style="text-align:center;cursor:pointer;padding:4px 2px;background:${v === 'P' ? 'rgba(31,164,99,.3)' : v === 'A' ? 'rgba(229,72,77,.25)' : v === 'L' ? 'rgba(245,165,36,.3)' : 'transparent'}">${{ P: '✓', A: '✗', L: 'L', '': '·' }[v]}</td>`; } h += '</tr>'; });
      $(el, '#grid').innerHTML = h + '</tbody></table>';
      $$(el, '#grid [data-k]').forEach((c) => c.onclick = () => { s.att[c.dataset.k] = cyc[s.att[c.dataset.k] || '']; store.set('staff', s); draw(); });
      const rows = staff.map((p) => { let P = 0, A = 0, L = 0; for (let d = 1; d <= days; d++) { const v = s.att[`${s.month}|${p.name}|${d}`]; if (v === 'P') P++; else if (v === 'A') A++; else if (v === 'L') L++; } const cut = p.salary / 30 * A; const adv = +(s.adv[`${s.month}|${p.name}`] || 0); return [p.name, P, A, L, taka(cut), `<input type="number" data-adv="${esc(`${s.month}|${p.name}`)}" value="${adv || ''}" style="width:90px">`, taka(p.salary - cut - adv)]; });
      $(el, '#r').innerHTML = rows.length ? `<h2>Salary for ${s.month}</h2><table><thead><tr><th>Name</th><th>Present</th><th>Absent</th><th>Leave</th><th>Cut</th><th>Advance taken</th><th>To pay</th></tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x, i) => `<td>${i === 5 ? x : esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
      $$(el, '[data-adv]').forEach((x) => x.onchange = () => { s.adv[x.dataset.adv] = +x.value; store.set('staff', s); draw(); });
    };
    rowsEditor($(top, '#list'), 'staff.people', [{ k: 'name', l: 'Staff name', type: 'text', w: 160 }, { k: 'salary', l: 'Monthly salary', w: 110 }], [{ name: 'Karim', salary: 12000 }], (r) => { staff = r.filter((x) => x.name); draw(); });
    $(top, '#m').onchange = (e) => { s.month = e.target.value; store.set('staff', s); draw(); };
  } });

// MARK: Price list image
tool({ id: 'pricelist', name: 'Price List Maker', icon: '🖼', group: 'Shop', desc: 'Make a price list picture to share on Facebook or WhatsApp',
  render(el) {
    head(el, this);
    shopPanel(el);
    const s = store.get('pricelist', { title: 'আজকের দাম', color: '#3d7bff' });
    const p = add(el, `<div class="panel grid3"><div class="field"><label>Heading</label><input type="text" id="t" value="${esc(s.title)}"></div><div class="field"><label>Colour</label><input type="color" id="c" value="${s.color}"></div></div><div class="panel" id="rows"></div><div class="row"><button class="primary" id="dl">⬇ Save picture</button><button id="sh">Share</button></div><canvas id="cv" class="preview" style="margin-top:12px;max-width:420px;background:#fff"></canvas>`);
    let rows = [];
    const draw = () => {
      s.title = $(p, '#t').value; s.color = $(p, '#c').value; store.set('pricelist', s);
      const c = $(el, '#cv'); const W = 1080; const rh = 74; const H = 300 + rows.length * rh + 120; c.width = W; c.height = H; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = s.color; x.fillRect(0, 0, W, 220);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 64px "Noto Sans Bengali", Arial, sans-serif'; x.fillText(shopInfo().name, W / 2, 100);
      x.font = '44px "Noto Sans Bengali", Arial, sans-serif'; x.fillText(s.title, W / 2, 170);
      rows.forEach((r, i) => { const y = 260 + i * rh; if (i % 2 === 0) { x.fillStyle = '#f2f5fb'; x.fillRect(40, y, W - 80, rh); } x.fillStyle = '#111'; x.textAlign = 'left'; x.font = '40px "Noto Sans Bengali", Arial, sans-serif'; x.fillText(r.item || '', 70, y + 50); x.textAlign = 'right'; x.font = 'bold 40px Arial, sans-serif'; x.fillText(`৳${num(r.price, 2)}${r.unit ? ' / ' + r.unit : ''}`, W - 70, y + 50); });
      x.fillStyle = '#555'; x.textAlign = 'center'; x.font = '34px Arial, sans-serif'; x.fillText([shopInfo().phone, fmtDate(new Date())].filter(Boolean).join('  ·  '), W / 2, H - 50);
    };
    rowsEditor($(p, '#rows'), 'pricelist.rows', [{ k: 'item', l: 'Item', type: 'text', w: 180 }, { k: 'price', l: 'Price', w: 80 }, { k: 'unit', l: 'Per', type: 'text', w: 60 }], [{ item: 'চাল (মিনিকেট)', price: 72, unit: 'kg' }, { item: 'ডাল (মসুর)', price: 110, unit: 'kg' }, { item: 'সয়াবিন তেল', price: 180, unit: 'L' }], (r) => { rows = r; draw(); });
    p.addEventListener('input', (e) => { if (e.target.id) draw(); });
    $(el, '#dl').onclick = () => tk.call('saveAs', { name: 'Price list.png', dataUrl: $(el, '#cv').toDataURL('image/png') });
    $(el, '#sh').onclick = () => $(el, '#cv').toBlob(async (b) => { const f = new File([b], 'price-list.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(() => {}); else toast('Sharing is not available here — save the picture instead'); });
  } });

// MARK: Daily life
calcTool({ id: 'tripcost', name: 'Trip Cost', icon: '🚗', group: 'Daily Life', desc: 'Fuel, tolls and cost per person for a car trip',
  fields: [{ k: 'km', l: 'Distance one way (km)', v: 250 }, { k: 'rt', l: 'Round trip', type: 'check', v: true }, { k: 'kmpl', l: 'Car mileage (km per litre)', v: 11 }, { k: 'fuel', l: 'Fuel', type: 'select', v: 126, opts: [[126, 'Octane'], [122, 'Petrol'], [102, 'Diesel'], [0, 'CNG (enter below)']] }, { k: 'cng', l: 'CNG cost per km (if CNG)', v: 3 }, { k: 'toll', l: 'Tolls and ferry (total)', v: 1500 }, { k: 'other', l: 'Driver, parking, food', v: 2000 }, { k: 'ppl', l: 'People sharing', v: 4 }],
  calc(v) {
    const km = v.km * (v.rt ? 2 : 1); const fuel = v.fuel ? km / v.kmpl * v.fuel : km * v.cng; const tot = fuel + v.toll + v.other;
    return [['Total cost', taka(tot)], ['Per person', taka(tot / Math.max(1, v.ppl))], ['Fuel', taka(fuel), v.fuel ? `${num(km / v.kmpl, 1)} litres for ${num(km, 0)} km` : `${num(km, 0)} km`], ['Per km', taka(tot / km, 1)]];
  },
  note: 'Fuel prices from BPC (2025) — the government changes them now and then.' });

tool({ id: 'recipe', name: 'Recipe Scaler', icon: '🍲', group: 'Daily Life', desc: 'Cook for more or fewer people — every ingredient adjusted',
  render(el) {
    head(el, this);
    const s = store.get('recipe', { from: 4, to: 10 });
    const p = add(el, `<div class="panel row"><div class="field"><label>Recipe is for (people)</label><input type="number" id="f" value="${s.from}"></div><div class="field"><label>I am cooking for</label><input type="number" id="t" value="${s.to}"></div></div><div class="panel" id="rows"></div>`); const out = add(el, '<div></div>'); let rows = [];
    const calc = () => { s.from = +$(p, '#f').value || 1; s.to = +$(p, '#t').value || 1; store.set('recipe', s); const k = s.to / s.from; out.innerHTML = result({ cards: [['Multiply by', `× ${num(k, 2)}`]], table: { title: `For ${s.to} people`, head: ['Ingredient', 'Amount'], rows: rows.filter((r) => r.name).map((r) => [r.name, `${num(r.qty * k, r.qty * k < 10 ? 1 : 0)} ${r.unit}`]) }, tip: 'Salt and chilli: add about 80% of the scaled amount first, then taste.' }); };
    rowsEditor($(p, '#rows'), 'recipe.rows', [{ k: 'name', l: 'Ingredient', type: 'text', w: 150 }, { k: 'qty', l: 'Amount', w: 80 }, { k: 'unit', l: 'Unit', type: 'text', w: 70 }], [{ name: 'Polao rice', qty: 500, unit: 'g' }, { name: 'Chicken', qty: 1, unit: 'kg' }, { name: 'Onion', qty: 3, unit: 'pcs' }, { name: 'Ghee', qty: 3, unit: 'tbsp' }], (r) => { rows = r; calc(); });
    p.addEventListener('input', (e) => { if (e.target.id) calc(); });
  } });

const SHOES = [[22.5, 35, 2.5, 5, 4], [23, 36, 3.5, 6, 5], [23.5, 37, 4, 6.5, 5.5], [24, 38, 5, 7.5, 6.5], [24.5, 39, 6, 8.5, 7], [25, 40, 6.5, 9, 7.5], [25.5, 41, 7.5, 10, 8.5], [26, 42, 8, 10.5, 9], [26.5, 43, 9, 11.5, 10], [27, 44, 9.5, 12, 10.5], [27.5, 45, 10.5, 13, 11.5], [28, 46, 11, 13.5, 12]];
const SHIRT = [[34, 36, 'XS'], [36, 38, 'S'], [38, 40, 'M'], [40, 42, 'L'], [42, 44, 'XL'], [44, 46, 'XXL'], [46, 48, '3XL']];
calcTool({ id: 'sizes', name: 'Clothes & Shoe Sizes', icon: '👟', group: 'Daily Life', desc: 'Your size in EU, UK, US — for online shopping',
  fields: [{ k: 'foot', l: 'Foot length (cm, heel to big toe)', v: 26 }, { k: 'chest', l: 'Chest (inch, around the widest part)', v: 39 }],
  calc(v) {
    const sh = SHOES.find((x) => x[0] >= v.foot) || SHOES[SHOES.length - 1]; const t = SHIRT.find(([, hi]) => v.chest < hi) || SHIRT[SHIRT.length - 1];
    return { cards: [['Shoe EU / BD', String(sh[1])], ['UK', String(sh[2])], ['US women / men', `${sh[3]} / ${sh[4]}`], ['Shirt / T-shirt', t[2], `Chest ${t[0]}–${t[1]}"`]], table: { title: 'Shoe size chart', head: ['Foot cm', 'EU', 'UK', 'US women', 'US men'], rows: SHOES.map((r) => r.map(String)) }, tip: 'Measure your feet in the evening (they are a little bigger then). Brands differ — check their own chart too.' };
  } });

const nextBday = (d) => { const b = new Date(d); const n = new Date(); n.setHours(0, 0, 0, 0); let x = new Date(n.getFullYear(), b.getMonth(), b.getDate()); if (x < n) x = new Date(n.getFullYear() + 1, b.getMonth(), b.getDate()); return x; };
logTool({ id: 'birthdays', name: 'Birthdays & Anniversaries', icon: '🎂', group: 'Daily Life', desc: 'Never forget a birthday — see who is next and their age',
  fields: [{ k: 'name', l: 'Name', type: 'text', clear: true }, { k: 'date', l: 'Date (with year if you know it)', type: 'date', v: '' }, { k: 'kind', l: 'Type', type: 'select', v: 'Birthday', opts: ['Birthday', 'Anniversary', 'Other'] }],
  check: (v) => (!v.name || !v.date ? 'Write the name and date' : ''), addLabel: 'Add',
  sort: (a, b) => nextBday(a.date) - nextBday(b.date),
  head: ['Name', 'Date', 'Next', 'Turns'], cols: (r) => { const n = nextBday(r.date); const d = daysBetween(today(), isoDate(n)); return [`${r.kind === 'Birthday' ? '🎂' : r.kind === 'Anniversary' ? '💍' : '⭐'} ${r.name}`, fmtDate(r.date), d === 0 ? 'TODAY 🎉' : `in ${d} days`, String(n.getFullYear() - new Date(r.date).getFullYear())]; },
  summary(rs) {
    const td = rs.filter((r) => daysBetween(today(), isoDate(nextBday(r.date))) === 0);
    if (td.length && store.get('birthdays.seen', '') !== today()) { store.set('birthdays.seen', today(), true); notify('🎂 Today', td.map((r) => `${r.name} (${r.kind})`).join(', ')); }
    const nx = rs[0];
    return { cards: nx ? [['Next', nx.name, `${fmtDate(nextBday(nx.date))} · ${nx.kind}`], ['This month', String(rs.filter((r) => nextBday(r.date).getMonth() === new Date().getMonth() && daysBetween(today(), isoDate(nextBday(r.date))) < 31).length)]] : [] };
  } });

logTool({ id: 'countdown', name: 'Event Countdown', icon: '⏳', group: 'Daily Life', desc: 'Live countdown to exams, weddings, trips and Eid',
  fields: [{ k: 'name', l: 'Event', type: 'text', clear: true, ph: 'e.g. Cox’s Bazar trip' }, { k: 'date', l: 'Date', type: 'date', v: '' }, { k: 'time', l: 'Time', type: 'time', v: '09:00' }],
  check: (v) => (!v.name || !v.date ? 'Write the event and date' : ''), addLabel: 'Add event',
  sort: (a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`),
  head: ['Event', 'When', 'Time left'], cols: (r) => { const ms = new Date(`${r.date}T${r.time || '00:00'}`) - Date.now(); const d = Math.floor(Math.abs(ms) / 864e5), h = Math.floor(Math.abs(ms) / 36e5) % 24, m = Math.floor(Math.abs(ms) / 6e4) % 60; return [r.name, `${fmtDate(r.date)} ${r.time}`, ms < 0 ? `Done ${d} days ago` : `${d} d ${h} h ${m} min`]; },
  summary(rs) { const up = rs.find((r) => new Date(`${r.date}T${r.time}`) > Date.now()); if (!up) return null; const ms = new Date(`${up.date}T${up.time}`) - Date.now(); return { cards: [[up.name, `${Math.floor(ms / 864e5)} days`, `${Math.floor(ms / 36e5) % 24} h ${Math.floor(ms / 6e4) % 60} min`]] }; },
  timer: 30000 });
