import { engine } from '@/lib/server/engine';
import { handle, limited, tooMany } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** The wallet declined the payment: free the pending-launch slot (only if nothing was paid). */
export async function POST(req: Request) {
  if (limited(req, 'cancel', 30, 60_000)) return tooMany();
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  return handle(async () => (await engine().cancelPlant(String(body.id ?? ''))) ?? { error: 'unknown launch' });
}
