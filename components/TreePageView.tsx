'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '@/lib/store';
import { treeOrder } from '@/lib/sim';
import { fmtSol, age } from '@/lib/format';
import { leafColor, PALETTES } from '@/lib/season';
import { useStore } from '@/lib/store';
import { onEvent } from '@/lib/bus';
import TreeView from './TreeView';
import Loading from './Loading';
import CoinSprite from './CoinSprite';
import ProgressBar from './ProgressBar';
import Num, { ev } from './Num';

export default function TreePageView({ rootCa }: { rootCa: string }) {
  const { world, version, ready } = useWorld();
  const season = useStore((s) => s.season);
  const [focus, setFocus] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const order = useMemo(() => treeOrder(world, rootCa), [world, rootCa, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      onEvent((e) => {
        if (e.rootCa !== rootCa) return;
        const ids = e.kind === 'climb' ? [e.coinCa, ...(e.path ?? [])] : [e.coinCa];
        setFlash((f) => {
          const n = { ...f };
          ids.forEach((id) => (n[id] = (n[id] ?? 0) + 1));
          return n;
        });
      }),
    [rootCa],
  );

  useEffect(() => {
    if (!focus) return;
    listRef.current?.querySelector(`[data-ca="${focus}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  if (!ready) return <Loading />;
  const root = world.coins[rootCa];
  const tree = world.trees[rootCa];
  if (!root || !tree)
    return (
      <div className="mx-auto max-w-xl px-3 py-16 text-center">
        <h1 className="font-pixel text-sm">TREE NOT FOUND</h1>
        <p className="mt-3 text-xl text-muted">Phase 1 runs in your browser, so trees grown elsewhere aren&apos;t here.</p>
        <Link href="/forest" className="px-btn mt-6 text-[10px]">
          BACK TO THE FOREST
        </Link>
      </div>
    );
  const sel = focus ? world.coins[focus] : undefined;
  const pal = PALETTES[season];

  return (
    <div className="relative flex h-[calc(100svh-96px)] min-h-[480px] flex-col md:flex-row">
      <div className="relative min-h-0 flex-1">
        <TreeView rootCa={rootCa} focusCa={focus} onSelect={(ca) => setFocus(ca)} />
        <div className="pointer-events-none absolute left-0 top-0 p-3">
          <div className="pointer-events-auto bg-[#1b1815]/80 p-2 text-[#f4f4f2]">
            <div className="font-pixel text-xs text-leaf">{root.ticker} TREE</div>
            <div className="text-lg leading-tight">
              <Num href={ev({ root: rootCa, kind: 'sprout' })}>{tree.coins} coins</Num> ·{' '}
              <Num href={ev({ root: rootCa, kind: 'sprout', depth: String(tree.maxDepth) })}>depth {tree.maxDepth}</Num> ·{' '}
              <Num href={ev({ root: rootCa, kind: 'climb' })}>{fmtSol(tree.solClimbed)} SOL climbed</Num>
            </div>
            {focus && (
              <button onClick={() => setFocus(null)} className="mt-1 font-pixel text-[8px] text-sap">
                ← WHOLE TREE
              </button>
            )}
          </div>
        </div>
        {sel && (
          <div className="absolute bottom-3 left-3 right-3 max-w-sm bg-[#1b1815]/90 p-3 text-[#f4f4f2] md:right-auto">
            <div className="flex items-center gap-3">
              <CoinSprite image={sel.image} depth={sel.depth} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-pixel text-[10px]">{sel.ticker}</div>
                <div className="text-lg leading-tight text-[#a89c8c]">
                  depth {sel.depth} · {sel.children.length} children · {sel.alive ? `born ${age(sel.bornAt)} ago` : 'dormant'}
                </div>
              </div>
              <Link href={`/coin/${sel.ca}`} className="px-btn text-[8px]">
                OPEN
              </Link>
            </div>
            <div className="mt-2">
              <ProgressBar value={sel.vault / sel.launchThreshold} />
              <div className="mt-1 text-base text-[#a89c8c]">
                vault {fmtSol(sel.vault)} / {fmtSol(sel.launchThreshold)} SOL to next sprout
              </div>
            </div>
          </div>
        )}
      </div>
      <aside className={`flex min-h-0 flex-col border-t-4 border-[var(--line)] bg-panel md:w-80 md:border-l-4 md:border-t-0 ${panelOpen ? 'h-[42%] md:h-auto' : 'h-auto'}`}>
        <button onClick={() => setPanelOpen(!panelOpen)} className="flex items-center justify-between px-3 py-2 font-pixel text-[9px] text-muted">
          <span>EVERY COIN ({order.length})</span>
          <span className="md:hidden">{panelOpen ? '▼' : '▲'}</span>
        </button>
        {panelOpen && (
          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
            {order.map((c) => (
              <li key={c.ca} data-ca={c.ca}>
                <button
                  onClick={() => setFocus(c.ca)}
                  className={`flex w-full items-center gap-2 py-0.5 pr-2 text-left text-lg leading-tight hover:bg-panel2 ${focus === c.ca ? 'bg-panel2 text-sap' : ''}`}
                  style={{ paddingLeft: 8 + Math.min(c.depth - 1, 12) * 12 }}
                >
                  <span
                    key={flash[c.ca] ?? 0}
                    className={`h-2.5 w-2.5 shrink-0 ${flash[c.ca] ? 'sprout-flash' : ''}`}
                    style={{ background: c.alive ? leafColor(pal, c.bornAt) : pal.dead }}
                  />
                  <span className={`truncate ${c.alive ? '' : 'text-muted line-through'}`}>{c.ticker}</span>
                  <span className="ml-auto shrink-0 text-base text-muted">D{c.depth}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
