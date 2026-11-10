// Runs before the page is drawn (loaded as a normal, blocking script in <head>):
// refuse to show inside someone else's page, and apply the light/dark theme without a flash.
// Kept as a file rather than inline so the Content-Security-Policy needs no 'unsafe-inline' or hash.
(function () {
    // Never show the app inside someone else's page (clickjacking). GitHub Pages
    // can't send X-Frame-Options / frame-ancestors, so this is done here.
    if (window.top !== window.self) {
        document.documentElement.setAttribute('hidden', '');
        return;
    }
    var c = 'light';
    try { c = localStorage.getItem('budget-tracker.theme') || 'light'; } catch (e) {}
    var dark = c === 'dark' || (c === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
