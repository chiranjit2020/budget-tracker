// Spending calendar: a month as a heat-map of daily spending; tap a day for its entries.

import { money, moneyShort, toDate } from './format.js';

export const LEVELS = 4; // shades for days with spending (0 = nothing spent)

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The month laid out in Monday-first weeks. Each day: { day: 'YYYY-MM-DD', n, spent, count, level, future, today }.
 * `level` ranks spending days against each other (1 = lightest, LEVELS = heaviest), so one big
 * day like rent doesn't make every other day look empty. Equal amounts get the same level.
 */
export function calendarMonth(transactions, monthKey, today) {
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const cells = Array.from({ length: days }, (_, i) => {
        const day = `${monthKey}-${pad2(i + 1)}`;
        return { day, n: i + 1, spent: 0, count: 0, level: 0, future: day > today, today: day === today };
    });
    for (const t of transactions) {
        if (t.type !== 'expense' || !t.date.startsWith(monthKey)) continue;
        const cell = cells[Number(t.date.slice(8, 10)) - 1];
        cell.spent += t.amount;
        cell.count++;
    }
    const amounts = cells.filter((c) => c.spent).map((c) => c.spent).sort((a, b) => a - b);
    for (const c of cells) {
        if (!c.spent) continue;
        const rank = amounts.indexOf(c.spent); // first index, so ties share a level
        c.level = amounts.length === 1 ? LEVELS : 1 + Math.floor((rank / (amounts.length - 1)) * (LEVELS - 1));
    }
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // blanks before the 1st (Monday = 0)
    const slots = [...Array(lead).fill(null), ...cells];
    while (slots.length % 7) slots.push(null);
    const weeks = [];
    for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
    return { weeks, cells, total: amounts.reduce((a, b) => a + b, 0), spendDays: amounts.length };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayLabel = (day) => toDate(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

function cellHTML(c, selected) {
    if (!c) return '<span class="cal-cell cal-blank" aria-hidden="true"></span>';
    const what = c.spent ? `spent ${money(c.spent)}, ${c.count} ${c.count === 1 ? 'entry' : 'entries'}` : 'nothing spent';
    const classes = ['cal-cell', `lv${c.level}`, c.today && 'is-today', c.future && 'is-future'].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-cal-day="${c.day}" aria-pressed="${c.day === selected}" aria-label="${dayLabel(c.day)}${c.today ? ', today' : ''}: ${what}">
        <span class="cal-n">${c.n}</span>${c.spent ? `<span class="cal-amt">${moneyShort(c.spent)}</span>` : ''}
    </button>`;
}

/** The calendar grid and its legend. `selected` is the chosen day ('YYYY-MM-DD') or ''. */
export function calendarHTML(cal, selected) {
    return `
    <div class="cal" role="group" aria-label="Spending per day">
        <div class="cal-head" aria-hidden="true">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
        ${cal.weeks.map((w) => `<div class="cal-week">${w.map((c) => cellHTML(c, selected)).join('')}</div>`).join('')}
    </div>
    <div class="cal-legend" aria-hidden="true">
        <span>Less</span>${Array.from({ length: LEVELS + 1 }, (_, i) => `<i class="lv${i}"></i>`).join('')}<span>More</span>
    </div>`;
}
