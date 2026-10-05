'use client';

/** Rolling pixel odometer. Each digit is a vertical strip that slides. */
export default function Odometer({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex font-pixel leading-none ${className}`} aria-label={value}>
      {value.split('').map((ch, i) => {
        const d = ch.charCodeAt(0) - 48;
        if (d < 0 || d > 9) return <span key={`${i}${ch}`}>{ch}</span>;
        return (
          <span key={i} className="relative inline-block h-[1em] w-[1em] overflow-hidden" aria-hidden>
            <span className="absolute left-0 top-0 flex flex-col transition-transform duration-700 ease-out" style={{ transform: `translateY(-${d}em)` }}>
              {'0123456789'.split('').map((n) => (
                <span key={n} className="block h-[1em]">{n}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
