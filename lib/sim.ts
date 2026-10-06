/**
 * MOCK SIMULATOR (Phase 1)
 *
 * Everything the UI shows comes out of this file: a world of coins and the
 * events that changed it. Phase 2 replaces these functions with an indexer
 * that reads the same shapes from chain (see README "Phase 2").
 */
import type { Ca, Coin, GlobalStats, Tree, TreeEvent } from './types';
import { splitClimb, splitFees, vaultShareFor, VAULT_TOPUP } from './fees';
import { fmtSol } from './format';
import { childName, rootName } from './names';
import { fakeCa, fakeWallet, int, mulberry32, range, type Rng } from './rng';

export const SEED = 0x7ee5eed;
/** Approximate pump.fun launch cost (SOL). TODO(phase2): read live from PumpPortal. */
export const LAUNCH_COST = 0.02;
/** Kept in a vault after launch for transfers / rent. */
export const ROOT_RESERVE = 0.03;
export const LAUNCH_THRESHOLD = LAUNCH_COST + ROOT_RESERVE;
export const MAX_COINS_PER_TREE = 300;
export const GENESIS_MAX_DEPTH = 8;
export const LIVE_MAX_DEPTH = 14;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** Spec definition of a dead coin: vault 0, no trades in 24h. The live sim accelerates this. */
export const DEATH_INACTIVITY = DAY;
export const LIVE_DEATH_INACTIVITY = 4 * MINUTE;

export interface World {
  coins: Record<Ca, Coin>;
  roots: Ca[];
  trees: Record<Ca, Tree>;
  stats: GlobalStats;
  seq: number;
}

export interface Limits {
  maxDepth: number;
  maxCoins: number;
}

export const LIVE_LIMITS: Limits = { maxDepth: LIVE_MAX_DEPTH, maxCoins: MAX_COINS_PER_TREE };

export function emptyWorld(): World {
  return {
    coins: {},
    roots: [],
    trees: {},
    stats: { trees: 0, coins: 0, aliveCoins: 0, deepest: 0, solClimbed: 0 },
    seq: 0,
  };
}

const nextId = (w: World) => `e${(w.seq++).toString(36)}`;
const s = (n: number) => (n === 1 ? '' : 's');

/** Ancestors of a coin, parent first, root last. */
export function ancestors(w: World, ca: Ca): Ca[] {
  const out: Ca[] = [];
  let c = w.coins[ca];
  while (c?.parentCa) {
    out.push(c.parentCa);
    c = w.coins[c.parentCa];
  }
  return out;
}

/** Root → … → coin. */
export function lineage(w: World, ca: Ca): Coin[] {
  const c = w.coins[ca];
  if (!c) return [];
  return [...ancestors(w, ca).reverse().map((a) => w.coins[a]), c];
}

export function coinsOfTree(w: World, rootCa: Ca): Coin[] {
  return Object.values(w.coins).filter((c) => c.rootCa === rootCa);
}

/** Depth-first order, for indented lists. */
export function treeOrder(w: World, rootCa: Ca): Coin[] {
  const out: Coin[] = [];
  const walk = (ca: Ca) => {
    const c = w.coins[ca];
    if (!c) return;
    out.push(c);
    c.children.forEach(walk);
  };
  walk(rootCa);
  return out;
}

export function descendantsCount(w: World, ca: Ca): number {
  const c = w.coins[ca];
  if (!c) return 0;
  return c.children.reduce((n, k) => n + 1 + descendantsCount(w, k), 0);
}

function makeCoin(
  w: World,
  r: Rng,
  p: { name: string; ticker: string; image: string; parent?: Coin; at: number; owner: string; description?: string; telegram?: string },
): Coin {
  const parent = p.parent;
  const ca = fakeCa(r);
  const coin: Coin = {
    ca,
    name: p.name,
    ticker: p.ticker,
    image: p.image,
    description: p.description,
    telegram: p.telegram,
    rootCa: parent ? parent.rootCa : ca,
    parentCa: parent?.ca,
    depth: parent ? parent.depth + 1 : 1,
    children: [],
    childIndex: parent ? parent.children.length : 0,
    vault: 0,
    launchThreshold: LAUNCH_THRESHOLD,
    feesEarned: 0,
    feesSentUp: 0,
    feesReceivedFromBelow: 0,
    ownerEarned: 0,
    claimed: 0,
    trades: 0,
    bornAt: p.at,
    lastTradeAt: p.at,
    alive: true,
    revivals: 0,
    ownerWallet: p.owner,
  };
  w.coins[ca] = coin;
  if (parent) parent.children.push(ca);
  w.stats.coins++;
  w.stats.aliveCoins++;
  if (coin.depth > w.stats.deepest) {
    w.stats.deepest = coin.depth;
    w.stats.deepestCa = ca;
  }
  return coin;
}

