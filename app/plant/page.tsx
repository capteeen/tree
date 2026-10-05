'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStore } from '@/lib/store';
import { LAUNCH_COST, LAUNCH_THRESHOLD, ROOT_RESERVE } from '@/lib/sim';
import { fmtSol } from '@/lib/format';
import CoinSprite from '@/components/CoinSprite';

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
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/png');
}

export default function PlantPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
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

  const dev = Math.max(0, Number(devBuy) || 0);
  const total = LAUNCH_COST + ROOT_RESERVE + dev + NETWORK_FEE;
  const valid = name.trim().length >= 2 && /^[A-Z0-9_]{2,10}$/.test(ticker);

  const close = () => (window.history.length > 1 ? router.back() : router.push('/'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!publicKey) return setVisible(true);
    if (!valid) return setErr('Name needs 2+ characters. Ticker: 2–10 of A–Z, 0–9, _.');
    setBusy(true);
    // TODO(phase2): launchOnPump({ creator: newRootVault, ... }) and have the user sign the transaction.
    await new Promise((r) => setTimeout(r, 900));
    const ca = useStore.getState().plant({
      name: name.trim(),
      ticker,
      image,
      description: description.trim() || undefined,
      telegram: telegram.trim() || undefined,
      owner: publicKey.toBase58(),
      devBuy: dev,
    });
    router.push(`/tree/${ca}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={close}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="px-box max-h-[92svh] w-full max-w-lg overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-pixel text-sm text-leaf">PLANT A ROOT</h1>
          <button type="button" onClick={close} className="font-pixel text-xs text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

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
            <span>{fmtSol(LAUNCH_COST)} SOL</span>
          </div>
          <div className="flex justify-between">
            <span>root reserve (stays in vault)</span>
            <span>{fmtSol(ROOT_RESERVE)} SOL</span>
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
            When its vault collects {fmtSol(LAUNCH_THRESHOLD)} SOL in fees, your root launches its first child. Every coin that ever grows beneath it
            sends you a cut.
          </p>
        </div>

        {err && <p className="mt-2 text-lg text-blossom">{err}</p>}

        <button type="submit" disabled={busy || !ready || (!!publicKey && !valid)} className="px-btn mt-4 w-full text-xs">
          {!publicKey ? 'CONNECT WALLET' : busy ? 'PLANTING…' : 'PLANT IT'}
        </button>
        <p className="mt-2 text-center text-base text-muted">Phase 1: the launch is simulated. No transaction is sent.</p>
      </form>
    </div>
  );
}
