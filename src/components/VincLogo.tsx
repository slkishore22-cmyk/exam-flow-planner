import React from 'react';

interface VincLogoProps {
  className?: string;
  /** Show wordmark next to the icon */
  showWordmark?: boolean;
  /** Size variant — controls overall height */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * VIN-C brand logo, rebuilt as crisp inline SVG.
 * Mark: 4 connected graph nodes (square + diagonals), cyan→deep-blue gradient.
 * Wordmark: clean geometric sans, tracked, in foreground color.
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
      {/* Icon */}
      <svg
        viewBox="0 0 64 64"
        className="h-full w-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="VIN-C"
        role="img"
      >
        <defs>
          <linearGradient id="vinc-grad" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="hsl(var(--brand-cyan))" />
            <stop offset="55%" stopColor="hsl(var(--brand-blue))" />
            <stop offset="100%" stopColor="hsl(var(--brand-deep))" />
          </linearGradient>
        </defs>

        {/* Edges — square frame */}
        <g stroke="url(#vinc-grad)" strokeWidth="3.5" strokeLinecap="round">
          <line x1="14" y1="14" x2="50" y2="14" />
          <line x1="50" y1="14" x2="50" y2="50" />
          <line x1="14" y1="50" x2="50" y2="50" />
          <line x1="14" y1="14" x2="14" y2="50" />
          {/* Diagonals forming the "Z" / network signature */}
          <line x1="14" y1="14" x2="50" y2="50" />
          <line x1="14" y1="50" x2="50" y2="14" />
        </g>

        {/* Nodes */}
        <g>
          <circle cx="14" cy="14" r="5.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
          <circle cx="50" cy="14" r="5.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
          <circle cx="14" cy="50" r="5.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
          <circle cx="50" cy="50" r="5.5" fill="hsl(var(--background))" stroke="url(#vinc-grad)" strokeWidth="3.5" />
        </g>
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <span
          className="font-semibold tracking-[0.18em] text-foreground select-none"
          style={{
            fontSize:
              size === 'sm' ? '1rem' : size === 'lg' ? '1.875rem' : '1.375rem',
            lineHeight: 1,
          }}
        >
          VIN<span className="mx-[0.08em] text-muted-foreground">–</span>C
        </span>
      )}
    </div>
  );
};

export default VincLogo;
