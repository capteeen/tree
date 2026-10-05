import { pick, int, type Rng } from './rng';

export const WORDS = [
  'OAK', 'ACORN', 'ELM', 'BIRCH', 'WILLOW', 'MAPLE', 'ASPEN', 'FERN', 'MOSS', 'SPROUT', 'SEED', 'TWIG',
  'BARK', 'SAP', 'PINE', 'CEDAR', 'CYPRESS', 'BONSAI', 'LEAF', 'BUD', 'BLOOM', 'PETAL', 'THORN', 'VINE',
  'IVY', 'CLOVER', 'BAMBOO', 'BAOBAB', 'REDWOOD', 'YEW', 'ASH', 'HAZEL', 'ROWAN', 'LINDEN', 'POPLAR',
  'LARCH', 'SPRUCE', 'FIR', 'ALDER', 'MYRTLE', 'OLIVE', 'FIG', 'PALM', 'CACTUS', 'LOTUS', 'TULIP',
  'MAGNOLIA', 'SAKURA', 'JUNIPER', 'HOLLY', 'SEQUOIA', 'CONE', 'NUT', 'BRANCH', 'KNOT', 'GROVE', 'PETIOLE',
  'POLLEN', 'NECTAR', 'RESIN', 'STUMP', 'SAPLING', 'ROOTLET', 'MANGO', 'PLUM', 'CHERRY', 'LIME', 'KELP',
];

export const ROOT_WORDS = ['OAK', 'BAOBAB', 'REDWOOD', 'SEQUOIA', 'WILLOW', 'BONSAI', 'SAKURA', 'CEDAR', 'BIRCH', 'YEW'];

const title = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

export function rootName(r: Rng) {
  const w = pick(r, ROOT_WORDS);
  return { ticker: w, name: `${title(w)} Root` };
}

export function childName(r: Rng) {
  const w = pick(r, WORDS);
  const ticker = r() < 0.55 ? `${w}_${int(r, 1, 99)}` : w;
  return { ticker, name: title(w) };
}
