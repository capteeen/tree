import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Store } from './db';

export interface Media {
  bytes: Buffer;
  mime: string;
}

export interface MetadataInput {
  name: string;
  symbol: string;
  description: string;
  telegram?: string;
  image: Media;
}

/** Where coin images and the pump.fun metadata JSON live. */
export interface MetadataStore {
  put(m: MetadataInput): Promise<{ uri: string; imageUrl: string }>;
  /** Bytes of an image this store (or anyone) serves, for re-badging. */
  load(url: string): Promise<Media>;
}

export function decodeDataUrl(url: string): Media {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(url);
  if (!m) throw new Error('bad data url');
  return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
}

async function fetchMedia(url: string): Promise<Media> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`image fetch ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 5_000_000) throw new Error('image too large');
    return { bytes, mime: r.headers.get('content-type') ?? 'image/png' };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Images and metadata stored in our own database and served from
 * /api/media/:id. Fine for devchain; in production the coin's metadata is only
 * reachable while this site is up, so prefer the pump.fun IPFS store.
 */
export class SelfHostedMetadata implements MetadataStore {
  constructor(private store: Store, private publicUrl: string) {}

  async put(m: MetadataInput) {
    const id = randomBytes(10).toString('hex');
    this.store.putMedia(`${id}.img`, m.image.mime, m.image.bytes);
    const imageUrl = `${this.publicUrl}/api/media/${id}.img`;
    const json = { name: m.name, symbol: m.symbol, description: m.description, image: imageUrl, showName: true, telegram: m.telegram, website: this.publicUrl };
    this.store.putMedia(`${id}.json`, 'application/json', Buffer.from(JSON.stringify(json)));
    return { uri: `${this.publicUrl}/api/media/${id}.json`, imageUrl };
  }

  async load(url: string) {
    const prefix = `${this.publicUrl}/api/media/`;
    if (url.startsWith(prefix)) {
      const m = this.store.media(url.slice(prefix.length));
      if (m) return { bytes: Buffer.from(m.bytes), mime: m.mime };
    }
    return fetchMedia(url);
  }
}

/** pump.fun's own IPFS uploader: what pump.fun's UI itself uses. */
export class PumpFunIpfs implements MetadataStore {
  constructor(private publicUrl: string) {}

  async put(m: MetadataInput) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(m.image.bytes)], { type: m.image.mime }), 'image');
    form.append('name', m.name);
    form.append('symbol', m.symbol);
    form.append('description', m.description);
    form.append('website', this.publicUrl);
    if (m.telegram) form.append('telegram', m.telegram);
    form.append('showName', 'true');
    const r = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: form });
    if (!r.ok) throw new Error(`pump.fun ipfs upload failed: ${r.status}`);
    const j = (await r.json()) as { metadataUri?: string; metadata?: { image?: string } };
    if (!j.metadataUri || !j.metadata?.image) throw new Error('pump.fun ipfs: unexpected response');
    return { uri: j.metadataUri, imageUrl: j.metadata.image };
  }

  load(url: string) {
    return fetchMedia(url);
  }
}

/** Draws coin images: procedural sprites for roots without an upload, and depth badges for children. */
export interface ImageMaker {
  sprite(seed: string): Promise<Media>;
  badge(parent: Media, depth: number): Promise<Media>;
}

/** Renders with next/og (satori + resvg): the same engine as the OG cards. */
export class OgImageMaker implements ImageMaker {
  private async render(node: React.ReactElement) {
    const { ImageResponse } = await import('next/og');
    const { pixelFont } = await import('../../ogFont');
    const font = await pixelFont();
    const res = new ImageResponse(node, { width: 512, height: 512, fonts: font ? [{ name: 'PressStart', data: font, style: 'normal', weight: 400 }] : undefined });
    return { bytes: Buffer.from(await res.arrayBuffer()), mime: 'image/png' };
  }

  async sprite(seed: string) {
    const { spritePixels } = await import('@/components/CoinSprite');
    const px = spritePixels(seed);
    const s = 512 / 10;
    return this.render(
      <div style={{ width: 512, height: 512, display: 'flex', position: 'relative', background: '#2a2420' }}>
        {px.map((p) => (
          <div key={`${p.x},${p.y}`} style={{ position: 'absolute', left: p.x * s, top: p.y * s, width: s + 1, height: s + 1, background: p.c }} />
        ))}
      </div>,
    );
  }

  async badge(parent: Media, depth: number) {
    const src = `data:${parent.mime};base64,${parent.bytes.toString('base64')}`;
    return this.render(
      <div style={{ width: 512, height: 512, display: 'flex', position: 'relative', background: '#2a2420' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={512} height={512} style={{ objectFit: 'cover' }} alt="" />
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            display: 'flex',
            background: '#f5a623',
            color: '#1b1815',
            fontSize: 64,
            padding: '14px 16px 10px',
            border: '8px solid #1b1815',
            fontFamily: 'PressStart, monospace',
          }}
        >
          {`D${depth}`}
        </div>
      </div>,
    );
  }
}
