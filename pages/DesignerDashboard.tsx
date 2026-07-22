
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, Priority, Role, User } from '../types';
import { Card, StatusPill, Badge, ProgressBar, Button, Input, SetterAvatar } from '../components/UI';
import { Briefcase, Calendar, PenTool, Image as ImageIcon, Plus, X, ChevronRight } from 'lucide-react';
import { useToast } from '../App';
import { RepairProjectModal } from '../components/RepairProjectModal';

const SERVICE_OPTIONS = ['Setting', 'Custom Make', 'Repair', 'Resize', 'Other'];

const DesignerDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const showToast = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [setters, setSetters] = useState<User[]>([]);
  const [salesReps, setSalesReps] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Create Project Modal State
  const [isCreating, setIsCreating] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>(['Custom Make']);
  const [newAssignees, setNewAssignees] = useState<string[]>([]);
  const [newProject, setNewProject] = useState<Partial<Project>>({
    code: '', pieceName: '', priority: Priority.NORMAL,
    dueDate: new Date().toISOString().split('T')[0],
    clientName: '', clientPhone: '', salesRepId: '', services: [], workDetails: '',
    goldType: 'Yellow', goldPurity: '14k',
    goldComponents: [{ id: crypto.randomUUID(), label: 'Component 1', type: 'Yellow', purity: '14k' }],
    repairDetails: { date: new Date().toISOString().split('T')[0], items: [{ stoneSize: '', quantity: 0 }], totalQuantity: 0, report: '' }
  });

  useEffect(() => {
    const sync = () => {
      const all = store.getProjects().filter(p => p.status === ProjectStatus.ACTIVE);
      all.sort((a, b) => {
        if (a.priority === Priority.RUSH && b.priority !== Priority.RUSH) return -1;
        if (b.priority === Priority.RUSH && a.priority !== Priority.RUSH) return 1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
      setProjects(all);
      const allUsers = store.getUsers();
      setSetters(allUsers.filter(u => (u.role === Role.SETTER || u.role === Role.JEWELLER || u.role === Role.DESIGNER) && u.active));
      setSalesReps(allUsers.filter(u => u.role === Role.SALES_REP && u.active));
    };
    sync();
    return store.subscribe(sync);
  }, []);

  const toggleService = (svc: string) => {
    if (svc === 'Repair') {
      setIsCreating(false);
      setIsRepairing(true);
      return;
    }
    setSelectedServices(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    );
  };

  const resetModal = () => {
    setNewProject({
      code: '', pieceName: '', priority: Priority.NORMAL,
      dueDate: new Date().toISOString().split('T')[0],
      clientName: '', clientPhone: '', salesRepId: '', services: [], workDetails: '',
      goldType: 'Yellow', goldPurity: '14k',
      goldComponents: [{ id: crypto.randomUUID(), label: 'Component 1', type: 'Yellow', purity: '14k' }],
      repairDetails: { date: new Date().toISOString().split('T')[0], items: [{ stoneSize: '', quantity: 0 }], totalQuantity: 0, report: '' }
    });
    setSelectedServices(['Custom Make']);
    setNewAssignees([]);
  };

  const handleCreateProject = async () => {
    if (!newProject.code || !newProject.pieceName) return alert('Code and Name required');
    setLoading(true);
    const serviceObjects = selectedServices.map(s => ({ name: s, status: 'PENDING' as const }));
    try {
      const finalAssignees = [...newAssignees];
      if (newProject.salesRepId && !finalAssignees.includes(newProject.salesRepId)) {
        finalAssignees.push(newProject.salesRepId);
      }
      const projectDataToSave = { ...newProject, services: serviceObjects };
      if (!selectedServices.includes('Repair')) {
        delete projectDataToSave.repairDetails;
      } else if (projectDataToSave.repairDetails) {
        const total = projectDataToSave.repairDetails.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        projectDataToSave.repairDetails.totalQuantity = total;
      }
      const created = await store.createProject(projectDataToSave, finalAssignees);
      setLoading(false);
      setIsCreating(false);
      resetModal();
      showToast('Project Created');
      if (created) navigate(`/project/${created.id}`);
    } catch (e: any) {
      console.error(e);
      setLoading(false);
      showToast(e.message || "Failed to create project");
    }
  };

  const acceptedProfileIds = new Set([currentUser.id, ...(currentUser.legacyProfileIds || [])]);
  const myProjects = projects.filter(p => p.assignments.some(a => acceptedProfileIds.has(a.userId) && a.active));
  const otherProjects = projects.filter(p => !p.assignments.some(a => acceptedProfileIds.has(a.userId) && a.active));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">Design Workspace</h1>
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-[0.2em] mt-1">Active Projects</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#23262F] border border-[#2D313A]">
            <PenTool className="text-lux-gold w-5 h-5" />
          </div>
          <Button variant="secondary" onClick={() => setIsRepairing(true)}>New Repair</Button>
          <Button onClick={() => setIsCreating(true)} icon={<Plus size={18} />}>New Project</Button>
        </div>
      </div>

      <RepairProjectModal isOpen={isRepairing} onClose={() => setIsRepairing(false)} currentUser={currentUser} />

      {/* My Assigned Projects */}
      {myProjects.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">My Assigned</h2>
            <Badge color="blue">{myProjects.length}</Badge>
          </div>
          <div id="tutorial-design-list" className="modular-grid">
            {myProjects.map(p => <ProjectCard key={p.id} p={p} navigate={navigate} highlight />)}
          </div>
        </div>
      )}

      {/* All Other Active Projects */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">All Active Projects</h2>
          <Badge color="green">{projects.length}</Badge>
        </div>
        {projects.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30">
            <p className="text-zinc-500">No active projects.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.slice(0, 6).map(p => {
              const isAssigned = p.assignments.some(a => acceptedProfileIds.has(a.userId) && a.active);
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}`)}
                  className={`group border rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 transition-all duration-300 cursor-pointer active:scale-[0.99] ${isAssigned ? 'bg-lux-gold/5 border-lux-gold/30 hover:border-lux-gold/50' : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'}`}
                >
                  <div className="flex-1 flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-sm font-black ${p.priority === Priority.RUSH ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-white/5 text-zinc-500 border border-white/5'}`}>
                      {p.code.substring(p.code.length - 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-theme-text-primary group-hover:text-lux-gold transition-colors truncate">{p.code}</h3>
                        {p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}
                        {isAssigned && <Badge color="blue">Mine</Badge>}
                      </div>
                      <p className="text-xs text-zinc-500 truncate">
                        {p.clientName ? `${p.clientName} — ` : ''}{p.pieceName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Calendar size={12} />
                      <span>{new Date(p.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="w-28">
                      <ProgressBar progress={p.currentPercentComplete || 0} />
                      <div className="text-[10px] text-zinc-500 mt-1 text-right font-bold">{p.currentPercentComplete || 0}%</div>
                    </div>
                    <ChevronRight className="text-zinc-700 group-hover:text-white hidden md:block transition-all group-hover:translate-x-1" size={18} />
                  </div>
                </div>
              );
            })}

            {projects.length > 6 && (
              <div onClick={() => navigate('/projects')} className="group border-2 border-dashed border-zinc-800 hover:border-lux-gold/50 rounded-3xl p-5 flex items-center justify-between cursor-pointer transition-all hover:bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-lux-gold/10 border border-lux-gold/20 flex items-center justify-center text-lux-gold group-hover:scale-110 transition-transform">
                    <Briefcase size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-theme-text-primary group-hover:text-lux-gold transition-colors">View All Projects</h3>
                    <p className="text-xs text-zinc-500 font-medium">+{projects.length - 6} more active projects</p>
                  </div>
                </div>
                <ChevronRight className="text-zinc-600 group-hover:text-lux-gold transition-colors group-hover:translate-x-1" size={18} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-3xl bg-theme-modal-bg rounded-3xl border border-theme-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-theme-border flex justify-between items-center sticky top-0 bg-theme-modal-bg/90 backdrop-blur-md z-20">
              <h2 className="text-xl font-bold text-theme-text-primary tracking-tight">Create New Project</h2>
              <button onClick={() => { setIsCreating(false); resetModal(); }} className="text-zinc-500 hover:text-theme-text-primary p-2 rounded-full hover:bg-zinc-800 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
              {/* Basic Info */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Project Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Project Code" value={newProject.code} onChange={e => setNewProject({ ...newProject, code: e.target.value })} placeholder="e.g. DR-24-001" autoFocus />
                  <Input label="Piece Name" value={newProject.pieceName} onChange={e => setNewProject({ ...newProject, pieceName: e.target.value })} placeholder="e.g. 3.5ct Solitaire Ring" />
                  <Input label="Client Name (Optional)" value={newProject.clientName} onChange={e => setNewProject({ ...newProject, clientName: e.target.value })} placeholder="e.g. John Doe" />
                  <Input label="Client Phone (Optional)" value={newProject.clientPhone} onChange={e => setNewProject({ ...newProject, clientPhone: e.target.value })} placeholder="e.g. 555-0192" />
                </div>
              </section>

              {/* Logistics */}
              {!selectedServices.includes('Repair') && (
                <section className="space-y-4 animate-in fade-in">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Logistics</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input label="Due Date" type="date" value={newProject.dueDate} onChange={e => setNewProject({ ...newProject, dueDate: e.target.value })} />
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Priority</label>
                      <select className="w-full bg-theme-input-bg text-theme-text-primary rounded-2xl border-transparent p-3.5 text-sm focus:ring-lux-gold transition-all" value={newProject.priority} onChange={e => setNewProject({ ...newProject, priority: e.target.value as Priority })}>
                        <option value={Priority.NORMAL}>Normal</option>
                        <option value={Priority.RUSH}>Rush</option>
                        <option value={Priority.LOW}>Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Sales Rep</label>
                      <select className="w-full bg-theme-input-bg text-theme-text-primary rounded-2xl border-transparent p-3.5 text-sm focus:ring-lux-gold transition-all" value={newProject.salesRepId} onChange={e => setNewProject({ ...newProject, salesRepId: e.target.value })}>
                        <option value="">Select Rep...</option>
                        {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  </div>
                </section>
              )}

              {/* Gold Components */}
              {!selectedServices.includes('Repair') && (
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Materials</h3>
                  <div className="bg-theme-input-bg p-5 rounded-2xl border border-theme-border">
                     {newProject.goldComponents?.map((comp, index) => (
                       <div key={comp.id} className="mb-6 pb-6 border-b border-theme-border last:border-0 last:mb-0 last:pb-0">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex-1 mr-4">
                            <Input label={`Component ${index + 1} Label`} value={comp.label} onChange={e => { const c = [...(newProject.goldComponents || [])]; c[index].label = e.target.value; setNewProject({ ...newProject, goldComponents: c }); }} placeholder="e.g. Main Ring" />
                          </div>
                          {(newProject.goldComponents?.length || 0) > 1 && (
                            <button onClick={() => { const c = newProject.goldComponents!.filter((_, i) => i !== index); setNewProject({ ...newProject, goldComponents: c }); }} className="text-zinc-500 hover:text-red-500 p-2 rounded-xl hover:bg-red-500/10 transition-colors mt-6"><X size={18} /></button>
                          )}
                        </div>
                        <label className="block text-xs font-bold text-zinc-500 mb-3 uppercase">Gold Type</label>
                        <div className="flex flex-wrap gap-3 mb-5">
                          {[
                            { id: 'Yellow', gradient: 'linear-gradient(135deg,#F5D061,#E1B32A)', text: '#5B4300' },
                            { id: 'White', gradient: 'linear-gradient(135deg,#E8E8E8,#C0C0C0)', text: '#4A4A4A' },
                            { id: 'Rose', gradient: 'linear-gradient(135deg,#F0C4B5,#D69786)', text: '#5D3A31' },
                            { id: 'Platinum', gradient: 'linear-gradient(135deg,#1E293B,#64748B)', text: '#FFFFFF' },
                          ].map(type => (
                            <button key={type.id} onClick={() => { const c = [...(newProject.goldComponents || [])]; c[index].type = type.id; if (type.id === 'Platinum') c[index].purity = '950'; else if (c[index].purity === '950') c[index].purity = '14k'; const updates: any = { goldComponents: c }; if (index === 0) { updates.goldType = type.id; updates.goldPurity = c[0].purity; } setNewProject({ ...newProject, ...updates }); }} className={`flex-1 min-w-[70px] h-12 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${comp.type === type.id ? 'ring-2 ring-white scale-105 shadow-lg' : 'opacity-70 hover:opacity-100'}`} style={{ background: type.gradient, color: type.text }}>{type.id}</button>
                          ))}
                        </div>
                        <label className="block text-xs font-bold text-zinc-500 mb-3 uppercase">Purity</label>
                        <div className="flex flex-wrap gap-2">
                          {(comp.type === 'Platinum' ? ['950'] : ['10k', '14k', '18k', '21k']).map(k => (
                            <button key={k} onClick={() => { const c = [...(newProject.goldComponents || [])]; c[index].purity = k; const updates: any = { goldComponents: c }; if (index === 0) updates.goldPurity = k; setNewProject({ ...newProject, ...updates }); }} className={`flex-1 min-w-[60px] py-2.5 rounded-xl text-sm font-bold border transition-all ${comp.purity === k ? 'bg-lux-gold text-black border-lux-gold' : 'bg-transparent text-zinc-500 border-theme-border hover:text-theme-text-primary'}`}>{k}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => { const count = (newProject.goldComponents?.length || 0) + 1; setNewProject({ ...newProject, goldComponents: [...(newProject.goldComponents || []), { id: crypto.randomUUID(), label: `Component ${count}`, type: 'Yellow', purity: '14k' }] }); }} className="w-full mt-2 py-3 rounded-xl border border-dashed border-theme-border text-zinc-500 hover:border-lux-gold hover:text-lux-gold flex items-center justify-center gap-2 text-sm font-bold transition-all">
                      <Plus size={16} /> Add Another Gold Component
                    </button>
                  </div>
                </section>
              )}

              {/* Services */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Services</h3>
                  <div className="bg-theme-input-bg rounded-2xl p-4 border border-theme-border flex flex-wrap gap-2">
                   {SERVICE_OPTIONS.map(svc => (
                     <button key={svc} onClick={() => toggleService(svc)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${selectedServices.includes(svc) ? 'bg-lux-gold text-black border-lux-gold' : 'bg-theme-modal-bg border-theme-border text-zinc-400 hover:text-theme-text-primary hover:border-zinc-700'}`}>{svc}</button>
                  ))}
                </div>
              </section>

              {/* Work Details */}
              {!selectedServices.includes('Repair') && (
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Work Details / Instructions</h3>
                  <textarea className="w-full bg-theme-input-bg text-theme-text-primary rounded-2xl border border-theme-border p-4 text-sm focus:ring-lux-gold focus:border-lux-gold h-28 transition-all resize-none" placeholder="Describe the work required..." value={newProject.workDetails} onChange={e => setNewProject({ ...newProject, workDetails: e.target.value })} />
                </section>
              )}

              {/* Assign Team */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Assign Team (Optional)</h3>
                <div className="flex flex-wrap gap-2">
                  {setters.map(u => (
                    <button key={u.id} onClick={() => setNewAssignees(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${newAssignees.includes(u.id) ? 'bg-lux-gold/10 border-lux-gold text-lux-gold' : 'bg-theme-input-bg border-theme-border text-zinc-400 hover:bg-theme-modal-bg'}`}>
                      <SetterAvatar name={u.name} color={u.setterColor} size="sm" />
                      <span className="text-xs font-bold">{u.name}</span>
                      <Badge color={u.role === Role.DESIGNER ? 'blue' : 'gray'}>{u.role}</Badge>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="px-6 py-5 border-t border-theme-border bg-theme-modal-bg/90 backdrop-blur-md sticky bottom-0 z-20 flex justify-end gap-3 safe-pb">
              <Button variant="secondary" onClick={() => { setIsCreating(false); resetModal(); }} className="px-6">Cancel</Button>
              <Button onClick={handleCreateProject} loading={loading} className="px-8 shadow-glow">Create Project</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Small reusable card for "My Assigned" grid
const ProjectCard: React.FC<{ p: Project; navigate: (path: string) => void; highlight?: boolean }> = ({ p, navigate, highlight }) => (
  <Card
    onClick={() => navigate(`/project/${p.id}`)}
    className={`group overflow-hidden cursor-pointer transition-all shadow-subtle hover:shadow-glow flex flex-col h-full relative ${highlight ? 'hover:border-lux-gold/50' : 'hover:border-white/20'}`}
  >
    <div className="h-48 bg-black relative flex items-center justify-center border-b border-theme-border">
      {p.projectPhotos && p.projectPhotos.length > 0 ? (
        <img src={p.projectPhotos[0]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={p.code} />
      ) : (
        <div className="text-zinc-700 flex flex-col items-center">
          <ImageIcon size={32} strokeWidth={1.5} />
          <span className="text-[10px] mt-2 font-medium uppercase tracking-wider">No Preview</span>
        </div>
      )}
      <div className="absolute top-3 right-3"><StatusPill status={p.status} /></div>
      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white">{p.designStage || 'Intake'}</div>
    </div>
    <div className="p-5 flex-1 flex flex-col">
      <div className="mb-4">
        <h3 className="font-bold text-lg text-theme-text-primary group-hover:text-lux-gold transition-colors">{p.code}</h3>
        <p className="text-sm text-zinc-400 font-medium truncate">{p.clientName ? `${p.clientName} — ` : ''}{p.pieceName}</p>
      </div>
      <div className="mt-auto">
        <div className="flex items-center justify-between mb-2 pt-4 border-t border-theme-border">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Calendar size={12} />
            <span>Due {new Date(p.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
          <Badge color="blue">{p.designLogs?.length || 0} Logs</Badge>
        </div>
        <ProgressBar progress={p.currentPercentComplete || 0} />
      </div>
    </div>
  </Card>
);

export default DesignerDashboard;
