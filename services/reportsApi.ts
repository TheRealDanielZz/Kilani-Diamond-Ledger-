import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  Phase7FilterRequest,
  Phase7Page,
  Phase7ReportSection,
  comparePhase8Projects,
  decodePhase7Cursor,
  encodePhase7Cursor,
  matchesPhase7Search,
} from '../functions/src/reports/contract';
import { store } from './store';
import { ProjectStatus, Priority, Project } from '../types';

export interface Phase7ReportPage<T = Record<string, unknown>> extends Phase7Page<T> {
  section: Phase7ReportSection;
}

export interface Phase7CsvExport {
  section: Phase7ReportSection;
  total: number;
  columns: string[];
  csv: string;
}

function projectToSummaryRow(p: Project): Record<string, unknown> {
  const assignees = (p.assignments || [])
    .filter(a => a.active !== false)
    .map(a => {
      const u = store.getUser(a.userId);
      return {
        id: a.userId,
        name: u?.name || u?.email || 'Team member',
        color: u?.setterColor,
        image: u?.profilePhoto,
      };
    });
  const salesRep = p.salesRepId ? store.getUser(p.salesRepId) : null;
  const photos = p.projectPhotos || [];
  const repair = p.repair || p.repairDetails;

  return {
    id: p.id,
    code: p.code || 'Untitled project',
    pieceName: p.pieceName || '',
    clientName: p.clientName || '',
    clientPhone: p.clientPhone || '',
    status: p.status || ProjectStatus.ACTIVE,
    priority: p.priority || Priority.NORMAL,
    progress: p.currentPercentComplete || 0,
    currentStageName: p.currentStageName || 'Intake',
    dueDate: p.dueDate || '',
    updatedAt: p.updatedAt || p.createdAt || '',
    createdAt: p.createdAt || '',
    previewImage: photos[photos.length - 1] || (repair as any)?.beforeImage || '',
    serviceCode: p.services?.[0]?.name ? p.services[0].name.toUpperCase() : 'SETTING',
    service: p.services?.[0]?.name || 'Setting',
    salesRepId: p.salesRepId || '',
    salesRepName: salesRep?.name || '',
    assignees,
    isQuickRepair: Boolean(p.isQuickRepair),
    datePickedUp: p.date_picked_up || '',
  };
}

function queryPhase7ReportClientFallback<T>(request: Phase7FilterRequest): Phase7ReportPage<T> {
  const pageSize = request.pageSize || 25;
  const offset = decodePhase7Cursor(request.cursor);

  if (request.section === 'ALL_PROJECTS' || request.section === 'PROJECT_HISTORY') {
    const allProjects = store.getProjects();
    const statusFilter = request.selections?.status || [];
    const search = request.search || '';

    const filtered = allProjects.filter(p => {
      if (statusFilter.length && !statusFilter.includes(p.status)) return false;
      if (search) {
        const searchText = `${p.code} ${p.pieceName} ${p.clientName} ${p.clientPhone}`.toLowerCase();
        if (!matchesPhase7Search(search, searchText)) return false;
      }
      return true;
    });

    const summaries = filtered.map(projectToSummaryRow);

    summaries.sort((a, b) => comparePhase8Projects({
      id: String(a.id),
      priority: a.priority,
      dueDate: a.dueDate,
      updatedAt: a.updatedAt,
      createdAt: a.createdAt,
    }, {
      id: String(b.id),
      priority: b.priority,
      dueDate: b.dueDate,
      updatedAt: b.updatedAt,
      createdAt: b.createdAt,
    }));

    const pageRows = summaries.slice(offset, offset + pageSize) as T[];
    const nextOffset = offset + pageSize;
    const nextCursor = nextOffset < summaries.length ? encodePhase7Cursor(nextOffset) : null;

    return {
      section: request.section,
      rows: pageRows,
      total: summaries.length,
      nextCursor,
      pageSize,
    };
  }

  if (request.section === 'REQUESTS') {
    const requests = store.getRequests();
    const statusFilter = request.selections?.status || [];
    const filtered = requests.filter(r => !statusFilter.length || statusFilter.includes(r.status));
    const pageRows = filtered.slice(offset, offset + pageSize) as T[];
    const nextOffset = offset + pageSize;
    const nextCursor = nextOffset < filtered.length ? encodePhase7Cursor(nextOffset) : null;
    return {
      section: request.section,
      rows: pageRows,
      total: filtered.length,
      nextCursor,
      pageSize,
    };
  }

  if (request.section === 'RETURNS') {
    const bags = store.getBags().filter(b => b.status === 'Returned_Pending_Count');
    const pageRows = bags.slice(offset, offset + pageSize) as T[];
    const nextOffset = offset + pageSize;
    const nextCursor = nextOffset < bags.length ? encodePhase7Cursor(nextOffset) : null;
    return {
      section: request.section,
      rows: pageRows,
      total: bags.length,
      nextCursor,
      pageSize,
    };
  }

  return {
    section: request.section,
    rows: [],
    total: 0,
    nextCursor: null,
    pageSize,
  };
}

export async function queryPhase7Report<T = Record<string, unknown>>(
  request: Phase7FilterRequest,
): Promise<Phase7ReportPage<T>> {
  if (store.isDemoMode) {
    return queryPhase7ReportClientFallback<T>(request);
  }
  try {
    const callable = httpsCallable<Phase7FilterRequest, Phase7ReportPage<T>>(functions, 'queryPhase7Report');
    return (await callable(request)).data;
  } catch (err: any) {
    console.warn('[reportsApi] Cloud Function queryPhase7Report failed, using client store fallback:', err);
    return queryPhase7ReportClientFallback<T>(request);
  }
}

export async function exportPhase7ReportCsv(request: Phase7FilterRequest): Promise<Phase7CsvExport> {
  const callable = httpsCallable<Phase7FilterRequest, Phase7CsvExport>(functions, 'exportPhase7ReportCsv');
  return (await callable(request)).data;
}

export function downloadPhase7Csv(exportResult: Phase7CsvExport, filename: string): void {
  const blob = new Blob([`\uFEFF${exportResult.csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
