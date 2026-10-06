'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import Search from './Search';
import Logo from './Logo';

const NAV = [
  { href: '/forest', label: 'FOREST' },
  { href: '/leaderboard', label: 'RANKS' },
  { href: '/how', label: 'HOW' },
  { href: '/me', label: 'ME' },
];

const SEASON_ICON: Record<string, string> = { spring: '🌸', summer: '☀', autumn: '🍂', winter: '❄' };


export default function Header() {
  const path = usePathname();
  const theme = useStore((s) => s.theme);
  const muted = useStore((s) => s.muted);
  const season = useStore((s) => s.season);
  const mode = useStore((s) => s.mode);
  const connected = useStore((s) => s.connected);
  const ready = useStore((s) => s.ready);
  const { setTheme, setMuted, cycleSeason } = useStore.getState();
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={30} />
          <span className="font-pixel text-sm text-leaf sm:text-base">TREE</span>
        </Link>
        <nav className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
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
        <div className="hidden min-w-0 flex-1 md:block md:max-w-xs">
          <Search />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {ready && (
            <span
              className="hidden font-pixel text-[7px] text-muted lg:inline"
              title={mode === 'server' ? (connected ? 'Shared world: everyone sees this tree' : 'Reconnecting to the shared world…') : 'Local simulator: this browser only'}
            >
              {mode === 'server' ? (connected ? '● SHARED' : '○ SYNCING') : '◌ LOCAL'}
            </span>
          )}
          <button onClick={() => setSearchOpen((o) => !o)} className="px-btn px-btn-ghost text-[8px] md:hidden" aria-label="Search" aria-expanded={searchOpen}>
            FIND
          </button>
          <button onClick={cycleSeason} className="px-btn px-btn-ghost text-[8px]" title={`Season: ${season}. Follows the calendar; click to preview another.`}>
            <span aria-hidden>{SEASON_ICON[season]}</span>
            <span className="sr-only">{season}</span>
          </button>
          <button onClick={() => setMuted(!muted)} className="px-btn px-btn-ghost text-[8px]" title="8-bit sounds" aria-pressed={!muted}>
            {muted ? 'SND OFF' : 'SND ON'}
          </button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="px-btn px-btn-ghost text-[8px]" title="Night / day">
            {theme === 'dark' ? 'NIGHT' : 'DAY'}
          </button>
          <Link href="/plant" className="px-btn hidden text-[9px] sm:inline-block">
            PLANT
          </Link>
        </div>
      </div>
      {searchOpen && (
        <div className="px-3 pb-2 md:hidden">
          <Search onDone={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  );
}
