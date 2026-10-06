import { describe, expect, it } from 'vitest';
import { ancestors, createGenesis, kill, LAUNCH_THRESHOLD, plantRoot, trade, emptyWorld, type World } from '@/lib/sim';
import { VAULT_TOPUP } from '@/lib/fees';
import { mulberry32 } from '@/lib/rng';
import type { Coin } from '@/lib/types';

const LIM = { maxDepth: 14, maxCoins: 300 };
const sum = (w: World, f: (c: Coin) => number) => Object.values(w.coins).reduce((n, c) => n + f(c), 0);

/** SOL is conserved: fees in = vaults + claimable + (vault SOL spent launching children) */
function conserved(w: World) {
  const fees = sum(w, (c) => c.feesEarned);
  const vaults = sum(w, (c) => c.vault);
  const owners = sum(w, (c) => c.ownerEarned);
  const spent = sum(w, (c) => c.children.length) * LAUNCH_THRESHOLD;
  expect(vaults + owners + spent).toBeCloseTo(fees, 9);
}

describe('genesis', () => {
  it('is deterministic and within spec', () => {
    const a = createGenesis(42, 1_700_000_000_000);
    const b = createGenesis(42, 1_700_000_000_000);
    expect(Object.keys(a.world.coins)).toEqual(Object.keys(b.world.coins));
    expect(a.world.roots.length).toBe(5);
    for (const t of Object.values(a.world.trees)) {
      expect(t.coins).toBeGreaterThanOrEqual(10);
      expect(t.coins).toBeLessThanOrEqual(60);
      expect(t.maxDepth).toBeLessThanOrEqual(8);
    }
    expect(a.world.stats.deepest).toBeGreaterThan(1);
  });
});

describe('trade', () => {
  it('pays every ancestor, tops up their vaults and sprouts exactly at the threshold', () => {
    const r = mulberry32(7);
    const w = emptyWorld();
    const t0 = 1_000;
    plantRoot(w, r, { name: 'Oak', ticker: 'OAK', image: 'sprite:1', owner: 'me' }, t0);
    const root = w.coins[w.roots[0]];
    // a root keeps 50% (bonus hour is over after FRESH_MS); push it to the threshold
    const later = t0 + 2 * 3_600_000;
    const evs = trade(w, r, root.ca, LAUNCH_THRESHOLD * 2, later, LIM);
    expect(evs.map((e) => e.kind)).toEqual(['trade', 'sprout']);
    expect(root.children.length).toBe(1);
    expect(root.vault).toBeCloseTo(0, 12);
    const child = w.coins[root.children[0]];
    expect(child.depth).toBe(2);
    expect(child.parentCa).toBe(root.ca);
    conserved(w);

    // the child trades: half climbs to the root (minus the sprout bonus: child is fresh so it keeps 75%)
    const ev2 = trade(w, r, child.ca, 0.01, later + 1, LIM);
    expect(ev2[0].kind).toBe('climb');
    expect(ev2[0].path).toEqual([root.ca]);
    expect(ev2[0].amount).toBeCloseTo(0.0025);
    expect(root.feesReceivedFromBelow).toBeCloseTo(0.0025);
    expect(root.vault).toBeCloseTo(0.0025 * VAULT_TOPUP);
    expect(root.ownerEarned).toBeCloseTo(LAUNCH_THRESHOLD + 0.0025 * (1 - VAULT_TOPUP));
    conserved(w);
  });

  it('revives a dormant coin and flushes its vault on death', () => {
    const g = createGenesis(3, 1_700_000_000_000);
    const w = g.world;
    const leaf = Object.values(w.coins).find((c) => c.alive && c.depth >= 3 && c.vault > 0)!;
    const path = ancestors(w, leaf.ca);
    const before = w.coins[path[0]].feesReceivedFromBelow;
    const evs = kill(w, leaf.ca, 1_700_000_100_000);
    expect(evs.map((e) => e.kind)).toEqual(['climb', 'death']);
    expect(evs[0].flush).toBe(true);
    expect(leaf.alive).toBe(false);
    expect(leaf.vault).toBe(0);
    expect(w.coins[path[0]].feesReceivedFromBelow).toBeGreaterThan(before);
    conserved(w);

    const r = mulberry32(1);
    const ev2 = trade(w, r, leaf.ca, 0.001, 1_700_000_200_000, LIM);
    expect(ev2[0].kind).toBe('revive');
    expect(leaf.alive).toBe(true);
    expect(leaf.revivals).toBe(1);
    conserved(w);
  });

  it('never breaks conservation over many random trades', () => {
    const g = createGenesis(11, 1_700_000_000_000);
    const w = g.world;
    const r = mulberry32(99);
    const cas = Object.keys(w.coins);
    for (let i = 0; i < 2000; i++) trade(w, r, cas[Math.floor(r() * cas.length)], 0.0001 + r() * 0.02, 1_700_000_000_000 + i * 1000, LIM);
    conserved(w);
    for (const c of Object.values(w.coins)) expect(c.vault).toBeGreaterThanOrEqual(-1e-12);
  });
});
