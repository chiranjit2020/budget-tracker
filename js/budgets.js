// Monthly category budgets: calculations, the dashboard section, the
// "Monthly budgets" form, and alerts when an expense crosses a limit.

import { getState, setBudgets, inMonth } from './store.js';
import { money, moneyWhole, esc, parseAmount, currentMonthKey, shiftMonth, nowLocal } from './format.js';
import { icon, toast } from './ui.js';

const WARN_AT = 80; // % of a budget when it turns amber

const level = (pct) => (pct >= 100 ? 'over' : pct >= WARN_AT ? 'warn' : 'ok');

/** Expense totals per category for one month. */
function spentByCategory(transactions, monthKey) {
    const spent = new Map();
    for (const t of inMonth(transactions, monthKey)) {
        if (t.type === 'expense') spent.set(t.category, (spent.get(t.category) ?? 0) + t.amount);
    }
    return spent;
}

/** Everything the dashboard and report need to show budgets for a month. */
export function budgetSummary(state, monthKey) {
    const spent = spentByCategory(state.transactions, monthKey);
    const rows = Object.entries(state.budgets)
        .map(([category, limit]) => {
            const used = spent.get(category) ?? 0;
            const pct = (used / limit) * 100;
            return { category, limit, spent: used, left: limit - used, pct, level: level(pct) };
        })
        .sort((a, b) => b.pct - a.pct || b.spent - a.spent);

    const limit = rows.reduce((n, r) => n + r.limit, 0);
    const used = rows.reduce((n, r) => n + r.spent, 0);
    let outside = 0;
    for (const [category, amount] of spent) if (!(category in state.budgets)) outside += amount;

    // For the current month: days left including today.
    let daysLeft = 0;
    if (monthKey === currentMonthKey()) {
        const [y, m] = monthKey.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        daysLeft = daysInMonth - Number(nowLocal().slice(8, 10)) + 1;
    }

    const pct = limit ? (used / limit) * 100 : 0;
    return { rows, limit, spent: used, left: limit - used, pct, level: level(pct), outside, daysLeft };
}

const barWidth = (pct) => `${Math.min(pct, 100).toFixed(1)}%`;

function statusText(r) {
    if (r.left < 0) return `${money(-r.left)} over`;
    return `${money(r.left)} left · ${Math.round(r.pct)}%`;
}

/** The "Budgets" section on the dashboard. */
export function budgetSection(state, monthKey) {
    const s = budgetSummary(state, monthKey);
    if (!s.rows.length) {
        return `
        <section class="block">
            <div class="section-head"><h2>Budgets</h2></div>
            <div class="budget-empty">
                <p>Set monthly limits for categories like Food or Shopping and see how much is left at a glance.</p>
                <button type="button" class="btn btn-ghost" data-budgets>${icon('plus')}<span>Set budgets</span></button>
            </div>
        </section>`;
    }

    let note = '';
    if (s.daysLeft && s.left > 0) {
        note = `You can spend <strong>${money(Math.floor(s.left / s.daysLeft))}/day</strong> for the next ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}.`;
    } else if (s.left < 0) {
        note = `<strong>${money(-s.left)}</strong> over your total budget${s.daysLeft ? ` with ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} to go` : ''}.`;
    }

    return `
    <section class="block">
        <div class="section-head">
            <h2>Budgets</h2>
            <button type="button" class="link" data-budgets>Edit budgets</button>
        </div>
        <div class="budget-overall level-${s.level}">
            <div class="bo-top">
                <span><strong>${money(s.spent)}</strong> of ${money(s.limit)}</span>
                <span class="bo-left">${s.left >= 0 ? `${money(s.left)} left` : `${money(-s.left)} over`}</span>
            </div>
            <div class="bar" aria-hidden="true"><i style="width:${barWidth(s.pct)}"></i></div>
            ${note ? `<p class="bo-note">${note}</p>` : ''}
        </div>
        <ul class="budget-list">
            ${s.rows
                .map(
                    (r) => `
            <li class="budget-row level-${r.level}">
                <div class="br-top">
                    <span class="br-name">${esc(r.category)}</span>
                    <span class="br-amt">${money(r.spent)} <small>/ ${money(r.limit)}</small></span>
                </div>
                <div class="bar" aria-hidden="true"><i style="width:${barWidth(r.pct)}"></i></div>
                <small class="br-status">${statusText(r)}</small>
            </li>`,
                )
                .join('')}
        </ul>
        ${s.outside ? `<p class="muted budget-outside">${money(s.outside)} spent in categories without a budget.</p>` : ''}
    </section>`;
}

