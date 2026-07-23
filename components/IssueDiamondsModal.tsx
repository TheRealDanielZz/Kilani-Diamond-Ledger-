import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, AlertTriangle, CheckCircle2, ChevronDown, Plus, Minus, PackageCheck, Info, ArrowRight, Gem } from 'lucide-react';
import { IssueRequest } from '../types';
import { Button, Input } from './UI';
import { ImageUpload } from './ImageUpload';
import { useTheme } from './ThemeContext';

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
   const { theme } = useTheme();

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
   const totalIssuedCount = editedLines.filter(line => line.issuedPcs > 0).length;

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
               className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Responsive Container (Optimized for Light and Dark Modes) */}
            <motion.div
               initial={{ y: '100%', opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: '100%', opacity: 0 }}
               transition={{ type: 'spring', damping: 26, stiffness: 340 }}
               className="relative z-10 w-full max-w-xl bg-[#0b0b0d] [data-theme=light]:bg-white border-t md:border border-lux-gold/25 [data-theme=light]:border-lux-gold/40 md:rounded-3xl rounded-t-3xl shadow-[0_0_50px_rgba(245,194,73,0.12)] [data-theme=light]:shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-h-[92vh] flex flex-col overflow-hidden transition-colors"
            >
               {/* Mobile Touch Drag Handle */}
               <div className="w-12 h-1.5 rounded-full bg-lux-gold/40 mx-auto mt-3 mb-1 md:hidden shrink-0" />

               {/* Header Bar */}
               <div className="px-5 py-4 border-b border-white/10 [data-theme=light]:border-black/10 flex items-center justify-between shrink-0 bg-[#121217] [data-theme=light]:bg-[#f8f8fc] backdrop-blur-md transition-colors">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-2xl bg-lux-gold/15 border border-lux-gold/30 flex items-center justify-center text-lux-gold shadow-[0_0_15px_rgba(245,194,73,0.2)]">
                        <PackageCheck size={20} />
                     </div>
                     <div>
                        <div className="flex items-center gap-2">
                           <h3 className="font-bold text-white [data-theme=light]:text-zinc-900 text-base md:text-lg tracking-tight">Issue Diamonds</h3>
                           <span className="px-2.5 py-0.5 rounded-full bg-lux-gold/15 border border-lux-gold/35 font-mono font-black text-xs text-lux-gold shadow-sm">
                              Job #{jobNumber}
                           </span>
                        </div>
                        <p className="text-xs text-zinc-400 [data-theme=light]:text-zinc-600 font-medium">
                           {theme === 'light' ? 'Light Mode Allocation Sheet' : 'Option B Obsidian Dark Allocation Sheet'}
                        </p>
                     </div>
                  </div>

                  <button
                     onClick={onClose}
                     className="w-9 h-9 rounded-xl bg-white/5 [data-theme=light]:bg-black/5 border border-white/10 [data-theme=light]:border-black/10 flex items-center justify-center text-zinc-400 [data-theme=light]:text-zinc-600 hover:text-white [data-theme=light]:hover:text-zinc-900 hover:bg-white/10 [data-theme=light]:hover:bg-black/10 transition-all touch-manipulation active:scale-95"
                     aria-label="Close modal"
                  >
                     <X size={18} />
                  </button>
               </div>

               {/* Scrollable Content Body */}
               <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
                  {/* Line Items List */}
                  <div className="space-y-3">
                     <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-lux-gold/90 [data-theme=light]:text-amber-700 px-1">
                        <span>Allocation Items ({editedLines.length})</span>
                        {previewLoading && (
                           <span className="text-lux-gold [data-theme=light]:text-amber-700 flex items-center gap-1.5 lowercase font-normal">
                              <span className="w-2 h-2 rounded-full bg-lux-gold animate-ping" /> Synchronizing stock...
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
                        const stockRatio = Math.min(100, Math.round((available / Math.max(1, l.requestedPcs)) * 100));

                        return (
                           <div
                              key={i}
                              className={`bg-[#131317] [data-theme=light]:bg-[#f4f4f9] border rounded-2xl p-4 transition-all space-y-3 relative shadow-md ${
                                 explanationRequired 
                                    ? 'border-red-500/50 ring-1 ring-red-500/25' 
                                    : 'border-white/10 [data-theme=light]:border-black/10 hover:border-lux-gold/30 [data-theme=light]:hover:border-lux-gold/50'
                              }`}
                           >
                              {/* Remove Item Button */}
                              <button
                                 onClick={() => setEditedLines(prev => prev.map((item, idx) => idx === i ? { ...item, issuedPcs: 0 } : item))}
                                 className="absolute top-3 right-3 text-zinc-500 [data-theme=light]:text-zinc-400 hover:text-red-400 [data-theme=light]:hover:text-red-600 p-1 rounded-lg hover:bg-white/5 [data-theme=light]:hover:bg-black/5 transition-colors"
                                 title="Clear issued quantity"
                              >
                                 <X size={16} />
                              </button>

                              {/* Item Header with Stone Avatar Thumbnail */}
                              <div className="flex items-start gap-3 pr-6">
                                 <div className="w-10 h-10 rounded-xl bg-lux-gold/10 border border-lux-gold/25 flex items-center justify-center text-lux-gold shrink-0">
                                    <Gem size={18} />
                                 </div>

                                 <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-lux-gold/15 text-lux-gold border border-lux-gold/25">
                                          ITEM #{i + 1}
                                       </span>
                                       {isChanged && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 [data-theme=light]:text-amber-800 border border-amber-500/30 flex items-center gap-1">
                                             <AlertTriangle size={10} /> Spec Modified
                                          </span>
                                       )}
                                    </div>

                                    {/* Custom Dropdown for Spec Selector */}
                                    <div className="relative">
                                       <select
                                          className="w-full bg-[#0a0a0c] [data-theme=light]:bg-white border border-white/15 [data-theme=light]:border-black/15 rounded-xl py-2 pl-3 pr-8 text-sm font-semibold text-white [data-theme=light]:text-zinc-900 focus:border-lux-gold focus:ring-1 focus:ring-lux-gold transition-all appearance-none cursor-pointer shadow-sm"
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
                                             <option key={s.id} value={s.id} className="bg-zinc-900 [data-theme=light]:bg-white text-white [data-theme=light]:text-zinc-900">
                                                {s.label} ({s.availablePcs} pcs)
                                             </option>
                                          ))}
                                       </select>
                                       <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lux-gold pointer-events-none" />
                                    </div>
                                 </div>
                              </div>

                              {/* Visual Stock Availability Meter */}
                              <div className="bg-[#0a0a0c] [data-theme=light]:bg-white p-3 rounded-xl border border-white/5 [data-theme=light]:border-black/10 space-y-1.5 shadow-sm">
                                 <div className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-400 [data-theme=light]:text-zinc-600 text-[11px]">Stock Status:</span>
                                    <div className="flex items-center gap-2">
                                       <span className="font-mono text-white [data-theme=light]:text-zinc-900 font-bold">{available} pcs available</span>
                                       {isOutOfStock ? (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-red-500/20 text-red-400 [data-theme=light]:text-red-700 border border-red-500/30">OUT</span>
                                       ) : isLowStock ? (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-400 [data-theme=light]:text-amber-800 border border-amber-500/30">LOW</span>
                                       ) : (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-400 [data-theme=light]:text-emerald-800 border border-emerald-500/30">IN STOCK</span>
                                       )}
                                    </div>
                                 </div>

                                 {/* Progress Bar */}
                                 <div className="w-full bg-zinc-800 [data-theme=light]:bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                                    <div
                                       className={`h-full transition-all duration-500 ${
                                          isOutOfStock 
                                             ? 'bg-red-500' 
                                             : isLowStock 
                                             ? 'bg-amber-400' 
                                             : 'bg-gradient-to-r from-lux-gold to-amber-300 shadow-[0_0_8px_#F5C249]'
                                       }`}
                                       style={{ width: `${isOutOfStock ? 100 : stockRatio}%` }}
                                    />
                                 </div>
                              </div>

                              {/* Quantity Stepper & Quick-Fill Row */}
                              <div className="bg-[#0a0a0c] [data-theme=light]:bg-white p-3 rounded-xl border border-white/10 [data-theme=light]:border-black/10 flex items-center justify-between gap-3 shadow-sm">
                                 {/* Auto-fill Chip */}
                                 <button
                                    type="button"
                                    onClick={() => handleAutoFillRecommended(i, recommended)}
                                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation ${
                                       isRecommendedActive
                                          ? 'bg-lux-gold/20 border-lux-gold text-lux-gold [data-theme=light]:text-amber-800 font-bold shadow-sm'
                                          : 'bg-white/5 [data-theme=light]:bg-black/5 border-white/10 [data-theme=light]:border-black/10 text-zinc-300 [data-theme=light]:text-zinc-700 hover:border-lux-gold/50 hover:text-lux-gold'
                                    }`}
                                 >
                                    <Sparkles size={13} className="text-lux-gold" />
                                    <span>Rec: <strong>{recommended} pcs</strong></span>
                                    {isRecommendedActive && <CheckCircle2 size={12} className="text-lux-gold ml-0.5" />}
                                 </button>

                                 {/* Counter Stepper */}
                                 <div className="flex items-center gap-1.5 bg-zinc-900 [data-theme=light]:bg-zinc-100 p-1 rounded-xl border border-white/15 [data-theme=light]:border-black/10">
                                    <button
                                       type="button"
                                       onClick={() => handleStepQty(i, -1, available)}
                                       disabled={l.issuedPcs <= 0}
                                       className="w-8 h-8 rounded-lg bg-lux-gold text-black font-black flex items-center justify-center hover:bg-lux-gold/90 active:scale-90 disabled:opacity-20 disabled:pointer-events-none transition-all touch-manipulation shadow-sm"
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
                                       className="w-12 text-center bg-transparent font-mono text-base font-black text-lux-gold [data-theme=light]:text-amber-800 focus:outline-none"
                                    />

                                    <button
                                       type="button"
                                       onClick={() => handleStepQty(i, 1, available)}
                                       disabled={l.issuedPcs >= available}
                                       className="w-8 h-8 rounded-lg bg-lux-gold text-black font-black flex items-center justify-center hover:bg-lux-gold/90 active:scale-90 disabled:opacity-20 disabled:pointer-events-none transition-all touch-manipulation shadow-sm"
                                    >
                                       <Plus size={14} />
                                    </button>
                                 </div>
                              </div>

                              {/* Presets & Explanation Field */}
                              {isChanged && (
                                 <div className="space-y-1.5 pt-1">
                                    <label className="text-[11px] font-bold text-amber-400 [data-theme=light]:text-amber-700 flex items-center gap-1 uppercase tracking-wider">
                                       <Info size={12} /> Reason for Spec / Qty Deviation *
                                    </label>

                                    {/* Outlined Preset Tags */}
                                    <div className="flex flex-wrap gap-1.5">
                                       {['Substituted Spec', 'Partial Issue', 'Quality Check'].map(preset => (
                                          <button
                                             key={preset}
                                             type="button"
                                             onClick={() => handleApplyPresetExplanation(i, preset)}
                                             className="text-[10px] px-2.5 py-1 rounded-full bg-lux-gold/10 [data-theme=light]:bg-amber-500/10 border border-lux-gold/30 [data-theme=light]:border-amber-600/30 text-lux-gold [data-theme=light]:text-amber-800 hover:bg-lux-gold/20 [data-theme=light]:hover:bg-amber-500/20 transition-all font-semibold"
                                          >
                                             + {preset}
                                          </button>
                                       ))}
                                    </div>

                                    <input
                                       type="text"
                                       placeholder="Enter explanation..."
                                       value={l.explanation}
                                       onChange={e => setEditedLines(prev => prev.map((item, idx) => idx === i ? {
                                          ...item,
                                          explanation: e.target.value
                                       } : item))}
                                       className={`w-full bg-[#0a0a0c] [data-theme=light]:bg-white border rounded-xl p-2.5 text-xs text-white [data-theme=light]:text-zinc-900 placeholder-zinc-500 [data-theme=light]:placeholder-zinc-400 focus:ring-1 transition-all shadow-sm ${
                                          explanationRequired
                                             ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                                             : 'border-white/15 [data-theme=light]:border-black/15 focus:border-lux-gold focus:ring-lux-gold'
                                       }`}
                                    />
                                 </div>
                              )}
                           </div>
                        );
                     })}
                  </div>

                  {/* Bag Number & Photo Section */}
                  <div className="bg-[#131317] [data-theme=light]:bg-[#f4f4f9] border border-white/10 [data-theme=light]:border-black/10 rounded-2xl p-4 space-y-4 shadow-sm">
                     <Input
                        label="Assign Bag Number *"
                        value={bagNum}
                        onChange={e => setBagNum(e.target.value)}
                        placeholder="e.g. 1304"
                        className="font-mono text-lg text-center tracking-wider text-lux-gold [data-theme=light]:text-amber-800 font-black"
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

               {/* Floating CTA Action Bar */}
               <div className="p-4 border-t border-white/10 [data-theme=light]:border-black/10 bg-[#121217] [data-theme=light]:bg-[#f8f8fc] shrink-0 space-y-2 transition-colors">
                  <button
                     type="button"
                     onClick={onConfirm}
                     disabled={!validation.isValid || loading}
                     className="w-full py-4 px-6 rounded-2xl font-black text-black bg-gradient-to-r from-lux-gold via-amber-400 to-lux-gold hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none transition-all shadow-[0_10px_35px_rgba(245,194,73,0.25)] flex items-center justify-center gap-2 uppercase tracking-wider text-sm cursor-pointer"
                  >
                     <span>
                        {loading 
                           ? 'Processing Issue...' 
                           : validation.isValid 
                           ? `Confirm Issue (${totalIssuedCount} item${totalIssuedCount !== 1 ? 's' : ''})` 
                           : (validation.reason || 'Confirm Issue')}
                     </span>
                     <ArrowRight size={18} />
                  </button>

                  <button
                     type="button"
                     onClick={onClose}
                     className="w-full py-2.5 text-xs font-bold text-zinc-400 [data-theme=light]:text-zinc-600 hover:text-white [data-theme=light]:hover:text-zinc-900 transition-colors text-center cursor-pointer"
                  >
                     Cancel Operation
                  </button>
               </div>
            </motion.div>
         </div>
      </AnimatePresence>
   );
};
