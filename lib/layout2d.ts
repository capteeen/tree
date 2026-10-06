import type { Ca } from './types';
import type { World } from './sim';
import { hashStr } from './rng';

export interface Seg {
  ca: Ca;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
}

/**
 * Recursive pixel tree in 2D: children fan out around their parent's angle.
 * The root's hash seeds the trunk lean, spread and curl, so every tree in the
 * forest has its own silhouette. Used by thumbnails, the WebGL fallback and OG images.
 */
export function layout2d(world: World, rootCa: Ca, W: number, H: number): Seg[] {
  const out: Seg[] = [];
  const root = world.coins[rootCa];
  if (!root) return out;
  const hr = hashStr(rootCa);
  const lean = ((hr % 40) - 20) / 100; // trunk tilt, radians
  const spreadK = 0.85 + ((hr >>> 8) % 50) / 100; // how wide children fan
  const curl = (((hr >>> 16) % 2) * 2 - 1) * (((hr >>> 20) % 30) / 100); // all branches bend one way
  const shrink = 0.7 + ((hr >>> 4) % 12) / 100;
  const L0 = H * 0.3;
  const walk = (ca: Ca, x: number, y: number, ang: number, len: number) => {
    const c = world.coins[ca];
    if (!c) return;
    const total = c.feesEarned + c.feesReceivedFromBelow;
    const w = Math.max(1, Math.min(5, Math.round(1 + Math.log1p(total * 40) * 0.8)));
    const x1 = x + Math.cos(ang) * len;
    const y1 = y - Math.sin(ang) * len;
    out.push({ ca, x0: x, y0: y, x1, y1, w });
    const n = c.children.length;
    const spread = (Math.min(2.4, 0.55 + n * 0.32) * spreadK) / (1 + (c.depth - 1) * 0.12);
    c.children.forEach((k, i) => {
      const off = n === 1 ? ((hashStr(k) % 60) - 30) / 100 : -spread / 2 + (spread * i) / (n - 1);
      const t = 0.55 + (0.45 * ((i % 3) + 1)) / 3;
      walk(k, x + (x1 - x) * t, y + (y1 - y) * t, ang + off + curl * 0.3, len * shrink);
    });
  };
  walk(rootCa, W / 2, H - 4, Math.PI / 2 + lean, L0);
  // fit inside the canvas
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const s of out) {
    minX = Math.min(minX, s.x0, s.x1);
    maxX = Math.max(maxX, s.x0, s.x1);
    minY = Math.min(minY, s.y1, s.y0);
  }
  const sx = (W - 10) / Math.max(1, maxX - minX);
  const sy = (H - 10) / Math.max(1, H - 4 - minY);
  const k = Math.min(1, sx, sy);
  const cx = (minX + maxX) / 2;
  return out.map((s) => ({
    ...s,
    x0: W / 2 + (s.x0 - cx) * k,
    x1: W / 2 + (s.x1 - cx) * k,
    y0: H - 4 - (H - 4 - s.y0) * k,
    y1: H - 4 - (H - 4 - s.y1) * k,
  }));
}

/** Rasterise a segment list into coloured pixel rects (for SVG / OG rendering). */
export function rasterize(segs: Seg[], color: (ca: Ca, kind: 'wood' | 'leaf') => string | null) {
  const rects: { x: number; y: number; w: number; c: string }[] = [];
  for (const s of segs) {
    const c = color(s.ca, 'wood');
    if (!c) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(s.x1 - s.x0, s.y1 - s.y0)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ww = Math.max(1, Math.round(s.w * (1 - 0.3 * t)));
      rects.push({ x: Math.round(s.x0 + (s.x1 - s.x0) * t - ww / 2), y: Math.round(s.y0 + (s.y1 - s.y0) * t - ww / 2), w: ww, c });
    }
  }
  for (const s of segs) {
    const c = color(s.ca, 'leaf');
    if (!c) continue;
    const h = hashStr(s.ca);
    for (let j = 0; j < 4; j++) {
      const dx = ((h >>> (j * 4)) % 5) - 2;
      const dy = ((h >>> (j * 4 + 2)) % 4) - 2;
      rects.push({ x: Math.round(s.x1 + dx), y: Math.round(s.y1 + dy), w: 2, c });
    }
  }
  return rects;
}
