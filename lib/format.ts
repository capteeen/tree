export function fmtSol(n: number): string {
  if (!isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a < 0.0001) return n.toFixed(6);
  if (a < 1) return n.toFixed(4);
  if (a < 100) return n.toFixed(3);
  return n.toFixed(1);
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export const shortCa = (ca: string) => (ca.length > 10 ? `${ca.slice(0, 4)}…${ca.slice(-4)}` : ca);

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function age(at: number, now = Date.now()): string {
  return timeAgo(at, now).replace(' ago', '');
}

export const pct = (n: number) => {
  const p = n * 100;
  if (p >= 1) return `${+p.toFixed(2)}%`;
  return `${+p.toPrecision(2)}%`;
};
