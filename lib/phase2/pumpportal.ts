/**
 * PHASE 2 — real launches. Nothing in here runs yet; the simulator stands in.
 *
 * TODO(phase2) checklist:
 *  1. Every coin gets its own vault wallet (keypair held by the TREE backend / an
 *     on-chain program PDA). The vault is the pump.fun *creator* of its children.
 *  2. Launch: when a vault's balance >= launchThreshold, call PumpPortal's
 *     create endpoint with the PARENT's vault as creator.
 *  3. Claim creator fees per coin (pump.fun `collectCreatorFee`) on a schedule.
 *  4. Split: 50% stays in the vault, 50% transferred up the ancestor path
 *     using splitFees() from lib/fees.ts — one transaction per hop or a batched
 *     transaction with multiple SystemProgram.transfer instructions.
 *  5. Threshold = current pump.fun launch cost + ROOT_RESERVE.
 *  6. Child image = parent image + generated depth badge (see lib/phase2/badge.ts).
 */
import type { Ca } from '../types';

export interface LaunchRequest {
  name: string;
  ticker: string;
  description?: string;
  telegram?: string;
  /** Image file / URL. For children: parent's image with a depth badge. */
  image: Blob | string;
  /** Wallet that will be recorded as the pump.fun creator. For children: the parent's vault. */
  creator: string;
  devBuySol: number;
}

export interface LaunchResult {
  ca: Ca;
  signature: string;
  vaultWallet: string;
}

/** TODO(phase2): POST metadata to pump.fun IPFS, then PumpPortal `trade-local` with action "create". */
export async function launchOnPump(_req: LaunchRequest): Promise<LaunchResult> {
  throw new Error('Phase 2: launchOnPump is not implemented. The simulator handles launches in Phase 1.');
}

/** TODO(phase2): claim accumulated creator fees for one coin's vault. Returns lamports claimed. */
export async function claimCreatorFees(_vaultWallet: string): Promise<number> {
  throw new Error('Phase 2: claimCreatorFees is not implemented.');
}

/** TODO(phase2): send `shares[i]` SOL from `fromVault` to `path[i]`'s vault (or owner). */
export async function transferUpPath(_fromVault: string, _path: Ca[], _shares: number[]): Promise<string[]> {
  throw new Error('Phase 2: transferUpPath is not implemented.');
}

/** TODO(phase2): fetch the current pump.fun launch cost in SOL. */
export async function currentLaunchCost(): Promise<number> {
  return 0.02;
}
