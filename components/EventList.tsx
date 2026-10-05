'use client';
import Link from 'next/link';
import { useWorld } from '@/lib/store';
import { fmtSol, timeAgo } from '@/lib/format';
import type { TreeEvent } from '@/lib/types';

const KIND: Record<TreeEvent['kind'], string> = {
  climb: 'bg-sap text-[#1b1815]',
  sprout: 'bg-blossom text-[#1b1815]',
  death: 'bg-dead text-ink',
  trade: 'bg-leaf text-[#1b1815]',
  claim: 'bg-leaf text-[#1b1815]',
};

export default function EventList({ events, highlight }: { events: TreeEvent[]; highlight?: string }) {
  const { world } = useWorld();
  const t = (ca: string) => world.coins[ca]?.ticker ?? ca.slice(0, 4);
  return (
    <ul className="divide-y-2 divide-[var(--line)]">
      {events.map((e) => (
        <li key={e.id} id={e.id} className={`py-2 ${highlight === e.id ? 'bg-panel2 outline outline-2 outline-sap' : ''}`}>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`px-1 font-pixel text-[7px] ${KIND[e.kind]}`}>{e.flush ? 'FLUSH' : e.kind.toUpperCase()}</span>
            <Link href={`/coin/${e.coinCa}`} className="text-xl leading-tight hover:text-sap">
              {e.text}
            </Link>
            <span className="ml-auto text-base text-muted">
              {timeAgo(e.at)} · <Link href={`/events?id=${e.id}`}>#{e.id}</Link>
            </span>
          </div>
          {e.kind === 'climb' && e.path && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-lg leading-tight text-muted">
              {e.fee !== undefined && <span>fee {fmtSol(e.fee)} →</span>}
              {e.path.map((a, i) => (
                <span key={a}>
                  <Link href={`/coin/${a}`} className="text-ink hover:text-sap">
                    {t(a)}
                  </Link>{' '}
                  <span className="text-sap">+{fmtSol(e.amounts?.[i] ?? 0)}</span>
                  {i < e.path!.length - 1 && <span className="text-sap"> ↑</span>}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
      {!events.length && <li className="py-6 text-center text-muted">No events yet.</li>}
    </ul>
  );
}
