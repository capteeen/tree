import type { Metadata } from 'next';
import TreePageView from '@/components/TreePageView';
import { genesisWorld } from '@/lib/sim';

export function generateMetadata({ params }: { params: { root: string } }): Metadata {
  const root = genesisWorld().coins[params.root];
  return { title: root ? `${root.ticker} tree · TREE` : 'Tree · TREE' };
}

export default function Page({ params }: { params: { root: string } }) {
  return <TreePageView rootCa={params.root} />;
}
