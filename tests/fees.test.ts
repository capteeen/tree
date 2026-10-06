import { describe, expect, it } from 'vitest';
import { ancestorFractions, FRESH_MS, MAX_CLIMB_HOPS, splitClimb, splitFees, VAULT_SHARE, vaultShareFor } from '@/lib/fees';

const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);

describe('splitClimb', () => {
  it('halves at every hop and gives the root the remainder', () => {
    expect(splitClimb(1, 1)).toEqual([1]);
    expect(splitClimb(1, 2)).toEqual([0.5, 0.5]);
    expect(splitClimb(1, 4)).toEqual([0.5, 0.25, 0.125, 0.125]);
  });
  it('always sums to the climb', () => {
    for (let n = 0; n <= 14; n++) expect(sum(splitClimb(0.37, n))).toBeCloseTo(n === 0 ? 0 : 0.37, 12);
  });
  it('skips ancestors beyond MAX_CLIMB_HOPS and sends the rest to the root', () => {
    const s = splitClimb(1, 12);
    expect(s.filter((x) => x > 0).length).toBe(MAX_CLIMB_HOPS);
    expect(s[MAX_CLIMB_HOPS - 1]).toBe(0);
    expect(s[11]).toBeCloseTo(Math.pow(0.5, MAX_CLIMB_HOPS - 1), 12);
  });
});

describe('splitFees', () => {
  it('keeps VAULT_SHARE and climbs the rest', () => {
    const { vault, climb, shares } = splitFees(0.01, 3);
    expect(vault).toBeCloseTo(0.005);
    expect(climb).toBeCloseTo(0.005);
    expect(sum(shares)).toBeCloseTo(climb);
    expect(vault + climb).toBeCloseTo(0.01);
  });
  it('gives fresh coins the sprout bonus', () => {
    const now = 1_000_000_000;
    expect(vaultShareFor(now - FRESH_MS / 2, now)).toBe(0.75);
    expect(vaultShareFor(now - FRESH_MS * 2, now)).toBe(VAULT_SHARE);
  });
  it('ancestor fractions describe a depth-4 coin as the spec says', () => {
    expect(ancestorFractions(3)).toEqual([0.25, 0.125, 0.125]);
  });
});
