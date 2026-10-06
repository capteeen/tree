/**
 * SHARED SIMULATOR (Phase 1, server side)
 *
 * One world per server process. Every browser gets the same forest: a snapshot
 * from /api/world and a live stream of events from /api/events. Phase 2 swaps
 * the tick loop for an indexer and keeps the same wire format (see README).
 *
 * On a serverless host each instance runs its own world; run `next start` on a
 * single node (or move this into a tiny dedicated service) for one shared tree.
 */
import 'server-only';
import type { Ca, Coin, GlobalStats, Tree, TreeEvent } from '../types';
import {
  claim,
  createGenesis,
  kill,
  LIVE_DEATH_INACTIVITY,
  LIVE_LIMITS,
  liveFee,
  pickTrader,
  plantRoot,
  recomputeStats,
  touchedBy,
  trade,
  type PlantInput,
  type World,
} from '../sim';
import { liveRng, range } from '../rng';

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

class SimServer {
  world: World;
  events: TreeEvent[];
  private listeners = new Set<Listener>();
  private next = new Map<Ca, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private reaper: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const g = createGenesis();
    this.world = g.world;
    this.events = g.events;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 200);
    this.reaper = setInterval(() => this.reap(), 8000);
    // let the node exit cleanly even with the loop armed
    (this.timer as { unref?: () => void }).unref?.();
    (this.reaper as { unref?: () => void }).unref?.();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot(limit = 1500): Snapshot {
    return { world: this.world, events: this.events.slice(-limit), serverTime: Date.now() };
  }

  private commit(evs: TreeEvent[]) {
    if (!evs.length) return;
    recomputeStats(this.world);
    this.events.push(...evs);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    for (const event of evs) {
      const msg: ServerMsg = {
        event,
        coins: touchedBy(this.world, event).map((ca) => this.world.coins[ca]).filter(Boolean),
        tree: this.world.trees[event.rootCa],
        stats: this.world.stats,
      };
      this.listeners.forEach((fn) => fn(msg));
    }
  }

  private tick() {
    const now = Date.now();
    for (const root of this.world.roots) {
      const at = this.next.get(root) ?? now + range(liveRng, 300, 4000);
      if (!this.next.has(root)) this.next.set(root, at);
      if (now < at) continue;
      this.next.set(root, now + range(liveRng, 2000, 6000));
      // every so often a dormant coin gets traded and comes back
      const pool = Object.values(this.world.coins).filter((c) => c.rootCa === root);
      const dormant = pool.filter((c) => !c.alive);
      const ca = dormant.length && liveRng() < 0.04 ? dormant[Math.floor(liveRng() * dormant.length)].ca : pickTrader(this.world, liveRng, root, now);
      if (ca) this.commit(trade(this.world, liveRng, ca, liveFee(liveRng), now, LIVE_LIMITS));
    }
  }

  private reap() {
    const now = Date.now();
    const idle = Object.values(this.world.coins).filter(
      (c) => c.alive && c.parentCa && now - c.lastTradeAt > LIVE_DEATH_INACTIVITY && now - c.bornAt > LIVE_DEATH_INACTIVITY,
    );
    if (!idle.length || liveRng() > 0.45) return;
    const victim = idle[Math.floor(liveRng() * idle.length)];
    this.commit(kill(this.world, victim.ca, now));
  }

  plant(input: PlantInput): Ca {
    // TODO(phase2): launch on pump.fun via PumpPortal, return the real mint.
    const evs = plantRoot(this.world, liveRng, input, Date.now());
    this.commit(evs);
    return evs[0].coinCa;
  }

  claim(wallet: string): number {
    // TODO(phase2): build the claim transaction for the wallet to sign.
    const evs = claim(this.world, wallet, Date.now());
    this.commit(evs);
    return evs.reduce((n, e) => n + (e.amount ?? 0), 0);
  }
}

const g = globalThis as unknown as { __treeSim?: SimServer };

/** The one world this server process grows. Survives HMR in dev. */
export function sim(): SimServer {
  if (!g.__treeSim) {
    g.__treeSim = new SimServer();
    g.__treeSim.start();
  }
  return g.__treeSim;
}
