import { FRESH_MS, MAX_CLIMB_HOPS, VAULT_TOPUP } from '../../fees';

/**
 * The fee rule in integer lamports. Mirrors lib/fees.ts exactly, with every
 * division rounded down and the remainder always landing on the root, so a
 * split never creates or destroys a lamport.
 */
export function vaultShareBps(bornAt: number, now: number) {
  return now - bornAt < FRESH_MS ? 7500 : 5000;
}

export function splitClimbLamports(climb: number, n: number): number[] {
  const shares = new Array<number>(n).fill(0);
  if (n === 0) return shares;
  let given = 0;
  const paid = Math.min(n - 1, MAX_CLIMB_HOPS - 1);
  for (let i = 0; i < paid; i++) {
    const s = Math.floor(climb / 2 ** (i + 1));
    shares[i] = s;
    given += s;
  }
  shares[n - 1] += climb - given;
  return shares;
}

export function splitFeeLamports(fee: number, nAncestors: number, bps: number) {
  const vault = Math.floor((fee * bps) / 10_000);
  const climb = fee - vault;
  return { vault, climb, shares: splitClimbLamports(climb, nAncestors) };
}

/** What an ancestor does with lamports that climbed into it. */
export function receiveSplit(lamports: number) {
  const topup = Math.floor(lamports * VAULT_TOPUP);
  return { topup, owner: lamports - topup };
}

export const LAMPORTS = 1_000_000_000;
export const sol = (lamports: number) => lamports / LAMPORTS;
export const lamports = (sol: number) => Math.round(sol * LAMPORTS);
