
import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { InventoryMovementType, DiamondSpec, InventoryMovement, Project, Diamond, InventorySummaryItem, InventoryNote, NoteAuditEntry } from '../types';
import { Card, Button, StatusPill, Input } from '../components/UI';
import { FastEntryGrid } from '../components/FastEntryGrid';
import { isMeleeLocation } from '../services/inventoryMath';
import { PackagePlus, History, ArrowDownLeft, ArrowUpRight, Edit2, Filter, Search, AlertOctagon, Scale, LayoutGrid, Settings, Plus, ChevronDown, ChevronUp, BarChart3, Tag, ExternalLink, StickyNote, Download, FileDown, X, MoreHorizontal } from 'lucide-react';
import { useToast } from '../App';
import { useNavigate, useLocation } from 'react-router-dom';
import { InventoryNotesSection } from '../components/InventoryNotesSection';
import { jsPDF } from 'jspdf';
import { inventoryApi } from '../services/inventoryApi';
import { calculateRapnetInventorySummary } from '../services/rapnetService';
import { DiamondShapeIcon } from '../components/common/DiamondShapeIcon';

const InventoryPage: React.FC = () => {
  const showToast = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'stock' | 'add_stock' | 'broken'>('stock');
  
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [summary, setSummary] = useState<InventorySummaryItem[]>([]);
  const [specs, setSpecs] = useState<DiamondSpec[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [diamonds, setDiamonds] = useState<Diamond[]>([]);

  const currentUser = store.getCurrentUser();
  const settings = store.getSettings();
  const rawLocations = settings.inventoryLocations && settings.inventoryLocations.length > 0
    ? settings.inventoryLocations
    : ['Toronto', 'Miami'];

  const locations = rawLocations.filter(loc => store.hasLocationAccess(currentUser, loc));

  // Selected Location / Inventory Type Filter
  const [selectedLocation, setSelectedLocation] = useState<string>(() => {
    const raw = store.getSettings().inventoryLocations || ['Toronto', 'Miami'];
    const allowed = raw.filter(loc => store.hasLocationAccess(store.getCurrentUser(), loc));
    return allowed[0] || 'Toronto';
  });

  // Ensure selectedLocation is valid if locations change
  useEffect(() => {
    const validLocations = [...locations, 'Melee'];
    if (!validLocations.includes(selectedLocation)) {
      setSelectedLocation(locations[0] || 'Toronto');
    }
  }, [locations, selectedLocation]);

  // Check search params for notification navigation
  const locationObj = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(locationObj.search);
    const openNoteId = params.get('openNote');
    const loc = params.get('loc');
    
    if (openNoteId) {
      if (loc) {
        setSelectedLocation(loc);
      }
      
      // Allow selectedLocation state to apply, then expand the row
      setTimeout(() => {
        if (openNoteId.startsWith('spec-')) {
          setExpandedMeleeSpecId(openNoteId);
        } else {
          setExpandedDiamondId(openNoteId);
        }
        
        // Scroll the expanded row into view
        const element = document.getElementById(`row-${openNoteId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [locationObj.search]);

  // Sorting & Filtering State
  const [sortField, setSortField] = useState<string>('size');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterText, setFilterText] = useState('');

  // World-Class UI/UX States
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedShapeFilter, setSelectedShapeFilter] = useState<string | null>(null);
  const [expandedDiamondId, setExpandedDiamondId] = useState<string | null>(null);
  const [expandedMeleeSpecId, setExpandedMeleeSpecId] = useState<string | null>(null);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [mobileFullListOpen, setMobileFullListOpen] = useState(false);
  const [inlinePlaceValues, setInlinePlaceValues] = useState<{ [key: string]: string }>({});
  const [inlineCodeValues, setInlineCodeValues] = useState<{ [key: string]: string }>({});
  const [inlineNotesValues, setInlineNotesValues] = useState<{ [key: string]: string }>({});
  const [actionHistory, setActionHistory] = useState<{ id: string; prevData: Partial<Diamond> }[]>([]);
  
  // Global Activity Filters & Expand State
  const [activitySearch, setActivitySearch] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'UPDATE'>('ALL');
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);

  // Inline Operations
  const toggleSoldStatus = async (diamondId: string, currentStatus: string) => {
    const oldDia = diamonds.find(d => d.id === diamondId);
    if (oldDia) {
      setActionHistory(prev => [...prev, { id: diamondId, prevData: { sold: oldDia.sold || '' } }]);
    }
    const newStatus = currentStatus === 'SOLD' ? '' : 'SOLD';
    await store.updateDiamond(diamondId, { sold: newStatus });
    showToast(`Diamond marked as ${newStatus === 'SOLD' ? 'Sold' : 'Available'}`);
  };

  const toggleMountState = async (diamondId: string, currentState: string) => {
    const oldDia = diamonds.find(d => d.id === diamondId);
    if (oldDia) {
      setActionHistory(prev => [...prev, { id: diamondId, prevData: { mountLoose: oldDia.mountLoose || '' } }]);
    }
    const newState = currentState === 'MOUNTED' ? 'LOOSE' : 'MOUNTED';
    await store.updateDiamond(diamondId, { mountLoose: newState });
    showToast(`Diamond marked as ${newState}`);
  };

  const updatePlaceInline = async (diamondId: string, val: string) => {
    const oldDia = diamonds.find(d => d.id === diamondId);
    if (oldDia && (oldDia.place || '') !== val) {
      setActionHistory(prev => [...prev, { id: diamondId, prevData: { place: oldDia.place || '' } }]);
    }
    await store.updateDiamond(diamondId, { place: val });
    showToast(`Cabinet location updated to: ${val}`);
  };

  const updateCodeInline = async (diamondId: string, val: string) => {
    const oldDia = diamonds.find(d => d.id === diamondId);
    if (oldDia && (oldDia.code || '') !== val) {
      setActionHistory(prev => [...prev, { id: diamondId, prevData: { code: oldDia.code || '' } }]);
    }
    await store.updateDiamond(diamondId, { code: val });
    showToast(`Item code updated to: ${val}`);
  };

  const updateNotesInline = async (diamondId: string, val: string) => {
    const oldDia = diamonds.find(d => d.id === diamondId);
    if (oldDia && (oldDia.notes || '') !== val) {
      setActionHistory(prev => [...prev, { id: diamondId, prevData: { notes: oldDia.notes || '' } }]);
    }
    await store.updateDiamond(diamondId, { notes: val });
    showToast('Note saved');
  };

  const handleToggleExpand = (diamondId: string, currentPlace: string, currentCode: string, currentNotes?: string) => {
    if (expandedDiamondId === diamondId) {
      setExpandedDiamondId(null);
    } else {
      setExpandedDiamondId(diamondId);
      setInlinePlaceValues(prev => ({ ...prev, [diamondId]: currentPlace || '' }));
      setInlineCodeValues(prev => ({ ...prev, [diamondId]: currentCode || '' }));
      setInlineNotesValues(prev => ({ ...prev, [diamondId]: currentNotes || '' }));
    }
  };

  // 'Melee' behaves as aggregate spec view
  const isMeleeView = selectedLocation === 'Melee';
  // Specs filtered to the current melee-style location
  const currentSpecs = specs.filter(s => isMeleeLocation(s.location));

  // Analytics Calculation (Toronto/Miami)
  const analyticsData = React.useMemo(() => {
    if (isMeleeView) return null;
    
    const locationDiamonds = diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase());
    const totalCount = locationDiamonds.length;
    
    if (totalCount === 0) return null;
    
    const totalCarats = locationDiamonds.reduce((sum, d) => sum + (d.size || 0), 0);
    const avgCarats = totalCarats / totalCount;

    // Rapnet Valuation Engine
    const rapnet = calculateRapnetInventorySummary(locationDiamonds);
    
    // Status breakdown
    const soldCount = locationDiamonds.filter(d => d.sold?.toUpperCase() === 'SOLD').length;
    const availableCount = totalCount - soldCount;
    
    // Shape distribution
    const shapesMap: { [key: string]: number } = {};
    locationDiamonds.forEach(d => {
      const s = (d.shape || 'UNKNOWN').toUpperCase();
      shapesMap[s] = (shapesMap[s] || 0) + 1;
    });
    
    const shapesList = Object.entries(shapesMap)
      .map(([shape, count]) => ({ shape, count, percentage: (count / totalCount) * 100 }))
      .sort((a, b) => b.count - a.count);
      
    return {
      totalCount,
      totalCarats,
      avgCarats,
      soldCount,
      availableCount,
      shapesList,
      rapnet
    };
  }, [diamonds, selectedLocation]);

  // Analytics Calculation (Melee)
  const meleeAnalyticsData = React.useMemo(() => {
    if (!isMeleeView) return null;
    if (summary.length === 0) return null;

    const totalSpecs = summary.length;
    const totalPcs = summary.reduce((sum, item) => sum + (item.pcs || 0), 0);
    const totalCt = summary.reduce((sum, item) => sum + (item.ct || 0), 0);
    const avgCtPerStone = totalPcs > 0 ? totalCt / totalPcs : 0;

    // Stock level breakdown
    const wellStocked = summary.filter(item => item.pcs > 50).length;
    const moderate = summary.filter(item => item.pcs > 10 && item.pcs <= 50).length;
    const low = summary.filter(item => item.pcs > 0 && item.pcs <= 10).length;
    const empty = summary.filter(item => item.pcs === 0).length;

    // Shape distribution by pcs count
    const shapesMap: { [key: string]: number } = {};
    summary.forEach(item => {
      const s = (item.spec?.shape || 'ROUND').toUpperCase();
      shapesMap[s] = (shapesMap[s] || 0) + (item.pcs || 0);
    });
    const totalForPercentage = Object.values(shapesMap).reduce((a, b) => a + b, 0);
    const shapesList = Object.entries(shapesMap)
      .map(([shape, count]) => ({ shape, count, percentage: totalForPercentage > 0 ? (count / totalForPercentage) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    return {
      totalSpecs,
      totalPcs,
      totalCt,
      avgCtPerStone,
      wellStocked,
      moderate,
      low,
      empty,
      shapesList
    };
  }, [summary, isMeleeView]);

  // Filtered Global Activity Movements
  const filteredMovements = React.useMemo(() => {
    return movements.filter(mv => {
      const isPositive = mv.type.includes('IN') || mv.type === 'RETURN' || mv.type === 'BULK_RETURN_INTAKE' || mv.type === 'DIAMOND_ADD';
      const isNegative = mv.type === 'ISSUE' || mv.type === 'BROKEN_OUT' || mv.type === 'DIAMOND_DELETE' || mv.type === 'MELEE_SPEC_DELETE';
      const isNeutral = mv.type === 'DIAMOND_UPDATE';

      if (activityTypeFilter === 'IN' && !isPositive) return false;
      if (activityTypeFilter === 'OUT' && !isNegative) return false;
      if (activityTypeFilter === 'UPDATE' && !isNeutral) return false;

      if (activitySearch.trim()) {
        const q = activitySearch.toLowerCase().trim();
        const userName = (store.getUser(mv.createdById)?.name || 'System').toLowerCase();
        const notes = (mv.notes || '').toLowerCase();
        const bag = (mv.referenceBagNumber || '').toLowerCase();
        const type = mv.type.toLowerCase();
        return userName.includes(q) || notes.includes(q) || bag.includes(q) || type.includes(q);
      }

      return true;
    });
  }, [movements, activityTypeFilter, activitySearch]);

  // Filter and sort current stock (Melee)
  const filteredAndSortedSummary = React.useMemo(() => {
    if (!isMeleeView) return [];
    let result = [...summary];

    // Shape Filter from analytics donut click
    if (selectedShapeFilter) {
      result = result.filter(item => (item.spec?.shape || 'ROUND').toUpperCase() === selectedShapeFilter.toUpperCase());
    }

    // Filter
    if (filterText.trim()) {
      const q = filterText.toLowerCase().trim();
      result = result.filter(item => 
        (item.spec?.label || '').toLowerCase().includes(q) ||
        (item.spec?.shape || '').toLowerCase().includes(q) ||
        (item.spec?.inventoryNote?.text || '').toLowerCase().includes(q) ||
        (item.spec?.inventoryNote?.authorName || '').toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'spec') {
        // Mixed / Unsorted spec should always be sorted to the top in asc, bottom in desc
        if (a.spec?.id === 'MIXED-UNSORTED' && b.spec?.id !== 'MIXED-UNSORTED') {
          return sortDirection === 'asc' ? -1 : 1;
        }
        if (b.spec?.id === 'MIXED-UNSORTED' && a.spec?.id !== 'MIXED-UNSORTED') {
          return sortDirection === 'asc' ? 1 : -1;
        }
        
        valA = a.spec?.sizeMm ?? 0;
        valB = b.spec?.sizeMm ?? 0;
        
        if (valA === valB) {
          const labelA = a.spec?.label || '';
          const labelB = b.spec?.label || '';
          return sortDirection === 'asc' ? labelA.localeCompare(labelB) : labelB.localeCompare(labelA);
        }
      } else if (sortField === 'pcs') {
        valA = a.pcs || 0;
        valB = b.pcs || 0;
      } else { // 'ct'
        valA = a.ct || 0;
        valB = b.ct || 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [summary, filterText, sortField, sortDirection, isMeleeView, selectedShapeFilter]);

  // Filter and sort current stock (Certified Center Diamonds)
  const filteredAndSortedDiamonds = React.useMemo(() => {
    if (isMeleeView) return [];
    
    let result = diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase());

    // Shape Filter from Donut Slice click
    if (selectedShapeFilter) {
      result = result.filter(d => (d.shape || '').toUpperCase() === selectedShapeFilter.toUpperCase());
    }

    // Search Filter
    if (filterText.trim()) {
      const q = filterText.toLowerCase().trim();
      result = result.filter(d => 
        (d.shape || '').toLowerCase().includes(q) ||
        (d.color || '').toLowerCase().includes(q) ||
        (d.clarity || '').toLowerCase().includes(q) ||
        (d.certNumber || '').toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q) ||
        (d.place || '').toLowerCase().includes(q) ||
        (d.mountLoose || '').toLowerCase().includes(q) ||
        (d.inventoryNote?.text || '').toLowerCase().includes(q) ||
        (d.inventoryNote?.authorName || '').toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = (a as any)[sortField] ?? '';
      let valB: any = (b as any)[sortField] ?? '';

      if (sortField === 'size') {
        valA = a.size || 0;
        valB = b.size || 0;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [diamonds, selectedLocation, filterText, sortField, sortDirection, selectedShapeFilter]);

  // Automatically reset sort when switching view modes
  useEffect(() => {
    setSelectedShapeFilter(null);
    setExpandedDiamondId(null);
    setExpandedMeleeSpecId(null);
    if (isMeleeView) {
      setSortField('spec');
      setSortDirection('asc');
    } else {
      setSortField('size');
      setSortDirection('desc');
    }
  }, [selectedLocation]);

  // Global Keyboard listener for Command+Z / Ctrl+Z undo action (certified
  // diamonds only). Melee stock is no longer directly editable — corrections
  // go through the audited manager-only Inventory Correction workflow.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdZ = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z';
      if (isCmdZ) {
        // Only trigger custom undo if NOT typing inside an active input element
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true');

        if (isInput) return; // Allow default text field undo behavior

        if (actionHistory.length > 0) {
          e.preventDefault();
          const lastAction = actionHistory[actionHistory.length - 1];
          setActionHistory(prev => prev.slice(0, -1));
          store.updateDiamond(lastAction.id, lastAction.prevData);
          showToast("Undone last diamond adjustment");
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionHistory]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <span className="opacity-30 ml-1">↕</span>;
    return sortDirection === 'asc' ? <span className="text-lux-gold ml-1">↑</span> : <span className="text-lux-gold ml-1">↓</span>;
  };

  // Entry Mode Toggle
  const [entryMode, setEntryMode] = useState<'PCS' | 'WEIGHT'>('PCS');

  // Shipment Form State
  const [shipmentLines, setShipmentLines] = useState<any[]>([]);
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');

  // Breakage Form State (New Weight Based Logic)
  const [brokenProject, setBrokenProject] = useState('');
  const [brokenNote, setBrokenNote] = useState('');
  const [brokenCt, setBrokenCt] = useState('');
  const [brokenPcs, setBrokenPcs] = useState('');
  const [brokenSpec, setBrokenSpec] = useState('');
  
  // Inventory Correction Modal (manager-only; replaces Quick Stock Adjustment)
  const isManager = currentUser?.role === 'Manager';
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'PCS' | 'WEIGHT'>('PCS');
  const [editPcs, setEditPcs] = useState<string>('');
  const [editCt, setEditCt] = useState<string>('');
  const [editReason, setEditReason] = useState('');

  // Reconciliation Audit states
  const [resolvingIssueIdx, setResolvingIssueIdx] = useState<number | null>(null);
  const [resolveReason, setResolveReason] = useState<string>('');

  // Diamond Edit Modal State
  const [editingDiamond, setEditingDiamond] = useState<Diamond | null>(null);
  const [editMountLoose, setEditMountLoose] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [editSold, setEditSold] = useState('');

  // Quick Add Spec Modal
  const [isCreatingSpec, setIsCreatingSpec] = useState(false);
  const [newSpecData, setNewSpecData] = useState({ size: '', shape: 'Round', weight: '', cost: '' });

  // Quick Add Diamond Modal
  const [isCreatingDiamond, setIsCreatingDiamond] = useState(false);
  const [newDiamondData, setNewDiamondData] = useState({
    shape: 'ROUND', size: '', color: '', clarity: '', cut: '', certNumber: '', measurements: '', mountLoose: 'LOOSE', place: '', code: '', sold: ''
  });

  useEffect(() => {
    const sync = () => {
        refreshData();
        setSpecs(store.getSpecs());
        setProjects(store.getProjects());
        setDiamonds(store.getDiamonds());
    };
    sync();
    return store.subscribe(sync);
  }, []);

  useEffect(() => {
    if (editingDiamond) {
      setEditMountLoose(editingDiamond.mountLoose || '');
      setEditCode(editingDiamond.code || '');
      setEditPlace(editingDiamond.place || '');
      setEditSold(editingDiamond.sold || '');
    }
  }, [editingDiamond]);

  const refreshData = () => {
    setMovements([...store.getInventoryMovements()]);
    setSummary(store.getInventorySummary('Melee'));
  };

  const handleDiamondEdit = async () => {
    if (editingDiamond) {
      await store.updateDiamond(editingDiamond.id, {
        mountLoose: editMountLoose,
        code: editCode,
        place: editPlace,
        sold: editSold
      });
      showToast("Diamond updated successfully");
      setEditingDiamond(null);
    }
  };

  const handleCreateDiamond = async () => {
    const sizeVal = parseFloat(newDiamondData.size);
    if (!newDiamondData.shape) return alert("Shape is required");
    if (isNaN(sizeVal) || sizeVal <= 0) return alert("Valid size (carat) is required");
    
    const displayLocation = selectedLocation === 'Melee' ? (locations[0] || 'Toronto') : selectedLocation;
    const locPrefix = displayLocation.slice(0, 3).toLowerCase();
    
    const newDia: Diamond = {
      id: 'dia-' + locPrefix + '-' + Math.random().toString(36).substr(2, 8),
      location: displayLocation,
      shape: newDiamondData.shape.toUpperCase(),
      size: sizeVal,
      color: newDiamondData.color.toUpperCase(),
      clarity: newDiamondData.clarity.toUpperCase(),
      cut: newDiamondData.cut.toUpperCase(),
      certNumber: newDiamondData.certNumber,
      measurements: newDiamondData.measurements,
      mountLoose: newDiamondData.mountLoose,
      place: newDiamondData.place,
      code: newDiamondData.code,
      sold: newDiamondData.sold,
      stocktake: ""
    };
    
    await store.addDiamond(newDia);
    showToast("Diamond added successfully");
    setIsCreatingDiamond(false);
    setNewDiamondData({ shape: 'ROUND', size: '', color: '', clarity: '', cut: '', certNumber: '', measurements: '', mountLoose: 'LOOSE', place: '', code: '', sold: '' });
  };

  const getCurrentUserId = () => store.getCurrentUser()?.id || 'unknown';

  // Duplicate-submit guards for Add Stock / Breakage (double-click, retries).
  const [shipmentSubmitting, setShipmentSubmitting] = useState(false);
  const [breakageSubmitting, setBreakageSubmitting] = useState(false);

  const handleSubmitShipment = async () => {
    if (!isManager) {
      showToast("Only managers can record shipments or add stock");
      return;
    }
    const validLines = shipmentLines.filter(l => l.ct > 0);
    if (validLines.length === 0) return;
    if (shipmentSubmitting) return;

    const isQuickAdd = !supplier && !invoice;

    setShipmentSubmitting(true);
    try {
      await store.createInventoryMovement({
        type: InventoryMovementType.SHIPMENT_IN,
        createdById: getCurrentUserId(),
        // Weight mode: entered carat weight is authoritative and preserved exactly.
        // Pieces mode: carats are re-derived full-precision from the snapshot.
        weightAuthoritative: entryMode === 'WEIGHT',
        supplier: supplier || 'Internal',
        invoiceNo: invoice || 'Quick Add',
        notes: isQuickAdd
          ? `Manual Stock Add (${entryMode === 'WEIGHT' ? 'Weight' : 'Pcs'})`
          : `Shipment from ${supplier} (${entryMode === 'WEIGHT' ? 'By Weight' : 'By Pieces'})`,
        lines: validLines.map(l => ({
          specId: l.specId,
          pcs: l.pcs > 0 ? l.pcs : undefined,
          ct: l.ct,
          costPerCtUsd: l.cost
        })),
        location: selectedLocation
      });
      showToast("Stock Added Successfully");
      setShipmentLines([]);
      setSupplier('');
      setInvoice('');
      setActiveTab('stock');
    } finally {
      setShipmentSubmitting(false);
    }
  };

  const handleSubmitBreakage = async () => {
     if (!isManager) {
       showToast("Only managers can log standalone breakage");
       return;
     }
     const ctVal = parseFloat(brokenCt);
     const pcsVal = parseInt(brokenPcs) || 0;

     if (!brokenCt || isNaN(ctVal) || ctVal <= 0) return alert("Valid carat weight required.");
     if (!brokenNote) return alert("Reason is required.");
     if (breakageSubmitting) return;
     if (!window.confirm("Please confirm that the entered breakage information is correct.")) return;

     setBreakageSubmitting(true);
     try {
       await store.createInventoryMovement({
          type: InventoryMovementType.BROKEN_OUT,
          createdById: getCurrentUserId(),
          weightAuthoritative: true, // breakage is captured by weight
          referenceProjectId: brokenProject || undefined,
          notes: brokenNote,
          lines: [{
             specId: brokenSpec || undefined,
             pcs: pcsVal > 0 ? pcsVal : undefined,
             ct: ctVal
          }],
          location: selectedLocation
       });
       showToast("Breakage Recorded");
       setBrokenCt('');
       setBrokenPcs('');
       setBrokenSpec('');
       setBrokenProject('');
       setBrokenNote('');
       setActiveTab('stock');
     } finally {
        setBreakageSubmitting(false);
      }
   };

   // Guards against duplicate submits from double-clicks / rapid retries.
   const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

   // Manager-only reconciliation audit
   const [showAudit, setShowAudit] = useState(false);
   const [auditResult, setAuditResult] = useState<any>(null);
   const [auditBusy, setAuditBusy] = useState(false);

   const runAudit = async () => {
      if (!isManager) {
        showToast("Only managers can run reconciliation audits");
        return;
      }
      setAuditBusy(true);
      try {
        const res = await inventoryApi.runReconciliationAudit({ location: 'TORONTO_MELEE', dryRun: true });
        setAuditResult(res);
        setShowAudit(true);
      } catch (err: any) {
        showToast(err?.message || 'Reconciliation audit failed');
      } finally {
        setAuditBusy(false);
      }
    };

    const loadMoreAudit = async () => {
      if (!auditResult?.nextCursor || auditBusy) return;
      setAuditBusy(true);
      try {
        const next = await inventoryApi.runReconciliationAudit({
          location: 'TORONTO_MELEE', dryRun: true, cursor: auditResult.nextCursor,
        });
        setAuditResult((previous: any) => ({
          ...next,
          scannedSpecs: previous.scannedSpecs + next.scannedSpecs,
          lines: [...previous.lines, ...next.lines],
          issues: [...previous.issues, ...next.issues],
          needsManagerReview: [...previous.needsManagerReview, ...next.needsManagerReview],
        }));
      } catch (err: any) {
        showToast(err?.message || 'Could not load the next audit page');
      } finally {
        setAuditBusy(false);
      }
    };

    const applyInlineCorrection = async (iss: any) => {
      if (!isManager) {
        showToast("Only managers can apply corrections");
        return;
      }
      if (!resolveReason.trim()) {
        showToast("A correction reason is required");
        return;
      }
      if (!iss.correctionAllowed) {
        showToast("This discrepancy is evidence-only and cannot be corrected from the audit.");
        return;
      }
      const targetPcs = iss.expectedPcs;
      const targetCt = iss.expectedCt;
      if (!window.confirm(`Approve this single reconciliation correction?\n\nCurrent: ${iss.currentPcs} pcs / ${iss.currentCt.toFixed(6)} ct\nExpected: ${targetPcs} pcs / ${targetCt.toFixed(6)} ct\n\nThis cannot be changed automatically or applied in bulk.`)) return;

      setCorrectionSubmitting(true);
      try {
        await store.applyInventoryCorrection({
          specId: iss.specId,
          location: iss.location,
          mode: 'PCS',
          previousPcs: iss.currentPcs,
          previousCt: iss.currentCt,
          newPcs: targetPcs,
          newCt: targetCt,
          reason: resolveReason.trim(),
          managerId: getCurrentUserId(),
          reconciliation: {
            auditFingerprint: iss.auditFingerprint,
            expectedPcs: iss.expectedPcs,
            expectedCt: iss.expectedCt,
            sourceEvidence: iss.sourceEvidence,
          },
        });
        showToast("Reconciliation correction applied");
        const res = await inventoryApi.runReconciliationAudit({ location: 'TORONTO_MELEE', dryRun: true });
        setAuditResult(res);
        setResolvingIssueIdx(null);
        setResolveReason('');
      } catch (err: any) {
        showToast(err?.message || "Correction failed");
      } finally {
        setCorrectionSubmitting(false);
      }
    };

  const handleStockEdit = async () => {
    if (!editingStock) return;
    if (!isManager) {
      showToast("Only managers can correct inventory balances");
      return;
    }
    if (correctionSubmitting) return;

    const item = summary.find(s => s.spec.id === editingStock);
    const spec = specs.find(s => s.id === editingStock);
    if (!item || !spec) { showToast("Specification not found"); return; }

    if (!editReason.trim()) { showToast("A correction reason is required"); return; }

    let newPcs = item.pcs;
    let newCt = item.ct;
    if (editMode === 'WEIGHT') {
      const ct = parseFloat(editCt);
      if (isNaN(ct) || ct < 0) { showToast("Enter a valid carat weight"); return; }
      newCt = ct;
      newPcs = spec.ctPerStone > 0 ? Math.round(ct / spec.ctPerStone) : item.pcs;
    } else {
      const qty = parseInt(editPcs);
      if (isNaN(qty) || qty < 0) { showToast("Enter a valid piece count"); return; }
      newPcs = qty;
      newCt = parseFloat((qty * spec.ctPerStone).toFixed(6));
    }

    setCorrectionSubmitting(true);
    try {
      await store.applyInventoryCorrection({
        specId: editingStock,
        location: 'Melee',
        mode: editMode,
        previousPcs: item.pcs,
        previousCt: item.ct,
        newPcs,
        newCt,
        reason: editReason.trim(),
        managerId: getCurrentUserId(),
      });
      showToast("Inventory correction recorded");
      setEditingStock(null);
      setEditReason('');
      setEditPcs('');
      setEditCt('');
    } catch (err: any) {
      showToast(err?.message || "Correction failed");
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const handleCreateSpec = async () => {
      const size = parseFloat(newSpecData.size);
      const weight = parseFloat(newSpecData.weight);
      
      if (!newSpecData.size || isNaN(size)) return alert("Size is required");
      if (!newSpecData.weight || isNaN(weight)) return alert("Avg Weight is required");

      // Default shape to Round since selector was removed
      const shape = 'Round'; 
      const label = `${newSpecData.size}mm ${shape}`;
      
      const newSpec: DiamondSpec = {
          id: 'sp-' + Math.random().toString(36).substr(2, 9),
          label: label,
          sizeMm: size,
          shape: shape,
          ctPerStone: weight,
          defaultCostPerCtUsd: parseFloat(newSpecData.cost) || 0,
          isOverride: !!newSpecData.cost
      };

      await store.addSpec(newSpec);
      setIsCreatingSpec(false);
      setNewSpecData({ size: '', shape: 'Round', weight: '', cost: '' });
      showToast(`Created: ${label}`);
  };



  const exportCurrentStockCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (isMeleeView) {
      headers = [
        'Spec Label',
        'Shape',
        'Size (mm)',
        'Avg Weight (ct)',
        'Cost per Ct (USD)',
        'Quantity (pcs)',
        'Weight (ct)',
        'Est Value (USD)',
        'Note Text',
        'Note Author',
        'Note Created At',
        'Note Last Edited At',
        'Location'
      ];
      
      rows = filteredAndSortedSummary.map(item => {
        const estValue = (item.ct * (item.spec.defaultCostPerCtUsd || 0)).toFixed(2);
        return [
          item.spec.label,
          item.spec.shape || 'Round',
          String(item.spec.sizeMm),
          String(item.spec.ctPerStone),
          String(item.spec.defaultCostPerCtUsd || 0),
          String(item.pcs),
          item.ct.toFixed(3),
          estValue,
          item.spec.inventoryNote?.text || '',
          item.spec.inventoryNote?.authorName || '',
          item.spec.inventoryNote?.createdAt || '',
          item.spec.inventoryNote?.lastEditedAt || '',
          'Melee'
        ];
      });
    } else {
      headers = [
        'Stone ID',
        'Shape',
        'Size (ct)',
        'Color',
        'Clarity',
        'Cut',
        'Certificate #',
        'Mounting',
        'Item Code',
        'Cabinet/Place',
        'Status',
        'Note Text',
        'Note Author',
        'Note Created At',
        'Note Last Edited At',
        'Location'
      ];
      
      rows = filteredAndSortedDiamonds.map(d => [
        d.id,
        d.shape,
        d.size.toFixed(2),
        d.color || '',
        d.clarity || '',
        d.cut || '',
        d.certNumber || '',
        d.mountLoose || '',
        d.code || '',
        d.place || '',
        d.sold ? 'SOLD' : 'AVAILABLE',
        d.inventoryNote?.text || d.notes || '',
        d.inventoryNote?.authorName || (d.notes ? 'Legacy Note' : ''),
        d.inventoryNote?.createdAt || '',
        d.inventoryNote?.lastEditedAt || '',
        d.location
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(val => {
          const s = String(val ?? '').replace(/"/g, '""');
          return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_${selectedLocation.toLowerCase()}_stock_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV exported successfully');
  };

  const exportCurrentStockPDF = () => {
    const doc = new jsPDF();
    let y = 20;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(22, 23, 29);
    doc.text("KILANI DIAMOND REPORTER", 20, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(184, 134, 11);
    doc.text(`Inventory Stock Report — ${selectedLocation.toUpperCase()} Location`, 20, y);
    y += 12;

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
    y += 8;

    // Draw Line
    doc.setDrawColor(184, 134, 11);
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 10;

    // Render Table
    if (isMeleeView) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(22, 23, 29);
      doc.text("Spec Label", 20, y);
      doc.text("Shape", 50, y);
      doc.text("Qty", 75, y);
      doc.text("Weight", 90, y);
      doc.text("Cost/Ct", 110, y);
      doc.text("Notes", 130, y);
      y += 6;

      doc.line(20, y - 2, 190, y - 2);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      filteredAndSortedSummary.forEach(item => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(item.spec.label, 20, y);
        doc.text(item.spec.shape || 'Round', 50, y);
        doc.text(String(item.pcs), 75, y);
        doc.text(`${item.ct.toFixed(3)} ct`, 90, y);
        doc.text(`$${item.spec.defaultCostPerCtUsd || 0}`, 110, y);
        
        // Note snippet
        const noteText = item.spec.inventoryNote?.text || '';
        const noteSnippet = noteText.length > 30 ? noteText.slice(0, 27) + '...' : noteText;
        doc.text(noteSnippet, 130, y);
        y += 7;
      });
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(22, 23, 29);
      doc.text("Shape", 20, y);
      doc.text("Weight", 40, y);
      doc.text("Color", 60, y);
      doc.text("Clarity", 75, y);
      doc.text("Code", 95, y);
      doc.text("Cabinet", 120, y);
      doc.text("Notes", 140, y);
      y += 6;

      doc.line(20, y - 2, 190, y - 2);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      filteredAndSortedDiamonds.forEach(d => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(d.shape, 20, y);
        doc.text(`${d.size.toFixed(2)} ct`, 40, y);
        doc.text(d.color || '-', 60, y);
        doc.text(d.clarity || '-', 75, y);
        doc.text(d.code || '-', 95, y);
        doc.text(d.place || '-', 120, y);
        
        const noteText = d.inventoryNote?.text || d.notes || '';
        const noteSnippet = noteText.length > 30 ? noteText.slice(0, 27) + '...' : noteText;
        doc.text(noteSnippet, 140, y);
        y += 7;
      });
    }

    doc.save(`inventory_${selectedLocation.toLowerCase()}_stock_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('PDF exported successfully');
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 safe-pt pb-24">
      {/* 
        ======================================================================
        PREMIUM MOBILE + DESKTOP HEADER & CONTROLS
        ======================================================================
      */}
      
      {/* Mobile Sticky Header */}
      <div className="md:hidden sticky top-0 z-50 -mx-4 px-4 py-3 bg-theme-bg/80 backdrop-blur-xl border-b border-white/5 mb-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-lux-gold/10 rounded-xl flex items-center justify-center border border-lux-gold/20">
            <LayoutGrid className="text-lux-gold" size={18} />
          </div>
          <h1 className="text-xl font-bold text-lux-cream tracking-tight">Inventory</h1>
        </div>
      </div>

      {/* Desktop Header (Hidden on Mobile) */}
      <div className="hidden md:flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 mt-6">
        <div data-tour="inventory-header">
          <h1 className="text-3xl font-bold text-lux-cream tracking-tight flex items-center gap-3">
             <div className="w-10 h-10 bg-lux-gold/10 rounded-2xl flex items-center justify-center border border-lux-gold/20">
                <LayoutGrid className="text-lux-gold" size={24} />
             </div>
             Inventory Ledger
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5 ml-1">Precision aggregate tracking and stock management.</p>
        </div>
        
        <div className="flex flex-wrap gap-1.5 bg-zinc-900/40 backdrop-blur-xl p-1.5 rounded-3xl border border-white/5 w-full md:w-auto shadow-inner">
           <button 
             onClick={() => setActiveTab('stock')} 
             className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ${activeTab === 'stock' ? 'bg-lux-gold text-black shadow-glow' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
           >
             Current Stock
           </button>
           {isManager && (
             <button 
               onClick={() => setActiveTab('add_stock')} 
               className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ${activeTab === 'add_stock' ? 'bg-lux-gold text-black shadow-glow' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
             >
               Add Stock
             </button>
           )}
           {isManager && (
             <button 
               onClick={() => setActiveTab('broken')} 
               className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ${activeTab === 'broken' ? 'bg-lux-gold text-black shadow-glow' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
             >
               Log Breakage
             </button>
           )}
        </div>
      </div>

      {/* Mobile Segmented Control (iOS Style) */}
      <div className="md:hidden flex bg-black/40 p-1 rounded-xl border border-white/5 mb-6 shadow-inner">
         <button 
           onClick={() => setActiveTab('stock')} 
           className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${activeTab === 'stock' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500'}`}
         >
           Stock
         </button>
         {isManager && (
           <button 
             onClick={() => setActiveTab('add_stock')} 
             className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${activeTab === 'add_stock' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500'}`}
           >
             Add
           </button>
         )}
         {isManager && (
           <button 
             onClick={() => setActiveTab('broken')} 
             className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${activeTab === 'broken' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500'}`}
           >
             Breakage
           </button>
         )}
      </div>

      {activeTab === 'stock' && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
          
          {/* Mobile Premium Control Panel (Search, Locations, Actions) */}
          <div className="md:hidden flex flex-col gap-4 mb-2">
            {/* Search */}
            <div className="relative w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-lux-gold transition-colors" />
              <input 
                type="text" 
                placeholder={isMeleeView ? "Search melee specs..." : "Search diamonds by shape, code, or cert..."}
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl text-sm text-lux-cream focus:border-lux-gold/50 focus:bg-black/60 outline-none transition-all placeholder:text-zinc-600 shadow-glass"
              />
            </div>
            
            {/* Scrollable Location Pills */}
            <div className="-mx-4 px-4 overflow-x-auto no-scrollbar flex items-center gap-2 pb-2">
              {[...locations.filter(l => l !== 'Melee'), 'Melee'].map(loc => (
                <button
                  key={loc}
                  onClick={() => setSelectedLocation(loc)}
                  className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border ${selectedLocation === loc ? 'bg-lux-gold text-black border-lux-gold shadow-[0_4px_12px_rgba(245,194,73,0.2)]' : 'bg-black/40 text-zinc-400 border-white/10 hover:text-white'}`}
                >
                  {loc}
                </button>
              ))}
            </div>

            {/* Mobile Action Controls */}
            <div className="flex items-center gap-2 pb-1">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all border ${showAnalytics ? 'bg-lux-gold/20 text-lux-gold border-lux-gold/30' : 'bg-white/[0.03] text-zinc-300 border-white/10 active:scale-95'}`}
              >
                <BarChart3 size={15} /> Analytics
              </button>

              <button
                onClick={() => setMobileActionsOpen(true)}
                className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold bg-white/[0.03] text-zinc-300 border border-white/10 active:scale-95 transition-all"
              >
                <MoreHorizontal size={16} /> More
              </button>
            </div>

            {/* Mobile Actions Bottom Sheet Modal */}
            {mobileActionsOpen && (
              <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setMobileActionsOpen(false)}>
                <div className="w-full max-w-lg bg-[#16171D] border-t border-white/10 rounded-t-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-lux-gold"></div>
                      <h3 className="text-base font-bold text-white">Stock Actions</h3>
                    </div>
                    <button onClick={() => setMobileActionsOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"><X size={16} /></button>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <button
                      onClick={() => { exportCurrentStockPDF(); setMobileActionsOpen(false); }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 text-lux-cream hover:bg-white/5 text-left font-bold text-sm transition-all"
                    >
                      <div className="w-9 h-9 rounded-xl bg-lux-gold/10 text-lux-gold flex items-center justify-center">
                        <FileDown size={18} />
                      </div>
                      <div>
                        <div>Export PDF Stock Report</div>
                        <div className="text-[11px] text-zinc-500 font-normal">Formatted print-ready document</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { exportCurrentStockCSV(); setMobileActionsOpen(false); }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 text-lux-cream hover:bg-white/5 text-left font-bold text-sm transition-all"
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <Download size={18} />
                      </div>
                      <div>
                        <div>Export CSV Spreadsheet</div>
                        <div className="text-[11px] text-zinc-500 font-normal">Raw data for Excel or Sheets</div>
                      </div>
                    </button>

                    {isManager && isMeleeView && (
                      <button
                        onClick={() => { runAudit(); setMobileActionsOpen(false); }}
                        className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-left font-bold text-sm transition-all"
                      >
                        <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
                          <AlertOctagon size={18} />
                        </div>
                        <div>
                          <div>Audit Balance Integrity</div>
                          <div className="text-[11px] text-red-400/70 font-normal">Reconcile melee weight vs stock logs</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {selectedShapeFilter && (
              <div className="flex items-center justify-between px-3 py-2 bg-lux-gold/5 border border-lux-gold/10 rounded-xl">
                 <div className="flex items-center gap-1.5">
                   <Tag size={12} className="text-lux-gold" />
                   <span className="text-xs font-bold text-lux-gold uppercase tracking-wider">{selectedShapeFilter}</span>
                 </div>
                 <button onClick={() => setSelectedShapeFilter(null)} className="w-6 h-6 flex items-center justify-center rounded-full bg-black/20 text-zinc-400 hover:text-white"><X size={12} /></button>
              </div>
            )}
            
            <div className="flex items-center justify-between px-1 mt-2">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">{isMeleeView ? 'Melee Stock' : 'Certified Diamonds'}</span>
              <span className="text-xs font-mono font-bold text-lux-cream">
                 {isMeleeView
                   ? (filteredAndSortedSummary.length !== summary.length ? `${filteredAndSortedSummary.length}/${summary.length}` : summary.length)
                   : (filteredAndSortedDiamonds.length !== diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase()).length
                       ? `${filteredAndSortedDiamonds.length}/${diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase()).length}`
                       : diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase()).length)} Items
              </span>
            </div>
          </div>

          {/* Desktop Control Bar (Hidden on Mobile) */}
          <Card className="hidden md:flex w-full overflow-hidden border-white/5 shadow-glass flex-col min-h-[500px] md:h-[650px] liquid-glass">
             <div className="p-4 border-b border-white/5 flex flex-wrap gap-4 justify-between items-center bg-white/[0.02]">
                <div className="flex items-center gap-4 flex-wrap">
                   <div className="relative group">
                      <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-lux-gold transition-colors" />
                      <input 
                        type="text" 
                        placeholder={isMeleeView ? "Filter specs..." : "Filter diamonds..."}
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                        className="pl-10 text-sm bg-black/40 border border-white/5 text-lux-cream rounded-2xl py-2 w-48 focus:border-lux-gold/50 focus:ring-2 focus:ring-lux-gold/10 outline-none transition-all placeholder:text-zinc-600" 
                      />
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Location:</span>
                     <select 
                       value={selectedLocation}
                       onChange={e => setSelectedLocation(e.target.value)}
                       className="bg-[#16171D] border border-white/5 text-lux-cream rounded-xl px-3 py-1.5 text-xs font-bold focus:border-lux-gold/50 focus:ring-2 focus:ring-lux-gold/10 outline-none cursor-pointer"
                     >
                       {locations.filter(l => l !== 'Melee').map(loc => (
                         <option key={loc} value={loc}>{loc}</option>
                       ))}
                       <option value="Melee">Melee</option>
                     </select>
                   </div>
                   <button
                      onClick={() => setShowAnalytics(!showAnalytics)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${showAnalytics ? 'bg-lux-gold/20 text-lux-gold border-lux-gold/30' : 'bg-[#16171D] text-zinc-400 border-white/5 hover:text-white'}`}
                    >
                      <BarChart3 size={12} className={showAnalytics ? 'text-lux-gold' : 'text-zinc-500'} />
                      <span>Analytics</span>
                    </button>
                    <button
                      onClick={exportCurrentStockCSV}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border bg-[#16171D] text-zinc-400 border-white/5 hover:text-white"
                      title="Export current stock to CSV"
                    >
                      <Download size={12} className="text-zinc-500" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={exportCurrentStockPDF}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border bg-[#16171D] text-zinc-400 border-white/5 hover:text-white"
                      title="Export current stock to PDF"
                    >
                      <FileDown size={12} className="text-zinc-500" />
                      <span>Export PDF</span>
                    </button>
                    {isManager && isMeleeView && (
                      <button
                        onClick={runAudit}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border bg-[#16171D] text-zinc-400 border-white/5 hover:text-white"
                        title="Audit balance integrity (manager)"
                      >
                        <AlertOctagon size={12} className="text-zinc-500" />
                        <span>Reconcile</span>
                      </button>
                    )}
                   {selectedShapeFilter && (
                     <div className="flex items-center gap-1.5 px-3 py-1.5 bg-lux-gold/5 border border-lux-gold/10 rounded-xl">
                        <Tag size={12} className="text-lux-gold" />
                        <span className="text-[10px] font-bold text-lux-gold uppercase tracking-wider">{selectedShapeFilter}</span>
                        <button onClick={() => setSelectedShapeFilter(null)} className="ml-1 text-zinc-500 hover:text-white text-[10px] font-bold">✕</button>
                     </div>
                   )}
                </div>
                <div className="flex items-center gap-3">
                   <div className="flex flex-col items-end mr-3">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                        {isMeleeView ? 'Total Specs' : 'Total Diamonds'}
                      </span>
                      <span className="text-sm font-mono font-bold text-lux-cream">
                         {isMeleeView
                           ? (filteredAndSortedSummary.length !== summary.length ? `${filteredAndSortedSummary.length}/${summary.length}` : summary.length)
                           : (filteredAndSortedDiamonds.length !== diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase()).length
                               ? `${filteredAndSortedDiamonds.length}/${diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase()).length}`
                               : diamonds.filter(d => d.location.toLowerCase() === selectedLocation.toLowerCase()).length)}
                      </span>
                   </div>
                   {isMeleeView ? (
                     <Button variant="secondary" size="sm" className="rounded-xl border-white/5" onClick={() => setActiveTab('add_stock')}>
                        <Plus size={14} className="mr-1" /> Add
                     </Button>
                   ) : (
                     <Button variant="secondary" size="sm" className="rounded-xl border-white/5" onClick={() => setIsCreatingDiamond(true)}>
                        <Plus size={14} className="mr-1" /> Add Stone
                     </Button>
                   )}
                </div>
             </div>

             <style>{`
               @keyframes subtle-pulse {
                 0%, 100% { opacity: 1; transform: scale(1); }
                 50% { opacity: 0.85; transform: scale(0.98); }
               }
               .animate-pulse-subtle {
                 animation: subtle-pulse 3s infinite ease-in-out;
               }
               .legend-bar-hover:hover {
                 background-color: rgba(255, 255, 255, 0.05);
               }
             `}</style>

             {/* Collapsible Analytics Panel */}
             {!isMeleeView && showAnalytics && analyticsData && (
               <div className="p-6 border-b border-white/5 bg-black/30 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-300">
                  {/* Donut Chart */}
                  <div className="flex flex-col items-center justify-center bg-white/[0.01] border border-white/5 p-4 rounded-2xl relative overflow-hidden group">
                     <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-4">Shape Distribution</div>
                     
                     <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full max-w-sm justify-center">
                        <div className="relative w-24 h-24 flex items-center justify-center">
                           <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
                              {(() => {
                                 let accumPercent = 0;
                                 const colors = ['#F5C249', '#60A5FA', '#34D399', '#F472B6', '#A78BFA', '#F59E0B', '#3B82F6', '#10B981'];
                                 return analyticsData.shapesList.slice(0, 6).map((item, idx) => {
                                    const strokeDasharray = `${item.percentage} ${100 - item.percentage}`;
                                    const strokeDashoffset = 100 - accumPercent;
                                    accumPercent += item.percentage;
                                    return (
                                       <circle 
                                          key={item.shape}
                                          cx="18"
                                          cy="18"
                                          r="15.915"
                                          fill="transparent"
                                          stroke={colors[idx % colors.length]}
                                          strokeWidth="3.2"
                                          strokeDasharray={strokeDasharray}
                                          strokeDashoffset={strokeDashoffset}
                                          className="cursor-pointer hover:stroke-[4] transition-all duration-300"
                                          onClick={() => setSelectedShapeFilter(selectedShapeFilter === item.shape ? null : item.shape)}
                                       >
                                          <title>{`${item.shape}: ${item.count} pcs (${item.percentage.toFixed(1)}%)`}</title>
                                       </circle>
                                    );
                                 });
                              })()}
                           </svg>
                           <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-xl font-bold font-mono text-white">{analyticsData.totalCount}</span>
                              <span className="text-[8px] text-zinc-500 uppercase tracking-widest">Stones</span>
                           </div>
                        </div>
                        
                        <div className="flex-1 space-y-1.5 max-h-24 overflow-y-auto no-scrollbar pr-1">
                           {analyticsData.shapesList.slice(0, 5).map((item, idx) => {
                              const colors = ['#F5C249', '#60A5FA', '#34D399', '#F472B6', '#A78BFA'];
                              const isSelected = selectedShapeFilter === item.shape;
                              return (
                                 <div 
                                    key={item.shape} 
                                    onClick={() => setSelectedShapeFilter(isSelected ? null : item.shape)}
                                    className={`flex items-center justify-between text-[10px] font-medium cursor-pointer py-0.5 px-1.5 rounded transition-colors ${isSelected ? 'bg-lux-gold/10 text-lux-gold' : 'hover:bg-white/5 text-zinc-400 hover:text-white'}`}
                                 >
                                    <div className="flex items-center gap-1.5 truncate">
                                       <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                                       <span className="font-bold truncate">{item.shape}</span>
                                    </div>
                                    <span className="font-mono text-zinc-500">{item.count}</span>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  </div>
                  
                  {/* Status Breakdown */}
                  <div className="flex flex-col bg-white/[0.01] border border-white/5 p-4 rounded-2xl justify-between">
                     <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Status Breakdown</div>
                        <div className="space-y-4">
                           <div>
                              <div className="flex justify-between text-xs mb-1">
                                 <span className="text-zinc-400 font-medium">Available</span>
                                 <span className="font-mono text-emerald-400 font-bold">{analyticsData.availableCount} stones</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                 <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(analyticsData.availableCount / analyticsData.totalCount) * 100}%` }}></div>
                              </div>
                           </div>
                           <div>
                              <div className="flex justify-between text-xs mb-1">
                                 <span className="text-zinc-400 font-medium">Sold</span>
                                 <span className="font-mono text-red-400 font-bold">{analyticsData.soldCount} stones</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                 <div className="h-full bg-red-500 rounded-full" style={{ width: `${(analyticsData.soldCount / analyticsData.totalCount) * 100}%` }}></div>
                              </div>
                           </div>
                        </div>
                     </div>
                     {selectedShapeFilter && (
                        <div className="mt-3 flex items-center justify-between bg-lux-gold/5 border border-lux-gold/10 p-2 rounded-xl">
                           <span className="text-[10px] text-lux-gold font-bold">Filter Active: {selectedShapeFilter}</span>
                           <button onClick={() => setSelectedShapeFilter(null)} className="text-[10px] text-zinc-400 hover:text-white uppercase font-bold tracking-wider">Clear</button>
                        </div>
                     )}
                  </div>

                  {/* Summary KPI Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl flex flex-col justify-center">
                        <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Total Carat Weight</span>
                        <span className="text-xl font-bold font-mono text-lux-cream mt-1 leading-none">
                           {analyticsData.totalCarats.toFixed(2)} <span className="text-xs text-zinc-500 font-sans">ct</span>
                        </span>
                        <span className="text-[8px] text-zinc-600 mt-1 uppercase">Avg Weight: {analyticsData.avgCarats.toFixed(2)}ct</span>
                     </div>
                     <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl flex flex-col justify-center">
                        <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Est Rapnet Inventory Value</span>
                        <span className="text-xl font-bold font-mono text-emerald-400 mt-1 leading-none">
                           ${analyticsData.rapnet.totalValueUsd.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                           <span className="text-[8px] text-zinc-500 uppercase font-mono">Est Avg: ${analyticsData.rapnet.avgPricePerCtUsd.toLocaleString()}/ct</span>
                           <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                             Rd: ${analyticsData.rapnet.roundValueUsd.toLocaleString()} | Fancy: ${analyticsData.rapnet.fancyValueUsd.toLocaleString()}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>
             )}

              {/* Melee Analytics Panel */}
              {isMeleeView && showAnalytics && meleeAnalyticsData && (
                <div className="p-6 border-b border-white/5 bg-black/30 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-300">
                   {/* Shape Distribution Donut */}
                   <div className="flex flex-col items-center justify-center bg-white/[0.01] border border-white/5 p-4 rounded-2xl relative overflow-hidden group">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-4">Shape Distribution (by Pcs)</div>
                      
                      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full max-w-sm justify-center">
                         <div className="relative w-24 h-24 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                               <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
                               {(() => {
                                  let accumPercent = 0;
                                  const colors = ['#F5C249', '#60A5FA', '#34D399', '#F472B6', '#A78BFA', '#F59E0B', '#3B82F6', '#10B981'];
                                  return meleeAnalyticsData.shapesList.slice(0, 6).map((item, idx) => {
                                     const strokeDasharray = `${item.percentage} ${100 - item.percentage}`;
                                     const strokeDashoffset = 100 - accumPercent;
                                     accumPercent += item.percentage;
                                     return (
                                        <circle 
                                           key={item.shape}
                                           cx="18"
                                           cy="18"
                                           r="15.915"
                                           fill="transparent"
                                           stroke={colors[idx % colors.length]}
                                           strokeWidth="3.2"
                                           strokeDasharray={strokeDasharray}
                                           strokeDashoffset={strokeDashoffset}
                                           className="cursor-pointer hover:stroke-[4] transition-all duration-300"
                                           onClick={() => setSelectedShapeFilter(selectedShapeFilter === item.shape ? null : item.shape)}
                                        >
                                           <title>{`${item.shape}: ${item.count.toLocaleString()} pcs (${item.percentage.toFixed(1)}%)`}</title>
                                        </circle>
                                     );
                                  });
                               })()}
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                               <span className="text-xl font-bold font-mono text-white">{meleeAnalyticsData.totalPcs.toLocaleString()}</span>
                               <span className="text-[8px] text-zinc-500 uppercase tracking-widest">Total Pcs</span>
                            </div>
                         </div>
                         
                         <div className="flex-1 space-y-1.5 max-h-24 overflow-y-auto no-scrollbar pr-1">
                            {meleeAnalyticsData.shapesList.slice(0, 5).map((item, idx) => {
                               const colors = ['#F5C249', '#60A5FA', '#34D399', '#F472B6', '#A78BFA'];
                               const isSelected = selectedShapeFilter === item.shape;
                               return (
                                  <div 
                                     key={item.shape} 
                                     onClick={() => setSelectedShapeFilter(isSelected ? null : item.shape)}
                                     className={`flex items-center justify-between text-[10px] font-medium cursor-pointer py-0.5 px-1.5 rounded transition-colors ${isSelected ? 'bg-lux-gold/10 text-lux-gold' : 'hover:bg-white/5 text-zinc-400 hover:text-white'}`}
                                  >
                                     <div className="flex items-center gap-1.5 truncate">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                                        <span className="font-bold truncate">{item.shape}</span>
                                     </div>
                                     <span className="font-mono text-zinc-500">{item.count.toLocaleString()}</span>
                                  </div>
                               );
                            })}
                         </div>
                      </div>
                   </div>
                   
                   {/* Stock Level Breakdown */}
                   <div className="flex flex-col bg-white/[0.01] border border-white/5 p-4 rounded-2xl justify-between">
                      <div>
                         <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Stock Level Breakdown</div>
                         <div className="space-y-3">
                            {[
                              { label: 'Well Stocked', count: meleeAnalyticsData.wellStocked, color: 'emerald', desc: '> 50 pcs' },
                              { label: 'Moderate', count: meleeAnalyticsData.moderate, color: 'amber', desc: '10-50 pcs' },
                              { label: 'Low Stock', count: meleeAnalyticsData.low, color: 'orange', desc: '1-10 pcs' },
                              { label: 'Empty', count: meleeAnalyticsData.empty, color: 'red', desc: '0 pcs' },
                            ].map(level => (
                              <div key={level.label}>
                                 <div className="flex justify-between text-xs mb-1">
                                    <span className="text-zinc-400 font-medium">{level.label} <span className="text-zinc-600 text-[9px]">({level.desc})</span></span>
                                    <span className={`font-mono font-bold text-${level.color}-400`}>{level.count} specs</span>
                                 </div>
                                 <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                    <div className={`h-full bg-${level.color}-500 rounded-full transition-all duration-500`} style={{ width: `${meleeAnalyticsData.totalSpecs > 0 ? (level.count / meleeAnalyticsData.totalSpecs) * 100 : 0}%` }}></div>
                                 </div>
                              </div>
                            ))}
                         </div>
                      </div>
                   </div>

                   {/* Melee KPI Metrics */}
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl flex flex-col justify-center">
                         <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Total Specs</span>
                         <span className="text-xl font-bold font-mono text-lux-cream mt-1 leading-none">
                            {meleeAnalyticsData.totalSpecs}
                         </span>
                         <span className="text-[8px] text-zinc-600 mt-1 uppercase">Defined sizes</span>
                      </div>
                      <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl flex flex-col justify-center">
                         <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Total Weight</span>
                         <span className="text-xl font-bold font-mono text-lux-cream mt-1 leading-none">
                            {meleeAnalyticsData.totalCt.toFixed(2)} <span className="text-xs text-zinc-500 font-sans">ct</span>
                         </span>
                         <span className="text-[8px] text-zinc-600 mt-1 uppercase">Avg: {meleeAnalyticsData.avgCtPerStone.toFixed(4)}ct/pc</span>
                      </div>
                      <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl flex flex-col justify-center col-span-2">
                         <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Total Pieces in Stock</span>
                         <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 leading-none">
                            {meleeAnalyticsData.totalPcs.toLocaleString()} <span className="text-xs text-zinc-500 font-sans">pcs</span>
                         </span>
                      </div>
                   </div>
                </div>
              )}
             
             <div className="flex-1 overflow-auto no-scrollbar">
                {/* ═══════════════════════════════════════════════════════════════════
                    DESKTOP DATA TABLE VIEW (hidden on mobile < md)
                   ═══════════════════════════════════════════════════════════════════ */}
                {/* ═══════════════════════════════════════════════════════════════════
                    DESKTOP DATA TABLE VIEW (hidden on mobile < md)
                   ═══════════════════════════════════════════════════════════════════ */}
                <table className="hidden md:table w-full text-sm text-left border-separate border-spacing-0">
                 {isMeleeView ? (
                   <>
                     <thead className="bg-zinc-900/80 text-zinc-500 sticky top-0 z-10 text-[11px] uppercase tracking-[0.1em] font-black backdrop-blur-xl border-b border-white/5 select-none">
                       <tr>
                         <th 
                           onClick={() => handleSort('spec')}
                           className="px-6 py-4 border-b border-white/5 cursor-pointer hover:text-white transition-colors"
                         >
                           <div className="flex items-center gap-1">
                             <span>Diamond Spec</span>
                             {getSortIcon('spec')}
                           </div>
                         </th>
                         <th 
                           onClick={() => handleSort('pcs')}
                           className="px-6 py-4 border-b border-white/5 text-right font-mono cursor-pointer hover:text-white transition-colors"
                         >
                           <div className="flex items-center justify-end gap-1">
                             <span>Stock (Pcs)</span>
                             {getSortIcon('pcs')}
                           </div>
                         </th>
                         <th 
                           onClick={() => handleSort('ct')}
                           className="px-6 py-4 border-b border-white/5 text-right font-mono cursor-pointer hover:text-white transition-colors"
                         >
                           <div className="flex items-center justify-end gap-1">
                             <span>Weight (Ct)</span>
                             {getSortIcon('ct')}
                           </div>
                         </th>
                         <th className="px-6 py-4 border-b border-white/5 text-right w-16"></th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-white/[0.03]">
                        {filteredAndSortedSummary.length > 0 ? filteredAndSortedSummary.map((item, i) => (
                          <React.Fragment key={i}>
                            <tr 
                              id={`row-${item.spec.id}`}
                              onClick={() => setExpandedMeleeSpecId(expandedMeleeSpecId === item.spec.id ? null : item.spec.id)}
                              className={`hover:bg-lux-gold/[0.03] active:bg-lux-gold/[0.05] cursor-pointer group transition-all duration-200 ${expandedMeleeSpecId === item.spec.id ? 'bg-lux-gold/[0.02]' : ''}`}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors border border-white/5 ${expandedMeleeSpecId === item.spec.id ? 'bg-lux-gold text-black' : 'bg-zinc-800 text-zinc-400 group-hover:bg-lux-gold group-hover:text-black'}`}>
                                      <DiamondShapeIcon shape={item.spec.shape || 'Round'} size={16} className="shrink-0" />
                                   </div>
                                   <div>
                                      <div className={`font-bold text-sm leading-tight transition-colors duration-200 flex items-center gap-1.5 ${expandedMeleeSpecId === item.spec.id ? 'text-lux-gold' : 'text-lux-cream'}`}>
                                        {item.spec.label}
                                        {item.spec.inventoryNote && <StickyNote size={11} className="text-lux-gold/70 shrink-0 animate-pulse-subtle" />}
                                      </div>
                                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5 opacity-60 uppercase">{item.spec.shape}</div>
                                   </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                 <span className={`font-mono text-sm tabular-nums font-bold ${item.pcs > 50 ? 'text-emerald-400' : item.pcs > 10 ? 'text-lux-gold' : item.pcs > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                                    {item.pcs > 0 ? item.pcs.toLocaleString() : '0'}
                                 </span>
                              </td>
                              <td className="px-6 py-4 text-right tabular-nums text-zinc-400 font-mono text-sm">
                                 {item.ct.toFixed(3)} <span className="text-[10px] text-zinc-600 ml-0.5">ct</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                 {isManager && (
                                   <button
                                     title="Correct balance (manager)"
                                     onClick={(e) => { e.stopPropagation(); setEditingStock(item.spec.id); setEditMode('PCS'); setEditPcs(item.pcs.toString()); setEditCt(item.ct.toFixed(3)); setEditReason(''); }}
                                     className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-lux-gold hover:bg-lux-gold/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-lux-gold/20"
                                   >
                                     <Edit2 size={14} />
                                   </button>
                                 )}
                              </td>
                            </tr>
                            {expandedMeleeSpecId === item.spec.id && (
                              <tr className="bg-black/30 animate-in fade-in duration-200">
                                <td colSpan={4} className="p-4 border-b border-white/5">
                                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-4 rounded-2xl bg-white/[0.01] border border-white/5 relative overflow-hidden">
                                    <div className="md:col-span-5 grid grid-cols-2 gap-y-4 gap-x-6 border-r border-white/5 pr-6" onClick={(e) => e.stopPropagation()}>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Size (mm)</span>
                                        <span className="text-sm text-lux-cream font-mono mt-1 block font-bold">{item.spec.sizeMm}mm</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Shape</span>
                                        <span className="text-sm text-lux-cream font-mono mt-1 block">{item.spec.shape || 'Round'}</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Avg Weight</span>
                                        <span className="text-sm text-lux-cream font-mono mt-1 block">{item.spec.ctPerStone}ct/pc</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Cost (USD/ct)</span>
                                        <span className="text-sm text-lux-cream font-mono mt-1 block">${item.spec.defaultCostPerCtUsd || 0}</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Current Pcs</span>
                                        <span className={`text-lg font-bold font-mono mt-1 block ${item.pcs > 50 ? 'text-emerald-400' : item.pcs > 10 ? 'text-lux-gold' : item.pcs > 0 ? 'text-orange-400' : 'text-red-400'}`}>{item.pcs.toLocaleString()}</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Current Weight</span>
                                        <span className="text-lg font-bold font-mono mt-1 block text-lux-cream">{item.ct.toFixed(3)}<span className="text-[10px] text-zinc-600 ml-0.5">ct</span></span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Est Value</span>
                                        <span className="text-sm text-emerald-400 font-mono mt-1 block font-bold">${(item.ct * (item.spec.defaultCostPerCtUsd || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                      </div>
                                    </div>
                                    <div className="md:col-span-7 flex flex-col gap-4 pl-2" onClick={(e) => e.stopPropagation()}>
                                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-white/5 pb-1">Inventory Correction</div>
                                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                                        Balances update automatically from Add Stock, issues, returns and breakage.
                                        Manual balance edits are recorded as an auditable, manager-only correction —
                                        pieces and carat weight are always adjusted together.
                                      </p>
                                      {isManager ? (
                                        <button
                                          onClick={() => { setEditingStock(item.spec.id); setEditMode('PCS'); setEditPcs(item.pcs.toString()); setEditCt(item.ct.toFixed(3)); setEditReason(''); }}
                                          className="w-fit flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border bg-lux-gold/10 text-lux-gold border-lux-gold/20 hover:bg-lux-gold/20"
                                        >
                                          <Edit2 size={13} /> Correct Balance
                                        </button>
                                      ) : (
                                        <div className="w-fit px-3 py-2 rounded-xl text-[11px] font-bold bg-white/[0.03] text-zinc-500 border border-white/5">
                                          Manager approval required for corrections
                                        </div>
                                      )}
                                      
                                      <div className="mt-2 pt-4 border-t border-white/5">
                                    <InventoryNotesSection
                                      item={item.spec}
                                      itemType="spec"
                                      currentUser={currentUser}
                                      onSave={async (text) => {
                                        const nowStr = new Date().toISOString();
                                        const authorId = currentUser?.id || 'unknown';
                                        const authorName = currentUser?.name || 'Unknown';
                                        const oldNoteText = item.spec.inventoryNote?.text || '';
                                        
                                        const note: InventoryNote = {
                                          text,
                                          authorId,
                                          authorName,
                                          createdAt: item.spec.inventoryNote?.createdAt || nowStr,
                                          lastEditedAt: nowStr,
                                          edited: !!item.spec.inventoryNote
                                        };
                                        
                                        const auditEntry: NoteAuditEntry = {
                                          id: 'audit-' + Math.random().toString(36).substr(2, 9),
                                          action: item.spec.inventoryNote ? 'edited' : 'created',
                                          timestamp: nowStr,
                                          userId: authorId,
                                          userName: authorName,
                                          userRole: currentUser?.role || 'SYSTEM',
                                          prevValue: oldNoteText,
                                          newValue: text,
                                          location: 'Melee'
                                        };
                                        
                                        const noteAuditTrail = [...(item.spec.noteAuditTrail || []), auditEntry];
                                        await store.updateSpec(item.spec.id, {
                                          inventoryNote: note,
                                          noteAuditTrail
                                        });
                                        
                                        await store.dispatchNoteMentions(text, item.spec.id, 'Melee', `${item.spec.label} Melee Spec`);
                                        showToast('Note updated successfully');
                                      }}
                                      onDelete={async () => {
                                        const nowStr = new Date().toISOString();
                                        const authorId = currentUser?.id || 'unknown';
                                        const authorName = currentUser?.name || 'Unknown';
                                        const oldNoteText = item.spec.inventoryNote?.text || '';
                                        
                                        const auditEntry: NoteAuditEntry = {
                                          id: 'audit-' + Math.random().toString(36).substr(2, 9),
                                          action: 'deleted',
                                          timestamp: nowStr,
                                          userId: authorId,
                                          userName: authorName,
                                          userRole: currentUser?.role || 'SYSTEM',
                                          prevValue: oldNoteText,
                                          newValue: '',
                                          location: 'Melee'
                                        };
                                        const noteAuditTrail = [...(item.spec.noteAuditTrail || []), auditEntry];
                                        await store.updateSpec(item.spec.id, {
                                          inventoryNote: undefined,
                                          noteAuditTrail
                                        });
                                        showToast('Note deleted successfully');
                                      }}
                                      onRestore={async (prevValue) => {
                                        const nowStr = new Date().toISOString();
                                        const authorId = currentUser?.id || 'unknown';
                                        const authorName = currentUser?.name || 'Unknown';
                                        const oldNoteText = item.spec.inventoryNote?.text || '';
                                        
                                        const note: InventoryNote = {
                                          text: prevValue,
                                          authorId,
                                          authorName,
                                          createdAt: item.spec.inventoryNote?.createdAt || nowStr,
                                          lastEditedAt: nowStr,
                                          edited: true
                                        };
                                        
                                        const auditEntry: NoteAuditEntry = {
                                          id: 'audit-' + Math.random().toString(36).substr(2, 9),
                                          action: 'restored',
                                          timestamp: nowStr,
                                          userId: authorId,
                                          userName: authorName,
                                          userRole: currentUser?.role || 'SYSTEM',
                                          prevValue: oldNoteText,
                                          newValue: prevValue,
                                          location: 'Melee'
                                        };
                                        const noteAuditTrail = [...(item.spec.noteAuditTrail || []), auditEntry];
                                        await store.updateSpec(item.spec.id, {
                                          inventoryNote: note,
                                          noteAuditTrail
                                        });
                                        await store.dispatchNoteMentions(prevValue, item.spec.id, 'Melee', `${item.spec.label} Melee Spec`);
                                        showToast('Note version restored');
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                            )}
                          </React.Fragment>
                        )) : (
                          <tr>
                             <td colSpan={4} className="py-20 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-20">
                                   <History size={48} />
                                   <p className="text-xl font-serif">
                                      {filterText ? "No matching stock found" : "No Stock Recorded"}
                                   </p>
                                </div>
                             </td>
                          </tr>
                        )}
                     </tbody>
                   </>
                 ) : (
                    <>
                      <thead className="bg-zinc-900/80 text-zinc-500 sticky top-0 z-10 text-[10px] uppercase tracking-[0.05em] font-black backdrop-blur-xl border-b border-white/5 select-none font-mono">
                        <tr>
                          {[
                            { label: 'Shape', field: 'shape', className: '' },
                            { label: 'Size', field: 'size', className: '' },
                            { label: 'Color', field: 'color', className: '' },
                            { label: 'Clarity', field: 'clarity', className: '' },
                            { label: 'Cert #', field: 'certNumber', className: 'hidden lg:table-cell' },
                            { label: 'Mount/Loose', field: 'mountLoose', className: 'hidden md:table-cell' },
                            { label: 'Item Code', field: 'code', className: 'hidden xl:table-cell' },
                            { label: 'Place', field: 'place', className: 'hidden xl:table-cell' },
                            { label: 'Status', field: 'sold', className: '' }
                          ].map(col => (
                            <th 
                              key={col.field}
                              onClick={() => handleSort(col.field)}
                              className={`px-3 py-3 border-b border-white/5 cursor-pointer hover:text-white transition-colors ${col.className} ${col.field === 'size' ? 'text-right' : ''}`}
                            >
                              <div className={`flex items-center gap-1 ${col.field === 'size' ? 'justify-end' : ''}`}>
                                <span>{col.label}</span>
                                {getSortIcon(col.field)}
                              </div>
                            </th>
                          ))}
                          <th className="px-3 py-3 border-b border-white/5 text-right w-12 font-sans"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {filteredAndSortedDiamonds.length > 0 ? filteredAndSortedDiamonds.map((d) => (
                          <React.Fragment key={d.id}>
                            <tr 
                              id={`row-${d.id}`}
                              onClick={() => handleToggleExpand(d.id, d.place, d.code, d.notes)}
                              className={`hover:bg-lux-gold/[0.03] active:bg-lux-gold/[0.05] cursor-pointer group transition-all duration-200 ${expandedDiamondId === d.id ? 'bg-lux-gold/[0.02]' : ''}`}
                            >
                              <td className={`px-3 py-3 font-bold text-xs transition-colors duration-200 ${expandedDiamondId === d.id ? 'text-lux-gold' : 'text-lux-cream'}`}>
                                <div className="flex items-center gap-1.5">
                                  {d.shape}
                                  {(d.notes || d.inventoryNote) && <span title={d.inventoryNote?.text || d.notes}><StickyNote size={11} className="text-lux-gold/70 shrink-0 animate-pulse-subtle" /></span>}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-lux-cream text-xs">{d.size.toFixed(2)} ct</td>
                              <td className="px-3 py-3 text-zinc-400 font-mono text-xs">{d.color || '-'}</td>
                              <td className="px-3 py-3 text-zinc-400 font-mono text-xs">{d.clarity || '-'}</td>
                              <td className="px-3 py-3 text-zinc-400 font-mono text-xs max-w-[120px] truncate hidden lg:table-cell" title={d.certNumber}>
                                {d.certNumber || '-'}
                              </td>
                              <td className="px-3 py-3 text-xs hidden md:table-cell">
                                {d.mountLoose ? (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.mountLoose.toUpperCase() === 'MOUNTED' ? 'bg-lux-gold/10 text-lux-gold' : 'bg-blue-500/10 text-blue-400'}`}>
                                    {d.mountLoose}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600 italic">-</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-zinc-400 font-mono text-xs hidden xl:table-cell">{d.code || '-'}</td>
                              <td className="px-3 py-3 text-zinc-400 text-xs hidden xl:table-cell">{d.place || '-'}</td>
                              <td className="px-3 py-3 text-xs">
                                {d.sold ? (
                                  <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1 w-fit">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                    {d.sold}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1 w-fit animate-pulse-subtle">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                    Available
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setEditingDiamond(d); }}
                                  className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-lux-gold hover:bg-lux-gold/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-lux-gold/20"
                                >
                                  <Edit2 size={14} />
                                </button>
                              </td>
                            </tr>
                            {expandedDiamondId === d.id && (
                              <tr className="bg-black/30 animate-in fade-in duration-200">
                                <td colSpan={10} className="p-4 border-b border-white/5">
                                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-4 rounded-2xl bg-white/[0.01] border border-white/5 relative overflow-hidden">
                                    <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-2 border-r border-white/5 pr-6">
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Report / Certificate</span>
                                        {d.certNumber ? (
                                          <a href={`https://www.gia.edu/report-check?reportno=${d.certNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-lux-gold hover:underline font-mono mt-1 flex items-center gap-1 w-fit" onClick={(e) => e.stopPropagation()}>
                                            {d.certNumber}
                                            <ExternalLink size={10} />
                                          </a>
                                        ) : (<span className="text-xs text-zinc-600 italic mt-1 block">N/A</span>)}
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Measurements</span>
                                        <span className="text-xs text-lux-cream font-mono mt-1 block">{d.measurements || 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Cut Grade</span>
                                        <span className="text-xs text-lux-cream font-mono mt-1 block">{d.cut ? (<span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] font-bold text-zinc-400">{d.cut}</span>) : 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Color Grade</span>
                                        <span className="text-xs text-lux-cream font-mono mt-1 block">{d.color || 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Clarity Grade</span>
                                        <span className="text-xs text-lux-cream font-mono mt-1 block">{d.clarity || 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">System Stone ID</span>
                                        <span className="text-[9px] text-zinc-500 font-mono mt-1 block select-all truncate" title={d.id} onClick={(e) => e.stopPropagation()}>{d.id}</span>
                                      </div>
                                    </div>
                                    <div className="md:col-span-5 flex flex-col gap-3.5 pl-2" onClick={(e) => e.stopPropagation()}>
                                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-white/5 pb-1">Quick Actions</div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Status</label>
                                          <button onClick={() => toggleSoldStatus(d.id, d.sold)} className={`w-full text-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${d.sold ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}`}>{d.sold ? 'SOLD' : 'AVAILABLE'}</button>
                                        </div>
                                        <div>
                                          <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Mounting</label>
                                          <button onClick={() => toggleMountState(d.id, d.mountLoose)} className={`w-full text-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${d.mountLoose?.toUpperCase() === 'MOUNTED' ? 'bg-lux-gold/15 text-lux-gold border-lux-gold/30 hover:bg-lux-gold/25' : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'}`}>{d.mountLoose || 'LOOSE'}</button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Cabinet / Place</label>
                                          <input type="text" value={inlinePlaceValues[d.id] ?? ''} onChange={e => { const val = e.target.value; setInlinePlaceValues(prev => ({ ...prev, [d.id]: val })); }} onBlur={() => updatePlaceInline(d.id, inlinePlaceValues[d.id] ?? '')} onKeyDown={e => { if (e.key === 'Enter') { updatePlaceInline(d.id, inlinePlaceValues[d.id] ?? ''); (e.target as HTMLInputElement).blur(); } }} className="w-full bg-[#16171D] border border-white/5 rounded-xl px-3 py-1 text-xs text-white focus:border-lux-gold/50 outline-none animate-enter" placeholder="Cabinet location" />
                                        </div>
                                        <div>
                                          <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Mounted Item Code</label>
                                          <input type="text" value={inlineCodeValues[d.id] ?? ''} onChange={e => { const val = e.target.value; setInlineCodeValues(prev => ({ ...prev, [d.id]: val })); }} onBlur={() => updateCodeInline(d.id, inlineCodeValues[d.id] ?? '')} onKeyDown={e => { if (e.key === 'Enter') { updateCodeInline(d.id, inlineCodeValues[d.id] ?? ''); (e.target as HTMLInputElement).blur(); } }} className="w-full bg-[#16171D] border border-white/5 rounded-xl px-3 py-1 text-xs text-white focus:border-lux-gold/50 outline-none animate-enter" placeholder="Item code" />
                                        </div>
                                      </div>
                                      
                                      <div className="mt-2 pt-4 border-t border-white/5">
                                        <InventoryNotesSection
                                      item={{
                                        ...d,
                                        inventoryNote: d.inventoryNote || (d.notes ? {
                                          text: d.notes,
                                          authorId: 'legacy',
                                          authorName: 'Legacy Note',
                                          createdAt: new Date().toISOString(),
                                          lastEditedAt: new Date().toISOString(),
                                          edited: false
                                        } : undefined)
                                      }}
                                      itemType="diamond"
                                      currentUser={currentUser}
                                      onSave={async (text) => {
                                        const nowStr = new Date().toISOString();
                                        const authorId = currentUser?.id || 'unknown';
                                        const authorName = currentUser?.name || 'Unknown';
                                        
                                        const oldNoteText = d.inventoryNote?.text || d.notes || '';
                                        const note: InventoryNote = {
                                          text,
                                          authorId,
                                          authorName,
                                          createdAt: d.inventoryNote?.createdAt || nowStr,
                                          lastEditedAt: nowStr,
                                          edited: !!(d.inventoryNote || d.notes)
                                        };
                                        
                                        const auditEntry: NoteAuditEntry = {
                                          id: 'audit-' + Math.random().toString(36).substr(2, 9),
                                          action: (d.inventoryNote || d.notes) ? 'edited' : 'created',
                                          timestamp: nowStr,
                                          userId: authorId,
                                          userName: authorName,
                                          userRole: currentUser?.role || 'SYSTEM',
                                          prevValue: oldNoteText,
                                          newValue: text,
                                          location: d.location
                                        };
                                        
                                        const noteAuditTrail = [...(d.noteAuditTrail || []), auditEntry];
                                        await store.updateDiamond(d.id, {
                                          inventoryNote: note,
                                          noteAuditTrail,
                                          notes: text
                                        });
                                        
                                        await store.dispatchNoteMentions(text, d.id, d.location, `${d.shape} (${d.size}ct${d.certNumber ? `, Report: ${d.certNumber}` : ''})`);
                                        showToast('Note updated successfully');
                                      }}
                                      onDelete={async () => {
                                        const nowStr = new Date().toISOString();
                                        const authorId = currentUser?.id || 'unknown';
                                        const authorName = currentUser?.name || 'Unknown';
                                        const oldNoteText = d.inventoryNote?.text || d.notes || '';
                                        
                                        const auditEntry: NoteAuditEntry = {
                                          id: 'audit-' + Math.random().toString(36).substr(2, 9),
                                          action: 'deleted',
                                          timestamp: nowStr,
                                          userId: authorId,
                                          userName: authorName,
                                          userRole: currentUser?.role || 'SYSTEM',
                                          prevValue: oldNoteText,
                                          newValue: '',
                                          location: d.location
                                        };
                                        const noteAuditTrail = [...(d.noteAuditTrail || []), auditEntry];
                                        await store.updateDiamond(d.id, {
                                          inventoryNote: undefined,
                                          noteAuditTrail,
                                          notes: ''
                                        });
                                        showToast('Note deleted successfully');
                                      }}
                                      onRestore={async (prevValue) => {
                                        const nowStr = new Date().toISOString();
                                        const authorId = currentUser?.id || 'unknown';
                                        const authorName = currentUser?.name || 'Unknown';
                                        const oldNoteText = d.inventoryNote?.text || d.notes || '';
                                        
                                        const note: InventoryNote = {
                                          text: prevValue,
                                          authorId,
                                          authorName,
                                          createdAt: d.inventoryNote?.createdAt || nowStr,
                                          lastEditedAt: nowStr,
                                          edited: true
                                        };
                                        
                                        const auditEntry: NoteAuditEntry = {
                                          id: 'audit-' + Math.random().toString(36).substr(2, 9),
                                          action: 'restored',
                                          timestamp: nowStr,
                                          userId: authorId,
                                          userName: authorName,
                                          userRole: currentUser?.role || 'SYSTEM',
                                          prevValue: oldNoteText,
                                          newValue: prevValue,
                                          location: d.location
                                        };
                                        const noteAuditTrail = [...(d.noteAuditTrail || []), auditEntry];
                                        await store.updateDiamond(d.id, {
                                          inventoryNote: note,
                                          noteAuditTrail,
                                          notes: prevValue
                                        });
                                        await store.dispatchNoteMentions(prevValue, d.id, d.location, `${d.shape} (${d.size}ct${d.certNumber ? `, Report: ${d.certNumber}` : ''})`);
                                        showToast('Note version restored');
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                            )}
                          </React.Fragment>
                        )) : (
                          <tr>
                             <td colSpan={10} className="py-20 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-20">
                                   <History size={48} />
                                   <p className="text-xl font-serif">
                                      {filterText ? "No matching diamonds found" : "No Diamonds Recorded"}
                                   </p>
                                </div>
                             </td>
                          </tr>
                        )}
                      </tbody>
                    </>
                  )}
               </table>
             </div>
          </Card>
          
          
          {/* 
            ======================================================================
            MOBILE PREMIUM NATIVE LIST VIEW (< md screens)
            ======================================================================
          */}
          <div className="md:hidden pb-12 space-y-4">
            {isMeleeView ? (
              filteredAndSortedSummary.length > 0 ? (
                filteredAndSortedSummary.map((item, i) => (
                  <div 
                    key={item.spec.id || i}
                    className={`relative rounded-[24px] overflow-hidden backdrop-blur-xl transition-all duration-300 transform active:scale-[0.98] cursor-pointer ${expandedMeleeSpecId === item.spec.id ? 'bg-lux-gold/10 border-lux-gold/30 shadow-[0_8px_32px_rgba(245,194,73,0.1)]' : 'bg-black/40 border-white/10'}`}
                    style={{ borderWidth: '1px' }}
                    onClick={() => setExpandedMeleeSpecId(expandedMeleeSpecId === item.spec.id ? null : item.spec.id)}
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition-colors ${expandedMeleeSpecId === item.spec.id ? 'bg-lux-gold text-black border-lux-gold' : 'bg-white/5 text-zinc-300 border-white/10'}`}>
                            <DiamondShapeIcon shape={item.spec.shape || 'Round'} size={22} />
                          </div>
                          <div>
                            <div className="font-bold text-base text-white flex items-center gap-1.5 tracking-tight">
                              {item.spec.label}
                              {item.spec.inventoryNote && <StickyNote size={14} className="text-lux-gold shrink-0" />}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-widest">{item.spec.shape || 'Round'} • {item.spec.sizeMm}mm</div>
                          </div>
                        </div>

                        <div className="text-right flex flex-col justify-center">
                          <div className={`font-mono text-xl font-black tracking-tight leading-none ${item.pcs > 50 ? 'text-emerald-400' : item.pcs > 10 ? 'text-lux-gold' : item.pcs > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                            {item.pcs > 0 ? item.pcs.toLocaleString() : '0'}
                          </div>
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Pieces</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-3 border-t border-white/10">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Weight</span>
                          <span className="font-mono text-lux-cream">{item.ct.toFixed(3)} ct</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Est Value</span>
                          <span className="font-mono text-emerald-400 font-bold">${(item.ct * (item.spec.defaultCostPerCtUsd || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Mobile Details (iOS Bottom Sheet Style) */}
                    <div 
                      className={`grid transition-all duration-300 ease-out ${expandedMeleeSpecId === item.spec.id ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                    >
                      <div className="overflow-hidden bg-black/40 border-t border-white/10">
                        <div className="p-4 space-y-4" onClick={e => e.stopPropagation()}>
                          {isManager && (
                            <button
                              onClick={() => { setEditingStock(item.spec.id); setEditMode('PCS'); setEditPcs(item.pcs.toString()); setEditCt(item.ct.toFixed(3)); setEditReason(''); }}
                              className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold bg-lux-gold text-black active:scale-95 transition-all shadow-[0_4px_20px_rgba(245,194,73,0.3)]"
                            >
                              <Edit2 size={16} /> Correct Balance
                            </button>
                          )}

                          <InventoryNotesSection
                            item={item.spec}
                            itemType="spec"
                            currentUser={currentUser}
                            onSave={async (text) => {
                              const nowStr = new Date().toISOString();
                              const authorId = currentUser?.id || 'unknown';
                              const authorName = currentUser?.name || 'Unknown';
                              const note = { text, authorId, authorName, createdAt: item.spec.inventoryNote?.createdAt || nowStr, lastEditedAt: nowStr, edited: !!item.spec.inventoryNote };
                              const auditEntry = { id: 'audit-' + Math.random().toString(36).substr(2, 9), action: item.spec.inventoryNote ? 'edited' : 'created', timestamp: nowStr, userId: authorId, userName: authorName, userRole: currentUser?.role || 'SYSTEM', prevValue: item.spec.inventoryNote?.text || '', newValue: text, location: 'Melee' } as NoteAuditEntry;
                              await store.updateSpec(item.spec.id, { inventoryNote: note, noteAuditTrail: [...(item.spec.noteAuditTrail || []), auditEntry] });
                              showToast('Note updated');
                            }}
                            onDelete={async () => {
                              await store.updateSpec(item.spec.id, { inventoryNote: undefined });
                              showToast('Note deleted');
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-zinc-600" />
                  </div>
                  <span className="text-zinc-500 font-mono text-sm">No matching melee stock found</span>
                </div>
              )
            ) : (
              filteredAndSortedDiamonds.length > 0 ? (
                filteredAndSortedDiamonds.map((d, i) => (
                  <div 
                    key={d.id}
                    className={`relative rounded-[24px] overflow-hidden backdrop-blur-xl transition-all duration-300 transform active:scale-[0.98] cursor-pointer ${expandedDiamondId === d.id ? 'bg-lux-gold/10 border-lux-gold/30 shadow-[0_8px_32px_rgba(245,194,73,0.1)]' : 'bg-black/40 border-white/10'}`}
                    style={{ borderWidth: '1px' }}
                    onClick={() => handleToggleExpand(d.id, d.place, d.code, d.notes)}
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition-colors ${expandedDiamondId === d.id ? 'bg-lux-gold text-black border-lux-gold' : 'bg-white/5 text-zinc-300 border-white/10'}`}>
                            <DiamondShapeIcon shape={d.shape} size={22} />
                          </div>
                          <div>
                            <div className="font-bold text-base text-white flex items-center gap-1.5 tracking-tight">
                              {d.shape}
                              <span className="font-mono text-lux-gold text-sm ml-1">{d.size.toFixed(2)}ct</span>
                              {(d.notes || d.inventoryNote) && <StickyNote size={14} className="text-lux-gold shrink-0" />}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-medium tracking-wide">
                              {d.color || '-'} / {d.clarity || '-'} {d.cut ? `• ${d.cut}` : ''}
                            </div>
                          </div>
                        </div>

                        <div>
                          {d.sold ? (
                            <span className="px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 font-black uppercase tracking-widest text-[9px] border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                              Sold
                            </span>
                          ) : (
                            <span className="px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 font-black uppercase tracking-widest text-[9px] border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                              Available
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Specs Bar */}
                      <div className="flex items-center justify-between bg-white/[0.03] rounded-xl p-2.5 mt-3 border border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">Place</span>
                          <span className="text-xs font-mono text-lux-cream">{d.place || '-'}</span>
                        </div>
                        <div className="w-px h-6 bg-white/10"></div>
                        <div className="flex flex-col text-center">
                          <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">Mount</span>
                          <span className="text-xs font-mono text-lux-cream">{d.mountLoose || 'LOOSE'}</span>
                        </div>
                        <div className="w-px h-6 bg-white/10"></div>
                        <div className="flex flex-col text-right">
                          <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">Code</span>
                          <span className="text-xs font-mono text-lux-cream truncate max-w-[80px]">{d.code || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Mobile Details */}
                    <div 
                      className={`grid transition-all duration-300 ease-out ${expandedDiamondId === d.id ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                    >
                      <div className="overflow-hidden bg-black/40 border-t border-white/10">
                        <div className="p-4 space-y-5" onClick={e => e.stopPropagation()}>
                          
                          {/* Touch Action Buttons */}
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => toggleSoldStatus(d.id, d.sold)}
                              className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs font-bold transition-all border active:scale-95 ${d.sold ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}
                            >
                              {d.sold ? 'Mark Available' : 'Mark Sold'}
                            </button>
                            <button
                              onClick={() => toggleMountState(d.id, d.mountLoose)}
                              className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs font-bold transition-all border active:scale-95 ${d.mountLoose?.toUpperCase() === 'MOUNTED' ? 'bg-lux-gold/20 text-lux-gold border-lux-gold/40' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}
                            >
                              {d.mountLoose?.toUpperCase() === 'MOUNTED' ? 'Mounted' : 'Loose'}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-xs bg-white/[0.02] p-3 rounded-2xl border border-white/5">
                            <div>
                              <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">GIA Cert #</span>
                              {d.certNumber ? (
                                <a href={`https://www.gia.edu/report-check?reportno=${d.certNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-lux-gold underline font-mono flex items-center gap-1 mt-1">
                                  {d.certNumber} <ExternalLink size={10} />
                                </a>
                              ) : <span className="text-zinc-600 italic mt-1 block">N/A</span>}
                            </div>
                            <div>
                              <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Measurements</span>
                              <span className="text-lux-cream font-mono mt-1 block">{d.measurements || 'N/A'}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5">Cabinet Place</label>
                              <input type="text" value={inlinePlaceValues[d.id] ?? ''} onChange={e => { const val = e.target.value; setInlinePlaceValues(prev => ({ ...prev, [d.id]: val })); }} onBlur={() => updatePlaceInline(d.id, inlinePlaceValues[d.id] ?? '')} className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-lux-gold/50 transition-colors" placeholder="Place" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5">Item Code</label>
                              <input type="text" value={inlineCodeValues[d.id] ?? ''} onChange={e => { const val = e.target.value; setInlineCodeValues(prev => ({ ...prev, [d.id]: val })); }} onBlur={() => updateCodeInline(d.id, inlineCodeValues[d.id] ?? '')} className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-lux-gold/50 transition-colors" placeholder="Code" />
                            </div>
                          </div>

                          <InventoryNotesSection
                            item={{
                              ...d,
                              inventoryNote: d.inventoryNote || (d.notes ? { text: d.notes, authorId: 'legacy', authorName: 'Legacy Note', createdAt: new Date().toISOString(), lastEditedAt: new Date().toISOString(), edited: false } : undefined)
                            }}
                            itemType="diamond"
                            currentUser={currentUser}
                            onSave={async (text) => {
                              const nowStr = new Date().toISOString();
                              const authorId = currentUser?.id || 'unknown';
                              const authorName = currentUser?.name || 'Unknown';
                              const note = { text, authorId, authorName, createdAt: d.inventoryNote?.createdAt || nowStr, lastEditedAt: nowStr, edited: true } as InventoryNote;
                              await store.updateDiamond(d.id, { inventoryNote: note, notes: text });
                              showToast('Note updated');
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-zinc-600" />
                  </div>
                  <span className="text-zinc-500 font-mono text-sm">No matching diamonds found</span>
                </div>
              )
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              GLOBAL ACTIVITY COLLAPSIBLE & FILTERABLE PANEL (Below Lists)
             ═══════════════════════════════════════════════════════════════════ */}
          <Card className="w-full flex flex-col p-0 overflow-hidden border-white/5 liquid-glass mt-4 mb-8">
            <button 
              onClick={() => setIsActivityExpanded(!isActivityExpanded)}
              className="w-full p-4 sm:p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-lux-gold/10 text-lux-gold border border-lux-gold/20 flex items-center justify-center shrink-0">
                  <History size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white tracking-tight">Global Activity</h3>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-bold border border-emerald-500/20">LIVE</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 font-medium">Tap to {isActivityExpanded ? 'collapse' : 'view full history & filter log'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="text-xs font-mono font-bold text-zinc-500">{filteredMovements.length} log{filteredMovements.length !== 1 ? 's' : ''}</span>
                <div className={`p-1.5 rounded-lg bg-white/5 transition-transform duration-300 ${isActivityExpanded ? 'rotate-180 text-lux-gold' : ''}`}>
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {isActivityExpanded && (
              <div className="p-4 sm:p-5 space-y-4 border-t border-white/5 bg-black/20 animate-in slide-in-from-top-2 duration-300">
                
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search activity by user, bag #, note..."
                      value={activitySearch}
                      onChange={e => setActivitySearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-lux-cream focus:border-lux-gold/50 outline-none placeholder:text-zinc-600 transition-all"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                    {[
                      { id: 'ALL', label: 'All' },
                      { id: 'IN', label: 'Added (+)' },
                      { id: 'OUT', label: 'Removed (-)' },
                      { id: 'UPDATE', label: 'Updates' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setActivityTypeFilter(f.id as any)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${activityTypeFilter === f.id ? 'bg-lux-gold text-black border-lux-gold shadow-sm' : 'bg-white/5 text-zinc-400 border-white/5 hover:text-white'}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Movement Entries */}
                <div className="max-h-[450px] overflow-y-auto space-y-3 no-scrollbar pr-1">
                  {filteredMovements.length > 0 ? (
                    filteredMovements.map(mv => {
                      const isPositive = mv.type.includes('IN') || mv.type === 'RETURN' || mv.type === 'BULK_RETURN_INTAKE' || mv.type === 'DIAMOND_ADD';
                      const isNegative = mv.type === 'ISSUE' || mv.type === 'BROKEN_OUT' || mv.type === 'DIAMOND_DELETE' || mv.type === 'MELEE_SPEC_DELETE';
                      const isNeutral = mv.type === 'DIAMOND_UPDATE';
                      
                      return (
                        <div key={mv.id} className="relative p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-lux-gold/20 transition-all group">
                           <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-3">
                                 <div className={`w-8 h-8 flex items-center justify-center rounded-xl shrink-0 ${isPositive ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : isNegative ? 'bg-red-950/40 text-red-400 border border-red-500/20' : 'bg-blue-950/40 text-blue-400 border border-blue-500/20'}`}>
                                   {isPositive ? <ArrowDownLeft size={14} /> : isNegative ? <AlertOctagon size={14} /> : <ArrowUpRight size={14} />}
                                 </div>
                                 <div>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-blue-400'}`}>
                                       {mv.type.replace(/_/g, ' ')}
                                    </span>
                                    <div className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">{new Date(mv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                 </div>
                              </div>
                              <div className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold shrink-0 ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : isNegative ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                 {isPositive ? '+' : isNegative ? '-' : ''}{mv.lines?.reduce((a,b)=>a+(b.ct||0),0).toFixed(2)} ct
                              </div>
                           </div>
                           
                           {mv.notes && (
                             <div className="text-[11px] text-zinc-400 leading-normal pl-11 line-clamp-2 italic opacity-80 group-hover:opacity-100 transition-opacity">
                                "{mv.notes}"
                             </div>
                           )}
                           
                           <div className="mt-2.5 pl-11 flex items-center justify-between">
                              <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-tight flex items-center gap-1.5 overflow-hidden">
                                 <div className="w-1 h-1 rounded-full bg-zinc-700" />
                                 <span className="truncate">By {store.getUser(mv.createdById)?.name || 'System'}</span>
                              </div>
                              {mv.referenceBagNumber && (
                                 <div className="text-[9px] bg-lux-gold/10 text-lux-gold px-1.5 py-0.5 rounded border border-lux-gold/20 font-bold">BAG #{mv.referenceBagNumber}</div>
                              )}
                           </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-2">
                       <History size={32} />
                       <span className="text-xs uppercase font-black tracking-widest">No Activity Matching Filter</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'add_stock' && (
        <Card className="max-w-3xl mx-auto p-4 md:p-10 border-white/10 shadow-glass liquid-glass-vibrant">
           <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10">
             <div className="flex items-center gap-4">
                <div className="bg-lux-gold text-lux-black p-3.5 rounded-[1.5rem] shadow-glow">
                  <PackagePlus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-lux-cream tracking-tight">Record Shipment</h2>
                  <p className="text-sm text-zinc-500 mt-1">Populate aggregate stock from supplier invoices.</p>
                </div>
             </div>
             
             {/* Entry Mode Toggle */}
             <div className="bg-black/40 p-1.5 rounded-2xl border border-white/5 flex text-[10px] uppercase font-black tracking-widest">
                <button 
                   onClick={() => setEntryMode('PCS')}
                   className={`px-5 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 ${entryMode === 'PCS' ? 'bg-lux-gold text-black shadow-lg shadow-lux-gold/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                >
                   <LayoutGrid size={12}/> Pieces
                </button>
                <button 
                   onClick={() => setEntryMode('WEIGHT')}
                   className={`px-5 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 ${entryMode === 'WEIGHT' ? 'bg-lux-gold text-black shadow-lg shadow-lux-gold/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                >
                   <Scale size={12}/> Weight
                </button>
             </div>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
              <Input label="Supplier (Optional)" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Stuller or Internal" />
              <Input label="Invoice # (Optional)" value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="e.g. INV-99283" />
           </div>

           <div className="mb-8">
             <div className="flex justify-between items-end mb-2">
               <label className="block text-xs font-medium text-zinc-500 ml-0.5">Line Items ({entryMode === 'WEIGHT' ? 'Weight Priority' : 'Piece Priority'})</label>
               <button onClick={() => setIsCreatingSpec(true)} className="text-[10px] font-bold text-lux-gold hover:text-white bg-lux-gold/10 px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors">
                  <Plus size={10} /> New Spec
               </button>
             </div>
             <FastEntryGrid
               specs={currentSpecs}
               onLinesChange={setShipmentLines}
               showCost={true}
               mode={entryMode}
             />
           </div>

           <div className="flex justify-end pt-6 border-t border-zinc-800">
             <Button onClick={handleSubmitShipment} size="lg" className="px-8">Add to Ledger</Button>
           </div>
        </Card>
      )}

      {activeTab === 'broken' && (
         <Card className="max-w-xl mx-auto p-8 border-lux-border shadow-float">
            <div className="flex items-center gap-3 mb-8">
               <div className="bg-red-500/10 text-red-500 p-2.5 rounded-2xl shadow-glow border border-red-500/20">
                  <AlertOctagon className="w-5 h-5" />
               </div>
               <div>
                  <h2 className="text-lg font-bold text-lux-cream">Log Broken Stones</h2>
                  <p className="text-xs text-zinc-500">Record breakage by weight (size optional).</p>
               </div>
            </div>

            <div className="space-y-6 mb-8">
               <Input 
                 type="number" 
                 step="0.001" 
                 label="Total Weight (Carats) *" 
                 value={brokenCt} 
                 onChange={e => setBrokenCt(e.target.value)} 
                 placeholder="0.000"
                 className="text-lg font-mono"
                 autoFocus
               />
               
               <div className="grid grid-cols-2 gap-4">
                  <Input 
                    type="number" 
                    label="Pieces (Optional)" 
                    value={brokenPcs} 
                    onChange={e => setBrokenPcs(e.target.value)} 
                    placeholder="Qty"
                  />
                  <div>
                     <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-tight">Spec (Optional)</label>
                     <select 
                       className="w-full bg-[#16171D] text-white rounded-2xl border border-white/5 p-3.5 text-sm focus:ring-lux-gold"
                       value={brokenSpec}
                       onChange={e => setBrokenSpec(e.target.value)}
                     >
                        <option value="">Mixed / Unknown</option>
                        {specs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                     </select>
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-tight">Project Link</label>
                  <select 
                    className="w-full bg-[#16171D] text-white rounded-2xl border border-white/5 p-3.5 text-sm focus:ring-lux-gold" 
                    value={brokenProject} 
                    onChange={e => setBrokenProject(e.target.value)}
                  >
                     <option value="">No Project</option>
                     {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.code} - {p.pieceName}</option>
                     ))}
                  </select>
               </div>
               
               <Input label="Reason / Note *" value={brokenNote} onChange={e => setBrokenNote(e.target.value)} placeholder="e.g. Chipped during setting" />
            </div>

            <div className="flex justify-end pt-6 border-t border-zinc-800">
               <Button onClick={handleSubmitBreakage} size="lg" className="px-8 bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20">Confirm Breakage</Button>
            </div>
         </Card>
      )}

      {/* Inventory Correction Modal (manager-only, fully audited) */}
      {editingStock && (() => {
        const cItem = summary.find(s => s.spec.id === editingStock);
        const cSpec = specs.find(s => s.id === editingStock);
        const prevPcs = cItem?.pcs ?? 0;
        const prevCt = cItem?.ct ?? 0;
        const avg = cSpec?.ctPerStone || 0;
        // Live preview of the resulting balance from the entered value.
        let nextPcs = prevPcs;
        let nextCt = prevCt;
        if (editMode === 'WEIGHT') {
          const ct = parseFloat(editCt);
          if (!isNaN(ct) && ct >= 0) { nextCt = ct; nextPcs = avg > 0 ? Math.round(ct / avg) : prevPcs; }
        } else {
          const q = parseInt(editPcs);
          if (!isNaN(q) && q >= 0) { nextPcs = q; nextCt = parseFloat((q * avg).toFixed(3)); }
        }
        const diffPcs = nextPcs - prevPcs;
        const diffCt = +(nextCt - prevCt).toFixed(3);
        return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 animate-in zoom-in-95 border-lux-border shadow-2xl">
             <h3 className="font-bold text-lg mb-1 text-lux-cream">Inventory Correction</h3>
             <p className="text-xs text-zinc-500 mb-5">{cSpec?.label || 'Spec'} · Melee · Manager: {currentUser?.name || '—'}</p>

             {!isManager ? (
               <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-sm text-red-300">
                 Only managers can create inventory corrections.
               </div>
             ) : (
             <div className="space-y-5">
                {/* Entry mode toggle */}
                <div className="bg-black/40 p-1.5 rounded-2xl border border-white/5 flex text-[10px] uppercase font-black tracking-widest">
                   <button onClick={() => setEditMode('PCS')} className={`flex-1 px-4 py-2 rounded-xl transition-all ${editMode === 'PCS' ? 'bg-lux-gold text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>By Pieces</button>
                   <button onClick={() => setEditMode('WEIGHT')} className={`flex-1 px-4 py-2 rounded-xl transition-all ${editMode === 'WEIGHT' ? 'bg-lux-gold text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>By Weight</button>
                </div>

                {/* Previous vs New */}
                <div className="grid grid-cols-2 gap-3">
                   <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                      <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Previous</span>
                      <span className="text-sm font-mono text-lux-cream block">{prevPcs.toLocaleString()} pcs</span>
                      <span className="text-xs font-mono text-zinc-400 block">{prevCt.toFixed(3)} ct</span>
                   </div>
                   <div className="p-3 rounded-2xl bg-lux-gold/5 border border-lux-gold/20">
                      <span className="block text-[9px] text-lux-gold/80 font-bold uppercase tracking-wider mb-1">New</span>
                      <span className="text-sm font-mono text-lux-cream block">{nextPcs.toLocaleString()} pcs</span>
                      <span className="text-xs font-mono text-zinc-400 block">{nextCt.toFixed(3)} ct</span>
                   </div>
                </div>

                {editMode === 'PCS' ? (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">New Piece Count</label>
                    <div className="relative">
                      <input type="number" min="0" value={editPcs} onChange={e => setEditPcs(e.target.value)}
                        className="w-full border border-lux-border bg-lux-input rounded-2xl p-4 font-mono text-2xl font-bold text-center text-lux-cream focus:ring-1 focus:ring-lux-gold outline-none" />
                      <span className="absolute right-4 top-5 text-sm text-zinc-600 font-medium">pcs</span>
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1.5">Carats auto-derived: {avg} ct/pc → {nextCt.toFixed(3)} ct</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">New Carat Weight</label>
                    <div className="relative">
                      <input type="number" min="0" step="0.001" value={editCt} onChange={e => setEditCt(e.target.value)}
                        className="w-full border border-lux-border bg-lux-input rounded-2xl p-4 font-mono text-2xl font-bold text-center text-emerald-400 focus:ring-1 focus:ring-lux-gold outline-none" />
                      <span className="absolute right-4 top-5 text-sm text-zinc-600 font-medium">ct</span>
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1.5">Pieces auto-derived: ≈ {nextPcs.toLocaleString()} pcs</p>
                  </div>
                )}

                {/* Calculated difference */}
                <div className={`text-center text-xs font-mono py-2 rounded-xl border ${diffPcs === 0 && diffCt === 0 ? 'text-zinc-500 border-white/5' : diffPcs < 0 || diffCt < 0 ? 'text-red-400 border-red-500/20 bg-red-500/5' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'}`}>
                   Difference: {diffPcs >= 0 ? '+' : ''}{diffPcs} pcs · {diffCt >= 0 ? '+' : ''}{diffCt.toFixed(3)} ct
                </div>

                <Input label="Correction Reason (required)" value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="e.g. Physical recount, data entry fix" />

                <div className="flex justify-end items-center pt-4 border-t border-white/5">
                   <div className="flex gap-3">
                      <Button variant="secondary" onClick={() => setEditingStock(null)}>Cancel</Button>
                      <Button onClick={handleStockEdit} disabled={correctionSubmitting || !editReason.trim() || (diffPcs === 0 && diffCt === 0)}>
                        {correctionSubmitting ? 'Saving…' : 'Record Correction'}
                      </Button>
                   </div>
                </div>
             </div>
             )}
          </Card>
        </div>
        );
      })()}

      {/* Inventory Reconciliation Audit Modal (manager-only) */}
      {showAudit && auditResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl p-6 animate-in zoom-in-95 border-lux-border shadow-2xl max-h-[85vh] flex flex-col">
             <div className="flex items-center justify-between mb-4">
                <div>
                   <h3 className="font-bold text-lg text-lux-cream">Inventory Reconciliation</h3>
                   <p className="text-xs text-zinc-500 mt-0.5">Manager-only dry run. Historical sources are read on the protected backend; this screen never changes stock automatically.</p>
                </div>
                <button onClick={() => { setShowAudit(false); setResolvingIssueIdx(null); }} className="text-zinc-500 hover:text-white text-sm font-bold">✕</button>
             </div>

             <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                   <div className="text-xl font-bold font-mono text-lux-cream">{auditResult.scannedSpecs}</div>
                   <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Scanned</div>
                </div>
                <div className="p-3 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-center">
                   <div className="text-xl font-bold font-mono text-blue-300">0</div>
                   <div className="text-[9px] uppercase tracking-wider text-blue-300/80 font-bold">Auto changes</div>
                </div>
                <div className="p-3 rounded-2xl bg-orange-500/5 border border-orange-500/20 text-center">
                   <div className="text-xl font-bold font-mono text-orange-400">{auditResult.needsManagerReview.length}</div>
                   <div className="text-[9px] uppercase tracking-wider text-orange-400/80 font-bold">Need review</div>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 mb-4">
                {auditResult.issues.length === 0 ? (
                  <div className="py-10 text-center text-emerald-400 text-sm font-bold">✓ This audit page has no discrepancies. No stock was changed.</div>
                ) : auditResult.issues.map((iss: any, idx: number) => {
                  return (
                    <div key={`${iss.specId}-${idx}`} className="p-3 rounded-xl border text-xs bg-orange-500/[0.03] border-orange-500/15">
                       <div className="flex justify-between items-center">
                          <span className="font-bold text-lux-cream">{iss.specLabel} <span className="text-zinc-600 font-normal">· {iss.location}</span></span>
                          <div className="flex items-center gap-2">
                             <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-orange-500/15 text-orange-400">Review</span>
                             {isManager && iss.correctionAllowed && (
                                <button 
                                   onClick={() => {
                                      if (resolvingIssueIdx === idx) {
                                         setResolvingIssueIdx(null);
                                      } else {
                                         setResolvingIssueIdx(idx);
                                         setResolveReason('');
                                      }
                                   }}
                                   className="text-lux-gold hover:underline font-bold text-[10px] uppercase tracking-wider transition-all"
                                >
                                   {resolvingIssueIdx === idx ? 'Close' : 'Resolve'}
                                </button>
                             )}
                          </div>
                       </div>
                       <div className="text-zinc-500 mt-1 font-mono">{iss.detail}</div>
                       <div className="text-zinc-600 mt-0.5 font-mono">Current {iss.currentPcs}pc / {iss.currentCt.toFixed(6)}ct · transaction evidence {iss.expectedPcs}pc / {iss.expectedCt.toFixed(6)}ct</div>
                       {iss.sourceEvidence?.length > 0 && <div className="text-zinc-600 mt-1 font-mono break-all">Evidence: {iss.sourceEvidence.join(', ')}</div>}
                       {!iss.correctionAllowed && <div className="text-amber-300/80 mt-1">Evidence-only finding. It cannot be corrected from this audit.</div>}
                       
                       {resolvingIssueIdx === idx && (
                          <div className="mt-3 p-3 bg-black/40 rounded-xl border border-white/5 space-y-3 animate-in slide-in-from-top-2 duration-200">
                             <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                                <span>Single Correction Review</span>
                                <span className="text-amber-300">Expected values are locked to this audit.</span>
                             </div>

                             <div className="grid grid-cols-2 gap-2">
                                <div>
                                   <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Reconciled Pieces</label>
                                   <input 
                                      type="number" 
                                      min="0" 
                                      value={iss.expectedPcs}
                                      disabled
                                      className="w-full border border-lux-border bg-lux-input rounded-lg p-2 font-mono text-xs text-lux-cream focus:ring-1 focus:ring-lux-gold outline-none" 
                                   />
                                </div>
                                <div>
                                   <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Reconciled Carats</label>
                                   <input 
                                      type="number" 
                                      min="0" 
                                      step="0.001" 
                                      value={iss.expectedCt}
                                      disabled
                                      className="w-full border border-lux-border bg-lux-input rounded-lg p-2 font-mono text-xs text-lux-cream focus:ring-1 focus:ring-lux-gold outline-none" 
                                   />
                                </div>
                             </div>

                             <div>
                                <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Reason (Required)</label>
                                <textarea 
                                   rows={2}
                                   value={resolveReason}
                                   onChange={e => setResolveReason(e.target.value)}
                                   placeholder="Explain the discrepancy resolution context..."
                                   className="w-full border border-lux-border bg-lux-input rounded-lg p-2 text-xs text-lux-cream focus:ring-1 focus:ring-lux-gold outline-none resize-none"
                                />
                             </div>

                             <div className="flex justify-end gap-2">
                                <button 
                                   onClick={() => setResolvingIssueIdx(null)}
                                   className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                                >
                                   Cancel
                                </button>
                                <button 
                                   onClick={() => applyInlineCorrection(iss)}
                                   disabled={correctionSubmitting || !resolveReason.trim()}
                                   className="px-3 py-1 bg-lux-gold hover:bg-lux-gold/80 disabled:opacity-50 text-black rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                                >
                                   {correctionSubmitting ? 'Applying...' : 'Apply Correction'}
                                </button>
                             </div>
                          </div>
                       )}
                    </div>
                  );
                })}
             </div>

             {auditResult.nextCursor && (
               <div className="flex justify-center pb-3">
                 <Button variant="secondary" onClick={loadMoreAudit} disabled={auditBusy}>
                   {auditBusy ? 'Loading…' : 'Load next audit page'}
                 </Button>
               </div>
             )}

             <div className="flex justify-end pt-4 border-t border-white/5">
                <div className="flex gap-3">
                   <Button variant="secondary" onClick={() => { setShowAudit(false); setResolvingIssueIdx(null); }}>Close</Button>
                </div>
             </div>
          </Card>
        </div>
      )}

      {/* Edit Certified Diamond Modal */}
      {editingDiamond && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-6 animate-in zoom-in-95 border-lux-border shadow-2xl">
             <h3 className="font-bold text-lg mb-4 text-lux-cream">Update Diamond Status</h3>
             <div className="space-y-4">
                <div>
                   <label className="block text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-wider">Mount / Loose</label>
                   <select 
                     value={editMountLoose} 
                     onChange={e => setEditMountLoose(e.target.value)} 
                     className="w-full bg-[#16171D] text-white rounded-xl border border-white/5 p-3 text-sm focus:ring-lux-gold"
                   >
                     <option value="LOOSE">LOOSE</option>
                     <option value="MOUNTED">MOUNTED</option>
                     <option value="">N/A</option>
                   </select>
                </div>

                <Input 
                   label="Mounted Item Code" 
                   value={editCode} 
                   onChange={e => setEditCode(e.target.value)} 
                   placeholder="e.g. RIN-ENG-0237"
                />

                <Input 
                   label="Place / Drawer / Cabinet" 
                   value={editPlace} 
                   onChange={e => setEditPlace(e.target.value)} 
                   placeholder="e.g. SHOWROOM, SAFE"
                />

                <div>
                   <label className="block text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-wider">Sales Status</label>
                   <select 
                     value={editSold} 
                     onChange={e => setEditSold(e.target.value)} 
                     className="w-full bg-[#16171D] text-white rounded-xl border border-white/5 p-3 text-sm focus:ring-lux-gold"
                   >
                     <option value="">AVAILABLE</option>
                     <option value="SOLD">SOLD</option>
                   </select>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-white/5">
                   <Button 
                     variant="danger" 
                     onClick={async () => {
                       if (editingDiamond && confirm(`Are you sure you want to delete this diamond (${editingDiamond.shape} ${editingDiamond.size}ct)?`)) {
                         const id = editingDiamond.id;
                         setEditingDiamond(null);
                         await store.deleteDiamond(id);
                         showToast("Diamond deleted successfully");
                       }
                     }}
                   >
                     Delete
                   </Button>
                   <div className="flex gap-3">
                      <Button variant="secondary" onClick={() => setEditingDiamond(null)}>Cancel</Button>
                      <Button onClick={handleDiamondEdit}>Confirm</Button>
                   </div>
                </div>
             </div>
          </Card>
        </div>
      )}

      {/* CREATE SPEC MODAL */}
      {isCreatingSpec && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 animate-in zoom-in-95">
              <h3 className="font-bold text-white text-lg mb-4">Add New Diamond Spec</h3>
              <div className="space-y-4">
                 <Input 
                    label="Size (mm)" 
                    type="number" 
                    step="0.01" 
                    value={newSpecData.size} 
                    onChange={e => setNewSpecData({...newSpecData, size: e.target.value})} 
                    placeholder="1.3"
                    autoFocus
                 />
                 
                 <Input 
                    label="Avg Weight (ct/stone)" 
                    type="number" 
                    step="0.001" 
                    value={newSpecData.weight} 
                    onChange={e => setNewSpecData({...newSpecData, weight: e.target.value})} 
                    placeholder="0.010"
                 />

                 <Input 
                    label="Cost (USD/ct) - Optional" 
                    type="number" 
                    value={newSpecData.cost} 
                    onChange={e => setNewSpecData({...newSpecData, cost: e.target.value})} 
                    placeholder="Auto-calculated if empty"
                 />
                 
                 {newSpecData.size && (
                     <div className="text-center p-3 bg-zinc-900 rounded-2xl text-sm border border-zinc-800">
                        <span className="text-zinc-500">Preview:</span> <span className="font-bold text-white">{newSpecData.size}mm</span>
                     </div>
                 )}

                 <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={() => setIsCreatingSpec(false)}>Cancel</Button>
                    <Button onClick={handleCreateSpec} disabled={!newSpecData.size || !newSpecData.weight}>Create</Button>
                 </div>
              </div>
           </Card>
        </div>
      )}

      {/* CREATE CERTIFIED DIAMOND MODAL */}
      {isCreatingDiamond && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto font-sans">
           <Card className="w-full max-w-md p-6 animate-in zoom-in-95 my-8">
              <h3 className="font-bold text-white text-lg mb-4">Add Certified Center Diamond ({selectedLocation})</h3>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 no-scrollbar">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-wider">Shape</label>
                       <select 
                         value={newDiamondData.shape} 
                         onChange={e => setNewDiamondData({...newDiamondData, shape: e.target.value})} 
                         className="w-full bg-[#16171D] text-white rounded-xl border border-white/5 p-3 text-xs focus:ring-lux-gold"
                       >
                         {['ROUND', 'PRINCESS', 'EMERALD', 'OVAL', 'CUSHION', 'MARQUISE', 'PEAR', 'RADIANT', 'HEART', 'ASSCHER'].map(s => (
                           <option key={s} value={s}>{s}</option>
                         ))}
                       </select>
                    </div>
                    
                    <Input 
                       label="Size (Carats)" 
                       type="number" 
                       step="0.01" 
                       value={newDiamondData.size} 
                       onChange={e => setNewDiamondData({...newDiamondData, size: e.target.value})} 
                       placeholder="e.g. 1.05"
                    />
                 </div>

                 <div className="grid grid-cols-3 gap-4">
                    <Input 
                       label="Color" 
                       value={newDiamondData.color} 
                       onChange={e => setNewDiamondData({...newDiamondData, color: e.target.value})} 
                       placeholder="e.g. F"
                    />
                    <Input 
                       label="Clarity" 
                       value={newDiamondData.clarity} 
                       onChange={e => setNewDiamondData({...newDiamondData, clarity: e.target.value})} 
                       placeholder="e.g. VS1"
                    />
                    <Input 
                       label="Cut" 
                       value={newDiamondData.cut} 
                       onChange={e => setNewDiamondData({...newDiamondData, cut: e.target.value})} 
                       placeholder="e.g. EX"
                    />
                 </div>

                 <Input 
                    label="Cert # / Report #" 
                    value={newDiamondData.certNumber} 
                    onChange={e => setNewDiamondData({...newDiamondData, certNumber: e.target.value})} 
                    placeholder="e.g. GIA#12345678"
                 />

                 <Input 
                    label="Measurements" 
                    value={newDiamondData.measurements} 
                    onChange={e => setNewDiamondData({...newDiamondData, measurements: e.target.value})} 
                    placeholder="e.g. 6.5*6.5*4.0MM"
                 />

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-wider">Mount / Loose</label>
                       <select 
                         value={newDiamondData.mountLoose} 
                         onChange={e => setNewDiamondData({...newDiamondData, mountLoose: e.target.value})} 
                         className="w-full bg-[#16171D] text-white rounded-xl border border-white/5 p-3 text-xs focus:ring-lux-gold"
                       >
                         <option value="LOOSE">LOOSE</option>
                         <option value="MOUNTED">MOUNTED</option>
                       </select>
                    </div>

                    <Input 
                       label="Cabinet / Place" 
                       value={newDiamondData.place} 
                       onChange={e => setNewDiamondData({...newDiamondData, place: e.target.value})} 
                       placeholder="e.g. SAFE A"
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <Input 
                       label="Item Code" 
                       value={newDiamondData.code} 
                       onChange={e => setNewDiamondData({...newDiamondData, code: e.target.value})} 
                       placeholder="e.g. RIN-ENG-0237"
                    />

                    <div>
                       <label className="block text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-wider">Status</label>
                       <select 
                         value={newDiamondData.sold} 
                         onChange={e => setNewDiamondData({...newDiamondData, sold: e.target.value})} 
                         className="w-full bg-[#16171D] text-white rounded-xl border border-white/5 p-3 text-xs focus:ring-lux-gold"
                       >
                         <option value="">AVAILABLE</option>
                         <option value="SOLD">SOLD</option>
                       </select>
                    </div>
                 </div>

                 <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                    <Button variant="secondary" onClick={() => setIsCreatingDiamond(false)}>Cancel</Button>
                    <Button onClick={handleCreateDiamond} disabled={!newDiamondData.size || !newDiamondData.shape}>Add Diamond</Button>
                 </div>
              </div>
           </Card>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;
