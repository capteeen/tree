# TREE — a coin that grows a family tree

Launch one coin. When its vault collects enough creator fees, it launches a child coin. Every coin's fees
climb up through **every** ancestor, and the root gets a cut of everything that ever grows beneath it.
The whole thing is one tree, and you can click through every branch.

> Coins launch on pump.fun (Solana). A meme, not an investment. Crypto is risky. Only use what you can afford to lose.

```bash
npm install
npm run dev                              # simulator (default)
TREE_MODE=devchain npm run dev           # the real backend on a fake chain
npm test                                 # fee rule, simulator and full backend tests
```

## Three modes

`TREE_MODE` picks the engine. The frontend is identical in all three: it reads `/api/world`, streams
`/api/events` (SSE), and plants/claims through `/api/plant/*` and `/api/claim*`.

| mode | what runs | money |
| --- | --- | --- |
| `sim` (default) | in-memory simulator with simulated trades (`lib/server/simEngine.ts`) | none |
| `devchain` | **the real backend**: SQLite, encrypted vault keys, launches, fee collection, on-chain splits, sprouts, dormancy, payouts, all against an in-memory fake chain with simulated market trades | none |
| `live` | the real backend against Solana mainnet + pump.fun | real SOL |

If the API is unreachable (static hosting), the browser falls back to running the simulator locally.

## How the live backend works

Code: `lib/server/live/`. Tests: `tests/live.test.ts`.

### Custody: one vault per coin

Every coin gets its own vault keypair, generated and held (encrypted) by the server, and **that vault is
the coin's pump.fun creator**. This matters: pump.fun pools creator fees *per creator wallet*
(`creator-vault` PDA), so if a parent's vault created all its children, their fees would be mixed together
and there'd be no way to know which child paid how much. With one vault per coin, fees are attributable,
and the parent still "launches" the child by paying for it out of its own vault.

Vault and mint keys are sealed with AES-256-GCM under `MASTER_KEY` (`lib/server/live/crypto.ts`). The
database stores a fingerprint of the key and refuses to start with a different one.

### The lifecycle

1. **Plant a root** (`/plant`). The server uploads the image + metadata, creates the root's vault and mint
   keys, and returns a transfer transaction (`launch cost + reserve + dev buy + fees`) for the user's wallet
   to sign. Once the vault is funded, the server sends `create_v2` (+ buy) via `@pump-fun/pump-sdk`, signed
   by the vault and mint, then forwards the dev-buy tokens to the planter. If the launch keeps failing, the
   SOL is refunded to the planter automatically.
2. **Collect.** Every `COLLECT_EVERY_SEC`, each coin with at least `MIN_COLLECT_SOL` waiting runs
   `collectCoinCreatorFeeInstructions` (bonding curve + PumpSwap, unwrapping WSOL). The amount credited is
   read from the confirmed transaction's balance change, so it's exactly what arrived.
3. **Split** (`ledger.ts`, integer lamports, identical to `lib/fees.ts`): 50% to the coin's vault
   bucket (75% during its first hour), the rest climbs: one transaction with a transfer to each ancestor's
   vault (parent 50%, grandparent 25% …, capped at 8 hops, root gets the remainder). Each ancestor puts 20%
   of what it receives into its own vault bucket and 80% into its owner's claimable bucket.
4. **Sprout.** When a vault bucket reaches the threshold, the amount is reserved, the child's image is
   made (parent image + `D<n>` badge), the parent's vault funds a new child vault, and the child launches.
5. **Dormancy.** A coin with no trades for `DORMANCY_HOURS` (checked against the chain, not just the
   trade feed) flushes its vault bucket up the path and goes dormant. A later trade revives it.
6. **Claim** (`/me`). The wallet signs a challenge message; the server pays each of that wallet's coins'
   claimable bucket from the coin's vault to the wallet. Funds only ever move to the recorded owner.

### Never double-spend, never lose a transaction

Every transaction is signed first, written to the `intents` table with its signature, then broadcast.
The ledger changes only when the chain confirms it, in the same SQLite transaction that marks the intent
landed. On restart (and every few seconds), `recover()` asks the chain what happened to each unresolved
signature. A transaction can't be applied twice, and a lost one is simply retried. Each vault's operations
run one at a time behind a lock, and every vault keeps a float for rent and fees that the engine tops up
from the vault bucket when it runs low.

The tests cover: a full plant → trade → collect → split → sprout → claim cycle; a dropped transaction; a
crash after a transaction landed but before it was recorded (a new process recovers it exactly once);
repeated launch failures ending in a refund; dormancy and revival; and a 60-round randomized run that checks
every vault stays solvent and that what was sent up equals what was received.

### Trades

The live ticker and fast revival use PumpPortal's free trade websocket (`tradeFeed.ts`). Fee accounting
never depends on it: fees come from the creator vault, and dormancy is double-checked on-chain.

## Going live

**Read this before putting real money through it.** The backend is tested end to end against the fake
chain, and the Solana adapter typechecks against the official SDK, but it has **not yet been run against
mainnet**. Do a full dry run with a tiny dev buy first, and watch every transaction on an explorer.

Required:

```bash
TREE_MODE=live
MASTER_KEY=$(openssl rand -hex 32)       # back this up separately: lose it and every vault is lost
HELIUS_API_KEY=...                       # server key (or SOLANA_RPC_URL=https://... for another provider)
PUBLIC_URL=https://engine.treeterminal.fun
NEXT_PUBLIC_SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=<browser key>
```

