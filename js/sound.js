// A soft "unlocked" chime, made with the Web Audio API (no audio files, works offline).
// The on/off choice is a plain preference in localStorage (not private), on by default.

const KEY = 'budget-tracker.sounds';
let ctx = null;

export function soundsOn() {
    try {
        return localStorage.getItem(KEY) !== 'off';
    } catch {
        return true;
    }
}

export function setSoundsOn(on) {
    try {
        localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch { /* storage blocked: the choice lasts for this visit only */ }
}

/** One bell-like note: a sine with a quiet octave on top, quick attack, gentle fade. */
function note(freq, start, length, volume) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    gain.connect(ctx.destination);
    for (const [mult, level, type] of [[1, 1, 'sine'], [2, 0.18, 'sine'], [3, 0.05, 'triangle']]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * mult, start);
        g.gain.value = level;
        osc.connect(g).connect(gain);
        osc.start(start);
        osc.stop(start + length + 0.05);
    }
}

/** E5, G#5, B5, then a soft E6 on top: a short, rising, happy "ta-da". */
export async function playUnlockChime({ force = false } = {}) {
    if ((!soundsOn() && !force) || document.visibilityState === 'hidden') return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        ctx ??= new AudioCtx();
        if (ctx.state === 'suspended') await ctx.resume(); // browsers start audio paused until a tap
        if (ctx.state !== 'running') return; // not allowed right now: stay silent
        const t = ctx.currentTime + 0.02;
        note(659.25, t, 0.55, 0.11);
        note(830.61, t + 0.075, 0.55, 0.1);
        note(987.77, t + 0.15, 0.7, 0.1);
        note(1318.51, t + 0.24, 0.6, 0.045);
    } catch {
        // Sound is a nicety: never let it get in the way of unlocking.
    }
}
