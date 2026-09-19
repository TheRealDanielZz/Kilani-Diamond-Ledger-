import React from 'react';
import { X, Sparkles, AlertTriangle, CheckCircle2, ChevronDown, Plus, Minus, PackageCheck, Info, ArrowRight, Gem } from 'lucide-react';
import { IssueRequest } from '../types';
import { Button, Input, ModalShell, ModalHeader } from './UI';
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
      <ModalShell isOpen={true} onClose={onClose} size="lg">
         <ModalHeader
            title="Issue Diamonds"
            subtitle="Diamond Allocation Sheet"
            icon={<PackageCheck size={20} />}
            badge={`Job #${jobNumber}`}
            onClose={onClose}
         />

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
                              className={`bg-theme-input-bg/70 border rounded-2xl p-4 transition-all space-y-3 relative shadow-md ${
                                 explanationRequired 
                                    ? 'border-red-500/50 ring-1 ring-red-500/25' 
                                    : 'border-theme-border hover:border-lux-gold/40'
                              }`}
                           >
                              {/* Remove Item Button */}
                              <button
                                 onClick={() => setEditedLines(prev => prev.map((item, idx) => idx === i ? { ...item, issuedPcs: 0 } : item))}
                                 className="absolute top-3 right-3 text-theme-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-theme-row-hover transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
                                 title="Clear issued quantity"
                                 aria-label="Clear issued quantity"
                              >
                                 <X size={16} />
                              </button>

                              {/* Item Header with Stone Avatar Thumbnail */}
                              <div className="flex items-start gap-3 pr-8">
                                 <div className="w-10 h-10 rounded-xl bg-lux-gold/10 border border-lux-gold/25 flex items-center justify-center text-lux-gold shrink-0">
                                    <Gem size={18} />
                                 </div>

                                 <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-lux-gold/15 text-lux-gold border border-lux-gold/25">
                                          ITEM #{i + 1}
                                       </span>
                                       {isChanged && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1 font-mono">
                                             <AlertTriangle size={10} /> Spec Modified
                                          </span>
                                       )}
                                    </div>

                                    {/* Custom Dropdown for Spec Selector */}
                                    <div className="relative">
                                       <select
                                          className="w-full bg-theme-modal-bg border border-theme-border rounded-xl py-2.5 pl-3 pr-8 text-sm font-semibold text-theme-text-primary focus:border-lux-gold focus:ring-1 focus:ring-lux-gold transition-all appearance-none cursor-pointer shadow-sm"
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
                                             <option key={s.id} value={s.id} className="bg-theme-modal-bg text-theme-text-primary">
                                                {s.label} ({s.availablePcs} pcs)
                                             </option>
                                          ))}
                                       </select>
                                       <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lux-gold pointer-events-none" />
                                    </div>
                                 </div>
                              </div>

                              {/* Visual Stock Availability Meter */}
                              <div className="bg-theme-modal-bg p-3 rounded-xl border border-theme-border space-y-1.5 shadow-sm">
                                 <div className="flex items-center justify-between text-xs">
                                    <span className="text-theme-text-secondary text-[11px]">Stock Status:</span>
                                    <div className="flex items-center gap-2">
                                       <span className="font-mono tabular-nums text-theme-text-primary font-bold">{available} pcs available</span>
                                       {isOutOfStock ? (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-red-500/20 text-red-500 border border-red-500/30">OUT</span>
                                       ) : isLowStock ? (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-500 border border-amber-500/30">LOW</span>
                                       ) : (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">IN STOCK</span>
                                       )}
                                    </div>
                                 </div>

                                 {/* Progress Bar */}
                                 <div className="w-full bg-theme-input-bg h-1.5 rounded-full overflow-hidden border border-theme-border/50">
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
                              <div className="bg-theme-modal-bg p-3 rounded-xl border border-theme-border flex items-center justify-between gap-3 shadow-sm flex-wrap sm:flex-nowrap">
                                 {/* Auto-fill Chip */}
                                 <button
                                    type="button"
                                    onClick={() => handleAutoFillRecommended(i, recommended)}
                                    className={`text-xs px-3.5 py-2 min-h-[44px] rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer ${
                                       isRecommendedActive
                                          ? 'bg-lux-gold/20 border-lux-gold text-lux-gold font-bold shadow-sm'
                                          : 'bg-theme-input-bg border-theme-border text-theme-text-secondary hover:border-lux-gold/50 hover:text-lux-gold'
                                    }`}
                                 >
                                    <Sparkles size={14} className="text-lux-gold shrink-0" />
                                    <span>Rec: <strong className="font-mono tabular-nums">{recommended} pcs</strong></span>
                                    {isRecommendedActive && <CheckCircle2 size={13} className="text-lux-gold ml-0.5 shrink-0" />}
                                 </button>

                                 {/* Counter Stepper with 44px Touch Targets */}
                                 <div className="flex items-center gap-2 bg-theme-input-bg p-1.5 rounded-xl border border-theme-border">
                                    <button
                                       type="button"
                                       onClick={() => handleStepQty(i, -1, available)}
                                       disabled={l.issuedPcs <= 0}
                                       aria-label="Decrease quantity"
                                       className="min-w-[44px] min-h-[44px] rounded-xl bg-lux-gold text-black font-black flex items-center justify-center hover:bg-lux-gold/90 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all touch-manipulation shadow-sm cursor-pointer"
                                    >
                                       <Minus size={16} />
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
                                       className="w-14 text-center bg-transparent font-mono tabular-nums text-lg font-black text-lux-gold focus:outline-none"
                                    />

                                    <button
                                       type="button"
                                       onClick={() => handleStepQty(i, 1, available)}
                                       disabled={l.issuedPcs >= available}
                                       aria-label="Increase quantity"
                                       className="min-w-[44px] min-h-[44px] rounded-xl bg-lux-gold text-black font-black flex items-center justify-center hover:bg-lux-gold/90 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all touch-manipulation shadow-sm cursor-pointer"
                                    >
                                       <Plus size={16} />
                                    </button>
                                 </div>
                              </div>

                              {/* Presets & Explanation Field */}
                              {isChanged && (
                                 <div className="space-y-1.5 pt-1">
                                    <label className="text-[11px] font-bold text-amber-500 flex items-center gap-1 uppercase tracking-wider font-mono">
                                       <Info size={12} /> Reason for Spec / Qty Deviation *
                                    </label>

                                    {/* Outlined Preset Tags */}
                                    <div className="flex flex-wrap gap-1.5">
                                       {['Substituted Spec', 'Partial Issue', 'Quality Check'].map(preset => (
                                          <button
                                             key={preset}
                                             type="button"
                                             onClick={() => handleApplyPresetExplanation(i, preset)}
                                             className="text-[10px] px-3 py-1.5 rounded-full bg-lux-gold/10 border border-lux-gold/30 text-lux-gold hover:bg-lux-gold/20 transition-all font-semibold font-mono cursor-pointer"
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
                                       className={`w-full bg-theme-modal-bg border rounded-xl p-3 text-xs text-theme-text-primary placeholder-theme-text-muted focus:ring-1 transition-all shadow-sm ${
                                          explanationRequired
                                             ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                                             : 'border-theme-border focus:border-lux-gold focus:ring-lux-gold'
                                       }`}
                                    />
                                 </div>
                              )}
                           </div>
                        );
                     })}
                  </div>

                  {/* Bag Number & Photo Section */}
                  <div className="bg-theme-input-bg/40 border border-theme-border rounded-2xl p-4 space-y-4 shadow-sm">
                     <Input
                        label="Assign Bag Number *"
                        value={bagNum}
                        onChange={e => setBagNum(e.target.value)}
                        placeholder="e.g. 1304"
                        className="font-mono tabular-nums text-lg text-center tracking-wider text-lux-gold font-black"
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
            <div className="p-4 border-t border-theme-border bg-theme-modal-bg/95 shrink-0 space-y-2 transition-colors">
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
                  className="w-full py-2.5 text-xs font-bold text-theme-text-muted hover:text-theme-text-primary transition-colors text-center cursor-pointer"
               >
                  Cancel Operation
               </button>
            </div>
      </ModalShell>
   );
};
