// Home & land, and farming tools.
/* global calcTool, logTool, rowsEditor, tool, head, add, $, $$, esc, store, result, num, taka, today, fmtDate, daysBetween, addDays, isoDate, toast */

// MARK: Land area
const LEN = [['ft', 'Feet', 1], ['hat', 'Hat (হাত, 18 inch)', 1.5], ['m', 'Metre', 3.28084], ['link', 'Link (গান্টার শিকল)', 0.66]];
const heron = (a, b, c) => { const s = (a + b + c) / 2; const x = s * (s - a) * (s - b) * (s - c); return x > 0 ? Math.sqrt(x) : 0; };
calcTool({ id: 'land', name: 'Land Area from Sides', icon: '🗺', group: 'Home & Land', desc: 'Measure the sides of a plot → decimal, katha, bigha',
  intro: 'For a four-sided plot, also measure one corner-to-corner line (diagonal) — it gives the true area even if the plot is not square.',
  fields: [{ k: 'u', l: 'You measured in', type: 'select', v: 'ft', opts: LEN.map(([k, n]) => [k, n]) }, { k: 'shape', l: 'Shape', type: 'select', v: 'quad', opts: [['quad', 'Four sides + one diagonal (best)'], ['rect', 'Four sides only (rough)'], ['tri', 'Triangle (three sides)']] },
    { k: 'a', l: 'Side A (north)', v: 60 }, { k: 'b', l: 'Side B (east)', v: 40 }, { k: 'c', l: 'Side C (south)', v: 58 }, { k: 'd', l: 'Side D (west)', v: 42 }, { k: 'diag', l: 'Diagonal (A–B corner to C–D corner)', v: 72 }],
  calc(v) {
    const f = LEN.find((x) => x[0] === v.u)[2]; const [a, b, c, d, g] = [v.a, v.b, v.c, v.d, v.diag].map((x) => x * f);
    const sq = v.shape === 'tri' ? heron(a, b, c) : v.shape === 'rect' ? (a + c) / 2 * (b + d) / 2 : heron(a, b, g) + heron(c, d, g);
    if (!sq) throw new Error('These sides cannot make that shape. Check the numbers.');
    return [['Decimal (শতাংশ)', num(sq / 435.6, 2)], ['Katha', num(sq / 720, 2)], ['Bigha (33 decimal)', num(sq / 14374.8, 3)], ['Square feet', num(sq, 0)], ['Acre', num(sq / 43560, 4)], ['Square metre', num(sq / 10.7639, 1)]];
  },
  note: '1 decimal = 435.6 sq ft · 1 katha = 720 sq ft · 1 bigha = 33 decimal in most areas (it differs in some districts). For buying or selling land, use a licensed surveyor (আমিন).' });

// MARK: Construction cost
calcTool({ id: 'build', name: 'Construction Cost', icon: '🏗', group: 'Home & Land', desc: 'Rod, cement, sand, brick and total cost of a building',
  fields: [{ k: 'area', l: 'Floor area (sq ft)', v: 1200 }, { k: 'fl', l: 'Number of floors', v: 2 }, { k: 'fin', l: 'Finish', type: 'select', v: 1, opts: [[0.8, 'Basic'], [1, 'Standard'], [1.4, 'Good (tiles, better fittings)']] },
    { h: 'Today’s prices' }, { k: 'rod', l: 'Rod per kg', v: 95 }, { k: 'cem', l: 'Cement per bag', v: 540 }, { k: 'sand', l: 'Sand per cft', v: 45 }, { k: 'brick', l: 'Brick each', v: 13 }, { k: 'stone', l: 'Stone chips per cft', v: 210 }],
  calc(v) {
    const A = v.area * v.fl;
    const m = [['Rod', A * 4, 'kg', v.rod], ['Cement', A * 0.45, 'bags', v.cem], ['Sand', A * 1.8, 'cft', v.sand], ['Bricks', A * 22, 'pcs', v.brick], ['Stone chips', A * 1.3, 'cft', v.stone]];
    const mat = m.reduce((s, x) => s + x[1] * x[3], 0); const lab = mat * 0.3; const finish = A * 900 * v.fin;
    const total = mat + lab + finish;
    return { cards: [['Total (approx.)', taka(total), `${taka(total / A)} per sq ft`], ['Main materials', taka(mat)], ['Labour', taka(lab)], ['Finishing (electric, plumbing, doors, paint, tiles)', taka(finish)]], table: { title: 'Materials needed', head: ['Item', 'Quantity', 'Cost'], rows: m.map(([n, q, u, p]) => [n, `${num(q, 0)} ${u}`, taka(q * p)]) } };
  },
  note: 'Rule-of-thumb numbers for an RCC frame building in Bangladesh. Land, design and RAJUK approval are extra. Always get an engineer’s estimate.' });

