
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { IssueRequest, DiamondBag, BagStatus, Project, ProjectStatus, User, Role, Priority, InventoryMovementType } from '../types';
import { Card, Button, Badge, SetterAvatar, Input, StatusPill, ProgressBar } from '../components/UI';
import { Inbox, PackageCheck, Plus, LayoutGrid, List as ListIcon, Image as ImageIcon, AlertOctagon, ChevronRight, Scale, Layers } from 'lucide-react';
import { ImageUpload } from '../components/ImageUpload';
import { useToast } from '../App';
import { GoldPriceCard } from '../components/GoldPriceCard';

const SERVICE_OPTIONS = ['Setting', 'Custom Make', 'Repair', 'Resize', 'Other'];

const ManagerDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const showToast = useToast();
  
  // Data
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<IssueRequest[]>([]);
  const [returnBags, setReturnBags] = useState<DiamondBag[]>([]);
  const [inventorySummary, setInventorySummary] = useState(store.getInventorySummary());
  const [setters, setSetters] = useState<User[]>([]);
  const [salesReps, setSalesReps] = useState<User[]>([]);

  // UI State
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'LIST' | 'GRID'>('LIST');

  // ... (rest of modals logic)
  const [fulfillReq, setFulfillReq] = useState<IssueRequest | null>(null);
  const [bagNum, setBagNum] = useState('');
  const [issuedPhoto, setIssuedPhoto] = useState<string | undefined>(undefined);
  
  const [countBag, setCountBag] = useState<DiamondBag | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [brokenCounts, setBrokenCounts] = useState<Record<string, number>>({});
  const [brokenReason, setBrokenReason] = useState('');
  
  const [mixedMode, setMixedMode] = useState(false);
  const [mixedCt, setMixedCt] = useState('');
  const [mixedNotes, setMixedNotes] = useState('');

  const [newProject, setNewProject] = useState<Partial<Project>>({
    code: '', pieceName: '', priority: Priority.NORMAL, dueDate: new Date().toISOString().split('T')[0],
    clientName: '', salesRepId: '', services: [], workDetails: '',
    goldType: 'Yellow', goldPurity: '14k'
  });
  const [selectedServices, setSelectedServices] = useState<string[]>(['Setting']);
  const [newAssignees, setNewAssignees] = useState<string[]>([]);

  useEffect(() => {
    const updateData = () => {
        refresh();
        const allUsers = store.getUsers();
        setSetters(allUsers.filter(u => (u.role === Role.SETTER || u.role === Role.JEWELLER || u.role === Role.DESIGNER) && u.active));
        setSalesReps(allUsers.filter(u => u.role === Role.SALES_REP && u.active));
    };
    
    updateData();
    const unsubscribe = store.subscribe(updateData);
    
    return () => {
        unsubscribe();
    };
  }, []);

  const refresh = () => {
    // STRICT FILTER: Only show ACTIVE projects on dashboard.
    // REVIEW and CLOSED projects are handled in All Projects / Reports
    setActiveProjects(store.getProjects().filter(p => p.status === ProjectStatus.ACTIVE));
    setRequests(store.getRequests().filter(r => r.status === 'OPEN'));
    setReturnBags(store.getBags().filter(b => b.status === BagStatus.RETURNED_PENDING_COUNT));
    setInventorySummary(store.getInventorySummary());
  };

  const handleCreateProject = async () => {
    if(!newProject.code || !newProject.pieceName) return alert("Code and Name required");
    setLoading(true);
    
    const serviceObjects = selectedServices.map(s => ({ name: s, status: 'PENDING' as const }));

    try {
      const finalAssignees = [...newAssignees];
      if (newProject.salesRepId && !finalAssignees.includes(newProject.salesRepId)) {
          finalAssignees.push(newProject.salesRepId);
      }

      const created = await store.createProject({ ...newProject, services: serviceObjects }, finalAssignees);
      
      setTimeout(() => {
        setLoading(false);
        setIsCreating(false);
        showToast("Project Created");
        if(created) navigate(`/project/${created.id}`);
      }, 600);
    } catch(e) { 
        console.error(e);
        setLoading(false); 
    }
  };

  // ... (handleFulfill, handleCount, toggleService implementation remains identical) ...
  const handleFulfill = () => {
    const cleanBagNum = bagNum.replace(/#/g, '').trim();
    if(!fulfillReq || !cleanBagNum) return;
    if(!issuedPhoto) return alert("Photo is required to issue bag.");
    
    setLoading(true);
    
    setTimeout(() => {
      try {
        store.issueBag(
            fulfillReq.projectId, 
            cleanBagNum, 
            fulfillReq.lines.map(l => ({specId: l.specId, issuedPcs: l.requestedPcs})), 
            currentUser.id, 
            fulfillReq.requestedById, 
            fulfillReq.id,
            issuedPhoto
        );
        
        setTimeout(() => { 
            setFulfillReq(null); 
            setBagNum(''); 
            setIssuedPhoto(undefined);
            setLoading(false); 
            showToast("Bag Issued Successfully"); 
        }, 500);
      } catch(e: any) {
        setLoading(false);
        showToast(e.message || "Error issuing bag");
      }
    }, 100);
  };

  const handleCount = () => {
    if(!countBag) return;
    setLoading(true);
    
    if (mixedMode) {
       if (!mixedCt || parseFloat(mixedCt) <= 0) {
          setLoading(false);
          alert("Please enter a valid weight.");
          return;
       }
       if (!mixedNotes) {
          setLoading(false);
          alert("Please enter a note for mixed return.");
          return;
       }
    } else {
        const hasBroken = Object.values(brokenCounts).some((v: any) => v > 0);
        if(hasBroken && !brokenReason) {
           setLoading(false);
           alert("Please enter a reason for the broken stones.");
           return;
        }
    }

    setTimeout(() => {
      try {
        const countLines = Object.entries(counts).map(([specId, pcs]) => ({specId, pcs: Number(pcs)}));
        
        store.confirmBagCount(
            countBag.bagNumber, 
            countLines, 
            currentUser.id,
            mixedMode ? { totalCt: parseFloat(mixedCt), notes: mixedNotes } : undefined
        );
        
        if(!mixedMode && Object.values(brokenCounts).some((v: any) => v > 0)) {
           const brokenLines = Object.entries(brokenCounts).map(([specId, pcs]) => ({specId, pcs: pcs as number})).filter(l => l.pcs > 0);
           const specs = store.getSpecs();
           store.createInventoryMovement({
              type: InventoryMovementType.BROKEN_OUT,
              createdById: currentUser.id,
              referenceProjectId: countBag.projectId,
              referenceBagNumber: countBag.bagNumber,
              notes: `Broken during bag #${countBag.bagNumber} return. Reason: ${brokenReason}`,
              lines: brokenLines.map(l => {
                 const s = specs.find(spec => spec.id === l.specId);
                 return { specId: l.specId, pcs: l.pcs, ct: l.pcs * (s?.ctPerStone || 0) };
              })
           });
        }

        setTimeout(() => { 
            setCountBag(null); 
            setCounts({}); 
            setBrokenCounts({});
            setBrokenReason('');
            setMixedMode(false);
            setMixedCt('');
            setMixedNotes('');
            setLoading(false); 
            showToast("Return Verified"); 
        }, 500);
      } catch(e: any) {
         setLoading(false);
         showToast(e.message || "Error verifying return");
      }
    }, 100);
  };

  const toggleService = (svc: string) => {
     if (selectedServices.includes(svc)) {
        setSelectedServices(selectedServices.filter(s => s !== svc));
     } else {
        setSelectedServices([...selectedServices, svc]);
        if (svc === 'Custom Make') {
           const designers = store.getUsers().filter(u => u.role === Role.DESIGNER && u.active);
           if (designers.length > 0) {
              const designerIds = designers.map(d => d.id);
              setNewAssignees(prev => {
                 const combined = new Set([...prev, ...designerIds]);
                 return Array.from(combined);
              });
              showToast("Designer(s) auto-assigned");
           }
        }
     }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-32">
      {/* ... (UI Structure same as original, just verifying filters) */}
      <div data-tour="manager-header" className="flex flex-col md:flex-row justify-between items-end gap-4 mb-8">
         <div>
            <h1 className="text-3xl font-bold text-lux-cream mb-1">Manager Overview</h1>
            <p className="text-zinc-500 text-sm">Welcome back, {currentUser.name}</p>
         </div>
         
         <div className="flex flex-wrap items-center gap-8 md:gap-10">
            <div className="flex bg-[#23262F] rounded-lg p-1 border border-zinc-800">
                <button onClick={() => setViewMode('LIST')} className={`p-2 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-lux-gold text-black shadow-sm' : 'text-zinc-500 hover:text-white'}`}><ListIcon size={18}/></button>
                <button onClick={() => setViewMode('GRID')} className={`p-2 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-lux-gold text-black shadow-sm' : 'text-zinc-500 hover:text-white'}`}><LayoutGrid size={18}/></button>
            </div>
            <div data-tour="manager-new-project">
                <Button onClick={() => setIsCreating(true)} icon={<Plus size={20}/>}>New Project</Button>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
         <div data-tour="manager-requests">
            <Card className="border-blue-500/20 bg-blue-950/5 p-5 h-full">
               <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                     <div className="bg-blue-500/20 text-blue-400 p-2 rounded-xl"><Inbox size={20}/></div>
                     <h2 className="font-bold text-white text-lg">Requests</h2>
                  </div>
                  <Badge color="blue">{requests.length} Pending</Badge>
               </div>
               <div className="space-y-2">
                  {requests.length === 0 ? <p className="text-zinc-500 text-sm py-4 italic">All requests fulfilled.</p> : 
                     requests.map(r => (
                        <div key={r.id} className="bg-[#1F2128] p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                           <div>
                              <div className="font-bold text-white">{store.getProject(r.projectId)?.code}</div>
                              <div className="text-xs text-zinc-500">by {store.getUser(r.requestedById)?.name}</div>
                           </div>
                           <Button size="sm" onClick={() => setFulfillReq(r)}>Fulfill</Button>
                        </div>
                     ))
                  }
               </div>
            </Card>
         </div>

         <div data-tour="manager-returns">
            <Card className="border-amber-500/20 bg-amber-950/5 p-5 h-full">
               <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                     <div className="bg-amber-500/20 text-amber-500 p-2 rounded-xl"><PackageCheck size={20}/></div>
                     <h2 className="font-bold text-white text-lg">Returns</h2>
                  </div>
                  <Badge color="amber">{returnBags.length} Pending</Badge>
               </div>
               <div className="space-y-2">
                  {returnBags.length === 0 ? <p className="text-zinc-500 text-sm py-4 italic">No pending returns.</p> : 
                     returnBags.map(b => (
                        <div key={b.id} className="bg-[#1F2128] p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                           <div>
                              <div className="font-bold text-white">Bag #{b.bagNumber}</div>
                              <div className="text-xs text-zinc-500">{store.getProject(b.projectId)?.code}</div>
                           </div>
                           <Button size="sm" onClick={() => { 
                              setCountBag(b); 
                              setCounts(b.items.reduce((a,i)=>({...a, [i.specId]: i.issuedPcs}), {})); 
                              setBrokenCounts({});
                              setBrokenReason('');
                              setMixedMode(false);
                           }}>Count</Button>
                        </div>
                     ))
                  }
               </div>
            </Card>
         </div>

         <div data-tour="gold-price-card">
            <GoldPriceCard />
         </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
         <h2 className="text-xl font-bold text-white">Active Projects</h2>
         <Badge color="green">{activeProjects.length}</Badge>
      </div>

      <div className={viewMode === 'LIST' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
         {activeProjects.map(p => (
            viewMode === 'LIST' ? (
               <Card 
                 key={p.id} 
                 onClick={() => navigate(`/project/${p.id}`)} 
                 className="group p-5 flex flex-col md:flex-row md:items-center gap-4"
               >
                  <div className="flex-1 w-full min-w-0">
                     <div className="flex items-center justify-between md:justify-start gap-3 mb-1">
                        <h3 className="font-bold text-lg text-white group-hover:text-lux-gold transition-colors truncate">{p.code}</h3>
                        {p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}
                     </div>
                     <p className="text-sm text-zinc-500 font-medium truncate">{p.clientName ? `${p.clientName} - ` : ''}{p.pieceName}</p>
                  </div>

                  <div className="h-px bg-zinc-800/50 w-full md:hidden"></div>

                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                     <div className="flex -space-x-3 pl-1">
                        {p.assignments.filter(a=>a.active).length > 0 ? (
                           p.assignments.filter(a=>a.active).map(a => {
                              const u = store.getUser(a.userId);
                              return u ? <div key={u.id} className="ring-2 ring-[#1F2128] rounded-full"><SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="sm"/></div> : null;
                           })
                        ) : (
                           <span className="text-xs text-zinc-600 italic">Unassigned</span>
                        )}
                     </div>

                     <div className="flex items-center gap-6">
                        <div className="text-right">
                           <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Stage</div>
                           <div className="font-bold text-white text-sm">{p.currentStageName || 'Start'}</div>
                        </div>
                        <div className="w-24 md:w-32">
                           <div className="flex justify-between text-[10px] text-zinc-500 mb-1 uppercase font-bold">
                              <span>Progress</span>
                              <span>{p.currentPercentComplete || 0}%</span>
                           </div>
                           <ProgressBar progress={p.currentPercentComplete || 0} />
                        </div>
                        <ChevronRight className="text-zinc-600 group-hover:text-white hidden md:block" />
                     </div>
                  </div>
               </Card>
            ) : (
               <div 
                 key={p.id} 
                 onClick={() => navigate(`/project/${p.id}`)}
                 className="group bg-[#1F2128] border border-zinc-800 rounded-3xl overflow-hidden cursor-pointer hover:border-lux-gold/30 transition-all shadow-subtle hover:shadow-glow flex flex-col h-full relative"
               >
                  <div className="h-32 bg-black relative flex items-center justify-center border-b border-zinc-800">
                     {p.projectPhotos && p.projectPhotos.length > 0 ? (
                        <img src={p.projectPhotos[p.projectPhotos.length - 1]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                     ) : (
                        <div className="text-zinc-700 flex flex-col items-center">
                           <ImageIcon size={32} strokeWidth={1.5} />
                           <span className="text-[10px] mt-2 font-medium uppercase tracking-wider">No Preview</span>
                        </div>
                     )}
                     <div className="absolute top-3 right-3">
                        {p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}
                     </div>
                     <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white shadow-lg">
                        {p.currentStageName || 'Intake'}
                     </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                     <div className="mb-4">
                        <h3 className="font-bold text-lg text-white group-hover:text-lux-gold transition-colors">{p.code}</h3>
                        <p className="text-sm text-zinc-400 font-medium truncate">{p.clientName ? `${p.clientName} - ` : ''}{p.pieceName}</p>
                     </div>
                     
                     <div className="mt-auto">
                        <div className="flex justify-between items-center mb-2">
                           <div className="flex -space-x-2">
                              {p.assignments.filter(a=>a.active).map(a => {
                                 const u = store.getUser(a.userId);
                                 return u ? <div key={u.id} className="ring-2 ring-[#1F2128] rounded-full"><SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="sm"/></div> : null;
                              })}
                           </div>
                           <span className="text-xs font-bold text-lux-gold">{p.currentPercentComplete || 0}%</span>
                        </div>
                        <ProgressBar progress={p.currentPercentComplete || 0} />
                     </div>
                  </div>
               </div>
            )
         ))}
      </div>

      {/* ... (Create, Fulfill, Count Modals remain same) ... */}
      {isCreating && (
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#1F2128] rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in zoom-in-95">
               <div className="p-6 border-b border-zinc-800 flex justify-between items-center sticky top-0 bg-[#1F2128] z-20">
                  <h2 className="text-2xl font-bold text-white">Create New Project</h2>
                  <button onClick={() => setIsCreating(false)} className="md:hidden text-zinc-500 hover:text-white p-2">
                     <div className="w-10 h-1 bg-zinc-700 rounded-full"></div>
                  </button>
               </div>

               <div className="p-6 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-5">
                        <Input label="Project Code" value={newProject.code} onChange={e => setNewProject({...newProject, code: e.target.value})} placeholder="e.g. DR-24-001" autoFocus />
                        <Input label="Piece Name" value={newProject.pieceName} onChange={e => setNewProject({...newProject, pieceName: e.target.value})} placeholder="e.g. 3.5ct Solitaire Ring" />
                        <Input label="Client Name" value={newProject.clientName} onChange={e => setNewProject({...newProject, clientName: e.target.value})} placeholder="e.g. John Doe" />
                    </div>
                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Due Date" type="date" value={newProject.dueDate} onChange={e => setNewProject({...newProject, dueDate: e.target.value})} />
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Priority</label>
                                <select className="w-full bg-[#23262F] text-white rounded-2xl border-transparent p-4 text-sm focus:ring-lux-gold" value={newProject.priority} onChange={e => setNewProject({...newProject, priority: e.target.value as Priority})}>
                                    <option value={Priority.NORMAL}>Normal</option>
                                    <option value={Priority.RUSH}>Rush</option>
                                    <option value={Priority.LOW}>Low</option>
                                </select>
                            </div>
                        </div>
                        
                        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                            <label className="block text-xs font-bold text-zinc-500 mb-3 uppercase">Gold Type</label>
                            <div className="flex gap-3 mb-4">
                                {[
                                    { id: 'Yellow', label: 'Yellow', gradient: 'linear-gradient(135deg, #F5D061 0%, #E1B32A 100%)', text: '#5B4300' },
                                    { id: 'White', label: 'White', gradient: 'linear-gradient(135deg, #E8E8E8 0%, #C0C0C0 100%)', text: '#4A4A4A' },
                                    { id: 'Rose', label: 'Rose', gradient: 'linear-gradient(135deg, #F0C4B5 0%, #D69786 100%)', text: '#5D3A31' }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setNewProject({...newProject, goldType: type.id as any})}
                                        className={`
                                            flex-1 h-12 rounded-xl flex items-center justify-center font-bold text-sm transition-all relative overflow-hidden
                                            ${newProject.goldType === type.id ? 'ring-2 ring-white scale-105 shadow-lg' : 'opacity-70 hover:opacity-100'}
                                        `}
                                        style={{ background: type.gradient, color: type.text }}
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                            
                            <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Purity</label>
                            <div className="flex gap-2">
                                {['10k', '14k', '18k', '21k'].map(k => (
                                    <button
                                        key={k}
                                        onClick={() => setNewProject({...newProject, goldPurity: k})}
                                        className={`
                                            flex-1 py-2 rounded-lg text-xs font-bold border transition-all
                                            ${newProject.goldPurity === k ? 'bg-zinc-800 text-white border-white/20' : 'bg-transparent text-zinc-500 border-zinc-800 hover:text-zinc-300'}
                                        `}
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Services</label>
                            <div className="bg-[#23262F] rounded-2xl p-3 flex flex-wrap gap-2">
                              {SERVICE_OPTIONS.map(svc => (
                                  <button 
                                    key={svc}
                                    onClick={() => toggleService(svc)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedServices.includes(svc) ? 'bg-lux-gold text-black border-lux-gold' : 'bg-black border-zinc-700 text-zinc-400 hover:text-white'}`}
                                  >
                                    {svc}
                                  </button>
                              ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Sales Rep</label>
                            <select className="w-full bg-[#23262F] text-white rounded-2xl border-transparent p-4 text-sm focus:ring-lux-gold" value={newProject.salesRepId} onChange={e => setNewProject({...newProject, salesRepId: e.target.value})}>
                                <option value="">Select Rep...</option>
                                {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Work Details / Instructions</label>
                    <textarea 
                        className="w-full bg-[#23262F] text-white rounded-2xl border-transparent p-4 text-sm focus:ring-lux-gold h-24"
                        placeholder="Describe the work required..."
                        value={newProject.workDetails}
                        onChange={e => setNewProject({...newProject, workDetails: e.target.value})}
                    />
                  </div>

                  <div className="mt-5">
                      <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Assign Team (Optional)</label>
                      <div className="flex flex-wrap gap-2">
                        {setters.map(u => (
                            <button 
                              key={u.id}
                              onClick={() => setNewAssignees(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${newAssignees.includes(u.id) ? 'bg-lux-gold/10 border-lux-gold text-lux-gold' : 'bg-[#23262F] border-transparent text-zinc-400'}`}
                            >
                              <SetterAvatar name={u.name} color={u.setterColor} size="sm" />
                              <span className="text-xs font-bold">{u.name}</span>
                              <Badge color={u.role === Role.DESIGNER ? 'blue' : u.role === Role.MANAGER ? 'amber' : 'gray'}>{u.role}</Badge>
                            </button>
                        ))}
                      </div>
                  </div>
               </div>

               <div className="p-6 border-t border-zinc-800 bg-[#1F2128] sticky bottom-0 z-20 flex justify-end gap-3 safe-pb">
                  <Button variant="secondary" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button onClick={handleCreateProject} loading={loading}>Create Project</Button>
               </div>
            </div>
         </div>
      )}

      {/* FULFILL MODAL */}
      {fulfillReq && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 bg-[#1F2128]">
              <h3 className="font-bold text-white text-lg mb-4">Issue Bag</h3>
              <div className="bg-zinc-900 p-3 rounded-lg mb-4 space-y-2">
                 {fulfillReq.lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-sm text-zinc-300">
                       <span>{store.getSpecs().find(s => s.id === l.specId)?.label}</span>
                       <span className="font-mono text-lux-gold">{l.requestedPcs} pcs</span>
                    </div>
                 ))}
              </div>
              <Input 
                label="Assign Bag Number" 
                value={bagNum} 
                onChange={e => setBagNum(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleFulfill()}
                autoFocus 
                className="mb-4 font-mono text-xl text-center" 
              />
              <div className="mb-6">
                <ImageUpload 
                    label="Bag Photo" 
                    required 
                    value={issuedPhoto} 
                    onChange={setIssuedPhoto} 
                />
              </div>
              <div className="flex justify-end gap-3">
                 <Button variant="secondary" onClick={() => setFulfillReq(null)}>Cancel</Button>
                 <Button onClick={handleFulfill} loading={loading} disabled={!bagNum.trim() || !issuedPhoto}>Confirm Issue</Button>
              </div>
           </Card>
        </div>
      )}

      {/* COUNT MODAL */}
      {countBag && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <Card className={`w-full max-w-xl p-6 transition-colors duration-500 ${mixedMode ? 'bg-[#181622] border-indigo-500/30' : 'bg-[#1F2128]'}`}>
              {/* ... (Existing Modal Content) ... */}
              <div className="flex justify-between items-start mb-4">
                 <h3 className="font-bold text-white text-lg">Verify Return Bag #{countBag.bagNumber}</h3>
                 <button 
                    onClick={() => setMixedMode(!mixedMode)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mixedMode ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}
                 >
                    <Layers size={14} />
                    {mixedMode ? 'Mixed Return Mode' : 'Standard Mode'}
                 </button>
              </div>
              
              <div className="flex gap-4 mb-6">
                  {countBag.issuedPhoto && (
                      <div className="w-24 h-24 rounded-lg bg-black border border-zinc-800 overflow-hidden relative group">
                          <img src={countBag.issuedPhoto} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                          <span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/60 px-1 rounded">Issued</span>
                      </div>
                  )}
                  {countBag.returnedPhoto && (
                      <div className="w-24 h-24 rounded-lg bg-black border border-zinc-800 overflow-hidden relative group">
                          <img src={countBag.returnedPhoto} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                          <span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/60 px-1 rounded">Returned</span>
                      </div>
                  )}
              </div>

              {mixedMode ? (
                 <div className="space-y-6 mb-6 animate-in fade-in slide-in-from-right-4">
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                       <p className="text-sm text-indigo-300 mb-4 flex items-center gap-2">
                          <Scale size={16} />
                          Enter the total weight for mixed/unsorted stones.
                       </p>
                       <Input 
                          type="number" 
                          step="0.001" 
                          label="Total Weight (Ct)" 
                          value={mixedCt} 
                          onChange={e => setMixedCt(e.target.value)} 
                          className="text-2xl font-mono text-center border-indigo-500/50 focus:border-indigo-400 focus:ring-indigo-400"
                          placeholder="0.000"
                          autoFocus
                       />
                    </div>
                    <Input 
                       label="Mixed Return Note" 
                       value={mixedNotes} 
                       onChange={e => setMixedNotes(e.target.value)} 
                       placeholder="e.g. Mixed melee from setting"
                    />
                 </div>
              ) : (
                 <>
                    {/* Header Row */}
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-2 px-2">
                       <div className="col-span-5">Spec</div>
                       <div className="col-span-2 text-center">Issued</div>
                       <div className="col-span-2 text-center">Return</div>
                       <div className="col-span-3 text-center text-red-400">Broken</div>
                    </div>

                    <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto">
                       {countBag.items.map(item => {
                          const spec = store.getSpecs().find(s => s.id === item.specId);
                          const returnedVal = counts[item.specId] ?? item.issuedPcs;
                          const brokenVal = brokenCounts[item.specId] || 0;
                          const remaining = item.issuedPcs - returnedVal - brokenVal;
                          
                          return (
                             <div key={item.specId} className="grid grid-cols-12 gap-2 items-center bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                                <div className="col-span-5">
                                   <div className="text-sm font-bold text-white">{spec?.label}</div>
                                   <div className="text-[10px] text-zinc-500">{spec?.sizeMm}mm</div>
                                </div>
                                
                                <div className="col-span-2 text-center text-sm text-white font-mono">{item.issuedPcs}</div>
                                
                                <div className="col-span-2">
                                   <input 
                                     type="number" 
                                     value={returnedVal}
                                     onChange={e => setCounts({...counts, [item.specId]: parseInt(e.target.value) || 0})}
                                     className="w-full bg-black border border-zinc-700 rounded-lg p-1.5 text-center text-white font-mono text-sm focus:border-lux-gold focus:ring-0"
                                   />
                                </div>

                                <div className="col-span-3 pl-2">
                                   <input 
                                     type="number" 
                                     value={brokenVal || ''}
                                     placeholder="0"
                                     onChange={e => setBrokenCounts({...brokenCounts, [item.specId]: parseInt(e.target.value) || 0})}
                                     className={`w-full bg-black border rounded-lg p-1.5 text-center font-mono text-sm focus:ring-0 ${brokenVal > 0 ? 'border-red-500/50 text-red-400' : 'border-zinc-800 text-zinc-600'}`}
                                   />
                                </div>
                                
                                {remaining !== 0 && (
                                  <div className="col-span-12 text-center text-[10px] text-zinc-500 mt-1 border-t border-zinc-800 pt-1">
                                     Net Used: <span className="text-lux-gold font-bold">{remaining}</span> pcs
                                  </div>
                                )}
                             </div>
                          );
                       })}
                    </div>

                    {Object.values(brokenCounts).some((v: any) => v > 0) && (
                       <div className="mb-6 animate-in slide-in-from-top-2">
                          <div className="flex items-center gap-2 mb-2 text-red-400 text-xs font-bold uppercase">
                             <AlertOctagon size={12} /> Breakage Reason (Required)
                          </div>
                          <Input value={brokenReason} onChange={e => setBrokenReason(e.target.value)} placeholder="Why are stones broken?" className="border-red-900/50 focus:border-red-500" />
                       </div>
                    )}
                 </>
              )}

              <div className="flex justify-end gap-3">
                 <Button variant="secondary" onClick={() => setCountBag(null)}>Cancel</Button>
                 <Button onClick={handleCount} loading={loading} className={mixedMode ? 'bg-indigo-600 hover:bg-indigo-500' : ''}>Confirm Return</Button>
              </div>
           </Card>
        </div>
      )}

    </div>
  );
};
export default ManagerDashboard;
