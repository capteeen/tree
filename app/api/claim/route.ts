import { NextResponse } from 'next/server';
import { sim } from '@/lib/server/sim';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const wallet = String(body?.wallet ?? '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
  // TODO(phase2): the wallet signs a claim transaction; the server never pays out on a bare POST.
  return NextResponse.json({ amount: sim().claim(wallet) });
}
