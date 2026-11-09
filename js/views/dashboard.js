import { getState, inMonth, totals, byCategory } from '../store.js';
import { money, moneyWhole, esc, fmtMonth, fmtMonthShort, shiftMonth } from '../format.js';
import { icon, monthSwitch, txGroups, emptyState, CHART_COLORS } from '../ui.js';
import { budgetSection } from '../budgets.js';
import { backupReminder } from '../backup.js';

export const title = 'Overview';

const RECENT_LIMIT = 8;
const TOP_CATEGORIES = 5;

function change(cur, prev, prevKey) {
    if (!prev) return cur ? 'Nothing last month' : '&nbsp;';
    const pct = ((cur - prev) / prev) * 100;
    const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
    return `${sign}${Math.abs(pct).toFixed(1)}% vs ${fmtMonthShort(prevKey)}`;
}

function miniBars(series, field) {
    const max = Math.max(...series.map((s) => s[field]), 1);
    const cols = series
        .map((s, i) => {
            const h = s[field] ? Math.max((s[field] / max) * 100, 6) : 2;
            return `
                <div class="mb-col${i === series.length - 1 ? ' current' : ''}" title="${fmtMonth(s.key)}: ${money(s[field])}">
                    <div class="mb-track"><i style="height:${h.toFixed(1)}%"></i></div>
                    <small>${fmtMonthShort(s.key).slice(0, 3)}</small>
                </div>`;
        })
        .join('');
    return `<div class="mini-bars" aria-hidden="true">${cols}</div>`;
}

function backupBanner() {
    const due = backupReminder();
    if (!due) return '';
    const text = due.days === null
        ? 'You haven’t made a backup yet. If this phone is lost or the browser data is cleared, your entries are gone.'
        : `Your last backup was ${due.days} days ago.`;
    return `
    <div class="backup-banner" role="status">
        <span class="bb-icon">${icon('lock')}</span>
        <p><strong>Time for a backup.</strong> ${text}</p>
        <div class="bb-actions">
            <button type="button" class="btn btn-primary btn-sm" data-backup-now>Back up now</button>
            <button type="button" class="link" data-backup-later>Later</button>
        </div>
    </div>`;
}

/** One-tap buttons for saved favourites (amounts without paise when they're whole rupees). */
function quickAddRow(state) {
    if (!state.favorites.length) {
        if (state.transactions.length < 3) return '';
        return `<p class="qa-tip">${icon('star')}<span>Tip: tick <strong>“Save as a quick-add favourite”</strong> when adding something you buy often, like tea or a metro ride. It’ll appear here for one-tap adding.</span></p>`;
    }
    const amount = (p) => (p % 100 === 0 ? moneyWhole(p) : money(p));
    return `
    <div class="quick-add">
        <div class="qa-head"><span class="qa-label">Quick add</span><a href="#/settings?favourites" class="link">Edit</a></div>
        <div class="qa-chips">
            ${state.favorites
                .map(
                    (f) => `<button type="button" class="qa-chip ${f.type}" data-quick="${esc(f.id)}" aria-label="Add ${esc(f.note || f.category)}, ${f.type === 'income' ? 'received' : 'spent'} ${money(f.amount)}, now">
                        <span>${esc(f.note || f.category)}</span><b>${f.type === 'income' ? '+' : ''}${amount(f.amount)}</b>
                    </button>`,
                )
                .join('')}
        </div>
    </div>`;
}

export function render(root, ctx) {
    const state = getState();
    const { transactions } = state;
    const key = ctx.month;
    const monthTx = inMonth(transactions, key);
    const t = totals(monthTx);

    const series = Array.from({ length: 6 }, (_, i) => {
        const k = shiftMonth(key, i - 5);
        return { key: k, ...totals(inMonth(transactions, k)) };
    });
    const prev = series[4];

    const cats = byCategory(monthTx.filter((x) => x.type === 'expense'));
    const topCats = cats.slice(0, TOP_CATEGORIES);
    const moreCats = cats.length - topCats.length;

    const recent = monthTx.slice(0, RECENT_LIMIT);

    root.innerHTML = `
    ${backupBanner()}
    <div class="grid-2">
        <div class="col">
            <section class="block summary">
                <div class="section-head">
                    <h2>This month</h2>
                    <button type="button" class="icon-btn icon-btn-solid" data-add aria-label="Add transaction">${icon('plus')}</button>
                </div>
                ${monthSwitch(key)}
                <div class="amount-block">
                    <div><small>Total Expense</small><strong class="expense">${money(t.expense)}</strong></div>
                    <div><small>Total Income</small><strong class="income">${money(t.income)}</strong></div>
                    <div><small>Net</small><strong class="${t.net < 0 ? 'expense' : 'net'}">${t.net < 0 ? '−' : ''}${money(Math.abs(t.net))}</strong></div>
                </div>
                ${quickAddRow(state)}
            </section>

            ${budgetSection(state, key)}

            <section class="block">
                <div class="section-head">
                    <h2>Transaction history</h2>
                    ${monthTx.length ? `<a href="#/transactions" class="link">View all (${monthTx.length})</a>` : ''}
                </div>
                ${recent.length
                    ? txGroups(recent)
                    : emptyState(transactions.length
                        ? `No transactions in ${fmtMonth(key)}.`
                        : 'No transactions yet. Add your first expense or income to get started.', '')}
            </section>
        </div>

        <div class="col">
            <section class="block">
                <div class="section-head"><h2>Monthly transaction</h2></div>
                <div class="trend-cards">
                    <a href="#/expenses" class="trend-card expense">
                        <small>Expense</small>
                        ${miniBars(series, 'expense')}
                        <strong>${money(t.expense)}</strong>
                        <span class="trend-change">${change(t.expense, prev.expense, prev.key)}</span>
                    </a>
                    <a href="#/income" class="trend-card income">
                        <small>Income</small>
                        ${miniBars(series, 'income')}
                        <strong>${money(t.income)}</strong>
                        <span class="trend-change">${change(t.income, prev.income, prev.key)}</span>
                    </a>
                </div>
            </section>

            <section class="block">
                <div class="section-head"><h2>Expenses by category</h2></div>
                ${topCats.length
                    ? `<ul class="cat-list">
                        ${topCats
                            .map((c, i) => {
                                const pct = (c.amount / t.expense) * 100;
                                return `
                                <li class="cat-card">
                                    <span class="pie" style="--p:${(pct * 3.6).toFixed(1)}deg;--c:${CHART_COLORS[i % CHART_COLORS.length]}" aria-hidden="true"></span>
                                    <span class="cat-main"><small>${esc(c.category)}</small><strong>${money(c.amount)}</strong></span>
                                    <span class="cat-pct">${pct < 1 ? '<1' : Math.round(pct)}%</span>
                                </li>`;
                            })
                            .join('')}
                       </ul>
                       ${moreCats > 0 ? `<a href="#/report" class="link">+ ${moreCats} more ${moreCats === 1 ? 'category' : 'categories'} in the report</a>` : ''}`
                    : `<p class="muted">No expenses in ${fmtMonth(key)}.</p>`}
            </section>
        </div>
    </div>`;
}
