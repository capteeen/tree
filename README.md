# TREE — a coin that grows a family tree

Launch one coin. When its vault collects enough creator fees, it launches a child coin. Every coin's fees
climb up through **every** ancestor, and the root gets a cut of everything that ever grows beneath it.
The whole thing is one tree, and you can click through every branch.

> Coins launch on pump.fun (Solana). A meme, not an investment. Crypto is risky. Only use what you can afford to lose.

This repository is **Phase 1**: a complete Next.js app driven by a mock simulator that runs in the browser.
No backend is needed, and the UI is live on first load.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

Optional env vars:

| var | default | used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SOLANA_RPC` | mainnet-beta public RPC | wallet adapter connection |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | absolute OG image URLs |

## The fee rule

`lib/fees.ts` is the single source of truth.

* 50% of a coin's creator fees stay in **its own vault**, which funds its next child.
* 50% **climbs**: the parent gets 50% of the climb, grandparent 25%, great-grandparent 12.5% …, and the
  **root takes the remainder**.
* A root has no ancestors, so its climbing half goes to its planter.
* Depth is 1-indexed (root = depth 1), so a depth-10 coin pays nine ancestors.
* Launch threshold = pump.fun launch cost (0.02) + reserve (0.03) = 0.05 SOL.

## What's where

```
app/
  page.tsx                 /            3D hero (largest tree by fees), 4 steps, waterfall, counters
  forest/                  /forest      every tree as a 2D pixel thumbnail, sortable
  tree/[root]/             /tree/:root  full-screen 3D tree + indented coin list, click to focus
  coin/[ca]/               /coin/:ca    coin page; opengraph-image.tsx renders its X card
  plant/                   /plant       launch modal (wallet connect required, launch mocked)
  leaderboard/             /leaderboard biggest / deepest / top root earners / fastest growing
  how/                     /how         long-form explainer with pixel diagrams
  me/                      /me          your roots + coins, received from descendants, claim (mocked)
  events/                  /events      the event explorer every number links to
components/
  Tree3D.tsx               Three.js voxel tree (instanced meshes, ortho camera, pixelated render)
  Tree2D.tsx               recursive 2D pixel tree: WebGL fallback + forest thumbnails
  FeeWaterfall.tsx         per-coin pixel waterfall of who gets what
  …                        ticker, odometers, about-to-sprout, deepest badge, wallet, etc.
lib/
  types.ts                 Coin / Tree / TreeEvent / GlobalStats
  fees.ts                  the fee rule
  sim.ts                   MOCK SIMULATOR (Phase 1)
  store.ts                 Zustand store: world + event log, persisted to localStorage
  bus.ts                   event bus; every animation subscribes here
  layout3d.ts              procedural tree layout (golden-angle placement)
  season.ts / sound.ts     seasonal palettes, 8-bit sfx (muted by default)
  phase2/                  stubs for the real backend (all TODO)
```

### Simulator (`lib/sim.ts`)

* `createGenesis(seed)` grows 5 trees of 10–60 coins (depth ≤ 8) by actually running trades through the
  fee rule, then stretches the timeline over the last few days. It is deterministic, so the server
  (OG images, metadata) and every browser see the same starting forest.
* `SimDriver` in `components/Providers.tsx` trades a random coin in each tree every 2–6 s. A trade runs
  the split and emits a `climb` event carrying the full ancestor path and per-ancestor amounts. When a
  vault crosses its threshold, a child sprouts. Idle coins occasionally go dormant: their remaining
  vault climbs one last time, then their leaves fall. The sim speeds this up; the real rule is 24 h.
* State persists in `localStorage` (`tree.sim.v1`). "Reset simulator" in the footer starts over.

### Animations are driven by events

`store.commit()` appends events to the log and publishes each one on `lib/bus.ts`. `Tree3D` and `Tree2D`
draw sap **only** in response to `climb` events: one packet per event, travelling from the paying coin's
leaves along each branch toward the trunk. A `+amount` pops at every ancestor it pays, and a ring flashes
at the root. Sprouts grow over 1 s with a pixel pop; deaths drop leaves. Nothing animates on a timer.
The same events feed the ticker, so every glow on screen has a matching line in the feed.

### Every number is clickable

Numbers link to `/events` with filters (`coin`, `via`, `from`, `any`, `root`, `under`, `depth`, `kind`,
`roots`, `owner`, `id`). The page shows the matching events and the sum they add up to.

## Phase 2: replacing the simulator

The UI only depends on the `World` shape (`coins`, `trees`, `roots`, `stats`) and on a stream of
`TreeEvent`s. To go live, keep those shapes and change where they come from.

1. **Indexer / backend.** Run a service that owns one vault keypair per coin (or an on-chain program with
   PDA vaults) and:
   * claims creator fees per coin (`claimCreatorFees` in `lib/phase2/pumpportal.ts`);
   * runs `splitFees()` from `lib/fees.ts` and sends the transfers up the ancestor path
     (`transferUpPath`);
   * when a vault reaches `currentLaunchCost() + ROOT_RESERVE`, launches a child via PumpPortal with the
     **parent's vault as creator** (`launchOnPump`), using the parent's image with a depth badge
     (`lib/phase2/badge.ts`);
   * writes every action as a `TreeEvent` (with tx signatures added as a field) and keeps `Coin` and
     `Tree` aggregates.
2. **API.** Expose `GET /api/world` (snapshot) and a stream (SSE or WebSocket) of new `TreeEvent`s.
3. **Client.** In `lib/store.ts`:
   * `init()`: fetch the snapshot instead of `createGenesis()` or `localStorage`;
   * replace `tick()` and `reap()` (and the `SimDriver` interval) with a subscription that calls
     `commit()` for each incoming event, after applying it to the world (the `trade`, `sproutChild` and
     `kill` reducers in `sim.ts` already do this);
   * `plant()`: call the backend, have the user sign the launch transaction with the wallet adapter, then
     wait for the `sprout` event;
   * `claim()`: build the claim transaction for the user to sign.
4. **Server pages.** `genesisWorld()` feeds OG images and metadata; point it at the indexer instead.

Everything marked `TODO(phase2)` in the code is a hook point for this.

## Performance notes

* The 3D tree uses three `InstancedMesh`es (wood, leaves, sap) plus one each for particles and the
  ground, so draw calls stay constant no matter how many coins there are. Trees are capped at 300 coins.
* Rendering: a hard-shadow sun (`BasicShadowMap`, blocky on purpose), hemisphere + camera-following fill
  lights so the visible side is never black, a vertex-shader wind sway on the leaves, and a depth-based
  outline pass (the scene renders to a low-res target with a depth texture; a full-screen pass darkens
  silhouette edges, the 16-bit sprite outline). The canvas is transparent over a CSS pixel sky (stars at
  night, drifting clouds by day).
* It renders at 1/2 or 1/3 resolution and scales up with `image-rendering: pixelated`. That gives the
  pixel look and keeps fill-rate low on phones.
* Instance buffers are rebuilt at most every 0.7 s (every frame only while a branch is growing), and
  rendering pauses when the canvas is offscreen or the tab is hidden.