// MARK: Bricks
calcTool({ id: 'bricks', name: 'Brick Counter', icon: '🧱', group: 'Home & Land', desc: 'Bricks, cement and sand for a wall',
  fields: [{ k: 'l', l: 'Wall length (ft)', v: 20 }, { k: 'h', l: 'Wall height (ft)', v: 10 }, { k: 't', l: 'Wall thickness', type: 'select', v: 10, opts: [[5, '5 inch (half brick)'], [10, '10 inch (full brick)']] }, { k: 'open', l: 'Doors / windows area (sq ft)', v: 21 }, { k: 'mix', l: 'Mortar mix (cement : sand)', type: 'select', v: 6, opts: [[4, '1 : 4'], [5, '1 : 5'], [6, '1 : 6']] }, { k: 'w', l: 'Waste %', v: 5 }],
  calc(v) {
    const area = Math.max(0, v.l * v.h - v.open); const vol = area * v.t / 12;
    const bricks = area * (v.t === 5 ? 4.8 : 9.6) * (1 + v.w / 100);
    const dry = vol * 0.216 * 1.33; const cem = dry / (1 + v.mix) / 1.25; const sand = dry * v.mix / (1 + v.mix);
    return [['Bricks', num(Math.ceil(bricks), 0)], ['Cement', `${num(Math.ceil(cem), 0)} bags`], ['Sand', `${num(sand, 1)} cft`], ['Wall area', `${num(area, 0)} sq ft`]];
  },
  note: 'Standard Bangladeshi brick (9.5 × 4.5 × 2.75 inch) with 0.5 inch mortar joints.' });

// MARK: Paint
calcTool({ id: 'paint', name: 'Paint Needed', icon: '🎨', group: 'Home & Land', desc: 'How many litres of paint for a room',
  fields: [{ k: 'l', l: 'Room length (ft)', v: 12 }, { k: 'w', l: 'Room width (ft)', v: 10 }, { k: 'h', l: 'Height (ft)', v: 10 }, { k: 'doors', l: 'Doors', v: 1 }, { k: 'win', l: 'Windows', v: 2 }, { k: 'coats', l: 'Coats', v: 2 }, { k: 'ceil', l: 'Paint the ceiling too', type: 'check', v: true }, { k: 'cov', l: 'One litre covers (sq ft, see the tin)', v: 110 }, { k: 'price', l: 'Price per litre', v: 450 }],
  calc(v) {
    const walls = 2 * (v.l + v.w) * v.h - v.doors * 21 - v.win * 15; const area = Math.max(0, walls) + (v.ceil ? v.l * v.w : 0);
    const litres = area * v.coats / v.cov;
    return [['Paint', `${num(Math.ceil(litres * 10) / 10, 1)} litres`, `≈ ${num(litres / 3.64, 1)} gallon`], ['Cost', taka(Math.ceil(litres) * v.price)], ['Area to paint', `${num(area, 0)} sq ft`], ['Primer / putty', `${num(area / 120, 1)} litres primer`]];
  } });

// MARK: Tiles
calcTool({ id: 'tiles', name: 'Tiles Counter', icon: '🔲', group: 'Home & Land', desc: 'How many tiles and boxes for a floor or wall',
  fields: [{ k: 'l', l: 'Length (ft)', v: 12 }, { k: 'w', l: 'Width (ft)', v: 10 }, { k: 'size', l: 'Tile size', type: 'select', v: '24x24', opts: ['12x12', '16x16', '12x24', '24x24', '24x48', '8x12', '10x15'].map((x) => [x, x.replace('x', ' × ') + ' inch']) }, { k: 'box', l: 'Tiles per box', v: 4 }, { k: 'w2', l: 'Extra for cutting %', v: 10 }, { k: 'price', l: 'Price per sq ft', v: 120 }],
  calc(v) {
    const [a, b] = v.size.split('x').map(Number); const area = v.l * v.w; const per = a * b / 144;
    const n = Math.ceil(area / per * (1 + v.w2 / 100));
    return [['Tiles', num(n, 0)], ['Boxes', num(Math.ceil(n / v.box), 0)], ['Area', `${num(area, 0)} sq ft`], ['Cost', taka(Math.ceil(n / v.box) * v.box * per * v.price)]];
  } });

