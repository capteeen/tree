import 'server-only';
import type { TreeEvent } from '../types';
import type { World } from '../sim';
import { hub } from './engine';

let cache: { at: number; world: World; events: TreeEvent[] } | null = null;

/**
 * The world for server-rendered bits (share images, page titles). On the
 * engine host it's the engine's own memory. On a frontend-only deployment
 * (ENGINE_URL set, e.g. Vercel) it's the engine's snapshot over HTTP, cached
 * for 15 s, so the frontend never starts an engine of its own.
 */
export async function serverWorld(): Promise<{ world: World; events: TreeEvent[] }> {
  const remote = (process.env.ENGINE_URL || process.env.NEXT_PUBLIC_ENGINE_URL || '').replace(/\/$/, '');
  if (!remote) {
    const h = hub();
    return { world: h.world, events: h.events };
  }
  if (cache && Date.now() - cache.at < 15_000) return cache;
  try {
    const r = await fetch(`${remote}/api/world`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { world: World; events: TreeEvent[] };
    cache = { at: Date.now(), world: j.world, events: j.events };
    return cache;
  } catch {
    // engine unreachable: render generic cards rather than failing
    return cache ?? { world: { coins: {}, roots: [], trees: {}, stats: { trees: 0, coins: 0, aliveCoins: 0, deepest: 0, solClimbed: 0 }, seq: 0 }, events: [] };
  }
}
