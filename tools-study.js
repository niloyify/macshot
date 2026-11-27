// Study & job tools.
/* global calcTool, logTool, rowsEditor, tool, head, add, $, $$, esc, store, result, num, taka, today, fmtDate, daysBetween, addDays, isoDate, copy, toast, tk, uid */

// MARK: GPA / CGPA
const sscGrade = (m) => (m >= 80 ? ['A+', 5] : m >= 70 ? ['A', 4] : m >= 60 ? ['A-', 3.5] : m >= 50 ? ['B', 3] : m >= 40 ? ['C', 2] : m >= 33 ? ['D', 1] : ['F', 0]);
const uniGrade = (m) => [[80, 'A+', 4], [75, 'A', 3.75], [70, 'A-', 3.5], [65, 'B+', 3.25], [60, 'B', 3], [55, 'B-', 2.75], [50, 'C+', 2.5], [45, 'C', 2.25], [40, 'D', 2]].find(([x]) => m >= x)?.slice(1) || ['F', 0];
tool({ id: 'gpa', name: 'GPA / CGPA', icon: '🎓', group: 'Study & Job', desc: 'SSC/HSC GPA from marks, university CGPA from credits',
  render(el) {
    head(el, this, 'Pick the type, then type your marks out of 100.');
    const s = store.get('gpa', { mode: 'ssc', prev: 0, prevCr: 0 });
    const top = add(el, `<div class="panel row"><div class="field"><label>Type</label><select id="m"><option value="ssc">SSC / HSC (out of 5)</option><option value="uni">University (out of 4, UGC scale)</option></select></div><div class="field uni"><label>CGPA so far</label><input type="number" id="pc" step="0.01" value="${s.prev}"></div><div class="field uni"><label>Credits so far</label><input type="number" id="pcr" value="${s.prevCr}"></div></div>`);
    const box = add(el, '<div class="panel"></div>'); const out = add(el, '<div></div>');
    $(top, '#m').value = s.mode;
    const draw = () => {
      box.innerHTML = ''; $$(top, '.uni').forEach((x) => (x.style.display = s.mode === 'uni' ? '' : 'none'));
      if (s.mode === 'ssc') {
        rowsEditor(box, 'gpa.ssc', [{ k: 'sub', l: 'Subject', type: 'text', w: 140 }, { k: 'marks', l: 'Marks', w: 80 }, { k: 'type', l: 'Type', type: 'select', opts: ['Main', '4th (optional)'] }],
          ['Bangla', 'English', 'Math', 'Physics', 'Chemistry', 'Biology', 'ICT', 'Religion'].map((x) => ({ sub: x, marks: 75, type: 'Main' })).concat([{ sub: 'Higher Math', marks: 70, type: '4th (optional)' }]),
          (rows) => {
            const main = rows.filter((r) => r.type === 'Main'); const opt = rows.find((r) => r.type !== 'Main');
            const fail = main.some((r) => sscGrade(r.marks)[1] === 0);
            const pts = main.reduce((a, r) => a + sscGrade(r.marks)[1], 0) + (opt ? Math.max(0, sscGrade(opt.marks)[1] - 2) : 0);
            const gpa = fail || !main.length ? 0 : Math.min(5, pts / main.length);
            out.innerHTML = result({ cards: [['GPA', fail ? 'Fail (F)' : num(gpa, 2), fail ? 'An F in any main subject means fail' : gpa === 5 ? 'Golden A+ needs A+ in every subject' : ''], ['Grades', rows.map((r) => sscGrade(r.marks)[0]).join(' ')]], tip: '4th subject: only points above 2 are added.' });
          });
      } else {
        rowsEditor(box, 'gpa.uni', [{ k: 'sub', l: 'Course', type: 'text', w: 140 }, { k: 'cr', l: 'Credits', w: 70 }, { k: 'marks', l: 'Marks %', w: 80 }],
          [{ sub: 'Course 1', cr: 3, marks: 78 }, { sub: 'Course 2', cr: 3, marks: 70 }, { sub: 'Lab', cr: 1.5, marks: 85 }],
          (rows) => {
            const cr = rows.reduce((a, r) => a + r.cr, 0); const p = rows.reduce((a, r) => a + r.cr * uniGrade(r.marks)[1], 0);
            const gpa = cr ? p / cr : 0; const all = cr + s.prevCr; const cg = all ? (p + s.prev * s.prevCr) / all : 0;
            out.innerHTML = result({ cards: [['This semester GPA', num(gpa, 2)], ['CGPA', num(cg, 2), `${num(all, 1)} credits in total`], ['Grades', rows.map((r) => uniGrade(r.marks)[0]).join(' ')]] });
          });
      }
    };
    $(top, '#m').onchange = (e) => { s.mode = e.target.value; store.set('gpa', s); draw(); };
    $(top, '#pc').oninput = (e) => { s.prev = +e.target.value; store.set('gpa', s); draw(); };
    $(top, '#pcr').oninput = (e) => { s.prevCr = +e.target.value; store.set('gpa', s); draw(); };
    draw();
  } });