// MARK: AC size
calcTool({ id: 'acsize', name: 'AC Size', icon: '❄️', group: 'Home & Land', desc: 'Which ton AC for your room — and the monthly bill',
  fields: [{ k: 'l', l: 'Room length (ft)', v: 14 }, { k: 'w', l: 'Room width (ft)', v: 12 }, { k: 'p', l: 'People usually in the room', v: 2 }, { k: 'sun', l: 'Top floor or afternoon sun', type: 'check', v: false }, { k: 'hrs', l: 'Hours per day', v: 8 }, { k: 'inv', l: 'Inverter AC', type: 'check', v: true }, { k: 'rate', l: 'Electricity per unit', v: 8 }],
  calc(v) {
    let btu = v.l * v.w * 30 + Math.max(0, v.p - 2) * 600; if (v.sun) btu *= 1.15;
    const ton = [1, 1.5, 2, 2.5, 3, 4].find((t) => t * 12000 >= btu) || 4;
    const units = ton * 1.1 * (v.inv ? 0.6 : 0.9) * v.hrs * 30;
    return [['AC size', `${ton} ton`, `${num(btu, 0)} BTU needed`], ['Units per month', num(units, 0)], ['Bill per month', taka(units * v.rate)]];
  },
  note: 'Set it to 25–26°C: each degree lower uses about 6% more power. Clean the filter every month.' });

// MARK: IPS / solar
const APPL = [{ name: 'Fan', w: 75, q: 3, h: 8 }, { name: 'LED light', w: 12, q: 6, h: 6 }, { name: 'Router', w: 12, q: 1, h: 24 }, { name: 'TV', w: 80, q: 1, h: 4 }, { name: 'Phone charging', w: 15, q: 3, h: 3 }];
tool({ id: 'ips', name: 'IPS / Solar Sizing', icon: '🔋', group: 'Home & Land', desc: 'What size IPS, battery and solar panel you need',
  render(el) {
    head(el, this, 'List what must run during load-shedding. Hours = hours used per day (for solar).');
    const s = store.get('ips', { backup: 3, volt: 12, sun: 4.5 });
    const p = add(el, `<div class="panel grid3"><div class="field"><label>Backup needed (hours of power cut)</label><input type="number" id="b" value="${s.backup}"></div><div class="field"><label>Battery system</label><select id="v"><option value="12">12 V</option><option value="24">24 V</option><option value="48">48 V</option></select></div><div class="field"><label>Sun hours per day</label><input type="number" id="s" value="${s.sun}" step="0.5"></div></div><div class="panel" id="a"></div>`);
    $(p, '#v').value = s.volt; const out = add(el, '<div></div>'); let rows = [];
    const calc = () => {
      s.backup = +$(p, '#b').value; s.volt = +$(p, '#v').value; s.sun = +$(p, '#s').value; store.set('ips', s);
      const W = rows.reduce((t, r) => t + r.w * r.q, 0); const day = rows.reduce((t, r) => t + r.w * r.q * r.h, 0);
      const va = W / 0.7; const ips = [600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 5000].find((x) => x >= va) || Math.ceil(va / 1000) * 1000;
      const ah = W * s.backup / (s.volt * 0.5 * 0.85); // lead-acid: use only half
      const panel = day / s.sun / 0.75;
      out.innerHTML = result({ cards: [['IPS size', `${ips} VA`, `Load ${num(W, 0)} W`], ['Battery', `${num(Math.ceil(ah / 10) * 10, 0)} Ah at ${s.volt} V`, `${Math.ceil(ah / 200)} × 200 Ah battery`], ['Solar panel (for full day use)', `${num(Math.ceil(panel / 50) * 50, 0)} W`, `Uses ${num(day / 1000, 2)} units a day`]], tip: 'Do not run AC, iron, rice cooker or motor on a normal IPS. Lithium batteries can use 80–90% (smaller battery needed).' });
    };
    rowsEditor($(p, '#a'), 'ips.rows', [{ k: 'name', l: 'Appliance', type: 'text', w: 130 }, { k: 'w', l: 'Watts', w: 70 }, { k: 'q', l: 'How many', w: 60 }, { k: 'h', l: 'Hours/day', w: 70 }], APPL, (r) => { rows = r; calc(); });
    p.addEventListener('input', (e) => { if (e.target.id) calc(); }); $(p, '#v').onchange = calc;
  } });

