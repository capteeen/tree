import Link from 'next/link';
import type { Coin } from '@/lib/types';

/** ROOT → OAK → ACORN → YOU */
export default function Ancestry({ line, here }: { line: Coin[]; here: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 font-pixel text-[8px] leading-relaxed sm:text-[9px]" aria-label="Ancestry">
      {line.map((c, i) => (
        <span key={c.ca} className="flex items-center gap-1">
          {i > 0 && <span className="text-sap">→</span>}
          {c.ca === here ? (
            <span className="bg-sap px-1 text-[#1b1815]">{c.ticker}</span>
          ) : (
            <Link href={`/coin/${c.ca}`} className={`hover:text-sap ${i === 0 ? 'text-leaf' : ''}`}>
              {i === 0 ? `ROOT ${c.ticker}` : c.ticker}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
