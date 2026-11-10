# Security review: Budget Tracker

**Date:** 10 November 2026 · **Scope:** the whole app as published on GitHub Pages (client-side PWA, no server) · **Method:** code review plus live attacks against the running app in Chrome, then fixes and re-tests. Frameworks: **OWASP Top 10 (2025)** and **MITRE ATT&CK** (techniques that fit this kind of app).

## What we protect, and from whom

All data (transactions, budgets, goals, money given & taken, profile) is stored **only on the device**, encrypted with AES-256-GCM using a key stretched from the password (PBKDF2-SHA256, 600,000 rounds). There is no server and no account in the cloud.

| Attacker | Example |
|---|---|
| Someone with the phone or laptop | A thief, or a family member, while the app is locked or after it locks |
| Malicious content inside the app | A note or name crafted to run code (XSS), or a poisoned backup file |
| Malicious third-party code | A tampered library or font service (supply chain) |
| Network attacker | Someone on public Wi-Fi |
| Malware or a browser extension on the device | Reads pages or keystrokes (out of reach for any web app; see accepted risks) |

## Findings and fixes

| # | Finding | Severity | OWASP 2025 | MITRE ATT&CK | Status |
|---|---|---|---|---|---|
| 1 | After locking, closed dialogs still held private data in their form fields (amounts, notes, goal and person names, budget figures) | Medium | A04 Cryptographic Failures (data exposure) · A06 Insecure Design | T1005 Data from Local System · T1185 Browser Session Hijacking | **Fixed:** on lock, every dialog and popup is closed, forms reset, generated lists emptied |
| 2 | After locking, the chart object and the note-suggestion cache kept category names, notes and amounts in memory | Medium | A06 Insecure Design | T1005 | **Fixed:** chart destroyed and cache cleared on lock |
| 3 | A toast such as "Added Rent ₹15,000" stayed visible on the lock screen | Low | A06 Insecure Design | T1005 | **Fixed:** cleared on lock |
| 4 | A booby-trapped backup could set billions of key-stretching rounds. It froze **all** encryption in the browser process (even logging in) until the browser restarted. No size limit on imported files | High | A10 Mishandling of Exceptional Conditions · A08 Data Integrity Failures | T1499 Endpoint Denial of Service · T1204.002 User Execution: Malicious File | **Fixed:** only 100,000 to 5,000,000 rounds and sane salt/IV sizes are accepted (checked before any work starts); files over 25 MB refused |
| 5 | No Content Security Policy; the app could be shown inside another site's frame (clickjacking) | Medium | A02 Security Misconfiguration | T1059.007 JavaScript · T1189 Drive-by Compromise | **Fixed:** strict CSP (`script-src 'self'`, no inline scripts, no eval, `object-src 'none'`, `base-uri 'none'`); the app hides itself when framed; the one inline script moved to `js/boot.js` |
| 6 | The wait after 5 wrong passwords could be skipped by reloading the page | Medium | A07 Authentication Failures | T1110.001 Brute Force: Password Guessing | **Fixed:** the counter survives reloads (capped at 1 hour so nobody is locked out for days) |
| 7 | Easy passwords such as `12345678` or `password` were accepted. Anyone who copies the encrypted data can guess offline, so password strength is the real protection | Medium | A07 Authentication Failures | T1110.002 Password Cracking | **Fixed:** common passwords, runs (12345678, abcdefgh, qwertyui), one repeated character and the person's own name are refused, with a plain-words reason |
| 8 | The app loaded its fonts from Google Fonts: a third party that saw every visit and could change the CSS | Low | A03 Software Supply Chain Failures · A02 (privacy) | T1195 Supply Chain Compromise · T1592 Gather Victim Host Information | **Fixed:** both fonts are now shipped with the app (`fonts/`, SIL Open Font License); the app makes **no requests to any other site**, and the CSP allows only its own origin. A `no-referrer` policy is set as well |

## Tested and found safe

