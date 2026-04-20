import React from 'react';
import vincLogoExact from '@/assets/vinc-logo-exact.png';

interface VincLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const VincLogo: React.FC<VincLogoProps> = ({ className = '', size = 'md' }) => {
  const heightClass = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-16' : 'h-12';

  return (
    <img
      src={vincLogoExact}
      alt="VIN-C logo"
      className={`w-auto object-contain ${heightClass} ${className}`}
      loading="eager"
      decoding="async"
    />
  );
};

export default VincLogo;
