// Dashboard insights: short, plain-language observations about a month's spending.
// Pure calculations (no DOM), so they can be tested on their own.
//
// - The current month is compared with the SAME DAYS of last month (1-10 Oct
//   when it's 10 Nov), otherwise a month in progress would always look "down".
// - The month-end projection leaves repeating entries out of the daily rate
//   (rent on the 1st isn't multiplied by 30) and adds repeats still due once each.

import { nextOccurrence } from './store.js';
import { money, moneyWhole, fmtMonthName, shiftMonth } from './format.js';

const MAX_INSIGHTS = 4;
const MIN_CHANGE_PCT = 15; // smaller changes are noise
const MIN_CHANGE_PAISE = 20000; // ₹200
const MIN_DAYS_FOR_PROJECTION = 3;

const daysInMonth = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
};
const dayOf = (date) => Number(date.slice(8, 10));
const sum = (list) => list.reduce((n, t) => n + t.amount, 0);
const pctChange = (cur, prev) => ((cur - prev) / prev) * 100;
const pctText = (p) => `${Math.round(Math.abs(p))}%`;

function byCategoryMap(list) {
    const map = new Map();
    for (const t of list) map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    return map;
}

/** Repeating expenses still to be added in this month after `today`, each occurrence counted. */
function recurringStillDue(recurring, monthKey, today) {
    let total = 0;
    for (const r of recurring) {
        if (!r.active || r.type !== 'expense') continue;
        let next = r.next;
        let guard = 0;
        while (next.startsWith(monthKey) && guard++ < 40) {
            if (next > today) total += r.amount;
            next = nextOccurrence(r, next);
        }
    }
    return total;
}

/**
 * Insights for `monthKey` ('YYYY-MM') as of `today` ('YYYY-MM-DD').
 * Returns [{ kind, tone: 'up' | 'down' | 'info', title, detail }], most useful first.
 * 'up' means spending went up (bad), 'down' means it went down (good).
 */
export function computeInsights({ transactions, recurring = [] }, monthKey, today) {
    const thisMonth = today.slice(0, 7);
    if (monthKey > thisMonth) return []; // the future has no spending yet

    const isCurrent = monthKey === thisMonth;
    const days = daysInMonth(monthKey);
    const day = isCurrent ? dayOf(today) : days; // days of the month counted so far
    const prevKey = shiftMonth(monthKey, -1);
    const prevName = fmtMonthName(prevKey);
    const prevCut = Math.min(day, daysInMonth(prevKey)); // same days of last month
    const partial = isCurrent && day < days;
    const prevLabel = partial ? `the same days of ${prevName}` : prevName;

    const expenses = transactions.filter((t) => t.type === 'expense');
    const cur = expenses.filter((t) => t.date.startsWith(monthKey));
    if (!cur.length) return [];
    const prevAll = expenses.filter((t) => t.date.startsWith(prevKey));
    const prev = prevAll.filter((t) => dayOf(t.date) <= prevCut);

    const spent = sum(cur);
    const prevSpent = sum(prev);
    const prevMonthTotal = sum(prevAll);
    const out = [];

    // 1. Where the month is heading (current month only).
    if (partial && day >= MIN_DAYS_FOR_PROJECTION) {
        const repeating = sum(cur.filter((t) => t.recurringId));
        const everyday = spent - repeating;
        const projected = Math.round(spent + (everyday / day) * (days - day) + recurringStillDue(recurring, monthKey, today));
        let detail = `${money(spent)} so far, at your usual pace for the rest of the month.`;
        let tone = 'info';
        if (prevMonthTotal) {
            const diff = projected - prevMonthTotal;
            tone = diff > 0 ? 'up' : 'down';
            detail = `${moneyWhole(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${prevName} (${moneyWhole(prevMonthTotal)}).`;
        }
        out.push({ kind: 'projection', tone, title: `Heading for about ${moneyWhole(projected)} this month`, detail });
    }

    // 2. Categories that moved the most since last month.
    if (prevAll.length) {
        const now = byCategoryMap(cur);
        const then = byCategoryMap(prev);
        const movers = [];
        for (const [category, amount] of now) {
            const before = then.get(category) ?? 0;
            const diff = amount - before;
            if (Math.abs(diff) < MIN_CHANGE_PAISE) continue;
            if (!before) {
                movers.push({ diff, insight: { kind: 'new-category', tone: 'up', title: `First ${category} spending: ${moneyWhole(amount)}`, detail: `Nothing on ${category} in ${prevLabel}.` } });
            } else if (Math.abs(pctChange(amount, before)) >= MIN_CHANGE_PCT) {
                const p = pctChange(amount, before);
                movers.push({ diff, insight: { kind: 'category', tone: p > 0 ? 'up' : 'down', title: `${category} is ${p > 0 ? 'up' : 'down'} ${pctText(p)}`, detail: `${moneyWhole(amount)} vs ${moneyWhole(before)} in ${prevLabel}.` } });
            }
        }
        for (const [category, before] of then) {
            if (!now.has(category) && before >= MIN_CHANGE_PAISE) {
                movers.push({ diff: -before, insight: { kind: 'category', tone: 'down', title: partial ? `Nothing on ${category} yet` : `Nothing on ${category} this month`, detail: `${moneyWhole(before)} in ${prevLabel}.` } });
            }
        }
        movers.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        out.push(...movers.slice(0, 2).map((m) => m.insight));
    }

    // 3. Average per day.
    const perDay = spent / day;
    let detail = `Across ${day} day${day === 1 ? '' : 's'}${partial ? ' so far' : ''}.`;
    let tone = 'info';
    if (prevSpent) {
        const prevPerDay = prevSpent / prevCut;
        const p = pctChange(perDay, prevPerDay);
        detail = `${money(Math.round(prevPerDay))} a day in ${prevLabel}${Math.abs(p) >= 1 ? ` (${p > 0 ? 'up' : 'down'} ${pctText(p)})` : ''}.`;
        tone = Math.abs(p) < MIN_CHANGE_PCT ? 'info' : p > 0 ? 'up' : 'down';
    }
    out.push({ kind: 'per-day', tone, title: `${money(Math.round(perDay))} a day on average`, detail });

    return out.slice(0, MAX_INSIGHTS);
}