// MARK: Job age check
const ageParts = (a, b) => { a = new Date(a); b = new Date(b); let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate(); if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); } if (m < 0) { y--; m += 12; } return [y, m, d]; };
calcTool({ id: 'jobage', name: 'Job Age Check', icon: '🗓', group: 'Study & Job', desc: 'Your exact age on a job circular date — eligible or not',
  fields: [{ k: 'dob', l: 'Your birth date (as in SSC certificate)', type: 'date', v: '2000-01-01' }, { k: 'on', l: 'Age counted on (circular date)', type: 'date', v: today }, { k: 'min', l: 'Minimum age', v: 18 }, { k: 'max', l: 'Maximum age', type: 'select', v: 32, opts: [[30, '30'], [32, '32 (BCS & most govt jobs)'], [35, '35'], [40, '40'], [45, '45']] }],
  calc(v) {
    const [y, m, d] = ageParts(v.dob, v.on);
    const lastDay = isoDate(addDays(new Date(new Date(v.dob).setFullYear(new Date(v.dob).getFullYear() + v.max)), -1));
    const ok = y >= v.min && y < v.max;
    return { cards: [['Your age', `${y} years ${m} months ${d} days`], [ok ? 'Eligible ✅' : 'Not eligible', ok ? `Until ${fmtDate(lastDay)}` : y < v.min ? `Too young by ${v.min - y} years` : 'Over the age limit'], ['Days left to apply by age', ok ? num(daysBetween(v.on, lastDay), 0) : '0']] };
  },
  note: 'Quota rules (freedom fighter children, persons with disability) can add years — read the circular.' });

// MARK: Exam countdown & study plan
tool({ id: 'exam', name: 'Exam Countdown & Plan', icon: '📚', group: 'Study & Job', desc: 'Days left and a daily study plan for every subject',
  render(el) {
    head(el, this, 'Write one subject per line. The plan puts each subject on its own days and keeps the last days for revision.');
    const s = store.get('exam', { date: isoDate(addDays(new Date(), 30)), subs: 'Bangla\nEnglish\nMath\nPhysics\nChemistry', hrs: 4 });
    const p = add(el, `<div class="panel grid3"><div class="field"><label>Exam starts</label><input type="date" id="d" value="${s.date}"></div><div class="field"><label>Study hours per day</label><input type="number" id="h" value="${s.hrs}"></div><div class="field" style="grid-column:1/-1"><label>Subjects (one per line; add * after hard ones)</label><textarea id="s" style="min-height:7em;font-family:inherit;font-size:15px">${esc(s.subs)}</textarea></div></div>`);
    const out = add(el, '<div></div>');
    const run = () => {
      s.date = $(p, '#d').value; s.hrs = +$(p, '#h').value || 1; s.subs = $(p, '#s').value; store.set('exam', s);
      const left = daysBetween(today(), s.date);
      const subs = s.subs.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => ({ n: x.replace(/\*+$/, '').trim(), w: x.endsWith('*') ? 2 : 1 }));
      if (left <= 0 || !subs.length) { out.innerHTML = result({ cards: [['Days left', left > 0 ? String(left) : 'Exam day! 💪']] }); return; }
      const rev = Math.max(1, Math.round(left * 0.15)); const study = Math.max(1, left - rev);
      const order = []; subs.forEach((x) => { for (let i = 0; i < x.w; i++) order.push(x.n); });
      const rows = [];
      for (let i = 0; i < left && i < 120; i++) rows.push([fmtDate(addDays(today(), i)), i < study ? order[i % order.length] : 'Revision: all subjects + past papers']);
      out.innerHTML = result({ cards: [['Days left', String(left)], ['Study hours left', num(left * s.hrs, 0)], ['Revision days at the end', String(rev)]], table: { title: 'Plan', head: ['Day', 'Study'], rows } });
    };
    p.oninput = run; run();
  } });

// MARK: CV maker
const CVF = [{ k: 'name', l: 'Full name', type: 'text' }, { k: 'title', l: 'Job you want', type: 'text', ph: 'e.g. Junior Accountant' }, { k: 'phone', l: 'Phone', type: 'text' }, { k: 'email', l: 'Email', type: 'text' }, { k: 'addr', l: 'Address', type: 'text', wide: true },
  { k: 'obj', l: 'Career objective (2–3 lines)', type: 'textarea', rows: 3 }, { k: 'exp', l: 'Work experience (one per line: Role — Company — Years — what you did)', type: 'textarea' }, { k: 'edu', l: 'Education (one per line: Degree — Institution — Year — Result)', type: 'textarea' },
  { k: 'skills', l: 'Skills (comma separated)', type: 'textarea', rows: 2 }, { k: 'lang', l: 'Languages', type: 'text', v: 'Bangla (native), English (good)' }, { k: 'pers', l: 'Personal (father’s name, date of birth, NID, religion…)', type: 'textarea', rows: 3 }, { k: 'ref', l: 'References', type: 'textarea', rows: 3 }];
