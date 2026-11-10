// Service worker: makes Budget Tracker load and work offline.
// Strategy: network first (so updates show up right away when online),
// falling back to the cached copy when offline or the network is slow.
// Bump VERSION when files are added or removed from APP_SHELL.

const VERSION = 'bt-v1.12.0';
const FONT_CACHE = 'bt-fonts-v2'; // renamed so old font files get cleaned up
const NETWORK_TIMEOUT_MS = 3000;

const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './css/style.css',
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
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
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

async function cacheFirst(request) {
    const cache = await caches.open(FONT_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
    } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cacheFirst(request));
    }
});
