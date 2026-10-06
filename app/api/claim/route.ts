import { engine } from '@/lib/server/engine';
import { handle, limited, tooMany } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Pays the wallet everything its coins have received from below. Funds only ever go to the owner. */
export async function POST(req: Request) {
  if (limited(req, 'claim', 6, 60_000)) return tooMany();
  const body = (await req.json().catch(() => ({}))) as { wallet?: string; message?: string; signature?: string };
  return handle(() => engine().claim(String(body.wallet ?? ''), String(body.message ?? ''), body.signature ? String(body.signature) : undefined));
}