function cvHtml(v) {
  const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const sec = (t, body) => (body ? `<h3 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#3d7bff;border-bottom:1px solid #dde;padding-bottom:3px;margin:16px 0 6px">${t}</h3>${body}` : '');
  const list = (t) => (lines(t).length ? `<ul style="margin:0;padding-left:18px">${lines(t).map((x) => `<li style="margin:3px 0">${esc(x)}</li>`).join('')}</ul>` : '');
  return `<div style="font:13px/1.5 Arial,'Noto Sans Bengali',sans-serif;color:#111;max-width:720px;margin:auto;padding:10px">
    <h1 style="margin:0;font-size:26px">${esc(v.name || 'Your Name')}</h1><div style="color:#555;font-size:15px">${esc(v.title || '')}</div>
    <div style="margin-top:6px;color:#333">${[v.phone, v.email, v.addr].filter(Boolean).map(esc).join(' · ')}</div>
    ${sec('Career objective', v.obj ? `<p style="margin:0">${esc(v.obj)}</p>` : '')}${sec('Experience', list(v.exp))}${sec('Education', list(v.edu))}
    ${sec('Skills', v.skills ? `<p style="margin:0">${String(v.skills).split(',').map((x) => esc(x.trim())).filter(Boolean).join(' · ')}</p>` : '')}${sec('Languages', v.lang ? `<p style="margin:0">${esc(v.lang)}</p>` : '')}
    ${sec('Personal details', list(v.pers))}${sec('References', list(v.ref))}</div>`;
}
tool({ id: 'cv', name: 'CV Maker', icon: '📄', group: 'Study & Job', desc: 'A clean one-page CV, ready as PDF',
  render(el) {
    head(el, this, 'Fill in what you have — empty parts are left out. Your CV is saved on this device.');
    const s = store.get('cv', {});
    const f = add(el, `<div class="panel grid2">${CVF.map((x) => fieldHtml(x, s)).join('')}</div><div class="row"><button class="primary big" id="pdf">⬇ Save as PDF</button></div><h2>Preview</h2><div class="panel" id="pv" style="background:#fff;color:#111"></div>`);
    const run = () => { const v = readFields(f, CVF); store.set('cv', v); $(el, '#pv').innerHTML = cvHtml(v); };
    f.oninput = run; run();
    $(el, '#pdf').onclick = () => tk.call('pdf', { html: cvHtml(readFields(f, CVF)), name: 'CV.pdf' });
  } });

