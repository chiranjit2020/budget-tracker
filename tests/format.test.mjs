// Unit tests for the plain-words money helpers in js/format.js. Run: node tests/format.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { leftOver, savedShare } = await import(pathToFileURL(path.join(root, 'js/format.js')).href);

// Money in minus money out
assert.deepEqual(leftOver(3395502), { label: 'Left over', amount: '₹33,955.02', cls: 'net' });
assert.deepEqual(leftOver(0), { label: 'Left over', amount: '₹0.00', cls: 'net' });
assert.deepEqual(leftOver(-200000), { label: 'Spent extra', amount: '₹2,000.00', cls: 'expense' }); // no minus sign

// Share of income kept
assert.equal(savedShare(2500, 10000), '25%');
assert.equal(savedShare(-2000, 10000), '0%'); // spent more than you got: nothing saved
assert.equal(savedShare(-2000, 0), '—'); // no income: nothing to compare with
assert.equal(savedShare(10000, 10000), '100%');

console.log('All format tests passed.');
