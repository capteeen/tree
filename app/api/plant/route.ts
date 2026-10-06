import { NextResponse } from 'next/server';
import { sim } from '@/lib/server/sim';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? '').trim().slice(0, 32);
  const ticker = String(body?.ticker ?? '').toUpperCase();
  const owner = String(body?.owner ?? '');
  const image = String(body?.image ?? '');
  if (name.length < 2 || !/^[A-Z0-9_]{2,10}$/.test(ticker) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner))
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  if (!(image.startsWith('sprite:') || image.startsWith('data:image/')) || image.length > 400_000)
    return NextResponse.json({ error: 'bad image' }, { status: 400 });
  // TODO(phase2): verify a signed launch transaction instead of trusting the body.
  const ca = sim().plant({
    name,
    ticker,
    image,
    owner,
    description: body?.description ? String(body.description).slice(0, 280) : undefined,
    telegram: body?.telegram ? String(body.telegram).slice(0, 80) : undefined,
    devBuy: Number(body?.devBuy) || 0,
  });
  return NextResponse.json({ ca });
}
