// Shared UI pieces: icons, dialogs, toasts and reusable markup.

import { getState, addTx, updateTx, deleteTx, restoreTx, byDay, totals, nextOccurrence, runRecurring } from './store.js';
import { esc, money, parseAmount, toDecimal, nowLocal, fmtDay, fmtTime, fmtMonth, fmtDate } from './format.js';
import { budgetAlert, categorySpent } from './budgets.js';

export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** Colours for category charts, starting with the brand palette. */
export const CHART_COLORS = ['#F0582E', '#3546AB', '#0C145A', '#F2A541', '#2A9D8F', '#8E6FD8', '#E76F96', '#7E8CAC'];

export function avatarHTML(profile) {
    if (profile.photo) return `<img src="${esc(profile.photo)}" alt="">`;
    const initials = profile.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('');
    return `<span>${esc(initials || '₹')}</span>`;
}

export const monthSwitch = (key) => `
    <div class="month-switch">
        <button type="button" class="icon-btn" data-month="-1" aria-label="Previous month">${icon('chevron-left')}</button>
        <span aria-live="polite">${fmtMonth(key)}</span>
        <button type="button" class="icon-btn" data-month="1" aria-label="Next month">${icon('chevron-right')}</button>
    </div>`;

export const emptyState = (message, addType) => `
    <div class="empty">
        ${icon('wallet')}
        <p>${message}</p>
        ${addType !== undefined ? `<button type="button" class="btn btn-primary" data-add="${addType}">${icon('plus')}<span>Add transaction</span></button>` : ''}
    </div>`;

export function txItem(t) {
    const title = t.note || t.category;
    const repeatMark = t.recurringId ? `<span class="tx-repeat" title="Repeats automatically">${icon('repeat')}<span class="sr-only">Repeating,</span></span>` : '';
    const sub = repeatMark + (t.note ? `${esc(t.category)} · ${fmtTime(t.date)}` : fmtTime(t.date));
    const sign = t.type === 'income' ? '+' : '−';
    return `
        <li>
            <button type="button" class="tx-item" data-edit="${esc(t.id)}" aria-label="Edit ${esc(title)}, ${t.type === 'income' ? 'received' : 'spent'} ${money(t.amount)}">
                <span class="tx-icon ${t.type}">${icon(t.type)}</span>
                <span class="tx-main"><strong>${esc(title)}</strong><small>${sub}</small></span>
                <span class="tx-amount ${t.type}">${sign} ${money(t.amount)}</span>
            </button>
        </li>`;
}

/** Transactions grouped under day headings, optionally with each day's totals. */
export function txGroups(list, { dayTotals = false } = {}) {
    return byDay(list)
        .map((g) => {
            let total = '';
            if (dayTotals) {
                const t = totals(g.items);
                const parts = [];
                if (t.expense) parts.push(`<span class="expense">− ${money(t.expense)}</span>`);
                if (t.income) parts.push(`<span class="income">+ ${money(t.income)}</span>`);
                total = `<span class="day-total">${parts.join(' ')}</span>`;
            }
            return `
                <section class="day-group">
                    <h3 class="day-label"><span>${fmtDay(g.day)}</span>${total}</h3>
                    <ul class="tx-list">${g.items.map(txItem).join('')}</ul>
                </section>`;
        })
        .join('');
}

export function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Toast ----------------------------------------------------------------

const toastEl = document.getElementById('toast');
let toastTimer;

function hideToast() {
    toastEl.classList.remove('show');
    if (toastEl.hidePopover && toastEl.matches(':popover-open')) toastEl.hidePopover();
}

/** Short message at the bottom of the screen, with an optional action (e.g. Undo). */
export function toast(message, action) {
    clearTimeout(toastTimer);
    toastEl.replaceChildren();
    const text = document.createElement('span');
    text.textContent = message;
    toastEl.append(text);
    if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
            hideToast();
            action.run();
        });
        toastEl.append(btn);
    }
    if (toastEl.showPopover && !toastEl.matches(':popover-open')) toastEl.showPopover();
    toastEl.classList.add('show');
    toastTimer = setTimeout(hideToast, action ? 6000 : 3000);
}

