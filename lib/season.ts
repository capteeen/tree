export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export function seasonOf(d = new Date()): Season {
  const m = d.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

export interface Palette {
  /** leaf colour < 1h old */
  fresh: string;
  /** leaf colour 1h–24h */
  mature: string;
  /** leaf colour > 24h */
  old: string;
  bark: string;
  barkDark: string;
  dead: string;
  grass: string;
  dirt: string;
  sap: string;
}

const BASE: Palette = {
  fresh: '#ff8fb1',
  mature: '#7bd389',
  old: '#f5a623',
  bark: '#8b5a2b',
  barkDark: '#6e4420',
  dead: '#5e5045',
  grass: '#4e9a5a',
  dirt: '#5a3a1e',
  sap: '#ffc44d',
};

/** Purely cosmetic: the calendar month nudges the whole forest's palette. */
export const PALETTES: Record<Season, Palette> = {
  spring: { ...BASE, fresh: '#ffa3c4', mature: '#8fe8a0', old: '#f7cf55', grass: '#5fb86a' },
  summer: { ...BASE },
  autumn: { ...BASE, fresh: '#ff9a8f', mature: '#b9c95a', old: '#e8822b', grass: '#7d8a3c', bark: '#7f4f26' },
  winter: { ...BASE, fresh: '#ffc6da', mature: '#9fd8c8', old: '#e6d8a2', grass: '#e8eef0', dirt: '#6d6a72', bark: '#76563a' },
};

export function leafColor(p: Palette, bornAt: number, now = Date.now()) {
  const a = now - bornAt;
  if (a < 3_600_000) return p.fresh;
  if (a < 86_400_000) return p.mature;
  return p.old;
}
