'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { pendingLaunch, plantFlow, waitForLaunch, type PlantStep, type PreparedPlant } from '@/lib/client/api';

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
import WalletGate from '@/components/WalletGate';
import { WalletMultiButton } from '@/components/WalletProviders';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStore } from '@/lib/store';
import { LAUNCH_COST, LAUNCH_THRESHOLD, ROOT_RESERVE } from '@/lib/sim';

const STEPS: { k: PlantStep; label: string }[] = [
  { k: 'preparing', label: 'Uploading image and metadata' },
  { k: 'sign', label: 'Approve the payment in your wallet' }, // label gets the exact amount once known
  { k: 'paying', label: 'Waiting for your payment to land' },
  { k: 'launching', label: 'Launching on pump.fun' },
];
import { fmtSol } from '@/lib/format';
import CoinSprite from '@/components/CoinSprite';
import Logo from '@/components/Logo';

const NETWORK_FEE = 0.000105;

async function toThumb(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const c = document.createElement('canvas');
  // square crop at 384px: crisp on pump.fun, small enough to upload
  const N = 384;
  c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, N, N);
  URL.revokeObjectURL(url);
  const png = c.toDataURL('image/png');
  return png.length < 380_000 ? png : c.toDataURL('image/jpeg', 0.9);
}

