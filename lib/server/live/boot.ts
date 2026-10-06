import 'server-only';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import { Store } from './db';
import { KeyBox } from './crypto';
import { FakeChain } from './fakeChain';
import { SolanaChain } from './solanaChain';
import { LiveEngine, type LiveConfig } from './liveEngine';
import { OgImageMaker, PumpFunIpfs, SelfHostedMetadata } from './metadata';
import { PumpPortalFeed } from './tradeFeed';
import { lamports } from './ledger';
import { LAUNCH_COST, ROOT_RESERVE } from '../../sim';
import { ROOT_WORDS } from '../../names';

const num = (k: string, d: number) => {
  const v = process.env[k];
  return v === undefined || v === '' ? d : Number(v);
};

/** A fixed key for devchain only: its database is in memory and holds no real funds. */
const DEVCHAIN_MASTER_KEY = '00'.repeat(32);

export function liveConfig(mode: 'devchain' | 'live'): LiveConfig {
  const dev = mode === 'devchain';
  return {
    launchCost: lamports(num('LAUNCH_COST_SOL', LAUNCH_COST)),
    reserve: lamports(num('VAULT_RESERVE_SOL', ROOT_RESERVE)),
    childDevBuy: lamports(num('CHILD_DEV_BUY_SOL', 0)),
    maxDepth: num('MAX_DEPTH', 14),
    maxCoinsPerTree: num('MAX_COINS_PER_TREE', 300),
    minCollect: lamports(num('MIN_COLLECT_SOL', dev ? 0.0005 : 0.002)),
    collectEveryMs: num('COLLECT_EVERY_SEC', dev ? 8 : 300) * 1000,
    claimMin: lamports(num('CLAIM_MIN_SOL', 0.001)),
    dormancyMs: num('DORMANCY_HOURS', dev ? 0.05 : 24) * 3_600_000,
    maxPendingPerOwner: num('MAX_PENDING_PLANTS_PER_WALLET', 3),
    awaitingExpiryMs: num('PLANT_PAYMENT_EXPIRY_MIN', 30) * 60_000,
    maxLaunchAttempts: num('MAX_LAUNCH_ATTEMPTS', 5),
    publicUrl: (process.env.PUBLIC_URL || (dev ? 'http://localhost:3000' : 'https://engine.treeterminal.fun')).replace(/\/$/, ''),
  };
}

