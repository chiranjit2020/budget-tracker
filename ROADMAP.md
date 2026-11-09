# Roadmap

Features are built one at a time: build, test (desktop + phone), push.

## Next up (in order)

1. **Smarter add form:** remember the last category per type, and suggest notes while typing (e.g. "Tea", "Metro"), filling in their usual category and amount.
2. **Payment method:** tag entries as UPI, Cash, Card or Bank; filter by it and see the split per month.
3. **Smart insights on the dashboard:** e.g. "Food is up 24% vs last month", average spend per day, projected month-end total.
4. **Spending calendar:** a heat-map of the month showing which days you spent most; tap a day to see its entries.
5. **Savings goals:** e.g. "Goa trip ₹30,000", with progress and a target date.
6. **Lend & borrow tracker:** "Rahul owes me ₹500", with settle-up and reminders.

## Later / maybe

- **Fingerprint / Face unlock** (WebAuthn): on top of the password, where the phone supports it.
- **Edit a recurring transaction's amount** (today: stop it and add a new one).
- **iPhone launch images**, so the iPhone launch screen matches the splash.

## Checks to do on a real phone

- Android: app-icon shortcuts (long-press: Add expense / Add income / Monthly).
- Android: launch screen flows into the blue splash without a white flash.
- iPhone: install via Share → Add to Home Screen, login, dark mode.

## Not a good fit right now

- Reading UPI/bank SMS automatically: web apps can't read SMS.
- Sync between devices: needs a server, which conflicts with "data stays on my device".
- Receipt photos: browser storage is too small (~5 MB) without moving to IndexedDB first.

## Done

Encrypted accounts (registration/login, auto-lock), PWA + offline, full-screen dashboard, Manrope font, profile popup, splash screen, monthly budgets, recurring transactions, encrypted backups + 30-day reminder, quick-add favourites (editable), app-icon shortcuts, light/dark mode.