// MARK: Electric load
tool({ id: 'eload', name: 'Electric Load & Wiring', icon: '🔌', group: 'Home & Land', desc: 'Total watts, wire size, breaker and monthly units',
  render(el) {
    head(el, this, 'Add the appliances on one line (circuit) or the whole flat.');
    const p = add(el, '<div class="panel"></div>'); const out = add(el, '<div></div>');
    const R = store.get('eload.rate', 8);
    rowsEditor(p, 'eload.rows', [{ k: 'name', l: 'Appliance', type: 'text', w: 130 }, { k: 'w', l: 'Watts', w: 70 }, { k: 'q', l: 'How many', w: 60 }, { k: 'h', l: 'Hours/day', w: 70 }],
      [...APPL, { name: 'Fridge', w: 150, q: 1, h: 10 }, { name: 'Iron', w: 1000, q: 1, h: 0.3 }, { name: '1.5 ton AC', w: 1500, q: 1, h: 6 }],
      (rows) => {
        const W = rows.reduce((t, r) => t + r.w * r.q, 0); const A = W * 0.8 / 220; // not everything runs at once
        const brk = [6, 10, 16, 20, 25, 32, 40, 50, 63].find((x) => x >= A * 1.25) || 100;
        const wire = brk <= 10 ? '1.5 mm²' : brk <= 16 ? '2.5 mm²' : brk <= 25 ? '4 mm²' : brk <= 32 ? '6 mm²' : brk <= 50 ? '10 mm²' : '16 mm²';
        const units = rows.reduce((t, r) => t + r.w * r.q * r.h, 0) * 30 / 1000;
        out.innerHTML = result({ cards: [['Breaker', `${brk} A`], ['Wire (copper)', wire], ['Total load', `${num(W / 1000, 2)} kW`, `≈ ${num(A, 1)} A at 220 V`], ['Units per month', num(units, 0), `≈ ${taka(units * R)}`]], tip: 'Use a separate line with its own breaker for AC, geyser and motor. Always fit an earth wire.' });
      });
  } });

// MARK: Water tank
calcTool({ id: 'tank', name: 'Water Tank Size', icon: '🚰', group: 'Home & Land', desc: 'Tank size for your family or building',
  fields: [{ k: 'p', l: 'People', v: 5 }, { k: 'lpd', l: 'Litres per person per day', v: 135 }, { k: 'days', l: 'Days of storage', v: 1 }, { k: 'extra', l: 'Extra (garden, car wash) litres/day', v: 0 }],
  calc(v) {
    const L = (v.p * v.lpd + v.extra) * v.days; const t = [500, 750, 1000, 1500, 2000, 3000, 5000, 10000].find((x) => x >= L) || L;
    return [['Tank to buy', `${num(t, 0)} litres`], ['Daily need', `${num(v.p * v.lpd + v.extra, 0)} L`], ['Motor run time (1 hp ≈ 2,000 L/h)', `${num(L / 2000 * 60, 0)} min`]];
  } });

// MARK: Shifting checklist
const SHIFT = [['2–4 weeks before', ['Give notice to the landlord in writing', 'Book a trusted shifting service or truck', 'Collect boxes, tape and old newspapers', 'Sell or give away what you do not need']], ['1 week before', ['Pack things you rarely use; label every box by room', 'Tell the bank, school, office of the new address', 'Arrange gas, electricity and internet at the new home', 'Take photos of the old flat for the advance money']], ['Day before', ['Defrost and clean the fridge', 'Pack a bag with clothes, medicine, chargers, papers', 'Keep jewellery, cash and documents with you']], ['Moving day', ['Read the meters and take photos', 'Check every room and cupboard before leaving', 'Count the boxes at both ends', 'Collect the advance money and give back the keys']], ['After moving', ['Change the door locks', 'Update NID / voter address if needed', 'Find the nearest pharmacy, hospital and police station']]];
tool({ id: 'shifting', name: 'Shifting Checklist', icon: '📦', group: 'Home & Land', desc: 'Step-by-step list for moving house',
  render(el) {
    head(el, this, 'Tick things off as you go. Your ticks are saved.');
    const s = store.get('shifting', {});
    add(el, SHIFT.map(([t, items], i) => `<div class="panel"><b>${esc(t)}</b>${items.map((x, j) => `<label class="row check" style="margin-top:8px"><input type="checkbox" data-k="${i}.${j}"${s[`${i}.${j}`] ? ' checked' : ''}> ${esc(x)}</label>`).join('')}</div>`).join('') + '<button id="r">Start a new move (clear ticks)</button>');
    $$(el, '[data-k]').forEach((c) => c.onchange = () => { s[c.dataset.k] = c.checked; store.set('shifting', s); });
    $(el, '#r').onclick = () => { store.set('shifting', {}); $$(el, '[data-k]').forEach((c) => (c.checked = false)); };
  } });

