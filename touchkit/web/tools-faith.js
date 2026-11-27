// Faith & calendar: prayer times, sehri/iftar, Bangla and Hijri dates, time zones, reminders.
/* global calcTool, logTool, rowsEditor, tool, head, add, $, $$, esc, store, result, num, today, fmtDate, daysBetween, addDays, isoDate, toast, notify */

// MARK: places
const PLACES = [['Dhaka', 23.8103, 90.4125], ['Chattogram', 22.3569, 91.7832], ['Sylhet', 24.8949, 91.8687], ['Rajshahi', 24.3745, 88.6042], ['Khulna', 22.8456, 89.5403], ['Barishal', 22.701, 90.3535], ['Rangpur', 25.7439, 89.2752], ['Mymensingh', 24.7471, 90.4203],
  ['Bandarban', 22.1953, 92.2184], ['Bhola', 22.6859, 90.6482], ['Bogura', 24.8465, 89.3773], ['Brahmanbaria', 23.9571, 91.1119], ['Chandpur', 23.2333, 90.6713], ['Chapainawabganj', 24.5965, 88.2776], ['Cox’s Bazar', 21.4272, 92.0058], ['Cumilla', 23.4607, 91.1809], ['Dinajpur', 25.6217, 88.6354], ['Faridpur', 23.607, 89.8429], ['Feni', 23.0159, 91.3976], ['Gaibandha', 25.3288, 89.5285], ['Gazipur', 23.9999, 90.4203], ['Habiganj', 24.3749, 91.4155], ['Jamalpur', 24.9375, 89.9378], ['Jashore', 23.1664, 89.2081], ['Khagrachhari', 23.1193, 91.9847], ['Kishoreganj', 24.426, 90.7829], ['Kurigram', 25.8072, 89.6295], ['Kushtia', 23.9013, 89.1205], ['Lalmonirhat', 25.9923, 89.2847], ['Moulvibazar', 24.4829, 91.7774], ['Naogaon', 24.7936, 88.9318], ['Narayanganj', 23.6238, 90.5], ['Natore', 24.4206, 89.0003], ['Nilphamari', 25.931, 88.856], ['Noakhali', 22.8696, 91.0995], ['Pabna', 24.0064, 89.2372], ['Panchagarh', 26.3411, 88.5542], ['Patuakhali', 22.3596, 90.3299], ['Rangamati', 22.6574, 92.1733], ['Satkhira', 22.7185, 89.0705], ['Sirajganj', 24.4534, 89.7007], ['Sunamganj', 25.0658, 91.395], ['Tangail', 24.2513, 89.9167], ['Thakurgaon', 26.0337, 88.4617]];
// A place picker shared by the prayer and sehri tools. onChange({ name, lat, lng, tz }).
function placePicker(root, onChange) {
  const s = store.get('place', { name: 'Dhaka', lat: 23.8103, lng: 90.4125, tz: 6 });
  const p = add(root, `<div class="panel row"><div class="field"><label>Place</label><select id="pl">${PLACES.map(([n]) => `<option${n === s.name ? ' selected' : ''}>${esc(n)}</option>`).join('')}${PLACES.some(([n]) => n === s.name) ? '' : `<option selected>${esc(s.name)}</option>`}</select></div><button id="gps">📍 Use my location</button></div>`);
  $(p, '#pl').onchange = (e) => { const x = PLACES.find(([n]) => n === e.target.value); if (!x) return; Object.assign(s, { name: x[0], lat: x[1], lng: x[2], tz: 6 }); store.set('place', s); onChange(s); };
  $(p, '#gps').onclick = () => {
    if (!navigator.geolocation) return toast('Location is not available here');
    navigator.geolocation.getCurrentPosition((g) => { Object.assign(s, { name: `My location (${g.coords.latitude.toFixed(2)}, ${g.coords.longitude.toFixed(2)})`, lat: g.coords.latitude, lng: g.coords.longitude, tz: -new Date().getTimezoneOffset() / 60 }); store.set('place', s); const o = document.createElement('option'); o.textContent = s.name; o.selected = true; $(p, '#pl').appendChild(o); onChange(s); }, () => toast('Could not get your location'));
  };
  onChange(s);
}

