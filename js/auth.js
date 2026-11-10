// Registration, login, lock and auto-lock.

import * as vault from './vault.js';
import { openSession, closeSession, flush, normalize, setExternalLockHandler } from './store.js';
import { confirmDialog, toast, icon } from './ui.js';
import { biometricEnabled, biometricSupported, unlockWithBiometric } from './biometric.js';
import { esc } from './format.js';

const screen = document.getElementById('auth');
const appEl = document.querySelector('.app');

import { MIN_PASSWORD, passwordProblem } from './passwords.js';
import { playUnlockChime } from './sound.js';

export { MIN_PASSWORD };

// ---- Auto-lock preference (not secret, so stored in plain localStorage) ----

const AUTOLOCK_KEY = 'budget-tracker.autolock';
export const AUTOLOCK_OPTIONS = [
    [0, 'As soon as I leave the app'],
    [1, 'After 1 minute away'],
    [5, 'After 5 minutes away'],
    [15, 'After 15 minutes away'],
    [-1, 'Only when I lock it or close the app'],
];

export function getAutoLock() {
    try {
        const raw = localStorage.getItem(AUTOLOCK_KEY);
        const v = Number(raw);
        if (raw !== null && AUTOLOCK_OPTIONS.some(([m]) => m === v)) return v;
    } catch { /* storage blocked */ }
    return 1; // default: lock after 1 minute away
}

export function setAutoLock(minutes) {
    try {
        localStorage.setItem(AUTOLOCK_KEY, String(minutes));
    } catch { /* storage blocked */ }
}

// ---- Shared bits ------------------------------------------------------------

let handlers = { onUnlock() {}, onLock() {} };

// The Show/Hide button sits outside the <label> so it isn't read as part of the field's name.
const passwordField = (name, label, autocomplete, extra = '') => `
    <div class="field">
        <label for="auth-${name}">${label}</label>
        <span class="pw-wrap">
            <input id="auth-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required ${extra}>
            <button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">Show</button>
        </span>
    </div>`;

function showScreen(html) {
    appEl.hidden = true;
    screen.innerHTML = `<div class="auth-card"><svg class="auth-logo brand-logo" viewBox="0 0 396.81 497.38" width="48" height="60" role="img" aria-label="Budget Tracker"><use href="#brand-logo" /></svg>${html}</div>`;
    screen.hidden = false;
    screen.querySelectorAll('.pw-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.textContent = show ? 'Hide' : 'Show';
            btn.setAttribute('aria-pressed', String(show));
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    });
}

function setError(form, message) {
    const el = form.querySelector('.field-error');
    el.textContent = message;
    el.hidden = !message;
}

function busy(form, label) {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = Boolean(label);
    if (label) {
        btn.dataset.label ??= btn.textContent;
        btn.textContent = label;
    } else if (btn.dataset.label) {
        btn.textContent = btn.dataset.label;
    }
}

function enterApp(data) {
    openSession(data);
    screen.hidden = true;
    screen.replaceChildren();
    appEl.hidden = false;
    handlers.onUnlock();
    playUnlockChime(); // a soft "ta-da" (can be turned off in Settings → Appearance)
}

// ---- Registration -------------------------------------------------------------

function showRegister() {
    let existing = null;
    try {
        const legacy = vault.readLegacy();
        existing = legacy ? normalize(legacy) : null;
    } catch {
        existing = null;
    }
    const count = existing?.transactions.length ?? 0;

    showScreen(`
        <h1>Create your account</h1>
        <p class="muted">Set a password to lock Budget Tracker on this device. Your data is encrypted with it, so nobody can open it without the password.</p>
        ${count ? `<p class="auth-note">Your existing ${count} transaction${count === 1 ? '' : 's'} will be encrypted with this password.</p>` : ''}
        <form id="register-form" novalidate>
            <label class="field">
                <span>Your name</span>
                <input name="name" type="text" autocomplete="username" maxlength="60" required value="${esc(existing?.profile.name ?? '')}">
            </label>
            ${passwordField('password', `Password <small>(at least ${MIN_PASSWORD} characters)</small>`, 'new-password', `minlength="${MIN_PASSWORD}"`)}
            ${passwordField('confirm', 'Confirm password', 'new-password')}
            <p class="field-error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primary btn-block">Create account</button>
        </form>
        <p class="auth-fine"><strong>There is no password recovery.</strong> If you forget it, your data can't be unlocked. Keep a backup from Settings → Export backup.</p>`);

    const form = document.getElementById('register-form');
    form.elements.name.focus();
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.elements.name.value.trim();
        const password = form.elements.password.value;
        if (!name) return setError(form, 'Enter your name.');
        const problem = passwordProblem(password, name);
        if (problem) return setError(form, problem);
        if (password !== form.elements.confirm.value) return setError(form, 'The two passwords don’t match.');
        setError(form, '');
        busy(form, 'Creating account…');
        try {
            const data = normalize(existing ?? { transactions: [] });
            data.profile.name = name.slice(0, 60);
            await vault.createAccount(name, password, data);
            vault.removeLegacy(); // the plain-text copy is now encrypted, so delete it
            enterApp(data);
            toast('Account created. Your data is now encrypted.');
        } catch (err) {
            console.error(err);
            busy(form, '');
            setError(form, 'Could not create the account. Browser storage may be full or blocked.');
        }
    });
}

// ---- Login ----------------------------------------------------------------------

