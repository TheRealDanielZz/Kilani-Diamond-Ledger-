import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, Priority } from '../types';
import { Card, StatusPill, Button, Badge, ProgressBar } from '../components/UI';
import {
  Calendar,
  ChevronRight,
  Wrench,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  LayoutGrid,
  List as ListIcon,
  CheckCircle2,
  Sparkles,
  Layers,
  X
} from 'lucide-react';
import { QuickRepairModal } from '../components/QuickRepairModal';
import {
  recordProjectOpened,
  getAllProjectsLastOpened,
  formatLastOpenedRelative
} from '../utils/projectOpenedTracker';
import { transitionNavigate } from '../utils/transitionNavigate';

export type SetterSortField = 'LAST_OPENED' | 'DUE_DATE' | 'PRIORITY' | 'CODE' | 'NAME' | 'PROGRESS';
export type SortOrder = 'asc' | 'desc';

interface SortOptionConfig {
  value: SetterSortField;
  label: string;
  ascLabel: string;
  descLabel: string;
}

const SORT_OPTIONS: SortOptionConfig[] = [
  {
    value: 'LAST_OPENED',
    label: 'Last Opened',
    ascLabel: 'Oldest / Unopened first',
    descLabel: 'Recently opened first'
  },
  {
    value: 'DUE_DATE',
    label: 'Due Date',
    ascLabel: 'Soonest due first',
    descLabel: 'Furthest due first'
  },
  {
    value: 'PRIORITY',
    label: 'Priority',
    ascLabel: 'Normal / Low first',
    descLabel: 'Rush first'
  },
  {
    value: 'CODE',
    label: 'Project Code',
    ascLabel: 'A → Z',
    descLabel: 'Z → A'
  },
  {
    value: 'NAME',
    label: 'Piece Name',
    ascLabel: 'A → Z',
    descLabel: 'Z → A'
  },
  {
    value: 'PROGRESS',
    label: 'Progress',
    ascLabel: 'Lowest % first',
    descLabel: 'Highest % first'
  }
];

const SetterDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [allAssignedProjects, setAllAssignedProjects] = useState<Project[]>([]);
  const [isQuickRepairOpen, setIsQuickRepairOpen] = useState(false);

  // Tab State: Active Projects (default) vs Completed
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  // Search Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Opened Map for fast lookup and reactivity
  const [openedMap, setOpenedMap] = useState<Record<string, string>>(() =>
    getAllProjectsLastOpened(currentUser?.id)
  );

  // View Mode: Persistent
  const viewModeKey = `kilani:setter_view_mode:${currentUser?.id || 'default'}`;
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>(() => {
    try {
      const saved = localStorage.getItem(viewModeKey);
      return saved === 'LIST' || saved === 'GRID' ? saved : 'GRID';
    } catch {
      return 'GRID';
    }
  });

  const handleToggleViewMode = (mode: 'GRID' | 'LIST') => {
    setViewMode(mode);
    try {
      localStorage.setItem(viewModeKey, mode);
    } catch {
      // Safe fallback
    }
  };

  // Sort State: Persistent per Setter
  const sortByStorageKey = `kilani:setter_sort_by:${currentUser?.id || 'default'}`;
  const sortOrderStorageKey = `kilani:setter_sort_order:${currentUser?.id || 'default'}`;

  const [sortBy, setSortBy] = useState<SetterSortField>(() => {
    try {
      const saved = localStorage.getItem(sortByStorageKey) as SetterSortField;
      return SORT_OPTIONS.some(o => o.value === saved) ? saved : 'LAST_OPENED';
    } catch {
      return 'LAST_OPENED';
    }
  });

  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      const saved = localStorage.getItem(sortOrderStorageKey) as SortOrder;
      return saved === 'asc' || saved === 'desc' ? saved : 'desc';
    } catch {
      return 'desc';
    }
  });

  const handleSortByChange = (field: SetterSortField) => {
    setSortBy(field);
    try {
      localStorage.setItem(sortByStorageKey, field);
    } catch {
      // Safe fallback
    }
  };

  const handleToggleSortOrder = () => {
    const nextOrder: SortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(nextOrder);
    try {
      localStorage.setItem(sortOrderStorageKey, nextOrder);
    } catch {
      // Safe fallback
    }
  };

  // Sync projects and opened timestamps
  useEffect(() => {
    const loadProjects = () => {
      // Comprehensive profile matching for UID, AuthUID, Legacy Profile IDs, Name, and Email
      const acceptedProfileIds = new Set([
        currentUser.id,
        currentUser.authUid,
        ...(currentUser.legacyProfileIds || []),
        currentUser.name?.toLowerCase(),
        currentUser.email?.toLowerCase()
      ].filter(Boolean));

      const matched = store.getProjects().filter(p => {
        const hasAssignment = (p.assignments || []).some(a => {
          if (!a.active) return false;
          const user = store.getUser(a.userId);
          const userName = user?.name?.toLowerCase() || '';
          const userEmail = user?.email?.toLowerCase() || '';
          return acceptedProfileIds.has(a.userId) ||
                 (userName && acceptedProfileIds.has(userName)) ||
                 (userEmail && acceptedProfileIds.has(userEmail));
        });
        const isSetterAssigned = Boolean(p.assignedSetterId && (
          acceptedProfileIds.has(p.assignedSetterId) ||
          acceptedProfileIds.has(store.getUser(p.assignedSetterId)?.name?.toLowerCase())
        ));
        const isActiveAssignee = Boolean(p.activeAssignees && p.activeAssignees.some(uid =>
          acceptedProfileIds.has(uid) || acceptedProfileIds.has(store.getUser(uid)?.name?.toLowerCase())
        ));
        return hasAssignment || isSetterAssigned || isActiveAssignee;
      });

      setAllAssignedProjects(matched);
      setOpenedMap(getAllProjectsLastOpened(currentUser?.id));
    };

    loadProjects();
    const unsubscribe = store.subscribe(loadProjects);
    return () => unsubscribe();
  }, [currentUser]);

  // Filter into Active vs Completed
  const activeProjects = useMemo(() => {
    return allAssignedProjects.filter(p => p.status === ProjectStatus.ACTIVE);
  }, [allAssignedProjects]);

  const completedProjects = useMemo(() => {
    return allAssignedProjects.filter(p => p.status === ProjectStatus.REVIEW || p.status === ProjectStatus.CLOSED);
  }, [allAssignedProjects]);

  // Tab-selected list
  const tabProjects = activeTab === 'ACTIVE' ? activeProjects : completedProjects;

  // Search filter
  const searchFilteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tabProjects;
    return tabProjects.filter(p =>
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.pieceName && p.pieceName.toLowerCase().includes(q)) ||
      (p.clientName && p.clientName.toLowerCase().includes(q)) ||
      (p.clientPhone && p.clientPhone.toLowerCase().includes(q))
    );
  }, [tabProjects, searchQuery]);

  // Sorted list based on chosen field and direction
  const sortedProjects = useMemo(() => {
    const list = [...searchFilteredProjects];
    const isAsc = sortOrder === 'asc';

    list.sort((a, b) => {
      switch (sortBy) {
        case 'LAST_OPENED': {
          const aOpened = openedMap[a.id] ? new Date(openedMap[a.id]).getTime() : 0;
          const bOpened = openedMap[b.id] ? new Date(openedMap[b.id]).getTime() : 0;

          if (aOpened !== bOpened) {
            // Ascending = oldest opened (or unopened = 0) first
            // Descending = most recently opened first
            return isAsc ? aOpened - bOpened : bOpened - aOpened;
          }
          // Tie-breaker: creation date or due date
          const aTime = new Date(a.createdAt || a.dueDate || 0).getTime();
          const bTime = new Date(b.createdAt || b.dueDate || 0).getTime();
          return isAsc ? aTime - bTime : bTime - aTime;
        }

        case 'DUE_DATE': {
          const aDate = new Date(a.dueDate).getTime() || 0;
          const bDate = new Date(b.dueDate).getTime() || 0;
          return isAsc ? aDate - bDate : bDate - aDate;
        }

        case 'PRIORITY': {
          const score = (p: Project) => (p.priority === Priority.RUSH ? 2 : p.priority === Priority.NORMAL ? 1 : 0);
          const diff = score(a) - score(b);
          if (diff !== 0) return isAsc ? diff : -diff;
          // Fallback to due date
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }

        case 'CODE': {
          const aCode = (a.code || '').toLowerCase();
          const bCode = (b.code || '').toLowerCase();
          return isAsc ? aCode.localeCompare(bCode) : bCode.localeCompare(aCode);
        }

        case 'NAME': {
          const aName = (a.pieceName || a.clientName || '').toLowerCase();
          const bName = (b.pieceName || b.clientName || '').toLowerCase();
          return isAsc ? aName.localeCompare(bName) : bName.localeCompare(aName);
        }

        case 'PROGRESS': {
          const aProg = a.currentPercentComplete || 0;
          const bProg = b.currentPercentComplete || 0;
          return isAsc ? aProg - bProg : bProg - aProg;
        }

        default:
          return 0;
      }
    });

    return list;
  }, [searchFilteredProjects, sortBy, sortOrder, openedMap]);

  // Click card handler: track opened time and navigate
  const handleOpenProject = useCallback((projectId: string) => {
    recordProjectOpened(projectId, currentUser?.id);
    // Optimistically update opened map in local state
    setOpenedMap(prev => ({ ...prev, [projectId]: new Date().toISOString() }));
    transitionNavigate(navigate, `/project/${projectId}`);
  }, [currentUser?.id, navigate]);

  const activeSortConfig = SORT_OPTIONS.find(o => o.value === sortBy) || SORT_OPTIONS[0];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-lux-cream tracking-tight font-serif">My Assignments</h1>
            <div
              className="w-4 h-4 rounded-full shadow-glow ring-2 ring-lux-black shrink-0"
              style={{ background: currentUser.setterColor || '#F5C249' }}
              title={`Setter: ${currentUser.name || 'Staff'}`}
            />
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 font-sans">
            Bench production queue & assignments
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="primary"
            icon={<Wrench size={18} />}
            onClick={() => setIsQuickRepairOpen(true)}
            className="w-full sm:w-auto shadow-glow font-bold text-xs min-h-[44px]"
          >
            New Repair Project
          </Button>
        </div>
      </div>

      {/* Segmented Tab Bar (Dark Luxury Foxcrypto Style) */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative bg-[#1F2128] p-1 rounded-2xl flex border border-white/10 shadow-inner max-w-md w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('ACTIVE')}
            className={`flex-1 sm:flex-initial min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'ACTIVE'
                ? 'bg-lux-gold text-black shadow-glow font-bold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers size={14} />
            <span>Active Projects</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'ACTIVE' ? 'bg-black/20 text-black' : 'bg-white/10 text-zinc-300'
              }`}
            >
              {activeProjects.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('COMPLETED')}
            className={`flex-1 sm:flex-initial min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'COMPLETED'
                ? 'bg-lux-gold text-black shadow-glow font-bold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CheckCircle2 size={14} />
            <span>Completed</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'COMPLETED' ? 'bg-black/20 text-black' : 'bg-white/10 text-zinc-300'
              }`}
            >
              {completedProjects.length}
            </span>
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="hidden sm:flex items-center rounded-2xl border border-theme-border bg-theme-input-bg p-1">
          <button
            type="button"
            onClick={() => handleToggleViewMode('GRID')}
            aria-label="Grid view"
            aria-pressed={viewMode === 'GRID'}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
              viewMode === 'GRID'
                ? 'bg-lux-gold text-black shadow-glow font-bold'
                : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-row-hover'
            }`}
          >
            <LayoutGrid size={15} />
            <span>Grid</span>
          </button>
          <button
            type="button"
            onClick={() => handleToggleViewMode('LIST')}
            aria-label="List view"
            aria-pressed={viewMode === 'LIST'}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
              viewMode === 'LIST'
                ? 'bg-lux-gold text-black shadow-glow font-bold'
                : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-row-hover'
            }`}
          >
            <ListIcon size={15} />
            <span>List</span>
          </button>
        </div>
      </div>

      {/* Controls Bar: Search & Sorting */}
      <div className="bg-[#1F2128]/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-3 sm:p-4 mb-6 shadow-subtle flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Field */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab === 'ACTIVE' ? 'active' : 'completed'} projects (code, piece, client)...`}
            className="w-full bg-[#16171D] text-white rounded-xl border border-zinc-800 pl-10 pr-10 py-2.5 min-h-[44px] text-xs sm:text-sm placeholder:text-zinc-600 focus:outline-none focus:border-lux-gold/60 focus:ring-1 focus:ring-lux-gold/50 transition-all font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg cursor-pointer"
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Sort Controls Group */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#16171D] border border-zinc-800 rounded-xl px-3 py-2 min-h-[44px] flex-1 sm:flex-initial">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
              <ArrowUpDown size={12} className="text-lux-gold" />
              Sort:
            </span>
            <select
              value={sortBy}
              onChange={e => handleSortByChange(e.target.value as SetterSortField)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer pr-1 py-1"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-[#1F2128] text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Direction Toggle Button */}
          <button
            type="button"
            onClick={handleToggleSortOrder}
            title={`Direction: ${sortOrder === 'asc' ? activeSortConfig.ascLabel : activeSortConfig.descLabel}`}
            className="flex items-center gap-1.5 bg-[#16171D] hover:bg-[#23262F] border border-zinc-800 hover:border-lux-gold/40 text-white rounded-xl px-3 py-2 min-h-[44px] text-xs font-semibold transition-all shadow-sm shrink-0 cursor-pointer"
          >
            {sortOrder === 'asc' ? (
              <>
                <ArrowUp size={13} className="text-lux-gold" />
                <span className="hidden sm:inline font-mono text-[11px] text-zinc-300">Asc</span>
              </>
            ) : (
              <>
                <ArrowDown size={13} className="text-lux-gold" />
                <span className="hidden sm:inline font-mono text-[11px] text-zinc-300">Desc</span>
              </>
            )}
            <span className="text-[10px] text-zinc-400 font-normal">
              ({sortOrder === 'asc' ? activeSortConfig.ascLabel : activeSortConfig.descLabel})
            </span>
          </button>

          {/* Mobile View Toggle */}
          <div className="flex sm:hidden items-center rounded-xl border border-zinc-800 bg-[#16171D] p-0.5">
            <button
              type="button"
              onClick={() => handleToggleViewMode('GRID')}
              aria-label="Grid view"
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-all ${viewMode === 'GRID' ? 'bg-lux-gold text-black shadow-glow font-bold' : 'text-zinc-400'}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('LIST')}
              aria-label="List view"
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-all ${viewMode === 'LIST' ? 'bg-lux-gold text-black shadow-glow font-bold' : 'text-zinc-400'}`}
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Projects Display */}
      {sortedProjects.length === 0 ? (
        <div className="text-center py-20 px-4 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20 col-span-full">
          {searchQuery ? (
            <div className="max-w-md mx-auto">
              <Search className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium mb-1">No matching projects found</p>
              <p className="text-xs text-zinc-500 mb-4">No projects match &quot;{searchQuery}&quot;</p>
              <Button size="sm" variant="secondary" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            </div>
          ) : activeTab === 'ACTIVE' ? (
            <div className="max-w-md mx-auto">
              <Layers className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium mb-1">No active projects assigned</p>
              <p className="text-xs text-zinc-500">
                You currently have no active work in your queue. New assignments or repairs will appear here.
              </p>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <CheckCircle2 className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium mb-1">No completed projects</p>
              <p className="text-xs text-zinc-500">Projects you complete or have picked up will appear here.</p>
            </div>
          )}
        </div>
      ) : viewMode === 'GRID' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sortedProjects.map((p, index) => {
            const lastOpenedIso = openedMap[p.id] || null;
            const lastOpenedLabel = formatLastOpenedRelative(lastOpenedIso);
            const isUnopened = !lastOpenedIso;

            return (
              <Card
                key={p.id}
                onClick={() => handleOpenProject(p.id)}
                className="p-5 flex flex-col group h-full hover:border-lux-gold/40 hover:shadow-[0_0_20px_rgba(245,194,73,0.12)] transition-all duration-300 cursor-pointer animate-enter relative"
                style={{ animationDelay: `${Math.min(index * 35, 300)}ms` }}
              >
                {/* Header Row: Code, Rush & Status */}
                <div className="flex justify-between items-start mb-2 gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg text-lux-cream group-hover:text-lux-gold transition-colors tracking-tight truncate font-serif">
                      {p.code}
                    </h3>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {p.priority === Priority.RUSH && (
                      <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-900/30 px-2 py-0.5 rounded-full font-bold tracking-wide">
                        RUSH
                      </span>
                    )}
                    <StatusPill status={p.status} />
                  </div>
                </div>

                {/* Piece & Client Name */}
                <p className="text-zinc-400 mb-4 text-xs sm:text-sm font-medium line-clamp-2 min-h-[2.5rem]">
                  {p.clientName ? `${p.clientName} ` : ''}
                  {p.clientPhone ? `(${p.clientPhone}) — ` : (p.clientName ? '— ' : '')}
                  {p.pieceName}
                </p>

                {/* Last Opened Indicator Badge */}
                <div className="mb-4">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono ${
                      isUnopened
                        ? 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/40'
                        : 'bg-lux-gold/10 text-lux-gold border border-lux-gold/25'
                    }`}
                  >
                    <Clock size={11} className={isUnopened ? 'text-zinc-500' : 'text-lux-gold'} />
                    <span>{lastOpenedLabel}</span>
                  </span>
                </div>

                {/* Progress Bar & Stage */}
                <div className="mt-auto pt-3 border-t border-white/5 space-y-2">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-zinc-500">{p.currentStageName || 'Intake'}</span>
                    <span className="font-mono font-bold text-lux-gold">{p.currentPercentComplete || 0}%</span>
                  </div>
                  <ProgressBar progress={p.currentPercentComplete || 0} />
                </div>

                {/* Footer: Due Date & Action */}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5 text-xs text-zinc-500">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Due {new Date(p.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400 group-hover:text-lux-gold transition-colors text-[11px] font-semibold">
                    <span>Open</span>
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-3">
          {sortedProjects.map((p, index) => {
            const lastOpenedIso = openedMap[p.id] || null;
            const lastOpenedLabel = formatLastOpenedRelative(lastOpenedIso);
            const isUnopened = !lastOpenedIso;

            return (
              <Card
                key={p.id}
                onClick={() => handleOpenProject(p.id)}
                className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-lux-gold/40 hover:shadow-[0_0_20px_rgba(245,194,73,0.1)] transition-all duration-300 cursor-pointer animate-enter"
                style={{ animationDelay: `${Math.min(index * 30, 250)}ms` }}
              >
                {/* Left: Code, Priority, Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg text-lux-cream group-hover:text-lux-gold transition-colors tracking-tight truncate font-serif">
                      {p.code}
                    </h3>
                    {p.priority === Priority.RUSH && (
                      <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-900/30 px-2 py-0.5 rounded-full font-bold tracking-wide">
                        RUSH
                      </span>
                    )}
                    <StatusPill status={p.status} />
                  </div>
                  <p className="text-zinc-400 text-xs sm:text-sm font-medium truncate">
                    {p.clientName ? `${p.clientName} ` : ''}
                    {p.clientPhone ? `(${p.clientPhone}) — ` : (p.clientName ? '— ' : '')}
                    {p.pieceName}
                  </p>
                </div>

                {/* Middle: Last Opened & Due Date */}
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono ${
                      isUnopened
                        ? 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/40'
                        : 'bg-lux-gold/10 text-lux-gold border border-lux-gold/25'
                    }`}
                  >
                    <Clock size={11} className={isUnopened ? 'text-zinc-500' : 'text-lux-gold'} />
                    <span>{lastOpenedLabel}</span>
                  </span>

                  <div className="flex items-center gap-1.5 text-zinc-400 font-mono">
                    <Calendar size={13} className="text-zinc-500" />
                    <span>Due {new Date(p.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>

                {/* Right: Stage, Progress & Arrow */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="w-28 sm:w-36">
                    <div className="flex justify-between items-center text-[10px] text-zinc-400 mb-1">
                      <span className="truncate">{p.currentStageName || 'Intake'}</span>
                      <span className="font-mono font-bold text-lux-gold">{p.currentPercentComplete || 0}%</span>
                    </div>
                    <ProgressBar progress={p.currentPercentComplete || 0} />
                  </div>

                  <div className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-lux-gold/20 flex items-center justify-center transition-colors">
                    <ChevronRight size={16} className="text-zinc-500 group-hover:text-lux-gold transition-colors" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick Repair Modal for Walk-in Intake */}
      <QuickRepairModal
        isOpen={isQuickRepairOpen}
        onClose={() => setIsQuickRepairOpen(false)}
        currentUser={currentUser}
        onProjectCreated={(created) => transitionNavigate(navigate, `/project/${created.id}`)}
      />
    </div>
  );
};

export default SetterDashboard;
