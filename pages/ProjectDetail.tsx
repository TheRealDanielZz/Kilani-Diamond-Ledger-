
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { store } from '../services/store';
import { Project, Role, DiamondBag, IssueRequest, DiamondSpec, ProjectCostSummary, ProgressStage, ProjectStatus, BagStatus, InventoryMovementType, ProjectNote, RepairDetailsV2, RepairStatus, EvidenceImage } from '../types';
import { Card, Button, StatusPill, SetterAvatar, Badge, Input, Spinner, ProgressBar, SegmentedControl } from '../components/UI';
import { ImageUpload, compressImage } from '../components/ImageUpload';
import { ArrowLeft, PackagePlus, RotateCcw, Calculator, Clock, Package, CheckCircle2, ChevronDown, UserPlus, ArrowRightLeft, GripHorizontal, AlertOctagon, AlertCircle, StickyNote, Camera, FileText, Send, Paperclip, Check, LayoutTemplate, PenTool, X, Trash2, ZoomIn, Layers, Loader2, AlertTriangle, Scale, RefreshCw, Box, ChevronRight, Image as ImageIcon, Coins, Truck, Calendar, UserCheck, Edit2 } from 'lucide-react';
import { useToast } from '../App';
import { FastEntryGrid } from '../components/FastEntryGrid';

interface Props { 
  currentUser: any; 
  projectId?: string;
}

const moneyInputValue = (value?: number) => value === undefined || value === 0 ? '' : String(value);
const parseMoneyInput = (value: string) => value === '' ? undefined : Math.max(0, Number(value) || 0);

