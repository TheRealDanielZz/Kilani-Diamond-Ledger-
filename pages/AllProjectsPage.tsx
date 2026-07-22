
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, User, Role, Priority } from '../types';
import { Card, StatusPill, SetterAvatar, Input, Badge, Button } from '../components/UI';
import { Search, Filter, Layers, ChevronRight, Calendar, ArrowUpRight, Trash2, AlertTriangle, CheckCircle2, RotateCcw, UserCheck, X, LayoutGrid, List, Image as ImageIcon, Maximize2 } from 'lucide-react';
import { useToast } from '../App';
import ProjectDetail from './ProjectDetail';

function getEditDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  return matrix[b.length][a.length];
}

const isFuzzyMatch = (query: string, target: string) => {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    const t = target.toLowerCase();
    
    if (t.includes(q)) return true;
    if (q.length <= 3) return false;

    const qWords = q.split(/\s+/);
    const tWords = t.split(/\s+/);

    return qWords.every(qw => {
        return tWords.some(tw => {
            if (tw.includes(qw)) return true;
            if (qw.length > 3 && tw.length > 3) {
                const allowedTypos = qw.length > 5 ? 2 : 1;
                return getEditDistance(qw, tw) <= allowedTypos;
            }
            return false;
        });
    });
};

const AllProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const showToast = useToast();
  const currentUser = store.getCurrentUser();
  const isManager = currentUser?.role === Role.MANAGER;

  const [projects, setProjects] = useState<Project[]>([]);
  const [salesReps, setSalesReps] = useState<User[]>([]);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>(ProjectStatus.ACTIVE);
  const [salesRepFilter, setSalesRepFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'LIST' | 'GRID'>(() => {
    if (window.innerWidth < 640) return 'GRID';
    return (localStorage.getItem('kilani_all_projects_view_mode') as 'LIST' | 'GRID') || 'GRID';
  });

  const toggleViewMode = (mode: 'LIST' | 'GRID') => {
    setViewMode(mode);
    if (mode === 'GRID') {
      setSelectedProjectId(null);
    }
    localStorage.setItem('kilani_all_projects_view_mode', mode);
  };

  // Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Pickup Confirmation State
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [projectToPickup, setProjectToPickup] = useState<string | null>(null);
  const [pickupConfirmation, setPickupConfirmation] = useState('');
  const [actualPickupDate, setActualPickupDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
  const [latePickupReason, setLatePickupReason] = useState('');
  const [pickupSubmitting, setPickupSubmitting] = useState(false);

  // Master-Detail Split View State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
        setProjects([...store.getProjects()]);
        setSalesReps(store.getUsers().filter(u => u.role === Role.SALES_REP));
    };
    sync();
    return store.subscribe(sync);
  }, []);

  const initiateDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setProjectToDelete(projectId);
    setDeleteConfirmation('');
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (projectToDelete && deleteConfirmation === 'DELETE') {
      store.deleteProject(projectToDelete);
      setDeleteModalOpen(false);
      setProjectToDelete(null);
    }
  };

  const handlePickup = (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation(); 
      e.preventDefault();
      
      if (!currentUser) return;
      
      setProjectToPickup(projectId);
      setPickupConfirmation('');
      setActualPickupDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
      setLatePickupReason('');
      setPickupModalOpen(true);
  };

  const confirmPickupAction = async () => {
      if (projectToPickup && pickupConfirmation === 'DONE' && currentUser) {
          try {
              setPickupSubmitting(true);
              await store.confirmProjectPickup(projectToPickup, currentUser.id, actualPickupDate, latePickupReason);
              showToast("Project Closed (Picked Up)");
              setPickupModalOpen(false);
              setProjectToPickup(null);
          } catch (error: any) {
              console.error("Pickup failed:", error);
              alert("Error updating project status: " + (error.message || "Unknown error"));
          } finally {
              setPickupSubmitting(false);
          }
      }
  };

  const handleRevert = async (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      e.preventDefault();

      if (!currentUser) return;
      if (window.confirm("Return this project to Active production?")) {
          try {
              await store.revertToActive(projectId, currentUser.id);
              showToast("Project returned to Active");
          } catch (error: any) {
              alert("Error reverting project: " + error.message);
          }
      }
  };

  const filteredProjects = projects.filter(p => {
    const repName = salesReps.find(r => r.id === p.salesRepId)?.name || '';
    const searchableString = [
        p.clientName || '',
        p.clientPhone || '',
        p.pieceName || '',
        p.code || '',
        repName
    ].join(' ');

    const matchesSearch = isFuzzyMatch(search, searchableString);
    const matchesStatus = p.status === statusFilter;
    const matchesSalesRep = salesRepFilter === 'ALL' || p.salesRepId === salesRepFilter;
    
    return matchesSearch && matchesStatus && matchesSalesRep;
  });

  // Sort logic varies by tab
  filteredProjects.sort((a, b) => {
    if (statusFilter === ProjectStatus.ACTIVE) {
        if (a.priority === Priority.RUSH && b.priority !== Priority.RUSH) return -1;
        if (b.priority === Priority.RUSH && a.priority !== Priority.RUSH) return 1;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
    } else {
        // For Review and Closed, show most recent activity first
        const dateA = a.last_status_change_at ? new Date(a.last_status_change_at).getTime() : 0;
        const dateB = b.last_status_change_at ? new Date(b.last_status_change_at).getTime() : 0;
        return dateB - dateA;
    }
  });

  const handleProjectClick = (projectId: string) => {
    if (viewMode === 'GRID' || window.innerWidth < 1024) {
      navigate(`/project/${projectId}`);
    } else {
      setSelectedProjectId(projectId);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-5 py-8 pb-24 h-full flex flex-col lg:flex-row gap-6">
      {/* Master List View */}
      <div className={`flex-1 flex flex-col h-full ${selectedProjectId ? 'lg:w-1/3 lg:flex-none' : 'w-full'}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-black/20 p-3 rounded-2xl border border-[#2D313A] shadow-float">
             <Layers className="w-6 h-6 text-lux-gold" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Projects</h1>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-[0.15em] mt-1">Master Repository</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-5 relative">
            <Input 
             placeholder="Search code, client, or rep..." 
             value={search} 
             onChange={e => setSearch(e.target.value)}
             className="pl-11 bg-white/5 border-white/5 h-12"
            />
            <Search className="absolute left-4 top-4 w-4 h-4 text-zinc-500" />
        </div>
        
        <div className="lg:col-span-7 flex flex-col sm:flex-row gap-3">
           {/* Status Tabs */}
           <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-black/20 p-1 rounded-[1.5rem] border border-[#2D313A]">
               {[
                   { id: ProjectStatus.ACTIVE, label: 'Active' },
                   { id: ProjectStatus.REVIEW, label: 'Review' },
                   { id: ProjectStatus.CLOSED, label: 'Closed' }
               ].map(s => (
                 <button
                   key={s.id}
                   onClick={() => setStatusFilter(s.id)}
                   className={`px-5 py-2 rounded-2xl text-[11px] font-bold transition-all whitespace-nowrap ${statusFilter === s.id ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-zinc-500 hover:text-white'}`}
                 >
                   {s.label}
                 </button>
               ))}
           </div>

           {/* Sales Rep Filter */}
            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl border border-white/5 shrink-0 h-10">
              <Filter size={14} className="text-zinc-500" />
              <select 
                value={salesRepFilter}
                onChange={e => setSalesRepFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] text-zinc-300 font-bold focus:ring-0 cursor-pointer w-full sm:w-auto uppercase tracking-wider"
              >
                <option value="ALL">All Reps</option>
                {salesReps.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-black/20 p-1 rounded-2xl border border-[#2D313A] shrink-0 h-10">
               <button
                  onClick={() => toggleViewMode('GRID')}
                  title="Grid View"
                  className={`p-1.5 rounded-xl transition-all ${viewMode === 'GRID' ? 'bg-white/10 text-lux-gold' : 'text-zinc-500 hover:text-white'}`}
               >
                  <LayoutGrid size={16} />
               </button>
               <button
                  onClick={() => toggleViewMode('LIST')}
                  title="List View"
                  className={`p-1.5 rounded-xl transition-all ${viewMode === 'LIST' ? 'bg-white/10 text-lux-gold' : 'text-zinc-500 hover:text-white'}`}
               >
                  <List size={16} />
               </button>
            </div>
        </div>
      </div>

      {/* Project List */}
      <div className={viewMode === 'GRID' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-4'}>
        {filteredProjects.length === 0 ? (
           <div className={`text-center py-24 bg-black/20 border-2 border-dashed border-[#2D313A] rounded-3xl ${viewMode === 'GRID' ? 'col-span-full' : ''}`}>
              <p className="text-gray-500 font-medium">No projects match your filters.</p>
           </div>
        ) : (
          filteredProjects.map(p => {
             const activeAssignees = (p.assignments || []).filter(a => a.active);
             const setter = activeAssignees.length > 0 ? store.getUser(activeAssignees[0].userId) : undefined;

             if (viewMode === 'GRID') {
                return (
                   <div
                      key={p.id}
                      onClick={() => handleProjectClick(p.id)}
                      className={`
                         group border rounded-3xl overflow-hidden flex flex-col justify-between transition-all duration-300 cursor-pointer relative shadow-subtle hover:shadow-glow active:scale-[0.99]
                         ${selectedProjectId === p.id ? 'bg-lux-gold/10 border-lux-gold/50 shadow-glow' : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'}
                      `}
                   >
                      {/* Cover / Header Area */}
                      {p.projectPhotos && p.projectPhotos.length > 0 ? (
                         <div className="h-32 bg-black relative flex items-center justify-center border-b border-white/5">
                            <img src={p.projectPhotos[p.projectPhotos.length - 1]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={p.pieceName} />
                            <div className="absolute top-3 right-3">{p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}</div>
                            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 text-[10px] font-bold text-white shadow-lg">
                               {p.code}
                            </div>
                         </div>
                      ) : (
                         <div className="p-5 pb-0 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                               <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-xs font-black shadow-inner ${p.priority === Priority.RUSH ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-white/5 text-zinc-500 border border-white/5'}`}>
                                  {p.code.substring(Math.max(0, p.code.length - 2))}
                               </div>
                               <div className="min-w-0">
                                  <h3 className="font-bold text-white group-hover:text-lux-gold transition-colors truncate">{p.code}</h3>
                                  <p className="text-[10px] text-zinc-500 font-medium truncate">
                                     {p.clientName ? `${p.clientName} ` : ''}{p.clientPhone ? `(${p.clientPhone})` : ''}
                                  </p>
                               </div>
                            </div>
                            {p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}
                         </div>
                      )}

                      {/* Content Body */}
                      <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                         <div>
                            {p.projectPhotos && p.projectPhotos.length > 0 && (
                               <h3 className="font-bold text-white group-hover:text-lux-gold transition-colors truncate mb-0.5">{p.code}</h3>
                            )}
                            <p className="text-xs text-zinc-300 font-medium line-clamp-2">
                               {p.pieceName}
                            </p>
                            {p.projectPhotos && p.projectPhotos.length > 0 && (p.clientName || p.clientPhone) && (
                               <p className="text-[10px] text-zinc-500 font-medium truncate mt-1">
                                  {p.clientName ? `${p.clientName} ` : ''}{p.clientPhone ? `(${p.clientPhone})` : ''}
                               </p>
                            )}
                         </div>

                         {/* Status Info */}
                         <div className="mt-auto pt-2">
                            {p.status === ProjectStatus.REVIEW && (
                               <div className="text-amber-500 bg-amber-950/30 p-2.5 rounded-2xl border border-amber-900/50 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                                  <div className="min-w-0">
                                     <div className="text-[10px] font-bold uppercase tracking-wider">Ready for Pickup</div>
                                     <div className="text-[10px] text-zinc-400 truncate">Waiting confirmation</div>
                                  </div>
                                  {isManager && (
                                     <Button
                                        size="sm"
                                        onClick={(e) => handlePickup(e, p.id)}
                                        className="bg-amber-500 text-black hover:bg-white hover:text-black border-none font-bold text-xs h-7 px-2.5 shrink-0"
                                        icon={<CheckCircle2 size={12}/>}
                                     >
                                        Confirm
                                     </Button>
                                  )}
                               </div>
                            )}

                            {p.status === ProjectStatus.CLOSED && (
                               <div className="bg-emerald-950/20 p-2 rounded-2xl border border-emerald-900/30 flex items-center justify-between text-xs">
                                  <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Picked Up</span>
                                  <span className="text-[10px] text-zinc-400">
                                     {p.date_picked_up ? new Date(p.date_picked_up).toLocaleDateString() : '-'}
                                  </span>
                               </div>
                            )}

                            {p.status === ProjectStatus.ACTIVE && (
                               <div className="flex items-center justify-between text-xs text-zinc-400 bg-black/20 p-2 rounded-2xl border border-white/5">
                                  <div className="flex items-center gap-1.5 text-[11px]">
                                     <Calendar size={12} className="text-zinc-500" />
                                     <span>{new Date(p.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                  </div>
                                  <StatusPill status={p.status} />
                               </div>
                            )}
                         </div>

                         {/* Card Footer */}
                         <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                            <div className="flex -space-x-2 pl-1">
                               {activeAssignees.length > 0 ? (
                                  activeAssignees.map(a => {
                                     const u = store.getUser(a.userId);
                                     return u ? <div key={u.id} className="ring-2 ring-[#1F2128] rounded-full"><SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="sm" /></div> : null;
                                  })
                               ) : (
                                  <span className="text-[10px] text-zinc-600 italic">Unassigned</span>
                               )}
                            </div>

                            <div className="flex items-center gap-1.5">
                               {isManager && p.status === ProjectStatus.REVIEW && (
                                  <button
                                     onClick={(e) => handleRevert(e, p.id)}
                                     className="w-8 h-8 rounded-full bg-[#16171D] border border-[#2D313A] flex items-center justify-center text-zinc-500 hover:bg-white/10 hover:text-white transition-all z-10"
                                     title="Revert to Active"
                                  >
                                     <RotateCcw size={14} />
                                  </button>
                               )}

                               {p.status !== ProjectStatus.CLOSED && (
                                  <button
                                     onClick={(e) => initiateDelete(e, p.id)}
                                     className="w-8 h-8 rounded-full bg-[#16171D] border border-[#2D313A] flex items-center justify-center text-zinc-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-all z-10"
                                     title="Delete Project"
                                  >
                                     <Trash2 size={16} />
                                  </button>
                               )}
                               <div className="w-8 h-8 rounded-full bg-[#16171D] flex items-center justify-center text-gray-500 group-hover:bg-lux-gold group-hover:text-[#16171D] transition-all border border-[#2D313A] group-hover:border-lux-gold">
                                  <ArrowUpRight size={18} />
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                );
             }

             return (
               <div key={p.id} className="relative overflow-hidden rounded-3xl group/swipe">
                 <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full">
                   {/* Main Card */}
                   <div 
                     onClick={() => handleProjectClick(p.id)}
                     className={`
                        w-full shrink-0 snap-center
                        group border rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 transition-all duration-300 cursor-pointer relative overflow-hidden active:scale-[0.99]
                        ${selectedProjectId === p.id ? 'bg-lux-gold/10 border-lux-gold/50' : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'}
                     `}
                   >
                      <div className="flex-1 flex items-center gap-4 w-full min-w-0">
                         <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-sm font-black shadow-inner ${p.priority === Priority.RUSH ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-white/5 text-zinc-500 border border-white/5'}`}>
                            {p.code.substring(Math.max(0, p.code.length - 2))}
                         </div>
                         <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between md:justify-start gap-2 mb-1">
                               <h3 className="font-bold text-white group-hover:text-lux-gold transition-colors truncate">{p.code}</h3>
                               {p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}
                            </div>
                             <p className="text-xs text-gray-500 font-medium truncate">
                                {p.clientName ? `${p.clientName} ` : ''}
                                {p.clientPhone ? `(${p.clientPhone}) — ` : (p.clientName ? '— ' : '')}
                                {p.pieceName}
                             </p>
                            {p.status === ProjectStatus.REVIEW && (
                                <div className="mt-1 text-[10px] text-amber-500 font-medium flex items-center gap-1">
                                    <AlertTriangle size={10} /> Finished Production • Waiting for Pickup
                                </div>
                            )}
                         </div>
                      </div>

                      <div className="h-px bg-zinc-800/50 w-full md:hidden"></div>

                      <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                         
                         {/* REVIEW STATUS ACTION - Enhanced Callout */}
                         {p.status === ProjectStatus.REVIEW && isManager && (
                             <div className="flex flex-col md:flex-row items-end md:items-center gap-3 bg-amber-950/30 p-2 rounded-2xl border border-amber-900/50" onClick={e => e.stopPropagation()}>
                                 <div className="text-right hidden xl:block mr-2">
                                     <div className="text-[10px] text-amber-500 font-bold uppercase">Ready for Pickup</div>
                                     <div className="text-[10px] text-zinc-500 truncate max-w-[150px]">Client: {p.clientName || 'Unknown'}</div>
                                 </div>
                                 <span className="text-xs text-amber-200 font-medium md:hidden">Picked up?</span>
                                 <Button 
                                    size="sm" 
                                    onClick={(e) => handlePickup(e, p.id)} 
                                    className="bg-amber-500 text-black hover:bg-white hover:text-black border-none shadow-glow font-bold h-8"
                                    icon={<CheckCircle2 size={14}/>}
                                 >
                                    Confirm
                                 </Button>
                             </div>
                         )}

                         {/* CLOSED STATUS INFO & EDIT DATE */}
                         {p.status === ProjectStatus.CLOSED && (
                             <div className="text-right flex items-center gap-3">
                                 <div>
                                     <div className="text-[10px] text-emerald-500 font-bold uppercase">Picked Up</div>
                                     <div className="text-[10px] text-zinc-500 flex items-center justify-end gap-1">
                                         {p.date_picked_up ? new Date(p.date_picked_up).toLocaleDateString() : '-'}
                                     </div>
                                 </div>
                             </div>
                         )}

                         {/* ACTIVE STATUS INFO */}
                         {p.status === ProjectStatus.ACTIVE && (
                            <div className="text-right min-w-[100px]">
                                <div className="flex items-center justify-end gap-1.5 text-xs text-gray-400 mb-1">
                                <Calendar size={12} />
                                <span>{new Date(p.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                </div>
                                <StatusPill status={p.status} />
                            </div>
                         )}

                         {/* Action Arrow & Delete/Revert (Desktop only, hidden on mobile for swipe) */}
                         <div className="hidden md:flex items-center gap-2">
                            {/* Revert Button for Managers on Non-Active Projects */}
                            {isManager && p.status === ProjectStatus.REVIEW && (
                                <button
                                    onClick={(e) => handleRevert(e, p.id)}
                                    className="w-8 h-8 rounded-full bg-[#16171D] border border-[#2D313A] flex items-center justify-center text-zinc-500 hover:bg-white/10 hover:text-white transition-all z-10"
                                    title="Revert to Active"
                                >
                                    <RotateCcw size={14} />
                                </button>
                            )}

                            {p.status !== ProjectStatus.CLOSED && (
                              <button
                                 onClick={(e) => initiateDelete(e, p.id)}
                                 className="w-8 h-8 rounded-full bg-[#16171D] border border-[#2D313A] flex items-center justify-center text-zinc-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-all z-10"
                                 title="Delete Project"
                              >
                                 <Trash2 size={16} />
                              </button>
                            )}
                            <div className="w-8 h-8 rounded-full bg-[#16171D] flex items-center justify-center text-gray-500 group-hover:bg-lux-gold group-hover:text-[#16171D] transition-all border border-[#2D313A] group-hover:border-lux-gold">
                               <ArrowUpRight size={18} />
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Swipe Actions (Mobile/iPad only) */}
                   <div className="md:hidden flex shrink-0 snap-center items-center justify-center gap-2 px-4 ml-2">
                      {isManager && p.status === ProjectStatus.REVIEW && (
                         <button
                            onClick={(e) => handleRevert(e, p.id)}
                            className="w-20 h-full rounded-3xl bg-zinc-800/50 border border-zinc-700 flex flex-col items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-95"
                         >
                            <RotateCcw size={24} className="mb-2" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Revert</span>
                         </button>
                      )}
                      {p.status !== ProjectStatus.CLOSED && (
                        <button
                           onClick={(e) => initiateDelete(e, p.id)}
                           className="w-20 h-full rounded-3xl bg-red-500/10 border border-red-500/20 flex flex-col items-center justify-center text-red-500 hover:bg-red-500/20 transition-all active:scale-95"
                        >
                           <Trash2 size={24} className="mb-2" />
                           <span className="text-[10px] font-bold uppercase tracking-wider">Delete</span>
                        </button>
                      )}
                   </div>
                 </div>
               </div>
             );
          })
        )}
      </div>
      </div>

      {/* Detail View (iPad/Desktop Split View) */}
      {selectedProjectId && (
        <div className="hidden lg:flex flex-col w-2/3 bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden relative">
          <div className="absolute top-6 right-6 z-50 flex items-center gap-2">
            <button 
              onClick={() => navigate(`/project/${selectedProjectId}`)}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              title="Open Fullscreen"
            >
              <Maximize2 size={18} />
            </button>
            <button 
              onClick={() => setSelectedProjectId(null)}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              title="Close Quick Peek"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <ProjectDetail currentUser={currentUser} projectId={selectedProjectId} />
          </div>
        </div>
      )}

      {/* Pickup Confirmation Modal */}
      {pickupModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 border-amber-500/30 shadow-2xl animate-in zoom-in-95 rounded-[2.5rem]">
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 border border-amber-500/20 text-amber-500">
                    <CheckCircle2 size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-white mb-2">Confirm Pickup</h3>
                 <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                    This will mark the project as <b>Closed</b>. Please confirm the client has received the item.
                 </p>
                 
                 <div className="w-full mb-6 text-left">
                    <Input
                      label="Actual Pickup Date"
                      type="date"
                      value={actualPickupDate}
                      max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })}
                      onChange={e => setActualPickupDate(e.target.value)}
                    />
                    {actualPickupDate < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) && (
                      <div className="mt-3">
                        <Input label="Late-entry reason" value={latePickupReason} onChange={e => setLatePickupReason(e.target.value)} placeholder="Why is pickup being entered later?" />
                      </div>
                    )}
                    <p className="text-[11px] text-zinc-500 mt-3 mb-4">The historical CAD gold rate for this date will be snapshotted. Pickup will stop if the rate is unavailable.</p>
                    <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">
                       Type <span className="text-white select-none">DONE</span> to confirm
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-black border border-amber-900/50 rounded-2xl p-3 text-center font-bold text-amber-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder-zinc-800"
                      placeholder="DONE"
                      value={pickupConfirmation}
                      onChange={(e) => setPickupConfirmation(e.target.value)}
                      autoFocus
                    />
                 </div>

                 <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={() => setPickupModalOpen(false)} className="flex-1">Cancel</Button>
                    <Button 
                      className="flex-1 bg-amber-500 text-black hover:bg-amber-400 border-none"
                      disabled={pickupConfirmation !== 'DONE' || !actualPickupDate || (actualPickupDate < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) && !latePickupReason.trim()) || pickupSubmitting}
                      loading={pickupSubmitting}
                      onClick={confirmPickupAction}
                    >
                       Confirm Pickup
                    </Button>
                 </div>
              </div>
           </Card>
        </div>
      )}

      {/* Strict Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 border-red-500/30 shadow-2xl animate-in zoom-in-95 rounded-[2.5rem]">
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20 text-red-500">
                    <AlertTriangle size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-white mb-2">Delete Project?</h3>
                 <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                    This action is <span className="text-red-400 font-bold">irreversible</span>. All data including bags, movements, and logs will be permanently removed.
                 </p>
                 
                 <div className="w-full mb-6 text-left">
                    <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">
                       Type <span className="text-white select-none">DELETE</span> to confirm
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-black border border-red-900/50 rounded-2xl p-3 text-center font-bold text-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder-zinc-800"
                      placeholder="DELETE"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      autoFocus
                    />
                 </div>

                 <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={() => setDeleteModalOpen(false)} className="flex-1">Cancel</Button>
                    <Button 
                      variant="danger" 
                      disabled={deleteConfirmation !== 'DELETE'} 
                      onClick={confirmDelete}
                      className="flex-1"
                    >
                       Delete Forever
                    </Button>
                 </div>
              </div>
           </Card>
        </div>
      )}
    </div>
  );
};

export default AllProjectsPage;
