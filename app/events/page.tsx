import type { Metadata } from 'next';
import EventsExplorer from '@/components/EventsExplorer';
import { serverWorld } from '@/lib/server/world';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: { id?: string } }): Promise<Metadata> {
  const id = searchParams.id;
  const e = id ? (await serverWorld()).events.find((x) => x.id === id) : undefined;
  if (!e) return { title: 'Events · TREE' };
  const img = `/api/og/event?id=${encodeURIComponent(e.id)}`;
  return {
    title: `${e.text} · TREE`,
    description: e.text,
    openGraph: { images: [img] },
    twitter: { card: 'summary_large_image', images: [img] },
  };
}

export default function Page() {
  return <EventsExplorer />;
}
