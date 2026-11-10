// Service worker: makes Budget Tracker open fast and work offline.
// Strategy: open from this version's saved copy straight away (no waiting on a
// slow network), and fetch anything not saved yet. Updates arrive as a new
// sw.js: it saves the new files in the background, takes over, and the page
// reloads into the new version while it's on the lock screen (see pwa.js).
// Bump VERSION on every release, and when files are added to or removed from APP_SHELL.

const VERSION = 'bt-v1.36.4';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './css/style.css',
    './css/fonts.css',
    './fonts/barlow-digits-400.woff2',
    './fonts/barlow-digits-500.woff2',
    './fonts/barlow-digits-600.woff2',
    './fonts/barlow-digits-700.woff2',
    './fonts/barlow-digits-800.woff2',
    './fonts/manrope-latin-ext.woff2',
    './fonts/manrope-latin.woff2',
    './js/app.js',
    './js/store.js',
    './js/format.js',
    './js/ui.js',
    './js/pwa.js',
    './js/profile.js',
    './js/vault.js',
    './js/auth.js',
    './js/budgets.js',
    './js/backup.js',
    './js/theme.js',
    './js/insights.js',
    './js/calendar.js',
    './js/goals.js',
    './js/goals-ui.js',
    './js/debts.js',
    './js/debts-ui.js',
    './js/folds.js',
    './js/pie.js',
    './js/biometric.js',
    './js/passwords.js',
    './js/boot.js',
    './js/sound.js',
    './js/upcoming.js',
    './js/vendor/chart.umd.min.js',
    './js/views/dashboard.js',
    './js/views/transactions.js',
    './js/views/monthly.js',
    './js/views/report.js',
    './js/views/settings.js',
    './images/logo.svg',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/shortcut-expense-96.png',
    './icons/shortcut-income-96.png',
    './icons/shortcut-monthly-96.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(VERSION)
            .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

async function fromCache(request) {
    const cache = await caches.open(VERSION);
    const cached =
        (await cache.match(request, { ignoreSearch: true })) ||
        (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        event.respondWith(fromCache(request));
    }
});
