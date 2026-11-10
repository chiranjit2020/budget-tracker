// "Coming up": what repeats will add soon (bills to pay and money coming in). Pure: no DOM.

import { nextOccurrence } from './store.js';
import { daysBetween } from './goals.js';
import { fmtDate } from './format.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** Would the k-th upcoming one (counting from 0), on `date`, be past the repeat's end? */
const pastEnd = (r, date, k) =>
    (r.end?.type === 'count' && (r.done ?? 0) + k >= r.end.count) || (r.end?.type === 'date' && date > r.end.date);

/** 'YYYY-MM-DD' plus n days. */
export function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

/**
 * Everything active repeats will add from `today` through the next `days` days, soonest first
 * (on the same day, bills before money coming in). A repeat due today that hasn't been added yet
 * counts as today. Weekly repeats can appear more than once.
 * [{ ruleId, date, daysAway, type, amount, name, category, method }]
 */
export function upcomingItems(recurring, today, days) {
    const end = addDays(today, days);
    const items = [];
    for (const r of recurring) {
        if (!r.active) continue;
        let date = r.next < today ? today : r.next;
        let guard = 0;
        let k = 0; // how many of this repeat are already listed
        if (r.ask) date = r.next; // waiting ones (due already) are in "Bills to confirm", not here
        while (date <= end && guard++ < 60 && !pastEnd(r, date, k)) {
            const nth = r.end?.type === 'count' ? (r.done ?? 0) + k + 1 : 0;
            k++;
            if (r.ask && date <= today) {
                date = nextOccurrence(r, date);
                continue;
            }
            items.push({
                ruleId: r.id,
                date,
                daysAway: daysBetween(today, date),
                type: r.type,
                amount: r.amount,
                name: r.note || r.category,
                category: r.category,
                method: r.method ?? '',
                nth, // e.g. payment 5 …
                total: nth ? r.end.count : 0, // … of 12
                ask: r.ask === true, // the amount is a guess (last time's): it asks when due
            });
            date = nextOccurrence(r, date);
        }
    }
    const order = { expense: 0, income: 1 };
    return items.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type] || a.name.localeCompare(b.name));
}

/** Totals for a list from upcomingItems: { toPay, comingIn } in paise. */
export function upcomingTotals(items) {
    let toPay = 0;
    let comingIn = 0;
    for (const it of items) {
        if (it.type === 'expense') toPay += it.amount;
        else comingIn += it.amount;
    }
    return { toPay, comingIn };
}

/** The first thing due after the window, for "Nothing due… Next: Rent on 1 Jan". */
export function nextAfter(recurring, today, days) {
    const end = addDays(today, days);
    let best = null;
    for (const r of recurring) {
        if (!r.active) continue;
        let date = r.next < today ? today : r.next;
        let guard = 0;
        let k = 0;
        while (date <= end && guard++ < 60 && !pastEnd(r, date, k)) {
            date = nextOccurrence(r, date);
            k++;
        }
        if (pastEnd(r, date, k)) continue; // it ends before then
        if (!best || date < best.date) best = { date, name: r.note || r.category, amount: r.amount, type: r.type };
    }
    return best;
}

/**
 * A repeat's end and progress in plain words, or '' when it never stops.
 * "4 of 12 paid" · "Until 1 Oct 2027" · "Finished: all 12 paid" · "Finished: end date was 1 Oct 2027"
 */
export function repeatProgress(r) {
    if (!r.end) return '';
    const verb = r.type === 'income' ? 'received' : 'paid';
    if (r.end.type === 'count') return r.finished ? `Finished: all ${r.end.count} ${verb}` : `${r.done} of ${r.end.count} ${verb}`;
    return r.finished ? `Finished: end date was ${fmtDate(r.end.date)}` : `Until ${fmtDate(r.end.date)}`;
}

/**
 * "Ask me" repeats that are due and waiting for an amount: the oldest per repeat, with how many
 * are waiting in all (missed while the app wasn't opened). Oldest first.
 * [{ ruleId, date, name, category, method, type, last, waiting }]
 */
export function waitingToConfirm(recurring, today) {
    const out = [];
    for (const r of recurring) {
        if (!r.active || !r.ask || r.next > today) continue;
        let waiting = 0;
        let date = r.next;
        let guard = 0;
        while (date <= today && guard++ < 60 && !pastEnd(r, date, waiting)) {
            waiting++;
            date = nextOccurrence(r, date);
        }
        if (waiting) out.push({ ruleId: r.id, date: r.next, name: r.note || r.category, category: r.category, method: r.method ?? '', type: r.type, last: r.amount, waiting });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** "Today", "Tomorrow", "in 3 days". */
export const whenText = (daysAway) => (daysAway <= 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `in ${daysAway} days`);
