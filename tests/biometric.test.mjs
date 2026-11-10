// Fingerprint / face unlock (js/biometric.js + js/vault.js), with a simulated fingerprint sensor.
// Run: node tests/biometric.test.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

// ---- A tiny browser stand-in: localStorage, window, and a fake fingerprint sensor ----
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
};
Object.defineProperty(globalThis.localStorage, Symbol.iterator, { value: () => store.keys() });
globalThis.window = { addEventListener() {} };

/** Like a real sensor: PRF output = HMAC(hidden device key of this credential, salt), only after a "scan". */
function fakeSensor({ prfAtCreate = true } = {}) {
    const deviceKeys = new Map(); // credential id -> hidden HMAC key
    const sensor = {
        scans: 0,
        refuse: false, // simulates closing the prompt
        async create({ publicKey }) {
            if (sensor.refuse) throw Object.assign(new Error('closed'), { name: 'NotAllowedError' });
            const id = webcrypto.getRandomValues(new Uint8Array(16));
            const key = await webcrypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            deviceKeys.set(Buffer.from(id).toString('hex'), key);
            const first = prfAtCreate ? await webcrypto.subtle.sign('HMAC', key, publicKey.extensions.prf.eval.first) : undefined;
            return { rawId: id.buffer, getClientExtensionResults: () => ({ prf: prfAtCreate ? { enabled: true, results: { first } } : { enabled: true } }) };
        },
        async get({ publicKey }) {
            if (sensor.refuse) throw Object.assign(new Error('closed'), { name: 'NotAllowedError' });
            sensor.scans++;
            const key = deviceKeys.get(Buffer.from(new Uint8Array(publicKey.allowCredentials[0].id)).toString('hex'));
            if (!key) throw Object.assign(new Error('unknown credential'), { name: 'NotAllowedError' });
            const first = await webcrypto.subtle.sign('HMAC', key, publicKey.extensions.prf.eval.first);
            return { getClientExtensionResults: () => ({ prf: { results: { first } } }) };
        },
        wipeDevice() { deviceKeys.clear(); }, // e.g. the passkey was deleted from the phone
    };
    return sensor;
}
let sensor = fakeSensor();
Object.defineProperty(globalThis.navigator, 'credentials', { configurable: true, get: () => sensor });

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const vault = await load('js/vault.js');
const bio = await load('js/biometric.js');

const data = { transactions: [{ id: 'a', type: 'expense', amount: 25075, category: 'Food', note: 'Lunch', date: '2026-11-10T13:00' }] };
assert.equal(await vault.init(), 'localstorage'); // no IndexedDB in Node: the fallback
await vault.createAccount('Tester', 'correct horse', data);

// 1. The password check: right password gives the 32-byte key, a wrong one gives nothing
assert.equal(await vault.exportRawKey('wrong password'), null);
let raw = await vault.exportRawKey('correct horse');
assert.equal(raw.length, 32);

// 2. Turn it on: the key copy is wiped from memory afterwards, and only a locked copy is stored
assert.equal(await bio.enableBiometric(raw, 'Tester'), 'on');
assert.ok(raw.every((b) => b === 0), 'raw key wiped');
assert.equal(bio.biometricEnabled(), true);
const record = JSON.parse(localStorage.getItem(vault.BIOMETRIC_KEY));
assert.ok(!JSON.stringify(record).includes('correct horse'), 'password never stored');
assert.deepEqual(Object.keys(record).sort(), ['credId', 'data', 'iv', 'kdfSalt', 'prfSalt', 'v']);

// 3. Unlock with a scan, after locking
vault.lock();
assert.equal(vault.isUnlocked(), false);
const opened = await bio.unlockWithBiometric();
assert.deepEqual(opened, data);
assert.equal(vault.isUnlocked(), true);
// ...and the unlocked session can still save (same key as the password makes)
await vault.save({ ...data, note: 'saved after fingerprint unlock' });
vault.lock();
assert.equal((await vault.unlock('correct horse')).note, 'saved after fingerprint unlock'); // password still works

// 4. Closing the prompt: no unlock, nothing breaks
vault.lock();
sensor.refuse = true;
assert.equal(await bio.unlockWithBiometric(), null);
assert.equal(vault.isUnlocked(), false);
sensor.refuse = false;

// 5. A different device secret (passkey removed from the phone) can't open it
sensor.wipeDevice();
assert.equal(await bio.unlockWithBiometric(), null);
assert.equal(vault.isUnlocked(), false);

