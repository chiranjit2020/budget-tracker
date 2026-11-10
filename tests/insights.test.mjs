// Unit tests for js/insights.js. Run from the project folder: node tests/insights.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window = { addEventListener() {} }; // store.js/vault.js expect a browser
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { computeInsights } = await import(pathToFileURL(path.join(root, 'js/insights.js')).href);

const R = (rupees) => Math.round(rupees * 100);
let n = 0;
const tx = (date, rupees, category, extra = {}) => ({ id: `t${n++}`, type: 'expense', date: `${date}T10:00`, amount: R(rupees), category, note: '', ...extra });

const transactions = [
    // November (current month, today = 10 Nov)
    tx('2026-11-01', 15000, 'Rent', { recurringId: 'rent' }),
    ...Array.from({ length: 10 }, (_, i) => tx(`2026-11-${String(i + 1).padStart(2, '0')}`, 100, 'Food')),
    tx('2026-11-05', 3000, 'Travel'),
    { ...tx('2026-11-06', 99999, 'Salary'), type: 'income' }, // income never counts
    // October
    tx('2026-10-01', 15000, 'Rent', { recurringId: 'rent' }),
    ...Array.from({ length: 10 }, (_, i) => tx(`2026-10-${String(i + 1).padStart(2, '0')}`, 50, 'Food')),
    tx('2026-10-20', 2000, 'Food'), // after the 10th: not in "same days"
    tx('2026-10-03', 800, 'Shopping'),
];
const recurring = [
    { id: 'rent', type: 'expense', amount: R(15000), freq: 'monthly', start: '2026-10-01', next: '2026-12-01', active: true },
    { id: 'gym', type: 'expense', amount: R(200), freq: 'weekly', start: '2026-11-05', next: '2026-11-12', active: true },
    { id: 'paused', type: 'expense', amount: R(5000), freq: 'weekly', start: '2026-11-05', next: '2026-11-12', active: false },
    { id: 'salary', type: 'income', amount: R(50000), freq: 'monthly', start: '2026-11-15', next: '2026-11-15', active: true },
];
const data = { transactions, recurring };

// 1. Current month, 10 Nov
const cur = computeInsights(data, '2026-11', '2026-11-10');
console.log(cur.map((i) => `[${i.tone}] ${i.title} | ${i.detail}`).join('\n'));
assert.equal(cur.length, 4);
assert.equal(cur[0].kind, 'projection');
assert.equal(cur[0].title, 'Heading for about ₹27,600 this month');
assert.equal(cur[0].detail, '₹9,300 more than October (₹18,300).');
assert.equal(cur[0].tone, 'up');
assert.equal(cur[1].title, 'First Travel spending: ₹3,000');
assert.equal(cur[2].title, 'Nothing on Shopping yet');
assert.equal(cur[2].detail, '₹800 in the same days of October.');
assert.equal(cur[3].title, '₹1,900.00 a day on average');
assert.equal(cur[3].detail, '₹1,630.00 a day in the same days of October (up 17%).');
assert.equal(cur[3].tone, 'up');

// 2. A past month: full month vs full month, no projection
const oct = computeInsights(data, '2026-10', '2026-11-10');
assert.deepEqual(oct.map((i) => i.kind), ['per-day']); // no September data to compare
assert.equal(oct[0].title, '₹590.32 a day on average'); // 18,300 / 31
assert.equal(oct[0].detail, 'Across 31 days.');

// 3. Future month, empty month, too early for a projection
assert.deepEqual(computeInsights(data, '2026-12', '2026-11-10'), []);
assert.deepEqual(computeInsights(data, '2026-09', '2026-11-10'), []);
const early = computeInsights(data, '2026-11', '2026-11-02');
assert.ok(!early.some((i) => i.kind === 'projection'));

// 4. No previous month at all: projection without a comparison
const solo = computeInsights({ transactions: transactions.filter((t) => t.date.startsWith('2026-11')), recurring: [] }, '2026-11', '2026-11-10');
assert.equal(solo[0].tone, 'info');
assert.match(solo[0].detail, /so far, at your usual pace/);

// 5. Small changes stay quiet: Food ₹100 vs ₹95 (5%), ₹50 vs ₹45 (under ₹200)
const quiet = computeInsights(
    { transactions: [tx('2026-11-03', 100, 'Food'), tx('2026-10-03', 95, 'Food'), tx('2026-11-03', 50, 'Tea'), tx('2026-10-02', 45, 'Tea')] },
    '2026-11', '2026-11-10');
assert.ok(!quiet.some((i) => i.kind === 'category' || i.kind === 'new-category'));

// 6. 31 March compared with February's 28 days doesn't break
const mar = computeInsights({ transactions: [tx('2026-03-31', 300, 'Food'), tx('2026-02-28', 100, 'Food')] }, '2026-03', '2026-03-31');
assert.ok(mar.length >= 1);
assert.equal(mar.find((i) => i.kind === 'category').detail, '₹300 vs ₹100 in February.'); // month complete on the 31st

console.log('\nAll insight tests passed.');
process.exit(0); // vault.js's BroadcastChannel would otherwise keep Node running
