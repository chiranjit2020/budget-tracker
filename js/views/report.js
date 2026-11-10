import { getState, inMonth, totals, byCategory, byMethod, METHOD_LABELS } from '../store.js';
import { money, esc, fmtMonth, fmtDate, fmtTime, nowLocal, leftOver, savedShare } from '../format.js';
import { icon, monthSwitch } from '../ui.js';

export const title = 'Report';


function categoryTable(rows, total, kind, budgets = {}) {
    if (!rows.length) return `<p class="muted">No ${kind} this month.</p>`;
    const showBudget = rows.some((r) => budgets[r.category]);
    const budgetCell = (r) => {
        const limit = budgets[r.category];
        if (!limit) return '<td class="muted">—</td>';
        const diff = limit - r.amount;
        return `<td class="nowrap">${money(limit)}<br><small class="${diff < 0 ? 'over' : 'muted'}">${diff < 0 ? `${money(-diff)} over` : `${money(diff)} left`}</small></td>`;
    };
    return `
    <div class="table-wrap">
        <table class="data-table">
            <thead><tr><th scope="col">Category</th><th scope="col">Entries</th><th scope="col">Amount</th>${showBudget ? '<th scope="col">Budget</th>' : ''}<th scope="col">Share</th></tr></thead>
            <tbody>
                ${rows
                    .map(
                        (r) => `<tr><th scope="row">${esc(r.category)}</th><td>${r.count}</td><td>${money(r.amount)}</td>${showBudget ? budgetCell(r) : ''}<td>${((r.amount / total) * 100).toFixed(1)}%</td></tr>`,
                    )
                    .join('')}
            </tbody>
            <tfoot><tr><th scope="row">Total</th><td>${rows.reduce((n, r) => n + r.count, 0)}</td><td>${money(total)}</td>${showBudget ? '<td></td>' : ''}<td>100%</td></tr></tfoot>
        </table>
    </div>`;
}

/** Spent and received per payment method, side by side. */
function methodTable(list) {
    const spent = new Map(byMethod(list.filter((x) => x.type === 'expense')).map((r) => [r.method, r]));
    const got = new Map(byMethod(list.filter((x) => x.type === 'income')).map((r) => [r.method, r]));
    const methods = [...new Set([...spent.keys(), ...got.keys()])];
    if (!methods.length || (methods.length === 1 && methods[0] === '')) return '<p class="muted">No payment methods recorded this month.</p>';
    const order = ['upi', 'cash', 'card', 'bank', ''];
    methods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const cell = (r) => (r ? `${money(r.amount)}<br><small class="muted">${r.count} ${r.count === 1 ? 'entry' : 'entries'}</small>` : '<span class="muted">—</span>');
    const share = (r, total) => (r && total ? `${((r.amount / total) * 100).toFixed(1)}%` : '<span class="muted">—</span>');
    const totalSpent = [...spent.values()].reduce((n, r) => n + r.amount, 0);
    return `
    <div class="table-wrap">
        <table class="data-table">
            <thead><tr><th scope="col">Method</th><th scope="col">Spent</th><th scope="col">Share</th><th scope="col">Received</th></tr></thead>
            <tbody>
                ${methods.map((m) => `<tr><th scope="row">${METHOD_LABELS[m]}</th><td class="nowrap">${cell(spent.get(m))}</td><td>${share(spent.get(m), totalSpent)}</td><td class="nowrap">${cell(got.get(m))}</td></tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

export function render(root, ctx) {
    const { transactions, profile, budgets } = getState();
    const key = ctx.month;
    const list = inMonth(transactions, key);
    const t = totals(list);
    const chronological = [...list].reverse();

    root.innerHTML = `
    <div class="report-actions no-print">
        ${monthSwitch(key)}
        <button type="button" class="btn btn-primary" id="print-btn">${icon('printer')}<span>Print / Save as PDF</span></button>
    </div>

    <article class="report">
        <header class="report-head">
            <svg class="brand-logo" viewBox="0 0 396.81 497.38" width="40" height="50" aria-hidden="true"><use href="#brand-logo" /></svg>
            <div>
                <h2>Monthly statement · ${fmtMonth(key)}</h2>
                <p class="muted">${profile.name ? `${esc(profile.name)} · ` : ''}Generated ${fmtDate(nowLocal())}</p>
            </div>
        </header>

        <div class="stat-row">
            <div class="stat"><small>Income</small><strong class="income">${money(t.income)}</strong></div>
            <div class="stat"><small>Expenses</small><strong class="expense">${money(t.expense)}</strong></div>
            ${((l) => `<div class="stat"><small>${l.label}</small><strong class="${l.cls}">${l.amount}</strong></div>`)(leftOver(t.net))}
            <div class="stat"><small>Saved from income</small><strong>${savedShare(t.net, t.income)}</strong></div>
        </div>

        <h3>Expenses by category</h3>
        ${categoryTable(byCategory(list.filter((x) => x.type === 'expense')), t.expense, 'expenses', budgets)}

        <h3>Income by category</h3>
        ${categoryTable(byCategory(list.filter((x) => x.type === 'income')), t.income, 'income')}

        <h3>By payment method</h3>
        ${methodTable(list)}

        <h3>All transactions</h3>
        ${chronological.length
            ? `<div class="table-wrap">
            <table class="data-table tx-table">
                <thead><tr><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Note</th><th scope="col">Method</th><th scope="col">Amount</th></tr></thead>
                <tbody>
                    ${chronological
                        .map(
                            (x) => `<tr>
                                <td class="nowrap">${fmtDate(x.date)}<br><small class="muted">${fmtTime(x.date)}</small></td>
                                <td>${esc(x.category)}</td>
                                <td>${esc(x.note) || '<span class="muted">—</span>'}</td>
                                <td>${x.method ? METHOD_LABELS[x.method] : '<span class="muted">—</span>'}</td>
                                <td class="${x.type} nowrap">${x.type === 'income' ? '+' : '−'} ${money(x.amount)}</td>
                            </tr>`,
                        )
                        .join('')}
                </tbody>
            </table>
        </div>`
            : '<p class="muted">No transactions this month.</p>'}
    </article>`;

    root.querySelector('#print-btn').onclick = () => {
        const previous = document.title;
        document.title = `Budget statement ${key}`; // becomes the suggested PDF file name
        window.addEventListener('afterprint', () => (document.title = previous), { once: true });
        window.print();
    };
}
