import { getState, inMonth, totals, byCategory, byMethod, METHOD_LABELS } from '../store.js';
import { money, moneyWhole, esc, fmtMonth, fmtMonthShort, fmtDay, fmtDate, shiftMonth, nowLocal, leftOver } from '../format.js';
import { icon, monthSwitch, txGroups, txItem, emptyState, CHART_COLORS } from '../ui.js';
import { calendarMonth, calendarHTML } from '../calendar.js';
import { goalsSection } from '../goals-ui.js';
import { debtsSection } from '../debts-ui.js';
import { applyFolds } from '../folds.js';
import { drawCategoryPie } from '../pie.js';
import { upcomingItems, upcomingTotals, nextAfter, whenText } from '../upcoming.js';
import { budgetSection } from '../budgets.js';
import { backupReminder } from '../backup.js';
import { computeInsights } from '../insights.js';

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

/**
 * Features not used yet, as one small card instead of a full empty card each.
 * Each line disappears once that feature is in use; the card goes when all are.
 */
function moreCard(state) {
    const items = [];
    if (!Object.keys(state.budgets).length) items.push(['data-budgets', 'Set monthly budgets', 'See how much is left for food, shopping and more']);
    if (!state.goals.length) items.push(['data-goal-new', 'Save up for something', 'Like a trip or an emergency fund']);
    if (!state.debts.length) items.push(['data-debt-new', 'Note money given or taken', 'So you don’t forget who has to return what']);
    if (!items.length) return '';
    return `
    <section class="block" data-card="more">
        <div class="section-head"><h2>More you can do</h2></div>
        <ul class="more-list">
            ${items
                .map(([attr, title, hint]) => `<li><button type="button" class="more-item" ${attr}>
                    <span class="more-plus" aria-hidden="true">${icon('plus')}</span>
                    <span><strong>${title}</strong><small>${hint}</small></span>
                    ${icon('chevron-right')}
                </button></li>`)
                .join('')}
        </ul>
    </section>`;
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
                    (f) => `<button type="button" class="qa-chip ${f.type}" data-quick="${esc(f.id)}" title="Add now">
                        <span>${esc(f.note || f.category)}</span><b>${f.type === 'income' ? '+' : ''}${amount(f.amount)}</b>
                    </button>`,
                )
                .join('')}
        </div>
    </div>`;
}

// ---- Coming up: what repeats will add soon --------------------------------------------

let upcomingDays = 7; // 7 or 30, kept while the dashboard re-renders
let currentKey = ''; // the month on screen

function upcomingSection(state, key) {
    const today = nowLocal().slice(0, 10);
    // Only about the future, so only on the current month, and only once something repeats.
    if (key !== today.slice(0, 7) || !state.recurring.some((r) => r.active)) return '';
    const items = upcomingItems(state.recurring, today, upcomingDays);
    const { toPay, comingIn } = upcomingTotals(items);
    const sums = [toPay && `To pay <strong class="expense">${money(toPay)}</strong>`, comingIn && `Coming in <strong class="income">${money(comingIn)}</strong>`].filter(Boolean);
    const switcher = [7, 30]
        .map((d) => `<button type="button" data-upcoming-days="${d}" aria-pressed="${d === upcomingDays}">${d} days</button>`)
        .join('');
    let body;
    if (items.length) {
        body = `
        <p class="up-sum">${sums.join(' · ')}</p>
        <ul class="up-list">
            ${items
                .map((it) => {
                    const day = new Date(`${it.date}T00:00`);
                    const sub = [it.name !== it.category ? it.category : '', it.method ? METHOD_LABELS[it.method] : '', whenText(it.daysAway)].filter(Boolean);
                    return `<li class="up-item ${it.type}">
                <span class="up-date" aria-hidden="true"><b>${day.getDate()}</b><small>${day.toLocaleDateString('en-IN', { month: 'short' })}</small></span>
                <span class="up-main"><strong>${esc(it.name)}</strong><small>${esc(sub.join(' · '))}<span class="sr-only">, ${fmtDay(it.date)}</span></small></span>
                <span class="up-amt ${it.type}">${it.type === 'income' ? '+' : '−'} ${money(it.amount)}</span>
            </li>`;
                })
                .join('')}
        </ul>`;
    } else {
        const next = nextAfter(state.recurring, today, upcomingDays);
        body = `<p class="muted up-empty">Nothing due in the next ${upcomingDays} days.${next ? ` Next: ${esc(next.name)} ${money(next.amount)} on ${fmtDate(next.date)}.` : ''}</p>`;
    }
    return `
    <section class="block" data-card="upcoming" id="upcoming-block">
        <div class="section-head"><h2>Coming up</h2><div class="up-switch" role="group" aria-label="How far ahead">${switcher}</div></div>
        ${body}
        <a href="#/settings" class="link up-manage">Change or pause repeats in Settings</a>
    </section>`;
}

function onUpcomingClick(e, root) {
    const btn = e.target.closest('[data-upcoming-days]');
    if (!btn) return false;
    upcomingDays = Number(btn.dataset.upcomingDays);
    const card = root.querySelector('#upcoming-block');
    if (card) {
        card.outerHTML = upcomingSection(getState(), currentKey);
        applyFolds(root);
        root.querySelector(`[data-upcoming-days="${upcomingDays}"]`)?.focus();
    }
    return true;
}

// ---- Spending calendar ----------------------------------------------------------

let calDay = ''; // the tapped day ('YYYY-MM-DD'); kept while the dashboard re-renders

function dayPanel(transactions, day) {
    if (!day) return '<p class="muted cal-hint">Tap a day to see what you spent.</p>';
    const items = transactions.filter((t) => t.date.startsWith(day));
    const t = totals(items);
    const parts = [];
    if (t.expense) parts.push(`<span class="expense">Spent ${money(t.expense)}</span>`);
    if (t.income) parts.push(`<span class="income">Received ${money(t.income)}</span>`);
    return `
        <h3 class="day-label"><span>${fmtDay(day)}</span><span class="day-total">${parts.join(' ')}</span></h3>
        ${items.length ? `<ul class="tx-list">${items.map(txItem).join('')}</ul>` : '<p class="muted">Nothing recorded on this day.</p>'}`;
}

function calendarSection(transactions, key) {
    if (key > nowLocal().slice(0, 7)) return ''; // nothing to show for future months
    if (!calDay.startsWith(key)) calDay = '';
    const cal = calendarMonth(transactions, key, nowLocal().slice(0, 10));
    return `
    <section class="block" id="cal-block" data-card="calendar">
        <div class="section-head"><h2>Spending calendar</h2></div>
        ${cal.spendDays ? `<p class="muted cal-sub">Spent on ${cal.spendDays} of ${cal.cells.filter((c) => !c.future).length} days so far</p>` : ''}
        ${calendarHTML(cal, calDay)}
        <div class="cal-panel" id="cal-panel" aria-live="polite">${dayPanel(transactions, calDay)}</div>
    </section>`;
}

/** Tapping a day shows its entries (tap again to close) without redrawing the page. */
function onCalendarClick(e, root) {
    const btn = e.target.closest('[data-cal-day]');
    if (!btn) return;
    calDay = calDay === btn.dataset.calDay ? '' : btn.dataset.calDay;
    root.querySelectorAll('[data-cal-day]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calDay === calDay)));
    root.querySelector('#cal-panel').innerHTML = dayPanel(getState().transactions, calDay);
}

const TONE_ICON = { up: 'income', down: 'expense', info: 'chart' }; // arrow up / arrow down / chart
const TONE_WORD = { up: 'Spending up: ', down: 'Spending down: ', info: '' };

/** Short observations about the month: where it's heading, what changed, the daily average. */
function insightsSection(state, key) {
    const items = computeInsights(state, key, nowLocal().slice(0, 10));
    if (!items.length) return '';
    return `
    <section class="block" data-card="insights">
        <div class="section-head"><h2>Insights</h2></div>
        <ul class="insights">
            ${items
                .map(
                    (i) => `<li class="insight ${i.tone}">
                        <span class="insight-icon">${icon(TONE_ICON[i.tone])}</span>
                        <span><strong><span class="sr-only">${TONE_WORD[i.tone]}</span>${esc(i.title)}</strong><small>${esc(i.detail)}</small></span>
                    </li>`,
                )
                .join('')}
        </ul>
    </section>`;
}

/** A stacked bar of this month's spending per payment method, once any entry has one. */
function methodSplit(expenses, total, key) {
    const rows = byMethod(expenses);
    if (!rows.some((r) => r.method)) return '';
    const colour = { upi: 'var(--chart-1)', cash: 'var(--chart-2)', card: 'var(--chart-3)', bank: 'var(--chart-4)', '': 'var(--line)' };
    const pct = (r) => (r.amount / total) * 100;
    const pctText = (r) => `${pct(r) < 1 ? '<1' : Math.round(pct(r))}%`;
    return `
    <section class="block" data-card="methods">
        <div class="section-head"><h2>How you paid</h2></div>
        <div class="method-bar" role="img" aria-label="Spending in ${fmtMonth(key)} by payment method: ${rows.map((r) => `${METHOD_LABELS[r.method]} ${pctText(r).replace('<1', 'under 1')}`).join(', ')}">
            ${rows.map((r) => `<i style="width:${pct(r).toFixed(2)}%;background:${colour[r.method]}"></i>`).join('')}
        </div>
        <ul class="method-legend">
            ${rows
                .map(
                    (r) => `<li><span class="dot" style="background:${colour[r.method]}" aria-hidden="true"></span><span>${METHOD_LABELS[r.method]}</span><strong>${money(r.amount)}</strong><small>${pctText(r)}</small></li>`,
                )
                .join('')}
        </ul>
    </section>`;
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
    // Doughnut slices: the biggest categories, plus everything else together as "Other".
    const slices = topCats.map((c, i) => ({ label: c.category, amount: c.amount, color: CHART_COLORS[i % CHART_COLORS.length] }));
    if (moreCats > 0) {
        const rest = cats.slice(TOP_CATEGORIES);
        slices.push({ label: `Other (${rest.length} ${rest.length === 1 ? 'category' : 'categories'})`, amount: rest.reduce((n, c) => n + c.amount, 0), color: 'var(--chart-8)' });
    }
    const pctText = (amount) => {
        const p = (amount / t.expense) * 100;
        return `${p < 1 ? '<1' : Math.round(p)}%`;
    };

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
                    ${((l) => `<div><small>${l.label}</small><strong class="${l.cls}">${l.amount}</strong></div>`)(leftOver(t.net))}
                </div>
                ${quickAddRow(state)}
            </section>

            ${insightsSection(state, key)}

            ${upcomingSection(state, key)}

            <section class="block" data-card="history">
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

            ${Object.keys(state.budgets).length ? budgetSection(state, key) : ''}

            ${state.goals.length ? goalsSection(state) : ''}

            ${state.debts.length ? debtsSection(state) : ''}

            ${moreCard(state)}
        </div>

        <div class="col">
            ${calendarSection(transactions, key)}

            <section class="block" data-card="categories">
                <div class="section-head"><h2>Expenses by category</h2></div>
                ${slices.length
                    ? `<div class="pie-wrap">
                        <canvas id="cat-pie" role="img" aria-label="Doughnut chart of spending by category: ${esc(slices.map((s) => `${s.label} ${pctText(s.amount)}`).join(', '))}"></canvas>
                        <p class="pie-total"><small>Spent in ${fmtMonthShort(key)}</small><strong>${moneyWhole(t.expense)}</strong></p>
                       </div>
                       <ul class="cat-list">
                        ${slices
                            .map((s) => `
                                <li class="cat-card">
                                    <span class="cat-dot" style="background:${s.color}" aria-hidden="true"></span>
                                    <span class="cat-main"><small>${esc(s.label)}</small><strong>${money(s.amount)}</strong></span>
                                    <span class="cat-pct">${pctText(s.amount)}</span>
                                </li>`)
                            .join('')}
                       </ul>
                       ${moreCats > 0 ? `<a href="#/report" class="link">See all ${cats.length} categories in the report</a>` : ''}`
                    : `<p class="muted">No expenses in ${fmtMonth(key)}.</p>`}
            </section>

            ${methodSplit(monthTx.filter((x) => x.type === 'expense'), t.expense, key)}

            <section class="block" data-card="trend">
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
        </div>
    </div>`;

    applyFolds(root);
    drawCategoryPie(root.querySelector('#cat-pie'), slices);
    currentKey = key;
    root.onclick = (e) => onUpcomingClick(e, root) || onCalendarClick(e, root);
}
