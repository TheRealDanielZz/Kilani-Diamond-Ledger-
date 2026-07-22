import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, AlertTriangle, CheckCircle2, ChevronDown, Plus, Minus, PackageCheck, Info } from 'lucide-react';
import { IssueRequest } from '../types';
import { Button, Input } from './UI';
import { ImageUpload } from './ImageUpload';

interface FulfillmentSpec {
   id: string;
   label: string;
   availablePcs: number;
}

interface EditedLine {
   sourceLineIndex: number;
   specId: string;
   requestedPcs: number;
   issuedPcs: number;
   explanation: string;
}

interface IssueDiamondsModalProps {
   fulfillReq: IssueRequest;
   jobNumber: string;
   editedLines: EditedLine[];
   setEditedLines: React.Dispatch<React.SetStateAction<EditedLine[]>>;
   fulfillmentSpecs: FulfillmentSpec[];
   previewLoading: boolean;
   bagNum: string;
   setBagNum: (val: string) => void;
   issuedPhoto?: string;
   setIssuedPhoto: (base64?: string) => void;
   setIssuedPhotoSource: (src?: 'Camera' | 'Device Gallery') => void;
   onClose: () => void;
   onConfirm: () => void;
   loading: boolean;
}

export const IssueDiamondsModal: React.FC<IssueDiamondsModalProps> = ({
   fulfillReq,
   jobNumber,
   editedLines,
   setEditedLines,
   fulfillmentSpecs,
   previewLoading,
   bagNum,
   setBagNum,
   issuedPhoto,
   setIssuedPhoto,
   setIssuedPhotoSource,
   onClose,
   onConfirm,
   loading
}) => {
   // Calculate overall validation state and identify reason if invalid
   const getValidationState = () => {
      if (previewLoading) return { isValid: false, reason: 'Loading availability...' };
      if (!bagNum.trim()) return { isValid: false, reason: 'Bag # Required' };
      
      const hasIssuedStones = editedLines.some(line => line.issuedPcs > 0);
      if (hasIssuedStones && !issuedPhoto) return { isValid: false, reason: 'Photo Required' };

      if (editedLines.length === 0) return { isValid: false, reason: 'No items' };

      for (let i = 0; i < editedLines.length; i++) {
         const el = editedLines[i];
         const orig = fulfillReq.lines[el.sourceLineIndex];
         const isChanged = orig ? (el.issuedPcs !== orig.requestedPcs || el.specId !== orig.specId) : true;
         if (isChanged && !el.explanation.trim()) {
            return { isValid: false, reason: `Explanation required for Item #${i + 1}` };
         }

         const spec = fulfillmentSpecs.find(s => s.id === el.specId);
         const available = spec?.availablePcs ?? 0;
         if (el.issuedPcs > available || el.issuedPcs < 0) {
            return { isValid: false, reason: `Item #${i + 1} exceeds stock` };
         }
      }

      return { isValid: true, reason: '' };
   };

   const validation = getValidationState();

   // Auto-fill recommended quantity for a line
   const handleAutoFillRecommended = (index: number, recommendedQty: number) => {
      setEditedLines(prev => prev.map((item, idx) => idx === index ? { ...item, issuedPcs: recommendedQty } : item));
   };

   // Change quantity using step buttons (+/-)
   const handleStepQty = (index: number, delta: number, maxAvailable: number) => {
      setEditedLines(prev => prev.map((item, idx) => {
         if (idx !== index) return item;
         const newQty = Math.max(0, Math.min(maxAvailable, item.issuedPcs + delta));
         return { ...item, issuedPcs: newQty };
      }));
   };

   // Apply quick explanation preset
   const handleApplyPresetExplanation = (index: number, presetText: string) => {
      setEditedLines(prev => prev.map((item, idx) => idx === index ? { ...item, explanation: presetText } : item));
   };

   return (
      <AnimatePresence>
         <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden">
            {/* Backdrop Click Close */}
            <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={onClose}
               className="absolute inset-0 bg-black/60"
            />

            {/* Responsive Container (Bottom Sheet on Mobile, Centered Modal on Desktop) */}
            <motion.div
               initial={{ y: '100%', opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: '100%', opacity: 0 }}
               transition={{ type: 'spring', damping: 28, stiffness: 350 }}
               className="relative z-10 w-full max-w-xl bg-zinc-950/95 border-t md:border border-white/10 md:rounded-3xl rounded-t-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] max-h-[92vh] flex flex-col overflow-hidden"
            >
               {/* Mobile Touch Drag Handle */}
               <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mt-2.5 mb-1 md:hidden shrink-0" />

               {/* Header Bar */}
               <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-zinc-900/60 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-2xl bg-lux-gold/10 border border-lux-gold/30 flex items-center justify-center text-lux-gold shadow-sm">
                        <PackageCheck size={20} />
                     </div>
                     <div>
                        <div className="flex items-center gap-2">
                           <h3 className="font-bold text-white text-base md:text-lg tracking-tight">Issue Diamonds</h3>
                           <span className="px-2 py-0.5 rounded-full bg-lux-gold/10 border border-lux-gold/30 font-mono font-extrabold text-xs text-lux-gold">
                              Job #{jobNumber}
                           </span>
                        </div>
                        <p className="text-xs text-zinc-400">Allocate diamond inventory to setter job</p>
                     </div>
                  </div>

                  <button
                     onClick={onClose}
                     className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all touch-manipulation active:scale-95"
                     aria-label="Close modal"
                  >
                     <X size={18} />
                  </button>
               </div>

               {/* Scrollable Content Body */}
               <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
                  {/* Line Items List */}
                  <div className="space-y-3">
                     <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400 px-1">
                        <span>Diamond Items ({editedLines.length})</span>
                        {previewLoading && (
                           <span className="text-lux-gold flex items-center gap-1.5 lowercase font-normal">
                              <span className="w-2 h-2 rounded-full bg-lux-gold animate-ping" /> Checking stock...
                           </span>
                        )}
                     </div>

                     {editedLines.map((l, i) => {
                        const spec = fulfillmentSpecs.find(s => s.id === l.specId);
                        const available = spec?.availablePcs ?? 0;
                        const isLowStock = available > 0 && available < l.requestedPcs;
                        const isOutOfStock = available <= 0;
                        const recommended = Math.min(l.requestedPcs, available);
                        const originalReqLine = fulfillReq.lines[l.sourceLineIndex];
                        const isChanged = originalReqLine
                           ? (l.issuedPcs !== originalReqLine.requestedPcs || l.specId !== originalReqLine.specId)
                           : true;
                        const explanationRequired = isChanged && !l.explanation.trim();
                        const isRecommendedActive = l.issuedPcs === recommended && recommended > 0;

                        return (
                           <div
                              key={i}
                              className={`bg-zinc-900/70 border rounded-2xl p-4 transition-all space-y-3 relative ${
                                 explanationRequired 
                                    ? 'border-red-500/40 ring-1 ring-red-500/20' 
                                    : 'border-white/10 hover:border-white/20'
                              }`}
                           >
                              {/* Remove Item Button */}
                              <button
                                 onClick={() => setEditedLines(prev => prev.map((item, idx) => idx === i ? { ...item, issuedPcs: 0 } : item))}
                                 className="absolute top-3 right-3 text-zinc-500 hover:text-red-400 p-1 rounded-lg hover:bg-white/5 transition-colors"
                                 title="Clear issued quantity"
                              >
                                 <X size={16} />
                              </button>

                              {/* Top Bar: Line Index + Custom Spec Selector */}
                              <div className="space-y-1 pr-6">
                                 <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-lux-gold/15 text-lux-gold border border-lux-gold/20">
                                       ITEM #{i + 1}
                                    </span>
                                    {isChanged && (
                                       <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                          <AlertTriangle size={10} /> Deviation
                                       </span>
                                    )}
                                 </div>

                                 {/* Custom Luxury Spec Dropdown */}
                                 <div className="relative mt-1">
                                    <select
                                       className="w-full bg-zinc-950 border border-white/15 rounded-xl py-2.5 pl-3 pr-10 text-sm font-semibold text-white focus:border-lux-gold focus:ring-1 focus:ring-lux-gold transition-all appearance-none cursor-pointer"
                                       value={l.specId}
                                       onChange={e => {
                                          const newSpecId = e.target.value;
                                          const newSpec = fulfillmentSpecs.find(s => s.id === newSpecId);
                                          const newAvailable = newSpec?.availablePcs ?? 0;
                                          setEditedLines(prev => prev.map((item, idx) => idx === i ? {
                                             ...item,
                                             specId: newSpecId,
                                             issuedPcs: Math.min(item.requestedPcs, newAvailable)
                                          } : item));
                                       }}
                                    >
                                       {fulfillmentSpecs.map(s => (
                                          <option key={s.id} value={s.id} className="bg-zinc-900 text-white">
                                             {s.label} ({s.availablePcs} available)
                                          </option>
                                       ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-lux-gold pointer-events-none" />
                                 </div>
                              </div>

                              {/* Metrics & Stock Indicator Row */}
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                 <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                                    <span className="text-zinc-400 text-[11px] font-medium">Requested:</span>
                                    <span className="font-mono text-lux-cream font-bold text-sm">{l.requestedPcs} pcs</span>
                                 </div>

                                 <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                                    <span className="text-zinc-400 text-[11px] font-medium">Stock:</span>
                                    <div className="flex items-center gap-1.5">
                                       <span className="font-mono text-white font-bold text-sm">{available} pcs</span>
                                       {isOutOfStock ? (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                                             OUT
                                          </span>
                                       ) : isLowStock ? (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                             LOW
                                          </span>
                                       ) : (
                                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" title="In Stock" />
                                       )}
                                    </div>
                                 </div>
                              </div>

                              {/* Quantity Ergonomic Control Row */}
                              <div className="bg-zinc-950/80 p-3 rounded-xl border border-white/10 space-y-2.5">
                                 <div className="flex items-center justify-between gap-2">
                                    {/* Auto-fill Chip */}
                                    <button
                                       type="button"
                                       onClick={() => handleAutoFillRecommended(i, recommended)}
                                       className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation ${
                                          isRecommendedActive
                                             ? 'bg-lux-gold/20 border-lux-gold text-lux-gold font-bold shadow-sm'
                                             : 'bg-white/5 border-white/10 text-zinc-300 hover:border-lux-gold/50 hover:text-lux-gold'
                                       }`}
                                    >
                                       <Sparkles size={13} className="text-lux-gold" />
                                       <span>Rec: <strong>{recommended} pcs</strong></span>
                                       {isRecommendedActive && <CheckCircle2 size={12} className="text-lux-gold ml-0.5" />}
                                    </button>

                                    {/* Qty Touch Stepper Control */}
                                    <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/10">
                                       <button
                                          type="button"
                                          onClick={() => handleStepQty(i, -1, available)}
                                          disabled={l.issuedPcs <= 0}
                                          className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/10 text-white flex items-center justify-center hover:bg-zinc-700 active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all touch-manipulation"
                                       >
                                          <Minus size={14} />
                                       </button>

                                       <input
                                          type="number"
                                          min="0"
                                          max={available}
                                          value={l.issuedPcs}
                                          onChange={e => {
                                             const val = parseInt(e.target.value) || 0;
                                             setEditedLines(prev => prev.map((item, idx) => idx === i ? {
                                                ...item,
                                                issuedPcs: Math.max(0, Math.min(val, available))
                                             } : item));
                                          }}
                                          className="w-14 text-center bg-transparent font-mono text-sm font-black text-lux-gold focus:outline-none"
                                       />

                                       <button
                                          type="button"
                                          onClick={() => handleStepQty(i, 1, available)}
                                          disabled={l.issuedPcs >= available}
                                          className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/10 text-white flex items-center justify-center hover:bg-zinc-700 active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all touch-manipulation"
                                       >
                                          <Plus size={14} />
                                       </button>
                                    </div>
                                 </div>
                              </div>

                              {/* Explanation Requirement Section */}
                              {isChanged && (
                                 <div className="space-y-1.5 pt-1">
                                    <div className="flex items-center justify-between">
                                       <label className="text-[11px] font-bold text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                                          <Info size={12} /> Reason for Spec / Qty Change *
                                       </label>
                                    </div>

                                    {/* Preset Reason Quick Buttons */}
                                    <div className="flex flex-wrap gap-1.5">
                                       {['Substituted Spec', 'Partial Allocation', 'Out of Stock'].map(preset => (
                                          <button
                                             key={preset}
                                             type="button"
                                             onClick={() => handleApplyPresetExplanation(i, preset)}
                                             className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition-all"
                                          >
                                             + {preset}
                                          </button>
                                       ))}
                                    </div>

                                    <input
                                       type="text"
                                       placeholder="Provide explanation..."
                                       value={l.explanation}
                                       onChange={e => setEditedLines(prev => prev.map((item, idx) => idx === i ? {
                                          ...item,
                                          explanation: e.target.value
                                       } : item))}
                                       className={`w-full bg-zinc-950 border rounded-xl p-2.5 text-xs text-white placeholder-zinc-500 focus:ring-1 transition-all ${
                                          explanationRequired
                                             ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                                             : 'border-white/10 focus:border-lux-gold focus:ring-lux-gold'
                                       }`}
                                    />
                                    {explanationRequired && (
                                       <p className="text-[10px] text-red-400 font-bold">Required because quantity or spec differs from original request.</p>
                                    )}
                                 </div>
                              )}
                           </div>
                        );
                     })}
                  </div>

                  {/* Bag Number & Photo Section */}
                  <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4 space-y-4">
                     <Input
                        label="Assign Bag Number *"
                        value={bagNum}
                        onChange={e => setBagNum(e.target.value)}
                        placeholder="e.g. 1304"
                        className="font-mono text-lg text-center tracking-wider text-lux-gold font-black"
                     />

                     <div>
                        <ImageUpload
                           label="Bag Photo *"
                           required
                           value={issuedPhoto}
                           onChange={(base64, src) => {
                              setIssuedPhoto(base64);
                              setIssuedPhotoSource(src);
                           }}
                        />
                     </div>
                  </div>
               </div>

               {/* Sticky Action Footer Dock */}
               <div className="p-4 border-t border-white/10 bg-zinc-900/90 backdrop-blur-md shrink-0 flex flex-col md:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-zinc-400 hidden md:block">
                     {validation.isValid ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                           <CheckCircle2 size={14} /> Ready to issue bag
                        </span>
                     ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                           <AlertTriangle size={14} /> {validation.reason}
                        </span>
                     )}
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto">
                     <Button
                        variant="secondary"
                        onClick={onClose}
                        className="flex-1 md:flex-none py-3 px-5 text-sm"
                     >
                        Cancel
                     </Button>

                     <Button
                        onClick={onConfirm}
                        loading={loading}
                        disabled={!validation.isValid}
                        className={`flex-1 md:flex-none py-3 px-7 text-sm font-bold shadow-lg transition-all ${
                           validation.isValid 
                              ? 'shadow-lux-gold/20 hover:shadow-lux-gold/40 ring-1 ring-lux-gold/50' 
                              : 'opacity-50 cursor-not-allowed'
                        }`}
                     >
                        {validation.isValid ? 'Confirm Issue' : (validation.reason || 'Confirm Issue')}
                     </Button>
                  </div>
               </div>
            </motion.div>
         </div>
      </AnimatePresence>
   );
};
