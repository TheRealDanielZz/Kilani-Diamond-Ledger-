
import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { InventoryMovementType, DiamondSpec, InventoryMovement, Project } from '../types';
import { Card, Button, StatusPill, Input } from '../components/UI';
import { FastEntryGrid } from '../components/FastEntryGrid';
import { PackagePlus, History, ArrowDownLeft, ArrowUpRight, Edit2, Filter, Search, AlertOctagon, Scale, LayoutGrid, Settings, Plus } from 'lucide-react';
import { useToast } from '../App';
import { useNavigate } from 'react-router-dom';

const InventoryPage: React.FC = () => {
  const showToast = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'stock' | 'add_stock' | 'broken'>('stock');
  
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [specs, setSpecs] = useState<DiamondSpec[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

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
  
  // Stock Edit Modal
  const [editingStock, setEditingStock] = useState<string | null>(null); 
  const [editPcs, setEditPcs] = useState<string>('');
  const [editReason, setEditReason] = useState('');

  // Quick Add Spec Modal
  const [isCreatingSpec, setIsCreatingSpec] = useState(false);
  const [newSpecData, setNewSpecData] = useState({ size: '', shape: 'Round', weight: '', cost: '' });

  useEffect(() => {
    const sync = () => {
        refreshData();
        setSpecs(store.getSpecs());
        setProjects(store.getProjects());
    };
    sync();
    return store.subscribe(sync);
  }, []);

  const refreshData = () => {
    setMovements([...store.getInventoryMovements()]);
    setSummary(store.getInventorySummary());
  };

  const getCurrentUserId = () => store.getCurrentUser()?.id || 'unknown';

  const handleSubmitShipment = () => {
    const validLines = shipmentLines.filter(l => l.ct > 0); 
    if (validLines.length === 0) return;
    
    const isQuickAdd = !supplier && !invoice;

    store.createInventoryMovement({
      type: InventoryMovementType.SHIPMENT_IN,
      createdById: getCurrentUserId(),
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
      }))
    });

    showToast("Stock Added Successfully");
    setShipmentLines([]);
    setSupplier('');
    setInvoice('');
    // refreshData(); // Handled by subscription
    setActiveTab('stock');
  };

  const handleSubmitBreakage = () => {
     const ctVal = parseFloat(brokenCt);
     const pcsVal = parseInt(brokenPcs) || 0;

     if (!brokenCt || isNaN(ctVal) || ctVal <= 0) return alert("Valid carat weight required.");
     if (!brokenNote) return alert("Reason is required.");

     store.createInventoryMovement({
        type: InventoryMovementType.BROKEN_OUT,
        createdById: getCurrentUserId(),
        referenceProjectId: brokenProject || undefined,
        notes: brokenNote,
        lines: [{
           specId: brokenSpec || undefined,
           pcs: pcsVal > 0 ? pcsVal : undefined,
           ct: ctVal
        }]
     });

     showToast("Breakage Recorded");
     setBrokenCt('');
     setBrokenPcs('');
     setBrokenSpec('');
     setBrokenProject('');
     setBrokenNote('');
     // refreshData(); // Handled by subscription
     setActiveTab('stock');
  };

  const handleStockEdit = () => {
    if (editingStock) {
       const qty = parseInt(editPcs);
       if (isNaN(qty)) {
          showToast("Please enter a valid quantity");
          return;
       }

       store.editStock(editingStock, qty, getCurrentUserId(), editReason);
       showToast("Stock Adjusted Successfully");
       setEditingStock(null);
       // refreshData(); // Handled by subscription
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
      // setSpecs([...store.getSpecs()]); // Handled by subscription
      setIsCreatingSpec(false);
      setNewSpecData({ size: '', shape: 'Round', weight: '', cost: '' });
      showToast(`Created: ${label}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-24">
      <div className="flex justify-between items-center mb-8">
        <div data-tour="inventory-header">
          <h1 className="text-2xl font-bold text-lux-cream tracking-tight">Inventory</h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time stock ledger.</p>
        </div>
        <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg border border-lux-border">
           <button onClick={() => setActiveTab('stock')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'stock' ? 'bg-lux-surface text-lux-cream shadow-sm ring-1 ring-lux-border' : 'text-zinc-500 hover:text-zinc-300'}`}>Current Stock</button>
           <button onClick={() => setActiveTab('add_stock')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'add_stock' ? 'bg-lux-surface text-lux-cream shadow-sm ring-1 ring-lux-border' : 'text-zinc-500 hover:text-zinc-300'}`}>Add Stock</button>
           <button onClick={() => setActiveTab('broken')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'broken' ? 'bg-lux-surface text-lux-cream shadow-sm ring-1 ring-lux-border' : 'text-zinc-500 hover:text-zinc-300'}`}>Log Breakage</button>
        </div>
      </div>

      {activeTab === 'stock' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="col-span-2 overflow-hidden border-lux-border shadow-subtle flex flex-col h-[600px]">
             <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30">
               <div className="relative">
                 <Search className="absolute left-2.5 top-1.5 w-4 h-4 text-zinc-500" />
                 <input type="text" placeholder="Filter specs..." className="pl-9 text-xs bg-black/50 border border-zinc-700 text-lux-cream rounded-lg py-1.5 w-48 focus:border-lux-gold focus:ring-1 focus:ring-lux-gold" />
               </div>
               <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Filter size={12} />
                  <span>{summary.length} items</span>
               </div>
             </div>
             
             <div className="flex-1 overflow-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-zinc-900/50 text-zinc-500 sticky top-0 z-10 text-[11px] uppercase tracking-wider font-semibold backdrop-blur-sm border-b border-zinc-800">
                   <tr>
                     <th className="px-5 py-3 border-b border-zinc-800">Diamond Spec</th>
                     <th className="px-5 py-3 border-b border-zinc-800 text-right">Stock (Pcs)</th>
                     <th className="px-5 py-3 border-b border-zinc-800 text-right">Weight (Ct)</th>
                     <th className="px-5 py-3 border-b border-zinc-800 text-right w-16"></th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800/50">
                   {summary.map((item, i) => (
                     <tr key={i} className="hover:bg-zinc-900/50 group transition-colors">
                       <td className="px-5 py-3">
                         <div className="font-medium text-lux-cream text-sm">{item.spec.label}</div>
                         <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{item.spec.shape}</div>
                       </td>
                       <td className="px-5 py-3 text-right font-mono text-zinc-300 tabular-nums font-medium">
                          {item.pcs > 0 ? item.pcs : <span className="text-zinc-600 text-xs">unknown</span>}
                       </td>
                       <td className="px-5 py-3 text-right font-mono text-zinc-500 tabular-nums">{item.ct.toFixed(3)}</td>
                       <td className="px-5 py-3 text-right">
                         <button 
                           onClick={() => { setEditingStock(item.spec.id); setEditPcs(item.pcs.toString()); setEditReason(''); }}
                           className="text-zinc-600 hover:text-lux-gold p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all"
                         >
                           <Edit2 size={14} />
                         </button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </Card>
          
          <div className="flex flex-col h-[600px]">
             <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 px-1">Recent Movements</h3>
             <div className="flex-1 overflow-y-auto pr-1 space-y-3">
               {movements.slice(0, 20).map(mv => (
                 <div key={mv.id} className="bg-lux-surface p-3 rounded-lg border border-lux-border hover:border-zinc-700 transition-colors">
                    <div className="flex justify-between items-start mb-1.5">
                       <div className="flex items-center gap-2">
                         <div className={`p-1 rounded-md ${mv.type.includes('IN') ? 'bg-emerald-950/30 text-emerald-400' : mv.type === 'BROKEN_OUT' ? 'bg-red-950/30 text-red-400' : 'bg-blue-950/30 text-blue-400'}`}>
                           {mv.type.includes('IN') ? <ArrowDownLeft size={12} /> : mv.type === 'BROKEN_OUT' ? <AlertOctagon size={12} /> : <ArrowUpRight size={12} />}
                         </div>
                         <span className="font-bold text-xs text-zinc-300 uppercase tracking-wide">{mv.type.replace(/_/g, ' ')}</span>
                       </div>
                       <span className="text-[10px] text-zinc-600 tabular-nums">{new Date(mv.createdAt).toLocaleDateString()}</span>
                    </div>
                    {mv.notes && <p className="text-xs text-zinc-500 mb-2 line-clamp-1">{mv.notes}</p>}
                    <div className="text-[10px] text-zinc-600 font-mono bg-zinc-900/50 px-2 py-1 rounded inline-block">
                      {mv.lines.reduce((a,b)=>a+(b.ct||0),0).toFixed(3)} ct
                    </div>
                 </div>
               ))}
             </div>
          </div>
        </div>
      )}

      {activeTab === 'add_stock' && (
        <Card className="max-w-3xl mx-auto p-8 border-lux-border shadow-float">
           <div className="flex items-center justify-between mb-8">
             <div className="flex items-center gap-3">
                <div className="bg-lux-gold text-lux-black p-2.5 rounded-xl shadow-glow">
                <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                <h2 className="text-lg font-bold text-lux-cream">Add Inventory</h2>
                <p className="text-xs text-zinc-500">Record new stones or shipments.</p>
                </div>
             </div>
             
             {/* Entry Mode Toggle */}
             <div className="bg-zinc-900 p-1 rounded-lg border border-zinc-700 flex text-xs">
                <button 
                   onClick={() => setEntryMode('PCS')}
                   className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-2 ${entryMode === 'PCS' ? 'bg-lux-gold text-black font-bold' : 'text-zinc-500'}`}
                >
                   <LayoutGrid size={12}/> By Pieces
                </button>
                <button 
                   onClick={() => setEntryMode('WEIGHT')}
                   className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-2 ${entryMode === 'WEIGHT' ? 'bg-lux-gold text-black font-bold' : 'text-zinc-500'}`}
                >
                   <Scale size={12}/> By Weight
                </button>
             </div>
           </div>

           <div className="grid grid-cols-2 gap-5 mb-8">
              <Input label="Supplier (Optional)" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Stuller or Internal" />
              <Input label="Invoice # (Optional)" value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="e.g. INV-99283" />
           </div>

           <div className="mb-8">
             <div className="flex justify-between items-end mb-2">
               <label className="block text-xs font-medium text-zinc-500 ml-0.5">Line Items ({entryMode === 'WEIGHT' ? 'Weight Priority' : 'Piece Priority'})</label>
               <button onClick={() => setIsCreatingSpec(true)} className="text-[10px] font-bold text-lux-gold hover:text-white bg-lux-gold/10 px-2 py-1 rounded flex items-center gap-1 transition-colors">
                  <Plus size={10} /> New Spec
               </button>
             </div>
             <FastEntryGrid 
               specs={specs} 
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
               <div className="bg-red-500/10 text-red-500 p-2.5 rounded-xl shadow-glow border border-red-500/20">
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
                     <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Spec (Optional)</label>
                     <select 
                       className="w-full bg-[#23262F] text-white rounded-2xl border-transparent p-3.5 text-sm focus:ring-lux-gold"
                       value={brokenSpec}
                       onChange={e => setBrokenSpec(e.target.value)}
                     >
                        <option value="">Mixed / Unknown</option>
                        {specs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                     </select>
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Project Link</label>
                  <select 
                    className="w-full bg-[#23262F] text-white rounded-2xl border-transparent p-3.5 text-sm focus:ring-lux-gold" 
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

      {/* Edit Stock Modal */}
      {editingStock && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-6 animate-in zoom-in-95 border-lux-border bg-lux-surface shadow-2xl">
             <h3 className="font-bold text-lg mb-6 text-lux-cream">Adjust Stock</h3>
             <div className="space-y-6">
                <div>
                   <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">New Total Count</label>
                   <div className="relative">
                     <input 
                       type="number" 
                       value={editPcs} 
                       onChange={e => setEditPcs(e.target.value)} 
                       className="w-full border border-lux-border bg-lux-input rounded-xl p-3 font-mono text-2xl font-bold text-center text-lux-cream focus:ring-1 focus:ring-lux-gold focus:border-lux-gold outline-none" 
                     />
                     <span className="absolute right-4 top-4 text-sm text-zinc-600 font-medium">pcs</span>
                   </div>
                </div>
                <Input label="Reason for Adjustment" value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Required (e.g. Broken, Found)" />
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setEditingStock(null)}>Cancel</Button>
                  <Button onClick={handleStockEdit}>Confirm</Button>
                </div>
             </div>
          </Card>
        </div>
      )}

      {/* CREATE SPEC MODAL */}
      {isCreatingSpec && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 animate-in zoom-in-95 bg-[#1F2128]">
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
                     <div className="text-center p-3 bg-zinc-900 rounded-xl text-sm border border-zinc-800">
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
    </div>
  );
};

export default InventoryPage;
