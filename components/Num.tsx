import Link from 'next/link';

/** Every number is a link to the events behind it. */
export default function Num({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`num-link ${className}`} title="See the events behind this number">
      {children}
    </Link>
  );
}

export const ev = (q: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => v && p.set(k, v));
  return `/events?${p.toString()}`;
};
