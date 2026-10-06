'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import WalletGate from '@/components/WalletGate';
import { WalletMultiButton } from '@/components/WalletProviders';
import { useWorld, useStore } from '@/lib/store';
import { fmtSol, shortCa } from '@/lib/format';
import Loading from '@/components/Loading';
import CoinSprite from '@/components/CoinSprite';
import Num, { ev } from '@/components/Num';

function Me() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { world, version, ready } = useWorld();
  const [demo, setDemo] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const wallet = publicKey?.toBase58() ?? demo;

  const mine = useMemo(
    () => (wallet ? Object.values(world.coins).filter((c) => c.ownerWallet === wallet).sort((a, b) => a.depth - b.depth || a.bornAt - b.bornAt) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, version, wallet],
  );

  if (!ready) return <Loading />;

  if (!wallet) {
    const sample = world.roots[0] ? world.coins[world.roots[0]].ownerWallet : null;
    return (
      <div className="mx-auto max-w-xl px-3 py-16 text-center">
        <h1 className="font-pixel text-sm">YOUR GROVE</h1>
        <p className="mt-3 text-xl text-muted">Connect a wallet to see your roots, your coins and what your descendants have sent you.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => setVisible(true)} className="px-btn text-[10px]">
            CONNECT WALLET
          </button>
          {sample && (
            <button onClick={() => setDemo(sample)} className="px-btn px-btn-ghost text-[10px]">
              VIEW A SAMPLE PLANTER
            </button>
          )}
        </div>
      </div>
    );
  }

  const roots = mine.filter((c) => c.depth === 1);
  const received = mine.reduce((n, c) => n + c.feesReceivedFromBelow, 0);
  const earned = mine.reduce((n, c) => n + c.ownerEarned, 0);
  const claimable = mine.reduce((n, c) => n + c.ownerEarned - c.claimed, 0);

  return (
    <div className="mx-auto max-w-5xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-pixel text-sm text-leaf">YOUR GROVE</h1>
        <div className="flex items-center gap-3">
          <span className="text-lg text-muted">
            {demo && !publicKey ? 'sample planter ' : ''}
            {shortCa(wallet)}
          </span>
          <div className="wallet-wrap">
            <WalletMultiButton />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="px-box p-3">
          <div className="font-pixel text-[8px] text-muted">YOUR ROOTS</div>
          <div className="text-3xl">{roots.length}</div>
        </div>
        <div className="px-box p-3">
          <div className="font-pixel text-[8px] text-muted">YOUR COINS</div>
          <div className="text-3xl">{mine.length}</div>
        </div>
        <div className="px-box p-3">
          <div className="font-pixel text-[8px] text-muted">FROM DESCENDANTS</div>
          <div className="text-3xl text-blossom">
            <Num href={ev({ owner: wallet })}>{fmtSol(received)}</Num>
          </div>
        </div>
        <div className="px-box p-3">
          <div className="font-pixel text-[8px] text-muted">CLAIMABLE</div>
          <div className="text-3xl text-sap">{fmtSol(claimable)}</div>
          <div className="text-base text-muted">of {fmtSol(earned)} earned</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          disabled={claimable <= 0 || !publicKey}
          onClick={async () => {
            try {
              const amt = await useStore.getState().claim(wallet);
              setToast(`Claimed ${fmtSol(amt)} SOL (simulated, no transaction sent).`);
            } catch {
              setToast('Claim failed. Try again.');
            }
          }}
          className="px-btn text-[10px]"
        >
          CLAIM {fmtSol(claimable)} SOL
        </button>
        {!publicKey && <span className="text-lg text-muted">connect the owning wallet to claim</span>}
        {toast && <span className="text-lg text-leaf">{toast}</span>}
        <Link href="/plant" className="px-btn px-btn-ghost ml-auto text-[10px]">
          PLANT ANOTHER
        </Link>
      </div>

      {mine.length > 0 && (
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {Object.values(
            mine.reduce<Record<string, { root: string; coins: typeof mine }>>((acc, c) => {
              (acc[c.rootCa] ??= { root: c.rootCa, coins: [] }).coins.push(c);
              return acc;
            }, {}),
          ).map(({ root, coins }) => {
            const tree = world.trees[root];
            const rootCoin = world.coins[root];
            const deepestMine = Math.max(...coins.map((c) => c.depth));
            return (
              <div key={root} className="px-box p-3">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <Link href={`/tree/${root}`} className="font-pixel text-[10px] text-leaf hover:text-sap">
                    {rootCoin?.ticker} TREE
                  </Link>
                  <span className="text-lg text-muted">
                    {coins.length} of {tree?.coins ?? '?'} coins are yours
                  </span>
                </div>
                <div className="flex gap-3 text-lg leading-tight">
                  <span>
                    your deepest: <b className="font-pixel text-[9px]">D{deepestMine}</b>
                    {tree && deepestMine === tree.maxDepth && <span className="text-blossom"> (the deepest in the tree)</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="px-box mt-6 p-3">
        <h2 className="mb-2 font-pixel text-[9px] text-muted">YOUR COINS</h2>
        {!mine.length && (
          <div className="text-xl text-muted">
            <p>
              Nothing yet. <Link href="/plant" className="underline hover:text-sap">Plant a root</Link> and every coin it grows is yours.
            </p>
            <p className="mt-1 text-lg">
              Coins you&apos;ve traded will show up here in Phase 2, once trades are read from chain.{' '}
              <Link href="/forest" className="underline hover:text-sap">Browse the forest</Link> meanwhile.
            </p>
          </div>
        )}
        <ul className="divide-y-2 divide-[var(--line)]">
          {mine.map((c) => (
            <li key={c.ca} className="flex items-center gap-3 py-2" style={{ paddingLeft: Math.min(c.depth - 1, 10) * 10 }}>
              <CoinSprite image={c.image} depth={c.depth} size={32} />
              <Link href={`/coin/${c.ca}`} className={`font-pixel text-[9px] hover:text-sap ${c.alive ? '' : 'text-muted line-through'}`}>
                {c.ticker}
              </Link>
              <span className="ml-auto text-lg text-muted">
                received <Num href={ev({ via: c.ca })}>{fmtSol(c.feesReceivedFromBelow)}</Num>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function MePage() {
  return (
    <WalletGate>
      <Me />
    </WalletGate>
  );
}
