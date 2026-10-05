'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useWorld, useStore } from '@/lib/store';
import { onEvent } from '@/lib/bus';
import { ancestors, type World } from '@/lib/sim';
import { leafColor, PALETTES } from '@/lib/season';
import { hashStr } from '@/lib/rng';
import type { Ca } from '@/lib/types';

interface P2 {
  ca: Ca;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
}

/** Recursive radial/fractal tree: children fan out around their parent's angle. */
function layout2d(world: World, rootCa: Ca, W: number, H: number): P2[] {
  const out: P2[] = [];
  const root = world.coins[rootCa];
  if (!root) return out;
  const L0 = H * 0.3;
  const walk = (ca: Ca, x: number, y: number, ang: number, len: number) => {
    const c = world.coins[ca];
    const total = c.feesEarned + c.feesReceivedFromBelow;
    const w = Math.max(1, Math.min(5, Math.round(1 + Math.log1p(total * 40) * 0.8)));
    const x1 = x + Math.cos(ang) * len;
    const y1 = y - Math.sin(ang) * len;
    out.push({ ca, x0: x, y0: y, x1, y1, w });
    const n = c.children.length;
    const spread = Math.min(2.4, 0.55 + n * 0.32) / (1 + (c.depth - 1) * 0.12);
    c.children.forEach((k, i) => {
      const off = n === 1 ? ((hashStr(k) % 60) - 30) / 100 : -spread / 2 + (spread * i) / (n - 1);
      const t = 0.55 + 0.45 * ((i % 3) + 1) / 3;
      walk(k, x + (x1 - x) * t, y + (y1 - y) * t, ang + off, len * 0.74);
    });
  };
  walk(rootCa, W / 2, H - 4, Math.PI / 2, L0);
  // fit inside the canvas
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
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

function pxLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ww = Math.max(1, Math.round(w * (1 - 0.3 * t)));
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t - ww / 2), Math.round(y0 + (y1 - y0) * t - ww / 2), ww, ww);
  }
}

interface Props {
  rootCa: Ca;
  /** Logical (low-res) canvas size; it is scaled up with pixelated rendering. */
  width?: number;
  height?: number;
  highlightCa?: Ca | null;
  onSelect?: (ca: Ca) => void;
  /** Show sap travelling on climb events (fallback mode). */
  live?: boolean;
  className?: string;
}

export default function Tree2D({ rootCa, width = 120, height = 90, highlightCa, onSelect, live, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { world, version } = useWorld();
  const season = useStore((s) => s.season);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const segs = useMemo(() => layout2d(world, rootCa, width, height), [world, rootCa, width, height, version]);
  const flashes = useRef<{ path: Ca[]; from: Ca; born: number }[]>([]);

  const draw = () => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const p = PALETTES[season];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = p.grass;
    ctx.fillRect(0, height - 4, width, 2);
    ctx.fillStyle = p.dirt;
    ctx.fillRect(0, height - 2, width, 2);
    const hl = new Set(highlightCa ? [highlightCa, ...ancestors(world, highlightCa)] : []);
    for (const s of segs) {
      const c = world.coins[s.ca];
      ctx.fillStyle = hl.has(s.ca) ? '#f5a623' : c.alive ? p.bark : p.dead;
      pxLine(ctx, s.x0, s.y0, s.x1, s.y1, s.w);
    }
    for (const s of segs) {
      const c = world.coins[s.ca];
      if (!c.alive) continue;
      ctx.fillStyle = leafColor(p, c.bornAt);
      const h = hashStr(c.ca);
      for (let j = 0; j < 4; j++) {
        const dx = ((h >>> (j * 4)) % 5) - 2;
        const dy = ((h >>> (j * 4 + 2)) % 4) - 2;
        ctx.fillRect(Math.round(s.x1 + dx), Math.round(s.y1 + dy), 2, 2);
      }
    }
    // sap: one dot per climb event, travelling from payer toward the root
    const now = performance.now();
    const byCa = new Map(segs.map((s) => [s.ca, s]));
    flashes.current = flashes.current.filter((f) => now - f.born < 1600);
    for (const f of flashes.current) {
      const chain = [f.from, ...f.path].map((ca) => byCa.get(ca)).filter(Boolean) as P2[];
      const t = (now - f.born) / 1600;
      const idx = Math.min(chain.length - 1, Math.floor(t * chain.length));
      const s = chain[idx];
      const u = t * chain.length - idx;
      ctx.fillStyle = '#ffd36b';
      ctx.fillRect(Math.round(s.x1 + (s.x0 - s.x1) * u) - 1, Math.round(s.y1 + (s.y0 - s.y1) * u) - 1, 3, 3);
    }
  };

  useEffect(draw);

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const loop = () => {
      draw();
      if (flashes.current.length) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const off = onEvent((e) => {
      if (e.kind !== 'climb' || e.rootCa !== rootCa || !e.path) return;
      flashes.current.push({ path: e.path, from: e.coinCa, born: performance.now() });
      if (!raf) raf = requestAnimationFrame(loop);
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  });

  const click = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelect) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * width;
    const y = ((ev.clientY - r.top) / r.height) * height;
    let best: P2 | null = null;
    let bd = 8;
    for (const s of segs) {
      const d = Math.hypot(s.x1 - x, s.y1 - y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best) onSelect(best.ca);
  };

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      onClick={click}
      className={className}
      style={{ imageRendering: 'pixelated', width: '100%', height: '100%', objectFit: 'contain', cursor: onSelect ? 'pointer' : undefined }}
    />
  );
}
