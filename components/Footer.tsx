'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import Logo from './Logo';

export default function Footer() {
  const mode = useStore((s) => s.mode);
  const engineMode = useStore((s) => s.config?.mode);
  return (
    <footer className="mt-16 border-t-4 border-[var(--line)] pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="mx-auto max-w-7xl px-3 py-6 text-lg leading-tight text-muted">
        <div className="mb-3 flex items-center gap-2">
          <Logo size={40} />
          <span className="font-pixel text-xs text-leaf">TREE</span>
        </div>
        <p className="text-ink">Coins launch on pump.fun (Solana). A meme, not an investment. Crypto is risky. Only use what you can afford to lose.</p>
        <p className="mt-2">
          {engineMode === 'live'
            ? 'Live on Solana mainnet: every climb, sprout and claim is a real transaction.'
            : engineMode === 'devchain'
              ? 'Devchain: the real backend running against a simulated chain. No real SOL moves.'
              : `Demo: everything you see comes from a simulator${mode === 'server' ? ' shared by everyone on this server' : ' running in your browser'}.`}{' '}
          <Link href="/how" className="underline hover:text-sap">How it works</Link> ·{' '}
          <Link href="/events" className="underline hover:text-sap">All events</Link> ·{' '}
          {mode === 'local' && (
            <button
              className="underline hover:text-sap"
              onClick={() => {
                useStore.getState().reset();
                window.location.href = '/';
              }}
            >
              Reset simulator
            </button>
          )}
        </p>
      </div>
    </footer>
  );
}
