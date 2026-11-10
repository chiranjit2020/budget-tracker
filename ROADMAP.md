# Roadmap

Features are built one at a time: build, test (desktop + phone), push.

## Next up (in order)

All planned features are built. Pick the next one from *Later / maybe*.

## Later / maybe

- **Fingerprint / Face unlock** (WebAuthn): on top of the password, where the phone supports it.
- **Edit a recurring transaction's amount** (today: stop it and add a new one).
- **Goal history:** list each add/withdrawal under a goal (the data is already kept).
- **Receipt photos:** attach a photo to an entry (now possible, since data is in IndexedDB).
- **iPhone launch images**, so the iPhone launch screen matches the splash.

## Checks to do on a real phone

- Android: app-icon shortcuts (long-press: Add expense / Add income / Monthly).
- Android: launch screen flows into the blue splash without a white flash.
- iPhone: install via Share → Add to Home Screen, login, dark mode.

## Not a good fit right now

- Reading UPI/bank SMS automatically: web apps can't read SMS.
- Sync between devices: needs a server, which conflicts with "data stays on my device".

## Done

Encrypted accounts (registration/login, auto-lock), PWA + offline, full-screen dashboard, Manrope font, profile popup, splash screen, monthly budgets, recurring transactions, encrypted backups + 30-day reminder, quick-add favourites (editable), app-icon shortcuts, light/dark mode, smarter add form (last category, note suggestions), data moved to IndexedDB, payment methods, dashboard insights, spending calendar, savings goals, Barlow digits, given & taken tracker (plain wording), dashboard tidy-up (order, foldable cards, "More you can do"), Chart.js pie for categories.