// MARK: Farming
const AREA_U = [['bigha', 'Bigha (33 decimal)', 1], ['dec', 'Decimal (শতাংশ)', 1 / 33], ['acre', 'Acre', 3.03], ['katha', 'Katha', 1 / 20], ['ha', 'Hectare', 7.48]];
const FERT = { // kg per bigha (33 decimal) for medium fertile land; BARC/BRRI guides, rounded.
  'Boro rice': { Urea: 36, TSP: 12, MoP: 17, Gypsum: 9, Zinc: 1.4, how: 'Urea in 3 parts: 15, 30 and 45 days after planting. Others at final land preparation.' },
  'Aman rice': { Urea: 24, TSP: 9, MoP: 12, Gypsum: 7, how: 'Urea in 3 parts: 10, 25 and 40 days after planting.' },
  'Aus rice': { Urea: 20, TSP: 7, MoP: 10, Gypsum: 5, how: 'Urea in 2–3 parts after planting.' },
  Wheat: { Urea: 28, TSP: 24, MoP: 15, Gypsum: 15, Boron: 1, how: 'Two-thirds of urea at sowing, the rest at the first irrigation (about 20 days).' },
  Potato: { Urea: 43, TSP: 29, MoP: 33, Gypsum: 16, Zinc: 1.3, Boron: 1, how: 'Half urea at planting, half 30–35 days later with earthing up.' },
  'Maize (hybrid)': { Urea: 67, TSP: 33, MoP: 27, Gypsum: 33, Zinc: 2, Boron: 0.7, how: 'Urea in 3 parts: at sowing, 30 days and 50–60 days.' },
  Mustard: { Urea: 33, TSP: 23, MoP: 11, Gypsum: 20, Boron: 1.3, how: 'Half urea at sowing, half at flowering start.' },
  Lentil: { Urea: 6, TSP: 12, MoP: 5, Boron: 1, how: 'All at final land preparation. Pulses fix their own nitrogen.' },
  Onion: { Urea: 35, TSP: 27, MoP: 20, Gypsum: 15, how: 'Urea in 2 parts: 25 and 50 days after planting.' },
  Brinjal: { Urea: 50, TSP: 20, MoP: 33, Gypsum: 10, how: 'Urea in 3–4 parts every 3 weeks after planting.' },
  Jute: { Urea: 25, TSP: 5, MoP: 8, Gypsum: 12, how: 'Half urea at sowing, half 45 days later.' },
};
calcTool({ id: 'fertilizer', name: 'Fertilizer Dose', icon: '🌾', group: 'Farming', desc: 'Urea, TSP, MoP and gypsum for your crop and land',
  fields: [{ k: 'crop', l: 'Crop', type: 'select', v: 'Boro rice', opts: Object.keys(FERT) }, { k: 'a', l: 'Land', v: 1 }, { k: 'u', l: 'Unit', type: 'select', v: 'bigha', opts: AREA_U.map(([k, n]) => [k, n]) }],
  calc(v) {
    const f = FERT[v.crop]; const bigha = v.a * AREA_U.find((x) => x[0] === v.u)[2];
    const rows = Object.entries(f).filter(([k]) => k !== 'how').map(([k, x]) => [k, `${num(x * bigha, 1)} kg`, `${num(x, 1)} kg/bigha`]);
    return { cards: [['Land', `${num(bigha, 2)} bigha`, `${num(bigha * 33, 1)} decimal`], ['Compost / cow dung', `${num(bigha * 700, 0)} kg`, 'if available — less chemical needed']], table: { title: 'Fertilizer to use', head: ['Fertilizer', 'Amount', 'Rate'], rows }, tip: f.how };
  },
  note: 'Average doses from BARC fertilizer guide for medium fertile land. A soil test (free at Upazila SRDI / agriculture office) gives exact doses. Ask your Upazila agriculture officer.' });

