'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWorld } from '@/lib/store';
import { fmtSol } from '@/lib/format';
import TreeView from './TreeView';
import Counters from './Counters';
import Steps from './Steps';
import FeeWaterfall from './FeeWaterfall';
import AboutToSprout from './AboutToSprout';
import DeepestBadge from './DeepestBadge';
import Num, { ev } from './Num';

export default function Home() {
  const { world, ready } = useWorld();
  const router = useRouter();
  const [rootCa, setRootCa] = useState<string | null>(null);

  // Hero = the largest tree by fees at load time (kept stable while you watch it).
  useEffect(() => {
    if (!ready || rootCa) return;
    const best = Object.values(world.trees).sort((a, b) => b.totalFees - a.totalFees)[0];
    if (best) setRootCa(best.rootCa);
  }, [ready, world, rootCa]);

  const root = rootCa ? world.coins[rootCa] : undefined;
  const tree = rootCa ? world.trees[rootCa] : undefined;

  return (
    <div>
      <section className="relative h-[62svh] min-h-[380px] w-full overflow-hidden sm:h-[72vh]">
        {rootCa && <TreeView rootCa={rootCa} onSelect={(ca) => router.push(`/coin/${ca}`)} />}
        <div className="pointer-events-none absolute inset-x-0 top-0 hidden flex-wrap items-start justify-between gap-2 p-3 sm:flex">
          {root && tree && (
            <div className="pointer-events-auto bg-[#1b1815]/80 p-2 text-[#f4f4f2]">
              <div className="font-pixel text-[7px] text-[#a89c8c] sm:text-[8px]">BIGGEST TREE BY FEES</div>
              <Link href={`/tree/${root.ca}`} className="font-pixel text-xs text-leaf hover:text-sap sm:text-sm">
                {root.ticker} →
              </Link>
              <div className="text-base leading-tight sm:text-lg">
                <Num href={ev({ root: root.ca, kind: 'sprout' })}>{tree.coins} coins</Num> ·{' '}
                <Num href={ev({ root: root.ca, kind: 'climb,trade' })}>{fmtSol(tree.totalFees)} SOL fees</Num> ·{' '}
                <Num href={ev({ root: root.ca, kind: 'climb' })}>{fmtSol(tree.solClimbed)} climbed</Num>
              </div>
            </div>
          )}
          <div className="pointer-events-auto">
            <DeepestBadge />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-[var(--bg)] to-transparent p-3 pt-16">
          <div>
            <h1 className="font-pixel text-base leading-snug sm:text-2xl">
              A COIN THAT GROWS
              <br />
              <span className="text-leaf">A FAMILY TREE</span>
            </h1>
            <p className="mt-1 hidden text-lg text-muted sm:block">drag to rotate · scroll to zoom · click a branch to open that coin</p>
            <p className="mt-1 text-base text-muted sm:hidden">drag · pinch · tap a branch</p>
          </div>
          <Link href="/plant" className="px-btn pointer-events-auto shrink-0 text-[10px] sm:text-xs">
            PLANT A ROOT
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-12 px-3 pt-6">
        {root && tree && (
          <div className="-mt-2 flex items-center justify-between gap-2 text-lg sm:hidden">
            <Link href={`/tree/${root.ca}`} className="truncate">
              <span className="font-pixel text-[8px] text-muted">BIGGEST </span>
              <span className="font-pixel text-[9px] text-leaf">{root.ticker}</span>
              <span className="text-muted"> · {tree.coins} coins · {fmtSol(tree.totalFees)} SOL</span>
            </Link>
            <DeepestBadge />
          </div>
        )}
        <Counters />

        <section>
          <h2 className="mb-4 font-pixel text-xs text-muted">HOW A TREE GROWS</h2>
          <Steps />
        </section>

        <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div>
            <h2 className="mb-2 font-pixel text-xs text-muted">THE FEE RULE</h2>
            <p className="mb-3 text-xl leading-tight">
              50% of every coin&apos;s fees stays in its own vault. 50% <span className="text-sap">climbs</span>: the parent gets half of
              it, the grandparent a quarter, and so on, and the root takes what&apos;s left. Here&apos;s a depth-4 coin:
            </p>
            <FeeWaterfall exampleDepth={4} />
          </div>
          <div>
            <h2 className="mb-2 font-pixel text-xs text-muted">LIVE</h2>
            <AboutToSprout />
          </div>
        </section>

        <section className="px-box flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-pixel text-sm text-leaf">PLANT YOUR OWN ROOT</div>
            <p className="text-xl text-muted">Every coin that ever grows beneath yours pays you a cut.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/forest" className="px-btn px-btn-ghost text-[10px]">
              SEE THE FOREST
            </Link>
            <Link href="/plant" className="px-btn text-[10px]">
              PLANT A ROOT
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
