import 'server-only';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { randomBytes } from 'node:crypto';
import type { Ca, Coin, TreeEvent } from '../../types';
import { childName } from '../../names';
import { liveRng, type Rng } from '../../rng';
import { fmtSol } from '../../format';
import { Hub } from '../hub';
import { UserError, type Engine, type PlantRequest, type PlantState, type PlantStatus, type PreparedPlant, type PublicConfig } from '../engine';
import { validatePlant, isPubkey } from '../validate';
import type { Chain, SignedTx, TxOutcome } from './chain';
import type { CoinRow, IntentKind, LaunchRow, Store } from './db';
import type { KeyBox } from './crypto';
import { decodeDataUrl, type ImageMaker, type MetadataStore } from './metadata';
import { receiveSplit, sol, splitClimbLamports, splitFeeLamports, vaultShareBps } from './ledger';

const RENT_EXEMPT = 890_880;

export interface LiveConfig {
  /** lamports: what a pump.fun create costs (rent for mint, curve, metadata) */
  launchCost: number;
  /** lamports kept in every new vault for rent and transaction fees */
  reserve: number;
  /** lamports: dev buy for vault-launched children (0 = none) */
  childDevBuy: number;
  maxDepth: number;
  maxCoinsPerTree: number;
  /** only collect when at least this much is waiting (lamports) */
  minCollect: number;
  collectEveryMs: number;
  /** smallest per-coin owner payout (lamports) */
  claimMin: number;
  dormancyMs: number;
  maxPendingPerOwner: number;
  awaitingExpiryMs: number;
  maxLaunchAttempts: number;
  publicUrl: string;
}

export interface LiveDeps {
  mode: 'devchain' | 'live';
  store: Store;
  chain: Chain;
  keys: KeyBox;
  meta: MetadataStore;
  images: ImageMaker;
  config: LiveConfig;
  clock?: () => number;
  rng?: Rng;
  log?: (msg: string, extra?: unknown) => void;
  /** Called when a new coin goes live (e.g. so the trade feed can subscribe to it). */
  onCoin?: (ca: string) => void;
}

const STATE_MAP: Record<LaunchRow['state'], PlantState> = {
  awaiting_payment: 'awaiting_payment',
  reserved: 'launching',
  funded: 'launching',
  created: 'launching',
  done: 'done',
  failed: 'failed',
  refunded: 'refunded',
  expired: 'expired',
};

/**
 * THE ON-CHAIN ENGINE (devchain + live)
 *
 * Custody model: every coin has its own vault keypair, held (encrypted) by this
 * server, and that vault is the coin's pump.fun creator. pump.fun pools creator
 * fees per creator wallet, so one vault per coin is what lets fees be
 * attributed to the coin that earned them.
 *
 * Every transaction is signed first, logged to `intents` with its signature,
 * then broadcast. The ledger only changes when a transaction is confirmed, in
 * the same DB transaction that marks the intent landed. After a crash,
 * `recover()` asks the chain what happened to each logged signature, so
 * nothing is ever sent twice or forgotten.
 */
export class LiveEngine implements Engine {
  hub = new Hub();
  readonly mode: 'devchain' | 'live';
  private s: Store;
  private chain: Chain;
  private keys: KeyBox;
  private cfg: LiveConfig;
  private now: () => number;
  private rng: Rng;
  private log: (msg: string, extra?: unknown) => void;
  private locks = new Map<string, Promise<unknown>>();
  private challenges = new Map<string, { message: string; exp: number }>();
  private timers: ReturnType<typeof setInterval>[] = [];
  /** Each job runs one pass at a time; callers arriving mid-pass wait for it. */
  private running = new Map<string, Promise<void>>();
  /** Intents this process is confirming right now; recover() leaves them alone. */
  private inFlight = new Set<number>();

  constructor(private d: LiveDeps) {
    this.mode = d.mode;
    this.s = d.store;
    this.chain = d.chain;
    this.keys = d.keys;
    this.cfg = d.config;
    this.now = d.clock ?? Date.now;
    this.rng = d.rng ?? liveRng;
    this.log = d.log ?? ((m, e) => console.log(`[tree] ${m}`, e ?? ''));
    this.loadWorld();
  }

  get threshold() {
    return this.cfg.launchCost + this.cfg.reserve;
  }

  config(): PublicConfig {
    return {
      mode: this.mode,
      cluster: this.chain.cluster,
      launchCost: sol(this.cfg.launchCost),
      reserve: sol(this.cfg.reserve),
      threshold: sol(this.threshold + this.cfg.childDevBuy),
      minClaim: sol(this.cfg.claimMin),
      claimNeedsSignature: this.mode === 'live',
      observedLaunchCost: this.s.getMeta('observed_launch_cost') ? sol(Number(this.s.getMeta('observed_launch_cost'))) : undefined,
    };
  }

  // ---------------------------------------------------------------- projection

