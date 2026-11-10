// Formatting and parsing helpers. Amounts are stored as whole paise (integers)
// so totals never suffer from floating-point rounding errors.

const inr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
});

/** 123456 paise -> "₹1,234.56" */
export const money = (paise) => inr.format(paise / 100);

const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** 583894 paise -> "₹5,839" (rounded to whole rupees, for hints) */
export const moneyWhole = (paise) => inrWhole.format(Math.round(paise / 100));

/** 12345600 paise -> "₹1.2L" (for tight spaces such as chart labels) */
export const moneyShort = (paise) => inrCompact.format(paise / 100);

/** "1,234.5" -> 123450 paise, or null when not a positive amount. */
export function parseAmount(text) {
    const cleaned = String(text).replace(/[₹,\s]/g, '');
    if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
    const paise = Math.round(Number(cleaned) * 100);
    return paise > 0 && paise < 1e13 ? paise : null;
}

/** Plain decimal for inputs and CSV: 123450 -> "1234.50" */
/**
 * Money in minus money out, in plain words. Positive: "Left over ₹X".
 * Negative: "Spent extra ₹X" (no minus sign; shown in red via the 'expense' class).
 */
export const leftOver = (net) => (net < 0 ? { label: 'Spent extra', amount: money(-net), cls: 'expense' } : { label: 'Left over', amount: money(net), cls: 'net' });

/** Share of income kept: "25%". Spending more than you got counts as 0%; no income gives "—". */
export const savedShare = (net, income) => (income ? `${Math.max(0, Math.round((net / income) * 100))}%` : '—');

export const toDecimal = (paise) => (paise / 100).toFixed(2);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape user text before putting it into HTML. */
export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

// ---- Dates -------------------------------------------------------------
// Transactions store local wall-clock time as "YYYY-MM-DDTHH:mm" (the format
// of <input type="datetime-local">). No time zones, so a purchase at 11pm
// never jumps to the next day.

const pad = (n) => String(n).padStart(2, '0');

export function toLocalString(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDate(local) {
    const [datePart, timePart = '00:00'] = local.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [h, min] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, h, min);
}

export const nowLocal = () => toLocalString(new Date());
export const currentMonthKey = () => nowLocal().slice(0, 7);

/** "2026-11" shifted by n months. */
export function shiftMonth(key, delta) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const monthDate = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1);
};

/** "2026-11" -> "November 2026" */
export const fmtMonth = (key) => monthDate(key).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
/** "2026-11" -> "Nov" */
export const fmtMonthShort = (key) => monthDate(key).toLocaleDateString('en-IN', { month: 'short' });
/** "2026-11" -> "November" */
export const fmtMonthName = (key) => monthDate(key).toLocaleDateString('en-IN', { month: 'long' });

/** "2026-11-09T14:30" -> "9 Nov 2026" */
export const fmtDate = (local) => toDate(local).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "2026-11-09T14:30" -> "2:30 pm" */
export const fmtTime = (local) => toDate(local).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

/** "2026-11-09" -> "Today" / "Yesterday" / "Sunday, 1 November 2026" */
export function fmtDay(day) {
    const today = nowLocal().slice(0, 10);
    const yesterday = toLocalString(new Date(Date.now() - 864e5)).slice(0, 10);
    if (day === today) return 'Today';
    if (day === yesterday) return 'Yesterday';
    return toDate(day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