function PlantForm() {
  const router = useRouter();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const mode = useStore((s) => s.mode);
  const config = useStore((s) => s.config);
  const [step, setStepState] = useState<PlantStep | null>(null);
  const [prepared, setPrepared] = useState<PreparedPlant | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);
  const setStep = (st: PlantStep | null, p?: PreparedPlant) => {
    setStepState(st);
    if (p) setPrepared(p);
  };

  const { setVisible } = useWalletModal();
  const ready = useStore((s) => s.ready);
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [image, setImage] = useState<string>('sprite:seedling');
  useEffect(() => setImage(`sprite:${Math.floor(Math.random() * 1e9)}`), []);
  const [description, setDescription] = useState('');
  const [telegram, setTelegram] = useState('');
  const [devBuy, setDevBuy] = useState('0.1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // a launch that was in progress when the page was closed or refreshed: pick it back up
  useEffect(() => {
    if (!ready || mode === 'local') return;
    const p = pendingLaunch();
    if (!p) return;
    setBusy(true);
    setResuming(p.ticker);
    waitForLaunch(p.id, setStep)
      .then(async (ca) => {
        await useStore.getState().waitForCoin(ca);
        router.push(`/tree/${ca}`);
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : 'launch failed');
        setBusy(false);
        setStep(null);
        setResuming(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode]);

  const dev = Math.max(0, Number(devBuy) || 0);
  const launchCost = config?.launchCost ?? LAUNCH_COST;
  const reserve = config?.reserve ?? ROOT_RESERVE;
  const threshold = config?.threshold ?? LAUNCH_THRESHOLD;
  const total = launchCost + reserve + dev + NETWORK_FEE;
  const realMoney = config?.mode === 'live';
  const valid = name.trim().length >= 2 && /^[A-Z0-9_]{2,10}$/.test(ticker);

  const close = () => (window.history.length > 1 ? router.back() : router.push('/'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!publicKey) return setVisible(true);
    if (!valid) return setErr('Name needs 2+ characters. Ticker: 2–10 of A–Z, 0–9, _.');
    setBusy(true);
    const input = {
      name: name.trim(),
      ticker,
      image,
      description: description.trim() || undefined,
      telegram: telegram.trim() || undefined,
      owner: publicKey.toBase58(),
      devBuy: dev,
    };
    try {
      let ca: string;
      if (mode === 'local') {
        if (process.env.NEXT_PUBLIC_DEMO !== '1')
          throw new Error('The forest is offline right now, so planting is paused. Try again in a minute.');
        ca = await useStore.getState().plant(input);
      }
      else {
        ca = await plantFlow(input, {
          onStep: setStep,
          balance: () => connection.getBalance(publicKey, 'confirmed'),
          // built here, at approval time, so the blockhash is always fresh
          pay: async ({ to, lamports, memo }) => {
            const tx = new Transaction().add(
              SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(to), lamports }),
              new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(memo, 'utf8') }),
            );
            return sendTransaction(tx, connection);
          },
        });
        await useStore.getState().waitForCoin(ca);
      }
      router.push(`/tree/${ca}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'launch failed';
      setErr(
        /reject|declin|cancel/i.test(msg)
          ? 'You cancelled the payment. Nothing was charged.'
          : /insufficient|debit an account/i.test(msg)
            ? 'Not enough SOL in this wallet for the launch. Lower the dev buy or top up.'
            : msg,
      );
      setBusy(false);
      setStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={close}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="px-box max-h-[92svh] w-full max-w-lg overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h1 className="flex items-center gap-2 font-pixel text-sm text-leaf">
            <Logo size={28} />
            PLANT A ROOT
          </h1>
          <button type="button" onClick={close} className="font-pixel text-xs text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {ready && mode === 'local' && process.env.NEXT_PUBLIC_DEMO !== '1' && (
          <p className="mb-3 bg-panel2 p-2 text-lg leading-tight text-blossom">
            The forest is offline right now, so planting is paused. It reconnects on its own; try again in a minute.
          </p>
        )}
        <div className="flex gap-3">
          <label className="cursor-pointer" title="Upload image">
            <CoinSprite image={image} depth={1} size={88} className="outline outline-4 outline-[var(--line)]" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setImage(await toThumb(f));
              }}
            />
            <span className="mt-1 block text-center font-pixel text-[7px] text-muted">IMAGE</span>
          </label>
          <div className="flex-1 space-y-2">
            <label className="block">
              <span className="font-pixel text-[8px] text-muted">NAME</span>
              <input className="px-input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Great Oak" />
            </label>
            <label className="block">
              <span className="font-pixel text-[8px] text-muted">TICKER</span>
              <input
                className="px-input uppercase"
                value={ticker}
                maxLength={10}
                onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="OAK"
              />
            </label>
          </div>
        </div>

        <label className="mt-3 block">
          <span className="font-pixel text-[8px] text-muted">DESCRIPTION</span>
          <textarea className="px-input h-20 resize-none" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-pixel text-[8px] text-muted">TELEGRAM (OPTIONAL)</span>
            <input className="px-input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="t.me/…" />
          </label>
          <label className="block">
            <span className="font-pixel text-[8px] text-muted">DEV BUY (SOL)</span>
            <input className="px-input" inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ''))} />
          </label>
        </div>

        <div className="mt-4 bg-panel2 p-3 text-lg leading-snug sm:text-xl">
          <div className="flex justify-between">
            <span>pump.fun launch cost</span>
            <span>{fmtSol(launchCost)} SOL</span>
          </div>
          <div className="flex justify-between">
            <span>root reserve (stays in vault)</span>
            <span>{fmtSol(reserve)} SOL</span>
          </div>
          <div className="flex justify-between">
            <span>dev buy</span>
            <span>{fmtSol(dev)} SOL</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>network fees (est.)</span>
            <span>{fmtSol(NETWORK_FEE)} SOL</span>
          </div>
          <div className="mt-1 flex justify-between border-t-2 border-[var(--line)] pt-1 font-pixel text-[10px] text-sap">
            <span>YOU PAY</span>
            <span>{fmtSol(total)} SOL</span>
          </div>
          <p className="mt-2 text-lg leading-tight text-muted">
            When its vault collects {fmtSol(threshold)} SOL in fees, your root launches its first child. Every coin that ever grows beneath it
            sends you a cut.
          </p>
        </div>

        {err && <p className="mt-2 text-lg text-blossom">{err}</p>}

        {publicKey ? (
          <button type="submit" disabled={busy || !ready || !valid} className="px-btn mt-4 w-full text-xs">
            {busy ? 'PLANTING…' : 'PLANT IT'}
          </button>
        ) : (
          <div className="wallet-wrap mt-4 flex justify-center">
            <WalletMultiButton>CONNECT WALLET TO PLANT</WalletMultiButton>
          </div>
        )}
        {resuming && (
          <p className="mt-3 text-lg text-sap">Picking up your launch of ${resuming}…</p>
        )}
        {busy && step && (
          <ol className="mt-3 space-y-1 text-lg">
            {STEPS.filter((x) => realMoney || x.k !== 'sign').map((x) => {
              const order = STEPS.findIndex((y) => y.k === step);
              const i = STEPS.findIndex((y) => y.k === x.k);
              return (
                <li key={x.k} className={i < order ? 'text-leaf' : i === order ? 'text-sap' : 'text-muted'}>
                  {i < order ? '✓' : i === order ? '▸' : '·'}{' '}
                  {x.k === 'sign' && prepared ? `Approve exactly ${fmtSol(prepared.total)} SOL in your wallet` : x.label}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-2 text-center text-base text-muted">
          {realMoney
            ? 'Real launch on Solana mainnet. Your SOL pays for the coin; its vault becomes the pump.fun creator.'
            : config?.mode === 'devchain'
              ? 'Test mode: the engine is running on a simulated chain. No real SOL moves yet.'
              : mode === 'local'
                ? 'Not connected to the engine. Launches are paused until it reconnects.'
                : 'Demo mode: this engine is a simulator, so the launch is pretend. Set TREE_MODE=live on the engine for real launches.'}
        </p>
      </form>
    </div>
  );
}

export default function PlantPage() {
  return (
    <WalletGate>
      <PlantForm />
    </WalletGate>
  );
}
