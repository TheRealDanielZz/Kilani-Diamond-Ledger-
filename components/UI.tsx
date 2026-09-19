import React, { useEffect, useState, useRef, useId } from 'react';
import { ProjectStatus, BagStatus } from '../types';
import { Loader2, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';

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

// Sparkline Component (Ultra-lightweight dynamic SVG with unique filterId)
export const Sparkline: React.FC<{ data: number[]; width?: number; height?: number; color?: string }> = ({ data, width = 120, height = 36, color = '#F5C249' }) => {
  const rawId = useId();
  const filterId = `glow-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-85 overflow-visible">
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor={color} floodOpacity="0.35" />
        </filter>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        filter={`url(#${filterId})`}
      />
    </svg>
  );
};

// Control Tile (iOS 26 Modular Grid / Executive KPI)
export const ControlTile: React.FC<{
  title: string;
  value: string | React.ReactNode;
  subtitle?: string;
  badge?: React.ReactNode;
  trend?: { value: string; positive?: boolean };
  icon?: React.ReactNode;
  vibrant?: boolean;
  sparklineData?: number[];
  onClick?: () => void;
  className?: string;
}> = ({ title, value, subtitle, badge, trend, icon, vibrant = false, sparklineData, onClick, className = '' }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        relative p-5 rounded-2xl flex flex-col justify-between transition-all duration-300 group
        ${vibrant ? 'liquid-glass-glow text-lux-gold border-lux-gold/30' : 'liquid-glass text-theme-text-primary hover:border-lux-gold/30'}
        hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)]
        ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}
        ${className}
      `}
    >
      {/* Texture Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay rounded-2xl"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: '150px 150px'
        }}
      ></div>

      <div className="flex justify-between items-start mb-3 relative z-10">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className={`
              p-2.5 rounded-2xl backdrop-blur-md shadow-inner transition-transform duration-300 group-hover:scale-105
              ${vibrant ? 'bg-lux-gold/20 text-lux-gold' : 'bg-theme-input-bg border border-theme-border text-theme-text-primary'}
            `}>
              {icon}
            </div>
          )}
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-theme-text-secondary font-mono">{title}</span>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      <div className="flex items-end justify-between gap-4 mt-1 relative z-10">
        <div className="min-w-0">
          <div className="text-2xl sm:text-3xl font-mono tabular-nums font-black tracking-tight mb-1 drop-shadow-sm group-hover:text-lux-gold transition-colors duration-300 truncate">
            {value}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {trend && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full border ${
                trend.positive !== false
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                {trend.value}
              </span>
            )}
            {subtitle && <span className="text-xs text-theme-text-secondary font-medium truncate">{subtitle}</span>}
          </div>
        </div>
        {sparklineData && sparklineData.length > 0 && (
          <div className="pb-1 select-none pointer-events-none group-hover:scale-105 transition-transform duration-300 shrink-0">
            <Sparkline data={sparklineData} color={vibrant ? '#F5C249' : '#60A5FA'} />
          </div>
        )}
      </div>
    </div>
  );
};

// iOS-Style Segmented Control (GPU-accelerated transform)
export const SegmentedControl: React.FC<{
  options: { label: string; value: string }[];
  value: string;
  onChange: (val: any) => void;
}> = ({ options, value, onChange }) => {
  const activeIndex = Math.max(0, options.findIndex(o => o.value === value));
  const optionWidthPercent = options.length > 0 ? 100 / options.length : 100;

  return (
    <div className="relative bg-theme-input-bg p-1 rounded-full flex border border-theme-border backdrop-blur-md overflow-hidden">
      <div 
        className="absolute top-1 bottom-1 bg-lux-gold rounded-full shadow-[0_2px_8px_rgba(245,194,73,0.3)] transition-transform duration-300 ease-out z-0 pointer-events-none"
        style={{ 
          width: `calc(${optionWidthPercent}% - 4px)`, 
          transform: `translateX(calc(${activeIndex * 100}% + 2px))` 
        }}
      />
      <div className="flex w-full relative z-10">
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (!isActive) triggerHaptic('selection');
                onChange(opt.value);
              }}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center transition-colors duration-200 cursor-pointer min-h-[36px] ${isActive ? 'text-black' : 'text-theme-text-secondary hover:text-theme-text-primary'}`}
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
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ children, variant = 'primary', size = 'md', className = '', icon, loading, disabled, onClick, type = 'button', ...props }) => {
  
  const base = "inline-flex items-center justify-center rounded-2xl font-bold transition-all duration-300 focus:outline-none tracking-wide active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed select-none relative overflow-hidden touch-manipulation cursor-pointer min-h-[44px] z-10";
  const sizes = { sm: "px-5 py-2 text-[12px] h-10", md: "px-7 py-3 text-[14px] h-12", lg: "px-10 py-5 text-base h-14" };
  
  const variants = {
    primary: "bg-lux-gold text-black shadow-glow hover:shadow-glow-hover hover:bg-[#ffcf5c]",
    secondary: "bg-white/5 backdrop-blur-md text-theme-text-primary border border-theme-border hover:bg-white/10",
    danger: "bg-red-500/10 backdrop-blur-md text-red-400 border border-red-500/20 hover:bg-red-500/20",
    ghost: "bg-transparent text-theme-text-secondary hover:text-theme-text-primary hover:bg-white/5",
    outline: "bg-transparent text-theme-text-primary border border-theme-border hover:bg-white/5",
  };
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled && !loading) {
          triggerHaptic(variant === 'danger' ? 'warning' : variant === 'primary' ? 'medium' : 'light');
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
    case 'OPEN': return <Badge color="blue">Open</Badge>;
    case 'CANCELLED': return <Badge color="red">Cancelled</Badge>;
    case 'FULFILLED': return <Badge color="green">Fulfilled</Badge>;
    case 'PARTIALLY_FULFILLED_CLOSED': return <Badge color="amber">Partial</Badge>;
    default: return <Badge color="gray">{status}</Badge>;
  }
};

