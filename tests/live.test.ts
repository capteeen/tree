import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Store } from '@/lib/server/live/db';
import { KeyBox } from '@/lib/server/live/crypto';
import { FakeChain, FAKE_CREATE_RENT } from '@/lib/server/live/fakeChain';
import { LiveEngine, type LiveConfig } from '@/lib/server/live/liveEngine';
import { SelfHostedMetadata, type ImageMaker } from '@/lib/server/live/metadata';
import { splitClimbLamports, splitFeeLamports, receiveSplit } from '@/lib/server/live/ledger';
import type { TxOutcome } from '@/lib/server/live/chain';

const SOL = 1e9;
const images: ImageMaker = {
  sprite: async () => ({ bytes: Buffer.from('png'), mime: 'image/png' }),
  badge: async (p, d) => ({ bytes: Buffer.concat([p.bytes, Buffer.from(`D${d}`)]), mime: 'image/png' }),
};
const cfg: LiveConfig = {
  launchCost: 0.02 * SOL,
  reserve: 0.03 * SOL,
  childDevBuy: 0,
  maxDepth: 14,
  maxCoinsPerTree: 300,
  minCollect: 0.0005 * SOL,
  collectEveryMs: 0,
  claimMin: 0.001 * SOL,
  dormancyMs: 3_600_000,
  maxPendingPerOwner: 3,
  awaitingExpiryMs: 30 * 60_000,
  maxLaunchAttempts: 3,
  publicUrl: 'http://tree.test',
};

function setup(store = new Store(':memory:'), chain = new FakeChain()) {
  let t = 1_700_000_000_000;
  const clock = () => t;
  store.clock = clock;
  chain.clock = clock;
  const keys = new KeyBox('11'.repeat(32));
  const engine = new LiveEngine({ mode: 'devchain', store, chain, keys, meta: new SelfHostedMetadata(store, cfg.publicUrl), images, config: cfg, clock, log: () => {} });
  return { engine, store, chain, keys, advance: (ms: number) => (t += ms), now: clock };
}

async function plant(e: LiveEngine, owner: string, devBuy = 0) {
  const p = await e.preparePlant({ name: 'Great Oak', ticker: 'OAK', image: 'sprite:1', owner, devBuy });
  await e.confirmPlant(p.id, 'devchain');
  for (let i = 0; i < 6; i++) await e.processLaunches();
  return { prepared: p, status: e.plantStatus(p.id)! };
}

/** Every vault must hold at least what the ledger says it owes, plus rent. */
async function solvent(store: Store, chain: FakeChain) {
  for (const c of store.allCoins()) {
    const reserved = store.launchesIn(['reserved']).filter((l) => l.parent_ca === c.ca).reduce((n, l) => n + l.required, 0);
    const bal = await chain.balance(new PublicKey(c.vault_pubkey));
    expect(bal, `${c.ticker} vault`).toBeGreaterThanOrEqual(c.vault_bucket + c.owner_bucket + c.climb_owed + reserved + 890_880);
  }
}

describe('ledger (lamports)', () => {
  it('never creates or loses a lamport', () => {
    for (const fee of [1, 7, 999, 123_456_789]) {
      for (const n of [0, 1, 2, 5, 12]) {
        const s = splitFeeLamports(fee, n, 5000);
        expect(s.vault + s.climb).toBe(fee);
        if (n) expect(s.shares.reduce((a, b) => a + b, 0)).toBe(s.climb);
      }
      const r = receiveSplit(fee);
      expect(r.topup + r.owner).toBe(fee);
    }
    expect(splitClimbLamports(1000, 3)).toEqual([500, 250, 250]);
  });
});

describe('KeyBox', () => {
  it('round-trips and rejects a wrong key', () => {
    const kp = Keypair.generate();
    const sealed = new KeyBox('22'.repeat(32)).seal(kp);
    expect(new KeyBox('22'.repeat(32)).open(sealed).publicKey.equals(kp.publicKey)).toBe(true);
    expect(() => new KeyBox('33'.repeat(32)).open(sealed)).toThrow();
  });
});

