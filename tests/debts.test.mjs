// Unit tests for js/debts.js and lend/borrow cleaning in js/store.js. Run: node tests/debts.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window = { addEventListener() {} }; // store.js/vault.js expect a browser
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const { debtStatus, debtTotals, knownPeople, reminderMessage, amt } = await load('js/debts.js');
const { normalize } = await load('js/store.js');

const R = (rupees) => Math.round(rupees * 100);
const today = '2026-11-10';
const debt = (over = {}) => ({ id: 'd', kind: 'lent', person: 'Rahul', amount: R(500), date: '2026-11-03', due: '', note: '', repayments: [], ...over });
const paid = (rupees, date = '2026-11-08') => ({ id: `r${rupees}`, amount: R(rupees), date });

assert.equal(amt(R(500)), '₹500');
assert.equal(amt(R(499.5)), '₹499.50');

// Open, no due date
let s = debtStatus(debt(), today);
assert.equal(s.title, 'Rahul owes you ₹500');
assert.equal(s.detail, 'Since 3 Nov 2026');
assert.equal(s.due, 'none');

// Borrowed, partly repaid, with a note
s = debtStatus(debt({ kind: 'borrowed', person: 'Priya', note: 'Concert tickets', repayments: [paid(200)] }), today);
assert.equal(s.title, 'You owe Priya ₹300');
assert.equal(s.detail, 'Since 3 Nov 2026 · ₹200 of ₹500 repaid · Concert tickets');

// Due dates
assert.equal(debtStatus(debt({ due: '2026-11-20' }), today).detail, 'Due 20 Nov 2026');
assert.equal(debtStatus(debt({ due: '2026-11-20' }), today).due, 'later');
assert.equal(debtStatus(debt({ due: '2026-11-13' }), today).detail, 'Due in 3 days');
assert.equal(debtStatus(debt({ due: '2026-11-11' }), today).detail, 'Due in 1 day');
assert.equal(debtStatus(debt({ due: today }), today).due, 'today');
s = debtStatus(debt({ due: '2026-11-05' }), today);
assert.equal(s.due, 'overdue');
assert.equal(s.detail, 'Overdue by 5 days');

// Settled: due dates no longer matter
s = debtStatus(debt({ due: '2026-11-05', repayments: [paid(300, '2026-11-06'), paid(200, '2026-11-09')] }), today);
assert.equal(s.settled, true);
assert.equal(s.due, 'none');
assert.equal(s.title, 'Rahul paid back ₹500');
assert.equal(s.detail, 'Settled 9 Nov 2026');
assert.equal(debtStatus(debt({ note: 'Lunch', repayments: [paid(500)] }), today).detail, 'Settled 8 Nov 2026 · Lunch'); // date first
assert.equal(debtStatus(debt({ kind: 'borrowed', repayments: [paid(500)] }), today).title, 'You paid Rahul back ₹500');

// Totals: only what's still outstanding
const list = [
    debt(), // +500
    debt({ id: 'b', repayments: [paid(100)] }), // +400
    debt({ id: 'c', kind: 'borrowed', person: 'Priya', amount: R(1200) }), // owe 1200
    debt({ id: 'e', repayments: [paid(500)] }), // settled
];
assert.deepEqual(debtTotals(list, today), { owedToYou: R(900), youOwe: R(1200), open: 3 });

// Names: unique (any case), most recent first
assert.deepEqual(knownPeople([debt({ person: 'rahul', date: '2026-10-01' }), debt({ person: 'Priya', date: '2026-11-01' }), debt({ person: 'Rahul', date: '2026-11-05' })]), ['Rahul', 'Priya']);

// Reminder messages
assert.equal(reminderMessage(debt({ note: 'movie tickets' }), today),
    'Hi Rahul, just a friendly reminder about the ₹500 I lent you on 3 Nov 2026 for movie tickets. Please send it when you can. Thanks!');
assert.equal(reminderMessage(debt({ repayments: [paid(300)] }), today),
    'Hi Rahul, just a friendly reminder about the ₹500 I lent you on 3 Nov 2026. Thanks for the ₹300 so far! ₹200 is still pending; please send it when you can.');

// Cleaning on load
const n = normalize({
    transactions: [],
    debts: [
        { id: 'ok', kind: 'lent', person: ' Rahul ', amount: R(500), date: '2026-11-03', due: 'someday', repayments: [{ amount: R(100), date: '2026-11-04' }, { amount: -5, date: '2026-11-04' }] },
        { kind: 'gift', person: 'X', amount: 100, date: '2026-11-03' }, // unknown kind
        { kind: 'lent', person: '', amount: 100, date: '2026-11-03' }, // no person
        { kind: 'borrowed', person: 'Y', amount: 100, date: 'today' }, // bad date
    ],
});
assert.equal(n.debts.length, 1);
assert.equal(n.debts[0].person, 'Rahul');
assert.equal(n.debts[0].due, '');
assert.equal(n.debts[0].repayments.length, 1);
assert.deepEqual(normalize({ transactions: [] }).debts, []);

console.log('All lend & borrow tests passed.');
process.exit(0); // vault.js's BroadcastChannel would otherwise keep Node running
