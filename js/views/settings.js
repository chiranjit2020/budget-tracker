import { getState, addCategory, removeCategory, clearAll, changePassword, setRecurringActive, deleteRecurring, updateRecurring, removeFavorite, updateFavorite, MAX_FAVORITES, METHODS, METHOD_LABELS } from '../store.js';
import { downloadBackup, downloadCSV, importFile } from '../backup.js';
import { lock, getAutoLock, setAutoLock, AUTOLOCK_OPTIONS, MIN_PASSWORD } from '../auth.js';
import { passwordProblem } from '../passwords.js';
import { esc, money, parseAmount, toDate, fmtDate, fmtTime, nowLocal, toLocalString } from '../format.js';
import { icon, toast, confirmDialog, askPassword, skipNextOf } from '../ui.js';
import * as vault from '../vault.js';
import { biometricSupported, biometricEnabled, enableBiometric, disableBiometric } from '../biometric.js';
import { canInstall, promptInstall, isStandalone, isIOS, storagePersisted, requestPersistentStorage } from '../pwa.js';
import { themeSwitchHTML } from '../theme.js';
import { soundsOn, setSoundsOn, playUnlockChime } from '../sound.js';
import { repeatProgress } from '../upcoming.js';

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

let editingFav = null; // id of the favourite being edited inline
let editingRule = null; // id of the repeat being edited inline

/** "Paid with" / "Received in" choice for the inline editors ('' = not set). */
function methodSelect(type, current) {
    return `<label class="field"><span>${type === 'income' ? 'Received in' : 'Paid with'}</span><select name="method">
        ${['', ...METHODS].map((m) => `<option value="${m}"${m === (current ?? '') ? ' selected' : ''}>${METHOD_LABELS[m]}</option>`).join('')}
    </select></label>`;
}

/** Category list for an editor, keeping a category that was removed from Settings. */
const categoryOptions = (categories, type, current) =>
    (categories[type].includes(current) ? categories[type] : [...categories[type], current])
        .map((c) => `<option${c === current ? ' selected' : ''}>${esc(c)}</option>`).join('');

function ruleEditor(r, categories) {
    return `
                <li class="fav-item is-editing">
                    <form class="fav-edit rec-edit" data-rule-id="${esc(r.id)}" novalidate>
                        <label class="field"><span>Name</span><input name="note" maxlength="200" value="${esc(r.note)}" placeholder="${esc(r.category)}" autocomplete="off"></label>
                        <label class="field fav-amount"><span>Amount</span><span class="amount-wrap"><b aria-hidden="true">₹</b><input name="amount" inputmode="decimal" autocomplete="off" value="${plainAmount(r.amount)}"></span></label>
                        <label class="field"><span>Category</span><select name="category">${categoryOptions(categories, r.type, r.category)}</select></label>
                        ${methodSelect(r.type, r.method)}
                        <div class="field rec-end">
                            <label for="rec-end-${esc(r.id)}">Stops</label>
                            <div class="repeat-end-row">
                                <select name="end" id="rec-end-${esc(r.id)}">
                                    <option value=""${r.end ? '' : ' selected'}>Never</option>
                                    <option value="count"${r.end?.type === 'count' ? ' selected' : ''}>After a set number of times</option>
                                    <option value="date"${r.end?.type === 'date' ? ' selected' : ''}>On a date</option>
                                </select>
                                <input name="endCount" type="number" min="1" max="600" step="1" inputmode="numeric" placeholder="e.g. 12" aria-label="How many times in all" value="${r.end?.type === 'count' ? r.end.count : ''}"${r.end?.type === 'count' ? '' : ' hidden'}>
                                <input name="endDate" type="date" aria-label="Last date" value="${r.end?.type === 'date' ? r.end.date : ''}"${r.end?.type === 'date' ? '' : ' hidden'}>
                            </div>
                            <small class="muted">${r.end?.type === 'count' || r.done ? `${r.done || 'None'} added so far.` : ''}</small>
                        </div>
                        <label class="check-field rec-ask">
                            <input type="checkbox" name="askEach"${r.ask ? ' checked' : ''}>
                            <span>Ask me the amount each time <small>For bills that change. When it's due, the dashboard asks instead of adding ${money(r.amount)}.</small></span>
                        </label>
                        <p class="rec-edit-note">${r.finished ? 'It has finished: give it a later end to carry on.' : r.active ? `Changes apply from the next one, on ${fmtDate(r.next)}.` : 'Changes apply when you resume it.'} Entries already added stay as they are.</p>
                        <p class="field-error" role="alert" hidden></p>
                        <div class="btn-row">
                            <button type="submit" class="btn btn-primary btn-sm">Save</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-rec-cancel>Cancel</button>
                        </div>
                    </form>
                </li>`;
}

