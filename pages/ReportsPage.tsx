
import React, { useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Card, Button, Badge, StatusPill, SetterAvatar, Input } from '../components/UI';
import { ExecutiveInsightsModule } from '../components/ExecutiveInsightsModule';
import { FileBarChart, Download, X, Calendar, Search, Activity, Gem, Users, Clock, AlertOctagon, Filter, Image as ImageIcon, Box, Scale, ArrowRight, Coins, Save, Edit2, Ban, CheckCircle2, TrendingUp, Lock, FileDown, Wrench, AlertTriangle, Play, RefreshCw, Trash2, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, ZoomIn, Archive } from 'lucide-react';
import { Project, ProjectCostSummary, InventoryMovement, InventoryMovementType, Role, CastingEvent, User, ProjectStatus, RepairStatus, RepairType, DiamondSpec, DiamondLedgerTransaction, EvidenceImage } from '../types';
import { useToast } from '../App';
import { runDiamondSituationalTests, TestScenarioResult } from '../services/testHarness';
import { generateProjectPDF, generateEvidenceAppendixPDF } from '../utils/pdfGenerator';
import { getCanonicalServiceCode, getProjectServiceLabel, PROJECT_SERVICE_LABELS } from '../services/projectServiceModel';
import { ReportFilterBar, ReportMessage, ReportPagination } from '../components/reports/ReportFilterBar';
import {
  ReportFilterDefinition,
  ReportFilterState,
  clearReportFields,
  newReportFilterState,
  toPhase7Request,
} from '../services/reportFilters';
import { downloadPhase7Csv, exportPhase7ReportCsv } from '../services/reportsApi';
import { usePhase7Report } from '../services/usePhase7Report';
import { matchesPhase7Search } from '../functions/src/reports/contract';
import { generateFilteredReportPDF } from '../utils/reportPdfGenerator';
import { StaffPerformanceDashboard } from '../components/reports/StaffPerformanceDashboard';
import { DailyDiamondStatement } from '../components/reports/DailyDiamondStatement';

