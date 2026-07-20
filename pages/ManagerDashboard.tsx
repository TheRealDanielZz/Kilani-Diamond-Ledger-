import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { IssueRequest, DiamondBag, BagStatus, Project, ProjectStatus, User, Role, Priority, InventoryMovementType, BagItem, BagReturnTransaction } from '../types';
import { Card, Button, Badge, SetterAvatar, Input, StatusPill, ProgressBar, ProjectMilestones } from '../components/UI';
import { Inbox, PackageCheck, Plus, LayoutGrid, List as ListIcon, Image as ImageIcon, AlertOctagon, ChevronRight, Scale, Layers, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { ImageUpload } from '../components/ImageUpload';
import { useToast } from '../App';
import { GoldPriceCard } from '../components/GoldPriceCard';
import { RepairProjectModal } from '../components/RepairProjectModal';

const SERVICE_OPTIONS = ['Custom Make', 'Engagement', 'Repair', 'Other'];

const ManagerDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
   const navigate = useNavigate();
   const showToast = useToast();

   // Data
   const [activeProjects, setActiveProjects] = useState<Project[]>([]);
   const [requests, setRequests] = useState<IssueRequest[]>([]);
   const [returnBags, setReturnBags] = useState<{ bag: DiamondBag; tx?: BagReturnTransaction }[]>([]);
   const [inventorySummary, setInventorySummary] = useState(store.getInventorySummary());
   const [setters, setSetters] = useState<User[]>([]);
   const [salesReps, setSalesReps] = useState<User[]>([]);

   // UI State
   const [isCreating, setIsCreating] = useState(false);
   const [isQuickRepairing, setIsQuickRepairing] = useState(false);
   const [quickRepair, setQuickRepair] = useState<Partial<Project>>({
      clientName: '',
      clientPhone: '',
      repairDetails: {
         date: new Date().toISOString().split('T')[0],
         items: [{ stoneSize: '', quantity: 0 }],
         totalQuantity: 0,
         report: ''
      }
   });
   const [loading, setLoading] = useState(false);
   const [viewMode, setViewMode] = useState<'LIST' | 'GRID'>('LIST');
   const [showAllRequests, setShowAllRequests] = useState(false);
   const [showAllReturns, setShowAllReturns] = useState(false);

   const [fulfillReq, setFulfillReq] = useState<IssueRequest | null>(null);
   const [editedLines, setEditedLines] = useState<{
      specId: string;
      requestedPcs: number;
      issuedPcs: number;
      explanation: string;
   }[]>([]);
   const [bagNum, setBagNum] = useState('');
   const [issuedPhoto, setIssuedPhoto] = useState<string | undefined>(undefined);
   const [issuedPhotoSource, setIssuedPhotoSource] = useState<'Camera' | 'Device Gallery' | undefined>(undefined);
   const submittingRef = React.useRef(false);

   const [countBag, setCountBag] = useState<DiamondBag | null>(null);
   const [countTx, setCountTx] = useState<BagReturnTransaction | null>(null);
   const [counts, setCounts] = useState<Record<number, number>>({});
   const [brokenCounts, setBrokenCounts] = useState<Record<number, number>>({});
   const [brokenReason, setBrokenReason] = useState('');
   const [weighedCarats, setWeighedCarats] = useState<Record<number, string>>({});
   const [correctionReason, setCorrectionReason] = useState('');

   const [mixedMode, setMixedMode] = useState(false);
   const [mixedCt, setMixedCt] = useState('');
   const [mixedNotes, setMixedNotes] = useState('');

   const [isManagerEdit, setIsManagerEdit] = useState(false);
   const [editableItems, setEditableItems] = useState<BagItem[]>([]);

   const [newProject, setNewProject] = useState<Partial<Project>>({
      code: '', pieceName: '', priority: Priority.NORMAL, dueDate: new Date().toISOString().split('T')[0],
      clientName: '', clientPhone: '', salesRepId: '', services: [], workDetails: '',
      goldType: 'Yellow', goldPurity: '14k',
      goldComponents: [{ id: crypto.randomUUID(), label: 'Component 1', type: 'Yellow', purity: '14k' }],
      repairDetails: {
         date: new Date().toISOString().split('T')[0],
         items: [{ stoneSize: '', quantity: 0 }],
         totalQuantity: 0,
         report: ''
      }
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

   useEffect(() => {
      if (fulfillReq) {
         const project = store.getProject(fulfillReq.projectId);
         const nextBag = store.getNextBagNumber(fulfillReq.projectId, project?.code || 'BAG');
         setBagNum(nextBag);
         setEditedLines(fulfillReq.lines.map(l => ({
            specId: l.specId,
            requestedPcs: l.requestedPcs,
            issuedPcs: l.requestedPcs,
            explanation: ''
         })));
      } else {
         setBagNum('');
         setEditedLines([]);
      }
   }, [fulfillReq, activeProjects]);

   const formatRelativeTime = (isoString: string) => {
      try {
         const date = new Date(isoString);
         const now = new Date();
         const diffMs = now.getTime() - date.getTime();
         const diffMins = Math.floor(diffMs / 60000);
         const diffHours = Math.floor(diffMins / 60);
         const diffDays = Math.floor(diffHours / 24);

         if (diffMins < 1) return 'Just now';
         if (diffMins < 60) return `${diffMins}m ago`;
         if (diffHours < 24) return `${diffHours}h ago`;
         return `${diffDays}d ago`;
      } catch (e) {
         return '';
      }
   };

   const refresh = () => {
      setActiveProjects(store.getProjects().filter(p => p.status === ProjectStatus.ACTIVE));
      const openRequests = store.getRequests().filter(r => r.status === 'OPEN');
      openRequests.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      setRequests(openRequests);
      const pendingInfos: { bag: DiamondBag, tx?: BagReturnTransaction }[] = [];
      store.getBags().forEach(b => {
         if (b.returns && b.returns.some(r => r.status === 'PENDING')) {
            b.returns.filter(r => r.status === 'PENDING').forEach(tx => {
               pendingInfos.push({ bag: b, tx });
            });
         } else if (b.status === BagStatus.RETURNED_PENDING_COUNT && (!b.returns || b.returns.length === 0)) {
            pendingInfos.push({ bag: b });
         }
      });
      setReturnBags(pendingInfos);
      setInventorySummary(store.getInventorySummary());
   };

   const handleCreateProject = async () => {
      if (!newProject.code || !newProject.pieceName) return alert("Code and Name required");
      setLoading(true);

      const serviceObjects = selectedServices.map(s => ({ name: s, status: 'PENDING' as const }));

      try {
         const finalAssignees = [...newAssignees];
         if (newProject.salesRepId && !finalAssignees.includes(newProject.salesRepId)) {
            finalAssignees.push(newProject.salesRepId);
         }

         const projectDataToSave = { ...newProject, services: serviceObjects };
         if (!selectedServices.includes('Repair')) {
            delete projectDataToSave.repairDetails;
         } else if (projectDataToSave.repairDetails) {
            const total = projectDataToSave.repairDetails.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            projectDataToSave.repairDetails.totalQuantity = total;
         }

         const created = await store.createProject(projectDataToSave, finalAssignees);

         setLoading(false);
         setIsCreating(false);
         showToast("Project Created");
         if (created) navigate(`/project/${created.id}`);
      } catch (e: any) {
         console.error(e);
         setLoading(false);
         showToast(e.message || "Failed to create project");
      }
   };

   const handleFulfill = async () => {
      if (!fulfillReq) return;
      if (submittingRef.current) return;

      const currentReq = store.getRequests().find(r => r.id === fulfillReq.id);
      if (currentReq && currentReq.status === 'FULFILLED') {
         showToast("Error: Request has already been fulfilled.");
         setFulfillReq(null);
         return;
      }

      const cleanBagNum = bagNum.replace(/#/g, '').trim();
      if (!cleanBagNum) return;
      if (!issuedPhoto) return showToast("Photo is required to issue bag.");

      setLoading(true);
      submittingRef.current = true;

      try {
         const explanations: Record<string, string> = {};
         editedLines.forEach(el => {
            if (el.explanation.trim()) {
               explanations[el.specId] = el.explanation.trim();
            }
         });
         await store.issueBag(
            fulfillReq.projectId,
            cleanBagNum,
            editedLines.map(l => ({ specId: l.specId, issuedPcs: l.issuedPcs })),
            currentUser.id,
            fulfillReq.requestedById,
            fulfillReq.id,
            issuedPhoto,
            issuedPhotoSource,
            fulfillReq.jobNumberSnapshot,
            explanations
         );

         setFulfillReq(null);
         setBagNum('');
         setIssuedPhoto(undefined);
         setIssuedPhotoSource(undefined);
         showToast("Bag Issued Successfully");
      } catch (e: any) {
         showToast(e.message || "Error issuing bag");
      } finally {
         setLoading(false);
         submittingRef.current = false;
      }
   };

   const handleCount = async () => {
      if (!countBag) return;
      const currentBag = store.getBags().find(b => b.id === countBag.id);
      if (currentBag && currentBag.status === BagStatus.COUNTED_CONFIRMED) {
         showToast("Error: Return has already been verified.");
         setCountBag(null);
         return;
      }

      const itemsToProcess = countTx
         ? countTx.lines.map(l => ({ specId: l.specId, original: l.returnedPcs, issuedPcs: l.originalIssuedPcs }))
         : (isManagerEdit ? editableItems.map(i => ({ specId: i.specId, original: i.issuedPcs, issuedPcs: i.issuedPcs })) : countBag.items.map(i => ({ specId: i.specId, original: i.issuedPcs, issuedPcs: i.issuedPcs })));

      const hasDiscrepancy = itemsToProcess.some((item, idx) => {
         const current = counts[idx] ?? item.original;
         return current !== item.original;
      });

      if (mixedMode) {
         if (!mixedCt || parseFloat(mixedCt) <= 0) return alert("Please enter a valid weight.");
         if (!mixedNotes) return alert("Please enter a note for mixed return.");
      } else {
         const hasBroken = Object.values(brokenCounts).some((v: any) => v > 0);
         if (hasBroken) {
            if (!brokenReason) return alert("Please enter a reason for the broken stones.");
            if (!window.confirm("Please confirm that the entered breakage information is correct.")) return;
         }

         if (hasDiscrepancy && !correctionReason.trim()) {
            return alert("Please enter a reason for the count correction.");
         }

         if (isManagerEdit) {
            const uniqueSpecs = new Set(editableItems.map(i => i.specId));
            if (uniqueSpecs.size !== editableItems.length) return alert("Duplicate specifications found in Manager Edit mode.");
         }
      }

      setLoading(true);
      try {
         const countLines = itemsToProcess.map((item, idx) => ({
            specId: item.specId,
            pcs: counts[idx] ?? item.original
         }));

         const brokenArray = itemsToProcess.map((item, idx) => ({
            specId: item.specId,
            pcs: brokenCounts[idx] || 0
         })).filter(l => l.pcs > 0);

         const weighedArray = itemsToProcess.map((item, idx) => {
            const raw = weighedCarats[idx];
            return raw && parseFloat(raw) > 0 ? { specId: item.specId, ct: parseFloat(raw) } : null;
         }).filter(Boolean) as { specId: string; ct: number }[];

         await store.confirmBagCount(
            countBag.bagNumber,
            countLines,
            currentUser.id,
            mixedMode ? { totalCt: parseFloat(mixedCt), notes: mixedNotes } : undefined,
            isManagerEdit ? editableItems : undefined,
            brokenArray,
            weighedArray.length > 0 ? weighedArray : undefined,
            countTx?.id,
            correctionReason.trim() || undefined
         );

         setCountBag(null);
         setCountTx(null);
         setCounts({});
         setBrokenCounts({});
         setBrokenReason('');
         setWeighedCarats({});
         setCorrectionReason('');
         setMixedMode(false);
         setMixedCt('');
         setMixedNotes('');
         setLoading(false);
         showToast("Return Verified");
      } catch (e: any) {
         setLoading(false);
         showToast(e.message || "Error verifying return");
      }
   };

   const handleLogQuickRepair = async () => {
      if ((quickRepair.repairDetails?.items.length || 0) === 0) return showToast("Add at least one item");
      setLoading(true);
      try {
         await store.logQuickRepair(quickRepair);
         setIsQuickRepairing(false);
         showToast("Repair Logged Successfully");
      } catch (e: any) {
         showToast(e.message || "Error logging repair");
      } finally {
         setLoading(false);
      }
   };

   const toggleService = (svc: string) => {
      if (svc === 'Repair') {
         setIsCreating(false);
         setIsQuickRepairing(true);
         setQuickRepair({
            clientName: newProject.clientName || '',
            clientPhone: newProject.clientPhone || '',
            repairDetails: {
               date: new Date().toISOString().split('T')[0],
               items: [{ stoneSize: '', quantity: 0 }],
               totalQuantity: 0,
               report: ''
            }
         });
         return;
      }

      setSelectedServices([svc]);
      if (svc === 'Custom Make') {
         const designers = store.getUsers().filter(u => u.role === Role.DESIGNER && u.active);
         if (designers.length > 0) {
            const designerIds = designers.map(d => d.id);
            setNewAssignees(prev => Array.from(new Set([...prev, ...designerIds])));
            showToast("Designer(s) auto-assigned");
         }
      }
   };

   return (
      <div className="max-w-7xl mx-auto px-4 py-8 pb-32">
         <RepairProjectModal isOpen={isQuickRepairing} onClose={() => setIsQuickRepairing(false)} currentUser={currentUser} />

         {isQuickRepairing && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
               <div className="w-full max-w-lg bg-theme-modal-bg rounded-3xl border border-theme-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="px-6 py-5 border-b border-zinc-800/50 flex justify-between items-center">
                     <h2 className="text-xl font-bold text-theme-text-primary tracking-tight">Quick Repair Log</h2>
                     <button onClick={() => setIsQuickRepairing(false)} className="text-zinc-500 hover:text-theme-text-primary p-2 rounded-full hover:bg-zinc-800 transition-colors">
                        <X size={20} />
                     </button>
                  </div>

                  <div className="p-6 space-y-6">
                     <div className="grid grid-cols-2 gap-4">
                        <Input label="Client Name (Optional)" value={quickRepair.clientName} onChange={e => setQuickRepair({ ...quickRepair, clientName: e.target.value })} placeholder="John Doe" />
                        <Input label="Client Phone (Optional)" value={quickRepair.clientPhone} onChange={e => setQuickRepair({ ...quickRepair, clientPhone: e.target.value })} placeholder="555-0192" />
                     </div>

                     <div className="space-y-4">
                        <div className="flex justify-between items-end">
                           <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Repair Items</label>
                           <div className="text-right">
                              <div className="text-[10px] text-zinc-500 uppercase font-bold">Total Pcs</div>
                              <div className="text-lg font-bold text-lux-gold">{quickRepair.repairDetails?.totalQuantity || 0}</div>
                           </div>
                        </div>

                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                           {quickRepair.repairDetails?.items.map((item, index) => (
                              <div key={index} className="flex gap-3 items-end group animate-in slide-in-from-left-2">
                                 <div className="flex-1">
                                    <Input label={index === 0 ? "Stone Size" : ""} placeholder="e.g. 1.5mm" value={item.stoneSize} onChange={e => {
                                       const items = [...quickRepair.repairDetails!.items];
                                       items[index].stoneSize = e.target.value;
                                       setQuickRepair({ ...quickRepair, repairDetails: { ...quickRepair.repairDetails!, items } });
                                    }} />
                                 </div>
                                 <div className="w-24">
                                    <Input label={index === 0 ? "Quantity" : ""} type="number" value={item.quantity === 0 ? '' : item.quantity.toString()} onChange={e => {
                                       const val = parseInt(e.target.value) || 0;
                                       const items = [...quickRepair.repairDetails!.items];
                                       items[index].quantity = val;
                                       const total = items.reduce((sum, i) => sum + i.quantity, 0);
                                       setQuickRepair({ ...quickRepair, repairDetails: { ...quickRepair.repairDetails!, items, totalQuantity: total } });
                                    }} />
                                 </div>
                                 <button onClick={() => {
                                    const items = quickRepair.repairDetails!.items.filter((_, i) => i !== index);
                                    const total = items.reduce((sum, i) => sum + i.quantity, 0);
                                    setQuickRepair({ ...quickRepair, repairDetails: { ...quickRepair.repairDetails!, items, totalQuantity: total } });
                                 }}
                                    className="p-3.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all mb-0.5 opacity-0 group-hover:opacity-100"
                                    disabled={quickRepair.repairDetails!.items.length === 1}
                                 >
                                    <X size={16} />
                                 </button>
                              </div>
                           ))}
                        </div>
                        <button onClick={() => {
                           const items = [...quickRepair.repairDetails!.items, { stoneSize: '', quantity: 0 }];
                           setQuickRepair({ ...quickRepair, repairDetails: { ...quickRepair.repairDetails!, items } });
                        }}
                           className="w-full py-3 rounded-2xl border border-dashed border-zinc-700 text-zinc-500 hover:text-lux-gold hover:border-lux-gold hover:bg-lux-gold/5 transition-all text-sm font-bold flex items-center justify-center gap-2"
                        >
                           <Plus size={16} /> Add Another Size
                        </button>
                     </div>

                     <div className="pt-4 border-t border-zinc-800/50">
                        <Button onClick={handleLogQuickRepair} className="w-full py-4 text-base" loading={loading}>Log Repair</Button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         <div data-tour="manager-header" className="flex flex-col md:flex-row justify-between items-end gap-4 mb-8">
            <div>
               <h1 className="text-4xl font-bold text-theme-text-primary tracking-tight">Overview</h1>
               <p className="text-xs text-zinc-500 font-medium uppercase tracking-[0.2em] mt-2">Welcome, {currentUser.name}</p>
            </div>

            <div className="flex flex-wrap items-center gap-8 md:gap-10">
               <div className="flex bg-white/5 rounded-2xl p-1 border border-white/5 h-12 items-center">
                  <button onClick={() => setViewMode('LIST')} className={`px-4 py-2 rounded-xl transition-all h-full flex items-center ${viewMode === 'LIST' ? 'bg-lux-gold text-black shadow-lg scale-[1.05]' : 'text-zinc-500 hover:text-theme-text-primary'}`}><ListIcon size={18} /></button>
                  <button onClick={() => setViewMode('GRID')} className={`px-4 py-2 rounded-xl transition-all h-full flex items-center ${viewMode === 'GRID' ? 'bg-lux-gold text-black shadow-lg scale-[1.05]' : 'text-zinc-500 hover:text-theme-text-primary'}`}><LayoutGrid size={18} /></button>
               </div>
               <div data-tour="manager-new-project">
                  <Button onClick={() => setIsCreating(true)} icon={<Plus size={20} />}>New Project</Button>
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10 items-start">
            {/* ─── REQUESTS CARD ─── */}
            <div data-tour="manager-requests">
               <Card
                  onClick={requests.length > 0 ? () => setShowAllRequests(true) : undefined}
                  className={`p-6 flex flex-col relative overflow-hidden transition-all duration-300 ${requests.length > 0 ? 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)] hover:border-blue-500/30' : ''}`}
               >
                  {/* Glowing top line */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500/80 via-indigo-500 to-cyan-400"></div>

                  <div className="flex justify-between items-start mb-5 relative z-10">
                     <div className="flex items-center gap-3">
                        <div className="bg-blue-500/10 text-blue-400 p-2.5 rounded-2xl border border-blue-500/20 shadow-sm"><Inbox size={20} /></div>
                        <h2 className="font-bold text-theme-text-primary text-lg tracking-tight">Requests</h2>
                     </div>
                     <Badge color="blue">{requests.length} Pending</Badge>
                  </div>
                  <div className="space-y-3 relative z-10">
                     {requests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center animate-in fade-in duration-500">
                           <div className="w-14 h-14 rounded-full bg-blue-500/5 flex items-center justify-center border border-blue-500/10 mb-3 text-blue-400 shadow-inner">
                              <Inbox size={24} className="stroke-[1.5]" />
                           </div>
                           <h3 className="text-sm font-bold text-theme-text-primary tracking-wide">All Caught Up</h3>
                           <p className="text-[11px] text-theme-text-secondary mt-1 max-w-[200px] leading-relaxed">
                              No pending diamond requests from setters right now.
                           </p>
                        </div>
                     ) : (
                        <>
                           {requests.slice(0, 3).map(r => {
                              const project = store.getProject(r.projectId);
                              const requester = store.getUser(r.requestedById);
                              const totalStones = r.lines.reduce((sum, line) => sum + line.requestedPcs, 0);

                              return (
                                 <div key={r.id} className="p-3 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center gap-3 group/item">
                                    <div className="relative flex-shrink-0">
                                       <SetterAvatar name={requester?.name || 'User'} color={requester?.setterColor} image={requester?.profilePhoto} size="md" />
                                       <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[#1c1e24]"></div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                       <div className="flex items-center gap-2">
                                          <span className="font-bold text-theme-text-primary text-[13px] leading-tight">{project?.code || 'PROJECT'}</span>
                                          <span className="text-[10px] text-zinc-500 font-semibold">{formatRelativeTime(r.requestedAt)}</span>
                                       </div>
                                       <div className="text-[10px] text-theme-text-secondary mt-0.5 font-medium truncate">
                                          {requester?.name || 'Unknown'} · <span className="text-blue-400">{totalStones} stones</span>
                                       </div>
                                    </div>
                                 </div>
                              );
                           })}
                           {requests.length > 3 && (
                              <div className="flex items-center justify-center pt-1">
                                 <span className="text-[11px] font-bold text-blue-400 bg-blue-500/8 px-3 py-1.5 rounded-xl border border-blue-500/15 flex items-center gap-1.5">
                                    <Plus size={12} /> {requests.length - 3} more — tap to view all
                                 </span>
                              </div>
                           )}
                        </>
                     )}
                  </div>
               </Card>
            </div>

            {/* ─── RETURNS CARD ─── */}
            <div data-tour="manager-returns">
               <Card
                  onClick={returnBags.length > 0 ? () => setShowAllReturns(true) : undefined}
                  className={`p-6 flex flex-col relative overflow-hidden transition-all duration-300 ${returnBags.length > 0 ? 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(245,158,11,0.12)] hover:border-amber-500/30' : ''}`}
               >
                  {/* Glowing top line */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-500/80 via-orange-500 to-yellow-400"></div>

                  <div className="flex justify-between items-start mb-5 relative z-10">
                     <div className="flex items-center gap-3">
                        <div className="bg-amber-500/10 text-amber-500 p-2.5 rounded-2xl border border-amber-500/20 shadow-sm"><PackageCheck size={20} /></div>
                        <h2 className="font-bold text-theme-text-primary text-lg tracking-tight">Returns</h2>
                     </div>
                     <Badge color="amber">{returnBags.length} Pending</Badge>
                  </div>
                  <div className="space-y-3 relative z-10">
                     {returnBags.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center animate-in fade-in duration-500">
                           <div className="w-14 h-14 rounded-full bg-amber-500/5 flex items-center justify-center border border-amber-500/10 mb-3 text-amber-400 shadow-inner">
                              <PackageCheck size={24} className="stroke-[1.5]" />
                           </div>
                           <h3 className="text-sm font-bold text-theme-text-primary tracking-wide">Returns Clear</h3>
                           <p className="text-[11px] text-theme-text-secondary mt-1 max-w-[200px] leading-relaxed">
                              No returned bags waiting for manager count.
                           </p>
                        </div>
                     ) : (
                        <>
                           {returnBags.slice(0, 3).map((info, idx) => {
                              const { bag: b, tx } = info;
                              const project = store.getProject(b.projectId);
                              const returner = tx ? store.getUser(tx.setterId) : store.getUser(b.issuedToId);
                              const date = tx ? tx.submittedAt : b.returnedAt;
                              const isPartial = !!tx;

                              return (
                                 <div key={tx?.id || b.id || idx} className="p-3 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center gap-3 group/item">
                                    <div className="relative flex-shrink-0">
                                       <SetterAvatar name={returner?.name || 'User'} color={returner?.setterColor} image={returner?.profilePhoto} size="md" />
                                       <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-[#1c1e24]"></div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                       <div className="flex items-center gap-2">
                                          <span className="font-bold text-theme-text-primary text-[13px] leading-tight">Bag #{b.bagNumber}</span>
                                          <span className="text-[10px] text-zinc-500 font-semibold">{date ? formatRelativeTime(date) : ''}</span>
                                       </div>
                                       <div className="text-[10px] text-theme-text-secondary mt-0.5 font-medium truncate">
                                          {returner?.name || 'Unknown'} · {project?.code || 'Proj'} · <span className={isPartial ? 'text-amber-500' : 'text-emerald-400'}>{isPartial ? 'Partial' : 'Full'}</span>
                                       </div>
                                    </div>
                                 </div>
                              );
                           })}
                           {returnBags.length > 3 && (
                              <div className="flex items-center justify-center pt-1">
                                 <span className="text-[11px] font-bold text-amber-400 bg-amber-500/8 px-3 py-1.5 rounded-xl border border-amber-500/15 flex items-center gap-1.5">
                                    <Plus size={12} /> {returnBags.length - 3} more — tap to view all
                                 </span>
                              </div>
                           )}
                        </>
                     )}
                  </div>
               </Card>
            </div>

            {/* ─── GOLD PRICE CARD ─── */}
            <div data-tour="gold-price-card">
               <GoldPriceCard />
            </div>
         </div>

         {/* ═══ ALL REQUESTS MODAL ═══ */}
         {showAllRequests && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowAllRequests(false)}>
               <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
               <div
                  className="relative w-full max-w-lg max-h-[85vh] flex flex-col liquid-glass overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
               >
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500/80 via-indigo-500 to-cyan-400 z-10"></div>
                  <div className="px-5 py-4 flex justify-between items-center border-b border-white/5">
                     <div className="flex items-center gap-2.5">
                        <div className="bg-blue-500/10 text-blue-400 p-2 rounded-xl border border-blue-500/20"><Inbox size={18} /></div>
                        <div>
                           <h2 className="font-bold text-theme-text-primary text-base">All Requests</h2>
                           <p className="text-[10px] text-theme-text-secondary">{requests.length} pending</p>
                        </div>
                     </div>
                     <button onClick={() => setShowAllRequests(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"><X size={18} /></button>
                  </div>
                  <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1 scrollbar-thin">
                     {requests.map(r => {
                        const project = store.getProject(r.projectId);
                        const requester = store.getUser(r.requestedById);
                        const totalStones = r.lines.reduce((sum, line) => sum + line.requestedPcs, 0);

                        return (
                           <div key={r.id} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200 flex items-center gap-3 group/item hover:border-blue-500/20">
                              <div className="relative flex-shrink-0">
                                 <SetterAvatar name={requester?.name || 'User'} color={requester?.setterColor} image={requester?.profilePhoto} size="md" />
                                 <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[#1c1e24]"></div>
                              </div>
                              <div className="min-w-0 flex-1">
                                 <div className="flex items-center gap-2">
                                    <span className="font-bold text-theme-text-primary text-[13px] leading-tight">{project?.code || 'PROJECT'}</span>
                                    <span className="text-[10px] text-zinc-500 font-semibold">{formatRelativeTime(r.requestedAt)}</span>
                                 </div>
                                 <div className="text-[10px] text-theme-text-secondary mt-0.5 font-medium">
                                    {requester?.name || 'Unknown'} · <span className="text-blue-400">{totalStones} stones</span>
                                 </div>
                              </div>
                              <Button
                                 size="sm"
                                 onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowAllRequests(false); setFulfillReq(r); }}
                                 className="flex-shrink-0 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-black border border-blue-500/20 hover:border-transparent rounded-xl px-3 py-1 h-7 text-[11px] font-bold transition-all active:scale-95"
                              >
                                 Fulfill
                              </Button>
                           </div>
                        );
                     })}
                  </div>
               </div>
            </div>
         )}

         {/* ═══ ALL RETURNS MODAL ═══ */}
         {showAllReturns && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowAllReturns(false)}>
               <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
               <div
                  className="relative w-full max-w-lg max-h-[85vh] flex flex-col liquid-glass overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
               >
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-500/80 via-orange-500 to-yellow-400 z-10"></div>
                  <div className="px-5 py-4 flex justify-between items-center border-b border-white/5">
                     <div className="flex items-center gap-2.5">
                        <div className="bg-amber-500/10 text-amber-500 p-2 rounded-xl border border-amber-500/20"><PackageCheck size={18} /></div>
                        <div>
                           <h2 className="font-bold text-theme-text-primary text-base">All Returns</h2>
                           <p className="text-[10px] text-theme-text-secondary">{returnBags.length} pending</p>
                        </div>
                     </div>
                     <button onClick={() => setShowAllReturns(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"><X size={18} /></button>
                  </div>
                  <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1 scrollbar-thin">
                     {returnBags.map((info, idx) => {
                        const { bag: b, tx } = info;
                        const project = store.getProject(b.projectId);
                        const returner = tx ? store.getUser(tx.setterId) : store.getUser(b.issuedToId);
                        const date = tx ? tx.submittedAt : b.returnedAt;
                        const isPartial = !!tx;

                        return (
                           <div key={tx?.id || b.id || idx} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200 flex items-start gap-3 group/item hover:border-amber-500/20">
                              <div className="relative flex-shrink-0 mt-0.5">
                                 <SetterAvatar name={returner?.name || 'User'} color={returner?.setterColor} image={returner?.profilePhoto} size="md" />
                                 <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-[#1c1e24]"></div>
                              </div>
                              <div className="min-w-0 flex-1">
                                 <div className="flex items-center gap-2">
                                    <span className="font-bold text-theme-text-primary text-[13px] leading-tight">Bag #{b.bagNumber}</span>
                                    <span className="text-[10px] text-zinc-500 font-semibold">{date ? formatRelativeTime(date) : ''}</span>
                                 </div>
                                 <div className="text-[10px] text-theme-text-secondary mt-0.5 font-medium">
                                    {returner?.name || 'Unknown'} · {project?.code || 'Proj'} · <span className={isPartial ? 'text-amber-500 font-semibold' : 'text-emerald-400 font-semibold'}>{isPartial ? 'Partial' : 'Full'}</span>
                                 </div>
                              </div>
                              <Button
                                 size="sm"
                                 onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setShowAllReturns(false);
                                    setCountBag(b);
                                    setCountTx(tx || null);
                                    if (tx) {
                                       setCounts(tx.lines.reduce((a, l, i) => ({ ...a, [i]: l.returnedPcs }), {}));
                                    } else {
                                       setCounts(b.items.reduce((a, i, i2) => ({ ...a, [i2]: i.issuedPcs }), {}));
                                    }
                                    setBrokenCounts({});
                                    setBrokenReason('');
                                    setMixedMode(false);
                                    setIsManagerEdit(false);
                                    setEditableItems([...b.items]);
                                 }}
                                 className="flex-shrink-0 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black border border-amber-500/20 hover:border-transparent rounded-xl px-3 py-1 h-7 text-[11px] font-bold transition-all active:scale-95 mt-0.5"
                              >
                                 Count
                              </Button>
                           </div>
                        );
                     })}
                  </div>
               </div>
            </div>
         )}

         <div className="mb-4 flex items-center gap-2">
            <h2 className="text-xl font-bold text-theme-text-primary">Active Projects</h2>
            <Badge color="green">{activeProjects.length}</Badge>
         </div>

         <div className={viewMode === 'LIST' ? 'space-y-4' : 'modular-grid'}>
            {(() => {
               const sorted = [...activeProjects].sort((a, b) => {
                  if (a.priority === Priority.RUSH && b.priority !== Priority.RUSH) return -1;
                  if (b.priority === Priority.RUSH && a.priority !== Priority.RUSH) return 1;
                  const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 9999999999999;
                  const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 9999999999999;
                  if (dateA !== dateB) return dateA - dateB;
                  const updatedA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const updatedB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return updatedB - updatedA;
               });
               const overviewProjects = sorted.slice(0, 6);
               return (
                  <>
                     {overviewProjects.map(p => (
                        viewMode === 'LIST' ? (
                           <Card key={p.id} onClick={() => navigate(`/project/${p.id}`)} className="group p-5 flex flex-col md:flex-row md:items-center gap-4 border-zinc-800 bg-transparent">
                              <div className="flex-1 w-full min-w-0">
                                 <div className="flex items-center justify-between md:justify-start gap-3 mb-1">
                                    <h3 className="font-bold text-lg text-theme-text-primary group-hover:text-lux-gold transition-colors truncate">{p.code}</h3>
                                    {p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}
                                 </div>
                                 <p className="text-sm text-zinc-500 font-medium truncate">{p.clientName ? `${p.clientName} ` : ''}{p.clientPhone ? `(${p.clientPhone}) - ` : (p.clientName ? '- ' : '')}{p.pieceName}</p>
                              </div>
                              <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                                 <div className="flex -space-x-3 pl-1">
                                    {p.assignments.filter(a => a.active).map(a => {
                                       const u = store.getUser(a.userId);
                                       return u ? <div key={u.id} className="ring-2 ring-[#1F2128] rounded-full"><SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="sm" /></div> : null;
                                    })}
                                 </div>
                                 <div className="flex items-center gap-8">
                                    <div className="text-right">
                                       <div className="font-bold text-theme-text-primary text-sm">{p.currentStageName || 'Intake'}</div>
                                       <div className="text-[9px] text-zinc-500 font-semibold tracking-wide mt-0.5">{p.currentPercentComplete || 0}% complete</div>
                                    </div>
                                    <div className="w-40">
                                       {store.isRepairProject(p) ? (
                                          <ProgressBar progress={p.currentPercentComplete || 0} className="my-1.5" />
                                       ) : (
                                          <ProjectMilestones currentPercent={p.currentPercentComplete || 0} currentStage={p.currentStageName} />
                                       )}
                                    </div>
                                    <ChevronRight className="text-zinc-700 group-hover:text-theme-text-primary hidden md:block transition-all group-hover:translate-x-1" />
                                 </div>
                              </div>
                           </Card>
                        ) : (
                           <div key={p.id} onClick={() => navigate(`/project/${p.id}`)} className="group border border-theme-border rounded-3xl overflow-hidden cursor-pointer hover:border-lux-gold/30 transition-all shadow-subtle hover:shadow-glow flex flex-col h-full relative bg-black/20">
                              <div className="h-32 bg-black relative flex items-center justify-center border-b border-theme-border">
                                 {p.projectPhotos && p.projectPhotos.length > 0 ? (
                                    <img src={p.projectPhotos[p.projectPhotos.length - 1]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                 ) : (
                                    <div className="text-zinc-700 flex flex-col items-center"><ImageIcon size={32} strokeWidth={1.5} /><span className="text-[10px] mt-2 font-medium uppercase tracking-wider">No Preview</span></div>
                                 )}
                                 <div className="absolute top-3 right-3">{p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}</div>
                                 <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white shadow-lg">{p.currentStageName || 'Intake'}</div>
                              </div>
                              <div className="p-5 flex-1 flex flex-col justify-between">
                                 <div className="mb-4">
                                    <h3 className="font-bold text-lg text-theme-text-primary group-hover:text-lux-gold transition-colors">{p.code}</h3>
                                    <p className="text-sm text-zinc-400 font-medium truncate">{p.clientName ? `${p.clientName} ` : ''}{p.clientPhone ? `(${p.clientPhone}) - ` : (p.clientName ? '- ' : '')}{p.pieceName}</p>
                                 </div>
                                 <div className="mt-auto">
                                    <div className="flex justify-between items-center mb-3">
                                       <div className="flex -space-x-2">
                                          {p.assignments.filter(a => a.active).map(a => {
                                             const u = store.getUser(a.userId);
                                             return u ? <div key={u.id} className="ring-2 ring-[#1F2128] rounded-full"><SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="sm" /></div> : null;
                                          })}
                                       </div>
                                       <span className="text-xs font-bold text-lux-gold">{p.currentPercentComplete || 0}%</span>
                                    </div>
                                    <div className="bg-black/30 p-2.5 rounded-2xl border border-white/5 shadow-inner">
                                       {store.isRepairProject(p) ? (
                                          <ProgressBar progress={p.currentPercentComplete || 0} className="my-1" />
                                       ) : (
                                          <ProjectMilestones currentPercent={p.currentPercentComplete || 0} currentStage={p.currentStageName} />
                                       )}
                                    </div>
                                 </div>
                              </div>
                           </div>
                        )
                     ))}
                     {activeProjects.length > 6 && (
                        <div
                           onClick={() => navigate('/projects')}
                           className="group border border-dashed border-theme-border hover:border-lux-gold/50 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-lux-gold/5 space-y-3 min-h-[220px]"
                        >
                           <div className="w-12 h-12 rounded-2xl bg-lux-gold/10 border border-lux-gold/20 flex items-center justify-center text-lux-gold group-hover:scale-110 transition-transform">
                              <Layers size={24} />
                           </div>
                           <div>
                              <div className="font-bold text-white text-base group-hover:text-lux-gold transition-colors">View All Projects</div>
                              <div className="text-xs text-zinc-500 font-mono mt-1">+{activeProjects.length - 6} more active projects</div>
                           </div>
                        </div>
                     )}
                  </>
               );
            })()}
         </div>

         {isCreating && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
               <div className="w-full max-w-3xl bg-theme-modal-bg rounded-3xl border border-theme-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="px-6 py-5 border-b border-theme-border flex justify-between items-center sticky top-0 bg-theme-modal-bg/90 backdrop-blur-md z-20">
                     <h2 className="text-xl font-bold text-theme-text-primary tracking-tight">Create New Project</h2>
                     <button onClick={() => setIsCreating(false)} className="text-zinc-500 hover:text-theme-text-primary p-2 rounded-full hover:bg-zinc-800 transition-colors"><X size={20} /></button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                     <section className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Project Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <Input label="Project Code" value={newProject.code} onChange={e => setNewProject({ ...newProject, code: e.target.value })} placeholder="e.g. DR-24-001" autoFocus />
                           <Input label="Piece Name" value={newProject.pieceName} onChange={e => setNewProject({ ...newProject, pieceName: e.target.value })} placeholder="e.g. 3.5ct Solitaire Ring" />
                           <Input label="Client Name" value={newProject.clientName} onChange={e => setNewProject({ ...newProject, clientName: e.target.value })} placeholder="e.g. John Doe" />
                           <Input label="Client Phone" value={newProject.clientPhone} onChange={e => setNewProject({ ...newProject, clientPhone: e.target.value })} placeholder="e.g. 555-0192" />
                        </div>
                     </section>
                     {!selectedServices.includes('Repair') && (
                        <section className="space-y-4">
                           <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Logistics</h3>
                           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <Input label="Due Date" type="date" value={newProject.dueDate} onChange={e => setNewProject({ ...newProject, dueDate: e.target.value })} />
                              <div>
                                 <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Priority</label>
                                 <select className="w-full bg-theme-input-bg text-theme-text-primary rounded-2xl border-transparent p-3.5 text-sm focus:ring-lux-gold transition-all" value={newProject.priority} onChange={e => setNewProject({ ...newProject, priority: e.target.value as Priority })}>
                                    <option value={Priority.NORMAL}>Normal</option>
                                    <option value={Priority.RUSH}>Rush</option>
                                    <option value={Priority.LOW}>Low</option>
                                 </select>
                              </div>
                              <div>
                                 <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Sales Rep</label>
                                 <select className="w-full bg-theme-input-bg text-theme-text-primary rounded-2xl border-transparent p-3.5 text-sm focus:ring-lux-gold transition-all" value={newProject.salesRepId} onChange={e => setNewProject({ ...newProject, salesRepId: e.target.value })}>
                                    <option value="">Select Rep...</option>
                                    {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                 </select>
                              </div>
                           </div>
                        </section>
                     )}
                     <section className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{selectedServices.includes('Repair') ? 'Selection' : 'Materials'}</h3>
                        <div className="bg-theme-input-bg p-5 rounded-2xl border border-theme-border">
                           {!selectedServices.includes('Repair') && (
                              <>
                                 {newProject.goldComponents?.map((comp, index) => (
                                    <div key={comp.id} className="mb-6 pb-6 border-b border-theme-border last:border-0 last:mb-0 last:pb-0 relative group">
                                       <div className="flex justify-between items-center mb-4">
                                          <div className="flex-1 mr-4">
                                             <Input label={`Component ${index + 1} Label`} value={comp.label} onChange={e => {
                                                const newComps = [...(newProject.goldComponents || [])];
                                                newComps[index].label = e.target.value;
                                                setNewProject({ ...newProject, goldComponents: newComps });
                                             }} placeholder="e.g. Main Ring" />
                                          </div>
                                          {(newProject.goldComponents?.length || 0) > 1 && (
                                             <button onClick={() => {
                                                const newComps = newProject.goldComponents!.filter((_, i) => i !== index);
                                                setNewProject({ ...newProject, goldComponents: newComps });
                                             }} className="text-zinc-500 hover:text-red-500 p-2 rounded-xl hover:bg-red-500/10 transition-colors mt-6"><X size={18} /></button>
                                          )}
                                       </div>
                                       <label className="block text-xs font-bold text-zinc-500 mb-3 uppercase">Gold Type</label>
                                       <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-5">
                                          {[
                                             { id: 'Yellow', label: 'Yellow', gradient: 'linear-gradient(135deg, #F5D061 0%, #E1B32A 100%)', text: '#5B4300' },
                                             { id: 'White', label: 'White', gradient: 'linear-gradient(135deg, #E8E8E8 0%, #C0C0C0 100%)', text: '#4A4A4A' },
                                             { id: 'Rose', label: 'Rose', gradient: 'linear-gradient(135deg, #F0C4B5 0%, #D69786 100%)', text: '#5D3A31' },
                                             { id: 'Platinum', label: 'Platinum', gradient: 'linear-gradient(135deg, #1E293B 0%, #64748B 100%)', text: '#FFFFFF' }
                                          ].map((type) => (
                                             <button key={type.id} onClick={() => {
                                                const newComps = [...(newProject.goldComponents || [])];
                                                newComps[index].type = type.id;
                                                if (type.id === 'Platinum') newComps[index].purity = '950';
                                                else if (newComps[index].purity === '950') newComps[index].purity = '14k';
                                                const updates: any = { goldComponents: newComps };
                                                if (index === 0) { updates.goldType = type.id; updates.goldPurity = newComps[0].purity; }
                                                setNewProject({ ...newProject, ...updates });
                                             }} className={`flex-1 h-12 rounded-xl flex items-center justify-center font-bold text-sm transition-all relative overflow-hidden ${comp.type === type.id ? 'ring-2 ring-white scale-105 shadow-lg' : 'opacity-70 hover:opacity-100'}`} style={{ background: type.gradient, color: type.text }}>{type.label}</button>
                                          ))}
                                       </div>
                                       <label className="block text-xs font-bold text-zinc-500 mb-3 uppercase">Purity</label>
                                       <div className="flex flex-wrap gap-2">
                                          {(comp.type === 'Platinum' ? ['950'] : ['10k', '14k', '18k', '21k']).map(k => (
                                             <button key={k} onClick={() => {
                                                const newComps = [...(newProject.goldComponents || [])];
                                                newComps[index].purity = k;
                                                const updates: any = { goldComponents: newComps };
                                                if (index === 0) updates.goldPurity = k;
                                                setNewProject({ ...newProject, ...updates });
                                             }} className={`flex-1 min-w-[60px] py-2.5 rounded-xl text-sm font-bold border transition-all ${comp.purity === k ? 'bg-zinc-800 text-white border-zinc-600 shadow-sm' : 'bg-transparent text-zinc-500 border-theme-border hover:text-theme-text-primary hover:border-zinc-700'}`}>{k}</button>
                                          ))}
                                       </div>
                                    </div>
                                 ))}
                                 <button onClick={() => {
                                    const count = (newProject.goldComponents?.length || 0) + 1;
                                    setNewProject({ ...newProject, goldComponents: [...(newProject.goldComponents || []), { id: crypto.randomUUID(), label: `Component ${count}`, type: 'Yellow', purity: '14k' }] });
                                 }} className="w-full mt-2 py-3 rounded-xl border border-dashed border-theme-border text-zinc-500 hover:border-lux-gold hover:text-lux-gold flex items-center justify-center gap-2 text-sm font-bold transition-all"><Plus size={16} /> Add Another Gold Component</button>
                              </>
                           )}
                        </div>
                     </section>
                     <section className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Services</h3>
                        <div className="bg-theme-input-bg rounded-2xl p-4 border border-theme-border flex flex-wrap gap-2">
                           {SERVICE_OPTIONS.map(svc => (
                              <button
                                 key={svc}
                                 disabled={svc === 'Other' || svc === 'Engagement'}
                                 onClick={() => toggleService(svc)}
                                 className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${(svc === 'Other' || svc === 'Engagement')
                                       ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-60'
                                       : selectedServices.includes(svc)
                                          ? 'bg-lux-gold text-black border-lux-gold shadow-sm'
                                          : 'bg-theme-modal-bg border-theme-border text-zinc-400 hover:text-theme-text-primary hover:border-zinc-700'
                                    }`}
                              >
                                 {svc}
                              </button>
                           ))}
                        </div>
                        {selectedServices.includes('Engagement') && (
                           <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl text-xs text-blue-400 font-medium">
                              Engagement project workflows will be available in a future update.
                           </div>
                        )}
                        {selectedServices.includes('Other') && (
                           <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-500 font-medium">
                              Other project workflows will be available in a future update.
                           </div>
                        )}
                        {selectedServices.includes('Repair') && (
                           <div className="bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 space-y-6 animate-in fade-in slide-in-from-top-2">
                              <div className="flex justify-between items-center">
                                 <h3 className="text-sm font-bold text-lux-cream flex items-center gap-2"><span className="bg-lux-gold text-black px-2.5 py-1 rounded-md text-xs tracking-wide">REPAIR MENU</span></h3>
                                 <div className="flex items-center gap-4">
                                    <div className="text-right">
                                       <div className="text-[10px] text-zinc-500 uppercase font-bold">Total Pcs</div>
                                       <div className="text-lg font-bold text-lux-gold">{newProject.repairDetails?.totalQuantity || 0}</div>
                                    </div>
                                    <Input type="date" value={newProject.repairDetails?.date || ''} onChange={e => setNewProject({ ...newProject, repairDetails: { ...newProject.repairDetails!, date: e.target.value } })} className="w-40" />
                                 </div>
                              </div>
                              <div className="space-y-3">
                                 {newProject.repairDetails?.items.map((item, index) => (
                                    <div key={index} className="flex items-end gap-3 group animate-in slide-in-from-left-2">
                                       <div className="flex-1"><Input label={index === 0 ? "Stone Size" : ""} placeholder="e.g. 1.5mm" value={item.stoneSize} onChange={e => {
                                          const newItems = [...newProject.repairDetails!.items];
                                          newItems[index].stoneSize = e.target.value;
                                          setNewProject({ ...newProject, repairDetails: { ...newProject.repairDetails!, items: newItems } });
                                       }} /></div>
                                       <div className="w-24"><Input label={index === 0 ? "Quantity" : ""} type="number" placeholder="0" value={item.quantity?.toString() || ''} onChange={e => {
                                          const val = parseInt(e.target.value) || 0;
                                          const newItems = [...newProject.repairDetails!.items];
                                          newItems[index].quantity = val;
                                          const total = newItems.reduce((sum, i) => sum + i.quantity, 0);
                                          setNewProject({ ...newProject, repairDetails: { ...newProject.repairDetails!, items: newItems, totalQuantity: total } });
                                       }} /></div>
                                       <div className="pb-1">
                                          {newProject.repairDetails!.items.length > 1 && (
                                             <button onClick={() => {
                                                const newItems = newProject.repairDetails!.items.filter((_, i) => i !== index);
                                                const total = newItems.reduce((sum, i) => sum + i.quantity, 0);
                                                setNewProject({ ...newProject, repairDetails: { ...newProject.repairDetails!, items: newItems, totalQuantity: total } });
                                             }} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"><X size={18} /></button>
                                          )}
                                       </div>
                                    </div>
                                 ))}
                                 <button onClick={() => {
                                    const newItems = [...newProject.repairDetails!.items, { stoneSize: '', quantity: 0 }];
                                    setNewProject({ ...newProject, repairDetails: { ...newProject.repairDetails!, items: newItems } });
                                 }} className="w-full py-3 rounded-xl border border-dashed border-theme-border text-zinc-500 hover:border-lux-gold hover:text-lux-gold flex items-center justify-center gap-2 text-sm font-bold transition-all"><Plus size={16} /> Add Another Stone</button>
                              </div>
                              <div>
                                 <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Report</label>
                                 <textarea className="w-full bg-theme-input-bg text-theme-text-primary rounded-2xl border-transparent p-4 text-sm focus:ring-lux-gold h-24 transition-all resize-none" placeholder="Repair report details..." value={newProject.repairDetails?.report || ''} onChange={e => setNewProject({ ...newProject, repairDetails: { ...newProject.repairDetails!, report: e.target.value } })} />
                              </div>
                           </div>
                        )}
                     </section>
                     {!selectedServices.includes('Repair') && (
                        <section className="space-y-4">
                           <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Work Details / Instructions</h3>
                           <textarea className="w-full bg-theme-input-bg text-theme-text-primary rounded-2xl border border-theme-border p-4 text-sm focus:ring-lux-gold focus:border-lux-gold h-28 transition-all resize-none" placeholder="Describe the work required..." value={newProject.workDetails} onChange={e => setNewProject({ ...newProject, workDetails: e.target.value })} />
                        </section>
                     )}
                     <section className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Assign Team (Optional)</h3>
                        <div className="flex flex-wrap gap-2">
                           {setters.map(u => (
                              <button key={u.id} onClick={() => setNewAssignees(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${newAssignees.includes(u.id) ? 'bg-lux-gold/10 border-lux-gold text-lux-gold shadow-sm' : 'bg-theme-input-bg border-theme-border text-zinc-400 hover:bg-theme-modal-bg'}`}>
                                 <SetterAvatar name={u.name} color={u.setterColor} size="sm" />
                                 <span className="text-xs font-bold">{u.name}</span>
                                 <Badge color={u.role === Role.DESIGNER ? 'blue' : u.role === Role.MANAGER ? 'amber' : 'gray'}>{u.role}</Badge>
                              </button>
                           ))}
                        </div>
                     </section>
                  </div>
                  <div className="px-6 py-5 border-t border-theme-border bg-theme-modal-bg/90 backdrop-blur-md sticky bottom-0 z-20 flex justify-end gap-3 safe-pb">
                     <Button variant="secondary" onClick={() => setIsCreating(false)} className="px-6">Cancel</Button>
                     <Button onClick={handleCreateProject} loading={loading} className="px-8 shadow-glow">Create Project</Button>
                  </div>
               </div>
            </div>
         )}

         {fulfillReq && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
               <Card className="w-full max-w-lg p-6 max-h-[90vh] flex flex-col overflow-hidden">
                  <h3 className="font-bold text-theme-text-primary text-lg mb-4">Issue Diamonds</h3>

                  <div className="bg-lux-gold/10 border border-lux-gold/30 p-4 rounded-xl mb-4 text-center shrink-0">
                     <div className="text-[10px] text-lux-gold font-bold uppercase tracking-widest mb-1">Job Number</div>
                     <div className="text-2xl font-black text-white font-mono tracking-wider">{fulfillReq.jobNumberSnapshot || store.getProject(fulfillReq.projectId)?.code || 'Unknown'}</div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 mb-6 border border-white/5 rounded-xl bg-zinc-900/50 p-4 space-y-4">
                     {editedLines.map((l, i) => {
                        const spec = store.getSpecs().find(s => s.id === l.specId);
                        const available = spec?.pcs ?? 0;

                        const isLowStock = available > 0 && available < l.requestedPcs;
                        const isOutOfStock = available <= 0;
                        const recommended = Math.min(l.requestedPcs, available);

                        const originalReqLine = fulfillReq.lines.find(ol => ol.specId === l.specId) || fulfillReq.lines[i];

                        const isChanged = originalReqLine
                           ? (l.issuedPcs !== originalReqLine.requestedPcs || l.specId !== originalReqLine.specId)
                           : true;

                        const explanationRequired = isChanged && !l.explanation.trim();

                        return (
                           <div key={i} className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3 relative">
                              <button
                                 onClick={() => setEditedLines(prev => prev.filter((_, idx) => idx !== i))}
                                 className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
                                 title="Remove line"
                              >
                                 <X size={16} />
                              </button>

                              {/* Spec Selection */}
                              <div>
                                 <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Diamond Specification</label>
                                 <select
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl p-2.5 text-sm text-theme-text-primary focus:border-lux-gold focus:ring-1 focus:ring-lux-gold transition-all"
                                    value={l.specId}
                                    onChange={e => {
                                       const newSpecId = e.target.value;
                                       const newSpec = store.getSpecs().find(s => s.id === newSpecId);
                                       const newAvailable = newSpec?.pcs ?? 0;
                                       setEditedLines(prev => prev.map((item, idx) => idx === i ? {
                                          ...item,
                                          specId: newSpecId,
                                          issuedPcs: Math.min(item.requestedPcs, newAvailable)
                                       } : item));
                                    }}
                                 >
                                    {store.getSpecs().filter(s => !s.location || s.location === 'Melee').map(s => (
                                       <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                 </select>
                              </div>

                              {/* Stats Row */}
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                 <div className="bg-zinc-950/40 p-2.5 rounded-lg border border-white/5">
                                    <span className="text-zinc-500 block mb-0.5">Requested</span>
                                    <span className="font-mono text-lux-cream font-bold text-sm">{l.requestedPcs} pcs</span>
                                 </div>
                                 <div className="bg-zinc-950/40 p-2.5 rounded-lg border border-white/5 flex flex-col justify-between">
                                    <span className="text-zinc-500 block mb-0.5">Available Stock</span>
                                    <div className="flex items-center gap-1.5">
                                       <span className="font-mono text-white font-bold text-sm">{available} pcs</span>
                                       {isOutOfStock ? (
                                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Out of Stock" />
                                       ) : isLowStock ? (
                                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" title="Low Stock" />
                                       ) : (
                                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Available" />
                                       )}
                                    </div>
                                 </div>
                              </div>

                              {/* Issue Qty & Recommended */}
                              <div className="flex items-center justify-between gap-4 pt-1">
                                 <div className="text-xs text-zinc-500">
                                    Recommended Qty: <span className="font-mono font-bold text-lux-gold">{recommended} pcs</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-400">Issue:</span>
                                    <input
                                       type="number"
                                       min="0"
                                       max={available}
                                       value={l.issuedPcs}
                                       onChange={e => {
                                          const val = parseInt(e.target.value) || 0;
                                          setEditedLines(prev => prev.map((item, idx) => idx === i ? {
                                             ...item,
                                             issuedPcs: Math.max(0, Math.min(val, available))
                                          } : item));
                                       }}
                                       className="w-24 bg-zinc-950 border border-white/10 rounded-xl p-2 font-mono text-sm text-lux-gold focus:border-lux-gold focus:ring-1 focus:ring-lux-gold transition-all text-center"
                                    />
                                 </div>
                              </div>

                              {/* Explanation Field (if changed) */}
                              {isChanged && (
                                 <div className="pt-1">
                                    <input
                                       type="text"
                                       placeholder="Explain variation (required)"
                                       value={l.explanation}
                                       onChange={e => setEditedLines(prev => prev.map((item, idx) => idx === i ? {
                                          ...item,
                                          explanation: e.target.value
                                       } : item))}
                                       className={`w-full bg-zinc-950 border rounded-xl p-2 text-xs focus:ring-1 transition-all ${explanationRequired
                                             ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
                                             : 'border-white/10 focus:border-lux-gold focus:ring-lux-gold'
                                          }`}
                                    />
                                    {explanationRequired && (
                                       <p className="text-[10px] text-red-400 mt-1 font-bold">Please provide an explanation for this deviation.</p>
                                    )}
                                 </div>
                              )}
                           </div>
                        );
                     })}
                  </div>

                  <div className="shrink-0 space-y-4">
                     <Input label="Assign Bag Number" value={bagNum} onChange={e => setBagNum(e.target.value)} className="font-mono text-xl text-center" />
                     <div><ImageUpload label="Bag Photo" required value={issuedPhoto} onChange={(base64, src) => { setIssuedPhoto(base64); setIssuedPhotoSource(src); }} /></div>

                     <div className="flex justify-end gap-3 pt-2">
                        <Button variant="secondary" onClick={() => setFulfillReq(null)}>Cancel</Button>
                        <Button
                           onClick={handleFulfill}
                           loading={loading}
                           disabled={!bagNum.trim() || !issuedPhoto || (() => {
                              if (editedLines.length === 0) return true;
                              for (let i = 0; i < editedLines.length; i++) {
                                 const el = editedLines[i];
                                 const orig = fulfillReq.lines[i];
                                 const isChanged = orig ? (el.issuedPcs !== orig.requestedPcs || el.specId !== orig.specId) : true;
                                 if (isChanged && !el.explanation.trim()) return true;

                                 const spec = store.getSpecs().find(s => s.id === el.specId);
                                 const available = spec?.pcs ?? 0;
                                 if (el.issuedPcs > available || el.issuedPcs < 0) return true;
                              }
                              return false;
                           })()}
                        >
                           Confirm Issue
                        </Button>
                     </div>
                  </div>
               </Card>
            </div>
         )}

         {countBag && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
               <Card className={`w-full max-w-xl p-6 transition-colors duration-500 ${mixedMode ? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                     <h3 className="font-bold text-theme-text-primary text-lg">Verify Return Bag #{countBag.bagNumber}</h3>
                     <div className="flex gap-2">
                        {!mixedMode && (
                           <button onClick={() => setIsManagerEdit(!isManagerEdit)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isManagerEdit ? 'bg-lux-gold text-black border-lux-gold' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}><Plus size={14} />{isManagerEdit ? 'Exit Edit Mode' : 'Manager Edit'}</button>
                        )}
                        <button onClick={() => setMixedMode(!mixedMode)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mixedMode ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}><Layers size={14} />{mixedMode ? 'Mixed Mode' : 'Standard Mode'}</button>
                     </div>
                  </div>

                  <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl mb-6 text-center">
                     <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mb-1">Job Number</div>
                     <div className="text-2xl font-black text-white font-mono tracking-wider">{countBag.jobNumberSnapshot || store.getProject(countBag.projectId)?.code || 'Unknown'}</div>
                  </div>

                  <div className="flex gap-4 mb-6">
                     {countBag.issuedPhoto && (<div className="w-24 h-24 rounded-lg bg-black border border-zinc-800 overflow-hidden relative group"><img src={countBag.issuedPhoto} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" /><span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/60 px-1 rounded">Issued</span></div>)}
                     {(countTx?.photo || countBag.returnedPhoto) && (<div className="w-24 h-24 rounded-lg bg-black border border-zinc-800 overflow-hidden relative group"><img src={countTx?.photo || countBag.returnedPhoto} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" /><span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/60 px-1 rounded">Returned</span></div>)}
                  </div>

                  {mixedMode ? (
                     <div className="space-y-6 mb-6 animate-in fade-in slide-in-from-right-4">
                        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                           <p className="text-sm text-indigo-300 mb-4 flex items-center gap-2"><Scale size={16} />Enter the total weight for mixed/unsorted stones.</p>
                           <Input type="number" step="0.001" label="Total Weight (Ct)" value={mixedCt} onChange={e => setMixedCt(e.target.value)} className="text-2xl font-mono text-center border-indigo-500/50 focus:border-indigo-400 focus:ring-indigo-400" placeholder="0.000" autoFocus />
                        </div>
                        <Input label="Mixed Return Note" value={mixedNotes} onChange={e => setMixedNotes(e.target.value)} placeholder="e.g. Mixed melee from setting" />
                     </div>
                  ) : (
                     <>
                        {isManagerEdit ? (
                           <div className="flex items-center gap-2 mb-3 px-1 py-2 bg-lux-gold/10 border border-lux-gold/20 rounded-xl"><Plus size={12} className="text-lux-gold" /><span className="text-[10px] font-bold text-lux-gold uppercase tracking-wider">Manager Edit Mode — Correcting Bag Specifications</span></div>
                        ) : (
                           <>
                              {!!countTx && (
                                 <div className="flex items-start gap-2 mb-4 p-3 bg-amber-950/40 border border-amber-900/30 rounded-xl text-amber-400 text-xs">
                                    <AlertCircle size={16} className="shrink-0 mt-0.5 animate-pulse" />
                                    <p>Review the Setter's declared count. If there is a discrepancy, edit the counts below and enter a correction reason.</p>
                                 </div>
                              )}
                              <div className="grid grid-cols-13 gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-2 px-2 grid-flow-col" style={{ gridTemplateColumns: '5fr 2fr 2fr 3fr 3fr' }}><div>Spec</div><div className="text-center">Issued</div><div className="text-center">Return</div><div className="text-center text-red-400">Broken</div><div className="text-center text-blue-400">⚖ Scale (ct)</div></div>
                           </>
                        )}
                        <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-1">
                           {(countTx ? countTx.lines.map(l => ({ specId: l.specId, issuedPcs: l.originalIssuedPcs, defaultReturned: l.returnedPcs })) : (isManagerEdit ? editableItems : countBag.items)).map((item, idx) => {
                              const spec = store.getSpecs().find(s => s.id === item.specId);
                              const returnedVal = counts[idx] ?? (item as any).defaultReturned ?? item.issuedPcs;
                              const brokenVal = brokenCounts[idx] || 0;
                              const remaining = item.issuedPcs - returnedVal - brokenVal;
                              if (isManagerEdit) {
                                 return (
                                    <div key={idx} className="flex gap-2 items-center bg-zinc-900 p-3 rounded-xl border border-lux-gold/30 animate-in slide-in-from-left-2">
                                       <div className="flex-1"><label className="block text-[10px] font-bold text-lux-gold uppercase mb-1">Spec</label><select className="w-full bg-black border border-zinc-700 rounded-lg p-2 text-sm text-white focus:border-lux-gold transition-all" value={item.specId} onChange={e => { const updated = [...editableItems]; updated[idx] = { ...updated[idx], specId: e.target.value }; setEditableItems(updated); }}>{store.getSpecs().map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}</select></div>
                                       <div className="w-24"><label className="block text-[10px] font-bold text-lux-gold uppercase mb-1">Issued Pcs</label><input type="number" min="0" value={item.issuedPcs} onChange={e => { const updated = [...editableItems]; updated[idx] = { ...updated[idx], issuedPcs: parseInt(e.target.value) || 0 }; setEditableItems(updated); }} className="w-full bg-black border border-zinc-700 rounded-lg p-2 text-center text-white font-mono text-sm focus:border-lux-gold focus:ring-0" /></div>
                                       {editableItems.length > 1 && (<button onClick={() => setEditableItems(editableItems.filter((_, i) => i !== idx))} className="mt-4 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><X size={16} /></button>)}
                                    </div>
                                 );
                              }
                              const expectedCt = returnedVal * (spec?.ctPerStone || 0);
                              const weighed = weighedCarats[idx];
                              const weighedCtNum = weighed ? parseFloat(weighed) : null;
                              const toleranceDelta = weighedCtNum !== null ? +(weighedCtNum - expectedCt).toFixed(4) : null;
                              const tolerancePct = expectedCt > 0 && toleranceDelta !== null ? (toleranceDelta / expectedCt * 100).toFixed(2) : null;
                              const toleranceColor = toleranceDelta === null ? '' : Math.abs(toleranceDelta) < 0.001 ? 'text-emerald-400' : Math.abs(toleranceDelta) <= expectedCt * 0.03 ? 'text-amber-400' : 'text-red-400';
                              return (
                                 <div key={idx} className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 space-y-2">
                                    {/* Main row */}
                                    <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '5fr 2fr 2fr 3fr 3fr' }}>
                                       <div><div className="text-sm font-bold text-white">{spec?.label}</div><div className="text-[10px] text-zinc-500">{spec?.sizeMm}mm · {(returnedVal * (spec?.ctPerStone || 0)).toFixed(4)}ct exp.</div></div>
                                       <div className="text-center text-sm text-white font-mono">{item.issuedPcs}</div>
                                       <div><input type="number" value={returnedVal} onChange={e => setCounts({ ...counts, [idx]: parseInt(e.target.value) || 0 })} className={`w-full bg-black border rounded-lg p-1.5 text-center font-mono text-sm focus:ring-0 ${returnedVal !== (item as any).defaultReturned ? 'border-amber-500 text-amber-400 font-bold animate-pulse' : 'border-zinc-700 focus:border-lux-gold text-white'}`} /></div>
                                       <div className="pl-1"><input type="number" value={brokenVal || ''} placeholder="0" onChange={e => setBrokenCounts({ ...brokenCounts, [idx]: parseInt(e.target.value) || 0 })} className={`w-full bg-black border rounded-lg p-1.5 text-center font-mono text-sm focus:ring-0 ${brokenVal > 0 ? 'border-red-500/50 text-red-400' : 'border-zinc-800 text-zinc-600'}`} /></div>
                                       <div className="pl-1"><input type="number" step="0.0001" value={weighed || ''} placeholder="0.0000" onChange={e => setWeighedCarats({ ...weighedCarats, [idx]: e.target.value })} className={`w-full bg-black border rounded-lg p-1.5 text-center font-mono text-sm focus:ring-0 ${weighedCtNum !== null ? 'border-blue-500/50 text-blue-300' : 'border-zinc-800 text-zinc-500'}`} /></div>
                                    </div>
                                    {/* Footer: used pcs + weight tolerance indicator */}
                                    {(remaining !== 0 || toleranceDelta !== null) && (
                                       <div className="grid gap-2 border-t border-zinc-800 pt-1.5 text-[10px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                          {remaining !== 0 && <div className="text-zinc-500">Net Used: <span className="text-lux-gold font-bold">{remaining}</span> pcs</div>}
                                          {toleranceDelta !== null && (
                                             <div className={`text-right font-mono font-bold ${toleranceColor}`}>
                                                ⚖ {toleranceDelta > 0 ? '+' : ''}{toleranceDelta}ct ({tolerancePct}%)
                                                {Math.abs(toleranceDelta) < 0.001 && ' ✓ Within tolerance'}
                                                {Math.abs(toleranceDelta) >= 0.001 && Math.abs(toleranceDelta) <= (expectedCt * 0.03) && ' △ Minor variance'}
                                                {expectedCt > 0 && Math.abs(toleranceDelta) > expectedCt * 0.03 && ' ⚠ Review required'}
                                             </div>
                                          )}
                                       </div>
                                    )}
                                 </div>
                              );
                           })}
                           {isManagerEdit && (<button onClick={() => setEditableItems([...editableItems, { specId: store.getSpecs()[0]?.id || '', issuedPcs: 0 }])} className="w-full py-3 border border-dashed border-zinc-700 rounded-xl text-zinc-500 hover:border-lux-gold hover:text-lux-gold transition-all flex items-center justify-center gap-2 text-sm font-bold"><Plus size={16} /> Add Spec Row</button>)}
                        </div>
                        {!!countTx && (() => {
                           const items = countTx.lines.map((l, i) => ({ original: l.returnedPcs, current: counts[i] ?? l.returnedPcs }));
                           const hasDiscrepancy = items.some(x => x.original !== x.current);
                           return hasDiscrepancy && (
                              <div className="mb-6 animate-in slide-in-from-top-2">
                                 <div className="flex items-center gap-2 mb-2 text-amber-400 text-xs font-bold uppercase">
                                    <AlertTriangle size={12} /> Count Correction Reason (Required)
                                 </div>
                                 <Input
                                    value={correctionReason}
                                    onChange={e => setCorrectionReason(e.target.value)}
                                    placeholder="Describe why you corrected the count..."
                                    className="border-amber-900/50 focus:border-amber-500"
                                 />
                              </div>
                           );
                        })()}
                        {Object.values(brokenCounts).some((v: any) => v > 0) && (
                           <div className="mb-6 animate-in slide-in-from-top-2"><div className="flex items-center gap-2 mb-2 text-red-400 text-xs font-bold uppercase"><AlertOctagon size={12} /> Breakage Reason (Required)</div><Input value={brokenReason} onChange={e => setBrokenReason(e.target.value)} placeholder="Why are stones broken?" className="border-red-900/50 focus:border-red-500" /></div>
                        )}
                     </>
                  )}
                  <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCountBag(null)}>Cancel</Button><Button onClick={handleCount} loading={loading} className={mixedMode ? 'bg-indigo-600 hover:bg-indigo-500' : ''}>Confirm Return</Button></div>
               </Card>
            </div>
         )}
       </div>
    );
 };

export default ManagerDashboard;
