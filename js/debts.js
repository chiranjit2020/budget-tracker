// Lend & borrow: what's still owed, due dates, and the reminder message. Pure (no DOM).

import { money, moneyWhole, fmtDate } from './format.js';
import { daysBetween } from './goals.js';

const SOON_DAYS = 3;

/** ₹500 for whole rupees, ₹499.50 otherwise: friendlier in messages. */
export const amt = (paise) => (paise % 100 === 0 ? moneyWhole(paise) : money(paise));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Where a record stands on `today`:
 * { repaid, remaining, settled, due: 'none' | 'later' | 'soon' | 'today' | 'overdue', title, detail }
 */
export function debtStatus(debt, today) {
    const repaid = debt.repayments.reduce((n, e) => n + e.amount, 0);
    const remaining = Math.max(debt.amount - repaid, 0);
    const settled = remaining === 0;
    const lent = debt.kind === 'lent';

    let title;
    if (settled) title = lent ? `${debt.person} paid back ${amt(debt.amount)}` : `You paid ${debt.person} back ${amt(debt.amount)}`;
    else title = lent ? `${debt.person} owes you ${amt(remaining)}` : `You owe ${debt.person} ${amt(remaining)}`;

    const parts = [];
    if (repaid && !settled) parts.push(`${amt(repaid)} of ${amt(debt.amount)} ${lent ? 'paid back' : 'repaid'}`);
    if (debt.note) parts.push(debt.note);

    let due = 'none';
    if (settled) {
        const last = debt.repayments.reduce((a, e) => (e.date > a ? e.date : a), debt.date);
        parts.unshift(`Settled ${fmtDate(last)}`);
    } else if (debt.due) {
        const days = daysBetween(today, debt.due);
        if (days < 0) {
            due = 'overdue';
            parts.unshift(`Overdue by ${plural(-days, 'day')}`);
        } else if (days === 0) {
            due = 'today';
            parts.unshift('Due today');
        } else if (days <= SOON_DAYS) {
            due = 'soon';
            parts.unshift(`Due in ${plural(days, 'day')}`);
        } else {
            due = 'later';
            parts.unshift(`Due ${fmtDate(debt.due)}`);
        }
    } else {
        parts.unshift(`Since ${fmtDate(debt.date)}`);
    }
    return { repaid, remaining, settled, due, title, detail: parts.join(' · ') };
}

/** Totals still outstanding: { owedToYou, youOwe, open (count) }. */
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

/** A polite reminder to send to someone who owes you. */
export function reminderMessage(debt, today) {
    const { repaid, remaining } = debtStatus(debt, today);
    const what = debt.note ? ` for ${debt.note}` : '';
    const start = `Hi ${debt.person}, just a friendly reminder about the ${amt(debt.amount)} I lent you on ${fmtDate(debt.date)}${what}.`;
    if (!repaid) return `${start} Please send it when you can. Thanks!`;
    return `${start} Thanks for the ${amt(repaid)} so far! ${amt(remaining)} is still pending; please send it when you can.`;
}
