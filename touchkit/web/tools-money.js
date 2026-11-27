// Money tools: tax, zakat, savings, bills, prices. Bangladesh rates are defaults
// the user can change, because they change every budget.
/* global calcTool, logTool, rowsEditor, tool, head, add, $, esc, store, result, num, taka, today, fmtDate, daysBetween */

// MARK: Income tax
calcTool({ id: 'taxbd', name: 'Income Tax BD', icon: '🧾', group: 'Money', desc: 'Your yearly income tax from salary, step by step',
  intro: 'Put in your salary. TouchKit applies the tax-free amount, the salary exemption, the slabs and the investment rebate.',
  fields: [
    { k: 'who', l: 'You are', type: 'select', v: 375000, opts: [[375000, 'General'], [425000, 'Woman or 65+ years'], [500000, 'Person with disability'], [525000, 'Freedom fighter']] },
    { k: 'sal', l: 'Monthly salary (gross)', v: 60000 },
    { k: 'bonus', l: 'Festival bonus in the year', v: 60000 },
    { k: 'other', l: 'Other income in the year', v: 0 },
    { k: 'inv', l: 'Investment in the year (DPS, Sanchayapatra, insurance…)', v: 60000 },
    { k: 'area', l: 'You live in', type: 'select', v: 5000, opts: [[5000, 'Dhaka / Chattogram city'], [4000, 'Other city corporation'], [3000, 'Elsewhere']] },
    { k: 'paid', l: 'Tax already cut from salary (TDS)', v: 0 },
  ],
  calc(v) {
    const salary = v.sal * 12 + v.bonus;
    const exempt = Math.min(salary / 3, 500000);
    const taxable = Math.max(0, salary - exempt + v.other);
    const slabs = [[v.who, 0], [300000, 10], [400000, 15], [500000, 20], [2000000, 25], [Infinity, 30]];
    let left = taxable, gross = 0; const rows = [];
    for (const [size, pct] of slabs) {
      if (left <= 0) break;
      const part = Math.min(left, size); const t = part * pct / 100;
      rows.push([pct ? `Next ${size === Infinity ? 'rest' : taka(size)}` : `First ${taka(size)}`, taka(part), pct + '%', taka(t)]);
      gross += t; left -= part;
    }
    const rebate = Math.min(taxable * 0.03, v.inv * 0.15, 1000000);
    let tax = Math.max(0, gross - rebate);
    const min = taxable > v.who ? v.area : 0;
    if (taxable > v.who && tax < min) tax = min;
    const due = tax - v.paid;
    return { cards: [['Tax for the year', taka(tax), taxable > v.who ? `${taka(tax / 12)} per month` : 'Below the tax-free limit'],
      ['Taxable income', taka(taxable), `Salary exemption: ${taka(exempt)}`], ['Investment rebate', taka(rebate), 'Lowest of 3% income, 15% investment, ৳10 lakh'],
      [due >= 0 ? 'Still to pay' : 'Refund due', taka(Math.abs(due))]],
      tip: tax === min && min ? 'You pay the minimum tax for your area.' : '',
      table: { title: 'Slab by slab', head: ['Slab', 'Your income', 'Rate', 'Tax'], rows } };
  },
  note: 'Rates for income year 2026-27 (Finance Act 2025). File your return by 30 November. This is an estimate — check with NBR or a tax adviser before filing.' });

// MARK: Zakat
calcTool({ id: 'zakat', name: 'Zakat', icon: '🤲', group: 'Money', desc: 'How much zakat you owe this year',
  intro: 'Add what you own for a full lunar year. Zakat is 2.5% of what is left after debts, if it reaches the nisab.',
  fields: [
    { h: 'What you own' },
    { k: 'cash', l: 'Cash at home and in bank', v: 0 }, { k: 'save', l: 'Savings (DPS, FD, Sanchayapatra)', v: 0 },
    { k: 'gold', l: 'Gold (vori)', v: 0 }, { k: 'gp', l: 'Gold price per vori (today)', v: 200000 },
    { k: 'silver', l: 'Silver (vori)', v: 0 }, { k: 'sp', l: 'Silver price per vori (today)', v: 3000 },
    { k: 'goods', l: 'Business goods (selling value)', v: 0 }, { k: 'lent', l: 'Money others owe you (will get back)', v: 0 },
    { h: 'What you owe' },
    { k: 'debt', l: 'Debts and bills due now', v: 0 },
    { k: 'basis', l: 'Nisab based on', type: 'select', v: 'silver', opts: [['silver', 'Silver (52.5 vori) — most scholars in BD'], ['gold', 'Gold (7.5 vori)']] },
  ],
  calc(v) {
    const total = v.cash + v.save + v.gold * v.gp + v.silver * v.sp + v.goods + v.lent;
    const net = total - v.debt;
    const nisab = v.basis === 'gold' ? 7.5 * v.gp : 52.5 * v.sp;
    const due = net >= nisab ? net * 0.025 : 0;
    return { cards: [['Zakat to give', taka(due)], ['Zakatable wealth', taka(net), `Total ${taka(total)} − debts ${taka(v.debt)}`], ['Nisab', taka(nisab), v.basis === 'gold' ? '7.5 vori gold' : '52.5 vori silver']],
      tip: net >= nisab ? 'Your wealth is above the nisab, so zakat is due.' : 'Your wealth is below the nisab, so no zakat is due.' };
  },
  note: 'Things you use (home, car, furniture, clothes) are not counted. Ask a scholar for special cases.' });

