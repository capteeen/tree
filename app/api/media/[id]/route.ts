import { engine } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';

/** Self-hosted coin images and pump.fun metadata JSON (METADATA_PROVIDER=self). */
export function GET(_req: Request, { params }: { params: { id: string } }) {
  const m = engine().media?.(params.id);
  if (!m) return new Response('not found', { status: 404 });
  return new Response(new Uint8Array(m.bytes), {
    headers: { 'content-type': m.mime, 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' },
  });
}
