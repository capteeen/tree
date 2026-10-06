'use client';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { range, liveRng } from '@/lib/rng';

/**
 * Boots the store. In server mode the world streams in over SSE; in local
 * mode this drives the in-browser simulator (each tree trades every 2–6 s,
 * idle coins occasionally go dormant).
 */
function SimDriver() {
  const ready = useStore((s) => s.ready);
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    useStore.getState().init();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!ready || mode !== 'local') return;
    const next = new Map<string, number>();
    const iv = setInterval(() => {
      const st = useStore.getState();
      const now = Date.now();
      for (const root of st.world.roots) {
        const at = next.get(root) ?? now + range(liveRng, 300, 4000);
        if (!next.has(root)) next.set(root, at);
        if (now >= at) {
          st.tick(root);
          next.set(root, now + range(liveRng, 2000, 6000));
        }
      }
    }, 200);
    const reaper = setInterval(() => useStore.getState().reap(), 8000);
    return () => {
      clearInterval(iv);
      clearInterval(reaper);
    };
  }, [ready, mode]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SimDriver />
      {children}
    </>
  );
}
