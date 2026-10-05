'use client';
/** Tiny 8-bit synth. Muted by default; nothing plays until the user unmutes. */
let ctx: AudioContext | null = null;
let muted = true;

export function setMuted(m: boolean) {
  muted = m;
  if (!m && !ctx && typeof window !== 'undefined') {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  ctx?.resume?.();
}

function blip(freq: number, at: number, dur: number, type: OscillatorType = 'square', vol = 0.05, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

let lastClimb = 0;

export const sfx = {
  sprout() {
    if (muted || !ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => blip(f, t + i * 0.06, 0.09));
  },
  climb(steps: number) {
    if (muted || !ctx) return;
    const now = performance.now();
    if (now - lastClimb < 250) return;
    lastClimb = now;
    const t = ctx.currentTime;
    for (let i = 0; i < Math.min(steps, 6); i++) blip(330 + i * 110, t + i * 0.07, 0.06, 'triangle', 0.04);
  },
  leafFall() {
    if (muted || !ctx) return;
    blip(660, ctx.currentTime, 0.5, 'square', 0.035, 110);
  },
};
