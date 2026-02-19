
import React, { useEffect, useState, useRef } from 'react';
import { ProjectStatus, BagStatus } from '../types';
import { Loader2 } from 'lucide-react';

// Toast Component (Floating Glass)
export const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => { 
      const t = setTimeout(onClose, 3000); return () => clearTimeout(t); 
  }, [onClose]);
  
  return (
    <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[150] animate-enter w-auto max-w-[90%]">
      <div className="bg-[#16171D]/90 backdrop-blur-2xl text-white px-6 py-4 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.5)] border border-white/10 flex items-center gap-3 ring-1 ring-white/5">
        <div className="w-2 h-2 rounded-full bg-lux-gold shadow-[0_0_10px_#F5C249] animate-pulse"></div>
        <span className="font-medium text-[13px] tracking-wide">{message}</span>
      </div>
    </div>
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
      backdrop-blur-3xl bg-[#1F2128]/80 border border-white/5 rounded-[24px] relative overflow-hidden transition-all duration-300 group
      ${onClick ? 'cursor-pointer hover:bg-[#252832] hover:-translate-y-[2px] active:scale-[0.99] active:translate-y-0' : ''} 
      ${className}
    `}
    style={{ 
      boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)', 
      ...style 
    }}
  >
    {/* Specular Highlight (Top Edge) */}
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50"></div>
    {children}
  </div>
);

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
    <div className="relative bg-black/20 p-1 rounded-full flex border border-white/5 backdrop-blur-md">
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
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center transition-colors duration-200 ${isActive ? 'text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
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
  
  const base = "inline-flex items-center justify-center rounded-2xl font-medium transition-all duration-200 focus:outline-none tracking-wide active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed select-none relative overflow-hidden touch-manipulation cursor-pointer z-10";
  const sizes = { sm: "px-4 py-2 text-[13px] h-9", md: "px-6 py-3 text-sm h-12", lg: "px-8 py-4 text-base h-14" };
  
  const variants = {
    primary: "bg-lux-gold text-[#16171D] font-bold shadow-[0_0_20px_rgba(245,194,73,0.2)] hover:shadow-[0_0_25px_rgba(245,194,73,0.4)] hover:bg-[#ffd66e]",
    secondary: "bg-white/5 backdrop-blur-md text-white border border-white/10 hover:bg-white/10 hover:border-white/20",
    danger: "bg-red-500/10 backdrop-blur-md text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300",
    ghost: "bg-transparent text-zinc-400 hover:text-white hover:bg-white/5",
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
    gray: 'bg-white/5 text-zinc-400 border-white/10',
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
    <div className={`${sizeClasses} relative rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white/5 overflow-hidden shadow-lg`} style={{ backgroundColor: color ? undefined : '#52525B' }}>
      {color && <div className="absolute inset-0 opacity-80" style={{backgroundColor: color}}></div>}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none"></div>
      <span className="relative z-10 font-mono tracking-tighter">{initials}</span>
    </div>
  );
};

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string, icon?: React.ReactNode }>(
  ({ label, icon, className = '', ...props }, ref) => (
  <div className="w-full group">
    {label && <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-white">{label}</label>}
    <div className="relative">
        {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-lux-gold transition-colors">{icon}</div>}
        <input 
        ref={ref}
        className={`
            block w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl
            text-white placeholder-zinc-600 
            focus:border-lux-gold/50 focus:ring-4 focus:ring-lux-gold/10 focus:bg-white/10
            text-base py-3.5 transition-all shadow-inner outline-none
            ${icon ? 'pl-11 pr-4' : 'px-4'}
            ${className}
        `} 
        style={{fontSize: '16px'}}
        {...props} 
        />
    </div>
  </div>
));
Input.displayName = 'Input';

export const ProgressBar: React.FC<{ progress: number; className?: string }> = ({ progress, className = '' }) => (
  <div className={`h-1.5 w-full bg-white/5 border border-white/5 rounded-full overflow-hidden ${className}`}>
    <div 
      className="h-full bg-lux-gold transition-all duration-1000 ease-out rounded-full shadow-[0_0_15px_rgba(245,194,73,0.5)]" 
      style={{ width: `${Math.max(5, Math.min(100, progress))}%` }} 
    />
  </div>
);
