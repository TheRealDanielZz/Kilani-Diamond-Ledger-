import React, { useEffect, useState, useRef, useId } from 'react';
import { ProjectStatus, BagStatus } from '../types';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Toast Component (Floating Glass with Physics)
export const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => { 
      const t = setTimeout(onClose, 3000); return () => clearTimeout(t); 
  }, [onClose]);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, scale: 0.9, x: '-50%' }}
      animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
      exit={{ opacity: 0, y: 20, scale: 0.95, x: '-50%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
      className="fixed bottom-24 md:bottom-10 left-1/2 z-[150] w-auto max-w-[90%]"
    >
      <div className="glass-card text-theme-text-primary px-8 py-5 rounded-full flex items-center gap-4 ring-1 ring-theme-border shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        <div className="w-2.5 h-2.5 rounded-full bg-lux-gold shadow-[0_0_15px_#F5C249] animate-pulse"></div>
        <span className="font-bold text-[14px] tracking-wide">{message}</span>
      </div>
    </motion.div>
  );
};

export const Spinner: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <Loader2 className={`animate-spin ${size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} text-current`} />
);

// Vitreous Card (Apple Style)
export const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties }> = ({ children, className = '', onClick, style }) => (
  <div 
    onClick={onClick} 
    className={`
      liquid-glass relative transition-all duration-300 group
      ${onClick ? 'cursor-pointer hover:bg-white/10 hover:-translate-y-[4px] active:scale-[0.98] active:translate-y-0' : ''} 
      ${className}
    `}
    style={style}
  >
    {/* Retained liquid glass styling without excessive interactive glow noise */}
    {/* Texture Overlay */}
    <div 
      className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        backgroundSize: '150px 150px'
      }}
    ></div>
    {children}
  </div>
);

// Sparkline Component (Ultra-lightweight dynamic SVG)
export const Sparkline: React.FC<{ data: number[]; width?: number; height?: number; color?: string }> = ({ data, width = 120, height = 36, color = '#F5C249' }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-80 overflow-visible">
      <defs>
        <filter id="glow-spark" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor={color} floodOpacity="0.4" />
        </filter>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        filter="url(#glow-spark)"
      />
    </svg>
  );
};

