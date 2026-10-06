'use client';
import Link from 'next/link';
import { useWorld } from '@/lib/store';

export default function DeepestBadge() {
  const { world } = useWorld();
  const c = world.stats.deepestAliveCa ? world.coins[world.stats.deepestAliveCa] : undefined;
  if (!c) return null;
  return (
    <Link href={`/coin/${c.ca}`} className="badge-pulse inline-flex shrink-0 items-center gap-2 whitespace-nowrap bg-[#1b1815]/85 px-2 py-1.5 font-pixel text-[7px] text-ink sm:text-[9px]" title="Deepest coin still alive">
      <span className="bg-blossom px-1 py-0.5 text-[#1b1815]">DEEPEST ALIVE</span>
      <span>
        DEPTH {c.depth} · {c.ticker}
      </span>
    </Link>
  );
}
