
import React, { useState } from 'react';
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
    <div className="border rounded-xl overflow-hidden border-zinc-800" onPaste={handlePaste}>
      {/* Scroll Wrapper */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="bg-zinc-900 border-b border-zinc-800 grid grid-cols-12 gap-2 p-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            <div className="col-span-5 pl-2">Diamond Spec</div>
            <div className="col-span-2 text-center">Pcs</div>
            <div className="col-span-2 text-center">Ct</div>
            {showCost ? (
               <div className="col-span-2 text-center">Cost/Ct</div>
            ) : (
               <div className="col-span-2"></div>
            )}
            <div className="col-span-1"></div>
          </div>
          <div className="bg-lux-surface max-h-[400px] overflow-y-auto">
            {lines.map((line, idx) => (
              <div key={line.id} className="grid grid-cols-12 gap-2 p-2 border-b border-zinc-800/50 last:border-0 items-center">
                <div className="col-span-5">
                  <select 
                    className="w-full text-sm border-0 bg-transparent focus:ring-0 font-medium text-lux-cream p-1 [&>option]:bg-zinc-900 cursor-pointer"
                    value={line.specId}
                    onChange={e => updateLine(line.id, 'specId', e.target.value)}
                    autoFocus={idx === lines.length - 1 && lines.length > 1}
                  >
                    {specs.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <input 
                    type="number"
                    disabled={mode === 'WEIGHT'} // Auto-calculated in weight mode mostly, or optional
                    className={`w-full text-center text-sm border-lux-border rounded-md py-1 px-2 focus:border-lux-gold focus:ring-lux-gold bg-lux-input focus:bg-black text-lux-cream tabular-nums ${mode === 'WEIGHT' ? 'opacity-50' : ''}`}
                    value={line.pcs || ''}
                    onChange={e => updateLine(line.id, 'pcs', parseInt(e.target.value) || 0)}
                    onKeyDown={e => handleKeyDown(e, idx)}
                    placeholder={mode === 'WEIGHT' ? 'Est.' : '0'}
                  />
                </div>
                <div className="col-span-2">
                  <input 
                    type="number"
                    step="0.001"
                    disabled={mode === 'PCS'} // Auto-calc in pcs mode
                    className={`w-full text-center text-sm border-lux-border rounded-md py-1 px-2 focus:border-lux-gold focus:ring-lux-gold bg-lux-input focus:bg-black text-zinc-400 tabular-nums ${mode === 'PCS' ? 'opacity-50' : ''}`}
                    value={line.ct || ''}
                    onChange={e => updateLine(line.id, 'ct', parseFloat(e.target.value) || 0)}
                    placeholder="0.000"
                  />
                </div>
                {showCost ? (
                  <div className="col-span-2">
                    <input 
                      type="number"
                      className="w-full text-center text-sm border-lux-border rounded-md py-1 px-2 focus:border-lux-gold focus:ring-lux-gold bg-lux-input focus:bg-black text-zinc-400 tabular-nums"
                      value={line.cost}
                      onChange={e => updateLine(line.id, 'cost', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                ) : <div className="col-span-2"></div>}
                <div className="col-span-1 flex justify-center">
                  <button 
                    onClick={() => removeLine(line.id)}
                    className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-red-950/30 transition-colors"
                    tabIndex={-1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="p-8 text-center text-zinc-600 text-sm">
                <Clipboard className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Paste from Excel or add rows.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="bg-zinc-900/50 p-2 border-t border-zinc-800">
         <Button variant="ghost" size="sm" onClick={addLine} className="w-full text-zinc-400 hover:text-lux-cream">
           <Plus size={16} className="mr-1" /> Add Row
         </Button>
      </div>
    </div>
  );
};