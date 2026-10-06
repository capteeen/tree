import Logo from './Logo';

export default function Loading({ text = 'GROWING THE FOREST' }: { text?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 font-pixel text-[10px] text-muted">
      <Logo size={64} className="animate-pulse" />
      <span className="animate-pulse">{text}…</span>
    </div>
  );
}
