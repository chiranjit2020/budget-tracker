// Unit tests for the plain-words money helpers in js/format.js. Run: node tests/format.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { leftOver, savedShare, parseAmount, toDecimal } = await import(pathToFileURL(path.join(root, 'js/format.js')).href);

// Money in minus money out
assert.deepEqual(leftOver(3395502), { label: 'Left over', amount: '₹33,955.02', cls: 'net' });
assert.deepEqual(leftOver(0), { label: 'Left over', amount: '₹0.00', cls: 'net' });
assert.deepEqual(leftOver(-200000), { label: 'Spent extra', amount: '₹2,000.00', cls: 'expense' }); // no minus sign

// Share of income kept
assert.equal(savedShare(2500, 10000), '25%');
assert.equal(savedShare(-2000, 10000), '0%'); // spent more than you got: nothing saved
assert.equal(savedShare(-2000, 0), '—'); // no income: nothing to compare with
assert.equal(savedShare(10000, 10000), '100%');

// Typed amounts -> whole paise, with no floating-point surprises
const cases = {
    '250': 25000, '250.5': 25050, '250.50': 25050, '0.1': 10, '0.2': 20, '0.3': 30, '0.29': 29,
    '1.005': 101, '2.675': 268, '1.004': 100, '0.005': 1, // a 3rd decimal rounds half-up exactly
    '₹1,00,000.75': 10000075, ' 99 ': 9900, '.5': 50, '5.': 500, '007.10': 710,
};
for (const [text, paise] of Object.entries(cases)) assert.equal(parseAmount(text), paise, text);
for (const bad of ['', '.', '0', '0.00', '0.004', '-5', '1e3', '1.2.3', 'abc', '123456789012']) assert.equal(parseAmount(bad), null, bad);
assert.equal(parseAmount('0.1') + parseAmount('0.2'), parseAmount('0.3')); // the classic 0.1 + 0.2 case
// Every 2-decimal amount up to ₹10,000 parses exactly and prints back the same
for (let p = 1; p <= 1000000; p++) {
    const text = `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`;
    if (parseAmount(text) !== p || toDecimal(p) !== text) assert.fail(`${text} -> ${parseAmount(text)}`);
}

console.log('All format tests passed.');