// Control Tile (iOS 26 Modular Grid)
export const ControlTile: React.FC<{
  title: string;
  value: string | React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  vibrant?: boolean;
  sparklineData?: number[];
  onClick?: () => void;
  className?: string;
}> = ({ title, value, subtitle, icon, vibrant = false, sparklineData, onClick, className = '' }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        relative p-5 flex flex-col justify-between transition-all duration-500 group
        ${vibrant ? 'liquid-glass-glow text-lux-gold border-lux-gold/30' : 'liquid-glass text-theme-text-primary hover:border-lux-gold/20'}
        hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.5)]
        ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}
        ${className}
      `}
    >
      {/* Texture Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: '150px 150px'
        }}
      ></div>

      <div className="flex justify-between items-start mb-4 relative z-10">
        {icon && (
          <div className={`
            p-2.5 rounded-2xl backdrop-blur-md shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3
            ${vibrant ? 'bg-lux-gold/20 text-lux-gold' : 'bg-theme-input-bg border border-theme-border text-theme-text-primary'}
          `}>
            {icon}
          </div>
        )}
        <span className="text-[10px] uppercase tracking-widest font-bold text-theme-text-secondary mt-1">{title}</span>
      </div>

      <div className="flex items-end justify-between gap-4 mt-2 relative z-10">
        <div>
          <div className="text-3xl font-serif font-bold tracking-tight mb-1 drop-shadow-sm group-hover:text-lux-gold transition-colors duration-300">{value}</div>
          {subtitle && <div className="text-xs text-theme-text-secondary font-medium transition-opacity group-hover:opacity-80">{subtitle}</div>}
        </div>
        {sparklineData && sparklineData.length > 0 && (
          <div className="pb-1 select-none pointer-events-none group-hover:scale-105 transition-transform duration-500">
            <Sparkline data={sparklineData} color={vibrant ? '#F5C249' : '#60A5FA'} />
          </div>
        )}
      </div>
    </div>
  );
};

// iOS-Style Segmented Control
export const SegmentedControl: React.FC<{
  options: { label: string; value: string }[];
  value: string;
  onChange: (val: any) => void;
}> = ({ options, value, onChange }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const index = options.findIndex(o => o.value === value);
    setActiveIndex(index !== -1 ? index : 0);
  }, [value, options]);

  useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth
        });
      }
    }
  }, [activeIndex, options]);

  return (
    <div className="relative bg-theme-input-bg p-1 rounded-full flex border border-theme-border backdrop-blur-md">
      <div 
        className="absolute top-1 bottom-1 bg-lux-gold rounded-full shadow-[0_2px_8px_rgba(245,194,73,0.3)] transition-all duration-300 ease-out z-0"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
      <div className="flex w-full relative z-10" ref={containerRef}>
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center transition-colors duration-200 ${isActive ? 'text-black' : 'text-theme-text-secondary hover:text-theme-text-primary'}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Standard Button
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ children, variant = 'primary', size = 'md', className = '', icon, loading, disabled, onClick, type = 'button', ...props }) => {
  
  const base = "inline-flex items-center justify-center rounded-2xl font-bold transition-all duration-300 focus:outline-none tracking-wide active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed select-none relative overflow-hidden touch-manipulation cursor-pointer z-10";
  const sizes = { sm: "px-5 py-2 text-[12px] h-9", md: "px-7 py-3 text-[14px] h-12", lg: "px-10 py-5 text-base h-14" };
  
  const variants = {
    primary: "bg-lux-gold text-[#16171D] font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),_0_2px_8px_rgba(245,194,73,0.15)] hover:bg-[#ffd66e]",
    secondary: "liquid-glass hover:bg-theme-table-hover text-theme-text-primary border-theme-border",
    danger: "bg-red-500/10 backdrop-blur-3xl text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-500",
    ghost: "bg-transparent text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-table-hover",
  };
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled && !loading) {
          if (onClick) onClick(e);
      }
  };
  
  return (
    <button type={type} onClick={handleClick} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : <> {icon && <span className="mr-2">{icon}</span>} {children} </>}
    </button>
  );
};

// Data Plate (Badge)
export const Badge: React.FC<{ children: React.ReactNode; color?: 'green' | 'blue' | 'amber' | 'red' | 'gray' }> = ({ children, color = 'gray' }) => {
  const colors = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    gray: 'bg-theme-input-bg text-theme-text-secondary border-theme-border',
  };
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${colors[color]} uppercase tracking-wider font-mono backdrop-blur-md`}>
      {children}
    </span>
  );
};

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case ProjectStatus.ACTIVE: return <Badge color="blue">Active</Badge>;
    case ProjectStatus.AWAITING_MANAGER: return <Badge color="amber">Review</Badge>;
    case ProjectStatus.CLOSED: return <Badge color="gray">Closed</Badge>;
    case BagStatus.ISSUED: return <Badge color="blue">Issued</Badge>;
    case BagStatus.RETURNED_PENDING_COUNT: return <Badge color="amber">Pending</Badge>;
    case BagStatus.COUNTED_CONFIRMED: return <Badge color="green">Complete</Badge>;
    default: return <Badge color="gray">{status}</Badge>;
  }
};

