'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useWorld } from '@/lib/store';
import { age, fmtSol, shortCa } from '@/lib/format';
import Tree2D from '@/components/Tree2D';
import Loading from '@/components/Loading';
import Num, { ev } from '@/components/Num';

const SORTS = [
  { k: 'new', label: 'NEWEST' },
  { k: 'fees', label: 'TOTAL FEES' },
  { k: 'coins', label: 'COINS' },
  { k: 'depth', label: 'DEPTH' },
  { k: 'age', label: 'AGE' },
] as const;
type SortKey = (typeof SORTS)[number]['k'];

export default function ForestPage() {
  const { world, version, ready } = useWorld();
  const [sort, setSort] = useState<SortKey>('new');
  const trees = useMemo(() => {
    const list = Object.values(world.trees);
    const f: Record<SortKey, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      new: (a, b) => b.plantedAt - a.plantedAt,
      fees: (a, b) => b.totalFees - a.totalFees,
      coins: (a, b) => b.coins - a.coins,
      depth: (a, b) => b.maxDepth - a.maxDepth,
      age: (a, b) => a.plantedAt - b.plantedAt,
    };
    return list.sort(f[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, version, sort]);

  if (!ready) return <Loading />;
  return (
    <div className="mx-auto max-w-7xl px-3 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-lg text-leaf">THE FOREST</h1>
          <p className="text-xl text-muted">Every tree, every root. {trees.length} planted.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SORTS.map((s) => (
            <button key={s.k} onClick={() => setSort(s.k)} className={`px-btn text-[8px] ${sort === s.k ? '' : 'px-btn-ghost'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {trees.map((t) => {
          const root = world.coins[t.rootCa];
          return (
            <div key={t.rootCa} className="px-box p-3">
              <Link href={`/tree/${t.rootCa}`} className="block aspect-[4/3] bg-panel2" aria-label={`Open ${root.ticker} tree`}>
                <Tree2D rootCa={t.rootCa} width={128} height={96} />
              </Link>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <Link href={`/tree/${t.rootCa}`} className="truncate font-pixel text-[10px] text-leaf hover:text-sap">
                  {root.ticker}
                </Link>
                <span className="text-lg text-muted">planted {age(t.plantedAt)} ago</span>
              </div>
              <div className="mb-1 truncate text-base text-muted" title={root.ownerWallet}>
                by {shortCa(root.ownerWallet)}
              </div>
              <div className="grid grid-cols-3 gap-1 text-lg leading-tight">
                <div>
                  <div className="font-pixel text-[7px] text-muted">COINS</div>
                  <Num href={ev({ root: t.rootCa, kind: 'sprout' })}>{t.coins}</Num>
                  <span className="text-muted"> ({t.alive} alive)</span>
                </div>
                <div>
                  <div className="font-pixel text-[7px] text-muted">DEPTH</div>
                  <Num href={ev({ root: t.rootCa, kind: 'sprout', depth: String(t.maxDepth) })}>{t.maxDepth}</Num>
                </div>
                <div>
                  <div className="font-pixel text-[7px] text-muted">FEES</div>
                  <Num href={ev({ root: t.rootCa, kind: 'climb,trade' })}>{fmtSol(t.totalFees)}</Num>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
