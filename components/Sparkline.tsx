'use client';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { fmtSol } from '@/lib/format';
import type { Ca } from '@/lib/types';

const HOUR = 3_600_000;

/** Pixel bars: this coin's fees per hour over the last 24 h, from the events we have. */
export default function Sparkline({ ca }: { ca: Ca }) {
  const events = useStore((s) => s.events);
  const { bars, total, max, oldest } = useMemo(() => {
    const now = Date.now();
    const bars = new Array(24).fill(0) as number[];
    let total = 0;
    let oldest = now;
    for (const e of events) {
      if (e.coinCa !== ca || e.fee === undefined) continue;
      oldest = Math.min(oldest, e.at);
      const age = now - e.at;
      if (age >= 24 * HOUR) continue;
      bars[23 - Math.floor(age / HOUR)] += e.fee;
      total += e.fee;
    }
    return { bars, total, max: Math.max(...bars, 1e-9), oldest };
  }, [events, ca]);
  const coverage = Math.min(24, Math.ceil((Date.now() - oldest) / HOUR));
  return (
    <div className="px-box p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-pixel text-[9px] text-muted">FEES · LAST 24H</span>
        <span className="text-lg leading-none text-sap">{fmtSol(total)} SOL</span>
      </div>
      <div className="flex h-14 items-end gap-[2px]" role="img" aria-label={`Fees per hour over the last 24 hours, ${fmtSol(total)} SOL in total`}>
        {bars.map((v, i) => {
          const h = v > 0 ? Math.max(2, Math.round((v / max) * 14)) * 4 : 2;
          const known = i >= 24 - coverage;
          return <span key={i} className="flex-1" style={{ height: h, background: !known ? 'var(--line)' : v > 0 ? (i === 23 ? '#ff8fb1' : '#f5a623') : 'var(--line)' }} title={`${23 - i}h ago: ${fmtSol(v)} SOL`} />;
        })}
      </div>
      <div className="mt-1 flex justify-between text-base text-muted">
        <span>24h ago</span>
        {coverage < 24 && <span>history starts {coverage}h ago</span>}
        <span>now</span>
      </div>
    </div>
  );
}
