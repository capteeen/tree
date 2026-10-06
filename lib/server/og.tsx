import 'server-only';
import { ImageResponse } from 'next/og';
import type { ReactNode } from 'react';
import type { World } from '../sim';
import { layout2d, rasterize } from '../layout2d';
import { leafColor, PALETTES, seasonOf } from '../season';
import { pixelFont } from '../ogFont';
import type { Ca } from '../types';

export const OG_SIZE = { width: 1200, height: 630 };
export const BG = '#1b1815';

/** A whole tree, drawn as pixel rects, scaled to `scale` px per logical pixel. */
export function TreePicture({ world, rootCa, w = 150, h = 112, scale = 4, highlight }: { world: World; rootCa: Ca; w?: number; h?: number; scale?: number; highlight?: Set<Ca> }) {
  const p = PALETTES[seasonOf()];
  const segs = layout2d(world, rootCa, w, h);
  const rects = rasterize(segs, (ca, kind) => {
    const c = world.coins[ca];
    if (!c) return null;
    if (kind === 'wood') return highlight?.has(ca) ? '#f5a623' : c.alive ? p.bark : p.dead;
    return c.alive ? leafColor(p, c.bornAt) : null;
  });
  return (
    <div style={{ position: 'relative', width: w * scale, height: h * scale, display: 'flex' }}>
      {rects.map((r, i) => (
        <div key={i} style={{ position: 'absolute', left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.w * scale, background: r.c }} />
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, top: (h - 4) * scale, height: 2 * scale, background: p.grass, display: 'flex' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: (h - 2) * scale, height: 2 * scale, background: p.dirt, display: 'flex' }} />
    </div>
  );
}

/** "→" drawn in pixels (the pixel font has no arrow glyph). */
export function PixelArrow({ color = '#f5a623', px = 4 }: { color?: string; px?: number }) {
  const cells = [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [3, 1], [3, 3], [2, 0], [2, 4]];
  return (
    <div style={{ display: 'flex', position: 'relative', width: 5 * px, height: 5 * px, margin: `${px * 1.5}px ${px * 3.5}px 0` }}>
      {cells.map(([x, y]) => (
        <div key={`${x},${y}`} style={{ position: 'absolute', left: x * px, top: y * px, width: px, height: px, background: color }} />
      ))}
    </div>
  );
}

export async function ogResponse(node: ReactNode) {
  const font = await pixelFont();
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: BG, color: '#f4f4f2', fontFamily: font ? 'PressStart' : 'monospace' }}>{node}</div>,
    { ...OG_SIZE, fonts: font ? [{ name: 'PressStart', data: font, style: 'normal', weight: 400 }] : undefined },
  );
}
