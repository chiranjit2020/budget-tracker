// Light / dark mode. The choice ('system', 'light' or 'dark') is stored in
// plain localStorage (it isn't private) so it applies before login too.
// index.html sets the theme inline before the page paints; this module
// keeps it updated afterwards.

const KEY = 'budget-tracker.theme';
const CHOICES = ['system', 'light', 'dark'];
const STATUS_BAR = { light: '#3546AB', dark: '#0b1024' };
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export const THEME_OPTIONS = [
    ['system', 'Auto', 'monitor'],
    ['light', 'Light', 'sun'],
    ['dark', 'Dark', 'moon'],
];

export function getThemeChoice() {
    try {
        const v = localStorage.getItem(KEY);
        return CHOICES.includes(v) ? v : 'system';
    } catch {
        return 'system';
    }
}

function apply() {
    const choice = getThemeChoice();
    const theme = choice === 'dark' || (choice === 'system' && systemDark.matches) ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUS_BAR[theme]);
    // Keep every theme switch on the page in step.
    document.querySelectorAll('input[name^="theme-choice"]').forEach((input) => {
        input.checked = input.value === choice;
    });
}

export function setThemeChoice(choice) {
    if (!CHOICES.includes(choice)) return;
    try {
        localStorage.setItem(KEY, choice);
    } catch { /* storage blocked: still apply for this visit */ }
    apply();
}

/** Segmented Auto / Light / Dark switch (radio buttons, keyboard friendly). */
export function themeSwitchHTML(icon, group = 'theme-choice') {
    const current = getThemeChoice();
    return `
    <fieldset class="segmented theme-switch">
        <legend class="sr-only">Theme</legend>
        ${THEME_OPTIONS.map(
            ([value, label, ic]) => `
        <label><input type="radio" name="${group}" value="${value}"${value === current ? ' checked' : ''}><span>${icon(ic)}${label}</span></label>`,
        ).join('')}
    </fieldset>`;
}

// Any theme switch, anywhere in the app.
document.addEventListener('change', (e) => {
    if (e.target.name?.startsWith('theme-choice')) setThemeChoice(e.target.value);
});

// In "Auto", follow the phone/computer setting live.
systemDark.addEventListener('change', () => {
    if (getThemeChoice() === 'system') apply();
});

apply();
