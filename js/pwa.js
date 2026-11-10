// Progressive Web App helpers: offline support and "Install app".

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function onInstallChange(fn) {
    listeners.add(fn);
}

export const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const canInstall = () => deferredPrompt !== null;

export async function promptInstall() {
    if (!deferredPrompt) return 'unavailable';
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    return outcome;
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own Install button (Settings) instead of the browser mini-bar
    deferredPrompt = e;
    notify();
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
});

/**
 * The app opens from its saved copy, so a new version arrives in the background.
 * When it takes over, reload into it, but only while `canReload()` says nothing
 * would be lost (on the lock screen with nothing typed). Otherwise it's used
 * from the next time the app opens.
 */
export function registerServiceWorker(canReload = () => false) {
    if (!('serviceWorker' in navigator)) return;
    const hadVersion = Boolean(navigator.serviceWorker.controller); // false on the very first visit
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadVersion || reloaded || !canReload()) return;
        reloaded = true;
        location.reload();
    });
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline support unavailable:', err));
    });
}

/** Ask the browser not to evict our data under storage pressure. */
export async function storagePersisted() {
    return (await navigator.storage?.persisted?.()) ?? false;
}

export async function requestPersistentStorage() {
    return (await navigator.storage?.persist?.()) ?? false;
}
