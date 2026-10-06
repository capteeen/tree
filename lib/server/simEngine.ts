/**
 * SIMULATOR ENGINE (TREE_MODE=sim)
 *
 * One in-memory world per server process with simulated trades. No chain,
 * no database. Everyone connected to this server sees the same forest.
 */
import 'server-only';
import type { Ca } from '../types';
import {
  claim,
  createGenesis,
  kill,
  LAUNCH_COST,
  LAUNCH_THRESHOLD,
  LIVE_DEATH_INACTIVITY,
  LIVE_LIMITS,
  liveFee,
  pickTrader,
  plantRoot,
  recomputeStats,
  ROOT_RESERVE,
  trade,
} from '../sim';
import { liveRng, range } from '../rng';
import { Hub } from './hub';
import { UserError, type Engine, type PlantRequest, type PlantStatus, type PreparedPlant, type PublicConfig } from './engine';
import { validatePlant } from './validate';

export class SimEngine implements Engine {
  mode = 'sim' as const;
  hub = new Hub();
  private next = new Map<Ca, number>();
  private pending = new Map<string, { req: PlantRequest; status: PlantStatus }>();

  constructor() {
    const g = createGenesis();
    this.hub.world = g.world;
    this.hub.events = g.events;
    const t = setInterval(() => this.tick(), 200);
    const r = setInterval(() => this.reap(), 8000);
    (t as { unref?: () => void }).unref?.();
    (r as { unref?: () => void }).unref?.();
  }

  config(): PublicConfig {
    return { mode: 'sim', cluster: 'none', launchCost: LAUNCH_COST, reserve: ROOT_RESERVE, threshold: LAUNCH_THRESHOLD, minClaim: 0, claimNeedsSignature: false };
  }

  private commit(evs: ReturnType<typeof trade>) {
    if (!evs.length) return;
    recomputeStats(this.hub.world);
    this.hub.publish(evs);
  }

  private tick() {
    const w = this.hub.world;
    const now = Date.now();
    for (const root of w.roots) {
      const at = this.next.get(root) ?? now + range(liveRng, 300, 4000);
      if (!this.next.has(root)) this.next.set(root, at);
      if (now < at) continue;
      this.next.set(root, now + range(liveRng, 2000, 6000));
      const pool = Object.values(w.coins).filter((c) => c.rootCa === root);
      const dormant = pool.filter((c) => !c.alive);
      const ca = dormant.length && liveRng() < 0.04 ? dormant[Math.floor(liveRng() * dormant.length)].ca : pickTrader(w, liveRng, root, now);
      if (ca) this.commit(trade(w, liveRng, ca, liveFee(liveRng), now, LIVE_LIMITS));
    }
  }

  private reap() {
    const w = this.hub.world;
    const now = Date.now();
    const idle = Object.values(w.coins).filter(
      (c) => c.alive && c.parentCa && now - c.lastTradeAt > LIVE_DEATH_INACTIVITY && now - c.bornAt > LIVE_DEATH_INACTIVITY,
    );
    if (!idle.length || liveRng() > 0.45) return;
    this.commit(kill(w, idle[Math.floor(liveRng() * idle.length)].ca, now));
  }

  async preparePlant(r: PlantRequest): Promise<PreparedPlant> {
    const req = validatePlant(r);
    const id = `sim-${Date.now().toString(36)}${Math.floor(liveRng() * 1e6).toString(36)}`;
    this.pending.set(id, { req, status: { id, state: 'awaiting_payment' } });
    return { id, mode: 'sim', total: LAUNCH_COST + ROOT_RESERVE + req.devBuy, breakdown: { launchCost: LAUNCH_COST, reserve: ROOT_RESERVE, devBuy: req.devBuy, networkFee: 0 } };
  }

  async confirmPlant(id: string): Promise<PlantStatus> {
    const p = this.pending.get(id);
    if (!p) throw new UserError('unknown launch');
    if (p.status.state === 'done') return p.status;
    const evs = plantRoot(this.hub.world, liveRng, p.req, Date.now());
    this.commit(evs);
    p.status = { id, state: 'done', ca: evs[0].coinCa };
    return p.status;
  }

  plantStatus(id: string) {
    return this.pending.get(id)?.status ?? null;
  }

  claimChallenge(wallet: string) {
    return `TREE claim for ${wallet}`;
  }

  async claim(wallet: string) {
    const evs = claim(this.hub.world, wallet, Date.now());
    this.commit(evs);
    return { amount: evs.reduce((n, e) => n + (e.amount ?? 0), 0), signatures: [] };
  }
}
