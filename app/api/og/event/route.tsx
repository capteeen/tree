import { sim } from '@/lib/server/sim';
import { ogResponse, PixelArrow, TreePicture } from '@/lib/server/og';
import { fmtSol } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** OG card for one event: the climb path drawn on its tree. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const s = sim();
  const e = s.events.find((x) => x.id === id);
  const world = s.world;
  if (!e) return ogResponse(<div style={{ margin: 'auto', fontSize: 28, display: 'flex' }}>TREE</div>);
  const coin = world.coins[e.coinCa];
  const path = [e.coinCa, ...(e.path ?? [])];
  const names = path.map((ca) => world.coins[ca]?.ticker ?? '?');
  const shown = names.length > 5 ? [names[0], names[1], '…', names[names.length - 1]] : names;
  const color: Record<string, string> = { climb: '#f5a623', sprout: '#ff8fb1', death: '#8b5a2b', trade: '#7bd389', revive: '#9fd8c8', claim: '#7bd389' };
  return ogResponse(
    <>
      <div style={{ width: 520, height: 630, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: '#201c18' }}>
        <TreePicture world={world} rootCa={e.rootCa} w={130} h={140} scale={4} highlight={new Set(path)} />
      </div>
      <div style={{ width: 680, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: color[e.kind] ?? '#f5a623', color: '#1b1815', fontSize: 16, padding: '8px 12px' }}>{e.kind.toUpperCase()}</div>
          <div style={{ display: 'flex', fontSize: 14, color: '#a89c8c', marginLeft: 16 }}>DEPTH {e.depth}</div>
        </div>
        <div style={{ display: 'flex', width: 584, fontSize: 20, lineHeight: 1.7, marginTop: 26 }}>{e.text}</div>
        {e.kind === 'climb' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 26, fontSize: 15, lineHeight: 2 }}>
            {shown.flatMap((n, i) => [
              ...(i > 0 ? [<PixelArrow key={`a${i}`} px={3} />] : []),
              <div key={i} style={{ display: 'flex', color: i === 0 ? '#ff8fb1' : i === shown.length - 1 ? '#7bd389' : '#f4f4f2' }}>
                {n}
              </div>,
            ])}
          </div>
        )}
        <div style={{ marginTop: 26, fontSize: 13, color: '#6e5f4c', display: 'flex' }}>{`${coin ? `${coin.ticker} on TREE` : 'TREE'}${e.amount ? ` · ${fmtSol(e.amount)} SOL` : ''}`}</div>
      </div>
    </>,
  );
}
