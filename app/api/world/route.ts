import { NextResponse } from 'next/server';
import { hub } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';

/** Snapshot of the shared world. Phase 2: serve this from the indexer. */
export function GET() {
  return NextResponse.json(hub().snapshot(), { headers: { 'cache-control': 'no-store' } });
}