// MARK: Mobile banking fee
const MFS = [['bkash', 'bKash cash out (app)', 1.85], ['bkashp', 'bKash cash out (Priyo agent)', 1.49], ['nagad', 'Nagad cash out', 1.49], ['rocket', 'Rocket cash out', 1.67], ['upay', 'Upay cash out', 1.4], ['custom', 'Other (enter rate)', 0]];
calcTool({ id: 'mfs', name: 'Mobile Banking Fee', icon: '📲', group: 'Money', desc: 'bKash, Nagad, Rocket cash-out charge — and how much to send',
  fields: [
    { k: 'svc', l: 'Service', type: 'select', v: 'bkash', opts: MFS.map(([k, n, r]) => [k, r ? `${n} — ${r}%` : n]) },
    { k: 'rate', l: 'Rate % (only for "Other")', v: 1.5 },
    { k: 'amt', l: 'Amount', v: 5000 },
  ],
  calc(v) {
    const m = MFS.find((x) => x[0] === v.svc) || MFS[0];
    const r = (m[2] || v.rate) / 100;
    const fee = v.amt * r;
    const need = v.amt / (1 - r) ;
    return [['Charge on cash out', taka(fee, 2), `You get ${taka(v.amt - fee, 2)} in hand`], ['To get the full amount in hand', taka(Math.ceil(need)), `Keep ${taka(Math.ceil(need))} in the wallet`], ['Charge per ৳1,000', taka(1000 * r, 2)]];
  },
  note: 'Charges change often. Check the app before a big cash out. Sending money to a saved number is usually free up to a monthly limit.' });

// MARK: FD / DPS
calcTool({ id: 'fddps', name: 'FD / DPS', icon: '🏦', group: 'Money', desc: 'What a fixed deposit or monthly DPS pays at the end',
  fields: [
    { k: 'kind', l: 'Type', type: 'select', v: 'dps', opts: [['dps', 'DPS (monthly deposit)'], ['fd', 'FD (one-time deposit)']] },
    { k: 'amt', l: 'Amount (monthly for DPS)', v: 5000 }, { k: 'rate', l: 'Interest % per year', v: 9 },
    { k: 'yrs', l: 'Years', v: 5 }, { k: 'tax', l: 'Tax on interest %', type: 'select', v: 10, opts: [[10, '10% (you have TIN)'], [15, '15% (no TIN)']] },
    { k: 'duty', l: 'Excise duty per year (৳)', v: 500 },
  ],
  calc(v) {
    const n = Math.round(v.yrs * 12); const i = v.rate / 1200; let bal = 0, dep = 0; const rows = [];
    if (v.kind === 'fd') { bal = dep = v.amt; }
    for (let m = 1; m <= n; m++) {
      if (v.kind === 'dps') { bal += v.amt; dep += v.amt; }
      bal *= 1 + (v.kind === 'fd' ? 0 : i);
      if (v.kind === 'fd' && m % 3 === 0) bal *= 1 + i * 3; // FDs usually compound every 3 months
      if (m % 12 === 0 || m === n) rows.push([Math.ceil(m / 12), taka(dep), taka(bal - dep), taka(bal)]);
    }
    const interest = bal - dep; const tax = interest * v.tax / 100; const duty = v.duty * Math.ceil(v.yrs);
    const net = bal - tax - duty;
    return { cards: [['You get at the end', taka(net), 'after tax and excise duty'], ['You put in', taka(dep)], ['Interest earned', taka(interest), `Tax ${taka(tax)} · duty ${taka(duty)}`]], table: { title: 'Year by year (before tax)', head: ['Year', 'Deposited', 'Interest', 'Balance'], rows } };
  },
  note: 'Banks differ a little in how they add interest. Excise duty depends on your balance.' });

