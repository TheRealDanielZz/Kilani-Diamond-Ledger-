
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, ProjectStatus, Priority } from '../types';
import { Card, StatusPill, Badge, SetterAvatar, ProgressBar } from '../components/UI';
import { Calendar, ChevronRight, Layers, LayoutGrid, List as ListIcon, Image as ImageIcon } from 'lucide-react';
import { useTour } from '../components/TourContext';

const SetterDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const { isActive } = useTour(); // Re-render if tour active to ensure elements present
  const [projects, setProjects] = useState<Project[]>([]);
  const [viewMode, setViewMode] = useState<'LIST' | 'GRID'>('LIST');

  useEffect(() => {
    // Filter by assignments OR if they are the Sales Rep
    // AND Only show ACTIVE projects
    const all = store.getProjects().filter(p => 
      p.status === ProjectStatus.ACTIVE &&
      (p.assignments.some(a => a.userId === currentUser.id && a.active) || 
      p.salesRepId === currentUser.id)
    );
    // Sort active first (implicitly all active, so sort by priority/date)
    all.sort((a, b) => {
        if (a.priority === Priority.RUSH) return -1;
        if (b.priority === Priority.RUSH) return 1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    setProjects(all);
  }, [currentUser]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-32">
      <div className="flex items-center justify-between mb-8">
        <div>
           <h1 className="text-2xl font-bold text-white">My Work</h1>
           <p className="text-sm text-zinc-500">Assignments & Tasks</p>
        </div>
        <div className="flex gap-3">
           <div data-tour="dashboard-view-toggle" className="flex bg-[#23262F] rounded-lg p-1 border border-zinc-800">
               <button onClick={() => setViewMode('LIST')} className={`p-2 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-lux-gold text-black shadow-sm' : 'text-zinc-500 hover:text-white'}`}><ListIcon size={18}/></button>
               <button onClick={() => setViewMode('GRID')} className={`p-2 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-lux-gold text-black shadow-sm' : 'text-zinc-500 hover:text-white'}`}><LayoutGrid size={18}/></button>
           </div>
           <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#23262F] border border-[#2D313A] shadow-glow">
              <Layers className="text-lux-gold w-5 h-5" />
           </div>
        </div>
      </div>

      <div data-tour="dashboard-list" className={viewMode === 'LIST' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-6'}>
        {projects.length === 0 ? (
           <div className="text-center py-24 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30 col-span-full">
             <p className="text-zinc-500">No active projects assigned.</p>
           </div>
        ) : (
          projects.map((p, index) => (
            viewMode === 'LIST' ? (
               <Card 
                 key={p.id} 
                 onClick={() => navigate(`/project/${p.id}`)} 
                 className="group p-5 flex items-center justify-between animate-enter"
                 style={{ animationDelay: `${index * 50}ms` }}
               >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-xl text-white group-hover:text-lux-gold transition-colors">{p.code}</h3>
                      <StatusPill status={p.status} />
                    </div>
                    <p className="text-zinc-400 mb-3 text-sm font-medium">{p.pieceName}</p>
                    <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
                      <div className="flex items-center gap-1"><Calendar size={12} /> {new Date(p.dueDate).toLocaleDateString()}</div>
                      <div className="text-zinc-600">{p.currentStageName || 'Not Started'}</div>
                    </div>
                    <div className="max-w-[200px]">
                      <ProgressBar progress={p.currentPercentComplete || 0} />
                    </div>
                  </div>
                  <ChevronRight className="text-zinc-600 group-hover:text-white transition-colors" />
               </Card>
            ) : (
               <div 
                 key={p.id} 
                 onClick={() => navigate(`/project/${p.id}`)} 
                 className="group bg-[#1F2128] border border-zinc-800 rounded-3xl overflow-hidden cursor-pointer hover:border-lux-gold/30 transition-all shadow-subtle hover:shadow-glow flex flex-col h-full relative animate-enter"
                 style={{ animationDelay: `${index * 50}ms` }}
               >
                  {/* Cover Image Area */}
                  <div className="h-32 bg-black relative flex items-center justify-center border-b border-zinc-800">
                    {p.projectPhotos && p.projectPhotos.length > 0 ? (
                        <img src={p.projectPhotos[p.projectPhotos.length - 1]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                        <div className="text-zinc-700 flex flex-col items-center">
                          <ImageIcon size={24} strokeWidth={1.5} />
                          <span className="text-[10px] mt-2 font-medium uppercase tracking-wider">No Preview</span>
                        </div>
                    )}
                    <div className="absolute top-2 right-2">
                        {p.priority === Priority.RUSH && <Badge color="red">RUSH</Badge>}
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-white/10 text-[10px] font-bold text-white shadow-lg">
                        {p.currentStageName || 'Intake'}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col">
                    <div className="mb-2">
                        <h3 className="font-bold text-lg text-white group-hover:text-lux-gold transition-colors">{p.code}</h3>
                        <p className="text-xs text-zinc-400 font-medium truncate">{p.pieceName}</p>
                    </div>
                    <div className="mt-auto pt-3 border-t border-zinc-800/50">
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <Calendar size={10} />
                              <span>{new Date(p.dueDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
                          </div>
                          <div className="font-mono font-bold text-lux-gold text-xs">{p.currentPercentComplete || 0}%</div>
                        </div>
                        <ProgressBar progress={p.currentPercentComplete || 0} />
                    </div>
                  </div>
               </div>
            )
          ))
        )}
      </div>
    </div>
  );
};
export default SetterDashboard;