export interface PlantInput {
  name: string;
  ticker: string;
  image: string;
  owner: string;
  description?: string;
  telegram?: string;
  devBuy?: number;
}

export function plantRoot(w: World, r: Rng, input: PlantInput, at: number): TreeEvent[] {
  const coin = makeCoin(w, r, { ...input, at });
  w.roots.push(coin.ca);
  w.trees[coin.ca] = {
    rootCa: coin.ca,
    coins: 1,
    alive: 1,
    maxDepth: 1,
    totalFees: 0,
    solClimbed: 0,
    plantedAt: at,
  };
  w.stats.trees++;
  return [
    {
      id: nextId(w),
      kind: 'sprout',
      coinCa: coin.ca,
      rootCa: coin.ca,
      depth: 1,
      text: `NEW ROOT ${coin.ticker} planted. A tree begins.`,
      at,
    },
  ];
}

export function sproutChild(w: World, r: Rng, parent: Coin, at: number): TreeEvent[] {
  parent.vault = Math.max(0, parent.vault - parent.launchThreshold);
  const { name, ticker } = childName(r);
  const child = makeCoin(w, r, {
    name,
    ticker,
    // Phase 2: child inherits the parent's image; the depth badge is drawn on top.
    image: parent.image,
    parent,
    at,
    owner: parent.ownerWallet,
    description: `Child of ${parent.ticker}. Launched by ${parent.ticker}'s vault at depth ${parent.depth + 1}.`,
  });
  const tree = w.trees[parent.rootCa];
  tree.coins++;
  tree.alive++;
  tree.maxDepth = Math.max(tree.maxDepth, child.depth);
  return [
    {
      id: nextId(w),
      kind: 'sprout',
      coinCa: child.ca,
      rootCa: child.rootCa,
      depth: child.depth,
      path: [parent.ca],
      text: `${parent.ticker}'s vault hit ${fmtSol(parent.launchThreshold)} SOL and sprouted ${child.ticker} at DEPTH-${child.depth}`,
      at,
    },
  ];
}

function payAncestors(w: World, path: Ca[], shares: number[]) {
  path.forEach((a, i) => {
    const anc = w.coins[a];
    if (!anc || shares[i] <= 0) return;
    anc.feesReceivedFromBelow += shares[i];
    // a slice of what climbs in tops up the ancestor's vault, so big trees sprout faster
    const topup = anc.alive ? shares[i] * VAULT_TOPUP : 0;
    anc.vault += topup;
    anc.ownerEarned += shares[i] - topup;
  });
}

/** Ancestors whose vaults crossed the threshold after a top-up sprout too. */
function sproutReady(w: World, r: Rng, cas: Ca[], at: number, limits: Limits): TreeEvent[] {
  const evs: TreeEvent[] = [];
  for (const ca of cas) {
    const c = w.coins[ca];
    if (!c || !c.alive) continue;
    const tree = w.trees[c.rootCa];
    if (c.vault >= c.launchThreshold && c.depth < limits.maxDepth && tree.coins < limits.maxCoins) evs.push(...sproutChild(w, r, c, at));
  }
  return evs;
}

