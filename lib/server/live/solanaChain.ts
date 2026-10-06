import 'server-only';
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Keypair,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import {
  OnlinePumpSdk,
  PUMP_SDK,
  bondingCurvePda,
  canonicalPumpPoolPda,
  getBuyTokenAmountFromSolAmount,
} from '@pump-fun/pump-sdk';
import BN from 'bn.js';
import bs58 from 'bs58';
import type { Chain, CreateCoinParams, SignedTx, Transfer, TxOutcome } from './chain';

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const memoIx = (text: string, signer?: PublicKey) =>
  new TransactionInstruction({ programId: MEMO_PROGRAM, keys: signer ? [{ pubkey: signer, isSigner: true, isWritable: false }] : [], data: Buffer.from(text, 'utf8') });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SolanaChainOptions {
  rpcUrl: string;
  cluster: string;
  /** micro-lamports per compute unit */
  priorityMicroLamports: number;
  /** Max slippage on the dev buy, in basis points. */
  devBuySlippageBps: number;
}

/**
 * Solana mainnet + pump.fun via the official @pump-fun/pump-sdk. Every
 * transaction is built and signed here, so its signature is known (and
 * written to the intents log) before it is broadcast.
 */
export class SolanaChain implements Chain {
  readonly kind = 'solana' as const;
  readonly cluster: string;
  readonly txFee: number;
  private conn: Connection;
  private pump: OnlinePumpSdk;

  constructor(private o: SolanaChainOptions) {
    this.cluster = o.cluster;
    this.conn = new Connection(o.rpcUrl, { commitment: 'confirmed' });
    this.pump = new OnlinePumpSdk(this.conn);
    // 5000 base + priority on ~200k CU
    this.txFee = 5000 + Math.ceil((o.priorityMicroLamports * 200_000) / 1_000_000);
  }

  async balance(pk: PublicKey) {
    return this.conn.getBalance(pk, 'confirmed');
  }

  async pendingCreatorFees(creator: PublicKey) {
    const b = await this.pump.getCreatorVaultBalanceBothPrograms(creator);
    return b.toNumber();
  }

  async mintExists(mint: PublicKey) {
    return (await this.conn.getAccountInfo(mint, 'confirmed')) !== null;
  }

  async lastActivity(mint: PublicKey) {
    // trades touch the bonding curve; after graduation, the PumpSwap pool
    let best: number | null = null;
    for (const acct of [bondingCurvePda(mint), canonicalPumpPoolPda(mint)]) {
      const sigs = await this.conn.getSignaturesForAddress(acct, { limit: 1 }, 'confirmed').catch(() => []);
      const t = sigs[0]?.blockTime;
      if (t && (!best || t * 1000 > best)) best = t * 1000;
    }
    return best;
  }

