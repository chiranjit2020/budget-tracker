// Unit tests for js/goals.js and goal cleaning in js/store.js. Run: node tests/goals.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window = { addEventListener() {} }; // store.js/vault.js expect a browser
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const { goalProgress, daysBetween } = await load('js/goals.js');
const { normalize } = await load('js/store.js');

const R = (rupees) => rupees * 100;
const goal = (saved, by = '') => ({ id: 'g', name: 'Goa trip', target: R(30000), by, created: '2026-09-01', entries: saved ? [{ id: 'e', amount: R(saved), date: '2026-09-01' }] : [] });
const today = '2026-11-10';

// Days
assert.equal(daysBetween('2026-11-10', '2027-03-10'), 120);
assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2); // leap year
assert.equal(daysBetween('2026-11-10', '2026-11-01'), -9);

// On track with a date: ₹18,000 over 120 days = ₹4,566 a month (rounded up)
const goa = goalProgress(goal(12000, '2027-03-10'), today);
assert.equal(goa.pct, 40);
assert.equal(goa.remaining, R(18000));
assert.equal(goa.perMonth, R(4566));
assert.equal(goa.state, 'open');
assert.equal(goa.pace, 'Save ₹4,566 a month to reach it by 10 Mar 2027.');

// Exact pace, no float rounding: ₹1,600 over 487 days (10 Nov 2026 -> 11 Mar 2028) is exactly ₹100 a month (487 days = 16 average months)
assert.equal(goalProgress({ ...goal(28400, '2028-03-10'), target: R(30000) }, today).perMonth, R(101)); // 486 days: just over ₹100, rounds up
assert.equal(goalProgress({ ...goal(28400, '2028-03-11'), target: R(30000) }, today).perMonth, R(100));
// One paisa more must round up to the next rupee
assert.equal(goalProgress({ ...goal(0, '2028-03-11'), target: R(1600) + 1 }, today).perMonth, R(101));

// Less than a month left
assert.equal(goalProgress(goal(12000, '2026-11-30'), today).pace, 'Save ₹18,000 in the next 20 days to reach it by 30 Nov 2026.');
assert.equal(goalProgress(goal(12000, '2026-11-11'), today).pace, 'Save ₹18,000 in the next 1 day to reach it by 11 Nov 2026.');
assert.equal(goalProgress(goal(12000, today), today).pace, 'Due today; ₹18,000.00 to go.');

// Date passed
const late = goalProgress(goal(12000, '2026-11-01'), today);
assert.equal(late.state, 'overdue');
assert.equal(late.pace, 'The target date (1 Nov 2026) has passed; ₹18,000.00 to go.');

// No date, nothing saved, reached, over-saved
assert.equal(goalProgress(goal(12000), today).pace, '₹18,000.00 to go.');
assert.equal(goalProgress(goal(0), today).pct, 0);
assert.equal(goalProgress(goal(30000, '2026-11-01'), today).state, 'reached'); // reached beats overdue
const over = goalProgress(goal(35000), today);
assert.equal(over.pct, 100);
assert.equal(over.remaining, 0);

// Withdrawals count against the total
const mixed = { ...goal(0), entries: [{ id: 'a', amount: R(10000), date: '2026-10-01' }, { id: 'b', amount: -R(2500), date: '2026-10-05' }] };
assert.equal(goalProgress(mixed, today).saved, R(7500));

// Cleaning on load (store.normalize): bad goals and entries are dropped, good ones kept
const s = normalize({
    transactions: [],
    goals: [
        { id: 'ok', name: '  Emergency fund  ', target: R(100000), by: '2027-06-30', created: '2026-01-01', entries: [{ id: 'x', amount: R(500), date: '2026-01-02' }, { amount: 0, date: '2026-01-03' }, { amount: R(5), date: 'yesterday' }] },
        { name: '', target: R(100) }, // no name
        { name: 'Bike', target: -5 }, // bad target
        { name: 'Phone', target: R(20000), by: 'soon' }, // bad date -> no date
    ],
});
assert.equal(s.goals.length, 2);
assert.equal(s.goals[0].name, 'Emergency fund');
assert.equal(s.goals[0].entries.length, 1);
assert.equal(s.goals[1].by, '');
assert.deepEqual(normalize({ transactions: [] }).goals, []); // older backups have no goals

console.log('All goal tests passed.');
process.exit(0); // vault.js's BroadcastChannel would otherwise keep Node running
