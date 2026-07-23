import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { store } from '../services/store';
import { Priority, Project, RepairStatus, RepairType, Role, User } from '../types';
import { Button, Input } from './UI';
import { ImageUpload } from './ImageUpload';
import { useToast } from '../App';
import { useTheme } from './ThemeContext';
import { Wrench, X, Sparkles, Clock, Gem, CircleDot, UserPlus, FileText } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSuccess?: () => void;
}

interface CategoryOption {
  type: RepairType;
  label: string;
  slug: string;
  icon: string;
}

const CATEGORIES: CategoryOption[] = [
  { type: RepairType.DIAMOND_SETTING, label: 'Diamond Setting', slug: 'DIAMOND', icon: '💎' },
  { type: RepairType.RING_RESIZING, label: 'Ring Resizing', slug: 'RESIZE', icon: '💍' },
  { type: RepairType.BROKEN_PIECE, label: 'Broken / Solder', slug: 'BROKEN', icon: '🛠️' },
  { type: RepairType.WATCH, label: 'Watch Repair', slug: 'WATCH', icon: '⌚' },
  { type: RepairType.GENERAL, label: 'General Repair', slug: 'GENERAL', icon: '🔧' }
];

export const generateRepairCode = (type: RepairType): string => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const cat = CATEGORIES.find(c => c.type === type);
  const slug = cat ? cat.slug : 'GENERAL';

  return `REP-${dateStr}-${slug}`;
};

