// Password-protected storage ("vault") using the browser's Web Crypto API.
//
// - Your password is never stored. It is stretched into an AES-256 key with
//   PBKDF2-SHA256 (600,000 rounds + a random salt), which makes guessing slow.
// - All app data is saved encrypted with AES-256-GCM. GCM also detects
//   tampering, and a wrong password simply fails to decrypt: that is how
//   login is checked.
// - While unlocked, the key lives only in memory (non-extractable), so
//   reloading or closing the app locks it again.
// - The encrypted vault is kept in IndexedDB (far more room than
//   localStorage's ~5 MB, and the bytes are stored as-is, not as base64).
//   Older versions kept it in localStorage; it is moved over on first start.

const VAULT_KEY = 'budget-tracker.vault.v1'; // localStorage key (used before IndexedDB, and as the fallback)
const LEGACY_KEY = 'budget-tracker.v1'; // unencrypted data from before accounts existed
/** Fingerprint/face unlock record (see biometric.js). Removed whenever the account's key changes. */
export const BIOMETRIC_KEY = 'budget-tracker.biometric.v1';
export const PASSWORD_ONLY_KEY = 'budget-tracker.password-only'; // when a password-only unlock was asked for
const ITERATIONS = 600_000;
// Key-stretching settings read from a file or storage must be sane: a booby-trapped
// backup asking for billions of rounds would otherwise hang the app (and too few is weak).
const MIN_ITER = 100_000;
const MAX_ITER = 5_000_000;
export const validKdf = (k) =>
    Boolean(k) && Number.isSafeInteger(k.iter) && k.iter >= MIN_ITER && k.iter <= MAX_ITER &&
    typeof k.salt === 'string' && k.salt.length >= 16 && k.salt.length <= 88;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const cryptoAvailable = () => Boolean(globalThis.crypto?.subtle);

// ---- Base64 helpers (chunked so large data doesn't overflow the stack) ----

function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** iv/data as bytes, whether stored as bytes (IndexedDB) or base64 text (localStorage, backup files). */
const bytes = (v) => (typeof v === 'string' ? fromBase64(v) : new Uint8Array(v));

// ---- Crypto -------------------------------------------------------------------

async function deriveKey(password, salt, iterations, extractable = false) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        extractable, // normally false: the key can never be exported or read by scripts
        ['encrypt', 'decrypt'],
    );
}

/** Encrypt `data`. The vault keeps iv/data as raw bytes; backup files need base64 text. */
async function seal(key, data, header, { text = false } = {}) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh for every save
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(data))));
    return text ? { ...header, iv: toBase64(iv), data: toBase64(cipher) } : { ...header, iv, data: cipher };
}

async function unseal(key, vault) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(vault.iv) }, key, bytes(vault.data));
    return JSON.parse(decoder.decode(plain));
}

// ---- Storage: IndexedDB, or localStorage where IndexedDB can't be opened -------

const DB_NAME = 'budget-tracker';
const STORE = 'vault';
const RECORD = 'main';

const asText = (v) => ({ ...v, iv: typeof v.iv === 'string' ? v.iv : toBase64(v.iv), data: typeof v.data === 'string' ? v.data : toBase64(v.data) });
const asBytes = (v) => ({ ...v, iv: bytes(v.iv), data: bytes(v.data) });

function openDB() {
    return new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) return reject(new Error('IndexedDB is not available'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => db.close(); // never block a future upgrade
            resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
}

function idbBackend(db) {
    const run = (mode, op) =>
        new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const req = op(tx.objectStore(STORE));
            let result;
            req.onsuccess = () => (result = req.result);
            tx.oncomplete = () => resolve(result); // only once the write is committed
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
        });
    return {
        kind: 'indexeddb',
        get: async () => (await run('readonly', (st) => st.get(RECORD))) ?? null,
        put: (vault) => run('readwrite', (st) => st.put(asBytes(vault), RECORD)),
        remove: () => run('readwrite', (st) => st.delete(RECORD)),
    };
}

