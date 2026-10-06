'use client';
import dynamic from 'next/dynamic';
import Loading from './Loading';

const WalletProviders = dynamic(() => import('./WalletProviders'), { ssr: false, loading: () => <Loading text="LOADING WALLET" /> });

export default function WalletGate({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
