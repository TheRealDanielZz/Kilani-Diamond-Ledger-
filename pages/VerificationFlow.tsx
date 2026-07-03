import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectTransaction, TransactionStatus, VerificationOutcome, DiamondSpec, TransactionVerificationLine, TransactionType } from '../types';
import { Card, Button, Input, Badge } from '../components/UI';
import { ArrowLeft, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useToast } from '../App';

interface Props {
  currentUser: any;
}

const VerificationFlow: React.FC<Props> = ({ currentUser }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  
  const [project, setProject] = useState<Project | undefined>();
  const [pendingTxs, setPendingTxs] = useState<ProjectTransaction[]>([]);
  const [activeTx, setActiveTx] = useState<ProjectTransaction | null>(null);
  
  // Verification State
  const [counts, setCounts] = useState<Record<string, { pcs: number; ct: number }>>({});
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [specs, setSpecs] = useState<DiamondSpec[]>([]);
  const [currentStock, setCurrentStock] = useState<any[]>([]);

  useEffect(() => {
    if (projectId) {
      setProject(store.getProject(projectId));
      setSpecs(store.getSpecs());
      setCurrentStock(store.getInventorySummary());
      const txs = store.getTransactions(projectId).filter(t => t.status === TransactionStatus.SUBMITTED);
      setPendingTxs(txs);
      if (txs.length > 0) selectTx(txs[0]);
    }
  }, [projectId]);

  const selectTx = (tx: ProjectTransaction) => {
    setActiveTx(tx);
    const initialCounts: Record<string, { pcs: number; ct: number }> = {};
    tx.lines.forEach(line => {
      initialCounts[line.specId] = { pcs: 0, ct: 0 };
    });
    setCounts(initialCounts);
    setDiscrepancyReason('');
  };

  const validateStockForIssue = (lines: {specId: string, pcs: number}[]) => {
    if (!activeTx || activeTx.type !== TransactionType.ISSUE) return true;
    for (const line of lines) {
      const stock = currentStock.find(s => s.spec.id === line.specId);
      const available = stock ? stock.pcs : 0;
      if (available < line.pcs) {
        return confirm(`Warning: Issuing ${line.pcs} of this spec will drive stock negative (Available: ${available}). Proceed anyway?`);
      }
    }
    return true;
  };

  const handleVerify = (confirmed: boolean) => {
    if (!activeTx || !currentUser) return;
    
    // Logic for confirmed vs manual counts...
    // If confirmed, assume counts matches activeTx lines
    let finalCounts = counts;
    if (confirmed) {
       const c: any = {};
       activeTx.lines.forEach(l => c[l.specId] = {pcs: l.qtyPcs, ct: l.qtyCt});
       finalCounts = c;
    }

    const linesToCheck = activeTx.lines.map(l => ({specId: l.specId, pcs: finalCounts[l.specId]?.pcs || 0}));
    if (!validateStockForIssue(linesToCheck)) return;

    // Check Discrepancy
    let hasDiff = false;
    if (!confirmed) {
       activeTx.lines.forEach(l => {
         if ((finalCounts[l.specId]?.pcs || 0) !== l.qtyPcs) hasDiff = true;
       });
    }

    if (hasDiff && !discrepancyReason) {
       alert("Please enter a reason for the count correction.");
       return;
    }

    const verificationLines: TransactionVerificationLine[] = activeTx.lines.map(line => ({
        specId: line.specId,
        countedPcs: finalCounts[line.specId]?.pcs || 0,
        countedCt: finalCounts[line.specId]?.ct || 0
    }));

    store.verifyTransaction(activeTx.id, {
      transactionId: activeTx.id,
      managerId: currentUser.id,
      verifiedAt: new Date().toISOString(),
      outcome: hasDiff ? VerificationOutcome.CORRECTED : VerificationOutcome.CONFIRMED,
      reason: hasDiff ? discrepancyReason : undefined,
      lines: verificationLines
    });

    showToast(`Verified & Posted`);
    navigate('/');
  };

  // Helper
  const hasDiffs = activeTx ? activeTx.lines.some(l => (counts[l.specId]?.pcs ?? 0) !== l.qtyPcs) : false;
  const reportedLabel = activeTx?.type === TransactionType.ISSUE ? 'Requested' : 'Reported';
  
  if (!project) return <div>Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 h-[calc(100vh-60px)] flex flex-col">
      <div className="flex items-center gap-4 mb-6">
         <button onClick={() => navigate(-1)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors">
            <ArrowLeft size={18} />
         </button>
         <div>
            <h1 className="text-xl font-bold text-lux-cream">{activeTx?.type === 'ISSUE' ? 'Verify Request' : 'Verify Return'}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
               <span className="font-mono bg-theme-input-bg border border-theme-border px-2 py-0.5 rounded-full text-zinc-400">{project.code}</span>
               <span>•</span>
               <span>{store.getUser(activeTx?.createdById || '')?.name}</span>
            </div>
         </div>
      </div>

      <div className="flex-1 flex gap-8 overflow-hidden">
        {/* Main Verification Table */}
        <div className="flex-1 flex flex-col bg-lux-surface rounded-3xl border border-lux-border shadow-sm overflow-hidden">
           
           {/* Header */}
           <div className="grid grid-cols-12 bg-theme-table-header border-b border-lux-border text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              <div className="col-span-5 p-4">Item Spec</div>
              <div className="col-span-3 p-4 text-center border-l border-theme-border">{reportedLabel}</div>
              <div className="col-span-4 p-4 text-center border-l border-theme-border bg-zinc-800/30">Verified Count</div>
           </div>

           {/* Scrollable Body */}
           <div className="flex-1 overflow-y-auto">
             {activeTx?.lines.map((line) => {
               const spec = specs.find(s => s.id === line.specId);
               const count = counts[line.specId] || {pcs: 0, ct: 0};
               const diff = count.pcs - line.qtyPcs;
               const isDiff = diff !== 0;

               return (
                 <div key={line.specId} className={`grid grid-cols-12 border-b border-theme-border items-center hover:bg-zinc-900/30 transition-colors ${isDiff ? 'bg-amber-900/10' : ''}`}>
                    <div className="col-span-5 p-4">
                       <div className="font-medium text-lux-cream text-sm">{spec?.label}</div>
                       <div className="text-xs text-zinc-500 font-mono">{spec?.sizeMm}mm • {spec?.shape}</div>
                    </div>
                    
                    <div className="col-span-3 p-4 text-center border-l border-theme-border text-zinc-400 tabular-nums font-mono text-sm">
                       {line.qtyPcs} <span className="text-[10px] text-zinc-600">pcs</span>
                    </div>

                    <div className="col-span-4 p-3 border-l border-theme-border flex justify-center bg-zinc-900/20">
                       <div className="flex items-center gap-2">
                          <div className="relative">
                            <input 
                              type="number" 
                              className={`w-20 text-center font-mono font-medium text-sm rounded-xl border py-1.5 focus:ring-1 focus:ring-offset-1 focus:ring-offset-lux-black transition-all ${isDiff ? 'bg-amber-900/20 border-amber-800 text-amber-400 focus:ring-amber-700' : 'bg-lux-input border-lux-border text-lux-cream focus:ring-lux-gold'}`}
                              value={count.pcs}
                              onChange={(e) => {
                                 const val = parseInt(e.target.value) || 0;
                                 const newCt = spec ? parseFloat((val * spec.ctPerStone).toFixed(3)) : 0;
                                 setCounts(prev => ({...prev, [line.specId]: {pcs: val, ct: newCt}}));
                              }}
                              onFocus={(e) => e.target.select()}
                            />
                            {isDiff && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-lux-surface shadow-glow"></span>}
                          </div>
                          <span className="text-xs text-zinc-500 font-medium">pcs</span>
                       </div>
                    </div>
                 </div>
               );
             })}
           </div>

           {/* Footer / Summary */}
           <div className="bg-theme-table-header border-t border-lux-border p-4 flex justify-between items-center">
              <div className="text-xs text-zinc-500">
                 Total Lines: <span className="font-medium text-zinc-300">{activeTx?.lines.length}</span>
              </div>
              <div className="flex gap-3">
                 {!hasDiffs && (
                   <Button onClick={() => handleVerify(true)} icon={<CheckCircle2 size={16} />}>
                     Confirm as {reportedLabel}
                   </Button>
                 )}
                 {hasDiffs && (
                   <Button onClick={() => handleVerify(false)} variant="danger" icon={<AlertCircle size={16} />}>
                     Confirm with Changes
                   </Button>
                 )}
              </div>
           </div>
        </div>

        {/* Right Panel: Context & Reason */}
        <div className="w-[300px] space-y-4">
           {hasDiffs && (
             <Card className="p-4 border-amber-900/30 shadow-none">
                <h4 className="font-bold text-amber-500 text-xs uppercase tracking-wide mb-2 flex items-center gap-2">
                   <AlertCircle size={12} /> Correction Reason
                </h4>
                <textarea 
                  className="w-full text-sm bg-black/40 border-amber-800/50 rounded-xl p-3 text-lux-cream placeholder:text-zinc-600 focus:ring-amber-700 focus:border-amber-600"
                  rows={4}
                  placeholder="Why is the count different?"
                  value={discrepancyReason}
                  onChange={e => setDiscrepancyReason(e.target.value)}
                  autoFocus
                />
             </Card>
           )}

           <Card className="p-4">
             <h4 className="font-bold text-zinc-400 text-xs uppercase tracking-wide mb-3">Totals</h4>
             <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                   <span className="text-zinc-500">{reportedLabel} Pcs:</span>
                   <span className="font-mono text-zinc-300">{activeTx?.lines.reduce((acc,l) => acc+l.qtyPcs, 0)}</span>
                </div>
                <div className="flex justify-between">
                   <span className="text-zinc-500">Verified Pcs:</span>
                   <span className={`font-mono font-bold ${hasDiffs ? 'text-amber-500' : 'text-lux-cream'}`}>
                     {Object.values(counts).reduce((acc,c) => acc+c.pcs, 0)}
                   </span>
                </div>
             </div>
           </Card>
        </div>
      </div>
    </div>
  );
};

export default VerificationFlow;
