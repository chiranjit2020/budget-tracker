// App state. It lives in memory while unlocked and is saved encrypted
// through the vault (see vault.js); nothing is written in plain text.

import * as vault from './vault.js';

export const DEFAULT_CATEGORIES = {
    expense: ['Food & Drink', 'Groceries', 'Household', 'Rent', 'Bills & Utilities', 'Transport', 'Shopping', 'Health', 'Education', 'Entertainment', 'Travel', 'Other'],
    income: ['Salary', 'Business', 'Freelance', 'Interest', 'Gift', 'Refund', 'Other'],
};

const TYPES = ['expense', 'income'];
const listeners = new Set();
let onSaveError = (err) => console.error(err);

const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const byDateDesc = (a, b) => b.date.localeCompare(a.date);

function blank() {
    return {
        version: 1,
        profile: { name: '', photo: '' },
        categories: structuredClone(DEFAULT_CATEGORIES),
        transactions: [],
        budgets: {}, // { [expense category]: monthly limit in paise }
        recurring: [], // repeating transactions (see cleanRule)
        favorites: [], // one-tap "quick add" entries (see cleanFavorite)
        lastCategory: { expense: '', income: '' }, // pre-selected in the add form
        lastBackup: '',
    };
}

function cleanTx(t) {
    if (!t || !TYPES.includes(t.type)) return null;
    const amount = Math.round(Number(t.amount));
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;
    if (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t.date)) return null;
    const tx = {
        id: typeof t.id === 'string' && t.id ? t.id : uid(),
        type: t.type,
        amount,
        category: String(t.category ?? '').trim().slice(0, 40) || 'Other',
        note: String(t.note ?? '').trim().slice(0, 200),
        date: t.date.slice(0, 16),
    };
    if (typeof t.recurringId === 'string' && t.recurringId) tx.recurringId = t.recurringId;
    return tx;
}

// ---- Recurring schedules ------------------------------------------------------

export const FREQUENCIES = ['weekly', 'monthly', 'yearly'];

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate(); // m is 0-based

/**
 * The next date ('YYYY-MM-DD') after `from` for a rule. Monthly and yearly
 * rules keep the day they started on; in shorter months they fall on the
 * last day (e.g. the 31st becomes 30 Nov, 28 Feb).
 */
export function nextOccurrence(rule, from) {
    const [y, m, d] = from.split('-').map(Number);
    if (rule.freq === 'weekly') return isoDay(new Date(y, m - 1, d + 7));
    const [sy, sm, sd] = rule.start.split('-').map(Number);
    if (rule.freq === 'monthly') {
        const ny = m === 12 ? y + 1 : y;
        const nm = m === 12 ? 0 : m; // 0-based month after `from`
        return isoDay(new Date(ny, nm, Math.min(sd, daysIn(ny, nm))));
    }
    // yearly
    return isoDay(new Date(y + 1, sm - 1, Math.min(sd, daysIn(y + 1, sm - 1))));
}

function cleanRule(r) {
    if (!r || !TYPES.includes(r.type) || !FREQUENCIES.includes(r.freq)) return null;
    const amount = Math.round(Number(r.amount));
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!Number.isSafeInteger(amount) || amount <= 0 || !day.test(r.start) || !day.test(r.next)) return null;
    return {
        id: typeof r.id === 'string' && r.id ? r.id : uid(),
        type: r.type,
        amount,
        category: String(r.category ?? '').trim().slice(0, 40) || 'Other',
        note: String(r.note ?? '').trim().slice(0, 200),
        freq: r.freq,
        start: r.start,
        next: r.next,
        time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '09:00',
        active: r.active !== false,
    };
}

/** Keep only positive whole-paise limits keyed by a category name. */
function cleanBudgets(input) {
    const out = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
    for (const [cat, value] of Object.entries(input)) {
        const name = String(cat).trim().slice(0, 40);
        const amount = Math.round(Number(value));
        if (name && Number.isSafeInteger(amount) && amount > 0) out[name] = amount;
    }
    return out;
}