const ProjectDetail: React.FC<Props> = ({ currentUser, projectId: propProjectId }) => {
  const params = useParams();
  const id = propProjectId || params.id;
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
  const [activeTab, setActiveTab] = useState<'bags' | 'repair' | 'design' | 'photos'>('bags');
  const [progressView, setProgressView] = useState<'PRODUCTION' | 'DESIGN'>('DESIGN'); 
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
  const [requestOperationId, setRequestOperationId] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [returnOperationId, setReturnOperationId] = useState('');
  const [returnBagNum, setReturnBagNum] = useState('');
  const [returnPhoto, setReturnPhoto] = useState<string | undefined>(undefined);
  const [returnPhotoSource, setReturnPhotoSource] = useState<'Camera' | 'Device Gallery' | undefined>(undefined);
  const [returnLines, setReturnLines] = useState<any[]>([]);
  const [returnNotes, setReturnNotes] = useState('');
  
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
  const [isCastingSend, setIsCastingSend] = useState(false);
  const [isCastingReceive, setIsCastingReceive] = useState(false);
  const [castingCondition, setCastingCondition] = useState<'CORRECT' | 'DAMAGED' | 'INCORRECT'>('CORRECT');
  const [castingWeight, setCastingWeight] = useState('');
  const [castingNotes, setCastingNotes] = useState('');
  const [selectedCastingComponents, setSelectedCastingComponents] = useState<string[]>([]);
  const [castingComponentWeights, setCastingComponentWeights] = useState<Record<string, string>>({});

  // Evidence States
  const [evidenceFilterType, setEvidenceFilterType] = useState<'ALL' | 'ISSUE' | 'RETURN'>('ALL');
  const [evidenceFilterBag, setEvidenceFilterBag] = useState('');
  const [evidenceFilterUploader, setEvidenceFilterUploader] = useState('ALL');
  const [evidenceFilterDateFrom, setEvidenceFilterDateFrom] = useState('');
  const [evidenceFilterDateTo, setEvidenceFilterDateTo] = useState('');
  const [evidenceLimit, setEvidenceLimit] = useState(8);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceImage | null>(null);
  const [isCorrectingEvidence, setIsCorrectingEvidence] = useState(false);
  const [correctionPhoto, setCorrectionPhoto] = useState<string | undefined>(undefined);
  const [correctionPhotoSource, setCorrectionPhotoSource] = useState<'Camera' | 'Device Gallery' | undefined>(undefined);
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number | null>(null);

  // Slider State
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [sliderPercent, setSliderPercent] = useState(0);

  useEffect(() => {
    if (!isDraggingSlider && project) {
        const stage = stages.find(s => s.name === project.currentStageName);
        setSliderPercent(stage ? stage.percentValue : 0);
    }
  }, [project?.currentStageName, isDraggingSlider, stages]);

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
  const [editableRepair, setEditableRepair] = useState<RepairDetailsV2 | null>(null);
  const [isSavingRepair, setIsSavingRepair] = useState(false);

  const [loadingAction, setLoadingAction] = useState(false);
  const [revisionModal, setRevisionModal] = useState<'INSTRUCTIONS' | 'METAL' | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [instructionDraft, setInstructionDraft] = useState('');
  const [metalDraft, setMetalDraft] = useState('Yellow');
  const [purityDraft, setPurityDraft] = useState('14k');
  const [revisionOperationId, setRevisionOperationId] = useState('');
  const [isSavingRevision, setIsSavingRevision] = useState(false);

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
    if (project) {
       const isRep = store.getRepairDetails(project);
       if (isRep) {
          if (activeTab === 'bags') setActiveTab('repair');
       } else if (isDesigner) {
          if (activeTab === 'bags') setActiveTab('design');
          setProgressView('DESIGN');
       }
    }
  }, [isDesigner, project?.id]);

  useEffect(() => {
    if (project) {
        setLabourCostInput(project.labourCostAmount?.toString() || '');
        setLabourCostNote(project.labourCostNote || '');
        const currentRepair = store.getRepairDetails(project);
        setEditableRepair(currentRepair ? JSON.parse(JSON.stringify(currentRepair)) : null);
    }
  }, [project]);

  useEffect(() => {
    if (isReturning && returnInputRef.current) {
      setTimeout(() => returnInputRef.current?.focus(), 100);
    }
  }, [isReturning]);

  useEffect(() => {
    setRequestOperationId(isRequesting ? crypto.randomUUID() : '');
  }, [isRequesting]);

  useEffect(() => {
    setReturnOperationId(isReturning ? crypto.randomUUID() : '');
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

        } catch (e: any) {
            console.error(e);
            showToast(e.message || "Failed to update stage");
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

     const visibleDesignStages = getVisibleDesignStages();
     const currentStageIdx = visibleDesignStages.indexOf(project.designStage || 'Intake');
     const targetStageIdx = visibleDesignStages.indexOf(stage);

     if (stage === 'Casting Sent' && targetStageIdx > currentStageIdx) {
         setIsCastingSend(true);
         return;
     }

     if (stage === 'Recasting Sent' && project.designStage === 'Casting Received (Issue)') {
         setIsCastingSend(true);
         return;
     }

     // Auto-trigger the receive casting modal
     if (stage === 'Ready for Production' && (project.designStage === 'Casting Sent' || project.designStage === 'Recasting Sent')) {
         setIsCastingReceive(true);
         return;
     }

     // Prevent skipping forward for other stages
     if (targetStageIdx > currentStageIdx + 1) {
         alert("Please complete the steps in order. You cannot skip ahead.");
         return;
     }

     if (stage === 'Casting Received (Issue)') return;

     try {
       setProject({ ...project, designStage: stage });
       await store.updateDesignStage(project.id, stage, currentUser.id);
       showToast(`Design Stage: ${stage}`);
     } catch (e: any) {
       showToast(e.message || "Failed to update design stage");
     }
  };

  const handleConfirmSendToCasting = async () => {
      setLoadingAction(true);
      try {
        await store.sendToCasting(project!.id, currentUser.id, selectedCastingComponents.length > 0 ? selectedCastingComponents : undefined);
        const newStage = project!.designStage === 'Casting Received (Issue)' ? 'Recasting Sent' : 'Casting Sent';
        setProject({ ...project!, designStage: newStage });
        await store.updateDesignStage(project!.id, newStage, currentUser.id);
        setIsCastingSend(false);
        setSelectedCastingComponents([]);
        showToast(newStage === 'Recasting Sent' ? "Sent for Recasting" : "Sent to Casting");
      } catch (e: any) {
        console.error(e);
        showToast(e.message || "Failed to send to casting");
      } finally {
        setLoadingAction(false);
      }
  };

  const handleReceiveCasting = async () => {
      const lastCastingEvent = project?.castingEvents?.[(project.castingEvents?.length || 1) - 1];
      const receivedComponentIds = lastCastingEvent?.goldComponentIds || [];
      const componentsToReceive = receivedComponentIds.length === 0 
          ? (project?.goldComponents || []) 
          : (project?.goldComponents?.filter(c => receivedComponentIds.includes(c.id)) || []);

      const isMultiComponent = componentsToReceive.length > 1;

      if (castingCondition === 'CORRECT') {
          if (isMultiComponent) {
              const hasEmptyWeights = componentsToReceive.some(c => !castingComponentWeights[c.id] || parseFloat(castingComponentWeights[c.id]) <= 0);
              if (hasEmptyWeights) {
                  alert("Weight is required for all received components.");
                  return;
              }
          } else {
              if (!castingWeight || parseFloat(castingWeight) <= 0) {
                  alert("Weight is required for correct casting.");
                  return;
              }
          }
      }
      
      const parsedWeights: Record<string, number> = {};
      const hasComponents = componentsToReceive.length > 0;
      
      if (hasComponents) {
          componentsToReceive.forEach(c => {
              // If only one component, use castingWeight if castingComponentWeights[c.id] is empty
              const w = castingComponentWeights[c.id] 
                  ? parseFloat(castingComponentWeights[c.id]) 
                  : (!isMultiComponent ? parseFloat(castingWeight) : 0);
              parsedWeights[c.id] = w || 0;
          });
      }

      setLoadingAction(true);
      try {
        await store.receiveCasting(
            project!.id, 
            castingCondition, 
            parseFloat(castingWeight) || 0, 
            castingNotes, 
            currentUser.id,
            hasComponents ? parsedWeights : undefined
        );
        
        setIsCastingReceive(false);
        setCastingCondition('CORRECT');
        setCastingWeight('');
        setCastingNotes('');
        setCastingComponentWeights({});
        
        showToast(castingCondition === 'CORRECT' ? "Casting Approved" : "Casting Issues Logged");
      } catch (e: any) {
        console.error(e);
        showToast(e.message || "Failed to receive casting");
      } finally {
        setLoadingAction(false);
      }
  };

  const handleSendRecast = async () => {
      setIsCastingSend(true);
  };

  const handleServiceStatusToggle = async (serviceName: string) => {
     if (!project || !project.services || !canModifyProject || project.status !== ProjectStatus.ACTIVE) return;
     const current = (project.services as any[]).map(s => typeof s === 'string' ? { name: s, status: 'PENDING' } : s).find(s => s.name === serviceName);
     if (!current) return;

     let nextStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' = 'PENDING';
     if (current.status === 'PENDING') nextStatus = 'IN_PROGRESS';
     else if (current.status === 'IN_PROGRESS') nextStatus = 'COMPLETED';
     else nextStatus = 'PENDING';

     try {
         const updatedServices = (project.services as any[]).map(rawService => {
            const s = typeof rawService === 'string' ? { name: rawService, status: 'PENDING' } : rawService;
            return s.name === serviceName ? { ...s, status: nextStatus } : s;
         });
         setProject({ ...project, services: updatedServices });

         await store.updateServiceStatus(project.id, serviceName, nextStatus, currentUser.id);
     } catch (e: any) {
         showToast(e.message || "Failed to update service status");
     }
  };

  const handleRepairStatusChange = async (status: RepairStatus) => {
    if (!project || !canModifyProject || project.status !== ProjectStatus.ACTIVE) return;
    try {
      await store.updateRepairStatus(project.id, status, currentUser.id);
      showToast(`Repair status: ${status}`);
      if (status === RepairStatus.READY_FOR_PICKUP || status === RepairStatus.COMPLETED || status === RepairStatus.CANCELLED) {
        navigate('/projects');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to update repair status');
    }
  };

  const updateRepairFinancial = (field: keyof RepairDetailsV2['financials'], value: any) => {
    setEditableRepair(prev => prev ? {
      ...prev,
      financials: {
        ...(prev.financials || {}),
        [field]: value
      }
    } : prev);
  };

  const handleSaveRepairDetails = async () => {
    if (!project || !editableRepair || !canEditRepairFinancials) return;
    setIsSavingRepair(true);
    try {
      await store.updateRepairDetails(project.id, editableRepair);
      showToast('Repair details saved');
    } catch (e: any) {
      showToast(e.message || 'Failed to save repair details');
    } finally {
      setIsSavingRepair(false);
    }
  };

  const submitRequest = async () => {
    const valid = requestLines.filter(l => l.pcs > 0);
    if(!valid.length) return;
    const stableOperationId = requestOperationId || crypto.randomUUID();
    if (!requestOperationId) setRequestOperationId(stableOperationId);
    setLoadingAction(true);
    try {
      await store.createRequest({ projectId: project!.id, requestedById: currentUser.id, lines: valid.map(l => ({specId: l.specId, requestedPcs: l.pcs})), jobNumberSnapshot: project!.code }, stableOperationId);
      setIsRequesting(false); 
      showToast("Request Sent");
    } catch(e: any) { 
      console.error("Error sending diamond request:", e);
      const errMsg = e?.details?.message || e?.message || "Failed to send request";
      showToast(errMsg);
    } finally {
      setLoadingAction(false);
    }
  };

  const submitReturn = async () => {
    if(!returnBagNum) {
      showToast("Bag number is required.");
      return;
    }
    const cleanBagNum = returnBagNum.replace(/#/g, '').trim();
    
    // Validate bag against current project
    const issuedBags = store.getBags().filter(b => b.projectId === project?.id && b.status === BagStatus.ISSUED);
    const matchedBag = issuedBags.find(b => b.bagNumber.toLowerCase() === cleanBagNum.toLowerCase());
    
    if (!matchedBag) {
      showToast(`No bag with this number is associated with Project ${project?.code}.`);
      return;
    }

    if(!returnPhoto) return showToast("Return photo required");
    
    const validLines = returnLines.filter(l => l.pcs > 0);
    if(validLines.length === 0) return showToast("Please add at least one item to return");
    const stableOperationId = returnOperationId || crypto.randomUUID();
    if (!returnOperationId) setReturnOperationId(stableOperationId);
    
    setLoadingAction(true);
    try {
      await store.submitBagReturn(
        matchedBag.bagNumber, 
        project!.id,
        currentUser.id, 
        returnPhoto, 
        validLines.map(l => ({specId: l.specId, requestedPcs: l.pcs})),
        project!.code,
        returnNotes,
        returnPhotoSource,
        stableOperationId
      );
      setIsReturning(false); 
      setReturnBagNum(''); 
      setReturnPhoto(undefined);
      setReturnPhotoSource(undefined);
      setReturnLines([]);
      setReturnNotes('');
      showToast("Return Submitted"); 
    } catch(e: any) {
      console.error(e);
      showToast(e.message || "Error submitting return");
    } finally {
      setLoadingAction(false);
    }
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
    if (!canModifyProject || project?.status !== ProjectStatus.ACTIVE) return;
    if(!handoffTarget) return alert("Please select a team member to handoff to.");
    const weightVal = parseFloat(handoffWeight);
    if(!handoffWeight || isNaN(weightVal)) return alert("Valid weight is required for handoff.");

    setLoadingAction(true);
    
    // Optimistic UI Update
    const updatedProject = { ...project! };
    let assignments = [...(updatedProject.assignments || [])];
    const acceptedProfileIds = new Set([currentUser.id, ...(currentUser.legacyProfileIds || [])]);
    
    // Unassign current user
    assignments = assignments.map(a => acceptedProfileIds.has(a.userId) ? { ...a, active: false } : a);
    
    // Assign target user
    const toUserExists = assignments.some(a => a.userId === handoffTarget);
    if (toUserExists) {
       assignments = assignments.map(a => a.userId === handoffTarget ? { ...a, active: true } : a);
    } else {
       assignments.push({ userId: handoffTarget, assignedAt: new Date().toISOString(), active: true });
    }
    
    updatedProject.assignments = assignments;
    setProject(updatedProject);

    try {
      await store.handoffProject(project!.id, currentUser.id, handoffTarget, handoffReason, weightVal);
      setIsHandoff(false); 
      showToast("Project Handed Off"); 
    } catch(e: any) { 
      console.error(e);
      alert("Failed to handoff project: " + (e.message || e));
      // Revert optimistic update on failure
      setProject(store.getProject(project!.id));
    } finally {
      setLoadingAction(false); 
    }
  };

  const submitBreakage = async () => {
    const ctVal = parseFloat(brokenCt);
    const pcsVal = parseInt(brokenPcs) || 0;

    if (!brokenCt || isNaN(ctVal) || ctVal <= 0) return alert("Valid carat weight required.");
    if (!brokenReason) return alert("Note/Reason required.");
    if (!window.confirm("Please confirm that the entered breakage information is correct.")) return;
    
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
        }],
        location: currentUser.location || 'Toronto'
     });
      setIsBroken(false); 
      setBrokenCt(''); 
      setBrokenPcs('');
      setBrokenReason(''); 
      setBrokenSpecId('');
      showToast("Breakage Recorded"); 
    } catch(e: any) { 
      console.error(e);
      showToast(e.message || "Failed to record breakage");
    } finally {
      setLoadingAction(false); 
    }
  };

  // Mention State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewNote(val);
    
    // Check for mention
    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/@(\w*)$/);
    
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null) {
      const users = store.getUsers().filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase()));
      if (users.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((prev) => (prev + 1) % users.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((prev) => (prev - 1 + users.length) % users.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          insertMention(users[mentionIndex].name);
        } else if (e.key === 'Escape') {
          setMentionQuery(null);
        }
      }
    }
  };

  const insertMention = (name: string) => {
    if (!textareaRef.current) return;
    const cursorPosition = textareaRef.current.selectionStart;
    const textBeforeCursor = newNote.slice(0, cursorPosition);
    const textAfterCursor = newNote.slice(cursorPosition);
    
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) {
      const newTextBefore = textBeforeCursor.slice(0, match.index) + `@${name} `;
      setNewNote(newTextBefore + textAfterCursor);
      setMentionQuery(null);
      
      // Set cursor position after the inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newTextBefore.length;
          textareaRef.current.selectionEnd = newTextBefore.length;
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  const submitNote = async () => {
    if ((!newNote && !newNoteImage) || !canModifyProject || project?.status !== ProjectStatus.ACTIVE) return;
    setLoadingAction(true);
    
    const note: any = {
       id: Math.random().toString(36).substr(2,9),
       projectId: project!.id,
       createdById: currentUser.id,
       createdAt: new Date().toISOString(),
       note: newNote,
       type: 'DESIGN' as const
    };
    if (newNoteImage) note.attachment = newNoteImage;
    
    setProject(prev => prev ? {
        ...prev,
        designLogs: [...(prev.designLogs || []), note]
    } : undefined);

    try {
        await store.addProjectNote(note);
        
        if (newNote) {
            const users = store.getUsers();
            const mentionedUsers = users.filter(u => {
                const firstName = u.name.split(' ')[0];
                return newNote.includes(`@${u.name}`) || newNote.includes(`@${firstName}`);
            });
            for (const u of mentionedUsers) {
                if (u.id !== currentUser.id) {
                    store.sendNotification(u.id, 'Mentioned in Note', `${currentUser.name} mentioned you in ${project!.code}`, 'MENTION', `/project/${project!.id}`);
                }
            }
        }

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
    if (base64 && project && canModifyProject && project.status === ProjectStatus.ACTIVE) {
      setIsUploadingPhoto(true);
      try {
        await store.addProjectPhoto(project.id, base64);
        showToast("Photo Added");
      } catch (e: any) {
        console.error(e);
        showToast(e.message || "Failed to upload photo (Storage Full?)");
      } finally {
        setIsUploadingPhoto(false);
      }
    }
  }

  const initiateDeletePhoto = (index: number) => {
     setPhotoToDelete(index);
     setIsDeletingPhoto(true);
  };

  const confirmDeletePhoto = async () => {
     if (photoToDelete === null || !project || !canModifyProject || project.status !== ProjectStatus.ACTIVE) return;
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
          console.error(e);
          showToast(e.message || "Failed to update cost");
      } finally {
          setIsSavingCost(false);
      }
  };

  const openInstructionRevision = () => {
      if (!project) return;
      setInstructionDraft(project.workDetails || '');
      setRevisionReason('');
      setRevisionOperationId(crypto.randomUUID());
      setRevisionModal('INSTRUCTIONS');
  };

  const openMetalRevision = () => {
      if (!project) return;
      setMetalDraft(project.goldType || project.goldComponents?.[0]?.type || 'Yellow');
      setPurityDraft(project.goldPurity || project.goldComponents?.[0]?.purity || '14k');
      setRevisionReason('');
      setRevisionOperationId(crypto.randomUUID());
      setRevisionModal('METAL');
  };

  const handleSaveRevision = async () => {
      if (!project || !revisionModal) return;
      if (!revisionReason.trim()) {
          showToast('A reason is required.');
          return;
      }
      const operationId = revisionOperationId || crypto.randomUUID();
      setRevisionOperationId(operationId);
      if (revisionModal === 'METAL') {
          const currentMetal = project.goldType || project.goldComponents?.[0]?.type || '';
          const currentPurity = project.goldPurity || project.goldComponents?.[0]?.purity || '';
          if (!window.confirm(`Change ${currentMetal} ${currentPurity} to ${metalDraft} ${purityDraft}? This will be recorded permanently in Project History.`)) return;
      }
      setIsSavingRevision(true);
      try {
          if (revisionModal === 'INSTRUCTIONS') {
              await store.reviseProjectDetails({
                  operationId,
                  projectId: project.id,
                  kind: 'INSTRUCTIONS',
                  reason: revisionReason.trim(),
                  expectedVersion: project.instructionRevisionVersion || 0,
                  expectedInstructions: project.workDetails || '',
                  instructions: instructionDraft.trim()
              });
              setProject({ ...project, workDetails: instructionDraft.trim(), instructionRevisionVersion: (project.instructionRevisionVersion || 0) + 1 });
          } else {
              const currentMetal = project.goldType || project.goldComponents?.[0]?.type || '';
              const currentPurity = project.goldPurity || project.goldComponents?.[0]?.purity || '';
              const components = project.goldComponents?.length
                  ? project.goldComponents.map((component, index) => index === 0 ? { ...component, type: metalDraft, purity: purityDraft } : component)
                  : [{ id: 'legacy-component', label: 'Main Piece', type: metalDraft, purity: purityDraft }];
              await store.reviseProjectDetails({
                  operationId,
                  projectId: project.id,
                  kind: 'METAL',
                  reason: revisionReason.trim(),
                  expectedVersion: project.metalRevisionVersion || 0,
                  expectedMetal: currentMetal,
                  expectedPurity: currentPurity,
                  metal: metalDraft,
                  purity: purityDraft
              });
              setProject({ ...project, goldType: metalDraft as Project['goldType'], goldPurity: purityDraft, goldComponents: components, metalRevisionVersion: (project.metalRevisionVersion || 0) + 1 });
          }
          setRevisionModal(null);
          showToast('Project revision saved and added to Project History.');
      } catch (error: any) {
          console.error(error);
          showToast(error?.message || 'Failed to save revision. Refresh and try again.');
      } finally {
          setIsSavingRevision(false);
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
  const repair = store.getRepairDetails(project);
  const repairCost = store.getRepairCostSummary(project.id);
  const currentIdentityIds = [currentUser?.id, currentUser?.authUid, ...(currentUser?.legacyProfileIds || [])].filter(Boolean);
  const assignedToProject = (project.activeAssignees || []).some(userId => currentIdentityIds.includes(userId))
      || (project.assignments || []).some(assignment => assignment.active && currentIdentityIds.includes(assignment.userId));
  const isPickedUp = project.status === ProjectStatus.CLOSED || !!project.date_picked_up;
  const canModifyProject = !isPickedUp && (isManager || assignedToProject);
  const canEditRepairFinancials = !isPickedUp && (isManager || (isDesigner && assignedToProject));
  const canEditProjectDetails = !isPickedUp && (isManager || (isDesigner && assignedToProject));
  const primaryMetal = project.goldType || project.goldComponents?.[0]?.type;
  const primaryPurity = project.goldPurity || project.goldComponents?.[0]?.purity;
  // Locked if not ready OR if already completed (Review/Closed)
  const isLocked = !canModifyProject || (!repair && project.designStage !== 'Ready for Production' && !isManager && !isDesigner) || project.status !== ProjectStatus.ACTIVE;
  const lastWeight = project.progress?.filter(p => p.weightG).pop()?.weightG;
  const openRequests = requests.filter(r => r.status === 'OPEN');
  const completedRequests = requests.filter(r => r.status === 'FULFILLED' || r.status === 'PARTIALLY_FULFILLED_CLOSED');

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
                  {primaryMetal && (
                      <button type="button" onClick={canEditProjectDetails ? openMetalRevision : undefined} className={canEditProjectDetails ? 'inline-flex items-center gap-1 cursor-pointer' : 'cursor-default'} title={canEditProjectDetails ? 'Edit metal and purity' : isPickedUp ? 'Picked Up projects are read-only' : undefined}>
                        <Badge color="amber">{primaryMetal} {primaryPurity}</Badge>
                        {canEditProjectDetails && <Edit2 size={12} className="text-amber-400" />}
                      </button>
                  )}
               </div>
               <p className="text-zinc-400 text-lg break-words line-clamp-2 max-w-full">{project.pieceName}</p>
               {(project.clientName || project.clientPhone) && (
                   <p className="text-zinc-500 text-sm mt-1">
                       {project.clientName && <span className="font-medium text-zinc-300">{project.clientName}</span>}
                       {project.clientName && project.clientPhone && <span className="mx-2">•</span>}
                       {project.clientPhone && <span>{project.clientPhone}</span>}
                   </p>
               )}
               
               {(project.workDetails || canEditProjectDetails) && (
                   <div className="mt-3 bg-white/5 border border-white/5 rounded-2xl p-4 text-sm text-zinc-300">
                       <div className="flex items-center justify-between gap-3 mb-1">
                         <span className="font-bold text-zinc-500 uppercase text-[10px] tracking-widest font-mono">Instructions</span>
                         {canEditProjectDetails && <button type="button" onClick={openInstructionRevision} className="text-zinc-500 hover:text-lux-gold transition-colors" title="Edit instructions"><Edit2 size={14} /></button>}
                       </div>
                       {project.workDetails || <span className="italic text-zinc-600">No instructions entered.</span>}
                   </div>
               )}

               {repair && (
                   <div className="mt-3 bg-white/5 border border-white/5 rounded-2xl p-5 text-sm text-zinc-400">
                       <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5 pb-3 border-b border-white/5">
                           <div>
                             <span className="font-bold text-lux-gold uppercase text-[10px] tracking-[0.2em] font-mono">Repair Details</span>
                             <div className="text-white font-bold mt-1">{repair.type}{repair.customName ? ` • ${repair.customName}` : ''}</div>
                           </div>
                           <div className="text-right">
                               <span className="text-[10px] text-zinc-500 block uppercase font-mono tracking-widest">Repair Status</span>
                               {canModifyProject && project.status === ProjectStatus.ACTIVE ? (
                                 <select
                                   value={repair.status}
                                   onChange={e => handleRepairStatusChange(e.target.value as RepairStatus)}
                                   className="bg-black border border-zinc-700 rounded-xl py-2 px-3 text-white text-xs font-bold"
                                 >
                                   {Object.values(RepairStatus).filter(status => status !== RepairStatus.COMPLETED).map(status => <option key={status} value={status}>{status}</option>)}
                                 </select>
                               ) : (
                                 <span className="text-white font-bold text-lg">{repair.status}</span>
                               )}
                           </div>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mb-4">
                           <div className="flex justify-between py-1 border-b border-zinc-800/30">
                               <span className="text-zinc-500">Submitted</span>
                               <span className="text-white font-medium">{repair.submittedDate}</span>
                           </div>
                           {repair.completedDate && (
                             <div className="flex justify-between py-1 border-b border-zinc-800/30">
                               <span className="text-zinc-500">Completed</span>
                               <span className="text-white font-medium">{new Date(repair.completedDate).toLocaleDateString()}</span>
                             </div>
                           )}
                           {repair.sizeFrom && (
                             <div className="flex justify-between py-1 border-b border-zinc-800/30">
                               <span className="text-zinc-500">Resize</span>
                               <span className="text-white font-medium">{repair.sizeFrom} → {repair.sizeTo || '-'}</span>
                             </div>
                           )}
                           {repair.vendorName && (
                             <div className="flex justify-between py-1 border-b border-zinc-800/30">
                               <span className="text-zinc-500">Vendor</span>
                               <span className="text-white font-medium">{repair.vendorName}</span>
                             </div>
                           )}
                           {repair.damageType && (
                             <div className="flex justify-between py-1 border-b border-zinc-800/30">
                               <span className="text-zinc-500">Damage</span>
                               <span className="text-white font-medium">{repair.damageType}</span>
                             </div>
                           )}
                           {repair.diamondItems?.map((item, idx) => (
                               <div key={idx} className="flex justify-between py-1 border-b border-zinc-800/30">
                                   <span className="text-zinc-500">Size: {item.stoneSize || '-'}</span>
                                   <span className="text-white font-bold">{item.quantity || 0} Pcs</span>
                               </div>
                           ))}
                       </div>

                       {(repair.issueNotes || repair.repairNotes || repair.customerNotes) && (
                         <div className="mt-2 text-zinc-300 bg-black/20 p-3 rounded-lg">
                           <span className="text-[10px] text-zinc-500 block mb-1 uppercase font-bold">Notes</span>
                           {repair.issueNotes || repair.repairNotes || repair.customerNotes}
                         </div>
                       )}

                       {canEditRepairFinancials && (
                         <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                           <div className="bg-black/30 rounded-2xl p-3 border border-white/5">
                             <span className="text-[10px] text-zinc-500 uppercase font-bold">Internal Cost</span>
                             <div className="text-white font-mono font-bold">${repairCost.totalInternalCostCad.toFixed(2)}</div>
                           </div>
                           <div className="bg-black/30 rounded-2xl p-3 border border-white/5">
                             <span className="text-[10px] text-zinc-500 uppercase font-bold">Client Charge</span>
                             <div className="text-lux-gold font-mono font-bold">${repairCost.finalClientChargeCad.toFixed(2)}</div>
                           </div>
                           <div className="bg-black/30 rounded-2xl p-3 border border-white/5">
                             <span className="text-[10px] text-zinc-500 uppercase font-bold">Profit / Loss</span>
                             <div className={`font-mono font-bold ${repairCost.profitLossCad < 0 ? 'text-red-400' : 'text-emerald-400'}`}>${repairCost.profitLossCad.toFixed(2)}</div>
                           </div>
                         </div>
                       )}

                       {(repair.beforeImage || repair.afterImage) && (
                         <div className="mt-4 grid grid-cols-2 gap-3">
                           {repair.beforeImage && <img src={repair.beforeImage} className="h-28 w-full object-cover rounded-2xl border border-white/5" />}
                           {repair.afterImage && <img src={repair.afterImage} className="h-28 w-full object-cover rounded-2xl border border-white/5" />}
                         </div>
                       )}
                   </div>
               )}
               
               <div className="flex items-center gap-3 mt-4 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 md:mx-0 md:px-0">
                  <div className="flex -space-x-2 shrink-0">
                     {project.assignments.filter(a => a.active).map(a => {
                       const u = store.getUser(a.userId);
                       return u ? <div key={u.id} className="ring-4 ring-[#16171D] rounded-full relative"><SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="sm" /></div> : null;
                     })}
                  </div>
                  {isManager && project.status === ProjectStatus.ACTIVE && <button onClick={() => setIsAssigning(true)} className="shrink-0 bg-[#23262F]/50 backdrop-blur-md hover:bg-lux-gold hover:text-black text-zinc-400 p-2 rounded-full transition-colors border border-white/10"><UserPlus size={16}/></button>}
                  {(currentUser.role === Role.SETTER || currentUser.role === Role.JEWELLER) && canModifyProject && project.status === ProjectStatus.ACTIVE && (
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
              {!isManager && !isDesigner && canModifyProject && project.status === ProjectStatus.ACTIVE && (
                 <>
                   <Button size="sm" variant="secondary" onClick={() => setIsRequesting(true)} icon={<PackagePlus size={16} className="text-blue-400"/>}>Request</Button>
                   <Button size="sm" variant="secondary" onClick={() => { setReturnBagNum(''); setIsReturning(true); }} icon={<RotateCcw size={16} className="text-amber-400"/>}>Return</Button>
                 </>
              )}
              {isManager && project.status === ProjectStatus.ACTIVE && (
                 <Button size="sm" variant="danger" onClick={() => setIsBroken(true)} icon={<AlertOctagon size={16} />}>Broken</Button>
              )}
            </div>
        </div>
      </div>

      {revisionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[250] flex items-end md:items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6 animate-in slide-in-from-bottom-4 md:zoom-in-95">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">{revisionModal === 'INSTRUCTIONS' ? 'Edit Project Instructions' : 'Edit Metal & Purity'}</h3>
                <p className="text-xs text-zinc-500 mt-1">The previous value, replacement, editor, reason, and server time will be kept permanently.</p>
              </div>
              <button type="button" onClick={() => setRevisionModal(null)} disabled={isSavingRevision} className="text-zinc-500 hover:text-white"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              {revisionModal === 'INSTRUCTIONS' ? (
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Replacement instructions</label>
                  <textarea value={instructionDraft} onChange={event => setInstructionDraft(event.target.value)} maxLength={5000} className="w-full h-36 bg-black border border-zinc-700 rounded-2xl p-4 text-sm text-white resize-none focus:border-lux-gold" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Metal</label>
                    <select value={metalDraft} onChange={event => { const next = event.target.value; setMetalDraft(next); if (next === 'Platinum') setPurityDraft('950'); else if (purityDraft === '950') setPurityDraft('14k'); }} className="w-full bg-black border border-zinc-700 rounded-2xl p-3 text-white">
                      {['Yellow', 'White', 'Rose', 'Platinum'].map(metal => <option key={metal}>{metal}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Purity</label>
                    <select value={purityDraft} onChange={event => setPurityDraft(event.target.value)} className="w-full bg-black border border-zinc-700 rounded-2xl p-3 text-white">
                      {(metalDraft === 'Platinum' ? ['950'] : ['10k', '14k', '18k', '21k']).map(purity => <option key={purity}>{purity}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Reason (required)</label>
                <textarea value={revisionReason} onChange={event => setRevisionReason(event.target.value)} maxLength={1000} placeholder="Why is this change required?" className="w-full h-24 bg-black border border-zinc-700 rounded-2xl p-4 text-sm text-white resize-none focus:border-lux-gold" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" onClick={() => setRevisionModal(null)} disabled={isSavingRevision}>Cancel</Button>
              <Button onClick={handleSaveRevision} loading={isSavingRevision} disabled={!revisionReason.trim() || (revisionModal === 'INSTRUCTIONS' && !instructionDraft.trim())}>Save Revision</Button>
            </div>
          </Card>
        </div>
      )}

      {/* MOBILE ACTION BAR - High Z-Index */}
      {project.status === ProjectStatus.ACTIVE && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-[#16171D]/90 backdrop-blur-xl border-t border-white/10 z-[200] flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] animate-in slide-in-from-bottom-2">
            {(!isManager && !isDesigner && canModifyProject) && (
                <>
                <Button className="flex-1 shadow-none bg-[#23262F] hover:bg-[#2D313A] border border-white/5" onClick={() => setIsRequesting(true)} icon={<PackagePlus className="text-blue-400"/>}>Request</Button>
                <Button className="flex-1 shadow-glow" onClick={() => { setReturnBagNum(''); setIsReturning(true); }} icon={<RotateCcw className="text-black"/>}>Return</Button>
                </>
            )}
            {isManager && (
                <Button className="flex-1" variant="danger" onClick={() => setIsBroken(true)} icon={<AlertOctagon/>}>Broken</Button>
            )}
            {isManager && (
                <Button className="flex-1" variant="secondary" onClick={() => setIsAssigning(true)} icon={<UserPlus/>}>Assign</Button>
            )}
            {isDesigner && assignedToProject && !repair && (
                <Button className="flex-1 w-full" onClick={() => setIsAddingNote(true)} icon={<StickyNote/>}>Add Design Log</Button>
            )}
        </div>
      )}

      {isManager && !repair && (
         <div className="flex justify-center mb-8 relative z-20">
            <div className="bg-black/30 backdrop-blur-xl p-1 rounded-full flex gap-1 border border-white/10">
               <button 
                  onClick={() => setProgressView('DESIGN')} 
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${progressView === 'DESIGN' ? 'bg-lux-gold text-[#16171D] shadow-glow' : 'text-zinc-500 hover:text-white'}`}
               >
                  <PenTool size={14} /> Design
               </button>
               <button 
                  onClick={() => setProgressView('PRODUCTION')} 
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${progressView === 'PRODUCTION' ? 'bg-lux-gold text-[#16171D] shadow-glow' : 'text-zinc-500 hover:text-white'}`}
               >
                  <LayoutTemplate size={14} /> Production
               </button>
            </div>
         </div>
      )}

      {/* DESIGN PROGRESS */}
      {!repair && ((isDesigner && assignedToProject) || (isManager && progressView === 'DESIGN')) && (
         <Card className="mb-8 p-6 relative z-10">
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
                        <div key={step} className="relative z-10 flex flex-col items-center group cursor-pointer" onClick={() => canModifyProject && handleDesignStageUpdate(step)}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-xl backdrop-blur-md ${isCompleted ? 'bg-lux-gold border-lux-gold text-black shadow-glow' : 'bg-[#16171D] border-zinc-700 text-zinc-500 group-hover:border-lux-gold/50'}`}>
                            {isCompleted ? <Check size={16} strokeWidth={3} /> : <span className="text-[10px] font-bold">{idx + 1}</span>}
                            </div>
                            <span className={`text-[10px] font-bold mt-2 uppercase tracking-wide transition-colors px-2 py-1 rounded-xl text-center whitespace-nowrap ${isCurrent ? 'text-lux-black bg-lux-gold shadow-glow' : 'text-zinc-600 group-hover:text-zinc-400'}`}>{step}</span>
                        </div>
                    );
                })}
                </div>
            </div>
 
            {/* Casting Action Card */}
            {(project.designStage === 'Approved' || project.designStage === 'Casting Sent' || project.designStage === 'Casting Received (Issue)' || project.designStage === 'Recasting Sent') && (
                <div className="mt-4 p-4 bg-[#16171D] border border-zinc-700 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-lux-gold/10 p-2 rounded-xl text-lux-gold"><Box size={24}/></div>
                        <div>
                            <div className="text-sm font-bold text-white">Casting Operations</div>
                            <div className="text-xs text-zinc-500">Current Cycle: #{project.castingEvents?.length ? project.castingEvents.length + ((project.designStage === 'Casting Sent' || project.designStage === 'Recasting Sent') ? 0 : 1) : 1}</div>
                        </div>
                    </div>
                    {canModifyProject && <div className="flex gap-2">
                        {project.designStage === 'Approved' && <Button size="sm" onClick={() => handleDesignStageUpdate('Casting Sent')}>Send to Casting</Button>}
                        {(project.designStage === 'Casting Sent' || project.designStage === 'Recasting Sent') && <Button size="sm" onClick={() => setIsCastingReceive(true)}>Receive Casting</Button>}
                        {project.designStage === 'Casting Received (Issue)' && <Button size="sm" onClick={handleSendRecast} variant="danger">Send for Recasting</Button>}
                    </div>}
                </div>
            )}
         </Card>
      )}
 
      {/* PRODUCTION PROGRESS - ADAPTIVE */}
      {!repair && (!isDesigner && (!isManager || progressView === 'PRODUCTION')) && (
        <div data-tour="project-stage-control" className="mb-10 relative z-10">
            {isLocked && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center text-center rounded-3xl border border-zinc-800">
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

            <div className="md:hidden bg-[#121318] border border-white/10 rounded-3xl p-5 shadow-lg relative overflow-hidden">
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

            <div className="hidden md:block select-none px-2 relative z-0 py-4">
                <div className="relative h-16 flex items-center group">
                    <div className="absolute -top-6 left-0 right-0 flex justify-between px-1 pointer-events-none">
                        <span className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">Start</span>
                        <span className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">Completion</span>
                    </div>

                    {/* Track Background */}
                    <div className="absolute left-0 right-0 h-4 bg-[#121318]/60 backdrop-blur-md rounded-full border border-white/5 shadow-inner"></div>
                    
                    {/* Track Fill */}
                    <div 
                        className="absolute left-0 h-4 bg-gradient-to-r from-lux-gold/60 to-lux-gold rounded-full shadow-[0_0_20px_rgba(245,194,73,0.3)] transition-all duration-300 ease-out" 
                        style={{ width: `${isDraggingSlider ? sliderPercent : currentPercent}%` }}
                    ></div>

                    {/* Stage Dots */}
                    {stages.map((s, index) => {
                        const displayPercent = isDraggingSlider ? sliderPercent : currentPercent;
                        const isActive = displayPercent >= s.percentValue;
                        return (
                            <div 
                                key={s.id} 
                                className={`absolute w-4 h-4 rounded-full border-[3px] transform -translate-x-1/2 transition-all duration-300 z-10 pointer-events-none ${
                                    isActive ? 'bg-[#16171D] border-lux-gold scale-125 shadow-glow' : 'bg-[#16171D] border-zinc-700'
                                }`}
                                style={{ left: `${s.percentValue}%` }}
                            >
                                {/* Staggered Labels */}
                                <div className={`
                                    absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded bg-[#121318] border border-zinc-800 text-[10px] font-bold transition-all z-20 
                                    ${index % 2 === 0 ? '-bottom-10' : '-top-10'}
                                    ${isActive ? 'text-white opacity-100 border-lux-gold/30' : 'text-zinc-600 opacity-0 group-hover:opacity-100'}
                                `}>
                                    {s.name}
                                </div>
                            </div>
                        );
                    })}

                    {/* Interactive Native Slider */}
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="1"
                        value={sliderPercent}
                        onPointerDown={() => setIsDraggingSlider(true)}
                        onChange={(e) => setSliderPercent(parseInt(e.target.value))}
                        onPointerUp={() => {
                            setIsDraggingSlider(false);
                            if (!isLocked) {
                                const closestStage = stages.reduce((prev, curr) => 
                                    Math.abs(curr.percentValue - sliderPercent) < Math.abs(prev.percentValue - sliderPercent) ? curr : prev
                                );
                                if (closestStage && closestStage.name !== project.currentStageName) {
                                    handleDesktopStageClick(closestStage);
                                }
                            }
                        }}
                        onMouseUp={() => {
                            setIsDraggingSlider(false);
                            if (!isLocked) {
                                const closestStage = stages.reduce((prev, curr) => 
                                    Math.abs(curr.percentValue - sliderPercent) < Math.abs(prev.percentValue - sliderPercent) ? curr : prev
                                );
                                if (closestStage && closestStage.name !== project.currentStageName) {
                                    handleDesktopStageClick(closestStage);
                                }
                            }
                        }}
                        onTouchEnd={() => {
                            setIsDraggingSlider(false);
                            if (!isLocked) {
                                const closestStage = stages.reduce((prev, curr) => 
                                    Math.abs(curr.percentValue - sliderPercent) < Math.abs(prev.percentValue - sliderPercent) ? curr : prev
                                );
                                if (closestStage && closestStage.name !== project.currentStageName) {
                                    handleDesktopStageClick(closestStage);
                                }
                            }
                        }}
                        onPointerCancel={() => setIsDraggingSlider(false)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
                        disabled={isLocked}
                    />
                    
                    {/* Custom Apple-like Thumb */}
                    <motion.div 
                        className="absolute w-8 h-8 bg-white rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-zinc-200 z-20 pointer-events-none flex items-center justify-center transform -translate-x-1/2"
                        animate={{ 
                            left: `${isDraggingSlider ? sliderPercent : currentPercent}%`,
                            scale: isDraggingSlider ? 1.2 : 1 
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                        <div className="w-2 h-2 rounded-full bg-lux-gold"></div>
                    </motion.div>
                </div>
            </div>
        </div>
      )}

      {/* iOS STYLE SEGMENTED CONTROL */}
      <div data-tour="project-tabs" className="mb-8 relative z-10">
          <SegmentedControl 
             options={[
                 ...(!isDesigner ? [{ label: 'Diamond Bags', value: 'bags' }] : []),
                 ...(repair ? [{ label: 'Repair', value: 'repair' }] : []),
                 { label: 'Services & Activity', value: 'design' },
                 { label: 'Gallery', value: 'photos' }
             ]}
             value={activeTab}
             onChange={(val) => setActiveTab(val)}
          />
      </div>

      {activeTab === 'repair' && repair && editableRepair && (
        <div className="space-y-6 animate-enter">
          <Card className="p-5 md:p-6 border-zinc-800">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
              <div>
                <div className="text-[10px] text-lux-gold uppercase tracking-[0.2em] font-bold mb-1 font-mono">Repair Workflow</div>
                <h3 className="text-2xl font-bold text-white">{repair.type}{repair.customName ? ` • ${repair.customName}` : ''}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {canModifyProject && project.status === ProjectStatus.ACTIVE && (
                  <Button size="sm" onClick={() => handleRepairStatusChange(RepairStatus.READY_FOR_PICKUP)} icon={<CheckCircle2 size={14} />}>Ready for Pickup</Button>
                )}
                {canModifyProject && project.status === ProjectStatus.ACTIVE && (
                  <select
                    value={repair.status}
                    onChange={e => handleRepairStatusChange(e.target.value as RepairStatus)}
                    className="bg-black border border-zinc-700 rounded-2xl py-2 px-3 text-white text-xs font-bold h-9"
                  >
                    {Object.values(RepairStatus).filter(status => status !== RepairStatus.COMPLETED).map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="lg:col-span-2 bg-black/20 border border-white/5 rounded-2xl p-4">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-mono block mb-2">Repair Notes</label>
                <textarea
                  value={editableRepair.repairNotes || editableRepair.issueNotes || ''}
                  onChange={e => setEditableRepair({ ...editableRepair, repairNotes: e.target.value })}
                  disabled={!canEditRepairFinancials}
                  className="w-full bg-transparent text-white placeholder-zinc-600 min-h-[104px] resize-none outline-none text-sm"
                  placeholder="Repair details..."
                />
              </div>
              <div className="bg-black/20 border border-white/5 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Submitted</span>
                  <span className="text-white font-medium">{editableRepair.submittedDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Status</span>
                  <span className="text-white font-medium">{repair.status}</span>
                </div>
                {editableRepair.vendorName && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Vendor</span>
                    <span className="text-white font-medium">{editableRepair.vendorName}</span>
                  </div>
                )}
              </div>
            </div>

            {canEditRepairFinancials && (
              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Costs</h4>
                  <Badge color={editableRepair.financials.noCharge ? 'red' : 'gray'}>{editableRepair.financials.noCharge ? 'No Charge' : 'Client Charge'}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Input label="Labour CAD" type="number" value={moneyInputValue(editableRepair.financials.labourCostCad)} onChange={e => updateRepairFinancial('labourCostCad', parseMoneyInput(e.target.value))} />
                  <Input label="Gold Used G" type="number" value={moneyInputValue(editableRepair.financials.goldUsedG)} onChange={e => updateRepairFinancial('goldUsedG', parseMoneyInput(e.target.value))} />
                  <Input label="Gold Cost CAD" type="number" value={moneyInputValue(editableRepair.financials.goldCostCad)} onChange={e => updateRepairFinancial('goldCostCad', parseMoneyInput(e.target.value))} />
                  <Input label="Diamond Pieces" type="number" value={moneyInputValue(editableRepair.financials.diamondPieces)} onChange={e => updateRepairFinancial('diamondPieces', parseMoneyInput(e.target.value))} />
                  <Input label="Diamond Carats" type="number" value={moneyInputValue(editableRepair.financials.diamondCarats)} onChange={e => updateRepairFinancial('diamondCarats', parseMoneyInput(e.target.value))} />
                  <Input label="Diamond Cost CAD" type="number" value={moneyInputValue(editableRepair.financials.diamondCostCad)} onChange={e => updateRepairFinancial('diamondCostCad', parseMoneyInput(e.target.value))} />
                  <Input label="Outsource CAD" type="number" value={moneyInputValue(editableRepair.financials.outsourcedCostCad)} onChange={e => updateRepairFinancial('outsourcedCostCad', parseMoneyInput(e.target.value))} />
                  <Input label="Material CAD" type="number" value={moneyInputValue(editableRepair.financials.materialCostCad)} onChange={e => updateRepairFinancial('materialCostCad', parseMoneyInput(e.target.value))} />
                  <Input label="Client Charge CAD" type="number" value={moneyInputValue(editableRepair.financials.clientChargeCad)} disabled={!!editableRepair.financials.noCharge} onChange={e => updateRepairFinancial('clientChargeCad', parseMoneyInput(e.target.value))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3">
                  <label className="flex items-center gap-3 bg-[#1A1C23] rounded-2xl px-4 h-14 border border-zinc-800">
                    <input
                      type="checkbox"
                      checked={!!editableRepair.financials.noCharge}
                      onChange={e => setEditableRepair({
                        ...editableRepair,
                        financials: {
                          ...editableRepair.financials,
                          noCharge: e.target.checked,
                          clientChargeCad: e.target.checked ? 0 : editableRepair.financials.clientChargeCad
                        }
                      })}
                    />
                    <span className="text-sm font-bold text-white">No charge repair</span>
                  </label>
                  <select
                    value={editableRepair.financials.noChargeReason || ''}
                    onChange={e => updateRepairFinancial('noChargeReason', e.target.value)}
                    className="w-full bg-[#23262F] text-white rounded-2xl border-transparent p-3.5 text-sm focus:ring-lux-gold transition-all h-14"
                  >
                    <option value="">No charge reason...</option>
                    {['Warranty', 'Goodwill', 'Internal Correction', 'VIP Client', 'Manager Approval', 'Other'].map(reason => <option key={reason} value={reason}>{reason}</option>)}
                  </select>
                </div>
                {(() => {
                  const f = editableRepair.financials || {};
                  const internal = Number(f.labourCostCad || 0) + Number(f.goldCostCad || 0) + Number(f.diamondCostCad || 0) + Number(f.outsourcedCostCad || 0) + Number(f.materialCostCad || 0);
                  const charge = f.noCharge ? 0 : Number(f.clientChargeCad || 0);
                  const profit = charge - internal;
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold">Internal Cost</div>
                        <div className="text-white text-2xl font-mono font-bold">${internal.toFixed(2)}</div>
                      </div>
                      <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold">Client Charge</div>
                        <div className="text-lux-gold text-2xl font-mono font-bold">${charge.toFixed(2)}</div>
                      </div>
                      <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold">Profit / Loss</div>
                        <div className={`text-2xl font-mono font-bold ${profit < 0 ? 'text-red-400' : 'text-emerald-400'}`}>${profit.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {canEditRepairFinancials && (
              <div className="space-y-4 mb-6">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Images</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ImageUpload label="Before Image" value={editableRepair.beforeImage} onChange={value => setEditableRepair({ ...editableRepair, beforeImage: value })} />
                  <ImageUpload label="After Image" value={editableRepair.afterImage} onChange={value => setEditableRepair({ ...editableRepair, afterImage: value })} />
                </div>
              </div>
            )}

            {canEditRepairFinancials && (
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-white/5">
                <Button variant="secondary" onClick={() => setEditableRepair(JSON.parse(JSON.stringify(repair)))} disabled={isSavingRepair}>Reset</Button>
                <Button onClick={handleSaveRepairDetails} loading={isSavingRepair}>Save Repair Details</Button>
              </div>
            )}
          </Card>
        </div>
      )}

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
                                ? 'bg-[#121318] border-lux-gold rounded-b-none border-b-0' 
                                : 'bg-black/20 border-zinc-800 hover:border-lux-gold hover:bg-[#121318]'
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
                        <div className="bg-[#121318] border border-t-0 border-lux-gold rounded-b-3xl p-6 md:p-8 animate-in slide-in-from-top-2 fade-in duration-200 shadow-2xl relative overflow-hidden">
                             {/* Background Glow Extension */}
                             <div className="absolute top-0 right-0 w-96 h-96 bg-lux-gold/5 rounded-full blur-3xl pointer-events-none"></div>

                             <div className="relative z-10">
                                 {/* MOVED KPIs GRID */}
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-8">
                                     <div className="bg-black/40 p-4 rounded-3xl border border-white/5 flex flex-col justify-center">
                                         <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Net Carats</div>
                                         <div className="text-xl font-bold text-white font-mono">{cost.totalCaratsUsed.toFixed(3)} <span className="text-sm text-zinc-600 font-sans font-medium">ct</span></div>
                                     </div>
                                     <div className="bg-black/40 p-4 rounded-3xl border border-white/5 flex flex-col justify-center">
                                         <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Net Pieces</div>
                                         <div className="text-xl font-bold text-white font-mono">{cost.breakdown.reduce((acc, b) => acc + b.usedPcs, 0)} <span className="text-sm text-zinc-600 font-sans font-medium">pcs</span></div>
                                     </div>
                                     <div className="bg-black/40 p-4 rounded-3xl border border-white/5 flex flex-col justify-center">
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
                                         <div className="bg-black/20 p-5 rounded-3xl border border-white/5 mb-4">
                                             <div className="text-xs font-bold text-zinc-500 uppercase mb-4 tracking-wide flex justify-between items-center">
                                                 <span>Gold Breakdown</span>
                                                 <span className="text-lux-gold">${cost?.goldCost.toFixed(2)} total</span>
                                             </div>
                                             
                                             <div className="space-y-4">
                                                 {cost.goldBreakdown && cost.goldBreakdown.length > 0 ? (
                                                     cost.goldBreakdown.map((item, idx) => (
                                                         <div key={idx} className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                                             <div className="flex justify-between items-start mb-2">
                                                                 <div className="flex items-center gap-2">
                                                                     <div className="w-2 h-2 rounded-full bg-lux-gold"></div>
                                                                     <span className="text-sm font-bold text-white">{item.label}</span>
                                                                 </div>
                                                                 <span className="text-lux-gold font-mono text-sm">${item.calculatedCostCad.toFixed(2)}</span>
                                                             </div>
                                                             <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                                                                 <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{item.type} {item.purity}</span>
                                                                 <span>{item.weightG.toFixed(2)}g final</span>
                                                                 <span className="text-lux-gold/60">Ratio: {item.ratioUsed.toFixed(3)}</span>
                                                             </div>
                                                         </div>
                                                     ))
                                                 ) : (
                                                     <div className="text-center py-4 text-zinc-500 text-xs">No gold components found.</div>
                                                 )}
                                             </div>

                                             <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
                                                 <div className="text-center">
                                                     <div className="text-[10px] text-zinc-600 uppercase font-bold mb-1">Total Casting</div>
                                                     <div className="text-sm font-mono text-white">{cost?.initialWeightG.toFixed(2)}g</div>
                                                 </div>
                                                 <div className="text-center">
                                                     <div className="text-[10px] text-zinc-600 uppercase font-bold mb-1 text-red-400">Total Loss</div>
                                                     <div className="text-sm font-mono text-red-400">{cost?.goldLossG.toFixed(2)}g</div>
                                                 </div>
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
                                         <div className="p-4 bg-black/40 rounded-3xl border border-white/5 flex justify-between items-center">
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
             <div className="mb-6">
                <div className="flex justify-between items-end px-1 mb-3">
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Issued Bags</h3>
                </div>
                <div className="flex flex-col gap-3">
                 {bags.length === 0 ? <p className="text-zinc-500 italic p-4 text-center border border-dashed border-zinc-800 bg-transparent rounded-3xl">No bags issued.</p> : 
                    bags.map(b => (
                       <div key={b.id} className="bg-[#1C1E24]/60 backdrop-blur-3xl rounded-[2rem] border border-white/[0.05] p-6 relative overflow-hidden transition-all hover:bg-[#252830]/80">
                          <div className="flex justify-between items-start mb-6">
                             <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-2xl bg-black/40 border border-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                                    <Package className="text-lux-gold" size={24} />
                                 </div>
                                 <div className="flex flex-col">
                                    <div className="font-bold text-white text-lg tracking-tight">Bag #{b.bagNumber}</div>
                                    <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-2">
                                       <Calendar size={12}/> {formatDateTime(b.issuedAt)}
                                    </div>
                                 </div>
                             </div>
                             <div className="shrink-0">
                                 <StatusPill status={b.status} />
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
                             {b.items.map((item, i) => {
                                const spec = specs.find(s => s.id === item.specId);
                                return (
                                   <div key={i} className="bg-white/5 px-3 py-2.5 rounded-2xl text-[11px] text-zinc-300 border border-white/5 flex flex-col gap-1 transition-all hover:bg-white/10 group">
                                      <span className="opacity-50 font-bold uppercase tracking-tighter group-hover:text-lux-gold transition-colors">{spec?.label}:</span> 
                                      <span className="font-black text-white text-sm">{item.issuedPcs}</span>
                                   </div>
                                 );
                             })}
                          </div>
                          
                          {/* Inline Evidence Thumbnails - Manager Only */}
                          {isManager && (() => {
                              const bagEvidence = store.getEvidenceImages()
                                  .filter(ev => ev.projectId === project?.id && ev.bagNumber === b.bagNumber)
                                  .sort((a, z) => a.uploadedAt.localeCompare(z.uploadedAt));
                              if (bagEvidence.length === 0) return null;
                              return (
                                  <div className="mb-5 flex items-center gap-2 flex-wrap">
                                      <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest shrink-0">Evidence:</span>
                                      {bagEvidence.map((ev) => (
                                          <button
                                              key={ev.id}
                                              title={`${ev.transactionType === 'ISSUE' ? 'Issue' : 'Return'} photo — click to view`}
                                              onClick={() => { setSelectedEvidence(ev); setSelectedVersionIndex(null); }}
                                              className="relative group/thumb"
                                          >
                                              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-zinc-700 hover:border-lux-gold transition-all shadow-md relative">
                                                  <img
                                                      src={ev.thumbnailUrl || ev.photoUrl}
                                                      loading="lazy"
                                                      className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-300"
                                                      alt={`${ev.transactionType} evidence`}
                                                  />
                                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-1">
                                                      <span className="text-[8px] font-bold text-white leading-none">
                                                          {ev.transactionType === 'ISSUE' ? 'ISS' : 'RET'}
                                                      </span>
                                                  </div>
                                                  {(ev.replacementHistory?.length ?? 0) > 0 && (
                                                      <div className="absolute top-1 right-1 w-3 h-3 bg-lux-gold rounded-full flex items-center justify-center text-black text-[6px] font-black">
                                                          {(ev.replacementHistory?.length ?? 0) + 1}
                                                      </div>
                                                  )}
                                              </div>
                                          </button>
                                      ))}
                                  </div>
                              );
                          })()}
                          
                          <div className="text-[11px] text-zinc-500 border-t border-white/5 pt-4 flex items-center gap-2">
                             <UserCheck size={14} className="text-zinc-700"/>
                             Issued to <span className="font-bold text-zinc-300 ml-1">{store.getUser(b.issuedToId)?.name}</span>
                          </div>
                       </div>
                    ))
                 }
                 </div>
             </div>

             <div className="mb-6">
                <div className="flex justify-between items-end px-1 pt-2 mb-3">
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Pending Requests</h3>
                </div>
                <div className="flex flex-col gap-3">
                 {openRequests.length === 0 ? <p className="text-zinc-500 italic p-4 text-center border border-dashed border-zinc-800 bg-transparent rounded-3xl">No active requests.</p> : 
                    openRequests.map(r => (
                       <div key={r.id} className="bg-[#1C1E24]/60 backdrop-blur-3xl rounded-[2rem] border border-white/[0.05] p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all hover:bg-[#252830]/80">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                                <PackagePlus className="text-blue-400" size={20} />
                             </div>
                             <div>
                                <div className="font-bold text-white text-sm mb-0.5">Request from {store.getUser(r.requestedById)?.name}</div>
                                <div className="text-[10px] text-zinc-500 font-mono tracking-wider">{formatDateTime(r.requestedAt)}</div>
                             </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 p-2.5 rounded-2xl bg-black/30 border border-white/5 md:max-w-md w-full">
                             {r.lines.map((l, i) => {
                                 const spec = specs.find(s => s.id === l.specId);
                                 return (
                                     <div key={i} className="text-[10px] bg-white/5 px-2 py-1 rounded-lg text-zinc-300 font-mono font-bold flex items-center gap-1.5 border border-white/5 whitespace-nowrap">
                                         <span className="text-blue-400">{l.requestedPcs}x</span> 
                                         <span className="text-zinc-500 font-sans tracking-tight">{spec?.label}</span>
                                     </div>
                                 )
                             })}
                          </div>
                          
                          <div className="shrink-0 flex justify-end">
                             <StatusPill status={r.status} />
                          </div>
                       </div>
                    ))
                 }
                 </div>
             </div>

             <div className="mb-6">
                <div className="flex justify-between items-end px-1 pt-2 mb-3">
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Request History</h3>
                </div>
                <div className="flex flex-col gap-3">
                 {completedRequests.length === 0 ? <p className="text-zinc-500 italic p-4 text-center border border-dashed border-zinc-800 bg-transparent rounded-3xl">No completed requests.</p> : 
                    completedRequests.map(r => (
                       <div key={r.id} className="bg-[#1C1E24]/30 backdrop-blur-3xl rounded-[2rem] border border-white/[0.03] p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-2xl bg-zinc-800/40 border border-zinc-700/20 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="text-emerald-400" size={20} />
                             </div>
                             <div>
                                <div className="font-bold text-white text-sm mb-0.5">Request fulfilled</div>
                                <div className="text-[10px] text-zinc-500 font-mono tracking-wider">{formatDateTime(r.requestedAt)}</div>
                             </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 p-2.5 rounded-2xl bg-black/30 border border-white/5 md:max-w-md w-full">
                             {r.fulfillmentDetails?.lines ? (
                                 r.fulfillmentDetails.lines.map((l: any, i: number) => {
                                     const spec = specs.find(s => s.id === l.specId);
                                     const deviation = l.issuedPcs !== l.requestedPcs;
                                     return (
                                         <div key={i} className="text-xs px-2 py-1 flex flex-col gap-1 border-b border-white/5 last:border-b-0 pb-1.5 mb-1.5 last:pb-0 last:mb-0">
                                             <div className="flex items-center justify-between">
                                                 <span className="text-zinc-300 text-[10px] font-bold">{spec?.label || l.specId}</span>
                                                 <span className="font-mono text-[10px] font-bold">
                                                     Requested: {l.requestedPcs} | Issued: <span className={deviation ? "text-yellow-400 font-bold" : "text-green-400 font-bold"}>{l.issuedPcs}</span>
                                                 </span>
                                             </div>
                                             {deviation && (
                                                 <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] p-2 rounded-lg font-sans">
                                                     {l.issuedPcs} pieces were issued. The remaining requested quantity was not fulfilled. Submit a new request if additional stones are still required.
                                                     {l.explanation && <span className="block mt-1 text-zinc-400 italic font-medium">Manager note: "{l.explanation}"</span>}
                                                 </div>
                                             )}
                                         </div>
                                     );
                                 })
                             ) : (
                                 r.lines.map((l, i) => {
                                    const spec = specs.find(s => s.id === l.specId);
                                    return (
                                        <div key={i} className="text-[10px] bg-white/5 px-2 py-1 rounded-lg text-zinc-300 font-mono font-bold flex items-center gap-1.5 border border-white/5 whitespace-nowrap">
                                            <span className="text-zinc-400">{l.requestedPcs}x</span> 
                                            <span className="text-zinc-500 font-sans tracking-tight">{spec?.label}</span>
                                        </div>
                                    )
                                 })
                             )}
                          </div>
                          
                          <div className="shrink-0 flex justify-end">
                             <StatusPill status={r.status} />
                          </div>
                       </div>
                    ))
                 }
                </div>
             </div>
          </div>
      )}

      {/* TAB CONTENT: SERVICES & ACTIVITY */}
      {activeTab === 'design' && (
          <div className="space-y-6 animate-enter">
              <Card className="p-5">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><LayoutTemplate size={18}/> Services</h3>
                  <div className="space-y-2">
                     {project.services && project.services.length > 0 ? (project.services as any[]).map((rawService, idx) => {
                        const s = typeof rawService === 'string' ? { name: rawService, status: 'PENDING' } : rawService;
                        return (
                        <div key={idx} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                           <span className="font-medium text-zinc-300">{s.name}</span>
                           <button
                             onClick={() => canModifyProject && project.status === ProjectStatus.ACTIVE && handleServiceStatusToggle(s.name)}
                             disabled={!canModifyProject || project.status !== ProjectStatus.ACTIVE}
                             className={`px-3 py-1 rounded-2xl text-xs font-bold transition-all border disabled:cursor-default ${s.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border-green-500/20' : s.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}
                           >
                              {s.status.replace('_', ' ')}
                           </button>
                        </div>
                        );
                     }) : <p className="text-zinc-500 text-sm">No services listed.</p>}
                  </div>
              </Card>

              {canModifyProject && project.status === ProjectStatus.ACTIVE && <div className="bg-black/20 border border-zinc-800 rounded-3xl p-3 sm:p-4 shadow-sm relative">
                  <div className="space-y-3 relative">
                     <textarea 
                       ref={textareaRef}
                       className="w-full bg-black/50 border border-zinc-800 rounded-3xl p-3 sm:p-4 text-white text-sm focus:border-lux-gold focus:ring-1 focus:ring-lux-gold/50 min-h-[100px] transition-all resize-none placeholder:text-zinc-600"
                       placeholder="Write a note, attach a design, or log an update..."
                       value={newNote}
                       onChange={handleNoteChange}
                       onKeyDown={handleNoteKeyDown}
                     />
                     {mentionQuery !== null && (
                       <div className="absolute z-10 bg-zinc-800 border border-zinc-700 rounded-3xl shadow-xl w-[calc(100%-1.5rem)] sm:w-64 max-h-48 overflow-y-auto" style={{ top: '100px', left: '12px' }}>
                         {store.getUsers().filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).length > 0 ? (
                           store.getUsers().filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).map((u, idx) => (
                             <button
                               key={u.id}
                               className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${idx === mentionIndex ? 'bg-lux-gold/20 text-lux-gold' : 'text-zinc-300 hover:bg-zinc-700'}`}
                               onClick={() => insertMention(u.name)}
                             >
                               <SetterAvatar name={u.name} size="sm" />
                               {u.name}
                             </button>
                           ))
                         ) : (
                           <div className="px-4 py-2 text-sm text-zinc-500">No users found</div>
                         )}
                       </div>
                     )}
                     <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center pt-2 gap-3 sm:gap-0">
                        <div className="flex gap-2">
                           <button onClick={() => document.getElementById('note-upload')?.click()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-zinc-400 hover:text-white rounded-3xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-xs font-medium">
                               <Paperclip size={16}/> Attach Image
                           </button>
                           <input type="file" id="note-upload" className="hidden" accept="image/*" onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if(file) {
                                  try {
                                      const compressedBase64 = await compressImage(file);
                                      setNewNoteImage(compressedBase64);
                                  } catch (error) {
                                      console.error("Error compressing image:", error);
                                      alert("Failed to process image. Please try another one.");
                                  }
                              }
                           }} />
                        </div>
                        <div className="flex gap-2">
                           {(newNote || newNoteImage) && (
                               <Button className="flex-1 sm:flex-none" size="sm" variant="ghost" onClick={() => { setNewNote(''); setNewNoteImage(undefined); }}>Clear</Button>
                           )}
                           <Button className="flex-1 sm:flex-none" size="sm" onClick={submitNote} disabled={!newNote && !newNoteImage} loading={loadingAction} icon={<Send size={14}/>}>Post Update</Button>
                        </div>
                     </div>
                     {newNoteImage && (
                        <div className="relative inline-block mt-4 p-2 bg-black/40 rounded-3xl border border-zinc-800">
                           <img src={newNoteImage} className="h-24 object-cover rounded-2xl" />
                           <button onClick={() => setNewNoteImage(undefined)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-400 text-white rounded-full p-1 shadow-lg transition-colors"><X size={14}/></button>
                        </div>
                     )}
                  </div>
              </div>}

              {/* Casting History Timeline */}
              {project.castingEvents && project.castingEvents.length > 0 && (
                  <div className="space-y-6 mt-8">
                      <h4 className="text-xs font-bold text-lux-gold uppercase tracking-widest px-2 flex items-center gap-2">
                          <Box size={14}/> Casting History
                      </h4>
                      <div className="space-y-4 px-2 sm:px-0">
                          {project.castingEvents.map((event, i) => (
                              <div key={i} className="relative pl-6 border-l border-zinc-800 pb-4 last:pb-0">
                                  <div className={`absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-[#16171D] ${event.receivedAt ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                  <div className="bg-black/20 border border-zinc-800 rounded-2xl p-4 transition-all hover:border-zinc-700">
                                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                                          <div className="flex items-center gap-2">
                                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                                  event.receivedAt ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                              }`}>
                                                  Cycle #{event.cycleNumber} {event.receivedAt ? 'Received' : 'Sent'}
                                              </span>
                                              <span className="text-[10px] text-zinc-500 font-mono">{formatDateTime(event.receivedAt || event.sentAt)}</span>
                                          </div>
                                          {event.receivedWeightG && (
                                              <div className="text-xs font-bold text-white font-mono">
                                                  {event.receivedWeightG.toFixed(2)}g received
                                              </div>
                                          )}
                                      </div>
                                      
                                      <div className="flex flex-wrap gap-2">
                                          {event.goldComponentIds && event.goldComponentIds.length > 0 ? (
                                              event.goldComponentIds.map(cid => {
                                                  const comp = project.goldComponents?.find(c => c.id === cid);
                                                  return (
                                                      <div key={cid} className="text-[10px] bg-white/5 border border-white/5 px-2 py-1 rounded-lg text-zinc-400 flex items-center gap-1.5">
                                                          <div className="w-1.5 h-1.5 rounded-full bg-lux-gold/50"></div>
                                                          {comp?.label || 'Component'}
                                                      </div>
                                                  );
                                              })
                                          ) : (
                                              <div className="text-[10px] text-zinc-600 italic">All components</div>
                                          )}
                                      </div>
                                      
                                      {event.notes && (
                                          <div className="mt-2 text-[10px] text-zinc-500 italic bg-black/40 p-2 rounded-xl border border-white/5">
                                              "{event.notes}"
                                          </div>
                                      )}
                                      {event.condition && event.condition !== 'CORRECT' && (
                                          <div className="mt-2 text-[10px] text-red-400 font-bold uppercase tracking-widest">
                                              Condition: {event.condition}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              <div className="space-y-6 mt-8">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">Log History</h4>
                 {(!project.designLogs || project.designLogs.length === 0) ? (
                    <div className="text-center py-12 bg-black/20 border border-zinc-800/50 rounded-3xl border-dashed mx-2 sm:mx-0">
                        <StickyNote className="mx-auto h-8 w-8 text-zinc-600 mb-3" />
                        <p className="text-zinc-400 text-sm">No design notes or logs yet.</p>
                        <p className="text-zinc-600 text-xs mt-1">Updates posted here will be visible to the team.</p>
                    </div>
                 ) : (
                     <div className="space-y-4 px-2 sm:px-0">
                         {[...(project.designLogs || [])].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((log, i) => {
                            const user = store.getUser(log.createdById);
                            const isMe = user?.id === currentUser.id;
                            
                            return (
                                <div key={i} className={`flex gap-2 sm:gap-4 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                   <div className="flex-shrink-0 mt-1">
                                       <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] sm:text-xs font-bold text-zinc-400 uppercase">
                                           {user?.name?.substring(0, 2) || 'U'}
                                       </div>
                                   </div>
                                   <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[90%] sm:max-w-[85%]`}>
                                       <div className="flex items-center gap-2 mb-1 px-1">
                                           <span className="text-[10px] sm:text-xs font-medium text-zinc-400">{isMe ? 'You' : user?.name}</span>
                                           <span className="text-[9px] sm:text-[10px] text-zinc-600">{formatDateTime(log.createdAt)}</span>
                                       </div>
                                       <div className={`p-3 sm:p-4 rounded-3xl ${isMe ? 'bg-lux-gold/10 border border-lux-gold/20 text-white rounded-tr-sm' : 'bg-black/20 border border-zinc-800 text-zinc-200 rounded-tl-sm'}`}>
                                          {log.note && <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words">{log.note}</p>}
                                          {log.attachment && (
                                             <img src={log.attachment} className="mt-2 sm:mt-3 rounded-2xl max-h-48 sm:max-h-64 w-full object-cover border border-zinc-700/50 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(log.attachment, '_blank')} />
                                          )}
                                       </div>
                                   </div>
                                </div>
                            );
                         })}
                     </div>
                 )}
              </div>
          </div>
      )}

      {/* TAB CONTENT: PHOTOS */}
      {activeTab === 'photos' && (
          <div className="space-y-6 animate-enter">
              <div className="flex justify-between items-center">
                  <h3 className="font-bold text-white">Project Gallery</h3>
                  {canModifyProject && project.status === ProjectStatus.ACTIVE && <Button size="sm" onClick={() => setIsUploadingPhoto(true)} icon={<Camera size={16}/>}>Add Photo</Button>}
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
                      <div key={idx} className="aspect-square rounded-3xl overflow-hidden relative group border border-zinc-800 bg-black shadow-lg cursor-pointer" onClick={() => setLightboxIndex(idx)}>
                          <img src={photo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button onClick={(e) => {e.stopPropagation(); setLightboxIndex(idx)}} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white hidden lg:block"><ZoomIn size={18}/></button>
                              {canModifyProject && project.status === ProjectStatus.ACTIVE && <button onClick={(e) => {e.stopPropagation(); initiateDeletePhoto(idx)}} className="p-2 bg-red-500/20 rounded-full hover:bg-red-500 text-red-200 hidden lg:block"><Trash2 size={18}/></button>}
                          </div>
                          {canModifyProject && project.status === ProjectStatus.ACTIVE && <button onClick={(e) => {e.stopPropagation(); initiateDeletePhoto(idx)}} className="absolute top-2 right-2 p-2 bg-black/60 rounded-full text-red-400 lg:hidden shadow-lg border border-white/10"><Trash2 size={16}/></button>}
                      </div>
                  ))}
                  {(!project.projectPhotos || project.projectPhotos.length === 0) && (
                      <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl">
                          <ImageIcon size={32} className="mx-auto mb-2 opacity-50"/>
                          <p>No photos added yet</p>
                      </div>
                  )}
              </div>

              {currentUser?.role === Role.MANAGER && (
                  <>
                      <hr className="border-white/5 my-8" />
                      <div className="space-y-6">
                          <div className="flex justify-between items-center">
                              <h3 className="font-bold text-white">Diamond Evidence</h3>
                          </div>
                          
                          {/* Filters Control Panel */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-black/30 rounded-3xl border border-white/5">
                              <div>
                                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Evidence Type</label>
                                  <select 
                                      value={evidenceFilterType} 
                                      onChange={e => setEvidenceFilterType(e.target.value as any)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-lux-gold"
                                  >
                                      <option value="ALL">All Types</option>
                                      <option value="ISSUE">Manager Bag Issue</option>
                                      <option value="RETURN">Setter Return</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Bag Number</label>
                                  <input 
                                      type="text" 
                                      placeholder="Search bag..." 
                                      value={evidenceFilterBag} 
                                      onChange={e => setEvidenceFilterBag(e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-lux-gold font-mono"
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Uploaded By</label>
                                  <select 
                                      value={evidenceFilterUploader} 
                                      onChange={e => setEvidenceFilterUploader(e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-lux-gold"
                                  >
                                      <option value="ALL">All Uploaders</option>
                                      {store.getUsers().map(u => (
                                          <option key={u.id} value={u.id}>{u.name}</option>
                                      ))}
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">From Date</label>
                                  <input 
                                      type="date" 
                                      value={evidenceFilterDateFrom} 
                                      onChange={e => setEvidenceFilterDateFrom(e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-lux-gold"
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">To Date</label>
                                  <input 
                                      type="date" 
                                      value={evidenceFilterDateTo} 
                                      onChange={e => setEvidenceFilterDateTo(e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-lux-gold"
                                  />
                              </div>
                          </div>

                          {/* Grid of Evidence Cards */}
                          {(() => {
                              const filtered = store.getEvidenceImages().filter(ev => {
                                  if (ev.projectId !== project?.id) return false;
                                  if (evidenceFilterType !== 'ALL' && ev.transactionType !== evidenceFilterType) return false;
                                  if (evidenceFilterBag.trim() && !ev.bagNumber.toLowerCase().includes(evidenceFilterBag.trim().toLowerCase())) return false;
                                  if (evidenceFilterUploader !== 'ALL' && ev.uploaderId !== evidenceFilterUploader) return false;
                                  if (evidenceFilterDateFrom && ev.uploadedAt.substring(0, 10) < evidenceFilterDateFrom) return false;
                                  if (evidenceFilterDateTo && ev.uploadedAt.substring(0, 10) > evidenceFilterDateTo) return false;
                                  return true;
                              }).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

                              const pageItems = filtered.slice(0, evidenceLimit);

                              if (filtered.length === 0) {
                                  return (
                                      <div className="py-12 text-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl bg-transparent">
                                          <ImageIcon size={32} className="mx-auto mb-2 opacity-50"/>
                                          <p>No diamond evidence found matching the filters.</p>
                                      </div>
                                  );
                              }

                              return (
                                  <div className="space-y-6">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                          {pageItems.map((ev) => (
                                              <div 
                                                  key={ev.id} 
                                                  className="bg-[#1C1E24]/60 backdrop-blur-3xl rounded-[2rem] border border-white/[0.05] p-4 relative overflow-hidden transition-all hover:bg-[#252830]/80 flex flex-col justify-between h-[320px] group cursor-pointer"
                                                  onClick={() => { setSelectedEvidence(ev); setSelectedVersionIndex(null); }}
                                              >
                                                  <div className="aspect-square w-full rounded-2xl overflow-hidden relative border border-zinc-800 bg-black shrink-0 h-[150px]">
                                                      <img 
                                                          src={ev.thumbnailUrl || ev.photoUrl} 
                                                          loading="lazy" 
                                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                                          alt={`Bag #${ev.bagNumber}`}
                                                      />
                                                      <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                                                          v{ev.version}
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="flex-1 flex flex-col justify-between pt-3">
                                                      <div>
                                                          <div className="flex justify-between items-center mb-1">
                                                              <span className="text-[10px] font-extrabold text-lux-gold uppercase tracking-wider">
                                                                  {ev.transactionType === 'ISSUE' ? 'Bag Issue' : 'Setter Return'}
                                                              </span>
                                                              <span className="text-[10px] font-bold text-zinc-400 font-mono">
                                                                  Bag #{ev.bagNumber}
                                                              </span>
                                                          </div>
                                                          <div className="text-white font-bold text-xs truncate">
                                                              By {ev.uploaderName}
                                                          </div>
                                                          <div className="text-[10px] text-zinc-500 mt-0.5">
                                                              {new Date(ev.uploadedAt).toLocaleString()}
                                                          </div>
                                                      </div>
                                                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                                          <span className="text-[9px] uppercase font-semibold text-zinc-400">
                                                              Status: {ev.transactionStatus}
                                                          </span>
                                                          <span className="text-[10px] font-bold text-lux-gold group-hover:underline flex items-center gap-1">
                                                              View Details
                                                          </span>
                                                      </div>
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                      {filtered.length > evidenceLimit && (
                                          <div className="text-center">
                                              <Button variant="secondary" size="sm" onClick={() => setEvidenceLimit(prev => prev + 8)}>Load More</Button>
                                          </div>
                                      )}
                                  </div>
                              );
                          })()}
                      </div>
                  </>
              )}
          </div>
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && project.projectPhotos && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setLightboxIndex(null)}>
           <div className="absolute top-4 right-4 flex gap-4 items-center">
               {canModifyProject && project.status === ProjectStatus.ACTIVE && <button onClick={(e) => {e.stopPropagation(); initiateDeletePhoto(lightboxIndex);}} className="p-2 bg-red-500/20 rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-colors border border-red-500/30 shadow-lg"><Trash2 size={24}/></button>}
               <button className="p-2 text-white/50 hover:text-white bg-black/50 rounded-full"><X size={32}/></button>
           </div>
           <img src={project.projectPhotos[lightboxIndex]} className="max-h-full max-w-full rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Delete Photo Modal */}
      {isDeletingPhoto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-end md:items-center justify-center p-4 sm:p-0">
           <Card className="w-full max-w-sm p-6 mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95">
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4 sm:p-0">
           <Card className="w-full max-w-lg md:max-w-3xl p-6 max-h-[85vh] flex flex-col mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95">
              <h3 className="font-bold text-white text-lg mb-4">Request Diamonds for {project?.code}</h3>
              <div className="flex-1 overflow-y-auto mb-4">
                 <FastEntryGrid specs={specs.filter(s => !s.location || s.location === 'Melee')} onLinesChange={setRequestLines} mode="PCS" />
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4 sm:p-0">
           <Card className="w-full max-w-lg md:max-w-4xl p-6 max-h-[85vh] flex flex-col mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95 overflow-hidden">
              <h3 className="font-bold text-white text-lg mb-4">Return Diamonds for {project?.code}</h3>
              
              <div className="flex-1 overflow-y-auto mb-4 space-y-6 pr-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          {(() => {
                              const issuedBagsForReturn = store.getBags().filter(b => b.projectId === project?.id && b.status === BagStatus.ISSUED);
                              if (issuedBagsForReturn.length === 0) {
                                  return (
                                      <div className="bg-red-950/30 border border-red-900/50 p-3 rounded-xl flex items-start gap-2 text-red-500 text-sm h-full">
                                          <AlertCircle className="w-5 h-5 shrink-0" />
                                          <p>No issued bags are available for this project. A Diamond Return cannot be created.</p>
                                      </div>
                                  );
                              }
                              return (
                                  <>
                                      <label className="block text-sm font-medium text-zinc-500 mb-2">Select Bag Number *</label>
                                      <div className="relative">
                                          <input 
                                             ref={returnInputRef}
                                             list="issued-bags-list"
                                             value={returnBagNum} 
                                             onChange={e => {
                                                 setReturnBagNum(e.target.value);
                                                 setReturnLines([]); // Clear entries on bag change
                                             }} 
                                             placeholder="Search bag..."
                                             className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 font-mono text-center text-xl transition-colors"
                                          />
                                          <datalist id="issued-bags-list">
                                             {issuedBagsForReturn.map(b => (
                                                <option key={b.id} value={b.bagNumber} />
                                             ))}
                                          </datalist>
                                      </div>
                                  </>
                              );
                          })()}
                      </div>
                      <div>
                          <Input 
                             label="Notes (Optional)" 
                             value={returnNotes} 
                             onChange={e => setReturnNotes(e.target.value)} 
                             placeholder="e.g. Broken stones included"
                             className="h-[52px]"
                          />
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-zinc-500 mb-2">Return Items</label>
                      
                      {(() => {
                          const cleanBagNum = returnBagNum.replace(/#/g, '').trim().toLowerCase();
                          const selectedBagForReturn = store.getBags().find(b => b.projectId === project?.id && b.status === BagStatus.ISSUED && b.bagNumber.toLowerCase() === cleanBagNum);
                          
                          if (!selectedBagForReturn) {
                              return (
                                  <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/50 rounded-xl border border-zinc-800 border-dashed">
                                       <Package className="w-8 h-8 text-zinc-600 mb-3" />
                                       <p className="text-zinc-400 text-sm">Select a bag number above to load the returnable diamonds.</p>
                                  </div>
                              );
                          }
                          
                          let hasOverReturn = false;
                          let totalAvailable = 0;
                          
                          return (
                              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                                  <div className="overflow-x-auto">
                                       <table className="w-full text-sm text-left whitespace-nowrap">
                                            <thead className="bg-zinc-800/50 text-zinc-400">
                                                <tr>
                                                   <th className="px-4 py-3 font-medium">Diamond Spec</th>
                                                   <th className="px-4 py-3 font-medium text-right">Original Issued</th>
                                                   <th className="px-4 py-3 font-medium text-right">Confirmed Returned</th>
                                                   <th className="px-4 py-3 font-medium text-right">Available</th>
                                                   <th className="px-4 py-3 font-medium text-right">Return Now (pcs)</th>
                                                   <th className="px-4 py-3 font-medium text-right">Est. Carats</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedBagForReturn.items.map((item, idx) => {
                                                    const spec = specs.find(s => s.id === item.specId);
                                                    if (!spec) return null;
                                                    
                                                    const previouslyConfirmed = (selectedBagForReturn.returns || [])
                                                        .filter(r => r.status === 'CONFIRMED')
                                                        .reduce((sum, r) => sum + (r.lines.find(l => l.specId === item.specId)?.returnedPcs || 0), 0);
                                                        
                                                    const available = item.issuedPcs - previouslyConfirmed;
                                                    totalAvailable += available;
                                                    
                                                    const currentReturnLine = returnLines.find(l => l.specId === item.specId) as any;
                                                    const returnNowVal = currentReturnLine ? currentReturnLine.pcs : 0;
                                                    if (returnNowVal > available) hasOverReturn = true;
                                                    
                                                    const estCarats = (returnNowVal * (spec.ctPerStone || 0)).toFixed(3);
                                                    
                                                    return (
                                                        <tr key={item.specId} className={idx === 0 ? "" : "border-t border-zinc-800/50"}>
                                                            <td className="px-4 py-3 text-white font-medium">{spec.shape} {spec.sizeMm}</td>
                                                            <td className="px-4 py-3 text-right text-zinc-400">{item.issuedPcs}</td>
                                                            <td className="px-4 py-3 text-right text-zinc-400">{previouslyConfirmed}</td>
                                                            <td className="px-4 py-3 text-right text-emerald-400 font-medium">{available}</td>
                                                            <td className="px-4 py-3 text-right">
                                                                <input 
                                                                    type="number"
                                                                    min="0"
                                                                    max={available}
                                                                    value={returnNowVal || ''}
                                                                    onChange={e => {
                                                                        let val = parseInt(e.target.value) || 0;
                                                                        if (val < 0) val = 0;
                                                                        
                                                                        setReturnLines(prev => {
                                                                            const prevLines = prev as any[];
                                                                            const existing = prevLines.find(p => p.specId === item.specId);
                                                                            if (existing) {
                                                                                return prevLines.map(p => p.specId === item.specId ? { ...p, pcs: val } : p) as any;
                                                                            } else {
                                                                                return [...prevLines, { specId: item.specId, pcs: val }] as any;
                                                                            }
                                                                        });
                                                                    }}
                                                                    className={`w-24 bg-zinc-950 border rounded-lg px-3 py-2 text-white text-right focus:border-blue-500 focus:outline-none transition-colors ${returnNowVal > available ? 'border-red-500/50' : 'border-zinc-700'}`}
                                                                    placeholder="0"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-zinc-500 font-mono">{estCarats}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                       </table>
                                  </div>
                                  
                                  {hasOverReturn && (
                                      <div className="m-4 bg-red-950/30 border border-red-900/50 p-3 rounded-xl flex items-start gap-2 text-red-500 text-sm">
                                          <AlertCircle className="w-5 h-5 shrink-0" />
                                          <p>You cannot return more than the available quantity from this issued bag.</p>
                                      </div>
                                  )}
                                  
                                  {totalAvailable === 0 && (
                                      <div className="m-4 bg-amber-950/30 border border-amber-900/50 p-3 rounded-xl flex items-start gap-2 text-amber-500 text-sm">
                                          <AlertCircle className="w-5 h-5 shrink-0" />
                                          <p>No diamonds are currently available to return from this issued bag.</p>
                                      </div>
                                  )}
                              </div>
                          );
                      })()}
                  </div>

                  <ImageUpload label="Required Bag Photo" required value={returnPhoto} onChange={(base64, src) => { setReturnPhoto(base64); setReturnPhotoSource(src); }} />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800 shrink-0">
                 <Button variant="secondary" onClick={() => setIsReturning(false)}>Cancel</Button>
                 {(() => {
                      const cleanBagNum = returnBagNum.replace(/#/g, '').trim().toLowerCase();
                      const selectedBagForReturn = store.getBags().find(b => b.projectId === project?.id && b.status === BagStatus.ISSUED && b.bagNumber.toLowerCase() === cleanBagNum);
                      
                      let hasOverReturn = false;
                      let hasTotalAvailable = false;
                      
                      if (selectedBagForReturn) {
                          hasTotalAvailable = selectedBagForReturn.items.some(item => {
                              const previouslyConfirmed = (selectedBagForReturn.returns || [])
                                  .filter(r => r.status === 'CONFIRMED')
                                  .reduce((sum, r) => sum + (r.lines.find(l => l.specId === item.specId)?.returnedPcs || 0), 0);
                              return (item.issuedPcs - previouslyConfirmed) > 0;
                          });
                          
                          hasOverReturn = selectedBagForReturn.items.some(item => {
                              const previouslyConfirmed = (selectedBagForReturn.returns || [])
                                  .filter(r => r.status === 'CONFIRMED')
                                  .reduce((sum, r) => sum + (r.lines.find(l => l.specId === item.specId)?.returnedPcs || 0), 0);
                              const available = item.issuedPcs - previouslyConfirmed;
                              const currentReturnLine = returnLines.find(l => l.specId === item.specId) as any;
                              const returnNowVal = currentReturnLine ? currentReturnLine.pcs : 0;
                              return returnNowVal > available;
                          });
                      }
                      
                      const validLines = returnLines.filter((l: any) => l.pcs > 0);
                      const isSendDisabled = !returnPhoto || validLines.length === 0 || !selectedBagForReturn || hasOverReturn || !hasTotalAvailable;
                      
                      return (
                         <Button 
                            onClick={submitReturn} 
                            loading={loadingAction} 
                            disabled={isSendDisabled}
                         >
                            Send Return
                         </Button>
                      );
                 })()}
              </div>
           </Card>
        </div>
      )}

      {/* Evidence Details Modal */}
      {selectedEvidence && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
           <Card className="w-full max-w-4xl p-6 max-h-[90vh] flex flex-col animate-in zoom-in-95 overflow-y-auto bg-[#1C1E24] border border-white/10">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                 <div>
                    <h3 className="font-bold text-white text-lg flex items-center gap-2">
                       <span className="text-lux-gold font-extrabold uppercase tracking-wider text-sm">
                          {selectedEvidence.transactionType === 'ISSUE' ? 'Manager Bag Issue' : 'Setter Return'}
                       </span>
                       <span>Evidence Detail (Bag #{selectedEvidence.bagNumber})</span>
                    </h3>
                    <p className="text-[11px] text-zinc-500 font-mono mt-1">Evidence ID: {selectedEvidence.id}</p>
                 </div>
                 <button 
                     onClick={() => {
                         setSelectedEvidence(null);
                         setIsCorrectingEvidence(false);
                         setCorrectionPhoto(undefined);
                         setCorrectionReason('');
                     }} 
                     className="text-zinc-500 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors"
                 >
                     <X size={24}/>
                 </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 overflow-y-auto pr-2">
                 {/* Left Column: Image Viewer & History versions */}
                 <div className="space-y-4">
                    {(() => {
                        const isViewingHistory = selectedVersionIndex !== null;
                        const currentViewedVersion = isViewingHistory && selectedEvidence.replacementHistory ? selectedEvidence.replacementHistory[selectedVersionIndex] : null;

                        const displayPhoto = currentViewedVersion ? currentViewedVersion.photoUrl : selectedEvidence.photoUrl;
                        const displaySource = currentViewedVersion ? currentViewedVersion.imageSource : selectedEvidence.imageSource;
                        const displayVersion = currentViewedVersion ? (selectedVersionIndex! + 1) : selectedEvidence.version;
                        const displayDate = currentViewedVersion ? currentViewedVersion.replacedAt : selectedEvidence.uploadedAt;
                        const displayUploader = currentViewedVersion ? currentViewedVersion.replacedByName : selectedEvidence.uploaderName;

                        return (
                           <>
                              <div className="aspect-square w-full rounded-3xl overflow-hidden relative border border-zinc-800 bg-black flex items-center justify-center">
                                 {displayPhoto ? (
                                    <img src={displayPhoto} className="w-full h-full object-contain" alt={`Evidence version ${displayVersion}`} />
                                 ) : (
                                    <div className="text-zinc-600 text-sm">No Photo Captured</div>
                                 )}
                                 <div className="absolute top-4 left-4 bg-lux-gold text-black font-extrabold text-xs px-3 py-1 rounded-full shadow-lg border border-black/10">
                                    Version {displayVersion} {isViewingHistory ? '(ARCHIVED)' : '(ACTIVE)'}
                                 </div>
                              </div>
                              
                              {/* Version History Selector */}
                              {selectedEvidence.replacementHistory && selectedEvidence.replacementHistory.length > 0 && (
                                 <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-2">
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Version History (Audit)</div>
                                    <div className="flex flex-wrap gap-2">
                                       <button 
                                          onClick={() => setSelectedVersionIndex(null)}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${selectedVersionIndex === null ? 'bg-lux-gold text-black border-lux-gold' : 'bg-zinc-850 hover:bg-zinc-800 text-white border-zinc-750'}`}
                                       >
                                          v{selectedEvidence.version} (Active)
                                       </button>
                                       {selectedEvidence.replacementHistory.map((h, hIdx) => (
                                          <button
                                             key={hIdx}
                                             onClick={() => setSelectedVersionIndex(hIdx)}
                                             className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${selectedVersionIndex === hIdx ? 'bg-lux-gold text-black border-lux-gold' : 'bg-zinc-850 hover:bg-zinc-800 text-white border-zinc-750'}`}
                                          >
                                             v{hIdx + 1}
                                          </button>
                                       ))}
                                    </div>
                                    {isViewingHistory && currentViewedVersion && (
                                       <div className="mt-3 p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-[11px] text-zinc-400">
                                          <div className="font-bold text-red-400 uppercase tracking-wider text-[9px] mb-1">Archived Version Metadata</div>
                                          <div><strong>Replaced At:</strong> {new Date(currentViewedVersion.replacedAt).toLocaleString()}</div>
                                          <div><strong>Replaced By:</strong> {currentViewedVersion.replacedByName}</div>
                                          <div className="mt-1 bg-black/20 p-2 rounded border border-white/5 italic">
                                             "{currentViewedVersion.reason}"
                                          </div>
                                       </div>
                                    )}
                                 </div>
                              )}
                           </>
                        );
                    })()}
                 </div>
                 
                 {/* Right Column: Metadata Details & Image Correction Form */}
                 <div className="space-y-6 flex flex-col justify-between">
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-3">
                             <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Project Code</div>
                             <div className="text-white font-bold text-sm mt-0.5">{project?.code}</div>
                          </div>
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-3">
                             <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Client Name</div>
                             <div className="text-white font-bold text-sm mt-0.5">{project?.clientName || '-'}</div>
                          </div>
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-3">
                             <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Uploader</div>
                             <div className="text-white font-bold text-sm mt-0.5">
                                {selectedVersionIndex !== null && selectedEvidence.replacementHistory 
                                   ? selectedEvidence.replacementHistory[selectedVersionIndex].replacedByName 
                                   : selectedEvidence.uploaderName}
                             </div>
                          </div>
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-3">
                             <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Upload Date</div>
                             <div className="text-white font-bold text-xs mt-0.5">
                                {new Date(selectedVersionIndex !== null && selectedEvidence.replacementHistory 
                                   ? selectedEvidence.replacementHistory[selectedVersionIndex].replacedAt 
                                   : selectedEvidence.uploadedAt).toLocaleString()}
                             </div>
                          </div>
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-3">
                             <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Image Source</div>
                             <div className="text-white font-bold text-sm mt-0.5">
                                {selectedVersionIndex !== null && selectedEvidence.replacementHistory 
                                   ? selectedEvidence.replacementHistory[selectedVersionIndex].imageSource 
                                   : selectedEvidence.imageSource}
                             </div>
                          </div>
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-3">
                             <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Transaction Status</div>
                             <div className="text-white font-bold text-sm mt-0.5">{selectedEvidence.transactionStatus}</div>
                          </div>
                       </div>

                       {/* Relevant Diamond Values */}
                       <div className="bg-black/20 border border-white/5 rounded-2xl p-4">
                          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">Relevant Diamond Values</div>
                          <div className="space-y-1">
                             {(() => {
                                 let itemsHtml: React.ReactNode[] = [];
                                 if (selectedEvidence.transactionType === 'ISSUE') {
                                     const bag = store.getBags().find(b => b.id === selectedEvidence.transactionId);
                                     if (bag) {
                                         itemsHtml = bag.items.map((item, idx) => {
                                             const spec = specs.find(s => s.id === item.specId);
                                             return (
                                                <div key={idx} className="text-xs text-zinc-300 flex justify-between font-mono">
                                                   <span>{spec?.shape || 'RD'} {spec?.sizeMm || '-'}mm</span>
                                                   <span className="font-bold text-white">{item.issuedPcs} pcs ({(item.issuedPcs * (spec?.ctPerStone || 0)).toFixed(3)} ct)</span>
                                                </div>
                                             );
                                         });
                                     }
                                 } else {
                                     const bag = store.getBags().find(b => b.id === selectedEvidence.bagId);
                                     const retTx = bag?.returns?.find(r => r.id === selectedEvidence.transactionId);
                                     if (retTx) {
                                         itemsHtml = retTx.lines.map((l, idx) => {
                                             const spec = specs.find(s => s.id === l.specId);
                                             return (
                                                <div key={idx} className="text-xs text-zinc-300 flex justify-between font-mono">
                                                   <span>{spec?.shape || 'RD'} {spec?.sizeMm || '-'}mm</span>
                                                   <span className="font-bold text-white">{l.returnedPcs} pcs ({(l.returnedPcs * (spec?.ctPerStone || 0)).toFixed(3)} ct)</span>
                                                </div>
                                             );
                                         });
                                     }
                                 }

                                 if (itemsHtml.length === 0) {
                                     return <div className="text-xs text-zinc-500 italic">No diamond values found for this transaction.</div>;
                                 }

                                 return itemsHtml;
                             })()}
                          </div>
                       </div>
                    </div>

                    {/* Image Correction Flow (Manager Only, Active Version Only) */}
                    {currentUser.role === Role.MANAGER && selectedVersionIndex === null && (
                       <div className="border-t border-white/5 pt-4">
                          {!isCorrectingEvidence ? (
                             <Button 
                                variant="secondary" 
                                className="w-full text-lux-gold border-lux-gold/20 hover:bg-lux-gold/10" 
                                onClick={() => setIsCorrectingEvidence(true)}
                             >
                                Correct / Replace Image
                             </Button>
                          ) : (
                             <div className="space-y-4 animate-in fade-in duration-200">
                                <div className="text-xs font-bold text-lux-gold uppercase tracking-wider">Correct Evidence Image</div>
                                <ImageUpload 
                                   label="Select New Photo" 
                                   required 
                                   value={correctionPhoto} 
                                   onChange={(base64, src) => { setCorrectionPhoto(base64); setCorrectionPhotoSource(src); }} 
                                />
                                <div className="space-y-1.5">
                                   <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Correction Reason *</label>
                                   <textarea
                                      required
                                      value={correctionReason}
                                      onChange={e => setCorrectionReason(e.target.value)}
                                      placeholder="Explain why this image is being replaced..."
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-xs text-white focus:outline-none focus:border-lux-gold min-h-[70px] resize-none"
                                   />
                                </div>
                                <div className="flex gap-2">
                                   <Button 
                                      variant="ghost" 
                                      className="flex-1 text-xs" 
                                      onClick={() => {
                                         setIsCorrectingEvidence(false);
                                         setCorrectionPhoto(undefined);
                                         setCorrectionReason('');
                                      }}
                                   >
                                      Cancel
                                   </Button>
                                   <Button 
                                      className="flex-1 text-xs"
                                      disabled={!correctionPhoto || !correctionReason.trim()}
                                      loading={isSubmittingCorrection}
                                      onClick={async () => {
                                         if (!correctionPhoto || !correctionReason.trim()) return;
                                         setIsSubmittingCorrection(true);
                                         try {
                                            await store.correctEvidence(
                                               selectedEvidence.id,
                                               correctionPhoto,
                                               correctionPhotoSource || 'Camera',
                                               correctionReason,
                                               currentUser.id
                                            );
                                            showToast("Evidence Corrected Successfully ✓");
                                            
                                            // Refresh UI and local selected state
                                            const updatedEv = store.getEvidenceImages().find(e => e.id === selectedEvidence.id);
                                            setSelectedEvidence(updatedEv || null);
                                            
                                            setIsCorrectingEvidence(false);
                                            setCorrectionPhoto(undefined);
                                            setCorrectionReason('');
                                         } catch (err: any) {
                                            console.error(err);
                                            showToast(err.message || "Failed to correct evidence.");
                                         } finally {
                                            setIsSubmittingCorrection(false);
                                         }
                                      }}
                                   >
                                      Submit Correction
                                   </Button>
                                </div>
                             </div>
                          )}
                       </div>
                    )}
                 </div>
              </div>
           </Card>
        </div>
      )}

      {/* Assign Modal */}
      {isAssigning && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <Card className="w-full max-w-md p-6">
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4 sm:p-0">
             <Card className="w-full max-w-sm p-6 mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95">
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
                         {store.getUsers().filter(u => u.active && [Role.DESIGNER, Role.SETTER, Role.JEWELLER].includes(u.role) && u.id !== currentUser.id).map(u => (
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4 sm:p-0">
             <Card className="w-full max-w-sm p-6 mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95">
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center p-4 sm:p-0">
              <Card className="w-full max-w-sm p-6 mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95">
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
                      {lastWeight && (
                          <div className="text-xs text-zinc-500 mt-2 text-center">
                              Last recorded weight: <span className="font-mono text-zinc-300">{lastWeight}g</span>
                          </div>
                      )}
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center p-4 sm:p-0">
              <div className="bg-zinc-900/90 w-full md:w-96 md:rounded-3xl rounded-t-3xl p-6 mb-safe md:mb-0 animate-in slide-in-from-bottom-10 md:zoom-in-95 max-h-[80vh] overflow-y-auto">
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

      {/* Casting Send Modal */}
      {isCastingSend && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center p-4 sm:p-0">
              <Card className="w-full max-w-sm p-6 mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95">
                  <div className="flex items-center gap-3 mb-4">
                      <Box className="text-lux-gold" size={24}/>
                      <h3 className="font-bold text-white text-lg">Send to Casting</h3>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      <p className="text-sm text-zinc-400">
                          Are you sure you want to send this project to casting? Please ensure all design files and details are finalized.
                      </p>

                      {project?.goldComponents && project.goldComponents.length > 1 && (
                          <div>
                              <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Components to Send</label>
                              <div className="space-y-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                                  <label className="flex items-center gap-3 text-sm text-white cursor-pointer">
                                      <input 
                                          type="checkbox" 
                                          className="rounded border-zinc-700 bg-zinc-900 text-lux-gold focus:ring-lux-gold w-4 h-4"
                                          checked={selectedCastingComponents.length === 0}
                                          onChange={() => setSelectedCastingComponents([])}
                                      />
                                      <span className="font-bold">All Components (sent together)</span>
                                  </label>
                                  <div className="h-px w-full bg-zinc-800" />
                                  {project.goldComponents.map(c => (
                                      <label key={c.id} className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
                                          <input 
                                              type="checkbox" 
                                              className="rounded border-zinc-700 bg-zinc-900 text-lux-gold focus:ring-lux-gold w-4 h-4"
                                              checked={selectedCastingComponents.includes(c.id)}
                                              onChange={(e) => {
                                                  if (e.target.checked) {
                                                      setSelectedCastingComponents(prev => [...prev, c.id]);
                                                  } else {
                                                      setSelectedCastingComponents(prev => prev.filter(id => id !== c.id));
                                                  }
                                              }}
                                          />
                                          {c.label || 'Component'} — <span className="opacity-60 text-xs ml-1">{c.purity} {c.type}</span>
                                      </label>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="flex justify-end gap-3">
                      <Button variant="ghost" onClick={() => setIsCastingSend(false)}>Cancel</Button>
                      <Button onClick={handleConfirmSendToCasting}>Confirm Send</Button>
                  </div>
              </Card>
          </div>
      )}

      {/* Casting Receive Modal */}
      {isCastingReceive && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center p-4 sm:p-0">
              <Card className="w-full max-w-sm p-6 mb-safe md:mb-0 animate-in slide-in-from-bottom-4 md:zoom-in-95">
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

                      {(() => {
                          const lastCastingEvent = project?.castingEvents?.[(project.castingEvents?.length || 1) - 1];
                          const receivedComponentIds = lastCastingEvent?.goldComponentIds || [];
                          const componentsToReceive = receivedComponentIds.length === 0 
                              ? (project?.goldComponents || []) 
                              : (project?.goldComponents?.filter(c => receivedComponentIds.includes(c.id)) || []);
                          const isMultiComponent = componentsToReceive.length > 1;

                          return isMultiComponent ? (
                              <div className="space-y-3">
                                  <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Received Weights (g)</label>
                                  <div className="space-y-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                                      {componentsToReceive.map(c => (
                                          <Input 
                                              key={c.id}
                                              label={`${c.label || 'Component'} (${c.purity} ${c.type})`}
                                              type="number" 
                                              step="0.01"
                                              value={castingComponentWeights[c.id] || ''} 
                                              onChange={e => setCastingComponentWeights(prev => ({ ...prev, [c.id]: e.target.value }))} 
                                              placeholder="0.00"
                                          />
                                      ))}
                                  </div>
                              </div>
                          ) : (
                              <Input 
                                 label="Received Weight (g)" 
                                 type="number" 
                                 step="0.01"
                                 value={castingWeight} 
                                 onChange={e => setCastingWeight(e.target.value)} 
                                 placeholder="0.00"
                              />
                          );
                      })()}

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