// MARK: Letters and applications
const LETTERS = {
  job: { n: 'Job application (cover letter)', f: [['to', 'To (designation)', 'The Managing Director'], ['org', 'Organisation and address', 'ABC Limited, Dhaka'], ['post', 'Post', 'Junior Officer'], ['src', 'Where you saw the circular', 'Bdjobs.com'], ['name', 'Your name', ''], ['why', 'Why you fit (one line)', 'I have a BBA in Accounting and two years of experience in bookkeeping.']],
    t: (v, d) => `${d}\n\n${v.to}\n${v.org}\n\nSubject: Application for the post of ${v.post}.\n\nDear Sir/Madam,\n\nWith due respect, I came to know from ${v.src} that your organisation will recruit a ${v.post}. I would like to apply for this post. ${v.why}\n\nI am hard-working, honest and eager to learn. I believe I can add value to your team. My CV is attached for your kind consideration.\n\nI hope you will consider my application and give me a chance to prove myself in an interview.\n\nYours faithfully,\n${v.name}` },
  leave: { n: 'Leave application (office)', f: [['to', 'To (designation)', 'The Manager, HR'], ['org', 'Office', 'ABC Limited'], ['days', 'Number of days', '3'], ['from', 'From date', fmtDate(new Date())], ['why', 'Reason', 'my mother is ill and needs my care'], ['name', 'Your name and designation', '']],
    t: (v, d) => `${d}\n\n${v.to}\n${v.org}\n\nSubject: Prayer for leave of ${v.days} days.\n\nSir/Madam,\n\nI respectfully state that ${v.why}. So I need leave for ${v.days} days from ${v.from}. I will hand over my urgent work to a colleague and stay reachable by phone.\n\nI pray that you grant me leave for the said period.\n\nYours obediently,\n${v.name}` },
  school: { n: 'Leave application (school / college)', f: [['to', 'To', 'The Headmaster'], ['org', 'School', 'Model High School, Dhaka'], ['days', 'Days', '2'], ['from', 'From date', fmtDate(new Date())], ['why', 'Reason', 'I was suffering from fever'], ['name', 'Your name, class, roll', '']],
    t: (v, d) => `${d}\n\n${v.to}\n${v.org}\n\nSubject: Application for leave of absence.\n\nSir,\n\nI beg to state that ${v.why}, so I could not attend school for ${v.days} days from ${v.from}.\n\nI therefore pray and hope that you would be kind enough to grant me leave for those days.\n\nYours obediently,\n${v.name}` },
  bank: { n: 'Bank request (statement / cheque book)', f: [['to', 'To', 'The Branch Manager'], ['org', 'Bank and branch', 'XYZ Bank, Motijheel Branch'], ['acc', 'Account number', ''], ['need', 'What you need', 'a bank statement from 1 January to 30 June'], ['name', 'Your name and phone', '']],
    t: (v, d) => `${d}\n\n${v.to}\n${v.org}\n\nSubject: Request for ${v.need.split(' ').slice(0, 3).join(' ')}.\n\nDear Sir/Madam,\n\nI am an account holder of your branch, account number ${v.acc}. I need ${v.need}. Please arrange it at your earliest convenience. Any charge may be taken from my account.\n\nThank you.\n\nSincerely,\n${v.name}` },
  complain: { n: 'Complaint letter', f: [['to', 'To', 'The Executive Engineer'], ['org', 'Office', 'DPDC, Dhanmondi'], ['what', 'Problem', 'frequent power cuts in our area for two weeks'], ['where', 'Your area', 'Road 5, Dhanmondi'], ['name', 'Your name and phone', '']],
    t: (v, d) => `${d}\n\n${v.to}\n${v.org}\n\nSubject: Complaint about ${v.what}.\n\nDear Sir,\n\nI am writing to draw your attention to ${v.what} at ${v.where}. This is causing great suffering to the people living here, including students and patients.\n\nI request you to take quick steps to solve this problem.\n\nYours faithfully,\n${v.name}` },
};
tool({ id: 'letters', name: 'Application Writer', icon: '✉️', group: 'Study & Job', desc: 'Job, leave, bank and complaint letters in proper English',
  render(el) {
    head(el, this, 'Pick a letter, fill the blanks, then copy or save it.');
    const s = store.get('letters', { kind: 'job', v: {} });
    const p = add(el, `<div class="panel"><div class="field"><label>Letter</label><select id="k">${Object.entries(LETTERS).map(([k, x]) => `<option value="${k}"${k === s.kind ? ' selected' : ''}>${esc(x.n)}</option>`).join('')}</select></div><div class="grid2" id="f" style="margin-top:12px"></div></div><div class="row"><button class="primary" id="c">Copy</button><button id="dl">Save as PDF</button></div><textarea id="out" style="min-height:24em;margin-top:12px;font-family:inherit;font-size:15px"></textarea>`);
    const draw = () => {
      const L = LETTERS[s.kind]; const vals = s.v[s.kind] || {};
      $(p, '#f').innerHTML = L.f.map(([k, l, d]) => `<div class="field"><label>${esc(l)}</label><input type="text" data-k="${k}" value="${esc(vals[k] ?? d)}"></div>`).join('');
      run();
    };
    const run = () => { const L = LETTERS[s.kind]; const v = {}; $$(p, '[data-k]').forEach((x) => (v[x.dataset.k] = x.value)); s.v[s.kind] = v; store.set('letters', s); $(el, '#out').value = L.t(v, `Date: ${fmtDate(new Date())}`); };
    $(p, '#k').onchange = (e) => { s.kind = e.target.value; draw(); };
    $(p, '#f').oninput = run;
    $(el, '#c').onclick = () => copy($(el, '#out').value);
    $(el, '#dl').onclick = () => tk.call('pdf', { html: `<pre style="font:14px/1.7 Georgia,serif;white-space:pre-wrap;max-width:680px;margin:40px auto">${esc($(el, '#out').value)}</pre>`, name: 'Letter.pdf' });
    draw();
  } });

