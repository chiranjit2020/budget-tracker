// Savings goals on the dashboard: the card, plus the "goal" and "add / withdraw money" dialogs.

import { getState, addGoal, updateGoal, deleteGoal, restoreGoal, moveGoalMoney, removeGoalEntry, restoreGoalEntry } from './store.js';
import { money, moneyWhole, esc, parseAmount, toDecimal, nowLocal, fmtDate } from './format.js';
import { goalProgress, goalSaved, goalHistory, canRemoveEntry } from './goals.js';
import { applyFolds } from './folds.js';
import { icon, toast } from './ui.js';

const today = () => nowLocal().slice(0, 10);

// ---- Dashboard card ---------------------------------------------------------------

const openHistory = new Set(); // goals whose history is showing (kept while the dashboard re-renders)

/** Every add and withdrawal, newest first, with how much was saved after each. */
function historyList(g) {
    const rows = goalHistory(g);
    return `
                    <ol class="goal-history" aria-label="History of ${esc(g.name)}">
                        ${rows
                            .map((r) => {
                                const what = `${r.kind === 'add' ? 'Added' : 'Withdrew'} ${money(Math.abs(r.amount))}`;
                                return `<li class="gh-row ${r.kind}">
                            <span class="gh-date">${fmtDate(r.date)}</span>
                            <span class="gh-what">${what}</span>
                            <span class="gh-bal">${money(r.balance)} saved</span>
                            <button type="button" class="icon-btn gh-remove" data-goal-entry="${esc(g.id)}" data-entry="${esc(r.id)}" aria-label="Remove: ${what} on ${fmtDate(r.date)}">${icon('trash')}</button>
                        </li>`;
                            })
                            .join('')}
                    </ol>`;
}

/** Redraw just the goals card (e.g. after opening a history), keeping its fold button. */
function redrawGoals() {
    const card = document.querySelector('section[data-card="goals"]');
    if (!card) return;
    const parent = card.parentElement;
    card.outerHTML = goalsSection(getState());
    applyFolds(parent);
}

