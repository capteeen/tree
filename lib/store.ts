'use client';
import { create } from 'zustand';
import type { Ca, TreeEvent } from './types';
import { emit } from './bus';
import { api } from './apiBase';
import { liveRng } from './rng';
import { SEASONS, seasonOf, type Season } from './season';
import { setMuted as setSoundMuted } from './sound';
import type { PublicConfig } from './server/engine';
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

const SAVE_KEY = 'tree.sim.v2';
const MAX_EVENTS = 6000;
const SAVED_EVENTS = 1500;

/**
 * 'server': the shared world streamed from /api (everyone sees the same tree).
 * 'local':  this browser runs its own simulator (static hosting, offline, or the API failed).
 */
export type Mode = 'server' | 'local';

interface ServerMsg {
  event: TreeEvent;
  coins: World['coins'][string][];
  tree?: World['trees'][string];
  stats: World['stats'];
}

interface State {
  ready: boolean;
  mode: Mode;
  connected: boolean;
  /** Server config (launch cost, reserve, chain mode). null in local mode. */
  config: PublicConfig | null;
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
  plant(input: PlantInput): Promise<Ca>;
  claim(wallet: string): Promise<number>;
  waitForCoin(ca: Ca, ms?: number): Promise<void>;
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
  // Local mode only: write once the browser is idle, at most every 15 s.
  saveTimer = setTimeout(() => {
    const run = () => {
      saveTimer = null;
      const { world, events, mode } = useStore.getState();
      if (mode !== 'local') return;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ world, events: events.slice(-SAVED_EVENTS) }));
      } catch {
        /* storage full or blocked: the sim still runs in memory */
      }
    };
    if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback(run, { timeout: 5000 });
    else run();
  }, 15000);
}

export const useStore = create<State>()((set, get) => {
  const publish = (evs: TreeEvent[]) => {
    if (!evs.length) return;
    const { events, version } = get();
    let next = events.concat(evs);
    if (next.length > MAX_EVENTS) next = next.slice(next.length - MAX_EVENTS);
    set({ events: next, version: version + 1 });
    evs.forEach(emit);
  };

  /** Local mode: events came out of our own reducers. */
  const commit = (evs: TreeEvent[]) => {
    if (!evs.length) return;
    recomputeStats(get().world);
    publish(evs);
    scheduleSave();
  };

  /** Server mode: apply the delta, then emit the event. */
  const apply = (msg: ServerMsg) => {
    const { world } = get();
    for (const c of msg.coins) world.coins[c.ca] = c;
    if (msg.tree) {
      if (!world.trees[msg.tree.rootCa]) world.roots.push(msg.tree.rootCa);
      world.trees[msg.tree.rootCa] = msg.tree;
    }
    world.stats = msg.stats;
    publish([msg.event]);
  };

  let es: EventSource | null = null;
  const connect = () => {
    if (es) es.close();
    es = new EventSource(api('/api/events'));
    es.onopen = () => set({ connected: true });
    es.onmessage = (e) => {
      try {
        apply(JSON.parse(e.data));
      } catch {}
    };
    es.onerror = () => {
      set({ connected: false });
      // EventSource reconnects on its own; after a reconnect, resync the snapshot
      // so nothing that happened while we were away is missed.
      resync();
    };
  };
  let resyncTimer: ReturnType<typeof setTimeout> | null = null;
  const resync = () => {
    if (resyncTimer) return;
    resyncTimer = setTimeout(async () => {
      resyncTimer = null;
      try {
        const r = await fetch(api('/api/world'), { cache: 'no-store' });
        if (!r.ok) return;
        const snap = await r.json();
        const known = new Set(get().events.map((e) => e.id));
        const fresh = (snap.events as TreeEvent[]).filter((e) => !known.has(e.id));
        set({ world: snap.world, version: get().version + 1 });
        publish(fresh.slice(-50));
      } catch {}
    }, 1500);
  };

  const startLocal = () => {
    const saved = load();
    const { world, events } = saved ?? createGenesis();
    recomputeStats(world);
    set({ world, events, ready: true, mode: 'local', connected: false, version: 1 });
  };

  return {
    ready: false,
    mode: 'server',
    connected: false,
    config: null,
    world: { coins: {}, roots: [], trees: {}, stats: { trees: 0, coins: 0, aliveCoins: 0, deepest: 0, solClimbed: 0 }, seq: 0 },
    events: [],
    version: 0,
    theme: 'dark',
    muted: true,
    season: seasonOf(),

    init() {
      if (get().ready) return;
      let theme: 'dark' | 'light' = 'dark';
      try {
        if (localStorage.getItem('tree.theme') === 'light') theme = 'light';
      } catch {}
      set({ theme });
      const attach = async () => {
        const r = await fetch(api('/api/world'), { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!r.ok) throw new Error(String(r.status));
        const snap = await r.json();
        set({ world: snap.world, events: snap.events, ready: true, mode: 'server', version: get().version + 1 });
        connect();
        fetch(api('/api/config'), { cache: 'no-store' })
          .then((c) => (c.ok ? c.json() : null))
          .then((config) => config && set({ config }))
          .catch(() => {});
      };
      (async () => {
        try {
          await attach();
        } catch {
          // engine unreachable: run locally for now and keep trying to attach
          startLocal();
          const retry = async () => {
            if (get().mode === 'server') return;
            try {
              await attach();
            } catch {
              setTimeout(retry, 10_000);
            }
          };
          setTimeout(retry, 10_000);
        }
      })();
    },

    tick(rootCa) {
      if (get().mode !== 'local') return;
      const { world } = get();
      const now = Date.now();
      const ca = pickTrader(world, liveRng, rootCa, now);
      if (!ca) return;
      commit(trade(world, liveRng, ca, liveFee(liveRng), now, LIVE_LIMITS));
    },

    reap() {
      if (get().mode !== 'local') return;
      const { world } = get();
      const now = Date.now();
      const idle = Object.values(world.coins).filter(
        (c) => c.alive && c.parentCa && now - c.lastTradeAt > LIVE_DEATH_INACTIVITY && now - c.bornAt > LIVE_DEATH_INACTIVITY,
      );
      if (!idle.length || liveRng() > 0.45) return;
      const victim = idle[Math.floor(liveRng() * idle.length)];
      commit(kill(world, victim.ca, now));
    },

    /** Local mode only. Server modes plant through lib/client/api plantFlow (it needs the wallet). */
    async plant(input) {
      const evs = plantRoot(get().world, liveRng, input, Date.now());
      commit(evs);
      return evs[0].coinCa;
    },

    /** Local mode only; see lib/client/api claimFlow. */
    async claim(wallet) {
      const evs = simClaim(get().world, wallet, Date.now());
      commit(evs);
      return evs.reduce((n, e) => n + (e.amount ?? 0), 0);
    },

    /** Wait until a coin shows up in the streamed world (after a launch). */
    async waitForCoin(ca: Ca, ms = 8000) {
      const t = Date.now();
      while (!get().world.coins[ca] && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 150));
      if (!get().world.coins[ca]) resync();
    },

    reset() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {}
      if (get().mode === 'server') return;
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
      try {
        localStorage.setItem('tree.muted', muted ? '1' : '0');
      } catch {}
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