const plainAmount = (paise) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

function favoriteEditor(f, categories) {
    const cats = categories[f.type].includes(f.category) ? categories[f.type] : [...categories[f.type], f.category];
    return `
                <li class="fav-item is-editing">
                    <form class="fav-edit" data-fav-id="${esc(f.id)}" novalidate>
                        <label class="field"><span>Name</span><input name="note" maxlength="200" value="${esc(f.note)}" placeholder="${esc(f.category)}" autocomplete="off"></label>
                        <label class="field fav-amount"><span>Amount</span><span class="amount-wrap"><b aria-hidden="true">₹</b><input name="amount" inputmode="decimal" autocomplete="off" value="${plainAmount(f.amount)}"></span></label>
                        <label class="field"><span>Category</span><select name="category">${cats.map((c) => `<option${c === f.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
                        ${methodSelect(f.type, f.method)}
                        <p class="field-error" role="alert" hidden></p>
                        <div class="btn-row">
                            <button type="submit" class="btn btn-primary btn-sm">Save</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-fav-cancel>Cancel</button>
                        </div>
                    </form>
                </li>`;
}

function favoritesPanel(favorites, categories) {
    return `
        <section class="panel" id="favourites-panel">
            <h2>Quick-add favourites</h2>
            ${favorites.length
                ? `<p class="muted">One tap on the dashboard adds these with the current date and time. Use the pencil button to change a price. ${favorites.length} of ${MAX_FAVORITES} used.</p>
            <ul class="fav-list">
                ${favorites
                    .map((f) =>
                        f.id === editingFav
                            ? favoriteEditor(f, categories)
                            : `
                <li class="fav-item">
                    <span class="tx-icon ${f.type}">${icon('star')}</span>
                    <span class="rec-main"><strong>${esc(f.note || f.category)}</strong><small><span class="${f.type}">${f.type === 'income' ? '+' : '−'} ${money(f.amount)}</span> · ${esc(f.category)}${f.method ? ` · ${METHOD_LABELS[f.method]}` : ''}</small></span>
                    <span class="rec-actions">
                        <button type="button" class="icon-btn" data-fav-edit="${esc(f.id)}" aria-label="Edit ${esc(f.note || f.category)}">${icon('edit')}</button>
                        <button type="button" class="icon-btn icon-btn-danger" data-fav-remove="${esc(f.id)}" aria-label="Remove ${esc(f.note || f.category)} from quick add">${icon('trash')}</button>
                    </span>
                </li>`,
                    )
                    .join('')}
            </ul>`
                : `<p class="muted">No favourites yet. When adding a transaction, tick <strong>“Save as a quick-add favourite”</strong> and it will appear on the dashboard for one-tap adding.</p>`}
        </section>`;
}


function recurringPanel(rules, categories) {
    const list = [...rules].sort((a, b) => Number(b.active) - Number(a.active) || a.next.localeCompare(b.next));
    return `
        <section class="panel">
            <h2>Repeats</h2>
            ${list.length
                ? `<p class="muted">Added automatically when they're due. Stopping one keeps the entries already added.</p>
            <ul class="rec-list">
                ${list
                    .map((r) =>
                        r.id === editingRule
                            ? ruleEditor(r, categories)
                            : `
                <li class="rec-item${r.active ? '' : ' is-paused'}${r.finished ? ' is-finished' : ''}">
                    <span class="tx-icon ${r.type}">${icon('repeat')}</span>
                    <span class="rec-main">
                        <strong>${esc(r.note || r.category)}</strong>
                        <small><span class="${r.type}">${r.type === 'income' ? '+' : '−'} ${money(r.amount)}</span> · ${scheduleText(r)}${r.method ? ` · ${METHOD_LABELS[r.method]}` : ''}</small>
                        <small>${[r.finished ? '' : r.active ? `Next: ${fmtDate(r.next)}${r.ask && r.next <= nowLocal().slice(0, 10) ? '' : ` <button type="button" class="link rec-skip" data-skip-next="${esc(r.id)}" aria-label="Skip ${esc(r.note || r.category)} on ${fmtDate(r.next)}">Skip</button>`}` : 'Paused', r.ask && !r.finished ? 'Asks for the amount' : '', repeatProgress(r)].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span class="rec-actions">
                        <button type="button" class="icon-btn" data-rec-edit="${esc(r.id)}" aria-label="Change ${esc(r.note || r.category)}">${icon('edit')}</button>
                        ${r.finished ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-rec-toggle="${esc(r.id)}">${r.active ? 'Pause' : 'Resume'}</button>`}
                        <button type="button" class="icon-btn" data-rec-delete="${esc(r.id)}" aria-label="${r.finished ? 'Remove' : 'Stop repeating'} ${esc(r.note || r.category)}">${icon('trash')}</button>
                    </span>
                </li>`,
                    )
                    .join('')}
            </ul>`
                : `<p class="muted">Nothing repeats yet. When you add a transaction, choose <strong>Repeat</strong> (every week, month or year), e.g. rent, salary, SIPs, EMIs or subscriptions, and it will be added automatically.</p>`}
        </section>`;
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

export function render(root, ctx = {}) {
    if (ctx.entered) {
        editingFav = null;
        editingRule = null;
    }
    const { profile, categories, transactions, lastBackup, recurring, favorites } = getState();
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

        ${favoritesPanel(favorites, categories)}

        <section class="panel">
            <h2>Security</h2>
            <p class="muted">Your data is encrypted on this device with your password. Nobody can open the app without it.</p>
            <label class="field">
                <span>Auto-lock</span>
                <select id="autolock">
                    ${AUTOLOCK_OPTIONS.map(([m, label]) => `<option value="${m}"${m === getAutoLock() ? ' selected' : ''}>${label}</option>`).join('')}
                </select>
            </label>
            <div class="bio-row" id="bio-row" hidden>
                <span class="bio-icon" aria-hidden="true">${icon('fingerprint')}</span>
                <span class="bio-text"><strong>Fingerprint or face unlock</strong><small id="bio-status"></small></span>
                <button type="button" class="btn btn-ghost btn-sm" id="bio-toggle"></button>
            </div>
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

        <section class="panel">
            <h2>Appearance</h2>
            <p class="muted">Auto follows your phone or computer's light/dark setting.</p>
            ${themeSwitchHTML(icon)}
            <label class="check-field sound-field">
                <input type="checkbox" id="sound-toggle"${soundsOn() ? ' checked' : ''} />
                <span>Play a soft chime when you unlock <small>Only on this device. Your phone's silent mode also mutes it.</small></span>
            </label>
        </section>
      </div>

      <div class="settings-col">
        ${recurringPanel(recurring, categories)}

        <section class="panel">
            <h2>Backup &amp; restore</h2>
            <p class="muted">Your data is stored only in this browser on this device. Nothing is uploaded anywhere.
            Export a backup regularly, and use it to move your data to another phone or computer.</p>
            <ul class="backup-facts">
                <li>${icon('lock')}<span><strong>Backups are encrypted</strong> with your password. To restore one, you'll need the password you had when you made it.</span></li>
                <li>${icon('download')}<span><strong>CSV exports are not encrypted.</strong> They're plain spreadsheets for Excel, so keep them private.</span></li>
            </ul>
            ${backupText ? `<p class="backup-status${lastBackup ? '' : ' warn'}">${backupText}</p>` : ''}
            <div class="btn-row">
                <button type="button" class="btn btn-primary" id="export-json" ${transactions.length ? '' : 'disabled'}>${icon('lock')}<span>Export encrypted backup</span></button>
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
            <p class="muted">Permanently removes every transaction, category, budget, repeat, favourite and your profile photo from this device. Your account and password stay.</p>
            <button type="button" class="btn btn-danger" id="clear-all" ${transactions.length || profile.photo ? "" : "disabled"}>Delete all data</button>
        </section>
      </div>
    </div>`;

    if (ctx.entered && location.hash.includes('favourites')) {
        root.querySelector('#favourites-panel')?.scrollIntoView({ block: 'start' });
    }

    // Storage protection status (async).
    const showBiometric = () => {
        const row = root.querySelector('#bio-row');
        if (!row) return;
        const on = biometricEnabled();
        row.querySelector('#bio-status').textContent = on
            ? 'On. You can unlock with your fingerprint or face. Your password still works too.'
            : 'Unlock without typing your password, using your phone’s fingerprint or face check.';
        row.querySelector('#bio-toggle').textContent = on ? 'Turn off' : 'Turn on';
        row.hidden = false;
    };
    biometricSupported().then((ok) => ok && showBiometric());
    root.showBiometric = showBiometric;

    storagePersisted().then((persisted) => {
        const line = root.querySelector('#storage-line');
        if (!line || !navigator.storage?.persist) return;
        line.innerHTML = persisted
            ? 'Storage is protected: the browser will not clear your data to free up space.'
            : 'The browser may clear site data when the device is low on space. <button type="button" class="link-btn" id="persist-btn">Protect my data</button>';
    });

    root.onchange = async (e) => {
        const el = e.target;
        if (el.name === 'end' && el.closest('.rec-edit')) {
            const f = el.closest('.rec-edit');
            f.elements.endCount.hidden = el.value !== 'count';
            f.elements.endDate.hidden = el.value !== 'date';
            (el.value === 'count' ? f.elements.endCount : el.value === 'date' ? f.elements.endDate : el).focus();
            return;
        }
        if (el.id === 'sound-toggle') {
            setSoundsOn(el.checked);
            if (el.checked) playUnlockChime({ force: true }); // let them hear it
            toast(el.checked ? 'Unlock chime on' : 'Unlock chime off');
        } else if (el.id === 'autolock') {
            setAutoLock(Number(el.value));
            toast('Auto-lock updated');
        } else if (el.id === 'import-input' && el.files[0]) {
            const file = el.files[0];
            el.value = '';
            await importFile(file);
        }
    };

    root.onsubmit = async (e) => {
        if (e.target.classList.contains('rec-edit')) {
            e.preventDefault();
            const form = e.target;
            const error = form.querySelector('.field-error');
            const amount = parseAmount(form.elements.amount.value);
            if (amount === null) {
                error.textContent = 'Enter an amount greater than ₹0, like 15000 or 499.50.';
                error.hidden = false;
                form.elements.amount.focus();
                return;
            }
            const current = getState().recurring.find((r) => r.id === form.dataset.ruleId);
            const kind = form.elements.end.value;
            let end = null;
            if (kind === 'count') {
                const count = Number(form.elements.endCount.value);
                if (!Number.isInteger(count) || count < 1 || count > 600) {
                    error.textContent = 'Enter how many times in all, from 1 to 600 (e.g. 12 for a 1-year EMI).';
                    error.hidden = false;
                    form.elements.endCount.focus();
                    return;
                }
                if (count < current.done) {
                    error.textContent = `It has already added ${current.done}, so pick ${current.done} or more.`;
                    error.hidden = false;
                    form.elements.endCount.focus();
                    return;
                }
                end = { type: 'count', count };
            } else if (kind === 'date') {
                if (!form.elements.endDate.value) {
                    error.textContent = 'Pick the last date, or choose Never.';
                    error.hidden = false;
                    form.elements.endDate.focus();
                    return;
                }
                end = { type: 'date', date: form.elements.endDate.value };
            }
            editingRule = null; // close the editor (the save re-renders this page)
            const rule = updateRecurring(form.dataset.ruleId, { note: form.elements.note.value, amount, category: form.elements.category.value, method: form.elements.method.value, end, ask: form.elements.askEach.checked }, nowLocal().slice(0, 10));
            if (!rule) return;
            const name = rule.note || rule.category;
            if (rule.finished && !current.finished) toast(`${name} has now finished: ${repeatProgress(rule)}.`);
            else if (rule.finished) toast(`${name} is still finished. Pick a later end to carry on.`);
            else toast(`${name}: ${money(rule.amount)} from ${fmtDate(rule.next)}${rule.end ? ` · ${repeatProgress(rule)}` : ''}`);
            return;
        }
        if (e.target.classList.contains('fav-edit')) {
            e.preventDefault();
            const form = e.target;
            const error = form.querySelector('.field-error');
            const amount = parseAmount(form.elements.amount.value);
            if (amount === null) {
                error.textContent = 'Enter an amount greater than ₹0, like 25 or 99.50.';
                error.hidden = false;
                form.elements.amount.focus();
                return;
            }
            const id = form.dataset.favId;
            editingFav = null; // close the editor (the save re-renders this page)
            const result = updateFavorite(id, { note: form.elements.note.value, amount, category: form.elements.category.value, method: form.elements.method.value });
            if (result === 'updated') toast(`Quick add updated: ${form.elements.note.value.trim() || form.elements.category.value} ${money(amount)}`);
            else if (result === 'exists') {
                editingFav = id;
                render(root);
                toast('You already have a favourite exactly like that.');
            }
            return;
        }
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
            const problem = passwordProblem(next.value, getState().profile.name);
            if (problem) return fail(problem);
            if (next.value === current.value) return fail('Pick a new password that’s different from the current one.');
            if (next.value !== confirm.value) return fail('The new passwords don’t match.');
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Updating…';
            let ok = false;
            let hadBiometric = false;
            try {
                hadBiometric = biometricEnabled();
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
            root.showBiometric?.(); // a new password switches fingerprint unlock off
            toast(hadBiometric ? 'Password updated. Fingerprint or face unlock was turned off; turn it on again if you want it.' : 'Password updated');
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
        } else if (el.dataset.skipNext) {
            skipNextOf(el.dataset.skipNext);
        } else if (el.dataset.recEdit) {
            editingRule = el.dataset.recEdit;
            render(root);
            root.querySelector('.rec-edit input[name="amount"]')?.focus();
        } else if (el.hasAttribute('data-rec-cancel')) {
            editingRule = null;
            render(root);
        } else if (el.dataset.favEdit) {
            editingFav = el.dataset.favEdit;
            render(root);
            root.querySelector('.fav-edit input[name="amount"]')?.focus();
        } else if (el.hasAttribute('data-fav-cancel')) {
            editingFav = null;
            render(root);
        } else if (el.dataset.favRemove) {
            const fav = getState().favorites.find((x) => x.id === el.dataset.favRemove);
            if (fav && removeFavorite(fav.id)) toast(`Removed “${fav.note || fav.category}” from quick add`);
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
        } else if (el.id === 'bio-toggle') {
            if (biometricEnabled()) {
                disableBiometric();
                toast('Fingerprint or face unlock is off');
                root.showBiometric?.();
                return;
            }
            const rawKey = await askPassword({
                title: 'Turn on fingerprint or face unlock',
                message: 'Enter your password once to confirm. Then your phone will ask for your fingerprint or face.',
                submit: 'Continue',
                verify: (password) => vault.exportRawKey(password),
                wrong: 'That’s not your password. Try again.',
            });
            if (!rawKey) return;
            const result = await enableBiometric(rawKey, getState().profile.name);
            if (result === 'on') toast('Done. Next time, unlock with your fingerprint or face.');
            else if (result === 'unsupported') toast('This phone or browser can’t do fingerprint or face unlock for this app. Your password still works.');
            root.showBiometric?.();
        } else if (el.id === 'lock-now') {
            lock();
        } else if (el.id === 'export-json') {
            await downloadBackup();
        } else if (el.id === 'export-csv') {
            downloadCSV();
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