export function trade(w: World, r: Rng, ca: Ca, fee: number, at: number, limits: Limits): TreeEvent[] {
  const c = w.coins[ca];
  if (!c) return [];
  const tree = w.trees[c.rootCa];
  const evs: TreeEvent[] = [];
  if (!c.alive) {
    // a trade on a dormant coin brings it back: leaves regrow
    c.alive = true;
    c.diedAt = undefined;
    c.revivals++;
    tree.alive++;
    w.stats.aliveCoins++;
    evs.push({
      id: nextId(w),
      kind: 'revive',
      coinCa: ca,
      rootCa: c.rootCa,
      depth: c.depth,
      text: `DEPTH-${c.depth} coin ${c.ticker} is back! Someone traded a dormant coin and its leaves regrew`,
      at,
    });
  }
  const path = ancestors(w, ca);
  const vaultShare = vaultShareFor(c.bornAt, at);
  const bonus = vaultShare > 0.5;
  const split = splitFees(fee, path.length, vaultShare);
  c.feesEarned += fee;
  c.trades++;
  c.lastTradeAt = at;
  c.vault += split.vault;
  tree.totalFees += fee;
  if (path.length === 0) {
    c.ownerEarned += split.climb;
    evs.push({
      id: nextId(w),
      kind: 'trade',
      coinCa: ca,
      rootCa: c.rootCa,
      depth: 1,
      fee,
      amount: split.climb,
      bonus,
      text: `ROOT ${c.ticker} traded: ${fmtSol(fee)} SOL fees, ${fmtSol(split.climb)} to its planter`,
      at,
    });
  } else {
    payAncestors(w, path, split.shares);
    c.feesSentUp += split.climb;
    tree.solClimbed += split.climb;
    w.stats.solClimbed += split.climb;
    evs.push({
      id: nextId(w),
      kind: 'climb',
      coinCa: ca,
      rootCa: c.rootCa,
      depth: c.depth,
      path,
      amounts: split.shares,
      amount: split.climb,
      fee,
      bonus,
      text: `DEPTH-${c.depth} coin ${c.ticker} paid ${fmtSol(split.climb)} SOL up to ${path.length} ancestor${s(path.length)}${bonus ? ' (sprout bonus: kept 75%)' : ''}`,
      at,
    });
  }
  evs.push(...sproutReady(w, r, [ca, ...path], at, limits));
  return evs;
}

/** A coin goes dormant: its remaining vault climbs one last time, then its leaves fall. */
export function kill(w: World, ca: Ca, at: number): TreeEvent[] {
  const c = w.coins[ca];
  if (!c || !c.alive || !c.parentCa) return [];
  const evs: TreeEvent[] = [];
  const path = ancestors(w, ca);
  if (c.vault > 0) {
    const amount = c.vault;
    const shares = splitClimb(amount, path.length);
    payAncestors(w, path, shares);
    c.vault = 0;
    c.feesSentUp += amount;
    w.trees[c.rootCa].solClimbed += amount;
    w.stats.solClimbed += amount;
    evs.push({
      id: nextId(w),
      kind: 'climb',
      coinCa: ca,
      rootCa: c.rootCa,
      depth: c.depth,
      path,
      amounts: shares,
      amount,
      flush: true,
      text: `DEPTH-${c.depth} coin ${c.ticker} went quiet; its last ${fmtSol(amount)} SOL of sap climbed to ${path.length} ancestor${s(path.length)}`,
      at,
    });
  }
  c.alive = false;
  c.diedAt = at;
  w.trees[c.rootCa].alive--;
  w.stats.aliveCoins--;
  evs.push({
    id: nextId(w),
    kind: 'death',
    coinCa: ca,
    rootCa: c.rootCa,
    depth: c.depth,
    text: `DEPTH-${c.depth} coin ${c.ticker} went dormant. No trades, empty vault. Its leaves fell.`,
    at,
  });
  return evs;
}

/** Coins whose state an event changed (for streaming deltas). */
export function touchedBy(w: World, e: TreeEvent): Ca[] {
  const set = new Set<Ca>([e.coinCa, ...(e.path ?? [])]);
  const c = w.coins[e.coinCa];
  if (c?.parentCa) set.add(c.parentCa);
  return [...set];
}

export function claim(w: World, wallet: string, at: number): TreeEvent[] {
  const evs: TreeEvent[] = [];
  for (const c of Object.values(w.coins)) {
    if (c.ownerWallet !== wallet) continue;
    const amt = c.ownerEarned - c.claimed;
    if (amt <= 1e-12) continue;
    c.claimed = c.ownerEarned;
    evs.push({
      id: nextId(w),
      kind: 'claim',
      coinCa: c.ca,
      rootCa: c.rootCa,
      depth: c.depth,
      amount: amt,
      text: `Owner of ${c.ticker} claimed ${fmtSol(amt)} SOL received from below`,
      at,
    });
  }
  return evs;
}

