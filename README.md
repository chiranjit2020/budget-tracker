# Bt. Budget Tracker

A personal budget tracker for daily income and expenses in Indian rupees (₹).
It's an installable Progressive Web App (PWA) that works offline. Your data stays on your own device, encrypted with your password.

**Live app:** https://gitussr.github.io/budget-tracker/

## Features

- **Dashboard:** this month's spending, income and what's left over, then your everyday cards (insights, coming up, recent entries, budgets, goals, money given & taken) and below them the deeper ones (spending calendar, a doughnut chart of spending by category with the month's total in the middle, how you paid, 6-month trend). Tap any card's title to fold it; the app remembers which ones you folded on that device. Features you haven't used yet sit together in one small "More you can do" card.
- **Coming up:** what your repeats will add in the next 7 or 30 days (bills to pay and money coming in), with totals and a **Skip** link for the next one, e.g. *Gym ₹200 in 2 days · Netflix ₹649 in 4 days*. When nothing is due it says what comes next.
- **Insights:** short notes on the dashboard: where this month is heading (repeating bills like rent aren't multiplied), which categories rose or fell, and your average spend per day. A month in progress is compared with the same days of last month, so early-month figures are fair.
- **Spending calendar:** the month as a heat-map on the dashboard; darker days are the ones you spent most on (ranked against each other, so one big bill doesn't wash out the rest). Tap a day to see its entries.
- **Savings goals:** e.g. *Goa trip ₹30,000 by 10 Mar*. Add or withdraw money (with Undo) and see the progress and how much to save each month to get there. **Show history** lists every add and withdrawal with how much was saved after each; remove a mistaken one (with Undo), as long as that wouldn't take the goal below ₹0. Goals are kept apart from expenses, so setting money aside doesn't count as spending.
- **Given & taken:** note money you gave someone or took from someone (name, amount, optional return date and note). The card shows **You will get** and **You will give** totals and lines like *You will get ₹200 from Rahul*. Tap **Got it back** / **I returned it** for full or part returns (with Undo), or **Remind** to send a friendly WhatsApp/SMS message (copied on desktop). Kept apart from expenses and income.
- **Monthly budgets:** set a limit per expense category. The dashboard shows what's left (blue, amber at 80%, red when over) and how much you can spend per day for the rest of the month. Alerts appear when an expense crosses 80% or the limit, and the report shows budget vs actual.
- **Repeats:** mark any entry to repeat every week, month or year (rent, salary, SIPs, EMIs, subscriptions). Due entries are added automatically when you open the app, including any missed while it was closed, and are marked ↻. A repeat can **stop** after a set number of times or on a date (e.g. a 12-month EMI): you see *6 of 12 paid*, and after the last one it finishes by itself (*Finished: all 12 paid*). For bills that change, like electricity, tick **Ask me the amount each time**: when it's due, a **Bills to confirm** card on the dashboard asks how much it was (last time's amount is filled in), with **Add** or **Skip this time**. To miss just the next one of any repeat (e.g. travelling next month), tap **Skip** next to it in *Coming up* or Settings → Repeats (with Undo); for an EMI the last payment simply moves one step later. Change one's amount, name, category or payment method with the pencil button (e.g. rent goes up: it applies from the next one, and entries already added stay as they were), or pause, resume or stop them in Settings → Repeats.
- **Quick-add favourites:** tick "Save as a quick-add favourite" when adding (e.g. Tea ₹20, Metro ₹40). They appear as one-tap buttons on the dashboard (with Undo). Change a name, price, category or payment method, or remove one, in Settings (or via the dashboard's Edit link).
- **Add, edit or delete** any transaction (Spent / Received, amount, category, date & time, note). Deleting can be undone.
- **Payment method:** tag each entry as UPI, Cash, Card or Bank (tap it again to clear; older entries show *Not set*). The form remembers your last choice, the lists can filter by it, the dashboard shows *How you paid* this month, and the report and CSV include it.
- **Smarter add form:** it remembers the last category you used for expenses and for income. While you type a note, notes you've used before appear as chips (e.g. *Tea · Food & Drink · ₹20*); tap one to fill in its usual category and amount (an amount you've already typed is kept).
- **Monthly:** a year at a glance with an income vs expense chart and a table showing what was left over each month and how much of your income you saved.
- **Expenses / Income:** full lists filtered by month, category and payment method, with search.
- **Report:** a printable monthly statement (categories, budget vs actual, payment methods, every entry). Use *Print → Save as PDF* to keep a copy.
- **Settings:** categories, quick-add favourites, **Security** (auto-lock, fingerprint or face unlock, change password, lock now), **Appearance** (light/dark, unlock chime), **Repeats**, backup (encrypted JSON), Excel export (CSV), restore, install, and delete-all. Your name and photo are in the profile popup.
- **Unlock chime:** a soft three-note "ta-da" when you unlock (made with Web Audio, no sound files). Turn it off in Settings → Appearance.
- **Fonts:** Manrope for text, Barlow for digits (0–9) only. Both ship with the app (`fonts/`, SIL Open Font License), so nothing is loaded from other sites.
- **Light and dark mode:** Auto (follows your device), Light or Dark (a black & gold scheme), switchable from the profile popup or Settings → Appearance.
- Works on phone, tablet and desktop. Installs to the home screen and runs offline.

## Your data and password

Everything is saved in your browser's storage (IndexedDB) on that device, **encrypted with your password**. Data from older versions, which used `localStorage`, is moved over automatically the first time the app opens. There's no server and nothing is uploaded.

- **Account:** the first time you open the app, you create an account (name + password of 8+ characters that isn't easy to guess, so not `12345678`, `password` or your name). After that the app opens on a login screen. It locks when closed or reloaded, auto-locks after you switch away (1 minute by default, adjustable in **Settings → Security**), and can be locked anytime from the profile popup.
- **How it's protected:** the password is never stored. It's stretched into an AES-256 key with PBKDF2-SHA256 (600,000 rounds, random salt), and all data is encrypted with AES-256-GCM (Web Crypto API). A wrong password simply can't decrypt the data. After 5 wrong attempts the login makes you wait.
- **Fingerprint or face unlock (optional):** turn it on in **Settings → Security** (it asks for your password once). Your phone's fingerprint/face check then gives back a secret that unlocks a locked copy of your data key, using passkeys (WebAuthn with the PRF extension). The password is still never stored, and it keeps working as well. Changing the password or resetting the app turns this off. It only appears where the device and browser support it (e.g. Android Chrome, iPhone Safari on iOS 18+, Windows Hello).
- **Security review:** see [SECURITY.md](SECURITY.md) for what was tested (OWASP Top 10 2025, MITRE ATT&CK), what was fixed, and the risks no web app can remove. Passwords that are too easy to guess (e.g. `12345678`, `password`, your own name) are refused, and the wait after wrong passwords survives a reload.
- **No password recovery.** If you forget it, the data can't be decrypted. "Forgot password?" can only wipe the device and start over, so **export a backup regularly**. The dashboard reminds you if your last backup is over 30 days old.
- **Backups are encrypted** with your password (AES-256-GCM). Restoring one asks for the password you had when it was made; older unencrypted backups still import. CSV exports are plain spreadsheets, so keep those private.
- Data isn't shared between devices or browsers. Use **Settings → Export backup** and **Import backup** to move it.
- Amounts are stored as whole paise (integers), so totals never drift from rounding.
- Encryption needs a secure page: the app works on `https://` (GitHub Pages) and `http://localhost`.

## Install it as an app

- **Android / Chrome / Edge:** open the site, then use **Settings → Install app** (or the browser menu's *Install app*).
- **iPhone / iPad:** open the site in Safari, tap **Share → Add to Home Screen**. On iPhone the app opens on the same blue launch screen as the splash (13 screen sizes covered, iPhone SE to 17 Pro Max).

Once installed, **long-press the app icon** (Android) or right-click it in the taskbar/dock (desktop) for shortcuts: **Add expense**, **Add income** and **Monthly overview**. The form opens right after you unlock. (iPhone doesn't support app-icon shortcuts for web apps.)

## Run locally

No build step and nothing to install. The only third-party files are Chart.js (MIT, in `js/vendor/`) and the two fonts (SIL OFL, in `fonts/`), all shipped with the app. Serve the folder with any static server:

```sh
python -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk won't work, because ES modules and service workers need `http://`.)

To check the calculations: `node tests/insights.test.mjs`, `node tests/upcoming.test.mjs`, `node tests/calendar.test.mjs`, `node tests/goals.test.mjs`, `node tests/debts.test.mjs`, `node tests/format.test.mjs`, `node tests/biometric.test.mjs` and `node tests/security.test.mjs` (Node 18+).

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
css/fonts.css           @font-face rules for the bundled fonts
fonts/                  Manrope + Barlow (digits only) WOFF2 files and their OFL licences
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
js/insights.js          Dashboard insights (pure calculations)
js/upcoming.js          "Coming up": what repeats will add soon (pure calculations)
js/calendar.js          Spending calendar heat-map
js/goals.js, goals-ui.js  Savings goals (maths / card + dialogs)
js/debts.js, debts-ui.js  Money given & taken (wording + maths / card + dialogs)
js/folds.js             Foldable dashboard cards (remembered per device)
js/pie.js               "Expenses by category" doughnut chart (loads Chart.js when needed)
js/biometric.js         Fingerprint / face unlock (WebAuthn PRF wraps the data key)
js/passwords.js         Password rules (refuses common/guessable passwords)
js/boot.js              Runs first: refuses to be framed, applies the theme (kept out of HTML for the CSP)
js/sound.js             Unlock chime (Web Audio, no sound files)
js/vendor/              Chart.js 4.5.0 (MIT), shipped with the app so it works offline
js/views/*.js           Dashboard, Monthly, Expenses/Income, Report, Settings
tests/*.test.mjs        Unit tests for the calculations: node tests/<name>.test.mjs
icons/                  App icons (PNG + SVG)
icons/launch/           iPhone launch screens, one per screen size (rendered from the splash)
images/logo.svg         Brand mark
README.md               This file
ROADMAP.md              Planned and finished features, and checks still to do on a real phone
SECURITY.md             Security review (OWASP Top 10 2025, MITRE ATT&CK), fixes and accepted risks
security-review.html    The same review as a standalone web page
```