// MARK: Sanchayapatra
const SP = [['5y', '5-year Bangladesh Sanchayapatra', 11.83, 11.8, 'Paid at the end of 5 years'], ['3m', '3-month profit Sanchayapatra (3 years)', 11.82, 11.77, 'Profit every 3 months'], ['paribar', 'Paribar Sanchayapatra (5 years)', 11.93, 11.8, 'Profit every month'], ['pension', 'Pensioner Sanchayapatra (5 years)', 11.98, 11.8, 'Profit every 3 months']];
calcTool({ id: 'sanchay', name: 'Sanchayapatra', icon: '📜', group: 'Money', desc: 'Profit from savings certificates after tax',
  fields: [
    { k: 'kind', l: 'Scheme', type: 'select', v: 'paribar', opts: SP.map((s) => [s[0], s[1]]) },
    { k: 'amt', l: 'Amount you invest', v: 500000 },
    { k: 'rate', l: 'Your own rate % (0 = use current rate)', v: 0 },
  ],
  calc(v) {
    const s = SP.find((x) => x[0] === v.kind) || SP[0];
    const rate = v.rate || (v.amt <= 750000 ? s[2] : s[3]);
    const yearly = v.amt * rate / 100; const taxPct = v.amt <= 500000 ? 5 : 10; const net = yearly * (1 - taxPct / 100);
    const years = v.kind === '3m' ? 3 : 5;
    return { cards: [['Profit per month (after tax)', taka(net / 12)], ['Per 3 months', taka(net / 4)], ['Per year', taka(net), `Before tax ${taka(yearly)}`], [`Total in ${years} years`, taka(net * years), `Tax ${taxPct}% at source`]],
      tip: `${s[1]}: ${rate}% a year. ${s[4]}.` };
  },
  note: 'Rates from July 2025 — the government changes them. Up to ৳7.5 lakh gets the higher rate. You need a TIN (e-return proof) for over ৳5 lakh.' });

// MARK: Compound interest
calcTool({ id: 'compound', name: 'Compound Interest', icon: '📈', group: 'Money', desc: 'Watch your money grow over the years',
  fields: [{ k: 'p', l: 'Start amount', v: 100000 }, { k: 'm', l: 'Add every month', v: 2000 }, { k: 'r', l: 'Return % per year', v: 10 }, { k: 'y', l: 'Years', v: 10 },
    { k: 'c', l: 'Interest added', type: 'select', v: 12, opts: [[12, 'Monthly'], [4, 'Every 3 months'], [1, 'Yearly']] }],
  calc(v) {
    let bal = v.p, put = v.p; const rows = [];
    for (let m = 1; m <= v.y * 12; m++) {
      bal += v.m; put += v.m;
      if (m % (12 / v.c) === 0) bal *= 1 + v.r / 100 / v.c;
      if (m % 12 === 0) rows.push([m / 12, taka(put), taka(bal - put), taka(bal)]);
    }
    return { cards: [['After ' + v.y + ' years', taka(bal)], ['You put in', taka(put)], ['Growth', taka(bal - put), put ? `${num((bal / put - 1) * 100, 0)}% more` : '']], table: { title: 'Year by year', head: ['Year', 'Put in', 'Growth', 'Total'], rows } };
  } });

// MARK: Inflation
calcTool({ id: 'inflation', name: 'Inflation', icon: '🎈', group: 'Money', desc: 'What your money will really be worth in future',
  fields: [{ k: 'a', l: 'Amount today', v: 100000 }, { k: 'r', l: 'Inflation % per year', v: 9 }, { k: 'y', l: 'Years', v: 10 }],
  calc(v) {
    const f = (1 + v.r / 100) ** v.y;
    const rows = [1, 3, 5, 10, 15, 20].map((y) => [y, taka(v.a * (1 + v.r / 100) ** y), taka(v.a / (1 + v.r / 100) ** y)]);
    return { cards: [[`Same things will cost in ${v.y} years`, taka(v.a * f)], [`Your ${taka(v.a)} will buy only`, taka(v.a / f), `${num(100 / f, 0)}% of today`]], tip: `If your savings grow slower than ${v.r}% a year, you are losing money.`, table: { head: ['Years', 'Cost of same things', 'Value of your money'], rows } };
  },
  note: 'Bangladesh inflation was about 8–10% a year in 2023–2025.' });

// MARK: Savings goal
calcTool({ id: 'goal', name: 'Savings Goal', icon: '🎯', group: 'Money', desc: 'How much to save each month to reach a goal',
  fields: [{ k: 'g', l: 'Goal amount', v: 500000 }, { k: 'have', l: 'Already saved', v: 50000 }, { k: 'y', l: 'In how many years', v: 3 }, { k: 'r', l: 'Return % per year (0 if cash)', v: 8 }],
  calc(v) {
    const n = v.y * 12, i = v.r / 1200;
    const fvHave = v.have * (1 + i) ** n;
    const left = Math.max(0, v.g - fvHave);
    const m = i ? left * i / ((1 + i) ** n - 1) : left / n;
    return [['Save every month', taka(m)], ['Per week', taka(m * 12 / 52)], ['Per day', taka(m * 12 / 365)], ['Your own money in it', taka(m * n + v.have)]];
  } });

