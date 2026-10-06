import { LOGO_DATA_URL } from '@/lib/brandLogo';
import { serverWorld } from '@/lib/server/world';
import { ogResponse, TreePicture } from '@/lib/server/og';
import { fmtSol } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'TREE: a coin that grows a family tree';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'flex', alignItems: 'baseline' }}>{children}</div>;
const C = ({ c, children }: { c: string; children: React.ReactNode }) => <div style={{ display: 'flex', color: c, marginRight: 10, whiteSpace: 'nowrap', lineHeight: 1.7 }}>{children}</div>;

export default async function Image() {
  const { world } = await serverWorld();
  const best = Object.values(world.trees).sort((a, b) => b.totalFees - a.totalFees)[0];
  const s = world.stats;
  return ogResponse(
    <>
      <div style={{ width: 600, height: 630, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: '#201c18' }}>
        {best && <TreePicture world={world} rootCa={best.rootCa} w={150} h={140} scale={4} />}
      </div>
      <div style={{ width: 600, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 52 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URL} width={72} height={72} alt="" style={{ borderRadius: 8, marginRight: 18 }} />
          <div style={{ display: 'flex', fontSize: 26, color: '#7bd389' }}>TREE</div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, marginTop: 30 }}>A COIN THAT GROWS</div>
        <div style={{ display: 'flex', fontSize: 26, marginTop: 14, color: '#7bd389' }}>A FAMILY TREE</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, fontSize: 16, color: '#a89c8c' }}>
          <Row>
            <C c="#f4f4f2">{s.trees}</C>
            <C c="#a89c8c">trees ·</C>
            <C c="#ff8fb1">{s.coins}</C>
            <C c="#a89c8c">coins</C>
          </Row>
          <Row>
            <C c="#a89c8c">deepest branch</C>
            <C c="#f4f4f2">{s.deepest}</C>
          </Row>
          <Row>
            <C c="#f5a623">{fmtSol(s.solClimbed)} SOL</C>
            <C c="#a89c8c">climbed to ancestors</C>
          </Row>
        </div>
        <div style={{ display: 'flex', marginTop: 34, fontSize: 12, lineHeight: 1.7, color: '#6e5f4c' }}>treeterminal.fun · every child pays every ancestor</div>
      </div>
    </>,
  );
}
