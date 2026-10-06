import { engine, UserError } from '@/lib/server/engine';
import { handle } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  return handle(async () => {
    const s = engine().plantStatus(id);
    if (!s) throw new UserError('unknown launch');
    return s;
  });
}
