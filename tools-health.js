// Health tools. Not medical advice: every tool says when to see a doctor.
/* global calcTool, logTool, tool, head, add, $, $$, esc, store, result, num, today, fmtDate, daysBetween, addDays, isoDate, notify, toast */

const heightM = (ft, inch) => (ft * 12 + inch) * 0.0254;
const HEIGHT = [{ k: 'ft', l: 'Height (feet)', v: 5 }, { k: 'in', l: 'and inches', v: 6 }];

calcTool({ id: 'bmi', name: 'BMI & Ideal Weight', icon: '⚖️', group: 'Health', desc: 'Are you a healthy weight? (Asian scale)',
  fields: [...HEIGHT, { k: 'kg', l: 'Weight (kg)', v: 65 }],
  calc(v) {
    const h = heightM(v.ft, v.in); if (!h) throw new Error('Enter your height.');
    const bmi = v.kg / h / h;
    const [st, tip] = bmi < 18.5 ? ['Underweight', 'Eat more protein and regular meals. See a doctor if you are losing weight without trying.'] : bmi < 23 ? ['Healthy', 'Keep it up: walk 30 minutes a day and eat less sugar and oil.'] : bmi < 27.5 ? ['Overweight', 'Losing even 5% of your weight lowers the risk of diabetes and blood pressure.'] : ['Obese', 'Higher risk of diabetes, heart disease and joint pain. Talk to a doctor about a safe plan.'];
    return { cards: [['Your BMI', num(bmi, 1), st], ['Healthy weight for you', `${num(18.5 * h * h, 0)}–${num(22.9 * h * h, 0)} kg`], [v.kg > 22.9 * h * h ? 'To lose' : v.kg < 18.5 * h * h ? 'To gain' : 'Change needed', v.kg > 22.9 * h * h ? `${num(v.kg - 22.9 * h * h, 1)} kg` : v.kg < 18.5 * h * h ? `${num(18.5 * h * h - v.kg, 1)} kg` : 'None 🎉']], tip };
  },
  note: 'Uses the WHO scale for Asian people (healthy 18.5–22.9). BMI does not see muscle — athletes may look "overweight".' });

calcTool({ id: 'calories', name: 'Daily Calories', icon: '🍚', group: 'Health', desc: 'How much to eat to keep, lose or gain weight',
  fields: [{ k: 'sex', l: 'Sex', type: 'select', v: 'm', opts: [['m', 'Male'], ['f', 'Female']] }, { k: 'age', l: 'Age', v: 30 }, ...HEIGHT, { k: 'kg', l: 'Weight (kg)', v: 70 },
    { k: 'act', l: 'How active', type: 'select', v: 1.375, opts: [[1.2, 'Desk job, little walking'], [1.375, 'Light (walk / exercise 1–3 days)'], [1.55, 'Moderate (3–5 days)'], [1.725, 'Hard work or daily sport']] }],
  calc(v) {
    const bmr = 10 * v.kg + 6.25 * heightM(v.ft, v.in) * 100 - 5 * v.age + (v.sex === 'm' ? 5 : -161);
    const t = bmr * v.act;
    return { cards: [['To keep your weight', `${num(t, 0)} kcal/day`], ['To lose ½ kg a week', `${num(Math.max(t - 500, v.sex === 'm' ? 1500 : 1200), 0)} kcal`], ['To gain ½ kg a week', `${num(t + 500, 0)} kcal`], ['Body at rest uses', `${num(bmr, 0)} kcal`]],
      tip: 'For scale: 1 plate of rice (~250 g) ≈ 330 kcal, 1 ruti ≈ 120, 1 egg ≈ 75, 1 cup milk tea with sugar ≈ 90, 1 singara ≈ 150.' };
  } });

