import 'server-only';

export interface Trade {
  mint: string;
  sol: number;
  trader?: string;
  isBuy?: boolean;
  sig?: string;
}

/**
 * Real-time trades from PumpPortal's free data websocket
 * (wss://pumpportal.fun/api/data, method subscribeTokenTrade). Only used for
 * the live ticker and fast revival; fee accounting never depends on it, and
 * dormancy is double-checked against the chain before a coin is killed.
 */
export class PumpPortalFeed {
  private ws: WebSocket | null = null;
  private keys = new Set<string>();
  private closed = false;
  private backoff = 1000;

  constructor(private onTrade: (t: Trade) => void, private log: (m: string) => void, private url = 'wss://pumpportal.fun/api/data') {}

  start(mints: string[]) {
    mints.forEach((m) => this.keys.add(m));
    this.connect();
  }

  watch(mint: string) {
    if (this.keys.has(mint)) return;
    this.keys.add(mint);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }));
  }

  stop() {
    this.closed = true;
    this.ws?.close();
  }

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 1000;
      this.log('trade feed connected');
      const all = [...this.keys];
      for (let i = 0; i < all.length; i += 100) ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: all.slice(i, i + 100) }));
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (!m.mint || typeof m.solAmount !== 'number' || !this.keys.has(m.mint)) return;
        this.onTrade({ mint: m.mint, sol: m.solAmount, trader: m.traderPublicKey, isBuy: m.txType === 'buy', sig: m.signature });
      } catch {}
    };
    ws.onclose = () => {
      if (this.closed) return;
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(60_000, this.backoff * 2);
    };
    ws.onerror = () => ws.close();
  }
}