// MARK: prayer time maths (praytimes.org method)
const D2R = Math.PI / 180;
const dsin = (d) => Math.sin(d * D2R), dcos = (d) => Math.cos(d * D2R), dtan = (d) => Math.tan(d * D2R);
const darcsin = (x) => Math.asin(x) / D2R, darccos = (x) => Math.acos(x) / D2R, darctan2 = (y, x) => Math.atan2(y, x) / D2R, darccot = (x) => Math.atan(1 / x) / D2R;
const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };
function julian(y, m, d) { if (m <= 2) { y--; m += 12; } const A = Math.floor(y / 100); const B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
function sunPos(jd) {
  const D = jd - 2451545; const g = fix(357.529 + 0.98560028 * D, 360); const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g), 360); const e = 23.439 - 0.00000036 * D;
  const RA = fix(darctan2(dcos(e) * dsin(L), dcos(L)) / 15, 24);
  return { decl: darcsin(dsin(e) * dsin(L)), eqt: q / 15 - RA };
}
function prayerTimes(date, lat, lng, tz, hanafi = true) {
  const d = new Date(date); const jd = julian(d.getFullYear(), d.getMonth() + 1, d.getDate()) - lng / (15 * 24);
  const mid = (t) => fix(12 - sunPos(jd + t).eqt, 24);
  const angleTime = (ang, t, ccw) => { const { decl } = sunPos(jd + t); const T = darccos((-dsin(ang) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat))) / 15; return mid(t) + (ccw ? -T : T); };
  const asr = (f, t) => { const { decl } = sunPos(jd + t); return angleTime(-darccot(f + dtan(Math.abs(lat - decl))), t); };
  const raw = { fajr: angleTime(18, 5 / 24, true), sunrise: angleTime(0.833, 6 / 24, true), dhuhr: mid(12 / 24), asr: asr(hanafi ? 2 : 1, 13 / 24), maghrib: angleTime(0.833, 18 / 24), isha: angleTime(18, 18 / 24) };
  const out = {};
  for (const [k, h] of Object.entries(raw)) { const x = h + tz - lng / 15 + ({ dhuhr: 1, maghrib: 1 }[k] || 0) / 60; const t = new Date(d); t.setHours(0, 0, 0, 0); out[k] = new Date(+t + x * 36e5); }
  return out;
}
const hm = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const qibla = (lat, lng) => fix(darctan2(dsin(39.8262 - lng), dcos(lat) * dtan(21.4225) - dsin(lat) * dcos(39.8262 - lng)), 360);

