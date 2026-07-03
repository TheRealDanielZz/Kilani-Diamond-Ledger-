
import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { Card, Spinner, Sparkline } from './UI';
import { RefreshCw, Coins, RotateCcw, Activity, Lock, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Zap } from 'lucide-react';
import { GoldPriceCache } from '../types';
import { useToast } from '../App';

export const GoldPriceCard: React.FC = () => {
    const showToast = useToast();
    const [goldData, setGoldData] = useState<GoldPriceCache | null>(store.getLiveGoldPrice());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Subscribe to store changes to keep this card in sync
        const sync = () => {
            const current = store.getLiveGoldPrice();
            setGoldData(current);
        };
        sync();
        // Initial fetch if empty
        if (!store.getLiveGoldPrice()) {
            store.fetchAndCacheGoldPrice();
        }
        return store.subscribe(sync);
    }, []);

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await store.fetchAndCacheGoldPrice(true);
            showToast("Gold Price Updated");
        } catch (e) {
            console.error(e);
            showToast("Failed to fetch price");
        } finally {
            setLoading(false);
        }
    };

    const handleGoLive = async () => {
        setLoading(true);
        try {
            await store.toggleGoldPriceMode(false);
            showToast("Switched to Live Feed");
        } catch (e) {
             showToast("Error switching mode");
        } finally {
            setLoading(false);
        }
    };

    const handleAutoDebug = async () => {
        setLoading(true);
        try {
            // Force fetch which attempts primary and fallback APIs
            await store.fetchAndCacheGoldPrice(true);
            
            // Check if it's still erroring
            const fresh = store.getLiveGoldPrice();
            if (fresh?.error) {
                showToast("Debug Failed: APIs Unreachable");
            } else {
                showToast("Connection Restored");
            }
        } catch (e) {
            showToast("Debug Error");
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (iso: string) => {
        try {
            if (!iso) return 'Unknown';
            const d = new Date(iso);
            if (isNaN(d.getTime())) return 'Invalid Date';
            
            const now = new Date();
            const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            const time = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            return isToday ? `Today ${time}` : `${d.toLocaleDateString()} ${time}`;
        } catch (e) {
            return 'Unknown';
        }
    };

    if (!goldData) return (
        <Card className="p-5 flex items-center justify-center h-full min-h-[160px]">
            <div className="flex flex-col items-center gap-2 text-zinc-500">
                <Spinner />
                <span className="text-xs">Loading Market Data...</span>
            </div>
        </Card>
    );

    const isLive = !goldData.isManual;
    const hasError = !!goldData.error;
    
    // Trend Logic
    // Trend Logic
    const change = goldData.change || 0;
    const changePercent = goldData.changePercent || 0;
    const isPositive = change >= 0;
    const isNeutral = change === 0;

    // Generate dynamic sparkline data points based on price & change
    const startPrice = goldData.price - change;
    const pointsCount = 10;
    const sparklineData = Array.from({ length: pointsCount }, (_, i) => {
        if (i === 0) return startPrice;
        if (i === pointsCount - 1) return goldData.price;
        const ratio = i / (pointsCount - 1);
        const base = startPrice + change * ratio;
        const wiggle = (Math.sin(i * 1.5) * 0.12 + Math.cos(i * 0.8) * 0.06) * (Math.abs(change) || 0.5);
        return base + wiggle;
    });
    
    // Determine colors
    const trendColor = hasError ? 'text-zinc-500' : isNeutral ? 'text-zinc-400' : isPositive ? 'text-emerald-400' : 'text-red-400';
    const trendBg = hasError ? 'bg-zinc-500/10 border-zinc-500/20' : isNeutral ? 'bg-zinc-500/10 border-zinc-500/20' : isPositive ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20';
    const TrendIcon = hasError ? AlertTriangle : isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

    return (
        <Card className={`p-6 md:p-5 lg:p-6 h-full flex flex-col justify-between relative overflow-hidden group ${hasError ? 'border-red-500/30' : 'border-lux-gold/20'}`}>
            {/* Background Glow */}
            <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-all duration-1000 ${hasError ? 'bg-red-500/10' : isLive ? (isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10') : 'bg-blue-500/10'}`}></div>

            <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="flex items-center gap-2">
                    <div className={`p-2.5 rounded-2xl transition-colors duration-500 ${hasError ? 'bg-red-500/10 text-red-500' : isLive ? 'bg-lux-gold/10 text-lux-gold' : 'bg-blue-500/10 text-blue-400'}`}>
                        {hasError ? <AlertTriangle size={20} className="md:w-4 md:h-4 lg:w-5 lg:h-5"/> : <Coins size={20} className="md:w-4 md:h-4 lg:w-5 lg:h-5" />}
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm md:text-xs lg:text-sm">Gold Price (24k)</h3>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                            {hasError ? (
                                <span className="text-red-400 flex items-center gap-1">Update Failed</span>
                            ) : isLive ? (
                                <span className="text-lux-gold flex items-center gap-1"><Activity size={10} className="animate-pulse"/> Live Market</span>
                            ) : (
                                <span className="text-blue-400 flex items-center gap-1"><Lock size={10}/> Manual Override</span>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="flex gap-1">
                   <button onClick={handleRefresh} disabled={loading} className="p-2.5 hover:bg-white/5 rounded-2xl text-zinc-500 hover:text-white transition-all ring-1 ring-white/5" title="Refresh Live Price">
                       <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                   </button>
                </div>
            </div>

            <div className="relative z-10 my-2">
                <div key={goldData.lastUpdated} className="animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex justify-between items-center gap-2">
                        <div className={`text-3xl md:text-2xl lg:text-4xl font-bold font-mono tracking-tighter flex items-baseline gap-1 ${hasError ? 'text-zinc-300' : 'text-white'}`}>
                            ${goldData.price.toFixed(2)}
                            <span className="text-sm text-zinc-500 font-sans font-normal">CAD/g</span>
                        </div>
                        {!hasError && (
                            <div className="opacity-80 select-none pointer-events-none hover:scale-105 transition-transform duration-500 pr-1">
                                <Sparkline data={sparklineData} color={isNeutral ? '#A1A1AA' : isPositive ? '#34D399' : '#F87171'} width={100} height={32} />
                            </div>
                        )}
                    </div>
                    
                    {hasError ? (
                        <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                            <p className="text-[10px] text-red-400 font-medium flex items-center gap-1.5 bg-red-950/20 px-2 py-1.5 rounded border border-red-900/30">
                                <AlertTriangle size={10} />
                                {goldData.error}
                            </p>
                            
                            <button 
                                onClick={handleAutoDebug}
                                disabled={loading}
                                className="w-full py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                            >
                                {loading ? <Spinner size="sm" /> : <Zap size={12} fill="currentColor" />}
                                Auto Debug
                            </button>

                            <p className="text-[9px] text-zinc-600 text-right">
                                Last successful: {formatTime(goldData.lastUpdated)}
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                            {isLive ? (
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${trendBg} ${trendColor} text-xs md:text-[10px] lg:text-xs font-bold`}>
                                    <TrendIcon size={12} />
                                    <span>{isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)</span>
                                </div>
                            ) : (
                                <div className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs md:text-[10px] lg:text-xs font-bold">
                                    Fixed Rate
                                </div>
                            )}
                            
                            <p className="text-[10px] text-zinc-500 flex items-center gap-1.5 font-medium" title={new Date(goldData.lastUpdated).toLocaleString()}>
                                <Clock size={12} className="text-zinc-600" />
                                <span className="opacity-70 hidden md:inline lg:inline">Updated:</span>
                                {formatTime(goldData.lastUpdated)}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Reset Button (Only visible if not live) */}
            {!isLive && !hasError && (
                <div className="flex gap-2 mt-2 pt-3 border-t border-white/5 relative z-10">
                     <button 
                        onClick={handleGoLive} 
                        className="flex-1 py-3 rounded-[20px] bg-lux-gold/10 hover:bg-lux-gold/20 text-xs font-bold text-lux-gold border border-lux-gold/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={12} /> Reset to Live
                    </button>
                </div>
            )}
        </Card>
    );
};
