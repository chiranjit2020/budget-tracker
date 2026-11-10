// Money given & taken: what's still to come back, return dates, and the reminder message. Pure (no DOM).
// Wording is plain on purpose ("You will get ₹200 from Rahul"), no accounting words like "owe".
// Stored data still uses kind 'lent' (you gave money) and 'borrowed' (you took money).

import { money, moneyWhole, fmtDate } from './format.js';
import { daysBetween } from './goals.js';

const SOON_DAYS = 3;

/** ₹500 for whole rupees, ₹499.50 otherwise: friendlier in messages. */
export const amt = (paise) => (paise % 100 === 0 ? moneyWhole(paise) : money(paise));
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

/**
 * Where a record stands on `today`:
 * { repaid, remaining, settled, due: 'none' | 'later' | 'soon' | 'today' | 'overdue', title, detail }
 */
export function debtStatus(debt, today) {
    const repaid = debt.repayments.reduce((n, e) => n + e.amount, 0);
    const remaining = Math.max(debt.amount - repaid, 0);
    const settled = remaining === 0;
    const gave = debt.kind === 'lent';

    let title;
    if (settled) title = gave ? `${debt.person} returned ${amt(debt.amount)}` : `You returned ${amt(debt.amount)} to ${debt.person}`;
    else title = gave ? `You will get ${amt(remaining)} from ${debt.person}` : `You will give ${amt(remaining)} to ${debt.person}`;

    const parts = [];
    let due = 'none';
    if (settled) {
        const last = debt.repayments.reduce((a, e) => (e.date > a ? e.date : a), debt.date);
        parts.push(`All returned on ${fmtDate(last)}`);
    } else {
        parts.push(`${gave ? 'Given' : 'Taken'} on ${fmtDate(debt.date)}`);
        if (debt.due) {
            const left = daysBetween(today, debt.due);
            if (left < 0) {
                due = 'overdue';
                parts.unshift(`${days(-left)} late`);
            } else if (left === 0) {
                due = 'today';
                parts.unshift('Return date is today');
            } else if (left <= SOON_DAYS) {
                due = 'soon';
                parts.unshift(`${days(left)} left to return`);
            } else {
                due = 'later';
                parts.push(`Return by ${fmtDate(debt.due)}`);
            }
        }
        if (repaid) parts.push(`${amt(repaid)} of ${amt(debt.amount)} returned`);
    }
    if (debt.note) parts.push(debt.note);
    return { repaid, remaining, settled, due, title, detail: parts.join(' · ') };
}

/** Still to come back / still to return: { owedToYou, youOwe, open (count) }. */
export function debtTotals(debts, today) {
    let owedToYou = 0;
    let youOwe = 0;
    let open = 0;
    for (const d of debts) {
        const { remaining } = debtStatus(d, today);
        if (!remaining) continue;
        open++;
        if (d.kind === 'lent') owedToYou += remaining;
        else youOwe += remaining;
    }
    return { owedToYou, youOwe, open };
}

/** People you've recorded, most recent first (for name suggestions). */
export function knownPeople(debts) {
    const seen = new Map();
    for (const d of [...debts].sort((a, b) => b.date.localeCompare(a.date))) {
        const key = d.person.toLowerCase();
        if (!seen.has(key)) seen.set(key, d.person);
    }
    return [...seen.values()];
}

/** A polite reminder to send to someone you gave money to. */
export function reminderMessage(debt, today) {
    const { repaid, remaining } = debtStatus(debt, today);
    const what = debt.note ? ` for ${debt.note}` : '';
    const start = `Hi ${debt.person}, just a reminder about the ${amt(debt.amount)} I gave you on ${fmtDate(debt.date)}${what}.`;
    if (!repaid) return `${start} Please return it when you can. Thanks!`;
    return `${start} You've returned ${amt(repaid)}, thank you! ${amt(remaining)} is still left. Please return it when you can.`;
}