export const QuickRepairModal: React.FC<Props> = ({ isOpen, onClose, currentUser, onSuccess }) => {
  const showToast = useToast();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  // Form States
  const [pieceName, setPieceName] = useState('');
  const [repairType, setRepairType] = useState<RepairType>(RepairType.DIAMOND_SETTING);
  const [code, setCode] = useState('');
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [priority, setPriority] = useState<Priority>(Priority.NORMAL);
  const [workDetails, setWorkDetails] = useState('');
  const [beforeImage, setBeforeImage] = useState<string | undefined>(undefined);
  const [assignedSetterId, setAssignedSetterId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    
    // Reset state
    setPieceName('');
    setRepairType(RepairType.DIAMOND_SETTING);
    setCode(generateRepairCode(RepairType.DIAMOND_SETTING));
    setIsCodeManuallyEdited(false);
    setClientName('');
    setClientPhone('');
    setPriority(Priority.NORMAL);
    setWorkDetails('');
    setBeforeImage(undefined);
    setAssignedSetterId(currentUser.role === Role.SETTER || currentUser.role === Role.JEWELLER ? currentUser.id : '');
  }, [isOpen, currentUser]);

  const handleCategorySelect = (selectedType: RepairType) => {
    setRepairType(selectedType);
    if (!isCodeManuallyEdited) {
      setCode(generateRepairCode(selectedType));
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value);
    setIsCodeManuallyEdited(true);
  };

  const resetCodeAutoFormat = () => {
    setIsCodeManuallyEdited(false);
    setCode(generateRepairCode(repairType));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pieceName.trim()) {
      showToast('Piece / Item Name is required.');
      return;
    }
    if (!code.trim()) {
      showToast('Project Code is required.');
      return;
    }

    setLoading(true);
    try {
      const assigneeIds: string[] = [];
      if (assignedSetterId) assigneeIds.push(assignedSetterId);
      else if (currentUser.id) assigneeIds.push(currentUser.id);

      const projectPayload: Partial<Project> = {
        code: code.trim(),
        pieceName: pieceName.trim(),
        clientName: clientName.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        priority,
        isQuickRepair: true,
        workDetails: workDetails.trim() || undefined,
        repair: {
          type: repairType,
          status: RepairStatus.INTAKE,
          submittedDate: new Date().toISOString().split('T')[0],
          customName: pieceName.trim(),
          beforeImage,
          financials: {}
        }
      };

      const created = await store.createRepairProject(projectPayload, assigneeIds);

      if (created) {
        showToast(`Quick Repair ${created.code} created successfully!`);
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to create quick repair');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Container matching Kilani Obsidian & Gold Theme */}
          <motion.div
            initial={{ y: '100%', opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className="relative z-10 w-full max-w-xl bg-[#0b0b0d] [data-theme=light]:bg-white border-t md:border border-lux-gold/30 [data-theme=light]:border-lux-gold/40 md:rounded-[28px] rounded-t-[28px] shadow-[0_0_60px_rgba(245,194,73,0.15)] [data-theme=light]:shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-h-[92vh] flex flex-col overflow-hidden transition-colors"
          >
            {/* Mobile Drag Indicator */}
            <div className="w-12 h-1.5 rounded-full bg-lux-gold/40 mx-auto mt-3 mb-1 md:hidden shrink-0" />

            {/* Header Bar */}
            <div className="px-6 py-4.5 border-b border-white/10 [data-theme=light]:border-black/10 flex items-center justify-between shrink-0 bg-[#121217] [data-theme=light]:bg-[#f8f8fc] backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-lux-gold/15 border border-lux-gold/30 flex items-center justify-center text-lux-gold shadow-[0_0_15px_rgba(245,194,73,0.2)]">
                  <Wrench size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white [data-theme=light]:text-zinc-900 text-base md:text-lg tracking-tight">
                      Quick Walk-In Repair
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-lux-gold/15 border border-lux-gold/35 font-mono font-black text-xs text-lux-gold shadow-sm">
                      Walk-In
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 [data-theme=light]:text-zinc-600 font-medium mt-0.5">
                    Fast 10-second intake for Setters & Jewellers
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/5 [data-theme=light]:bg-black/5 border border-white/10 [data-theme=light]:border-black/10 flex items-center justify-center text-zinc-400 [data-theme=light]:text-zinc-600 hover:text-white [data-theme=light]:hover:text-zinc-900 hover:bg-white/10 transition-all active:scale-95"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5 custom-scrollbar">
              
              {/* Piece Name (Mandatory) */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 [data-theme=light]:text-zinc-600 uppercase tracking-widest mb-2">
                  Piece / Item Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={pieceName}
                  onChange={e => setPieceName(e.target.value)}
                  placeholder="e.g. 14K Diamond Cuban Chain, Solitaire Ring"
                  className="w-full bg-white/[0.04] [data-theme=light]:bg-zinc-100 border border-white/10 [data-theme=light]:border-zinc-300 text-white [data-theme=light]:text-zinc-900 focus:border-lux-gold text-sm py-3 px-4 rounded-2xl outline-none transition-all placeholder:text-zinc-600"
                  required
                  autoFocus
                />
              </div>

              {/* Project Code (Mandatory & Auto-Formatted) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-bold text-zinc-400 [data-theme=light]:text-zinc-600 uppercase tracking-widest">
                    Project Code <span className="text-rose-500">*</span>
                  </label>
                  {isCodeManuallyEdited ? (
                    <button
                      type="button"
                      onClick={resetCodeAutoFormat}
                      className="text-[11px] text-lux-gold hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Auto-Format (`REP-Date-Type`)
                    </button>
                  ) : (
                    <span className="text-[10px] bg-lux-gold/15 text-lux-gold border border-lux-gold/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                      Auto-Generated (Editable)
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="e.g. REP-20260723-DIAMOND"
                  className="w-full bg-white/[0.04] [data-theme=light]:bg-zinc-100 border border-lux-gold/30 text-lux-gold font-mono font-bold focus:border-lux-gold text-sm py-3 px-4 rounded-2xl outline-none transition-all"
                  required
                />
              </div>

              {/* Repair Category Selector Chips */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 [data-theme=light]:text-zinc-600 uppercase tracking-widest mb-2">
                  Repair Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {CATEGORIES.map(cat => {
                    const isSelected = repairType === cat.type;
                    return (
                      <button
                        key={cat.type}
                        type="button"
                        onClick={() => handleCategorySelect(cat.type)}
                        className={`flex items-center gap-2 px-3.5 py-3 rounded-2xl border text-xs font-bold transition-all active:scale-[0.97] ${
                          isSelected
                            ? 'bg-lux-gold/15 border-lux-gold text-lux-gold shadow-[0_0_15px_rgba(245,194,73,0.25)]'
                            : 'bg-white/[0.03] [data-theme=light]:bg-zinc-100 border-white/10 [data-theme=light]:border-zinc-200 text-zinc-400 [data-theme=light]:text-zinc-600 hover:border-lux-gold/40 hover:text-white'
                        }`}
                      >
                        <span className="text-sm">{cat.icon}</span>
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Client Information (Optional) */}
              <div className="p-4 rounded-2xl bg-white/[0.02] [data-theme=light]:bg-zinc-50 border border-white/10 [data-theme=light]:border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-300 [data-theme=light]:text-zinc-800 uppercase tracking-widest flex items-center gap-1.5">
                    <UserPlus size={13} className="text-lux-gold" /> Client Information
                  </span>
                  <span className="text-[10px] text-zinc-500 font-medium">Optional (Manager can edit later)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Client Name (Optional)"
                    className="bg-white/[0.04] [data-theme=light]:bg-white border border-white/10 [data-theme=light]:border-zinc-300 text-white [data-theme=light]:text-zinc-900 text-xs py-2.5 px-3 rounded-xl outline-none focus:border-lux-gold placeholder:text-zinc-600"
                  />
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    placeholder="Phone # (Optional)"
                    className="bg-white/[0.04] [data-theme=light]:bg-white border border-white/10 [data-theme=light]:border-zinc-300 text-white [data-theme=light]:text-zinc-900 text-xs py-2.5 px-3 rounded-xl outline-none focus:border-lux-gold placeholder:text-zinc-600"
                  />
                </div>
              </div>

              {/* Work Details & Photo Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 [data-theme=light]:text-zinc-600 uppercase tracking-widest mb-2">
                    Work Details / Instructions
                  </label>
                  <textarea
                    value={workDetails}
                    onChange={e => setWorkDetails(e.target.value)}
                    placeholder="Quick notes for setter or manager..."
                    rows={3}
                    className="w-full bg-white/[0.04] [data-theme=light]:bg-zinc-100 border border-white/10 [data-theme=light]:border-zinc-300 text-white [data-theme=light]:text-zinc-900 text-xs p-3 rounded-2xl focus:border-lux-gold outline-none resize-none placeholder:text-zinc-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 [data-theme=light]:text-zinc-600 uppercase tracking-widest mb-2">
                    Photo Snapshot (Optional)
                  </label>
                  <ImageUpload
                    value={beforeImage}
                    onChange={url => setBeforeImage(url)}
                    label="Take Photo"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-4 border-t border-white/10 [data-theme=light]:border-black/10 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Clock className="w-4 h-4 text-lux-gold animate-pulse" />
                  <span>Status: <strong className="text-lux-gold font-bold">Intake</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-lux-gold hover:bg-lux-gold/90 text-zinc-950 font-black px-6 py-3 rounded-2xl shadow-[0_0_25px_rgba(245,194,73,0.35)] hover:shadow-[0_0_35px_rgba(245,194,73,0.5)] transition-all active:scale-[0.98] text-xs uppercase tracking-wider disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Quick Repair'}
                  </button>
                </div>
              </div>

            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
