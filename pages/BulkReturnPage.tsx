
import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { InventoryMovementType, DiamondSpec, User, Role, InventoryMovement } from '../types';
import { Card, Button, Input, SetterAvatar } from '../components/UI';
import { FastEntryGrid } from '../components/FastEntryGrid';
import { Layers, ArrowDownLeft, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { useToast } from '../App';
import { useNavigate } from 'react-router-dom';

const BulkReturnPage: React.FC = () => {
  const showToast = useToast();
  const navigate = useNavigate();
  const [specs] = useState<DiamondSpec[]>(store.getSpecs());
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  
  // UI Tab
  const [activeTab, setActiveTab] = useState<'intake' | 'reconcile'>('intake');

  // Intake Form State
  const [lines, setLines] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Reconciliation State
  const [recentIntakes, setRecentIntakes] = useState<InventoryMovement[]>([]);

  useEffect(() => {
    const sync = () => {
        setTeamMembers(store.getUsers().filter(u => 
            (u.role === Role.SETTER || u.role === Role.JEWELLER) && 
            u.active
        ));
        const allMovements = store.getInventoryMovements();
        setRecentIntakes(allMovements.filter(m => m.type === InventoryMovementType.BULK_RETURN_INTAKE));
    };
    sync();
    return store.subscribe(sync);
  }, []);

  const handleSubmit = () => {
    const validLines = lines.filter(l => l.pcs > 0);
    if (validLines.length === 0) return alert("Please add at least one item.");

    store.createInventoryMovement({
      type: InventoryMovementType.BULK_RETURN_INTAKE,
      createdById: store.getCurrentUser()?.id || 'unknown',
      referenceSetterId: selectedSourceId,
      notes: notes || 'Bulk Return Intake',
      lines: validLines.map(l => ({
        specId: l.specId,
        pcs: l.pcs,
        ct: l.ct
      }))
    });

    showToast("Bulk Return Processed & Added to Stock");
    navigate('/inventory');
  };

  const handleLinkToProject = (movementId: string) => {
     // Mock functionality
     const movement = recentIntakes.find(m => m.id === movementId);
     if (movement) {
        movement.notes = (movement.notes || '') + ' [Reconciled]';
        store.updateInventoryMovement(movement);
        // setRecentIntakes updated via subscription
        showToast("Marked as Reconciled");
     }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-lux-gold text-lux-black p-2 rounded-xl shadow-glow">
          <Layers className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-lux-cream">Bulk Return Management</h1>
          <p className="text-zinc-500">Process and reconcile unassigned returns.</p>
        </div>
      </div>

      <div className="flex border-b border-zinc-800 mb-6">
         <button 
           onClick={() => setActiveTab('intake')}
           className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'intake' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
         >
           New Intake
         </button>
         <button 
           onClick={() => setActiveTab('reconcile')}
           className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'reconcile' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
         >
           Reconciliation Queue
         </button>
      </div>

      {activeTab === 'intake' && (
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
             <div>
               <label className="block text-sm font-medium text-zinc-500 mb-2">Source (Team Member)</label>
               <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                 {teamMembers.map(s => (
                   <button
                     key={s.id}
                     onClick={() => setSelectedSourceId(s.id === selectedSourceId ? '' : s.id)}
                     className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-left ${selectedSourceId === s.id ? 'bg-lux-gold/10 border-lux-gold text-lux-gold ring-1 ring-lux-gold' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                   >
                     <SetterAvatar name={s.name} color={s.setterColor} image={s.profilePhoto} size="sm" />
                     <div>
                        <div className="text-sm font-medium leading-none">{s.name}</div>
                        <div className="text-[9px] uppercase tracking-wide opacity-60 mt-0.5">{s.role}</div>
                     </div>
                   </button>
                 ))}
               </div>
             </div>
             <div>
               <Input label="Reference / Notes" placeholder="e.g. Mixed bag from week 42" value={notes} onChange={e => setNotes(e.target.value)} />
             </div>
          </div>

          <div className="mb-6">
             <label className="block text-sm font-medium text-zinc-500 mb-2">Return Items</label>
             <FastEntryGrid 
               specs={specs} 
               onLinesChange={setLines} 
             />
          </div>

          <div className="flex justify-end pt-4 border-t border-zinc-800">
             <Button onClick={handleSubmit} size="lg">
               <ArrowDownLeft className="w-4 h-4 mr-2" />
               Process Intake
             </Button>
          </div>
        </Card>
      )}

      {activeTab === 'reconcile' && (
         <div className="space-y-4">
            {recentIntakes.map(m => (
               <Card key={m.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-lux-cream">{m.notes}</span>
                      <span className="text-xs text-zinc-500">{new Date(m.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                       {m.referenceSetterId && (
                           <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
                               {store.getUser(m.referenceSetterId)?.name}
                           </span>
                       )}
                       <span>•</span>
                       <span>{m.lines.length} items</span>
                       <span>•</span>
                       <span>Total: {m.lines.reduce((acc, l) => acc + l.pcs, 0)} pcs</span>
                    </div>
                  </div>
                  {!m.notes?.includes('[Reconciled]') ? (
                    <Button size="sm" variant="secondary" onClick={() => handleLinkToProject(m.id)}>
                      <LinkIcon className="w-4 h-4 mr-2" /> Link to Project
                    </Button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-2 py-1 rounded">Reconciled</span>
                  )}
               </Card>
            ))}
            {recentIntakes.length === 0 && <p className="text-center text-zinc-600 py-8">No bulk returns found.</p>}
         </div>
      )}
    </div>
  );
};

export default BulkReturnPage;
