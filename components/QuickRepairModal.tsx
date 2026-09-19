import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { Priority, Project, RepairStatus, RepairType, Role, User } from '../types';
import { Button, Input, Textarea, FieldLabel, ModalShell, ModalHeader, SelectionChip } from './UI';
import { ImageUpload } from './ImageUpload';
import { useToast } from '../App';
import { Wrench, Sparkles, Clock, UserPlus } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSuccess?: () => void;
  onProjectCreated?: (project: Project) => void;
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

export const QuickRepairModal: React.FC<Props> = ({ isOpen, onClose, currentUser, onSuccess, onProjectCreated }) => {
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
        if (onProjectCreated) onProjectCreated(created);
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
    <ModalShell isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title="Quick Walk-In Repair"
        subtitle="Fast 10-second intake for Setters & Jewellers"
        icon={<Wrench size={20} />}
        badge="Walk-In"
        onClose={onClose}
      />

      {/* Scrollable Form Body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5 custom-scrollbar">
        {/* Piece Name (Mandatory) */}
        <Input
          label="Piece / Item Name"
          required
          autoFocus
          value={pieceName}
          onChange={e => setPieceName(e.target.value)}
          placeholder="e.g. 14K Diamond Cuban Chain, Solitaire Ring"
        />

        {/* Project Code (Mandatory & Auto-Formatted) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel required>Project Code</FieldLabel>
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
          <Input
            value={code}
            onChange={handleCodeChange}
            placeholder="e.g. REP-20260723-DIAMOND"
            className="border-lux-gold/30 text-lux-gold font-mono font-bold focus:border-lux-gold"
            required
          />
        </div>

        {/* Repair Category Selector Chips */}
        <div>
          <FieldLabel>Repair Type</FieldLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {CATEGORIES.map(cat => (
              <SelectionChip
                key={cat.type}
                selected={repairType === cat.type}
                onClick={() => handleCategorySelect(cat.type)}
                icon={<span className="text-sm">{cat.icon}</span>}
                label={cat.label}
              />
            ))}
          </div>
        </div>

        {/* Client Information (Optional) */}
        <div className="p-4 rounded-2xl bg-theme-input-bg/40 border border-theme-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-theme-text-primary uppercase tracking-widest flex items-center gap-1.5 font-mono">
              <UserPlus size={13} className="text-lux-gold" /> Client Information
            </span>
            <span className="text-[10px] text-theme-text-muted font-medium">Optional (Manager can edit later)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Client Name (Optional)"
            />
            <Input
              value={clientPhone}
              onChange={e => setClientPhone(e.target.value)}
              placeholder="Phone # (Optional)"
            />
          </div>
        </div>

        {/* Work Details & Photo Upload */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Textarea
            label="Work Details / Instructions"
            value={workDetails}
            onChange={e => setWorkDetails(e.target.value)}
            placeholder="Quick notes for setter or manager..."
            rows={3}
          />

          <div>
            <FieldLabel>Photo Snapshot (Optional)</FieldLabel>
            <ImageUpload
              value={beforeImage}
              onChange={url => setBeforeImage(url)}
              label="Take Photo"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-theme-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-theme-text-muted">
            <Clock className="w-4 h-4 text-lux-gold animate-pulse" />
            <span>Status: <strong className="text-lux-gold font-bold">Intake</strong></span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={loading}
              className="px-6 shadow-[0_0_25px_rgba(245,194,73,0.35)]"
            >
              Create Quick Repair
            </Button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
};
