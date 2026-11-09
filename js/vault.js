// Password-protected storage ("vault") using the browser's Web Crypto API.
//
// - Your password is never stored. It is stretched into an AES-256 key with
//   PBKDF2-SHA256 (600,000 rounds + a random salt), which makes guessing slow.
// - All app data is saved encrypted with AES-256-GCM. GCM also detects
//   tampering, and a wrong password simply fails to decrypt: that is how
//   login is checked.
// - While unlocked, the key lives only in memory (non-extractable), so
//   reloading or closing the app locks it again.

const VAULT_KEY = 'budget-tracker.vault.v1';
const LEGACY_KEY = 'budget-tracker.v1'; // unencrypted data from before accounts existed
const ITERATIONS = 600_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const VAULT_STORAGE_KEY = VAULT_KEY;
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

// ---- Crypto -------------------------------------------------------------------

async function deriveKey(password, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false, // the key can never be exported or read by scripts
        ['encrypt', 'decrypt'],
    );
}

async function seal(key, data, header) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh for every save
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(data)));
    return { ...header, iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

async function unseal(key, vault) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.data));
    return JSON.parse(decoder.decode(plain));
}

// ---- Stored vault ---------------------------------------------------------------

function readVault() {
    try {
        const raw = localStorage.getItem(VAULT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
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
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault)); // may throw if storage is full
    session = { key, header };
}

/** Returns the decrypted data, or null if the password is wrong. */
export async function unlock(password) {
    const vault = readVault();
    if (!vault) throw new Error('No account on this device.');
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
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

/** Decrypt whatever another tab just saved (null if it can't be read with our key). */
export async function readLatest() {
    const vault = readVault();
    if (!vault || !session) return null;
    try {
        return await unseal(session.key, vault);
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

/** Forgot password: the only way out is wiping this device's data. */
export function deleteAccount() {
    session = null;
    localStorage.removeItem(VAULT_KEY);
    removeLegacy();
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