| Attack | OWASP 2025 | MITRE ATT&CK | Result |
|---|---|---|---|
| Stored XSS: 6 payload styles (`<img onerror>`, `<svg onload>`, breaking out of attributes, `<script>`, template `${…}`, `javascript:` links) in every field: profile name, categories, notes, favourites, budgets, goals, people's names and notes | A05 Injection | T1059.007 JavaScript | **0 executions** across all 8 pages, every dialog, the calendar day panel, note suggestions and the profile popup; payloads shown as plain text. All user text goes through `esc()` or `textContent`. With the CSP added, injected inline handlers, inline scripts and outside scripts are also **blocked** as a second layer |
| CSV formula injection (`=HYPERLINK(…)`, `+cmd|…`, `@SUM`, leading tab or CR) | A05 Injection | T1204.002 Malicious File | Safe: such cells are prefixed with `'` |
| Prototype pollution through a crafted backup (`__proto__`, `constructor.prototype` at every level) | A08 Data Integrity Failures | T1565.001 Stored Data Manipulation | Safe: nothing polluted; `normalize()` rebuilds every object field by field |
| Tampering with stored encrypted data or the fingerprint record | A08 Data Integrity Failures | T1565.001 | Safe: AES-GCM rejects any change |
| Odd routes (`#/__proto__`, `#/constructor`, encoded `<script>`) | A01 Broken Access Control | T1190-style probing | Safe: fall back to the dashboard |
| Malicious profile photo (SVG with script, EXIF data) | A05 Injection | T1027 Obfuscated Files | Safe: photos are redrawn on a canvas and saved as JPEG |
| Readable data in browser storage | A04 Cryptographic Failures | T1005 / T1555.003 Credentials from Web Browsers | Safe: only ciphertext plus non-secret settings (theme, auto-lock, folded cards, the wrong-password counter). The password is never stored |
| Floating-point errors in money | A06 Insecure Design | — | Safe: amounts are whole paise; parsing and goal pace use exact integer maths |
| Network interception | A04 Cryptographic Failures | T1557 Adversary-in-the-Middle | Safe: GitHub Pages serves HTTPS only and `github.io` is HSTS-preloaded; nothing secret is sent anyway |
| Supply chain: Chart.js and fonts | A03 Software Supply Chain Failures | T1195.001 Compromise Software Dependencies | Safe: Chart.js 4.5.0 is shipped inside the app (no CDN) and was checked byte-for-byte against the official npm package; the fonts are shipped too, so nothing is loaded from other sites at all |
| Fingerprint / face unlock | A07 Authentication Failures | T1556 Modify Authentication Process | Safe in tests: the data key is wrapped by a secret only the device's fingerprint hardware releases (WebAuthn PRF); a different device, a tampered copy or a changed password all fail. With it on, unlocking needs the password *and* the scan, so a browser-filled password alone can't open the app; the password-only fallback needs a 24-hour wait the owner sees and can cancel (setting the phone clock forward would shorten it) |

### OWASP items that mostly don't apply

There is no server, so **A01** (server-side access control), **A05** (SQL/command injection) and **A09** (security logging and alerting) have little to act on. Locally, "access control" is the password-derived key; it's cleared from memory on lock and auto-lock, and other open tabs lock when the password changes. For **A09**, the app shows the person what's happening (wrong-password waits, failed unlocks) but deliberately sends nothing anywhere.

## Accepted risks (can't be fixed by a web app, or by design)

- **Malware or a malicious browser extension on the device** (T1176 Browser Extensions, T1056.001 Keylogging) can read whatever is on screen while the app is unlocked, or capture the password. Advice: install few, trusted extensions; keep the phone updated.
- **Offline guessing** (T1110.002). A stolen copy of the encrypted data or a backup file can be attacked offline. 600,000 PBKDF2 rounds and the new password rules slow this down, but a long passphrase is what really protects it.
- **"Forgot password?" wipes the device's data without the password** (T1485 Data Destruction). This is by design, because without the password the data can't be recovered anyway. Regular backups (with the 30-day reminder) are the protection.
- **The first name is shown on the login screen** before unlocking ("Welcome back, …"). It's stored unencrypted in the vault header. Low sensitivity; kept for friendliness.
- **CSV exports and older unencrypted backups are plain text.** The app warns about this where they're made.
- **GitHub Pages can't send security headers** (CSP `frame-ancestors`, `X-Frame-Options`). The CSP is set with a `<meta>` tag, and framing is handled by `js/boot.js` instead.
- **JavaScript can't wipe strings from memory.** Data is dropped on lock, but the browser decides when the memory is actually reused.

## Re-running the checks

Unit tests (Node 18+), from the project folder:

```sh
node tests/security.test.mjs     # password rules, backup-file validation, prototype pollution
node tests/biometric.test.mjs    # fingerprint unlock with a simulated sensor
node tests/format.test.mjs       # exact money parsing
```

The browser attack sweep (XSS payloads in every field, lock hygiene, booby-trapped backups, CSP blocking, framing, the wrong-password wait across reloads) was run by hand in Chrome against a throwaway account. Re-run it after any change that adds new places where text becomes HTML.

**Reporting a problem:** open a GitHub issue without sensitive details, or contact the developer privately via [chiranjitkarmakar.com](https://chiranjitkarmakar.com).

---

© 2021–2026 Chiranjit Karmakar. Budget Tracker is developed by Chiranjit Karmakar · [chiranjitkarmakar.com](https://chiranjitkarmakar.com)
