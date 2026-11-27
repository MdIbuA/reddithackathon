// Tiny synthesized sound kit (Web Audio). No asset downloads; respects a
// persisted mute toggle. Audio only starts after a user gesture, per browser rules.
import type { Grade } from '../shared/scoring';

const STORAGE_KEY = 'rtr:muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
  } catch {
    /* storage unavailable in some webviews */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startIn: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + startIn;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  tick: () => tone(1400, 0, 0.03, 'square', 0.025),
  pick: () => {
    tone(520, 0, 0.09, 'triangle');
    tone(780, 0.05, 0.12, 'triangle');
  },
  lock: () => {
    tone(330, 0, 0.08, 'square', 0.06);
    tone(660, 0.06, 0.14, 'triangle', 0.1);
  },
  boss: () => [196, 233, 294, 392].forEach((f, i) => tone(f, i * 0.09, 0.22, 'sawtooth', 0.05)),
  reveal: (grade: Grade) => {
    const notes: Record<Grade, number[]> = {
      bullseye: [523, 659, 784, 1047],
      close: [523, 659, 784],
      off: [440, 494],
      miss: [330, 247],
    };
    notes[grade].forEach((f, i) => tone(f, i * 0.08, 0.2, grade === 'miss' ? 'sawtooth' : 'triangle', grade === 'miss' ? 0.05 : 0.11));
  },
  fanfare: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.1)),
};
