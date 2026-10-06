/**
 * THE FEE RULE
 * Every coin's creator fees split:
 *   - its vault keeps VAULT_SHARE (50%; 75% during the coin's first hour: the "sprout bonus")
 *   - the rest climbs to its ancestors with geometric decay:
 *       parent 50% of the climb, grandparent 25%, great-grandparent 12.5% …
 *       and the root takes whatever remains.
 *   - the climb stops being split after MAX_CLIMB_HOPS ancestors: beyond that,
 *     the remainder skips straight to the root, so very deep coins still pay
 *     a meaningful amount to the trunk instead of dust to everyone.
 * A root has no ancestors, so its climbing half goes to whoever planted it.
 *
 * Fees an ancestor receives from below are split too: VAULT_TOPUP (20%) tops
 * up its vault (big trees sprout faster), the rest is the owner's to claim.
 */
export const VAULT_SHARE = 0.5;
export const FRESH_VAULT_SHARE = 0.75;
export const FRESH_MS = 60 * 60 * 1000;
export const MAX_CLIMB_HOPS = 8;
export const VAULT_TOPUP = 0.2;

/** Divide a climbing amount across `n` ancestors (parent first, root last). */
export function splitClimb(climb: number, n: number): number[] {
  const shares: number[] = new Array(n).fill(0);
  if (n === 0) return shares;
  let given = 0;
  const paid = Math.min(n - 1, MAX_CLIMB_HOPS - 1); // ancestors that get a geometric share
  for (let i = 0; i < paid; i++) {
    const s = climb * Math.pow(0.5, i + 1);
    shares[i] = s;
    given += s;
  }
  shares[n - 1] += climb - given; // root takes the remainder
  return shares;
}

export function vaultShareFor(bornAt: number, now: number) {
  return now - bornAt < FRESH_MS ? FRESH_VAULT_SHARE : VAULT_SHARE;
}

export function splitFees(fee: number, nAncestors: number, vaultShare = VAULT_SHARE) {
  const vault = fee * vaultShare;
  const climb = fee - vault;
  return { vault, climb, shares: splitClimb(climb, nAncestors) };
}

/** Fraction of a coin's total fee each ancestor gets (parent first). */
export function ancestorFractions(nAncestors: number, vaultShare = VAULT_SHARE): number[] {
  return splitClimb(1 - vaultShare, nAncestors);
}