  private toCoin(r: CoinRow): Coin {
    const prev = this.hub.world.coins[r.ca];
    return {
      ca: r.ca,
      name: r.name,
      ticker: r.ticker,
      image: r.image,
      description: r.description ?? undefined,
      telegram: r.telegram ?? undefined,
      rootCa: r.root_ca,
      parentCa: r.parent_ca ?? undefined,
      depth: r.depth,
      children: prev?.children ?? [],
      childIndex: r.child_index,
      vault: sol(r.vault_bucket),
      launchThreshold: sol(r.launch_threshold),
      feesEarned: sol(r.fees_earned),
      feesSentUp: sol(r.fees_sent_up),
      feesReceivedFromBelow: sol(r.fees_received),
      ownerEarned: sol(r.owner_earned),
      claimed: sol(r.claimed),
      trades: r.trades,
      bornAt: r.born_at,
      lastTradeAt: r.last_trade_at,
      diedAt: r.died_at ?? undefined,
      alive: !!r.alive,
      revivals: r.revivals,
      ownerWallet: r.owner_wallet,
    };
  }

  private loadWorld() {
    this.hub.upsertCoins(this.s.allCoins().map((r) => this.toCoin(r)));
    this.hub.recomputeGlobal();
    this.hub.events = this.s.recentEvents(1500).map((j) => JSON.parse(j) as TreeEvent);
  }

  private refresh(cas: Ca[]) {
    const rows = cas.map((ca) => this.s.coin(ca)).filter(Boolean) as CoinRow[];
    this.hub.upsertCoins(rows.map((r) => this.toCoin(r)));
    this.hub.recomputeGlobal();
  }

  /** Persist + broadcast. Call after the DB transaction that caused it. */
  private emit(e: Omit<TreeEvent, 'id'>) {
    const at = e.at;
    const tmp = { ...e, id: '' } as TreeEvent;
    const rowId = this.s.insertEvent(at, e.coinCa, '{}');
    tmp.id = `L${rowId.toString(36)}`;
    this.s.db.prepare('UPDATE events SET json = ? WHERE id = ?').run(JSON.stringify(tmp), rowId);
    this.hub.publish([tmp]);
    return tmp;
  }

  // ---------------------------------------------------------------- helpers

  private ancestors(ca: Ca): CoinRow[] {
    const out: CoinRow[] = [];
    let c = this.s.coin(ca);
    while (c?.parent_ca) {
      const p = this.s.coin(c.parent_ca);
      if (!p) break;
      out.push(p);
      c = p;
    }
    return out;
  }

