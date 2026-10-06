'use client';
import { useEffect, useState } from 'react';
import { onEvent } from '@/lib/bus';
import { useStore } from '@/lib/store';

/** One-time toast after the first climb: sounds are off by default, so offer them once. */
export default function SoundNudge() {
  const [show, setShow] = useState(false);
  const muted = useStore((s) => s.muted);
  useEffect(() => {
    try {
      if (localStorage.getItem('tree.sndNudge')) return;
    } catch {}
    const off = onEvent((e) => {
      if (e.kind !== 'climb') return;
      off();
      setTimeout(() => setShow(true), 1200);
    });
    return off;
  }, []);
  const dismiss = (enable: boolean) => {
    try {
      localStorage.setItem('tree.sndNudge', '1');
    } catch {}
    if (enable) useStore.getState().setMuted(false);
    setShow(false);
  };
  if (!show || !muted) return null;
  return (
    <div className="px-box fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-24px)] max-w-xl -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))] text-lg shadow-xl">
      <span className="whitespace-nowrap">🔊 Hear the sap climb?</span>
      <span className="whitespace-nowrap text-muted">8-bit sounds are off.</span>
      <button className="px-btn text-[8px]" onClick={() => dismiss(true)}>
        TURN ON
      </button>
      <button className="px-btn px-btn-ghost text-[8px]" onClick={() => dismiss(false)}>
        NO
      </button>
    </div>
  );
}