// MARK: Budget
calcTool({ id: 'budget', name: 'Budget Planner', icon: '🗂', group: 'Money', desc: 'Split your income into needs, wants and savings',
  fields: [{ k: 'inc', l: 'Monthly income (take home)', v: 40000 }, { k: 'rule', l: 'Rule', type: 'select', v: '50', opts: [['50', '50 / 30 / 20 (common)'], ['60', '60 / 20 / 20 (tight budget)'], ['70', '70 / 10 / 20 (family, high rent)']] }],
  calc(v) {
    const [n, w, s] = { 50: [50, 30, 20], 60: [60, 20, 20], 70: [70, 10, 20] }[v.rule];
    return { cards: [['Needs', taka(v.inc * n / 100), `${n}% — rent, food, bills, transport, school`], ['Wants', taka(v.inc * w / 100), `${w}% — eating out, shopping, trips`], ['Savings', taka(v.inc * s / 100), `${s}% — emergency fund first, then invest`]],
      tip: `Emergency fund goal: ${taka(v.inc * 6)} (6 months of income). Pay yourself first — move savings on salary day.` };
  } });

// MARK: Split bill
tool({ id: 'split', name: 'Split Bill', icon: '🧮', group: 'Money', desc: 'Share trip or party costs — who pays whom',
  render(el) {
    head(el, this, 'Write what each person paid. "Share" is how many parts they use (2 for a couple). TouchKit finds the fewest payments to settle.');
    const p = add(el, '<div class="panel"></div>');
    const out = add(el, '<div></div>');
    rowsEditor(p, 'split.rows', [{ k: 'name', l: 'Name', type: 'text', w: 130 }, { k: 'paid', l: 'Paid', w: 110 }, { k: 'share', l: 'Share', v: 1, w: 70 }],
      [{ name: 'Rahim', paid: 3000, share: 1 }, { name: 'Karim', paid: 0, share: 1 }, { name: 'Sumi', paid: 1500, share: 1 }],
      (rows) => {
        const total = rows.reduce((s, r) => s + (+r.paid || 0), 0); const parts = rows.reduce((s, r) => s + (+r.share || 0), 0) || 1;
        const bal = rows.map((r) => ({ n: r.name || '?', b: (+r.paid || 0) - total * (+r.share || 0) / parts }));
        const pay = []; const cr = bal.filter((x) => x.b > 0.5).sort((a, b) => b.b - a.b); const db = bal.filter((x) => x.b < -0.5).sort((a, b) => a.b - b.b);
        let i = 0, j = 0;
        while (i < db.length && j < cr.length) { const a = Math.min(-db[i].b, cr[j].b); pay.push([db[i].n, '→', cr[j].n, taka(a)]); db[i].b += a; cr[j].b -= a; if (-db[i].b < 0.5) i++; if (cr[j].b < 0.5) j++; }
        out.innerHTML = result({ cards: [['Total spent', taka(total)], ['One share', taka(total / parts)]], table: { title: pay.length ? 'Who pays whom' : '', head: ['From', '', 'To', 'Amount'], rows: pay } }) + (pay.length ? '' : '<p class="muted">Everyone is even. 🎉</p>');
      });
  } });

// MARK: Salary breakdown
calcTool({ id: 'salary', name: 'Salary Breakdown', icon: '💼', group: 'Money', desc: 'Basic, house rent, medical and conveyance from gross salary',
  fields: [{ k: 'g', l: 'Gross salary per month', v: 30000 }, { k: 's', l: 'Structure', type: 'select', v: 'pvt', opts: [['pvt', 'Private company (60/30/5/5)'], ['rmg', 'Garments (wage board)'], ['half', 'Basic 50%, house rent 25%, rest allowances']] }, { k: 'pf', l: 'Provident fund % of basic', v: 10 }],
  calc(v) {
    let basic, hr, med, conv, food = 0;
    if (v.s === 'rmg') { med = 750; conv = 450; food = 1250; basic = Math.max(0, (v.g - med - conv - food) / 1.5); hr = basic * 0.5; }
    else if (v.s === 'half') { basic = v.g * 0.5; hr = v.g * 0.25; med = v.g * 0.1; conv = v.g * 0.15; }
    else { basic = v.g * 0.6; hr = v.g * 0.3; med = v.g * 0.05; conv = v.g * 0.05; }
    const pf = basic * v.pf / 100;
    return { cards: [['Basic', taka(basic)], ['House rent', taka(hr)], ['Medical', taka(med)], ['Conveyance', taka(conv)], ...(food ? [['Food', taka(food)]] : []), ['Provident fund cut', taka(pf), `Take home ≈ ${taka(v.g - pf)}`], ['Two festival bonuses', taka(basic * 2), 'Usually one basic each']], flat: false };
  },
  note: 'Each company can set its own structure. Basic matters: bonus, PF and gratuity are counted from it.' });

