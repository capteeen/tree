'use client';
import { useRef } from 'react';

/**
 * Rolling pixel odometer. Each digit is a vertical strip that slides. The
 * strip count only grows, so when 999 becomes 1000 the new leading digit
 * rolls in from 0 and fades up instead of popping into place.
 */
export default function Odometer({ value, className = '' }: { value: string; className?: string }) {
  const maxLen = useRef(0);
  const intPart = value.split(/[^0-9]/)[0];
  const rest = value.slice(intPart.length);
  maxLen.current = Math.max(maxLen.current, intPart.length);
  const padded = intPart.padStart(maxLen.current, '0');
  const firstReal = padded.length - intPart.length;
  return (
    <span className={`inline-flex font-pixel leading-none ${className}`} aria-label={value}>
      {padded.split('').map((ch, i) => {
        const d = ch.charCodeAt(0) - 48;
        const leading = i < firstReal;
        return (
          <span
            key={i}
            className="relative inline-block h-[1em] overflow-hidden transition-[width,opacity] duration-500"
            style={{ width: leading ? 0 : '1em', opacity: leading ? 0 : 1 }}
            aria-hidden
          >
            <span className="absolute left-0 top-0 flex flex-col transition-transform duration-700 ease-out" style={{ transform: `translateY(-${d}em)` }}>
              {'0123456789'.split('').map((n) => (
                <span key={n} className="block h-[1em]">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
      {rest.split('').map((ch, i) => {
        const d = ch.charCodeAt(0) - 48;
        if (d < 0 || d > 9) return <span key={`r${i}`}>{ch}</span>;
        return (
          <span key={`r${i}`} className="relative inline-block h-[1em] w-[1em] overflow-hidden" aria-hidden>
            <span className="absolute left-0 top-0 flex flex-col transition-transform duration-700 ease-out" style={{ transform: `translateY(-${d}em)` }}>
              {'0123456789'.split('').map((n) => (
                <span key={n} className="block h-[1em]">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
