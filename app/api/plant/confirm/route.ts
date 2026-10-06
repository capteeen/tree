import { engine } from '@/lib/server/engine';
import { handle, limited, tooMany } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Step 2: the wallet sent the payment; check it landed and start the launch. */
export async function POST(req: Request) {
  if (limited(req, 'confirm', 30, 60_000)) return tooMany();
  const body = (await req.json().catch(() => ({}))) as { id?: string; signature?: string };
  return handle(() => engine().confirmPlant(String(body.id ?? ''), body.signature ? String(body.signature) : undefined));
}
