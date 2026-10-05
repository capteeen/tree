'use client';
import Link from 'next/link';
import { ancestorFractions, VAULT_SHARE } from '@/lib/fees';
import { fmtSol, pct } from '@/lib/format';
import { ancestors } from '@/lib/sim';
import { useWorld } from '@/lib/store';
import type { Ca } from '@/lib/types';
import Num, { ev } from './Num';

interface Row {
  key: string;
  label: string;
  sub: string;
  frac: number;
  href?: string;
  color: string;
  ca?: Ca;
}

/**
 * Pixel waterfall: 100% of a coin's fees falls into its vault (50%) and climbs
 * the rest of the way up, halving at every ancestor; the root catches the remainder.
 * Pass a coin to label real ancestors, or `exampleDepth` for a generic diagram.
 */
export default function FeeWaterfall({ ca, exampleDepth = 4, compact }: { ca?: Ca; exampleDepth?: number; compact?: boolean }) {
  const { world } = useWorld();
  const coin = ca ? world.coins[ca] : undefined;
  const path = coin ? ancestors(world, coin.ca) : [];
  const n = coin ? path.length : exampleDepth - 1;
  const fr = ancestorFractions(n);
  const fees = coin?.feesEarned ?? 0;
  const self = coin?.ticker ?? `DEPTH-${exampleDepth} COIN`;

  const rows: Row[] = [
    { key: 'vault', label: `${self} VAULT`, sub: 'funds its next child', frac: VAULT_SHARE, color: '#7bd389', ca: coin?.ca },
  ];
  if (n === 0) {
    rows.push({ key: 'planter', label: 'PLANTER', sub: 'a root has no ancestors: the climb goes to whoever planted it', frac: 0.5, color: '#f5a623' });
  }
  const names = ['PARENT', 'GRANDPARENT', 'GREAT-GRANDPARENT'];
  for (let i = 0; i < n; i++) {
    const a = coin ? world.coins[path[i]] : undefined;
    const isRoot = i === n - 1;
    const rel = isRoot ? 'ROOT' : i < 3 ? names[i] : `${i + 1}× ANCESTOR`;
    rows.push({
      key: `a${i}`,
      label: a ? `${a.ticker}` : rel,
      sub: a ? `${rel} · DEPTH ${a.depth}` : isRoot ? 'takes the remainder' : `${pct(0.5 ** (i + 1))} of the climb`,
      frac: fr[i],
      href: a ? `/coin/${a.ca}` : undefined,
      color: isRoot ? '#f5a623' : '#ffc44d',
      ca: a?.ca,
    });
  }

  return (
    <div className="px-box p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-pixel text-[10px] text-sap sm:text-xs">FEE WATERFALL</h3>
        <span className="text-lg text-muted">
          {coin ? (
            <>
              of <Num href={ev({ coin: coin.ca, kind: 'climb,trade' })}>{fmtSol(fees)} SOL</Num> fees earned
            </>
          ) : (
            'every trade, every coin'
          )}
        </span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="w-[42%] truncate font-pixel text-[9px] text-ink sm:w-[36%]">{self} FEES</span>
        <div className="flex h-4 flex-1 bg-[var(--line)]">
          <span className="h-full w-1/2 bg-leaf" />
          <span className="h-full w-1/2 bg-sap" />
        </div>
        <span className="w-14 text-right font-pixel text-[9px]">100%</span>
      </div>
      <div className="relative">
        {rows.map((r, i) => (
          <div key={r.key} className="relative flex items-center gap-2 py-1" style={{ paddingLeft: compact ? 0 : Math.min(i, 8) * 6 }}>
            <div className="w-[42%] min-w-0 sm:w-[36%]">
              <div className="truncate font-pixel text-[9px] leading-tight">
                {r.href ? (
                  <Link href={r.href} className="hover:text-sap">
                    {i > 0 ? '↑ ' : ''}
                    {r.label}
                  </Link>
                ) : (
                  <>
                    {i > 0 ? '↑ ' : ''}
                    {r.label}
                  </>
                )}
              </div>
              {!compact && <div className="truncate text-base leading-tight text-muted">{r.sub}</div>}
            </div>
            <div className="relative h-4 flex-1 overflow-hidden bg-[var(--line)]">
              <span className="absolute inset-y-0 left-0 waterfall-fill" style={{ width: `${Math.max(1.5, r.frac * 100)}%`, background: r.color, animationDelay: `${i * 0.12}s` }} />
              {i > 0 && <span className="drip" style={{ animationDelay: `${i * 0.25}s` }} />}
            </div>
            <span className="w-14 text-right font-pixel text-[9px]">
              {coin && fees > 0 ? (
                r.ca && r.key !== 'vault' ? (
                  <Num href={ev({ via: r.ca, from: coin.ca })}>{pct(r.frac)}</Num>
                ) : (
                  pct(r.frac)
                )
              ) : (
                pct(r.frac)
              )}
            </span>
          </div>
        ))}
      </div>
      {coin && fees > 0 && (
        <p className="mt-2 text-lg leading-tight text-muted">
          So far: <span className="text-leaf">{fmtSol(fees * VAULT_SHARE)}</span> SOL into its own vault,{' '}
          <Num href={ev({ coin: coin.ca, kind: 'climb' })}>{fmtSol(coin.feesSentUp)} SOL</Num> climbed to {n} ancestor{n === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
