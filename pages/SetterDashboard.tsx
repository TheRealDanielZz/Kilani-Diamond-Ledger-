import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, Priority } from '../types';
import { Card, StatusPill } from '../components/UI';
import { Calendar, ChevronRight } from 'lucide-react';

const SetterDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const loadProjects = () => {
      // Use assignments[] array (not legacy assignedSetterId) to find projects
      const acceptedProfileIds = new Set([currentUser.id, ...(currentUser.legacyProfileIds || [])]);
      const all = store.getProjects().filter(p =>
        (p.assignments || []).some(a => acceptedProfileIds.has(a.userId) && a.active)
      );
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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
           <h1 className="text-2xl font-bold text-lux-cream">My Assignments</h1>
           <p className="text-sm text-zinc-500">Current Work Queue</p>
        </div>
        <div className="w-4 h-4 rounded-full shadow-glow ring-2 ring-lux-black" style={{background: currentUser.setterColor}}></div>
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
    </div>
  );
};

export default SetterDashboard;
