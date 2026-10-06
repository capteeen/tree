import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * All amounts are integer lamports. A coin's vault wallet holds
 *   vault_bucket (funds its next child) + owner_bucket (claimable by its owner)
 *   + a float for rent and transaction fees (= on-chain balance - buckets).
 */
export interface CoinRow {
  ca: string;
  name: string;
  ticker: string;
  image: string;
  description: string | null;
  telegram: string | null;
  root_ca: string;
  parent_ca: string | null;
  depth: number;
  child_index: number;
  vault_pubkey: string;
  vault_secret: string;
  launch_threshold: number;
  fees_earned: number;
  fees_sent_up: number;
  fees_received: number;
  vault_bucket: number;
  owner_bucket: number;
  /** collected lamports owed to ancestors, not yet transferred */
  climb_owed: number;
  owner_earned: number;
  claimed: number;
  trades: number;
  born_at: number;
  last_trade_at: number;
  died_at: number | null;
  alive: number;
  revivals: number;
  owner_wallet: string;
  launch_sig: string | null;
  last_collect_at: number;
}

export type LaunchState = 'awaiting_payment' | 'reserved' | 'funded' | 'created' | 'done' | 'failed' | 'refunded' | 'expired';

export interface LaunchRow {
  id: string;
  kind: 'root' | 'child';
  parent_ca: string | null;
  owner_wallet: string;
  name: string;
  ticker: string;
  description: string | null;
  telegram: string | null;
  image_url: string;
  metadata_uri: string;
  vault_pubkey: string;
  vault_secret: string;
  mint_pubkey: string;
  mint_secret: string;
  required: number;
  dev_buy: number;
  state: LaunchState;
  attempts: number;
  error: string | null;
  payment_sig: string | null;
  created_at: number;
  updated_at: number;
}

export type IntentKind = 'collect' | 'split' | 'fund_child' | 'create' | 'send_tokens' | 'payout' | 'refund';

export interface IntentRow {
  id: number;
  kind: IntentKind;
  ref: string;
  signature: string;
  last_valid_height: number;
  payload: string;
  state: 'sent' | 'landed' | 'failed';
  created_at: number;
}