// MARK: Credit card
calcTool({ id: 'card', name: 'Credit Card Payoff', icon: '💳', group: 'Money', desc: 'Why paying only the minimum costs so much',
  fields: [{ k: 'b', l: 'Card balance (due)', v: 50000 }, { k: 'r', l: 'Interest % per year', v: 25 }, { k: 'min', l: 'Minimum payment %', v: 5 }, { k: 'fix', l: 'Or I can pay each month', v: 5000 }],
  calc(v) {
    const sim = (payFn) => { let b = v.b, m = 0, int = 0; while (b > 1 && m < 600) { const it = b * v.r / 1200; int += it; b += it; const pay = Math.min(b, payFn(b)); if (pay <= it) return { m: Infinity, int }; b -= pay; m++; } return { m, int }; };
    const a = sim((b) => Math.max(b * v.min / 100, 500)); const f = sim(() => v.fix);
    const t = (x) => (x.m === Infinity ? 'Never' : `${Math.floor(x.m / 12)} y ${x.m % 12} m`);
    return { cards: [['Paying only the minimum', t(a), `Interest ${taka(a.int)}`], [`Paying ${taka(v.fix)} a month`, t(f), `Interest ${taka(f.int)}`], ['You save', taka(Math.max(0, a.int - f.int))]], tip: 'Pay the full bill before the due date and you pay no interest at all.' };
  } });

// MARK: Selling price
calcTool({ id: 'price', name: 'Selling Price & Profit', icon: '🏷', group: 'Money', desc: 'Set a price that gives the profit you want',
  fields: [{ k: 'cost', l: 'Buying cost per item', v: 200 }, { k: 'ex', l: 'Other cost per item (transport, packing, fee)', v: 20 }, { k: 'p', l: 'Profit you want %', v: 25 }, { k: 'mine', l: 'Or check my price', v: 0 }],
  calc(v) {
    const c = v.cost + v.ex;
    const onCost = c * (1 + v.p / 100); const onSale = v.p < 100 ? c / (1 - v.p / 100) : NaN;
    const cards = [[`Price for ${v.p}% profit on sale`, taka(onSale, 2), `Profit ${taka(onSale - c, 2)} per item`], [`Price for ${v.p}% added on cost`, taka(onCost, 2), `Profit ${taka(onCost - c, 2)}`], ['Your full cost', taka(c, 2)]];
    if (v.mine) cards.push(['Your price gives', `${num((v.mine - c) / v.mine * 100, 1)}% profit`, `${taka(v.mine - c, 2)} per item · ${num((v.mine - c) / c * 100, 1)}% on cost`]);
    return { cards, tip: '"On sale" (margin) is what accountants use. 25% on sale is 33% added on cost.' };
  } });

// MARK: VAT
calcTool({ id: 'vat', name: 'VAT', icon: '🧾', group: 'Money', desc: 'Add VAT to a price or take it out',
  fields: [{ k: 'a', l: 'Amount', v: 1150 }, { k: 'r', l: 'VAT rate', type: 'select', v: 15, opts: [[15, '15% (standard)'], [10, '10%'], [7.5, '7.5%'], [5, '5%']] }, { k: 'm', l: 'The amount is', type: 'select', v: 'inc', opts: [['inc', 'With VAT (take it out)'], ['ex', 'Without VAT (add it)']] }],
  calc(v) {
    const base = v.m === 'inc' ? v.a / (1 + v.r / 100) : v.a; const vat = base * v.r / 100;
    return [['Total with VAT', taka(base + vat, 2)], ['Price without VAT', taka(base, 2)], ['VAT', taka(vat, 2)]];
  } });

// MARK: Break-even
calcTool({ id: 'breakeven', name: 'Break-even', icon: '⚖️', group: 'Money', desc: 'How much to sell before a business makes profit',
  fields: [{ k: 'fix', l: 'Fixed cost per month (rent, salary, bills)', v: 50000 }, { k: 'price', l: 'Selling price per item', v: 150 }, { k: 'vc', l: 'Cost per item (goods, packing)', v: 90 }, { k: 'inv', l: 'Money invested to start', v: 300000 }, { k: 'sell', l: 'Items you expect to sell per month', v: 1500 }],
  calc(v) {
    const m = v.price - v.vc; if (m <= 0) throw new Error('Price must be more than the cost per item.');
    const units = v.fix / m; const profit = v.sell * m - v.fix;
    return { cards: [['Sell at least (per month)', `${num(Math.ceil(units), 0)} items`, `${taka(units * v.price)} in sales`], ['Per day', `${num(Math.ceil(units / 30), 0)} items`], ['Your profit per month', taka(profit), `${v.sell} items`], ['Get investment back in', profit > 0 ? `${num(v.inv / profit, 1)} months` : 'Never at this sale']] };
  } });

