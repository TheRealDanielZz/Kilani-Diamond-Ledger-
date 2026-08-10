
import React, { useState, useEffect } from 'react';
import { DiamondSpec } from '../types';
import { Button } from './UI';
import { Trash2, Plus, Clipboard } from 'lucide-react';

interface EntryLine {
  id: string;
  specId: string;
  pcs: number; // In WEIGHT mode, this is estimated or optional
  ct: number;
  cost?: number; 
}

interface Props {
  specs: DiamondSpec[];
  initialLines?: EntryLine[];
  onLinesChange: (lines: EntryLine[]) => void;
  showCost?: boolean;
  mode?: 'PCS' | 'WEIGHT';
}

export const FastEntryGrid: React.FC<Props> = ({ specs, initialLines, onLinesChange, showCost = false, mode = 'PCS' }) => {
  const [lines, setLines] = useState<EntryLine[]>(initialLines || []);

  // Auto-add the first entry line once specs finish loading
  // (covers Setters/Jewellers whose specs arrive asynchronously)
  useEffect(() => {
    if (specs.length > 0 && lines.length === 0 && !initialLines?.length) {
      const firstLine: EntryLine = {
        id: Math.random().toString(36).substr(2, 9),
        specId: specs[0].id,
        pcs: 0,
        ct: 0,
        cost: specs[0].defaultCostPerCtUsd || 0
      };
      setLines([firstLine]);
      onLinesChange([firstLine]);
    }
  }, [specs]);

  const addLine = () => {
    const newLine: EntryLine = {
      id: Math.random().toString(36).substr(2, 9),
      specId: specs[0]?.id || '',
      pcs: 0,
      ct: 0,
      cost: specs[0]?.defaultCostPerCtUsd || 0
    };
    const updated = [...lines, newLine];
    setLines(updated);
    onLinesChange(updated);
  };

  const updateLine = (id: string, field: keyof EntryLine, value: any) => {
    const updated = lines.map(line => {
      if (line.id !== id) return line;
      
      const newLine = { ...line, [field]: value };
      const spec = specs.find(s => s.id === newLine.specId);

      // Auto-calc logic based on mode
      if (field === 'specId' && spec) {
        newLine.cost = spec.defaultCostPerCtUsd;
        if (mode === 'PCS' && newLine.pcs > 0) {
            newLine.ct = parseFloat((newLine.pcs * spec.ctPerStone).toFixed(3));
        } else if (mode === 'WEIGHT' && newLine.ct > 0 && spec.ctPerStone > 0) {
            // Rough estimate of pcs
            newLine.pcs = Math.round(newLine.ct / spec.ctPerStone);
        }
      }

      if (mode === 'PCS' && field === 'pcs' && spec) {
        newLine.ct = parseFloat((value * spec.ctPerStone).toFixed(3));
      }

      if (mode === 'WEIGHT' && field === 'ct' && spec && spec.ctPerStone > 0) { // Safety check > 0
         newLine.pcs = Math.round(value / spec.ctPerStone);
      }

      return newLine;
    });
    setLines(updated);
    onLinesChange(updated);
  };

  const removeLine = (id: string) => {
    const updated = lines.filter(l => l.id !== id);
    setLines(updated);
    onLinesChange(updated);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const clipText = e.clipboardData.getData('text');
    const rows = clipText.split('\n').filter(r => r.trim());
    
    const newLines = [...lines];
    
    rows.forEach(row => {
      const cols = row.split('\t');
      if (cols.length >= 2) {
        // Try to find spec match
        const labelQuery = cols[0].trim().toLowerCase();
        const spec = specs.find(s => s.label.toLowerCase().includes(labelQuery));
        
        if (spec) {
           const val2 = parseFloat(cols[1].trim()) || 0;
           let pcs = 0;
           let ct = 0;

           if (mode === 'PCS') {
               pcs = Math.floor(val2);
               ct = parseFloat((pcs * spec.ctPerStone).toFixed(3));
           } else {
               ct = val2;
               pcs = Math.round(ct / spec.ctPerStone);
           }

           if ((mode === 'PCS' && pcs > 0) || (mode === 'WEIGHT' && ct > 0)) {
               newLines.push({
                    id: Math.random().toString(36).substr(2, 9),
                    specId: spec.id,
                    pcs,
                    ct,
                    cost: spec.defaultCostPerCtUsd
               });
           }
        }
      }
    });
    
    setLines(newLines);
    onLinesChange(newLines);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' && index === lines.length - 1) {
      addLine();
    }
  };

  return (
    <div className="border rounded-[1.5rem] overflow-hidden border-white/5 bg-zinc-900/10 backdrop-blur-md" onPaste={handlePaste}>
      {/* Desktop Header */}
      <div className="hidden sm:grid bg-black/30 border-b border-white/5 gap-4 px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-[0.1em]"
           style={{ gridTemplateColumns: showCost ? 'minmax(0, 1fr) minmax(80px, 100px) minmax(80px, 110px) minmax(80px, 110px) 40px' : 'minmax(0, 1fr) minmax(80px, 100px) minmax(80px, 110px) 40px' }}>
        <div>Diamond Specification</div>
        <div className="text-right">Quantity</div>
        <div className="text-right">Total Carat</div>
        {showCost && <div className="text-right">Cost (USD/ct)</div>}
        <div></div>
      </div>
      
      <div className="max-h-[450px] overflow-y-auto no-scrollbar flex flex-col divide-y divide-white/5">
        {lines.map((line, idx) => (
          <div key={line.id} className="group p-4 sm:p-0">
            {/* Mobile View: Stacked Card */}
            <div className="flex flex-col sm:hidden gap-3">
               <div>
                  <label htmlFor={`spec-${line.id}`} className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Specification</label>
                  <select 
                    id={`spec-${line.id}`}
                    className="w-full text-sm border border-white/10 rounded-xl py-2 px-3 bg-black/40 focus:ring-1 focus:ring-lux-gold/30 font-bold text-lux-cream [&>option]:bg-zinc-950 cursor-pointer"
                    value={line.specId}
                    onChange={e => updateLine(line.id, 'specId', e.target.value)}
                  >
                    {specs.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`pcs-${line.id}`} className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Quantity</label>
                    <input 
                      id={`pcs-${line.id}`}
                      type="number"
                      disabled={mode === 'WEIGHT'}
                      className={`w-full text-right text-sm border-white/10 rounded-xl py-2 px-3 focus:border-lux-gold focus:ring-1 focus:ring-lux-gold/30 bg-black/40 text-lux-cream tabular-nums font-mono ${mode === 'WEIGHT' ? 'opacity-30' : 'shadow-inner'}`}
                      value={line.pcs || ''}
                      onChange={e => updateLine(line.id, 'pcs', parseInt(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx)}
                      placeholder={mode === 'WEIGHT' ? 'Auto' : '0'}
                    />
                  </div>
                  <div>
                    <label htmlFor={`ct-${line.id}`} className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Total Carat</label>
                    <input 
                      id={`ct-${line.id}`}
                      type="number"
                      step="0.001"
                      disabled={mode === 'PCS'}
                      className={`w-full text-right text-sm border-white/10 rounded-xl py-2 px-3 focus:border-lux-gold focus:ring-1 focus:ring-lux-gold/30 bg-black/40 text-emerald-400 tabular-nums font-mono ${mode === 'PCS' ? 'opacity-30' : 'shadow-inner'}`}
                      value={line.ct || ''}
                      onChange={e => updateLine(line.id, 'ct', parseFloat(e.target.value) || 0)}
                      placeholder="0.000"
                    />
                  </div>
               </div>
               {showCost && (
                  <div>
                    <label htmlFor={`cost-${line.id}`} className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Cost (USD)</label>
                    <input 
                      id={`cost-${line.id}`}
                      type="number"
                      className="w-full text-right text-sm border-white/10 rounded-xl py-2 px-3 focus:border-lux-gold bg-black/40 text-zinc-500 tabular-nums font-mono"
                      value={line.cost}
                      onChange={e => updateLine(line.id, 'cost', parseFloat(e.target.value) || 0)}
                    />
                  </div>
               )}
               {lines.length > 1 && (
                  <div className="flex justify-end pt-2">
                     <button 
                       onClick={() => removeLine(line.id)}
                       className="flex items-center gap-2 text-red-400 hover:text-red-300 text-xs font-bold bg-red-950/20 px-3 py-1.5 rounded-lg border border-red-900/30"
                       aria-label="Remove Entry"
                     >
                       <Trash2 size={14} /> Remove Entry
                     </button>
                  </div>
               )}
            </div>

            {/* Desktop View: Grid Row */}
            <div className="hidden sm:grid gap-4 px-6 py-3 items-center hover:bg-white/[0.02] transition-colors"
                 style={{ gridTemplateColumns: showCost ? 'minmax(0, 1fr) minmax(80px, 100px) minmax(80px, 110px) minmax(80px, 110px) 40px' : 'minmax(0, 1fr) minmax(80px, 100px) minmax(80px, 110px) 40px' }}>
              <div className="min-w-0">
                <select 
                  className="w-full text-sm border-0 bg-transparent focus:ring-0 font-bold text-lux-cream p-1 [&>option]:bg-zinc-950 cursor-pointer hover:text-lux-gold transition-colors truncate"
                  value={line.specId}
                  onChange={e => updateLine(line.id, 'specId', e.target.value)}
                  autoFocus={idx === lines.length - 1 && lines.length > 1}
                  aria-label="Diamond Specification"
                >
                  {specs.map(s => (
                    <option key={s.id} value={s.id} title={s.label}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <input 
                  type="number"
                  disabled={mode === 'WEIGHT'}
                  className={`w-full text-right text-sm border-white/10 rounded-xl py-2 px-3 focus:border-lux-gold focus:ring-1 focus:ring-lux-gold/30 bg-black/40 text-lux-cream tabular-nums font-mono ${mode === 'WEIGHT' ? 'opacity-30' : 'group-hover:bg-black/60 shadow-inner'}`}
                  value={line.pcs || ''}
                  onChange={e => updateLine(line.id, 'pcs', parseInt(e.target.value) || 0)}
                  onKeyDown={e => handleKeyDown(e, idx)}
                  placeholder={mode === 'WEIGHT' ? 'Auto' : '0'}
                  aria-label="Quantity"
                />
              </div>
              <div>
                <input 
                  type="number"
                  step="0.001"
                  disabled={mode === 'PCS'}
                  className={`w-full text-right text-sm border-white/10 rounded-xl py-2 px-3 focus:border-lux-gold focus:ring-1 focus:ring-lux-gold/30 bg-black/40 text-emerald-400 tabular-nums font-mono ${mode === 'PCS' ? 'opacity-30' : 'group-hover:bg-black/60 shadow-inner'}`}
                  value={line.ct || ''}
                  onChange={e => updateLine(line.id, 'ct', parseFloat(e.target.value) || 0)}
                  placeholder="0.000"
                  aria-label="Total Carat"
                />
              </div>
              {showCost && (
                <div>
                  <input 
                    type="number"
                    className="w-full text-right text-sm border-white/10 rounded-xl py-2 px-3 focus:border-lux-gold focus:ring-1 focus:ring-lux-gold/30 bg-black/40 text-zinc-500 tabular-nums font-mono group-hover:bg-black/60 shadow-inner"
                    value={line.cost}
                    onChange={e => updateLine(line.id, 'cost', parseFloat(e.target.value) || 0)}
                    aria-label="Cost per Carat"
                  />
                </div>
              )}
              <div className="flex justify-end">
                {lines.length > 1 ? (
                  <button 
                    onClick={() => removeLine(line.id)}
                    className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-red-400 p-1 rounded-lg hover:bg-red-950/20 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                    tabIndex={-1}
                    aria-label="Remove Entry"
                    title="Remove Entry"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <div className="w-8 h-8"></div>
                )}
              </div>
            </div>
          </div>
        ))}
        {lines.length === 0 && (
          <div className="p-16 text-center text-zinc-600">
            <div className="w-16 h-16 mx-auto mb-4 bg-zinc-900/50 rounded-full flex items-center justify-center border border-white/5 opacity-50">
               {specs.length === 0 ? (
                 <div className="w-6 h-6 border-2 border-zinc-600 border-t-lux-gold rounded-full animate-spin" />
               ) : (
                 <Clipboard size={24} />
               )}
            </div>
            <p className="text-sm font-medium">{specs.length === 0 ? 'Loading diamond specifications…' : 'Ready for data entry'}</p>
            {specs.length > 0 && <p className="text-[10px] uppercase font-black tracking-widest mt-2 opacity-40">Paste from clipboard or click "Add Diamond Entry"</p>}
          </div>
        )}
      </div>
      <div className="bg-black/20 p-3 border-t border-white/5 flex justify-center backdrop-blur-xl sticky bottom-0">
         <button 
           onClick={addLine} 
           className="w-full sm:w-auto px-8 py-3 bg-white/5 hover:bg-lux-gold hover:text-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 border border-white/5 shadow-sm active:scale-95 flex items-center justify-center gap-2"
         >
           <Plus size={14} /> Add Diamond Entry
         </button>
      </div>
    </div>
  );
};