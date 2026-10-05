'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useWorld } from '@/lib/store';
import { fmtSol } from '@/lib/format';
import { LIVE_LIMITS } from '@/lib/sim';
import CoinSprite from './CoinSprite';
import ProgressBar from './ProgressBar';
import Num, { ev } from './Num';

export default function AboutToSprout({ rootCa, limit = 6 }: { rootCa?: string; limit?: number }) {
  const { world, version } = useWorld();
  const list = useMemo(
    () =>
      Object.values(world.coins)
        .filter((c) => c.alive && c.depth < LIVE_LIMITS.maxDepth && (!rootCa || c.rootCa === rootCa))
        .sort((a, b) => b.vault / b.launchThreshold - a.vault / a.launchThreshold)
        .slice(0, limit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, version, rootCa, limit],
  );
  return (
    <div className="px-box p-3 sm:p-4">
      <h3 className="mb-3 font-pixel text-[10px] text-blossom sm:text-xs">ABOUT TO SPROUT</h3>
      <ul className="space-y-3">
        {list.map((c) => (
          <li key={c.ca} className="flex items-center gap-3">
            <CoinSprite image={c.image} depth={c.depth} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/coin/${c.ca}`} className="truncate font-pixel text-[9px] hover:text-sap">
                  {c.ticker}
                </Link>
                <span className="shrink-0 text-lg leading-none text-muted">
                  <Num href={ev({ coin: c.ca })}>{fmtSol(c.vault)}</Num> / {fmtSol(c.launchThreshold)} SOL
                </span>
              </div>
              <ProgressBar value={c.vault / c.launchThreshold} color={c.vault / c.launchThreshold > 0.85 ? '#ff8fb1' : '#7bd389'} />
            </div>
          </li>
        ))}
        {!list.length && <li className="text-muted">Nothing close yet.</li>}
      </ul>
    </div>
  );
}
