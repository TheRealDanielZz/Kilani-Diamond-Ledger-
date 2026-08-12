import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import {
  Briefcase,
  CalendarClock,
  ChevronRight,
  Diamond,
  Download,
  Edit2,
  FileDown,
  Gem,
  Info,
  PackageCheck,
  PackageOpen,
  PieChart,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  ArrowLeft,
  X,
} from 'lucide-react';
import { SetterAvatar } from '../UI';
import { store } from '../../services/store';
import {
  STAFF_PERFORMANCE_TIME_ZONE,
  STAFF_PERFORMANCE_TRACKING_START,
  StaffPerformanceSnapshot,
  buildStaffPerformance,
  buildTeamOverviewMetrics,
  TeamOverviewMetrics,
} from '../../services/staffPerformance';
import { generateTeamMemberPDF, generateTeamMemberCSV } from '../../utils/teamExportGenerator';
import { Role, User, StaffPerformanceOverride } from '../../types';
import { useToast } from '../../App';

type RoleFilter = 'ALL' | Role.SETTER | Role.JEWELLER;
type ProfileTab = 'overview' | 'projects' | 'bags' | 'diamonds';

const formatInteger = (value: number) => Math.round(value).toLocaleString('en-CA');
const formatCarats = (value: number) => `${value.toFixed(3)} ct`;

const formatTorontoDate = (value: string | null, includeTime = false) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STAFF_PERFORMANCE_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
};

