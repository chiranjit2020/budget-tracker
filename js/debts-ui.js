// Money given & taken on the dashboard: the card, the record dialog and the "got it back" dialog.

import { getState, addDebt, updateDebt, deleteDebt, restoreDebt, repayDebt, removeRepayment } from './store.js';
import { money, esc, parseAmount, toDecimal, nowLocal } from './format.js';
import { debtStatus, debtTotals, knownPeople, reminderMessage, amt } from './debts.js';
import { icon, toast } from './ui.js';
import { applyFolds } from './folds.js';

const today = () => nowLocal().slice(0, 10);
const DUE_ORDER = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 };
let showSettled = false;

// ---- Dashboard card ---------------------------------------------------------------

function row(d, s) {
    const lent = d.kind === 'lent';
    return `
    <li class="debt ${d.kind} due-${s.due}${s.settled ? ' settled' : ''}">
        <span class="tx-icon ${lent ? 'income' : 'expense'}" aria-hidden="true">${icon(lent ? 'income' : 'expense')}</span>
        <div class="debt-main">
            <button type="button" class="debt-title" data-debt-edit="${esc(d.id)}" aria-label="Edit: ${esc(s.title)}">${esc(s.title)}</button>
            <small class="debt-detail">${esc(s.detail)}</small>
            ${s.settled ? '' : `<div class="debt-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-debt-settle="${esc(d.id)}">${lent ? 'Got it back' : 'I returned it'}</button>
                ${lent ? `<button type="button" class="link" data-debt-remind="${esc(d.id)}">${icon('send')}<span>Remind ${esc(d.person)}</span></button>` : ''}
            </div>`}
        </div>
    </li>`;
}

export function debtsSection(state) {
    const day = today();
    const head = `<div class="section-head"><h2>Given &amp; taken</h2>${state.debts.length ? '<button type="button" class="link" data-debt-new>+ Add</button>' : ''}</div>`;
    if (!state.debts.length) {
        return `
        <section class="block">
            ${head}
            <div class="budget-empty">
                <p>Gave money to a friend, or took some? Note it here so you don’t forget who has to return what.</p>
                <button type="button" class="btn btn-ghost" data-debt-new>${icon('plus')}<span>Add</span></button>
            </div>
        </section>`;
    }
    const withStatus = state.debts.map((d) => ({ d, s: debtStatus(d, day) }));
    const open = withStatus
        .filter((x) => !x.s.settled)
        .sort((a, b) => DUE_ORDER[a.s.due] - DUE_ORDER[b.s.due] || (a.d.due || '9').localeCompare(b.d.due || '9') || b.d.date.localeCompare(a.d.date));
    const settled = withStatus.filter((x) => x.s.settled).sort((a, b) => b.d.date.localeCompare(a.d.date));
    const t = debtTotals(state.debts, day);
    return `
    <section class="block" id="debts-block" data-card="debts">
        ${head}
        <div class="debt-totals">
            <div><small>You will get</small><strong class="income">${money(t.owedToYou)}</strong></div>
            <div><small>You will give</small><strong class="expense">${money(t.youOwe)}</strong></div>
        </div>
        ${open.length ? `<ul class="debt-list">${open.map((x) => row(x.d, x.s)).join('')}</ul>` : '<p class="muted debt-clear">Nothing pending. All money has been returned.</p>'}
        ${settled.length
            ? `<button type="button" class="link debt-toggle" data-debt-toggle aria-expanded="${showSettled}">${showSettled ? 'Hide' : 'Show'} returned (${settled.length})</button>
               ${showSettled ? `<ul class="debt-list">${settled.map((x) => row(x.d, x.s)).join('')}</ul>` : ''}`
            : ''}
    </section>`;
}

// ---- Shared dialog helpers ---------------------------------------------------------------

function wire(dialog) {
    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
    });
}

function showError(el, input, message) {
    el.textContent = message;
    el.hidden = !message;
    if (input) {
        input.toggleAttribute('aria-invalid', Boolean(message));
        if (message) input.focus();
    }
}

// ---- Add / edit a record ------------------------------------------------------------------

const debtDialog = document.getElementById('debt-dialog');
const debtForm = document.getElementById('debt-form');
const debtError = document.getElementById('debt-error');
const debtDelete = document.getElementById('debt-delete');
const f = debtForm.elements;
let editingDebt = null;
wire(debtDialog);

function updatePersonLabel() {
    document.getElementById('debt-person-label').textContent = f.kind.value === 'lent' ? 'Given to' : 'Taken from';
}

export function openDebtDialog(id = null) {
    const debt = id && getState().debts.find((x) => x.id === id);
    editingDebt = debt ? debt.id : null;
    debtForm.reset();
    showError(debtError, null, '');
    debtForm.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    document.getElementById('debt-people').innerHTML = knownPeople(getState().debts).map((p) => `<option value="${esc(p)}"></option>`).join('');
    document.getElementById('debt-title').textContent = debt ? 'Edit' : 'Money given or taken';
    debtDelete.hidden = !debt;
    f.kind.value = debt?.kind ?? 'lent';
    f.person.value = debt?.person ?? '';
    f.amount.value = debt ? toDecimal(debt.amount).replace(/\.00$/, '') : '';
    f.date.value = debt?.date ?? today();
    f.due.value = debt?.due ?? '';
    f.note.value = debt?.note ?? '';
    updatePersonLabel();
    debtDialog.showModal();
    (debt ? f.amount : f.person).focus();
}

