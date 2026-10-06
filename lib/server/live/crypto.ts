import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Keypair } from '@solana/web3.js';

/**
 * Vault and mint secret keys are encrypted at rest with AES-256-GCM under
 * MASTER_KEY (32 bytes, hex or base64). Losing MASTER_KEY means losing every
 * vault: back it up separately from the database.
 */
export class KeyBox {
  private key: Buffer;

  constructor(master: string) {
    const raw = /^[0-9a-f]{64}$/i.test(master) ? Buffer.from(master, 'hex') : Buffer.from(master, 'base64');
    if (raw.length !== 32) throw new Error('MASTER_KEY must be 32 bytes (64 hex chars or base64)');
    this.key = raw;
  }

  /** Short fingerprint stored in the DB so a wrong MASTER_KEY is caught at boot, not at first spend. */
  fingerprint() {
    return createHash('sha256').update(this.key).digest('hex').slice(0, 16);
  }

  seal(kp: Keypair): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([c.update(Buffer.from(kp.secretKey)), c.final()]);
    return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.');
  }

  open(sealed: string): Keypair {
    const [v, iv, tag, body] = sealed.split('.');
    if (v !== 'v1') throw new Error('unknown key format');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    const secret = Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]);
    return Keypair.fromSecretKey(new Uint8Array(secret));
  }
}
