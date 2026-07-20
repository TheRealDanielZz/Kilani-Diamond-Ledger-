import React, { useState } from 'react';
import { Card, Button, Input } from './UI';
import { AlertTriangle, ChevronDown, ChevronUp, DollarSign, PackageX, CheckCircle2, X } from 'lucide-react';
import { store } from '../services/store';

interface ExecutiveInsightsProps {
  negativeBalances: any[];
  missingCosts: any[];
  otherWarnings: string[];
  usdCadMultiplier: number;
}

export const ExecutiveInsightsModule: React.FC<ExecutiveInsightsProps> = ({
  negativeBalances,
  missingCosts,
  otherWarnings,
  usdCadMultiplier
}) => {
  const [expanded, setExpanded] = useState(false);
  const [fixingSpec, setFixingSpec] = useState<{ specId: string; color: string; label: string; currentPcs: number; currentCt: number } | null>(null);
  const [fixPcs, setFixPcs] = useState('');
  const [fixCt, setFixCt] = useState('');
  const [fixReason, setFixReason] = useState('');

  const totalWarnings = negativeBalances.length + missingCosts.length + otherWarnings.length;

  if (totalWarnings === 0) {
    return (
      <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-emerald-400" />
        <span className="text-emerald-400 font-bold text-sm tracking-wide">Ledger Health: 100% Accurate (No Discrepancies)</span>
      </div>
    );
  }

  const handleFixSubmit = async () => {
    const user = store.getCurrentUser();
    if (!fixingSpec || !user) return;
    
    try {
      const p = parseFloat(fixPcs);
      const c = parseFloat(fixCt);
      if (isNaN(p) || isNaN(c)) throw new Error('Valid numbers required');
      
      await store.applyInventoryCorrection({
        specId: fixingSpec.specId,
        location: 'Melee', // Defaulting to Melee for now based on standard
        mode: 'PCS',
        previousPcs: fixingSpec.currentPcs,
        previousCt: fixingSpec.currentCt,
        newPcs: p,
        newCt: c,
        reason: fixReason || 'Corrected via Executive Insights',
        managerId: user.id
      });
      setFixingSpec(null);
    } catch (e: any) {
      alert(e.message || 'Failed to apply correction');
    }
  };

  return (
    <div className="space-y-4">
      {/* CEO Executive View */}
      <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 mb-6">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" /> 
              Weekly Health: {totalWarnings} Issue{totalWarnings > 1 ? 's' : ''} Need{totalWarnings === 1 ? 's' : ''} Attention
            </h3>
            <p className="text-zinc-400 text-sm mt-1">
              There are unresolved operational discrepancies in the ledger that require managerial audit.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setExpanded(!expanded)} className="shrink-0">
            {expanded ? <><ChevronUp size={14}/> Hide Details</> : <><ChevronDown size={14}/> View Action Items</>}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
          <Card className="p-4 border-white/5 bg-black/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-500 text-xs font-black uppercase tracking-widest mb-3">
                <PackageX size={14} /> Inventory Discrepancies
              </div>
              <div className="text-3xl font-black text-white">{negativeBalances.length}</div>
              <div className="text-zinc-400 text-xs font-bold uppercase mt-1">Specs showing negative physical stock</div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5">
              <span className="text-amber-400 text-[10px] font-bold uppercase tracking-widest bg-amber-950/40 px-2 py-1 rounded">Requires Audit</span>
            </div>
          </Card>

          <Card className="p-4 border-white/5 bg-black/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-400 text-xs font-black uppercase tracking-widest mb-3">
                <DollarSign size={14} /> Missing Financials
              </div>
              <div className="text-3xl font-black text-white">{missingCosts.length}</div>
              <div className="text-zinc-400 text-xs font-bold uppercase mt-1">Transactions missing cost data</div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5">
              <span className="text-red-400 text-[10px] font-bold uppercase tracking-widest bg-red-950/40 px-2 py-1 rounded">Estimated Value: Unknown</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Manager Action Items (Expanded View) */}
      {expanded && (
        <div className="bg-black/40 border border-white/5 rounded-2xl p-5 animate-in slide-in-from-top-2">
          <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4">Manager Action Items</h4>
          
          <div className="space-y-6">
            {negativeBalances.length > 0 && (
              <div>
                <h5 className="text-amber-400 text-[11px] font-bold uppercase tracking-widest mb-2 border-b border-white/5 pb-2">Negative Balances</h5>
                <div className="space-y-2">
                  {negativeBalances.map((nb, i) => (
                    <div key={i} className="flex items-center justify-between bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                      <div>
                        <div className="text-sm font-bold text-white">{nb.spec.label}</div>
                        <div className="text-xs text-zinc-500">Color: {nb.color} | Current Ledger: <span className="text-red-400 font-mono font-bold">{nb.closing} pcs</span></div>
                      </div>
                      <Button size="sm" variant="secondary" className="text-xs" onClick={() => setFixingSpec({
                        specId: nb.spec.id,
                        label: nb.spec.label,
                        color: nb.color,
                        currentPcs: nb.closing,
                        currentCt: 0 // Will let them enter actual ct
                      })}>Fix Balance</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {missingCosts.length > 0 && (
              <div>
                <h5 className="text-red-400 text-[11px] font-bold uppercase tracking-widest mb-2 border-b border-white/5 pb-2">Missing Transaction Costs</h5>
                <div className="space-y-2">
                  {missingCosts.map((mc, i) => (
                    <div key={i} className="flex items-center justify-between bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                      <div>
                        <div className="text-sm font-bold text-white">Tx: {mc.id.slice(0,8)} ({mc.movementType})</div>
                        <div className="text-xs text-zinc-500">Missing $/ct input. COGS is understated.</div>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono bg-red-950/30 px-2 py-1 rounded text-red-400 font-bold uppercase">Value: Unknown</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherWarnings.length > 0 && (
              <div>
                <h5 className="text-zinc-400 text-[11px] font-bold uppercase tracking-widest mb-2 border-b border-white/5 pb-2">Other Audit Warnings</h5>
                <ul className="list-disc list-inside space-y-1">
                  {otherWarnings.map((w, i) => (
                    <li key={i} className="text-xs text-zinc-400 font-mono">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fix Modal */}
      {fixingSpec && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-6 bg-zinc-950 border-white/10 relative">
            <button onClick={() => setFixingSpec(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X size={20}/></button>
            <h3 className="text-lg font-bold text-white mb-1">Adjust Inventory</h3>
            <p className="text-xs text-zinc-400 mb-6">Correcting negative balance for {fixingSpec.label} ({fixingSpec.color})</p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">Current Pcs</label>
                  <div className="text-red-400 font-mono font-bold text-lg">{fixingSpec.currentPcs}</div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">New True Pcs</label>
                  <Input type="number" placeholder="e.g. 50" value={fixPcs} onChange={e => setFixPcs(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">New True Carats</label>
                <Input type="number" step="0.001" placeholder="e.g. 0.150" value={fixCt} onChange={e => setFixCt(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">Reason</label>
                <Input placeholder="e.g. Received shipment but not logged" value={fixReason} onChange={e => setFixReason(e.target.value)} />
              </div>
              <Button className="w-full mt-2" onClick={handleFixSubmit}>Apply Correction</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