`NEXT_PUBLIC_*` values are shipped to every visitor's browser. Use **two Helius keys**: a private one for
the server (`HELIUS_API_KEY`) and a second one for the browser, restricted to treeterminal.fun in the Helius
dashboard (Access control → allowed domains). With Helius, priority fees follow its live
`getPriorityFeeEstimate` ("High"), capped by `MAX_PRIORITY_FEE_MICROLAMPORTS`.

```bash
```

Optional (defaults in `lib/server/live/boot.ts`):

| var | default | |
| --- | --- | --- |
| `DATA_DIR` | `./data` | SQLite database location: put it on a persistent volume and back it up |
| `LAUNCH_COST_SOL` / `VAULT_RESERVE_SOL` | 0.02 / 0.03 | threshold = their sum |
| `CHILD_DEV_BUY_SOL` | 0 | dev buy for vault-launched children |
| `MIN_COLLECT_SOL` / `COLLECT_EVERY_SEC` | 0.002 / 300 | when to collect creator fees |
| `CLAIM_MIN_SOL` | 0.001 | smallest per-coin payout |
| `DORMANCY_HOURS` | 24 | |
| `MAX_DEPTH` / `MAX_COINS_PER_TREE` | 14 / 300 | |
| `PRIORITY_FEE_MICROLAMPORTS` | 50000 | fixed fee, or the fallback when the Helius estimate fails |
| `MAX_PRIORITY_FEE_MICROLAMPORTS` | 500000 | cap on the live estimate |
| `DYNAMIC_PRIORITY_FEE` | 1 with Helius | `0` to always use the fixed fee |
| `METADATA_PROVIDER` | `pumpfun` | `pumpfun` (pump.fun's IPFS uploader) or `self` (served from `/api/media`) |
| `TRADE_FEED` | `pumpportal` | `none` to disable |
| `MAX_DEV_BUY_SOL` | 5 | |

**Deployment** (step by step: [DEPLOY.md](DEPLOY.md), site on Vercel + engine on Railway). The engine is a long-running process with background jobs, a websocket and a SQLite
file, so it needs **one** always-on Node server (Railway, Fly, Render, a VPS) with a persistent volume,
running `npm run build && npm start`. It will not work on serverless (Vercel functions), and you must not
run two instances against the same database: both would sign from the same vaults.

**Security notes.**
- The server is a hot wallet for every vault. Keep `MASTER_KEY` out of the repo and out of logs, restrict
  who can reach the host, and back up the database (it holds the sealed keys).
- Rate limits in `lib/server/http.ts` are per-process; put a real limiter (or a WAF) in front.
- pump.fun's IPFS endpoint is unofficial. If it changes, switch `METADATA_PROVIDER=self` (coins then
  depend on your site staying up for their metadata).
- pump.fun's program and fee model change often. Re-check `@pump-fun/pump-sdk` before each deploy.

## The fee rule

`lib/fees.ts` is the source of truth (`lib/server/live/ledger.ts` is its lamport twin).

* 50% of a coin's creator fees stay in **its own vault**, which funds its next child (75% for its first hour).
* The rest **climbs**: parent 50% of the climb, grandparent 25%, great-grandparent 12.5% …, capped at 8 hops,
  and the **root takes the remainder**.
* Ancestors put 20% of what they receive into their own vault (big trees sprout faster); 80% is claimable.
* A root has no ancestors, so its climbing half goes to its planter.
* Depth is 1-indexed (root = depth 1), so a depth-10 coin pays nine ancestors.

## What's where

```
app/
  page.tsx                 /            3D hero (largest tree by fees), 4 steps, waterfall, counters
  forest/  tree/[root]/  coin/[ca]/  plant/  leaderboard/  how/  me/  events/
  api/world, api/events    snapshot + SSE stream of the world
  api/config               mode, cluster, launch cost and reserve for the UI
  api/plant/{prepare,confirm,status}   the plant flow
  api/claim/challenge, api/claim       signed owner payouts
  api/media/[id]           self-hosted images + metadata
  api/og/event, */opengraph-image.tsx  share cards
components/                Tree3D (voxel tree), Tree2D, FeeWaterfall, Ticker, …
lib/
  fees.ts  sim.ts  store.ts  bus.ts  layout3d.ts  layout2d.ts  season.ts  sound.ts
  client/api.ts            plantFlow / claimFlow (browser)
  server/engine.ts         engine interface + mode switch
  server/hub.ts            world + event broadcast shared by all engines
  server/simEngine.ts      TREE_MODE=sim
  server/live/             the real backend: liveEngine, ledger, db, crypto, chain, solanaChain,
                           fakeChain, metadata, tradeFeed, boot
```

## Animations are driven by events

Every event the server publishes reaches `lib/bus.ts` in the browser. The 3D tree draws sap **only** for
`climb` events (one packet per event, the ancestor path lit gold while it flows), grows a branch for each
`sprout`, withers one for each `death`. Live climbs are real fee splits, so every glow is an on-chain
transfer whose signature is on the event.

## Every number is clickable

Numbers link to `/events` with filters (`coin`, `via`, `from`, `any`, `root`, `under`, `depth`, `kind`,
`roots`, `owner`, `id`). The page shows the matching events and the sum they add up to.
