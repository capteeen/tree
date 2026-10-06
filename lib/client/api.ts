'use client';
import { api } from '@/lib/apiBase';
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

/**
 * Plant a root:
 *  1. the server uploads metadata and creates the root's vault, returning a payment tx
 *  2. the wallet signs and sends it (live) — devchain/sim skip this
 *  3. the server confirms payment and launches on pump.fun with the vault as creator
 */
export async function plantFlow(
  input: PlantRequest,
  opts: { sendTx?: (base64: string) => Promise<string>; onStep?: (s: PlantStep, p?: PreparedPlant) => void },
): Promise<string> {
  opts.onStep?.('preparing');
  const prepared = await call<PreparedPlant>('/api/plant/prepare', input);
  let signature: string | undefined;
  if (prepared.mode === 'live') {
    if (!prepared.tx || !opts.sendTx) throw new Error('A wallet is needed to pay for the launch');
    opts.onStep?.('sign', prepared);
    signature = await opts.sendTx(prepared.tx);
  } else if (prepared.mode === 'devchain') signature = 'devchain';
  opts.onStep?.('paying', prepared);
  let st = await call<PlantStatus>('/api/plant/confirm', { id: prepared.id, signature });
  opts.onStep?.('launching', prepared);
  const started = Date.now();
  while (st.state !== 'done') {
    if (st.state === 'failed' || st.state === 'refunded' || st.state === 'expired') {
      throw new Error(st.state === 'refunded' ? 'The launch failed and your SOL was refunded.' : st.error || `Launch ${st.state}`);
    }
    if (Date.now() - started > 5 * 60_000) throw new Error(`Still working on it. Check back on your page (launch ${prepared.id}).`);
    await new Promise((r) => setTimeout(r, 1500));
    st = await call<PlantStatus>(`/api/plant/status?id=${encodeURIComponent(prepared.id)}`);
  }
  opts.onStep?.('done', prepared);
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
