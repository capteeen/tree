'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useWorld, useStore } from '@/lib/store';
import { onEvent } from '@/lib/bus';
import { ancestors } from '@/lib/sim';
import { layout2d, type Seg } from '@/lib/layout2d';
import { leafColor, PALETTES } from '@/lib/season';
import { hashStr } from '@/lib/rng';
import type { Ca } from '@/lib/types';

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
  /** Show sap travelling on climb events and a blinking star on the deepest living coin. */
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
    // banded pixel sky, a soft shadow under the canopy, then the island
    const night = document.documentElement.dataset.theme !== 'light';
    const bands = night ? ['#141119', '#181419', '#1b1815', '#1e1a16'] : ['#9fd0e6', '#aed9ea', '#bfe0ea', '#cfe6e0'];
    bands.forEach((b, i) => {
      ctx.fillStyle = b;
      ctx.fillRect(0, Math.floor((height * i) / bands.length), width, Math.ceil(height / bands.length));
    });
    if (night) {
      ctx.fillStyle = '#f4f4f2';
      for (let i = 0; i < 14; i++) ctx.fillRect(hashStr(`tsx${rootCa}${i}`) % width, hashStr(`tsy${rootCa}${i}`) % Math.floor(height * 0.5), 1, 1);
    }
    ctx.fillStyle = night ? 'rgba(0,0,0,0.35)' : 'rgba(40,60,30,0.25)';
    const sw = Math.max(20, width * 0.55);
    ctx.fillRect(Math.round(width / 2 - sw / 2), height - 6, Math.round(sw), 2);
    ctx.fillRect(Math.round(width / 2 - sw / 2) + 4, height - 7, Math.round(sw) - 8, 1);
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
    let deepest: Seg | null = null;
    for (const s of segs) {
      const c = world.coins[s.ca];
      if (!c.alive) continue;
      if (!deepest || c.depth > world.coins[deepest.ca].depth) deepest = s;
      ctx.fillStyle = leafColor(p, c.bornAt);
      const h = hashStr(c.ca);
      for (let j = 0; j < 4; j++) {
        const dx = ((h >>> (j * 4)) % 5) - 2;
        const dy = ((h >>> (j * 4 + 2)) % 4) - 2;
        ctx.fillRect(Math.round(s.x1 + dx), Math.round(s.y1 + dy), 2, 2);
      }
    }
    // the deepest living coin twinkles
    if (deepest && Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(Math.round(deepest.x1) - 1, Math.round(deepest.y1) - 3, 1, 5);
      ctx.fillRect(Math.round(deepest.x1) - 3, Math.round(deepest.y1) - 1, 5, 1);
    }
    // sap: one dot per climb event, travelling from payer toward the root
    const now = performance.now();
    const byCa = new Map(segs.map((s) => [s.ca, s]));
    flashes.current = flashes.current.filter((f) => now - f.born < 1600);
    for (const f of flashes.current) {
      const chain = [f.from, ...f.path].map((ca) => byCa.get(ca)).filter(Boolean) as Seg[];
      if (!chain.length) continue;
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
    let raf = 0;
    let twinkle: ReturnType<typeof setInterval> | null = null;
    const loop = () => {
      draw();
      if (flashes.current.length) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    // twinkle at 2 Hz, only while on screen
    let onScreen = false;
    const io = new IntersectionObserver(([en]) => {
      onScreen = en.isIntersecting;
      if (onScreen && !twinkle) twinkle = setInterval(() => !raf && draw(), 500);
      if (!onScreen && twinkle) {
        clearInterval(twinkle);
        twinkle = null;
      }
    });
    if (ref.current) io.observe(ref.current);
    const off = live
      ? onEvent((e) => {
          if (e.kind !== 'climb' || e.rootCa !== rootCa || !e.path || !onScreen) return;
          flashes.current.push({ path: e.path, from: e.coinCa, born: performance.now() });
          if (!raf) raf = requestAnimationFrame(loop);
        })
      : () => {};
    return () => {
      off();
      io.disconnect();
      if (twinkle) clearInterval(twinkle);
      cancelAnimationFrame(raf);
    };
  });

  const click = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelect) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * width;
    const y = ((ev.clientY - r.top) / r.height) * height;
    let best: Seg | null = null;
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