/** Validate and tidy data loaded from storage or an imported backup. */
export function normalize(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) {
        throw new Error('This file is not a Budget Tracker backup.');
    }
    const s = blank();
    if (data.profile && typeof data.profile === 'object') {
        s.profile.name = String(data.profile.name ?? '').trim().slice(0, 60);
        const photo = data.profile.photo;
        s.profile.photo = typeof photo === 'string' && photo.startsWith('data:image/') ? photo : '';
    }
    for (const type of TYPES) {
        const list = data.categories?.[type];
        if (Array.isArray(list)) {
            const clean = [...new Set(list.map((c) => String(c).trim().slice(0, 40)).filter(Boolean))];
            if (clean.length) s.categories[type] = clean;
        }
    }
    s.transactions = data.transactions.map(cleanTx).filter(Boolean).sort(byDateDesc);
    s.budgets = cleanBudgets(data.budgets);
    s.recurring = Array.isArray(data.recurring) ? data.recurring.map(cleanRule).filter(Boolean) : [];
    s.favorites = Array.isArray(data.favorites) ? data.favorites.map(cleanFavorite).filter(Boolean).slice(0, MAX_FAVORITES) : [];
    for (const type of TYPES) {
        const c = data.lastCategory?.[type];
        if (typeof c === 'string') s.lastCategory[type] = c.trim().slice(0, 40);
    }
    s.lastBackup = typeof data.lastBackup === 'string' ? data.lastBackup : '';
    return s;
}

let state = blank();
let onExternalLock = () => {};

// Saves are encrypted asynchronously; chaining them keeps them in order.
let writeChain = Promise.resolve();

function emit() {
    for (const fn of listeners) fn(state);
}

function persist() {
    const snapshot = state;
    writeChain = writeChain.then(() => vault.save(snapshot)).catch((err) => onSaveError(err));
}

/** Apply a change to a copy of the state, publish it, then save it encrypted. */
function commit(mutate) {
    if (!vault.isUnlocked()) return false;
    const draft = structuredClone(state);
    mutate(draft);
    draft.transactions.sort(byDateDesc);
    state = draft;
    emit();
    persist();
    return true;
}

// Keep several open tabs/windows in sync. If another tab changed the
// password or reset the app, our key no longer works, so lock this tab.
vault.onExternalChange(async (exists) => {
    if (!vault.isUnlocked()) return;
    const latest = exists ? await vault.readLatest() : null;
    if (latest) {
        state = normalize(latest);
        emit();
    } else {
        onExternalLock();
    }
});

// ---- Session ----------------------------------------------------------------

/** Called after a successful login/registration with the decrypted data. */
export function openSession(data) {
    state = data ? normalize(data) : blank();
    emit();
}

/** Forget everything in memory (on lock). */
export function closeSession() {
    state = blank();
}

/** Resolves once all pending encrypted saves are written. */
export const flush = () => writeChain;

export function setExternalLockHandler(fn) {
    onExternalLock = fn;
}

/** Re-encrypt with a new password, after any pending saves. Resolves to false if `current` is wrong. */
export function changePassword(current, next) {
    const result = writeChain.then(() => vault.changePassword(current, next, state));
    writeChain = result.catch(() => {});
    return result;
}

// ---- Public API ---------------------------------------------------------

export const getState = () => state;

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function setSaveErrorHandler(fn) {
    onSaveError = fn;
}

/**
 * Add a transaction. With `repeat` ('weekly' | 'monthly' | 'yearly') it also
 * creates a recurring rule that starts on this transaction's date.
 */
export function addTx(input, { repeat = '', remember = false } = {}) {
    const tx = cleanTx({ ...input, id: uid() });
    if (!tx) return null;
    let rule = null;
    if (FREQUENCIES.includes(repeat)) {
        const start = tx.date.slice(0, 10);
        const draft = { ...tx, id: uid(), freq: repeat, start, time: tx.date.slice(11, 16) };
        rule = cleanRule({ ...draft, next: nextOccurrence(draft, start) });
        tx.recurringId = rule.id;
    }
    return commit((d) => {
        d.transactions.push(tx);
        if (rule) d.recurring.push(rule);
        if (remember) d.lastCategory[tx.type] = tx.category;
    }) ? tx : null;
}

/**
 * Add every recurring transaction that is due up to `today` ('YYYY-MM-DD'),
 * catching up on missed ones. Returns the transactions that were added.
 */
export function runRecurring(today) {
    if (!state.recurring.some((r) => r.active && r.next <= today)) return [];
    const added = [];
    commit((d) => {
        for (const r of d.recurring) {
            let guard = 0; // never loop forever on bad data
            while (r.active && r.next <= today && guard++ < 400) {
                const tx = cleanTx({ ...r, id: uid(), date: `${r.next}T${r.time}`, recurringId: r.id });
                d.transactions.push(tx);
                added.push(tx);
                r.next = nextOccurrence(r, r.next);
            }
        }
    });
    return added;
}

