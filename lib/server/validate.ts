import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { UserError, type PlantRequest } from './engine';

export const MAX_DEV_BUY = Number(process.env.MAX_DEV_BUY_SOL ?? 5);

export function isPubkey(s: string) {
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes()) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  } catch {
    return false;
  }
}

export function validatePlant(body: unknown): PlantRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = String(b.name ?? '').trim().slice(0, 32);
  const ticker = String(b.ticker ?? '').toUpperCase();
  const owner = String(b.owner ?? '');
  const image = String(b.image ?? '');
  const devBuy = Number(b.devBuy ?? 0);
  if (name.length < 2) throw new UserError('Name needs at least 2 characters');
  if (!/^[A-Z0-9_]{2,10}$/.test(ticker)) throw new UserError('Ticker: 2–10 of A–Z, 0–9, _');
  if (!isPubkey(owner)) throw new UserError('Invalid wallet address');
  if (!(image.startsWith('sprite:') || /^data:image\/(png|jpeg|gif|webp);base64,/.test(image)) || image.length > 600_000)
    throw new UserError('Image must be a PNG, JPEG, GIF or WEBP under ~400 KB');
  if (!Number.isFinite(devBuy) || devBuy < 0 || devBuy > MAX_DEV_BUY) throw new UserError(`Dev buy must be between 0 and ${MAX_DEV_BUY} SOL`);
  return {
    name,
    ticker,
    image,
    owner,
    devBuy: Math.round(devBuy * 1e9) / 1e9,
    description: b.description ? String(b.description).trim().slice(0, 280) : undefined,
    telegram: b.telegram ? String(b.telegram).trim().slice(0, 80) : undefined,
  };
}
