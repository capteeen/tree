import { engine } from '@/lib/server/engine';
import { handle } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export function GET() {
  return handle(async () => engine().config());
}
