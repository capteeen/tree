import 'server-only';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { randomBytes } from 'node:crypto';
import type { Chain, CreateCoinParams, SignedTx, Transfer, TxOutcome } from './chain';

const RENT_EXEMPT = 890_880;
/** Lamports a pump.fun create costs in rent (mint, curve, metadata, ATAs). */
export const FAKE_CREATE_RENT = 18_000_000;

interface FakeTx {
  outcome: TxOutcome;
  deltas: Map<string, number>;
}

/**
 * In-memory Solana + pump.fun. Balances, creator-fee vaults, mints and token
 * balances behave like the real thing closely enough to exercise every engine
 * path: insufficient funds fail, fees are charged per transaction, creator fees
 * accrue per *creator* (as on pump.fun), and failure modes can be injected.
 */
export class FakeChain implements Chain {
  readonly kind = 'fake' as const;
  readonly cluster = 'fake';
  readonly txFee = 10_000;

  balances = new Map<string, number>();
  creatorFees = new Map<string, number>();
  mints = new Map<string, { creator: string; tokens: Map<string, number> }>();
  activity = new Map<string, number>();
  private txs = new Map<string, FakeTx>();
  private height = 1000;
  clock = () => Date.now();

  /** Failure injection for tests. */
  faults = { dropNextSubmit: false, failNextApply: false, throwOnSubmit: false };

  private bal(pk: string) {
    return this.balances.get(pk) ?? 0;
  }
  private add(pk: string, l: number, deltas?: Map<string, number>) {
    this.balances.set(pk, this.bal(pk) + l);
    deltas?.set(pk, (deltas.get(pk) ?? 0) + l);
  }

  airdrop(pk: PublicKey, l: number) {
    this.add(pk.toBase58(), l);
  }

  /** A market trade on a coin: accrues its creator fee (0.30% like pump.fun's first tier). */
  trade(mint: string, solLamports: number) {
    const m = this.mints.get(mint);
    if (!m) return;
    const fee = Math.floor(solLamports * 0.003);
    this.creatorFees.set(m.creator, (this.creatorFees.get(m.creator) ?? 0) + fee);
    this.activity.set(mint, this.clock());
  }

  async balance(pk: PublicKey) {
    return this.bal(pk.toBase58());
  }
  async pendingCreatorFees(creator: PublicKey) {
    return this.creatorFees.get(creator.toBase58()) ?? 0;
  }
  async mintExists(mint: PublicKey) {
    return this.mints.has(mint.toBase58());
  }
  async lastActivity(mint: PublicKey) {
    return this.activity.get(mint.toBase58()) ?? null;
  }

  private sign(payer: Keypair, effect: (d: Map<string, number>) => void): SignedTx {
    const signature = bs58.encode(randomBytes(64));
    const lastValidBlockHeight = this.height + 150;
    return {
      signature,
      lastValidBlockHeight,
      raw: null,
      apply: () => {
        if (this.txs.has(signature)) return; // a signature can only land once
        const d = new Map<string, number>();
        const snapshot = new Map(this.balances);
        const fees = new Map(this.creatorFees);
        try {
          if (this.faults.failNextApply) {
            this.faults.failNextApply = false;
            throw new Error('injected failure');
          }
          const p = payer.publicKey.toBase58();
          if (this.bal(p) < this.txFee) throw new Error('insufficient funds for fee');
          this.add(p, -this.txFee, d);
          effect(d);
          for (const [k, v] of this.balances) if (v < 0) throw new Error(`insufficient funds: ${k}`);
          for (const [k, v] of this.balances) if (v > 0 && v < RENT_EXEMPT && d.has(k)) throw new Error(`rent: ${k}`);
          this.txs.set(signature, { outcome: 'landed', deltas: d });
        } catch {
          // a failed tx still charges its fee, like Solana
          this.balances = snapshot;
          this.creatorFees = fees;
          const fd = new Map<string, number>();
          if (this.bal(payer.publicKey.toBase58()) >= this.txFee) this.add(payer.publicKey.toBase58(), -this.txFee, fd);
          this.txs.set(signature, { outcome: 'failed', deltas: fd });
        }
      },
    };
  }

  async buildCollect(creator: Keypair) {
    return this.sign(creator, (d) => {
      const k = creator.publicKey.toBase58();
      const fees = this.creatorFees.get(k) ?? 0;
      this.creatorFees.set(k, 0);
      this.add(k, fees, d);
    });
  }

  async buildTransfer(from: Keypair, outs: Transfer[]) {
    return this.sign(from, (d) => {
      for (const o of outs) {
        this.add(from.publicKey.toBase58(), -o.lamports, d);
        this.add(o.to.toBase58(), o.lamports, d);
      }
    });
  }

  async buildCreate(p: CreateCoinParams) {
    return this.sign(p.creator, (d) => {
      const mint = p.mint.publicKey.toBase58();
      if (this.mints.has(mint)) throw new Error('mint exists');
      const c = p.creator.publicKey.toBase58();
      this.add(c, -(FAKE_CREATE_RENT + p.devBuyLamports), d);
      const tokens = new Map<string, number>();
      if (p.devBuyLamports > 0) tokens.set(c, Math.floor(p.devBuyLamports * 35)); // ~35 tokens/lamport at launch
      this.mints.set(mint, { creator: c, tokens });
      this.activity.set(mint, this.clock());
    });
  }

  async buildSendTokens(from: Keypair, mint: PublicKey, to: PublicKey) {
    const m = this.mints.get(mint.toBase58());
    const amount = m?.tokens.get(from.publicKey.toBase58()) ?? 0;
    if (!m || amount <= 0) return null;
    return this.sign(from, () => {
      const f = from.publicKey.toBase58();
      const have = m.tokens.get(f) ?? 0;
      m.tokens.set(f, 0);
      m.tokens.set(to.toBase58(), (m.tokens.get(to.toBase58()) ?? 0) + have);
    });
  }

  async submit(tx: SignedTx) {
    if (this.faults.throwOnSubmit) {
      this.faults.throwOnSubmit = false;
      throw new Error('injected: RPC unavailable');
    }
    if (this.faults.dropNextSubmit) {
      this.faults.dropNextSubmit = false;
      return; // lost in flight: never lands
    }
    tx.apply?.();
  }

  async confirm(tx: SignedTx): Promise<TxOutcome> {
    const t = this.txs.get(tx.signature);
    if (t) return t.outcome;
    this.height += 200; // pretend we waited past the blockhash
    return 'expired';
  }

  async status(signature: string, lastValidBlockHeight: number): Promise<TxOutcome> {
    const t = this.txs.get(signature);
    if (t) return t.outcome;
    return this.height > lastValidBlockHeight ? 'expired' : 'pending';
  }

  async balanceDelta(signature: string, account: PublicKey) {
    return this.txs.get(signature)?.deltas.get(account.toBase58()) ?? 0;
  }

  /** Fake-chain stand-in for the user's wallet paying a launch. */
  pay(to: PublicKey, l: number) {
    this.add(to.toBase58(), l);
    return bs58.encode(randomBytes(64));
  }

  advance(blocks = 200) {
    this.height += blocks;
  }
}

export const newKeypair = () => Keypair.generate();
