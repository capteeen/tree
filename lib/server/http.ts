import 'server-only';
import { NextResponse } from 'next/server';
import { UserError } from './engine';

const buckets = new Map<string, { n: number; reset: number }>();

/** Small in-memory fixed-window limiter (one process; put a real one at the edge in production). */
export function limited(req: Request, key: string, max: number, windowMs: number) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const k = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < now) {
    buckets.set(k, { n: 1, reset: now + windowMs });
    return false;
  }
  b.n++;
  return b.n > max;
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn(), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tree] api error', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export const tooMany = () => NextResponse.json({ error: 'Too many requests. Slow down a little.' }, { status: 429 });
