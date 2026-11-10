// Service worker: makes Budget Tracker load and work offline.
// Strategy: network first (so updates show up right away when online),
// falling back to the cached copy when offline or the network is slow.
// Bump VERSION when files are added or removed from APP_SHELL.

const VERSION = 'bt-v1.36.0';
const NETWORK_TIMEOUT_MS = 3000;

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

async function networkFirst(request) {
    const cache = await caches.open(VERSION);
    const network = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    });
    const cached =
        (await cache.match(request, { ignoreSearch: true })) ||
        (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);

    if (!cached) return network;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    return Promise.race([network.catch(() => cached), timeout]);
}


self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
    }
});
