/* eslint-disable @next/next/no-img-element */
/** The TREE logo. Pixel art: always rendered with nearest-neighbour scaling. */
export default function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={size <= 32 ? '/brand/logo-32.png' : '/brand/logo.png'}
      width={size}
      height={size}
      alt="TREE"
      className={`shrink-0 rounded-[4px] ${className}`}
      style={{ imageRendering: size <= 32 ? 'auto' : 'pixelated' }}
    />
  );
}
