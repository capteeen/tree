export type Ca = string;

export interface Coin {
  ca: Ca;
  name: string;
  ticker: string;
  /** data:/http(s) URL, or `sprite:<seed>` for a procedurally drawn pixel sprite */
  image: string;
  description?: string;
  telegram?: string;
  rootCa: Ca;
  parentCa?: Ca;
  /** Root is depth 1. A depth-N coin has N-1 ancestors. */
  depth: number;
  children: Ca[];
  /** Position among its siblings; drives golden-angle placement. */
  childIndex: number;
  /** SOL sitting in this coin's vault, funding its next child. */
  vault: number;
  launchThreshold: number;
  /** All creator fees this coin's own trades produced. */
  feesEarned: number;
  /** SOL this coin pushed up to its ancestors. */
  feesSentUp: number;
  /** SOL this coin received from its descendants. */
  feesReceivedFromBelow: number;
  /** Everything that accrued to the owner (received from below, plus a root's own climbing half). */
  ownerEarned: number;
  claimed: number;
  trades: number;
  bornAt: number;
  lastTradeAt: number;
  diedAt?: number;
  alive: boolean;
  /** Times this coin came back from dormancy. */
  revivals: number;
  ownerWallet: string;
}

export interface Tree {
  rootCa: Ca;
  coins: number;
  alive: number;
  maxDepth: number;
  totalFees: number;
  solClimbed: number;
  plantedAt: number;
}

export type EventKind = 'sprout' | 'climb' | 'trade' | 'death' | 'revive' | 'claim';

export interface TreeEvent {
  id: string;
  kind: EventKind;
  coinCa: Ca;
  rootCa: Ca;
  depth: number;
  /** For climbs: ancestors that got paid, parent first, root last. For sprouts: the parent. */
  path?: Ca[];
  /** For climbs: amount each entry of `path` received. */
  amounts?: number[];
  /** Climbs: total SOL that climbed. Trades: SOL to the root's planter. Claims: SOL claimed. */
  amount?: number;
  /** Trade fee that produced this event (absent on a dormancy flush). */
  fee?: number;
  /** Dormancy flush: the coin's whole remaining vault climbed at once. */
  flush?: boolean;
  /** Sprout bonus applied (coin younger than 1h kept 75%). */
  bonus?: boolean;
  text: string;
  at: number;
}

export interface GlobalStats {
  trees: number;
  coins: number;
  aliveCoins: number;
  /** Deepest depth ever reached. */
  deepest: number;
  deepestCa?: Ca;
  /** Deepest coin still alive. */
  deepestAliveCa?: Ca;
  solClimbed: number;
}
