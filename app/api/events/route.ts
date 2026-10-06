import { hub } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';

/** Server-sent events: one `ServerMsg` per line as it happens. */
export function GET(req: Request) {
  const enc = new TextEncoder();
  let off = () => {};
  let ping: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          off();
        }
      };
      send(`retry: 2000\n\n`);
      off = hub().subscribe((msg) => send(`data: ${JSON.stringify(msg)}\n\n`));
      ping = setInterval(() => send(`: ping\n\n`), 15000);
      req.signal.addEventListener('abort', () => {
        off();
        if (ping) clearInterval(ping);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      off();
      if (ping) clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' },
  });
}
