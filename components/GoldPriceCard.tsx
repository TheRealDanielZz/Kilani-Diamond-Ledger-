
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

    // Let's compute SVG path for a premium, wider Area Chart
    const svgWidth = 280;
    const svgHeight = 110;
    const paddingY = 12;
    const minVal = Math.min(...sparklineData);
    const maxVal = Math.max(...sparklineData);
    const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;
    
    const svgPoints = sparklineData.map((val, idx) => {
        const x = (idx / (sparklineData.length - 1)) * svgWidth;
        const y = svgHeight - paddingY - ((val - minVal) / range) * (svgHeight - 2 * paddingY);
        return { x, y };
    });
    
    const linePath = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;
    const lastPoint = svgPoints[svgPoints.length - 1];
    
    const strokeColor = isNeutral ? '#A1A1AA' : isPositive ? '#10B981' : '#EF4444';
    const gradientId = `gold-chart-grad-${isPositive ? 'pos' : 'neg'}`;

    return (
        <Card className={`p-6 md:p-5 lg:p-6 h-full flex flex-col justify-between relative overflow-hidden group ${hasError ? 'border-red-500/30' : ''}`}>
            {/* Glowing top line */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-lux-gold via-yellow-500 to-[#ffd66e] z-20"></div>

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
                   <button onClick={handleRefresh} disabled={loading} className="p-2.5 hover:bg-white/5 rounded-2xl text-zinc-500 hover:text-white transition-all ring-1 ring-white/5 z-20" title="Refresh Live Price">
                       <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                   </button>
                </div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col justify-between mt-3">
                <div key={goldData.lastUpdated} className="animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-baseline">
                            <div className={`text-3xl md:text-2xl lg:text-4xl font-bold font-mono tracking-tighter flex items-baseline gap-1 ${hasError ? 'text-zinc-300' : 'text-white'}`}>
                                ${goldData.price.toFixed(2)}
                                <span className="text-sm text-zinc-500 font-sans font-normal">CAD/g</span>
                            </div>
                            
                            {!hasError && (
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${trendBg} ${trendColor}`}>
                                    <TrendIcon size={10} />
                                    <span>{isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)</span>
                                </div>
                            )}
                        </div>
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
                                className="w-full py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_10px_rgba(239,68,68,0.2)] z-20"
                            >
                                {loading ? <Spinner size="sm" /> : <Zap size={12} fill="currentColor" />}
                                Auto Debug
                            </button>

                            <p className="text-[9px] text-zinc-600 text-right">
                                Last successful: {formatTime(goldData.lastUpdated)}
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-end">
                            {/* Premium SVG Area Chart */}
                            <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="overflow-visible select-none pointer-events-none my-3">
                                <defs>
                                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
                                        <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                <path d={areaPath} fill={`url(#${gradientId})`} />
                                <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill={strokeColor} />
                                <circle cx={lastPoint.x} cy={lastPoint.y} r="10" fill={strokeColor} className="animate-ping opacity-35" style={{ transformOrigin: `${lastPoint.x}px ${lastPoint.y}px` }} />
                            </svg>
                            
                            <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-1">
                                <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">
                                    {isLive ? 'XAU/CAD Market' : 'Fixed Rate'}
                                </span>
                                
                                <p className="text-[10px] text-zinc-500 flex items-center gap-1.5 font-medium" title={new Date(goldData.lastUpdated).toLocaleString()}>
                                    <Clock size={11} className="text-zinc-600" />
                                    <span>{formatTime(goldData.lastUpdated)}</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Reset Button (Only visible if not live) */}
            {!isLive && !hasError && (
                <div className="flex gap-2 mt-2 pt-3 border-t border-white/5 relative z-10">
                     <button 
                        onClick={handleGoLive} 
                        className="flex-1 py-3 rounded-[20px] bg-lux-gold/10 hover:bg-lux-gold/20 text-xs font-bold text-lux-gold border border-lux-gold/20 transition-all active:scale-95 flex items-center justify-center gap-2 z-20"
                     >
                        <RotateCcw size={12} /> Reset to Live
                    </button>
                </div>
            )}
        </Card>
    );
};

