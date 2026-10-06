'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '@/lib/store';
import CoinSprite from './CoinSprite';

/** Find any coin by ticker, name or contract address. */
export default function Search({ onDone }: { onDone?: () => void }) {
  const { world } = useWorld();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return [];
    const all = Object.values(world.coins);
    const score = (c: (typeof all)[0]) => {
      const t = c.ticker.toLowerCase();
      if (t === s || c.ca === q.trim()) return 0;
      if (t.startsWith(s)) return 1;
      if (t.includes(s) || c.name.toLowerCase().includes(s)) return 2;
      if (c.ca.toLowerCase().startsWith(s)) return 3;
      return 9;
    };
    return all
      .map((c) => ({ c, k: score(c) }))
      .filter((x) => x.k < 9)
      .sort((a, b) => a.k - b.k || a.c.depth - b.c.depth)
      .slice(0, 8)
      .map((x) => x.c);
  }, [q, world]);

  useEffect(() => setSel(0), [q]);

  const go = (ca: string) => {
    setQ('');
    setOpen(false);
    onDone?.();
    router.push(`/coin/${ca}`);
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSel((s) => Math.min(hits.length - 1, s + 1));
          else if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
          else if (e.key === 'Enter' && hits[sel]) go(hits[sel].ca);
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="find a coin…"
        aria-label="Search coins"
        className="w-full border-[3px] border-[var(--line)] bg-panel2 px-2 py-1 text-lg leading-none text-ink outline-none focus:border-sap"
      />
      {open && hits.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 border-[3px] border-[var(--line)] bg-panel">
          {hits.map((c, i) => (
            <li key={c.ca}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(c.ca)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left text-lg ${i === sel ? 'bg-panel2 text-sap' : ''}`}
              >
                <CoinSprite image={c.image} depth={c.depth} size={22} />
                <span className="truncate">{c.ticker}</span>
                <span className="ml-auto shrink-0 text-base text-muted">
                  {world.coins[c.rootCa]?.ticker} · D{c.depth}
                  {!c.alive && ' · dormant'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
