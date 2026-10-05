'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { WalletButton } from './WalletButton';

const NAV = [
  { href: '/forest', label: 'FOREST' },
  { href: '/leaderboard', label: 'RANKS' },
  { href: '/how', label: 'HOW' },
  { href: '/me', label: 'ME' },
];

function Logo() {
  return (
    <svg viewBox="0 0 12 12" width="28" height="28" shapeRendering="crispEdges" aria-hidden>
      <rect x="4" y="1" width="4" height="1" fill="#7bd389" />
      <rect x="2" y="2" width="8" height="3" fill="#7bd389" />
      <rect x="3" y="3" width="1" height="1" fill="#ff8fb1" />
      <rect x="8" y="2" width="1" height="1" fill="#f5a623" />
      <rect x="3" y="5" width="6" height="1" fill="#4e9a5a" />
      <rect x="5" y="6" width="2" height="4" fill="#8b5a2b" />
      <rect x="6" y="7" width="1" height="1" fill="#f5a623" />
      <rect x="3" y="10" width="6" height="1" fill="#5a3a1e" />
    </svg>
  );
}

export default function Header() {
  const path = usePathname();
  const theme = useStore((s) => s.theme);
  const muted = useStore((s) => s.muted);
  const season = useStore((s) => s.season);
  const { setTheme, setMuted, cycleSeason } = useStore.getState();
  return (
    <header className="sticky top-0 z-40 bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-pixel text-sm text-leaf sm:text-base">TREE</span>
        </Link>
        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:gap-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`shrink-0 px-2 py-1 font-pixel text-[9px] hover:text-sap ${path?.startsWith(n.href) ? 'text-sap' : 'text-ink'}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={cycleSeason} className="hidden px-1 font-pixel text-[8px] text-muted hover:text-ink md:block" title="Seasons follow the calendar. Click to preview another.">
            {season.toUpperCase()}
          </button>
          <button
            onClick={() => setMuted(!muted)}
            className="px-btn px-btn-ghost text-[8px]"
            title="8-bit sounds"
            aria-pressed={!muted}
          >
            {muted ? 'SND OFF' : 'SND ON'}
          </button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="px-btn px-btn-ghost text-[8px]" title="Night mode">
            {theme === 'dark' ? 'NIGHT' : 'DAY'}
          </button>
          <Link href="/plant" className="px-btn hidden text-[9px] sm:inline-block">
            PLANT
          </Link>
          <div className="wallet-wrap">
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
