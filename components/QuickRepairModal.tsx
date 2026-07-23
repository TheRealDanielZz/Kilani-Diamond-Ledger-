import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { Priority, Project, RepairStatus, RepairType, Role, User } from '../types';
import { Button, Input } from './UI';
import { ImageUpload } from './ImageUpload';
import { useToast } from '../App';
import { Camera, Gem, Wrench, X, Sparkles, Clock } from 'lucide-react';

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
  { type: RepairType.BROKEN_PIECE, label: 'Broken Piece / Soldering', slug: 'BROKEN', icon: '🛠️' },
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#0f172a] text-slate-100 rounded-3xl border border-amber-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-amber-200">New Quick Repair Project</h2>
              <p className="text-xs text-slate-400">Fast walk-in intake for Setters & Jewellers</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* Piece Name (Mandatory) */}
          <div>
            <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wider mb-2">
              Piece / Item Name <span className="text-rose-500">*</span>
            </label>
            <Input
              value={pieceName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPieceName(e.target.value)}
              placeholder="e.g. 14K Gold Cuban Chain, Diamond Ring"
              className="w-full bg-slate-900/80 border-slate-700 text-white focus:border-amber-500 text-sm py-3 px-4 rounded-xl"
              required
              autoFocus
            />
          </div>

          {/* Project Code (Mandatory & Auto-Formatted) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wider">
                Project Code <span className="text-rose-500">*</span>
              </label>
              {isCodeManuallyEdited ? (
                <button
                  type="button"
                  onClick={resetCodeAutoFormat}
                  className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Auto-Format (`REP-Date-Type`)
                </button>
              ) : (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                  Auto-Generated (Editable)
                </span>
              )}
            </div>
            <Input
              value={code}
              onChange={handleCodeChange}
              placeholder="e.g. REP-20260723-DIAMOND"
              className="w-full bg-slate-900/80 border-amber-500/40 text-amber-100 font-mono focus:border-amber-500 text-sm py-3 px-4 rounded-xl"
              required
            />
          </div>

          {/* Repair Category Selector Chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Repair Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map(cat => {
                const isSelected = repairType === cat.type;
                return (
                  <button
                    key={cat.type}
                    type="button"
                    onClick={() => handleCategorySelect(cat.type)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-[0_0_12px_rgba(245,194,73,0.2)]'
                        : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Client Details (Optional) */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Client Information</span>
              <span className="text-[11px] text-slate-500">Optional (Manager can update later)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={clientName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientName(e.target.value)}
                placeholder="Client Name (Optional)"
                className="bg-slate-900 border-slate-800 text-slate-200 text-xs py-2.5 px-3 rounded-lg"
              />
              <Input
                value={clientPhone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientPhone(e.target.value)}
                placeholder="Phone # (Optional)"
                className="bg-slate-900 border-slate-800 text-slate-200 text-xs py-2.5 px-3 rounded-lg"
              />
            </div>
          </div>

          {/* Additional Notes & Image Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Work Details / Instructions
              </label>
              <textarea
                value={workDetails}
                onChange={e => setWorkDetails(e.target.value)}
                placeholder="Enter quick notes for setter or manager..."
                rows={3}
                className="w-full bg-slate-900/80 border border-slate-800 text-slate-200 text-xs p-3 rounded-xl focus:border-amber-500 focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Photo Snapshot (Optional)
              </label>
              <ImageUpload
                value={beforeImage}
                onChange={url => setBeforeImage(url)}
                label="Take Photo"
              />
            </div>
          </div>

          {/* Footer Submit Button */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Status: <strong className="text-amber-300">Intake</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 text-xs tracking-wide"
              >
                {loading ? 'Creating...' : 'Create Quick Repair'}
              </Button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
