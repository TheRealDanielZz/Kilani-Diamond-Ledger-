
import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { Card, Button, Input } from '../components/UI';
import { useToast } from '../App';
import { Settings, RefreshCw, Plus, Trash2, Key, Gem } from 'lucide-react';
import { DiamondPriceBand } from '../types';

const SettingsPage: React.FC = () => {
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState<'general' | 'bands' | 'specs'>('general');
  const [settings, setSettings] = useState(store.getSettings());
  const [specs, setSpecs] = useState(store.getSpecs());
  const [bands, setBands] = useState<DiamondPriceBand[]>(store.getBands());

  // Band Form
  const [newBand, setNewBand] = useState<Partial<DiamondPriceBand>>({
    minMm: 0.8, maxMm: 1.2, stepMm: 0.1, pricePerCtUsd: 0
  });

  useEffect(() => {
      const sync = () => {
          setSettings(store.getSettings());
          setSpecs(store.getSpecs());
          setBands(store.getBands());
      };
      sync();
      return store.subscribe(sync);
  }, []);

  const handleSaveSettings = () => {
    store.updateSettings(settings);
    store.updateSpecs(specs);
    store.updateBands(bands);
    showToast('Settings Updated');
  };

  const handleAddBand = () => {
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

    setBands([...bands, band].sort((a,b) => a.minMm - b.minMm));
    setNewBand({ minMm: band.maxMm + 0.1, maxMm: band.maxMm + 0.5, stepMm: 0.1, pricePerCtUsd: 0 });
  };

  const handleDeleteBand = (id: string) => {
    setBands(bands.filter(b => b.id !== id));
  };

  const handleGenerateSpecs = () => {
    store.updateBands(bands); // Save bands first
    const result = store.generateSpecsFromBands();
    showToast(`Catalog Updated: ${result.created} new, ${result.updated} updated.`);
  };

  const updateSpecOverride = (id: string, val: number) => {
    const newSpecs = specs.map(s => s.id === id ? { ...s, defaultCostPerCtUsd: val, isOverride: true } : s);
    setSpecs(newSpecs);
  };

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
                        className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white focus:border-lux-gold focus:ring-0"
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

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} icon={<Key size={18}/>}>Save All Settings</Button>
          </div>
        </div>
      )}

      {activeTab === 'bands' && (
        <div className="space-y-6">
           <Card className="p-6">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-lux-cream">Defined Pricing Bands</h3>
                <Button onClick={handleGenerateSpecs} variant="secondary" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate Specs
                </Button>
             </div>
             
             <div className="space-y-3">
               {bands.map((band) => (
                 <div key={band.id} className="flex items-center gap-4 p-3 border border-zinc-800 rounded-xl bg-zinc-900/40 shadow-sm">
                    <div className="flex-1">
                      <div className="font-medium text-lux-cream text-sm">
                         {band.minMm.toFixed(1)}mm - {band.maxMm.toFixed(1)}mm
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

           <Card className="p-6 bg-zinc-900/30 border-dashed border-zinc-800">
             <h4 className="font-bold text-sm text-zinc-400 mb-4">Add New Band</h4>
             <div className="flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Min (mm)</label>
                  <input type="number" step="0.1" className="w-full rounded-lg border-lux-border bg-lux-input text-lux-cream text-sm py-1.5" value={newBand.minMm} onChange={e => setNewBand({...newBand, minMm: parseFloat(e.target.value)})} />
                </div>
                <div className="w-24">
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Max (mm)</label>
                  <input type="number" step="0.1" className="w-full rounded-lg border-lux-border bg-lux-input text-lux-cream text-sm py-1.5" value={newBand.maxMm} onChange={e => setNewBand({...newBand, maxMm: parseFloat(e.target.value)})} />
                </div>
                <div className="w-32">
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Price (USD/ct)</label>
                  <input type="number" className="w-full rounded-lg border-lux-border bg-lux-input text-lux-cream text-sm py-1.5" value={newBand.pricePerCtUsd} onChange={e => setNewBand({...newBand, pricePerCtUsd: parseFloat(e.target.value)})} />
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
             <Button size="sm" onClick={handleSaveSettings}>Save Overrides</Button>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500 bg-zinc-900 sticky top-0 z-10 border-b border-zinc-800">
                 <tr>
                   <th className="p-3 font-medium">Label</th>
                   <th className="p-3 w-24 font-medium">Size</th>
                   <th className="p-3 w-24 font-medium">Avg Wt</th>
                   <th className="p-3 w-40 font-medium">Cost (USD/ct)</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {specs.map(s => (
                  <tr key={s.id} className="hover:bg-zinc-900/30">
                    <td className="p-3 font-medium text-lux-cream">{s.label}</td>
                    <td className="p-3 text-zinc-500">{s.sizeMm}mm</td>
                    <td className="p-3">
                      <input 
                        type="number" 
                        step="0.001"
                        className="w-full rounded border-lux-border py-1 text-xs text-center bg-lux-input text-zinc-300 focus:bg-black focus:border-lux-gold"
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
                          className={`w-full rounded border py-1 pl-4 text-xs font-medium bg-lux-input ${s.isOverride ? 'border-amber-700 text-amber-500' : 'border-lux-border text-zinc-400'}`}
                          value={s.defaultCostPerCtUsd}
                          onChange={e => updateSpecOverride(s.id, parseFloat(e.target.value))}
                         />
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SettingsPage;
