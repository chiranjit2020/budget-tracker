// Savings goals: progress and the pace needed to reach a target date. Pure (no DOM).

import { money, moneyWhole, fmtDate } from './format.js';

const DAYS_PER_MONTH = 30.4375; // average over four years

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

    // Round up to whole rupees so following the advice actually reaches the target.
    const perMonth = Math.ceil(remaining / (daysLeft / DAYS_PER_MONTH) / 100) * 100;
    return { ...out, perMonth, pace: `Save ${moneyWhole(perMonth)} a month to reach it by ${fmtDate(goal.by)}.` };
}
