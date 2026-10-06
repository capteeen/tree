import { engine } from '@/lib/server/engine';
import { handle, limited, tooMany } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** The message a wallet signs to prove it owns what it is claiming. */
export async function POST(req: Request) {
  if (limited(req, 'challenge', 20, 60_000)) return tooMany();
  const body = (await req.json().catch(() => ({}))) as { wallet?: string };
  return handle(async () => ({ message: engine().claimChallenge(String(body.wallet ?? '')) }));
}
