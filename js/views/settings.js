import { getState, addCategory, removeCategory, exportBackup, importBackup, markBackedUp, clearAll } from '../store.js';
import { esc, toDecimal, fmtDate, fmtTime, nowLocal, toLocalString } from '../format.js';
import { icon, toast, confirmDialog, download } from '../ui.js';
import { canInstall, promptInstall, isStandalone, isIOS, storagePersisted, requestPersistentStorage } from '../pwa.js';

export const title = 'Settings';

const TYPE_LABEL = { expense: 'Expense categories', income: 'Income categories' };

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
    const { profile, categories, transactions, lastBackup } = getState();
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
      </div>

      <div class="settings-col">
        <section class="panel">
            <h2>Backup &amp; restore</h2>
            <p class="muted">Your data is stored only in this browser on this device. Nothing is uploaded anywhere.
            Export a backup regularly, and use it to move your data to another phone or computer.</p>
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
            <p class="muted">Permanently removes every transaction, category and your profile from this device.</p>
            <button type="button" class="btn btn-danger" id="clear-all" ${transactions.length || profile.name ? '' : 'disabled'}>Delete all data</button>
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
        if (el.id === 'import-input' && el.files[0]) {
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

    root.onsubmit = (e) => {
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