// MARK: Rent vs buy
calcTool({ id: 'rentbuy', name: 'Rent vs Buy', icon: '🏢', group: 'Money', desc: 'Is it better to rent or buy a flat with a loan?',
  fields: [{ k: 'price', l: 'Flat price', v: 8000000 }, { k: 'down', l: 'Down payment %', v: 30 }, { k: 'rate', l: 'Home loan interest %', v: 10 }, { k: 'yrs', l: 'Loan years', v: 20 },
    { k: 'rent', l: 'Rent for a similar flat (monthly)', v: 25000 }, { k: 'ri', l: 'Rent rise % per year', v: 7 }, { k: 'grow', l: 'Flat price rise % per year', v: 5 }, { k: 'ret', l: 'Return on savings % per year', v: 9 }, { k: 'main', l: 'Service charge + repairs per month', v: 4000 }],
  calc(v) {
    const loan = v.price * (1 - v.down / 100); const n = v.yrs * 12; const i = v.rate / 1200;
    const emi = i ? loan * i * (1 + i) ** n / ((1 + i) ** n - 1) : loan / n;
    let rent = v.rent, invest = v.price * v.down / 100; const g = v.ret / 1200; let paidRent = 0;
    for (let m = 1; m <= n; m++) { invest *= 1 + g; const buyCost = emi + v.main; if (buyCost > rent) invest += buyCost - rent; paidRent += rent; if (m % 12 === 0) rent *= 1 + v.ri / 100; }
    const flat = v.price * (1 + v.grow / 100) ** v.yrs;
    return { cards: [[flat > invest ? 'Buying wins' : 'Renting wins', taka(Math.abs(flat - invest)), `richer after ${v.yrs} years`], ['Monthly EMI', taka(emi), `+ ${taka(v.main)} upkeep`], ['If you buy: flat worth', taka(flat)], ['If you rent and invest the difference', taka(invest), `Rent paid ${taka(paidRent)}`]] };
  },
  note: 'A rough comparison. It ignores registration cost (about 10–14% in Bangladesh) — add it to the price for a fairer answer.' });

// MARK: Electricity bill
calcTool({ id: 'elecbill', name: 'Electricity Bill', icon: '💡', group: 'Money', desc: 'Units to taka with BD residential slabs',
  fields: [{ k: 'u', l: 'Units used this month (kWh)', v: 250 }, { k: 'kw', l: 'Sanctioned load (kW)', v: 2 }, { k: 'meter', l: 'Meter rent', v: 40 }],
  calc(v) {
    const sl = [[75, 5.26], [125, 7.2], [100, 7.59], [100, 8.02], [200, 12.67], [Infinity, 14.61]];
    let left = v.u, e = 0; const rows = [];
    if (v.u <= 50) { e = v.u * 4.63; rows.push(['Lifeline (0–50)', v.u, '৳4.63', taka(e, 2)]); }
    else { let from = 1; for (const [sz, r] of sl) { if (left <= 0) break; const part = Math.min(left, sz); rows.push([`${from}–${sz === Infinity ? '…' : from + sz - 1}`, part, `৳${r}`, taka(part * r, 2)]); e += part * r; left -= part; from += sz; } }
    const demand = v.kw * 42; const vat = (e + demand) * 0.05; const total = e + demand + vat + v.meter;
    return { cards: [['Total bill', taka(total)], ['Energy charge', taka(e, 2)], ['Demand charge', taka(demand), `${v.kw} kW × ৳42`], ['VAT 5%', taka(vat, 2)]], table: { title: 'Slab by slab', head: ['Units', 'Used', 'Rate', 'Charge'], rows }, tip: v.u > 300 ? 'Going above 300 units makes each extra unit much more expensive. Try to stay under.' : '' };
  },
  note: 'BERC residential rates from March 2024. Prepaid meters also cut a small rebate. Rates may have changed.' });

// MARK: Gold price
calcTool({ id: 'gold', name: 'Gold Price', icon: '🪙', group: 'Money', desc: 'Price of jewellery by vori, ana, roti — with making and VAT',
  fields: [{ k: 'rate', l: 'Price per vori (today, BAJUS)', v: 200000 }, { k: 'v', l: 'Vori', v: 1 }, { k: 'a', l: 'Ana', v: 0 }, { k: 'r', l: 'Roti', v: 0 }, { k: 'mk', l: 'Making charge %', v: 6 }, { k: 'vat', l: 'VAT %', v: 5 }],
  calc(v) {
    const vori = v.v + v.a / 16 + v.r / 96; const grams = vori * 11.664;
    const gold = vori * v.rate; const make = gold * v.mk / 100; const vat = (gold + make) * v.vat / 100;
    return [['You pay', taka(gold + make + vat)], ['Gold value', taka(gold), `${num(grams, 3)} gram`], ['Making charge', taka(make)], ['VAT', taka(vat)], ['Price per gram', taka(v.rate / 11.664)]];
  },
  note: '1 vori = 16 ana = 96 roti = 11.664 gram. When you sell, shops usually cut 10–20% from the gold value.' });