const trackingStartLabel = formatTorontoDate(STAFF_PERFORMANCE_TRACKING_START);

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  accent?: 'gold' | 'blue' | 'emerald' | 'violet';
  onEdit?: () => void;
  isOverridden?: boolean;
  originalValue?: string;
}> = ({ icon, label, value, note, accent = 'gold', onEdit, isOverridden, originalValue }) => {
  const accents = {
    gold: 'text-lux-gold bg-lux-gold/10 border-lux-gold/20',
    blue: 'text-blue-300 bg-blue-500/10 border-blue-400/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20',
    violet: 'text-violet-300 bg-violet-500/10 border-violet-400/20',
  };
  return (
    <div className={`liquid-glass min-h-[132px] rounded-[1.75rem] p-5 flex flex-col justify-between border transition-all duration-300 relative group ${isOverridden ? 'border-amber-400/40 bg-amber-400/[0.04]' : 'border-theme-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-secondary truncate">{label}</span>
          {isOverridden && (
            <span
              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0 cursor-help"
              title={`Manually overridden (Original calc: ${originalValue || 'N/A'})`}
            >
              Overridden
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="w-7 h-7 rounded-lg border border-theme-border bg-theme-input-bg text-theme-text-secondary hover:text-lux-gold hover:border-lux-gold/40 transition-colors flex items-center justify-center opacity-80 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
              title={`Edit ${label}`}
              aria-label={`Edit ${label}`}
            >
              <Edit2 size={13} />
            </button>
          )}
          <span className={`w-9 h-9 rounded-xl border flex items-center justify-center ${accents[accent]}`}>{icon}</span>
        </div>
      </div>
      <div>
        <div className="font-serif text-3xl font-bold text-theme-text-primary tracking-tight">{value}</div>
        <p className="text-[11px] text-theme-text-secondary mt-1">{note}</p>
      </div>
    </div>
  );
};

const MiniTrend: React.FC<{ snapshot: StaffPerformanceSnapshot }> = ({ snapshot }) => {
  const max = Math.max(0.001, ...snapshot.monthly.map(month => month.estimatedCaratsSet));
  return (
    <div
      className="h-12 flex items-end gap-1.5"
      role="img"
      aria-label={`Six-month estimated carat activity for ${snapshot.user.name}`}
    >
      {snapshot.monthly.map(month => (
        <div
          key={month.key}
          className="flex-1 rounded-t-sm bg-lux-gold/20 overflow-hidden h-full flex items-end"
          title={`${month.label}: ${formatCarats(month.estimatedCaratsSet)}`}
        >
          <div
            className="w-full rounded-t-sm bg-gradient-to-t from-lux-gold/60 to-lux-gold transition-[height] duration-500 motion-reduce:transition-none"
            style={{ height: `${Math.max(4, (month.estimatedCaratsSet / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; message: string }> = ({ icon, title, message }) => (
  <div className="rounded-[1.75rem] border border-dashed border-theme-border bg-theme-input-bg/30 px-6 py-12 text-center">
    <div className="w-12 h-12 rounded-2xl bg-theme-input-bg border border-theme-border text-theme-text-secondary mx-auto mb-4 flex items-center justify-center">
      {icon}
    </div>
    <h4 className="font-bold text-theme-text-primary">{title}</h4>
    <p className="text-sm text-theme-text-secondary mt-2 max-w-md mx-auto">{message}</p>
  </div>
);

const MonthlyChart: React.FC<{ snapshot: StaffPerformanceSnapshot }> = ({ snapshot }) => {
  const max = Math.max(0.001, ...snapshot.monthly.map(month => month.estimatedCaratsSet));
  return (
    <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-8">
        <div>
          <h4 className="font-bold text-theme-text-primary">Estimated carats by month</h4>
          <p className="text-xs text-theme-text-secondary mt-1">Confirmed returns, grouped in Toronto time.</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-lux-gold border border-lux-gold/20 bg-lux-gold/10 rounded-full px-3 py-1.5 w-fit">
          Since {trackingStartLabel}
        </span>
      </div>
      <div className="h-48 grid grid-cols-6 gap-2 sm:gap-4 items-end" role="img" aria-label={`Monthly estimated carats set by ${snapshot.user.name}`}>
        {snapshot.monthly.map(month => (
          <div key={month.key} className="h-full flex flex-col justify-end items-center gap-2 min-w-0">
            <span className="text-[10px] sm:text-xs font-mono text-theme-text-primary truncate max-w-full">
              {month.estimatedCaratsSet > 0 ? month.estimatedCaratsSet.toFixed(2) : '0'}
            </span>
            <div className="h-[126px] w-full max-w-12 rounded-xl bg-theme-input-bg border border-theme-border flex items-end overflow-hidden">
              <div
                className="w-full bg-gradient-to-t from-[#b87b13] via-lux-gold to-[#ffe7a3] rounded-t-xl transition-[height] duration-500 motion-reduce:transition-none"
                style={{ height: `${month.estimatedCaratsSet > 0 ? Math.max(8, (month.estimatedCaratsSet / max) * 100) : 0}%` }}
              />
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase text-theme-text-secondary">{month.label}</div>
              <div className="text-[9px] text-theme-text-secondary mt-0.5">{formatInteger(month.stonesSet)} stones</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* --- Visual KPI Cards for Team Overview --- */
const TeamOverviewKPIs: React.FC<{ overview: TeamOverviewMetrics }> = ({ overview }) => {
  const maxMonthlyOutput = Math.max(0.001, ...overview.monthlyTeamTrend.map(m => m.estimatedCaratsSet));
  const totalRoleProjects = Math.max(1, overview.setterActiveProjects + overview.jewellerActiveProjects);
  const setterPercent = Math.round((overview.setterActiveProjects / totalRoleProjects) * 100);
  const jewellerPercent = 100 - setterPercent;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Team Capacity */}
      <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-5 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-secondary">Team Capacity</span>
          <span className="w-9 h-9 rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300 flex items-center justify-center">
            <Users size={18} />
          </span>
        </div>
        <div className="mt-3">
          <div className="font-serif text-2xl sm:text-3xl font-bold text-theme-text-primary tracking-tight">
            {overview.totalActiveProjects} <span className="text-sm font-sans font-normal text-theme-text-secondary">projects</span> / {overview.totalTeamMembers} <span className="text-sm font-sans font-normal text-theme-text-secondary">members</span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-theme-text-secondary">
              <span>Capacity utilization</span>
              <span>{overview.assignedTeamMembersCount} of {overview.totalTeamMembers} active</span>
            </div>
            <div className="h-2 w-full rounded-full bg-theme-input-bg overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${overview.totalTeamMembers > 0 ? (overview.assignedTeamMembersCount / overview.totalTeamMembers) * 100 : 0}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-theme-text-secondary mt-2">Avg {overview.avgProjectsPerMember} active projects per member</p>
        </div>
      </div>

      {/* 2. Bag Status Distribution */}
      <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-5 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-secondary">Bag Status</span>
          <span className="w-9 h-9 rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300 flex items-center justify-center">
            <PackageOpen size={18} />
          </span>
        </div>
        <div className="mt-3">
          <div className="font-serif text-2xl sm:text-3xl font-bold text-theme-text-primary tracking-tight">
            {overview.totalBagsInHand} <span className="text-sm font-sans font-normal text-violet-300">In Hand</span> / {overview.totalPendingReturn} <span className="text-sm font-sans font-normal text-amber-300">Pending</span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-theme-text-secondary">
              <span className="text-violet-300">In Hand ({overview.inHandPercentage}%)</span>
              <span className="text-amber-300">Pending ({overview.pendingPercentage}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-theme-input-bg overflow-hidden flex gap-0.5">
              <div
                className="h-full bg-violet-400 rounded-l-full transition-all duration-500"
                style={{ width: `${overview.inHandPercentage}%` }}
              />
              <div
                className="h-full bg-amber-400 rounded-r-full transition-all duration-500"
                style={{ width: `${overview.pendingPercentage}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-theme-text-secondary mt-2">{overview.totalOutstandingBags} total bags across active team members</p>
        </div>
      </div>

      {/* 3. Confirmed Output Trend */}
      <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-5 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-secondary">Confirmed Output</span>
          <span className="w-9 h-9 rounded-xl border border-lux-gold/20 bg-lux-gold/10 text-lux-gold flex items-center justify-center">
            <Diamond size={18} />
          </span>
        </div>
        <div className="mt-3">
          <div className="font-serif text-2xl sm:text-3xl font-bold text-theme-text-primary tracking-tight">
            {formatInteger(overview.totalStonesSetSinceTracking)} <span className="text-xs font-sans text-theme-text-secondary">stones</span>
          </div>
          <div className="mt-3 h-7 flex items-end gap-1" role="img" aria-label="Team 6-month output trend">
            {overview.monthlyTeamTrend.map(month => (
              <div key={month.key} className="flex-1 bg-lux-gold/20 rounded-t-sm h-full flex items-end overflow-hidden" title={`${month.label}: ${month.estimatedCaratsSet.toFixed(2)} ct`}>
                <div
                  className="w-full bg-lux-gold rounded-t-sm transition-all duration-500"
                  style={{ height: `${Math.max(8, (month.estimatedCaratsSet / maxMonthlyOutput) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-theme-text-secondary mt-2">{overview.totalEstimatedCaratsSinceTracking.toFixed(2)} ct est. since {trackingStartLabel}</p>
        </div>
      </div>

      {/* 4. Workload Mix */}
      <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-5 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-secondary">Workload Mix</span>
          <span className="w-9 h-9 rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 flex items-center justify-center">
            <Briefcase size={18} />
          </span>
        </div>
        <div className="mt-3">
          <div className="font-serif text-2xl sm:text-3xl font-bold text-theme-text-primary tracking-tight">
            {overview.setterActiveProjects} <span className="text-xs font-sans text-blue-300">Setter</span> vs {overview.jewellerActiveProjects} <span className="text-xs font-sans text-emerald-300">Jeweller</span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-theme-text-secondary">
              <span className="text-blue-300">Setters ({setterPercent}%)</span>
              <span className="text-emerald-300">Jewellers ({jewellerPercent}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-theme-input-bg overflow-hidden flex gap-0.5">
              <div
                className="h-full bg-blue-400 rounded-l-full transition-all duration-500"
                style={{ width: `${setterPercent}%` }}
              />
              <div
                className="h-full bg-emerald-400 rounded-r-full transition-all duration-500"
                style={{ width: `${jewellerPercent}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-theme-text-secondary mt-2">{overview.setterCount} Setters &amp; {overview.jewellerCount} Jewellers active</p>
        </div>
      </div>
    </div>
  );
};

/* --- Edit Metrics Modal --- */
const EditMetricsModal: React.FC<{
  snapshot: StaffPerformanceSnapshot;
  onClose: () => void;
  onSave: (overrides: StaffPerformanceOverride | null) => Promise<void>;
}> = ({ snapshot, onClose, onSave }) => {
  const overrides = snapshot.user.performanceOverrides || {};
  const orig = snapshot.originalCalculated;

  const [activeProjectCount, setActiveProjectCount] = useState<string>(
    overrides.activeProjectCount !== undefined && overrides.activeProjectCount !== null
      ? String(overrides.activeProjectCount)
      : String(snapshot.activeProjectCount)
  );
  const [bagsInHandCount, setBagsInHandCount] = useState<string>(
    overrides.bagsInHandCount !== undefined && overrides.bagsInHandCount !== null
      ? String(overrides.bagsInHandCount)
      : String(snapshot.bagsInHandCount)
  );
  const [stonesSet, setStonesSet] = useState<string>(
    overrides.stonesSet !== undefined && overrides.stonesSet !== null
      ? String(overrides.stonesSet)
      : String(snapshot.stonesSetSinceTracking)
  );
  const [currentMonthEstimatedCarats, setCurrentMonthEstimatedCarats] = useState<string>(
    overrides.currentMonthEstimatedCarats !== undefined && overrides.currentMonthEstimatedCarats !== null
      ? String(overrides.currentMonthEstimatedCarats)
      : String(snapshot.currentMonthEstimatedCarats)
  );
  const [reason, setReason] = useState<string>(overrides.reason || '');
  const [isSaving, setIsSaving] = useState(false);
  const showToast = useToast();

  const handleSave = async () => {
    if (!reason.trim()) {
      showToast('A reason is required to record metric overrides.');
      return;
    }
    setIsSaving(true);
    try {
      const parsedProj = parseInt(activeProjectCount, 10);
      const parsedBags = parseInt(bagsInHandCount, 10);
      const parsedStones = parseInt(stonesSet, 10);
      const parsedCarats = parseFloat(currentMonthEstimatedCarats);

      await onSave({
        activeProjectCount: isNaN(parsedProj) ? null : parsedProj,
        bagsInHandCount: isNaN(parsedBags) ? null : parsedBags,
        stonesSet: isNaN(parsedStones) ? null : parsedStones,
        currentMonthEstimatedCarats: isNaN(parsedCarats) ? null : parsedCarats,
        reason: reason.trim(),
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (e: any) {
      showToast(e?.message || 'Failed to save overrides.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      await onSave(null);
      onClose();
    } catch (e: any) {
      showToast(e?.message || 'Failed to reset metrics.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg liquid-glass rounded-3xl border border-lux-gold/30 bg-[#121318] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-theme-border pb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-lux-gold">Manager Override</div>
            <h3 className="text-xl font-bold text-white font-serif mt-0.5">Edit Card Metrics · {snapshot.user.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-theme-border bg-theme-input-bg text-theme-text-secondary hover:text-white flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-theme-text-primary mb-1">
              Current Projects (Active Assignments)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={activeProjectCount}
                onChange={e => setActiveProjectCount(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-theme-border bg-theme-input-bg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lux-gold"
              />
              <span className="text-[10px] text-theme-text-secondary whitespace-nowrap">Calc: {orig?.activeProjectCount ?? '-'}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-theme-text-primary mb-1">
              Bags In Hand
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={bagsInHandCount}
                onChange={e => setBagsInHandCount(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-theme-border bg-theme-input-bg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lux-gold"
              />
              <span className="text-[10px] text-theme-text-secondary whitespace-nowrap">Calc: {orig?.bagsInHandCount ?? '-'}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-theme-text-primary mb-1">
              Stones Set (Confirmed)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={stonesSet}
                onChange={e => setStonesSet(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-theme-border bg-theme-input-bg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lux-gold"
              />
              <span className="text-[10px] text-theme-text-secondary whitespace-nowrap">Calc: {orig?.stonesSetSinceTracking ?? '-'}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-theme-text-primary mb-1">
              This Month Estimated Carats (ct)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                value={currentMonthEstimatedCarats}
                onChange={e => setCurrentMonthEstimatedCarats(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-theme-border bg-theme-input-bg text-sm text-white focus:outline-none focus:ring-2 focus:ring-lux-gold"
              />
              <span className="text-[10px] text-theme-text-secondary whitespace-nowrap">Calc: {orig?.currentMonthEstimatedCarats.toFixed(3) ?? '-'}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-theme-text-primary mb-1">
              Reason for Override <span className="text-lux-gold">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Physical inventory count adjustment..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-theme-border bg-theme-input-bg text-sm text-white placeholder:text-theme-text-secondary focus:outline-none focus:ring-2 focus:ring-lux-gold"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-theme-border pt-4 gap-3">
          {snapshot.isOverridden ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleReset}
              className="px-3.5 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold transition-colors"
            >
              Reset to Calculated
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-theme-border text-theme-text-secondary hover:text-white text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-lux-gold text-[#15161a] font-bold text-xs hover:bg-lux-gold/90 transition-colors shadow-lg"
            >
              Save Overrides
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* --- Full Page Team Member Profile Component --- */
const TeamMemberProfile: React.FC<{
  snapshot: StaffPerformanceSnapshot;
  currentUser: User | null;
  onBack: () => void;
}> = ({ snapshot, currentUser, onBack }) => {
  const navigate = useNavigate();
  const showToast = useToast();
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [showEditModal, setShowEditModal] = useState(false);

  const isManager = currentUser?.role === Role.MANAGER;

  const handleExportPDF = () => {
    try {
      generateTeamMemberPDF(snapshot, currentUser);
      showToast('PDF Export downloaded ✓');
    } catch (e: any) {
      showToast(e?.message || 'Failed to generate PDF.');
    }
  };

  const handleExportCSV = () => {
    try {
      generateTeamMemberCSV(snapshot);
      showToast('CSV Export downloaded ✓');
    } catch (e: any) {
      showToast(e?.message || 'Failed to generate CSV.');
    }
  };

  const handleSaveOverrides = async (overrides: StaffPerformanceOverride | null) => {
    await store.updateUserPerformanceOverrides(snapshot.user.id, overrides);
    showToast(overrides ? 'Card metric overrides saved ✓' : 'Restored auto-calculated metrics ✓');
  };

  const tabs: Array<{ value: ProfileTab; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'projects', label: `Projects (${snapshot.activeProjectCount})` },
    { value: 'bags', label: `Bags (${snapshot.bags.length})` },
    { value: 'diamonds', label: 'Diamonds' },
  ];

  return (
    <motion.section
      className="space-y-6"
      initial={reduceMotion ? false : { opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      aria-labelledby="team-member-profile-heading"
    >
      {/* Breadcrumb & Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-theme-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-theme-text-secondary">
            <button
              type="button"
              onClick={onBack}
              className="hover:text-lux-gold transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold rounded"
            >
              <ArrowLeft size={14} />
              <span>Team Overview</span>
            </button>
            <span>/</span>
            <span className="text-theme-text-primary font-bold">{snapshot.user.name}</span>
          </div>
          <h2 id="team-member-profile-heading" className="sr-only">{snapshot.user.name} Team Member Profile</h2>
        </div>

        {/* Header Action Exports & Edit Cards */}
        <div className="flex items-center gap-3">
          {isManager && (
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 text-xs font-bold transition-all duration-300 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Edit2 size={14} />
              <span>Edit Cards</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportPDF}
            className="px-4 py-2.5 rounded-xl border border-lux-gold/30 bg-lux-gold/10 text-lux-gold hover:bg-lux-gold/20 text-xs font-bold transition-all duration-300 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
          >
            <FileDown size={15} />
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-xl border border-theme-border bg-theme-input-bg text-theme-text-primary hover:border-lux-gold/30 text-xs font-bold transition-all duration-300 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Member Banner Card */}
      <div className="relative overflow-hidden rounded-3xl border border-lux-gold/20 bg-gradient-to-br from-[#1a1812] via-[#14161b] to-[#101115] p-6 sm:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-lux-gold/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
          <SetterAvatar
            name={snapshot.user.name}
            color={snapshot.user.setterColor}
            image={snapshot.user.profilePhoto}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white truncate">
                {snapshot.user.name}
              </h1>
              <span className="rounded-full border border-lux-gold/20 bg-lux-gold/10 text-lux-gold px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                {snapshot.user.role}
              </span>
              {snapshot.isOverridden && (
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                  Manager Overridden
                </span>
              )}
            </div>
            <p className="text-sm text-theme-text-secondary mt-1">
              {snapshot.user.location || 'Location not set'} · Operational team member profile
              {snapshot.overrideReason && ` (Note: ${snapshot.overrideReason})`}
            </p>
          </div>
        </div>

        {/* Profile Tabs */}
        <div className="mt-8 border-t border-white/10 pt-4 overflow-x-auto">
          <div role="tablist" aria-label={`${snapshot.user.name} performance sections`} className="flex min-w-max gap-2">
            {tabs.map(tab => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold ${
                  activeTab === tab.value
                    ? 'bg-lux-gold text-[#15161a] shadow-lg'
                    : 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content Sections */}
      <div className="space-y-6">
        {/* Editable KPI Cards Summary Header */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            icon={<Briefcase size={18} />}
            label="Current Projects"
            value={formatInteger(snapshot.activeProjectCount)}
            note="Active assignments"
            accent="blue"
            onEdit={isManager ? () => setShowEditModal(true) : undefined}
            isOverridden={snapshot.user.performanceOverrides?.activeProjectCount !== undefined && snapshot.user.performanceOverrides?.activeProjectCount !== null}
            originalValue={snapshot.originalCalculated ? String(snapshot.originalCalculated.activeProjectCount) : undefined}
          />
          <MetricCard
            icon={<PackageOpen size={18} />}
            label="Bags In Hand"
            value={formatInteger(snapshot.bagsInHandCount)}
            note={`${snapshot.pendingReturnCount} pending count`}
            accent="violet"
            onEdit={isManager ? () => setShowEditModal(true) : undefined}
            isOverridden={snapshot.user.performanceOverrides?.bagsInHandCount !== undefined && snapshot.user.performanceOverrides?.bagsInHandCount !== null}
            originalValue={snapshot.originalCalculated ? String(snapshot.originalCalculated.bagsInHandCount) : undefined}
          />
          <MetricCard
            icon={<Diamond size={18} />}
            label="Stones Set"
            value={formatInteger(snapshot.stonesSetSinceTracking)}
            note={`Confirmed since ${trackingStartLabel}`}
            accent="gold"
            onEdit={isManager ? () => setShowEditModal(true) : undefined}
            isOverridden={snapshot.user.performanceOverrides?.stonesSet !== undefined && snapshot.user.performanceOverrides?.stonesSet !== null}
            originalValue={snapshot.originalCalculated ? String(snapshot.originalCalculated.stonesSetSinceTracking) : undefined}
          />
          <MetricCard
            icon={<Gem size={18} />}
            label="This Month"
            value={formatCarats(snapshot.currentMonthEstimatedCarats)}
            note={`${formatInteger(snapshot.currentMonthStones)} confirmed stones`}
            accent="emerald"
            onEdit={isManager ? () => setShowEditModal(true) : undefined}
            isOverridden={snapshot.user.performanceOverrides?.currentMonthEstimatedCarats !== undefined && snapshot.user.performanceOverrides?.currentMonthEstimatedCarats !== null}
            originalValue={snapshot.originalCalculated ? `${snapshot.originalCalculated.currentMonthEstimatedCarats.toFixed(3)} ct` : undefined}
          />
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <MonthlyChart snapshot={snapshot} />
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-5">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck size={20} className="text-emerald-300" />
                  <h4 className="font-bold text-theme-text-primary">How these numbers work</h4>
                </div>
                <ul className="space-y-3 text-sm text-theme-text-secondary">
                  <li className="flex gap-3"><span className="text-lux-gold">•</span><span>Stones set are counted only after a Manager confirms the bag return.</span></li>
                  <li className="flex gap-3"><span className="text-lux-gold">•</span><span>Issued − confirmed returned − confirmed broken = stones set.</span></li>
                  <li className="flex gap-3"><span className="text-lux-gold">•</span><span>Carats are estimates based on each bag’s saved average weight.</span></li>
                  <li className="flex gap-3"><span className="text-lux-gold">•</span><span>No ranking or combined employee score is used.</span></li>
                </ul>
              </div>
              <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Info size={20} className="text-blue-300" />
                  <h4 className="font-bold text-theme-text-primary">Data quality &amp; overrides</h4>
                </div>
                <div className="space-y-3 text-sm text-theme-text-secondary">
                  <p>Reliable performance totals begin on {trackingStartLabel}. Earlier dates are shown only as historical assignment records.</p>
                  {snapshot.isOverridden && (
                    <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-200 p-3">
                      Manager Overrides Active: {snapshot.overrideReason || 'Manual adjustment applied.'}
                    </p>
                  )}
                  {snapshot.piecesMissingWeightSnapshot > 0 ? (
                    <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-200 p-3">
                      {formatInteger(snapshot.piecesMissingWeightSnapshot)} used pieces are missing a saved average-weight snapshot and are excluded from carat totals.
                    </p>
                  ) : (
                    <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-200 p-3">
                      All counted pieces have the weight data needed for carat estimates.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="space-y-3">
            {snapshot.activeProjects.length === 0 ? (
              <EmptyState icon={<Briefcase size={22} />} title="No current projects" message="This team member has no active assignment records." />
            ) : snapshot.activeProjects.map(project => (
              <button
                type="button"
                key={project.projectId}
                onClick={() => navigate(`/project/${project.projectId}`)}
                className="w-full text-left liquid-glass rounded-[1.5rem] border border-theme-border p-4 sm:p-5 hover:border-lux-gold/30 hover:-translate-y-0.5 transition-all duration-300 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-theme-text-primary">{project.code}</span>
                      <span className="text-[10px] uppercase tracking-wider rounded-full border border-blue-400/20 bg-blue-500/10 text-blue-300 px-2 py-1">{project.status}</span>
                    </div>
                    <p className="text-sm text-theme-text-secondary mt-1 truncate">{project.pieceName}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 lg:w-[460px]">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-theme-text-secondary">Stage</div>
                      <div className="text-xs font-bold text-theme-text-primary mt-1 truncate">{project.stageName}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-theme-text-secondary">Assigned</div>
                      <div className="text-xs font-bold text-theme-text-primary mt-1">
                        {project.daysAssigned === null ? 'Unavailable' : `${project.daysAssigned} days`}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <div className="text-[9px] uppercase tracking-wider text-theme-text-secondary">Timing</div>
                      <div className={`text-[10px] font-bold mt-1 ${
                        project.timingQuality === 'tracked_period' ? 'text-emerald-300' :
                          project.timingQuality === 'historical_record' ? 'text-amber-300' : 'text-zinc-500'
                      }`}>
                        {project.timingQuality === 'tracked_period' ? 'Tracked period' :
                          project.timingQuality === 'historical_record' ? 'Historical record' : 'Start unavailable'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="hidden lg:block text-theme-text-secondary" />
                </div>
                <div className="mt-4 h-1.5 rounded-full bg-theme-input-bg overflow-hidden">
                  <div className="h-full rounded-full bg-lux-gold" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'bags' && (
          <div className="space-y-3">
            {snapshot.bags.length === 0 ? (
              <EmptyState icon={<PackageCheck size={22} />} title="No outstanding bags" message="No bags are currently in hand or waiting for Manager confirmation." />
            ) : snapshot.bags.map(bag => (
              <div key={bag.bagId} className="liquid-glass rounded-[1.5rem] border border-theme-border p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-theme-text-primary">Bag #{bag.bagNumber}</span>
                      <span className={`text-[10px] uppercase tracking-wider rounded-full border px-2 py-1 ${
                        bag.inHand
                          ? 'border-violet-400/20 bg-violet-500/10 text-violet-300'
                          : 'border-amber-400/20 bg-amber-500/10 text-amber-300'
                      }`}>
                        {bag.inHand ? 'In hand' : 'Pending count'}
                      </span>
                    </div>
                    <p className="text-xs text-theme-text-secondary mt-1">Project {bag.projectCode}</p>
                  </div>
                  <div className="text-left sm:text-right text-xs text-theme-text-secondary">
                    <div>Issued {formatTorontoDate(bag.issuedAt)}</div>
                    {bag.daysHeld !== null && <div className="text-theme-text-primary font-bold mt-1">{bag.daysHeld} days held</div>}
                  </div>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {bag.items.map(item => (
                    <div key={item.specId} className="rounded-2xl border border-theme-border bg-theme-input-bg/60 p-3 flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-theme-text-primary truncate">{item.label}</div>
                        <div className="text-[10px] text-theme-text-secondary mt-1">
                          {item.averageWeightSnapshot ? `${item.averageWeightSnapshot.toFixed(4)} ct avg.` : 'Weight snapshot missing'}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-lux-gold shrink-0">{formatInteger(item.issuedPcs)} pcs</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'diamonds' && (
          <div className="space-y-6">
            {snapshot.confirmedUsage.length === 0 ? (
              <EmptyState icon={<Diamond size={22} />} title="No confirmed usage yet" message={`Diamond usage will appear after a Manager confirms a bag return dated on or after ${trackingStartLabel}.`} />
            ) : (
              <>
                <div className="liquid-glass rounded-[1.75rem] border border-theme-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-theme-border">
                    <h4 className="font-bold text-theme-text-primary">Diamond specification breakdown</h4>
                    <p className="text-xs text-theme-text-secondary mt-1">Confirmed usage since tracking began.</p>
                  </div>
                  <div className="divide-y divide-theme-border">
                    {snapshot.specs.map(spec => (
                      <div key={spec.specId} className="px-5 py-4 grid grid-cols-[1fr_auto_auto] items-center gap-4">
                        <span className="text-sm font-bold text-theme-text-primary truncate">{spec.label}</span>
                        <span className="text-sm font-mono text-theme-text-primary">{formatInteger(spec.stonesSet)} stones</span>
                        <span className="text-sm font-mono text-lux-gold">{formatCarats(spec.estimatedCaratsSet)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-theme-text-primary mb-3">Confirmed bag history</h4>
                  <div className="space-y-2">
                    {snapshot.confirmedUsage.map(entry => (
                      <div key={entry.bagId} className="rounded-[1.4rem] border border-theme-border bg-theme-input-bg/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono font-bold text-theme-text-primary">Bag #{entry.bagNumber}</div>
                          <div className="text-xs text-theme-text-secondary mt-1">Project {entry.projectCode} · Confirmed {formatTorontoDate(entry.confirmedAt, true)}</div>
                        </div>
                        <div className="flex gap-5">
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-theme-text-secondary">Set</div>
                            <div className="font-mono font-bold text-theme-text-primary">{formatInteger(entry.stonesSet)} stones</div>
                          </div>
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-theme-text-secondary">Estimated</div>
                            <div className="font-mono font-bold text-lux-gold">{formatCarats(entry.estimatedCaratsSet)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showEditModal && (
        <EditMetricsModal
          snapshot={snapshot}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveOverrides}
        />
      )}
    </motion.section>
  );
};

/* --- Main Dashboard Container --- */
export const StaffPerformanceDashboard: React.FC<{
  currentUser: User | null;
  memberId?: string;
}> = ({ currentUser, memberId: propMemberId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeParams = useParams<{ memberId?: string }>();
  const reduceMotion = useReducedMotion();

  const activeMemberId = propMemberId || routeParams.memberId || null;

  const locationState = (location.state as { search?: string; roleFilter?: RoleFilter } | null) || {};
  const [users, setUsers] = useState<User[]>(() => [...store.getUsers()]);
  const [projects, setProjects] = useState(() => [...store.getProjects()]);
  const [bags, setBags] = useState(() => [...store.getBags()]);
  const [specs, setSpecs] = useState(() => [...store.getSpecs()]);
  const [search, setSearch] = useState(locationState.search || '');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(locationState.roleFilter || 'ALL');

  useEffect(() => store.subscribe(() => {
    setUsers([...store.getUsers()]);
    setProjects([...store.getProjects()]);
    setBags([...store.getBags()]);
    setSpecs([...store.getSpecs()]);
  }), []);

  const snapshots = useMemo(() => buildStaffPerformance({ users, projects, bags, specs }), [users, projects, bags, specs]);
  const overviewMetrics = useMemo(() => buildTeamOverviewMetrics(snapshots), [snapshots]);

  const visible = useMemo(() => snapshots.filter(snapshot => {
    const matchesRole = roleFilter === 'ALL' || snapshot.user.role === roleFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [
      snapshot.user.name,
      snapshot.user.email,
      snapshot.user.location,
      snapshot.user.role,
    ].filter(Boolean).join(' ').toLowerCase().includes(query);
    return matchesRole && matchesSearch;
  }), [roleFilter, search, snapshots]);

  const selectedSnapshot = activeMemberId ? snapshots.find(s => s.user.id === activeMemberId) || null : null;

  if (currentUser?.role !== Role.MANAGER) {
    return (
      <EmptyState
        icon={<ShieldCheck size={22} />}
        title="Manager access required"
        message="Team operational summaries are available only to Managers."
      />
    );
  }

  // If activeMemberId route parameter is present and valid, render full page profile
  if (selectedSnapshot) {
    return (
      <TeamMemberProfile
        snapshot={selectedSnapshot}
        currentUser={currentUser}
        onBack={() => navigate('/reports/team', { state: { search, roleFilter } })}
      />
    );
  }

  return (
    <section aria-labelledby="team-heading" className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-lux-gold/20 bg-gradient-to-br from-[#1a1812] via-[#14161b] to-[#101115] p-5 sm:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
        <div className="absolute -right-24 -top-28 w-72 h-72 rounded-full bg-lux-gold/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex items-center gap-2 text-lux-gold text-[10px] font-bold uppercase tracking-[0.22em]">
                <Sparkles size={14} />
                Manager-only operational view
              </div>
              <span className="rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-400/20 to-lux-gold/20 text-amber-300 px-3.5 py-1 text-[11px] font-bold tracking-wide flex items-center gap-1.5 shadow-md">
                <Sparkles size={13} className="text-amber-400 animate-pulse" />
                New Update Coming Soon
              </span>
            </div>
            <h2
              id="team-heading"
              className="text-2xl sm:text-4xl font-serif font-bold text-white flex flex-wrap items-center gap-3"
            >
              <span>Team</span>
              <span className="text-xs font-sans font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 px-3 py-1 rounded-full uppercase tracking-wider">
                New Update Coming Soon
              </span>
            </h2>
            <p className="text-sm mt-3 leading-relaxed text-zinc-400">
              See current workloads, outstanding diamond bags, confirmed stone usage, estimated carats, and assignment timelines for team members without creating an employee score.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">
            <ShieldCheck size={20} className="shrink-0" />
            <div>
              <div className="text-xs font-bold">Read-only operational view</div>
              <div className="text-[10px] text-emerald-200/70 mt-0.5">No project, bag, or team member data can be altered here without Manager override.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Upgraded Visual KPI Cards with Diagrams */}
      <TeamOverviewKPIs overview={overviewMetrics} />

      {/* Search & Filter Bar */}
      <div className="liquid-glass rounded-[1.75rem] border border-theme-border p-3 sm:p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search team members</span>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-text-secondary pointer-events-none" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search team members by name, role, email, or location..."
            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-theme-border bg-theme-input-bg text-sm text-theme-text-primary placeholder:text-theme-text-secondary focus:outline-none focus:ring-2 focus:ring-lux-gold/60"
          />
        </label>
        <div role="group" aria-label="Filter team members by role" className="grid grid-cols-3 gap-1 rounded-2xl border border-theme-border bg-theme-input-bg p-1">
          {([
            ['ALL', 'All'],
            [Role.SETTER, 'Setters'],
            [Role.JEWELLER, 'Jewellers'],
          ] as Array<[RoleFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRoleFilter(value)}
              aria-pressed={roleFilter === value}
              className={`min-h-10 px-4 rounded-xl text-xs font-bold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold ${
                roleFilter === value ? 'bg-lux-gold text-[#15161a]' : 'text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Team Member Cards Grid */}
      {visible.length === 0 ? (
        <EmptyState icon={<UsersRound size={22} />} title="No team members found" message="Try a different name or role filter." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((snapshot, index) => (
            <motion.button
              type="button"
              key={snapshot.user.id}
              onClick={() => navigate(`/reports/team/${snapshot.user.id}`, { state: { search, roleFilter } })}
              className="text-left liquid-glass rounded-[1.85rem] border border-theme-border p-5 hover:border-lux-gold/35 hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(0,0,0,0.28)] transition-all duration-300 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.35,
                delay: reduceMotion ? 0 : Math.min(index, 6) * 0.06,
              }}
              aria-label={`Open operational details for team member ${snapshot.user.name}`}
            >
              <div className="flex items-start gap-4">
                <SetterAvatar name={snapshot.user.name} color={snapshot.user.setterColor} image={snapshot.user.profilePhoto} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-lg text-theme-text-primary truncate">{snapshot.user.name}</h3>
                        {snapshot.isOverridden && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
                            Overridden
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-theme-text-secondary mt-0.5">{snapshot.user.role} · {snapshot.user.location || 'No location'}</p>
                    </div>
                    <ChevronRight size={18} className="text-theme-text-secondary shrink-0 mt-1" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-5">
                <div className="rounded-2xl border border-theme-border bg-theme-input-bg/50 p-3">
                  <div className="flex items-center gap-1.5 text-blue-300"><Briefcase size={13} /><span className="text-[9px] uppercase font-bold tracking-wider">Projects</span></div>
                  <div className="font-serif text-2xl font-bold text-theme-text-primary mt-2">{snapshot.activeProjectCount}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-input-bg/50 p-3">
                  <div className="flex items-center gap-1.5 text-violet-300"><PackageOpen size={13} /><span className="text-[9px] uppercase font-bold tracking-wider">In hand</span></div>
                  <div className="font-serif text-2xl font-bold text-theme-text-primary mt-2">{snapshot.bagsInHandCount}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-input-bg/50 p-3">
                  <div className="flex items-center gap-1.5 text-lux-gold"><Diamond size={13} /><span className="text-[9px] uppercase font-bold tracking-wider">Stones</span></div>
                  <div className="font-serif text-2xl font-bold text-theme-text-primary mt-2">{formatInteger(snapshot.stonesSetSinceTracking)}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-input-bg/50 p-3">
                  <div className="flex items-center gap-1.5 text-emerald-300"><Gem size={13} /><span className="text-[9px] uppercase font-bold tracking-wider">This month</span></div>
                  <div className="font-serif text-xl font-bold text-theme-text-primary mt-2">{snapshot.currentMonthEstimatedCarats.toFixed(2)} ct</div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-theme-border">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-[9px] uppercase font-bold tracking-[0.16em] text-theme-text-secondary">Six-month carat activity</span>
                  <span className="text-[10px] text-theme-text-secondary">{formatCarats(snapshot.estimatedCaratsSinceTracking)}</span>
                </div>
                <MiniTrend snapshot={snapshot} />
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Footer Info Box */}
      <div className="rounded-[1.5rem] border border-blue-400/15 bg-blue-500/[0.06] p-4 flex gap-3 text-sm text-blue-100/80">
        <CalendarClock size={20} className="text-blue-300 shrink-0 mt-0.5" />
        <p>
          Reliable team operational analytics begin on {trackingStartLabel}. Managers can adjust card metric totals as needed using the "Edit Cards" action on individual profiles with an audit reason.
        </p>
      </div>
    </section>
  );
};
