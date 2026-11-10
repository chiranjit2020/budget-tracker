// Unit tests for js/upcoming.js ("Coming up" on the dashboard). Run: node tests/upcoming.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window = { addEventListener() {} }; // store.js/vault.js expect a browser
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { upcomingItems, upcomingTotals, nextAfter, whenText, addDays } = await import(pathToFileURL(path.join(root, 'js/upcoming.js')).href);

const R = (rupees) => rupees * 100;
const rule = (id, over) => ({ id, type: 'expense', category: 'Bills', note: '', freq: 'monthly', time: '09:00', active: true, method: '', ...over });
const today = '2026-11-28'; // a Saturday
const rules = [
    rule('rent', { note: 'Rent', category: 'Rent', amount: R(16000), start: '2026-11-01', next: '2026-12-01', method: 'upi' }),
    rule('gym', { note: 'Gym', amount: R(200), freq: 'weekly', start: '2026-11-02', next: '2026-11-30' }), // Mondays
    rule('salary', { type: 'income', note: 'Salary', category: 'Salary', amount: R(50000), start: '2026-11-01', next: '2026-12-01' }),
    rule('netflix', { note: 'Netflix', amount: R(649), start: '2026-11-03', next: '2026-12-03' }),
    rule('paused', { note: 'Paused one', amount: R(999), start: '2026-11-29', next: '2026-11-29', active: false }),
    rule('insurance', { note: 'Insurance', amount: R(12000), freq: 'yearly', start: '2026-03-15', next: '2027-03-15' }),
    rule('late', { note: 'Electricity', amount: R(1500), start: '2026-10-27', next: '2026-11-27' }), // due yesterday, not added yet
];

assert.equal(addDays('2026-11-28', 7), '2026-12-05');
assert.equal(addDays('2026-12-30', 3), '2027-01-02');
assert.equal(addDays('2028-02-27', 2), '2028-02-29'); // leap year

// Next 7 days (28 Nov - 5 Dec)
const week = upcomingItems(rules, today, 7);
assert.deepEqual(week.map((i) => [i.name, i.date, i.daysAway]), [
    ['Electricity', '2026-11-28', 0], // overdue counts as today
    ['Gym', '2026-11-30', 2],
    ['Rent', '2026-12-01', 3], // bills before money coming in on the same day
    ['Salary', '2026-12-01', 3],
    ['Netflix', '2026-12-03', 5],
]);
assert.ok(!week.some((i) => i.ruleId === 'paused'), 'paused repeats are left out');
assert.equal(week.find((i) => i.name === 'Rent').method, 'upi');
assert.deepEqual(upcomingTotals(week), { toPay: R(1500 + 200 + 16000 + 649), comingIn: R(50000) });

// Next 30 days: the weekly gym fee appears every Monday
const month = upcomingItems(rules, today, 30);
assert.deepEqual(month.filter((i) => i.ruleId === 'gym').map((i) => i.date), ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28']);
assert.ok(!month.some((i) => i.ruleId === 'insurance'), 'March is beyond 30 days');

// Nothing in the window: say what comes next
const quiet = [rule('rent', { note: 'Rent', amount: R(16000), start: '2026-11-01', next: '2026-12-01' })];
assert.deepEqual(upcomingItems(quiet, '2026-11-02', 7), []);
assert.deepEqual(nextAfter(quiet, '2026-11-02', 7), { date: '2026-12-01', name: 'Rent', amount: R(16000), type: 'expense' });
assert.equal(nextAfter([], today, 7), null);
assert.equal(nextAfter([{ ...quiet[0], active: false }], today, 7), null);

// Month ends: a repeat on the 31st lands on the last day of shorter months
const end = [rule('emi', { note: 'EMI', amount: R(5000), start: '2026-01-31', next: '2027-01-31' })];
assert.deepEqual(upcomingItems(end, '2027-01-30', 30).map((i) => i.date), ['2027-01-31', '2027-02-28']);

// Plain words for timing
assert.deepEqual([0, 1, 3].map(whenText), ['Today', 'Tomorrow', 'in 3 days']);

console.log('All coming-up tests passed.');
process.exit(0); // vault.js's BroadcastChannel would otherwise keep Node running