/** Pause or resume. Resuming skips dates missed while paused instead of back-filling them. */
export function setRecurringActive(id, active, today) {
    return commit((d) => {
        const r = d.recurring.find((x) => x.id === id);
        if (!r) return;
        r.active = active;
        if (active) {
            let guard = 0;
            while (r.next < today && guard++ < 400) r.next = nextOccurrence(r, r.next);
        }
    });
}

// ---- Quick-add favourites --------------------------------------------------------------

export const MAX_FAVORITES = 12;

function cleanFavorite(f) {
    const tx = cleanTx({ ...f, date: '2000-01-01T00:00' }); // reuse the same validation
    if (!tx) return null;
    return { id: tx.id, type: tx.type, amount: tx.amount, category: tx.category, note: tx.note };
}

const sameFavorite = (a, b) => a.type === b.type && a.amount === b.amount && a.category === b.category && a.note.toLowerCase() === b.note.toLowerCase();

/** Save an entry as a favourite. Returns 'added', 'exists' or 'full'. */
export function addFavorite(input) {
    const fav = cleanFavorite({ ...input, id: uid() });
    if (!fav) return null;
    if (state.favorites.some((f) => sameFavorite(f, fav))) return 'exists';
    if (state.favorites.length >= MAX_FAVORITES) return 'full';
    return commit((d) => d.favorites.push(fav)) ? 'added' : null;
}

/** Change a favourite's name, amount or category. Returns 'updated', 'exists' (clashes with another) or null. */
export function updateFavorite(id, input) {
    const current = state.favorites.find((f) => f.id === id);
    if (!current) return null;
    const fav = cleanFavorite({ ...current, ...input, id });
    if (!fav) return null;
    if (state.favorites.some((f) => f.id !== id && sameFavorite(f, fav))) return 'exists';
    return commit((d) => {
        const i = d.favorites.findIndex((f) => f.id === id);
        if (i >= 0) d.favorites[i] = fav;
    }) ? 'updated' : null;
}

export function removeFavorite(id) {
    return commit((d) => {
        d.favorites = d.favorites.filter((f) => f.id !== id);
    });
}

/** Stop a repeat. Transactions it already added stay. */
export function deleteRecurring(id) {
    return commit((d) => {
        d.recurring = d.recurring.filter((r) => r.id !== id);
    });
}

export function updateTx(id, input) {
    const old = state.transactions.find((t) => t.id === id);
    const tx = cleanTx({ ...input, id, recurringId: old?.recurringId }); // editing keeps the repeat link
    if (!tx) return null;
    return commit((d) => {
        const i = d.transactions.findIndex((t) => t.id === id);
        if (i >= 0) d.transactions[i] = tx;
        else d.transactions.push(tx);
    }) ? tx : null;
}

/** Returns the removed transaction (so it can be restored), or null. */
export function deleteTx(id) {
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return null;
    return commit((d) => {
        d.transactions = d.transactions.filter((t) => t.id !== id);
    }) ? tx : null;
}

export function restoreTx(tx) {
    return commit((d) => {
        if (!d.transactions.some((t) => t.id === tx.id)) d.transactions.push(tx);
    });
}

export function setProfile(patch) {
    return commit((d) => Object.assign(d.profile, patch));
}

export function addCategory(type, name) {
    const clean = String(name).trim().slice(0, 40);
    if (!clean || state.categories[type].some((c) => c.toLowerCase() === clean.toLowerCase())) return false;
    return commit((d) => d.categories[type].push(clean));
}

export function removeCategory(type, name) {
    if (state.categories[type].length <= 1) return false;
    return commit((d) => {
        d.categories[type] = d.categories[type].filter((c) => c !== name);
        if (type === 'expense') delete d.budgets[name];
    });
}

/** Replace all monthly budgets: { category: paise }. Empty/zero entries mean "no limit". */
export function setBudgets(budgets) {
    const clean = cleanBudgets(budgets);
    return commit((d) => {
        d.budgets = clean;
    });
}

