import { engine } from '@/lib/server/engine';
import { handle, limited, tooMany } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Step 1 of planting: upload metadata, create the root's vault, return the payment tx to sign. */
export async function POST(req: Request) {
  if (limited(req, 'prepare', 10, 10 * 60_000)) return tooMany();
  const body = await req.json().catch(() => null);
  return handle(() => engine().preparePlant(body));
}
