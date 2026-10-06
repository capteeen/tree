import { NextResponse } from 'next/server';
import { sim } from '@/lib/server/sim';

export const dynamic = 'force-dynamic';

/** Snapshot of the shared world. Phase 2: serve this from the indexer. */
export function GET() {
  return NextResponse.json(sim().snapshot(), { headers: { 'cache-control': 'no-store' } });
}
