
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, User, Role, Priority } from '../types';
import { Card, StatusPill, SetterAvatar, Input, Badge, Button } from '../components/UI';
import { Search, Filter, Layers, ChevronRight, Calendar, ArrowUpRight, Trash2, AlertTriangle, CheckCircle2, RotateCcw, Edit2, UserCheck, X } from 'lucide-react';
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

  // Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Pickup Confirmation State
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [projectToPickup, setProjectToPickup] = useState<string | null>(null);
  const [pickupConfirmation, setPickupConfirmation] = useState('');

  // Date Edit State
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');

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
      setPickupModalOpen(true);
  };

  const confirmPickupAction = async () => {
      if (projectToPickup && pickupConfirmation === 'DONE' && currentUser) {
          try {
              await store.confirmProjectPickup(projectToPickup, currentUser.id);
              showToast("Project Closed (Picked Up)");
              setPickupModalOpen(false);
              setProjectToPickup(null);
          } catch (error: any) {
              console.error("Pickup failed:", error);
              alert("Error updating project status: " + (error.message || "Unknown error"));
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

  const initiateDateEdit = (e: React.MouseEvent, p: Project) => {
      e.stopPropagation();
      setEditingDateId(p.id);
      setNewDate(p.date_picked_up ? p.date_picked_up.split('T')[0] : new Date().toISOString().split('T')[0]);
  };

  const saveDate = async (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      if (!currentUser) return;
      await store.updateProjectDate(projectId, 'date_picked_up', new Date(newDate).toISOString(), currentUser.id);
      setEditingDateId(null);
      showToast("Date Updated");
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
    // On large screens, set selected project for split view. On small screens, navigate.
    if (window.innerWidth >= 1024) {
      setSelectedProjectId(projectId);
    } else {
      navigate(`/project/${projectId}`);
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
        </div>
      </div>

      {/* Project List */}
      <div className="space-y-4">
        {filteredProjects.length === 0 ? (
           <div className="text-center py-24 bg-black/20 border-2 border-dashed border-[#2D313A] rounded-3xl">
              <p className="text-gray-500 font-medium">No projects match your filters.</p>
           </div>
        ) : (
          filteredProjects.map(p => {
             const activeAssignees = (p.assignments || []).filter(a => a.active);
             const setter = activeAssignees.length > 0 ? store.getUser(activeAssignees[0].userId) : undefined;
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
                            {p.code.substring(p.code.length - 2)}
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
                                 {editingDateId === p.id ? (
                                     <div className="flex items-center gap-1 bg-black rounded-xl p-1 border border-zinc-700" onClick={e => e.stopPropagation()}>
                                         <input 
                                            type="date" 
                                            value={newDate} 
                                            onChange={e => setNewDate(e.target.value)}
                                            className="bg-transparent text-white text-xs border-none focus:ring-0 p-0"
                                         />
                                         <button onClick={(e) => saveDate(e, p.id)} className="text-green-400 hover:text-white p-1"><CheckCircle2 size={14}/></button>
                                     </div>
                                 ) : (
                                     <div>
                                         <div className="text-[10px] text-emerald-500 font-bold uppercase">Picked Up</div>
                                         <div className="text-[10px] text-zinc-500 flex items-center justify-end gap-1">
                                             {p.date_picked_up ? new Date(p.date_picked_up).toLocaleDateString() : '-'}
                                             {isManager && (
                                                 <button onClick={(e) => initiateDateEdit(e, p)} className="text-zinc-600 hover:text-lux-gold transition-colors">
                                                     <Edit2 size={10} />
                                                 </button>
                                             )}
                                         </div>
                                     </div>
                                 )}
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
                            {isManager && p.status !== ProjectStatus.ACTIVE && (
                                <button
                                    onClick={(e) => handleRevert(e, p.id)}
                                    className="w-8 h-8 rounded-full bg-[#16171D] border border-[#2D313A] flex items-center justify-center text-zinc-500 hover:bg-white/10 hover:text-white transition-all z-10"
                                    title="Revert to Active"
                                >
                                    <RotateCcw size={14} />
                                </button>
                            )}

                            <button 
                               onClick={(e) => initiateDelete(e, p.id)}
                               className="w-8 h-8 rounded-full bg-[#16171D] border border-[#2D313A] flex items-center justify-center text-zinc-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-all z-10"
                               title="Delete Project"
                            >
                               <Trash2 size={16} />
                            </button>
                            <div className="w-8 h-8 rounded-full bg-[#16171D] flex items-center justify-center text-gray-500 group-hover:bg-lux-gold group-hover:text-[#16171D] transition-all border border-[#2D313A] group-hover:border-lux-gold">
                               <ArrowUpRight size={18} />
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Swipe Actions (Mobile/iPad only) */}
                   <div className="md:hidden flex shrink-0 snap-center items-center justify-center gap-2 px-4 ml-2">
                      {isManager && p.status !== ProjectStatus.ACTIVE && (
                         <button
                            onClick={(e) => handleRevert(e, p.id)}
                            className="w-20 h-full rounded-3xl bg-zinc-800/50 border border-zinc-700 flex flex-col items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-95"
                         >
                            <RotateCcw size={24} className="mb-2" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Revert</span>
                         </button>
                      )}
                      <button 
                         onClick={(e) => initiateDelete(e, p.id)}
                         className="w-20 h-full rounded-3xl bg-red-500/10 border border-red-500/20 flex flex-col items-center justify-center text-red-500 hover:bg-red-500/20 transition-all active:scale-95"
                      >
                         <Trash2 size={24} className="mb-2" />
                         <span className="text-[10px] font-bold uppercase tracking-wider">Delete</span>
                      </button>
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
          <div className="absolute top-6 right-6 z-50">
            <button 
              onClick={() => setSelectedProjectId(null)}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
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
                      disabled={pickupConfirmation !== 'DONE'} 
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