const SEED = { 'Boro rice (seedbed)': [3.5, 'Seedlings ready in 35–45 days. Plant 2–3 per hill, 20 × 15 cm.'], 'Aman rice (seedbed)': [3.5, 'Seedlings 25–30 days old. 25 × 15 cm.'], Wheat: [16, 'Line sowing 20 cm apart.'], 'Maize (hybrid)': [2.7, '60 × 20 cm, one seed per hole.'], Mustard: [1, 'Broadcast or 30 cm lines.'], Lentil: [4.5, 'Broadcast after rice harvest.'], Jute: [0.9, 'Thin plants to 7–10 cm apart.'], 'Potato (seed tubers)': [200, '60 × 25 cm. Cut big tubers with 2 eyes each.'], 'Onion (seed)': [0.6, 'Seedbed, then plant 15 × 10 cm.'], 'Onion (bulbs)': [130, '15 × 10 cm.'], Sesame: [1, 'Broadcast or 30 cm lines.'], 'Mung bean': [4, '30 cm lines.'] };
calcTool({ id: 'seedrate', name: 'Seed Rate', icon: '🌱', group: 'Farming', desc: 'How much seed to buy for your land',
  fields: [{ k: 'crop', l: 'Crop', type: 'select', v: 'Wheat', opts: Object.keys(SEED) }, { k: 'a', l: 'Land', v: 1 }, { k: 'u', l: 'Unit', type: 'select', v: 'bigha', opts: AREA_U.map(([k, n]) => [k, n]) }, { k: 'p', l: 'Seed price per kg', v: 0 }],
  calc(v) { const [r, tip] = SEED[v.crop]; const b = v.a * AREA_U.find((x) => x[0] === v.u)[2]; return { cards: [['Seed needed', `${num(r * b, 1)} kg`, `${r} kg per bigha`], ...(v.p ? [['Cost', taka(r * b * v.p)]] : [])], tip }; },
  note: 'Use certified seed (BADC or trusted company). Buy 5–10% extra for gaps.' });

logTool({ id: 'mushroom', name: 'Mushroom Batch Planner', icon: '🍄', group: 'Farming', desc: 'Track each straw batch: dates, harvests and yield',
  intro: 'Add a batch when you spawn it. Press "+ Harvest" each time you pick mushrooms.',
  fields: [{ k: 'name', l: 'Batch name', type: 'text', ph: 'e.g. Batch 1', clear: true }, { k: 'kind', l: 'Mushroom', type: 'select', v: 'oyster', opts: [['oyster', 'Oyster (ঝিনুক) on straw'], ['straw', 'Straw mushroom (খড় ছত্রাক)']] }, { k: 'start', l: 'Spawned on', type: 'date', v: today }, { k: 'straw', l: 'Dry straw (kg)', v: 10 }, { k: 'spawn', l: 'Spawn packets', v: 2 }, { k: 'cost', l: 'Total cost', v: 0 }],
  check: (v) => (!v.name ? 'Give the batch a name' : ''), addLabel: 'Add batch', make: (v) => ({ ...v, harvest: 0 }),
  rowAction: { label: () => '+ Harvest', run: (r) => { const kg = parseFloat(prompt(`Harvest from ${r.name} (kg):`, '0.5')); return kg > 0 ? { ...r, harvest: (r.harvest || 0) + kg, last: today() } : r; } },
  head: ['Batch', 'Spawned', 'Stage', 'Harvest'],
  cols: (r) => { const d = daysBetween(r.start, today()); const [run, first, end] = r.kind === 'straw' ? [10, 12, 25] : [18, 25, 60]; return [r.name, fmtDate(r.start), d < run ? `Spawn run — day ${d}` : d < first ? `Pinheads soon (${first - d} days)` : d < end ? `Harvesting — day ${d}` : 'Finished', `${num(r.harvest || 0, 2)} kg (${num((r.harvest || 0) / r.straw * 100, 0)}%)`]; },
  summary(rs) {
    const kg = rs.reduce((s, r) => s + (r.harvest || 0), 0); const straw = rs.reduce((s, r) => s + r.straw, 0); const cost = rs.reduce((s, r) => s + r.cost, 0);
    return { cards: [['Total harvest', `${num(kg, 2)} kg`], ['Yield', straw ? `${num(kg / straw * 100, 0)}% of straw weight` : '—', 'Good oyster batches give 60–100%'], ['Cost per kg', kg ? taka(cost / kg) : '—']],
      tip: 'Oyster: keep dark for spawn run (18–20 days), then light, fresh air and spray water 2–3 times a day. Straw mushroom: warm (30–35°C), harvest in egg stage every day.' };
  } });