// MARK: Faraid (inheritance)
calcTool({ id: 'faraid', name: 'Inheritance (Faraid)', icon: '⚖️', group: 'Money', desc: 'Islamic shares of property for each heir',
  intro: 'For the common family heirs (Hanafi). Debts and funeral costs are paid first, then the will (up to one third), then the shares.',
  fields: [
    { k: 'est', l: 'Total property value', v: 6000000 }, { k: 'debt', l: 'Debts + funeral cost', v: 0 }, { k: 'will', l: 'Will (wasiyat) amount', v: 0 },
    { k: 'dec', l: 'The person who died was', type: 'select', v: 'm', opts: [['m', 'Man'], ['f', 'Woman']] },
    { k: 'sp', l: 'Wives alive (if a man) / husband alive (if a woman: 1)', v: 1 },
    { k: 'sons', l: 'Sons', v: 1 }, { k: 'dau', l: 'Daughters', v: 1 },
    { k: 'fa', l: 'Father alive', type: 'check', v: false }, { k: 'mo', l: 'Mother alive', type: 'check', v: true },
    { k: 'bro', l: 'Full brothers', v: 0 }, { k: 'sis', l: 'Full sisters', v: 0 },
  ],
  calc(v) {
    const net = Math.max(0, v.est - v.debt); const will = Math.min(v.will, net / 3); const E = net - will;
    const kids = v.sons + v.dau > 0; const sib = v.bro + v.sis;
    const H = []; // { who, n, share, kind: 'fixed'|'res', w }
    const spouse = v.sp > 0 ? (v.dec === 'f' ? { who: 'Husband', n: 1, share: kids ? 1 / 4 : 1 / 2 } : { who: v.sp > 1 ? 'Wives' : 'Wife', n: v.sp, share: kids ? 1 / 8 : 1 / 4 }) : null;
    if (spouse) H.push({ ...spouse, kind: 'fixed', sp: true });
    if (v.mo) {
      let s = kids || sib >= 2 ? 1 / 6 : 1 / 3;
      if (!kids && sib < 2 && spouse && v.fa) s = (1 - spouse.share) / 3; // Umariyyatain
      H.push({ who: 'Mother', n: 1, share: s, kind: 'fixed' });
    }
    if (v.fa) H.push({ who: 'Father', n: 1, share: v.sons ? 1 / 6 : v.dau ? 1 / 6 : 0, kind: v.sons ? 'fixed' : 'both', res: 1 });
    if (v.dau && !v.sons) H.push({ who: 'Daughters', n: v.dau, share: v.dau === 1 ? 1 / 2 : 2 / 3, kind: 'fixed' });
    const blocked = v.sons > 0 || v.fa;
    if (!blocked && v.sis && !v.bro && !v.dau) H.push({ who: 'Sisters', n: v.sis, share: v.sis === 1 ? 1 / 2 : 2 / 3, kind: 'fixed' });
    let F = H.reduce((s, h) => s + h.share, 0);
    if (F > 1) H.forEach((h) => (h.share /= F)), (F = 1); // awl: everyone reduced
    let R = 1 - F;
    // Residue (asaba) in order.
    const res = [];
    if (v.sons) res.push({ who: 'Sons', n: v.sons, w: 2 }, ...(v.dau ? [{ who: 'Daughters', n: v.dau, w: 1 }] : []));
    else if (v.fa) res.push({ who: 'Father', n: 1, w: 1 });
    else if (v.bro) res.push({ who: 'Brothers', n: v.bro, w: 2 }, ...(v.sis ? [{ who: 'Sisters', n: v.sis, w: 1 }] : []));
    else if (v.sis && v.dau) res.push({ who: 'Sisters', n: v.sis, w: 1 });
    let note = '';
    if (R > 1e-9 && res.length) {
      const parts = res.reduce((s, r) => s + r.n * r.w, 0);
      for (const r of res) { const h = H.find((x) => x.who === r.who); const add = R * r.n * r.w / parts; if (h) h.share += add; else H.push({ who: r.who, n: r.n, share: add, kind: 'res' }); }
      R = 0;
    } else if (R > 1e-9) {
      const others = H.filter((h) => !h.sp); const tot = others.reduce((s, h) => s + h.share, 0);
      if (tot) { others.forEach((h) => (h.share += R * h.share / tot)); R = 0; } // radd
      else note = 'Some property is left with no close heir. It goes to other relatives — ask a scholar or lawyer.';
    }
    if (blocked && sib) note = (note ? note + ' ' : '') + 'Brothers and sisters get nothing when there is a son or the father.';
    const rows = H.filter((h) => h.share > 1e-9).map((h) => [h.who, h.n, num(h.share * 100, 2) + '%', taka(E * h.share), h.n > 1 ? taka(E * h.share / h.n) + ' each' : '']);
    return { cards: [['Shared among heirs', taka(E)], ['Debts + funeral', taka(Math.min(v.debt, v.est))], ['Will', taka(will), will < v.will ? 'Cut to one third' : '']], table: { title: 'Who gets what', head: ['Heir', 'People', 'Share', 'Amount', 'Each person'], rows }, warn: note };
  },
  note: 'For learning and planning only. Land is split by value. Grandchildren, grandparents and half-siblings are not covered — ask a scholar or lawyer for a real case.' });

