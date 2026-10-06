import type { Metadata } from 'next';
import TreePageView from '@/components/TreePageView';
import { serverWorld } from '@/lib/server/world';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { root: string } }): Promise<Metadata> {
  const root = (await serverWorld()).world.coins[params.root];
  return { title: root ? `${root.ticker} tree · TREE` : 'Tree · TREE' };
}

export default function Page({ params }: { params: { root: string } }) {
  return <TreePageView rootCa={params.root} />;
}
