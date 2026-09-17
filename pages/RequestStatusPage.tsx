import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { IssueRequest, Project, DiamondSpec } from '../types';
import { 
  Gem, Calendar, ChevronRight, Search, Clock, CheckCircle2, 
  Sparkles, ArrowUpRight
} from 'lucide-react';

interface RequestStatusPageProps {
  currentUser?: any;
}

export const RequestStatusPage: React.FC<RequestStatusPageProps> = ({ currentUser: propUser }) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(propUser || store.getCurrentUser());
  const [requests, setRequests] = useState<IssueRequest[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, Project>>({});
  const [specsMap, setSpecsMap] = useState<Record<string, DiamondSpec>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'FULFILLED' | 'CANCELLED'>('ALL');

  // Multi-profile ID matching for setters
  const acceptedProfileIds = useMemo(() => {
    const user = currentUser || store.getCurrentUser();
    if (!user) return new Set<string>();
    return new Set([
      user.id,
      user.authUid,
      ...(user.legacyProfileIds || []),
      user.name?.toLowerCase(),
      user.email?.toLowerCase()
    ].filter(Boolean) as string[]);
  }, [currentUser]);

  useEffect(() => {
    const loadData = () => {
      const activeUser = store.getCurrentUser();
      if (activeUser) setCurrentUser(activeUser);

      const allReqs = store.getRequests().filter(r => {
        if (!activeUser) return false;
        const reqById = (r.requestedById || '').toLowerCase();
        return acceptedProfileIds.has(r.requestedById) || acceptedProfileIds.has(reqById);
      });

      // Sort newest first
      allReqs.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      setRequests(allReqs);

      // Cache projects
      const pMap: Record<string, Project> = {};
      store.getProjects().forEach(p => { pMap[p.id] = p; });
      setProjectsMap(pMap);

      // Cache diamond specs
      const sMap: Record<string, DiamondSpec> = {};
      store.getSpecs().forEach(s => { sMap[s.id] = s; });
      setSpecsMap(sMap);
    };

    loadData();
    const unsub = store.subscribe(loadData);
    return () => unsub();
  }, [acceptedProfileIds]);

  // 30-Day Metrics Calculation
  const stats = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const past30d = requests.filter(r => new Date(r.requestedAt) >= thirtyDaysAgo);

    const totalRequested30d = past30d.reduce((sum, r) => 
      sum + (r.lines || []).reduce((lineSum, l) => lineSum + (l.requestedPcs || 0), 0), 0
    );

    const totalFulfilled30d = past30d.reduce((sum, r) => {
      if (r.fulfillmentDetails?.lines) {
        return sum + r.fulfillmentDetails.lines.reduce((lineSum, l) => lineSum + (l.issuedPcs || 0), 0);
      }
      return sum;
    }, 0);

    const pendingCount = requests.filter(r => r.status === 'OPEN').length;
    const fulfilledCount = requests.filter(r => r.status === 'FULFILLED' || r.status === 'PARTIALLY_FULFILLED_CLOSED').length;
    const cancelledCount = requests.filter(r => r.status === 'CANCELLED').length;

    const fulfillmentRate = totalRequested30d > 0 
      ? Math.min(100, Math.round((totalFulfilled30d / totalRequested30d) * 100)) 
      : 100;

    return {
      totalRequested30d,
      totalFulfilled30d,
      pendingCount,
      fulfilledCount,
      cancelledCount,
      fulfillmentRate
    };
  }, [requests]);

  // Filtered requests list
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      // Status filter
      if (statusFilter === 'OPEN' && r.status !== 'OPEN') return false;
      if (statusFilter === 'FULFILLED' && r.status !== 'FULFILLED' && r.status !== 'PARTIALLY_FULFILLED_CLOSED') return false;
      if (statusFilter === 'CANCELLED' && r.status !== 'CANCELLED') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const project = projectsMap[r.projectId];
        const projectCode = (project?.code || r.jobNumberSnapshot || '').toLowerCase();
        const pieceName = (project?.pieceName || '').toLowerCase();
        const clientName = (project?.clientName || '').toLowerCase();
        const bagNum = (r.fulfillmentDetails?.bagNumber || '').toLowerCase();

        const matchesCode = projectCode.includes(query);
        const matchesPiece = pieceName.includes(query);
        const matchesClient = clientName.includes(query);
        const matchesBag = bagNum.includes(query);
        
        return matchesCode || matchesPiece || matchesClient || matchesBag;
      }

      return true;
    });
  }, [requests, statusFilter, searchQuery, projectsMap]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-lux-gold/10 border border-lux-gold/20 flex items-center justify-center text-lux-gold shadow-glow">
              <Gem size={18} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-lux-cream tracking-tight font-serif">
              Request Status
            </h1>
          </div>
          <p className="text-sm text-zinc-400">
            Track all your diamond requests, stone allocations, and monthly fulfillment
          </p>
        </div>

        {currentUser && (
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 px-4 py-2 rounded-2xl backdrop-blur-md">
            <div 
              className="w-3 h-3 rounded-full shadow-glow ring-2 ring-lux-black shrink-0" 
              style={{ background: currentUser.setterColor || '#F5C249' }}
            />
            <div className="text-xs">
              <span className="text-zinc-400 font-medium">Setter: </span>
              <span className="text-white font-bold">{currentUser.name}</span>
            </div>
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {/* Total Requested */}
        <div className="liquid-glass p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-lux-gold/30 transition-all">
          <div className="flex justify-between items-start mb-3">
            <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-zinc-400">Requested (30d)</span>
            <div className="p-2 rounded-xl bg-lux-gold/10 text-lux-gold border border-lux-gold/20 group-hover:scale-110 transition-transform">
              <Gem size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-lux-cream group-hover:text-lux-gold transition-colors">
            {stats.totalRequested30d.toLocaleString()}
            <span className="text-xs font-mono font-normal text-zinc-500 ml-1.5">pcs</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 truncate">Stones requested past month</div>
        </div>

        {/* Total Fulfilled */}
        <div className="liquid-glass p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex justify-between items-start mb-3">
            <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-zinc-400">Fulfilled (30d)</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-emerald-400">
            {stats.totalFulfilled30d.toLocaleString()}
            <span className="text-xs font-mono font-normal text-zinc-500 ml-1.5">pcs</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 truncate">Issued & allocated to bags</div>
        </div>

        {/* Fulfillment Rate */}
        <div className="liquid-glass p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="flex justify-between items-start mb-3">
            <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-zinc-400">Fulfillment Rate</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-blue-400">
            {stats.fulfillmentRate}%
          </div>
          <div className="w-full bg-zinc-800/80 rounded-full h-1.5 mt-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, stats.fulfillmentRate))}%` }}
            />
          </div>
        </div>

        {/* Pending Requests */}
        <div className="liquid-glass p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="flex justify-between items-start mb-3">
            <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-zinc-400">Pending Review</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-amber-400">
            {stats.pendingCount}
            <span className="text-xs font-mono font-normal text-zinc-500 ml-1.5">open</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 truncate">Awaiting manager issue</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by job code, piece, or bag #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-lux-gold/50 transition-colors"
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.02] border border-white/10 rounded-2xl overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              statusFilter === 'ALL'
                ? 'bg-lux-gold text-black shadow-glow font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            All ({requests.length})
          </button>
          <button
            onClick={() => setStatusFilter('OPEN')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              statusFilter === 'OPEN'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-glow'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Pending ({stats.pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('FULFILLED')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              statusFilter === 'FULFILLED'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-glow'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Fulfilled ({stats.fulfilledCount})
          </button>
          <button
            onClick={() => setStatusFilter('CANCELLED')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              statusFilter === 'CANCELLED'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-glow'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Cancelled ({stats.cancelledCount})
          </button>
        </div>
      </div>

      {/* Requests Grid */}
      {filteredRequests.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-zinc-800/80 rounded-3xl bg-zinc-900/20 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800/40 border border-white/5 flex items-center justify-center text-zinc-500 mb-4">
            <Gem size={24} strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No requests found</h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            {searchQuery 
              ? 'No requests match your current search criteria.' 
              : 'You have not submitted any diamond requests under this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRequests.map(r => {
            const project = projectsMap[r.projectId];
            const projectCode = project?.code || r.jobNumberSnapshot || r.projectId.substring(0, 6);
            const totalRequested = (r.lines || []).reduce((sum, l) => sum + (l.requestedPcs || 0), 0);
            const totalFulfilled = r.fulfillmentDetails?.lines
              ? r.fulfillmentDetails.lines.reduce((sum, l) => sum + (l.issuedPcs || 0), 0)
              : (r.status === 'FULFILLED' ? totalRequested : 0);

            const isPending = r.status === 'OPEN';
            const isFulfilled = r.status === 'FULFILLED';
            const isPartial = r.status === 'PARTIALLY_FULFILLED_CLOSED';
            const isCancelled = r.status === 'CANCELLED';

            return (
              <div
                key={r.id}
                onClick={() => navigate(`/project/${r.projectId}`)}
                className="liquid-glass p-5 rounded-3xl border border-white/10 hover:border-lux-gold/40 hover:bg-white/[0.04] transition-all duration-300 cursor-pointer group flex flex-col justify-between relative shadow-lg hover:shadow-2xl hover:-translate-y-0.5"
              >
                <div>
                  {/* Top Bar: Job Code & Status Badge */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xl text-white group-hover:text-lux-gold transition-colors tracking-tight">
                        #{projectCode}
                      </span>
                      <ArrowUpRight size={14} className="text-zinc-600 group-hover:text-lux-gold group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                    </div>

                    <div className="flex items-center gap-2">
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-glow">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Pending Review
                        </span>
                      )}
                      {isFulfilled && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-glow">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Fulfilled
                        </span>
                      )}
                      {isPartial && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          Partial ({totalFulfilled}/{totalRequested})
                        </span>
                      )}
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Project Piece Name */}
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors truncate">
                      {project?.pieceName || 'Custom Jewelry Project'}
                    </h4>
                    {project?.clientName && (
                      <p className="text-xs text-zinc-500 truncate">
                        Client: {project.clientName}
                      </p>
                    )}
                  </div>

                  {/* Diamond Specs Breakdown */}
                  <div className="space-y-1.5 mb-4 bg-black/20 rounded-2xl p-3 border border-white/5">
                    <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
                      <span>Requested Specifications</span>
                      <span className="text-lux-gold font-bold">{totalRequested} pcs total</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(r.lines || []).map((line, idx) => {
                        const spec = specsMap[line.specId];
                        const specLabel = spec 
                          ? `${spec.shape || 'Round'} ${spec.sizeMm ? spec.sizeMm.toFixed(2) + 'mm' : spec.label}`
                          : (line.specId.length > 12 ? 'Stones' : line.specId);

                        return (
                          <span 
                            key={idx}
                            className="inline-flex items-center gap-1 bg-white/[0.05] border border-white/5 px-2.5 py-1 rounded-lg text-xs font-mono text-zinc-300"
                          >
                            <Gem size={11} className="text-lux-gold/80" />
                            <span>{specLabel}</span>
                            <span className="text-lux-gold font-bold ml-0.5">({line.requestedPcs} pcs)</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Fulfillment Bag Details if available */}
                  {r.fulfillmentDetails && (
                    <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
                        <span className="font-mono font-bold text-emerald-300">
                          Bag #{r.fulfillmentDetails.bagNumber || 'Issued'}
                        </span>
                      </div>
                      <span className="text-emerald-400/80 font-mono text-[11px]">
                        {totalFulfilled} pcs issued
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Footer: Date and CTA */}
                <div className="flex justify-between items-center pt-3 border-t border-white/5 text-xs text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-zinc-500" />
                    <span>{new Date(r.requestedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}</span>
                  </div>

                  <span className="text-zinc-400 group-hover:text-lux-gold text-xs font-medium flex items-center gap-1 transition-colors">
                    View Job <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RequestStatusPage;
