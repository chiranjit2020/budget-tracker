// All app data lives in localStorage on this device, under one namespaced key.
// (GitHub Pages serves every repo of a user from the same origin, so a
// generic key like "userName" could clash with another project.)

const KEY = 'budget-tracker.v1';

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
        lastBackup: '',
    };
}

function cleanTx(t) {
    if (!t || !TYPES.includes(t.type)) return null;
    const amount = Math.round(Number(t.amount));
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;
    if (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t.date)) return null;
    return {
        id: typeof t.id === 'string' && t.id ? t.id : uid(),
        type: t.type,
        amount,
        category: String(t.category ?? '').trim().slice(0, 40) || 'Other',
        note: String(t.note ?? '').trim().slice(0, 200),
        date: t.date.slice(0, 16),
    };
}

/** Validate and tidy data loaded from storage or an imported backup. */
function normalize(data) {
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
    s.lastBackup = typeof data.lastBackup === 'string' ? data.lastBackup : '';
    return s;
}

function load() {
    let raw = null;
    try {
        raw = localStorage.getItem(KEY);
    } catch {
        return blank(); // storage blocked (e.g. strict privacy mode)
    }
    if (!raw) return blank();
    try {
        return normalize(JSON.parse(raw));
    } catch (err) {
        // Never silently throw away data: keep the unreadable copy aside.
        try { localStorage.setItem(`${KEY}.unreadable.${Date.now()}`, raw); } catch { /* ignore */ }
        console.error('Saved data could not be read; a copy was kept.', err);
        return blank();
    }
}

let state = load();

function emit() {
    for (const fn of listeners) fn(state);
}

/** Apply a change to a copy of the state, persist it, then publish it. */
function commit(mutate) {
    const draft = structuredClone(state);
    mutate(draft);
    draft.transactions.sort(byDateDesc);
    try {
        localStorage.setItem(KEY, JSON.stringify(draft));
    } catch (err) {
        onSaveError(err);
        return false;
    }
    state = draft;
    emit();
    return true;
}

// Keep several open tabs/windows in sync.
window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
        state = load();
        emit();
    }
});

// ---- Public API ---------------------------------------------------------

export const getState = () => state;

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function setSaveErrorHandler(fn) {
    onSaveError = fn;
}

export function addTx(input) {
    const tx = cleanTx({ ...input, id: uid() });
    if (!tx) return null;
    return commit((d) => d.transactions.push(tx)) ? tx : null;
}

export function updateTx(id, input) {
    const tx = cleanTx({ ...input, id });
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
        Object.assign(d, blank());
    });
}

// ---- Queries (pure helpers) --------------------------------------------

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
