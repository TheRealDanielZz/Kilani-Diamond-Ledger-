
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus } from '../types';
import { Card, StatusPill, Badge, ProgressBar } from '../components/UI';
import { Calendar, ChevronRight, PenTool, Camera, Image as ImageIcon } from 'lucide-react';

const DesignerDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    // Filter by assignments AND Status Active
    const all = store.getProjects().filter(p => 
      p.status === ProjectStatus.ACTIVE &&
      p.assignments.some(a => a.userId === currentUser.id && a.active)
    );
    // Sort active first
    all.sort((a, b) => (a.status === ProjectStatus.ACTIVE ? -1 : 1));
    setProjects(all);
  }, [currentUser]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-32">
      <div className="flex items-center justify-between mb-8">
        <div>
           <h1 className="text-2xl font-bold text-white">Design Workspace</h1>
           <p className="text-sm text-zinc-500">My Assigned Designs</p>
        </div>
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#23262F] border border-[#2D313A] shadow-glow">
           <PenTool className="text-lux-gold w-5 h-5" />
        </div>
      </div>

      <div id="tutorial-design-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length === 0 ? (
           <div className="col-span-full text-center py-24 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30">
             <p className="text-zinc-500">No active design projects assigned.</p>
           </div>
        ) : (
          projects.map(p => (
            <div 
              key={p.id} 
              onClick={() => navigate(`/project/${p.id}`)}
              className="group bg-[#1F2128] border border-zinc-800 rounded-3xl overflow-hidden cursor-pointer hover:border-lux-gold/30 transition-all shadow-subtle hover:shadow-glow flex flex-col h-full relative"
            >
               {/* Cover Image Area */}
               <div className="h-48 bg-black relative flex items-center justify-center border-b border-zinc-800">
                  {p.projectPhotos && p.projectPhotos.length > 0 ? (
                     <img src={p.projectPhotos[0]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : (
                     <div className="text-zinc-700 flex flex-col items-center">
                        <ImageIcon size={32} strokeWidth={1.5} />
                        <span className="text-[10px] mt-2 font-medium uppercase tracking-wider">No Preview</span>
                     </div>
                  )}
                  {/* Status Overlay */}
                  <div className="absolute top-3 right-3">
                     <StatusPill status={p.status} />
                  </div>
                  {/* Design Stage Badge */}
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white shadow-lg">
                     {p.designStage || 'Intake'}
                  </div>
               </div>

               {/* Content */}
               <div className="p-5 flex-1 flex flex-col">
                  <div className="mb-4">
                     <h3 className="font-bold text-lg text-white group-hover:text-lux-gold transition-colors">{p.code}</h3>
                     <p className="text-sm text-zinc-400 font-medium truncate">{p.clientName ? `${p.clientName} - ` : ''}{p.pieceName}</p>
                  </div>
                  
                  <div className="mt-auto">
                     <div className="flex items-center justify-between mb-2 pt-4 border-t border-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                           <Calendar size={12} />
                           <span>Due {new Date(p.dueDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
                        </div>
                        <Badge color="blue">{p.designLogs?.length || 0} Logs</Badge>
                     </div>
                     {/* For designers, we might want to show general progress or design stage specific progress if mapped */}
                     <ProgressBar progress={p.currentPercentComplete || 0} />
                  </div>
               </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
export default DesignerDashboard;
