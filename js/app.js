// Entry point: routing, header and global click handling.

import { getState, subscribe, setSaveErrorHandler, runRecurring } from './store.js';
import { currentMonthKey, shiftMonth, fmtMonth, nowLocal, money } from './format.js';
import { openTxDialog, avatarHTML, toast } from './ui.js';
import { registerServiceWorker, onInstallChange } from './pwa.js';
import { isUnlocked } from './vault.js';
import { initAuth } from './auth.js';
import { openBudgetDialog } from './budgets.js';
import { downloadBackup, snoozeReminder } from './backup.js';
import './profile.js';
import * as dashboard from './views/dashboard.js';
import * as monthly from './views/monthly.js';
import * as report from './views/report.js';
import * as settings from './views/settings.js';
import { listView } from './views/transactions.js';

const routes = {
    '': dashboard,
    monthly,
    expenses: listView('expense'),
    income: listView('income'),
    transactions: listView('all'),
    report,
    settings,
};

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const subtitleEl = document.getElementById('page-subtitle');
const avatarEl = document.getElementById('top-avatar');
const addLabelEl = document.getElementById('add-label');

/** The header button says what it adds; on Expenses/Income it opens that type. */
const ADD_LABELS = { expenses: 'Add expense', income: 'Add income' };

/** Shared between views: the month being looked at. */
const ctx = {
    month: currentMonthKey(),
    entered: false,
    setMonth(key) {
        this.month = key;
        render();
    },
};

let lastRoute = null;

function currentRoute() {
    const route = location.hash.replace(/^#\/?/, '').split('?')[0];
    return Object.hasOwn(routes, route) ? route : '';
}

function render() {
    if (!isUnlocked()) return; // nothing is shown until the password unlocks the data
    const route = currentRoute();
    const page = routes[route];
    ctx.entered = route !== lastRoute;
    lastRoute = route;

    // Views attach their own handlers with on* properties; clear the previous view's.
    view.onclick = view.oninput = view.onchange = view.onsubmit = null;
    page.render(view, ctx);

    const { profile } = getState();
    const firstName = profile.name.split(/\s+/)[0];
    titleEl.textContent = page.title;
    addLabelEl.textContent = ADD_LABELS[route] ?? 'Add transaction';
    subtitleEl.textContent = route === ''
        ? `Hi ${firstName || 'there'}, here’s your summary for ${fmtMonth(ctx.month)}.`
        : '';
    subtitleEl.hidden = route !== '';
    avatarEl.innerHTML = avatarHTML(profile);
    document.title = route ? `${page.title} · Budget Tracker` : 'Budget Tracker';

    document.querySelectorAll('.nav a').forEach((a) => {
        const active = a.dataset.route === route || (route === 'transactions' && a.dataset.route === '');
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });

    if (ctx.entered) window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
    if (e.target.closest('[data-backup-now]')) {
        downloadBackup();
        return;
    }
    if (e.target.closest('[data-backup-later]')) {
        snoozeReminder();
        render();
        return;
    }
    if (e.target.closest('[data-budgets]')) {
        openBudgetDialog();
        return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
        const type = add.dataset.add || (currentRoute() === 'income' ? 'income' : 'expense');
        openTxDialog(null, { type });
        return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
        const tx = getState().transactions.find((t) => t.id === edit.dataset.edit);
        if (tx) openTxDialog(tx);
        return;
    }
    const month = e.target.closest('[data-month]');
    if (month) {
        ctx.setMonth(shiftMonth(ctx.month, Number(month.dataset.month)));
        return;
    }
    const goto = e.target.closest('[data-goto-month]');
    if (goto) {
        e.preventDefault();
        ctx.month = goto.dataset.gotoMonth;
        if (currentRoute() === '') render();
        else location.hash = '#/';
    }
});

setSaveErrorHandler(() => {
    toast('Could not save. Browser storage is full or blocked; export a backup and free up space.');
});

subscribe(render);
onInstallChange(() => {
    if (currentRoute() === 'settings') render();
});
window.addEventListener('hashchange', render);

// Keep "today" correct if the app stays open past midnight at the end of a month.
let lastSeenMonth = currentMonthKey();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    addDueRecurring();
    const now = currentMonthKey();
    if (now !== lastSeenMonth) {
        if (ctx.month === lastSeenMonth) ctx.month = now;
        lastSeenMonth = now;
        render();
    }
});

initAuth({
    onUnlock() {
        lastRoute = null; // treat it as a fresh visit
        ctx.month = currentMonthKey();
        render();
        addDueRecurring();
    },
    onLock() {
        // Remove everything private from the page while locked.
        view.onclick = view.oninput = view.onchange = view.onsubmit = null;
        view.replaceChildren();
        avatarEl.replaceChildren();
        subtitleEl.textContent = '';
    },
});
registerServiceWorker();
hideSplash();

/** Fade out the opening splash once the first screen is ready (fonts loaded, ~1.2s minimum). */
async function hideSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimum = reduced ? 500 : 1200; // ms since the page started loading
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]);
    await new Promise((r) => setTimeout(r, Math.max(0, minimum - performance.now())));
    splash.classList.add('splash-out');
    setTimeout(() => splash.remove(), 500); // after the fade
}

/** Add repeating transactions that are due, and say what was added. */
function addDueRecurring() {
    if (!isUnlocked()) return;
    const added = runRecurring(nowLocal().slice(0, 10));
    if (!added.length) return;
    if (added.length === 1) {
        const t = added[0];
        toast(`Added automatically: ${t.note || t.category} ${money(t.amount)}`);
    } else {
        const names = [...new Set(added.map((t) => t.note || t.category))];
        const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} and more` : names.join(', ');
        toast(`Added ${added.length} repeating transactions: ${list}`);
    }
}
