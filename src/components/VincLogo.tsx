import React from 'react';

interface VincLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * VIN-C brand mark — faithful SVG rebuild of the original PDF logo.
 * Structure: square of 4 nodes, with a "Z" diagonal stroke running
 * top-left → top-right → bottom-left → bottom-right.
 * Gradient flows light cyan (top-left) → deep navy (bottom-right).
 */
const VincLogo: React.FC<VincLogoProps> = ({
  className = '',
  showWordmark = true,
  size = 'md',
}) => {
  const heightClass =
    size === 'sm' ? 'h-7' : size === 'lg' ? 'h-14' : 'h-10';

  return (
    <div className={`inline-flex items-center gap-3 ${heightClass} ${className}`}>
      <svg
        viewBox="0 0 64 64"
        className="h-full w-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="VIN-C"
        role="img"
      >
        <defs>
          <linearGradient id="vinc-grad" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4FC3DC" />
            <stop offset="50%" stopColor="#1E63B8" />
            <stop offset="100%" stopColor="#0E2E7A" />
          </linearGradient>
        </defs>

        {/* The "Z" path: TL → TR (top edge) → BL (diagonal) → BR (bottom edge) */}
        <path
          d="M 14 14 L 50 14 L 14 50 L 50 50"
          stroke="url(#vinc-grad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Left vertical edge (top-left → bottom-left) */}
        <line
          x1="14" y1="14" x2="14" y2="50"
          stroke="url(#vinc-grad)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Right vertical edge (top-right → bottom-right) */}
        <line
          x1="50" y1="14" x2="50" y2="50"
          stroke="url(#vinc-grad)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* 4 corner nodes — hollow rings */}
        <circle cx="14" cy="14" r="4.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
        <circle cx="50" cy="14" r="4.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
        <circle cx="14" cy="50" r="4.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
        <circle cx="50" cy="50" r="4.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
      </svg>

      {showWordmark && (
        <span
          className="font-light tracking-[0.05em] text-foreground select-none"
          style={{
            fontSize:
              size === 'sm' ? '1.05rem' : size === 'lg' ? '2rem' : '1.5rem',
            lineHeight: 1,
            fontFamily: "'Inter', -apple-system, sans-serif",
          }}
        >
          VIN-C
        </span>
      )}
    </div>
  );
};

export default VincLogo;