// MARK: Typing test
const PASSAGES = {
  en: ['The quick brown fox jumps over the lazy dog. Practice every day and your fingers will learn where each key lives. Keep your eyes on the screen, not on the keyboard.', 'Bangladesh is a land of rivers. The Padma, the Meghna and the Jamuna carry water from the mountains to the Bay of Bengal, and millions of people depend on them for farming and fishing.', 'Good typing is about rhythm, not speed. Type slowly and correctly first; speed comes on its own when you stop making mistakes.'],
  bn: ['আমার সোনার বাংলা আমি তোমায় ভালোবাসি। প্রতিদিন একটু একটু করে অনুশীলন করলে টাইপিং দ্রুত হবে।', 'বাংলাদেশ নদীমাতৃক দেশ। পদ্মা মেঘনা যমুনা আমাদের জীবনের অংশ। কৃষক মাঠে ধান চাষ করে আর জেলে নদীতে মাছ ধরে।', 'ভালো টাইপিংয়ের জন্য ধৈর্য দরকার। আগে নির্ভুলভাবে লিখুন, তারপর গতি নিজে থেকেই বাড়বে।'],
};
tool({ id: 'typing', name: 'Typing Speed Test', icon: '⌨️', group: 'Study & Job', desc: 'Words per minute and accuracy, English or Bangla',
  render(el) {
    head(el, this, 'Start typing the text below. The timer starts with your first key. For Bangla, use a Bangla keyboard (like Avro or Gboard).');
    const p = add(el, `<div class="panel"><div class="row"><select id="lang"><option value="en">English</option><option value="bn">বাংলা</option></select><button id="new">New text</button><div class="grow"></div><b class="mono" id="t">60s</b></div><p id="src" style="font-size:18px;line-height:1.7;margin:14px 0"></p><textarea id="in" style="font-family:inherit;font-size:18px;min-height:6em" placeholder="Type here…"></textarea></div><div id="r"></div>`);
    let start = 0, tick = 0, text = '';
    const best = store.get('typing.best', {});
    const pick = () => { const L = PASSAGES[$(p, '#lang').value]; text = L[Math.floor(Math.random() * L.length)]; $(p, '#src').textContent = text; $(p, '#in').value = ''; $(p, '#in').disabled = false; start = 0; clearInterval(tick); $(p, '#t').textContent = '60s'; $(el, '#r').innerHTML = result({ cards: [['Your best', best[$(p, '#lang').value] ? best[$(p, '#lang').value] + ' WPM' : '—']] }); };
    const finish = () => {
      clearInterval(tick); const typed = $(p, '#in').value; $(p, '#in').disabled = true;
      const mins = Math.max((Date.now() - start) / 6e4, 1 / 60); let ok = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) ok++;
      const wpm = Math.round(ok / 5 / mins); const acc = typed.length ? Math.round(ok / typed.length * 100) : 0; const lang = $(p, '#lang').value;
      if (wpm > (best[lang] || 0)) { best[lang] = wpm; store.set('typing.best', best); }
      $(el, '#r').innerHTML = result({ cards: [['Speed', `${wpm} WPM`], ['Accuracy', `${acc}%`], ['Your best', `${best[lang]} WPM`]], tip: wpm < 25 ? 'Beginner. Try 10 minutes a day with all ten fingers.' : wpm < 40 ? 'Good — this is enough for most office jobs.' : 'Excellent! 🚀' });
    };
    $(p, '#in').oninput = () => {
      if (!start) { start = Date.now(); tick = setInterval(() => { const left = 60 - Math.floor((Date.now() - start) / 1000); $(p, '#t').textContent = left + 's'; if (left <= 0) finish(); }, 250); }
      if ($(p, '#in').value.length >= text.length) finish();
    };
    $(p, '#new').onclick = pick; $(p, '#lang').onchange = pick; pick();
    return () => clearInterval(tick);
  } });

// MARK: Flashcards
tool({ id: 'flash', name: 'Flashcards', icon: '🗃', group: 'Study & Job', desc: 'Learn words and facts with smart repetition',
  render(el) {
    head(el, this, 'Cards you know come back after longer and longer gaps. Cards you miss come back tomorrow.');
    const key = 'flash.cards'; const cards = () => store.get(key, []);
    const p = add(el, `<div class="panel grid3"><div class="field"><label>Front (question / word)</label><input type="text" id="f"></div><div class="field"><label>Back (answer / meaning)</label><input type="text" id="b"></div><div class="field"><label>Deck</label><input type="text" id="d" value="${esc(store.get('flash.deck', 'English words'))}"></div></div><div class="row"><button class="primary" id="add">＋ Add card</button><button id="bulk">Add many (paste)</button></div><div id="study"></div><div id="list"></div>`);
    const save = (c) => store.set(key, c);
    const due = () => cards().filter((c) => c.due <= Date.now());
    const study = () => {
      const d = due(); const box = $(el, '#study');
      if (!d.length) { box.innerHTML = result({ cards: [['Cards due now', '0 🎉', `${cards().length} cards in total`]] }); return; }
      const c = d[0];
      box.innerHTML = `<div class="panel" style="text-align:center;margin-top:14px"><p class="muted">${esc(c.deck)} · ${d.length} due</p><div style="font-size:28px;font-weight:700;margin:16px 0">${esc(c.f)}</div><div id="ans" style="font-size:22px;color:var(--accent);min-height:1.5em"></div><div class="row" style="justify-content:center;margin-top:14px" id="btns"><button class="primary big" id="show">Show answer</button></div></div>`;
      $(box, '#show').onclick = () => { $(box, '#ans').textContent = c.b; $(box, '#btns').innerHTML = '<button class="big danger" id="no">✗ Didn’t know</button><button class="big primary" id="yes">✓ Knew it</button>'; $(box, '#no').onclick = () => rate(c, false); $(box, '#yes').onclick = () => rate(c, true); };
    };
    const rate = (c, ok) => { const all = cards(); const x = all.find((y) => y.id === c.id); x.box = ok ? Math.min((x.box || 0) + 1, 6) : 0; x.due = Date.now() + [0.5, 1, 3, 7, 14, 30, 60][x.box] * 864e5 * (ok ? 1 : 0) + (ok ? 0 : 10 * 6e4); save(all); study(); list(); };
    const list = () => { const c = cards(); $(el, '#list').innerHTML = c.length ? `<details style="margin-top:14px"><summary>All cards (${c.length})</summary><table><tbody>${c.map((x) => `<tr data-id="${x.id}"><td>${esc(x.f)}</td><td>${esc(x.b)}</td><td class="muted">${esc(x.deck)}</td><td><button class="small del">✕</button></td></tr>`).join('')}</tbody></table></details>` : ''; $$(el, '#list .del').forEach((b) => b.onclick = () => { save(cards().filter((x) => x.id !== b.closest('tr').dataset.id)); list(); study(); }); };
    const addCard = (f, b) => { const deck = $(p, '#d').value || 'Cards'; store.set('flash.deck', deck); save([...cards(), { id: uid(), f, b, deck, box: 0, due: Date.now() }]); };
    $(p, '#add').onclick = () => { const f = $(p, '#f').value.trim(), b = $(p, '#b').value.trim(); if (!f || !b) return toast('Write both sides'); addCard(f, b); $(p, '#f').value = $(p, '#b').value = ''; $(p, '#f').focus(); study(); list(); };
    $(p, '#bulk').onclick = () => { const t = prompt('Paste lines like:  word - meaning'); if (!t) return; let n = 0; t.split('\n').forEach((l) => { const m = l.split(/\s+[-–=:]\s+|\t/); if (m.length >= 2) { addCard(m[0].trim(), m.slice(1).join(' - ').trim()); n++; } }); toast(`${n} cards added`); study(); list(); };
    study(); list();
  } });