export const SetterAvatar: React.FC<{ name: string; color?: string; size?: 'sm' | 'md' | 'lg'; image?: string }> = ({ name, color, size = 'md', image }) => {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2);
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-[10px]' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-xs';
  
  if (image) return <img src={image} alt={name} loading="lazy" decoding="async" className={`${sizeClasses} rounded-full object-cover ring-2 ring-white/5 shadow-lg`} />;
  
  return (
    <div className={`${sizeClasses} relative rounded-full flex items-center justify-center text-white font-bold ring-2 ring-theme-border overflow-hidden shadow-lg`} style={{ backgroundColor: color ? undefined : '#52525B' }}>
      {color && <div className="absolute inset-0 opacity-80" style={{backgroundColor: color}}></div>}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none"></div>
      <span className="relative z-10 font-mono tracking-tighter">{initials}</span>
    </div>
  );
};

// Unified Field Label
export const FieldLabel: React.FC<{
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}> = ({ htmlFor, children, required, className = '' }) => (
  <label
    htmlFor={htmlFor}
    className={`field-label block text-[10px] font-bold text-theme-text-secondary mb-2 uppercase tracking-[0.2em] ml-1 transition-colors group-focus-within:text-lux-gold font-mono ${className}`}
  >
    {children}
    {required && <span className="text-lux-gold ml-1" title="Required">*</span>}
  </label>
);

