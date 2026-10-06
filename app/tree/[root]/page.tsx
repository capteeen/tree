import type { Metadata } from 'next';
import TreePageView from '@/components/TreePageView';
import { sim } from '@/lib/server/sim';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { root: string } }): Metadata {
  const root = sim().world.coins[params.root];
  return { title: root ? `${root.ticker} tree · TREE` : 'Tree · TREE' };
}

export default function Page({ params }: { params: { root: string } }) {
  return <TreePageView rootCa={params.root} />;
}
