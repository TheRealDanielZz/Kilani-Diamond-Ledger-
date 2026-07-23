import { Priority, ProjectStatus } from '../types';
import { comparePhase8Projects } from '../functions/src/reports/contract';

export type ProjectViewMode = 'LIST' | 'GRID';

export interface ProjectAssigneeSummary {
  id: string;
  name: string;
  color?: string;
  image?: string;
}

export interface ProjectSummary {
  id: string;
  code: string;
  pieceName: string;
  clientName: string;
  clientPhone: string;
  status: ProjectStatus | string;
  priority: Priority | string;
  progress: number;
  currentStageName: string;
  dueDate: string;
  updatedAt: string;
  createdAt: string;
  previewImage: string;
  serviceCode: string;
  service: string;
  salesRepId: string;
  salesRepName: string;
  assignees: ProjectAssigneeSummary[];
  isQuickRepair: boolean;
  datePickedUp: string;
}

const text = (value: unknown) => value === null || value === undefined ? '' : String(value);

export function normalizeProjectSummary(value: unknown): ProjectSummary {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const assignees = Array.isArray(row.assignees)
    ? row.assignees.map(item => {
      const assignee = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        id: text(assignee.id),
        name: text(assignee.name) || 'Team member',
        color: text(assignee.color) || undefined,
        image: text(assignee.image) || undefined,
      };
    }).filter(assignee => assignee.id)
    : [];

  return {
    id: text(row.id),
    code: text(row.code) || 'Untitled project',
    pieceName: text(row.pieceName),
    clientName: text(row.clientName),
    clientPhone: text(row.clientPhone),
    status: text(row.status),
    priority: text(row.priority),
    progress: Math.max(0, Math.min(100, Number(row.progress || 0))),
    currentStageName: text(row.currentStageName) || 'Intake',
    dueDate: text(row.dueDate),
    updatedAt: text(row.updatedAt),
    createdAt: text(row.createdAt),
    previewImage: text(row.previewImage),
    serviceCode: text(row.serviceCode),
    service: text(row.service),
    salesRepId: text(row.salesRepId),
    salesRepName: text(row.salesRepName),
    assignees,
    isQuickRepair: Boolean(row.isQuickRepair),
    datePickedUp: text(row.datePickedUp),
  };
}

export function sortProjectSummaries(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort(comparePhase8Projects);
}

export function formatProjectDueDate(value: string): string {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No due date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function projectSecondaryText(project: ProjectSummary): string {
  const client = project.clientName.trim();
  const piece = project.pieceName.trim();
  if (client && piece) return `${client} — ${piece}`;
  return client || piece || 'No project description';
}