export function createLiveEngine(mode: 'devchain' | 'live'): LiveEngine {
  const cfg = liveConfig(mode);
  const log = (m: string, e?: unknown) => console.log(`[tree:${mode}] ${m}`, e ?? '');

  let master = process.env.MASTER_KEY ?? '';
  if (!master) {
    if (mode === 'live') throw new Error('TREE_MODE=live needs MASTER_KEY (32 bytes, hex). Generate one with: openssl rand -hex 32');
    master = DEVCHAIN_MASTER_KEY;
  }
  const keys = new KeyBox(master);

  const dbFile = mode === 'devchain' ? process.env.DEVCHAIN_DB || ':memory:' : path.join(process.env.DATA_DIR || './data', 'tree.db');
  const store = new Store(dbFile);
  const fp = store.getMeta('master_key_fingerprint');
  if (fp && fp !== keys.fingerprint()) throw new Error('MASTER_KEY does not match the one this database was created with. Refusing to start.');
  if (!fp) store.setMeta('master_key_fingerprint', keys.fingerprint());

  let chain;
  if (mode === 'live') {
    const helius = process.env.HELIUS_API_KEY;
    const rpcUrl = process.env.SOLANA_RPC_URL || (helius ? `https://mainnet.helius-rpc.com/?api-key=${helius}` : '');
    if (!rpcUrl) throw new Error('TREE_MODE=live needs HELIUS_API_KEY or SOLANA_RPC_URL');
    const isHelius = rpcUrl.includes('helius');
    chain = new SolanaChain({
      rpcUrl,
      cluster: process.env.SOLANA_CLUSTER || 'mainnet-beta',
      priorityMicroLamports: num('PRIORITY_FEE_MICROLAMPORTS', 50_000),
      dynamicPriorityFee: (process.env.DYNAMIC_PRIORITY_FEE ?? (isHelius ? '1' : '0')) === '1',
      maxPriorityMicroLamports: num('MAX_PRIORITY_FEE_MICROLAMPORTS', 500_000),
      devBuySlippageBps: num('DEV_BUY_SLIPPAGE_BPS', 300),
    });
  } else chain = new FakeChain();

  const metaProvider = process.env.METADATA_PROVIDER || (mode === 'live' ? 'pumpfun' : 'self');
  // PUBLIC_URL = this engine's address (serves media); SITE_URL = the website shown on pump.fun
  const siteUrl = (process.env.SITE_URL || (mode === 'live' ? 'https://www.treeterminal.fun' : cfg.publicUrl)).replace(/\/$/, '');
  const meta = metaProvider === 'pumpfun' ? new PumpFunIpfs(siteUrl) : new SelfHostedMetadata(store, cfg.publicUrl, siteUrl);

  let feed: PumpPortalFeed | null = null;
  const engine = new LiveEngine({
    mode,
    store,
    chain,
    keys,
    meta,
    images: new OgImageMaker(),
    config: cfg,
    log,
    onCoin: (ca) => feed?.watch(ca),
  });

  if (mode === 'live' && (process.env.TRADE_FEED ?? 'pumpportal') === 'pumpportal') {
    feed = new PumpPortalFeed((t) => engine.onTrade(t), log);
    feed.start(engine.mints());
  }

  void engine.start(mode === 'devchain' ? { launches: 1500, fees: 2000, dormancy: 15_000 } : undefined);
  if (mode === 'devchain') void seedDevchain(engine, chain as FakeChain, log);
  // never log the RPC URL: it contains the API key
  log(`engine started (${chain.cluster}, metadata: ${metaProvider})`);
  return engine;
}

/**
 * devchain: plant a few roots through the real plant flow, then drive random
 * market trades so creator fees accrue and the engine collects, splits and sprouts.
 */
async function seedDevchain(engine: LiveEngine, chain: FakeChain, log: (m: string) => void) {
  const owners = [process.env.DEVCHAIN_WALLET, Keypair.generate().publicKey.toBase58(), Keypair.generate().publicKey.toBase58()];
  if (!engine.hub.world.roots.length) {
    for (let i = 0; i < 3; i++) {
      const owner = owners[i] || Keypair.generate().publicKey.toBase58();
      try {
        const p = await engine.preparePlant({ name: `${ROOT_WORDS[i * 3]} Root`, ticker: ROOT_WORDS[i * 3], image: `sprite:devchain${i}`, owner, devBuy: 0.5 });
        await engine.confirmPlant(p.id, 'devchain');
      } catch (e) {
        log(`devchain seed failed: ${(e as Error).message}`);
      }
    }
  }
  const tick = () => {
    const coins = Object.values(engine.hub.world.coins);
    if (coins.length) {
      // fresher, deeper coins trade more, like the simulator
      const pick = coins[Math.floor(Math.random() ** 0.6 * coins.length)] ?? coins[0];
      const c = Math.random() < 0.85 ? coins.sort((a, b) => b.bornAt - a.bornAt)[Math.floor(Math.random() * Math.min(coins.length, 12))] : pick;
      if (c && (c.alive || Math.random() < 0.15)) {
        const solAmount = 0.2 * Math.exp(Math.random() * 3.2); // 0.2 – 5 SOL
        chain.trade(c.ca, Math.round(solAmount * 1e9));
        engine.onTrade({ mint: c.ca, sol: solAmount, isBuy: Math.random() < 0.6 });
      }
    }
    setTimeout(tick, 400 + Math.random() * 1200).unref?.();
  };
  setTimeout(tick, 1500).unref?.();
}
