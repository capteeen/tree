import 'server-only';
import type { Hub } from './hub';

/**
 * sim      in-memory simulator, no chain at all (Phase 1 demo).
 * devchain the real engine (DB, vaults, launches, fee claims, splits, payouts)
 *          running against an in-memory fake chain with simulated trades.
 *          Exercises every backend code path without spending SOL.
 * live     the real engine against Solana + pump.fun.
 */
export type Mode = 'sim' | 'devchain' | 'live';

export interface PlantRequest {
  name: string;
  ticker: string;
  /** data:image/... (uploaded) or sprite:<seed> */
  image: string;
  description?: string;
  telegram?: string;
  owner: string;
  /** SOL */
  devBuy: number;
}

export interface PreparedPlant {
  id: string;
  mode: Mode;
  /** The new root's vault: the address the wallet pays (live). */
  payTo?: string;
  /** Exact lamports to send to payTo. The browser builds the transfer itself, with a fresh blockhash. */
  lamports?: number;
  /** Memo to attach, so the payment is recognisable on an explorer. */
  memo?: string;
  /** SOL */
  total: number;
  breakdown: { launchCost: number; reserve: number; devBuy: number; networkFee: number };
}

export type PlantState = 'awaiting_payment' | 'paid' | 'launching' | 'done' | 'failed' | 'refunded' | 'expired';

export interface PlantStatus {
  id: string;
  state: PlantState;
  ca?: string;
  error?: string;
}

export interface PublicConfig {
  mode: Mode;
  cluster: string;
  launchCost: number;
  reserve: number;
  threshold: number;
  minClaim: number;
  /** live: claims need a signed message from the wallet */
  claimNeedsSignature: boolean;
  /** SOL a pump.fun create actually cost on the last launch (rent + fees), once measured. */
  observedLaunchCost?: number;
}

export interface Engine {
  mode: Mode;
  hub: Hub;
  config(): PublicConfig;
  preparePlant(r: PlantRequest): Promise<PreparedPlant>;
  confirmPlant(id: string, signature?: string): Promise<PlantStatus>;
  plantStatus(id: string): PlantStatus | null;
  /** The wallet declined to pay: release the pending slot (only if nothing was paid). */
  cancelPlant(id: string): Promise<PlantStatus | null>;
  claimChallenge(wallet: string): string;
  claim(wallet: string, message: string, signature?: string): Promise<{ amount: number; signatures: string[] }>;
  /** Self-hosted images / metadata (live engines only). */
  media?(id: string): { mime: string; bytes: Buffer } | undefined;
}

export class UserError extends Error {
  status = 400;
}

export function currentMode(): Mode {
  const m = (process.env.TREE_MODE ?? 'sim').toLowerCase();
  return m === 'live' || m === 'devchain' ? m : 'sim';
}

const g = globalThis as unknown as { __treeEngine?: Engine };

/** The one engine this server process runs. Survives HMR in dev. */
export function engine(): Engine {
  if (!g.__treeEngine) {
    const mode = currentMode();
    if (mode === 'sim') {
      const { SimEngine } = require('./simEngine') as typeof import('./simEngine');
      g.__treeEngine = new SimEngine();
    } else {
      const { createLiveEngine } = require('./live/boot') as typeof import('./live/boot');
      g.__treeEngine = createLiveEngine(mode);
    }
  }
  return g.__treeEngine!;
}

export const hub = () => engine().hub;
