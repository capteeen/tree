'use client';
import { useState } from 'react';

export default function ShareButton({ text, path, className = '' }: { text: string; path: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`;
  const x = () => `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`;
  return (
    <span className={`inline-flex gap-1 ${className}`}>
      <a href={x()} target="_blank" rel="noreferrer" className="px-btn px-btn-ghost text-[9px]" onClick={(e) => { e.currentTarget.href = x(); }}>
        SHARE ON X
      </a>
      <button
        className="px-btn px-btn-ghost text-[9px]"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url());
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {copied ? 'COPIED' : 'COPY LINK'}
      </button>
    </span>
  );
}
