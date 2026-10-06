'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useStore, useWorld } from '@/lib/store';
import { descendantsCount, lineage } from '@/lib/sim';
import { age, fmtSol, shortCa, timeAgo } from '@/lib/format';
import { leafColor, PALETTES } from '@/lib/season';
import Loading from './Loading';
import CoinSprite from './CoinSprite';
import Ancestry from './Ancestry';
import FeeWaterfall from './FeeWaterfall';
import ProgressBar from './ProgressBar';
import Tree2D from './Tree2D';
import EventList from './EventList';
import Num, { ev } from './Num';
import Sparkline from './Sparkline';
import ShareButton from './ShareButton';
import { FRESH_MS } from '@/lib/fees';

function Stat({ label, children, color = '' }: { label: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="px-box p-3">
      <div className="font-pixel text-[7px] text-muted sm:text-[8px]">{label}</div>
      <div className={`mt-1 text-2xl leading-none ${color}`}>{children}</div>
    </div>
  );
}

export default function CoinView({ ca }: { ca: string }) {
  const { world, version, ready } = useWorld();
  const events = useStore((s) => s.events);
  const season = useStore((s) => s.season);
  const coin = world.coins[ca];
  const recent = useMemo(
    () => events.filter((e) => e.coinCa === ca || e.path?.includes(ca)).slice(-12).reverse(),
    [events, ca],
  );
  const line = useMemo(() => lineage(world, ca), [world, ca, version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Loading />;
  if (!coin)
    return (
      <div className="mx-auto max-w-xl px-3 py-16 text-center">
        <h1 className="font-pixel text-sm">COIN NOT FOUND</h1>
        <p className="mt-3 text-xl text-muted">
          Phase 1 runs a simulator in your browser, so coins that sprouted in someone else&apos;s session aren&apos;t in yours.
        </p>
        <Link href="/forest" className="px-btn mt-6 text-[10px]">
          BACK TO THE FOREST
        </Link>
      </div>
    );

  const parent = coin.parentCa ? world.coins[coin.parentCa] : undefined;
  const progress = coin.vault / coin.launchThreshold;
  const pal = PALETTES[season];
  const leaf = coin.alive ? leafColor(pal, coin.bornAt) : pal.dead;

  return (
    <div className="mx-auto max-w-6xl px-3 py-6">
      <Ancestry line={line} here={ca} />

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <CoinSprite image={coin.image} depth={coin.depth} size={96} className="outline outline-4 outline-[var(--line)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-pixel text-xl sm:text-2xl">{coin.ticker}</h1>
            <span className="px-1.5 py-1 font-pixel text-[8px] text-[#1b1815]" style={{ background: leaf }}>
              {coin.alive ? (Date.now() - coin.bornAt < 3600e3 ? 'FRESH' : Date.now() - coin.bornAt < 86400e3 ? 'GROWING' : 'ESTABLISHED') : 'DORMANT'}
            </span>
            <span className="bg-panel2 px-1.5 py-1 font-pixel text-[8px]">DEPTH {coin.depth}</span>
            {coin.alive && Date.now() - coin.bornAt < FRESH_MS && (
              <span className="bg-blossom px-1.5 py-1 font-pixel text-[8px] text-[#1b1815]" title="For its first hour a coin keeps 75% of its fees in its vault">
                SPROUT BONUS
              </span>
            )}
            {coin.revivals > 0 && <span className="bg-[#9fd8c8] px-1.5 py-1 font-pixel text-[8px] text-[#1b1815]">REVIVED ×{coin.revivals}</span>}
          </div>
          <div className="mt-1 text-xl text-muted">
            {coin.name} · <span title={coin.ca}>{shortCa(coin.ca)}</span> · born {timeAgo(coin.bornAt)}
            {parent && (
              <>
                {' '}
                · child of{' '}
                <Link href={`/coin/${parent.ca}`} className="text-ink underline hover:text-sap">
                  {parent.ticker}
                </Link>
              </>
            )}
          </div>
          {coin.description && <p className="mt-1 text-xl leading-tight">{coin.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`https://pump.fun/coin/${coin.ca}`} target="_blank" rel="noreferrer" className="px-btn px-btn-leaf text-[10px]">
            TRADE ON PUMP.FUN
          </a>
          <Link href={`/tree/${coin.rootCa}`} className="px-btn px-btn-ghost text-[10px]">
            TREE
          </Link>
          <ShareButton
            path={`/coin/${coin.ca}`}
            text={
              coin.depth === 1
                ? `I planted ${coin.ticker} on TREE. ${descendantsCount(world, coin.ca)} coins grow beneath it and every one pays it a cut. 🌳`
                : `${coin.ticker} is depth ${coin.depth} in the ${world.coins[coin.rootCa]?.ticker} tree. ${coin.depth - 1} ancestor${coin.depth === 2 ? ' gets' : 's get'} paid every time it trades. 🌳`
            }
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="VAULT" color="text-leaf">
          <Num href={ev({ coin: ca })}>{fmtSol(coin.vault)}</Num> <span className="text-lg text-muted">SOL</span>
        </Stat>
        <Stat label="FEES EARNED">
          <Num href={ev({ coin: ca, kind: 'climb,trade' })}>{fmtSol(coin.feesEarned)}</Num>
        </Stat>
        <Stat label="FEES SENT UP" color="text-sap">
          <Num href={ev({ coin: ca, kind: 'climb' })}>{fmtSol(coin.feesSentUp)}</Num>
        </Stat>
        <Stat label="RECEIVED FROM BELOW" color="text-blossom">
          <Num href={ev({ via: ca })}>{fmtSol(coin.feesReceivedFromBelow)}</Num>
        </Stat>
      </div>

      <div className="px-box mt-3 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-pixel text-[9px] text-blossom">PROGRESS TO NEXT SPROUT</span>
          <span className="text-lg text-muted">
            {coin.alive ? (
              <>
                {fmtSol(coin.vault)} / {fmtSol(coin.launchThreshold)} SOL ({Math.floor(progress * 100)}%)
              </>
            ) : (
              'dormant: vault emptied, no more children'
            )}
          </span>
        </div>
        <ProgressBar value={progress} segments={24} color={progress > 0.85 ? '#ff8fb1' : '#7bd389'} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <FeeWaterfall ca={ca} />
          <Sparkline ca={ca} />
        </div>
        <div className="space-y-4">
          <div className="px-box p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-pixel text-[9px] text-muted">ITS BRANCH</span>
              <Link href={`/tree/${coin.rootCa}`} className="font-pixel text-[8px] text-sap">
                OPEN 3D →
              </Link>
            </div>
            <Link href={`/tree/${coin.rootCa}`} className="block aspect-[4/3] bg-panel2">
              <Tree2D rootCa={coin.rootCa} width={140} height={105} highlightCa={ca} live />
            </Link>
          </div>
          <div className="px-box p-3">
            <div className="mb-2 font-pixel text-[9px] text-muted">
              CHILDREN ({coin.children.length}) ·{' '}
              <Num href={ev({ root: coin.rootCa, kind: 'sprout', under: ca })}>{descendantsCount(world, ca)} descendants</Num>
            </div>
            <ul className="space-y-1">
              {coin.children.map((k) => {
                const c = world.coins[k];
                return (
                  <li key={k} className="flex items-center gap-2 text-xl">
                    <CoinSprite image={c.image} depth={c.depth} size={24} />
                    <Link href={`/coin/${k}`} className={`hover:text-sap ${c.alive ? '' : 'text-muted line-through'}`}>
                      {c.ticker}
                    </Link>
                    <span className="ml-auto text-lg text-muted">{age(c.bornAt)}</span>
                  </li>
                );
              })}
              {!coin.children.length && <li className="text-lg text-muted">No children yet. The vault is filling.</li>}
            </ul>
          </div>
        </div>
      </div>

      <section className="px-box mt-6 p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-pixel text-[9px] text-muted">RECENT EVENTS</h2>
          <Link href={ev({ any: ca })} className="font-pixel text-[8px] text-sap">
            ALL →
          </Link>
        </div>
        <EventList events={recent} />
      </section>
    </div>
  );
}
