import { ImageResponse } from 'next/og';
import { genesisWorld, lineage } from '@/lib/sim';
import { pixelFont } from '@/lib/ogFont';
import { hashStr } from '@/lib/rng';

export const runtime = 'nodejs';
export const alt = 'A coin on TREE';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#1b1815';
const B = 22; // block size

/** The coin's pixel branch: one zig-zagging limb per generation, root at the bottom, leaves on top. */
function branch(n: number, seed: number) {
  const blocks: { x: number; y: number; c: string }[] = [];
  let x = 10;
  let y = 25;
  for (let i = 0; i < n; i++) {
    const len = Math.max(2, Math.min(8, Math.floor(22 / n)));
    const dir = i === 0 ? 0 : (seed >>> i) & 1 ? 1 : -1;
    const w = Math.max(1, 3 - Math.floor(i / 2));
    for (let k = 0; k < len; k++) {
      y -= 1;
      if (k % 2 === 1) x += dir;
      for (let j = 0; j < w; j++) blocks.push({ x: x + j, y, c: i === n - 1 ? '#f5a623' : (k + i) % 3 ? '#8b5a2b' : '#6e4420' });
    }
    x = Math.max(2, Math.min(18, x));
  }
  const leafCols = ['#ff8fb1', '#7bd389', '#f5a623'];
  for (let i = 0; i < 14; i++) {
    const h = hashStr(`${seed}:${i}`);
    blocks.push({ x: x + (h % 5) - 2, y: y - 1 - ((h >>> 4) % 3), c: leafCols[(h >>> 8) % 3] });
  }
  return blocks.filter((b) => b.y >= 0);
}

/** "→" drawn in pixels (the pixel font has no arrow glyph). */
function PixelArrow() {
  const px = (x: number, y: number) => <div key={`${x},${y}`} style={{ position: 'absolute', left: x * 4, top: y * 4, width: 4, height: 4, background: '#f5a623' }} />;
  const cells = [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [3, 1], [3, 3], [2, 0], [2, 4]];
  return <div style={{ display: 'flex', position: 'relative', width: 20, height: 20, margin: '6px 14px 0' }}>{cells.map(([x, y]) => px(x, y))}</div>;
}

export default async function Image({ params }: { params: { ca: string } }) {
  const w = genesisWorld();
  const c = w.coins[params.ca];
  const line = c ? lineage(w, c.ca) : [];
  const ticker = c?.ticker ?? 'TREE';
  const depth = c?.depth ?? 1;
  const path = c ? [...line.slice(0, -1).map((x) => x.ticker), 'YOU'] : ['ROOT', 'OAK', 'ACORN', 'YOU'];
  const shown = path.length > 6 ? [path[0], '…', ...path.slice(-4)] : path;
  const blocks = branch(Math.max(1, Math.min(depth, 10)), hashStr(params.ca));
  const font = await pixelFont();

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: BG, color: '#f4f4f2', fontFamily: font ? 'PressStart' : 'monospace' }}>
        <div style={{ width: 480, height: 630, position: 'relative', display: 'flex', background: '#201c18' }}>
          {blocks.map((b, i) => (
            <div key={i} style={{ position: 'absolute', left: b.x * B, top: b.y * B + 30, width: B, height: B, background: b.c }} />
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 26 * B + 30, height: 40, background: '#4e9a5a', display: 'flex' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 56 }}>
          <div style={{ fontSize: 22, color: '#7bd389', display: 'flex' }}>TREE</div>
          <div style={{ fontSize: ticker.length > 9 ? 52 : 72, marginTop: 24, display: 'flex' }}>{ticker}</div>
          <div style={{ display: 'flex', marginTop: 28 }}>
            <div style={{ background: '#f5a623', color: BG, fontSize: 26, padding: '10px 16px', display: 'flex' }}>DEPTH {depth}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 36, fontSize: 22, lineHeight: 1.8 }}>
            {shown.flatMap((p, i) => [
              ...(i > 0 ? [<PixelArrow key={`a${i}`} />] : []),
              <div key={i} style={{ display: 'flex', color: p === 'YOU' ? '#f5a623' : i === 0 ? '#7bd389' : '#f4f4f2' }}>
                {p}
              </div>,
            ])}
          </div>
          <div style={{ marginTop: 36, fontSize: 18, color: '#a89c8c', display: 'flex' }}>
            {depth > 1 ? `pays ${depth - 1} ancestor${depth === 2 ? '' : 's'} on every trade` : 'every coin below it pays it a cut'}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: 'PressStart', data: font, style: 'normal', weight: 400 }] : undefined },
  );
}
