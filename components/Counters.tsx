'use client';
import Link from 'next/link';
import { useStore, useWorld } from '@/lib/store';
import Odometer from './Odometer';
import { ev } from './Num';

export default function Counters() {
  const { world, ready } = useWorld();
  // only real (mainnet) numbers are shown; the demo's made-up totals read 0
  const live = useStore((st) => st.config?.mode === 'live');
  const s = live ? world.stats : { trees: 0, coins: 0, deepest: 0, solClimbed: 0, deepestCa: undefined };
  const items = [
    { label: 'TREES PLANTED', value: String(s.trees), href: ev({ kind: 'sprout', roots: '1' }), color: 'text-leaf' },
    { label: 'TOTAL COINS', value: String(s.coins), href: ev({ kind: 'sprout' }), color: 'text-blossom' },
    { label: 'DEEPEST BRANCH', value: String(s.deepest), href: s.deepestCa ? `/coin/${s.deepestCa}` : '/leaderboard?tab=deep', color: 'text-[#c89a6a]' },
    { label: 'SOL CLIMBED', value: s.solClimbed.toFixed(3), href: ev({ kind: 'climb' }), color: 'text-sap' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Link key={it.label} href={it.href} className="px-box group block p-3 transition-transform hover:-translate-y-0.5 sm:p-4" title="See the events behind this number">
          <div className="mb-2 font-pixel text-[8px] text-muted sm:text-[9px]">{it.label}</div>
          <div className={`text-lg sm:text-2xl ${it.color}`}>{ready ? <Odometer value={it.value} /> : <span className="font-pixel">…</span>}</div>
        </Link>
      ))}
    </div>
  );
}