/** Merge a backup into the current data. Returns the number of new transactions, or null on failure. Throws on invalid files. */
export function importBackup(data) {
    const incoming = normalize(data);
    let added = 0;
    const ok = commit((d) => {
        const ids = new Set(d.transactions.map((t) => t.id));
        for (const t of incoming.transactions) {
            if (!ids.has(t.id)) {
                d.transactions.push(t);
                added++;
            }
        }
        for (const type of TYPES) {
            for (const c of incoming.categories[type]) {
                if (!d.categories[type].includes(c)) d.categories[type].push(c);
            }
        }
        for (const fav of incoming.favorites) {
            if (d.favorites.length < MAX_FAVORITES && !d.favorites.some((x) => sameFavorite(x, fav))) d.favorites.push(fav);
        }
        const ruleIds = new Set(d.recurring.map((r) => r.id));
        for (const r of incoming.recurring) if (!ruleIds.has(r.id)) d.recurring.push(r);
        for (const [cat, limit] of Object.entries(incoming.budgets)) {
            if (!(cat in d.budgets)) d.budgets[cat] = limit; // keep budgets you already set
        }
        if (!d.profile.name) d.profile.name = incoming.profile.name;
        if (!d.profile.photo) d.profile.photo = incoming.profile.photo;
    });
    return ok ? added : null;
}

export function exportBackup() {
    return { app: 'budget-tracker', exportedAt: new Date().toISOString(), ...state };
}

export function markBackedUp() {
    return commit((d) => {
        d.lastBackup = new Date().toISOString();
    });
}

export function clearAll() {
    return commit((d) => {
        const name = d.profile.name; // the account's name stays
        Object.assign(d, blank());
        d.profile.name = name;
    });
}

// ---- Queries (pure helpers) --------------------------------------------

/** The category to pre-select when adding: the last one used for this type, if it still exists. */
export function lastCategory(type) {
    const c = state.lastCategory[type];
    return c && state.categories[type].includes(c) ? c : '';
}

// Notes used before, per type, rebuilt only when the transactions change.
let noteIndexFor = null;
let noteIndex = null;

/** The value seen most often in a Map of counts; ties go to the one seen first (the most recent). */
const mostCommon = (counts) => [...counts].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];

function buildNoteIndex() {
    if (noteIndexFor === state.transactions) return noteIndex;
    const groups = { expense: new Map(), income: new Map() };
    for (const t of state.transactions) { // newest first
        if (!t.note) continue;
        const key = t.note.toLowerCase();
        let g = groups[t.type].get(key);
        if (!g) groups[t.type].set(key, (g = { note: t.note, key, count: 0, categories: new Map(), amounts: new Map() }));
        g.count++;
        g.categories.set(t.category, (g.categories.get(t.category) ?? 0) + 1);
        g.amounts.set(t.amount, (g.amounts.get(t.amount) ?? 0) + 1);
    }
    noteIndex = {};
    for (const type of TYPES) {
        noteIndex[type] = [...groups[type].values()].map((g) => ({
            note: g.note,
            key: g.key,
            count: g.count,
            category: mostCommon(g.categories),
            amount: mostCommon(g.amounts),
        }));
    }
    noteIndexFor = state.transactions;
    return noteIndex;
}

/**
 * Notes used before that match what's being typed, each with its usual
 * category and amount. Notes starting with the text come first, then ones
 * with a word starting with it; within each, the most used first.
 */
export function noteSuggestions(type, text, limit = 4) {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const rank = (s) => (s.key.startsWith(q) ? 0 : s.key.split(/[\s,./-]+/).some((w) => w.startsWith(q)) ? 1 : 2);
    return buildNoteIndex()[type]
        .map((s) => ({ s, r: rank(s) }))
        .filter((x) => x.r < 2)
        .sort((a, b) => a.r - b.r || b.s.count - a.s.count) // stable sort keeps newest first on ties
        .slice(0, limit)
        .map((x) => x.s);
}

export const inMonth = (list, monthKey) => list.filter((t) => t.date.startsWith(monthKey));

export function totals(list) {
    let income = 0;
    let expense = 0;
    for (const t of list) {
        if (t.type === 'income') income += t.amount;
        else expense += t.amount;
    }
    return { income, expense, net: income - expense, count: list.length };
}

/** [{ category, amount, count }] sorted by amount, largest first. */
export function byCategory(list) {
    const map = new Map();
    for (const t of list) {
        const row = map.get(t.category) ?? { category: t.category, amount: 0, count: 0 };
        row.amount += t.amount;
        row.count++;
        map.set(t.category, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** Group an already date-sorted list into [{ day: 'YYYY-MM-DD', items }]. */
export function byDay(list) {
    const groups = [];
    for (const t of list) {
        const day = t.date.slice(0, 10);
        const last = groups.at(-1);
        if (last && last.day === day) last.items.push(t);
        else groups.push({ day, items: [t] });
    }
    return groups;
}
