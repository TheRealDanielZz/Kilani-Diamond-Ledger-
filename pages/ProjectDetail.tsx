
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, Role, DiamondBag, IssueRequest, DiamondSpec, ProjectCostSummary, ProgressStage, ProjectStatus, BagStatus, InventoryMovementType, ProjectNote } from '../types';
import { Card, Button, StatusPill, SetterAvatar, Badge, Input, Spinner, ProgressBar, SegmentedControl } from '../components/UI';
import { ImageUpload } from '../components/ImageUpload';
import { ArrowLeft, PackagePlus, RotateCcw, Calculator, Clock, Package, CheckCircle2, ChevronDown, UserPlus, ArrowRightLeft, GripHorizontal, AlertOctagon, StickyNote, Camera, FileText, Send, Paperclip, Check, LayoutTemplate, PenTool, X, Trash2, ZoomIn, Layers, Loader2, AlertTriangle, Scale, RefreshCw, Box, ChevronRight, Image as ImageIcon, Coins, Truck } from 'lucide-react';
import { useToast } from '../App';
import { FastEntryGrid } from '../components/FastEntryGrid';

interface Props { currentUser: any; }

const ProjectDetail: React.FC<Props> = ({ currentUser }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  const returnInputRef = useRef<HTMLInputElement>(null);
  
  const isManager = currentUser?.role === Role.MANAGER;
  const isDesigner = currentUser?.role === Role.DESIGNER;
  
  const [project, setProject] = useState<Project | undefined>();
  const [bags, setBags] = useState<DiamondBag[]>([]);
  const [requests, setRequests] = useState<IssueRequest[]>([]);
  const [cost, setCost] = useState<ProjectCostSummary | null>(null);
  const [stages] = useState<ProgressStage[]>(store.getStages());
  const [specs] = useState<DiamondSpec[]>(store.getSpecs());

  // View States
  const [activeTab, setActiveTab] = useState<'bags' | 'design' | 'photos'>('bags');
  const [progressView, setProgressView] = useState<'PRODUCTION' | 'DESIGN'>('PRODUCTION'); 
  const [showStageSelector, setShowStageSelector] = useState(false); // Mobile Bottom Sheet
  const [showFinancials, setShowFinancials] = useState(false); // Financial Dropdown State

  // Gallery
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingPhotoIndex, setDeletingPhotoIndex] = useState<number | null>(null);
  
  // Photo Delete Modal State
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<number | null>(null);

  // Modals
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestLines, setRequestLines] = useState<any[]>([]);
  const [isReturning, setIsReturning] = useState(false);
  const [returnBagNum, setReturnBagNum] = useState('');
  const [returnPhoto, setReturnPhoto] = useState<string | undefined>(undefined);
  
  const [isAssigning, setIsAssigning] = useState(false);
  const [isHandoff, setIsHandoff] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState('');
  const [handoffReason, setHandoffReason] = useState('');
  const [handoffWeight, setHandoffWeight] = useState('');
  
  // Progress Confirm Modal (Desktop & Mobile Unified)
  const [pendingStage, setPendingStage] = useState<ProgressStage | null>(null);
  const [isConfirmingProgress, setIsConfirmingProgress] = useState(false);
  const [stageWeight, setStageWeight] = useState(''); // For mandatory weight input

  // Casting Modals
  const [isCastingReceive, setIsCastingReceive] = useState(false);
  const [castingCondition, setCastingCondition] = useState<'CORRECT' | 'DAMAGED' | 'INCORRECT'>('CORRECT');
  const [castingWeight, setCastingWeight] = useState('');
  const [castingNotes, setCastingNotes] = useState('');

  // Broken Modal (New Weight Based State)
  const [isBroken, setIsBroken] = useState(false);
  const [brokenCt, setBrokenCt] = useState('');
  const [brokenPcs, setBrokenPcs] = useState('');
  const [brokenReason, setBrokenReason] = useState('');
  const [brokenSpecId, setBrokenSpecId] = useState(''); // Optional

  // Design Log State
  const [newNote, setNewNote] = useState('');
  const [newNoteImage, setNewNoteImage] = useState<string | undefined>(undefined);
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Project Photos State
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  // Financials
  const [labourCostInput, setLabourCostInput] = useState('');
  const [labourCostNote, setLabourCostNote] = useState('');
  const [isSavingCost, setIsSavingCost] = useState(false);

  const [loadingAction, setLoadingAction] = useState(false);

  // Computed Design Stages
  const getVisibleDesignStages = () => {
    const base = [
      'Intake', 
      'Working', 
      'Waiting to review', 
      'Approved',
      'Casting Sent'
    ];
    
    // Conditional Stages
    if (project?.designStage === 'Recasting Sent') {
        base.push('Recasting Sent');
    }
    
    // Only show 'Casting Received (Issue)' if currently stuck there. 
    // If successful, we jump straight to Ready for Production.
    if (project?.designStage === 'Casting Received (Issue)') {
        base.push('Casting Received (Issue)');
    }
    
    base.push('Ready for Production');
    return base;
  };

  const visibleDesignStages = getVisibleDesignStages();

  useEffect(() => {
    if (id) {
       const sync = () => refresh();
       sync();
       return store.subscribe(sync);
    }
  }, [id]);

  useEffect(() => {
    // Auto-select tab and view for designers
    if (isDesigner) {
       if (activeTab === 'bags') setActiveTab('design');
       setProgressView('DESIGN');
    }
  }, [isDesigner]);

  useEffect(() => {
    if (project) {
        setLabourCostInput(project.labourCostAmount?.toString() || '');
        setLabourCostNote(project.labourCostNote || '');
    }
  }, [project]);

  useEffect(() => {
    if (isReturning && returnInputRef.current) {
      setTimeout(() => returnInputRef.current?.focus(), 100);
    }
  }, [isReturning]);

  const refresh = () => {
    if(!id) return;
    const p = store.getProject(id);
    // Force new object reference
    setProject(p ? { ...p } : undefined);
    setBags(store.getBags(id));
    setRequests(store.getRequests(id));
    setCost(store.getProjectCostSummary(id));
  };

  const handleStageSelection = (stage: ProgressStage) => {
      setShowStageSelector(false);
      setPendingStage(stage);
      setIsConfirmingProgress(true);
  };

  const handleConfirmStageUpdate = async (withHandoff: boolean) => {
    // Validation: Check Stage Weight
    if (!stageWeight || parseFloat(stageWeight) <= 0) {
        alert("Please enter current weight (grams) to update stage.");
        return;
    }

    if (project && pendingStage) {
        try {
            // Update Store (Optimistic will happen after)
            const isCompleting = pendingStage.name === 'Complete';

            if (isCompleting && isManager) {
                // SPECIAL FLOW: Move to Review
                // 1. Add progress log
                await store.addProgress({
                    id: Math.random().toString(), 
                    projectId: project.id, 
                    createdById: currentUser.id, 
                    createdAt: new Date().toISOString(), 
                    stageName: pendingStage.name, 
                    percentComplete: pendingStage.percentValue,
                    weightG: parseFloat(stageWeight)
                });
                
                // 2. Trigger Complete Workflow (Move to Review status)
                await store.completeProject(project.id, parseFloat(stageWeight), currentUser.id);
                showToast("Project moved to Review (Awaiting Pickup)");
                navigate('/'); // Return to dashboard as it disappears from active
                return;
            } else if (isCompleting && !isManager) {
               alert("Only Managers can mark a project as fully complete.");
               return;
            }

            // STANDARD FLOW
            store.addProgress({
                id: Math.random().toString(), 
                projectId: project.id, 
                createdById: currentUser.id, 
                createdAt: new Date().toISOString(), 
                stageName: pendingStage.name, 
                percentComplete: pendingStage.percentValue,
                weightG: parseFloat(stageWeight)
            });

            // Update Local State for Optimistic UI
            setProject({ ...project, currentStageName: pendingStage.name, currentPercentComplete: pendingStage.percentValue });
            showToast(`Stage updated to ${pendingStage.name}`);
            
            // Clean up modal
            setIsConfirmingProgress(false);
            setPendingStage(null);
            const capturedWeight = stageWeight; // Capture before clear
            setStageWeight('');
            
            // Trigger Handoff if requested
            if (withHandoff) {
                setTimeout(() => {
                    setHandoffWeight(capturedWeight); // Pre-fill with same weight
                    setHandoffTarget(''); // Clear previous target
                    setIsHandoff(true);
                }, 300);
            }

        } catch (e) {
            showToast("Failed to update stage");
        }
    }
  };

  const handleDesktopStageClick = (s: ProgressStage) => {
    // Check Design Gate
    if (project?.designStage !== 'Ready for Production' && s.percentValue > 0) {
        alert("Project is not ready for production. Casting approval required.");
        return;
    }

    if (project && s.name !== project.currentStageName) {
       setPendingStage(s);
       setIsConfirmingProgress(true);
    }
  };

  // ... (existing handlers: handleDesignStageUpdate, handleReceiveCasting, etc.)

  const handleDesignStageUpdate = async (stage: string) => {
     if (!project) return;

     if (stage === 'Casting Sent' && project.designStage === 'Approved') {
         await store.sendToCasting(project.id, currentUser.id);
         setProject({ ...project, designStage: stage });
         showToast("Sent to Casting");
         return;
     }
     
     if (stage === 'Casting Received (Issue)') return;

     setProject({ ...project, designStage: stage });
     await store.updateDesignStage(project.id, stage, currentUser.id);
     showToast(`Design Stage: ${stage}`);
  };

  const handleReceiveCasting = async () => {
      if (castingCondition === 'CORRECT' && (!castingWeight || parseFloat(castingWeight) <= 0)) {
          alert("Weight is required for correct casting.");
          return;
      }
      
      await store.receiveCasting(project!.id, castingCondition, parseFloat(castingWeight) || 0, castingNotes, currentUser.id);
      
      setIsCastingReceive(false);
      setCastingCondition('CORRECT');
      setCastingWeight('');
      setCastingNotes('');
      
      showToast(castingCondition === 'CORRECT' ? "Casting Approved" : "Casting Issues Logged");
  };

  const handleSendRecast = async () => {
      await store.sendToCasting(project!.id, currentUser.id);
      showToast("Sent for Recasting");
  };

  const handleServiceStatusToggle = async (serviceName: string) => {
     if (!project || !project.services) return;
     const current = project.services.find(s => s.name === serviceName);
     if (!current) return;

     let nextStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' = 'PENDING';
     if (current.status === 'PENDING') nextStatus = 'IN_PROGRESS';
     else if (current.status === 'IN_PROGRESS') nextStatus = 'COMPLETED';
     else nextStatus = 'PENDING';

     const updatedServices = project.services.map(s => 
        s.name === serviceName ? { ...s, status: nextStatus } : s
     );
     setProject({ ...project, services: updatedServices });

     await store.updateServiceStatus(project.id, serviceName, nextStatus, currentUser.id);
  };

  const submitRequest = async () => {
    const valid = requestLines.filter(l => l.pcs > 0);
    if(!valid.length) return;
    setLoadingAction(true);
    try {
      await store.createRequest({ projectId: project!.id, requestedById: currentUser.id, lines: valid.map(l => ({specId: l.specId, requestedPcs: l.pcs})) });
      setIsRequesting(false); 
      showToast("Request Sent");
    } catch(e) { 
      console.error(e);
    } finally {
      setLoadingAction(false);
    }
  };

  const submitReturn = () => {
    const cleanBagNum = returnBagNum.replace(/#/g, '').trim();
    if(!cleanBagNum) return;
    if(!returnPhoto) return alert("Return photo required");
    
    setLoadingAction(true);
    
    setTimeout(async () => {
      try {
        await store.submitBagReturn(cleanBagNum, currentUser.id, returnPhoto);
        setIsReturning(false); 
        setReturnBagNum(''); 
        setReturnPhoto(undefined);
        showToast("Return Submitted"); 
      } catch(e: any) {
        showToast(e.message || "Error submitting return");
      } finally {
        setLoadingAction(false);
      }
    }, 100);
  };

  const handleAssign = async (userId: string) => {
    if (!project) return;
    
    const user = store.getUser(userId);
    if (!user) return;

    setIsAssigning(false);

    let updatedAssignments = [...(project.assignments || [])];
    let updatedProject = { ...project };

    if (user.role === Role.SALES_REP) {
        updatedAssignments = updatedAssignments.filter(a => {
             const u = store.getUser(a.userId);
             return u?.role !== Role.SALES_REP;
        });
        updatedProject.salesRepId = userId;
    }

    if (!updatedAssignments.some(a => a.userId === userId && a.active)) {
        updatedAssignments.push({ userId, assignedAt: new Date().toISOString(), active: true });
    }
    
    updatedProject.assignments = updatedAssignments;
    setProject(updatedProject);
    
    try {
        await store.assignUser(project.id, userId);
        showToast(user.role === Role.SALES_REP ? "Sales Rep Updated" : "Team Member Assigned");
    } catch (e) {
        console.error(e);
        showToast("Failed to assign");
    }
  };

  const submitHandoff = async () => {
    if(!handoffTarget) return;
    if(!handoffWeight) return alert("Weight is required for handoff.");

    setLoadingAction(true);
    try {
      await store.handoffProject(project!.id, currentUser.id, handoffTarget, handoffReason, parseFloat(handoffWeight));
      setIsHandoff(false); 
      showToast("Project Handed Off"); 
    } catch(e) { 
      console.error(e);
    } finally {
      setLoadingAction(false); 
    }
  };

  const submitBreakage = async () => {
    const ctVal = parseFloat(brokenCt);
    const pcsVal = parseInt(brokenPcs) || 0;

    if (!brokenCt || isNaN(ctVal) || ctVal <= 0) return alert("Valid carat weight required.");
    if (!brokenReason) return alert("Note/Reason required.");
    
    setLoadingAction(true);

    try {
      await store.createInventoryMovement({
        type: InventoryMovementType.BROKEN_OUT,
        createdById: currentUser.id,
        referenceProjectId: project!.id,
        notes: brokenReason,
        lines: [{
            specId: brokenSpecId || undefined,
            pcs: pcsVal > 0 ? pcsVal : undefined,
            ct: ctVal
        }]
     });
      setIsBroken(false); 
      setBrokenCt(''); 
      setBrokenPcs('');
      setBrokenReason(''); 
      setBrokenSpecId('');
      showToast("Breakage Recorded"); 
    } catch(e) { 
      console.error(e);
    } finally {
      setLoadingAction(false); 
    }
  };

  const submitNote = async () => {
    if(!newNote && !newNoteImage) return;
    setLoadingAction(true);
    
    const note = {
       id: Math.random().toString(36).substr(2,9),
       projectId: project!.id,
       createdById: currentUser.id,
       createdAt: new Date().toISOString(),
       note: newNote,
       attachment: newNoteImage,
       type: 'DESIGN' as const
    };
    
    setProject(prev => prev ? {
        ...prev,
        designLogs: [...(prev.designLogs || []), note]
    } : undefined);

    try {
        await store.addProjectNote(note);
        setNewNote('');
        setNewNoteImage(undefined);
        setIsAddingNote(false);
    } catch(e) {
        console.error(e);
        showToast("Failed to save note");
    } finally {
        setLoadingAction(false);
    }
  };

  const handleProjectPhotoUpload = async (base64: string | undefined) => {
    if (base64 && project) {
      setIsUploadingPhoto(false);
      await store.addProjectPhoto(project.id, base64);
      showToast("Photo Added");
    }
  }

  const initiateDeletePhoto = (index: number) => {
     setPhotoToDelete(index);
     setIsDeletingPhoto(true);
  };

  const confirmDeletePhoto = async () => {
     if (photoToDelete === null || !project) return;
     const index = photoToDelete;
     setIsDeletingPhoto(false);
     setDeletingPhotoIndex(index);

     const updatedPhotos = [...(project.projectPhotos || [])];
     updatedPhotos.splice(index, 1);
     const updatedPhotoIds = project.projectPhotoIds ? [...project.projectPhotoIds] : [];
     if (updatedPhotoIds.length > index) updatedPhotoIds.splice(index, 1);

     setProject({
        ...project,
        projectPhotos: updatedPhotos,
        projectPhotoIds: updatedPhotoIds
     });
     
     try {
       await store.deleteProjectPhoto(project.id, index);
       setDeletingPhotoIndex(null);
       showToast("Photo Deleted");
       if (lightboxIndex === index) {
         setLightboxIndex(null);
       } else if (lightboxIndex !== null && index < lightboxIndex) {
         setLightboxIndex(lightboxIndex - 1);
       }
     } catch (e) {
       console.error(e);
       setDeletingPhotoIndex(null);
       showToast("Error deleting photo");
     }
     setPhotoToDelete(null);
  }

  const handleSaveLabourCost = async () => {
      if (!project) return;
      setIsSavingCost(true);
      try {
          await store.updateProjectLabourCost(project.id, parseFloat(labourCostInput) || 0, labourCostNote);
          showToast("Cost Updated");
      } catch (e: any) {
          alert(e.message);
      } finally {
          setIsSavingCost(false);
      }
  };

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  if (!project) return <div className="p-8 text-center text-zinc-500">Loading Project...</div>;

  const currentPercent = project.currentPercentComplete || 0;
  // Locked if not ready OR if already completed (Review/Closed)
  const isLocked = (project.designStage !== 'Ready for Production' && !isManager && !isDesigner) || project.status !== ProjectStatus.ACTIVE;
  const lastWeight = project.progress?.filter(p => p.weightG).pop()?.weightG;
  const openRequests = requests.filter(r => r.status === 'OPEN');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-48 md:pb-32 safe-pb">
      
      {/* HEADER SECTION - Elevated Z-Index */}
      <div data-tour="project-header" className="mb-8 flex flex-col gap-4 relative z-30">
        <button onClick={() => navigate(-1)} className="text-zinc-500 hover:text-white flex items-center text-sm font-bold transition-colors w-fit p-2 -ml-2 rounded-lg active:bg-white/5">
            <ArrowLeft className="w-4 h-4 mr-1"/> Back
        </button>

        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-5">
            <div className="min-w-0 flex-1">
               <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="text-3xl md:text-4xl font-serif font-bold text-white tracking-tight break-words line-clamp-2 max-w-full leading-tight">{project.code}</h1>
                  <StatusPill status={project.status} />
                  {project.goldType && (
                      <Badge color="amber">{project.goldType} {project.goldPurity}</Badge>
                  )}
               </div>
               <p className="text-zinc-400 text-lg break-words line-clamp-2 max-w-full">{project.pieceName}</p>
               
               <div className="flex items-center gap-3 mt-4 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 md:mx-0 md:px-0">
                  <div className="flex -space-x-2 shrink-0">
                     {project.assignments.filter(a => a.active).map(a => {
                       const u = store.getUser(a.userId);
                       return u ? <div key={u.id} className="ring-4 ring-[#16171D] rounded-full relative"><SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="sm" /></div> : null;
                     })}
                  </div>
                  {isManager && project.status === ProjectStatus.ACTIVE && <button onClick={() => setIsAssigning(true)} className="shrink-0 bg-[#23262F]/50 backdrop-blur-md hover:bg-lux-gold hover:text-black text-zinc-400 p-2 rounded-full transition-colors border border-white/10"><UserPlus size={16}/></button>}
                  {!isManager && !isDesigner && project.status === ProjectStatus.ACTIVE && (
                      <Button 
                        size="sm"
                        variant="secondary"
                        onClick={() => setIsHandoff(true)} 
                        className="shrink-0 text-xs h-9 px-3"
                        icon={<ArrowRightLeft size={12}/>}
                      >
                        Handoff
                      </Button>
                  )}
               </div>
            </div>

            {/* Desktop Actions - Elevated Z-Index */}
            <div data-tour="project-actions" className="hidden md:flex flex-wrap gap-2 md:gap-3 relative z-30">
              {!isManager && !isDesigner && project.status === ProjectStatus.ACTIVE && (
                 <>
                   <Button size="sm" variant="secondary" onClick={() => setIsRequesting(true)} icon={<PackagePlus size={16} className="text-blue-400"/>}>Request</Button>
                   <Button size="sm" variant="secondary" onClick={() => { setReturnBagNum(''); setIsReturning(true); }} icon={<RotateCcw size={16} className="text-amber-400"/>}>Return</Button>
                 </>
              )}
              {project.status === ProjectStatus.ACTIVE && (
                 <Button size="sm" variant="danger" onClick={() => setIsBroken(true)} icon={<AlertOctagon size={16} />}>Broken</Button>
              )}
            </div>
        </div>
      </div>

      {/* MOBILE ACTION BAR - High Z-Index */}
      {project.status === ProjectStatus.ACTIVE && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-[#16171D]/90 backdrop-blur-xl border-t border-white/10 z-[200] flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] animate-in slide-in-from-bottom-2">
            {(!isManager && !isDesigner) && (
                <>
                <Button className="flex-1 shadow-none bg-[#23262F] hover:bg-[#2D313A] border border-white/5" onClick={() => setIsRequesting(true)} icon={<PackagePlus className="text-blue-400"/>}>Request</Button>
                <Button className="flex-1 shadow-glow" onClick={() => { setReturnBagNum(''); setIsReturning(true); }} icon={<RotateCcw className="text-black"/>}>Return</Button>
                </>
            )}
            {(isManager || !isDesigner) && (
                <Button className="flex-1" variant="danger" onClick={() => setIsBroken(true)} icon={<AlertOctagon/>}>Broken</Button>
            )}
            {isManager && (
                <Button className="flex-1" variant="secondary" onClick={() => setIsAssigning(true)} icon={<UserPlus/>}>Assign</Button>
            )}
            {isDesigner && (
                <Button className="flex-1 w-full" onClick={() => setIsAddingNote(true)} icon={<StickyNote/>}>Add Design Log</Button>
            )}
        </div>
      )}

      {isManager && (
         <div className="flex justify-center mb-8 relative z-20">
            <div className="bg-black/30 backdrop-blur-xl p-1 rounded-full flex gap-1 border border-white/10">
               <button 
                  onClick={() => setProgressView('PRODUCTION')} 
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${progressView === 'PRODUCTION' ? 'bg-lux-gold text-[#16171D] shadow-glow' : 'text-zinc-500 hover:text-white'}`}
               >
                  <LayoutTemplate size={14} /> Production
               </button>
               <button 
                  onClick={() => setProgressView('DESIGN')} 
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${progressView === 'DESIGN' ? 'bg-lux-gold text-[#16171D] shadow-glow' : 'text-zinc-500 hover:text-white'}`}
               >
                  <PenTool size={14} /> Design
               </button>
            </div>
         </div>
      )}

      {/* DESIGN PROGRESS */}
      {(isDesigner || (isManager && progressView === 'DESIGN')) && (
         <Card className="mb-8 p-6 bg-gradient-to-r from-white/5 to-transparent relative z-10">
            {/* ... (Existing Design Progress Code) ... */}
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-xs font-bold text-lux-gold uppercase tracking-widest">Design Progress</h3>
               <div className="text-[10px] text-zinc-500 font-mono">
                  {Math.round((visibleDesignStages.indexOf(project.designStage || 'Intake') / (visibleDesignStages.length - 1)) * 100)}% Complete
               </div>
            </div>
            
            <div className="overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                <div className="flex items-center justify-between relative min-w-[500px]">
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-zinc-800 -z-0"></div>
                {visibleDesignStages.map((step, idx) => {
                    const currentStageIdx = visibleDesignStages.indexOf(project.designStage || 'Intake');
                    const isCompleted = idx <= currentStageIdx;
                    const isCurrent = idx === currentStageIdx;

                    return (
                        <div key={step} className="relative z-10 flex flex-col items-center group cursor-pointer" onClick={() => handleDesignStageUpdate(step)}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-xl backdrop-blur-md ${isCompleted ? 'bg-lux-gold border-lux-gold text-black shadow-glow' : 'bg-[#16171D] border-zinc-700 text-zinc-500 group-hover:border-lux-gold/50'}`}>
                            {isCompleted ? <Check size={16} strokeWidth={3} /> : <span className="text-[10px] font-bold">{idx + 1}</span>}
                            </div>
                            <span className={`text-[10px] font-bold mt-2 uppercase tracking-wide transition-colors px-2 py-1 rounded-lg text-center whitespace-nowrap ${isCurrent ? 'text-lux-black bg-lux-gold shadow-glow' : 'text-zinc-600 group-hover:text-zinc-400'}`}>{step}</span>
                        </div>
                    );
                })}
                </div>
            </div>

            {/* Casting Action Card */}
            {(project.designStage === 'Approved' || project.designStage === 'Casting Sent' || project.designStage === 'Casting Received (Issue)' || project.designStage === 'Recasting Sent') && (
                <div className="mt-4 p-4 bg-[#16171D] border border-zinc-700 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-lux-gold/10 p-2 rounded-lg text-lux-gold"><Box size={24}/></div>
                        <div>
                            <div className="text-sm font-bold text-white">Casting Operations</div>
                            <div className="text-xs text-zinc-500">Current Cycle: #{project.castingEvents?.length ? project.castingEvents.length + ((project.designStage === 'Casting Sent' || project.designStage === 'Recasting Sent') ? 0 : 1) : 1}</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {project.designStage === 'Approved' && <Button size="sm" onClick={() => handleDesignStageUpdate('Casting Sent')}>Send to Casting</Button>}
                        {(project.designStage === 'Casting Sent' || project.designStage === 'Recasting Sent') && <Button size="sm" onClick={() => setIsCastingReceive(true)}>Receive Casting</Button>}
                        {project.designStage === 'Casting Received (Issue)' && <Button size="sm" onClick={handleSendRecast} variant="danger">Send for Recasting</Button>}
                    </div>
                </div>
            )}
         </Card>
      )}

      {/* PRODUCTION PROGRESS - ADAPTIVE */}
      {(!isDesigner && (!isManager || progressView === 'PRODUCTION')) && (
        <div data-tour="project-stage-control" className="mb-10 relative z-10">
            {isLocked && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center text-center rounded-2xl border border-zinc-800">
                    {project.status === ProjectStatus.ACTIVE ? (
                        <>
                            <AlertTriangle className="text-amber-500 mb-2" size={32} />
                            <h3 className="text-lg font-bold text-white">Production Locked</h3>
                            <p className="text-sm text-zinc-400">Wait for casting approval to unlock.</p>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="text-emerald-500 mb-2" size={32} />
                            <h3 className="text-lg font-bold text-white">Production Completed</h3>
                            <p className="text-sm text-zinc-400">Project is in {project.status} state.</p>
                        </>
                    )}
                </div>
            )}

            <div className="md:hidden bg-[#1F2128] border border-white/10 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Layers size={80} className="text-white"/></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Current Stage</span>
                        <Badge color="amber" >{Math.round(currentPercent)}% Done</Badge>
                    </div>
                    {/* Added break-words to handle long stage names on mobile */}
                    <div className="text-2xl font-bold text-white mb-6 font-serif tracking-tight break-words">{project.currentStageName || 'Intake'}</div>
                    <Button 
                        onClick={() => setShowStageSelector(true)} 
                        className="w-full h-14 text-base font-bold shadow-glow"
                        icon={<ArrowRightLeft size={18}/>}
                        disabled={isLocked}
                    >
                        Change Stage
                    </Button>
                </div>
            </div>

            <div className="hidden md:block select-none px-2 relative z-0 touch-none py-4">
                <div className="relative h-16 flex items-center group">
                    <div className="absolute -top-6 left-0 right-0 flex justify-between px-1 pointer-events-none">
                        <span className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">Start</span>
                        <span className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">Completion</span>
                    </div>

                    <div className="absolute left-0 right-0 h-4 bg-[#1F2128]/60 backdrop-blur-md rounded-full border border-white/5 shadow-inner"></div>
                    <div 
                        className="absolute left-0 h-4 bg-gradient-to-r from-lux-gold/60 to-lux-gold rounded-full shadow-[0_0_20px_rgba(245,194,73,0.3)] transition-all duration-300 ease-out" 
                        style={{ width: `${currentPercent}%` }}
                    ></div>

                    {stages.map((s, index) => {
                    const isActive = currentPercent >= s.percentValue;
                    return (
                        <div 
                        key={s.id} 
                        className={`absolute w-4 h-4 rounded-full border-[3px] transform -translate-x-1/2 transition-all duration-300 z-10 cursor-pointer group/dot ${
                            isActive ? 'bg-[#16171D] border-lux-gold scale-125 shadow-glow' : 'bg-[#16171D] border-zinc-700 hover:border-lux-gold/50'
                        }`}
                        style={{ left: `${s.percentValue}%` }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if(!isLocked) handleDesktopStageClick(s);
                        }}
                        >
                            <div className="absolute -inset-2 rounded-full bg-transparent"></div>
                            {/* Staggered Labels to avoid overlap */}
                            <div className={`
                                absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded bg-[#1F2128] border border-zinc-800 text-[10px] font-bold transition-all z-20 
                                ${index % 2 === 0 ? '-bottom-10' : '-top-10'}
                                ${isActive ? 'text-white opacity-100 border-lux-gold/30' : 'text-zinc-600 opacity-0 group-hover/dot:opacity-100'}
                            `}>
                                {s.name}
                            </div>
                        </div>
                    );
                    })}
                </div>
            </div>
        </div>
      )}

      {/* iOS STYLE SEGMENTED CONTROL */}
      <div data-tour="project-tabs" className="mb-8 relative z-10">
          <SegmentedControl 
             options={[
                 { label: 'Diamond Bags', value: 'bags' },
                 { label: 'Design & Logs', value: 'design' },
                 { label: 'Gallery', value: 'photos' }
             ]}
             value={activeTab}
             onChange={(val) => setActiveTab(val)}
          />
      </div>

      {/* ... (Existing Tabs Content) ... */}
      {/* TAB CONTENT: BAGS */}
      {activeTab === 'bags' && (
          <div className="space-y-6 animate-enter">
             {cost && isManager && (
                 <div className="mb-2">
                    {/* TOTAL COST TRIGGER (HERO) */}
                    <div 
                        className={`
                            w-full p-5 rounded-3xl border cursor-pointer transition-all duration-300 relative overflow-hidden group
                            ${showFinancials 
                                ? 'bg-[#1F2128] border-lux-gold rounded-b-none border-b-0' 
                                : 'bg-[#1F2128]/50 border-zinc-800 hover:border-lux-gold hover:bg-[#1F2128]'
                            }
                        `}
                        onClick={() => setShowFinancials(!showFinancials)}
                    >
                        {/* Ambient Glow for Trigger */}
                        {showFinancials && <div className="absolute top-0 right-0 w-64 h-64 bg-lux-gold/5 rounded-full blur-3xl -z-0 pointer-events-none"></div>}

                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${showFinancials ? 'bg-lux-gold text-black shadow-glow' : 'bg-black text-lux-gold border border-zinc-800'}`}>
                                    <Coins size={24} strokeWidth={1.5} />
                                </div>
                                <div>
                                    <div className={`text-xs font-bold uppercase tracking-widest mb-1 transition-colors ${showFinancials ? 'text-lux-gold' : 'text-zinc-500 group-hover:text-zinc-400'}`}>Total Estimated Cost</div>
                                    <div className={`text-3xl font-bold font-mono tracking-tight transition-colors ${showFinancials ? 'text-white' : 'text-lux-gold'}`}>${cost.totalProjectCostCad.toFixed(2)}</div>
                                </div>
                            </div>
                            <ChevronDown className={`w-6 h-6 transition-transform duration-300 ${showFinancials ? 'rotate-180 text-lux-gold' : 'text-zinc-600 group-hover:text-white'}`} />
                        </div>
                    </div>

                    {/* EXPANDED CONTENT */}
                    {showFinancials && (
                        <div className="bg-[#1F2128] border border-t-0 border-lux-gold rounded-b-3xl p-6 md:p-8 animate-in slide-in-from-top-2 fade-in duration-200 shadow-2xl relative overflow-hidden">
                             {/* Background Glow Extension */}
                             <div className="absolute top-0 right-0 w-96 h-96 bg-lux-gold/5 rounded-full blur-3xl pointer-events-none"></div>

                             <div className="relative z-10">
                                 {/* MOVED KPIs GRID */}
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-8">
                                     <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                                         <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Net Carats</div>
                                         <div className="text-xl font-bold text-white font-mono">{cost.totalCaratsUsed.toFixed(3)} <span className="text-sm text-zinc-600 font-sans font-medium">ct</span></div>
                                     </div>
                                     <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                                         <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Net Pieces</div>
                                         <div className="text-xl font-bold text-white font-mono">{cost.breakdown.reduce((acc, b) => acc + b.usedPcs, 0)} <span className="text-sm text-zinc-600 font-sans font-medium">pcs</span></div>
                                     </div>
                                     <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                                         <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Diamonds Cost</div>
                                         <div className="text-xl font-bold text-white font-mono">${cost.totalDiamondCostCad.toFixed(2)}</div>
                                     </div>
                                 </div>

                                 {/* SEPARATOR */}
                                 <div className="h-px bg-white/10 w-full mb-8"></div>

                                 {/* DETAILED FINANCIALS */}
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                     {/* LEFT: GOLD CALCULATION */}
                                     <div>
                                         <div className="bg-black/20 p-5 rounded-2xl border border-white/5 mb-4">
                                             <div className="text-xs font-bold text-zinc-500 uppercase mb-2 tracking-wide">Estimated Gold Cost</div>
                                             <div className="text-2xl font-mono text-white font-bold mb-2">${cost?.goldCost.toFixed(2)}</div>
                                             <div className="text-[11px] text-zinc-400 flex flex-wrap gap-2">
                                                 <span className="bg-white/5 px-2 py-0.5 rounded">{project?.goldType} {project?.goldPurity}</span>
                                                 <span>•</span>
                                                 <span>{cost?.finalWeightG.toFixed(2)}g</span>
                                             </div>
                                         </div>
                                         <div className="text-[10px] text-zinc-500 pl-1">
                                             * Gold Price is locked upon completion. Currently showing live estimate.
                                         </div>
                                     </div>

                                     {/* RIGHT: LABOUR & SETTER */}
                                     <div className="space-y-5">
                                         <div>
                                             <label className="text-xs font-bold text-zinc-500 uppercase block mb-2 tracking-wide">Design / Jeweller Cost (CAD)</label>
                                             <div className="flex gap-2 mb-2">
                                                 <Input 
                                                    type="number" 
                                                    value={labourCostInput} 
                                                    onChange={e => setLabourCostInput(e.target.value)} 
                                                    placeholder="0.00"
                                                    className="font-mono text-lg bg-black/40 border-zinc-700 focus:border-lux-gold"
                                                 />
                                                 <Button onClick={handleSaveLabourCost} loading={isSavingCost} size="md" className="px-6">Save</Button>
                                             </div>
                                             <Input 
                                                value={labourCostNote} 
                                                onChange={e => setLabourCostNote(e.target.value)} 
                                                placeholder="Note (e.g. Complex halo)"
                                                className="text-xs bg-transparent border-transparent border-b-zinc-800 rounded-none px-0 py-1 focus:bg-transparent focus:border-b-lux-gold focus:ring-0 placeholder:text-zinc-700"
                                             />
                                         </div>
                                         
                                         {/* Automated Setter Fee Display */}
                                         <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex justify-between items-center">
                                             <div>
                                                 <div className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Setter Cost (Auto)</div>
                                                 <div className="text-[10px] text-zinc-500 mt-1">
                                                     {cost.breakdown.reduce((acc, b) => acc + b.usedPcs, 0)} stones × ${store.getSettings().setterCostPerSetPieceCad}
                                                 </div>
                                             </div>
                                             <div className="text-white font-mono font-bold text-lg">
                                                 ${cost.automatedSetterCost.toFixed(2)}
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    )}
                 </div>
             )}

             {/* Bags & Requests Lists ... */}
             <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Issued Bags</h3>
                </div>
                {bags.length === 0 ? <p className="text-zinc-500 italic p-4 text-center border border-dashed border-zinc-800 rounded-xl">No bags issued.</p> : 
                   bags.map(b => (
                      <Card key={b.id} className="p-4 flex flex-col gap-4">
                         {/* Replaced complex row flex with simpler stack on mobile to prevent overlap */}
                         <div className="flex flex-row justify-between items-start gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-black border border-zinc-800 flex items-center justify-center shrink-0">
                                   <Package className="text-lux-gold" size={20} />
                                </div>
                                <div>
                                   <div className="font-bold text-white text-base">Bag #{b.bagNumber}</div>
                                   <div className="text-xs text-zinc-500">
                                      {formatDateTime(b.issuedAt)}
                                   </div>
                                </div>
                            </div>
                            <div className="shrink-0">
                                <StatusPill status={b.status} />
                            </div>
                         </div>
                         
                         <div className="flex flex-wrap gap-2">
                            {b.items.map((item, i) => {
                               const spec = specs.find(s => s.id === item.specId);
                               return (
                                  <div key={i} className="bg-zinc-900 px-2 py-1.5 rounded text-xs text-zinc-300 border border-zinc-800 flex items-center gap-2">
                                     <span className="opacity-70">{spec?.label}:</span> <span className="font-bold text-white">{item.issuedPcs}</span>
                                  </div>
                                );
                            })}
                         </div>
                         
                         <div className="text-xs text-zinc-600 border-t border-zinc-800/50 pt-2 mt-1">
                            Issued to {store.getUser(b.issuedToId)?.name}
                         </div>
                      </Card>
                   ))
                }
             </div>

             <div className="space-y-3">
                <div className="flex justify-between items-end px-1 pt-4">
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Pending Requests</h3>
                </div>
                {openRequests.length === 0 ? <p className="text-zinc-500 italic p-4 text-center border border-dashed border-zinc-800 rounded-xl">No active requests.</p> : 
                   openRequests.map(r => (
                      <div key={r.id} className="bg-[#1F2128] border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                         <div>
                            <div className="font-bold text-white text-sm mb-1">Request from {store.getUser(r.requestedById)?.name}</div>
                            <div className="text-xs text-zinc-500">{formatDateTime(r.requestedAt)}</div>
                         </div>
                         <div className="text-right">
                            {r.lines.map((l, i) => {
                                const spec = specs.find(s => s.id === l.specId);
                                return <div key={i} className="text-xs text-zinc-300">{l.requestedPcs} x {spec?.label}</div>
                            })}
                         </div>
                         <StatusPill status={r.status} />
                      </div>
                   ))
                }
             </div>
          </div>
      )}

      {/* TAB CONTENT: DESIGN & LOGS */}
      {activeTab === 'design' && (
          <div className="space-y-6 animate-enter">
              <Card className="p-5">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><LayoutTemplate size={18}/> Services</h3>
                  <div className="space-y-2">
                     {project.services && project.services.length > 0 ? project.services.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
                           <span className="font-medium text-zinc-300">{s.name}</span>
                           <button 
                             onClick={() => handleServiceStatusToggle(s.name)}
                             className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${s.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border-green-500/20' : s.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}
                           >
                              {s.status.replace('_', ' ')}
                           </button>
                        </div>
                     )) : <p className="text-zinc-500 text-sm">No services listed.</p>}
                  </div>
              </Card>

              <div className="bg-[#1F2128] border border-zinc-800 rounded-2xl p-4">
                  {!isAddingNote ? (
                     <button onClick={() => setIsAddingNote(true)} className="w-full text-left text-zinc-500 text-sm p-2 hover:text-zinc-300 transition-colors">Write a note, attach design...</button>
                  ) : (
                     <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <textarea 
                          className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white text-sm focus:border-lux-gold focus:ring-0 min-h-[100px]"
                          placeholder="Type your note..."
                          value={newNote}
                          onChange={e => setNewNote(e.target.value)}
                          autoFocus
                        />
                        <div className="flex justify-between items-center">
                           <div className="flex gap-2">
                              <button onClick={() => document.getElementById('note-upload')?.click()} className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800"><Paperclip size={18}/></button>
                              <input type="file" id="note-upload" className="hidden" accept="image/*" onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 if(file) {
                                     const reader = new FileReader();
                                     reader.onloadend = () => setNewNoteImage(reader.result as string);
                                     reader.readAsDataURL(file);
                                 }
                              }} />
                           </div>
                           <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setIsAddingNote(false)}>Cancel</Button>
                              <Button size="sm" onClick={submitNote} disabled={!newNote && !newNoteImage} loading={loadingAction} icon={<Send size={14}/>}>Post</Button>
                           </div>
                        </div>
                        {newNoteImage && (
                           <div className="relative inline-block mt-2">
                              <img src={newNoteImage} className="h-20 rounded-lg border border-zinc-700" />
                              <button onClick={() => setNewNoteImage(undefined)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X size={12}/></button>
                           </div>
                        )}
                     </div>
                  )}
              </div>

              <div className="space-y-6 relative pl-4">
                 <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-800"></div>
                 {project.designLogs?.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((log, i) => (
                    <div key={i} className="relative pl-6">
                       <div className="absolute left-0 top-1.5 w-8 h-8 rounded-full bg-[#16171D] border border-zinc-700 flex items-center justify-center z-10">
                          {log.type === 'DESIGN' ? <PenTool size={14} className="text-lux-gold"/> : <StickyNote size={14} className="text-zinc-500"/>}
                       </div>
                       <div className="bg-[#1F2128] border border-zinc-800 rounded-xl p-4">
                          <div className="flex justify-between items-start mb-2">
                             <div>
                                <span className="text-xs font-bold text-white mr-2">{store.getUser(log.createdById)?.name}</span>
                                <span className="text-[10px] text-zinc-500">{formatDateTime(log.createdAt)}</span>
                             </div>
                             {log.type === 'DESIGN' && <Badge color="blue">Design Update</Badge>}
                          </div>
                          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{log.note}</p>
                          {log.attachment && (
                             <img src={log.attachment} className="mt-3 rounded-lg max-h-60 border border-zinc-700 cursor-pointer" onClick={() => window.open(log.attachment, '_blank')} />
                          )}
                       </div>
                    </div>
                 ))}
                 {(!project.designLogs || project.designLogs.length === 0) && (
                    <p className="text-zinc-500 text-sm italic pl-8">No design notes yet.</p>
                 )}
              </div>
          </div>
      )}

      {/* TAB CONTENT: PHOTOS */}
      {activeTab === 'photos' && (
          <div className="space-y-6 animate-enter">
              <div className="flex justify-between items-center">
                  <h3 className="font-bold text-white">Project Gallery</h3>
                  <Button size="sm" onClick={() => setIsUploadingPhoto(true)} icon={<Camera size={16}/>}>Add Photo</Button>
              </div>
              
              {isUploadingPhoto && (
                  <Card className="p-4 mb-4 animate-in fade-in slide-in-from-top-4">
                      <ImageUpload onChange={handleProjectPhotoUpload} label="Upload New Photo" />
                      <div className="mt-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setIsUploadingPhoto(false)}>Cancel</Button>
                      </div>
                  </Card>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {project.projectPhotos?.map((photo, idx) => (
                      <div key={idx} className="aspect-square rounded-2xl overflow-hidden relative group border border-zinc-800 bg-black shadow-lg cursor-pointer" onClick={() => setLightboxIndex(idx)}>
                          <img src={photo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button onClick={(e) => {e.stopPropagation(); setLightboxIndex(idx)}} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white"><ZoomIn size={18}/></button>
                              <button onClick={(e) => {e.stopPropagation(); initiateDeletePhoto(idx)}} className="p-2 bg-red-500/20 rounded-full hover:bg-red-500 text-red-200"><Trash2 size={18}/></button>
                          </div>
                      </div>
                  ))}
                  {(!project.projectPhotos || project.projectPhotos.length === 0) && (
                      <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl">
                          <ImageIcon size={32} className="mx-auto mb-2 opacity-50"/>
                          <p>No photos added yet</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && project.projectPhotos && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setLightboxIndex(null)}>
           <button className="absolute top-4 right-4 text-white/50 hover:text-white"><X size={32}/></button>
           <img src={project.projectPhotos[lightboxIndex]} className="max-h-full max-w-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Delete Photo Modal */}
      {isDeletingPhoto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 bg-[#1F2128]">
              <h3 className="text-white font-bold text-lg mb-2">Delete Photo?</h3>
              <p className="text-zinc-400 text-sm mb-6">This cannot be undone.</p>
              <div className="flex gap-3">
                 <Button variant="secondary" onClick={() => setIsDeletingPhoto(false)} className="flex-1">Cancel</Button>
                 <Button variant="danger" onClick={confirmDeletePhoto} className="flex-1">Delete</Button>
              </div>
           </Card>
        </div>
      )}

      {/* Request Modal */}
      {isRequesting && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <Card className="w-full max-w-lg p-6 bg-[#1F2128] max-h-[85vh] flex flex-col">
              <h3 className="font-bold text-white text-lg mb-4">Request Diamonds</h3>
              <div className="flex-1 overflow-y-auto mb-4">
                 <FastEntryGrid specs={specs} onLinesChange={setRequestLines} mode="PCS" />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                 <Button variant="secondary" onClick={() => setIsRequesting(false)}>Cancel</Button>
                 <Button onClick={submitRequest} loading={loadingAction}>Send Request</Button>
              </div>
           </Card>
        </div>
      )}

      {/* Return Modal */}
      {isReturning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 bg-[#1F2128]">
              <h3 className="font-bold text-white text-lg mb-4">Return Bag</h3>
              <Input 
                 ref={returnInputRef}
                 label="Bag Number" 
                 value={returnBagNum} 
                 onChange={e => setReturnBagNum(e.target.value)} 
                 placeholder="e.g. 1005"
                 className="mb-4 font-mono text-center text-xl"
              />
              <div className="mb-6">
                 <ImageUpload label="Bag Photo" required value={returnPhoto} onChange={setReturnPhoto} />
              </div>
              <div className="flex justify-end gap-3">
                 <Button variant="secondary" onClick={() => setIsReturning(false)}>Cancel</Button>
                 <Button onClick={submitReturn} loading={loadingAction} disabled={!returnBagNum || !returnPhoto}>Submit Return</Button>
              </div>
           </Card>
        </div>
      )}

      {/* Assign Modal */}
      {isAssigning && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <Card className="w-full max-w-md p-6 bg-[#1F2128]">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-white text-lg">Assign Team</h3>
                   <button onClick={() => setIsAssigning(false)} className="text-zinc-500 hover:text-white"><X size={20}/></button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-[60vh] overflow-y-auto">
                   {store.getUsers().filter(u => u.active && u.role !== Role.MANAGER).map(u => {
                      const isAssigned = project.assignments.some(a => a.userId === u.id && a.active);
                      return (
                         <button 
                            key={u.id}
                            onClick={() => handleAssign(u.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${isAssigned ? 'bg-lux-gold/10 border-lux-gold text-lux-gold' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                         >
                            <SetterAvatar name={u.name} color={u.setterColor} size="sm"/>
                            <span className="text-xs font-bold">{u.name}</span>
                         </button>
                      );
                   })}
                </div>
             </Card>
          </div>
      )}

      {/* Handoff Modal */}
      {isHandoff && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <Card className="w-full max-w-sm p-6 bg-[#1F2128]">
                <h3 className="font-bold text-white text-lg mb-4">Handoff Project</h3>
                <div className="space-y-4 mb-6">
                   <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Handoff To</label>
                      <select 
                         className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white focus:ring-lux-gold"
                         value={handoffTarget}
                         onChange={e => setHandoffTarget(e.target.value)}
                      >
                         <option value="">Select Team Member...</option>
                         {store.getUsers().filter(u => u.active && u.role !== Role.MANAGER && u.id !== currentUser.id).map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                         ))}
                      </select>
                   </div>
                   
                   <Input 
                      label="Current Weight (g) *" 
                      type="number" 
                      step="0.01" 
                      value={handoffWeight} 
                      onChange={e => setHandoffWeight(e.target.value)} 
                      placeholder="0.00"
                   />

                   <Input 
                      label="Note / Reason" 
                      value={handoffReason} 
                      onChange={e => setHandoffReason(e.target.value)} 
                      placeholder="e.g. Ready for setting"
                   />
                </div>
                <div className="flex justify-end gap-3">
                   <Button variant="secondary" onClick={() => setIsHandoff(false)}>Cancel</Button>
                   <Button onClick={submitHandoff} loading={loadingAction} disabled={!handoffTarget || !handoffWeight}>Transfer</Button>
                </div>
             </Card>
          </div>
      )}

      {/* Broken Modal */}
      {isBroken && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <Card className="w-full max-w-sm p-6 bg-[#1F2128]">
                <div className="flex items-center gap-2 mb-4 text-red-500">
                   <AlertOctagon size={24}/>
                   <h3 className="font-bold text-white text-lg">Log Breakage</h3>
                </div>
                
                <div className="space-y-4 mb-6">
                   <Input 
                      label="Total Weight (Ct) *" 
                      type="number" 
                      step="0.001" 
                      value={brokenCt} 
                      onChange={e => setBrokenCt(e.target.value)} 
                      placeholder="0.000"
                      className="font-mono text-lg"
                      autoFocus
                   />
                   
                   <div className="grid grid-cols-2 gap-4">
                      <Input 
                         label="Pieces (Opt)" 
                         type="number" 
                         value={brokenPcs} 
                         onChange={e => setBrokenPcs(e.target.value)} 
                         placeholder="Qty"
                      />
                      <div>
                         <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Spec (Opt)</label>
                         <select 
                            className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white text-sm focus:ring-lux-gold"
                            value={brokenSpecId}
                            onChange={e => setBrokenSpecId(e.target.value)}
                         >
                            <option value="">Mixed/Unknown</option>
                            {specs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                         </select>
                      </div>
                   </div>

                   <Input 
                      label="Reason *" 
                      value={brokenReason} 
                      onChange={e => setBrokenReason(e.target.value)} 
                      placeholder="How did it break?"
                   />
                </div>

                <div className="flex justify-end gap-3">
                   <Button variant="secondary" onClick={() => setIsBroken(false)}>Cancel</Button>
                   <Button variant="danger" onClick={submitBreakage} loading={loadingAction}>Confirm Log</Button>
                </div>
             </Card>
          </div>
      )}
      
      {/* Progress Confirmation Modal - UPDATED for COMPLETE Logic */}
      {isConfirmingProgress && pendingStage && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center p-4">
              <Card className="w-full max-w-sm p-6 bg-[#1F2128] animate-in slide-in-from-bottom-4 zoom-in-95">
                  <h3 className="font-bold text-white text-lg mb-2">
                      {pendingStage.name === 'Complete' ? 'Move to Review?' : 'Update Stage?'}
                  </h3>
                  <p className="text-zinc-400 text-sm mb-4">
                      {pendingStage.name === 'Complete' 
                        ? 'This marks production finished and moves the project to Review while we wait for pickup.' 
                        : <>Moving to <span className="text-lux-gold font-bold">{pendingStage.name}</span></>
                      }
                  </p>
                  
                  <div className="mb-6">
                      <Input 
                         label="Current Item Weight (g) *" 
                         type="number" 
                         step="0.01" 
                         value={stageWeight} 
                         onChange={e => setStageWeight(e.target.value)} 
                         placeholder="0.00"
                         autoFocus
                         className="text-center font-mono text-xl"
                      />
                  </div>

                  <div className="space-y-3">
                      {pendingStage.name === 'Complete' ? (
                          <Button onClick={() => handleConfirmStageUpdate(false)} className="w-full bg-lux-gold text-black hover:bg-white">
                              Confirm & Move to Review
                          </Button>
                      ) : (
                          <>
                            <Button onClick={() => handleConfirmStageUpdate(false)} className="w-full">Update Only</Button>
                            <Button onClick={() => handleConfirmStageUpdate(true)} variant="secondary" className="w-full" icon={<ArrowRightLeft size={16}/>}>Update & Handoff</Button>
                          </>
                      )}
                      <button onClick={() => { setIsConfirmingProgress(false); setPendingStage(null); setStageWeight(''); }} className="w-full py-2 text-zinc-500 text-sm hover:text-white">Cancel</button>
                  </div>
              </Card>
          </div>
      )}
      
      {/* Stage Selector (Mobile) */}
      {showStageSelector && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center">
              <div className="bg-[#1F2128] w-full md:w-96 md:rounded-3xl rounded-t-3xl p-6 animate-in slide-in-from-bottom-10 max-h-[80vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-white text-lg">Select Stage</h3>
                      <button onClick={() => setShowStageSelector(false)} className="p-2 bg-zinc-800 rounded-full"><X size={16}/></button>
                  </div>
                  <div className="space-y-2">
                      {stages.map(s => (
                          <button 
                             key={s.id}
                             disabled={project.currentStageName === s.name}
                             onClick={() => handleStageSelection(s)}
                             className={`w-full p-4 rounded-2xl text-left font-bold transition-all flex justify-between items-center border ${project.currentStageName === s.name ? 'bg-lux-gold text-black border-lux-gold' : 'bg-zinc-900 text-zinc-400 border-transparent hover:bg-zinc-800'}`}
                          >
                             <span>{s.name}</span>
                             <span className="text-xs font-mono opacity-60">{s.percentValue}%</span>
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Casting Receive Modal */}
      {isCastingReceive && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
              <Card className="w-full max-w-sm p-6 bg-[#1F2128] animate-in zoom-in-95">
                  <div className="flex items-center gap-3 mb-4">
                      <Box className="text-lux-gold" size={24}/>
                      <h3 className="font-bold text-white text-lg">Receive Casting</h3>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Condition</label>
                          <div className="grid grid-cols-3 gap-2">
                              {['CORRECT', 'DAMAGED', 'INCORRECT'].map((c: any) => (
                                  <button 
                                     key={c}
                                     onClick={() => setCastingCondition(c)}
                                     className={`p-2 rounded-lg text-[10px] font-bold border transition-all ${castingCondition === c ? (c === 'CORRECT' ? 'bg-green-500/20 text-green-400 border-green-500' : 'bg-red-500/20 text-red-400 border-red-500') : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}
                                  >
                                      {c}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <Input 
                         label="Received Weight (g)" 
                         type="number" 
                         step="0.01"
                         value={castingWeight} 
                         onChange={e => setCastingWeight(e.target.value)} 
                         placeholder="0.00"
                      />

                      <Input 
                         label="Notes" 
                         value={castingNotes} 
                         onChange={e => setCastingNotes(e.target.value)} 
                         placeholder="Any comments..."
                      />
                  </div>

                  <div className="flex justify-end gap-3">
                      <Button variant="ghost" onClick={() => setIsCastingReceive(false)}>Cancel</Button>
                      <Button onClick={handleReceiveCasting}>Confirm Receipt</Button>
                  </div>
              </Card>
          </div>
      )}
    </div>
  );
};

export default ProjectDetail;