// Wrong-password waits survive a reload. Kept in plain localStorage: it's only a counter.
const GUARD_KEY = 'budget-tracker.login-guard';
const MAX_WAIT_SECONDS = 60 * 60; // never lock someone out for more than an hour
let failures = 0;
let lockedUntil = 0;
try {
    const g = JSON.parse(localStorage.getItem(GUARD_KEY) || '{}');
    failures = Number.isSafeInteger(g.failures) && g.failures > 0 ? g.failures : 0;
    lockedUntil = Math.min(Number(g.lockedUntil) || 0, Date.now() + MAX_WAIT_SECONDS * 1000);
} catch { /* storage blocked */ }

function saveGuard() {
    try {
        if (failures || lockedUntil > Date.now()) localStorage.setItem(GUARD_KEY, JSON.stringify({ failures, lockedUntil }));
        else localStorage.removeItem(GUARD_KEY);
    } catch { /* storage blocked */ }
}

function resetGuard() {
    failures = 0;
    lockedUntil = 0;
    saveGuard();
}

function showLogin() {
    const name = vault.accountName();
    showScreen(`
        <h1>Welcome back${name ? `, ${esc(name)}` : ''}</h1>
        <p class="muted">Enter your password to unlock your budget.</p>
        <form id="login-form" novalidate>
            <input type="text" name="username" autocomplete="username" value="${esc(name)}" class="sr-only" tabindex="-1" aria-hidden="true">
            ${passwordField('password', 'Password', 'current-password')}
            <p class="field-error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primary btn-block">Unlock</button>
        </form>
        <button type="button" class="btn btn-ghost btn-block auth-bio" id="bio-unlock" hidden>${icon('fingerprint')}<span>Unlock with fingerprint or face</span></button>
        <button type="button" class="link-btn auth-forgot" id="forgot-btn">Forgot password?</button>`);

    const form = document.getElementById('login-form');
    const input = form.elements.password;
    input.focus();

    // Fingerprint / face: offered when it's turned on and this device supports it.
    const bioBtn = document.getElementById('bio-unlock');
    const tryBiometric = async (auto) => {
        bioBtn.disabled = true;
        const data = await unlockWithBiometric();
        bioBtn.disabled = false;
        if (data) {
            resetGuard();
            enterApp(data);
        } else if (!auto) {
            setError(form, 'Couldn’t unlock with fingerprint or face. Try again, or use your password.');
        }
    };
    bioBtn.addEventListener('click', () => tryBiometric(false));
    if (biometricEnabled()) {
        biometricSupported().then((ok) => {
            if (!ok || !bioBtn.isConnected) return;
            bioBtn.hidden = false;
            tryBiometric(true); // ask straight away; if it's closed, the button and password stay
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const wait = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (wait > 0) return setError(form, `Too many wrong attempts. Try again in ${wait} seconds.`);
        if (!input.value) return setError(form, 'Enter your password.');
        setError(form, '');
        busy(form, 'Unlocking…');
        let data = null;
        try {
            data = await vault.unlock(input.value);
        } catch (err) {
            console.error(err);
        }
        if (data) {
            resetGuard();
            enterApp(data);
            return;
        }
        busy(form, '');
        failures++;
        saveGuard();
        if (failures >= 5) {
            const seconds = Math.min(30 * 2 ** (failures - 5), MAX_WAIT_SECONDS); // 30s, 60s, 120s… up to an hour
            lockedUntil = Date.now() + seconds * 1000;
            saveGuard();
            setError(form, `Wrong password. Too many attempts, so wait ${seconds} seconds.`);
        } else {
            setError(form, 'Wrong password. Try again.');
        }
        input.select();
    });

    document.getElementById('forgot-btn').addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Reset Budget Tracker?',
            message: 'Your data is encrypted with your password, so it can’t be recovered without it. Resetting permanently deletes all data on this device so you can create a new account. If you have a backup file, you can import it afterwards.',
            ok: 'Delete everything',
            danger: true,
        });
        if (!ok) return;
        await vault.deleteAccount();
        resetGuard();
        showRegister();
    });
}

// ---- Lock -----------------------------------------------------------------------

export async function lock() {
    if (!vault.isUnlocked()) return;
    // Close popups first (closing the profile popup may save the name)…
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    try {
        document.querySelectorAll(':popover-open').forEach((p) => p.hidePopover());
    } catch { /* older browsers */ }
    // …then finish all encrypted saves before forgetting the key.
    let pending;
    do {
        pending = flush();
        await pending;
    } while (pending !== flush()); // saves queued while we waited are finished too
    if (!vault.isUnlocked()) return; // already locked by another call meanwhile
    vault.lock();
    closeSession();
    handlers.onLock();
    showLogin();
}

// Auto-lock after the app has been in the background for the chosen time.
let hiddenAt = 0;

function checkAutoLock() {
    const minutes = getAutoLock();
    if (vault.isUnlocked() && minutes > 0 && hiddenAt && Date.now() - hiddenAt >= minutes * 60_000) lock();
}

document.addEventListener('visibilitychange', () => {
    if (!vault.isUnlocked()) return;
    if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        if (getAutoLock() === 0) lock();
    } else {
        checkAutoLock();
    }
});

window.addEventListener('pageshow', (e) => {
    if (e.persisted) checkAutoLock(); // restored from the back/forward cache
});

// ---- Start ------------------------------------------------------------------------

export async function initAuth(h) {
    handlers = h;
    setExternalLockHandler(lock);
    if (!vault.cryptoAvailable()) {
        showScreen(`
            <h1>Secure connection needed</h1>
            <p class="muted">Budget Tracker encrypts your data, which browsers only allow on secure (https) pages.
            Open it from its https:// address, or from http://localhost when developing.</p>`);
        return;
    }
    await vault.init();
    if (vault.hasAccount()) showLogin();
    else showRegister();
}