// MARK: Provident fund / gratuity
calcTool({ id: 'pf', name: 'Provident Fund & Gratuity', icon: '🧓', group: 'Money', desc: 'What you get when you leave or retire',
  fields: [{ k: 'b', l: 'Basic salary now (monthly)', v: 30000 }, { k: 'y', l: 'Years of service', v: 10 }, { k: 'own', l: 'Your PF %', v: 10 }, { k: 'co', l: 'Company PF %', v: 10 }, { k: 'r', l: 'PF interest % per year', v: 8 }, { k: 'inc', l: 'Salary rise % per year', v: 6 }, { k: 'gm', l: 'Gratuity: basic months per year', v: 1 }],
  calc(v) {
    let bal = 0, b = v.b / (1 + v.inc / 100) ** v.y, put = 0;
    for (let m = 1; m <= v.y * 12; m++) { const c = b * (v.own + v.co) / 100; bal = (bal + c) * (1 + v.r / 1200); put += c; if (m % 12 === 0) b *= 1 + v.inc / 100; }
    const grat = v.b * v.gm * v.y;
    return [['Total you get', taka(bal + grat)], ['Provident fund', taka(bal), `Put in ${taka(put)}`], ['Gratuity', taka(grat), `${v.gm} × last basic × ${v.y} years`]];
  },
  note: 'Under Bangladesh labour law gratuity is at least one basic per year after a year of service (some companies give 1.5 after 10 years). The company share of PF usually needs a few years of service.' });

// MARK: Subscriptions
logTool({ id: 'subs', name: 'Subscription Tracker', icon: '🔁', group: 'Money', desc: 'All monthly payments (internet, apps, rent) in one place',
  fields: [{ k: 'name', l: 'Name', type: 'text', ph: 'e.g. Internet', clear: true }, { k: 'amt', l: 'Amount', v: '' }, { k: 'cyc', l: 'Every', type: 'select', v: 'm', opts: [['m', 'Month'], ['y', 'Year'], ['w', 'Week']] }, { k: 'next', l: 'Next payment', type: 'date', v: today }],
  check: (v) => (!v.name ? 'Write a name' : !v.amt ? 'Write the amount' : ''),
  head: ['Name', 'Amount', 'Every', 'Next payment'], sort: (a, b) => (a.next > b.next ? 1 : -1),
  cols: (r) => [r.name, taka(r.amt), { m: 'Month', y: 'Year', w: 'Week' }[r.cyc], `${fmtDate(r.next)} (${daysBetween(today(), r.next)} days)`],
  summary(rs) { const m = rs.reduce((s, r) => s + r.amt * ({ m: 1, y: 1 / 12, w: 52 / 12 }[r.cyc]), 0); const soon = rs.filter((r) => daysBetween(today(), r.next) <= 7 && daysBetween(today(), r.next) >= 0); return { cards: [['Per month', taka(m)], ['Per year', taka(m * 12)], ['Due in 7 days', String(soon.length), soon.map((r) => r.name).join(', ')]] }; } });

// MARK: Unit price compare
tool({ id: 'unitprice', name: 'Unit Price Compare', icon: '🛒', group: 'Money', desc: 'Which pack is really cheaper per kg or litre',
  render(el) {
    head(el, this, 'Add the packs you see in the shop. Use g, kg, ml, L or pcs.');
    const p = add(el, '<div class="panel"></div>'); const out = add(el, '<div></div>');
    const f = { g: 0.001, kg: 1, ml: 0.001, L: 1, pcs: 1 };
    rowsEditor(p, 'unitprice.rows', [{ k: 'name', l: 'Pack', type: 'text', w: 140 }, { k: 'price', l: 'Price', w: 90 }, { k: 'qty', l: 'Size', w: 80 }, { k: 'unit', l: 'Unit', type: 'select', opts: ['g', 'kg', 'ml', 'L', 'pcs'] }],
      [{ name: 'Small pack', price: 95, qty: 500, unit: 'g' }, { name: 'Big pack', price: 180, qty: 1, unit: 'kg' }],
      (rows) => {
        const per = rows.map((r) => ({ ...r, per: r.price / (r.qty * (f[r.unit] || 1)) })).filter((r) => r.qty && r.price);
        const best = per.reduce((a, b) => (!a || b.per < a.per ? b : a), null);
        const big = (u) => (u === 'g' ? 'kg' : u === 'ml' ? 'L' : u);
        out.innerHTML = result({ cards: best ? [['Cheapest', best.name || '?', `${taka(best.per, 2)} per ${big(best.unit)}`]] : [], table: { head: ['Pack', 'Price per kg / L / piece', ''], rows: per.map((r) => [r.name, `${taka(r.per, 2)} / ${big(r.unit)}`, r === best ? '✅ best' : `${num((r.per / best.per - 1) * 100, 0)}% dearer`]) } });
      });
  } });
