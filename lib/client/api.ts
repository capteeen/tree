'use client';
import { api } from '@/lib/apiBase';
import { fmtSol } from '@/lib/format';
import type { PlantRequest, PlantStatus, PreparedPlant, PublicConfig } from '@/lib/server/engine';

export type { PlantRequest, PlantStatus, PreparedPlant, PublicConfig };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(api(path), body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `request failed (${r.status})`);
  return j as T;
}

export const getConfig = () => call<PublicConfig>('/api/config');

export type PlantStep = 'preparing' | 'sign' | 'paying' | 'launching' | 'done';

// ---- a launch in progress survives a page refresh
export interface PendingLaunch {
  id: string;
  ticker: string;
  at: number;
}
const PENDING_KEY = 'tree.pendingLaunch';
export function pendingLaunch(): PendingLaunch | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingLaunch | null;
    if (p && Date.now() - p.at < 2 * 3_600_000) return p;
    localStorage.removeItem(PENDING_KEY);
  } catch {}
  return null;
}
const savePending = (p: PendingLaunch) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {}
};
export const clearPending = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
};

const cancel = (id: string) => call<PlantStatus>('/api/plant/cancel', { id }).catch(() => null);

/** Network fee headroom for the payment transaction itself (lamports). */
const PAYMENT_FEE = 15_000;

export interface PlantOptions {
  /** Build, sign and send the transfer with the connected wallet. Returns the signature. */
  pay?: (p: { to: string; lamports: number; memo: string }) => Promise<string>;
  /** The wallet's SOL balance in lamports, or null if it can't be read. */
  balance?: () => Promise<number | null>;
  onStep?: (s: PlantStep, p?: PreparedPlant) => void;
}

/**
 * Plant a root:
 *  1. the server uploads the image + metadata and creates the root's vault
 *  2. (live) the wallet pays the vault: the browser builds the transfer itself,
 *     so its blockhash is fresh however long the user takes to approve
 *  3. the server sees the payment and launches on pump.fun with the vault as creator
 */
export async function plantFlow(input: PlantRequest, opts: PlantOptions): Promise<string> {
  opts.onStep?.('preparing');
  const prepared = await call<PreparedPlant>('/api/plant/prepare', input);
  savePending({ id: prepared.id, ticker: input.ticker, at: Date.now() });
  let signature: string | undefined;
  if (prepared.mode === 'live') {
    if (!opts.pay || !prepared.payTo || !prepared.lamports || !prepared.memo) throw new Error('A wallet is needed to pay for the launch');
    const need = prepared.lamports + PAYMENT_FEE;
    const bal = opts.balance ? await opts.balance().catch(() => null) : null;
    if (bal !== null && bal < need) {
      await cancel(prepared.id);
      clearPending();
      throw new Error(`This wallet has ${fmtSol(bal / 1e9)} SOL; the launch needs ${fmtSol(need / 1e9)} SOL. Lower the dev buy or top up.`);
    }
    opts.onStep?.('sign', prepared);
    try {
      signature = await opts.pay({ to: prepared.payTo, lamports: prepared.lamports, memo: prepared.memo });
    } catch (e) {
      await cancel(prepared.id); // frees the slot only if nothing was paid
      clearPending();
      throw e;
    }
  } else if (prepared.mode === 'devchain') signature = 'devchain';
  opts.onStep?.('paying', prepared);
  const st = await call<PlantStatus>('/api/plant/confirm', { id: prepared.id, signature });
  return waitForLaunch(prepared.id, opts.onStep, st, prepared);
}

/** Follow a launch until its coin exists. Also used to resume after a refresh. */
export async function waitForLaunch(id: string, onStep?: PlantOptions['onStep'], first?: PlantStatus, prepared?: PreparedPlant): Promise<string> {
  let st = first ?? (await call<PlantStatus>(`/api/plant/status?id=${encodeURIComponent(id)}`));
  if (st.state === 'awaiting_payment') {
    // resumed before the server saw the payment: let it look once more
    onStep?.('paying', prepared);
    st = await call<PlantStatus>('/api/plant/confirm', { id });
    if (st.state === 'awaiting_payment') {
      await cancel(id);
      clearPending();
      throw new Error('No payment arrived for this launch, so nothing was charged. You can plant again.');
    }
  }
  onStep?.('launching', prepared);
  const started = Date.now();
  while (st.state !== 'done') {
    if (st.state === 'failed' || st.state === 'refunded' || st.state === 'expired') {
      clearPending();
      if (st.state === 'refunded') throw new Error('The launch failed and your SOL was refunded to your wallet.');
      if (st.state === 'expired' && st.error === 'cancelled') throw new Error('Launch cancelled. Nothing was charged.');
      throw new Error(st.error ? `Launch failed: ${st.error}. Any SOL you paid will be refunded.` : `Launch ${st.state}`);
    }
    if (Date.now() - started > 5 * 60_000) throw new Error('Still launching. It keeps going in the background: reopen this page to follow it.');
    await new Promise((r) => setTimeout(r, 1500));
    st = await call<PlantStatus>(`/api/plant/status?id=${encodeURIComponent(id)}`);
  }
  clearPending();
  onStep?.('done', prepared);
  return st.ca!;
}

/** Claim everything a wallet's coins received from below. Live mode proves ownership with a signed message. */
export async function claimFlow(wallet: string, signMessage?: (msg: Uint8Array) => Promise<Uint8Array>, needsSignature = false) {
  const { message } = await call<{ message: string }>('/api/claim/challenge', { wallet });
  let signature: string | undefined;
  if (needsSignature) {
    if (!signMessage) throw new Error('This wallet cannot sign messages');
    const bs58 = (await import('bs58')).default;
    signature = bs58.encode(await signMessage(new TextEncoder().encode(message)));
  }
  return call<{ amount: number; signatures: string[] }>('/api/claim', { wallet, message, signature });
}