const ReportsPage: React.FC = () => {
  const showToast = useToast();
  const currentUser = store.getCurrentUser();
  const isManager = currentUser?.role === Role.MANAGER;
  const location = useLocation();
  const params = useParams<{ memberId?: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'inventory' | 'projects' | 'broken' | 'system' | 'weekly' | 'staff'>(() => {
    if (location.pathname.startsWith('/reports/team')) return 'staff';
    return 'inventory';
  });

  useEffect(() => {
    if (location.pathname.startsWith('/reports/team')) {
      setActiveTab('staff');
    }
  }, [location.pathname]);

  
  // --- Weekly Movement Report State ---
  const getDefaultWeekStart = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    d.setHours(0,0,0,0);
    return d.toISOString().split('T')[0];
  };
  const getDefaultWeekEnd = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 7); // Sunday
    d.setHours(23,59,59,999);
    return d.toISOString().split('T')[0];
  };
  const [weekStart, setWeekStart] = useState(getDefaultWeekStart());
  const [weekEnd, setWeekEnd] = useState(getDefaultWeekEnd());
  const [ledgerTxs, setLedgerTxs] = useState<DiamondLedgerTransaction[]>([]);
  const [weeklyFilters, setWeeklyFilters] = useState<ReportFilterState>(newReportFilterState);
  const [weeklyPage, setWeeklyPage] = useState(1);
  
  // Stock Snapshot State
  const defaultSnapshotStart = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; };
  const defaultSnapshotEnd   = () => new Date().toISOString().split('T')[0];
  const [snapshotStart, setSnapshotStart] = useState(defaultSnapshotStart());
  const [snapshotEnd,   setSnapshotEnd]   = useState(defaultSnapshotEnd());
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false);
  const [savedSnapshots, setSavedSnapshots] = useState(() => store.getWeeklyReports());

  // Test Harness state
  const [showTestHarness, setShowTestHarness] = useState(false);
  const [testResults, setTestResults] = useState<TestScenarioResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  
  // Inventory Report State
  const [movements, setMovements] = useState(store.getInventoryMovements());
  const [expandedMovements, setExpandedMovements] = useState<Record<string, boolean>>({});
  
  const toggleMovement = (id: string) => {
    setExpandedMovements(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  // System Logs State
  const [systemLogs, setSystemLogs] = useState(store.getSystemLogs());
  
  // Project Report State
  const [projects, setProjects] = useState(store.getProjects());
  const [salesReps, setSalesReps] = useState<User[]>([]);
  const [projectFilters, setProjectFilters] = useState<ReportFilterState>(newReportFilterState);
  const [projectPage, setProjectPage] = useState(1);
  const [inventoryFilters, setInventoryFilters] = useState<ReportFilterState>(newReportFilterState);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [brokenFilters, setBrokenFilters] = useState<ReportFilterState>(newReportFilterState);
  const [brokenPage, setBrokenPage] = useState(1);
  const [systemFilters, setSystemFilters] = useState<ReportFilterState>(newReportFilterState);
  const [systemPage, setSystemPage] = useState(1);
  const [exportingSection, setExportingSection] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'weekly') { setWeeklyFilters(newReportFilterState()); setWeeklyPage(1); }
    if (activeTab !== 'inventory') { setInventoryFilters(newReportFilterState()); setInventoryPage(1); }
    if (activeTab !== 'broken') { setBrokenFilters(newReportFilterState()); setBrokenPage(1); }
    if (activeTab !== 'projects') { setProjectFilters(newReportFilterState()); setProjectPage(1); }
    if (activeTab !== 'system') { setSystemFilters(newReportFilterState()); setSystemPage(1); }
  }, [activeTab]);

  // Broken Report State
  const [brokenMovements, setBrokenMovements] = useState<InventoryMovement[]>([]);

  // Project Detail Modal State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectCostSummary | null>(null);
  const [projectLogs, setProjectLogs] = useState<any[]>([]);
  const [modalTab, setModalTab] = useState<'overview' | 'financial' | 'evidence'>('overview');

  // Evidence Gallery States
  const [evidenceFilterType, setEvidenceFilterType] = useState<'ALL' | 'ISSUE' | 'RETURN'>('ALL');
  const [evidenceFilterBag, setEvidenceFilterBag] = useState('');
  const [evidenceFilterUploader, setEvidenceFilterUploader] = useState('ALL');
  const [evidenceFilterDateFrom, setEvidenceFilterDateFrom] = useState('');
  const [evidenceFilterDateTo, setEvidenceFilterDateTo] = useState('');
  const [evidenceLimit, setEvidenceLimit] = useState(8);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceImage | null>(null);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number | null>(null);

  // Financial Editing State
  const [isEditingLabour, setIsEditingLabour] = useState(false);
  const [editLabourFee, setEditLabourFee] = useState('');
  const [editLabourNote, setEditLabourNote] = useState('');
  const [isSavingCost, setIsSavingCost] = useState(false);
  
  // Live Gold Price State
  const [liveGoldPrice, setLiveGoldPrice] = useState(store.getLiveGoldPrice());
  
  // Export State
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  // Diamond Usage Editing State
  const [editingDiamondUsage, setEditingDiamondUsage] = useState<string | null>(null);
  const [editUsedPcs, setEditUsedPcs] = useState<string>('');
  const [editBrokenPcs, setEditBrokenPcs] = useState<string>('');
  const [editOverrideReason, setEditOverrideReason] = useState<string>('');

  const handleSaveDiamondUsage = async (specId: string) => {
    if (!selectedProject || !currentUser) return;
    if (!editOverrideReason.trim()) {
      showToast('A reason is required for diamond usage overrides.');
      return;
    }
    try {
      const newUsed = parseInt(editUsedPcs);
      const newBroken = parseInt(editBrokenPcs);

      await store.applyDiamondUsageOverride(
        selectedProject.id,
        specId,
        isNaN(newUsed) ? undefined : newUsed,
        isNaN(newBroken) ? undefined : newBroken,
        currentUser.id,
        editOverrideReason.trim()
      );

      // Refresh the local project reference so the cost summary re-computes
      const refreshed = store.getProject(selectedProject.id);
      if (refreshed) {
        setSelectedProject(refreshed);
        setProjectStats(store.getProjectCostSummary(refreshed.id));
      }
      setEditingDiamondUsage(null);
      setEditOverrideReason('');
      showToast('Diamond usage updated');
    } catch (e: any) {
      showToast(e?.message || 'Failed to update diamond usage');
    }
  };


  const filterMovementsByLocationAccess = (allMovements: any[]) => {
    if (!currentUser) return allMovements;
    if (!currentUser.location || currentUser.location.toLowerCase() === 'both' || currentUser.location.trim() === '') {
      return allMovements;
    }
    const userLoc = currentUser.location.toLowerCase();
    
    return allMovements.filter(m => {
      if (m.location) {
        return m.location.toLowerCase() === userLoc;
      }
      const creator = store.getUser(m.createdById);
      if (creator && creator.location && creator.location.toLowerCase() !== 'both' && creator.location.trim() !== '') {
        return creator.location.toLowerCase() === userLoc;
      }
      if (m.notes) {
        const notesLower = m.notes.toLowerCase();
        if (notesLower.includes(userLoc)) return true;
        const otherLoc = userLoc === 'toronto' ? 'miami' : 'toronto';
        if (notesLower.includes(otherLoc)) return false;
      }
      if (m.lines && m.lines.length > 0) {
        const lineWithSpec = m.lines.find((l: any) => l.specId && l.specId !== 'MIXED-UNSORTED');
        if (lineWithSpec && lineWithSpec.specId) {
          const spec = store.getSpecs().find(s => s.id === lineWithSpec.specId);
          if (spec && spec.location) {
            return spec.location.toLowerCase() === userLoc;
          }
        }
      }
      return true;
    });
  };

  const filterLedgerTxsByLocationAccess = (txs: any[]) => {
    if (!currentUser) return txs;
    if (!currentUser.location || currentUser.location.toLowerCase() === 'both' || currentUser.location.trim() === '') {
      return txs;
    }
    const userLoc = currentUser.location.toLowerCase();
    
    return txs.filter(tx => {
      const spec = store.getSpecs().find(s => s.id === tx.specId);
      if (spec && spec.location) {
        return spec.location.toLowerCase() === userLoc;
      }
      if (tx.notes) {
        const notesLower = tx.notes.toLowerCase();
        if (notesLower.includes(userLoc)) return true;
        const otherLoc = userLoc === 'toronto' ? 'miami' : 'toronto';
        if (notesLower.includes(otherLoc)) return false;
      }
      const creator = store.getUser(tx.createdById);
      if (creator && creator.location && creator.location.toLowerCase() !== 'both' && creator.location.trim() !== '') {
        return creator.location.toLowerCase() === userLoc;
      }
      return true;
    });
  };

  useEffect(() => {
    const sync = () => {
        // Refresh based on active tab
        if (activeTab === 'projects') {
            setProjects([...store.getProjects()]);
            setSalesReps(store.getUsers().filter(u => u.role === Role.SALES_REP));
        } else if (activeTab === 'inventory') {
            setMovements(filterMovementsByLocationAccess(store.getInventoryMovements()));
        } else if (activeTab === 'broken') {
            const all = filterMovementsByLocationAccess(store.getInventoryMovements());
            setBrokenMovements(all.filter(m => m.type === InventoryMovementType.BROKEN_OUT));
        } else if (activeTab === 'system') {
            setSystemLogs([...store.getSystemLogs()]);
        } else if (activeTab === 'weekly') {
            setLedgerTxs(filterLedgerTxsByLocationAccess(store.getLedgerTransactions()));
        }
        setLiveGoldPrice(store.getLiveGoldPrice());
    };
    
    sync();
    return store.subscribe(sync);
  }, [activeTab]);

  // Also refresh ledger when weekStart/weekEnd changes
  useEffect(() => {
    if (activeTab === 'weekly') {
        setLedgerTxs(filterLedgerTxsByLocationAccess(store.getLedgerTransactions()));
    }
  }, [weekStart, weekEnd]);

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
       const progress = (p.progress || []).map(prog => ({
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
       void store.getProjectRevisions(p.id).then(revisions => {
          const revisionLogs = revisions.map(revision => {
             const before = revision.before as any;
             const after = revision.after as any;
             const descriptions: Record<string, string> = {
                INSTRUCTIONS: `Instructions: “${before.instructions || ''}” → “${after.instructions || ''}”`,
                METAL: `Metal: ${before.metal || '-'} ${before.purity || ''} → ${after.metal || '-'} ${after.purity || ''}`,
                COMPONENT_REVISED: `Component revised: ${after.label || after.revisionId || ''}`,
                COMPONENT_SUPERSEDED: `Component ${before.label || before.revisionId || ''} superseded by ${after.label || after.revisionId || ''}`,
                CASTING_RECEIVED: `Casting received: ${JSON.stringify(after.componentWeightsMg || {})}`,
                FINAL_WEIGHT_RECORDED: `Final component weights recorded`,
                INTERNAL_COST_CONFIRMED: `Internal casting cost locked: $${(Number(after.amountCents || 0) / 100).toFixed(2)}`,
                INTERNAL_COST_REVERSAL: `Internal cost reversal: -$${(Math.abs(Number(after.amountCents || 0)) / 100).toFixed(2)}`,
                INTERNAL_COST_REPLACEMENT: `Replacement internal cost locked: $${(Number(after.amountCents || 0) / 100).toFixed(2)}`,
                PICKUP_PRICING_LOCKED: `Pickup pricing locked for ${after.actualPickupDate || ''}: $${(Number(after.totalClientGoldChargeCents || 0) / 100).toFixed(2)}`,
                SERVICE_MIGRATION: `Service classification: ${JSON.stringify(before.services || [])} → ${PROJECT_SERVICE_LABELS[after.classification] || after.classification || 'Manager Review Required'}`,
                SERVICE_MIGRATION_ROLLBACK: `Service migration rolled back to ${JSON.stringify(after.services || [])}`,
             };
             return {
                id: revision.id,
                type: revision.kind.replace(/_/g, ' '),
                date: revision.createdAt,
                user: store.getUser(revision.editor.uid) || { name: revision.editor.name },
                details: descriptions[revision.kind] || 'Project revision',
                extra: `Reason: ${revision.reason}`,
                highlight: true
             };
          });
          setProjectLogs([...combined, ...revisionLogs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
       }).catch(error => {
          console.error('Failed to load project revisions', error);
          setProjectLogs(combined);
       });
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

  const handleExportEvidencePDF = async (e: React.MouseEvent, p: Project) => {
      e.stopPropagation();
      if (generatingPdfId) return;
      setGeneratingPdfId(p.id + '_ev');
      showToast("Generating Evidence Appendix...");
      try {
          await generateEvidenceAppendixPDF(p, currentUser);
          showToast("Evidence Appendix Export Complete ✓");
      } catch (err) {
          console.error(err);
          showToast("Evidence Export Failed");
      } finally {
          setGeneratingPdfId(null);
      }
  };

  const reportUsers = store.getUsers();
  const reportSpecs = store.getSpecs();
  const option = (value: string, label: string) => ({ value, label });
  const projectFilterDefinitions: ReportFilterDefinition[] = [
    {
      field: 'service',
      label: 'Service',
      options: [
        option('CUSTOM_MAKE', 'Custom Make'),
        option('ENGAGEMENT', 'Engagement'),
        option('REPAIR', 'Repair'),
        option('OTHER', 'Other'),
        option('MANAGER_REVIEW_REQUIRED', 'Manager Review Required'),
      ],
    },
    {
      field: 'status',
      label: 'Project Status',
      options: Object.values(ProjectStatus).map(value => option(value, value)),
    },
    {
      field: 'salesRepId',
      label: 'Sales Rep',
      options: salesReps.map(user => option(user.id, user.name)),
    },
  ];
  const repairIsSelected = (projectFilters.selections.service || []).includes('REPAIR');
  if (repairIsSelected) {
    projectFilterDefinitions.push(
      {
        field: 'repairType',
        label: 'Repair Type',
        options: Object.values(RepairType).map(value => option(value, value)),
      },
      {
        field: 'repairStatus',
        label: 'Repair Status',
        options: Object.values(RepairStatus).map(value => option(value, value)),
      },
      {
        field: 'repairFlag',
        label: 'Repair Flag',
        options: [
          option('NO_CHARGE', 'No Charge'),
          option('OUTSOURCED', 'Outsourced'),
          option('ACTIVE_REPAIR', 'Active Repair'),
          option('COMPLETED_REPAIR', 'Completed Repair'),
        ],
      },
    );
  }

  const inventoryFilterDefinitions: ReportFilterDefinition[] = [
    {
      field: 'type',
      label: 'Movement Type',
      options: [...new Set(movements.map(item => item.type))].filter(Boolean).map(value => option(value, value.replaceAll('_', ' '))),
    },
    {
      field: 'location',
      label: 'Location',
      options: [...new Set(movements.map(item => item.location).filter(Boolean) as string[])].map(value => option(value, value)),
    },
    {
      field: 'actorId',
      label: 'Team Member',
      options: reportUsers.map(user => option(user.id, user.name)),
    },
  ];
  const brokenFilterDefinitions: ReportFilterDefinition[] = [
    { field: 'specId', label: 'Diamond Size', options: reportSpecs.map(spec => option(spec.id, spec.label)) },
    { field: 'projectId', label: 'Project', options: projects.map(project => option(project.id, project.code)) },
    { field: 'actorId', label: 'Team Member', options: reportUsers.map(user => option(user.id, user.name)) },
  ];
  const systemFilterDefinitions: ReportFilterDefinition[] = [
    {
      field: 'action',
      label: 'Action',
      options: [...new Set(systemLogs.map(item => item.action))].filter(Boolean).map(value => option(value, value.replaceAll('_', ' '))),
    },
    { field: 'actorId', label: 'Team Member', options: reportUsers.map(user => option(user.id, user.name)) },
  ];
  const weeklyFilterDefinitions: ReportFilterDefinition[] = [
    {
      field: 'movementType',
      label: 'Movement Type',
      options: ['added', 'assigned', 'returned', 'used', 'broken', 'lost', 'adjusted', 'weight_tolerance', 'requested']
        .map(value => option(value, value.replaceAll('_', ' '))),
    },
    { field: 'specId', label: 'Diamond Size', options: reportSpecs.map(spec => option(spec.id, spec.label)) },
    { field: 'color', label: 'Color', options: ['White', 'Yellow', 'Blue', 'Pink', 'Green', 'Brown', 'Orange'].map(value => option(value, value)) },
    { field: 'projectId', label: 'Project', options: projects.map(project => option(project.id, project.code)) },
    { field: 'actorId', label: 'Team Member', options: reportUsers.map(user => option(user.id, user.name)) },
  ];

  const changeProjectFilters = (next: ReportFilterState) => {
    const normalized = (next.selections.service || []).includes('REPAIR')
      ? next
      : clearReportFields(next, ['repairType', 'repairStatus', 'repairFlag']);
    setProjectFilters(normalized);
    setProjectPage(1);
  };
  const changeInventoryFilters = (next: ReportFilterState) => { setInventoryFilters(next); setInventoryPage(1); };
  const changeBrokenFilters = (next: ReportFilterState) => { setBrokenFilters(next); setBrokenPage(1); };
  const changeSystemFilters = (next: ReportFilterState) => { setSystemFilters(next); setSystemPage(1); };
  const changeWeeklyFilters = (next: ReportFilterState) => { setWeeklyFilters(next); setWeeklyPage(1); };

  const projectReport = usePhase7Report<any>('PROJECT_HISTORY', projectFilters, { enabled: activeTab === 'projects', page: projectPage });
  const inventoryReport = usePhase7Report<any>('INVENTORY_LEDGER', inventoryFilters, { enabled: activeTab === 'inventory', page: inventoryPage });
  const brokenReport = usePhase7Report<any>('BROKEN_STONES', brokenFilters, { enabled: activeTab === 'broken', page: brokenPage });
  const systemReport = usePhase7Report<any>('SYSTEM_LOGS', systemFilters, { enabled: activeTab === 'system', page: systemPage });
  const weeklyReport = usePhase7Report<any>('WEEKLY_MOVEMENT', {
    ...weeklyFilters,
    from: weekStart,
    to: weekEnd,
  }, { enabled: activeTab === 'weekly', page: weeklyPage });

  const exportSecureCsv = async (
    section: Parameters<typeof toPhase7Request>[0],
    filters: ReportFilterState,
    filename: string,
  ) => {
    setExportingSection(section);
    try {
      const result = await exportPhase7ReportCsv({
        ...toPhase7Request(section, filters, 100),
        cursor: undefined,
      });
      downloadPhase7Csv(result, filename);
      showToast(`Exported ${result.total} authorized row${result.total === 1 ? '' : 's'}.`);
    } catch (error: any) {
      showToast(error?.message || 'Unable to export this report.');
    } finally {
      setExportingSection(null);
    }
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
      
      <div className="flex flex-wrap gap-1 border-b border-zinc-800 mb-8">
         <button onClick={() => setActiveTab('weekly')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'weekly' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}><Activity size={14}/>Daily Diamond Statement</button>
         <button onClick={() => setActiveTab('inventory')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Inventory Ledger</button>
         <button onClick={() => setActiveTab('broken')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'broken' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Broken Stones</button>
         <button onClick={() => setActiveTab('projects')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'projects' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Project History</button>
         <button onClick={() => setActiveTab('system')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'system' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>System Logs</button>
         {isManager && (
           <button
             onClick={() => { setActiveTab('staff'); navigate('/reports/team'); }}
             className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'staff' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
           >
             <Users size={14} />
             Team
             <span className="text-[10px] font-bold text-amber-300 bg-amber-400/20 border border-amber-400/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
               New Update Coming Soon
             </span>
           </button>
         )}
      </div>

      {activeTab === 'staff' && isManager && (
        <StaffPerformanceDashboard currentUser={currentUser} memberId={params.memberId} />
      )}

      {activeTab === 'weekly' && (
        <DailyDiamondStatement />
      )}

      {activeTab === 'inventory' && (
        <Card className="overflow-hidden">
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 space-y-4">
              <div className="flex justify-between items-center gap-3">
                <h3 className="font-bold text-white">Inventory Ledger</h3>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={exportingSection === 'INVENTORY_LEDGER'}
                  onClick={() => void exportSecureCsv('INVENTORY_LEDGER', inventoryFilters, 'inventory_ledger')}
                >
                  Export CSV
                </Button>
              </div>
              <ReportFilterBar
                state={inventoryFilters}
                onChange={changeInventoryFilters}
                definitions={inventoryFilterDefinitions}
                searchPlaceholder="Search reference, bag, item, team member, or notes…"
                resultCount={inventoryReport.total}
                loading={inventoryReport.loading}
              />
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
                  {inventoryReport.rows.map(m => {
                    const isExpanded = !!expandedMovements[m.id as string];
                    const safeLines = Array.isArray(m.lines) ? m.lines : [];
                    return (
                      <React.Fragment key={m.id}>
                        <tr 
                          onClick={() => toggleMovement(m.id as string)}
                          className="hover:bg-zinc-900/30 cursor-pointer transition-colors"
                        >
                          <td className="p-4 text-zinc-400 font-mono">{new Date(m.createdAt).toLocaleDateString()}</td>
                          <td className="p-4 text-white font-bold">{m.type}</td>
                          <td className="p-4 text-zinc-500">{m.referenceBagNumber ? `Bag #${m.referenceBagNumber}` : '-'}</td>
                          <td className="p-4 text-zinc-400 truncate max-w-xs">{m.notes}</td>
                          <td className="p-4 text-right align-top">
                             <div className="flex flex-col items-end gap-1">
                                <div className="font-mono text-lux-gold font-bold text-xs flex items-center gap-1 justify-end hover:text-white transition-colors">
                                   {safeLines[0]?.specId === 'MIXED-UNSORTED' ? `${safeLines[0].ct || 0} ct` : `${safeLines.reduce((a,b)=>a+(b.pcs||0),0)} pcs`}
                                   {isExpanded ? <ChevronUp size={12} className="text-lux-gold shrink-0" /> : <ChevronDown size={12} className="text-zinc-500 shrink-0" />}
                                </div>
                                {isExpanded && safeLines.length > 0 && (
                                   <div className="flex flex-col items-end gap-0.5 mt-1.5 border-t border-zinc-800/50 pt-1.5 w-full animate-in fade-in duration-200">
                                      {safeLines.map((l, i) => {
                                         const spec = store.getSpecs().find(s => s.id === l.specId);
                                         const sizeLabel = l.specId === 'MIXED-UNSORTED' ? 'Mixed' : (spec?.sizeMm ? `${spec.sizeMm}mm` : (spec?.label || l.specId || 'Unknown'));
                                         return (
                                            <div key={i} className="text-[10px] text-zinc-500 flex items-center gap-1.5 whitespace-nowrap justify-end">
                                               <span className="text-zinc-400 font-medium">{sizeLabel}</span>
                                               {l.pcs !== undefined && l.pcs !== null && <span className="text-lux-gold/80">{l.pcs}pcs</span>}
                                               <span className="text-blue-400/60">({Number(l.ct || 0).toFixed(3)}ct)</span>
                                            </div>
                                         );
                                      })}
                                   </div>
                                )}
                             </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
             </table>
           </div>
           <ReportMessage loading={inventoryReport.loading} error={inventoryReport.error} empty={!inventoryReport.loading && !inventoryReport.rows.length} />
           <ReportPagination page={inventoryPage} pageSize={25} total={inventoryReport.total} onPageChange={setInventoryPage} />
        </Card>
      )}

      {activeTab === 'broken' && (
         <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-red-950/20 border border-red-900/30 p-5 rounded-2xl">
                  <div className="text-red-400 text-xs font-bold uppercase mb-1">Visible Page Carats</div>
                  <div className="text-2xl font-bold text-white font-mono">
                     {brokenReport.rows.reduce((total, row) => total + Number(row.carats || 0), 0).toFixed(3)} ct
                  </div>
               </div>
               <div className="bg-red-950/20 border border-red-900/30 p-5 rounded-2xl">
                  <div className="text-red-400 text-xs font-bold uppercase mb-1">Filtered Incidents</div>
                  <div className="text-2xl font-bold text-white font-mono">
                     {brokenReport.total}
                  </div>
               </div>
            </div>

            <Card className="overflow-hidden">
               <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                     <AlertOctagon size={18} className="text-red-500" />
                     <h3 className="font-bold text-white">Breakage Log</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={exportingSection === 'BROKEN_STONES'}
                      onClick={() => void exportSecureCsv('BROKEN_STONES', brokenFilters, 'broken_stones')}
                    >
                      Export CSV
                    </Button>
                  </div>
                  <ReportFilterBar
                    state={brokenFilters}
                    onChange={changeBrokenFilters}
                    definitions={brokenFilterDefinitions}
                    searchPlaceholder="Search project, bag, diamond, team member, or notes…"
                    resultCount={brokenReport.total}
                    loading={brokenReport.loading}
                  />
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
                     {brokenReport.rows.map(row => (
                       <tr key={row.id} className="hover:bg-zinc-900/30">
                         <td className="p-4 text-zinc-400 font-mono">{new Date(row.createdAt).toLocaleDateString()}</td>
                         <td className="p-4">
                           {row.projectCode && <div className="text-white font-bold text-xs mb-0.5">{row.projectCode}</div>}
                           <div className="text-zinc-500 text-xs">{row.notes}</div>
                         </td>
                         <td className="p-4 text-zinc-300">{row.specLabel || <span className="text-zinc-500 italic">Mixed/Unknown</span>}</td>
                         <td className="p-4 text-right font-mono text-red-400">{row.pieces || '-'}</td>
                         <td className="p-4 text-right font-mono text-zinc-500">{Number(row.carats || 0).toFixed(3)}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
               <ReportMessage loading={brokenReport.loading} error={brokenReport.error} empty={!brokenReport.loading && !brokenReport.rows.length} />
               <ReportPagination page={brokenPage} pageSize={25} total={brokenReport.total} onPageChange={setBrokenPage} />
            </Card>
         </div>
      )}

      {activeTab === 'projects' && (
        <Card className="overflow-hidden">
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <h3 className="font-bold text-white">Project History</h3>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={exportingSection === 'PROJECT_HISTORY'}
                  onClick={() => void exportSecureCsv('PROJECT_HISTORY', projectFilters, 'project_history')}
                >
                  Export CSV
                </Button>
              </div>
              <ReportFilterBar
                state={projectFilters}
                onChange={changeProjectFilters}
                definitions={projectFilterDefinitions}
                searchPlaceholder="Search client, phone, piece, project code, or rep…"
                resultCount={projectReport.total}
                loading={projectReport.loading}
              />
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
                 {projectReport.rows.map(row => {
                   const p = store.getProject(row.id);
                   const repair = p ? store.getRepairDetails(p) : null;
                   const previewImage = row.previewImage;
                   return (
                   <tr key={row.id} onClick={() => p && handleSelectProject(p)} className="hover:bg-zinc-900/50 cursor-pointer transition-colors group">
                     <td className="p-4">
                        <div className="w-10 h-10 bg-black rounded-xl border border-zinc-800 overflow-hidden flex items-center justify-center">
                           {previewImage ? (
                              <img src={previewImage} className="w-full h-full object-cover" />
                           ) : (
                              <ImageIcon size={16} className="text-zinc-700" />
                           )}
                        </div>
                     </td>
                     <td className="p-4 text-white font-bold group-hover:text-lux-gold transition-colors flex items-center gap-2">
                        {row.code}
                        {p?.isQuickRepair && <Badge color="blue">Quick Repair</Badge>}
                        {row.service && <Badge color={row.serviceCode === 'REPAIR' ? 'amber' : 'blue'}>{row.service}</Badge>}
                        {repair?.outsourced && <Badge color="blue">Outsourced</Badge>}
                     </td>
                     <td className="p-4 text-zinc-300">
                        <div>{row.clientName || '-'}</div>
                        {row.clientPhone && <div className="text-xs text-zinc-500 mt-0.5">{row.clientPhone}</div>}
                     </td>
                     <td className="p-4 text-zinc-400">{row.pieceName}</td>
                     <td className="p-4 text-zinc-400">{row.salesRepName || '-'}</td>
                     <td className="p-4"><StatusPill status={row.status} /></td>
                     <td className="p-4 text-right font-mono">{row.progress || 0}%</td>
                     <td className="p-4">
                        <button
                           disabled={!p}
                           onClick={(e) => p && handleExportPDF(e, p)}
                           className={`p-2 rounded-full hover:bg-white/10 text-zinc-500 hover:text-lux-gold transition-colors ${generatingPdfId === row.id ? 'animate-pulse text-lux-gold' : ''}`}
                           title="Export PDF"
                        >
                           <FileDown size={18} />
                        </button>
                     </td>
                   </tr>
                  );
                 })}
               </tbody>
              </table>
           </div>
           <ReportMessage loading={projectReport.loading} error={projectReport.error} empty={!projectReport.loading && !projectReport.rows.length} />
           <ReportPagination page={projectPage} pageSize={25} total={projectReport.total} onPageChange={setProjectPage} />
        </Card>
      )}

      {activeTab === 'system' && (
        <Card className="overflow-hidden">
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 space-y-4">
              <div className="flex justify-between items-center gap-3">
                <h3 className="font-bold text-white">System Logs</h3>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={exportingSection === 'SYSTEM_LOGS'}
                  onClick={() => void exportSecureCsv('SYSTEM_LOGS', systemFilters, 'system_logs')}
                >
                  Export CSV
                </Button>
              </div>
              <ReportFilterBar
                state={systemFilters}
                onChange={changeSystemFilters}
                definitions={systemFilterDefinitions}
                searchPlaceholder="Search action, team member, or details…"
                resultCount={systemReport.total}
                loading={systemReport.loading}
              />
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
               <thead className="bg-zinc-900 text-zinc-500 font-bold uppercase text-[11px]">
                 <tr>
                   <th className="p-4">Date</th>
                   <th className="p-4">User</th>
                   <th className="p-4">Action</th>
                   <th className="p-4">Details</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-800/50">
                 {systemReport.rows.map(log => (
                   <tr key={log.id} className="hover:bg-zinc-900/30 transition-colors">
                     <td className="p-4 text-zinc-400 font-mono text-xs whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                     <td className="p-4 text-lux-cream font-medium">{log.actorName || 'System'}</td>
                     <td className="p-4">
                       <Badge color="blue">{log.action}</Badge>
                     </td>
                     <td className="p-4 text-zinc-400">{log.details}</td>
                   </tr>
                 ))}
               </tbody>
               </table>
            </div>
            <ReportMessage loading={systemReport.loading} error={systemReport.error} empty={!systemReport.loading && !systemReport.rows.length} />
            <ReportPagination page={systemPage} pageSize={25} total={systemReport.total} onPageChange={setSystemPage} />
         </Card>
       )}

      {/* Project Detail Modal - Redesigned with Tabs */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <Card className="w-full max-w-5xl h-[85vh] flex flex-col border-white/5 shadow-2xl relative animate-in fade-in zoom-in-95 overflow-hidden rounded-[2.5rem]">
              
               {/* Premium Header */}
               <div className="px-8 pt-12 pb-8 flex justify-between items-start z-10 relative bg-gradient-to-b from-black/50 to-transparent border-b border-white/5">
                  <div className="space-y-3">
                     <h2 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
                         {selectedProject.clientName || <span className="text-zinc-600 italic">No Client</span>}
                         {selectedProject.isQuickRepair && <Wrench size={24} className="inline-block ml-3 text-lux-gold" />}
                     </h2>
                     <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-400 font-medium">
                        <span className="font-mono text-lux-gold bg-lux-gold/10 px-2 py-0.5 rounded-full border border-lux-gold/20">{selectedProject.code}</span>
                        <span className="hidden sm:inline text-zinc-700">•</span>
                        <span className="text-white/80">{selectedProject.pieceName}</span>
                        {selectedProject.clientPhone && (
                            <>
                              <span className="hidden sm:inline text-zinc-700">•</span>
                              <span>{selectedProject.clientPhone}</span>
                            </>
                        )}
                        {selectedProject.goldComponents && selectedProject.goldComponents.length > 0 ? (
                            <>
                              <span className="hidden sm:inline text-zinc-700">•</span>
                              <span className="text-amber-500/90">{selectedProject.goldComponents.map((c: any) => `${c.purity} ${c.type}`).join(' · ')}</span>
                            </>
                        ) : selectedProject.goldType && (
                            <>
                              <span className="hidden sm:inline text-zinc-700">•</span>
                              <span className="text-amber-500/90">{selectedProject.goldPurity} {selectedProject.goldType}</span>
                            </>
                        )}
                     </div>
                  </div>
                  <div className="flex gap-2 items-center pl-4 shrink-0">
                     <Button size="sm" variant="secondary" onClick={(e) => handleExportPDF(e, selectedProject)} loading={generatingPdfId === selectedProject.id} icon={<FileDown size={16}/>}>Export PDF</Button>
                     <Button size="sm" variant="secondary" onClick={(e) => handleExportEvidencePDF(e, selectedProject)} loading={generatingPdfId === (selectedProject.id + '_ev')} icon={<ImageIcon size={16}/>}><span className="hidden sm:inline">Evidence PDF</span></Button>
                     <StatusPill status={selectedProject.status} />
                     <button onClick={() => setSelectedProject(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all">
                         <X size={20} />
                     </button>
                  </div>
               </div>

              {/* Tabs Navigation */}
              <div className="px-8 pt-5 border-b border-white/5 bg-[#1A1A1A]">
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
                    {currentUser?.role && (currentUser.role === Role.MANAGER || currentUser.role === Role.DESIGNER) && (
                       <button 
                          onClick={() => setModalTab('evidence')}
                          className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all ${modalTab === 'evidence' ? 'text-lux-gold border-b-2 border-lux-gold' : 'text-zinc-500 hover:text-zinc-300'}`}
                       >
                          Evidence Gallery
                       </button>
                    )}
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-[#16171d]">
                 
                 {/* TAB A: OVERVIEW */}
                 {modalTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        {store.getRepairDetails(selectedProject) && (
                           <div className="lg:col-span-2 bg-black/20 border border-zinc-800/50 rounded-2xl p-5">
                              {(() => {
                                 const repair = store.getRepairDetails(selectedProject)!;
                                 const repairCost = store.getRepairCostSummary(selectedProject.id);
                                 return (
                                   <>
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
                                      <div>
                                        <div className="text-[10px] text-lux-gold uppercase tracking-widest font-bold mb-1">Repair Summary</div>
                                        <h3 className="text-xl font-bold text-white">{repair.type}{repair.customName ? ` • ${repair.customName}` : ''}</h3>
                                        <p className="text-sm text-zinc-500 mt-1">{repair.issueNotes || repair.repairNotes || repair.customerNotes || 'No repair notes entered.'}</p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <Badge color="blue">{repair.status}</Badge>
                                        {repair.outsourced && <Badge color="amber">Outsourced</Badge>}
                                        {repairCost.noCharge && <Badge color="red">No Charge</Badge>}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                                        <div className="text-[10px] text-zinc-500 uppercase font-bold">Internal Cost</div>
                                        <div className="text-white font-mono font-bold">${repairCost.totalInternalCostCad.toFixed(2)}</div>
                                      </div>
                                      <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                                        <div className="text-[10px] text-zinc-500 uppercase font-bold">Client Charge</div>
                                        <div className="text-lux-gold font-mono font-bold">${repairCost.finalClientChargeCad.toFixed(2)}</div>
                                      </div>
                                      <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                                        <div className="text-[10px] text-zinc-500 uppercase font-bold">Profit / Loss</div>
                                        <div className={`font-mono font-bold ${repairCost.profitLossCad < 0 ? 'text-red-400' : 'text-emerald-400'}`}>${repairCost.profitLossCad.toFixed(2)}</div>
                                      </div>
                                    </div>
                                    {(repair.beforeImage || repair.afterImage) && (
                                      <div className="grid grid-cols-2 gap-3 mt-4">
                                        {repair.beforeImage && <img src={repair.beforeImage} className="h-36 w-full object-cover rounded-2xl border border-white/5" />}
                                        {repair.afterImage && <img src={repair.afterImage} className="h-36 w-full object-cover rounded-2xl border border-white/5" />}
                                      </div>
                                    )}
                                   </>
                                 );
                              })()}
                           </div>
                        )}
                        {/* Left Col */}
                        <div className="space-y-8">
                           {/* Diamond Usage Breakdown */}
                           <div className="bg-black/20 border border-zinc-800/50 rounded-2xl overflow-hidden">
                              <div className="p-4 border-b border-white/5 flex items-center gap-2">
                                 <Gem size={16} className="text-blue-400" />
                                 <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                    {selectedProject.isQuickRepair ? 'Repair Items (Stones Set)' : 'Diamond Usage'}
                                 </h3>
                              </div>
                              <table className="w-full text-sm text-left">
                                 <thead className="bg-black/20 text-zinc-500 text-[10px] uppercase font-bold">
                                    <tr>
                                       <th className="p-4 pl-6">Spec</th>
                                       <th className="p-4 text-right">Quantity</th>
                                       {!selectedProject.isQuickRepair && <th className="p-4 text-right text-red-400">Broken</th>}
                                       <th className="p-4 text-right pr-6 text-blue-400">Est. Carats</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-white/5">
                                    {selectedProject.isQuickRepair ? (
                                       // Quick Repair Display
                                       (selectedProject.repairDetails?.items || []).map((item, i) => {
                                          // Try to find spec by stoneSize string parsing
                                          const sizeNum = parseFloat(item.stoneSize);
                                          const spec = store.getSpecs().find(s => s.sizeMm === sizeNum);
                                          const totalCarats = (item.quantity || 0) * (spec?.ctPerStone || 0);
                                          return (
                                             <tr key={i} className="hover:bg-white/5 transition-colors">
                                                <td className="p-4 pl-6">
                                                   <div className="text-white font-medium">{item.stoneSize || 'Unknown Size'}</div>
                                                   {spec && <div className="text-[10px] text-zinc-500">{spec.label}</div>}
                                                </td>
                                                <td className="p-4 text-right text-zinc-300 font-mono">
                                                   {item.quantity} pcs
                                                </td>
                                                <td className="p-4 text-right pr-6 text-blue-400 font-mono">
                                                   {totalCarats > 0 ? totalCarats.toFixed(3) : '-'} ct
                                                </td>
                                             </tr>
                                          );
                                       })
                                    ) : (
                                       // Standard Project Display
                                       (projectStats?.breakdown || []).map((item, i) => {
                                          const isEditing = editingDiamondUsage === item.spec.id;
                                          const totalCarats = item.usedPcs * (item.spec.ctPerStone || 0);
                                          return (
                                          <tr key={i} className="hover:bg-white/5 transition-colors group">
                                             <td className="p-4 pl-6">
                                                <div className="flex items-center gap-2">
                                                  <div>
                                                    <div className="text-white font-medium">{item.spec.label}</div>
                                                    <div className="text-[10px] text-zinc-500">{item.spec.sizeMm}mm</div>
                                                  </div>
                                                  {isManager && !isEditing && (
                                                    <button 
                                                      onClick={() => {
                                                        setEditingDiamondUsage(item.spec.id);
                                                        setEditUsedPcs(item.usedPcs.toString());
                                                        setEditBrokenPcs(item.brokenPcs.toString());
                                                      }}
                                                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 text-zinc-500 hover:text-lux-gold transition-all"
                                                    >
                                                      <Edit2 size={12} />
                                                    </button>
                                                  )}
                                                </div>
                                             </td>
                                             <td className="p-4 text-right text-zinc-300 font-mono">
                                                {isEditing ? (
                                                  <input 
                                                    type="number" 
                                                    className="w-16 bg-black border border-zinc-700 rounded-xl px-2 py-1 text-right text-xs text-white focus:border-lux-gold focus:ring-0"
                                                    value={editUsedPcs}
                                                    onChange={e => setEditUsedPcs(e.target.value)}
                                                  />
                                                ) : (
                                                  <>{item.usedPcs} pcs</>
                                                )}
                                             </td>
                                             <td className="p-4 text-right text-red-400 font-mono">
                                                {isEditing ? (
                                                  <div className="flex items-center justify-end gap-2">
                                                    <input 
                                                      type="number" 
                                                      className="w-16 bg-black border border-zinc-700 rounded-xl px-2 py-1 text-right text-xs text-white focus:border-lux-gold focus:ring-0"
                                                      value={editBrokenPcs}
                                                      onChange={e => setEditBrokenPcs(e.target.value)}
                                                    />
                                                    <input
                                                      type="text"
                                                      placeholder="Reason (required)"
                                                      className="w-36 bg-black border border-zinc-700 rounded-xl px-2 py-1 text-xs text-white focus:border-lux-gold focus:ring-0"
                                                      value={editOverrideReason}
                                                      onChange={e => setEditOverrideReason(e.target.value)}
                                                    />
                                                    <button onClick={() => handleSaveDiamondUsage(item.spec.id)} className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded">
                                                      <CheckCircle2 size={14} />
                                                    </button>
                                                    <button onClick={() => setEditingDiamondUsage(null)} className="p-1 text-zinc-400 hover:bg-white/10 rounded">
                                                      <X size={14} />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <>{item.brokenPcs > 0 ? item.brokenPcs : '-'}</>
                                                )}
                                             </td>
                                             <td className="p-4 text-right pr-6 text-blue-400 font-mono">
                                                {totalCarats > 0 ? totalCarats.toFixed(3) : '-'} ct
                                             </td>
                                          </tr>
                                       )})
                                    )}
                                 </tbody>
                              </table>
                           </div>

                           {/* Casting History */}
                           <Card className="border-zinc-800 p-5">
                              <div className="flex items-center gap-2 mb-4 text-lux-gold">
                                 <Box size={16} />
                                 <h3 className="text-xs font-bold uppercase tracking-widest text-white">Casting History</h3>
                              </div>
                              <div className="space-y-3">
                                 {selectedProject.castingEvents?.length ? (
                                    (selectedProject.castingEvents || []).map((e, i) => (
                                       <div key={i} className="flex justify-between items-start text-sm border-b border-white/5 pb-3 last:border-0 last:pb-0">
                                          <div className="flex flex-col gap-1">
                                             <div className="text-zinc-300 font-bold flex items-center gap-2">
                                                Cycle #{e.cycleNumber}
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${e.receivedAt ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-500'}`}>
                                                   {e.receivedAt ? 'Received' : 'Sent'}
                                                </span>
                                             </div>
                                             <div className="flex flex-wrap gap-1">
                                                {e.goldComponentIds && e.goldComponentIds.length > 0 ? (
                                                   e.goldComponentIds.map(cid => {
                                                      const comp = selectedProject.goldComponents?.find(c => c.id === cid);
                                                      return (
                                                         <span key={cid} className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-500 border border-white/5">
                                                            {comp?.label || 'Component'}
                                                         </span>
                                                      );
                                                   })
                                                ) : (
                                                   <span className="text-[9px] text-zinc-600 italic">All Components</span>
                                                )}
                                             </div>
                                          </div>
                                          <div className="text-right">
                                             <div className="text-white font-mono font-bold">{e.receivedWeightG ? `${e.receivedWeightG.toFixed(2)}g` : 'Pending'}</div>
                                             <div className="text-[10px] text-zinc-600">{formatDateTime(e.receivedAt || e.sentAt)}</div>
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
                           <Card className="border-zinc-800 p-5">
                              <div className="flex items-center gap-2 mb-4 text-purple-400">
                                 <Scale size={16} />
                                 <h3 className="text-xs font-bold uppercase tracking-widest text-white">Weight Timeline</h3>
                              </div>
                              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                 {(selectedProject.progress || []).filter(p => p.weightG).length === 0 ? (
                                    <p className="text-zinc-600 text-xs italic text-center py-4">No weight recorded.</p>
                                 ) : (
                                    (selectedProject.progress || []).filter(p => p.weightG).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((p, i) => (
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
                           <Card className="h-[400px] border-zinc-800 flex flex-col">
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
                       {store.getRepairDetails(selectedProject) && (() => {
                         const repair = store.getRepairDetails(selectedProject)!;
                         const repairCost = store.getRepairCostSummary(selectedProject.id);
                         return (
                           <div className="bg-gradient-to-b from-[#1F2128] to-black border border-lux-gold/20 rounded-3xl p-6 mb-6 shadow-2xl">
                             <div className="flex items-center gap-3 mb-5">
                               <div className="w-10 h-10 rounded-full bg-lux-gold/10 flex items-center justify-center text-lux-gold border border-lux-gold/20">
                                 <Wrench size={20} />
                               </div>
                               <div>
                                 <h3 className="text-sm font-bold text-white uppercase tracking-wide">Repair Financial Summary</h3>
                                 <p className="text-xs text-zinc-500">{repair.type} • {repair.status}</p>
                               </div>
                             </div>
                             <div className="space-y-3">
                               {[
                                 ['Labour Cost', repairCost.labourCostCad],
                                 ['Gold Cost', repairCost.goldCostCad],
                                 ['Diamond Cost', repairCost.diamondCostCad],
                                 ['Outsourced Vendor Cost', repairCost.outsourcedCostCad],
                                 ['Material Cost', repairCost.materialCostCad],
                               ].map(([label, value]) => (
                                 <div key={label as string} className="flex justify-between border-b border-white/5 pb-2 text-sm">
                                   <span className="text-zinc-400">{label as string}</span>
                                   <span className="text-white font-mono">${Number(value).toFixed(2)}</span>
                                 </div>
                               ))}
                               {repairCost.noCharge && (
                                 <div className="flex justify-between border-b border-white/5 pb-2 text-sm">
                                   <span className="text-zinc-400">No Charge Reason</span>
                                   <span className="text-red-300 font-medium">{repairCost.noChargeReason || 'Not specified'}</span>
                                 </div>
                               )}
                             </div>
                             <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                               <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                 <div className="text-[10px] text-zinc-500 uppercase font-bold">Total Internal</div>
                                 <div className="text-white font-mono text-xl font-bold">${repairCost.totalInternalCostCad.toFixed(2)}</div>
                               </div>
                               <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                 <div className="text-[10px] text-zinc-500 uppercase font-bold">Final Charge</div>
                                 <div className="text-lux-gold font-mono text-xl font-bold">${repairCost.finalClientChargeCad.toFixed(2)}</div>
                               </div>
                               <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                 <div className="text-[10px] text-zinc-500 uppercase font-bold">Profit / Loss</div>
                                 <div className={`font-mono text-xl font-bold ${repairCost.profitLossCad < 0 ? 'text-red-400' : 'text-emerald-400'}`}>${repairCost.profitLossCad.toFixed(2)}</div>
                               </div>
                             </div>
                           </div>
                         );
                       })()}
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
                                     <span className="text-zinc-300 font-bold text-sm">Client Gold Charge</span>
                                     <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
                                        <span>Combined Weight</span>
                                        <span>•</span>
                                        <span>{projectStats?.finalWeightG.toFixed(2)}g</span>
                                     </div>
                                  </div>
                                  <span className="text-white font-mono text-xl tracking-tight">
                                     {selectedProject.pickupPricingSnapshot ? `$${(selectedProject.pickupPricingSnapshot.totalClientGoldChargeCents / 100).toFixed(2)}` : <span className="text-zinc-600">Pending pickup pricing</span>}
                                  </span>
                               </div>
                               
                               {/* Formula Visualization / Breakdown */}
                               {projectStats?.goldBreakdown && projectStats.goldBreakdown.length > 0 ? (
                                  <div className="mt-3 mb-3 bg-black/20 p-3 rounded-lg border border-white/5 flex flex-col gap-3">
                                     <span className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 pb-1">Gold Breakdown</span>
                                     {projectStats.goldBreakdown.map((b: any, i: number) => (
                                         <div key={b.componentId || i} className="flex flex-col">
                                            <div className="flex justify-between items-center mb-1">
                                               <span className="text-[11px] text-zinc-200 font-bold">{b.label}</span>
                                               <span className="text-white text-xs font-mono">${b.calculatedCostCad.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                                               <span>{b.purity} {b.type} • {b.weightG.toFixed(2)}g</span>
                                               <span className="text-[9px] opacity-60">${b.purePriceAtTime.toFixed(2)}/g × {b.ratioUsed.toFixed(3)}</span>
                                            </div>
                                         </div>
                                     ))}
                                  </div>
                               ) : (
                                  <div className="mt-3 mb-3 bg-black/20 p-2 rounded-lg border border-white/5 flex flex-wrap gap-2 text-[10px] text-zinc-400 font-mono items-center">
                                     <div className="flex flex-col">
                                        <span className="text-[9px] text-zinc-600 uppercase">Pure Price (CAD/g)</span>
                                        <span className="text-white">${projectStats?.usedPurePricePerGram.toFixed(2)}</span>
                                     </div>
                                     <span className="text-zinc-600">×</span>
                                     <div className="flex flex-col">
                                        <span className="text-[9px] text-zinc-600 uppercase">Ratio ({selectedProject.goldComponents?.[0]?.purity || selectedProject.goldPurity})</span>
                                        <span className="text-white">{projectStats?.usedRatio.toFixed(3)}</span>
                                     </div>
                                     <span className="text-zinc-600">×</span>
                                     <div className="flex flex-col">
                                        <span className="text-[9px] text-zinc-600 uppercase">Weight</span>
                                        <span className="text-white">{projectStats?.finalWeightG.toFixed(2)}g</span>
                                     </div>
                                  </div>
                               )}

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
                                     {projectStats?.totalCaratsUsed?.toFixed(3)} ct • {(projectStats?.breakdown || []).reduce((acc, b) => acc + b.usedPcs, 0)} pcs (Net)
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
                                     {(projectStats?.breakdown || []).reduce((acc, b) => acc + b.usedPcs, 0)} stones × ${store.getSettings().setterCostPerSetPieceCad}
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

                 {modalTab === 'evidence' && (
                    <div className="space-y-6 animate-in slide-in-from-right-2 fade-in duration-300">
                       <div className="flex justify-between items-center">
                          <h3 className="font-bold text-white text-lg">Diamond Evidence</h3>
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
                             if (ev.projectId !== selectedProject?.id) return false;
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
                                         className="bg-[#1C1E24]/60 backdrop-blur-3xl rounded-[2rem] border border-white/[0.05] p-4 relative overflow-hidden transition-all hover:bg-[#252830]/80 flex flex-col justify-between h-[320px] group cursor-pointer animate-enter"
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
                                               {ev.transactionType === 'ISSUE' ? 'Issue' : 'Return'}
                                            </div>
                                            {ev.imageSource === 'Camera' && (
                                               <div className="absolute top-2 right-2 bg-lux-gold text-black font-extrabold text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded-full backdrop-blur-sm shadow-md">
                                                  Camera
                                               </div>
                                            )}
                                         </div>
                                         
                                         <div className="mt-3 flex-1 flex flex-col justify-between">
                                            <div>
                                               <div className="flex justify-between items-start mb-1">
                                                  <span className="text-[10px] text-zinc-500 font-mono">Bag #{ev.bagNumber}</span>
                                                  <span className="text-[8px] bg-white/5 border border-white/5 text-zinc-400 px-1.5 py-0.5 rounded font-bold font-mono">
                                                     v{ev.version}
                                                  </span>
                                               </div>
                                               <div className="text-white text-xs font-bold truncate">Uploaded by {ev.uploaderName}</div>
                                            </div>
                                            
                                            <div className="text-[9px] text-zinc-500 font-mono mt-2 pt-2 border-t border-white/[0.03]">
                                               {new Date(ev.uploadedAt).toLocaleString()}
                                            </div>
                                         </div>
                                      </div>
                                   ))}
                                </div>
                                
                                {filtered.length > evidenceLimit && (
                                   <div className="text-center pt-2">
                                      <Button 
                                         variant="secondary" 
                                         size="sm"
                                         onClick={() => setEvidenceLimit(prev => prev + 8)}
                                      >
                                         Load More
                                      </Button>
                                   </div>
                                )}
                             </div>
                          );
                       })()}
                    </div>
                 )}
               </div>
            </Card>
         </div>
       )}

       {selectedEvidence && (
         <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[110] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
            <Card className="w-full max-w-4xl p-6 max-h-[90vh] flex flex-col animate-in zoom-in-95 overflow-y-auto bg-[#1C1E24] border border-white/10 rounded-[2.5rem]">
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
                          setSelectedVersionIndex(null);
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
                         const displayVersion = currentViewedVersion ? (selectedVersionIndex! + 1) : selectedEvidence.version;

                         return (
                            <>
                               <div className="aspect-square w-full rounded-3xl overflow-hidden relative border border-zinc-800 bg-black flex items-center justify-center h-[350px]">
                                  {displayPhoto ? (
                                     <img src={displayPhoto} className="w-full h-full object-contain animate-enter" alt={`Evidence version ${displayVersion}`} />
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
                                        <div className="mt-3 p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-[11px] text-zinc-400 animate-enter">
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
                  
                  {/* Right Column: Metadata Details */}
                  <div className="space-y-6 flex flex-col justify-between">
                     <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                           <div className="bg-[#1C1E24] border border-white/5 rounded-2xl p-3">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Project Code</div>
                              <div className="text-white font-bold text-sm mt-0.5">{selectedProject?.code}</div>
                           </div>
                           <div className="bg-[#1C1E24] border border-white/5 rounded-2xl p-3">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Client Name</div>
                              <div className="text-white font-bold text-sm mt-0.5">{selectedProject?.clientName || '-'}</div>
                           </div>
                           <div className="bg-[#1C1E24] border border-white/5 rounded-2xl p-3">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Uploader</div>
                              <div className="text-white font-bold text-sm mt-0.5">
                                 {selectedVersionIndex !== null && selectedEvidence.replacementHistory 
                                    ? selectedEvidence.replacementHistory[selectedVersionIndex].replacedByName 
                                    : selectedEvidence.uploaderName}
                              </div>
                           </div>
                           <div className="bg-[#1C1E24] border border-white/5 rounded-2xl p-3">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Upload Date</div>
                              <div className="text-white font-bold text-xs mt-0.5">
                                 {new Date(selectedVersionIndex !== null && selectedEvidence.replacementHistory 
                                    ? selectedEvidence.replacementHistory[selectedVersionIndex].replacedAt 
                                    : selectedEvidence.uploadedAt).toLocaleString()}
                              </div>
                           </div>
                           <div className="bg-[#1C1E24] border border-white/5 rounded-2xl p-3">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Image Source</div>
                              <div className="text-white font-bold text-sm mt-0.5">
                                 {selectedVersionIndex !== null && selectedEvidence.replacementHistory 
                                    ? selectedEvidence.replacementHistory[selectedVersionIndex].imageSource 
                                    : selectedEvidence.imageSource}
                              </div>
                           </div>
                           <div className="bg-[#1C1E24] border border-white/5 rounded-2xl p-3">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Transaction Status</div>
                              <div className="text-white font-bold text-sm mt-0.5">{selectedEvidence.transactionStatus}</div>
                           </div>
                        </div>

                        {/* Relevant Diamond Values */}
                        <div className="bg-[#1C1E24] border border-white/5 rounded-2xl p-4">
                           <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">Relevant Diamond Values</div>
                           <div className="space-y-1">
                              {(() => {
                                  let itemsHtml: React.ReactNode[] = [];
                                  if (selectedEvidence.transactionType === 'ISSUE') {
                                      const bag = store.getBags().find(b => b.id === selectedEvidence.transactionId);
                                      if (bag) {
                                          itemsHtml = bag.items.map((item, idx) => {
                                              const spec = store.getSpecs().find(s => s.id === item.specId);
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
                                              const spec = store.getSpecs().find(s => s.id === l.specId);
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
                  </div>
               </div>
            </Card>
         </div>
       )}
      {/* ── Situational Test Harness Modal Overlay ─────────────────── */}
      {showTestHarness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in transition-all">
          <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col border-purple-500/20 overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.15)] bg-zinc-950">
            <div className="p-5 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                  <Play size={18} className="text-purple-400 animate-pulse" />
                  Diamond Ledger Situational Tests (ST-01 to ST-12)
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Validating multi-location double-entry formulas and integrity controls.</p>
              </div>
              <button 
                onClick={() => setShowTestHarness(false)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isRunningTests ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <RefreshCw className="text-purple-400 animate-spin" size={40} />
                  <p className="text-sm text-zinc-400 font-bold animate-pulse">Running mathematical inventory validation assertions...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-zinc-900/40 border border-zinc-800 p-4 rounded-2xl">
                    <span className="text-xs text-zinc-400">
                      Asserted: <strong className="text-purple-400">{testResults.length}</strong> test cases executed
                    </span>
                    <span className="text-xs text-zinc-400">
                      Passed: <strong className="text-emerald-400">{testResults.filter(r => r.status === 'PASS').length}</strong> / {testResults.length}
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {testResults.map((res) => {
                      const isPass = res.status === 'PASS';
                      return (
                        <div 
                          key={res.id} 
                          className={`border rounded-2xl p-4 transition-all duration-200 ${
                            isPass 
                              ? 'bg-emerald-950/10 border-emerald-900/30 hover:border-emerald-800/50' 
                              : 'bg-red-950/10 border-red-900/30 hover:border-red-800/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded font-mono ${
                                  isPass ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/30' : 'bg-red-950 text-red-400 border border-red-800/30'
                                }`}>
                                  {res.id}
                                </span>
                                <h4 className="font-bold text-white text-sm">{res.name}</h4>
                              </div>
                              <p className="text-xs text-zinc-500 mt-1">{res.description}</p>
                            </div>
                            <div className="text-right">
                              <span className={`text-xs font-black uppercase px-3 py-1 rounded-xl ${
                                isPass ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                              }`}>
                                {res.status}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/[0.04] space-y-2">
                            <div className="grid grid-cols-2 gap-4 text-[11px] font-mono">
                              <div>
                                <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">Expected Output</span>
                                <span className="text-zinc-300 font-bold">{res.expected}</span>
                              </div>
                              <div>
                                <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">Actual Output</span>
                                <span className={isPass ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{res.actual}</span>
                              </div>
                            </div>

                            <div className="mt-2 bg-black/40 rounded-xl p-3 border border-white/[0.03]">
                              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block mb-1">Execution Detail & Assertions</span>
                              <ul className="list-disc pl-4 space-y-1">
                                {res.details.map((d, idx) => (
                                  <li key={idx} className="text-zinc-400 text-[10px] font-mono leading-relaxed text-left">{d}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex justify-end gap-2">
              <Button onClick={() => setShowTestHarness(false)} variant="secondary">Close Portal</Button>
              <Button 
                onClick={async () => {
                  setIsRunningTests(true);
                  try {
                    const res = await runDiamondSituationalTests();
                    setTestResults(res);
                  } catch (err: any) {
                    showToast('Test Suite failed: ' + err.message);
                  } finally {
                    setIsRunningTests(false);
                  }
                }}
                disabled={isRunningTests}
              >
                Re-Run Validation Suite
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