calcTool({ id: 'water', name: 'Water Intake', icon: '💧', group: 'Health', desc: 'How much water your body needs today',
  fields: [{ k: 'kg', l: 'Weight (kg)', v: 65 }, { k: 'ex', l: 'Exercise / hard work today (minutes)', v: 30 }, { k: 'hot', l: 'Hot day or working in the sun', type: 'check', v: true }, { k: 'preg', l: 'Pregnant or breastfeeding', type: 'check', v: false }],
  calc(v) {
    const l = v.kg * 0.033 + v.ex / 30 * 0.35 + (v.hot ? 0.5 : 0) + (v.preg ? 0.7 : 0);
    return { cards: [['Drink today', `${num(l, 1)} litres`], ['Glasses (250 ml)', num(Math.ceil(l / 0.25), 0)], ['Every waking hour', `${num(l / 16 * 1000, 0)} ml`]], tip: 'Pale yellow urine means you are drinking enough. With kidney or heart problems, ask your doctor first.' };
  } });

calcTool({ id: 'pregnancy', name: 'Pregnancy Due Date', icon: '🤰', group: 'Health', desc: 'Due date, week by week and check-up dates',
  fields: [{ k: 'lmp', l: 'First day of last period', type: 'date', v: () => isoDate(addDays(new Date(), -70)) }, { k: 'cyc', l: 'Usual cycle length (days)', v: 28 }],
  calc(v) {
    const lmp = new Date(v.lmp); const due = addDays(lmp, 280 + (v.cyc - 28));
    const d = daysBetween(isoDate(addDays(lmp, v.cyc - 28)), today()); const w = Math.floor(d / 7);
    const tri = w < 13 ? '1st trimester' : w < 27 ? '2nd trimester' : '3rd trimester';
    const at = (wk) => fmtDate(addDays(lmp, wk * 7 + (v.cyc - 28)));
    const rows = [['8–12', 'First check-up, blood tests, dating ultrasound', at(8)], ['11–14', 'NT scan (optional)', at(11)], ['16', '2nd ANC visit, TT vaccine as advised', at(16)], ['18–22', 'Anomaly (full body) scan', at(18)], ['24–28', 'Sugar test (OGTT)', at(24)], ['28–32', '3rd ANC visit, baby movements count', at(28)], ['36', '4th ANC visit, plan where to deliver', at(36)], ['37–40', 'Baby can come any day', at(37)]];
    return { cards: [['Due date', fmtDate(due)], ['You are', d >= 0 && w < 43 ? `${w} weeks ${d % 7} days` : '—', tri], ['Days to go', num(Math.max(0, daysBetween(today(), isoDate(due))), 0)]],
      warn: 'Go to a hospital at once for bleeding, severe headache, blurred vision, fits, high fever, water breaking or the baby moving less.',
      table: { title: 'Check-ups', head: ['Week', 'What', 'Date'], rows } };
  },
  note: 'At least 4 check-ups (ANC) are needed. Take iron-folic acid and eat one extra meal a day.' });

logTool({ id: 'period', name: 'Period & Ovulation', icon: '🌸', group: 'Health', desc: 'Track periods, predict the next one and fertile days',
  fields: [{ k: 'start', l: 'Period started on', type: 'date', v: today }, { k: 'len', l: 'Lasted (days)', v: 5 }],
  addLabel: 'Add period', head: ['Started', 'Days', 'Cycle'], sort: (a, b) => (a.start < b.start ? 1 : -1),
  cols: (r) => [fmtDate(r.start), r.len, r.cycle ? r.cycle + ' days' : ''],
  summary(rs) {
    const s = rs.map((r) => r.start).sort();
    rs.forEach((r) => { const i = s.indexOf(r.start); r.cycle = i > 0 ? daysBetween(s[i - 1], r.start) : 0; });
    if (!s.length) return { tip: 'Add the first day of your last period. After 2–3 periods the predictions get better.' };
    const gaps = s.slice(1).map((d, i) => daysBetween(s[i], d)).filter((g) => g > 15 && g < 60);
    const cyc = gaps.length ? Math.round(gaps.slice(-6).reduce((a, b) => a + b, 0) / Math.min(gaps.length, 6)) : 28;
    const next = addDays(s[s.length - 1], cyc); const ov = addDays(next, -14);
    return { cards: [['Next period', fmtDate(next), `${daysBetween(today(), isoDate(next))} days from today`], ['Ovulation', fmtDate(ov)], ['Fertile days', `${fmtDate(addDays(ov, -5))} – ${fmtDate(addDays(ov, 1))}`], ['Average cycle', `${cyc} days`]],
      warn: gaps.some((g) => g < 21 || g > 35) ? 'Some cycles are shorter than 21 or longer than 35 days. If this keeps happening, see a gynaecologist.' : '' };
  },
  note: 'Predictions are a guide only — do not use them as birth control.' });