// Unified Input Field
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { 
  label?: string; 
  icon?: React.ReactNode; 
  error?: string; 
  hint?: string;
}>(
  ({ label, icon, className = '', id, error, hint, required, ...props }, ref) => {
    const defaultId = useId();
    const inputId = id || defaultId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;

    const describedBy = [
      hint ? hintId : null,
      error ? errorId : null,
      props['aria-describedby'] || null
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full group field-container">
        {label && (
          <FieldLabel htmlFor={inputId} required={required}>
            {label}
          </FieldLabel>
        )}
        <div className="relative">
            {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-lux-gold transition-colors">{icon}</div>}
            <input 
              ref={ref}
              id={inputId}
              required={required}
              aria-describedby={describedBy}
              aria-invalid={error ? 'true' : undefined}
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
        {hint && !error && (
          <p id={hintId} className="text-[11px] text-theme-text-muted mt-1.5 ml-1">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-[11px] text-red-400 mt-1.5 ml-1 flex items-center gap-1 font-medium animate-in fade-in">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

// Unified Textarea Field
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
}>(
  ({ label, className = '', id, error, hint, required, rows = 3, ...props }, ref) => {
    const defaultId = useId();
    const textareaId = id || defaultId;
    const hintId = `${textareaId}-hint`;
    const errorId = `${textareaId}-error`;

    const describedBy = [
      hint ? hintId : null,
      error ? errorId : null,
      props['aria-describedby'] || null
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full group field-container">
        {label && (
          <FieldLabel htmlFor={textareaId} required={required}>
            {label}
          </FieldLabel>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          required={required}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          className={`
            block w-full rounded-2xl glass-input
            text-theme-text-primary placeholder-zinc-600 
            text-base p-4 transition-all shadow-inner resize-none
            focus:ring-lux-gold focus:border-lux-gold
            ${className}
          `}
          style={{ fontSize: '16px' }}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-[11px] text-theme-text-muted mt-1.5 ml-1">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-[11px] text-red-400 mt-1.5 ml-1 flex items-center gap-1 font-medium animate-in fade-in">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

// Unified Select Field
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}>(
  ({ label, icon, className = '', id, error, hint, required, children, ...props }, ref) => {
    const defaultId = useId();
    const selectId = id || defaultId;
    const hintId = `${selectId}-hint`;
    const errorId = `${selectId}-error`;

    const describedBy = [
      hint ? hintId : null,
      error ? errorId : null,
      props['aria-describedby'] || null
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full group field-container">
        {label && (
          <FieldLabel htmlFor={selectId} required={required}>
            {label}
          </FieldLabel>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-lux-gold transition-colors pointer-events-none">
              {icon}
            </div>
          )}
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={error ? 'true' : undefined}
            className={`
              block w-full rounded-2xl glass-input
              text-theme-text-primary text-base py-3.5 transition-all shadow-inner
              appearance-none cursor-pointer
              ${icon ? 'pl-11 pr-10' : 'pl-4 pr-10'}
              ${className}
            `}
            style={{ fontSize: '16px' }}
            {...props}
          >
            {children}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
            <ChevronDown size={16} />
          </div>
        </div>
        {hint && !error && (
          <p id={hintId} className="text-[11px] text-theme-text-muted mt-1.5 ml-1">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-[11px] text-red-400 mt-1.5 ml-1 flex items-center gap-1 font-medium animate-in fade-in">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <dialog 
          ref={dialogRef}
          className="native-modal"
          aria-modal="true"
          aria-labelledby={titleId}
          onCancel={(e) => {
            e.preventDefault();
            onClose();
          }}
          onClick={handleBackdropClick}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md relative mx-auto my-auto"
            onClick={(e) => e.stopPropagation()}
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
        </dialog>
      )}
    </AnimatePresence>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton rounded-2xl ${className}`} />
);

// Unified Section Title
export const SectionTitle: React.FC<{
  icon?: React.ReactNode;
  title: string;
  className?: string;
}> = ({ icon, title, className = '' }) => (
  <div className={`flex items-center gap-2 text-lux-gold ${className}`}>
    {icon}
    <h3 className="text-xs font-bold text-theme-text-secondary uppercase tracking-widest font-mono">
      {title}
    </h3>
  </div>
);

// Unified Selection Chip
export const SelectionChip: React.FC<{
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  className?: string;
}> = ({ selected, onClick, icon, label, badge, className = '' }) => {
  const handleClick = () => {
    triggerHaptic('selection');
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        flex items-center gap-2 px-3.5 py-3 rounded-2xl border text-xs font-bold
        transition-all active:scale-[0.97]
        ${selected
          ? 'bg-lux-gold/15 border-lux-gold text-lux-gold shadow-[0_0_15px_rgba(245,194,73,0.2)]'
          : 'bg-theme-input-bg border-theme-border text-theme-text-muted hover:border-lux-gold/40 hover:text-theme-text-primary'
        }
        ${className}
      `}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
      {badge && <span className="ml-auto shrink-0">{badge}</span>}
    </button>
  );
};

// Modal Header
export const ModalHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: string;
  onClose: () => void;
}> = ({ title, subtitle, icon, badge, onClose }) => (
  <div className="px-6 py-4.5 border-b border-theme-border flex items-center justify-between shrink-0 bg-theme-modal-bg/95 backdrop-blur-md">
    <div className="flex items-center gap-3">
      {icon && (
        <div className="w-10 h-10 rounded-2xl bg-lux-gold/15 border border-lux-gold/30 flex items-center justify-center text-lux-gold shadow-[0_0_15px_rgba(245,194,73,0.2)] shrink-0">
          {icon}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-theme-text-primary text-base md:text-lg tracking-tight">
            {title}
          </h3>
          {badge && (
            <span className="px-2.5 py-0.5 rounded-full bg-lux-gold/15 border border-lux-gold/35 font-mono font-black text-xs text-lux-gold shadow-sm">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-theme-text-muted font-medium mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    <button
      type="button"
      onClick={onClose}
      className="w-9 h-9 rounded-xl bg-theme-input-bg border border-theme-border flex items-center justify-center text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-row-hover transition-all active:scale-95 shrink-0"
      aria-label="Close modal"
    >
      <X size={18} />
    </button>
  </div>
);

// Unified Modal Shell (Apple-grade spring physics, bottom-sheet on mobile, centered on desktop)
const MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-5xl'
};

export const ModalShell: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  className?: string;
  fullHeight?: boolean;
}> = ({
  isOpen,
  onClose,
  size = 'lg',
  children,
  className = '',
  fullHeight = false
}) => {
  // ESC key support
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const isWide = size === 'xl';

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className={`fixed inset-0 z-[110] flex ${
            isWide ? 'items-center p-3 sm:p-6' : 'items-end md:items-center p-0 md:p-4'
          } justify-center overflow-hidden`}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={isWide ? { opacity: 0, scale: 0.95 } : { y: '100%', opacity: 0, scale: 0.96 }}
            animate={isWide ? { opacity: 1, scale: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={isWide ? { opacity: 0, scale: 0.95 } : { y: '100%', opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className={`
              relative z-10 w-full ${MODAL_SIZES[size]}
              bg-theme-modal-bg border-t md:border border-lux-gold/30
              ${isWide ? 'rounded-3xl shadow-2xl' : 'rounded-t-[28px] md:rounded-[28px] shadow-[0_0_60px_rgba(245,194,73,0.15)]'}
              ${fullHeight ? 'h-[90vh]' : 'max-h-[92vh]'}
              flex flex-col overflow-hidden transition-colors
              ${className}
            `}
          >
            {/* Mobile Drag Indicator (for bottom sheets) */}
            {!isWide && (
              <div className="w-12 h-1.5 rounded-full bg-lux-gold/40 mx-auto mt-3 mb-1 md:hidden shrink-0" />
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
