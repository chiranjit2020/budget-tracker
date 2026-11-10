// Fingerprint / face unlock, using WebAuthn (passkeys) with the "PRF" extension.
//
// How it stays safe:
// - The password is never stored. Turning this on needs the password once, which
//   unlocks the data key (the same AES key the password makes).
// - The phone's fingerprint/face hardware gives back a secret (the PRF output) only
//   after a successful scan. That secret, stretched with HKDF, locks (AES-GCM) a copy
//   of the data key. Only the locked copy is stored, so on its own it is useless.
// - Unlocking asks for the scan, gets the secret again, unlocks the key copy and
//   opens the data with it.
// - Once it's on, unlocking needs BOTH the password and the scan, so a password
//   the browser fills in by itself isn't enough for someone holding the phone.
//   If the scan can't work any more, the password alone works again, but only
//   24 hours after asking (see "Password only" below).
// - Changing the password or resetting the app removes this (see vault.js).

import * as vault from './vault.js';

const KEY = vault.BIOMETRIC_KEY;
const HKDF_INFO = new TextEncoder().encode('budget-tracker fingerprint unlock v1');

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

function readRecord() {
    try {
        const r = JSON.parse(localStorage.getItem(KEY) || 'null');
        return r && r.credId && r.prfSalt && r.iv && r.data ? r : null;
    } catch {
        return null;
    }
}

/** Can this device do it? (a built-in fingerprint/face/PIN check that supports PRF, on a secure page) */
export async function biometricSupported() {
    if (!window.isSecureContext || !window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    try {
        const caps = await PublicKeyCredential.getClientCapabilities?.();
        if (caps && caps['extension:prf'] === false) return false; // the browser says PRF isn't supported
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

/** Turned on for the current password? (A password change makes the stored copy useless.) */
export function biometricEnabled() {
    const r = readRecord();
    return Boolean(r && r.kdfSalt === vault.kdfSalt());
}

export function disableBiometric() {
    try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(vault.PASSWORD_ONLY_KEY); // nothing left to skip
    } catch { /* storage blocked */ }
}

/** The device secret (32 bytes) -> an AES-GCM key that locks/unlocks the data key copy. */
async function lockKeyFrom(prfOutput) {
    const material = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: HKDF_INFO },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** Ask for the fingerprint/face scan and return the device secret for `prfSalt`, or null. */
async function scan(credId, prfSalt) {
    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge: random(32), // nothing is sent to a server; the scan itself is what matters
            allowCredentials: [{ type: 'public-key', id: credId }],
            userVerification: 'required',
            timeout: 60000,
            extensions: { prf: { eval: { first: prfSalt } } },
        },
    });
    return assertion?.getClientExtensionResults?.().prf?.results?.first ?? null;
}

const cancelled = (err) => err?.name === 'NotAllowedError' || err?.name === 'AbortError';

/**
 * Turn it on. `rawKey` comes from vault.exportRawKey(password) and is wiped here.
 * Returns 'on', 'cancelled' (the person closed the prompt) or 'unsupported'.
 */
export async function enableBiometric(rawKey, name) {
    try {
        const prfSalt = random(32);
        const label = name || 'Budget Tracker';
        const credential = await navigator.credentials.create({
            publicKey: {
                rp: { name: 'Budget Tracker' },
                user: { id: random(16), name: label, displayName: label },
                challenge: random(32),
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 }, // ES256
                    { type: 'public-key', alg: -257 }, // RS256 (Windows Hello)
                ],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
                timeout: 60000,
                extensions: { prf: { eval: { first: prfSalt } } },
            },
        });
        const ext = credential?.getClientExtensionResults?.().prf;
        if (!ext?.enabled && !ext?.results) return 'unsupported';
        // Some devices give the secret straight away; others need one scan to get it.
        const secret = ext.results?.first ?? (await scan(credential.rawId, prfSalt));
        if (!secret) return 'unsupported';

        const iv = random(12);
        const locked = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await lockKeyFrom(secret), rawKey);
        localStorage.setItem(KEY, JSON.stringify({
            v: 1,
            credId: b64(credential.rawId),
            prfSalt: b64(prfSalt),
            iv: b64(iv),
            data: b64(locked),
            kdfSalt: vault.kdfSalt(),
        }));
        return 'on';
    } catch (err) {
        if (cancelled(err)) return 'cancelled';
        console.warn('Fingerprint unlock could not be turned on:', err);
        return 'unsupported';
    } finally {
        rawKey.fill(0); // don't leave the key copy lying around in memory
    }
}

/** Unlock with a scan. Returns the decrypted data, or null (cancelled, failed or not set up). */
export async function unlockWithBiometric() {
    const r = readRecord();
    if (!r || !biometricEnabled()) return null;
    let raw = null;
    try {
        const secret = await scan(unb64(r.credId), unb64(r.prfSalt));
        if (!secret) return null;
        raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(r.iv) }, await lockKeyFrom(secret), unb64(r.data)));
        return await vault.unlockWithRawKey(raw);
    } catch (err) {
        if (!cancelled(err)) console.warn('Fingerprint unlock failed:', err);
        return null;
    } finally {
        raw?.fill(0);
    }
}

/**
 * Unlock with both: the scan must pass AND the password must be right.
 * The scan comes first, so someone guessing without the owner's finger or face
 * never learns whether a password was right.
 * Returns { data } on success, or { problem: 'scan' | 'password' }.
 */
export async function unlockWithBoth(password) {
    const data = await unlockWithBiometric();
    if (!data) return { problem: 'scan' };
    const raw = await vault.exportRawKey(password);
    if (!raw) {
        vault.lock(); // the scan alone isn't enough either
        return { problem: 'password' };
    }
    raw.fill(0);
    return { data };
}

// ---- Password only, after a 24-hour wait ---------------------------------------------
// For when the scan can't work any more (screen lock removed, fingerprint key deleted).
// The wait means someone who picks up the phone can't get in on the spot, and the
// owner sees the request (and can cancel it) the next time they unlock.

export const PASSWORD_ONLY_WAIT_MS = 24 * 60 * 60 * 1000;

export function passwordOnlyRequest(now = Date.now()) {
    let askedAt = NaN;
    try {
        askedAt = Number(localStorage.getItem(vault.PASSWORD_ONLY_KEY));
    } catch { /* storage blocked */ }
    if (!Number.isFinite(askedAt) || askedAt <= 0) return null;
    const readyAt = askedAt + PASSWORD_ONLY_WAIT_MS;
    // A clock set back before the request doesn't count as time passed.
    return { askedAt, readyAt, ready: now >= readyAt && askedAt <= now };
}

/** Start the wait (keeps the first request if one is already running). */
export function requestPasswordOnly(now = Date.now()) {
    if (passwordOnlyRequest(now)) return passwordOnlyRequest(now);
    try {
        localStorage.setItem(vault.PASSWORD_ONLY_KEY, String(now));
    } catch { /* storage blocked */ }
    return passwordOnlyRequest(now);
}

export function cancelPasswordOnly() {
    try {
        localStorage.removeItem(vault.PASSWORD_ONLY_KEY);
    } catch { /* storage blocked */ }
}