// ---- Dialogs ----------------------------------------------------------------

/** Close a dialog when its backdrop (outside the form) is clicked. */
function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close('cancel');
    });
}

const confirmEl = document.getElementById('confirm-dialog');
closeOnBackdrop(confirmEl);

export function confirmDialog({ title, message, ok = 'OK', danger = false }) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = message;
    const okBtn = document.getElementById('confirm-ok');
    okBtn.textContent = ok;
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    confirmEl.returnValue = '';
    confirmEl.showModal();
    return new Promise((resolve) => {
        confirmEl.addEventListener('close', () => resolve(confirmEl.returnValue === 'ok'), { once: true });
    });
}

const txDialog = document.getElementById('tx-dialog');
const txForm = document.getElementById('tx-form');
const amountError = document.getElementById('amount-error');
const deleteBtn = document.getElementById('tx-delete');
let editingId = null;

closeOnBackdrop(txDialog);
txDialog.querySelector('[data-close]').addEventListener('click', () => txDialog.close());

function fillCategories(type, selected) {
    const cats = getState().categories[type];
    const list = selected && !cats.includes(selected) ? [...cats, selected] : cats;
    txForm.category.innerHTML = list
        .map((c) => `<option${c === selected ? ' selected' : ''}>${esc(c)}</option>`)
        .join('');
}

function showAmountError(message) {
    amountError.textContent = message;
    amountError.hidden = !message;
    txForm.amount.toggleAttribute('aria-invalid', Boolean(message));
}

export function openTxDialog(tx = null, { type = 'expense' } = {}) {
    editingId = tx?.id ?? null;
    txForm.reset();
    showAmountError('');
    const kind = tx?.type ?? type;
    txForm.type.value = kind;
    fillCategories(kind, tx?.category);
    txForm.amount.value = tx ? toDecimal(tx.amount) : '';
    txForm.date.value = tx?.date ?? nowLocal();
    txForm.note.value = tx?.note ?? '';
    document.getElementById('tx-title').textContent = tx ? 'Edit transaction' : 'Add transaction';
    deleteBtn.hidden = !tx;

    // "Repeat" is offered when adding; an edited entry that belongs to a repeat says so.
    repeatField.hidden = Boolean(tx);
    const rule = tx?.recurringId && getState().recurring.find((r) => r.id === tx.recurringId);
    repeatNote.hidden = !rule;
    if (rule) repeatNote.textContent = `This entry repeats ${FREQ_WORD[rule.freq]}. Changes here affect only this one. Manage repeats in Settings → Recurring.`;
    updateRepeatHint();
    txDialog.showModal();
}

const repeatField = document.getElementById('repeat-field');
const repeatNote = document.getElementById('repeat-note');
const repeatHint = document.getElementById('repeat-hint');
const FREQ_WORD = { weekly: 'every week', monthly: 'every month', yearly: 'every year' };

/** Under the Repeat menu: when the next one will be added. */
function updateRepeatHint() {
    const freq = txForm.repeat.value;
    const date = (txForm.date.value || nowLocal()).slice(0, 10);
    repeatHint.textContent = freq ? `Next one is added automatically on ${fmtDate(nextOccurrence({ freq, start: date }, date))}.` : '';
}

txForm.addEventListener('change', (e) => {
    if (e.target.name === 'type') fillCategories(e.target.value);
    if (e.target.name === 'repeat' || e.target.name === 'date') updateRepeatHint();
});

txForm.amount.addEventListener('input', () => showAmountError(''));

txForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount(txForm.amount.value);
    if (amount === null) {
        showAmountError('Enter an amount greater than ₹0, like 250 or 99.50.');
        txForm.amount.focus();
        return;
    }
    const data = {
        type: txForm.type.value,
        amount,
        category: txForm.category.value,
        note: txForm.note.value,
        date: txForm.date.value || nowLocal(),
    };
    // Category spending before this save (not counting the old version of an edited entry).
    let before = 0;
    if (data.type === 'expense') {
        before = categorySpent(data.category, data.date);
        const old = editingId && getState().transactions.find((t) => t.id === editingId);
        if (old && old.type === 'expense' && old.category === data.category && old.date.slice(0, 7) === data.date.slice(0, 7)) before -= old.amount;
    }
    const repeat = editingId ? '' : txForm.repeat.value;
    const saved = editingId ? updateTx(editingId, data) : addTx(data, { repeat });
    if (!saved) return; // the save-error handler already told the user
    txDialog.close();
    // A repeat that started in the past catches up on the dates already due.
    const caughtUp = repeat ? runRecurring(nowLocal().slice(0, 10)).length : 0;
    const alert = data.type === 'expense' ? budgetAlert(data.category, data.date, before) : null;
    let message = editingId ? 'Transaction updated' : `${data.type === 'income' ? 'Income' : 'Expense'} of ${money(amount)} added`;
    if (repeat) message += `, repeating ${FREQ_WORD[repeat]}${caughtUp ? ` (+${caughtUp} earlier date${caughtUp === 1 ? '' : 's'} filled in)` : ''}`;
    toast(alert ?? message);
});

deleteBtn.addEventListener('click', () => {
    const removed = deleteTx(editingId);
    txDialog.close();
    if (removed) toast('Transaction deleted', { label: 'Undo', run: () => restoreTx(removed) });
});

// ---- Password prompt ------------------------------------------------------------

const pwDialog = document.getElementById('password-dialog');
const pwForm = document.getElementById('pw-dialog-form');
const pwInput = document.getElementById('pw-dialog-input');
const pwError = pwForm.querySelector('.field-error');
const pwSubmit = pwForm.querySelector('button[type="submit"]');
const pwToggle = pwForm.querySelector('.pw-toggle');
let pwVerify = null;
let pwResult = null;

pwToggle.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    pwToggle.textContent = show ? 'Hide' : 'Show';
    pwToggle.setAttribute('aria-pressed', String(show));
    pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
pwForm.querySelector('[data-cancel]').addEventListener('click', () => pwDialog.close());
closeOnBackdrop(pwDialog);

pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pwInput.value) {
        pwError.textContent = 'Enter the password.';
        pwError.hidden = false;
        return;
    }
    pwSubmit.disabled = true;
    const label = pwSubmit.textContent;
    pwSubmit.textContent = 'Checking…';
    let result = null;
    try {
        result = await pwVerify(pwInput.value);
    } catch (err) {
        console.error(err);
    }
    pwSubmit.disabled = false;
    pwSubmit.textContent = label;
    if (result) {
        pwResult = result;
        pwDialog.close();
    } else {
        pwError.textContent = 'That password doesn’t open this file. Try again.';
        pwError.hidden = false;
        pwInput.select();
    }
});

/**
 * Ask for a password. `verify(password)` resolves to a result (truthy) or null
 * for a wrong password; the dialog stays open until it succeeds or is cancelled.
 * Resolves to the result, or null if cancelled.
 */
export function askPassword({ title, message, submit = 'Unlock', verify }) {
    document.getElementById('pw-dialog-title').textContent = title;
    document.getElementById('pw-dialog-msg').textContent = message;
    pwSubmit.textContent = submit;
    pwForm.reset();
    pwInput.type = 'password';
    pwToggle.textContent = 'Show';
    pwError.hidden = true;
    pwVerify = verify;
    pwResult = null;
    pwDialog.showModal();
    pwInput.focus();
    return new Promise((resolve) => {
        pwDialog.addEventListener('close', () => resolve(pwResult), { once: true });
    });
}