calcTool({ id: 'fishpond', name: 'Fish Pond Stocking', icon: '🐟', group: 'Farming', desc: 'How many fingerlings, lime and feed for your pond',
  fields: [{ k: 'dec', l: 'Pond size (decimal)', v: 33 }, { k: 'depth', l: 'Water depth (feet)', v: 5 }, { k: 'type', l: 'Farming type', type: 'select', v: 'carp', opts: [['carp', 'Carp mix (rui, catla, mrigel…)'], ['tilapia', 'Tilapia only'], ['pangas', 'Pangas only']] }, { k: 'fp', l: 'Feed price per kg', v: 60 }],
  calc(v) {
    const per = { carp: 35, tilapia: 150, pangas: 120 }[v.type]; const n = Math.round(v.dec * per * Math.min(1.2, v.depth / 5));
    const mix = v.type === 'carp' ? [['Rui', 0.3], ['Catla', 0.15], ['Mrigel', 0.2], ['Silver carp', 0.15], ['Grass carp', 0.05], ['Sharpunti', 0.15]] : [[v.type === 'tilapia' ? 'Mono-sex tilapia' : 'Pangas', 1]];
    const feed = { carp: 0.9, tilapia: 1.4, pangas: 1.6 }[v.type] * n * ({ carp: 0.8, tilapia: 0.35, pangas: 1 }[v.type]);
    return { cards: [['Fingerlings', num(n, 0)], ['Lime before stocking', `${num(v.dec, 0)} kg`, '1 kg per decimal'], ['Cow dung / urea / TSP', `${num(v.dec * 6, 0)} / ${num(v.dec * 0.1, 1)} / ${num(v.dec * 0.05, 1)} kg`, 'to grow natural food, 7 days after lime'], ['Feed for the season', `${num(feed, 0)} kg`, taka(feed * v.fp)]], table: { title: 'Stocking mix', head: ['Fish', 'Number'], rows: mix.map(([f, x]) => [f, num(Math.round(n * x), 0)]) }, tip: 'Feed 3–5% of fish weight daily, morning and afternoon. Less in winter or cloudy days.' };
  },
  note: 'From Department of Fisheries guides. Ask the Upazila fisheries officer for local advice.' });

calcTool({ id: 'poultry', name: 'Poultry Feed & Profit', icon: '🐔', group: 'Farming', desc: 'Feed, cost and profit for broiler, sonali or layer',
  fields: [{ k: 't', l: 'Type', type: 'select', v: 'broiler', opts: [['broiler', 'Broiler (≈ 32 days)'], ['sonali', 'Sonali (≈ 65 days)'], ['layer', 'Layer (per month, laying)']] }, { k: 'n', l: 'Birds', v: 500 }, { k: 'chick', l: 'Chick price', v: 50 }, { k: 'feed', l: 'Feed per kg', v: 70 }, { k: 'other', l: 'Medicine, vaccine, power per bird', v: 15 }, { k: 'sell', l: 'Sale price per kg (eggs: per piece)', v: 170 }, { k: 'die', l: 'Deaths %', v: 4 }],
  calc(v) {
    const T = { broiler: [3.1, 1.9], sonali: [2.4, 0.95], layer: [3.5, 26] }[v.t];
    const alive = v.n * (1 - v.die / 100); const feed = v.n * T[0];
    const cost = feed * v.feed + v.n * v.other + (v.t === 'layer' ? 0 : v.n * v.chick);
    const income = v.t === 'layer' ? alive * T[1] * 0.85 * v.sell : alive * T[1] * v.sell;
    return [['Profit', taka(income - cost), v.t === 'layer' ? 'per month' : 'per batch'], ['Feed needed', `${num(feed, 0)} kg`, `${num(feed / 50, 0)} bags of 50 kg`], ['Total cost', taka(cost)], ['Sales', taka(income), v.t === 'layer' ? `${num(alive * T[1] * 0.85, 0)} eggs` : `${num(alive * T[1], 0)} kg live`]];
  },
  note: 'Typical numbers for good management. Follow the vaccine schedule from your feed company or the Upazila livestock office.' });