// MARK: Equation solver
tool({ id: 'equation', name: 'Equation Solver', icon: '🟰', group: 'Study & Job', desc: 'Linear, quadratic and two-unknown equations with steps',
  render(el) {
    head(el, this);
    const s = store.get('equation', { kind: 'quad', a: 1, b: -5, c: 6, d: 0, e: 0, f: 0 });
    const p = add(el, `<div class="panel"><div class="field"><label>Type</label><select id="k"><option value="lin">ax + b = c</option><option value="quad">ax² + bx + c = 0</option><option value="sim">Two equations: ax + by = c, dx + ey = f</option></select></div><div class="row" id="f" style="margin-top:12px"></div></div><div id="r"></div>`);
    $(p, '#k').value = s.kind;
    const fmt = (x) => num(x, 4);
    const draw = () => {
      const keys = s.kind === 'sim' ? ['a', 'b', 'c', 'd', 'e', 'f'] : ['a', 'b', 'c'];
      $(p, '#f').innerHTML = keys.map((k) => `<div class="field"><label>${k}</label><input type="number" step="any" data-k="${k}" value="${s[k]}" style="width:90px"></div>`).join('');
      $$(p, '[data-k]').forEach((x) => x.oninput = () => { s[x.dataset.k] = +x.value; store.set('equation', s); solve(); });
      solve();
    };
    const solve = () => {
      const { a, b, c, d, e, f } = s; let r;
      if (s.kind === 'lin') r = a ? { cards: [['x', fmt((c - b) / a)]], html: `<ol class="steps"><li>${a}x + ${b} = ${c}</li><li>${a}x = ${c} − ${b} = ${c - b}</li><li>x = ${c - b} ÷ ${a} = <b>${fmt((c - b) / a)}</b></li></ol>` } : { cards: [['x', b === c ? 'Any number' : 'No answer']] };
      else if (s.kind === 'quad') {
        if (!a) r = { cards: [['x', b ? fmt(-c / b) : 'No answer', 'a = 0, so it is linear']] };
        else { const D = b * b - 4 * a * c; const steps = `<ol class="steps"><li>Discriminant D = b² − 4ac = ${b}² − 4×${a}×${c} = <b>${fmt(D)}</b></li><li>x = (−b ± √D) ÷ 2a</li></ol>`;
          if (D >= 0) r = { cards: [['x₁', fmt((-b + Math.sqrt(D)) / (2 * a))], ['x₂', fmt((-b - Math.sqrt(D)) / (2 * a))], ['Roots', D === 0 ? 'Equal (one answer)' : 'Two real']], html: steps };
          else r = { cards: [['x₁', `${fmt(-b / (2 * a))} + ${fmt(Math.sqrt(-D) / (2 * a))}i`], ['x₂', `${fmt(-b / (2 * a))} − ${fmt(Math.sqrt(-D) / (2 * a))}i`], ['Roots', 'Complex (D < 0)']], html: steps }; }
      } else { const det = a * e - b * d; r = det ? { cards: [['x', fmt((c * e - b * f) / det)], ['y', fmt((a * f - c * d) / det)]], html: `<ol class="steps"><li>D = ae − bd = ${fmt(det)}</li><li>x = (ce − bf) ÷ D, y = (af − cd) ÷ D</li></ol>` } : { cards: [['Answer', 'None or infinitely many', 'The lines are parallel']] }; }
      $(el, '#r').innerHTML = result(r);
    };
    $(p, '#k').onchange = (e) => { s.kind = e.target.value; store.set('equation', s); draw(); };
    draw();
  } });