debtForm.addEventListener('change', (e) => {
    if (e.target.name === 'kind') updatePersonLabel();
});
debtForm.addEventListener('input', (e) => {
    e.target.removeAttribute('aria-invalid');
    debtError.hidden = true;
});

debtForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const person = f.person.value.trim();
    if (!person) return showError(debtError, f.person, 'Enter a name, like “Rahul”.');
    const amount = parseAmount(f.amount.value);
    if (amount === null) return showError(debtError, f.amount, 'Enter an amount greater than ₹0, like 500.');
    const date = f.date.value || today();
    const due = f.due.value;
    if (due && due < date) return showError(debtError, f.due, 'The return date can’t be before the day the money was given.');
    const data = { kind: f.kind.value, person, amount, date, due, note: f.note.value };

    if (editingDebt) {
        const current = getState().debts.find((x) => x.id === editingDebt);
        const repaid = current ? debtStatus(current, today()).repaid : 0;
        if (amount < repaid) return showError(debtError, f.amount, `${money(repaid)} has already been returned, so the amount can’t be less than that.`);
        if (!updateDebt(editingDebt, data)) return;
        debtDialog.close();
        toast('Saved');
    } else {
        const debt = addDebt(data);
        if (!debt) return;
        debtDialog.close();
        toast(debtStatus(debt, today()).title);
    }
});

debtDelete.addEventListener('click', () => {
    const removed = deleteDebt(editingDebt);
    debtDialog.close();
    if (removed) toast('Deleted', { label: 'Undo', run: () => restoreDebt(removed) });
});

// ---- Got it back / I returned it ------------------------------------------------------------------------------

const settleDialog = document.getElementById('settle-dialog');
const settleForm = document.getElementById('settle-form');
const settleError = document.getElementById('settle-error');
let settling = null;
wire(settleDialog);

export function openSettleDialog(id) {
    const debt = getState().debts.find((x) => x.id === id);
    if (!debt) return;
    const s = debtStatus(debt, today());
    settling = id;
    settleForm.reset();
    showError(settleError, settleForm.elements.amount, '');
    const lent = debt.kind === 'lent';
    document.getElementById('settle-title').textContent = lent ? `Money you got back from ${debt.person}` : `Money you returned to ${debt.person}`;
    document.getElementById('settle-label').textContent = 'How much?';
    document.getElementById('settle-hint').textContent = `${amt(s.remaining)} is still left. If only part of it came back, change the amount.`;
    settleForm.elements.amount.value = toDecimal(s.remaining).replace(/\.00$/, '');
    settleDialog.showModal();
    settleForm.elements.amount.select();
}

settleForm.elements.amount.addEventListener('input', () => showError(settleError, settleForm.elements.amount, ''));

settleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const debt = getState().debts.find((x) => x.id === settling);
    if (!debt) return settleDialog.close();
    const { remaining } = debtStatus(debt, today());
    const input = settleForm.elements.amount;
    const amount = parseAmount(input.value);
    if (amount === null) return showError(settleError, input, 'Enter an amount greater than ₹0.');
    if (amount > remaining) return showError(settleError, input, `Only ${money(remaining)} is left.`);
    const entry = repayDebt(debt.id, amount, today());
    if (!entry) return;
    settleDialog.close();
    const after = debtStatus(getState().debts.find((x) => x.id === debt.id), today());
    toast(after.settled ? (debt.kind === 'lent' ? `${debt.person} returned everything` : `All returned to ${debt.person}`) : after.title, { label: 'Undo', run: () => removeRepayment(debt.id, entry.id) });
});

// ---- Reminder: the share sheet on phones, the clipboard elsewhere -------------------------------

async function remind(id) {
    const debt = getState().debts.find((x) => x.id === id);
    if (!debt) return;
    const text = reminderMessage(debt, today());
    if (navigator.share) {
        try {
            await navigator.share({ text });
            return;
        } catch (err) {
            if (err?.name === 'AbortError') return; // closed the share sheet
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        toast(`Reminder for ${debt.person} copied. Paste it into WhatsApp or a text message.`);
    } catch {
        toast('Couldn’t share or copy the reminder on this device.');
    }
}

// ---- Buttons anywhere on the page --------------------------------------------------------------

document.addEventListener('click', (e) => {
    if (e.target.closest('[data-debt-new]')) return openDebtDialog();
    const edit = e.target.closest('[data-debt-edit]');
    if (edit) return openDebtDialog(edit.dataset.debtEdit);
    const settle = e.target.closest('[data-debt-settle]');
    if (settle) return openSettleDialog(settle.dataset.debtSettle);
    const reminder = e.target.closest('[data-debt-remind]');
    if (reminder) return remind(reminder.dataset.debtRemind);
    const toggle = e.target.closest('[data-debt-toggle]');
    if (toggle) {
        showSettled = !showSettled;
        const block = document.getElementById('debts-block');
        if (block) {
            const parent = block.parentElement;
            block.outerHTML = debtsSection(getState());
            applyFolds(parent);
        }
        document.querySelector('[data-debt-toggle]')?.focus();
    }
});
