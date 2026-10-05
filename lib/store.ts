'use client';
import { create } from 'zustand';
import type { Ca, TreeEvent } from './types';
import { emit } from './bus';
import { liveRng } from './rng';
import { SEASONS, seasonOf, type Season } from './season';
import { setMuted as setSoundMuted } from './sound';
import {
  LIVE_DEATH_INACTIVITY,
  LIVE_LIMITS,
  claim as simClaim,
  createGenesis,
  kill,
  liveFee,
  pickTrader,
  plantRoot,
  recomputeStats,
  trade,
  type PlantInput,
  type World,
} from './sim';

const SAVE_KEY = 'tree.sim.v1';
const MAX_EVENTS = 6000;
const SAVED_EVENTS = 3000;

interface State {
  ready: boolean;
  world: World;
  /** Chronological, oldest first. */
  events: TreeEvent[];
  version: number;
  theme: 'dark' | 'light';
  muted: boolean;
  season: Season;
  init(): void;
  tick(rootCa: Ca): void;
  reap(): void;
  plant(input: PlantInput): Ca;
  claim(wallet: string): number;
  reset(): void;
  setTheme(t: 'dark' | 'light'): void;
  setMuted(m: boolean): void;
  cycleSeason(): void;
}

function load(): { world: World; events: TreeEvent[] } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.world?.coins || !Array.isArray(data.events)) return null;
    return data;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { world, events } = useStore.getState();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ world, events: events.slice(-SAVED_EVENTS) }));
    } catch {
      /* storage full or blocked: the sim still runs in memory */
    }
  }, 4000);
}

export const useStore = create<State>()((set, get) => {
  const commit = (evs: TreeEvent[]) => {
    if (!evs.length) return;
    const { world, events, version } = get();
    recomputeStats(world);
    let next = events.concat(evs);
    if (next.length > MAX_EVENTS) next = next.slice(next.length - MAX_EVENTS);
    set({ events: next, version: version + 1 });
    evs.forEach(emit);
    scheduleSave();
  };

  return {
    ready: false,
    world: { coins: {}, roots: [], trees: {}, stats: { trees: 0, coins: 0, aliveCoins: 0, deepest: 0, solClimbed: 0 }, seq: 0 },
    events: [],
    version: 0,
    theme: 'dark',
    muted: true,
    season: seasonOf(),

    init() {
      if (get().ready) return;
      const saved = load();
      const { world, events } = saved ?? createGenesis();
      recomputeStats(world);
      let theme: 'dark' | 'light' = 'dark';
      try {
        if (localStorage.getItem('tree.theme') === 'light') theme = 'light';
      } catch {}
      set({ world, events, ready: true, version: 1, theme });
    },

    tick(rootCa) {
      const { world } = get();
      const now = Date.now();
      const ca = pickTrader(world, liveRng, rootCa, now);
      if (!ca) return;
      commit(trade(world, liveRng, ca, liveFee(liveRng), now, LIVE_LIMITS));
    },

    reap() {
      const { world } = get();
      const now = Date.now();
      const idle = Object.values(world.coins).filter(
        (c) => c.alive && c.parentCa && now - c.lastTradeAt > LIVE_DEATH_INACTIVITY && now - c.bornAt > LIVE_DEATH_INACTIVITY,
      );
      if (!idle.length || liveRng() > 0.45) return;
      const victim = idle[Math.floor(liveRng() * idle.length)];
      commit(kill(world, victim.ca, now));
    },

    plant(input) {
      const { world } = get();
      // TODO(phase2): launch on pump.fun via PumpPortal and wait for the mint (see lib/phase2/pumpportal.ts).
      const evs = plantRoot(world, liveRng, input, Date.now());
      commit(evs);
      return evs[0].coinCa;
    },

    claim(wallet) {
      // TODO(phase2): build + sign a claim transaction from each owned coin's vault.
      const evs = simClaim(get().world, wallet, Date.now());
      commit(evs);
      return evs.reduce((n, e) => n + (e.amount ?? 0), 0);
    },

    reset() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {}
      const { world, events } = createGenesis();
      set({ world, events, version: get().version + 1 });
    },

    setTheme(theme) {
      try {
        localStorage.setItem('tree.theme', theme);
      } catch {}
      set({ theme });
    },

    setMuted(muted) {
      setSoundMuted(muted);
      set({ muted });
    },

    cycleSeason() {
      const i = SEASONS.indexOf(get().season);
      set({ season: SEASONS[(i + 1) % SEASONS.length] });
    },
  };
});

/** Re-render on every world change. The world itself is mutated in place. */
export function useWorld() {
  const world = useStore((s) => s.world);
  const version = useStore((s) => s.version);
  const ready = useStore((s) => s.ready);
  return { world, version, ready };
}