tool({ id: 'prayer', name: 'Prayer Times & Qibla', icon: '🕌', group: 'Faith & Calendar', desc: 'Today’s salah times for your district and the Qibla direction',
  render(el) {
    head(el, this, 'Calculated for your place (Karachi method, Hanafi Asr — the way used in Bangladesh). Mosque jamaat times are a little later.');
    const out = add(el, '<div></div>'); let place; let heading = null;
    const draw = () => {
      if (!place) return;
      const t = prayerTimes(new Date(), place.lat, place.lng, place.tz); const names = [['fajr', 'Fajr'], ['sunrise', 'Sunrise (no salah)'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha']];
      const now = new Date(); const next = names.filter(([k]) => k !== 'sunrise').find(([k]) => t[k] > now) || ['fajr', 'Fajr (tomorrow)'];
      const nt = t[next[0]] > now ? t[next[0]] : prayerTimes(addDays(new Date(), 1), place.lat, place.lng, place.tz).fajr; const left = Math.max(0, nt - now);
      const q = qibla(place.lat, place.lng);
      out.innerHTML = result({ cards: [[`Next: ${next[1]}`, hm(nt), `in ${Math.floor(left / 36e5)} h ${Math.floor(left / 6e4) % 60} min`], ['Qibla', `${num(q, 0)}° from North`, 'Roughly west in Bangladesh']], table: { title: `${place.name} · ${fmtDate(new Date())}`, head: ['Prayer', 'Time'], rows: names.map(([k, n]) => [n, hm(t[k])]) } }) +
        `<div class="panel" style="text-align:center"><b>Qibla compass</b><div class="compass"><span class="n">N</span><div class="needle" style="transform:rotate(${heading == null ? q : q - heading}deg)"></div></div><p class="muted">${heading == null ? 'The green line points to the Qibla when the top of the circle faces North.' : 'Turn until the green line points straight up.'}</p><button id="cmp">🧭 Use phone compass</button></div>`;
      const b = $(out, '#cmp'); if (b) b.onclick = startCompass;
    };
    const onOri = (e) => { const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null); if (h != null) { heading = h; const n = $(out, '.needle'); if (n) n.style.transform = `rotate(${qibla(place.lat, place.lng) - h}deg)`; } };
    const startCompass = async () => {
      try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch {}
      window.addEventListener('deviceorientationabsolute', onOri); window.addEventListener('deviceorientation', onOri); toast('Hold the phone flat');
    };
    placePicker(el, (p) => { place = p; draw(); });
    el.appendChild(out);
    const i = setInterval(draw, 30000);
    return () => { clearInterval(i); window.removeEventListener('deviceorientationabsolute', onOri); window.removeEventListener('deviceorientation', onOri); };
  } });

tool({ id: 'sehri', name: 'Sehri & Iftar Times', icon: '🌙', group: 'Faith & Calendar', desc: 'Sehri end and iftar times for 30 days',
  render(el) {
    head(el, this, 'Stop eating a few minutes before the sehri time to be safe.');
    const st = store.get('sehri', { from: today() });
    const p = add(el, `<div class="panel"><div class="field"><label>Start from</label><input type="date" id="d" value="${st.from}"></div></div>`);
    const out = add(el, '<div></div>'); let place;
    const draw = () => {
      if (!place) return;
      const rows = []; for (let i = 0; i < 30; i++) { const d = addDays(st.from, i); const t = prayerTimes(d, place.lat, place.lng, place.tz); rows.push([fmtDate(d), d.toLocaleDateString('en-GB', { weekday: 'short' }), hm(new Date(+t.fajr - 3 * 6e4)), hm(t.maghrib)]); }
      const t0 = prayerTimes(new Date(), place.lat, place.lng, place.tz);
      out.innerHTML = result({ cards: [['Sehri ends today', hm(new Date(+t0.fajr - 3 * 6e4))], ['Iftar today', hm(t0.maghrib)]], table: { title: place.name, head: ['Date', 'Day', 'Sehri ends', 'Iftar'], rows } });
    };
    $(p, '#d').onchange = (e) => { st.from = e.target.value; store.set('sehri', st); draw(); };
    placePicker(el, (pl) => { place = pl; draw(); });
    el.appendChild(out);
  } });

// MARK: Bangla calendar
const BMONTHS = ['বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র'];
const BSEASON = ['গ্রীষ্ম', 'বর্ষা', 'শরৎ', 'হেমন্ত', 'শীত', 'বসন্ত'];
const BDAY = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const bnNum = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
function banglaDate(date) {
  const d = new Date(date); d.setHours(12, 0, 0, 0); const y = d.getFullYear();
  const s = d >= new Date(y, 3, 14) ? new Date(y, 3, 14, 12) : new Date(y - 1, 3, 14, 12);
  const by = s.getFullYear() - 593; let days = Math.round((d - s) / 864e5);
  const gy = s.getFullYear() + 1; const leap = gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0);
  const lens = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, leap ? 30 : 29, 30];
  let m = 0; while (m < 11 && days >= lens[m]) { days -= lens[m]; m++; }
  return { y: by, m, d: days + 1, text: `${bnNum(days + 1)} ${BMONTHS[m]} ${bnNum(by)} বঙ্গাব্দ`, season: BSEASON[Math.floor(m / 2)], day: BDAY[d.getDay()] };
}
calcTool({ id: 'bangla', name: 'Bangla Calendar', icon: '🗓', group: 'Faith & Calendar', desc: 'English date to বঙ্গাব্দ date, season and day',
  fields: [{ k: 'd', l: 'English date', type: 'date', v: today }],
  calc(v) {
    const b = banglaDate(v.d || today());
    const days = [['Pohela Boishakh (Bangla New Year)', '04-14'], ['International Mother Language Day', '02-21'], ['Independence Day', '03-26'], ['Victory Day', '12-16'], ['Pohela Falgun', '02-14'], ['National Mourning Day', '08-15']];
    const y = new Date(v.d || today()).getFullYear();
    return { cards: [['বাংলা তারিখ', b.text], ['ঋতু', b.season], ['বার', b.day]], table: { title: 'National days this year', head: ['Day', 'English', 'বাংলা'], rows: days.map(([n, md]) => [n, fmtDate(`${y}-${md}`), banglaDate(`${y}-${md}`).text]) } };
  },
  note: 'Uses the Bangladesh calendar revised in 2019 (first six months have 31 days; Falgun has 30 days in a leap year).' });

