// Unit tests for js/debts.js (money given & taken) and its cleaning in js/store.js. Run: node tests/debts.test.mjs
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
assert.equal(s.title, 'You will get ₹500 from Rahul');
assert.equal(s.detail, 'Given on 3 Nov 2026');
assert.equal(s.due, 'none');

// Borrowed, partly repaid, with a note
s = debtStatus(debt({ kind: 'borrowed', person: 'Priya', note: 'Concert tickets', repayments: [paid(200)] }), today);
assert.equal(s.title, 'You will give ₹300 to Priya');
assert.equal(s.detail, 'Taken on 3 Nov 2026 · ₹200 of ₹500 returned · Concert tickets');

// Due dates
assert.equal(debtStatus(debt({ due: '2026-11-20' }), today).detail, 'Given on 3 Nov 2026 · Return by 20 Nov 2026');
assert.equal(debtStatus(debt({ due: '2026-11-20' }), today).due, 'later');
assert.equal(debtStatus(debt({ due: '2026-11-13' }), today).detail, '3 days left to return · Given on 3 Nov 2026');
assert.equal(debtStatus(debt({ due: '2026-11-11' }), today).detail, '1 day left to return · Given on 3 Nov 2026');
assert.equal(debtStatus(debt({ due: today }), today).detail, 'Return date is today · Given on 3 Nov 2026');
assert.equal(debtStatus(debt({ due: today }), today).due, 'today');
s = debtStatus(debt({ due: '2026-11-05' }), today);
assert.equal(s.due, 'overdue');
assert.equal(s.detail, '5 days late · Given on 3 Nov 2026');

// Settled: due dates no longer matter
s = debtStatus(debt({ due: '2026-11-05', repayments: [paid(300, '2026-11-06'), paid(200, '2026-11-09')] }), today);
assert.equal(s.settled, true);
assert.equal(s.due, 'none');
assert.equal(s.title, 'Rahul returned ₹500');
assert.equal(s.detail, 'All returned on 9 Nov 2026');
assert.equal(debtStatus(debt({ note: 'Lunch', repayments: [paid(500)] }), today).detail, 'All returned on 8 Nov 2026 · Lunch'); // date first
assert.equal(debtStatus(debt({ kind: 'borrowed', repayments: [paid(500)] }), today).title, 'You returned ₹500 to Rahul');

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
    'Hi Rahul, just a reminder about the ₹500 I gave you on 3 Nov 2026 for movie tickets. Please return it when you can. Thanks!');
assert.equal(reminderMessage(debt({ repayments: [paid(300)] }), today),
    "Hi Rahul, just a reminder about the ₹500 I gave you on 3 Nov 2026. You've returned ₹300, thank you! ₹200 is still left. Please return it when you can.");

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

// No accounting words anywhere a person reads
for (const d of [debt(), debt({ kind: 'borrowed' }), debt({ repayments: [paid(100)] }), debt({ repayments: [paid(500)] }), debt({ due: '2026-11-01' })]) {
    const st = debtStatus(d, today);
    assert.doesNotMatch(`${st.title} ${st.detail} ${reminderMessage(d, today)}`, /(owe|owes|lent|borrow|settle|overdue|repaid|pending|outstanding)/i);
}

console.log('All given & taken tests passed.');
process.exit(0); // vault.js's BroadcastChannel would otherwise keep Node running
