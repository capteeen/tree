'use client';
import dynamic from 'next/dynamic';

// The adapter's button reads window; render it on the client only.
export const WalletButton = dynamic(async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton, {
  ssr: false,
  loading: () => <span className="px-btn px-btn-ghost text-[9px]">WALLET</span>,
});