function readLocal() {
    try {
        const raw = localStorage.getItem(VAULT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

const localBackend = {
    kind: 'localstorage',
    get: async () => readLocal(),
    put: async (vault) => localStorage.setItem(VAULT_KEY, JSON.stringify(asText(vault))), // throws if storage is full
    remove: async () => localStorage.removeItem(VAULT_KEY),
};

const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Copy a localStorage vault into IndexedDB. The old copy is deleted only once the new one reads back identical. */
async function migrate(store) {
    const old = readLocal();
    if (!old) return;
    if (!(await store.get())) {
        await store.put(old);
        const copy = await store.get();
        if (!copy || !sameBytes(bytes(copy.data), bytes(old.data)) || !sameBytes(bytes(copy.iv), bytes(old.iv))) {
            await store.remove();
            throw new Error('The moved vault did not read back the same');
        }
    }
    localStorage.removeItem(VAULT_KEY);
}

let backend = null;
let cached = null; // the stored vault (header + ciphertext), kept in step with storage

/**
 * Open storage and load the vault: call once before anything else. If IndexedDB
 * can't be used, or moving the old data fails, it keeps working from localStorage.
 */
export async function init() {
    if (backend) return backend.kind;
    try {
        const store = idbBackend(await openDB());
        await migrate(store);
        backend = store;
    } catch (err) {
        console.warn('Budget Tracker: keeping data in localStorage.', err);
        backend = localBackend;
    }
    try {
        cached = await backend.get();
    } catch {
        cached = null;
    }
    return backend.kind;
}

export const storageKind = () => backend?.kind ?? '';

async function write(vault) {
    await backend.put(vault);
    cached = vault;
    announce();
}

// ---- Other open tabs ---------------------------------------------------------------

const channel = globalThis.BroadcastChannel ? new BroadcastChannel('budget-tracker.vault') : null;
let onChange = () => {};

function announce() {
    channel?.postMessage('changed');
}

/** `fn(exists)` runs when another tab saved, changed the password or deleted the account. */
export function onExternalChange(fn) {
    onChange = fn;
}

async function reloadFromStorage() {
    if (!backend) return;
    try {
        cached = await backend.get();
    } catch {
        return;
    }
    onChange(cached !== null);
}

channel?.addEventListener('message', reloadFromStorage);
// Without BroadcastChannel, localStorage's own event still covers the fallback.
window.addEventListener('storage', (e) => {
    if (!channel && e.key === VAULT_KEY && backend === localBackend) reloadFromStorage();
});

// ---- Stored vault ---------------------------------------------------------------

function readVault() {
    if (!backend) throw new Error('vault.init() has not run yet');
    return cached;
}

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0].slice(0, 30);

/** The unlocked session: key in memory + the vault's non-secret header. */
let session = null;

export const hasAccount = () => readVault() !== null;
export const accountName = () => readVault()?.name ?? '';
export const isUnlocked = () => session !== null;

/** Create the account: derive a key from the password and encrypt `data` with it. */
export async function createAccount(name, password, data) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt, ITERATIONS);
    const header = { v: 1, name: firstName(name), kdf: { alg: 'PBKDF2-SHA256', iter: ITERATIONS, salt: toBase64(salt) } };
    const vault = await seal(key, data, header);
    await write(vault); // may throw if storage is full
    session = { key, header };
    forgetBiometric(); // a new key: any fingerprint unlock made for the old one is useless
}

function forgetBiometric() {
    try {
        localStorage.removeItem(BIOMETRIC_KEY);
        localStorage.removeItem(PASSWORD_ONLY_KEY);
    } catch { /* storage blocked */ }
}

/** The current key's salt (not secret). Fingerprint unlock remembers it to notice a password change. */
export const kdfSalt = () => readVault()?.kdf?.salt ?? '';

/**
 * For turning on fingerprint/face unlock: check `password`, then return the data key as raw bytes
 * (or null if the password is wrong). The caller wraps it with the device secret and wipes it.
 */
