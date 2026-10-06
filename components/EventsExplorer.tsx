'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore, useWorld } from '@/lib/store';
import { ancestors } from '@/lib/sim';
import { fmtSol } from '@/lib/format';
import type { TreeEvent } from '@/lib/types';
import EventList from '@/components/EventList';
import Loading from '@/components/Loading';

const PAGE = 300;

/**
 * Filters (all optional, combinable):
 *  id      one event
 *  kind    comma list of sprout,climb,trade,death,claim
 *  coin    events produced by this coin
 *  via     climbs that paid this coin   (+ from=<ca>: only those paid by that coin)
 *  any     events produced by or paying this coin
 *  root    events in this tree
 *  under   sprouts strictly below this coin
 *  depth   events at this depth
 *  roots=1 only root plantings
 *  owner   climbs that paid any coin owned by this wallet
 */
function Explorer() {
  const q = useSearchParams();
  const events = useStore((s) => s.events);
  const { world, ready } = useWorld();

  const { list, sum, sumLabel, title } = useMemo(() => {
    const id = q.get('id');
    const kinds = q.get('kind')?.split(',');
    const coin = q.get('coin');
    const via = q.get('via');
    const from = q.get('from');
    const any = q.get('any');
    const root = q.get('root');
    const under = q.get('under');
    const depth = q.get('depth');
    const rootsOnly = q.get('roots') === '1';
    const owner = q.get('owner');
    const owned = owner ? new Set(Object.values(world.coins).filter((c) => c.ownerWallet === owner).map((c) => c.ca)) : null;

    let sum = 0;
    let sumLabel = '';
    const list: TreeEvent[] = [];
    for (const e of events) {
      if (id && e.id !== id) continue;
      if (kinds && !kinds.includes(e.kind)) continue;
      if (coin && e.coinCa !== coin) continue;
      if (via && !e.path?.includes(via)) continue;
      if (via && e.kind !== 'climb') continue;
      if (from && e.coinCa !== from) continue;
      if (any && e.coinCa !== any && !e.path?.includes(any)) continue;
      if (root && e.rootCa !== root) continue;
      if (depth && e.depth !== Number(depth)) continue;
      if (rootsOnly && e.depth !== 1) continue;
      if (under && (e.coinCa === under || !ancestors(world, e.coinCa).includes(under))) continue;
      if (owned && !(e.kind === 'climb' && e.path?.some((p) => owned.has(p)))) continue;
      list.push(e);
      if (via) sum += e.amounts?.[e.path!.indexOf(via)] ?? 0;
      else if (owned) e.path!.forEach((p, i) => owned.has(p) && (sum += e.amounts?.[i] ?? 0));
      else if (kinds?.length === 1 && kinds[0] === 'climb') sum += e.amount ?? 0;
      else if (kinds?.includes('trade')) sum += e.fee ?? 0;
    }
    if (via) sumLabel = `received by ${world.coins[via]?.ticker ?? via}${from ? ` from ${world.coins[from]?.ticker}` : ''}`;
    else if (owned) sumLabel = 'received by this wallet’s coins';
    else if (kinds?.length === 1 && kinds[0] === 'climb') sumLabel = 'climbed';
    else if (kinds?.includes('trade')) sumLabel = 'in trade fees';
    const name = (ca: string | null) => (ca ? world.coins[ca]?.ticker ?? ca.slice(0, 6) : '');
    const parts = [
      kinds?.join(' + ').toUpperCase(),
      coin && `by ${name(coin)}`,
      via && `paying ${name(via)}`,
      any && `involving ${name(any)}`,
      root && `in ${name(root)} tree`,
      under && `below ${name(under)}`,
      depth && `at depth ${depth}`,
      rootsOnly && 'root plantings',
      owner && 'paying your coins',
    ].filter(Boolean);
    return { list: list.reverse(), sum, sumLabel, title: parts.join(' · ') || 'ALL EVENTS' };
  }, [q, events, world]);

  const id = q.get('id');
  useEffect(() => {
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'center' });
  }, [id, ready]);

  if (!ready) return <Loading />;
  return (
    <div className="mx-auto max-w-5xl px-3 py-6">
      <h1 className="font-pixel text-sm text-sap">EVENTS</h1>
      <p className="mt-1 text-xl text-muted">{title}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-xl">
        <span>
          <b className="font-pixel text-xs">{list.length}</b> events
        </span>
        {sumLabel && (
          <span>
            <b className="font-pixel text-xs text-sap">{fmtSol(sum)}</b> SOL {sumLabel}
          </span>
        )}
        {title !== 'ALL EVENTS' && (
          <Link href="/events" className="underline hover:text-sap">
            clear filters
          </Link>
        )}
      </div>
      <p className="mt-1 text-base text-muted">
        Showing the latest {Math.min(PAGE, list.length)}. This browser keeps the last {events.length.toLocaleString()} events; numbers include
        older history that has rolled off.
      </p>
      <section className="px-box mt-4 p-3">
        <EventList events={list.slice(0, PAGE)} highlight={id ?? undefined} />
      </section>
    </div>
  );
}

export default function EventsExplorer() {
  return (
    <Suspense fallback={<Loading />}>
      <Explorer />
    </Suspense>
  );
}
