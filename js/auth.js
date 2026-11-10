// Registration, login, lock and auto-lock.

import * as vault from './vault.js';
import { openSession, closeSession, flush, normalize, setExternalLockHandler } from './store.js';
import { confirmDialog, toast } from './ui.js';
import { esc } from './format.js';

const screen = document.getElementById('auth');
const appEl = document.querySelector('.app');

export const MIN_PASSWORD = 8;

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
    screen.innerHTML = `<div class="auth-card"><img src="images/logo.svg" class="auth-logo" alt="Budget Tracker" width="48" height="60">${html}</div>`;
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
        if (password.length < MIN_PASSWORD) return setError(form, `Use at least ${MIN_PASSWORD} characters for your password.`);
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

let failures = 0;
let lockedUntil = 0;

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
        <button type="button" class="link-btn auth-forgot" id="forgot-btn">Forgot password?</button>`);

    const form = document.getElementById('login-form');
    const input = form.elements.password;
    input.focus();

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
            failures = 0;
            enterApp(data);
            return;
        }
        busy(form, '');
        failures++;
        if (failures >= 5) {
            const seconds = 30 * 2 ** (failures - 5); // 30s, 60s, 120s…
            lockedUntil = Date.now() + seconds * 1000;
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
        failures = 0;
        lockedUntil = 0;
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