export async function exportRawKey(password) {
    const vault = readVault();
    if (!vault) return null;
    const key = await deriveKey(password, fromBase64(vault.kdf.salt), vault.kdf.iter, true);
    try {
        await unseal(key, vault);
    } catch {
        return null;
    }
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

/** Unlock with raw key bytes from fingerprint/face unlock. Returns the data, or null if they don't fit. */
export async function unlockWithRawKey(raw) {
    const vault = readVault();
    if (!vault) return null;
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); // non-extractable again
    let data;
    try {
        data = await unseal(key, vault);
    } catch {
        return null;
    }
    session = { key, header: { v: vault.v, name: vault.name, kdf: vault.kdf } };
    return data;
}

/** Returns the decrypted data, or null if the password is wrong. */
export async function unlock(password) {
    const vault = readVault();
    if (!vault) throw new Error('No account on this device.');
    if (!validKdf(vault.kdf)) throw new Error('The saved data looks damaged.');
    const key = await deriveKey(password, fromBase64(vault.kdf.salt), vault.kdf.iter);
    let data;
    try {
        data = await unseal(key, vault);
    } catch {
        return null;
    }
    session = { key, header: { v: vault.v, name: vault.name, kdf: vault.kdf } };
    return data;
}

/** Encrypt and store the current data with the session key. */
export async function save(data) {
    if (!session) throw new Error('Locked');
    session.header.name = firstName(data.profile?.name) || session.header.name;
    const vault = await seal(session.key, data, session.header);
    await write(vault);
}

/** Decrypt whatever another tab just saved (null if it can't be read with our key). */
export async function readLatest() {
    if (!cached || !session) return null;
    try {
        return await unseal(session.key, cached);
    } catch {
        return null;
    }
}

/** Check the current password, then re-encrypt everything under the new one (new salt too). */
export async function changePassword(current, next, data) {
    const vault = readVault();
    const oldKey = await deriveKey(current, fromBase64(vault.kdf.salt), vault.kdf.iter);
    try {
        await unseal(oldKey, vault);
    } catch {
        return false;
    }
    await createAccount(data.profile?.name || vault.name, next, data);
    return true;
}

export function lock() {
    session = null;
}

// ---- Encrypted backup files ---------------------------------------------------------
// A backup is sealed with the same key as the vault, and carries the salt and
// rounds needed to re-derive that key from the password on any device.

const BACKUP_KIND = 'encrypted-backup';

export const isEncryptedBackup = (file) =>
    file?.app === 'budget-tracker' && file?.kind === BACKUP_KIND && validKdf(file.kdf) &&
    typeof file.iv === 'string' && file.iv.length === 16 && typeof file.data === 'string' && file.data.length > 0;

/** Looks like an encrypted backup but its settings are damaged or unsafe. */
export const isDamagedBackup = (file) => file?.app === 'budget-tracker' && file?.kind === BACKUP_KIND && !isEncryptedBackup(file);

export async function exportEncrypted(data) {
    if (!session) throw new Error('Locked');
    return seal(session.key, data, { app: 'budget-tracker', kind: BACKUP_KIND, v: 1, exportedAt: new Date().toISOString(), kdf: session.header.kdf }, { text: true });
}

/** Decrypt a backup file with the password it was made with; null if the password is wrong. */
export async function decryptBackup(file, password) {
    if (!isEncryptedBackup(file)) return null;
    const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iter);
    try {
        return await unseal(key, file);
    } catch {
        return null;
    }
}

/** Forgot password: the only way out is wiping this device's data. */
export async function deleteAccount() {
    session = null;
    cached = null;
    await backend.remove();
    localStorage.removeItem(VAULT_KEY); // in case an old copy is still around
    forgetBiometric();
    removeLegacy();
    announce();
}

// ---- Unencrypted data from before accounts existed --------------------------------

export function readLegacy() {
    try {
        const raw = localStorage.getItem(LEGACY_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function removeLegacy() {
    for (const k of Object.keys(localStorage)) {
        if (k === LEGACY_KEY || k.startsWith(`${LEGACY_KEY}.`)) localStorage.removeItem(k);
    }
}
