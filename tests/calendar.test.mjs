// Unit tests for js/calendar.js. Run from the project folder: node tests/calendar.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { calendarMonth, calendarHTML } = await import(pathToFileURL(path.join(root, 'js/calendar.js')).href);

const tx = (day, rupees, type = 'expense') => ({ type, date: `${day}T10:00`, amount: rupees * 100, category: 'X', note: '' });

// November 2026 starts on a Sunday: 6 blanks (Mon-Sat), 30 days, 6 weeks.
const transactions = [
    tx('2026-11-01', 15000), // rent
    tx('2026-11-03', 10),
    tx('2026-11-04', 20),
    tx('2026-11-05', 15), tx('2026-11-05', 5), // two entries, ₹20 in total: ties with the 4th
    tx('2026-11-06', 50),
    tx('2026-11-07', 99999, 'income'), // income doesn't colour the calendar
    tx('2026-10-31', 500), // other months are ignored
];
const cal = calendarMonth(transactions, '2026-11', '2026-11-10');

assert.equal(cal.weeks.length, 6);
assert.ok(cal.weeks.every((w) => w.length === 7));
assert.deepEqual(cal.weeks[0].slice(0, 6), Array(6).fill(null));
assert.equal(cal.weeks[0][6].day, '2026-11-01');
assert.equal(cal.weeks[5][0].day, '2026-11-30'); // last Monday

const by = (n) => cal.cells[n - 1];
assert.deepEqual([1, 3, 4, 5, 6, 7, 8].map((n) => by(n).level), [4, 1, 1, 1, 3, 0, 0]); // ₹50 ranks 4th of 5 -> shade 3
assert.equal(by(5).spent, 2000);
assert.equal(by(5).count, 2);
assert.equal(cal.spendDays, 5);
assert.equal(cal.total, (15000 + 10 + 20 + 20 + 50) * 100);
assert.equal(by(10).today, true);
assert.equal(by(11).future, true);
assert.equal(by(10).future, false);

// One spending day gets the darkest shade.
const one = calendarMonth([tx('2026-02-14', 300)], '2026-02', '2026-03-01');
assert.equal(one.cells[13].level, 4);
assert.equal(one.cells.length, 28);
// February 2026 starts on a Sunday too: 6 blanks + 28 days = 34 -> 5 weeks.
assert.equal(one.weeks.length, 5);

// A month starting on Monday has no blanks (June 2026).
assert.notEqual(calendarMonth([], '2026-06', '2026-06-01').weeks[0][0], null);

// Markup: the selected day is pressed; days read out what was spent.
const html = calendarHTML(cal, '2026-11-05');
assert.match(html, /data-cal-day="2026-11-05" aria-pressed="true" aria-label="5 November: spent ₹20.00, 2 entries"/);
assert.match(html, /aria-label="10 November, today: nothing spent"/);
assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);

console.log('All calendar tests passed.');
