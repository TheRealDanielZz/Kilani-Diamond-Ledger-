import React from 'react';
import { Calendar, ChevronRight, Image as ImageIcon, LayoutGrid, List } from 'lucide-react';
import { Badge, ProgressBar, SetterAvatar, StatusPill } from '../UI';
import {
  formatProjectDueDate,
  ProjectAssigneeSummary,
  ProjectSummary,
  ProjectViewMode,
  projectSecondaryText,
} from '../../services/projectPresentation';
import { Priority } from '../../types';

export const ProjectViewToggle: React.FC<{
  value: ProjectViewMode;
  onChange: (value: ProjectViewMode) => void;
  label: string;
}> = ({ value, onChange, label }) => (
  <div
    role="group"
    aria-label={label}
    className="flex items-center rounded-2xl border border-theme-border bg-theme-input-bg p-1 min-h-11"
  >
    <button
      type="button"
      onClick={() => onChange('LIST')}
      aria-label="List view"
      aria-pressed={value === 'LIST'}
      className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center transition-all duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold ${value === 'LIST' ? 'bg-lux-gold text-black shadow-glow' : 'text-theme-text-muted hover:bg-theme-row-hover hover:text-theme-text-primary'}`}
    >
      <List size={18} aria-hidden="true" />
    </button>
    <button
      type="button"
      onClick={() => onChange('GRID')}
      aria-label="Grid view"
      aria-pressed={value === 'GRID'}
      className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center transition-all duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold ${value === 'GRID' ? 'bg-lux-gold text-black shadow-glow' : 'text-theme-text-muted hover:bg-theme-row-hover hover:text-theme-text-primary'}`}
    >
      <LayoutGrid size={18} aria-hidden="true" />
    </button>
  </div>
);

const ProjectAssigneeStack: React.FC<{ assignees: ProjectAssigneeSummary[] }> = ({ assignees }) => {
  const visible = assignees.slice(0, 4);
  const remaining = Math.max(0, assignees.length - visible.length);
  return (
    <div className="flex items-center -space-x-2" aria-label={assignees.length ? `${assignees.length} assigned team members` : 'No assigned team members'}>
      {visible.map(assignee => (
        <span key={assignee.id} className="rounded-full ring-2 ring-surface-raised" title={assignee.name}>
          <SetterAvatar name={assignee.name} color={assignee.color} image={assignee.image} size="sm" />
        </span>
      ))}
      {remaining > 0 && (
        <span className="relative z-10 min-w-8 h-8 px-1 rounded-full border border-theme-border bg-surface-raised text-[10px] font-bold text-theme-text-secondary flex items-center justify-center">
          +{remaining}
        </span>
      )}
      {!assignees.length && <span className="text-[11px] italic text-theme-text-muted">Unassigned</span>}
    </div>
  );
};

const ProjectImage: React.FC<{ project: ProjectSummary }> = ({ project }) => (
  <div className="aspect-[16/9] w-full overflow-hidden bg-black/20 border-b border-theme-border">
    {project.previewImage ? (
      <img
        src={project.previewImage}
        alt={`${project.code} ${project.pieceName || 'project'} preview`}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
      />
    ) : (
      <div className="w-full h-full" aria-hidden="true" />
    )}
  </div>
);

const ProjectMeta: React.FC<{ project: ProjectSummary }> = ({ project }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-theme-text-muted">
    <span className="inline-flex items-center gap-1.5">
      <Calendar size={13} aria-hidden="true" />
      <span>{formatProjectDueDate(project.dueDate)}</span>
    </span>
    <span>{project.currentStageName || 'Intake'}</span>
    <span className="font-mono text-lux-gold">{project.progress}%</span>
  </div>
);

export const ProjectGridCard: React.FC<{
  project: ProjectSummary;
  onOpen: () => void;
  actions?: React.ReactNode;
}> = ({ project, onOpen, actions }) => (
  <article className="group h-full overflow-hidden rounded-3xl border border-theme-border bg-surface-raised shadow-subtle transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-lux-gold/35 motion-reduce:transform-none motion-reduce:transition-none">
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lux-gold"
      aria-label={`Open project ${project.code}`}
    >
      <div className="relative">
        <ProjectImage project={project} />
        {project.priority === Priority.RUSH && (
          <div className="absolute top-3 right-3"><Badge color="red">Rush</Badge></div>
        )}
      </div>
      <div className="p-5 pb-4 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-theme-text-primary truncate group-hover:text-lux-gold transition-colors duration-300 motion-reduce:transition-none">
              {project.code}
            </h3>
            <p className="text-sm text-theme-text-secondary line-clamp-2 min-h-11">{projectSecondaryText(project)}</p>
          </div>
          <StatusPill status={project.status as any} />
        </div>
        <div className="mt-4">
          <ProjectMeta project={project} />
          <ProgressBar progress={project.progress} className="mt-3" />
        </div>
      </div>
    </button>
    <div className="min-h-14 px-5 py-3 border-t border-theme-border flex items-center justify-between gap-3">
      <ProjectAssigneeStack assignees={project.assignees} />
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  </article>
);

export const ProjectListRow: React.FC<{
  project: ProjectSummary;
  onOpen: () => void;
  actions?: React.ReactNode;
}> = ({ project, onOpen, actions }) => (
  <article className="group rounded-3xl border border-theme-border bg-surface-raised shadow-subtle transition-[transform,border-color] duration-300 hover:border-lux-gold/35 motion-reduce:transition-none">
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 p-4 sm:p-5 text-left grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lux-gold rounded-3xl"
        aria-label={`Open project ${project.code}`}
      >
        <div className="min-w-0 flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center text-xs font-black border ${project.priority === Priority.RUSH ? 'bg-red-500/10 text-red-500 border-red-500/25' : 'bg-theme-input-bg text-theme-text-muted border-theme-border'}`}>
            {project.code.slice(-2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-bold text-theme-text-primary truncate group-hover:text-lux-gold transition-colors duration-300 motion-reduce:transition-none">{project.code}</h3>
              {project.priority === Priority.RUSH && <Badge color="red">Rush</Badge>}
            </div>
            <p className="text-xs text-theme-text-secondary truncate">{projectSecondaryText(project)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ProjectAssigneeStack assignees={project.assignees} />
          <div className="hidden sm:block w-28"><ProgressBar progress={project.progress} /></div>
        </div>
        <div className="flex items-center justify-between md:justify-end gap-4">
          <div className="text-left md:text-right">
            <ProjectMeta project={project} />
          </div>
          <StatusPill status={project.status as any} />
          <ChevronRight className="text-theme-text-muted group-hover:text-lux-gold group-hover:translate-x-1 transition-transform duration-300 motion-reduce:transform-none motion-reduce:transition-none" aria-hidden="true" />
        </div>
      </button>
      {actions && (
        <div className="shrink-0 px-3 border-l border-theme-border flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  </article>
);

export const ProjectCollectionMessage: React.FC<{ icon?: React.ReactNode; title: string; detail: string }> = ({ icon, title, detail }) => (
  <div className="col-span-full rounded-3xl border border-dashed border-theme-border bg-theme-input-bg py-16 px-6 text-center">
    {icon || <ImageIcon size={28} className="mx-auto mb-3 text-theme-text-muted" aria-hidden="true" />}
    <h3 className="font-bold text-theme-text-primary">{title}</h3>
    <p className="text-sm text-theme-text-muted mt-1">{detail}</p>
  </div>
);
