export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const liveRng: Rng = () => Math.random();

export const range = (r: Rng, a: number, b: number) => a + r() * (b - a);
export const int = (r: Rng, a: number, b: number) => Math.floor(range(r, a, b + 1));
export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function b58(r: Rng, n: number) {
  let s = '';
  for (let i = 0; i < n; i++) s += B58[Math.floor(r() * B58.length)];
  return s;
}

/** pump.fun mints end in "pump". */
export const fakeCa = (r: Rng) => b58(r, 40) + 'pump';
export const fakeWallet = (r: Rng) => b58(r, 44);
