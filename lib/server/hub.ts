import 'server-only';
import type { Ca, Coin, GlobalStats, Tree, TreeEvent } from '../types';
import { recomputeStats, type World } from '../sim';
import { emptyWorld } from '../sim';

/** One event plus the state it changed. The client applies the delta, then emits the event. */
export interface ServerMsg {
  event: TreeEvent;
  coins: Coin[];
  tree?: Tree;
  stats: GlobalStats;
}

export interface Snapshot {
  world: World;
  events: TreeEvent[];
  serverTime: number;
}

const MAX_EVENTS = 6000;
type Listener = (msg: ServerMsg) => void;

/**
 * The world every browser sees, plus the live event stream. Engines (the
 * simulator or the on-chain engine) mutate `world` and call `publish`.
 */
export class Hub {
  world: World = emptyWorld();
  events: TreeEvent[] = [];
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot(limit = 1500): Snapshot {
    return { world: this.world, events: this.events.slice(-limit), serverTime: Date.now() };
  }

  /** Replace or insert coins, rebuild tree aggregates for their roots. */
  upsertCoins(coins: Coin[]) {
    const roots = new Set<Ca>();
    for (const c of coins) {
      const prev = this.world.coins[c.ca];
      this.world.coins[c.ca] = c;
      if (!prev) {
        if (!c.parentCa && !this.world.roots.includes(c.ca)) this.world.roots.push(c.ca);
        const parent = c.parentCa ? this.world.coins[c.parentCa] : undefined;
        if (parent && !parent.children.includes(c.ca)) parent.children.push(c.ca);
      }
      roots.add(c.rootCa);
    }
    roots.forEach((r) => this.rebuildTree(r));
  }

  rebuildTree(rootCa: Ca) {
    const root = this.world.coins[rootCa];
    if (!root) return;
    const prev = this.world.trees[rootCa];
    let coins = 0;
    let alive = 0;
    let maxDepth = 1;
    let totalFees = 0;
    let solClimbed = 0;
    for (const c of Object.values(this.world.coins)) {
      if (c.rootCa !== rootCa) continue;
      coins++;
      if (c.alive) alive++;
      maxDepth = Math.max(maxDepth, c.depth);
      totalFees += c.feesEarned;
      solClimbed += c.feesSentUp;
    }
    this.world.trees[rootCa] = { rootCa, coins, alive, maxDepth, totalFees, solClimbed, plantedAt: prev?.plantedAt ?? root.bornAt };
  }

  recomputeGlobal() {
    const w = this.world;
    w.stats.coins = Object.keys(w.coins).length;
    w.stats.solClimbed = Object.values(w.trees).reduce((n, t) => n + t.solClimbed, 0);
    let deepest = 0;
    let deepestCa: Ca | undefined;
    for (const c of Object.values(w.coins))
      if (c.depth > deepest) {
        deepest = c.depth;
        deepestCa = c.ca;
      }
    w.stats.deepest = deepest;
    w.stats.deepestCa = deepestCa;
    recomputeStats(w);
  }

  publish(evs: TreeEvent[]) {
    if (!evs.length) return;
    this.events.push(...evs);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    for (const event of evs) {
      const ids = new Set<Ca>([event.coinCa, ...(event.path ?? [])]);
      const c = this.world.coins[event.coinCa];
      if (c?.parentCa) ids.add(c.parentCa);
      const msg: ServerMsg = {
        event,
        coins: [...ids].map((ca) => this.world.coins[ca]).filter(Boolean),
        tree: this.world.trees[event.rootCa],
        stats: this.world.stats,
      };
      this.listeners.forEach((fn) => fn(msg));
    }
  }
}
