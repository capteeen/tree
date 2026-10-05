'use client';
import Link from 'next/link';
import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWorld } from '@/lib/store';
import { fmtSol, shortCa } from '@/lib/format';
import { HOUR } from '@/lib/sim';
import Loading from '@/components/Loading';
import CoinSprite from '@/components/CoinSprite';
import Num, { ev } from '@/components/Num';

const TABS = [
  { k: 'big', label: 'BIGGEST TREES' },
  { k: 'deep', label: 'DEEPEST TREES' },
  { k: 'earners', label: 'TOP ROOT EARNERS' },
  { k: 'fast', label: 'FASTEST GROWING' },
] as const;
type Tab = (typeof TABS)[number]['k'];

function Board() {
  const { world, version, ready } = useWorld();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((t) => t.k === params.get('tab'))?.k ?? 'big') as Tab;

  const rows = useMemo(() => {
    const trees = Object.values(world.trees);
    const now = Date.now();
    const rate = (t: (typeof trees)[0]) => (t.coins - 1) / Math.max(0.25, (now - t.plantedAt) / HOUR);
    switch (tab) {
      case 'big':
        return trees.sort((a, b) => b.totalFees - a.totalFees).map((t) => ({ ca: t.rootCa, main: <Num href={ev({ root: t.rootCa, kind: 'climb,trade' })}>{fmtSol(t.totalFees)} SOL</Num>, sub: `${t.coins} coins` }));
      case 'deep':
        return trees.sort((a, b) => b.maxDepth - a.maxDepth || b.coins - a.coins).map((t) => ({ ca: t.rootCa, main: <Num href={ev({ root: t.rootCa, kind: 'sprout', depth: String(t.maxDepth) })}>depth {t.maxDepth}</Num>, sub: `${t.coins} coins` }));
      case 'earners':
        return trees
          .map((t) => world.coins[t.rootCa])
          .sort((a, b) => b.feesReceivedFromBelow - a.feesReceivedFromBelow)
          .map((c) => ({ ca: c.ca, main: <Num href={ev({ via: c.ca })}>{fmtSol(c.feesReceivedFromBelow)} SOL</Num>, sub: `from descendants · planter ${shortCa(c.ownerWallet)}` }));
      case 'fast':
        return trees.sort((a, b) => rate(b) - rate(a)).map((t) => ({ ca: t.rootCa, main: <Num href={ev({ root: t.rootCa, kind: 'sprout' })}>{rate(t).toFixed(2)} coins/h</Num>, sub: `${t.coins} coins` }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, version, tab]);

  if (!ready) return <Loading />;
  return (
    <div className="mx-auto max-w-4xl px-3 py-6">
      <h1 className="mb-4 font-pixel text-lg text-sap">LEADERBOARD</h1>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => router.replace(`/leaderboard?tab=${t.k}`)} className={`px-btn shrink-0 text-[8px] ${tab === t.k ? '' : 'px-btn-ghost'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <ol className="px-box divide-y-2 divide-[var(--line)] p-2">
        {rows.map((r, i) => {
          const c = world.coins[r.ca];
          return (
            <li key={r.ca} className="flex items-center gap-3 p-2">
              <span className={`w-8 font-pixel text-xs ${i === 0 ? 'text-sap' : 'text-muted'}`}>{i + 1}</span>
              <CoinSprite image={c.image} depth={c.depth} size={36} />
              <div className="min-w-0 flex-1">
                <Link href={`/tree/${c.ca}`} className="font-pixel text-[10px] hover:text-sap">
                  {c.ticker}
                </Link>
                <div className="truncate text-lg text-muted">{r.sub}</div>
              </div>
              <div className="text-right text-2xl">{r.main}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Board />
    </Suspense>
  );
}