// MARK: Hijri
const hijri = (date, adj) => { const d = addDays(date, adj); const f = (o) => new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', o).formatToParts(d); const p = Object.fromEntries(f({ day: 'numeric', month: 'numeric', year: 'numeric' }).map((x) => [x.type, x.value])); return { d: +p.day, m: +p.month, y: parseInt(p.year), text: new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(d) }; };
const HEVENTS = [[1, 1, 'Islamic New Year'], [1, 10, 'Ashura'], [3, 12, 'Eid-e-Miladunnabi'], [8, 15, 'Shab-e-Barat (night before)'], [9, 1, 'Ramadan starts'], [9, 27, 'Shab-e-Qadr (night before, likely)'], [10, 1, 'Eid-ul-Fitr'], [12, 9, 'Day of Arafah'], [12, 10, 'Eid-ul-Adha']];
calcTool({ id: 'hijri', name: 'Hijri Date', icon: '☪️', group: 'Faith & Calendar', desc: 'Islamic date today and upcoming Ramadan, Eid and other days',
  fields: [{ k: 'd', l: 'English date', type: 'date', v: today }, { k: 'adj', l: 'Bangladesh moon adjustment (days)', type: 'select', v: -1, opts: [[-2, '−2'], [-1, '−1 (usual for Bangladesh)'], [0, '0 (Saudi Arabia)'], [1, '+1']] }],
  calc(v) {
    const h = hijri(v.d || today(), v.adj); const rows = [];
    for (let i = 0; i < 400 && rows.length < HEVENTS.length; i++) { const d = addDays(today(), i); const x = hijri(d, v.adj); const e = HEVENTS.find(([m, dd]) => m === x.m && dd === x.d); if (e && !rows.some((r) => r[0] === e[2])) rows.push([e[2], fmtDate(d), i === 0 ? 'Today' : `${i} days`]); }
    return { cards: [['Hijri date', h.text]], table: { title: 'Coming up (expected)', head: ['Day', 'Date', 'In'], rows } };
  },
  note: 'Real dates depend on moon sighting by the National Moon Sighting Committee and can move by a day.' });

// MARK: Time zones
const ZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Istanbul', 'America/New_York', 'America/Toronto', 'America/Chicago', 'America/Los_Angeles', 'UTC'];
tool({ id: 'meeting', name: 'Time Zone Meeting Planner', icon: '🌐', group: 'Faith & Calendar', desc: 'Find a time that suits people in different countries',
  render(el) {
    head(el, this, 'Add the cities of everyone in the meeting. Green = work hours (9–6), yellow = morning/evening, red = sleep.');
    const s = store.get('meeting', { date: today() });
    const p = add(el, `<div class="panel"><div class="field"><label>Date</label><input type="date" id="d" value="${s.date}"></div><div id="z" style="margin-top:12px"></div></div>`);
    const out = add(el, '<div style="overflow-x:auto"></div>');
    const hourIn = (z, d) => +new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: 'numeric', hourCycle: 'h23' }).format(d);
    const draw = (rows) => {
      const zs = rows.map((r) => r.zone); const base = new Date(`${s.date}T00:00:00`);
      const col = (h) => (h >= 9 && h < 18 ? 'rgba(31,164,99,.35)' : h >= 7 && h < 22 ? 'rgba(245,165,36,.3)' : 'rgba(229,72,77,.22)');
      let html = '<table style="font-size:12px;min-width:700px"><tbody>';
      for (const z of zs) { html += `<tr><th style="white-space:nowrap">${esc(z.split('/').pop().replace('_', ' '))}</th>`; for (let i = 0; i < 24; i++) { const h = hourIn(z, new Date(+base + i * 36e5)); html += `<td style="background:${col(h)};text-align:center;padding:4px 2px">${h}</td>`; } html += '</tr>'; }
      html += '</tbody></table>';
      const good = []; for (let i = 0; i < 24; i++) { const d = new Date(+base + i * 36e5); if (zs.every((z) => { const h = hourIn(z, d); return h >= 9 && h < 18; })) good.push(d); }
      out.innerHTML = result({ cards: [['Best times (your clock)', good.length ? good.map((d) => d.toLocaleTimeString('en-US', { hour: 'numeric' })).join(', ') : 'No hour fits everyone’s work time', 'Columns are hours of your day']] }) + html;
    };
    const ed = rowsEditor($(p, '#z'), 'meeting.zones', [{ k: 'zone', l: 'City / time zone', type: 'select', opts: ZONES }], [{ zone: 'Asia/Dhaka' }, { zone: 'Europe/London' }, { zone: 'America/New_York' }], draw);
    $(p, '#d').onchange = (e) => { s.date = e.target.value; store.set('meeting', s); draw(ed.get()); };
  } });

