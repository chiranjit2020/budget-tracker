// Profile popup: opens from the avatar in the top-right corner.
// Uses the browser's Popover API, so clicking outside or pressing Escape
// closes it and focus returns to the avatar button automatically.

import { getState, setProfile, subscribe } from './store.js';
import { avatarHTML, toast } from './ui.js';
import { lock } from './auth.js';

const button = document.getElementById('profile-btn');
const pop = document.getElementById('profile-pop');
const avatar = document.getElementById('pop-avatar');
const photoEdit = pop.querySelector('.avatar-edit');
const photoLabel = document.getElementById('photo-label');
const photoInput = document.getElementById('photo-input');
const nameInput = document.getElementById('name-input');
const removeBtn = document.getElementById('photo-remove');

/** Crop to a square and shrink so the photo fits comfortably in localStorage. */
async function resizePhoto(file, size = 256) {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.85);
}

function syncPhoto() {
    const { profile } = getState();
    const label = profile.photo ? 'Change photo' : 'Add photo';
    avatar.innerHTML = avatarHTML(profile);
    photoLabel.textContent = label;
    photoEdit.title = label;
    removeBtn.hidden = !profile.photo;
}

/** Place the popup just below the avatar, right-aligned with it. */
function position() {
    const r = button.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.right = `${Math.max(16, Math.round(document.documentElement.clientWidth - r.right))}px`;
}

let saveTimer;
function saveName() {
    clearTimeout(saveTimer);
    const name = nameInput.value.trim().slice(0, 60);
    if (name !== getState().profile.name) setProfile({ name });
}

pop.addEventListener('beforetoggle', (e) => {
    if (e.newState === 'open') {
        nameInput.value = getState().profile.name;
        syncPhoto();
        position();
    } else {
        saveName();
    }
});

// The name saves as you type (after a short pause), and when the popup closes.
nameInput.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveName, 500);
});

nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pop.hidePopover();
});

photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    if (!file) return;
    try {
        if (setProfile({ photo: await resizePhoto(file) })) toast('Photo updated');
    } catch {
        toast('That image could not be read. Try a JPG or PNG.');
    }
});

removeBtn.addEventListener('click', () => setProfile({ photo: '' }));
document.getElementById('lock-btn').addEventListener('click', () => lock());
pop.querySelector('.pop-link').addEventListener('click', () => pop.hidePopover());

window.addEventListener('resize', () => {
    if (pop.matches(':popover-open')) position();
});

subscribe(() => {
    if (pop.matches(':popover-open')) syncPhoto();
});
