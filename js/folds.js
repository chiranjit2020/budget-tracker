// Foldable dashboard cards: tap a card's title to fold it down to just the title.
// Which cards are folded is remembered on this device. It's only card names (no
// money data), so it lives in plain localStorage like the theme choice.

import { icon } from './ui.js';

const KEY = 'budget-tracker.folded-cards';

function readFolded() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
    } catch {
        return new Set();
    }
}

function saveFolded(set) {
    try {
        localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch {
        // Storage blocked: folding still works until the page is reloaded.
    }
}

const folded = readFolded();

/** Turn the title of every `section[data-card]` inside `root` into a fold button. Safe to call again. */
export function applyFolds(root) {
    for (const section of root.querySelectorAll('section[data-card]')) {
        const id = section.dataset.card;
        const h2 = section.querySelector(':scope > .section-head > h2');
        if (!h2) continue;
        const isFolded = folded.has(id);
        section.classList.toggle('is-folded', isFolded);
        if (!h2.querySelector('[data-fold]')) {
            const title = h2.textContent;
            h2.innerHTML = `<button type="button" class="fold-btn" data-fold="${id}">${icon('chevron-right')}<span></span></button>`;
            h2.querySelector('span').textContent = title;
        }
        const btn = h2.querySelector('[data-fold]');
        btn.setAttribute('aria-expanded', String(!isFolded));
        btn.title = isFolded ? 'Show' : 'Fold';
    }
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fold]');
    if (!btn) return;
    const id = btn.dataset.fold;
    if (folded.has(id)) folded.delete(id);
    else folded.add(id);
    saveFolded(folded);
    applyFolds(btn.closest('section[data-card]').parentElement);
});