export interface EventRow {
  id: number;
  json: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coins (
  ca TEXT PRIMARY KEY, name TEXT NOT NULL, ticker TEXT NOT NULL, image TEXT NOT NULL,
  description TEXT, telegram TEXT, root_ca TEXT NOT NULL, parent_ca TEXT, depth INTEGER NOT NULL,
  child_index INTEGER NOT NULL, vault_pubkey TEXT NOT NULL UNIQUE, vault_secret TEXT NOT NULL,
  launch_threshold INTEGER NOT NULL, fees_earned INTEGER NOT NULL DEFAULT 0, fees_sent_up INTEGER NOT NULL DEFAULT 0,
  fees_received INTEGER NOT NULL DEFAULT 0, vault_bucket INTEGER NOT NULL DEFAULT 0, owner_bucket INTEGER NOT NULL DEFAULT 0, climb_owed INTEGER NOT NULL DEFAULT 0,
  owner_earned INTEGER NOT NULL DEFAULT 0, claimed INTEGER NOT NULL DEFAULT 0, trades INTEGER NOT NULL DEFAULT 0,
  born_at INTEGER NOT NULL, last_trade_at INTEGER NOT NULL, died_at INTEGER, alive INTEGER NOT NULL DEFAULT 1,
  revivals INTEGER NOT NULL DEFAULT 0, owner_wallet TEXT NOT NULL, launch_sig TEXT, last_collect_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS coins_root ON coins(root_ca);
CREATE INDEX IF NOT EXISTS coins_owner ON coins(owner_wallet);
CREATE TABLE IF NOT EXISTS launches (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, parent_ca TEXT, owner_wallet TEXT NOT NULL, name TEXT NOT NULL,
  ticker TEXT NOT NULL, description TEXT, telegram TEXT, image_url TEXT NOT NULL, metadata_uri TEXT NOT NULL,
  vault_pubkey TEXT NOT NULL UNIQUE, vault_secret TEXT NOT NULL, mint_pubkey TEXT NOT NULL UNIQUE, mint_secret TEXT NOT NULL,
  required INTEGER NOT NULL, dev_buy INTEGER NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT, payment_sig TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS launches_state ON launches(state);
CREATE TABLE IF NOT EXISTS intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT NOT NULL, signature TEXT NOT NULL UNIQUE,
  last_valid_height INTEGER NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS intents_state ON intents(state);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, coin_ca TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL, created_at INTEGER NOT NULL);
`;

export class Store {
  db: Database.Database;

  /** Injectable clock (tests run on simulated time). */
  clock: () => number = Date.now;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL'); // money: never lose a committed ledger write
    this.db.exec(SCHEMA);
  }

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  getMeta(k: string) {
    return (this.db.prepare('SELECT v FROM meta WHERE k = ?').get(k) as { v: string } | undefined)?.v;
  }
  setMeta(k: string, v: string) {
    this.db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
  }

  // ---- coins
  coin(ca: string) {
    return this.db.prepare('SELECT * FROM coins WHERE ca = ?').get(ca) as CoinRow | undefined;
  }
  coinByVault(pk: string) {
    return this.db.prepare('SELECT * FROM coins WHERE vault_pubkey = ?').get(pk) as CoinRow | undefined;
  }
  allCoins() {
    return this.db.prepare('SELECT * FROM coins ORDER BY born_at').all() as CoinRow[];
  }
  coinsOfOwner(wallet: string) {
    return this.db.prepare('SELECT * FROM coins WHERE owner_wallet = ?').all(wallet) as CoinRow[];
  }
  childCount(ca: string) {
    return (this.db.prepare('SELECT COUNT(*) n FROM coins WHERE parent_ca = ?').get(ca) as { n: number }).n;
  }
  treeSize(root: string) {
    return (this.db.prepare('SELECT COUNT(*) n FROM coins WHERE root_ca = ?').get(root) as { n: number }).n;
  }
  insertCoin(c: CoinRow) {
    const keys = Object.keys(c);
    this.db.prepare(`INSERT INTO coins (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(c);
  }
  updateCoin(ca: string, patch: Partial<CoinRow>) {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    this.db.prepare(`UPDATE coins SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE ca = @ca`).run({ ...patch, ca });
  }
  /** Add (or subtract) lamports to numeric columns atomically. */
  bump(ca: string, deltas: Partial<Record<'fees_earned' | 'fees_sent_up' | 'fees_received' | 'vault_bucket' | 'owner_bucket' | 'climb_owed' | 'owner_earned' | 'claimed' | 'trades', number>>) {
    const keys = Object.keys(deltas);
    if (!keys.length) return;
    this.db.prepare(`UPDATE coins SET ${keys.map((k) => `${k} = ${k} + @${k}`).join(', ')} WHERE ca = @ca`).run({ ...deltas, ca });
  }

  // ---- launches
  launch(id: string) {
    return this.db.prepare('SELECT * FROM launches WHERE id = ?').get(id) as LaunchRow | undefined;
  }
  launchesIn(states: LaunchState[]) {
    return this.db.prepare(`SELECT * FROM launches WHERE state IN (${states.map(() => '?').join(',')}) ORDER BY created_at`).all(...states) as LaunchRow[];
  }
  openChildLaunch(parent: string) {
    return this.db.prepare(`SELECT * FROM launches WHERE parent_ca = ? AND state IN ('reserved','funded','created')`).get(parent) as LaunchRow | undefined;
  }
  pendingLaunchesOf(owner: string) {
    return (this.db.prepare(`SELECT COUNT(*) n FROM launches WHERE owner_wallet = ? AND kind = 'root' AND state = 'awaiting_payment'`).get(owner) as { n: number }).n;
  }
  insertLaunch(l: LaunchRow) {
    const keys = Object.keys(l);
    this.db.prepare(`INSERT INTO launches (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(l);
  }
  updateLaunch(id: string, patch: Partial<LaunchRow>) {
    const keys = Object.keys(patch);
    const set = [...keys.map((k) => `${k} = @${k}`), 'updated_at = @__now'].join(', ');
    this.db.prepare(`UPDATE launches SET ${set} WHERE id = @id`).run({ ...patch, id, __now: this.clock() });
  }

  // ---- intents (write-ahead log for every transaction we sign)
  insertIntent(i: Omit<IntentRow, 'id' | 'state' | 'created_at'>) {
    return Number(
      this.db
        .prepare(`INSERT INTO intents (kind, ref, signature, last_valid_height, payload, state, created_at) VALUES (@kind, @ref, @signature, @last_valid_height, @payload, 'sent', @now)`)
        .run({ ...i, now: Date.now() }).lastInsertRowid,
    );
  }
  intentOpen(id: number) {
    return (this.db.prepare('SELECT state FROM intents WHERE id = ?').get(id) as { state: string } | undefined)?.state === 'sent';
  }
  setIntent(id: number, state: IntentRow['state']) {
    this.db.prepare('UPDATE intents SET state = ? WHERE id = ?').run(state, id);
  }
  openIntents() {
    return this.db.prepare(`SELECT * FROM intents WHERE state = 'sent' ORDER BY id`).all() as IntentRow[];
  }
  openIntentFor(ref: string) {
    return this.db.prepare(`SELECT * FROM intents WHERE state = 'sent' AND ref = ?`).get(ref) as IntentRow | undefined;
  }

  // ---- events
  insertEvent(at: number, coinCa: string, json: string) {
    return Number(this.db.prepare('INSERT INTO events (at, coin_ca, json) VALUES (?, ?, ?)').run(at, coinCa, json).lastInsertRowid);
  }
  recentEvents(limit: number) {
    return (this.db.prepare('SELECT json FROM events ORDER BY id DESC LIMIT ?').all(limit) as { json: string }[]).reverse().map((r) => r.json);
  }

  // ---- media (self-hosted images and metadata)
  putMedia(id: string, mime: string, bytes: Buffer) {
    this.db.prepare('INSERT OR REPLACE INTO media (id, mime, bytes, created_at) VALUES (?, ?, ?, ?)').run(id, mime, bytes, Date.now());
  }
  media(id: string) {
    return this.db.prepare('SELECT mime, bytes FROM media WHERE id = ?').get(id) as { mime: string; bytes: Buffer } | undefined;
  }
}
