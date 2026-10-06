import { hashStr } from '@/lib/rng';

const PAL = [
  ['#7bd389', '#4e9a5a', '#f5a623', '#2f6a3a'],
  ['#ff8fb1', '#c95a7e', '#7bd389', '#8a3a58'],
  ['#f5a623', '#8b5a2b', '#ff8fb1', '#5a3a1e'],
  ['#9fd8c8', '#4e8a7a', '#f4f4f2', '#2f5a50'],
  ['#b9c95a', '#6e7a2a', '#ff8fb1', '#45501a'],
  ['#e8822b', '#8b4a1b', '#ffd36b', '#5a2e10'],
];
const N = 10;

/**
 * Procedural 10×10 mirrored pixel creature with a dark outline and a top-left
 * highlight, or the uploaded image. Depth badge drawn in the corner.
 */
export function spritePixels(seed: string) {
  const h = hashStr(seed);
  const pal = PAL[h % PAL.length];
  const grid: (string | null)[][] = Array.from({ length: N }, () => Array(N).fill(null));
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N / 2; x++) {
      const v = hashStr(`${seed}:${x},${y}`) % 10;
      const dist = Math.hypot(x - (N / 2 - 0.5), y - N / 2);
      // a leafy blob that thins toward the edges
      if (dist > 4.6 || (dist > 3.4 && v < 5) || v < 2) continue;
      const col = v < 6 ? pal[0] : v < 9 ? pal[1] : pal[2];
      grid[y][x] = col;
      grid[y][N - 1 - x] = col;
    }
  // a face: two eyes, always
  const ey = 3 + (h >>> 4) % 3;
  const ex = 2 + (h >>> 8) % 2;
  grid[ey][ex] = '#1b1815';
  grid[ey][N - 1 - ex] = '#1b1815';
  grid[ey][ex + 1] ??= pal[0];
  grid[ey][N - 2 - ex] ??= pal[0];
  // outline + highlight
  const out: { x: number; y: number; c: string }[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = grid[y][x];
      if (c) {
        const lit = (y > 0 && !grid[y - 1][x]) || (x > 0 && !grid[y][x - 1]);
        out.push({ x, y, c: lit && c !== '#1b1815' ? lighten(c) : c });
      } else {
        const near = [grid[y - 1]?.[x], grid[y + 1]?.[x], grid[y][x - 1], grid[y][x + 1]].some(Boolean);
        if (near) out.push({ x, y, c: pal[3] });
      }
    }
  return out;
}

function lighten(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.35));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

export default function CoinSprite({ image, depth, size = 64, className = '' }: { image: string; depth?: number; size?: number; className?: string }) {
  let body: React.ReactNode;
  if (!image.startsWith('sprite:')) {
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={image} alt="" width={size} height={size} className="h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />;
  } else {
    body = (
      <svg viewBox={`0 0 ${N} ${N}`} width="100%" height="100%" shapeRendering="crispEdges">
        <rect width={N} height={N} fill="#2a2420" />
        {spritePixels(image).map((p) => (
          <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
        ))}
      </svg>
    );
  }
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden bg-[#2a2420] ${className}`} style={{ width: size, height: size }}>
      {body}
      {depth !== undefined && (
        <span
          className="absolute bottom-0 right-0 bg-sap px-[3px] py-[2px] font-pixel leading-none text-[#1b1815]"
          style={{ fontSize: Math.max(6, Math.round(size / 7)) }}
        >
          D{depth}
        </span>
      )}
    </span>
  );
}
