
import React, { useEffect, useState, useCallback } from 'react';
import { useTour } from './TourContext';
import { Button, Card } from './UI';
import { ChevronRight, X, Loader2 } from 'lucide-react';

export const TourOverlay: React.FC = () => {
  const { isActive, currentStep, nextStep, prevStep, endTour, targetRect: initialTargetRect, loadingTarget, currentStepIndex } = useTour();
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [dynamicRect, setDynamicRect] = useState<DOMRect | null>(null);

  // Sync dynamic rect with initial rect from context
  useEffect(() => {
    setDynamicRect(initialTargetRect);
  }, [initialTargetRect]);

  const updateRect = useCallback(() => {
    if (currentStep?.targetId) {
      const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`);
      if (el) {
        setDynamicRect(el.getBoundingClientRect());
      }
    }
  }, [currentStep]);

  useEffect(() => {
    const handleResize = () => {
        setWindowSize({ w: window.innerWidth, h: window.innerHeight });
        updateRect();
    };
    
    // Track scrolling to keep spotlight pinned to element
    const handleScroll = () => {
        updateRect();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true); // Capture phase for nested scrolls
    
    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
    };
  }, [updateRect]);

  if (!isActive || !currentStep) return null;

  // Use the dynamic rect if available (for scroll tracking), otherwise fallback
  const rect = dynamicRect || initialTargetRect;

  // Spotlight Path
  const spotlightPadding = 8;
  let path = `M0 0 L${windowSize.w} 0 L${windowSize.w} ${windowSize.h} L0 ${windowSize.h} Z`; // Full cover
  
  if (rect && !loadingTarget) {
     const tTop = rect.top - spotlightPadding;
     const tLeft = rect.left - spotlightPadding;
     const tRight = rect.right + spotlightPadding;
     const tBottom = rect.bottom + spotlightPadding;

     // Cutout the hole (counter-clockwise)
     path += ` M${tLeft} ${tTop} L${tLeft} ${tBottom} L${tRight} ${tBottom} L${tRight} ${tTop} Z`;
  }

  // Card Positioning
  const isTopHalf = rect ? rect.top < windowSize.h / 2 : true;
  const cardStyle: React.CSSProperties = {
     position: 'absolute',
     left: '50%',
     transform: 'translateX(-50%)',
     width: '90%',
     maxWidth: '400px',
     zIndex: 210, // Above SVG
     transition: 'top 0.1s ease, bottom 0.1s ease', // Faster transition for scroll tracking
  };

  if (rect && !loadingTarget) {
     if (currentStep.placement === 'top' || (!currentStep.placement && !isTopHalf)) {
        // Place above target
        cardStyle.bottom = windowSize.h - rect.top + 20;
        cardStyle.top = 'auto';
     } else {
        // Place below target
        cardStyle.top = rect.bottom + 20;
        cardStyle.bottom = 'auto';
     }
  } else {
      // Default centered
      cardStyle.top = '50%';
      cardStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden pointer-events-none touch-none">
       {/* SVG Mask Layer */}
       <svg className="absolute inset-0 w-full h-full pointer-events-auto transition-all duration-100 ease-linear">
          <defs>
             <mask id="tour-mask">
                <path d={path} fill="white" fillRule="evenodd" />
             </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#tour-mask)" />
          
          {/* Active Highlight Border */}
          {rect && !loadingTarget && (
             <rect 
                x={rect.left - spotlightPadding} 
                y={rect.top - spotlightPadding} 
                width={rect.width + (spotlightPadding * 2)} 
                height={rect.height + (spotlightPadding * 2)} 
                fill="transparent" 
                stroke="#F5C249" 
                strokeWidth="2" 
                rx="12"
                className="animate-pulse"
             />
          )}
       </svg>

       {/* Control Card */}
       <div style={cardStyle} className="pointer-events-auto">
          <Card className="p-6 border-lux-gold shadow-2xl animate-in zoom-in-95 duration-300">
             <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-bold text-lux-gold uppercase tracking-widest">
                   Step {currentStepIndex + 1}
                </span>
                <button onClick={endTour} className="text-zinc-500 hover:text-white">
                   <X size={16} />
                </button>
             </div>
             
             <h3 className="text-xl font-bold text-white mb-2">{currentStep.title}</h3>
             
             {loadingTarget ? (
                 <div className="flex items-center gap-2 py-4 text-zinc-500">
                    <Loader2 className="animate-spin" size={16} /> Finding element...
                 </div>
             ) : (
                 <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{currentStep.desc}</p>
             )}

             <div className="flex justify-between items-center">
                <button 
                  onClick={prevStep} 
                  disabled={currentStepIndex === 0}
                  className="text-zinc-500 hover:text-white disabled:opacity-0 transition-colors text-sm font-medium"
                >
                  Back
                </button>
                <Button onClick={nextStep} disabled={loadingTarget} className="shadow-glow h-10 px-6">
                  {loadingTarget ? 'Wait...' : 'Next'} <ChevronRight size={16} className="ml-1" />
                </Button>
             </div>
          </Card>
       </div>
    </div>
  );
};