export function goalsSection(state) {
    const head = `<div class="section-head"><h2>Savings goals</h2>${state.goals.length ? '<button type="button" class="link" data-goal-new>+ New goal</button>' : ''}</div>`;
    if (!state.goals.length) {
        return `
        <section class="block">
            ${head}
            <div class="budget-empty">
                <p>Saving up for something, like a trip or an emergency fund? Set a target and watch it fill up.</p>
                <button type="button" class="btn btn-ghost" data-goal-new>${icon('plus')}<span>New goal</span></button>
            </div>
        </section>`;
    }
    const day = today();
    return `
    <section class="block" data-card="goals">
        ${head}
        <ul class="goal-list">
            ${state.goals
                .map((g) => {
                    const p = goalProgress(g, day);
                    return `
                <li class="goal ${p.state}">
                    <div class="goal-top">
                        <button type="button" class="goal-name" data-goal-edit="${esc(g.id)}" aria-label="Edit ${esc(g.name)}">${esc(g.name)}${icon('edit')}</button>
                        <span class="goal-pct">${Math.floor(p.pct)}%</span>
                    </div>
                    <div class="bar" role="progressbar" aria-label="${esc(g.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(p.pct)}"><i style="width:${p.pct.toFixed(1)}%"></i></div>
                    <p class="goal-amt"><strong>${money(p.saved)}</strong> of ${money(g.target)}</p>
                    <p class="goal-pace">${esc(p.pace)}</p>
                    <div class="goal-actions">
                        ${p.state === 'reached' ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-goal-money="${esc(g.id)}" data-dir="add">${icon('plus')}<span>Add money</span></button>`}
                        ${p.saved > 0 ? `<button type="button" class="link" data-goal-money="${esc(g.id)}" data-dir="withdraw">Withdraw</button>` : ''}
                        ${g.entries.length ? `<button type="button" class="link goal-history-toggle" data-goal-history="${esc(g.id)}" aria-expanded="${openHistory.has(g.id)}">${openHistory.has(g.id) ? 'Hide' : 'Show'} history (${g.entries.length})</button>` : ''}
                    </div>
                    ${openHistory.has(g.id) && g.entries.length ? historyList(g) : ''}
                </li>`;
                })
                .join('')}
        </ul>
    </section>`;
}

// ---- Shared dialog helpers -------------------------------------------------------------

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

// ---- Create / edit a goal ------------------------------------------------------------------

const goalDialog = document.getElementById('goal-dialog');
const goalForm = document.getElementById('goal-form');
const goalError = document.getElementById('goal-error');
const goalDelete = document.getElementById('goal-delete');
let editingGoal = null;
wire(goalDialog);

export function openGoalDialog(id = null) {
    const goal = id && getState().goals.find((g) => g.id === id);
    editingGoal = goal ? goal.id : null;
    goalForm.reset();
    showError(goalError, null, '');
    goalForm.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    document.getElementById('goal-title').textContent = goal ? 'Edit goal' : 'New savings goal';
    document.getElementById('goal-saved-field').hidden = Boolean(goal); // money moves via Add / Withdraw once it exists
    goalDelete.hidden = !goal;
    goalForm.by.min = goal ? '' : today();
    if (goal) {
        goalForm.name.value = goal.name;
        goalForm.elements.target.value = toDecimal(goal.target).replace(/\.00$/, '');
        goalForm.by.value = goal.by;
    }
    goalDialog.showModal();
    goalForm.name.focus();
}

goalForm.addEventListener('input', (e) => {
    e.target.removeAttribute('aria-invalid');
    goalError.hidden = true;
});

goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = goalForm.name.value.trim();
    if (!name) return showError(goalError, goalForm.name, 'Give the goal a name, like “Goa trip”.');
    const target = parseAmount(goalForm.elements.target.value);
    if (target === null) return showError(goalError, goalForm.elements.target, 'Enter a target amount, like 30000.');
    const by = goalForm.by.value;
    if (!editingGoal && by && by < today()) return showError(goalError, goalForm.by, 'Pick a target date from today onwards, or leave it empty.');
    let saved = 0;
    if (!editingGoal && goalForm.saved.value.trim()) {
        saved = parseAmount(goalForm.saved.value);
        if (saved === null) return showError(goalError, goalForm.saved, 'Enter the amount already saved, like 5000, or leave it empty.');
    }

    if (editingGoal) {
        if (!updateGoal(editingGoal, { name, target, by })) return;
        goalDialog.close();
        toast('Goal updated');
    } else {
        const goal = addGoal({ name, target, by, saved }, today());
        if (!goal) return showError(goalError, null, 'Couldn’t add the goal. You can have up to 20.');
        goalDialog.close();
        toast(`Goal “${goal.name}” added`);
    }
});

goalDelete.addEventListener('click', () => {
    const removed = deleteGoal(editingGoal);
    goalDialog.close();
    if (removed) toast(`Goal “${removed.goal.name}” deleted`, { label: 'Undo', run: () => restoreGoal(removed) });
});

// ---- Add or withdraw money ------------------------------------------------------------------

const moneyDialog = document.getElementById('goal-money-dialog');
const moneyForm = document.getElementById('goal-money-form');
const moneyError = document.getElementById('goal-money-error');
const moneyHint = document.getElementById('goal-money-hint');
let moneyGoal = null;
wire(moneyDialog);

function updateMoneyHint() {
    const goal = getState().goals.find((g) => g.id === moneyGoal);
    if (!goal) return;
    const saved = goalSaved(goal);
    const left = Math.max(goal.target - saved, 0);
    moneyHint.textContent = moneyForm.elements.dir.value === 'withdraw'
        ? `${money(saved)} saved, which is the most you can withdraw.`
        : `${money(saved)} saved so far${left ? `; ${moneyWhole(left)} to go` : ''}.`;
}

export function openMoneyDialog(id, dir = 'add') {
    const goal = getState().goals.find((g) => g.id === id);
    if (!goal) return;
    moneyGoal = id;
    moneyForm.reset();
    moneyForm.elements.dir.value = dir;
    document.getElementById('goal-money-title').textContent = goal.name;
    showError(moneyError, moneyForm.amount, '');
    updateMoneyHint();
    moneyDialog.showModal();
    moneyForm.amount.focus();
}

moneyForm.addEventListener('change', (e) => {
    if (e.target.name === 'dir') updateMoneyHint();
});
moneyForm.amount.addEventListener('input', () => showError(moneyError, moneyForm.amount, ''));

moneyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const goal = getState().goals.find((g) => g.id === moneyGoal);
    const amount = parseAmount(moneyForm.amount.value);
    if (!goal) return moneyDialog.close();
    if (amount === null) return showError(moneyError, moneyForm.amount, 'Enter an amount greater than ₹0, like 2000.');
    const withdraw = moneyForm.elements.dir.value === 'withdraw';
    if (withdraw && amount > goalSaved(goal)) return showError(moneyError, moneyForm.amount, `You can withdraw up to ${money(goalSaved(goal))}.`);
    const entry = moveGoalMoney(goal.id, withdraw ? -amount : amount, today());
    if (!entry) return;
    moneyDialog.close();
    const after = goalProgress(getState().goals.find((g) => g.id === goal.id), today());
    const message = withdraw
        ? `Withdrew ${money(amount)} from ${goal.name}`
        : after.state === 'reached' ? `${goal.name}: goal reached!` : `Added ${money(amount)} to ${goal.name}`;
    toast(message, { label: 'Undo', run: () => removeGoalEntry(goal.id, entry.id) });
});

// ---- Buttons anywhere on the page -----------------------------------------------------------

document.addEventListener('click', (e) => {
    if (e.target.closest('[data-goal-new]')) return openGoalDialog();
    const edit = e.target.closest('[data-goal-edit]');
    if (edit) return openGoalDialog(edit.dataset.goalEdit);
    const move = e.target.closest('[data-goal-money]');
    if (move) return openMoneyDialog(move.dataset.goalMoney, move.dataset.dir);
    const history = e.target.closest('[data-goal-history]');
    if (history) {
        const id = history.dataset.goalHistory;
        if (openHistory.has(id)) openHistory.delete(id);
        else openHistory.add(id);
        redrawGoals();
        document.querySelector(`[data-goal-history="${CSS.escape(id)}"]`)?.focus();
        return;
    }
    const remove = e.target.closest('[data-goal-entry]');
    if (remove) {
        const goalId = remove.dataset.goalEntry;
        const goal = getState().goals.find((g) => g.id === goalId);
        if (!goal) return;
        if (!canRemoveEntry(goal, remove.dataset.entry)) {
            toast('Can’t remove this one: a later withdrawal used this money. Remove that withdrawal first.');
            return;
        }
        const removed = removeGoalEntry(goalId, remove.dataset.entry);
        if (removed) {
            const amt = money(Math.abs(removed.entry.amount));
            toast(`Removed: ${removed.entry.amount > 0 ? 'added' : 'withdrew'} ${amt} on ${fmtDate(removed.entry.date)}`, { label: 'Undo', run: () => restoreGoalEntry(goalId, removed) });
        }
    }
});
