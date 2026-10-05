/** Segmented pixel progress bar. */
export default function ProgressBar({ value, segments = 16, color = '#7bd389' }: { value: number; segments?: number; color?: string }) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * segments);
  return (
    <div className="flex gap-[2px]" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className="h-3 flex-1" style={{ background: i < filled ? color : 'var(--line)' }} />
      ))}
    </div>
  );
}
