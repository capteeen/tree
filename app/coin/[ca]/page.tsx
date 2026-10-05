import type { Metadata } from 'next';
import CoinView from '@/components/CoinView';
import { genesisWorld, lineage } from '@/lib/sim';

export function generateMetadata({ params }: { params: { ca: string } }): Metadata {
  const w = genesisWorld();
  const c = w.coins[params.ca];
  if (!c) return { title: 'Coin · TREE' };
  const path = lineage(w, c.ca)
    .map((x) => x.ticker)
    .join(' → ');
  const title = `${c.ticker} · depth ${c.depth} · TREE`;
  return {
    title,
    description: `${path}. Every trade of ${c.ticker} pays its ${c.depth - 1} ancestors.`,
    twitter: { card: 'summary_large_image', title },
  };
}

export default function Page({ params }: { params: { ca: string } }) {
  return <CoinView ca={params.ca} />;
}
