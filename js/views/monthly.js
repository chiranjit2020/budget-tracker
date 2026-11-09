import { getState, inMonth, totals } from '../store.js';
import { money, moneyShort, fmtMonth, fmtMonthName, fmtMonthShort, currentMonthKey } from '../format.js';
import { icon } from '../ui.js';

export const title = 'Monthly transaction';

let year = null;

const signed = (n) => `${n < 0 ? '−' : ''}${money(Math.abs(n))}`;

export function render(root, ctx) {
    if (ctx.entered || year === null) year = Number(ctx.month.slice(0, 4));
    const { transactions } = getState();
    const thisMonth = currentMonthKey();

    const rows = Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        return { key, ...totals(inMonth(transactions, key)) };
    });
    const yearTotals = totals(inMonth(transactions, String(year)));
    const activeMonths = rows.filter((r) => r.count).length;
    const max = Math.max(...rows.map((r) => Math.max(r.income, r.expense)), 1);
    const pct = (v) => (v ? Math.max((v / max) * 100, 2) : 0).toFixed(1);

    root.innerHTML = `
    <div class="month-switch year-switch">
        <button type="button" class="icon-btn" data-year="-1" aria-label="Previous year">${icon('chevron-left')}</button>
        <span aria-live="polite">${year}</span>
        <button type="button" class="icon-btn" data-year="1" aria-label="Next year">${icon('chevron-right')}</button>
    </div>

    <div class="stat-row">
        <div class="stat"><small>Income in ${year}</small><strong class="income">${money(yearTotals.income)}</strong></div>
        <div class="stat"><small>Expenses in ${year}</small><strong class="expense">${money(yearTotals.expense)}</strong></div>
        <div class="stat"><small>Net</small><strong class="${yearTotals.net < 0 ? 'expense' : 'net'}">${signed(yearTotals.net)}</strong></div>
        <div class="stat"><small>Average monthly spend</small><strong>${money(activeMonths ? Math.round(yearTotals.expense / activeMonths) : 0)}</strong></div>
    </div>

    <section class="block">
        <div class="section-head">
            <h2>Income vs expenses</h2>
            <div class="legend"><span class="income">Income</span><span class="expense">Expense</span></div>
        </div>
        <div class="year-chart" role="img" aria-label="Bar chart of monthly income and expenses for ${year}; the same figures are in the table below.">
            ${rows
                .map(
                    (r) => `
                <div class="yc-col${r.key === thisMonth ? ' current' : ''}" title="${fmtMonth(r.key)}&#10;Income: ${money(r.income)}&#10;Expense: ${money(r.expense)}">
                    <div class="yc-bars">
                        <i class="income" style="height:${pct(r.income)}%"></i>
                        <i class="expense" style="height:${pct(r.expense)}%"></i>
                    </div>
                    <small>${fmtMonthShort(r.key).slice(0, 3)}</small>
                </div>`,
                )
                .join('')}
        </div>
        <p class="chart-scale muted">Tallest bar = ${moneyShort(max)}</p>
    </section>

    <section class="block">
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Expense</th><th scope="col">Net</th><th scope="col">Saved</th></tr></thead>
                <tbody>
                    ${rows
                        .map((r) => {
                            const saved = r.income ? Math.round((r.net / r.income) * 100) : null;
                            return `
                        <tr class="${r.count ? '' : 'is-empty'}${r.key === thisMonth ? ' is-current' : ''}">
                            <th scope="row"><a href="#/" data-goto-month="${r.key}">${fmtMonthName(r.key)}</a></th>
                            <td class="income">${r.income ? money(r.income) : '—'}</td>
                            <td class="expense">${r.expense ? money(r.expense) : '—'}</td>
                            <td class="${r.net < 0 ? 'expense' : ''}">${r.count ? signed(r.net) : '—'}</td>
                            <td>${saved === null ? '—' : `${saved}%`}</td>
                        </tr>`;
                        })
                        .join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <th scope="row">Total</th>
                        <td class="income">${money(yearTotals.income)}</td>
                        <td class="expense">${money(yearTotals.expense)}</td>
                        <td class="${yearTotals.net < 0 ? 'expense' : ''}">${signed(yearTotals.net)}</td>
                        <td>${yearTotals.income ? `${Math.round((yearTotals.net / yearTotals.income) * 100)}%` : '—'}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        <p class="muted hint">Select a month to open it on the dashboard.</p>
    </section>`;

    root.onclick = (e) => {
        const btn = e.target.closest('[data-year]');
        if (!btn) return;
        year += Number(btn.dataset.year);
        render(root, { ...ctx, entered: false });
    };
}
