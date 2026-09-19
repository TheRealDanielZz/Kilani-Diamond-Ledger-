import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, Priority, User, IssueRequest, DiamondBag, BagReturnTransaction } from '../types';
import { Flame, Inbox, PackageCheck, Layers, AlertCircle, ChevronRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface TodayAtAGlanceProps {
  currentUser: User;
  requests: IssueRequest[];
  returnBags: { bag: DiamondBag; tx?: BagReturnTransaction }[];
  onRequestClick?: () => void;
  onReturnClick?: () => void;
}

export const TodayAtAGlance: React.FC<TodayAtAGlanceProps> = ({
  currentUser,
  requests,
  returnBags,
  onRequestClick,
  onReturnClick,
}) => {
  const navigate = useNavigate();

  // Greeting based on current hour
  const { greeting, formattedDate } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    let greet = 'Good evening';
    if (hour >= 5 && hour < 12) {
      greet = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      greet = 'Good afternoon';
    }

    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    return { greeting: greet, formattedDate: dateStr };
  }, []);

  // Compute metrics from projects
  const metrics = useMemo(() => {
    const allProjects = store.getProjects();
    const activeProjects = allProjects.filter((p) => p.status === ProjectStatus.ACTIVE);

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

    // Rush active projects
    const rushProjects = activeProjects.filter((p) => p.priority === Priority.RUSH);
    
    // Overdue active projects (due date < today)
    const overdueProjects = activeProjects.filter((p) => {
      if (!p.dueDate) return false;
      const cleanDue = p.dueDate.split('T')[0];
      return cleanDue < todayStr;
    });

    // Soonest due active project
    const sortedUpcoming = [...activeProjects]
      .filter((p) => p.dueDate && p.dueDate.split('T')[0] >= todayStr)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    const nextDue = sortedUpcoming[0] || null;

    let daysUntilNext: number | null = null;
    if (nextDue && nextDue.dueDate) {
      const due = new Date(nextDue.dueDate.split('T')[0] + 'T00:00:00');
      const today = new Date(todayStr + 'T00:00:00');
      const diffTime = due.getTime() - today.getTime();
      daysUntilNext = Math.round(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      activeCount: activeProjects.length,
      rushCount: rushProjects.length,
      overdueCount: overdueProjects.length,
      firstOverdue: overdueProjects[0] || null,
      nextDue,
      daysUntilNext,
    };
  }, []);

  const firstName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Manager';

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-5 backdrop-blur-xl shadow-2xl mb-8 group transition-all duration-300">
      {/* Luxury gold & ambient glow */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-lux-gold/20 via-lux-gold/80 to-amber-400/20" />
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-lux-gold/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Row: Greeting & Current Date */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-lux-gold/10 border border-lux-gold/30 flex items-center justify-center text-lux-gold shadow-[0_0_15px_rgba(212,175,55,0.15)]">
            <Sparkles size={20} className="stroke-[1.75]" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white font-serif flex items-center gap-2">
              {greeting}, {firstName}
            </h2>
            <p className="text-[11px] font-mono font-medium tracking-wider uppercase text-zinc-400">
              Kilani Atelier · Live Pulse
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono font-medium text-zinc-300">
            {formattedDate}
          </div>
        </div>
      </div>

      {/* 4 Quick Stat Pills */}
      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* 1. Rush Projects */}
        <div
          onClick={() => {
            triggerHaptic('medium');
            navigate('/projects');
          }}
          className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between group/card ${
            metrics.rushCount > 0
              ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/15 hover:border-red-500/50 shadow-[0_4px_20px_rgba(239,68,68,0.1)]'
              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                metrics.rushCount > 0
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'bg-white/5 text-zinc-400'
              }`}
            >
              <Flame size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Rush Priority</div>
              <div className="text-lg font-bold tracking-tight text-white flex items-baseline gap-1">
                {metrics.rushCount}
                <span className="text-[10px] text-zinc-500 font-normal">active</span>
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-zinc-500 opacity-0 group-hover/card:opacity-100 transition-opacity" />
        </div>

        {/* 2. Diamond Requests */}
        <div
          onClick={() => {
            triggerHaptic('selection');
            if (onRequestClick) onRequestClick();
          }}
          className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between group/card ${
            requests.length > 0
              ? 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/15 hover:border-blue-500/50 shadow-[0_4px_20px_rgba(59,130,246,0.1)]'
              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                requests.length > 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-zinc-400'
              }`}
            >
              <Inbox size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Diamond Requests</div>
              <div className="text-lg font-bold tracking-tight text-white flex items-baseline gap-1">
                {requests.length}
                <span className="text-[10px] text-zinc-500 font-normal">pending</span>
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-zinc-500 opacity-0 group-hover/card:opacity-100 transition-opacity" />
        </div>

        {/* 3. Awaiting Count Returns */}
        <div
          onClick={() => {
            triggerHaptic('selection');
            if (onReturnClick) onReturnClick();
          }}
          className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between group/card ${
            returnBags.length > 0
              ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15 hover:border-amber-500/50 shadow-[0_4px_20px_rgba(245,158,11,0.1)]'
              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                returnBags.length > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-zinc-400'
              }`}
            >
              <PackageCheck size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Bag Returns</div>
              <div className="text-lg font-bold tracking-tight text-white flex items-baseline gap-1">
                {returnBags.length}
                <span className="text-[10px] text-zinc-500 font-normal">to verify</span>
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-zinc-500 opacity-0 group-hover/card:opacity-100 transition-opacity" />
        </div>

        {/* 4. Active Workshop Jobs */}
        <div
          onClick={() => {
            triggerHaptic('light');
            navigate('/projects');
          }}
          className="p-3.5 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-200 cursor-pointer flex items-center justify-between group/card"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Layers size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Bench Projects</div>
              <div className="text-lg font-bold tracking-tight text-white flex items-baseline gap-1">
                {metrics.activeCount}
                <span className="text-[10px] text-zinc-500 font-normal">active</span>
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-zinc-500 opacity-0 group-hover/card:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Bottom Alert Ribbon */}
      <div className="relative z-10 pt-2 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-400 gap-2">
        {metrics.overdueCount > 0 ? (
          <div
            onClick={() => {
              triggerHaptic('warning');
              if (metrics.firstOverdue) navigate(`/project/${metrics.firstOverdue.id}`);
            }}
            className="flex items-center gap-2 text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20 cursor-pointer hover:bg-rose-500/20 transition-all duration-200"
          >
            <AlertCircle size={14} className="animate-pulse" />
            <span className="font-semibold">
              {metrics.overdueCount} project{metrics.overdueCount > 1 ? 's' : ''} past target due date
            </span>
            {metrics.firstOverdue && (
              <span className="text-[11px] text-zinc-400 underline decoration-rose-400/50">
                (View {metrics.firstOverdue.code})
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
            <CheckCircle2 size={14} />
            <span className="font-medium">All atelier deadlines are currently on schedule</span>
          </div>
        )}

        {metrics.nextDue && (
          <div
            onClick={() => {
              triggerHaptic('light');
              navigate(`/project/${metrics.nextDue!.id}`);
            }}
            className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white cursor-pointer transition-colors px-1"
          >
            <span>Next deadline:</span>
            <span className="font-bold text-lux-gold">{metrics.nextDue.code}</span>
            <span>
              {metrics.daysUntilNext === 0
                ? '(Due today)'
                : metrics.daysUntilNext === 1
                ? '(Tomorrow)'
                : `(in ${metrics.daysUntilNext} days)`}
            </span>
            <ChevronRight size={12} />
          </div>
        )}
      </div>
    </div>
  );
};
