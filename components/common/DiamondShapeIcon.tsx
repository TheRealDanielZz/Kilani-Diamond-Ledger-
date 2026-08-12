import React from 'react';

export type DiamondShape =
  | 'Round Brilliant'
  | 'Round'
  | 'Princess'
  | 'Emerald'
  | 'Oval'
  | 'Cushion'
  | 'Marquise'
  | 'Pear'
  | 'Radiant'
  | 'Baguette'
  | 'Asscher'
  | 'Heart'
  | 'Kite'
  | string;

interface Props {
  shape: DiamondShape;
  className?: string;
  size?: number;
}

export const DiamondShapeIcon: React.FC<Props> = ({ shape, className = 'w-4 h-4', size = 16 }) => {
  const normShape = (shape || '').toLowerCase().trim();

  // 1. Round Brilliant (Standard Brilliant Facet Cut)
  if (normShape.includes('round') || normShape.includes('brilliant')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polygon points="6,4 18,4 22,10 12,21 2,10" />
        <line x1="6" y1="4" x2="2" y2="10" />
        <line x1="6" y1="4" x2="12" y2="10" />
        <line x1="18" y1="4" x2="12" y2="10" />
        <line x1="18" y1="4" x2="22" y2="10" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="12" y1="10" x2="12" y2="21" />
      </svg>
    );
  }

  // 2. Princess (Square Cut with Inner Facet Inset)
  if (normShape.includes('princess') || normShape.includes('square')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect x="4" y="4" width="16" height="16" rx="1" />
        <rect x="8" y="8" width="8" height="8" rx="0.5" />
        <line x1="4" y1="4" x2="8" y2="8" />
        <line x1="20" y1="4" x2="16" y2="8" />
        <line x1="4" y1="20" x2="8" y2="16" />
        <line x1="20" y1="20" x2="16" y2="16" />
      </svg>
    );
  }

  // 3. Emerald / Baguette (Step Cut Octagon/Rectangle)
  if (normShape.includes('emerald') || normShape.includes('baguette') || normShape.includes('asscher')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polygon points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7" />
        <polygon points="9,6 15,6 18,9 18,15 15,18 9,18 6,15 6,9" />
        <line x1="7" y1="3" x2="9" y2="6" />
        <line x1="17" y1="3" x2="15" y2="6" />
        <line x1="21" y1="7" x2="18" y2="9" />
        <line x1="21" y1="17" x2="18" y2="15" />
        <line x1="17" y1="21" x2="15" y2="18" />
        <line x1="7" y1="21" x2="9" y2="18" />
        <line x1="3" y1="17" x2="6" y2="15" />
        <line x1="3" y1="7" x2="6" y2="9" />
      </svg>
    );
  }

  // 4. Marquise (Eye / Boat Shape)
  if (normShape.includes('marquise')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12,2 Q20,12 12,22 Q4,12 12,2 Z" />
        <path d="M12,6 Q16,12 12,18 Q8,12 12,6 Z" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
    );
  }

  // 5. Pear (Teardrop Cut)
  if (normShape.includes('pear')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12,2 C17,8 20,13 20,16 A8,8 0 0,1 4,16 C4,13 7,8 12,2 Z" />
        <path d="M12,6 C15,10 17,13 17,15.5 A5,5 0 0,1 7,15.5 C7,13 9,10 12,6 Z" />
      </svg>
    );
  }

  // 6. Oval
  if (normShape.includes('oval')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <ellipse cx="12" cy="12" rx="7" ry="10" />
        <ellipse cx="12" cy="12" rx="4.5" ry="7" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="5" y1="12" x2="7.5" y2="12" />
        <line x1="16.5" y1="12" x2="19" y2="12" />
      </svg>
    );
  }

  // 7. Cushion / Radiant
  if (normShape.includes('cushion') || normShape.includes('radiant')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <rect x="8" y="8" width="8" height="8" rx="2" />
        <line x1="4" y1="4" x2="8" y2="8" />
        <line x1="20" y1="4" x2="16" y2="8" />
        <line x1="4" y1="20" x2="8" y2="16" />
        <line x1="20" y1="20" x2="16" y2="16" />
      </svg>
    );
  }

  // 8. Kite
  if (normShape.includes('kite')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polygon points="12,2 20,9 12,22 4,9" />
        <polygon points="12,6 16,10 12,18 8,10" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="20" y1="9" x2="16" y2="10" />
        <line x1="12" y1="22" x2="12" y2="18" />
        <line x1="4" y1="9" x2="8" y2="10" />
      </svg>
    );
  }

  // Default Classic Diamond Icon
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="6,4 18,4 22,10 12,21 2,10" />
      <line x1="6" y1="4" x2="12" y2="10" />
      <line x1="18" y1="4" x2="12" y2="10" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="12" y1="10" x2="12" y2="21" />
    </svg>
  );
};
