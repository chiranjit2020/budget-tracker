# Bt. Budget Tracker

A personal budget tracker for daily income and expenses in Indian rupees (₹).
It's an installable Progressive Web App (PWA) that works offline. Your data stays on your own device.

## Features

- **Dashboard:** this month's expense, income and net, recent transactions, a 6-month trend and the top expense categories.
- **Insights:** short notes on the dashboard: where this month is heading (repeating bills like rent aren't multiplied), which categories rose or fell, and your average spend per day. A month in progress is compared with the same days of last month, so early-month figures are fair.
- **Monthly budgets:** set a limit per expense category. The dashboard shows what's left (blue, amber at 80%, red when over) and how much you can spend per day for the rest of the month. Alerts appear when an expense crosses 80% or the limit, and the report shows budget vs actual.
- **Recurring transactions:** mark any entry to repeat every week, month or year (rent, salary, SIPs, EMIs, subscriptions). Due entries are added automatically when you open the app, including any missed while it was closed, and are marked ↻. Pause, resume or stop them in Settings.
- **Quick-add favourites:** tick "Save as a quick-add favourite" when adding (e.g. Tea ₹20, Metro ₹40). They appear as one-tap buttons on the dashboard (with Undo). Change a price or remove one in Settings (or via the dashboard's Edit link).
- **Add, edit or delete** any transaction (Spent / Received, amount, category, date & time, note). Deleting can be undone.
- **Payment method:** tag each entry as UPI, Cash, Card or Bank (tap it again to clear; older entries show *Not set*). The form remembers your last choice, the lists can filter by it, the dashboard shows *How you paid* this month, and the report and CSV include it.
- **Smarter add form:** it remembers the last category you used for expenses and for income. While you type a note, notes you've used before appear as chips (e.g. *Tea · Food & Drink · ₹20*); tap one to fill in its usual category and amount (an amount you've already typed is kept).
- **Monthly:** a year at a glance with an income vs expense chart and a table of totals and savings rate.
- **Expenses / Income:** full lists filtered by month and category, with search.
- **Report:** a printable monthly statement. Use *Print → Save as PDF* to keep a copy.
- **Settings:** your name and photo, custom categories, backup (JSON), Excel export (CSV), restore, and delete-all.
- **Light and dark mode:** Auto (follows your device), Light or Dark, switchable from the profile popup or Settings → Appearance.
- Works on phone, tablet and desktop. Installs to the home screen and runs offline.

## Your data and password

Everything is saved in your browser's storage (IndexedDB) on that device, **encrypted with your password**. Data from older versions, which used `localStorage`, is moved over automatically the first time the app opens. There's no server and nothing is uploaded.

- **Account:** the first time you open the app, you create an account (name + password, 8+ characters). After that the app opens on a login screen. It locks when closed or reloaded, auto-locks after you switch away (1 minute by default, adjustable in **Settings → Security**), and can be locked anytime from the profile popup.
- **How it's protected:** the password is never stored. It's stretched into an AES-256 key with PBKDF2-SHA256 (600,000 rounds, random salt), and all data is encrypted with AES-256-GCM (Web Crypto API). A wrong password simply can't decrypt the data. After 5 wrong attempts the login makes you wait.
- **No password recovery.** If you forget it, the data can't be decrypted. "Forgot password?" can only wipe the device and start over, so **export a backup regularly**. The dashboard reminds you if your last backup is over 30 days old.
- **Backups are encrypted** with your password (AES-256-GCM). Restoring one asks for the password you had when it was made; older unencrypted backups still import. CSV exports are plain spreadsheets, so keep those private.
- Data isn't shared between devices or browsers. Use **Settings → Export backup** and **Import backup** to move it.
- Amounts are stored as whole paise (integers), so totals never drift from rounding.
- Encryption needs a secure page: the app works on `https://` (GitHub Pages) and `http://localhost`.

## Install it as an app

- **Android / Chrome / Edge:** open the site, then use **Settings → Install app** (or the browser menu's *Install app*).
- **iPhone / iPad:** open the site in Safari, tap **Share → Add to Home Screen**.

Once installed, **long-press the app icon** (Android) or right-click it in the taskbar/dock (desktop) for shortcuts: **Add expense**, **Add income** and **Monthly overview**. The form opens right after you unlock. (iPhone doesn't support app-icon shortcuts for web apps.)

## Run locally

No build step and no dependencies. Serve the folder with any static server:

```sh
python -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk won't work, because ES modules and service workers need `http://`.)

To check the insight calculations: `node tests/insights.test.mjs` (Node 18+).

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
js/store.js             App state, validation, backup/import, totals
js/format.js            ₹ formatting, amount parsing, dates
js/ui.js                Dialogs, toasts, shared markup
js/pwa.js               Install prompt, service worker registration
js/vault.js             Password encryption (PBKDF2 + AES-GCM)
js/auth.js              Registration, login, lock, auto-lock
js/profile.js           Profile popup (avatar, name, photo, lock)
js/budgets.js           Monthly category budgets (dashboard, form, alerts)
js/backup.js            Encrypted backup export/import, CSV export, backup reminder
js/theme.js             Light/dark mode (Auto, Light, Dark)
js/views/*.js           Dashboard, Monthly, Expenses/Income, Report, Settings
icons/                  App icons (PNG + SVG)
images/logo.svg         Brand mark
```
