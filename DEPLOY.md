# Deploying: site on Vercel, engine on Railway

```
 visitors ──► www.treeterminal.fun (Vercel)            pages, 3D tree, share images
                   │  browser calls the engine directly (CORS)
                   ▼
            engine.treeterminal.fun (Railway)      always on: fees, launches, payouts
                   │  SQLite on a Railway volume
                   ▼
            Solana (Helius) + pump.fun
```

Both run this same repository. What each one does depends only on its environment variables.

## 1. Railway: the engine

1. railway.com → **New Project → Deploy from GitHub repo** → this repo and branch. `railway.json`
   sets build/start, a health check, and **one replica** (never run two: both would spend from the same vaults).
2. Service → **Volumes → Add volume**, mount path `/data`.
3. Service → **Variables**:

   | variable | value |
   | --- | --- |
   | `TREE_MODE` | `devchain` for a first check, then `live` |
   | `MASTER_KEY` | `openssl rand -hex 32`, saved somewhere offline too |
   | `HELIUS_API_KEY` | your **server** Helius key |
   | `DATA_DIR` | `/data` |
   | `PUBLIC_URL` | `https://engine.treeterminal.fun` |
   | `SITE_URL` | `https://www.treeterminal.fun` |
   | `ALLOWED_ORIGINS` | `https://www.treeterminal.fun,https://treeterminal.fun` |

   Do **not** set `NEXT_PUBLIC_ENGINE_URL` here.
4. Service → **Settings → Networking → Custom domain** → `engine.treeterminal.fun`. Railway shows a CNAME
   target; keep it for step 5.

## 2. Vercel: DNS + the site

5. Vercel → **Domains** → treeterminal.fun → **DNS records → Add**: type `CNAME`, name `engine`, value = the
   target Railway gave you. Wait until Railway shows the domain as verified (usually minutes).
6. Vercel → Project → **Settings → Environment Variables** (Production):

   | variable | value |
   | --- | --- |
   | `NEXT_PUBLIC_ENGINE_URL` | `https://engine.treeterminal.fun` |
   | `ENGINE_URL` | `https://engine.treeterminal.fun` |
   | `NEXT_PUBLIC_SITE_URL` | `https://www.treeterminal.fun` |
   | `NEXT_PUBLIC_SOLANA_RPC` | `https://mainnet.helius-rpc.com/?api-key=<BROWSER key>` |

   Never put `MASTER_KEY`, `HELIUS_API_KEY` or `TREE_MODE` on Vercel. `NEXT_PUBLIC_*` values are visible
   to every visitor, so the browser key must be a **second** Helius key restricted to treeterminal.fun
   (Helius dashboard → the key → access control / allowed domains).
7. **Redeploy** on Vercel (`NEXT_PUBLIC_*` values are baked in at build time).

## 3. Check it

- `https://engine.treeterminal.fun/api/config` → shows `"mode":"devchain"` (or `live`).
- `https://www.treeterminal.fun` → the header shows **● SHARED**, the ticker moves, and in devchain three
  trees (OAK, SEQUOIA, SAKURA) start growing.
- `https://www.treeterminal.fun/api/world` should redirect to the engine (the site never runs its own engine).

When devchain works end to end, switch Railway's `TREE_MODE` to `live`; it redeploys on its own.
The live forest starts empty until the first root is planted.