export const SetterAvatar: React.FC<{ name: string; color?: string; size?: 'sm' | 'md' | 'lg'; image?: string }> = ({ name, color, size = 'md', image }) => {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2);
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-[10px]' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-xs';
  
  if (image) return <img src={image} alt={name} className={`${sizeClasses} rounded-full object-cover ring-2 ring-white/5 shadow-lg`} />;
  
  return (
    <div className={`${sizeClasses} relative rounded-full flex items-center justify-center text-white font-bold ring-2 ring-theme-border overflow-hidden shadow-lg`} style={{ backgroundColor: color ? undefined : '#52525B' }}>
      {color && <div className="absolute inset-0 opacity-80" style={{backgroundColor: color}}></div>}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none"></div>
      <span className="relative z-10 font-mono tracking-tighter">{initials}</span>
    </div>
  );
};

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string, icon?: React.ReactNode }>(
  ({ label, icon, className = '', id, ...props }, ref) => {
    const defaultId = useId();
    const inputId = id || defaultId;
    return (
      <div className="w-full group">
        {label && (
          <label 
            htmlFor={inputId} 
            className="block text-[10px] font-bold text-theme-text-secondary mb-2 uppercase tracking-[0.2em] ml-1 transition-colors group-focus-within:text-lux-gold font-mono"
          >
            {label}
          </label>
        )}
        <div className="relative">
            {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-lux-gold transition-colors">{icon}</div>}
            <input 
              ref={ref}
              id={inputId}
              className={`
                  block w-full rounded-2xl glass-input
                  text-theme-text-primary placeholder-zinc-600 
                  text-base py-3.5 transition-all shadow-inner
                  ${icon ? 'pl-11 pr-4' : 'px-4'}
                  ${className}
              `} 
              style={{fontSize: '16px'}}
              {...props} 
            />
        </div>
      </div>
    );
  }
);
Input.displayName = 'Input';

export const ProgressBar: React.FC<{ progress: number; className?: string }> = ({ progress, className = '' }) => (
  <div className={`h-1.5 w-full bg-theme-input-bg border border-theme-border rounded-full overflow-hidden ${className}`}>
    <div 
      className="h-full bg-lux-gold transition-all duration-1000 ease-out rounded-full shadow-[0_0_15px_rgba(245,194,73,0.5)]" 
      style={{ width: `${Math.max(5, Math.min(100, progress))}%` }} 
    />
  </div>
);

export const ProjectMilestones: React.FC<{ currentPercent: number; currentStage?: string; className?: string }> = ({ currentPercent, currentStage = '', className = '' }) => {
  const steps = [
    { name: 'Intake', val: 10, label: 'Intake' },
    { name: 'Pre-Polish', val: 40, label: 'Pre-Polish' },
    { name: 'Setting', val: 70, label: 'Setting' },
    { name: 'QC/Polish', val: 90, label: 'QC' },
    { name: 'Complete', val: 100, label: 'Done' }
  ];

  // Find active step index based on name or percentage
  let activeIndex = -1;
  const stageLower = currentStage.toLowerCase();
  
  if (stageLower.includes('intake')) activeIndex = 0;
  else if (stageLower.includes('polish') && !stageLower.includes('qc')) activeIndex = 1;
  else if (stageLower.includes('setting')) activeIndex = 2;
  else if (stageLower.includes('qc') || stageLower.includes('quality')) activeIndex = 3;
  else if (stageLower.includes('complete') || stageLower.includes('closed')) activeIndex = 4;

  if (activeIndex === -1) {
    activeIndex = 0;
    for (let i = 0; i < steps.length; i++) {
      if (currentPercent >= steps[i].val) {
        activeIndex = i;
      }
    }
  }

  return (
    <div className={`flex items-center gap-1 w-full select-none ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx < activeIndex || (idx === activeIndex && currentPercent === 100);
        const isActive = idx === activeIndex && currentPercent < 100;
        const isFuture = idx > activeIndex;

        return (
          <React.Fragment key={step.name}>
            {/* Step Dot */}
            <div className="relative group/step flex flex-col items-center">
              <div 
                className={`
                  w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold transition-all duration-500 border
                  ${isCompleted ? 'bg-blue-500/20 border-blue-400 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.3)]' : ''}
                  ${isActive ? 'bg-lux-gold/20 border-lux-gold text-lux-gold shadow-[0_0_12px_rgba(245,194,73,0.5)] animate-pulse' : ''}
                  ${isFuture ? 'bg-theme-input-bg border border-theme-border text-theme-text-muted' : ''}
                `}
                title={`${step.label} (${step.val}%)`}
              >
                {isCompleted ? (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="scale-[0.8]">{idx + 1}</span>
                )}
              </div>
              
              {/* Tooltip */}
              <span className="absolute -top-7 bg-black/90 text-white border border-white/10 text-[9px] font-bold py-0.5 px-1.5 rounded opacity-0 pointer-events-none group-hover/step:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-xl">
                {step.label}
              </span>
            </div>

            {/* Connection Line */}
            {idx < steps.length - 1 && (
              <div className="flex-1 h-[2px] min-w-[6px] relative rounded-full overflow-hidden bg-theme-input-bg">
                <div 
                  className={`
                    h-full transition-all duration-1000 ease-out
                    ${isCompleted ? 'bg-blue-400' : ''}
                    ${isActive ? 'bg-gradient-to-r from-lux-gold to-theme-input-bg animate-pulse' : ''}
                    ${isFuture ? 'bg-theme-input-bg' : ''}
                  `}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, footer }) => {
  const titleId = useId();
  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md relative z-10"
          >
            <Card className="w-full shadow-2xl border-theme-border">
              <div className="p-6 border-b border-theme-border">
                <h2 id={titleId} className="text-xl font-bold text-theme-text-primary font-serif">{title}</h2>
              </div>
              <div className="p-6 text-theme-text-primary">
                {children}
              </div>
              {footer && (
                <div className="p-6 border-t border-theme-border flex justify-end gap-3 bg-theme-table-header/50">
                  {footer}
                </div>
              )}
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton rounded-2xl ${className}`} />
);