describe('live engine on the fake chain', () => {
  it('plants a root: payment → create → dev-buy tokens to the planter', async () => {
    const { engine, chain, store } = setup();
    const owner = Keypair.generate().publicKey.toBase58();
    const { prepared, status } = await plant(engine, owner, 0.5);
    expect(status.state).toBe('done');
    const coin = store.coin(status.ca!)!;
    expect(coin.depth).toBe(1);
    expect(coin.owner_wallet).toBe(owner);
    expect(engine.hub.world.coins[coin.ca].ticker).toBe('OAK');
    expect(chain.mints.get(coin.ca)!.tokens.get(owner)).toBeGreaterThan(0); // tokens forwarded
    expect(chain.mints.get(coin.ca)!.creator).toBe(coin.vault_pubkey); // the vault is the creator
    const bal = await chain.balance(new PublicKey(coin.vault_pubkey));
    expect(bal).toBe(prepared.total * SOL - FAKE_CREATE_RENT - 0.5 * SOL - 2 * chain.txFee);
    expect(engine.hub.events.at(-1)!.kind).toBe('sprout');
    await solvent(store, chain);
  });

  it('collects fees, splits them up the path, sprouts children and pays owners', async () => {
    const { engine, chain, store, advance } = setup();
    const owner = Keypair.generate().publicKey.toBase58();
    const { status } = await plant(engine, owner);
    const root = status.ca!;
    advance(2 * 3_600_000); // past the sprout bonus

    // the root trades until its vault can launch a child
    chain.trade(root, 40 * SOL); // 0.12 SOL of creator fees
    await engine.feeCycle();
    let r = store.coin(root)!;
    const net = 0.12 * SOL - chain.txFee;
    expect(r.fees_earned).toBe(net);
    expect(r.owner_bucket).toBe(net - Math.floor(net / 2)); // planter's half
    expect(store.launchesIn(['reserved']).length).toBe(1); // vault ≥ 0.05: a child is queued
    for (let i = 0; i < 6; i++) await engine.processLaunches();
    const child = store.allCoins().find((c) => c.parent_ca === root)!;
    expect(child.depth).toBe(2);
    expect(child.image).toContain('/api/media/');
    r = store.coin(root)!;
    expect(r.vault_bucket).toBe(Math.floor(net / 2) - 0.05 * SOL);
    await solvent(store, chain);

    // the child (fresh: sprout bonus, keeps 75%) trades; 25% climbs to the root on-chain
    const rootBalBefore = await chain.balance(new PublicKey(r.vault_pubkey));
    chain.trade(child.ca, 10 * SOL); // 0.03 SOL fees
    await engine.feeCycle();
    const cnet = 0.03 * SOL - chain.txFee;
    const climb = cnet - Math.floor((cnet * 7500) / 10_000);
    const c2 = store.coin(child.ca)!;
    expect(c2.fees_sent_up).toBe(climb);
    expect(c2.climb_owed).toBe(0);
    const r2 = store.coin(root)!;
    expect(r2.fees_received).toBe(climb);
    expect(await chain.balance(new PublicKey(r.vault_pubkey))).toBe(rootBalBefore + climb);
    const ev = engine.hub.events.filter((e) => e.kind === 'climb').at(-1)!;
    expect(ev.path).toEqual([root]);
    expect(ev.bonus).toBe(true);
    await solvent(store, chain);

    // the planter claims everything owed to it
    const before = await chain.balance(new PublicKey(owner));
    const res = await engine.claim(owner, '');
    expect(res.amount * SOL).toBeCloseTo(r2.owner_bucket, -1);
    expect(await chain.balance(new PublicKey(owner))).toBe(before + r2.owner_bucket);
    expect(store.coin(root)!.owner_bucket).toBe(0);
    await solvent(store, chain);
  });

  it('a cancelled payment frees the slot; a paid one cannot be cancelled', async () => {
    const { engine, chain } = setup();
    const owner = Keypair.generate().publicKey.toBase58();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await engine.preparePlant({ name: 'Oak Tree', ticker: 'OAK', image: 'sprite:1', owner, devBuy: 0 })).id);
    await expect(engine.preparePlant({ name: 'Oak Tree', ticker: 'OAK', image: 'sprite:1', owner, devBuy: 0 })).rejects.toThrow(/waiting for payment/);
    expect((await engine.cancelPlant(ids[0]))!.state).toBe('expired');
    await engine.preparePlant({ name: 'Oak Tree', ticker: 'OAK', image: 'sprite:1', owner, devBuy: 0 }); // slot is free again

    // money already arrived: cancel must not abandon it
    const paid = await engine.preparePlant({ name: 'Paid Oak', ticker: 'PAID', image: 'sprite:1', owner: Keypair.generate().publicKey.toBase58(), devBuy: 0 });
    chain.pay(new PublicKey(paid.payTo!), paid.lamports!);
    expect((await engine.cancelPlant(paid.id))!.state).toBe('awaiting_payment');
    for (let i = 0; i < 4; i++) await engine.processLaunches();
    expect(engine.plantStatus(paid.id)!.state).toBe('done');
  });

  it('measures what a launch really cost', async () => {
    const { engine, chain } = setup();
    await plant(engine, Keypair.generate().publicKey.toBase58(), 0.3);
    // rent + one create transaction fee; the dev buy is not counted
    expect(engine.config().observedLaunchCost! * SOL).toBe(FAKE_CREATE_RENT + chain.txFee);
  });

  it('a lost transaction changes nothing and is retried', async () => {
    const { engine, chain, store, advance } = setup();
    const { status } = await plant(engine, Keypair.generate().publicKey.toBase58());
    advance(2 * 3_600_000);
    chain.trade(status.ca!, 5 * SOL);
    chain.faults.dropNextSubmit = true;
    await engine.feeCycle();
    expect(store.coin(status.ca!)!.fees_earned).toBe(0);
    await engine.feeCycle();
    expect(store.coin(status.ca!)!.fees_earned).toBe(0.015 * SOL - chain.txFee);
  });

  it('after a crash, a landed transaction is applied exactly once', async () => {
    const store = new Store(':memory:');
    const chain = new FakeChain();
    const a = setup(store, chain);
    const { status } = await plant(a.engine, Keypair.generate().publicKey.toBase58());
    a.advance(2 * 3_600_000);
    chain.trade(status.ca!, 5 * SOL);
    // the collect lands, but the process "dies" before it sees the confirmation
    const real = chain.confirm.bind(chain);
    chain.confirm = async () => 'pending' as TxOutcome;
    await a.engine.feeCycle();
    chain.confirm = real;
    expect(store.coin(status.ca!)!.fees_earned).toBe(0);
    expect(store.openIntents().length).toBe(1);

    // a new process on the same database recovers it
    const b = setup(store, chain);
    await b.engine.recover();
    await b.engine.recover();
    expect(store.coin(status.ca!)!.fees_earned).toBe(0.015 * SOL - chain.txFee);
    expect(store.openIntents().length).toBe(0);
  });

  it('refunds the planter when a launch keeps failing', async () => {
    const { engine, chain, store } = setup();
    const owner = Keypair.generate().publicKey.toBase58();
    const p = await engine.preparePlant({ name: 'Bad Seed', ticker: 'BAD', image: 'sprite:2', owner, devBuy: 0 });
    await engine.confirmPlant(p.id, 'devchain');
    const realBuild = chain.buildCreate.bind(chain);
    chain.buildCreate = async (x) => {
      chain.faults.failNextApply = true;
      return realBuild(x);
    };
    for (let i = 0; i < 8; i++) await engine.processLaunches();
    expect(engine.plantStatus(p.id)!.state).toBe('refunded');
    const refunded = await chain.balance(new PublicKey(owner));
    // paid in, minus three failed attempts' fees, minus the refund tx fee
    expect(refunded).toBe(p.total * SOL - 4 * chain.txFee);
    expect(store.allCoins().length).toBe(0);
  });

  it('dormant coins flush their vault upward, die, and revive on a trade', async () => {
    const { engine, chain, store, advance } = setup();
    const { status } = await plant(engine, Keypair.generate().publicKey.toBase58());
    const root = status.ca!;
    advance(2 * 3_600_000);
    chain.trade(root, 40 * SOL);
    await engine.feeCycle();
    for (let i = 0; i < 6; i++) await engine.processLaunches();
    const child = store.allCoins().find((c) => c.parent_ca === root)!;
    advance(2 * 3_600_000);
    chain.trade(child.ca, 10 * SOL);
    await engine.feeCycle(); // child now has a vault bucket
    const vb = store.coin(child.ca)!.vault_bucket;
    expect(vb).toBeGreaterThan(0);

    advance(cfg.dormancyMs + 60_000);
    chain.activity.set(root, chain.clock()); // the root is still trading
    await engine.dormancy();
    const dead = store.coin(child.ca)!;
    expect(dead.alive).toBe(0);
    expect(dead.vault_bucket).toBe(0);
    expect(engine.hub.events.some((e) => e.kind === 'climb' && e.flush && e.coinCa === child.ca)).toBe(true);
    expect(engine.hub.events.at(-1)!.kind).toBe('death');
    await solvent(store, chain);

    engine.onTrade({ mint: child.ca, sol: 1 });
    expect(store.coin(child.ca)!.alive).toBe(1);
    expect(store.coin(child.ca)!.revivals).toBe(1);
  });

  it('stays solvent through hundreds of random trades and many generations', async () => {
    const { engine, chain, store, advance } = setup();
    const owners = [0, 1].map(() => Keypair.generate().publicKey.toBase58());
    for (const o of owners) await plant(engine, o);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let round = 0; round < 60; round++) {
      advance(10 * 60_000);
      const coins = store.allCoins();
      for (let k = 0; k < 8; k++) chain.trade(coins[Math.floor(rnd() * coins.length)].ca, Math.round((0.5 + rnd() * 8) * SOL));
      await engine.feeCycle();
      await engine.processLaunches();
      await engine.processLaunches();
      if (round % 15 === 0) for (const o of owners) await engine.claim(o, '');
    }
    const all = store.allCoins();
    expect(all.length).toBeGreaterThan(6);
    expect(Math.max(...all.map((c) => c.depth))).toBeGreaterThanOrEqual(3);
    expect(store.openIntents().length).toBe(0);
    await solvent(store, chain);
    // what the ledger says was sent up is what ancestors say they received
    const sent = all.reduce((n, c) => n + c.fees_sent_up, 0);
    const recv = all.reduce((n, c) => n + c.fees_received, 0);
    expect(sent).toBe(recv);
  });
});
