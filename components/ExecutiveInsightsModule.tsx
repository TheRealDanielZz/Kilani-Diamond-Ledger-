import React, { useState } from 'react';
import { Card, Button, Input } from './UI';
import { AlertTriangle, ChevronDown, ChevronUp, DollarSign, PackageX, CheckCircle2, X } from 'lucide-react';
import { store } from '../services/store';

interface ExecutiveInsightsProps {
  negativeBalances: any[];
  missingCosts: any[];
  otherWarnings: string[];
  usdCadMultiplier: number;
  variant?: 'full' | 'compact';
}

export const ExecutiveInsightsModule: React.FC<ExecutiveInsightsProps> = ({
  negativeBalances,
  missingCosts,
  otherWarnings,
  usdCadMultiplier,
  variant = 'compact'
}) => {
  const [expanded, setExpanded] = useState(false);
  const [fixingSpec, setFixingSpec] = useState<{ specId: string; color: string; label: string; currentPcs: number; currentCt: number } | null>(null);
  const [fixPcs, setFixPcs] = useState('');
  const [fixCt, setFixCt] = useState('');
  const [fixReason, setFixReason] = useState('');

  const totalWarnings = negativeBalances.length + missingCosts.length + otherWarnings.length;

  if (totalWarnings === 0) {
    return (
      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-3 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span className="text-emerald-400 font-bold text-xs tracking-wide">Ledger Health: 100% Accurate (Zero Discrepancies)</span>
        </div>
        <span className="text-[10px] uppercase font-bold text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">All Specs Balanced</span>
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
    <div className="space-y-3">
      {/* Sleek Compact Header */}
      {variant === 'compact' ? (
        <div className="bg-gradient-to-r from-amber-500/10 via-theme-input-bg to-theme-input-bg border border-amber-500/30 hover:border-amber-500/50 transition-all rounded-2xl p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md shadow-lg shadow-black/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 shrink-0 border border-amber-500/30">
              <AlertTriangle size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-theme-text-primary">Ledger Health: {totalWarnings} Discrepanc{totalWarnings > 1 ? 'ies' : 'y'} Detected</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-600 [data-theme=dark]:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">Requires Audit</span>
              </div>
              <div className="text-xs text-theme-text-secondary flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
                {negativeBalances.length > 0 && <span className="text-amber-500 font-semibold">{negativeBalances.length} negative stock specs</span>}
                {negativeBalances.length > 0 && missingCosts.length > 0 && <span className="text-theme-text-muted">•</span>}
                {missingCosts.length > 0 && <span className="text-red-500 font-semibold">{missingCosts.length} uncosted txs</span>}
                {otherWarnings.length > 0 && <span className="text-theme-text-muted">• {otherWarnings.length} other warnings</span>}
              </div>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setExpanded(!expanded)} className="shrink-0 self-end sm:self-auto border-amber-500/30 text-amber-600 [data-theme=dark]:text-amber-200 hover:text-white">
            {expanded ? <><ChevronUp size={14}/> Hide Audit Tools</> : <><ChevronDown size={14}/> Review & Resolve</>}
          </Button>
        </div>
      ) : (
        /* CEO Executive View */
        <div className="bg-theme-modal-bg/80 border border-theme-border rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 mb-6">
            <div>
              <h3 className="text-lg font-black text-theme-text-primary flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" /> 
                Weekly Health: {totalWarnings} Issue{totalWarnings > 1 ? 's' : ''} Need{totalWarnings === 1 ? 's' : ''} Attention
              </h3>
              <p className="text-theme-text-secondary text-sm mt-1">
                There are unresolved operational discrepancies in the ledger that require managerial audit.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setExpanded(!expanded)} className="shrink-0">
              {expanded ? <><ChevronUp size={14}/> Hide Details</> : <><ChevronDown size={14}/> View Action Items</>}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
            <Card className="p-4 border-theme-border bg-theme-input-bg flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-500 text-xs font-black uppercase tracking-widest mb-3 font-mono">
                  <PackageX size={14} /> Inventory Discrepancies
                </div>
                <div className="text-3xl font-mono tabular-nums font-black text-theme-text-primary">{negativeBalances.length}</div>
                <div className="text-theme-text-secondary text-xs font-bold uppercase mt-1 font-mono">Specs showing negative physical stock</div>
              </div>
              <div className="mt-4 pt-3 border-t border-theme-border">
                <span className="text-amber-500 text-[10px] font-bold uppercase tracking-widest bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded font-mono">Requires Audit</span>
              </div>
            </Card>

            <Card className="p-4 border-theme-border bg-theme-input-bg flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-red-500 text-xs font-black uppercase tracking-widest mb-3 font-mono">
                  <DollarSign size={14} /> Missing Financials
                </div>
                <div className="text-3xl font-mono tabular-nums font-black text-theme-text-primary">{missingCosts.length}</div>
                <div className="text-theme-text-secondary text-xs font-bold uppercase mt-1 font-mono">Transactions missing cost data</div>
              </div>
              <div className="mt-4 pt-3 border-t border-theme-border">
                <span className="text-red-500 text-[10px] font-bold uppercase tracking-widest bg-red-500/15 border border-red-500/30 px-2 py-1 rounded font-mono">Estimated Value: Unknown</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Manager Action Items (Expanded View) */}
      {expanded && (
        <div className="bg-theme-modal-bg border border-theme-border rounded-2xl p-5 animate-in slide-in-from-top-2 shadow-lg">
          <h4 className="text-xs font-black text-theme-text-secondary uppercase tracking-[0.2em] mb-4 font-mono">Manager Action Items</h4>
          
          <div className="space-y-6">
            {negativeBalances.length > 0 && (
              <div>
                <h5 className="text-amber-500 text-[11px] font-bold uppercase tracking-wider mb-2 border-b border-theme-border pb-2 font-mono">Negative Balances</h5>
                <div className="space-y-2">
                  {negativeBalances.map((nb, i) => (
                    <div key={i} className="flex items-center justify-between bg-theme-input-bg p-3 rounded-xl border border-theme-border">
                      <div>
                        <div className="text-sm font-bold text-theme-text-primary">{nb.spec.label}</div>
                        <div className="text-xs text-theme-text-secondary font-mono">Color: {nb.color} | Current Ledger: <span className="text-red-500 font-mono tabular-nums font-bold">{nb.closing} pcs</span></div>
                      </div>
                      <Button size="sm" variant="secondary" className="text-xs min-h-[38px]" onClick={() => setFixingSpec({
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
                <h5 className="text-red-500 text-[11px] font-bold uppercase tracking-wider mb-2 border-b border-theme-border pb-2 font-mono">Missing Transaction Costs</h5>
                <div className="space-y-2">
                  {missingCosts.map((mc, i) => (
                    <div key={i} className="flex items-center justify-between bg-theme-input-bg p-3 rounded-xl border border-theme-border">
                      <div>
                        <div className="text-sm font-bold text-theme-text-primary">Tx: {mc.id.slice(0,8)} ({mc.movementType})</div>
                        <div className="text-xs text-theme-text-secondary">Missing $/ct input. COGS is understated.</div>
                      </div>
                      <div className="text-[10px] font-mono bg-red-500/15 border border-red-500/30 px-2 py-1 rounded text-red-500 font-bold uppercase">Value: Unknown</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherWarnings.length > 0 && (
              <div>
                <h5 className="text-theme-text-secondary text-[11px] font-bold uppercase tracking-wider mb-2 border-b border-theme-border pb-2 font-mono">Other Audit Warnings</h5>
                <ul className="list-disc list-inside space-y-1">
                  {otherWarnings.map((w, i) => (
                    <li key={i} className="text-xs text-theme-text-secondary font-mono">{w}</li>
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
