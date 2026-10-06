import 'server-only';
import type { Keypair, PublicKey } from '@solana/web3.js';

/** A fully signed transaction, not yet broadcast. Its signature is known before sending. */
export interface SignedTx {
  signature: string;
  lastValidBlockHeight: number;
  /** Serialized bytes (Solana) or an opaque handle (fake chain). */
  raw: Uint8Array | null;
  /** Fake chain only: the state change this tx performs when it lands. */
  apply?: () => void;
}

export type TxOutcome = 'landed' | 'failed' | 'expired' | 'pending';

export interface Transfer {
  to: PublicKey;
  lamports: number;
}

export interface CreateCoinParams {
  creator: Keypair;
  mint: Keypair;
  name: string;
  symbol: string;
  uri: string;
  devBuyLamports: number;
}

/**
 * Everything the engine needs from Solana + pump.fun. The real implementation
 * (solanaChain.ts) uses @pump-fun/pump-sdk; fakeChain.ts keeps an in-memory
 * ledger so the whole engine can be tested and demoed without spending SOL.
 */
export interface Chain {
  readonly kind: 'solana' | 'fake';
  readonly cluster: string;
  /** Typical lamports one of our transactions costs (base fee + priority fee). */
  readonly txFee: number;

  balance(pk: PublicKey): Promise<number>;
  /** Creator fees waiting for `creator` on pump.fun (bonding curve + PumpSwap). */
  pendingCreatorFees(creator: PublicKey): Promise<number>;
  mintExists(mint: PublicKey): Promise<boolean>;
  /** ms timestamp of the coin's latest on-chain trade, if known. */
  lastActivity(mint: PublicKey): Promise<number | null>;

  buildCollect(creator: Keypair): Promise<SignedTx>;
  buildTransfer(from: Keypair, outs: Transfer[], memo?: string): Promise<SignedTx>;
  buildCreate(p: CreateCoinParams): Promise<SignedTx>;
  /** Move all of `from`'s tokens of `mint` to `to` (creating its token account). null if there are none. */
  buildSendTokens(from: Keypair, mint: PublicKey, to: PublicKey): Promise<SignedTx | null>;

  submit(tx: SignedTx): Promise<void>;
  /** Wait until the transaction lands, fails, or its blockhash expires. Rebroadcasts while pending. */
  confirm(tx: SignedTx, timeoutMs?: number): Promise<TxOutcome>;
  /** Status of an already-sent transaction, for crash recovery. */
  status(signature: string, lastValidBlockHeight: number): Promise<TxOutcome>;
  /** Lamport change of `account` caused by a landed transaction (post - pre). */
  balanceDelta(signature: string, account: PublicKey): Promise<number>;

  /** Unsigned transfer from a user's wallet, for the browser wallet to sign. Base64. */
  buildPaymentTx(p: { from: PublicKey; to: PublicKey; lamports: number; memo: string }): Promise<string>;
}
