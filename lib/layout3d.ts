import type { Ca } from './types';
import type { World } from './sim';
import { hashStr } from './rng';

export type V3 = [number, number, number];

export interface BranchNode {
  ca: Ca;
  start: V3;
  end: V3;
  dir: V3;
  len: number;
  thick: number;
  depth: number;
}

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export const TRUNK_LEN = 8;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Branch thickness grows with the log of all fees that flowed through the coin. */
export function thicknessFor(totalFees: number) {
  const t = 0.26 + 0.19 * Math.log1p(totalFees * 40);
  return Math.round(Math.min(1.9, Math.max(0.26, t)) * 16) / 16;
}

/**
 * Procedural tree: trunk at origin, each child placed around its parent at the
 * golden angle, tilted out and slightly upward, getting shorter with depth.
 * Placement depends only on the child's index, so new sprouts never move old branches.
 */
export function layoutTree(w: World, rootCa: Ca): Map<Ca, BranchNode> {
  const out = new Map<Ca, BranchNode>();
  const root = w.coins[rootCa];
  if (!root) return out;

  const place = (ca: Ca, start: V3, dir: V3) => {
    const c = w.coins[ca];
    const len = Math.max(0.9, TRUNK_LEN * Math.pow(0.72, c.depth - 1));
    const node: BranchNode = {
      ca,
      start,
      dir,
      len,
      end: add(start, mul(dir, len)),
      thick: thicknessFor(c.feesEarned + c.feesReceivedFromBelow),
      depth: c.depth,
    };
    out.set(ca, node);

    const up: V3 = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(dir, up));
    const v = norm(cross(dir, u));
    const base = (hashStr(ca) % 628) / 100;
    c.children.forEach((k, i) => {
      const child = w.coins[k];
      if (!child) return;
      const t = 0.5 + 0.5 * (1 - Math.pow(0.68, i + 1)); // along the parent
      const az = base + i * GOLDEN_ANGLE;
      const tilt = (0.62 + ((hashStr(k) % 100) / 100) * 0.3) * (c.depth === 1 ? 1.05 : 0.85);
      const radial = add(mul(u, Math.cos(az)), mul(v, Math.sin(az)));
      let d = add(mul(dir, Math.cos(tilt)), mul(radial, Math.sin(tilt)));
      d = norm(add(d, [0, 0.28, 0]));
      place(k, add(start, mul(dir, len * t)), d);
    });
  };

  place(rootCa, [0, 0, 0], [0, 1, 0]);
  return out;
}

export function bounds(nodes: Map<Ca, BranchNode>) {
  let maxY = 1;
  let maxR = 1;
  nodes.forEach((n) => {
    maxY = Math.max(maxY, n.end[1] + 1);
    maxR = Math.max(maxR, Math.hypot(n.end[0], n.end[2]) + 1);
  });
  return { maxY, maxR };
}