const EPI = [[0, 'BCG (TB)'], [42, 'Pentavalent 1, PCV 1, OPV 1, fIPV 1'], [70, 'Pentavalent 2, PCV 2, OPV 2'], [98, 'Pentavalent 3, OPV 3, fIPV 2'], [126, 'PCV 3 (18 weeks)'], [274, 'MR 1 (measles-rubella), TCV (typhoid)'], [456, 'MR 2']];
tool({ id: 'vaccine', name: 'Baby Vaccine Schedule', icon: '💉', group: 'Health', desc: 'EPI Bangladesh vaccine dates for your child',
  render(el) {
    head(el, this, 'Enter the birth date. Tick each vaccine when it is given. All are free at EPI centres and government hospitals.');
    const s = store.get('vaccine', { dob: today(), done: {} });
    const p = add(el, `<div class="panel row"><div class="field"><label>Child’s name</label><input type="text" id="n" value="${esc(s.name || '')}"></div><div class="field"><label>Birth date</label><input type="date" id="d" value="${s.dob}"></div></div><div id="t"></div><p class="muted note">ℹ️ EPI schedule as of 2025. Girls aged 10–14 also get one HPV dose against cervical cancer. A late vaccine is better than none — just go.</p>`);
    const draw = () => {
      const rows = EPI.map(([d, n], i) => { const date = addDays(s.dob, d); const left = daysBetween(today(), isoDate(date)); const done = s.done[i];
        return `<tr><td><input type="checkbox" data-i="${i}"${done ? ' checked' : ''}></td><td>${esc(n)}</td><td>${fmtDate(date)}</td><td>${done ? '<span class="pill ok">Given</span>' : left < 0 ? '<span class="pill bad">Late — go now</span>' : left <= 7 ? '<span class="pill warn">This week</span>' : `<span class="pill">In ${left} days</span>`}</td></tr>`; });
      $(el, '#t').innerHTML = `<table><thead><tr><th></th><th>Vaccine</th><th>Date</th><th>Status</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
      $$(el, '[data-i]').forEach((c) => c.onchange = () => { s.done[c.dataset.i] = c.checked; store.set('vaccine', s); draw(); });
    };
    $(p, '#d').onchange = (e) => { s.dob = e.target.value; store.set('vaccine', s); draw(); };
    $(p, '#n').oninput = (e) => { s.name = e.target.value; store.set('vaccine', s); };
    draw();
  } });

// WHO growth standards (median and −2 / +2 SD) at 0,3,6,9,12,18,24,36,48,60 months.
const GM = [0, 3, 6, 9, 12, 18, 24, 36, 48, 60];
const WHO = {
  m: { w: [[3.3, 6.4, 7.9, 8.9, 9.6, 10.9, 12.2, 14.3, 16.3, 18.3], [2.5, 5, 6.4, 7.1, 7.7, 8.8, 9.7, 11.3, 12.7, 14.1], [4.4, 8, 9.8, 11, 12, 13.7, 15.3, 18.3, 21.2, 24.2]], h: [[49.9, 61.4, 67.6, 72, 75.7, 82.3, 87.8, 96.1, 103.3, 110], [46.1, 57.3, 63.3, 67.5, 71, 76.9, 81.7, 88.7, 94.9, 100.7]] },
  f: { w: [[3.2, 5.8, 7.3, 8.2, 8.9, 10.2, 11.5, 13.9, 16.1, 18.2], [2.4, 4.5, 5.7, 6.6, 7, 8.1, 9, 10.8, 12.3, 13.7], [4.2, 7.5, 9.3, 10.5, 11.5, 13.2, 14.8, 18.1, 21.5, 24.9]], h: [[49.1, 59.8, 65.7, 70.1, 74, 80.7, 86.4, 95.1, 102.7, 109.4], [45.4, 55.6, 61.2, 65.3, 68.9, 74.9, 80, 87.4, 94.1, 99.9]] },
};
const interp = (arr, m) => { let i = GM.findIndex((x) => x >= m); if (i <= 0) return arr[0]; const a = GM[i - 1], b = GM[i]; return arr[i - 1] + (arr[i] - arr[i - 1]) * (m - a) / (b - a); };
calcTool({ id: 'growth', name: 'Child Growth Check', icon: '👶', group: 'Health', desc: 'Is your child’s weight and height right for the age? (0–5 years)',
  fields: [{ k: 'sex', l: 'Child', type: 'select', v: 'm', opts: [['m', 'Boy'], ['f', 'Girl']] }, { k: 'mo', l: 'Age in months', v: 12 }, { k: 'kg', l: 'Weight (kg)', v: 9 }, { k: 'cm', l: 'Height (cm)', v: 74 }],
  calc(v) {
    const m = Math.min(60, Math.max(0, v.mo)); const T = WHO[v.sex];
    const [wm, wl, wh] = T.w.map((a) => interp(a, m)); const [hm, hl] = T.h.map((a) => interp(a, m));
    const ws = v.kg < wl ? ['Underweight', 'bad'] : v.kg > wh ? ['Overweight', 'warn'] : ['Normal', 'ok'];
    const hs = v.cm < hl ? ['Short for age (stunted)', 'bad'] : ['Normal', 'ok'];
    return { cards: [['Weight', ws[0], `Normal: ${num(wl, 1)}–${num(wh, 1)} kg · average ${num(wm, 1)}`], ['Height', hs[0], `At least ${num(hl, 1)} cm · average ${num(hm, 1)}`]],
      warn: ws[1] === 'bad' || hs[1] === 'bad' ? 'Below the healthy range. Please see a doctor or the community clinic. Give eggs, fish, dal and green vegetables every day.' : '',
      tip: 'Breast milk only for the first 6 months, then breast milk plus home food until 2 years.' };
  },
  note: 'Based on the WHO child growth standards. Measure on a flat floor without shoes.' });

const bpClass = (s, d) => (s > 180 || d > 120 ? ['Crisis — go to hospital', 'bad'] : s >= 140 || d >= 90 ? ['High (stage 2)', 'bad'] : s >= 130 || d >= 80 ? ['High (stage 1)', 'warn'] : s >= 120 ? ['Elevated', 'warn'] : s < 90 || d < 60 ? ['Low', 'warn'] : ['Normal', 'ok']);
logTool({ id: 'bp', name: 'Blood Pressure Log', icon: '🩺', group: 'Health', desc: 'Save readings and see what they mean',
  fields: [{ k: 'sys', l: 'Upper (systolic)', v: '', clear: true }, { k: 'dia', l: 'Lower (diastolic)', v: '', clear: true }, { k: 'pulse', l: 'Pulse', v: '', clear: true }],
  check: (v) => (!v.sys || !v.dia ? 'Write both numbers' : ''), addLabel: 'Save reading',
  head: ['When', 'BP', 'Pulse', 'Meaning'], cols: (r) => [new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), `${r.sys}/${r.dia}`, r.pulse || '', bpClass(r.sys, r.dia)[0]],
  summary(rs) {
    if (!rs.length) return { tip: 'Sit quietly for 5 minutes, arm at heart level, then measure. Take 2 readings a minute apart.' };
    const l = rs[0]; const last7 = rs.filter((r) => Date.now() - r.at < 7 * 864e5); const a = (k) => last7.reduce((s, r) => s + r[k], 0) / last7.length;
    const c = bpClass(l.sys, l.dia);
    return { cards: [['Last reading', `${l.sys}/${l.dia}`, c[0]], ['7-day average', `${num(a('sys'), 0)}/${num(a('dia'), 0)}`, `${last7.length} readings`]], warn: c[1] === 'bad' ? 'High readings again and again need a doctor. Cut salt, walk daily, and never stop medicine on your own.' : '' };
  } });

const sugarClass = (v, when) => {
  if (v < 3.9) return 'Low — eat something sweet now';
  const [a, b] = when === 'f' ? [5.6, 7] : [7.8, 11.1];
  return v < a ? 'Normal' : v < b ? 'Prediabetes range' : 'Diabetes range';
};
logTool({ id: 'sugar', name: 'Blood Sugar Log', icon: '🩸', group: 'Health', desc: 'Save sugar readings (mmol/L) and see what they mean',
  fields: [{ k: 'val', l: 'Reading (mmol/L)', v: '', clear: true }, { k: 'when', l: 'When', type: 'select', v: 'f', opts: [['f', 'Fasting (morning, empty stomach)'], ['p', '2 hours after a meal'], ['r', 'Random']] }],
  check: (v) => (!v.val ? 'Write the reading' : ''), addLabel: 'Save reading',
  head: ['When', 'Reading', 'Type', 'Meaning'], cols: (r) => [new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), `${r.val} (${num(r.val * 18, 0)} mg/dL)`, { f: 'Fasting', p: 'After meal', r: 'Random' }[r.when], sugarClass(r.val, r.when)],
  summary(rs) {
    if (!rs.length) return { tip: 'Normal fasting: below 5.6. Two hours after a meal: below 7.8. mg/dL = mmol/L × 18.' };
    const f = rs.filter((r) => r.when === 'f').slice(0, 7);
    return { cards: [['Last reading', `${rs[0].val} mmol/L`, sugarClass(rs[0].val, rs[0].when)], ['Fasting average (last 7)', f.length ? `${num(f.reduce((s, r) => s + r.val, 0) / f.length, 1)}` : '—']], warn: rs[0].val < 3.9 ? 'Low sugar: take 3 spoons of sugar or glucose in water, check again in 15 minutes.' : '' };
  } });

logTool({ id: 'medicine', name: 'Medicine Reminder', icon: '💊', group: 'Health', desc: 'Today’s medicines with a reminder at each time',
  intro: 'Keep this open (or the Jhuli app running) to get a pop-up at each time.',
  fields: [{ k: 'name', l: 'Medicine', type: 'text', ph: 'e.g. Napa 500', clear: true }, { k: 'dose', l: 'Dose', type: 'text', ph: '1 tablet after food', clear: true }, { k: 'times', l: 'Times (24 h, comma)', type: 'text', v: '08:00, 20:00' }, { k: 'until', l: 'Until', type: 'date', v: () => isoDate(addDays(new Date(), 7)) }],
  check: (v) => (!v.name ? 'Write the medicine name' : ''), addLabel: 'Add medicine',
  head: ['Medicine', 'Dose', 'Times', 'Until'], cols: (r) => [r.name, r.dose, r.times, fmtDate(r.until)],
  summary(rs) {
    const now = new Date(); const hm = now.toTimeString().slice(0, 5);
    const live = rs.filter((r) => r.until >= today());
    const doses = live.flatMap((r) => r.times.split(/[,\s]+/).filter(Boolean).map((t) => ({ t: t.padStart(5, '0'), r }))).sort((a, b) => (a.t > b.t ? 1 : -1));
    const fired = store.get('medicine.fired', {});
    for (const d of doses) { const key = today() + d.t + d.r.id; if (d.t === hm && !fired[key]) { fired[key] = 1; store.set('medicine.fired', fired, true); notify(`💊 Time for ${d.r.name}`, d.r.dose || ''); } }
    const next = doses.find((d) => d.t > hm);
    return { cards: [['Next', next ? `${next.t} · ${next.r.name}` : 'Done for today ✅', next ? next.r.dose : ''], ['Doses today', String(doses.length)]], table: { title: 'Today', head: ['Time', 'Medicine', 'Dose'], rows: doses.map((d) => [d.t + (d.t <= hm ? ' ✓' : ''), d.r.name, d.r.dose]) } };
  },
  timer: 30000, note: 'Finish antibiotics fully, even when you feel better.' });

calcTool({ id: 'sleep', name: 'Sleep Cycle', icon: '😴', group: 'Health', desc: 'Best time to sleep or wake up feeling fresh',
  fields: [{ k: 'mode', l: 'I want to', type: 'select', v: 'wake', opts: [['wake', 'Wake up at…'], ['now', 'Sleep now — when to wake?']] }, { k: 't', l: 'Wake-up time', type: 'time', v: '06:30' }],
  calc(v) {
    const f = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (v.mode === 'now') { const n = new Date(Date.now() + 15 * 6e4); return { cards: [6, 5, 4].map((c) => [`${c} cycles (${c * 1.5} h)`, f(new Date(+n + c * 90 * 6e4))]), tip: 'It takes about 15 minutes to fall asleep. Waking at the end of a 90-minute cycle feels easier.' }; }
    const [h, m] = v.t.split(':').map(Number); const w = new Date(); w.setHours(h, m, 0, 0);
    return { cards: [6, 5, 4].map((c) => [`Sleep at (${c * 1.5} h)`, f(new Date(+w - c * 90 * 6e4 - 15 * 6e4))]), tip: 'Adults need 7–9 hours. Put the phone away 30 minutes before bed.' };
  } });

calcTool({ id: 'donate', name: 'Blood Donation', icon: '🩸', group: 'Health', desc: 'Can you give blood, and when next?',
  fields: [{ k: 'last', l: 'Last donation date (empty if never)', type: 'date', v: '' }, { k: 'age', l: 'Age', v: 25 }, { k: 'kg', l: 'Weight (kg)', v: 60 }, { k: 'sex', l: 'Sex', type: 'select', v: 'm', opts: [['m', 'Male'], ['f', 'Female']] }],
  calc(v) {
    const gap = v.sex === 'f' ? 120 : 90; const next = v.last ? addDays(v.last, gap) : new Date(); const left = daysBetween(today(), isoDate(next));
    const ok = v.age >= 18 && v.age <= 60 && v.kg >= 50;
    return { cards: [[ok ? (left > 0 ? 'You can give again on' : 'You can give blood ✅') : 'Not now', ok ? (left > 0 ? fmtDate(next) : 'Today') : (v.age < 18 || v.age > 60 ? 'Age must be 18–60' : 'Weight must be 50 kg+'), left > 0 && ok ? `${left} days left` : ''], ['Gap between donations', `${gap / 30} months`]],
      tip: 'Eat and drink well before. Do not give with fever, during periods or pregnancy, within 6 months of a tattoo, or while taking antibiotics. One bag can save up to 3 lives.' };
  } });

calcTool({ id: 'hrzones', name: 'Heart Rate Zones', icon: '❤️', group: 'Health', desc: 'Your heart rate for fat burning and fitness',
  fields: [{ k: 'age', l: 'Age', v: 30 }, { k: 'rest', l: 'Resting heart rate (on waking)', v: 70 }],
  calc(v) {
    const max = 208 - 0.7 * v.age; const z = (a, b) => `${Math.round(v.rest + (max - v.rest) * a)}–${Math.round(v.rest + (max - v.rest) * b)}`;
    return { cards: [['Maximum', `${Math.round(max)} bpm`]], table: { head: ['Zone', 'Beats per minute', 'Feels like'], rows: [['1 · Warm up', z(0.5, 0.6), 'Easy walk, can sing'], ['2 · Fat burn', z(0.6, 0.7), 'Brisk walk, can talk'], ['3 · Fitness', z(0.7, 0.8), 'Jog, short sentences'], ['4 · Hard', z(0.8, 0.9), 'Fast run, few words'], ['5 · Max', z(0.9, 1), 'Sprint, seconds only']] }, tip: 'Most exercise should be in zone 2. Chest pain or dizziness: stop at once.' };
  } });

const AID = [
  ['🫀 CPR (not breathing)', ['Call 999. Shout for help and for someone to bring a phone.', 'Lay the person on their back on a hard floor.', 'Put the heel of your hand on the middle of the chest, other hand on top, arms straight.', 'Push hard and fast: 5–6 cm deep, 100–120 times a minute (to the beat of a fast song).', 'Do not stop until help arrives or the person breathes. For a child use one hand; for a baby, two fingers.']],
  ['😮‍💨 Choking', ['If they can cough, let them cough.', 'If they cannot breathe or speak: 5 firm back blows between the shoulder blades.', 'Then 5 abdominal thrusts: stand behind, fist above the navel, pull in and up.', 'Repeat until it comes out. Baby: 5 back blows face-down on your arm, then 5 chest pushes with 2 fingers.']],
  ['🔥 Burns', ['Cool under clean running water for 20 minutes.', 'Remove rings and tight things. Do not pull off stuck cloth.', 'Cover loosely with clean cloth or cling film.', 'Do NOT put toothpaste, oil, ice or egg on it.', 'Hospital if bigger than the palm, on the face, hands, private parts, or from electricity or chemicals.']],
  ['🩸 Heavy bleeding', ['Press hard on the wound with a clean cloth for 10 minutes without lifting.', 'Raise the injured part above the heart.', 'If blood soaks through, add more cloth on top — do not remove the first.', 'Go to hospital for deep cuts, spurting blood, or cuts that gape open.']],
  ['🐍 Snake bite', ['Keep the person calm and still — movement spreads venom.', 'Keep the bitten limb still and lower than the heart; remove rings and watches.', 'Do NOT cut, suck, burn, or tie a tight band. Do NOT go to an ojha.', 'Go straight to the nearest Upazila Health Complex or hospital — anti-venom is free.', 'Note the time of the bite and the snake’s look if safe.']],
  ['🌊 Drowning', ['Get the person out safely — throw a rope or bamboo; do not jump in if you cannot swim well.', 'If not breathing: give 5 rescue breaths, then CPR.', 'Do not hang them upside down or press the stomach to get water out.', 'Take to hospital even if they seem fine.']],
  ['⚡ Electric shock', ['Do not touch them until the power is off (switch or main off).', 'Use a dry wooden stick to move the wire if you cannot switch off.', 'Check breathing; start CPR if needed.', 'Always go to hospital — inner burns may not show.']],
  ['🥵 Heat stroke', ['Move to shade, remove extra clothes.', 'Pour water on the body and fan hard; ice packs on neck, armpits, groin.', 'Give water or ORS if awake.', 'Confusion, fits or no sweating = emergency, call 999.']],
  ['😵 Fainting', ['Lay them flat and lift the legs up.', 'Loosen tight clothes, give fresh air.', 'When awake, give water. See a doctor if it happens again or with chest pain.']],
  ['🦴 Broken bone', ['Do not try to straighten it.', 'Keep it still with a splint (stick, rolled newspaper) tied above and below.', 'Ice wrapped in cloth for swelling. Go to hospital.']],
  ['☠️ Poison (pesticide, kerosene, medicines)', ['Do NOT make them vomit.', 'Take the bottle or packet with you to the hospital.', 'If on skin: remove clothes and wash with lots of water.', 'Go to hospital at once.']],
  ['💧 Diarrhoea', ['Give ORS after every loose stool: half to one glass.', 'Mix 1 packet in exactly half a litre of clean water. Make fresh every 12 hours.', 'Keep feeding and breastfeeding. Give zinc to children for 10 days.', 'Hospital for blood in stool, no urine for 6 hours, sunken eyes, or very weak.']],
  ['🐕 Dog or cat bite', ['Wash the wound with soap and running water for 15 minutes.', 'Do not cover it tightly or stitch it.', 'Get the rabies vaccine the same day — free at government hospitals (IDH, district hospitals).']],
];
tool({ id: 'firstaid', name: 'First Aid Guide', icon: '⛑️', group: 'Health', desc: 'What to do in an emergency — works without internet',
  render(el) {
    head(el, this, 'Call 999 for an ambulance (free). Stay calm and keep yourself safe first.');
    add(el, `<div>${AID.map(([t, s]) => `<details class="panel"><summary><b>${esc(t)}</b></summary><ol class="steps" style="margin-top:10px">${s.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>`).join('')}</div><p class="muted note">ℹ️ This guide does not replace a doctor. Learn CPR in a real class (Red Crescent runs them).</p>`);
  } });
