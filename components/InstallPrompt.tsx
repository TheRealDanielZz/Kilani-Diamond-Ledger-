
import React, { useState, useEffect } from 'react';
import { Share, PlusSquare, X } from 'lucide-react';
import { Card } from './UI';

export const InstallPrompt: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only run on browser
    if (typeof window === 'undefined') return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    
    // Detect if already standalone
    // @ts-ignore
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && !isStandalone) {
      // Check if previously dismissed
      const dismissed = localStorage.getItem('kilani_pwa_dismissed');
      if (!dismissed) {
        // Show after a short delay
        const timer = setTimeout(() => setShow(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('kilani_pwa_dismissed', 'true');
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[200] animate-in slide-in-from-bottom-6 duration-700">
      <Card className="p-4 border-lux-gold/30 shadow-2xl relative">
        <button onClick={handleDismiss} className="absolute top-2 right-2 text-zinc-500 hover:text-white p-2">
          <X size={16} />
        </button>
        <div className="flex gap-4 pr-6">
          <div className="w-12 h-12 rounded-xl bg-[#16171D] flex items-center justify-center border border-lux-gold text-lux-gold font-serif font-bold text-2xl shadow-glow">
            K
          </div>
          <div>
            <h3 className="font-bold text-white text-sm mb-1">Install KILANI Reporter</h3>
            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              Add to Home Screen for the best full-screen experience.
            </p>
            <div className="flex items-center gap-3 text-xs text-zinc-300 font-medium">
              <div className="flex items-center gap-1.5">
                1. Tap <Share size={14} className="text-blue-400" />
              </div>
              <div className="w-px h-3 bg-zinc-700"></div>
              <div className="flex items-center gap-1.5">
                2. Select <span className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 flex items-center gap-1">Add to Home Screen <PlusSquare size={10}/></span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Pointer Arrow for iOS Bottom Bar */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 bg-[#121318] rotate-45 border-b border-r border-lux-gold/30"></div>
      </Card>
    </div>
  );
};
