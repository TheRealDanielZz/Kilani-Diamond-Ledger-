import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Priority, Project, RepairDetailsV2, RepairStatus, RepairType, Role, User } from '../types';
import { Badge, Button, Input, Select, Textarea, SectionTitle, ModalShell, SegmentedControl, SetterAvatar } from './UI';
import { ImageUpload } from './ImageUpload';
import { useToast } from '../App';
import { Camera, CheckCircle2, Coins, FileText, Gem, Info, Plus, Trash2, UserRound, Wrench, X } from 'lucide-react';

type Tab = 'intake' | 'details' | 'costs' | 'images' | 'review';
const CREATION_TABS: Tab[] = ['intake', 'details', 'review'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
}

const REPAIR_TYPES = [
  RepairType.DIAMOND_SETTING,
  RepairType.WATCH,
  RepairType.RING_RESIZING,
  RepairType.BROKEN_PIECE,
  RepairType.GENERAL
];

const REPAIR_STATUSES = [
  RepairStatus.INTAKE,
  RepairStatus.IN_PROGRESS,
  RepairStatus.WAITING_FOR_PARTS,
  RepairStatus.SENT_OUT,
  RepairStatus.RECEIVED_BACK,
  RepairStatus.READY_FOR_PICKUP,
  RepairStatus.COMPLETED,
  RepairStatus.CANCELLED
];

const NO_CHARGE_REASONS = ['Warranty', 'Goodwill', 'Internal Correction', 'VIP Client', 'Manager Approval', 'Other'];

const emptyRepair = (): RepairDetailsV2 => ({
  type: RepairType.DIAMOND_SETTING,
  status: RepairStatus.INTAKE,
  submittedDate: new Date().toISOString().split('T')[0],
  diamondItems: [{ stoneSize: '', quantity: 0 }],
  financials: {}
});

const moneyValue = (value?: number) => value === undefined || value === 0 ? '' : String(value);
const parseNumber = (value: string) => value === '' ? undefined : Math.max(0, Number(value) || 0);

