import { getState, totals } from '../store.js';
import { money, esc, fmtMonth } from '../format.js';
import { icon, txGroups, emptyState } from '../ui.js';

const TITLES = { expense: 'Expenses', income: 'Income', all: 'All transactions' };

/** One list view per type ("expense", "income" or "all"), each remembering its own filters. */
export function listView(type) {
    const filters = { month: '', category: '', q: '' };

    function matches(t) {
        if (type !== 'all' && t.type !== type) return false;
        if (filters.month !== 'all' && !t.date.startsWith(filters.month)) return false;
        if (filters.category && t.category !== filters.category) return false;
        if (filters.q) {
            const q = filters.q.toLowerCase();
            if (!t.note.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) return false;
        }
        return true;
    }

    function renderResults(root) {
        const { transactions } = getState();
        const list = transactions.filter(matches);
        const t = totals(list);
        const summary = root.querySelector('#list-summary');
        const results = root.querySelector('#list-results');

        if (!list.length) {
            summary.innerHTML = '';
            const anyOfType = transactions.some((x) => type === 'all' || x.type === type);
            const label = type === 'all' ? 'transactions' : TITLES[type].toLowerCase();
            results.innerHTML = anyOfType
                ? emptyState(`No ${label} match these filters.`)
                : emptyState(`No ${label} recorded yet.`, type === 'all' ? '' : type);
            return;
        }

        const count = `${list.length} ${list.length === 1 ? 'transaction' : 'transactions'}`;
        summary.innerHTML =
            type === 'all'
                ? `<span>${count}</span><span class="expense">Spent ${money(t.expense)}</span><span class="income">Received ${money(t.income)}</span>`
                : `<span>${count}</span><span class="${type}">Total ${money(type === 'income' ? t.income : t.expense)}</span>`;
        results.innerHTML = txGroups(list, { dayTotals: true });
    }

    return {
        title: TITLES[type],
        render(root, ctx) {
            if (ctx.entered) {
                filters.month = ctx.month;
                filters.category = '';
                filters.q = '';
            }
            const { transactions, categories } = getState();
            const relevant = transactions.filter((t) => type === 'all' || t.type === type);

            const months = new Set(relevant.map((t) => t.date.slice(0, 7)));
            months.add(ctx.month);
            if (filters.month !== 'all') months.add(filters.month);
            const monthOptions = [...months].sort().reverse();

            const cats = new Set(type === 'all' ? [...categories.expense, ...categories.income] : categories[type]);
            relevant.forEach((t) => cats.add(t.category));
            if (filters.category) cats.add(filters.category);

            root.innerHTML = `
            <div class="toolbar">
                <label><span class="sr-only">Month</span>
                    <select data-f="month">
                        <option value="all"${filters.month === 'all' ? ' selected' : ''}>All time</option>
                        ${monthOptions.map((m) => `<option value="${m}"${m === filters.month ? ' selected' : ''}>${fmtMonth(m)}</option>`).join('')}
                    </select>
                </label>
                <label><span class="sr-only">Category</span>
                    <select data-f="category">
                        <option value="">All categories</option>
                        ${[...cats].sort((a, b) => a.localeCompare(b)).map((c) => `<option${c === filters.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}
                    </select>
                </label>
                <label class="search">${icon('search')}<span class="sr-only">Search</span>
                    <input type="search" data-f="q" placeholder="Search notes or categories" value="${esc(filters.q)}" autocomplete="off">
                </label>
            </div>
            <p class="list-summary" id="list-summary" aria-live="polite"></p>
            <div id="list-results" class="block"></div>`;

            root.oninput = root.onchange = (e) => {
                const field = e.target.dataset?.f;
                if (!field) return;
                filters[field] = e.target.value;
                if (field === 'month' && filters.month !== 'all') ctx.month = filters.month;
                renderResults(root);
            };
            renderResults(root);
        },
    };
}
