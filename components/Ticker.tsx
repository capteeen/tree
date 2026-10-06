'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { timeAgo } from '@/lib/format';
import type { TreeEvent } from '@/lib/types';

const COLORS: Record<TreeEvent['kind'], string> = {
  climb: 'text-sap',
  sprout: 'text-blossom',
  death: 'text-[#b08a6a]',
  trade: 'text-leaf',
  claim: 'text-leaf',
  revive: 'text-[#9fd8c8]',
};

/** Live feed of real simulator events. The newest one slides in. */
export default function Ticker() {
  const events = useStore((s) => s.events);
  const ready = useStore((s) => s.ready);
  const recent = events.slice(-4).reverse();
  return (
    <div className="border-y-4 border-[var(--line)] bg-panel2">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-hidden px-3 py-1.5">
        <span className="flex shrink-0 items-center gap-1.5 font-pixel text-[9px] text-blossom">
          <span className="live-dot" /> LIVE
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-6 overflow-hidden whitespace-nowrap text-xl leading-none">
          {!ready && <span className="text-muted">growing the forest…</span>}
          {recent.map((e, i) => (
            <Link
              key={e.id}
              href={`/events?id=${e.id}`}
              className={`${i === 0 ? 'ticker-in' : 'opacity-50 hidden md:inline'} ${COLORS[e.kind]} hover:underline`}
            >
              {e.text}
              <span className="ml-2 text-base text-muted">{timeAgo(e.at)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