/** Weighted pick of a coin in a tree to trade. Fresh and deep coins are busier. */
export function pickTrader(w: World, r: Rng, rootCa: Ca, now: number): Ca | null {
  const pool = coinsOfTree(w, rootCa).filter((c) => c.alive);
  if (!pool.length) return null;
  let total = 0;
  const weights = pool.map((c) => {
    let wt = 1 + c.depth * 0.6;
    if (now - c.bornAt < HOUR) wt *= 2.5;
    if (c.children.length >= 4) wt *= 0.5;
    if (c.vault / c.launchThreshold > 0.8) wt *= 1.4;
    total += wt;
    return wt;
  });
  let x = r() * total;
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i];
    if (x <= 0) return pool[i].ca;
  }
  return pool[pool.length - 1].ca;
}

/** Creator fee for one simulated trade (SOL), skewed small. */
export const liveFee = (r: Rng) => 0.0006 * Math.exp(r() * 3.4);
const genesisFee = (r: Rng) => 0.003 * Math.exp(r() * 2.2);

export function recomputeStats(w: World) {
  let alive = 0;
  let deepestAlive: Coin | undefined;
  for (const c of Object.values(w.coins)) {
    if (!c.alive) continue;
    alive++;
    if (!deepestAlive || c.depth > deepestAlive.depth || (c.depth === deepestAlive.depth && c.bornAt > deepestAlive.bornAt))
      deepestAlive = c;
  }
  w.stats.aliveCoins = alive;
  w.stats.deepestAliveCa = deepestAlive?.ca;
  w.stats.trees = w.roots.length;
}

/**
 * Deterministic starting forest: 5 trees, 10–60 coins each, depths up to 8.
 * It is grown by actually running the fee rule (so every number is backed by
 * events), then the abstract clock is stretched over the last few days.
 * Server (OG images) and browser produce the same coins from the same seed.
 */
export function createGenesis(seed = SEED, now = Date.now()): { world: World; events: TreeEvent[] } {
  const r = mulberry32(seed);
  const w = emptyWorld();
  const all: TreeEvent[] = [];
  const limits0 = { maxDepth: GENESIS_MAX_DEPTH, maxCoins: 0 };

  for (let t = 0; t < 5; t++) {
    const target = int(r, 10, 60);
    const plantedAt = now - range(r, 1.5 * DAY, 6 * DAY);
    let { name, ticker } = rootName(r);
    while (w.roots.some((ca) => w.coins[ca].ticker === ticker)) ({ name, ticker } = rootName(r));
    const evs: TreeEvent[] = plantRoot(
      w,
      r,
      {
        name,
        ticker,
        image: `sprite:${int(r, 1, 1e9)}`,
        owner: fakeWallet(r),
        description: `The ${name}. Every coin below it pays it a cut, forever.`,
      },
      0,
    );
    const rootCa = w.roots[w.roots.length - 1];
    let clock = 0;
    let guard = 0;
    const limits = { ...limits0, maxCoins: target };
    while (w.trees[rootCa].coins < target && guard++ < 50_000) {
      clock += range(r, 0.5, 1.5);
      const ca = pickTrader(w, r, rootCa, clock);
      if (ca) evs.push(...trade(w, r, ca, genesisFee(r), clock, limits));
    }
    // Stretch abstract clock onto [plantedAt, now - 1min]; dense near now so some leaves are still pink.
    const end = clock || 1;
    const span = now - MINUTE - plantedAt;
    const map = (x: number) => plantedAt + span * Math.pow(x / end, 0.5);
    for (const c of coinsOfTree(w, rootCa)) {
      c.bornAt = map(c.bornAt);
      c.lastTradeAt = map(c.lastTradeAt);
    }
    w.trees[rootCa].plantedAt = plantedAt;
    for (const e of evs) e.at = map(e.at);
    all.push(...evs);
  }

  // Dormancy: neglected coins (no trade in 24h) die.
  for (const c of Object.values(w.coins)) {
    if (c.parentCa && now - c.lastTradeAt > DEATH_INACTIVITY && r() < 0.6) {
      all.push(...kill(w, c.ca, Math.min(now - MINUTE, c.lastTradeAt + DEATH_INACTIVITY + range(r, 0, 6 * HOUR))));
    }
  }

  all.sort((a, b) => a.at - b.at);
  recomputeStats(w);
  return { world: w, events: all };
}