const CROPS = [['Boro rice', [11, 12], [4, 5]], ['Aman rice', [6, 7], [10, 11]], ['Aus rice', [3, 4], [7, 8]], ['Wheat', [10, 11], [2, 3]], ['Potato', [10, 11], [1, 2]], ['Mustard', [9, 10], [12, 1]], ['Lentil', [9, 10], [1, 2]], ['Maize (rabi)', [10, 11], [3, 4]], ['Onion', [10, 11], [2, 3]], ['Jute', [2, 3, 4], [6, 7]], ['Brinjal', [8, 9, 10], [11, 12, 1, 2, 3]], ['Tomato', [9, 10], [12, 1, 2]], ['Cauliflower / cabbage', [8, 9, 10], [11, 12, 1]], ['Pumpkin', [9, 10, 11], [1, 2, 3]], ['Mung bean', [2, 3], [5, 6]], ['Sesame', [2, 3], [5, 6]], ['Watermelon', [11, 12, 1], [3, 4]], ['Red amaranth (lal shak)', [1, 2, 3, 9, 10, 11], [2, 3, 4, 10, 11, 12]]];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
tool({ id: 'cropcal', name: 'Crop Calendar', icon: '📆', group: 'Farming', desc: 'What to sow and harvest this month in Bangladesh',
  render(el) {
    head(el, this, 'Rabi = winter (Oct–Mar), Kharif-1 = summer (Mar–Jun), Kharif-2 = rainy (Jul–Oct).');
    const m = new Date().getMonth() + 1;
    const sow = CROPS.filter(([, s]) => s.includes(m)).map(([n]) => n); const cut = CROPS.filter(([, , h]) => h.includes(m)).map(([n]) => n);
    add(el, result({ cards: [[`Sow in ${MON[m - 1]}`, sow.join(', ') || '—'], [`Harvest in ${MON[m - 1]}`, cut.join(', ') || '—']] }));
    add(el, `<div style="overflow-x:auto"><table style="min-width:640px;font-size:12px"><thead><tr><th>Crop</th>${MON.map((x, i) => `<th style="text-align:center${i + 1 === m ? ';color:var(--accent)' : ''}">${x}</th>`).join('')}</tr></thead><tbody>${CROPS.map(([n, s, h]) => `<tr><td style="white-space:nowrap">${esc(n)}</td>${MON.map((_, i) => `<td style="text-align:center;background:${s.includes(i + 1) ? 'rgba(31,164,99,.3)' : h.includes(i + 1) ? 'rgba(245,165,36,.35)' : 'transparent'}">${s.includes(i + 1) ? '🌱' : h.includes(i + 1) ? '🌾' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted note">🌱 sow / plant · 🌾 harvest. Dates move a little by region and weather.</p>`);
  } });

logTool({ id: 'farmbook', name: 'Farm Profit Tracker', icon: '🚜', group: 'Farming', desc: 'Income and costs for each crop, pond or batch',
  fields: [{ k: 'what', l: 'Crop / pond / batch', type: 'text', v: () => store.get('farmbook.last', ''), ph: 'e.g. Boro 2026' }, { k: 'kind', l: 'Type', type: 'select', v: 'out', opts: [['out', 'Cost'], ['in', 'Income (sale)']] }, { k: 'item', l: 'For', type: 'text', ph: 'seed, fertilizer, labour, sale…', clear: true }, { k: 'amt', l: 'Amount', v: '', clear: true }, { k: 'date', l: 'Date', type: 'date', v: today }],
  check: (v) => (!v.what ? 'Write the crop or batch name' : !v.amt ? 'Write the amount' : (store.set('farmbook.last', v.what, true), '')), addLabel: 'Save',
  head: ['Date', 'Crop / batch', 'For', 'Amount'], cols: (r) => [fmtDate(r.date), r.what, r.item, (r.kind === 'in' ? '+ ' : '− ') + taka(r.amt)], sort: (a, b) => (a.date < b.date ? 1 : -1),
  summary(rs) {
    const by = {}; rs.forEach((r) => { const x = (by[r.what] ||= { in: 0, out: 0 }); x[r.kind] += r.amt; });
    const tin = rs.filter((r) => r.kind === 'in').reduce((s, r) => s + r.amt, 0); const tout = rs.filter((r) => r.kind === 'out').reduce((s, r) => s + r.amt, 0);
    return { cards: [['Profit (all)', taka(tin - tout)], ['Income', taka(tin)], ['Costs', taka(tout)]], table: { title: 'By crop / batch', head: ['Crop / batch', 'Income', 'Cost', 'Profit'], rows: Object.entries(by).map(([k, x]) => [k, taka(x.in), taka(x.out), taka(x.in - x.out)]) } };
  } });
