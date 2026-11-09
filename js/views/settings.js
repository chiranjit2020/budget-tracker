import { getState, addCategory, removeCategory, exportBackup, importBackup, markBackedUp, clearAll, changePassword, setRecurringActive, deleteRecurring } from '../store.js';
import { lock, getAutoLock, setAutoLock, AUTOLOCK_OPTIONS, MIN_PASSWORD } from '../auth.js';
import { esc, money, toDecimal, toDate, fmtDate, fmtTime, nowLocal, toLocalString } from '../format.js';
import { icon, toast, confirmDialog, download } from '../ui.js';
import { canInstall, promptInstall, isStandalone, isIOS, storagePersisted, requestPersistentStorage } from '../pwa.js';

export const title = 'Settings';

const TYPE_LABEL = { expense: 'Expense categories', income: 'Income categories' };

const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** "Monthly on the 1st", "Every Friday", "Every year on 15 Mar" */
function scheduleText(r) {
    const start = toDate(r.start);
    if (r.freq === 'weekly') return `Every ${start.toLocaleDateString('en-IN', { weekday: 'long' })}`;
    if (r.freq === 'monthly') return `Monthly on the ${ordinal(start.getDate())}`;
    return `Every year on ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

function recurringPanel(rules) {
    const list = [...rules].sort((a, b) => Number(b.active) - Number(a.active) || a.next.localeCompare(b.next));
    return `
        <section class="panel">
            <h2>Recurring transactions</h2>
            ${list.length
                ? `<p class="muted">Added automatically when they're due. Stopping one keeps the entries already added.</p>
            <ul class="rec-list">
                ${list
                    .map(
                        (r) => `
                <li class="rec-item${r.active ? '' : ' is-paused'}">
                    <span class="tx-icon ${r.type}">${icon('repeat')}</span>
                    <span class="rec-main">
                        <strong>${esc(r.note || r.category)}</strong>
                        <small><span class="${r.type}">${r.type === 'income' ? '+' : '−'} ${money(r.amount)}</span> · ${scheduleText(r)}</small>
                        <small>${r.active ? `Next: ${fmtDate(r.next)}` : 'Paused'}</small>
                    </span>
                    <span class="rec-actions">
                        <button type="button" class="btn btn-ghost btn-sm" data-rec-toggle="${esc(r.id)}">${r.active ? 'Pause' : 'Resume'}</button>
                        <button type="button" class="icon-btn" data-rec-delete="${esc(r.id)}" aria-label="Stop repeating ${esc(r.note || r.category)}">${icon('trash')}</button>
                    </span>
                </li>`,
                    )
                    .join('')}
            </ul>`
                : `<p class="muted">Nothing repeats yet. When you add a transaction, choose <strong>Repeat</strong> (every week, month or year), e.g. rent, salary, SIPs, EMIs or subscriptions, and it will be added automatically.</p>`}
        </section>`;
}

function csvCell(value) {
    let s = String(value);
    const isNumber = /^-?\d+(\.\d+)?$/.test(s);
    if (!isNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets treating text as a formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCSV(transactions) {
    const rows = [['Date', 'Time', 'Type', 'Category', 'Note', 'Amount (INR)']];
    for (const t of [...transactions].reverse()) {
        rows.push([t.date.slice(0, 10), t.date.slice(11, 16), t.type === 'income' ? 'Income' : 'Expense', t.category, t.note, (t.type === 'income' ? '' : '-') + toDecimal(t.amount)]);
    }
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); // BOM so Excel reads ₹ and UTF-8 correctly
}

function installSection() {
    if (isStandalone()) return '<p class="muted">Budget Tracker is installed on this device. It works offline.</p>';
    if (canInstall()) {
        return `<p class="muted">Install Budget Tracker to open it from your home screen or desktop like a normal app. It works offline.</p>
                <button type="button" class="btn btn-primary" id="install-btn">${icon('download')}<span>Install app</span></button>`;
    }
    if (isIOS()) {
        return '<p class="muted">To install on iPhone or iPad: open this page in Safari, tap the <strong>Share</strong> button, then choose <strong>Add to Home Screen</strong>.</p>';
    }
    return '<p class="muted">Use your browser menu’s <strong>Install app</strong> or <strong>Add to Home screen</strong> option to install Budget Tracker. It works offline.</p>';
}

export function render(root) {
    const { profile, categories, transactions, lastBackup, recurring } = getState();
    const backupText = lastBackup
        ? `Last backup: ${fmtDate(toLocalString(new Date(lastBackup)))} at ${fmtTime(toLocalString(new Date(lastBackup)))}`
        : transactions.length ? 'You have not made a backup yet.' : '';

    root.innerHTML = `
    <div class="settings">
      <div class="settings-col">
        <section class="panel">
            <h2>Categories</h2>
            <p class="muted">Removing a category does not change transactions that already use it.</p>
            <div class="cat-columns">
                ${['expense', 'income']
                    .map(
                        (type) => `
                <div>
                    <h3>${TYPE_LABEL[type]}</h3>
                    <ul class="chips">
                        ${categories[type]
                            .map(
                                (c) => `<li class="chip"><span>${esc(c)}</span>${
                                    categories[type].length > 1
                                        ? `<button type="button" data-remove-cat="${type}" data-name="${esc(c)}" aria-label="Remove ${esc(c)}">${icon('x')}</button>`
                                        : ''
                                }</li>`,
                            )
                            .join('')}
                    </ul>
                    <form class="add-cat" data-type="${type}">
                        <label class="sr-only" for="new-cat-${type}">New ${type} category</label>
                        <input id="new-cat-${type}" name="name" maxlength="40" placeholder="New category" autocomplete="off" required>
                        <button class="btn btn-ghost">${icon('plus')}<span>Add</span></button>
                    </form>
                </div>`,
                    )
                    .join('')}
            </div>
        </section>

        <section class="panel">
            <h2>Security</h2>
            <p class="muted">Your data is encrypted on this device with your password. Nobody can open the app without it.</p>
            <label class="field">
                <span>Auto-lock</span>
                <select id="autolock">
                    ${AUTOLOCK_OPTIONS.map(([m, label]) => `<option value="${m}"${m === getAutoLock() ? ' selected' : ''}>${label}</option>`).join('')}
                </select>
            </label>
            <details class="pw-change">
                <summary>Change password</summary>
                <form id="pw-form" novalidate>
                    <input type="text" autocomplete="username" value="${esc(profile.name)}" class="sr-only" tabindex="-1" aria-hidden="true">
                    <label class="field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required></label>
                    <label class="field"><span>New password <small>(at least ${MIN_PASSWORD} characters)</small></span><input name="next" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
                    <label class="field"><span>Confirm new password</span><input name="confirm" type="password" autocomplete="new-password" required></label>
                    <p class="field-error" role="alert" hidden></p>
                    <button type="submit" class="btn btn-primary">Update password</button>
                </form>
            </details>
            <button type="button" class="btn btn-ghost" id="lock-now">${icon('lock')}<span>Lock now</span></button>
        </section>
      </div>

      <div class="settings-col">
        ${recurringPanel(recurring)}

        <section class="panel">
            <h2>Backup &amp; restore</h2>
            <p class="muted">Your data is stored only in this browser on this device. Nothing is uploaded anywhere.
            Export a backup regularly, and use it to move your data to another phone or computer.
            Backup files are <strong>not</strong> password-protected, so keep them somewhere private.</p>
            ${backupText ? `<p class="backup-status${lastBackup ? '' : ' warn'}">${backupText}</p>` : ''}
            <div class="btn-row">
                <button type="button" class="btn btn-primary" id="export-json" ${transactions.length ? '' : 'disabled'}>${icon('download')}<span>Export backup</span></button>
                <button type="button" class="btn btn-ghost" id="export-csv" ${transactions.length ? '' : 'disabled'}>${icon('download')}<span>Export CSV (Excel)</span></button>
                <label class="btn btn-ghost file-btn">${icon('upload')}<span>Import backup</span>
                    <input type="file" accept=".json,application/json" id="import-input" class="sr-only">
                </label>
            </div>
        </section>

        <section class="panel">
            <h2>App</h2>
            ${installSection()}
            <p class="muted storage-line" id="storage-line"></p>
        </section>

        <section class="panel panel-danger">
            <h2>Delete all data</h2>
            <p class="muted">Permanently removes every transaction, category, budget, repeat and your profile photo from this device. Your account and password stay.</p>
            <button type="button" class="btn btn-danger" id="clear-all" ${transactions.length || profile.photo ? "" : "disabled"}>Delete all data</button>
        </section>
      </div>
    </div>`;

    // Storage protection status (async).
    storagePersisted().then((persisted) => {
        const line = root.querySelector('#storage-line');
        if (!line || !navigator.storage?.persist) return;
        line.innerHTML = persisted
            ? 'Storage is protected: the browser will not clear your data to free up space.'
            : 'The browser may clear site data when the device is low on space. <button type="button" class="link-btn" id="persist-btn">Protect my data</button>';
    });

    root.onchange = async (e) => {
        const el = e.target;
        if (el.id === 'autolock') {
            setAutoLock(Number(el.value));
            toast('Auto-lock updated');
        } else if (el.id === 'import-input' && el.files[0]) {
            const file = el.files[0];
            el.value = '';
            let data;
            try {
                data = JSON.parse(await file.text());
            } catch {
                toast('That file is not a valid backup (.json).');
                return;
            }
            const count = Array.isArray(data?.transactions) ? data.transactions.length : 0;
            const ok = await confirmDialog({
                title: 'Import backup?',
                message: `The file contains ${count} transaction${count === 1 ? '' : 's'}. They will be added to your current data; transactions you already have are skipped.`,
                ok: 'Import',
            });
            if (!ok) return;
            try {
                const added = importBackup(data);
                if (added !== null) toast(`Imported ${added} new transaction${added === 1 ? '' : 's'}`);
            } catch (err) {
                toast(err.message);
            }
        }
    };

    root.onsubmit = async (e) => {
        if (e.target.id === 'pw-form') {
            e.preventDefault();
            const form = e.target;
            const { current, next, confirm } = form.elements;
            const error = form.querySelector('.field-error');
            const fail = (msg) => {
                error.textContent = msg;
                error.hidden = false;
            };
            if (!current.value) return fail('Enter your current password.');
            if (next.value.length < MIN_PASSWORD) return fail(`Use at least ${MIN_PASSWORD} characters for the new password.`);
            if (next.value !== confirm.value) return fail('The new passwords don’t match.');
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Updating…';
            let ok = false;
            try {
                ok = await changePassword(current.value, next.value);
            } catch (err) {
                console.error(err);
                btn.disabled = false;
                btn.textContent = 'Update password';
                return fail('Could not update the password. Browser storage may be full.');
            }
            btn.disabled = false;
            btn.textContent = 'Update password';
            if (!ok) {
                current.select();
                return fail('Your current password is wrong.');
            }
            form.reset();
            error.hidden = true;
            form.closest('details').open = false;
            toast('Password updated');
            return;
        }

        const form = e.target.closest('.add-cat');
        if (!form) return;
        e.preventDefault();
        const name = form.elements.name.value;
        if (addCategory(form.dataset.type, name)) {
            toast(`Category “${name.trim()}” added`);
            root.querySelector(`#new-cat-${form.dataset.type}`)?.focus();
        } else if (name.trim()) {
            toast('That category already exists.');
        }
    };

    root.onclick = async (e) => {
        const el = e.target.closest('button');
        if (!el) return;
        if (el.dataset.removeCat) {
            const type = el.dataset.removeCat;
            const name = el.dataset.name;
            const used = getState().transactions.filter((t) => t.type === type && t.category === name).length;
            if (used) {
                const ok = await confirmDialog({
                    title: `Remove “${name}”?`,
                    message: `${used} transaction${used === 1 ? '' : 's'} use this category. They will keep it, but you won’t be able to pick it for new ones.`,
                    ok: 'Remove',
                });
                if (!ok) return;
            }
            removeCategory(type, name);
        } else if (el.dataset.recToggle) {
            const rule = getState().recurring.find((r) => r.id === el.dataset.recToggle);
            if (!rule) return;
            setRecurringActive(rule.id, !rule.active, nowLocal().slice(0, 10));
            toast(rule.active ? `Paused “${rule.note || rule.category}”` : `Resumed “${rule.note || rule.category}”`);
        } else if (el.dataset.recDelete) {
            const rule = getState().recurring.find((r) => r.id === el.dataset.recDelete);
            if (!rule) return;
            const ok = await confirmDialog({
                title: `Stop repeating “${rule.note || rule.category}”?`,
                message: 'No new entries will be added. Transactions it already added stay in your history.',
                ok: 'Stop repeating',
                danger: true,
            });
            if (ok && deleteRecurring(rule.id)) toast('Repeat stopped');
        } else if (el.id === 'lock-now') {
            lock();
        } else if (el.id === 'export-json') {
            download(`budget-tracker-backup-${nowLocal().slice(0, 10)}.json`, JSON.stringify(exportBackup(), null, 2), 'application/json');
            markBackedUp();
            toast('Backup downloaded');
        } else if (el.id === 'export-csv') {
            download(`budget-tracker-${nowLocal().slice(0, 10)}.csv`, buildCSV(getState().transactions), 'text/csv;charset=utf-8');
        } else if (el.id === 'install-btn') {
            await promptInstall();
        } else if (el.id === 'persist-btn') {
            const granted = await requestPersistentStorage();
            toast(granted ? 'Storage protected' : 'The browser declined. Installing the app usually allows it.');
            if (granted) render(root);
        } else if (el.id === 'clear-all') {
            const ok = await confirmDialog({
                title: 'Delete all data?',
                message: 'This permanently deletes all your transactions, categories and profile from this device. Export a backup first if you might need it.',
                ok: 'Delete everything',
                danger: true,
            });
            if (ok && clearAll()) toast('All data deleted');
        }
    };
}
