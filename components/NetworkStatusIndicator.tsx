import React, { useEffect, useState } from 'react';
import { WifiOff, CheckCircle2, RefreshCw } from 'lucide-react';
import { offlineQueue } from '../services/offlineQueue';

export const NetworkStatusIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [showReconnected, setShowReconnected] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(() => offlineQueue.getPendingCount());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      // Auto-dismiss reconnected notification after 3.5 seconds
      const timer = window.setTimeout(() => {
        setShowReconnected(false);
      }, 3500);
      return () => window.clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to offline mutation queue changes
    const unsubscribe = offlineQueue.subscribe((count) => {
      setPendingCount(count);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleManualRetry = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await offlineQueue.flush();
    } finally {
      setIsSyncing(false);
    }
  };

  // 1. Offline Mode: floating amber liquid-glass status pill
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[150] px-4 py-2.5 rounded-2xl bg-[#1C1A14]/92 backdrop-blur-xl border border-amber-500/40 text-amber-200 shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_20px_rgba(245,158,11,0.18)] flex items-center gap-3 font-sans text-xs sm:text-sm animate-enter transition-all pointer-events-auto"
      >
        <div className="relative flex items-center justify-center shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping absolute opacity-75" />
          <span className="w-2 h-2 rounded-full bg-amber-400 relative" />
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <WifiOff size={16} className="text-amber-400 shrink-0" />
          <span className="font-semibold text-amber-100 whitespace-nowrap">Vault / Offline Mode</span>
          <span className="hidden sm:inline text-amber-300/70 text-xs truncate">
            — Changes will safely auto-sync upon reconnection
          </span>
        </div>

        {pendingCount > 0 && (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0">
            {pendingCount} queued
          </span>
        )}

        <button
          type="button"
          onClick={handleManualRetry}
          disabled={isSyncing}
          className="ml-1 text-[11px] font-semibold text-amber-300 hover:text-amber-100 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
          title="Attempt sync"
        >
          <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'Checking...' : 'Retry'}</span>
        </button>
      </div>
    );
  }

  // 2. Reconnected: brief confirmation emerald liquid-glass pill
  if (showReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[150] px-4 py-2.5 rounded-2xl bg-[#101C16]/92 backdrop-blur-xl border border-emerald-500/40 text-emerald-200 shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_20px_rgba(16,185,129,0.22)] flex items-center gap-2.5 font-sans text-xs sm:text-sm animate-enter transition-all pointer-events-auto"
      >
        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        <span className="font-semibold text-emerald-100">Workshop Connection Restored</span>
        <span className="text-emerald-300/80 text-xs font-mono">
          {pendingCount > 0 ? `Syncing ${pendingCount} updates...` : 'Synchronized'}
        </span>
      </div>
    );
  }

  return null;
};