  /** Serialise everything that spends from one vault. */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const chained = prev.then(() => mine);
    this.locks.set(key, chained);
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === chained) this.locks.delete(key);
    }
  }

  /** Lamports in a vault that belong to no bucket (rent + tx fee float). */
  private async float(c: CoinRow) {
    const reserved = this.s
      .launchesIn(['reserved'])
      .filter((l) => l.parent_ca === c.ca)
      .reduce((n, l) => n + l.required, 0);
    const bal = await this.chain.balance(new PublicKey(c.vault_pubkey));
    return bal - c.vault_bucket - c.owner_bucket - c.climb_owed - reserved;
  }

  /** Keep enough float for rent and a few fees, borrowing from the vault bucket if needed. */
  private async ensureFloat(ca: Ca) {
    const c = this.s.coin(ca)!;
    const need = RENT_EXEMPT + 6 * this.chain.txFee;
    const f = await this.float(c);
    if (f >= need) return true;
    const take = Math.min(c.vault_bucket, need - f);
    if (take > 0) this.s.bump(ca, { vault_bucket: -take });
    return f + take >= RENT_EXEMPT + 2 * this.chain.txFee;
  }

  private once(key: string, fn: () => Promise<void>): Promise<void> {
    const cur = this.running.get(key);
    if (cur) return cur;
    const p = fn().finally(() => this.running.delete(key));
    this.running.set(key, p);
    return p;
  }

  // ---------------------------------------------------------------- intents

  /**
   * Sign → log → broadcast → confirm → settle. `apply` runs inside the same
   * SQLite transaction that marks the intent landed.
   */
  private async exec(kind: IntentKind, ref: string, payload: Record<string, unknown>, build: () => Promise<SignedTx | null>): Promise<TxOutcome | 'skipped'> {
    if (this.s.openIntentFor(ref)) return 'skipped'; // an earlier tx for this ref is still unresolved
    const tx = await build();
    if (!tx) return 'skipped';
    const id = this.s.insertIntent({ kind, ref, signature: tx.signature, last_valid_height: tx.lastValidBlockHeight, payload: JSON.stringify(payload) });
    this.inFlight.add(id);
    try {
      try {
        await this.chain.submit(tx);
      } catch (e) {
        this.log(`${kind} submit error (will confirm anyway)`, (e as Error).message);
      }
      const outcome = await this.chain.confirm(tx);
      if (outcome !== 'pending') await this.settle(id, kind, payload, tx.signature, outcome);
      return outcome;
    } finally {
      this.inFlight.delete(id);
    }
  }

  /** Resolve every intent that was in flight when the process last stopped. */
  async recover() {
    for (const i of this.s.openIntents()) {
      if (this.inFlight.has(i.id)) continue;
      const outcome = await this.chain.status(i.signature, i.last_valid_height);
      if (outcome === 'pending') continue;
      this.log(`recovered ${i.kind} ${i.signature.slice(0, 8)} → ${outcome}`);
      await this.settle(i.id, i.kind, JSON.parse(i.payload), i.signature, outcome);
    }
  }

  private async settle(id: number, kind: IntentKind, p: Record<string, unknown>, sig: string, outcome: TxOutcome) {
    if (outcome !== 'landed') {
      if (!this.s.intentOpen(id)) return;
      this.s.setIntent(id, 'failed');
      if (kind === 'fund_child' || kind === 'create' || kind === 'send_tokens') {
        const l = this.s.launch(String(p.launchId));
        if (l) this.s.updateLaunch(l.id, { attempts: l.attempts + 1, error: `${kind} ${outcome}` });
      }
      return;
    }
    // anything that needs the chain is fetched before the DB transaction
    let delta = 0;
    if (kind === 'collect') delta = await this.chain.balanceDelta(sig, new PublicKey(String(p.vault)));
    if (kind === 'create') await this.measureLaunchCost(String(p.launchId), sig).catch(() => {});
    const after: (() => void)[] = [];
    this.s.tx(() => {
      if (!this.s.intentOpen(id)) return; // already settled elsewhere: never apply twice
      this.s.setIntent(id, 'landed');
      switch (kind) {
        case 'collect':
          after.push(this.applyCollect(String(p.ca), delta, sig));
          break;
        case 'split':
          after.push(this.applySplit(p as unknown as SplitPayload, sig));
          break;
        case 'fund_child':
          this.s.updateLaunch(String(p.launchId), { state: 'funded', payment_sig: sig, error: null });
          break;
        case 'create':
          after.push(this.applyCreate(String(p.launchId), sig));
          break;
        case 'send_tokens':
          this.s.updateLaunch(String(p.launchId), { state: 'done' });
          break;
        case 'payout':
          after.push(this.applyPayout(String(p.ca), Number(p.amount), String(p.wallet), sig));
          break;
        case 'refund':
          this.s.updateLaunch(String(p.launchId), { state: 'refunded' });
          break;
      }
    });
    after.forEach((f) => f());
  }

  /**
   * What pump.fun's create really cost (rent for the mint, curve, metadata and
   * token accounts, plus fees), read from the confirmed transaction. Stored and
   * shown in /api/config; a warning is logged when it exceeds LAUNCH_COST_SOL,
   * because children are funded with launchCost + reserve.
   */
  private async measureLaunchCost(launchId: string, sig: string) {
    const l = this.s.launch(launchId);
    if (!l) return;
    const delta = await this.chain.balanceDelta(sig, new PublicKey(l.vault_pubkey));
    const cost = -delta - l.dev_buy; // dev buy spend is the user's purchase, not launch cost
    if (cost <= 0) return;
    this.s.setMeta('observed_launch_cost', String(cost));
    if (cost > this.cfg.launchCost)
      this.log(`launch cost ${sol(cost)} SOL is above LAUNCH_COST_SOL=${sol(this.cfg.launchCost)}: raise it so children are funded correctly`);
  }

  // ---------------------------------------------------------------- ledger appliers (inside DB tx)

  private applyCollect(ca: Ca, net: number, sig: string) {
    const c = this.s.coin(ca)!;
    this.s.updateCoin(ca, { last_collect_at: this.now() });
    if (net <= 0) return () => {};
    const path = this.ancestors(ca);
    const bps = vaultShareBps(c.born_at, this.now());
    const split = splitFeeLamports(net, path.length, bps);
    if (path.length === 0) {
      // a root's climbing half belongs to its planter
      this.s.bump(ca, { fees_earned: net, vault_bucket: split.vault, owner_bucket: split.climb, owner_earned: split.climb });
      return () => {
        this.refresh([ca]);
        this.emit({
          kind: 'trade',
          coinCa: ca,
          rootCa: c.root_ca,
          depth: 1,
          fee: sol(net),
          amount: sol(split.climb),
          bonus: bps > 5000,
          sig,
          text: `ROOT ${c.ticker} collected ${fmtSol(sol(net))} SOL in fees: ${fmtSol(sol(split.vault))} to its vault, ${fmtSol(sol(split.climb))} to its planter`,
          at: this.now(),
        });
      };
    }
    this.s.bump(ca, { fees_earned: net, vault_bucket: split.vault, climb_owed: split.climb });
    // remember fee + bonus for the climb event
    this.pendingFee.set(ca, { fee: (this.pendingFee.get(ca)?.fee ?? 0) + net, bonus: bps > 5000 });
    return () => this.refresh([ca]);
  }
  private pendingFee = new Map<Ca, { fee: number; bonus: boolean }>();

  private applySplit(p: SplitPayload, sig: string) {
    const c = this.s.coin(p.ca)!;
    const fromVault = p.flush ? p.amount : 0;
    this.s.bump(p.ca, { climb_owed: -(p.amount - fromVault), vault_bucket: -fromVault, fees_sent_up: p.amount });
    p.path.forEach((a, i) => {
      const anc = this.s.coin(a);
      if (!anc || p.shares[i] <= 0) return;
      const { topup, owner } = anc.alive ? receiveSplit(p.shares[i]) : { topup: 0, owner: p.shares[i] };
      this.s.bump(a, { fees_received: p.shares[i], vault_bucket: topup, owner_bucket: owner, owner_earned: owner });
    });
    const pf = this.pendingFee.get(p.ca);
    this.pendingFee.delete(p.ca);
    return () => {
      this.refresh([p.ca, ...p.path]);
      const n = p.path.length;
      this.emit({
        kind: 'climb',
        coinCa: p.ca,
        rootCa: c.root_ca,
        depth: c.depth,
        path: p.path,
        amounts: p.shares.map(sol),
        amount: sol(p.amount),
        fee: p.flush ? undefined : pf ? sol(pf.fee) : undefined,
        flush: p.flush || undefined,
        bonus: pf?.bonus || undefined,
        sig,
        text: p.flush
          ? `DEPTH-${c.depth} coin ${c.ticker} went quiet; its last ${fmtSol(sol(p.amount))} SOL of sap climbed to ${n} ancestor${n === 1 ? '' : 's'}`
          : `DEPTH-${c.depth} coin ${c.ticker} paid ${fmtSol(sol(p.amount))} SOL up to ${n} ancestor${n === 1 ? '' : 's'}${pf?.bonus ? ' (sprout bonus: kept 75%)' : ''}`,
        at: this.now(),
      });
      // a top-up may have filled an ancestor's vault
      for (const a of p.path) this.maybeSprout(a);
    };
  }

  private applyCreate(launchId: string, sig: string) {
    const l = this.s.launch(launchId)!;
    if (this.s.coin(l.mint_pubkey)) return () => {};
    const parent = l.parent_ca ? this.s.coin(l.parent_ca) : undefined;
    const now = this.now();
    const row: CoinRow = {
      ca: l.mint_pubkey,
      name: l.name,
      ticker: l.ticker,
      image: l.image_url,
      description: l.description,
      telegram: l.telegram,
      root_ca: parent ? parent.root_ca : l.mint_pubkey,
      parent_ca: parent?.ca ?? null,
      depth: parent ? parent.depth + 1 : 1,
      child_index: parent ? this.s.childCount(parent.ca) : 0,
      vault_pubkey: l.vault_pubkey,
      vault_secret: l.vault_secret,
      launch_threshold: this.threshold + this.cfg.childDevBuy,
      fees_earned: 0,
      fees_sent_up: 0,
      fees_received: 0,
      vault_bucket: 0,
      owner_bucket: 0,
      climb_owed: 0,
      owner_earned: 0,
      claimed: 0,
      trades: 0,
      born_at: now,
      last_trade_at: now,
      died_at: null,
      alive: 1,
      revivals: 0,
      owner_wallet: l.owner_wallet,
      launch_sig: sig,
      last_collect_at: now,
    };
    this.s.insertCoin(row);
    this.s.updateLaunch(launchId, { state: l.kind === 'root' && l.dev_buy > 0 ? 'created' : 'done', error: null });
    return () => {
      this.refresh(parent ? [parent.ca, row.ca] : [row.ca]);
      this.emit(
        parent
          ? {
              kind: 'sprout',
              coinCa: row.ca,
              rootCa: row.root_ca,
              depth: row.depth,
              path: [parent.ca],
              sig,
              text: `${parent.ticker}'s vault hit ${fmtSol(sol(row.launch_threshold))} SOL and sprouted ${row.ticker} at DEPTH-${row.depth}`,
              at: now,
            }
          : { kind: 'sprout', coinCa: row.ca, rootCa: row.ca, depth: 1, sig, text: `NEW ROOT ${row.ticker} planted. A tree begins.`, at: now },
      );
      this.d.onCoin?.(row.ca);
    };
  }

  private applyPayout(ca: Ca, amount: number, wallet: string, sig: string) {
    const c = this.s.coin(ca)!;
    this.s.bump(ca, { owner_bucket: -amount, claimed: amount });
    return () => {
      this.refresh([ca]);
      this.emit({ kind: 'claim', coinCa: ca, rootCa: c.root_ca, depth: c.depth, amount: sol(amount), sig, text: `Owner of ${c.ticker} claimed ${fmtSol(sol(amount))} SOL`, at: this.now() });
      void wallet;
    };
  }

  // ---------------------------------------------------------------- planting a root

  async preparePlant(raw: PlantRequest): Promise<PreparedPlant> {
    const r = validatePlant(raw);
    if (this.s.pendingLaunchesOf(r.owner) >= this.cfg.maxPendingPerOwner) throw new UserError('You have launches waiting for payment. Finish or wait for them to expire.');
    const image = r.image.startsWith('data:') ? decodeDataUrl(r.image) : await this.d.images.sprite(r.image);
    const { uri, imageUrl } = await this.d.meta.put({ name: r.name, symbol: r.ticker, description: r.description ?? `${r.name}: a TREE root.`, telegram: r.telegram, image });
    const vault = Keypair.generate();
    const mint = Keypair.generate();
    const devBuy = Math.round(r.devBuy * 1e9);
    // create + forward dev-buy tokens + slippage headroom are all paid from the vault
    const required = this.cfg.launchCost + this.cfg.reserve + Math.ceil(devBuy * 1.03) + 4 * this.chain.txFee;
    const id = `p_${randomBytes(9).toString('hex')}`;
    const now = this.now();
    this.s.insertLaunch({
      id,
      kind: 'root',
      parent_ca: null,
      owner_wallet: r.owner,
      name: r.name,
      ticker: r.ticker,
      description: r.description ?? null,
      telegram: r.telegram ?? null,
      image_url: imageUrl,
      metadata_uri: uri,
      vault_pubkey: vault.publicKey.toBase58(),
      vault_secret: this.keys.seal(vault),
      mint_pubkey: mint.publicKey.toBase58(),
      mint_secret: this.keys.seal(mint),
      required,
      dev_buy: devBuy,
      state: 'awaiting_payment',
      attempts: 0,
      error: null,
      payment_sig: null,
      created_at: now,
      updated_at: now,
    });
    const extra = required - this.cfg.launchCost - this.cfg.reserve - devBuy;
    return {
      id,
      mode: this.mode,
      payTo: vault.publicKey.toBase58(),
      lamports: required,
      memo: `tree:plant:${id}`,
      total: sol(required),
      breakdown: { launchCost: sol(this.cfg.launchCost), reserve: sol(this.cfg.reserve), devBuy: sol(devBuy), networkFee: sol(extra) },
    };
  }

  async confirmPlant(id: string, signature?: string): Promise<PlantStatus> {
    const l = this.s.launch(id);
    if (!l || l.kind !== 'root') throw new UserError('unknown launch');
    if (l.state === 'awaiting_payment') {
      if (this.mode === 'devchain' && signature === 'devchain' && 'pay' in this.chain) {
        // devchain: stand in for the user's wallet
        (this.chain as unknown as { pay: (to: PublicKey, l: number) => string }).pay(new PublicKey(l.vault_pubkey), l.required);
      }
      // the payment may still be landing: give it a little while
      for (let i = 0; i < 20; i++) {
        if ((await this.chain.balance(new PublicKey(l.vault_pubkey))) >= l.required) {
          this.s.updateLaunch(id, { state: 'funded', payment_sig: signature ?? null });
          break;
        }
        if (this.mode === 'devchain') break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    void this.processLaunches();
    return this.plantStatus(id)!;
  }

  async cancelPlant(id: string): Promise<PlantStatus | null> {
    const l = this.s.launch(id);
    if (!l || l.kind !== 'root') return null;
    if (l.state === 'awaiting_payment') {
      // only release the slot if nothing arrived; a late payment still launches (or is refunded)
      const bal = await this.chain.balance(new PublicKey(l.vault_pubkey));
      if (bal === 0) this.s.updateLaunch(id, { state: 'expired', error: 'cancelled' });
    }
    return this.plantStatus(id);
  }

  plantStatus(id: string): PlantStatus | null {
    const l = this.s.launch(id);
    if (!l) return null;
    return { id, state: STATE_MAP[l.state], ca: l.state === 'done' || l.state === 'created' ? l.mint_pubkey : undefined, error: l.error ?? undefined };
  }

  // ---------------------------------------------------------------- launch state machine

  processLaunches(): Promise<void> {
    return this.once('launches', async () => {
      for (const l of this.s.launchesIn(['awaiting_payment', 'reserved', 'funded', 'created'])) {
        try {
          await this.withLock(l.vault_pubkey, () => this.step(l.id));
        } catch (e) {
          this.log(`launch ${l.id} error`, (e as Error).message);
          const cur = this.s.launch(l.id);
          if (cur) this.s.updateLaunch(l.id, { attempts: cur.attempts + 1, error: (e as Error).message.slice(0, 200) });
        }
      }
    });
  }

  private async step(id: string) {
    const l = this.s.launch(id)!;
    const vault = new PublicKey(l.vault_pubkey);
    if (this.s.openIntentFor(id)) return; // wait for recover() to resolve the last transaction
    if (l.attempts >= this.cfg.maxLaunchAttempts && l.state !== 'awaiting_payment') return this.giveUp(l);

    if (l.state === 'awaiting_payment') {
      if (this.now() - l.updated_at < 20_000 && this.mode === 'live') return; // poll politely
      const bal = await this.chain.balance(vault);
      if (bal >= l.required) return this.s.updateLaunch(id, { state: 'funded' });
      if (this.now() - l.created_at > this.cfg.awaitingExpiryMs) {
        this.s.updateLaunch(id, { state: 'expired' });
        if (bal > this.chain.txFee + 5000) await this.refund(l, bal);
      } else this.s.updateLaunch(id, {});
      return;
    }

    if (l.state === 'reserved') {
      // a child: make its badge image + metadata, then fund its vault from the parent's
      const parent = this.s.coin(l.parent_ca!)!;
      if (!l.metadata_uri) {
        const parentImg = await this.d.meta.load(parent.image).catch(() => null);
        const img = parentImg ? await this.d.images.badge(parentImg, parent.depth + 1) : await this.d.images.sprite(`sprite:${l.id}`);
        const { uri, imageUrl } = await this.d.meta.put({
          name: l.name,
          symbol: l.ticker,
          description: l.description ?? '',
          image: img,
        });
        this.s.updateLaunch(id, { metadata_uri: uri, image_url: imageUrl });
      }
      const pkp = this.keys.open(parent.vault_secret);
      await this.withLock(parent.vault_pubkey, async () => {
        await this.exec('fund_child', id, { launchId: id }, async () => this.chain.buildTransfer(pkp, [{ to: vault, lamports: l.required }], `tree:fund:${id}`));
      });
      return;
    }

    if (l.state === 'funded') {
      const mint = new PublicKey(l.mint_pubkey);
      if (await this.chain.mintExists(mint)) {
        // created on-chain but the record was lost: adopt it
        this.s.tx(() => this.applyCreate(id, l.payment_sig ?? 'recovered'))();
        return;
      }
      const creator = this.keys.open(l.vault_secret);
      const mintKp = this.keys.open(l.mint_secret);
      await this.exec('create', id, { launchId: id }, () =>
        this.chain.buildCreate({ creator, mint: mintKp, name: l.name, symbol: l.ticker, uri: l.metadata_uri, devBuyLamports: l.dev_buy }),
      );
      return;
    }

    if (l.state === 'created') {
      // root with a dev buy: the vault bought the tokens; hand them to the planter
      const creator = this.keys.open(l.vault_secret);
      const r = await this.exec('send_tokens', id, { launchId: id }, () => this.chain.buildSendTokens(creator, new PublicKey(l.mint_pubkey), new PublicKey(l.owner_wallet)));
      if (r === 'skipped' && !this.s.openIntentFor(id)) this.s.updateLaunch(id, { state: 'done' });
    }
  }

  private async giveUp(l: LaunchRow) {
    this.log(`launch ${l.id} failed after ${l.attempts} attempts: ${l.error}`);
    if (l.kind === 'child') {
      if (l.state === 'reserved') {
        // never funded: the reservation goes back into the parent's vault bucket
        this.s.tx(() => {
          this.s.bump(l.parent_ca!, { vault_bucket: l.required });
          this.s.updateLaunch(l.id, { state: 'failed' });
        });
        this.refresh([l.parent_ca!]);
      } else {
        // funded but never created: send the SOL back to the parent's vault
        const bal = await this.chain.balance(new PublicKey(l.vault_pubkey));
        const parent = this.s.coin(l.parent_ca!)!;
        if (bal > this.chain.txFee) {
          const kp = this.keys.open(l.vault_secret);
          const out = await this.exec('refund', l.id, { launchId: l.id }, () => this.chain.buildTransfer(kp, [{ to: new PublicKey(parent.vault_pubkey), lamports: bal - this.chain.txFee }]));
          if (out === 'landed') {
            this.s.bump(parent.ca, { vault_bucket: bal - this.chain.txFee });
            this.refresh([parent.ca]);
          }
        }
        this.s.updateLaunch(l.id, { state: 'failed' });
      }
      return;
    }
    if (l.state === 'created') {
      // the coin exists; only the token hand-off failed. Leave tokens in the vault, record as done.
      this.s.updateLaunch(l.id, { state: 'done', error: 'dev-buy tokens are still in the vault' });
      return;
    }
    this.s.updateLaunch(l.id, { state: 'failed' });
    const bal = await this.chain.balance(new PublicKey(l.vault_pubkey));
    if (bal > this.chain.txFee + 5000) await this.refund(l, bal);
  }

  private async refund(l: LaunchRow, bal: number) {
    const kp = this.keys.open(l.vault_secret);
    await this.exec('refund', l.id, { launchId: l.id }, () => this.chain.buildTransfer(kp, [{ to: new PublicKey(l.owner_wallet), lamports: bal - this.chain.txFee }], `tree:refund:${l.id}`));
  }

  /** If a coin's vault bucket can pay for a child, reserve it and queue the launch. */
  maybeSprout(ca: Ca) {
    const c = this.s.coin(ca);
    if (!c || !c.alive) return;
    const required = this.threshold + this.cfg.childDevBuy;
    if (c.vault_bucket < required || c.depth >= this.cfg.maxDepth) return;
    if (this.s.treeSize(c.root_ca) >= this.cfg.maxCoinsPerTree) return;
    if (this.s.openChildLaunch(ca)) return;
    const vault = Keypair.generate();
    const mint = Keypair.generate();
    const { name, ticker } = childName(this.rng);
    const now = this.now();
    const id = `c_${randomBytes(9).toString('hex')}`;
    this.s.tx(() => {
      this.s.bump(ca, { vault_bucket: -required });
      this.s.insertLaunch({
        id,
        kind: 'child',
        parent_ca: ca,
        owner_wallet: c.owner_wallet,
        name,
        ticker,
        description: `Child of ${c.ticker}. Launched by ${c.ticker}'s vault at depth ${c.depth + 1}. Every trade pays its ${c.depth} ancestor${c.depth === 1 ? '' : 's'}.`,
        telegram: null,
        image_url: '',
        metadata_uri: '',
        vault_pubkey: vault.publicKey.toBase58(),
        vault_secret: this.keys.seal(vault),
        mint_pubkey: mint.publicKey.toBase58(),
        mint_secret: this.keys.seal(mint),
        required,
        dev_buy: this.cfg.childDevBuy,
        state: 'reserved',
        attempts: 0,
        error: null,
        payment_sig: null,
        created_at: now,
        updated_at: now,
      });
    });
    this.refresh([ca]);
  }

  // ---------------------------------------------------------------- fee cycle

  feeCycle(): Promise<void> {
    return this.once('fees', async () => {
      const due = this.s.allCoins().filter((c) => this.now() - c.last_collect_at >= this.cfg.collectEveryMs || c.climb_owed > 0);
      for (const c of due) {
        try {
          await this.withLock(c.vault_pubkey, () => this.cycleCoin(c.ca));
        } catch (e) {
          this.log(`fee cycle ${c.ticker} error`, (e as Error).message);
        }
      }
    });
  }

  private async cycleCoin(ca: Ca) {
    let c = this.s.coin(ca)!;
    const vault = new PublicKey(c.vault_pubkey);
    const kp = this.keys.open(c.vault_secret);
    // 1. collect creator fees from pump.fun into the vault
    if (this.now() - c.last_collect_at >= this.cfg.collectEveryMs) {
      const pending = await this.chain.pendingCreatorFees(vault);
      if (pending >= this.cfg.minCollect) {
        await this.exec('collect', ca, { ca, vault: c.vault_pubkey }, () => this.chain.buildCollect(kp));
      } else this.s.updateCoin(ca, { last_collect_at: this.now() });
      c = this.s.coin(ca)!;
    }
    // 2. send the climbing share up the ancestor path in one transaction
    if (c.climb_owed > 0) await this.sendClimb(ca, c.climb_owed, false);
    // 3. a full vault launches a child
    this.maybeSprout(ca);
  }

  private async sendClimb(ca: Ca, amount: number, flush: boolean) {
    const c = this.s.coin(ca)!;
    const path = this.ancestors(ca);
    if (!path.length) return;
    if (!(await this.ensureFloat(ca))) return this.log(`${c.ticker}: vault too low to pay fees, holding climb`);
    if (flush) amount = Math.min(amount, this.s.coin(ca)!.vault_bucket);
    if (amount <= 0) return;
    const shares = splitClimbLamports(amount, path.length);
    const outs = path.map((a, i) => ({ to: new PublicKey(a.vault_pubkey), lamports: shares[i] })).filter((o) => o.lamports > 0);
    const kp = this.keys.open(c.vault_secret);
    const payload: SplitPayload = { ca, path: path.map((a) => a.ca), shares, amount, flush };
    await this.exec('split', ca, payload as unknown as Record<string, unknown>, () => this.chain.buildTransfer(kp, outs, `tree:climb:${ca.slice(0, 8)}`));
  }

  // ---------------------------------------------------------------- trades, dormancy, revival

  /** A trade seen on the market (trade feed). */
  onTrade(t: { mint: string; sol: number; trader?: string; isBuy?: boolean; sig?: string; at?: number }) {
    const c = this.s.coin(t.mint);
    if (!c) return;
    const at = t.at ?? this.now();
    this.s.updateCoin(c.ca, { last_trade_at: Math.max(c.last_trade_at, at), trades: c.trades + 1 });
    if (!c.alive) this.revive(c.ca, at);
    this.refresh([c.ca]);
    this.emit({
      kind: 'swap',
      coinCa: c.ca,
      rootCa: c.root_ca,
      depth: c.depth,
      volume: t.sol,
      trader: t.trader,
      sig: t.sig,
      text: `${t.isBuy === false ? 'Sell' : 'Buy'} of ${fmtSol(t.sol)} SOL on DEPTH-${c.depth} coin ${c.ticker}`,
      at,
    });
  }

  private revive(ca: Ca, at: number) {
    const c = this.s.coin(ca)!;
    this.s.updateCoin(ca, { alive: 1, died_at: null, revivals: c.revivals + 1 });
    this.refresh([ca]);
    this.emit({ kind: 'revive', coinCa: ca, rootCa: c.root_ca, depth: c.depth, text: `DEPTH-${c.depth} coin ${c.ticker} is back! A trade revived it and its leaves regrew`, at });
  }

  dormancy(): Promise<void> {
    return this.once('dormancy', async () => {
      for (const c of this.s.allCoins()) {
        if (!c.parent_ca) continue;
        const idle = this.now() - c.last_trade_at > this.cfg.dormancyMs;
        if (!idle && c.alive) continue;
        // ask the chain before declaring anything dead (or alive again)
        const last = await this.chain.lastActivity(new PublicKey(c.ca)).catch(() => null);
        let lastTrade = c.last_trade_at;
        if (last && last > lastTrade) {
          lastTrade = last;
          this.s.updateCoin(c.ca, { last_trade_at: last });
          if (!c.alive && last > (c.died_at ?? 0)) {
            this.revive(c.ca, last);
            continue;
          }
        }
        if (c.alive && this.now() - lastTrade > this.cfg.dormancyMs) await this.withLock(c.vault_pubkey, () => this.kill(c.ca));
      }
    });
  }

  private async kill(ca: Ca) {
    const c = this.s.coin(ca)!;
    if (c.vault_bucket > 0) await this.sendClimb(ca, c.vault_bucket, true);
    const after = this.s.coin(ca)!;
    if (after.vault_bucket > 0) return; // flush did not land; try again next round
    this.s.updateCoin(ca, { alive: 0, died_at: this.now() });
    this.refresh([ca]);
    this.emit({ kind: 'death', coinCa: ca, rootCa: c.root_ca, depth: c.depth, text: `DEPTH-${c.depth} coin ${c.ticker} went dormant. No trades for a day. Its leaves fell.`, at: this.now() });
  }

  // ---------------------------------------------------------------- owner claims

  claimChallenge(wallet: string) {
    if (!isPubkey(wallet)) throw new UserError('Invalid wallet');
    const message = `Sign to claim your TREE earnings.\n\nWallet: ${wallet}\nNonce: ${randomBytes(12).toString('hex')}\nIssued: ${new Date(this.now()).toISOString()}`;
    this.challenges.set(wallet, { message, exp: this.now() + 5 * 60_000 });
    return message;
  }

  async claim(wallet: string, message: string, signature?: string) {
    if (!isPubkey(wallet)) throw new UserError('Invalid wallet');
    if (this.mode === 'live') {
      const ch = this.challenges.get(wallet);
      if (!ch || ch.message !== message || ch.exp < this.now()) throw new UserError('Claim request expired. Try again.');
      let ok = false;
      try {
        ok = nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signature ?? ''), new PublicKey(wallet).toBytes());
      } catch {}
      if (!ok) throw new UserError('Signature does not match this wallet');
      this.challenges.delete(wallet);
    }
    let amount = 0;
    const signatures: string[] = [];
    for (const c of this.s.coinsOfOwner(wallet)) {
      await this.withLock(c.vault_pubkey, async () => {
        const cur = this.s.coin(c.ca)!;
        if (cur.owner_bucket < this.cfg.claimMin) return;
        if (!(await this.ensureFloat(c.ca))) return;
        const amt = this.s.coin(c.ca)!.owner_bucket;
        const kp = this.keys.open(cur.vault_secret);
        let sig = '';
        const out = await this.exec('payout', c.ca, { ca: c.ca, amount: amt, wallet }, async () => {
          const tx = await this.chain.buildTransfer(kp, [{ to: new PublicKey(wallet), lamports: amt }], `tree:claim:${c.ca.slice(0, 8)}`);
          sig = tx.signature;
          return tx;
        });
        if (out === 'landed') {
          amount += amt;
          signatures.push(sig);
        }
      });
    }
    return { amount: sol(amount), signatures };
  }

  // ---------------------------------------------------------------- lifecycle

  async start(intervals = { launches: 3000, fees: 5000, dormancy: 60_000 }) {
    await this.recover();
    for (const c of this.s.allCoins()) this.maybeSprout(c.ca);
    const every = (ms: number, fn: () => Promise<unknown>) => {
      const t = setInterval(() => fn().catch((e) => this.log('job error', (e as Error).message)), ms);
      (t as { unref?: () => void }).unref?.();
      this.timers.push(t);
    };
    every(intervals.launches, async () => {
      await this.recover();
      await this.processLaunches();
    });
    every(intervals.fees, () => this.feeCycle());
    every(intervals.dormancy, () => this.dormancy());
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  media(id: string) {
    return this.s.media(id);
  }

  /** Mints the trade feed should watch. */
  mints() {
    return this.s.allCoins().map((c) => c.ca);
  }
}

interface SplitPayload {
  ca: Ca;
  path: Ca[];
  shares: number[];
  amount: number;
  flush: boolean;
}

export type { LiveDeps as Deps };
