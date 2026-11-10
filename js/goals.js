// Savings goals: progress and the pace needed to reach a target date. Pure (no DOM).

import { money, moneyWhole, fmtDate } from './format.js';

// An average month is 30.4375 days (over four years) = 487/16, so the pace can use exact integer maths.
const MONTH_NUM = 487n;
const MONTH_DEN = 16n;

/** Whole days from `a` to `b` (both 'YYYY-MM-DD'); negative when b is earlier. */
export function daysBetween(a, b) {
    const utc = (d) => {
        const [y, m, day] = d.split('-').map(Number);
        return Date.UTC(y, m - 1, day);
    };
    return Math.round((utc(b) - utc(a)) / 864e5);
}

export const goalSaved = (goal) => goal.entries.reduce((n, e) => n + e.amount, 0);

/**
 * Where a goal stands on `today`:
 * { saved, remaining, pct (0-100), state: 'reached' | 'overdue' | 'due' | 'open', pace, perMonth, daysLeft }
 * `pace` is one plain sentence for the card.
 */
export function goalProgress(goal, today) {
    const saved = goalSaved(goal);
    const remaining = Math.max(goal.target - saved, 0);
    const pct = Math.min((saved / goal.target) * 100, 100);
    const out = { saved, remaining, pct, state: 'open', pace: '', perMonth: 0, daysLeft: null };

    if (!remaining) return { ...out, state: 'reached', pace: 'Goal reached. Well done!' };
    if (!goal.by) return { ...out, pace: `${money(remaining)} to go.` };

    const daysLeft = daysBetween(today, goal.by);
    out.daysLeft = daysLeft;
    if (daysLeft < 0) return { ...out, state: 'overdue', pace: `The target date (${fmtDate(goal.by)}) has passed; ${money(remaining)} to go.` };
    if (daysLeft === 0) return { ...out, state: 'due', pace: `Due today; ${money(remaining)} to go.` };
    if (daysLeft < 31) return { ...out, state: 'due', pace: `Save ${moneyWhole(remaining)} in the next ${daysLeft} day${daysLeft === 1 ? '' : 's'} to reach it by ${fmtDate(goal.by)}.` };

    // remaining / (daysLeft / 30.4375), rounded UP to whole rupees so following it reaches the target.
    // Done in exact integers (BigInt): a float like 4566.0000001 must not become ₹4,567.
    const top = BigInt(remaining) * MONTH_NUM;
    const bottom = BigInt(daysLeft) * MONTH_DEN * 100n;
    const perMonth = Number((top + bottom - 1n) / bottom) * 100;
    return { ...out, perMonth, pace: `Save ${moneyWhole(perMonth)} a month to reach it by ${fmtDate(goal.by)}.` };
}

/**
 * Every add and withdrawal, newest first, each with the amount saved right after it.
 * Order: by date, and entries on the same day in the order they were made.
 * [{ id, date, amount (paise, negative = withdrawal), kind: 'add' | 'withdraw', balance }]
 */
export function goalHistory(goal) {
    let balance = 0;
    return goal.entries
        .map((e, i) => ({ ...e, i }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i)
        .map((e) => {
            balance += e.amount;
            return { id: e.id, date: e.date, amount: e.amount, kind: e.amount > 0 ? 'add' : 'withdraw', balance };
        })
        .reverse();
}

/** Removing this entry must never leave the goal below ₹0 at any point (a later withdrawal may need it). */
export function canRemoveEntry(goal, entryId) {
    const rest = { ...goal, entries: goal.entries.filter((e) => e.id !== entryId) };
    return goalHistory(rest).every((row) => row.balance >= 0);
}
