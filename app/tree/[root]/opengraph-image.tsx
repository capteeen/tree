import { hub } from '@/lib/server/engine';
import { ogResponse, TreePicture } from '@/lib/server/og';
import { fmtSol } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'A tree on TREE';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 10 }}>{children}</div>;
const C = ({ c, children }: { c: string; children: React.ReactNode }) => <div style={{ display: 'flex', color: c, marginRight: 10, whiteSpace: 'nowrap', lineHeight: 1.7 }}>{children}</div>;

export default async function Image({ params }: { params: { root: string } }) {
  const { world } = hub();
  const root = world.coins[params.root];
  const tree = world.trees[params.root];
  if (!root || !tree) return ogResponse(<div style={{ margin: 'auto', fontSize: 28, display: 'flex' }}>TREE</div>);
  const deepest = Object.values(world.coins)
    .filter((c) => c.rootCa === root.ca && c.alive)
    .sort((a, b) => b.depth - a.depth)[0];
  return ogResponse(
    <>
      <div style={{ width: 600, height: 630, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: '#201c18' }}>
        <TreePicture world={world} rootCa={root.ca} w={150} h={140} scale={4} highlight={deepest ? new Set([deepest.ca]) : undefined} />
      </div>
      <div style={{ width: 600, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 48 }}>
        <div style={{ display: 'flex', fontSize: 20, color: '#7bd389' }}>TREE</div>
        <div style={{ display: 'flex', fontSize: root.ticker.length > 8 ? 40 : 56, marginTop: 18 }}>{root.ticker}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22, fontSize: 14, color: '#a89c8c' }}>
          <Row>
            <C c="#ff8fb1">{tree.coins}</C>
            <C c="#a89c8c">coins ·</C>
            <C c="#f4f4f2">{tree.alive}</C>
            <C c="#a89c8c">alive</C>
          </Row>
          <Row>
            <C c="#a89c8c">depth</C>
            <C c="#f4f4f2">{tree.maxDepth}</C>
            {deepest && <C c="#a89c8c">· deepest alive {deepest.ticker}</C>}
          </Row>
          <Row>
            <C c="#f5a623">{fmtSol(tree.solClimbed)} SOL</C>
            <C c="#a89c8c">climbed to its branches</C>
          </Row>
          <Row>
            <C c="#f4f4f2">{fmtSol(tree.totalFees)} SOL</C>
            <C c="#a89c8c">fees in total</C>
          </Row>
        </div>
        <div style={{ display: 'flex', marginTop: 30, fontSize: 12, lineHeight: 1.7, color: '#6e5f4c' }}>every coin below the root pays it a cut</div>
      </div>
    </>,
  );
}
