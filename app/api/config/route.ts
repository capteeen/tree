import { NextResponse } from 'next/server';
import { currentMode, engine, engineError } from '@/lib/server/engine';
import { handle } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    return handle(async () => engine().config());
  } catch {
    // a setup problem (missing MASTER_KEY, bad RPC, …): say so, it is the only way to find out
    return NextResponse.json({ error: `engine failed to start (TREE_MODE=${currentMode()}): ${engineError() ?? 'unknown'}` }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
