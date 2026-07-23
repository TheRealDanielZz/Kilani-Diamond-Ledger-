import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, Priority } from '../types';
import { Card, StatusPill, Button } from '../components/UI';
import { Calendar, ChevronRight, Wrench } from 'lucide-react';
import { QuickRepairModal } from '../components/QuickRepairModal';

const SetterDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isQuickRepairOpen, setIsQuickRepairOpen] = useState(false);

  useEffect(() => {
    const loadProjects = () => {
      // Comprehensive profile matching for UID, AuthUID, Legacy Profile IDs, Name, and Email
      const acceptedProfileIds = new Set([
        currentUser.id,
        currentUser.authUid,
        ...(currentUser.legacyProfileIds || []),
        currentUser.name?.toLowerCase(),
        currentUser.email?.toLowerCase()
      ].filter(Boolean));

      const all = store.getProjects().filter(p => {
        const hasAssignment = (p.assignments || []).some(a => {
          if (!a.active) return false;
          const user = store.getUser(a.userId);
          const userName = user?.name?.toLowerCase() || '';
          const userEmail = user?.email?.toLowerCase() || '';
          return acceptedProfileIds.has(a.userId) ||
                 (userName && acceptedProfileIds.has(userName)) ||
                 (userEmail && acceptedProfileIds.has(userEmail));
        });
        const isSetterAssigned = Boolean(p.assignedSetterId && (
          acceptedProfileIds.has(p.assignedSetterId) ||
          acceptedProfileIds.has(store.getUser(p.assignedSetterId)?.name?.toLowerCase())
        ));
        const isActiveAssignee = Boolean(p.activeAssignees && p.activeAssignees.some(uid =>
          acceptedProfileIds.has(uid) || acceptedProfileIds.has(store.getUser(uid)?.name?.toLowerCase())
        ));
        return hasAssignment || isSetterAssigned || isActiveAssignee;
      });
      // Sort: Active/Rush first, then by date
      all.sort((a, b) => {
         if (a.status === ProjectStatus.CLOSED && b.status !== ProjectStatus.CLOSED) return 1;
         if (b.status === ProjectStatus.CLOSED && a.status !== ProjectStatus.CLOSED) return -1;
         return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
      setProjects(all);
    };

    loadProjects();
    const unsubscribe = store.subscribe(loadProjects);
    return () => unsubscribe();
  }, [currentUser]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
           <h1 className="text-2xl font-bold text-lux-cream tracking-tight">My Assignments</h1>
           <p className="text-sm text-zinc-500">Current Work Queue</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="primary"
            icon={<Wrench size={18} />}
            onClick={() => setIsQuickRepairOpen(true)}
            className="w-full sm:w-auto"
          >
            New Repair Project
          </Button>
          <div className="w-4 h-4 rounded-full shadow-glow ring-2 ring-lux-black shrink-0" style={{background: currentUser.setterColor || '#52525B'}}></div>
        </div>
      </div>

      <div className="modular-grid">
        {projects.length === 0 ? (
           <div className="text-center py-24 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20 col-span-full">
             <p>No active projects assigned.</p>
           </div>
        ) : (
          projects.map(p => (
            <Card key={p.id} onClick={() => navigate(`/project/${p.id}`)} className="p-5 flex flex-col group h-full">
               <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-lg text-lux-cream group-hover:text-lux-gold transition-colors tracking-tight">{p.code}</h3>
                  <div className="flex flex-col items-end gap-1">
                      {p.priority === Priority.RUSH && <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-900/30 px-2 py-0.5 rounded-full font-bold tracking-wide">RUSH</span>}
                      <StatusPill status={p.status} />
                  </div>
               </div>
               <p className="text-zinc-400 mb-auto text-sm">
                  {p.clientName ? `${p.clientName} ` : ''}
                  {p.clientPhone ? `(${p.clientPhone}) — ` : (p.clientName ? '— ' : '')}
                  {p.pieceName}
               </p>
               <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center text-xs text-zinc-500">
                    <Calendar className="w-3 h-3 mr-1.5" />
                    Due {new Date(p.dueDate).toLocaleDateString()}
                  </div>
                  <ChevronRight className="text-zinc-600 group-hover:text-white transition-colors" size={16} />
               </div>
            </Card>
          ))
        )}
      </div>

      {/* Quick Repair Modal for Walk-in Intake */}
      <QuickRepairModal
        isOpen={isQuickRepairOpen}
        onClose={() => setIsQuickRepairOpen(false)}
        onProjectCreated={(created) => navigate(`/project/${created.id}`)}
      />
    </div>
  );
};

export default SetterDashboard;
