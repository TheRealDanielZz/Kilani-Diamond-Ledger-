
import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { Card, Button, Input, Modal } from '../components/UI';
import { useToast } from '../App';
import { Settings, RefreshCw, Plus, Trash2, Key, Gem, MapPin } from 'lucide-react';
import { DiamondPriceBand, DiamondSpec } from '../types';
import { inventoryApi, Phase1BootstrapAudit } from '../services/inventoryApi';

const SettingsPage: React.FC = () => {
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState<'general' | 'bands' | 'specs'>('general');
  const [settings, setSettings] = useState(store.getSettings());
  const [specs, setSpecs] = useState(store.getSpecs());
  const [bands, setBands] = useState<DiamondPriceBand[]>(store.getBands());
  const [phase1Audit, setPhase1Audit] = useState<Phase1BootstrapAudit | null>(null);
  const [phase1Busy, setPhase1Busy] = useState(false);
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Single Size Form
  const [newSize, setNewSize] = useState<{ label: string, sizeMm: number, ctPerStone: number, defaultCostPerCtUsd: number }>({
    label: '', sizeMm: 0, ctPerStone: 0, defaultCostPerCtUsd: 0
  });

  // Band Form
  const [newBand, setNewBand] = useState<Partial<DiamondPriceBand>>({
    minMm: 0.8, maxMm: 1.2, stepMm: 0.1, pricePerCtUsd: 0
  });

  // Custom Location Form
  const [newLocationName, setNewLocationName] = useState('');

  const locations = settings.inventoryLocations && settings.inventoryLocations.length > 0
    ? settings.inventoryLocations
    : ['Toronto', 'Miami'];

  const handleAddLocation = () => {
    const name = newLocationName.trim();
    if (!name) return;
    if (name.toLowerCase() === 'melee') {
      showToast("Cannot name a location 'Melee'");
      return;
    }
    const currentList = settings.inventoryLocations && settings.inventoryLocations.length > 0
      ? settings.inventoryLocations
      : ['Toronto', 'Miami'];
    if (currentList.map(l => l.toLowerCase()).includes(name.toLowerCase())) {
      showToast("Location already exists");
      return;
    }
    const newList = [...currentList, name];
    setSettings({
      ...settings,
      inventoryLocations: newList
    });
    setNewLocationName('');
    showToast(`Added location: ${name} (Remember to Save All Settings)`);
  };

  const handleRemoveLocation = (loc: string) => {
    const currentList = settings.inventoryLocations && settings.inventoryLocations.length > 0
      ? settings.inventoryLocations
      : ['Toronto', 'Miami'];
    const newList = currentList.filter(l => l.toLowerCase() !== loc.toLowerCase());
    setSettings({
      ...settings,
      inventoryLocations: newList
    });
    showToast(`Removed location: ${loc} (Remember to Save All Settings)`);
  };

  useEffect(() => {
      const sync = () => {
          setSettings(store.getSettings());
          setSpecs(store.getSpecs());
          setBands(store.getBands());
      };
      sync();
      return store.subscribe(sync);
  }, []);

  const handleSaveGeneralSettings = async () => {
    await store.updateSettings(settings);
    await store.addSystemLog('UPDATE_SETTINGS', 'Updated general system settings (Costing Parameters, Gold Purity Mapping).');
    showToast('General Settings Updated');
  };

  const handleSaveCatalogOverrides = async () => {
    const oldSpecs = store.getSpecs();
    const changedSpecs = specs.filter(s => {
      const old = oldSpecs.find(o => o.id === s.id);
      return !old || old.defaultCostPerCtUsd !== s.defaultCostPerCtUsd || old.label !== s.label || old.ctPerStone !== s.ctPerStone;
    });

    await store.updateSpecs(specs);
    
    if (changedSpecs.length > 0) {
      const details = changedSpecs.map(s => `${s.label} ($${s.defaultCostPerCtUsd}/ct)`).join(', ');
      await store.addSystemLog('UPDATE_DIAMOND_CATALOG', `Updated diamond catalog specs: ${details}`);
    } else {
      await store.addSystemLog('UPDATE_DIAMOND_CATALOG', `Saved diamond catalog (no changes detected).`);
    }
    showToast('Catalog Overrides Saved');
  };

  const handleAddBand = async () => {
    if (newBand.minMm === undefined || newBand.maxMm === undefined || !newBand.pricePerCtUsd) return;
    
    const band: DiamondPriceBand = {
      id: 'band-' + Math.random().toString(36).substr(2, 9),
      name: `Band ${newBand.minMm}-${newBand.maxMm}mm`,
      minMm: newBand.minMm,
      maxMm: newBand.maxMm,
      stepMm: 0.1,
      pricePerCtUsd: newBand.pricePerCtUsd,
      active: true,
      ...newBand
    } as DiamondPriceBand;

    const newBands = [...bands, band].sort((a,b) => a.minMm - b.minMm);
    setBands(newBands);
    await store.updateBands(newBands);
    await store.addSystemLog('ADD_PRICING_BAND', `Added new pricing band: ${band.name} at $${band.pricePerCtUsd}/ct`);
    setNewBand({ minMm: band.maxMm + 0.1, maxMm: band.maxMm + 0.5, stepMm: 0.1, pricePerCtUsd: 0 });
  };

  const handleDeleteBand = async (id: string) => {
    const bandToDelete = bands.find(b => b.id === id);
    setBands(bands.filter(b => b.id !== id));
    await store.deleteBand(id);
    if (bandToDelete) {
      await store.addSystemLog('DELETE_PRICING_BAND', `Deleted pricing band: ${bandToDelete.name}`);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedSpecs = React.useMemo(() => {
    let sortableSpecs = [...specs];
    if (sortConfig !== null) {
      sortableSpecs.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof DiamondSpec];
        let bValue: any = b[sortConfig.key as keyof DiamondSpec];
        
        if (aValue === undefined || bValue === undefined) return 0;

        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    } else {
      // Default sort by size
      sortableSpecs.sort((a, b) => a.sizeMm - b.sizeMm);
    }
    return sortableSpecs;
  }, [specs, sortConfig]);

  const handleAddSingleSize = async () => {
    if (!newSize.label || !newSize.sizeMm || !newSize.ctPerStone || !newSize.defaultCostPerCtUsd) return;
    
    const spec: DiamondSpec = {
      id: 'spec-' + Math.random().toString(36).substr(2, 9),
      label: newSize.label,
      sizeMm: newSize.sizeMm,
      ctPerStone: newSize.ctPerStone,
      defaultCostPerCtUsd: newSize.defaultCostPerCtUsd,
      isOverride: true
    };

    await store.addSpec(spec);
    await store.addSystemLog('ADD_DIAMOND_SPEC', `Added single diamond size: ${spec.label} (${spec.sizeMm}mm) at $${spec.defaultCostPerCtUsd}/ct`);
    setNewSize({ label: '', sizeMm: 0, ctPerStone: 0, defaultCostPerCtUsd: 0 });
    showToast('Single size added');
  };

  const handleGenerateSpecs = async () => {
    await store.updateBands(bands); // Save bands first
    const result = await store.generateSpecsFromBands();
    await store.addSystemLog('GENERATE_CATALOG', `Generated diamond catalog from pricing bands. Created: ${result.created}, Updated: ${result.updated}.`);
    showToast(`Catalog Updated: ${result.created} new, ${result.updated} updated.`);
  };

  const updateSpecOverride = (id: string, val: number) => {
    const newSpecs = specs.map(s => s.id === id ? { ...s, defaultCostPerCtUsd: val, isOverride: true } : s);
    setSpecs(newSpecs);
  };

  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearVerification, setClearVerification] = useState('');

  const [isDeleteSizeModalOpen, setIsDeleteSizeModalOpen] = useState(false);
  const [sizeToDelete, setSizeToDelete] = useState<DiamondSpec | null>(null);

  const [isClearBandsModalOpen, setIsClearBandsModalOpen] = useState(false);
  const [clearBandsVerification, setClearBandsVerification] = useState('');

  const handleClearAllSpecs = async () => {
    const keptSpecs = specs.filter(s => s.id === 'MIXED-UNSORTED');
    setSpecs(keptSpecs);
    await store.clearSpecs(['MIXED-UNSORTED']);
    await store.addSystemLog('CLEAR_CATALOG', 'Cleared the entire diamond catalog (preserved Mixed/Unsorted).');
    setIsClearModalOpen(false);
    setClearVerification('');
    showToast('Diamond catalog cleared (Mixed/Unsorted preserved).');
  };

  const handleDeleteSize = async () => {
    if (!sizeToDelete) return;
    await store.deleteSpec(sizeToDelete.id);
    setSpecs(specs.filter(s => s.id !== sizeToDelete.id));
    setIsDeleteSizeModalOpen(false);
    setSizeToDelete(null);
    showToast(`Deleted ${sizeToDelete.label}`);
  };

  const handleClearAllBands = async () => {
    setBands([]);
    await store.clearBands();
    await store.addSystemLog('CLEAR_BANDS', 'Cleared all pricing bands.');
    setIsClearBandsModalOpen(false);
    setClearBandsVerification('');
    showToast('All pricing bands cleared.');
  };

  const runPhase1Audit = async () => {
    setPhase1Busy(true);
    try {
      const audit = await inventoryApi.getBootstrapAudit();
      setPhase1Audit(audit);
      showToast(audit.ready ? 'Phase 1 inventory audit is ready.' : 'Phase 1 audit found deployment blockers.');
    } catch (error) {
      console.error('Phase 1 bootstrap audit failed:', error);
      showToast('Could not run the Phase 1 audit.');
    } finally {
      setPhase1Busy(false);
    }
  };

  const hardenLegacyEvidence = async () => {
    if (!window.confirm('Rotate legacy evidence download tokens now? Existing files and records will be preserved.')) return;
    setPhase1Busy(true);
    try {
      const result = await inventoryApi.hardenLegacyEvidence(true);
      if (result.failed.length > 0) {
        showToast(`Evidence hardening completed with ${result.failed.length} item(s) requiring review.`);
      } else {
        showToast(`Evidence hardening complete: ${result.migratedCount} record(s) updated.`);
      }
      await runPhase1Audit();
    } catch (error) {
      console.error('Legacy evidence hardening failed:', error);
      showToast('Could not harden legacy evidence.');
    } finally {
      setPhase1Busy(false);
    }
  };

  const currentUser = store.getCurrentUser();
  const isManager = currentUser?.role === 'Manager';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-lux-cream mb-6 flex items-center gap-2">
        <Settings className="w-6 h-6 text-lux-gold" /> System Settings
      </h1>

      <div className="flex border-b border-zinc-800 mb-6">
        <button 
           onClick={() => setActiveTab('general')}
           className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'general' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          General
        </button>
        <button 
          onClick={() => setActiveTab('bands')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'bands' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          Pricing Bands
        </button>
        <button 
          onClick={() => setActiveTab('specs')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'specs' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          Diamond Catalog
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-bold text-lg text-lux-cream mb-4">Costing Parameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Input 
                 label="USD to CAD Multiplier" 
                 type="number" 
                 step="0.01"
                 value={settings.usdToCadMultiplier}
                 onChange={e => setSettings({...settings, usdToCadMultiplier: parseFloat(e.target.value)})}
               />
               <Input 
                 label="Setter Cost per Stone (CAD)" 
                 type="number" 
                 step="0.01"
                 value={settings.setterCostPerSetPieceCad}
                 onChange={e => setSettings({...settings, setterCostPerSetPieceCad: parseFloat(e.target.value)})}
               />
            </div>
          </Card>

          <Card className="p-6">
             <div className="flex items-center gap-2 mb-4">
                <Gem className="text-amber-400" size={20} />
                <h3 className="font-bold text-lg text-lux-cream">Gold Purity Mapping</h3>
             </div>
             <p className="text-xs text-zinc-500 mb-4">Define the gold content ratio (0.0 - 1.0) for each karat. Used for cost calculation.</p>
             
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['10k', '14k', '18k', '21k'].map(k => (
                   <div key={k}>
                      <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">{k} Ratio</label>
                      <input 
                        type="number"
                        step="0.001"
                        className="w-full bg-black border border-zinc-700 rounded-2xl p-3 text-white focus:border-lux-gold focus:ring-0"
                        value={settings.purityMapping?.[k] || 0}
                        onChange={e => setSettings({
                            ...settings, 
                            purityMapping: { ...settings.purityMapping, [k]: parseFloat(e.target.value) } 
                        })}
                      />
                   </div>
                ))}
             </div>
          </Card>

           <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                 <MapPin className="text-lux-gold" size={20} />
                 <h3 className="font-bold text-lg text-lux-cream">Inventory Locations</h3>
              </div>
              <p className="text-xs text-zinc-500 mb-4 font-normal">
                Manage storage locations for certified diamonds. Note: 'Melee' is a built-in aggregate inventory location and cannot be modified or removed.
              </p>
              
              <div className="space-y-2.5 max-w-md mb-6">
                {locations.map(loc => (
                  <div key={loc} className="flex items-center justify-between p-3 border border-zinc-800 rounded-2xl bg-zinc-900/40">
                    <span className="text-sm font-bold text-lux-cream">{loc}</span>
                    <button 
                      type="button"
                      onClick={() => handleRemoveLocation(loc)} 
                      className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-800 transition-colors"
                      title={`Delete ${loc}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {locations.length === 0 && (
                  <p className="text-xs text-zinc-600 italic">No custom locations. Using defaults: Toronto, Miami</p>
                )}
              </div>

              <div className="flex items-end gap-3 max-w-md">
                <div className="flex-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">New Location Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-black border border-zinc-700 rounded-2xl p-3 text-white focus:border-lux-gold focus:ring-0 text-sm" 
                    value={newLocationName} 
                    onChange={e => setNewLocationName(e.target.value)} 
                    placeholder="e.g. Toronto, Miami, New York"
                  />
                </div>
                <Button onClick={handleAddLocation} disabled={!newLocationName.trim()}>
                  <Plus size={16} className="mr-1.5" /> Add Location
                </Button>
              </div>
           </Card>

           {isManager && (
             <Card className="p-6 border-amber-700/40">
               <div className="flex items-center justify-between gap-4 mb-3">
                 <div>
                   <h3 className="font-bold text-lg text-lux-cream">Phase 1 Inventory Safety</h3>
                   <p className="text-xs text-zinc-500 mt-1">Audit Toronto Melee balances and rotate legacy evidence download tokens before activation.</p>
                 </div>
                 <span className={`text-xs font-bold px-2 py-1 rounded-full ${phase1Audit?.ready ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                   {phase1Audit?.ready ? 'READY' : 'NOT AUDITED'}
                 </span>
               </div>
               {phase1Audit && (
                 <p className="text-xs text-zinc-400 mb-4">
                   Checked {phase1Audit.specsChecked} Toronto Melee specs and {phase1Audit.evidenceChecked} evidence records. {phase1Audit.blockers.length + phase1Audit.legacyEvidenceBlockers.length} blocker(s).
                 </p>
               )}
               <div className="flex flex-wrap gap-3">
                 <Button variant="secondary" onClick={runPhase1Audit} disabled={phase1Busy}>
                   {phase1Busy ? 'Working…' : 'Run Safety Audit'}
                 </Button>
                 <Button variant="danger" onClick={hardenLegacyEvidence} disabled={phase1Busy}>
                   Rotate Legacy Evidence Tokens
                 </Button>
               </div>
             </Card>
           )}

           <div className="flex justify-end">
             <Button onClick={handleSaveGeneralSettings} icon={<Key size={18}/>}>Save All Settings</Button>
           </div>
         </div>
      )}

      {activeTab === 'bands' && (
        <div className="space-y-6">
           <Card className="p-6">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-lux-cream">Defined Pricing Bands</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" onClick={() => setIsClearBandsModalOpen(true)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Clear All
                  </Button>
                  <Button onClick={handleGenerateSpecs} variant="secondary" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate Specs
                  </Button>
                </div>
             </div>
             
             <div className="space-y-3">
               {bands.map((band) => (
                 <div key={band.id} className="flex items-center gap-4 p-3 border border-zinc-800 rounded-2xl bg-zinc-900/40 shadow-sm">
                    <div className="flex-1">
                      <div className="font-medium text-lux-cream text-sm">
                         {Number(band.minMm.toFixed(2))}mm - {Number(band.maxMm.toFixed(2))}mm
                      </div>
                      <div className="text-xs text-zinc-500">Step: {band.stepMm}mm</div>
                    </div>
                    <div className="text-right">
                       <span className="block font-bold text-lux-cream">${band.pricePerCtUsd}</span>
                       <span className="text-xs text-zinc-500">USD/ct</span>
                    </div>
                    <button onClick={() => handleDeleteBand(band.id)} className="p-2 text-zinc-600 hover:text-red-400">
                      <Trash2 size={16} />
                    </button>
                 </div>
               ))}
               
               {bands.length === 0 && <p className="text-center text-zinc-600 py-4">No bands defined.</p>}
             </div>
           </Card>

           <Card className="p-6 border-dashed border-zinc-800">
             <h4 className="font-bold text-sm text-zinc-400 mb-4">Add New Band</h4>
             <div className="flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Min (mm)</label>
                  <input type="number" step="0.01" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newBand.minMm} onChange={e => setNewBand({...newBand, minMm: parseFloat(e.target.value)})} />
                </div>
                <div className="w-24">
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Max (mm)</label>
                  <input type="number" step="0.01" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newBand.maxMm} onChange={e => setNewBand({...newBand, maxMm: parseFloat(e.target.value)})} />
                </div>
                <div className="w-24">
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Step (mm)</label>
                  <input type="number" step="0.01" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newBand.stepMm} onChange={e => setNewBand({...newBand, stepMm: parseFloat(e.target.value)})} />
                </div>
                <div className="w-32">
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Price (USD/ct)</label>
                  <input type="number" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newBand.pricePerCtUsd} onChange={e => setNewBand({...newBand, pricePerCtUsd: parseFloat(e.target.value)})} />
                </div>
                <Button onClick={handleAddBand} disabled={!newBand.pricePerCtUsd}>
                  <Plus className="w-4 h-4 mr-2" /> Add Band
                </Button>
             </div>
           </Card>
        </div>
      )}

      {activeTab === 'specs' && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-lg text-lux-cream">Diamond Catalog</h3>
             <div className="flex gap-2">
               <span className="text-[10px] uppercase tracking-wider text-zinc-500">Historical specifications are preserved</span>
               <Button size="sm" onClick={handleSaveCatalogOverrides}>Save Overrides</Button>
             </div>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500 bg-zinc-900 sticky top-0 z-10 border-b border-zinc-800">
                 <tr>
                   <th className="p-3 font-medium cursor-pointer hover:text-lux-cream" onClick={() => handleSort('label')}>
                     Label {sortConfig?.key === 'label' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                   </th>
                   <th className="p-3 w-24 font-medium cursor-pointer hover:text-lux-cream" onClick={() => handleSort('sizeMm')}>
                     Size {sortConfig?.key === 'sizeMm' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                   </th>
                   <th className="p-3 w-24 font-medium cursor-pointer hover:text-lux-cream" onClick={() => handleSort('ctPerStone')}>
                     Avg Wt {sortConfig?.key === 'ctPerStone' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                   </th>
                   <th className="p-3 w-40 font-medium cursor-pointer hover:text-lux-cream" onClick={() => handleSort('defaultCostPerCtUsd')}>
                     Cost (USD/ct) {sortConfig?.key === 'defaultCostPerCtUsd' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                   </th>
                   <th className="p-3 w-16"></th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {sortedSpecs.map(s => (
                  <tr key={s.id} className="hover:bg-zinc-900/30">
                    <td className="p-3">
                      <input 
                        type="text" 
                        className="w-full rounded-xl border-lux-border py-1 px-3 text-xs bg-lux-input text-lux-cream focus:bg-black focus:border-lux-gold transition-all"
                        value={s.label}
                        onChange={e => {
                           const newLabel = e.target.value;
                           const match = newLabel.match(/RD (\d+(\.\d+)?)mm/);
                           const newSize = match ? parseFloat(match[1]) : s.sizeMm;
                           
                           const newSpecs = specs.map(sp => sp.id === s.id ? { 
                             ...sp, 
                             label: newLabel,
                             sizeMm: newSize
                           } : sp);
                           setSpecs(newSpecs);
                        }}
                      />
                    </td>
                    <td className="p-3 text-zinc-500">{s.sizeMm}mm</td>
                    <td className="p-3">
                      <input 
                        type="number" 
                        step="0.001"
                        className="w-full rounded-xl border-lux-border py-1 text-xs text-center bg-lux-input text-zinc-300 focus:bg-black focus:border-lux-gold transition-all"
                        value={s.ctPerStone}
                        onChange={e => {
                           const newSpecs = specs.map(sp => sp.id === s.id ? { ...sp, ctPerStone: parseFloat(e.target.value) } : sp);
                           setSpecs(newSpecs);
                        }}
                      />
                    </td>
                    <td className="p-3">
                       <div className="relative">
                         <span className="absolute left-2 top-1.5 text-zinc-600 text-xs">$</span>
                         <input 
                          type="number" 
                          className={`w-full rounded-xl border py-1 pl-4 text-xs font-medium bg-lux-input transition-all ${s.isOverride ? 'border-amber-700 text-amber-500' : 'border-lux-border text-zinc-400'}`}
                          value={s.defaultCostPerCtUsd}
                          onChange={e => updateSpecOverride(s.id, parseFloat(e.target.value))}
                         />
                       </div>
                    </td>
                    <td className="p-3 text-right">
                      {s.id !== 'MIXED-UNSORTED' && <span className="text-[9px] text-zinc-600 uppercase">Preserved</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-6 border-t border-zinc-800">
            <h4 className="font-bold text-sm text-zinc-400 mb-4">Add Single Size</h4>
            <div className="flex flex-wrap items-end gap-3">
               <div className="w-32">
                 <label className="text-xs font-medium text-zinc-500 mb-1 block">Label</label>
                 <input type="text" placeholder="e.g. RD 1.25mm" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newSize.label} onChange={e => setNewSize({...newSize, label: e.target.value})} />
               </div>
               <div className="w-24">
                 <label className="text-xs font-medium text-zinc-500 mb-1 block">Size (mm)</label>
                 <input type="number" step="0.01" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newSize.sizeMm || ''} onChange={e => setNewSize({...newSize, sizeMm: parseFloat(e.target.value)})} />
               </div>
               <div className="w-24">
                 <label className="text-xs font-medium text-zinc-500 mb-1 block">Avg Wt (ct)</label>
                 <input type="number" step="0.001" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newSize.ctPerStone || ''} onChange={e => setNewSize({...newSize, ctPerStone: parseFloat(e.target.value)})} />
               </div>
               <div className="w-32">
                 <label className="text-xs font-medium text-zinc-500 mb-1 block">Cost (USD/ct)</label>
                 <input type="number" className="w-full rounded-2xl border-lux-border bg-lux-input text-lux-cream text-sm py-1.5 px-3" value={newSize.defaultCostPerCtUsd || ''} onChange={e => setNewSize({...newSize, defaultCostPerCtUsd: parseFloat(e.target.value)})} />
               </div>
               <Button onClick={handleAddSingleSize} disabled={!newSize.label || !newSize.sizeMm || !newSize.ctPerStone || !newSize.defaultCostPerCtUsd}>
                 <Plus className="w-4 h-4 mr-2" /> Add Size
               </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        isOpen={isClearModalOpen}
        onClose={() => {
          setIsClearModalOpen(false);
          setClearVerification('');
        }}
        title="Clear Diamond Catalog"
        footer={
          <>
            <Button variant="ghost" onClick={() => {
              setIsClearModalOpen(false);
              setClearVerification('');
            }}>Cancel</Button>
            <Button variant="danger" onClick={handleClearAllSpecs} disabled={clearVerification !== 'CLEAR'}>Clear All</Button>
          </>
        }
      >
        <p>Are you sure you want to clear the entire diamond catalog?</p>
        <p className="mt-2 text-sm text-zinc-500 mb-4">Note: The "Mixed/Unsorted" category will be preserved.</p>
        <Input 
          label="Type CLEAR to confirm" 
          value={clearVerification} 
          onChange={e => setClearVerification(e.target.value)} 
          placeholder="CLEAR"
        />
      </Modal>

      <Modal
        isOpen={isDeleteSizeModalOpen}
        onClose={() => {
          setIsDeleteSizeModalOpen(false);
          setSizeToDelete(null);
        }}
        title="Delete Diamond Size"
        footer={
          <>
            <Button variant="ghost" onClick={() => {
              setIsDeleteSizeModalOpen(false);
              setSizeToDelete(null);
            }}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteSize}>Delete</Button>
          </>
        }
      >
        <p>Are you sure you want to delete the diamond size <strong>{sizeToDelete?.label}</strong>?</p>
        <p className="mt-2 text-sm text-zinc-500">This action cannot be undone.</p>
      </Modal>

      <Modal
        isOpen={isClearBandsModalOpen}
        onClose={() => {
          setIsClearBandsModalOpen(false);
          setClearBandsVerification('');
        }}
        title="Clear Pricing Bands"
        footer={
          <>
            <Button variant="ghost" onClick={() => {
              setIsClearBandsModalOpen(false);
              setClearBandsVerification('');
            }}>Cancel</Button>
            <Button variant="danger" onClick={handleClearAllBands} disabled={clearBandsVerification !== 'CLEAR'}>Clear All</Button>
          </>
        }
      >
        <p>Are you sure you want to clear all pricing bands?</p>
        <p className="mt-2 text-sm text-zinc-500 mb-4">This will not delete your generated catalog, only the rules used to generate it.</p>
        <Input 
          label="Type CLEAR to confirm" 
          value={clearBandsVerification} 
          onChange={e => setClearBandsVerification(e.target.value)} 
          placeholder="CLEAR"
        />
      </Modal>
    </div>
  );
};

export default SettingsPage;
