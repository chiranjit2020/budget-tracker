# Bt. Budget Tracker

A personal budget tracker for daily income and expenses in Indian rupees (₹).
It's an installable Progressive Web App (PWA) that works offline. Your data stays on your own device.

## Features

- **Dashboard:** this month's expense, income and net, recent transactions, a 6-month trend and the top expense categories.
- **Add, edit or delete** any transaction (Spent / Received, amount, category, date & time, note). Deleting can be undone.
- **Monthly:** a year at a glance with an income vs expense chart and a table of totals and savings rate.
- **Expenses / Income:** full lists filtered by month and category, with search.
- **Report:** a printable monthly statement. Use *Print → Save as PDF* to keep a copy.
- **Settings:** your name and photo, custom categories, backup (JSON), Excel export (CSV), restore, and delete-all.
- Works on phone, tablet and desktop. Installs to the home screen and runs offline.

## Your data

Everything is saved in your browser's `localStorage` on that device. There are no accounts and no server.

- Data isn't shared between devices or browsers. Use **Settings → Export backup** and **Import backup** to move it.
- Clearing your browser's site data deletes it, so **export a backup regularly**. Settings shows when you last did.
- Amounts are stored as whole paise (integers), so totals never drift from rounding.

## Install it as an app

- **Android / Chrome / Edge:** open the site, then use **Settings → Install app** (or the browser menu's *Install app*).
- **iPhone / iPad:** open the site in Safari, tap **Share → Add to Home Screen**.

## Run locally

No build step and no dependencies. Serve the folder with any static server:

```sh
python -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk won't work, because ES modules and service workers need `http://`.)

## Deploy to GitHub Pages

1. Push to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment**, set *Source: Deploy from a branch*, then choose the `main` branch and `/ (root)`.
3. The site is published at `https://<user>.github.io/budget-tracker/`.

**When you change files:** bump `VERSION` in `sw.js` (e.g. `bt-v1.0.1`). The service worker fetches from the network first, so online users get updates straight away anyway, but bumping the version refreshes the offline copy and clears old caches. If you add or rename a file, also add it to `APP_SHELL` in `sw.js`.

## Project structure

```
index.html              App shell, icon sprite, dialogs
manifest.webmanifest    PWA manifest
sw.js                   Service worker (offline support)
css/style.css           All styles (responsive + print)
js/app.js               Routing, header, global events
js/store.js             Data storage, validation, backup/import, totals
js/format.js            ₹ formatting, amount parsing, dates
js/ui.js                Dialogs, toasts, shared markup
js/pwa.js               Install prompt, service worker registration
js/views/*.js           Dashboard, Monthly, Expenses/Income, Report, Settings
icons/                  App icons (PNG + SVG)
images/logo.svg         Brand mark
```
