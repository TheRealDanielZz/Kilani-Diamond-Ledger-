
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { ProjectStatus, User, Role } from '../types';
import { Card, Input, Button } from '../components/UI';
import { Layers, Trash2, AlertTriangle, CheckCircle2, RotateCcw, X, Maximize2 } from 'lucide-react';
import { useToast } from '../App';
import ProjectDetail from './ProjectDetail';
import { ReportFilterBar, ReportPagination } from '../components/reports/ReportFilterBar';
import { ReportFilterDefinition, ReportFilterState, newReportFilterState, toPhase7Request } from '../services/reportFilters';
import { usePhase7Report } from '../services/usePhase7Report';
import { downloadPhase7Csv, exportPhase7ReportCsv } from '../services/reportsApi';
import { useProjectViewPreference } from '../hooks/useProjectViewPreference';
import {
  ProjectCollectionMessage,
  ProjectGridCard,
  ProjectListRow,
  ProjectViewToggle,
} from '../components/projects/ProjectViews';
import { normalizeProjectSummary, ProjectSummary } from '../services/projectPresentation';

const AllProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const showToast = useToast();
  const currentUser = store.getCurrentUser();
  const isManager = currentUser?.role === Role.MANAGER;

  const [salesReps, setSalesReps] = useState<User[]>([]);
  
  // Filters
  const [reportFilters, setReportFilters] = useState<ReportFilterState>(() => ({
    ...newReportFilterState(),
    selections: { status: [ProjectStatus.ACTIVE] },
  }));
  const [reportPage, setReportPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { viewMode, setViewMode } = useProjectViewPreference(currentUser?.id || '', 'all-projects', 'GRID');

  const toggleViewMode = (mode: 'LIST' | 'GRID') => {
    setViewMode(mode);
    if (mode === 'GRID') {
      setSelectedProjectId(null);
    }
  };

  // Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Pickup Confirmation State
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [projectToPickup, setProjectToPickup] = useState<string | null>(null);
  const [pickupConfirmation, setPickupConfirmation] = useState('');
  const [actualPickupDate, setActualPickupDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
  const [latePickupReason, setLatePickupReason] = useState('');
  const [pickupSubmitting, setPickupSubmitting] = useState(false);

  // Master-Detail Split View State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
        setSalesReps(store.getUsers().filter(u => u.role === Role.SALES_REP));
    };
    sync();
    return store.subscribe(sync);
  }, []);

  const initiateDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setProjectToDelete(projectId);
    setDeleteConfirmation('');
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (projectToDelete && deleteConfirmation === 'DELETE') {
      store.deleteProject(projectToDelete);
      setDeleteModalOpen(false);
      setProjectToDelete(null);
    }
  };

  const handlePickup = (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation(); 
      e.preventDefault();
      
      if (!currentUser) return;
      
      setProjectToPickup(projectId);
      setPickupConfirmation('');
      setActualPickupDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
      setLatePickupReason('');
      setPickupModalOpen(true);
  };

  const confirmPickupAction = async () => {
      if (projectToPickup && pickupConfirmation === 'DONE' && currentUser) {
          try {
              setPickupSubmitting(true);
              await store.confirmProjectPickup(projectToPickup, currentUser.id, actualPickupDate, latePickupReason);
              showToast("Project Closed (Picked Up)");
              setPickupModalOpen(false);
              setProjectToPickup(null);
          } catch (error: any) {
              console.error("Pickup failed:", error);
              alert("Error updating project status: " + (error.message || "Unknown error"));
          } finally {
              setPickupSubmitting(false);
          }
      }
  };

  const handleRevert = async (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      e.preventDefault();

      if (!currentUser) return;
      if (window.confirm("Return this project to Active production?")) {
          try {
              await store.revertToActive(projectId, currentUser.id);
              showToast("Project returned to Active");
          } catch (error: any) {
              alert("Error reverting project: " + error.message);
          }
      }
  };

  const filterDefinitions: ReportFilterDefinition[] = [
    {
      field: 'status',
      label: 'Status',
      options: Object.values(ProjectStatus).map(value => ({ value, label: value })),
    },
    {
      field: 'salesRepId',
      label: 'Sales Rep',
      options: salesReps.map(user => ({ value: user.id, label: user.name })),
    },
    {
      field: 'service',
      label: 'Service',
      options: [
        { value: 'CUSTOM_MAKE', label: 'Custom Make' },
        { value: 'ENGAGEMENT', label: 'Engagement' },
        { value: 'REPAIR', label: 'Repair' },
        { value: 'OTHER', label: 'Other' },
        { value: 'MANAGER_REVIEW_REQUIRED', label: 'Manager Review Required' },
      ],
    },
  ];
  const projectReport = usePhase7Report<ProjectSummary>('ALL_PROJECTS', reportFilters, { page: reportPage, pageSize: 24 });
  const filteredProjects = projectReport.rows.map(normalizeProjectSummary);

  const changeReportFilters = (next: ReportFilterState) => {
    setReportFilters(next);
    setReportPage(1);
  };

  const exportFilteredProjects = async () => {
    setExporting(true);
    try {
      const result = await exportPhase7ReportCsv({
        ...toPhase7Request('ALL_PROJECTS', reportFilters, 100),
        cursor: undefined,
      });
      downloadPhase7Csv(result, 'all_projects');
      showToast(`Exported ${result.total} project${result.total === 1 ? '' : 's'}.`);
    } catch (error: any) {
      showToast(error?.message || 'Unable to export projects.');
    } finally {
      setExporting(false);
    }
  };

  const handleProjectClick = (projectId: string) => {
    if (viewMode === 'GRID' || window.innerWidth < 1024) {
      navigate(`/project/${projectId}`);
    } else {
      setSelectedProjectId(projectId);
    }
  };

  const projectActions = (project: ProjectSummary) => (
    <>
      {isManager && project.status === ProjectStatus.REVIEW && (
        <button
          type="button"
          onClick={(event) => handlePickup(event, project.id)}
          className="min-w-11 min-h-11 px-3 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-black transition-colors duration-300 motion-reduce:transition-none flex items-center justify-center gap-1.5"
          aria-label={`Confirm pickup for project ${project.code}`}
          title="Confirm pickup"
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          <span className="hidden 2xl:inline text-xs font-bold">Pickup</span>
        </button>
      )}
      {isManager && project.status === ProjectStatus.REVIEW && (
        <button
          type="button"
          onClick={(event) => void handleRevert(event, project.id)}
          className="min-w-11 min-h-11 rounded-xl border border-theme-border bg-theme-input-bg text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-row-hover transition-colors duration-300 motion-reduce:transition-none flex items-center justify-center"
          aria-label={`Return project ${project.code} to Active`}
          title="Return to Active"
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      )}
      {project.status !== ProjectStatus.CLOSED && (
        <button
          type="button"
          onClick={(event) => initiateDelete(event, project.id)}
          className="min-w-11 min-h-11 rounded-xl border border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors duration-300 motion-reduce:transition-none flex items-center justify-center"
          aria-label={`Delete project ${project.code}`}
          title="Delete project"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
    </>
  );

  return (
    <div className="max-w-7xl mx-auto px-5 py-8 pb-24 h-full flex flex-col lg:flex-row gap-6">
      {/* Master List View */}
      <div className={`flex-1 flex flex-col h-full ${selectedProjectId ? 'lg:w-1/3 lg:flex-none' : 'w-full'}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-black/20 p-3 rounded-2xl border border-[#2D313A] shadow-float">
             <Layers className="w-6 h-6 text-lux-gold" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">Projects</h1>
            <p className="text-xs text-theme-text-muted font-medium uppercase tracking-[0.15em] mt-1">Master Repository</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 rounded-3xl border border-[#2D313A] bg-black/20 p-4 space-y-4">
        <div className="flex flex-wrap justify-end gap-3">
            <Button size="sm" variant="secondary" loading={exporting} onClick={() => void exportFilteredProjects()}>
              Export CSV
            </Button>
            <ProjectViewToggle value={viewMode} onChange={toggleViewMode} label="All Projects view" />
        </div>
        <ReportFilterBar
          state={reportFilters}
          onChange={changeReportFilters}
          definitions={filterDefinitions}
          searchPlaceholder="Search code, client, piece, or sales rep…"
          resultCount={projectReport.total}
          loading={projectReport.loading}
        />
      </div>

      {/* Project List */}
      <div className={viewMode === 'GRID' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-4'}>
        {projectReport.loading ? (
          <ProjectCollectionMessage title="Loading projects" detail="Applying your authorized filters…" />
        ) : projectReport.error ? (
          <ProjectCollectionMessage title="Projects unavailable" detail={projectReport.error} />
        ) : filteredProjects.length ? (
          filteredProjects.map(project => viewMode === 'GRID'
            ? (
              <ProjectGridCard
                key={project.id}
                project={project}
                onOpen={() => handleProjectClick(project.id)}
                actions={projectActions(project)}
              />
            )
            : (
              <ProjectListRow
                key={project.id}
                project={project}
                onOpen={() => handleProjectClick(project.id)}
                actions={projectActions(project)}
              />
            )
          )
        ) : (
          <ProjectCollectionMessage title="No projects found" detail="Try clearing or changing the active filters." />
        )}
      </div>
      <ReportPagination page={reportPage} pageSize={24} total={projectReport.total} onPageChange={setReportPage} />
      </div>

      {/* Detail View (iPad/Desktop Split View) */}
      {selectedProjectId && (
        <div className="hidden lg:flex flex-col w-2/3 bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden relative">
          <div className="absolute top-6 right-6 z-50 flex items-center gap-2">
            <button 
              type="button"
              onClick={() => navigate(`/project/${selectedProjectId}`)}
              className="min-w-11 min-h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
              aria-label="Open selected project fullscreen"
              title="Open Fullscreen"
            >
              <Maximize2 size={18} aria-hidden="true" />
            </button>
            <button 
              type="button"
              onClick={() => setSelectedProjectId(null)}
              className="min-w-11 min-h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
              aria-label="Close project quick peek"
              title="Close Quick Peek"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <ProjectDetail currentUser={currentUser} projectId={selectedProjectId} />
          </div>
        </div>
      )}

      {/* Pickup Confirmation Modal */}
      {pickupModalOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pickup-confirmation-title"
        >
           <Card className="w-full max-w-sm p-6 border-amber-500/30 shadow-2xl animate-in zoom-in-95 rounded-[2.5rem]">
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 border border-amber-500/20 text-amber-500">
                    <CheckCircle2 size={32} />
                 </div>
                 <h3 id="pickup-confirmation-title" className="text-xl font-bold text-theme-text-primary mb-2">Confirm Pickup</h3>
                 <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                    This will mark the project as <b>Closed</b>. Please confirm the client has received the item.
                 </p>
                 
                 <div className="w-full mb-6 text-left">
                    <Input
                      label="Actual Pickup Date"
                      type="date"
                      value={actualPickupDate}
                      max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })}
                      onChange={e => setActualPickupDate(e.target.value)}
                    />
                    {actualPickupDate < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) && (
                      <div className="mt-3">
                        <Input label="Late-entry reason" value={latePickupReason} onChange={e => setLatePickupReason(e.target.value)} placeholder="Why is pickup being entered later?" />
                      </div>
                    )}
                    <p className="text-[11px] text-zinc-500 mt-3 mb-4">The historical CAD gold rate for this date will be snapshotted. Pickup will stop if the rate is unavailable.</p>
                    <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">
                       Type <span className="text-white select-none">DONE</span> to confirm
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-black border border-amber-900/50 rounded-2xl p-3 text-center font-bold text-amber-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder-zinc-800"
                      placeholder="DONE"
                      value={pickupConfirmation}
                      onChange={(e) => setPickupConfirmation(e.target.value)}
                      autoFocus
                    />
                 </div>

                 <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={() => setPickupModalOpen(false)} className="flex-1">Cancel</Button>
                    <Button 
                      className="flex-1 bg-amber-500 text-black hover:bg-amber-400 border-none"
                      disabled={pickupConfirmation !== 'DONE' || !actualPickupDate || (actualPickupDate < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) && !latePickupReason.trim()) || pickupSubmitting}
                      loading={pickupSubmitting}
                      onClick={confirmPickupAction}
                    >
                       Confirm Pickup
                    </Button>
                 </div>
              </div>
           </Card>
        </div>
      )}

      {/* Strict Delete Modal */}
      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
        >
           <Card className="w-full max-w-sm p-6 border-red-500/30 shadow-2xl animate-in zoom-in-95 rounded-[2.5rem]">
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20 text-red-500">
                    <AlertTriangle size={32} />
                 </div>
                 <h3 id="delete-project-title" className="text-xl font-bold text-theme-text-primary mb-2">Delete Project?</h3>
                 <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                    This action is <span className="text-red-400 font-bold">irreversible</span>. All data including bags, movements, and logs will be permanently removed.
                 </p>
                 
                 <div className="w-full mb-6 text-left">
                    <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">
                       Type <span className="text-white select-none">DELETE</span> to confirm
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-black border border-red-900/50 rounded-2xl p-3 text-center font-bold text-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder-zinc-800"
                      placeholder="DELETE"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      autoFocus
                    />
                 </div>

                 <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={() => setDeleteModalOpen(false)} className="flex-1">Cancel</Button>
                    <Button 
                      variant="danger" 
                      disabled={deleteConfirmation !== 'DELETE'} 
                      onClick={confirmDelete}
                      className="flex-1"
                    >
                       Delete Forever
                    </Button>
                 </div>
              </div>
           </Card>
        </div>
      )}
    </div>
  );
};

export default AllProjectsPage;