// MARK: Document expiry
const DOCS = ['NID', 'Passport', 'Driving licence', 'Trade licence', 'Vehicle tax token', 'Vehicle fitness', 'Insurance', 'Visa / work permit', 'TIN / tax return', 'Other'];
logTool({ id: 'docexpiry', name: 'Document Expiry Reminder', icon: '🪪', group: 'Faith & Calendar', desc: 'Passport, licence, tax token — never miss a renewal',
  fields: [{ k: 'doc', l: 'Document', type: 'select', v: 'Passport', opts: DOCS }, { k: 'who', l: 'Whose / number', type: 'text', ph: 'e.g. Mine', clear: true }, { k: 'exp', l: 'Expires on', type: 'date', v: '' }, { k: 'before', l: 'Remind me (days before)', v: 60 }],
  check: (v) => (!v.exp ? 'Pick the expiry date' : ''), addLabel: 'Add document', sort: (a, b) => (a.exp > b.exp ? 1 : -1),
  head: ['Document', 'Whose', 'Expires', 'Status'],
  cols: (r) => { const l = daysBetween(today(), r.exp); return [r.doc, r.who, fmtDate(r.exp), l < 0 ? `Expired ${-l} days ago` : l <= r.before ? `⚠️ Renew now — ${l} days left` : `${l} days left`]; },
  summary(rs) {
    const due = rs.filter((r) => daysBetween(today(), r.exp) <= r.before);
    const seen = store.get('docexpiry.seen', ''); if (due.length && seen !== today()) { store.set('docexpiry.seen', today(), true); notify('🪪 Documents need renewal', due.map((r) => r.doc).join(', ')); }
    return { cards: [['Need renewal soon', String(due.length), due.map((r) => r.doc).join(', ')], ['Documents saved', String(rs.length)]], tip: 'Passport renewal: apply online at epassport.gov.bd at least 6 months before — many countries need 6 months of validity.' };
  } });