// MARK: Formula solver
const FORMULAS = {
  'Circle — area & circumference': [['r', 'Radius'], (v) => [['Area', num(Math.PI * v.r ** 2, 3)], ['Circumference', num(2 * Math.PI * v.r, 3)]]],
  'Rectangle — area & perimeter': [['l', 'Length', 'w', 'Width'], (v) => [['Area', num(v.l * v.w, 3)], ['Perimeter', num(2 * (v.l + v.w), 3)], ['Diagonal', num(Math.hypot(v.l, v.w), 3)]]],
  'Triangle — three sides (Heron)': [['a', 'Side a', 'b', 'Side b', 'c', 'Side c'], (v) => { const s = (v.a + v.b + v.c) / 2; const A = Math.sqrt(s * (s - v.a) * (s - v.b) * (s - v.c)); return [['Area', Number.isFinite(A) && A ? num(A, 3) : 'Not a triangle'], ['Perimeter', num(2 * s, 3)]]; }],
  'Right triangle — Pythagoras': [['a', 'Side a', 'b', 'Side b'], (v) => [['Hypotenuse', num(Math.hypot(v.a, v.b), 3)], ['Area', num(v.a * v.b / 2, 3)]]],
  'Cylinder — volume': [['r', 'Radius', 'h', 'Height'], (v) => [['Volume', num(Math.PI * v.r ** 2 * v.h, 3)], ['Surface area', num(2 * Math.PI * v.r * (v.r + v.h), 3)], ['Litres (if cm)', num(Math.PI * v.r ** 2 * v.h / 1000, 2)]]],
  'Sphere — volume': [['r', 'Radius'], (v) => [['Volume', num(4 / 3 * Math.PI * v.r ** 3, 3)], ['Surface area', num(4 * Math.PI * v.r ** 2, 3)]]],
  'Cone — volume': [['r', 'Radius', 'h', 'Height'], (v) => [['Volume', num(Math.PI * v.r ** 2 * v.h / 3, 3)], ['Slant height', num(Math.hypot(v.r, v.h), 3)]]],
  'Speed, distance, time': [['d', 'Distance (km, 0 = find)', 's', 'Speed km/h (0 = find)', 't', 'Time hours (0 = find)'], (v) => [v.d === 0 ? ['Distance', num(v.s * v.t, 2) + ' km'] : v.s === 0 ? ['Speed', num(v.d / v.t, 2) + ' km/h'] : ['Time', `${Math.floor(v.d / v.s)} h ${Math.round(v.d / v.s % 1 * 60)} min`]]],
  'Simple interest': [['p', 'Principal', 'r', 'Rate % per year', 't', 'Years'], (v) => [['Interest', num(v.p * v.r * v.t / 100, 2)], ['Total', num(v.p * (1 + v.r * v.t / 100), 2)]]],
  'Ohm’s law (V = IR)': [['v', 'Volts (0 = find)', 'i', 'Amps (0 = find)', 'r', 'Ohms (0 = find)'], (v) => [v.v === 0 ? ['Volts', num(v.i * v.r, 3)] : v.i === 0 ? ['Amps', num(v.v / v.r, 3)] : ['Ohms', num(v.v / v.i, 3)], ['Power', num((v.v || v.i * v.r) * (v.i || v.v / v.r), 3) + ' W']]],
  'Density, mass, volume': [['m', 'Mass (0 = find)', 'vol', 'Volume (0 = find)', 'den', 'Density (0 = find)'], (v) => [v.m === 0 ? ['Mass', num(v.den * v.vol, 3)] : v.vol === 0 ? ['Volume', num(v.m / v.den, 3)] : ['Density', num(v.m / v.vol, 3)]]],
};
tool({ id: 'formula', name: 'Formula Solver', icon: '📐', group: 'Study & Job', desc: 'Area, volume, speed, interest, physics — just fill the numbers',
  render(el) {
    head(el, this);
    const s = store.get('formula', { f: Object.keys(FORMULAS)[0], v: {} });
    const p = add(el, `<div class="panel"><div class="field"><label>Formula</label><select id="k">${Object.keys(FORMULAS).map((k) => `<option${k === s.f ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></div><div class="row" id="f" style="margin-top:12px"></div></div><div id="r"></div>`);
    const draw = () => {
      const [ins] = FORMULAS[s.f]; const pairs = []; for (let i = 0; i < ins.length; i += 2) pairs.push([ins[i], ins[i + 1]]);
      $(p, '#f').innerHTML = pairs.map(([k, l]) => `<div class="field"><label>${esc(l)}</label><input type="number" step="any" data-k="${k}" value="${s.v[k] ?? ''}" style="width:150px"></div>`).join('');
      $$(p, '[data-k]').forEach((x) => x.oninput = () => { s.v[x.dataset.k] = +x.value; store.set('formula', s); calc(); });
      calc();
    };
    const calc = () => { const [ins, fn] = FORMULAS[s.f]; const v = {}; for (let i = 0; i < ins.length; i += 2) v[ins[i]] = +(s.v[ins[i]] || 0); $(el, '#r').innerHTML = result(fn(v)); };
    $(p, '#k').onchange = (e) => { s.f = e.target.value; store.set('formula', s); draw(); };
    draw();
  } });

// MARK: Number to words
const BN = 'শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আটাশ উনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ উনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ উনপঞ্চাশ পঞ্চাশ একান্ন বাহান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন উনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি উনসত্তর সত্তর একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর উনআশি আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি আটাশি উননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই'.split(' ');
const EN1 = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const EN10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const en99 = (n) => (n < 20 ? EN1[n] : EN10[Math.floor(n / 10)] + (n % 10 ? '-' + EN1[n % 10] : ''));
function words(n, lang) {
  n = Math.floor(n); if (!n) return lang === 'bn' ? BN[0] : 'zero';
  const w99 = lang === 'bn' ? (x) => BN[x] : en99;
  const U = lang === 'bn' ? ['কোটি', 'লক্ষ', 'হাজার', 'শত'] : ['crore', 'lakh', 'thousand', 'hundred'];
  const out = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  if (crore) out.push(words(crore, lang) + ' ' + U[0]);
  const parts = [[Math.floor(n / 1e5), U[1]], [Math.floor(n % 1e5 / 1e3), U[2]], [Math.floor(n % 1e3 / 100), U[3]]];
  for (const [x, u] of parts) if (x) out.push(w99(x) + ' ' + u);
  if (n % 100) out.push(w99(n % 100));
  return out.join(' ');
}
const bnDigits = (s) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
calcTool({ id: 'numwords', name: 'Taka in Words', icon: '🔤', group: 'Study & Job', desc: 'Write any amount in words — Bangla and English — for cheques',
  fields: [{ k: 'n', l: 'Amount', v: 125750.5 }],
  calc(v) {
    const t = Math.floor(v.n); const p = Math.round((v.n - t) * 100);
    const en = words(t, 'en'); const bn = words(t, 'bn');
    const E = `${en[0].toUpperCase() + en.slice(1)} taka${p ? ` and ${en99(p)} paisa` : ''} only`;
    const B = `${bn} টাকা${p ? ` ${BN[p]} পয়সা` : ''} মাত্র`;
    return { cards: [['English', E], ['বাংলা', B], ['In digits', `${taka(v.n, 2)} · ${bnDigits(num(v.n, 2))}`]], html: `<div class="row"><button class="small" id="ce">Copy English</button><button class="small" id="cb">Copy বাংলা</button></div>` };
  },
  after(out, v) { const t = Math.floor(v.n), p = Math.round((v.n - t) * 100); const en = words(t, 'en'); $(out, '#ce').onclick = () => copy(`${en[0].toUpperCase() + en.slice(1)} taka${p ? ` and ${en99(p)} paisa` : ''} only`); $(out, '#cb').onclick = () => copy(`${words(t, 'bn')} টাকা${p ? ` ${BN[p]} পয়সা` : ''} মাত্র`); } });

// MARK: Reading time & readability
calcTool({ id: 'readtime', name: 'Reading Time & Readability', icon: '⏱', group: 'Study & Job', desc: 'How long a text takes to read or speak, and how easy it is',
  fields: [{ k: 't', l: 'Paste your text', type: 'textarea', rows: 10, v: '' }],
  calc(v) {
    const t = v.t.trim(); if (!t) return { tip: 'Paste a speech, essay or post to see how long it takes.' };
    const w = t.split(/\s+/).filter(Boolean); const sent = Math.max(1, (t.match(/[.!?।]+/g) || []).length);
    const syl = w.reduce((s, x) => s + Math.max(1, (x.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g) || []).length), 0);
    const bangla = /[ঀ-৿]/.test(t);
    const fre = 206.835 - 1.015 * (w.length / sent) - 84.6 * (syl / w.length);
    const m = (x) => `${Math.floor(x)} min ${Math.round(x % 1 * 60)} s`;
    return { cards: [['Reading time', m(w.length / (bangla ? 150 : 230))], ['Speaking time', m(w.length / (bangla ? 110 : 130))], ['Words', num(w.length, 0), `${t.length} characters · ${sent} sentences`], ...(bangla ? [] : [['Readability', fre > 70 ? 'Easy' : fre > 50 ? 'Medium' : 'Hard', `Score ${num(fre, 0)} / 100`]])],
      tip: w.length / sent > 22 ? 'Your sentences are long. Break some into two for easier reading.' : '' };
  } });
