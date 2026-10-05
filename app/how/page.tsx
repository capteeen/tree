import Link from 'next/link';
import FeeWaterfall from '@/components/FeeWaterfall';
import Steps from '@/components/Steps';
import { ancestorFractions } from '@/lib/fees';
import { pct } from '@/lib/format';
import { LAUNCH_COST, LAUNCH_THRESHOLD, ROOT_RESERVE } from '@/lib/sim';

export const metadata = { title: 'How it works · TREE' };

/** Pixel diagram: a chain of coins with sap climbing from YOU down the staircase to the ROOT. */
function ClimbDiagram() {
  const chain = ['ROOT', 'OAK', 'ACORN', 'SPROUT', 'YOU'];
  const fr = ancestorFractions(chain.length - 1).reverse(); // root first
  const W = 15;
  const H = 6;
  const pos = chain.map((_, i) => ({ x: 3 + i * 19.5, y: 36 - i * 7.5 }));
  const font = "'Press Start 2P', monospace";
  return (
    <div className="px-box overflow-x-auto p-4">
      <svg viewBox="0 0 100 50" className="h-auto w-full min-w-[520px]" shapeRendering="crispEdges">
        <rect x="0" y="46" width="100" height="1.5" fill="#4e9a5a" />
        <rect x="0" y="47.5" width="100" height="2.5" fill="#5a3a1e" />
        {pos.slice(1).map((p, j) => {
          const q = pos[j]; // parent
          const d = `M ${p.x} ${p.y + H / 2} L ${q.x + W / 2} ${p.y + H / 2} L ${q.x + W / 2} ${q.y}`;
          return (
            <g key={`c${j}`}>
              <path d={d} stroke="#8b5a2b" strokeWidth="1.4" fill="none" />
              <rect x="-0.8" y="-0.8" width="1.6" height="1.6" fill="#fff3c4">
                <animateMotion path={d} dur="1.4s" begin={`${(chain.length - 2 - j) * 0.5}s`} repeatCount="indefinite" />
              </rect>
            </g>
          );
        })}
        {chain.map((n, i) => {
          const { x, y } = pos[i];
          const you = i === chain.length - 1;
          return (
            <g key={n}>
              <rect x={x} y={y} width={W} height={H} fill={you ? '#ff8fb1' : i === 0 ? '#f5a623' : '#7bd389'} />
              <text x={x + W / 2} y={y + 4} fontSize="1.9" textAnchor="middle" fill="#1b1815" fontFamily={font}>
                {n}
              </text>
              <text x={x + W / 2} y={y + H + 2.6} fontSize="1.7" textAnchor="middle" fill={you ? '#7bd389' : '#f5a623'} fontFamily={font}>
                {you ? 'KEEPS 50%' : `+${pct(fr[i])}`}
              </text>
            </g>
          );
        })}
        <text x="2" y="4" fontSize="1.7" fill="#a89c8c" fontFamily={font}>
          ONE TRADE OF YOU = 100% FEES
        </text>
      </svg>
    </div>
  );
}

function DecayTable() {
  const depths = [2, 3, 4, 5, 6, 8, 10];
  return (
    <div className="px-box overflow-x-auto p-3">
      <table className="w-full min-w-[480px] text-xl">
        <thead>
          <tr className="font-pixel text-[8px] text-muted">
            <th className="p-1 text-left">PAYER DEPTH</th>
            <th className="p-1 text-right">ANCESTORS PAID</th>
            <th className="p-1 text-right">PARENT</th>
            <th className="p-1 text-right">GRANDPARENT</th>
            <th className="p-1 text-right">ROOT</th>
          </tr>
        </thead>
        <tbody>
          {depths.map((d) => {
            const fr = ancestorFractions(d - 1);
            return (
              <tr key={d} className="border-t-2 border-[var(--line)]">
                <td className="p-1">DEPTH-{d}</td>
                <td className="p-1 text-right">{d - 1}</td>
                <td className="p-1 text-right text-sap">{pct(fr[0])}</td>
                <td className="p-1 text-right">{fr.length > 2 ? pct(fr[1]) : '—'}</td>
                <td className="p-1 text-right text-leaf">{pct(fr[fr.length - 1])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HowPage() {
  return (
    <article className="mx-auto max-w-4xl space-y-10 px-3 py-8 text-2xl leading-snug">
      <header>
        <h1 className="font-pixel text-lg text-leaf sm:text-xl">HOW TREE WORKS</h1>
        <p className="mt-3 text-muted">
          One coin grows a family tree. Every coin funds its own children, and every coin pays everyone above it. The original gets a cut of
          everything that ever grows beneath it.
        </p>
      </header>

      <Steps />

      <section className="space-y-3">
        <h2 className="font-pixel text-xs text-sap">1. THE VAULT</h2>
        <p>
          Every coin launched through TREE has a vault: a wallet that is the pump.fun creator of that coin&apos;s children. Half of each
          coin&apos;s creator fees land in its vault. When the vault reaches the <b>launch threshold</b> (pump.fun launch cost{' '}
          {LAUNCH_COST} SOL + reserve {ROOT_RESERVE} SOL = {LAUNCH_THRESHOLD} SOL), the vault launches a child coin. The child&apos;s image is
          its parent&apos;s image with a depth badge in the corner.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-pixel text-xs text-sap">2. THE CLIMB</h2>
        <p>
          The other half <span className="text-sap">climbs</span>. Your parent gets 50% of the climb, your grandparent 25%, your
          great-grandparent 12.5%, halving every step, and the root takes whatever remains. So a depth-10 coin pays nine ancestors on every
          single trade.
        </p>
        <ClimbDiagram />
        <DecayTable />
      </section>

      <section className="space-y-3">
        <h2 className="font-pixel text-xs text-sap">3. THE WATERFALL</h2>
        <p>Every coin page shows this split for that exact coin, with the real names of its ancestors and the SOL each one received.</p>
        <FeeWaterfall exampleDepth={6} />
      </section>

      <section className="space-y-3">
        <h2 className="font-pixel text-xs text-sap">4. LIFE AND DEATH</h2>
        <p>
          Leaves are <span className="text-blossom">pink</span> for the first hour, <span className="text-leaf">green</span> after that and{' '}
          <span className="text-sap">gold</span> after a day. A coin with an empty vault and no trades for 24 hours goes dormant: its last sap
          climbs, its leaves fall, and the bare branch stays on the tree forever. The palette shifts with the season.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-pixel text-xs text-sap">5. WHAT YOU EARN</h2>
        <p>
          Plant a root and every coin that ever grows below it sends you a cut. A root has no ancestors, so its own climbing half goes to you
          too. Claim it on <Link href="/me" className="underline hover:text-sap">your page</Link>.
        </p>
      </section>

      <section className="px-box p-4 text-xl">
        <p>
          <b>Phase 1:</b> this site runs a simulator in your browser so you can watch the mechanic work. Launches and claims are mocked. Every
          number links to the events behind it.
        </p>
        <p className="mt-2 text-muted">Coins launch on pump.fun (Solana). A meme, not an investment. Crypto is risky. Only use what you can afford to lose.</p>
      </section>
    </article>
  );
}
