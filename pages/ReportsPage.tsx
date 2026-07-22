
import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { Card, Button, Badge, StatusPill, SetterAvatar, Input } from '../components/UI';
import { ExecutiveInsightsModule } from '../components/ExecutiveInsightsModule';
import { FileBarChart, Download, X, Calendar, Search, Activity, Gem, Users, Clock, AlertOctagon, Filter, Image as ImageIcon, Box, Scale, ArrowRight, Coins, Save, Edit2, Ban, CheckCircle2, TrendingUp, Lock, FileDown, Wrench, AlertTriangle, Play, RefreshCw, Trash2, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, ZoomIn, Archive } from 'lucide-react';
import { Project, ProjectCostSummary, InventoryMovement, InventoryMovementType, Role, CastingEvent, User, ProjectStatus, RepairStatus, RepairType, DiamondSpec, DiamondLedgerTransaction, EvidenceImage } from '../types';
import { useToast } from '../App';
import { runDiamondSituationalTests, TestScenarioResult } from '../services/testHarness';
import { generateProjectPDF, generateEvidenceAppendixPDF } from '../utils/pdfGenerator';

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

const ReportsPage: React.FC = () => {
  const showToast = useToast();
  const currentUser = store.getCurrentUser();
  const isManager = currentUser?.role === Role.MANAGER;

  const [activeTab, setActiveTab] = useState<'inventory' | 'projects' | 'broken' | 'system' | 'weekly'>('inventory');
  
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
  const [weeklyFilterSpec, setWeeklyFilterSpec] = useState('ALL');
  const [weeklyFilterColor, setWeeklyFilterColor] = useState('ALL');
  const [weeklyFilterProject, setWeeklyFilterProject] = useState('ALL');
  const [weeklyFilterType, setWeeklyFilterType] = useState('ALL');
  const [weeklyFilterBag, setWeeklyFilterBag] = useState('');
  const [weeklyFilterSalesRep, setWeeklyFilterSalesRep] = useState('ALL');
  const [weeklyFilterUser, setWeeklyFilterUser] = useState('ALL');
  
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
  const [salesRepFilter, setSalesRepFilter] = useState('ALL');
  const [clientFilter, setClientFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [repairTypeFilter, setRepairTypeFilter] = useState('ALL');
  const [repairStatusFilter, setRepairStatusFilter] = useState('ALL');
  const [repairFlagFilter, setRepairFlagFilter] = useState('ALL');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

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
          const revisionLogs = revisions.map(revision => ({
             id: revision.id,
             type: revision.kind === 'INSTRUCTIONS' ? 'INSTRUCTIONS REVISION' : 'METAL REVISION',
             date: revision.createdAt,
             user: store.getUser(revision.editor.uid) || { name: revision.editor.name },
             details: revision.kind === 'INSTRUCTIONS'
                ? `Instructions: “${revision.before.instructions || ''}” → “${revision.after.instructions || ''}”`
                : `Metal: ${revision.before.metal || '-'} ${revision.before.purity || ''} → ${revision.after.metal || '-'} ${revision.after.purity || ''}`,
             extra: `Reason: ${revision.reason}`,
             highlight: true
          }));
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

  const filteredProjects = projects.filter(p => {
     const matchesRep = salesRepFilter === 'ALL' || p.salesRepId === salesRepFilter;
     if (!matchesRep) return false;
     const serviceNames = store.getServiceNames(p);
     const repair = store.getRepairDetails(p);
     const repairCost = store.getRepairCostSummary(p.id);

     if (serviceFilter === 'Repair' && !repair) return false;
     if (serviceFilter !== 'ALL' && serviceFilter !== 'Repair' && !serviceNames.includes(serviceFilter)) return false;
     if (repairTypeFilter !== 'ALL' && repair?.type !== repairTypeFilter) return false;
     if (repairStatusFilter !== 'ALL' && repair?.status !== repairStatusFilter) return false;
     if (repairFlagFilter === 'NO_CHARGE' && !repairCost.noCharge) return false;
     if (repairFlagFilter === 'OUTSOURCED' && !repairCost.outsourced) return false;
     if (repairFlagFilter === 'ACTIVE_REPAIR' && (!repair || p.status !== ProjectStatus.ACTIVE)) return false;
     if (repairFlagFilter === 'COMPLETED_REPAIR' && (!repair || p.status === ProjectStatus.ACTIVE)) return false;

     const projectTime = new Date(p.createdAt).getTime();
     if (dateFromFilter && projectTime < new Date(dateFromFilter).getTime()) return false;
     if (dateToFilter) {
       const end = new Date(dateToFilter);
       end.setHours(23, 59, 59, 999);
       if (projectTime > end.getTime()) return false;
     }
     if (!clientFilter) return true;

     const repName = salesReps.find(r => r.id === p.salesRepId)?.name || '';
     
     const searchableString = [
         p.clientName || '',
         p.clientPhone || '',
         p.pieceName || '',
         p.code || '',
         repName
     ].join(' ');

     return isFuzzyMatch(clientFilter, searchableString);
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
      
      <div className="flex flex-wrap gap-1 border-b border-zinc-800 mb-8">
         <button onClick={() => setActiveTab('weekly')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'weekly' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}><Activity size={14}/>Weekly Movement</button>
         <button onClick={() => setActiveTab('inventory')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Inventory Ledger</button>
         <button onClick={() => setActiveTab('broken')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'broken' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Broken Stones</button>
         <button onClick={() => setActiveTab('projects')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'projects' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Project History</button>
         <button onClick={() => setActiveTab('system')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'system' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>System Logs</button>
      </div>

      {activeTab === 'weekly' && (() => {
        const startMs = new Date(weekStart).getTime();
        const endMs = new Date(weekEnd + 'T23:59:59').getTime();
        const allSpecs = store.getSpecs();
        const allProjects = store.getProjects();
        const allUsers = store.getUsers();
        const settings = store.getSettings();
        const usdCad = settings.usdToCadMultiplier || 1.35;

        // ── Filter ledger transactions to this week ────────────────────────
        let filtered = ledgerTxs.filter(t => {
          const ms = new Date(t.createdAt).getTime();
          return ms >= startMs && ms <= endMs;
        });
        if (weeklyFilterSpec !== 'ALL') filtered = filtered.filter(t => t.specId === weeklyFilterSpec);
        if (weeklyFilterColor !== 'ALL') filtered = filtered.filter(t => t.color === weeklyFilterColor);
        if (weeklyFilterProject !== 'ALL') filtered = filtered.filter(t => t.referenceProjectId === weeklyFilterProject);
        if (weeklyFilterType !== 'ALL') filtered = filtered.filter(t => t.movementType === weeklyFilterType);
        if (weeklyFilterBag.trim()) filtered = filtered.filter(t => t.referenceBagNumber?.toLowerCase().includes(weeklyFilterBag.trim().toLowerCase()));
        if (weeklyFilterSalesRep !== 'ALL') {
          filtered = filtered.filter(t => allProjects.find(p => p.id === t.referenceProjectId)?.salesRepId === weeklyFilterSalesRep);
        }
        if (weeklyFilterUser !== 'ALL') {
          filtered = filtered.filter(t => {
            const project = allProjects.find(p => p.id === t.referenceProjectId);
            const assignedToProject = project?.assignedSetterId === weeklyFilterUser || (project?.assignments || []).some(a => a.userId === weeklyFilterUser && a.active);
            return t.createdById === weeklyFilterUser || assignedToProject;
          });
        }

        // ── KPI totals from filtered data ─────────────────────────────────
        const totalAdded   = filtered.filter(t => t.movementType === 'added').reduce((a,t) => a + t.quantity, 0);
        const totalAssigned = filtered.filter(t => t.movementType === 'assigned').reduce((a,t) => a + Math.abs(t.quantity), 0);
        const totalReturned = filtered.filter(t => t.movementType === 'returned').reduce((a,t) => a + t.quantity, 0);
        const totalUsed    = filtered.filter(t => t.movementType === 'used').reduce((a,t) => a + Math.abs(t.quantity), 0);
        const totalBroken  = filtered.filter(t => t.movementType === 'broken').reduce((a,t) => a + Math.abs(t.quantity), 0);
        const totalAdjusted = filtered.filter(t => t.movementType === 'adjusted').reduce((a,t) => a + t.quantity, 0);
        const totalLost    = filtered.filter(t => t.movementType === 'lost').reduce((a,t) => a + Math.abs(t.quantity), 0);
        const netChange    = totalAdded + totalAdjusted - totalUsed - totalBroken - totalLost;
        const totalValueUsd = filtered.reduce((a,t) => a + Math.abs(t.totalValue), 0);
        const totalValueCad = totalValueUsd * usdCad;

        // ── Weight-tolerance KPIs ──────────────────────────────────────────
        const wtTxs = filtered.filter(t => t.movementType === 'weight_tolerance');
        const wtNetCt = +wtTxs.reduce((a, t) => a + t.carats, 0).toFixed(4);
        const wtValueUsd = wtTxs.reduce((a, t) => a + t.totalValue, 0);
        const wtValueCad = wtValueUsd * usdCad;
        // Per-spec weight-tolerance map (all ledger txs, not just filtered-by-type)
        const wtSpecMap = new Map<string, { spec: any; color: string; netCt: number; count: number; valueCad: number }>();
        ledgerTxs
          .filter(t => t.movementType === 'weight_tolerance')
          .filter(t => { const ms = new Date(t.createdAt).getTime(); return ms >= startMs && ms <= endMs; })
          .forEach(t => {
            const key = `${t.specId}|${t.color}`;
            if (!wtSpecMap.has(key)) {
              const spec = allSpecs.find(s => s.id === t.specId) || { id: t.specId, label: t.specId };
              wtSpecMap.set(key, { spec, color: t.color, netCt: 0, count: 0, valueCad: 0 });
            }
            const r = wtSpecMap.get(key)!;
            r.netCt  = +(r.netCt + t.carats).toFixed(6);
            r.count  += 1;
            r.valueCad += t.totalValue * usdCad;
          });

        // ── Opening stock per spec (all txs before weekStart) ─────────────
        const openingMap = new Map<string, number>();
        ledgerTxs.filter(t => new Date(t.createdAt).getTime() < startMs).forEach(t => {
          const key = `${t.specId}|${t.color}`;
          openingMap.set(key, (openingMap.get(key) || 0) + t.mainStockChange + t.wipStockChange);
        });

        const passesSpecColorFilter = (specId: string, color: string) => (
          (weeklyFilterSpec === 'ALL' || specId === weeklyFilterSpec) &&
          (weeklyFilterColor === 'ALL' || color === weeklyFilterColor)
        );

        // ── Per-spec summary (grouped by specId + color) ──────────────────
        const specMap = new Map<string, {
          spec: any; color: string;
          opening: number; added: number; assigned: number; returned: number;
          used: number; broken: number; lost: number; adjusted: number; closing: number;
          valueCad: number;
        }>();

        const seedOpeningBalances = weeklyFilterProject === 'ALL' && weeklyFilterType === 'ALL' && weeklyFilterSalesRep === 'ALL' && weeklyFilterUser === 'ALL' && !weeklyFilterBag.trim();
        if (seedOpeningBalances) {
          const balanceKeys = new Set<string>();
          ledgerTxs
            .filter(t => new Date(t.createdAt).getTime() <= endMs && passesSpecColorFilter(t.specId, t.color))
            .forEach(t => balanceKeys.add(`${t.specId}|${t.color}`));
          allSpecs
            .filter(s => passesSpecColorFilter(s.id, s.color || 'White'))
            .forEach(s => balanceKeys.add(`${s.id}|${s.color || 'White'}`));

          balanceKeys.forEach(key => {
            const [specId, color] = key.split('|');
            const spec = allSpecs.find(s => s.id === specId) || { id: specId, label: specId, ctPerStone: 0, sizeMm: 0 };
            const opening = openingMap.get(key) || 0;
            const hasHistory = ledgerTxs.some(t => `${t.specId}|${t.color}` === key && new Date(t.createdAt).getTime() <= endMs);
            if (opening !== 0 || hasHistory) {
              specMap.set(key, { spec, color, opening, added:0, assigned:0, returned:0, used:0, broken:0, lost:0, adjusted:0, closing: opening, valueCad:0 });
            }
          });
        }

        // Seed from all specs that appear in week
        filtered.forEach(t => {
          const key = `${t.specId}|${t.color}`;
          if (!specMap.has(key)) {
            const spec = allSpecs.find(s => s.id === t.specId) || { id: t.specId, label: t.specId, ctPerStone: 0, sizeMm: 0 };
            const opening = openingMap.get(key) || 0;
            specMap.set(key, { spec, color: t.color, opening, added:0, assigned:0, returned:0, used:0, broken:0, lost:0, adjusted:0, closing: opening, valueCad:0 });
          }
          const row = specMap.get(key)!;
          if (t.movementType === 'added') { row.added += t.quantity; }
          else if (t.movementType === 'assigned') { row.assigned += Math.abs(t.quantity); }
          else if (t.movementType === 'returned') { row.returned += t.quantity; }
          else if (t.movementType === 'used') { row.used += Math.abs(t.quantity); }
          else if (t.movementType === 'broken') { row.broken += Math.abs(t.quantity); }
          else if (t.movementType === 'lost') { row.lost += Math.abs(t.quantity); }
          else if (t.movementType === 'adjusted') { row.adjusted += t.quantity; }
          row.valueCad += Math.abs(t.totalValue) * usdCad;
        });
        specMap.forEach(row => {
          row.closing = row.opening + row.added + row.adjusted - row.used - row.broken - row.lost;
        });

        // ── Per-project breakdown ─────────────────────────────────────────
        const projectMap = new Map<string, { project: any; pcs: number; valueCad: number; broken: number }>();
        filtered.filter(t => t.referenceProjectId).forEach(t => {
          const pid = t.referenceProjectId!;
          if (!projectMap.has(pid)) {
            projectMap.set(pid, { project: allProjects.find(p => p.id === pid), pcs: 0, valueCad: 0, broken: 0 });
          }
          const row = projectMap.get(pid)!;
          if (t.movementType === 'used') row.pcs += Math.abs(t.quantity);
          if (t.movementType === 'broken') row.broken += Math.abs(t.quantity);
          row.valueCad += Math.abs(t.totalValue) * usdCad;
        });

        // ── Executive Insights ────────────────────────────────────────────────
        const execNegativeBalances: any[] = [];
        const execMissingCosts: any[] = [];
        const execOtherWarnings: string[] = [];

        filtered.forEach(t => {
          if (!t.unitCost || t.unitCost === 0) execMissingCosts.push(t);
          if (!t.specId || t.specId === 'MIXED-UNSORTED') execOtherWarnings.push(`Missing exact diamond size on tx ${t.id.slice(0,8)}`);
          if (!t.color) execOtherWarnings.push(`Missing color/type on tx ${t.id.slice(0,8)}`);
          if ((t.movementType === 'assigned' || t.movementType === 'returned' || t.movementType === 'used' || t.movementType === 'broken') && !t.referenceBagNumber) execOtherWarnings.push(`Missing bag ID on tx ${t.id.slice(0,8)} (${t.movementType})`);
        });
        specMap.forEach((row, key) => {
          if (row.closing < 0) execNegativeBalances.push({ ...row, color: key.split('|')[1] });
        });
        const bagSpecMap = new Map<string, { assigned: number; returned: number; used: number; broken: number; returnEvents: number }>();
        ledgerTxs.filter(t => t.referenceBagNumber).forEach(t => {
          const key = `${t.referenceProjectId || 'no-project'}|${t.referenceBagNumber}|${t.specId}`;
          const row = bagSpecMap.get(key) || { assigned: 0, returned: 0, used: 0, broken: 0, returnEvents: 0 };
          if (t.movementType === 'assigned') row.assigned += Math.abs(t.quantity);
          if (t.movementType === 'returned') { row.returned += Math.max(0, t.quantity); row.returnEvents += 1; }
          if (t.movementType === 'used') row.used += Math.abs(t.quantity);
          if (t.movementType === 'broken') row.broken += Math.abs(t.quantity);
          bagSpecMap.set(key, row);
        });
        bagSpecMap.forEach((row, key) => {
          const [, bagNo, specId] = key.split('|');
          const spec = allSpecs.find(s => s.id === specId);
          if (row.assigned > 0 && row.returned + row.used + row.broken > row.assigned) execOtherWarnings.push(`Bag #${bagNo} exceeds issued count for ${spec?.label || specId}`);
          if (row.returnEvents > 1) execOtherWarnings.push(`Bag #${bagNo} has multiple return count entries for ${spec?.label || specId}`);
        });
        projectMap.forEach(row => {
          if (row.project && (row.project.status === ProjectStatus.REVIEW || row.project.status === ProjectStatus.CLOSED) && row.project.finalDiamondCostCalculated === undefined) {
            execOtherWarnings.push(`Project ${row.project.code} has diamond activity but no locked Report Hub diamond summary`);
          }
        });

        // ── CSV export helper ─────────────────────────────────────────────
        const exportWeeklyCSV = () => {
          const rows = [
            ['ID','Date','Type','Spec','Color','Qty','Carats','UnitCost USD','TotalValue USD','TotalValue CAD','Project','Bag','Notes'],
            ...filtered.map(t => {
              const spec = allSpecs.find(s => s.id === t.specId);
              const proj = allProjects.find(p => p.id === t.referenceProjectId);
              return [
                t.id, new Date(t.createdAt).toLocaleDateString(), t.movementType,
                spec?.label || t.specId, t.color, t.quantity, t.carats.toFixed(4),
                t.unitCost.toFixed(2), t.totalValue.toFixed(2), (t.totalValue * usdCad).toFixed(2),
                proj?.code || '-', t.referenceBagNumber || '-', `"${(t.notes||'').replace(/"/g,'""')}"`
              ].join(',');
            })
          ].join('\n');
          const blob = new Blob([rows], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `weekly_movement_${weekStart}_to_${weekEnd}.csv`;
          a.click();
        };

        const exportSummaryCSV = () => {
          const rows = [
            ['Spec','Color','Opening','Added','Assigned','Returned','Used','Broken','Lost','Adjusted','Closing','Net','Value CAD'],
            ...[...specMap.values()].map(r => [
              r.spec.label, r.color, r.opening, r.added, r.assigned, r.returned,
              r.used, r.broken, r.lost, r.adjusted, r.closing, r.closing - r.opening, r.valueCad.toFixed(2)
            ].join(','))
          ].join('\n');
          const blob = new Blob([rows], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `weekly_summary_${weekStart}_to_${weekEnd}.csv`;
          a.click();
        };

        const quickSelect = (preset: string) => {
          const now = new Date();
          if (preset === 'this_week') {
            const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1); mon.setHours(0,0,0,0);
            const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
            setWeekStart(mon.toISOString().split('T')[0]); setWeekEnd(sun.toISOString().split('T')[0]);
          } else if (preset === 'last_week') {
            const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() - 6); mon.setHours(0,0,0,0);
            const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
            setWeekStart(mon.toISOString().split('T')[0]); setWeekEnd(sun.toISOString().split('T')[0]);
          } else if (preset === 'last_30') {
            const start = new Date(now); start.setDate(now.getDate() - 30); start.setHours(0,0,0,0);
            setWeekStart(start.toISOString().split('T')[0]); setWeekEnd(now.toISOString().split('T')[0]);
          } else if (preset === 'this_month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setWeekStart(start.toISOString().split('T')[0]); setWeekEnd(end.toISOString().split('T')[0]);
          }
        };

        const movementColors: Record<string, string> = {
          added:            'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
          assigned:         'text-blue-400 bg-blue-950/40 border-blue-800/40',
          returned:         'text-cyan-400 bg-cyan-950/40 border-cyan-800/40',
          used:             'text-lux-gold bg-lux-gold/10 border-lux-gold/20',
          broken:           'text-red-400 bg-red-950/40 border-red-800/40',
          adjusted:         'text-purple-400 bg-purple-950/40 border-purple-800/40',
          lost:             'text-orange-400 bg-orange-950/40 border-orange-800/40',
          requested:        'text-zinc-400 bg-zinc-800/40 border-zinc-700/40',
          weight_tolerance: 'text-sky-400 bg-sky-950/40 border-sky-800/40',
        };

        return (
          <div className="space-y-8">
            {/* ── Header row ─────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Activity size={20} className="text-lux-gold" />
                  Weekly Diamond Movement Report
                </h2>
                <p className="text-xs text-zinc-500 mt-1">Ledger-accurate, double-entry inventory reporting with full project traceability.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => quickSelect('this_week')} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-lux-gold hover:text-black transition-all border border-white/5">This Week</button>
                <button onClick={() => quickSelect('last_week')} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-lux-gold hover:text-black transition-all border border-white/5">Last Week</button>
                <button onClick={() => quickSelect('last_30')} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-lux-gold hover:text-black transition-all border border-white/5">Last 30 Days</button>
                <button onClick={() => quickSelect('this_month')} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-lux-gold hover:text-black transition-all border border-white/5">This Month</button>
                <button onClick={async () => {
                  setIsRunningTests(true);
                  setShowTestHarness(true);
                  try {
                    const res = await runDiamondSituationalTests();
                    setTestResults(res);
                    showToast('Situational Tests Completed Successfully! ✓');
                  } catch (err: any) {
                    showToast('Test Suite failed: ' + err.message);
                  } finally {
                    setIsRunningTests(false);
                  }
                }} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-purple-950/40 text-purple-400 hover:bg-purple-900/60 transition-all border border-purple-800/40 flex items-center gap-1.5">
                  <Play size={12}/> Run Tests
                </button>
                <button onClick={exportWeeklyCSV} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-lux-gold/10 text-lux-gold hover:bg-lux-gold hover:text-black transition-all border border-lux-gold/20 flex items-center gap-1.5">
                  <Download size={12}/> Export CSV
                </button>
                <button onClick={() => window.print()} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all border border-white/10 flex items-center gap-1.5">
                  <FileDown size={12}/> PDF
                </button>
              </div>
            </div>

            {/* ── Date range picker ───────────────────────────────────────── */}
            <Card className="p-5 border-white/5">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">From</label>
                  <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold focus:ring-1 focus:ring-lux-gold outline-none" />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">To</label>
                  <input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold focus:ring-1 focus:ring-lux-gold outline-none" />
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Diamond Size</label>
                  <select value={weeklyFilterSpec} onChange={e => setWeeklyFilterSpec(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold outline-none">
                    <option value="ALL">All Sizes</option>
                    {allSpecs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Color</label>
                  <select value={weeklyFilterColor} onChange={e => setWeeklyFilterColor(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold outline-none">
                    <option value="ALL">All Colors</option>
                    {['White','Yellow','Blue','Pink','Green','Brown','Orange'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Movement Type</label>
                  <select value={weeklyFilterType} onChange={e => setWeeklyFilterType(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold outline-none">
                    <option value="ALL">All Types</option>
                    {['added','assigned','returned','used','broken','lost','adjusted','weight_tolerance','requested'].map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Project</label>
                  <select value={weeklyFilterProject} onChange={e => setWeeklyFilterProject(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold outline-none">
                    <option value="ALL">All Projects</option>
                    {allProjects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[110px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Bag #</label>
                  <input value={weeklyFilterBag} onChange={e => setWeeklyFilterBag(e.target.value)} placeholder="e.g. 001"
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold focus:ring-1 focus:ring-lux-gold outline-none placeholder:text-zinc-600" />
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Sales Rep</label>
                  <select value={weeklyFilterSalesRep} onChange={e => setWeeklyFilterSalesRep(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold outline-none">
                    <option value="ALL">All Reps</option>
                    {allUsers.filter(u => u.role === Role.SALES_REP).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Factory / Staff</label>
                  <select value={weeklyFilterUser} onChange={e => setWeeklyFilterUser(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-2.5 text-sm focus:border-lux-gold outline-none">
                    <option value="ALL">All Staff</option>
                    {allUsers.filter(u => [Role.SETTER, Role.JEWELLER, Role.MANAGER].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
            </Card>

            {/* ── Executive Insights ─────────────────────────────────────── */}
            <ExecutiveInsightsModule 
              negativeBalances={execNegativeBalances}
              missingCosts={execMissingCosts}
              otherWarnings={execOtherWarnings}
              usdCadMultiplier={usdCad}
            />

            {/* ── KPI Summary Cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: 'Stock Added',      value: totalAdded,    sub: 'pcs',  color: 'text-emerald-400', icon: <ArrowDownLeft size={14}/>, bg: 'bg-emerald-950/30 border-emerald-800/30' },
                { label: 'Sent to Factory',  value: totalAssigned, sub: 'pcs',  color: 'text-blue-400',    icon: <ArrowUpRight size={14}/>,  bg: 'bg-blue-950/30 border-blue-800/30' },
                { label: 'Returned',         value: totalReturned, sub: 'pcs',  color: 'text-cyan-400',    icon: <ArrowDownLeft size={14}/>, bg: 'bg-cyan-950/30 border-cyan-800/30' },
                { label: 'Used / Set',       value: totalUsed,     sub: 'pcs',  color: 'text-lux-gold',    icon: <Gem size={14}/>,           bg: 'bg-lux-gold/5 border-lux-gold/20' },
                { label: 'Broken / Lost',    value: totalBroken + totalLost,   sub: 'pcs',  color: 'text-red-400',     icon: <AlertOctagon size={14}/>,  bg: 'bg-red-950/30 border-red-800/30' },
                { label: 'Net Change',       value: netChange,     sub: 'pcs',  color: netChange >= 0 ? 'text-emerald-400' : 'text-red-400', icon: <TrendingUp size={14}/>, bg: 'bg-zinc-900/60 border-white/5' },
                { label: '⚖ Wt Variance',   value: `${wtNetCt > 0 ? '+' : ''}${wtNetCt}`, sub: 'ct net', color: wtNetCt === 0 ? 'text-emerald-400' : Math.abs(wtNetCt) < 0.01 ? 'text-amber-400' : 'text-red-400', icon: <Scale size={14}/>, bg: wtNetCt === 0 ? 'bg-emerald-950/20 border-emerald-900/20' : 'bg-sky-950/30 border-sky-800/30' },
                { label: 'Value Moved',      value: `$${totalValueCad.toLocaleString('en-CA', {maximumFractionDigits:0})}`, sub: 'CAD', color: 'text-lux-gold', icon: <Coins size={14}/>, bg: 'bg-lux-gold/5 border-lux-gold/20' },
              ].map((card, i) => (
                <div key={i} className={`rounded-2xl border p-4 ${card.bg} flex flex-col gap-1`}>
                  <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${card.color} opacity-70`}>
                    {card.icon}{card.label}
                  </div>
                  <div className={`text-2xl font-bold font-mono ${card.color}`}>
                    {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                  </div>
                  <div className="text-[10px] text-zinc-600 font-bold uppercase">{card.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Per-Size Summary Table ─────────────────────────────────── */}
            <Card className="overflow-hidden border-white/5">
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Scale size={13} className="text-lux-gold"/> Movement by Diamond Size
                </h3>
                <button onClick={exportSummaryCSV} className="text-[10px] font-bold text-lux-gold hover:text-white bg-lux-gold/10 px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors">
                  <Download size={10}/> Export
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-separate border-spacing-0">
                  <thead className="bg-zinc-900/80 text-zinc-500 sticky top-0 z-10 text-[10px] uppercase tracking-widest font-black">
                    <tr>
                      <th className="px-4 py-3 border-b border-white/5">Spec</th>
                      <th className="px-4 py-3 border-b border-white/5">Color</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right">Opening</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-emerald-500">Added</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-blue-500">→ Factory</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-cyan-500">Returned</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-lux-gold">Used</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-red-500">Broken</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-orange-500">Lost</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-purple-500">Adj</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right font-black">Closing</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right">Net</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right text-lux-gold">Value CAD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {[...specMap.values()].length === 0 ? (
                      <tr><td colSpan={13} className="py-16 text-center text-zinc-600 text-sm">No movements in this period.</td></tr>
                    ) : [...specMap.values()].map((row, i) => {
                      const net = row.closing - row.opening;
                      const hasWarning = row.closing < 0;
                      return (
                        <tr key={i} className={`hover:bg-white/[0.02] transition-colors ${hasWarning ? 'bg-red-950/10' : ''}`}>
                          <td className="px-4 py-3 font-bold text-white">{row.spec.label || row.spec.id}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/5">{row.color}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-400">{row.opening}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400">{row.added > 0 ? `+${row.added}` : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-blue-400">{row.assigned > 0 ? `-${row.assigned}` : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-cyan-400">{row.returned > 0 ? `+${row.returned}` : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-lux-gold">{row.used > 0 ? row.used : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-400">{row.broken > 0 ? row.broken : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-orange-400">{row.lost > 0 ? row.lost : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-purple-400">{row.adjusted !== 0 ? row.adjusted : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-white">{row.closing}</td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                            {net > 0 ? `+${net}` : net}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-lux-gold text-[11px]">
                            ${row.valueCad.toLocaleString('en-CA', { maximumFractionDigits: 0 })}
                            {hasWarning && <AlertTriangle size={10} className="inline ml-1 text-red-400"/>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {[...specMap.values()].length > 0 && (
                    <tfoot className="bg-zinc-900/60 border-t border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      <tr>
                        <td colSpan={3} className="px-4 py-3">Totals</td>
                        <td className="px-4 py-3 text-right text-emerald-400">{totalAdded > 0 ? `+${totalAdded}` : '-'}</td>
                        <td className="px-4 py-3 text-right text-blue-400">{totalAssigned > 0 ? `-${totalAssigned}` : '-'}</td>
                        <td className="px-4 py-3 text-right text-cyan-400">{totalReturned > 0 ? `+${totalReturned}` : '-'}</td>
                        <td className="px-4 py-3 text-right text-lux-gold">{totalUsed || '-'}</td>
                        <td className="px-4 py-3 text-right text-red-400">{totalBroken || '-'}</td>
                        <td className="px-4 py-3 text-right text-orange-400">{totalLost || '-'}</td>
                        <td className="px-4 py-3 text-right text-purple-400">{totalAdjusted !== 0 ? totalAdjusted : '-'}</td>
                        <td colSpan={1} className="px-4 py-3 text-right text-white">{[...specMap.values()].reduce((a,r) => a + r.closing, 0)}</td>
                        <td className={`px-4 py-3 text-right ${netChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{netChange > 0 ? `+${netChange}` : netChange}</td>
                        <td className="px-4 py-3 text-right text-lux-gold">${totalValueCad.toLocaleString('en-CA',{maximumFractionDigits:0})}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>

            {/* ── Per-Project Breakdown ──────────────────────────────────── */}
            {projectMap.size > 0 && (
              <Card className="overflow-hidden border-white/5">
                <div className="p-4 border-b border-white/5 flex items-center gap-2 bg-white/[0.02]">
                  <Box size={13} className="text-lux-gold"/>
                  <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Project Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-separate border-spacing-0">
                    <thead className="bg-zinc-900/80 text-zinc-500 text-[10px] uppercase tracking-widest font-black">
                      <tr>
                        <th className="px-4 py-3 border-b border-white/5">Project</th>
                        <th className="px-4 py-3 border-b border-white/5">Client</th>
                        <th className="px-4 py-3 border-b border-white/5 text-right text-lux-gold">Stones Used</th>
                        <th className="px-4 py-3 border-b border-white/5 text-right text-red-500">Broken</th>
                        <th className="px-4 py-3 border-b border-white/5 text-right text-lux-gold">Diamond Value CAD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {[...projectMap.values()].map((row, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 font-bold text-white">{row.project?.code || 'Unknown'}</td>
                          <td className="px-4 py-3 text-zinc-400">{row.project?.clientName || '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-lux-gold font-bold">{row.pcs}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-400">{row.broken || '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-lux-gold">${row.valueCad.toLocaleString('en-CA',{maximumFractionDigits:0})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── Weight Tolerance Analysis Panel ────────────────────────── */}
            {wtSpecMap.size > 0 && (
              <Card className="overflow-hidden border-sky-900/30">
                <div className="p-4 border-b border-sky-900/20 flex items-center gap-2 bg-sky-950/20">
                  <Scale size={13} className="text-sky-400"/>
                  <h3 className="text-xs font-black text-sky-300 uppercase tracking-widest">Weight Tolerance Analysis</h3>
                  <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-lg bg-sky-900/40 text-sky-400 border border-sky-800/30">
                    Net: {wtNetCt > 0 ? '+' : ''}{wtNetCt}ct &nbsp;·&nbsp; ${Math.abs(wtValueCad).toLocaleString('en-CA',{maximumFractionDigits:2})} CAD
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-separate border-spacing-0">
                    <thead className="bg-zinc-900/80 text-zinc-500 text-[10px] uppercase tracking-widest font-black">
                      <tr>
                        <th className="px-4 py-3 border-b border-white/5">Spec</th>
                        <th className="px-4 py-3 border-b border-white/5">Color</th>
                        <th className="px-4 py-3 border-b border-white/5 text-right"># Events</th>
                        <th className="px-4 py-3 border-b border-white/5 text-right text-sky-400">Net Δ Carats</th>
                        <th className="px-4 py-3 border-b border-white/5 text-right text-sky-400">Value Δ CAD</th>
                        <th className="px-4 py-3 border-b border-white/5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {[...wtSpecMap.values()].map((row, i) => {
                        const absCt = Math.abs(row.netCt);
                        const isOk  = absCt < 0.001;
                        const isMinor = !isOk && absCt <= 0.02;
                        return (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 font-bold text-white">{row.spec.label || row.spec.id}</td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/5">{row.color}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-zinc-400">{row.count}</td>
                            <td className={`px-4 py-3 text-right font-mono font-bold ${isOk ? 'text-emerald-400' : isMinor ? 'text-amber-400' : 'text-red-400'}`}>
                              {row.netCt > 0 ? '+' : ''}{row.netCt.toFixed(4)}ct
                            </td>
                            <td className={`px-4 py-3 text-right font-mono ${row.valueCad < 0 ? 'text-red-400' : 'text-sky-400'}`}>
                              {row.valueCad > 0 ? '+' : ''}${row.valueCad.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              {isOk
                                ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-lg">✓ Within tolerance</span>
                                : isMinor
                                  ? <span className="text-[10px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-lg">△ Minor variance</span>
                                  : <span className="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-800/40 px-2 py-0.5 rounded-lg">⚠ Review required</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── Detailed Ledger Transaction Log ───────────────────────── */}
            <Card className="overflow-hidden border-white/5">
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={13} className="text-lux-gold"/> Transaction Audit Log
                  <span className="px-2 py-0.5 bg-zinc-800 rounded-lg text-zinc-500 font-mono text-[10px]">{filtered.length} entries</span>
                </h3>
                <button onClick={exportWeeklyCSV} className="text-[10px] font-bold text-lux-gold hover:text-white bg-lux-gold/10 px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors">
                  <Download size={10}/> Export All
                </button>
              </div>
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs text-left border-separate border-spacing-0">
                  <thead className="bg-zinc-900/90 text-zinc-500 sticky top-0 z-10 text-[10px] uppercase tracking-widest font-black">
                    <tr>
                      <th className="px-4 py-3 border-b border-white/5">Date</th>
                      <th className="px-4 py-3 border-b border-white/5">Type</th>
                      <th className="px-4 py-3 border-b border-white/5">Spec</th>
                      <th className="px-4 py-3 border-b border-white/5">Color</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right">Qty</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right">Carats</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right">$/ct USD</th>
                      <th className="px-4 py-3 border-b border-white/5 text-right">Value CAD</th>
                      <th className="px-4 py-3 border-b border-white/5">Project / Bag</th>
                      <th className="px-4 py-3 border-b border-white/5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={10} className="py-16 text-center text-zinc-600">No transactions in this period.</td></tr>
                    ) : filtered.slice().reverse().map((t, i) => {
                      const spec = allSpecs.find(s => s.id === t.specId);
                      const proj = allProjects.find(p => p.id === t.referenceProjectId);
                      const colorClass = movementColors[t.movementType] || 'text-zinc-400 bg-zinc-800/40 border-zinc-700/40';
                      const missingCost = !t.unitCost || t.unitCost === 0;
                      return (
                        <tr key={t.id + i} className={`hover:bg-white/[0.02] transition-colors ${missingCost ? 'bg-amber-950/10' : ''}`}>
                          <td className="px-4 py-2.5 text-zinc-500 font-mono whitespace-nowrap">
                            {new Date(t.createdAt).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                            <span className="text-zinc-700 ml-1">{new Date(t.createdAt).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-black uppercase tracking-tight px-2 py-1 rounded-lg border ${colorClass}`}>
                              {t.movementType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-white">{spec?.label || t.specId}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 border border-white/5">{t.color}</span>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-bold ${t.quantity > 0 ? 'text-emerald-400' : t.quantity < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                            {t.quantity > 0 ? `+${t.quantity}` : t.quantity}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-zinc-400">
                            {t.carats > 0 ? '+' : ''}{t.carats.toFixed(4)}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono ${missingCost ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {missingCost ? <span className="flex items-center justify-end gap-1"><AlertTriangle size={10}/>—</span> : `$${t.unitCost.toFixed(2)}`}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-lux-gold font-bold text-[11px]">
                            ${(t.totalValue * usdCad).toLocaleString('en-CA', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">
                            {proj && <span className="font-bold text-white mr-1">{proj.code}</span>}
                            {t.referenceBagNumber && <span className="text-[10px] bg-lux-gold/10 text-lux-gold px-1.5 py-0.5 rounded border border-lux-gold/20">#{t.referenceBagNumber}</span>}
                            {!proj && !t.referenceBagNumber && <span className="text-zinc-600">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-500 max-w-[220px] truncate" title={t.notes}>{t.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

          {/* ── Stock Snapshot Generator ─────────────────────────────────── */}
          <Card className="border-zinc-800 mt-6">
            <div className="p-5 border-b border-zinc-800 flex items-center gap-2">
              <Archive size={16} className="text-lux-gold" />
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Stock Snapshot</h3>
              <span className="text-xs text-zinc-500 ml-2">Generate and persist a point-in-time inventory snapshot to Firestore.</span>
            </div>
            <div className="p-5 space-y-4">
              {/* Date range picker */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Period Start</label>
                  <input
                    type="date"
                    value={snapshotStart}
                    onChange={e => setSnapshotStart(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-white focus:border-lux-gold focus:ring-0"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Period End</label>
                  <input
                    type="date"
                    value={snapshotEnd}
                    onChange={e => setSnapshotEnd(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-white focus:border-lux-gold focus:ring-0"
                  />
                </div>
                <button
                  disabled={isGeneratingSnapshot || !currentUser}
                  onClick={async () => {
                    if (!currentUser) return;
                    setIsGeneratingSnapshot(true);
                    try {
                      await store.generateWeeklyReport(
                        new Date(snapshotStart + 'T00:00:00'),
                        new Date(snapshotEnd   + 'T23:59:59'),
                        currentUser.id
                      );
                      setSavedSnapshots([...store.getWeeklyReports()]);
                      showToast('Snapshot saved to Firestore.');
                    } catch (e: any) {
                      showToast(e?.message || 'Failed to generate snapshot.');
                    } finally {
                      setIsGeneratingSnapshot(false);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-lux-gold text-black text-sm font-bold hover:bg-yellow-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingSnapshot ? (
                    <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full" />Generating…</>
                  ) : (
                    <><Archive size={13} />Generate Snapshot</>
                  )}
                </button>
              </div>

              {/* Saved snapshots table */}
              {savedSnapshots.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-900/80 border-b border-zinc-800">
                        <th className="px-4 py-2.5 text-left text-zinc-500 font-bold uppercase tracking-wider">Period</th>
                        <th className="px-4 py-2.5 text-left text-zinc-500 font-bold uppercase tracking-wider">Generated By</th>
                        <th className="px-4 py-2.5 text-left text-zinc-500 font-bold uppercase tracking-wider">Generated At</th>
                        <th className="px-4 py-2.5 text-right text-zinc-500 font-bold uppercase tracking-wider">Specs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...savedSnapshots]
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map(snap => (
                          <tr key={snap.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 text-zinc-300 font-mono">
                              {snap.weekStartDate?.split('T')[0]} → {snap.weekEndDate?.split('T')[0]}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-400">
                              {store.getUser(snap.createdById)?.name || snap.createdById}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500">
                              {new Date(snap.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right text-zinc-300 font-mono">
                              {snap.lines?.length ?? '—'}
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              )}
              {savedSnapshots.length === 0 && (
                <p className="text-xs text-zinc-600 italic">No snapshots generated yet. Use the form above to create the first one.</p>
              )}
            </div>
          </Card>
          </div>
        );
      })()}

      {activeTab === 'inventory' && (


        <Card className="overflow-hidden">
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex justify-between">
              <h3 className="font-bold text-white">All Movements</h3>
              <Button size="sm" variant="secondary" onClick={() => exportCSV(movements.map(m => {
                const firstLine = m.lines?.[0];
                const spec = firstLine?.specId ? store.getSpecs().find(s => s.id === firstLine.specId) : null;
                return {
                  id: m.id,
                  date: m.createdAt,
                  type: m.type,
                  notes: m.notes,
                  creator: store.getUser(m.createdById)?.name || 'System',
                  location: m.location || store.getUser(m.createdById)?.location || 'Toronto',
                  itemNoteText: spec?.inventoryNote?.text || '',
                  itemNoteAuthor: spec?.inventoryNote?.authorName || '',
                  itemNoteCreatedAt: spec?.inventoryNote?.createdAt || '',
                  itemNoteLastEditedAt: spec?.inventoryNote?.lastEditedAt || ''
                };
              }), 'inventory_ledger')}>Export CSV</Button>
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
                  {movements.slice(0, 50).map(m => {
                    const isExpanded = !!expandedMovements[m.id];
                    const safeLines = m.lines || [];
                    return (
                      <React.Fragment key={m.id}>
                        <tr 
                          onClick={() => toggleMovement(m.id)} 
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
                                               <span className="text-blue-400/60">({l.ct.toFixed(3)}ct)</span>
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
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div className="flex flex-col md:flex-row gap-4 flex-1">
                 <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input 
                       type="text" 
                       placeholder="Search by client, phone, piece, code, or rep..." 
                       value={clientFilter}
                       onChange={e => setClientFilter(e.target.value)}
                       className="w-full bg-black border border-zinc-700 rounded-2xl py-2 pl-9 text-sm text-white focus:border-lux-gold"
                    />
                 </div>
                 <div className="flex items-center gap-2 text-xs">
                    <Filter size={14} className="text-zinc-500" />
                    <select 
                       value={salesRepFilter} 
                       onChange={e => setSalesRepFilter(e.target.value)}
                       className="bg-black border border-zinc-700 rounded-2xl py-2 px-2 text-white h-9"
                    >
                       <option value="ALL">All Sales Reps</option>
                       {salesReps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                 </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => exportCSV(filteredProjects.map(p => {
                const repair = store.getRepairDetails(p);
                const repairCost = store.getRepairCostSummary(p.id);
                return {
                  id: p.id,
                  code: p.code,
                  client: p.clientName || '',
                  piece: p.pieceName,
                  status: p.status,
                  salesRep: store.getUser(p.salesRepId || '')?.name || '',
                  serviceType: repair ? 'Repair' : store.getServiceNames(p).join(' / '),
                  repairType: repair?.type || '',
                  repairStatus: repair?.status || '',
                  internalCost: repair ? repairCost.totalInternalCostCad : store.getProjectCostSummary(p.id).totalProjectCostCad,
                  clientCharge: repair ? repairCost.finalClientChargeCad : '',
                  profitLoss: repair ? repairCost.profitLossCad : '',
                  noCharge: repairCost.noCharge ? 'Yes' : '',
                  outsourced: repairCost.outsourced ? 'Yes' : ''
                };
              }), 'project_history')}>Export CSV</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
                 <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className="bg-black border border-zinc-700 rounded-2xl py-2 px-2 text-white h-9">
                    <option value="ALL">All Services</option>
                    <option value="Repair">Repair</option>
                    <option value="Setting">Setting</option>
                    <option value="Custom Make">Custom Make</option>
                    <option value="Resize">Resize</option>
                 </select>
                 <select value={repairTypeFilter} onChange={e => setRepairTypeFilter(e.target.value)} className="bg-black border border-zinc-700 rounded-2xl py-2 px-2 text-white h-9">
                    <option value="ALL">All Repair Types</option>
                    {Object.values(RepairType).map(type => <option key={type} value={type}>{type}</option>)}
                 </select>
                 <select value={repairStatusFilter} onChange={e => setRepairStatusFilter(e.target.value)} className="bg-black border border-zinc-700 rounded-2xl py-2 px-2 text-white h-9">
                    <option value="ALL">All Repair Statuses</option>
                    {Object.values(RepairStatus).map(status => <option key={status} value={status}>{status}</option>)}
                 </select>
                 <select value={repairFlagFilter} onChange={e => setRepairFlagFilter(e.target.value)} className="bg-black border border-zinc-700 rounded-2xl py-2 px-2 text-white h-9">
                    <option value="ALL">All Repair Flags</option>
                    <option value="NO_CHARGE">No Charge</option>
                    <option value="OUTSOURCED">Outsourced</option>
                    <option value="ACTIVE_REPAIR">Active Repairs</option>
                    <option value="COMPLETED_REPAIR">Completed Repairs</option>
                 </select>
                 <Input type="date" value={dateFromFilter} onChange={e => setDateFromFilter(e.target.value)} />
                 <Input type="date" value={dateToFilter} onChange={e => setDateToFilter(e.target.value)} />
              </div>
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
                 {filteredProjects.map(p => {
                   const repair = store.getRepairDetails(p);
                   const previewImage = repair?.beforeImage || p.projectPhotos?.[0];
                   return (
                   <tr key={p.id} onClick={() => handleSelectProject(p)} className="hover:bg-zinc-900/50 cursor-pointer transition-colors group">
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
                        {p.code}
                        {p.isQuickRepair && <Badge color="blue">Quick Repair</Badge>}
                        {repair && <Badge color="amber">{repair.type}</Badge>}
                        {repair?.outsourced && <Badge color="blue">Outsourced</Badge>}
                     </td>
                     <td className="p-4 text-zinc-300">
                        <div>{p.clientName || '-'}</div>
                        {p.clientPhone && <div className="text-xs text-zinc-500 mt-0.5">{p.clientPhone}</div>}
                     </td>
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
                  );
                 })}
               </tbody>
              </table>
           </div>
        </Card>
      )}

      {activeTab === 'system' && (
        <Card className="overflow-hidden">
           <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex justify-between">
              <h3 className="font-bold text-white">System Logs</h3>
              <Button size="sm" variant="secondary" onClick={() => exportCSV(systemLogs.map(l => ({id: l.id, date: l.createdAt, user: store.getUser(l.createdById)?.name, action: l.action, details: l.details})), 'system_logs')}>Export CSV</Button>
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
                 {systemLogs.length === 0 ? (
                   <tr><td colSpan={4} className="p-8 text-center text-zinc-500">No system logs found.</td></tr>
                 ) : systemLogs.map(log => (
                   <tr key={log.id} className="hover:bg-zinc-900/30 transition-colors">
                     <td className="p-4 text-zinc-400 font-mono text-xs whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                     <td className="p-4 text-lux-cream font-medium">{store.getUser(log.createdById)?.name || 'System'}</td>
                     <td className="p-4">
                       <Badge color="blue">{log.action}</Badge>
                     </td>
                     <td className="p-4 text-zinc-400">{log.details}</td>
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
                                     <span className="text-zinc-300 font-bold text-sm">Final Gold Cost</span>
                                     <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
                                        <span>Combined Weight</span>
                                        <span>•</span>
                                        <span>{projectStats?.finalWeightG.toFixed(2)}g</span>
                                     </div>
                                  </div>
                                  <span className="text-white font-mono text-xl tracking-tight">
                                     {projectStats?.finalWeightG ? `$${projectStats?.goldCost.toFixed(2)}` : <span className="text-zinc-600">--</span>}
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
