import { hashStr } from '@/lib/rng';

const PAL = [
  ['#7bd389', '#4e9a5a', '#f5a623'],
  ['#ff8fb1', '#c95a7e', '#7bd389'],
  ['#f5a623', '#8b5a2b', '#ff8fb1'],
  ['#9fd8c8', '#4e8a7a', '#f4f4f2'],
  ['#b9c95a', '#6e7a2a', '#ff8fb1'],
  ['#e8822b', '#8b4a1b', '#ffd36b'],
];

/** 8×8 mirrored pixel sprite, or the uploaded image. Depth badge drawn in the corner. */
export default function CoinSprite({ image, depth, size = 64, className = '' }: { image: string; depth?: number; size?: number; className?: string }) {
  let body: React.ReactNode;
  if (!image.startsWith('sprite:')) {
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={image} alt="" width={size} height={size} className="h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />;
  } else {
    const h = hashStr(image);
    const pal = PAL[h % PAL.length];
    const rects: React.ReactNode[] = [];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        const v = hashStr(`${image}:${x},${y}`) % 10;
        // bias toward a round, leafy blob
        const dist = Math.hypot(x - 3.5, y - 3.5);
        if (v < 3 || dist > 4.2) continue;
        const col = v < 6 ? pal[0] : v < 9 ? pal[1] : pal[2];
        rects.push(<rect key={`${x}${y}`} x={x} y={y} width={1} height={1} fill={col} />);
        rects.push(<rect key={`m${x}${y}`} x={7 - x} y={y} width={1} height={1} fill={col} />);
      }
    body = (
      <svg viewBox="0 0 8 8" width="100%" height="100%" shapeRendering="crispEdges">
        <rect width="8" height="8" fill="#2a2420" />
        {rects}
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
