import type { Metadata } from 'next';
import TreePageView from '@/components/TreePageView';
import { hub } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { root: string } }): Metadata {
  const root = hub().world.coins[params.root];
  return { title: root ? `${root.ticker} tree · TREE` : 'Tree · TREE' };
}

export default function Page({ params }: { params: { root: string } }) {
  return <TreePageView rootCa={params.root} />;
}