// ---- Alerts -----------------------------------------------------------------------

/** Spent so far in a category for the month of `date`. */
export function categorySpent(category, date) {
    return spentByCategory(getState().transactions, date.slice(0, 7)).get(category) ?? 0;
}

/**
 * After saving an expense: a toast message if it pushed the category past
 * 80% or past its limit, otherwise null.
 */
export function budgetAlert(category, date, before) {
    const limit = getState().budgets[category];
    if (!limit) return null;
    const after = categorySpent(category, date);
    const pctBefore = (before / limit) * 100;
    const pctAfter = (after / limit) * 100;
    if (pctAfter >= 100 && pctBefore < 100) return `Over budget: ${category} is ${money(after - limit)} over its ${money(limit)} limit.`;
    if (pctAfter >= WARN_AT && pctBefore < WARN_AT) return `Heads up: ${Math.round(pctAfter)}% of your ${category} budget is used.`;
    return null;
}

// ---- "Monthly budgets" form -----------------------------------------------------------

const dialog = document.getElementById('budget-dialog');
const form = document.getElementById('budget-form');
const fields = document.getElementById('budget-fields');
const totalEl = document.getElementById('budget-total');
const errorEl = document.getElementById('budget-error');

const plain = (paise) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

/** Average monthly spend per category over the last 3 complete months that have data. */
function recentAverages(transactions) {
    const thisMonth = currentMonthKey();
    const months = [1, 2, 3].map((n) => shiftMonth(thisMonth, -n)).filter((k) => transactions.some((t) => t.date.startsWith(k)));
    const totals = new Map();
    for (const k of months) {
        for (const [cat, amount] of spentByCategory(transactions, k)) totals.set(cat, (totals.get(cat) ?? 0) + amount);
    }
    return { months: months.length, avg: (cat) => (months.length ? Math.round((totals.get(cat) ?? 0) / months.length) : 0) };
}

function updateTotal() {
    let total = 0;
    for (const input of fields.querySelectorAll('input')) total += parseAmount(input.value) ?? 0;
    totalEl.textContent = money(total);
}

export function openBudgetDialog() {
    const { categories, budgets, transactions } = getState();
    const names = [...categories.expense, ...Object.keys(budgets).filter((c) => !categories.expense.includes(c))];
    const recent = recentAverages(transactions);

    fields.innerHTML = names
        .map((cat, i) => {
            const avg = recent.avg(cat);
            return `
            <div class="budget-field">
                <label for="budget-${i}" class="bf-name">${esc(cat)}${avg ? `<small>Avg ${moneyWhole(avg)}/month</small>` : ''}</label>
                <span class="amount-wrap"><b aria-hidden="true">₹</b>
                    <input id="budget-${i}" data-cat="${esc(cat)}" type="text" inputmode="decimal" autocomplete="off" placeholder="No limit" value="${budgets[cat] ? plain(budgets[cat]) : ''}">
                </span>
            </div>`;
        })
        .join('');
    document.getElementById('budget-hint').textContent = recent.months
        ? `Averages are from your last ${recent.months} month${recent.months === 1 ? '' : 's'}.`
        : '';
    errorEl.hidden = true;
    updateTotal();
    dialog.showModal();
}

form.addEventListener('input', (e) => {
    e.target.removeAttribute('aria-invalid');
    errorEl.hidden = true;
    updateTotal();
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = {};
    let firstBad = null;
    for (const input of fields.querySelectorAll('input')) {
        const raw = input.value.trim();
        if (!raw || /^0+(\.0*)?$/.test(raw)) continue; // empty or 0 = no limit
        const paise = parseAmount(raw);
        if (paise === null) {
            input.setAttribute('aria-invalid', 'true');
            firstBad ??= input;
            continue;
        }
        next[input.dataset.cat] = paise;
    }
    if (firstBad) {
        errorEl.textContent = 'Enter amounts like 5000 or 2500.50, or leave the field empty for no limit.';
        errorEl.hidden = false;
        firstBad.focus();
        return;
    }
    if (setBudgets(next)) {
        dialog.close();
        const n = Object.keys(next).length;
        toast(n ? `Budgets saved for ${n} categor${n === 1 ? 'y' : 'ies'}` : 'Budgets cleared');
    }
});

dialog.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
});