export const RepairProjectModal: React.FC<Props> = ({ isOpen, onClose, currentUser }) => {
  const navigate = useNavigate();
  const showToast = useToast();
  const [tab, setTab] = useState<Tab>('intake');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [project, setProject] = useState<Partial<Project>>({
    code: '',
    pieceName: '',
    clientName: '',
    clientPhone: '',
    salesRepId: '',
    priority: Priority.NORMAL,
    dueDate: new Date().toISOString().split('T')[0],
    workDetails: ''
  });
  const [repair, setRepair] = useState<RepairDetailsV2>(emptyRepair());
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  const canUseFinancials = currentUser.role === Role.MANAGER || currentUser.role === Role.DESIGNER;
  const salesReps = users.filter(u => u.role === Role.SALES_REP && u.active);
  const staff = users.filter(u => [Role.SETTER, Role.JEWELLER, Role.DESIGNER].includes(u.role) && u.active);

  useEffect(() => {
    if (!isOpen) return;
    const sync = () => setUsers(store.getUsers());
    sync();
    return store.subscribe(sync);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setTab('intake');
    setProject({
      code: '',
      pieceName: '',
      clientName: '',
      clientPhone: '',
      salesRepId: '',
      priority: Priority.NORMAL,
      dueDate: new Date().toISOString().split('T')[0],
      workDetails: ''
    });
    setRepair(emptyRepair());
    setAssigneeIds(currentUser.role === Role.DESIGNER ? [currentUser.id] : []);
  }, [isOpen, currentUser.id, currentUser.role]);

  const repairCost = useMemo(() => {
    const f = repair.financials || {};
    const internal = Number(f.labourCostCad || 0) + Number(f.goldCostCad || 0) + Number(f.diamondCostCad || 0) + Number(f.outsourcedCostCad || 0) + Number(f.materialCostCad || 0);
    const charge = f.noCharge ? 0 : Number(f.clientChargeCad || 0);
    return { internal, charge, profit: charge - internal };
  }, [repair.financials]);

  const setFinancial = (key: keyof RepairDetailsV2['financials'], value: any) => {
    setRepair(prev => ({
      ...prev,
      financials: {
        ...(prev.financials || {}),
        [key]: value
      }
    }));
  };

  const updateDiamondItem = (index: number, key: 'stoneSize' | 'quantity', value: string) => {
    const items = [...(repair.diamondItems || [])];
    items[index] = {
      ...items[index],
      [key]: key === 'quantity' ? Math.max(0, parseInt(value) || 0) : value
    };
    const totalPieces = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    setRepair(prev => ({
      ...prev,
      diamondItems: items,
      financials: {
        ...(prev.financials || {}),
        diamondPieces: totalPieces
      }
    }));
  };

  const validate = () => {
    if (!project.code?.trim()) return 'Project code is required.';
    if (!project.pieceName?.trim()) return 'Piece name is required.';
    if (repair.type === RepairType.GENERAL && !repair.customName?.trim()) return 'Custom repair name is required.';
    if (repair.type === RepairType.RING_RESIZING && (!repair.sizeFrom?.trim() || !repair.sizeTo?.trim())) return 'Resize from and to are required.';
    if (repair.type === RepairType.BROKEN_PIECE && !repair.damageType?.trim()) return 'Damage type is required.';
    if (repair.type === RepairType.DIAMOND_SETTING && !(repair.diamondItems || []).some(item => item.stoneSize.trim() && item.quantity > 0)) return 'Add at least one diamond setting repair item.';
    return '';
  };

  const submit = async () => {
    const error = validate();
    if (error) {
      showToast(error);
      return;
    }

    setLoading(true);
    try {
      const finalAssignees = [...assigneeIds];
      if (project.salesRepId && !finalAssignees.includes(project.salesRepId)) finalAssignees.push(project.salesRepId);

      const legacyRepairDetails = repair.type === RepairType.DIAMOND_SETTING ? {
        date: repair.submittedDate,
        items: repair.diamondItems || [],
        totalQuantity: (repair.diamondItems || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
        report: repair.repairNotes || repair.issueNotes || ''
      } : undefined;

      const created = await store.createRepairProject({
        ...project,
        pieceName: project.pieceName || repair.customName || repair.type,
        repair,
        repairDetails: legacyRepairDetails
      }, finalAssignees);

      showToast('Repair Project Created');
      onClose();
      if (created) navigate(`/project/${created.id}`);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to create repair project');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderDetails = () => {
    if (repair.type === RepairType.DIAMOND_SETTING) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-theme-text-primary font-bold">Diamond Setting Repair</h3>
              <p className="text-xs text-zinc-500">Preserves the current stone size and quantity workflow.</p>
            </div>
            <Badge color="blue">{(repair.diamondItems || []).reduce((sum, item) => sum + item.quantity, 0)} pcs</Badge>
          </div>
          {(repair.diamondItems || []).map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_110px_44px] gap-3 items-end">
              <Input label={index === 0 ? 'Stone Size' : ''} placeholder="e.g. 1.5mm" value={item.stoneSize} onChange={e => updateDiamondItem(index, 'stoneSize', e.target.value)} />
              <Input label={index === 0 ? 'Qty' : ''} type="number" value={item.quantity ? String(item.quantity) : ''} onChange={e => updateDiamondItem(index, 'quantity', e.target.value)} />
              <button
                onClick={() => setRepair(prev => ({ ...prev, diamondItems: (prev.diamondItems || []).filter((_, i) => i !== index) }))}
                disabled={(repair.diamondItems || []).length === 1}
                className="h-12 rounded-2xl bg-red-500/10 text-red-400 disabled:opacity-30 flex items-center justify-center"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setRepair(prev => ({ ...prev, diamondItems: [...(prev.diamondItems || []), { stoneSize: '', quantity: 0 }] }))} icon={<Plus size={16} />}>Add Stone Size</Button>
        </div>
      );
    }

    if (repair.type === RepairType.WATCH) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Vendor Name" value={repair.vendorName || ''} onChange={e => setRepair({ ...repair, vendorName: e.target.value, outsourced: true })} placeholder="Outsource vendor" />
          <label className="flex items-center gap-3 bg-theme-input-bg rounded-2xl px-4 h-14 mt-5 border border-theme-border">
            <input type="checkbox" checked={!!repair.outsourced} onChange={e => setRepair({ ...repair, outsourced: e.target.checked })} />
            <span className="text-sm font-bold text-theme-text-primary">Outsourced repair</span>
          </label>
          <div className="sm:col-span-2">
            <Textarea label="Issue / Vendor Notes" value={repair.issueNotes || ''} onChange={e => setRepair({ ...repair, issueNotes: e.target.value })} placeholder="Describe watch issue, vendor instructions, promised timeline..." />
          </div>
        </div>
      );
    }

    if (repair.type === RepairType.RING_RESIZING) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Size From" value={repair.sizeFrom || ''} onChange={e => setRepair({ ...repair, sizeFrom: e.target.value })} placeholder="e.g. 6.5" />
          <Input label="Size To" value={repair.sizeTo || ''} onChange={e => setRepair({ ...repair, sizeTo: e.target.value })} placeholder="e.g. 7.25" />
          <div className="sm:col-span-2">
            <Textarea label="Resize Notes" value={repair.repairNotes || ''} onChange={e => setRepair({ ...repair, repairNotes: e.target.value })} placeholder="Gold added, shank condition, client request..." />
          </div>
        </div>
      );
    }

    if (repair.type === RepairType.BROKEN_PIECE) {
      return (
        <div className="space-y-4">
          <Input label="Damage Type" value={repair.damageType || ''} onChange={e => setRepair({ ...repair, damageType: e.target.value })} placeholder="e.g. broken chain, cracked bail, snapped prong" />
          <Textarea label="Repair Details" value={repair.repairNotes || ''} onChange={e => setRepair({ ...repair, repairNotes: e.target.value })} placeholder="Describe repair work and any material needed..." />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Input label="Custom Repair Name" value={repair.customName || ''} onChange={e => setRepair({ ...repair, customName: e.target.value })} placeholder="e.g. Bracelet hinge rebuild" />
        <Textarea label="Internal Repair Details" value={repair.internalNotes || ''} onChange={e => setRepair({ ...repair, internalNotes: e.target.value })} placeholder="Internal scope, risks, technical notes..." />
        <Textarea label="Customer Facing Notes" value={repair.customerNotes || ''} onChange={e => setRepair({ ...repair, customerNotes: e.target.value })} placeholder="Clean summary for client communication..." />
      </div>
    );
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} size="xl">
      <div className="px-5 sm:px-7 py-5 border-b border-theme-border flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-2xl bg-lux-gold text-black flex items-center justify-center">
              <Wrench size={18} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-theme-text-primary tracking-tight">Repair Project</h2>
          </div>
          <p className="text-xs text-theme-text-muted">Create a full repair workflow with reporting, costs, images, and status tracking.</p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-theme-input-bg border border-theme-border flex items-center justify-center text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-row-hover transition-all active:scale-95 shrink-0"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-5 sm:px-7 pt-5">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { label: 'Intake', value: 'intake' },
            { label: 'Details', value: 'details' },
            { label: 'Review', value: 'review' }
          ]}
        />
      </div>

      <div className="p-5 sm:px-7 overflow-y-auto custom-scrollbar flex-1">
        {tab === 'intake' && (
          <div className="space-y-7">
            <SectionTitle icon={<UserRound size={16} />} title="Client & Project" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Project Code" value={project.code || ''} onChange={e => setProject({ ...project, code: e.target.value })} placeholder="e.g. REP-2026-001" autoFocus />
              <Input label="Piece Name" value={project.pieceName || ''} onChange={e => setProject({ ...project, pieceName: e.target.value })} placeholder="e.g. Rolex bracelet repair" />
              <Input label="Client Name" value={project.clientName || ''} onChange={e => setProject({ ...project, clientName: e.target.value })} placeholder="Client" />
              <Input label="Client Phone (Optional)" value={project.clientPhone || ''} onChange={e => setProject({ ...project, clientPhone: e.target.value })} placeholder="Phone" />
              <Input label="Due Date" type="date" value={project.dueDate || ''} onChange={e => setProject({ ...project, dueDate: e.target.value })} />
              <Select label="Sales Rep" value={project.salesRepId || ''} onChange={e => setProject({ ...project, salesRepId: e.target.value })}>
                <option value="">Select rep...</option>
                {salesReps.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
              </Select>
            </div>

            <SectionTitle icon={<Wrench size={16} />} title="Repair Type" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {REPAIR_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => setRepair(prev => ({ ...prev, type }))}
                  className={`min-h-[88px] p-4 rounded-2xl text-left border transition-all ${repair.type === type ? 'bg-lux-gold text-black border-lux-gold shadow-glow' : 'bg-theme-input-bg border-theme-border text-theme-text-secondary hover:border-zinc-600'}`}
                >
                  <div className="text-sm font-black leading-tight">{type}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'details' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Repair Status" value={repair.status} onChange={e => setRepair({ ...repair, status: e.target.value as RepairStatus })}>
                {REPAIR_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </Select>
              <Input label="Submitted Date" type="date" value={repair.submittedDate} onChange={e => setRepair({ ...repair, submittedDate: e.target.value })} />
            </div>
            {renderDetails()}
            <Textarea label="Customer Facing Notes" value={repair.customerNotes || ''} onChange={e => setRepair({ ...repair, customerNotes: e.target.value })} placeholder="Optional client-facing summary..." />
          </div>
        )}

        {tab === 'costs' && (
          <div className="space-y-6">
            {!canUseFinancials && <p className="text-sm text-theme-text-muted">Financial fields are restricted.</p>}
            {canUseFinancials && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Input label="Labour Cost CAD" type="number" value={moneyValue(repair.financials.labourCostCad)} onChange={e => setFinancial('labourCostCad', parseNumber(e.target.value))} />
                  <Input label="Gold Used G" type="number" value={moneyValue(repair.financials.goldUsedG)} onChange={e => setFinancial('goldUsedG', parseNumber(e.target.value))} />
                  <Input label="Gold Cost CAD" type="number" value={moneyValue(repair.financials.goldCostCad)} onChange={e => setFinancial('goldCostCad', parseNumber(e.target.value))} />
                  <Input label="Diamond Pieces" type="number" value={moneyValue(repair.financials.diamondPieces)} onChange={e => setFinancial('diamondPieces', parseNumber(e.target.value))} />
                  <Input label="Diamond Carats" type="number" value={moneyValue(repair.financials.diamondCarats)} onChange={e => setFinancial('diamondCarats', parseNumber(e.target.value))} />
                  <Input label="Diamond Cost CAD" type="number" value={moneyValue(repair.financials.diamondCostCad)} onChange={e => setFinancial('diamondCostCad', parseNumber(e.target.value))} />
                  <Input label="Outsourced Cost CAD" type="number" value={moneyValue(repair.financials.outsourcedCostCad)} onChange={e => setFinancial('outsourcedCostCad', parseNumber(e.target.value))} />
                  <Input label="Material Cost CAD" type="number" value={moneyValue(repair.financials.materialCostCad)} onChange={e => setFinancial('materialCostCad', parseNumber(e.target.value))} />
                  <Input label="Client Charge CAD" type="number" value={moneyValue(repair.financials.clientChargeCad)} onChange={e => setFinancial('clientChargeCad', parseNumber(e.target.value))} disabled={!!repair.financials.noCharge} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
                  <label className="flex items-center gap-3 bg-theme-input-bg rounded-2xl px-4 h-14 border border-theme-border">
                    <input type="checkbox" checked={!!repair.financials.noCharge} onChange={e => setRepair(prev => ({ ...prev, financials: { ...prev.financials, noCharge: e.target.checked, clientChargeCad: e.target.checked ? 0 : prev.financials.clientChargeCad } }))} />
                    <span className="text-sm font-bold text-theme-text-primary">No charge repair</span>
                  </label>
                  <Select label="No Charge Reason" value={repair.financials.noChargeReason || ''} onChange={e => setFinancial('noChargeReason', e.target.value)}>
                    <option value="">Suggested reason...</option>
                    {NO_CHARGE_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Metric label="Internal Cost" value={`$${repairCost.internal.toFixed(2)}`} />
                  <Metric label="Client Charge" value={`$${repairCost.charge.toFixed(2)}`} />
                  <Metric label="Profit / Loss" value={`$${repairCost.profit.toFixed(2)}`} tone={repairCost.profit < 0 ? 'red' : 'gold'} />
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'images' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ImageUpload label="Before Image" value={repair.beforeImage} onChange={value => setRepair({ ...repair, beforeImage: value })} />
            <ImageUpload label="After Image" value={repair.afterImage} onChange={value => setRepair({ ...repair, afterImage: value })} />
          </div>
        )}

        {tab === 'review' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ReviewBlock icon={<Info size={16} />} title="Project" rows={[
                ['Code', project.code || '-'],
                ['Piece', project.pieceName || '-'],
                ['Client', project.clientName || '-'],
                ['Sales Rep', salesReps.find(rep => rep.id === project.salesRepId)?.name || '-']
              ]} />
              <ReviewBlock icon={<Wrench size={16} />} title="Repair" rows={[
                ['Type', repair.type],
                ['Status', repair.status],
                ['Submitted', repair.submittedDate],
                ['Outsourced', repair.outsourced ? 'Yes' : 'No']
              ]} />
              <ReviewBlock icon={<Coins size={16} />} title="After Intake" rows={[
                ['Costs', 'Manager / Designer can add after creation'],
                ['Images', 'Before and after images can be uploaded later'],
                ['Closeout', 'Move to Ready for Pickup, then confirm pickup'],
                ['Client Phone', project.clientPhone ? project.clientPhone : 'Optional']
              ]} />
              <div className="bg-theme-input-bg border border-theme-border rounded-2xl p-5">
                <div className="flex items-center gap-2 text-lux-gold mb-4"><UserRound size={16} /><h3 className="text-xs font-bold text-theme-text-primary uppercase tracking-widest font-mono">Assigned Staff</h3></div>
                <div className="flex flex-wrap gap-2">
                  {assigneeIds.length === 0 ? <span className="text-sm text-theme-text-muted">Unassigned</span> : assigneeIds.map(id => {
                    const user = users.find(u => u.id === id);
                    return user ? <Badge key={id} color="blue">{user.name}</Badge> : null;
                  })}
                </div>
              </div>
            </div>

            <SectionTitle icon={<UserRound size={16} />} title="Assign Team" />
            <div className="flex flex-wrap gap-2">
              {staff.map(user => (
                <button
                  key={user.id}
                  onClick={() => setAssigneeIds(prev => prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${assigneeIds.includes(user.id) ? 'bg-lux-gold/10 border-lux-gold text-lux-gold' : 'bg-theme-input-bg border-theme-border text-theme-text-muted hover:bg-theme-modal-bg'}`}
                >
                  <SetterAvatar name={user.name} color={user.setterColor} image={user.profilePhoto} size="sm" />
                  <span className="text-xs font-bold">{user.name}</span>
                  <Badge color={user.role === Role.DESIGNER ? 'blue' : 'gray'}>{user.role}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 sm:px-7 py-5 border-t border-theme-border bg-theme-modal-bg/95 flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-2 overflow-x-auto items-center">
          {CREATION_TABS.map(item => (
            <button key={item} onClick={() => setTab(item)} className={`w-2.5 h-2.5 rounded-full shrink-0 ${tab === item ? 'bg-lux-gold' : 'bg-theme-border'}`} aria-label={item} />
          ))}
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {tab !== 'review' ? (
            <Button onClick={() => setTab(CREATION_TABS[CREATION_TABS.indexOf(tab) + 1])}>Next</Button>
          ) : (
            <Button onClick={submit} loading={loading} icon={<CheckCircle2 size={16} />}>Create Repair</Button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

const Metric: React.FC<{ label: string; value: string; tone?: 'gold' | 'red' }> = ({ label, value, tone = 'gold' }) => (
  <div className="bg-theme-input-bg border border-theme-border rounded-2xl p-4">
    <div className="text-[10px] text-theme-text-muted uppercase font-bold tracking-widest mb-1 font-mono">{label}</div>
    <div className={`text-2xl font-mono font-bold ${tone === 'red' ? 'text-red-400' : 'text-lux-gold'}`}>{value}</div>
  </div>
);

const ReviewBlock: React.FC<{ icon: React.ReactNode; title: string; rows: [string, string][] }> = ({ icon, title, rows }) => (
  <div className="bg-theme-input-bg border border-theme-border rounded-2xl p-5">
    <div className="flex items-center gap-2 text-lux-gold mb-4">{icon}<h3 className="text-xs font-bold text-theme-text-primary uppercase tracking-widest font-mono">{title}</h3></div>
    <div className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 text-sm border-b border-theme-border/30 pb-2 last:border-0 last:pb-0">
          <span className="text-theme-text-muted">{label}</span>
          <span className="text-theme-text-primary font-medium text-right">{value}</span>
        </div>
      ))}
    </div>
  </div>
);