  private async sign(payer: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = [], cu = 200_000): Promise<SignedTx> {
    const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash('confirmed');
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: cu }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.o.priorityMicroLamports }),
        ...ixs,
      ],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer, ...extra]);
    return { signature: bs58.encode(tx.signatures[0]), lastValidBlockHeight, raw: tx.serialize() };
  }

  async buildCollect(creator: Keypair) {
    // payer === creator, so the SDK also closes the WSOL account PumpSwap pays into (unwrapping it)
    const ixs = await this.pump.collectCoinCreatorFeeInstructions(creator.publicKey, creator.publicKey);
    return this.sign(creator, ixs, [], 150_000);
  }

  async buildTransfer(from: Keypair, outs: Transfer[], memo?: string) {
    const ixs = outs.map((o) => SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: o.to, lamports: o.lamports }));
    if (memo) ixs.push(memoIx(memo, from.publicKey));
    return this.sign(from, ixs, [], 20_000 + outs.length * 2_000);
  }

  async buildCreate(p: CreateCoinParams) {
    let ixs: TransactionInstruction[];
    if (p.devBuyLamports > 0) {
      const global = await this.pump.fetchGlobal();
      const feeConfig = await this.pump.fetchFeeConfig();
      const solAmount = new BN(p.devBuyLamports);
      const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT });
      ixs = await PUMP_SDK.createV2AndBuyInstructions({
        global,
        mint: p.mint.publicKey,
        name: p.name,
        symbol: p.symbol,
        uri: p.uri,
        creator: p.creator.publicKey,
        user: p.creator.publicKey,
        amount,
        // max SOL the buy may spend, slippage included
        solAmount: solAmount.muln(10_000 + this.o.devBuySlippageBps).divn(10_000),
        mayhemMode: false,
      });
    } else {
      ixs = [
        await PUMP_SDK.createV2Instruction({
          mint: p.mint.publicKey,
          name: p.name,
          symbol: p.symbol,
          uri: p.uri,
          creator: p.creator.publicKey,
          user: p.creator.publicKey,
          mayhemMode: false,
        }),
      ];
    }
    return this.sign(p.creator, ixs, [p.mint], 400_000);
  }

  async buildSendTokens(from: Keypair, mint: PublicKey, to: PublicKey) {
    const info = await this.conn.getAccountInfo(mint, 'confirmed');
    if (!info) return null;
    const program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const decimals = unpackMint(mint, info, program).decimals;
    const src = getAssociatedTokenAddressSync(mint, from.publicKey, true, program);
    const bal = await this.conn.getTokenAccountBalance(src, 'confirmed').catch(() => null);
    const amount = bal ? BigInt(bal.value.amount) : 0n;
    if (amount === 0n) return null;
    const dst = getAssociatedTokenAddressSync(mint, to, true, program);
    return this.sign(
      from,
      [
        createAssociatedTokenAccountIdempotentInstruction(from.publicKey, dst, to, mint, program),
        createTransferCheckedInstruction(src, mint, dst, from.publicKey, amount, decimals, [], program),
      ],
      [],
      80_000,
    );
  }

  async submit(tx: SignedTx) {
    if (!tx.raw) throw new Error('unsigned');
    await this.conn.sendRawTransaction(tx.raw, { skipPreflight: false, maxRetries: 0, preflightCommitment: 'confirmed' });
  }

  async status(signature: string, lastValidBlockHeight: number): Promise<TxOutcome> {
    const st = (await this.conn.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return st.err ? 'failed' : 'landed';
    const height = await this.conn.getBlockHeight('confirmed');
    return height > lastValidBlockHeight ? 'expired' : 'pending';
  }

  async confirm(tx: SignedTx, timeoutMs = 90_000): Promise<TxOutcome> {
    const start = Date.now();
    let lastSend = Date.now();
    while (Date.now() - start < timeoutMs) {
      const s = await this.status(tx.signature, tx.lastValidBlockHeight).catch(() => 'pending' as const);
      if (s !== 'pending') {
        // "expired" is only final once a last look shows it never landed
        if (s === 'expired') return this.status(tx.signature, tx.lastValidBlockHeight);
        return s;
      }
      if (tx.raw && Date.now() - lastSend > 2500) {
        lastSend = Date.now();
        this.conn.sendRawTransaction(tx.raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
      }
      await sleep(1500);
    }
    return 'pending';
  }

  async balanceDelta(signature: string, account: PublicKey) {
    for (let i = 0; i < 5; i++) {
      const t = await this.conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (t?.meta) {
        const keys = t.transaction.message.getAccountKeys({ accountKeysFromLookups: t.meta.loadedAddresses });
        for (let k = 0; k < keys.length; k++) if (keys.get(k)?.equals(account)) return t.meta.postBalances[k] - t.meta.preBalances[k];
        return 0;
      }
      await sleep(1000);
    }
    throw new Error(`transaction ${signature} not found`);
  }

  async buildPaymentTx(p: { from: PublicKey; to: PublicKey; lamports: number; memo: string }) {
    const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: p.from, blockhash, lastValidBlockHeight });
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.o.priorityMicroLamports }),
      SystemProgram.transfer({ fromPubkey: p.from, toPubkey: p.to, lamports: p.lamports }),
      memoIx(p.memo),
    );
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  }
}
