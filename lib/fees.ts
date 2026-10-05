/**
 * THE FEE RULE
 * Every coin's creator fees split 50/50:
 *   - 50% stays in its own vault (funds its next child)
 *   - 50% climbs to its ancestors with geometric decay:
 *       parent 50% of the climb, grandparent 25%, great-grandparent 12.5% …
 *       and the root takes whatever remains.
 * A root has no ancestors, so its climbing half goes to whoever planted it.
 */
export const VAULT_SHARE = 0.5;

/** Divide a climbing amount across `n` ancestors (parent first, root last). */
export function splitClimb(climb: number, n: number): number[] {
  const shares: number[] = [];
  let given = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) shares.push(climb - given);
    else {
      const s = climb * Math.pow(0.5, i + 1);
      shares.push(s);
      given += s;
    }
  }
  return shares;
}

export function splitFees(fee: number, nAncestors: number) {
  const vault = fee * VAULT_SHARE;
  const climb = fee - vault;
  return { vault, climb, shares: splitClimb(climb, nAncestors) };
}

/** Fraction of a coin's total fee each ancestor gets (parent first). */
export function ancestorFractions(nAncestors: number): number[] {
  return splitClimb(1 - VAULT_SHARE, nAncestors);
}
