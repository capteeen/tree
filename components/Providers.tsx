'use client';
import { useEffect, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import { useStore } from '@/lib/store';
import { range, liveRng } from '@/lib/rng';

/** Drives the mock simulator: each tree trades every 2–6 seconds; idle coins occasionally go dormant. */
function SimDriver() {
  const ready = useStore((s) => s.ready);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    useStore.getState().init();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!ready) return;
    const next = new Map<string, number>();
    const iv = setInterval(() => {
      const st = useStore.getState();
      const now = Date.now();
      for (const root of st.world.roots) {
        const at = next.get(root) ?? now + range(liveRng, 300, 4000);
        if (!next.has(root)) next.set(root, at);
        if (now >= at) {
          st.tick(root);
          next.set(root, now + range(liveRng, 2000, 6000));
        }
      }
    }, 200);
    const reaper = setInterval(() => useStore.getState().reap(), 8000);
    return () => {
      clearInterval(iv);
      clearInterval(reaper);
    };
  }, [ready]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl('mainnet-beta');
  // Backpack (and any other Wallet Standard wallet) is detected automatically.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SimDriver />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
