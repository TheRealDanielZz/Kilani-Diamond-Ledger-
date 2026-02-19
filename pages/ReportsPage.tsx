
import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { Card, Button, Badge, StatusPill, SetterAvatar, Input } from '../components/UI';
import { FileBarChart, Download, X, Calendar, Search, Activity, Gem, Users, Clock, AlertOctagon, Filter, Image as ImageIcon, Box, Scale, ArrowRight, Coins, Save, Edit2, Ban, CheckCircle2, TrendingUp, Lock, FileDown } from 'lucide-react';
import { Project, ProjectCostSummary, InventoryMovement, InventoryMovementType, Role, CastingEvent, User, ProjectStatus } from '../types';
import { useToast } from '../App';
import { generateProjectPDF } from '../utils/pdfGenerator';

const ReportsPage: React.FC = () => {
  const showToast = useToast();
  const currentUser = store.getCurrentUser();
  const isManager = currentUser?.role === Role.MANAGER;

  const [activeTab, setActiveTab] = useState<'inventory' | 'projects' | 'broken'>('inventory');
  
  // Inventory Report State
  const [movements, setMovements] = useState(store.getInventoryMovements());
  
  // Project Report State
  const [projects, setProjects] = useState(store.getProjects());
  const [salesReps, setSalesReps] = useState<User[]>([]);
  const [salesRepFilter, setSalesRepFilter] = useState('ALL');
  const [clientFilter, setClientFilter] = useState('');

  // Broken Report State
  const [brokenMovements, setBrokenMovements] = useState<InventoryMovement[]>([]);

  // Project Detail Modal State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectCostSummary | null>(null);
  const [projectLogs, setProjectLogs] = useState<any[]>([]);
  const [modalTab, setModalTab] = useState<'overview' | 'financial'>('overview');

  // Financial Editing State
  const [isEditingLabour, setIsEditingLabour] = useState(false);
  const [editLabourFee, setEditLabourFee] = useState('');
  const [editLabourNote, setEditLabourNote] = useState('');
  const [isSavingCost, setIsSavingCost] = useState(false);
  
  // Live Gold Price State
  const [liveGoldPrice, setLiveGoldPrice] = useState(store.getLiveGoldPrice());
  
  // Export State
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
        // Refresh based on active tab
        if (activeTab === 'projects') {
            setProjects([...store.getProjects()]);
            setSalesReps(store.getUsers().filter(u => u.role === Role.SALES_REP));
        } else if (activeTab === 'inventory') {
            setMovements([...store.getInventoryMovements()]);
        } else if (activeTab === 'broken') {
            const all = store.getInventoryMovements();
            setBrokenMovements(all.filter(m => m.type === InventoryMovementType.BROKEN_OUT));
        }
        setLiveGoldPrice(store.getLiveGoldPrice());
    };
    
    sync();
    return store.subscribe(sync);
  }, [activeTab]);

  useEffect(() => {
    if (selectedProject) {
       // Refresh project data from store to ensure we have latest snapshots/financials
       const fresh = store.getProject(selectedProject.id);
       const p = fresh || selectedProject;
       
       if (fresh && fresh !== selectedProject) {
           setSelectedProject(fresh);
       }

       const cost = store.getProjectCostSummary(p.id);
       setProjectStats(cost);
       
       // Initialize edit fields if not currently editing
       if (!isEditingLabour) {
           setEditLabourFee(p.labourCostAmount?.toString() || '');
           setEditLabourNote(p.labourCostNote || '');
       }

       // Build logs
       const progress = p.progress.map(prog => ({
         id: prog.id,
         type: 'PROGRESS',
         date: prog.createdAt,
         user: store.getUser(prog.createdById),
         details: `Moved to ${prog.stageName}`,
         extra: prog.weightG ? `${prog.weightG}g` : null,
         highlight: false
       }));

       const inventory = store.getInventoryMovements()
         .filter(m => m.referenceProjectId === p.id)
         .map(m => ({
           id: m.id,
           type: m.type.replace(/_/g, ' '),
           date: m.createdAt,
           user: store.getUser(m.createdById),
           details: m.notes || 'Inventory Movement',
           highlight: true
         }));
         
       const designNotes = p.designLogs?.map(d => ({
          id: d.id,
          type: d.type === 'DESIGN' ? 'DESIGN NOTE' : 'NOTE',
          date: d.createdAt,
          user: store.getUser(d.createdById),
          details: d.note,
          highlight: false
       })) || [];
       
       const combined = [...progress, ...inventory, ...designNotes].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
       setProjectLogs(combined);
    }
  }, [selectedProject, isEditingLabour]); // Dependency on isEditingLabour prevents overwrite while typing

  const handleSelectProject = (projectFromList: Project) => {
      const freshProject = store.getProject(projectFromList.id);
      setSelectedProject(freshProject || projectFromList);
      setModalTab('overview'); // Reset tab
      setIsEditingLabour(false);
  };

  const handleUpdateCost = async () => {
      if (!selectedProject) return;
      setIsSavingCost(true);
      try {
          const val = parseFloat(editLabourFee);
          if (val < 0) throw new Error("Labour cost cannot be negative.");
          
          await store.updateProjectLabourCost(selectedProject.id, val || 0, editLabourNote);
          setIsEditingLabour(false);
          showToast("Financials Saved ✓");
          // Store subscription will auto-update selectedProject
      } catch (e: any) {
          alert(e.message);
      } finally {
          setIsSavingCost(false);
      }
  };
  
  const handleExportPDF = async (e: React.MouseEvent, p: Project) => {
      e.stopPropagation();
      if (generatingPdfId) return; // Prevent double click
      
      setGeneratingPdfId(p.id);
      showToast("Generating PDF...");
      
      try {
          // 1. Fetch fresh data
          const freshProject = store.getProject(p.id) || p;
          const freshCost = store.getProjectCostSummary(freshProject.id);
          const livePrice = store.getLiveGoldPrice();
          
          // 2. Generate
          await generateProjectPDF(freshProject, freshCost, currentUser, livePrice?.lastUpdated);
          
          showToast("Export Complete ✓");
      } catch (err) {
          console.error(err);
          showToast("Export Failed");
      } finally {
          setGeneratingPdfId(null);
      }
  };

  const filteredProjects = projects.filter(p => {
     const matchesRep = salesRepFilter === 'ALL' || p.salesRepId === salesRepFilter;
     const matchesClient = !clientFilter || p.clientName?.toLowerCase().includes(clientFilter.toLowerCase());
     return matchesRep && matchesClient;
  });

  const exportCSV = (data: any[], filename: string) => {
    if(!data.length) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
  };

  const formatDateTime = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-24">
      <h1 data-tour="reports-header" className="text-2xl font-bold text-white mb-6">Reports Hub</h1>
      
      <div className="flex border-b border-zinc-800 mb-8">
         <button onClick={() => setActiveTab('inventory')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500'}`}>Inventory Ledger</button>
         <button onClick={() => setActiveTab('broken')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'broken' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500'}`}>Broken Stones</button>
         <button onClick={() => setActiveTab('projects')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'projects' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500'}`}>Project History</button>
      </div>

      {activeTab === 'inventory' && (
        <Card className="overflow-hidden">
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex justify-between">
              <h3 className="font-bold text-white">All Movements</h3>
              <Button size="sm" variant="secondary" onClick={() => exportCSV(movements.map(m => ({id: m.id, date: m.createdAt, type: m.type, note: m.notes})), 'inventory_ledger')}>Export CSV</Button>
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
               <thead className="bg-zinc-900 text-zinc-500 font-bold uppercase text-[11px]">
                 <tr>
                   <th className="p-4">Date</th>
                   <th className="p-4">Type</th>
                   <th className="p-4">Ref</th>
                   <th className="p-4">Notes</th>
                   <th className="p-4 text-right">Items</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-800/50">
                 {movements.slice(0, 50).map(m => (
                   <tr key={m.id} className="hover:bg-zinc-900/30">
                     <td className="p-4 text-zinc-400 font-mono">{new Date(m.createdAt).toLocaleDateString()}</td>
                     <td className="p-4 text-white font-bold">{m.type}</td>
                     <td className="p-4 text-zinc-500">{m.referenceBagNumber ? `Bag #${m.referenceBagNumber}` : '-'}</td>
                     <td className="p-4 text-zinc-400 truncate max-w-xs">{m.notes}</td>
                     <td className="p-4 text-right font-mono text-lux-gold">
                        {m.lines[0]?.specId === 'MIXED-UNSORTED' ? `${m.lines[0].ct} ct` : `${m.lines.reduce((a,b)=>a+(b.pcs||0),0)} pcs`}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </Card>
      )}

      {activeTab === 'broken' && (
         <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-red-950/20 border border-red-900/30 p-5 rounded-2xl">
                  <div className="text-red-400 text-xs font-bold uppercase mb-1">Total Broken Carats</div>
                  <div className="text-2xl font-bold text-white font-mono">
                     {brokenMovements.reduce((acc, m) => acc + m.lines.reduce((a,l)=>a+l.ct,0), 0).toFixed(3)} ct
                  </div>
               </div>
               <div className="bg-red-950/20 border border-red-900/30 p-5 rounded-2xl">
                  <div className="text-red-400 text-xs font-bold uppercase mb-1">Total Incidents</div>
                  <div className="text-2xl font-bold text-white font-mono">
                     {brokenMovements.length}
                  </div>
               </div>
            </div>

            <Card className="overflow-hidden">
               <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex justify-between">
                  <div className="flex items-center gap-2">
                     <AlertOctagon size={18} className="text-red-500" />
                     <h3 className="font-bold text-white">Breakage Log</h3>
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-zinc-900 text-zinc-500 font-bold uppercase text-[11px]">
                     <tr>
                       <th className="p-4">Date</th>
                       <th className="p-4">Project / Note</th>
                       <th className="p-4">Spec</th>
                       <th className="p-4 text-right">Qty</th>
                       <th className="p-4 text-right">Weight</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-800/50">
                     {brokenMovements.map(m => (
                        <React.Fragment key={m.id}>
                           {m.lines.map((l, idx) => {
                              const spec = l.specId ? store.getSpecs().find(s => s.id === l.specId) : null;
                              const p = store.getProject(m.referenceProjectId || '');
                              return (
                                 <tr key={`${m.id}-${idx}`} className="hover:bg-zinc-900/30">
                                    <td className="p-4 text-zinc-400 font-mono">{new Date(m.createdAt).toLocaleDateString()}</td>
                                    <td className="p-4">
                                       {p && <div className="text-white font-bold text-xs mb-0.5">{p.code}</div>}
                                       <div className="text-zinc-500 text-xs">{m.notes}</div>
                                    </td>
                                    <td className="p-4 text-zinc-300">{spec ? spec.label : <span className="text-zinc-500 italic">Mixed/Unknown</span>}</td>
                                    <td className="p-4 text-right font-mono text-red-400">{l.pcs ? l.pcs : '-'}</td>
                                    <td className="p-4 text-right font-mono text-zinc-500">{l.ct.toFixed(3)}</td>
                                 </tr>
                              );
                           })}
                        </React.Fragment>
                     ))}
                     {brokenMovements.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-zinc-500">No breakage recorded.</td></tr>
                     )}
                   </tbody>
                 </table>
               </div>
            </Card>
         </div>
      )}

      {activeTab === 'projects' && (
        <Card className="overflow-hidden">
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div className="flex flex-col md:flex-row gap-4 flex-1">
                 <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input 
                       type="text" 
                       placeholder="Filter by Client Name..." 
                       value={clientFilter}
                       onChange={e => setClientFilter(e.target.value)}
                       className="w-full bg-black border border-zinc-700 rounded-lg py-2 pl-9 text-sm text-white focus:border-lux-gold"
                    />
                 </div>
                 <div className="flex items-center gap-2 text-xs">
                    <Filter size={14} className="text-zinc-500" />
                    <select 
                       value={salesRepFilter} 
                       onChange={e => setSalesRepFilter(e.target.value)}
                       className="bg-black border border-zinc-700 rounded-lg py-2 px-2 text-white h-9"
                    >
                       <option value="ALL">All Sales Reps</option>
                       {salesReps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                 </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => exportCSV(filteredProjects, 'project_history')}>Export CSV</Button>
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
               <thead className="bg-zinc-900 text-zinc-500 font-bold uppercase text-[11px]">
                 <tr>
                   <th className="p-4 w-16">Image</th>
                   <th className="p-4">Code</th>
                   <th className="p-4">Client</th>
                   <th className="p-4">Name</th>
                   <th className="p-4">Sales Rep</th>
                   <th className="p-4">Status</th>
                   <th className="p-4 text-right">Progress</th>
                   <th className="p-4 w-16"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-800/50">
                 {filteredProjects.map(p => (
                   <tr key={p.id} onClick={() => handleSelectProject(p)} className="hover:bg-zinc-900/50 cursor-pointer transition-colors group">
                     <td className="p-4">
                        <div className="w-10 h-10 bg-black rounded-lg border border-zinc-800 overflow-hidden flex items-center justify-center">
                           {p.projectPhotos && p.projectPhotos.length > 0 ? (
                              <img src={p.projectPhotos[0]} className="w-full h-full object-cover" />
                           ) : (
                              <ImageIcon size={16} className="text-zinc-700" />
                           )}
                        </div>
                     </td>
                     <td className="p-4 text-white font-bold group-hover:text-lux-gold transition-colors">{p.code}</td>
                     <td className="p-4 text-zinc-300">{p.clientName || '-'}</td>
                     <td className="p-4 text-zinc-400">{p.pieceName}</td>
                     <td className="p-4 text-zinc-400">{store.getUser(p.salesRepId || '')?.name || '-'}</td>
                     <td className="p-4"><StatusPill status={p.status} /></td>
                     <td className="p-4 text-right font-mono">{p.currentPercentComplete || 0}%</td>
                     <td className="p-4">
                        <button 
                           onClick={(e) => handleExportPDF(e, p)} 
                           className={`p-2 rounded-full hover:bg-white/10 text-zinc-500 hover:text-lux-gold transition-colors ${generatingPdfId === p.id ? 'animate-pulse text-lux-gold' : ''}`}
                           title="Export PDF"
                        >
                           <FileDown size={18} />
                        </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </Card>
      )}

      {/* Project Detail Modal - Redesigned with Tabs */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <Card className="w-full max-w-5xl h-[85vh] flex flex-col bg-[#1A1A1A] border-white/5 shadow-2xl relative animate-in fade-in zoom-in-95 overflow-hidden">
              
              {/* Premium Header */}
              <div className="px-8 pt-8 pb-4 flex justify-between items-start z-10 relative bg-[#1A1A1A]">
                 <div>
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-white mb-2 tracking-tight">
                        {selectedProject.clientName || <span className="text-zinc-600 italic">No Client</span>}
                    </h2>
                    <div className="flex items-center gap-3 text-sm text-zinc-400 font-medium">
                       <span className="font-mono text-lux-gold bg-lux-gold/10 px-2 py-0.5 rounded">{selectedProject.code}</span>
                       <span>•</span>
                       <span>{selectedProject.pieceName}</span>
                       {selectedProject.goldType && (
                           <>
                             <span>•</span>
                             <span className="text-amber-500">{selectedProject.goldPurity} {selectedProject.goldType}</span>
                           </>
                       )}
                    </div>
                 </div>
                 <div className="flex gap-4 items-center">
                    <Button size="sm" variant="secondary" onClick={(e) => handleExportPDF(e, selectedProject)} loading={generatingPdfId === selectedProject.id} icon={<FileDown size={16}/>}>Export PDF</Button>
                    <StatusPill status={selectedProject.status} />
                    <button onClick={() => setSelectedProject(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all">
                        <X size={20} />
                    </button>
                 </div>
              </div>

              {/* Tabs Navigation */}
              <div className="px-8 border-b border-white/5 bg-[#1A1A1A]">
                 <div className="flex gap-6">
                    <button 
                       onClick={() => setModalTab('overview')}
                       className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all ${modalTab === 'overview' ? 'text-lux-gold border-b-2 border-lux-gold' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                       Overview
                    </button>
                    <button 
                       onClick={() => setModalTab('financial')}
                       className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all ${modalTab === 'financial' ? 'text-lux-gold border-b-2 border-lux-gold' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                       Financial Summary
                    </button>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-[#16171d]">
                 
                 {/* TAB A: OVERVIEW */}
                 {modalTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        {/* Left Col */}
                        <div className="space-y-8">
                           {/* Diamond Usage Breakdown */}
                           <div className="bg-[#1F2128]/50 border border-zinc-800/50 rounded-2xl overflow-hidden">
                              <div className="p-4 border-b border-white/5 flex items-center gap-2">
                                 <Gem size={16} className="text-blue-400" />
                                 <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Diamond Usage</h3>
                              </div>
                              <table className="w-full text-sm text-left">
                                 <thead className="bg-black/20 text-zinc-500 text-[10px] uppercase font-bold">
                                    <tr>
                                       <th className="p-4 pl-6">Spec</th>
                                       <th className="p-4 text-right text-lux-gold">Net Qty</th>
                                       <th className="p-4 text-right pr-6 text-red-400">Broken</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-white/5">
                                    {projectStats?.breakdown.length === 0 ? (
                                       <tr><td colSpan={3} className="p-6 text-center text-zinc-600 italic">No diamonds used yet.</td></tr>
                                    ) : (
                                       projectStats?.breakdown.map((item, i) => (
                                          <tr key={i} className="hover:bg-white/5 transition-colors">
                                             <td className="p-4 pl-6">
                                                <div className="text-white font-medium">{item.spec.label}</div>
                                                <div className="text-[10px] text-zinc-500">{item.spec.sizeMm}mm</div>
                                             </td>
                                             <td className="p-4 text-right text-zinc-300 font-mono">
                                                {item.usedPcs} pcs
                                             </td>
                                             <td className="p-4 text-right pr-6 text-red-400 font-mono">
                                                {item.brokenPcs > 0 ? item.brokenPcs : '-'}
                                             </td>
                                          </tr>
                                       ))
                                    )}
                                 </tbody>
                              </table>
                           </div>

                           {/* Casting History */}
                           <Card className="border-zinc-800 bg-[#1F2128]/50 p-5">
                              <div className="flex items-center gap-2 mb-4 text-lux-gold">
                                 <Box size={16} />
                                 <h3 className="text-xs font-bold uppercase tracking-widest text-white">Casting History</h3>
                              </div>
                              <div className="space-y-3">
                                 {selectedProject.castingEvents?.length ? (
                                    selectedProject.castingEvents.map((e, i) => (
                                       <div key={i} className="flex justify-between items-center text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                          <div className="text-zinc-400">Cycle #{e.cycleNumber}</div>
                                          <div className="text-right">
                                             <div className="text-white font-mono">{e.receivedWeightG ? `${e.receivedWeightG.toFixed(2)}g` : 'Pending'}</div>
                                             <div className="text-[10px] text-zinc-600">{formatDateTime(e.sentAt)}</div>
                                          </div>
                                       </div>
                                    ))
                                 ) : <p className="text-zinc-600 text-xs italic">No casting records.</p>}
                              </div>
                           </Card>
                        </div>

                        {/* Right Col */}
                        <div className="space-y-8">
                           {/* Weight Timeline */}
                           <Card className="border-zinc-800 bg-[#1F2128]/50 p-5">
                              <div className="flex items-center gap-2 mb-4 text-purple-400">
                                 <Scale size={16} />
                                 <h3 className="text-xs font-bold uppercase tracking-widest text-white">Weight Timeline</h3>
                              </div>
                              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                 {selectedProject.progress.filter(p => p.weightG).length === 0 ? (
                                    <p className="text-zinc-600 text-xs italic text-center py-4">No weight recorded.</p>
                                 ) : (
                                    selectedProject.progress.filter(p => p.weightG).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((p, i) => (
                                       <div key={i} className="flex justify-between items-center text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                          <div className="text-zinc-300 font-medium">{p.stageName}</div>
                                          <div className="text-right">
                                             <div className="text-purple-400 font-mono font-bold">{p.weightG?.toFixed(2)}g</div>
                                             <div className="text-[10px] text-zinc-600">{new Date(p.createdAt).toLocaleDateString()}</div>
                                          </div>
                                       </div>
                                    ))
                                 )}
                              </div>
                           </Card>

                           {/* Audit Log */}
                           <Card className="h-[400px] border-zinc-800 bg-[#1F2128]/50 flex flex-col">
                              <div className="p-4 border-b border-zinc-800 bg-zinc-900/30 flex items-center gap-2">
                                 <Clock size={16} className="text-zinc-400" />
                                 <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-widest">History Log</h3>
                              </div>
                              <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                                 {projectLogs.length === 0 ? (
                                    <p className="text-zinc-600 text-sm text-center py-8">No activity recorded.</p>
                                 ) : (
                                    projectLogs.map((log, i) => (
                                       <div key={i} className="flex gap-3 relative group">
                                          {/* Timeline Line */}
                                          {i !== projectLogs.length - 1 && (
                                             <div className="absolute left-[5px] top-3 bottom-[-24px] w-px bg-zinc-800 group-last:hidden"></div>
                                          )}
                                          
                                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 z-10 ring-4 ring-[#1F2128] ${log.type.includes('BROKEN') ? 'bg-red-500' : log.highlight ? 'bg-lux-gold' : 'bg-zinc-600'}`}></div>
                                          
                                          <div className="pb-1">
                                             <div className={`text-sm font-medium mb-0.5 ${log.type.includes('BROKEN') ? 'text-red-400' : 'text-zinc-300'}`}>{log.details}</div>
                                             <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                                                <span>{new Date(log.date).toLocaleString()}</span>
                                                <span>•</span>
                                                <span>{log.user?.name || 'System'}</span>
                                             </div>
                                             {log.extra && <div className="text-[10px] text-lux-gold font-mono mt-1 bg-lux-gold/5 px-1.5 py-0.5 rounded inline-block border border-lux-gold/10">{log.extra}</div>}
                                          </div>
                                       </div>
                                    ))
                                 )}
                              </div>
                           </Card>
                        </div>
                    </div>
                 )}

                 {/* TAB B: FINANCIAL SUMMARY */}
                 {modalTab === 'financial' && (
                    <div className="max-w-3xl mx-auto animate-in slide-in-from-right-2 fade-in duration-300">
                       <div className="bg-gradient-to-b from-[#1F2128] to-black border border-white/5 rounded-3xl p-8 relative overflow-hidden group shadow-2xl">
                          {/* Ambient Glow */}
                          <div className="absolute -top-20 -right-20 w-60 h-60 bg-lux-gold/5 rounded-full blur-3xl group-hover:bg-lux-gold/10 transition-colors duration-1000 pointer-events-none"></div>

                          <div className="flex items-center gap-3 mb-8">
                             <div className="w-10 h-10 rounded-full bg-lux-gold/10 flex items-center justify-center text-lux-gold border border-lux-gold/20">
                                <Coins size={20} />
                             </div>
                             <div>
                                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Project Cost Summary</h3>
                                <p className="text-xs text-zinc-500">Financial Breakdown & Margins</p>
                             </div>
                          </div>

                          <div className="space-y-6 relative z-10">
                            {/* A) GOLD SECTION */}
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                               <div className="flex justify-between items-start mb-2">
                                  <div className="flex flex-col">
                                     <span className="text-zinc-300 font-bold text-sm">Final Gold Cost</span>
                                     <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
                                        <span>{selectedProject.goldPurity} {selectedProject.goldType}</span>
                                        <span>•</span>
                                        <span>{projectStats?.finalWeightG.toFixed(2)}g</span>
                                     </div>
                                  </div>
                                  <span className="text-white font-mono text-xl tracking-tight">
                                     {projectStats?.finalWeightG ? `$${projectStats?.goldCost.toFixed(2)}` : <span className="text-zinc-600">--</span>}
                                  </span>
                               </div>
                               
                               {/* Formula Visualization */}
                               <div className="mt-3 mb-3 bg-black/20 p-2 rounded-lg border border-white/5 flex flex-wrap gap-2 text-[10px] text-zinc-400 font-mono items-center">
                                  <div className="flex flex-col">
                                     <span className="text-[9px] text-zinc-600 uppercase">Pure Price (CAD/g)</span>
                                     <span className="text-white">${projectStats?.usedPurePricePerGram.toFixed(2)}</span>
                                  </div>
                                  <span className="text-zinc-600">×</span>
                                  <div className="flex flex-col">
                                     <span className="text-[9px] text-zinc-600 uppercase">Ratio ({selectedProject.goldPurity})</span>
                                     <span className="text-white">{projectStats?.usedRatio.toFixed(3)}</span>
                                  </div>
                                  <span className="text-zinc-600">×</span>
                                  <div className="flex flex-col">
                                     <span className="text-[9px] text-zinc-600 uppercase">Weight</span>
                                     <span className="text-white">{projectStats?.finalWeightG.toFixed(2)}g</span>
                                  </div>
                               </div>

                               {projectStats?.isLocked ? (
                                  <div className="text-[10px] text-zinc-300 flex items-center gap-2 bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/20">
                                     <Lock size={12} className="text-emerald-500" />
                                     <div>
                                        <span className="font-bold text-emerald-400">Locked at completion</span>
                                        <span className="mx-2 opacity-30">|</span>
                                        <span className="text-zinc-500">
                                            {selectedProject.projectEndGoldPriceCapturedAt 
                                                ? new Date(selectedProject.projectEndGoldPriceCapturedAt).toLocaleString() 
                                                : 'Completion Date'}
                                        </span>
                                     </div>
                                  </div>
                               ) : (
                                  <div className="text-[10px] text-zinc-300 flex items-center gap-2 bg-amber-950/20 p-2.5 rounded-lg border border-amber-500/20">
                                     <Activity size={12} className="text-amber-500 animate-pulse" />
                                     <div>
                                        <span className="font-bold text-amber-400">Estimated (Live)</span>
                                        <span className="mx-2 opacity-30">|</span>
                                        <span className="text-zinc-500">
                                            Updated: {liveGoldPrice?.lastUpdated ? new Date(liveGoldPrice.lastUpdated).toLocaleTimeString() : 'Just now'}
                                        </span>
                                     </div>
                                  </div>
                               )}
                               
                               {!projectStats?.finalWeightG && (
                                  <div className="text-[10px] text-red-400 mt-2 font-medium flex items-center gap-1">
                                     <AlertOctagon size={10} /> Final gold weight missing
                                  </div>
                               )}
                            </div>

                            {/* B) DIAMONDS SECTION */}
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex justify-between items-center">
                               <div>
                                  <span className="text-zinc-300 font-bold text-sm block">Diamond Cost</span>
                                  <span className="text-[10px] text-zinc-500 block mt-1">
                                     {projectStats?.totalCaratsUsed.toFixed(3)} ct • {projectStats?.breakdown.reduce((acc, b) => acc + b.usedPcs, 0)} pcs (Net)
                                  </span>
                               </div>
                               <span className="text-white font-mono text-xl tracking-tight">${projectStats?.totalDiamondCostCad.toFixed(2)}</span>
                            </div>

                            {/* C) LABOUR SECTION - MODIFIED */}
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                               <div className="flex justify-between items-center mb-2">
                                  <span className="text-zinc-300 font-bold text-sm">Design / Jeweller Cost (Manual)</span>
                                  {isManager && !isEditingLabour && (
                                     <button onClick={() => setIsEditingLabour(true)} className="text-xs text-lux-gold hover:text-white flex items-center gap-1">
                                        <Edit2 size={12} /> Edit
                                     </button>
                                  )}
                               </div>

                               {isEditingLabour ? (
                                  <div className="space-y-3 animate-in fade-in slide-in-from-top-1 bg-black/40 p-3 rounded-xl border border-lux-gold/30">
                                     <div className="flex items-center gap-2">
                                        <span className="text-zinc-500 font-mono">$</span>
                                        <input 
                                           type="number" 
                                           value={editLabourFee}
                                           onChange={e => setEditLabourFee(e.target.value)}
                                           className="bg-transparent border-b border-zinc-700 w-24 text-white font-mono focus:outline-none focus:border-lux-gold text-lg"
                                           placeholder="0.00"
                                           autoFocus
                                        />
                                     </div>
                                     <input 
                                        type="text" 
                                        value={editLabourNote}
                                        onChange={e => setEditLabourNote(e.target.value)}
                                        className="w-full bg-transparent text-xs text-white border-b border-zinc-700 pb-1 focus:border-lux-gold outline-none"
                                        placeholder="Add a note..."
                                     />
                                     <div className="flex justify-end gap-2 pt-1">
                                        <Button size="sm" variant="ghost" onClick={() => setIsEditingLabour(false)}>Cancel</Button>
                                        <Button size="sm" onClick={handleUpdateCost} loading={isSavingCost}>Save</Button>
                                     </div>
                                  </div>
                               ) : (
                                  <div className="flex justify-between items-center">
                                     <div className="text-[10px] text-zinc-500">
                                        {projectStats?.labourCost > 0 ? (
                                            selectedProject.labourCostNote || 'Manual Entry'
                                        ) : 'No cost added'}
                                     </div>
                                     <span className="text-white font-mono text-xl tracking-tight">${projectStats?.labourCost.toFixed(2)}</span>
                                  </div>
                               )}
                            </div>

                            {/* D) AUTOMATED SETTER FEE SECTION (NEW) */}
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex justify-between items-center">
                               <div>
                                  <span className="text-zinc-300 font-bold text-sm block">Automated Setter Fees</span>
                                  <span className="text-[10px] text-zinc-500 block mt-1">
                                     {projectStats?.breakdown.reduce((acc, b) => acc + b.usedPcs, 0)} stones × ${store.getSettings().setterCostPerSetPieceCad}
                                  </span>
                               </div>
                               <span className="text-white font-mono text-xl tracking-tight">${projectStats?.automatedSetterCost.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>

                          {/* E) TOTAL */}
                          <div className="flex justify-between items-end">
                             <div className="flex flex-col">
                                <span className="text-zinc-500 font-medium pb-1 text-sm uppercase tracking-wide">Total Project Cost</span>
                                <span className="text-[10px] text-zinc-600">CAD (Gold + Diamonds + Design + Setter)</span>
                             </div>
                             <div className="text-4xl md:text-5xl font-medium font-mono text-lux-gold tracking-tighter tabular-nums">
                                ${projectStats?.totalProjectCostCad.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                             </div>
                          </div>
                       </div>
                    </div>
                 )}
              </div>
           </Card>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
