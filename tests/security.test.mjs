// Security checks: password rules and backup-file validation. Run: node tests/security.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window = { addEventListener() {} };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const { passwordProblem } = await load('js/passwords.js');
const vault = await load('js/vault.js');
const { normalize } = await load('js/store.js');

// ---- Passwords: guessable ones are refused, good ones pass ----
for (const weak of ['1234567', 'password', 'PASSWORD1', '12345678', '87654321', 'abcdefgh', 'qwertyui', 'asdfghjk', 'aaaaaaaa', '11111111', 'iloveyou', 'india@123', 'Ravi2026!x']) {
    assert.ok(passwordProblem(weak, 'Ravi Kumar'), `should refuse: ${weak}`);
}
for (const good of ['correct horse battery', 'mango-train-42-blue', 'Tz9#kq!vLp', 'chai at 7 with amma']) {
    assert.equal(passwordProblem(good, 'Ravi Kumar'), '', `should accept: ${good}`);
}
assert.match(passwordProblem('ravikumar99', 'Ravi Kumar'), /name/);
assert.match(passwordProblem('23456789'), /run like 12345678/); // a run not on the common list: plain-words explanation
assert.match(passwordProblem('12345678'), /most common/);

// ---- Backup files: unsafe key-stretching settings are refused ----
const good = { app: 'budget-tracker', kind: 'encrypted-backup', v: 1, kdf: { alg: 'PBKDF2-SHA256', iter: 600000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' }, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' };
assert.equal(vault.isEncryptedBackup(good), true);
const withKdf = (kdf) => ({ ...good, kdf: { ...good.kdf, ...kdf } });
for (const bad of [
    withKdf({ iter: 2_000_000_000 }), // would hang the app
    withKdf({ iter: 1 }), // far too weak
    withKdf({ iter: '600000' }),
    withKdf({ iter: 600000.5 }),
    withKdf({ salt: 'short' }),
    withKdf({ salt: 'A'.repeat(10_000) }),
    { ...good, iv: 'A'.repeat(5000) },
    { ...good, data: '' },
    { ...good, kdf: undefined },
]) {
    assert.equal(vault.isEncryptedBackup(bad), false, JSON.stringify(bad).slice(0, 80));
    assert.equal(vault.isDamagedBackup(bad), true);
}
// A damaged file is refused at once instead of running key derivation
const t0 = Date.now();
assert.equal(await vault.decryptBackup(withKdf({ iter: 2_000_000_000 }), 'x'), null);
assert.ok(Date.now() - t0 < 200, 'returned immediately');

// ---- Imported data can't pollute object prototypes ----
const evil = JSON.parse('{"transactions":[{"id":"a","type":"expense","amount":1,"category":"c","date":"2026-11-01T10:00","__proto__":{"polluted":1}}],"__proto__":{"polluted":2},"budgets":{"__proto__":{"polluted":3},"constructor":{"prototype":{"polluted":4}}},"profile":{"__proto__":{"polluted":5}},"goals":[{"name":"g","target":5,"__proto__":{"polluted":6}}],"debts":[{"kind":"lent","person":"p","amount":5,"date":"2026-11-01","__proto__":{"polluted":7}}]}');
const clean = normalize(evil);
assert.equal(({}).polluted, undefined);
assert.equal(Object.prototype.polluted, undefined);
assert.deepEqual(Object.keys(clean.budgets), []);
assert.equal(clean.transactions.length, 1);
assert.equal(Object.getPrototypeOf(clean.transactions[0]), Object.prototype);

console.log('All security tests passed.');
process.exit(0); // vault.js's BroadcastChannel would otherwise keep Node running