// 6. Tampered stored copy is rejected (AES-GCM detects it)
sensor = fakeSensor({ prfAtCreate: false }); // also covers devices that need a scan to get the secret
await vault.unlock('correct horse');
assert.equal(await bio.enableBiometric(await vault.exportRawKey('correct horse'), 'Tester'), 'on');
assert.equal(sensor.scans, 1, 'one scan to fetch the secret when create() did not return it');
const good = localStorage.getItem(vault.BIOMETRIC_KEY);
const bad = JSON.parse(good);
bad.data = bad.data.slice(0, -4) + (bad.data.endsWith('AAAA') ? 'BBBB' : 'AAAA');
localStorage.setItem(vault.BIOMETRIC_KEY, JSON.stringify(bad));
vault.lock();
assert.equal(await bio.unlockWithBiometric(), null);
localStorage.setItem(vault.BIOMETRIC_KEY, good);
assert.deepEqual((await bio.unlockWithBiometric()).transactions, data.transactions);

// 7. Changing the password switches it off (the old key copy no longer fits)
assert.equal(await vault.changePassword('correct horse', 'new password 1', data), true);
assert.equal(bio.biometricEnabled(), false);
assert.equal(localStorage.getItem(vault.BIOMETRIC_KEY), null);
vault.lock();
assert.equal(await bio.unlockWithBiometric(), null);

// 8. Turning it off, and resetting the app, remove it
await vault.unlock('new password 1');
assert.equal(await bio.enableBiometric(await vault.exportRawKey('new password 1'), 'Tester'), 'on');
bio.disableBiometric();
assert.equal(bio.biometricEnabled(), false);
assert.equal(await bio.enableBiometric(await vault.exportRawKey('new password 1'), 'Tester'), 'on');
await vault.deleteAccount();
assert.equal(localStorage.getItem(vault.BIOMETRIC_KEY), null);

// 9. Closing the prompt while turning it on
await vault.createAccount('Tester', 'another pass', data);
sensor.refuse = true;
assert.equal(await bio.enableBiometric(await vault.exportRawKey('another pass'), 'Tester'), 'cancelled');
assert.equal(bio.biometricEnabled(), false);

// 10. Both needed: right password + scan opens it; a wrong password or a failed scan doesn't
sensor = fakeSensor();
sensor.refuse = false;
await vault.unlock('another pass');
assert.equal(await bio.enableBiometric(await vault.exportRawKey('another pass'), 'Tester'), 'on');
vault.lock();
assert.deepEqual(await bio.unlockWithBoth('wrong pass'), { problem: 'password' });
assert.equal(vault.isUnlocked(), false, 'the scan alone does not open it');
sensor.refuse = true;
assert.deepEqual(await bio.unlockWithBoth('another pass'), { problem: 'scan' });
assert.equal(vault.isUnlocked(), false, 'the right password alone does not open it');
assert.deepEqual(await bio.unlockWithBoth('wrong pass'), { problem: 'scan' }, 'no hint about the password without a scan');
sensor.refuse = false;
assert.deepEqual((await bio.unlockWithBoth('another pass')).data.transactions, data.transactions);
assert.equal(vault.isUnlocked(), true);

// 11. Password only: works only 24 hours after asking, and the clock going back doesn't count
const t0 = Date.UTC(2026, 10, 10, 9, 0);
assert.equal(bio.passwordOnlyRequest(t0), null);
let req = bio.requestPasswordOnly(t0);
assert.equal(req.ready, false);
assert.equal(req.readyAt, t0 + bio.PASSWORD_ONLY_WAIT_MS);
assert.equal(bio.requestPasswordOnly(t0 + 5000).askedAt, t0, 'asking again keeps the first time');
assert.equal(bio.passwordOnlyRequest(t0 + bio.PASSWORD_ONLY_WAIT_MS - 1).ready, false);
assert.equal(bio.passwordOnlyRequest(t0 + bio.PASSWORD_ONLY_WAIT_MS).ready, true);
assert.equal(bio.passwordOnlyRequest(t0 - 1000).ready, false, 'clock set back');
localStorage.setItem(vault.PASSWORD_ONLY_KEY, 'junk');
assert.equal(bio.passwordOnlyRequest(t0), null, 'a damaged value is ignored');
bio.requestPasswordOnly(t0);
bio.cancelPasswordOnly();
assert.equal(bio.passwordOnlyRequest(t0), null);
// turning fingerprint off, or resetting, removes a waiting request too
bio.requestPasswordOnly(t0);
bio.disableBiometric();
assert.equal(bio.passwordOnlyRequest(t0), null);
bio.requestPasswordOnly(t0);
await vault.deleteAccount();
assert.equal(bio.passwordOnlyRequest(t0), null);

console.log('All fingerprint unlock tests passed.');
process.exit(0); // vault.js's BroadcastChannel would otherwise keep Node running
