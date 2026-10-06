import { NextResponse } from 'next/server';
import { currentMode, engine, engineError } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';

/**
 * Liveness for the host's health check. Always 200 once the process is up, so a
 * misconfigured engine still deploys and /api/config can explain what is wrong.
 */
export function GET() {
  let ok = true;
  try {
    engine();
  } catch {
    ok = false;
  }
  return NextResponse.json(
    { up: true, engine: ok ? 'running' : 'failed', mode: currentMode(), error: ok ? undefined : engineError() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
