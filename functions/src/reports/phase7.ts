import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireActor } from '../inventory/auth';
import {
  Phase7FilterRequest,
  Phase7NormalizedRow,
  Phase7ReportSection,
  filterPhase7Rows,
  isPhase7ReportSection,
  paginatePhase7Rows,
  renderPhase7Csv,
  sanitizePhase7Selections,
  sortPhase7Rows,
} from './contract';

const CALLABLE_OPTIONS = { region: 'northamerica-northeast1', cors: true, timeoutSeconds: 120 } as const;

const SECTION_COLLECTIONS: Record<Phase7ReportSection, string> = {
  PROJECT_HISTORY: 'projects',
  WEEKLY_MOVEMENT: 'diamond_transactions',
  INVENTORY_LEDGER: 'movements',
  BROKEN_STONES: 'movements',
  SYSTEM_LOGS: 'system_logs',
  ALL_PROJECTS: 'projects',
  REQUESTS: 'requests',
  RETURNS: 'bags',
};

const MANAGER_ONLY = new Set<Phase7ReportSection>(['REQUESTS', 'RETURNS']);

const EXPORT_COLUMNS: Record<Phase7ReportSection, string[]> = {
  PROJECT_HISTORY: ['code', 'clientName', 'pieceName', 'status', 'service', 'salesRepName', 'repairType', 'repairStatus', 'progress', 'createdAt'],
  WEEKLY_MOVEMENT: ['createdAt', 'movementType', 'projectCode', 'bagNumber', 'specLabel', 'color', 'quantity', 'carats', 'unitCost', 'totalValue', 'actorName', 'notes'],
  INVENTORY_LEDGER: ['createdAt', 'type', 'projectCode', 'bagNumber', 'actorName', 'location', 'notes', 'lines'],
  BROKEN_STONES: ['createdAt', 'projectCode', 'bagNumber', 'specLabel', 'pieces', 'carats', 'actorName', 'notes'],
  SYSTEM_LOGS: ['createdAt', 'actorName', 'action', 'details'],
  ALL_PROJECTS: ['code', 'clientName', 'pieceName', 'status', 'service', 'salesRepName', 'progress', 'dueDate'],
  REQUESTS: ['requestedAt', 'status', 'projectCode', 'requesterName', 'jobNumber', 'lines'],
  RETURNS: ['submittedAt', 'status', 'projectCode', 'bagNumber', 'holderName', 'notes', 'lines'],
};

function dataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOf(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return value === null || value === undefined ? '' : String(value);
}

function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

function serviceCode(project: Record<string, unknown>): string {
  const services = Array.isArray(project.services) ? project.services : [];
  if (services.length !== 1) return 'MANAGER_REVIEW_REQUIRED';
  return stringOf(dataOf(services[0]).code) || 'MANAGER_REVIEW_REQUIRED';
}

function serviceLabel(code: string): string {
  return ({
    CUSTOM_MAKE: 'Custom Make',
    ENGAGEMENT: 'Engagement',
    REPAIR: 'Repair',
    OTHER: 'Other',
    MANAGER_REVIEW_REQUIRED: 'Manager Review Required',
  } as Record<string, string>)[code] || code;
}

function dateOf(...values: unknown[]): string {
  for (const value of values) {
    const text = stringOf(value);
    if (text && Number.isFinite(new Date(text).getTime())) return text;
  }
  return '';
}

function row(
  id: string,
  searchParts: unknown[],
  dateValue: string,
  fields: Phase7NormalizedRow['fields'],
  data: Record<string, unknown>,
): Phase7NormalizedRow {
  return {
    id,
    searchText: searchParts.map(stringOf).filter(Boolean).join(' '),
    dateValue,
    sortValue: dateValue,
    fields,
    data: { id, ...plain(data) as Record<string, unknown> },
  };
}

interface ReferenceMaps {
  users: Map<string, Record<string, unknown>>;
  projects: Map<string, Record<string, unknown>>;
  specs: Map<string, Record<string, unknown>>;
}

function userName(maps: ReferenceMaps, id: unknown): string {
  const user = maps.users.get(stringOf(id));
  return stringOf(user?.name || user?.email);
}

function projectCode(maps: ReferenceMaps, id: unknown): string {
  return stringOf(maps.projects.get(stringOf(id))?.code);
}

function specLabel(maps: ReferenceMaps, id: unknown): string {
  const spec = maps.specs.get(stringOf(id));
  return stringOf(spec?.label || spec?.size || id);
}

function locationAllowed(
  actorLocation: unknown,
  fields: { location?: unknown; specId?: unknown },
  maps: ReferenceMaps,
): boolean {
  const scope = stringOf(actorLocation).trim().toLowerCase();
  if (!scope || scope === 'both') return true;
  const direct = stringOf(fields.location).trim().toLowerCase();
  if (direct) return direct === scope;
  const specLocation = stringOf(maps.specs.get(stringOf(fields.specId))?.location).trim().toLowerCase();
  return !specLocation || specLocation === scope;
}

function projectRows(documents: Array<{ id: string; data: Record<string, unknown> }>, maps: ReferenceMaps): Phase7NormalizedRow[] {
  return documents.map(({ id, data }) => {
    const code = serviceCode(data);
    const repair = dataOf(data.repair || data.repairDetails);
    const financials = dataOf(repair.financials);
    const repairFlags = [
      financials.noCharge || repair.noCharge ? 'NO_CHARGE' : '',
      financials.outsourced || repair.outsourced ? 'OUTSOURCED' : '',
      data.status === 'Active' && code === 'REPAIR' ? 'ACTIVE_REPAIR' : '',
      data.status !== 'Active' && code === 'REPAIR' ? 'COMPLETED_REPAIR' : '',
    ].filter(Boolean);
    const salesRepName = userName(maps, data.salesRepId);
    const createdAt = dateOf(data.createdAt, data.last_status_change_at, data.dueDate);
    return row(id, [
      data.code, data.clientName, data.clientPhone, data.pieceName, salesRepName,
      serviceLabel(code), repair.type, repair.status,
    ], createdAt, {
      service: code,
      status: stringOf(data.status),
      salesRepId: stringOf(data.salesRepId),
      repairType: stringOf(repair.type),
      repairStatus: stringOf(repair.status),
      repairFlag: repairFlags,
    }, {
      code: data.code,
      clientName: data.clientName || '',
      clientPhone: data.clientPhone || '',
      pieceName: data.pieceName || '',
      status: data.status || '',
      service: serviceLabel(code),
      serviceCode: code,
      salesRepId: data.salesRepId || '',
      salesRepName,
      repairType: repair.type || '',
      repairStatus: repair.status || '',
      repairFlags,
      progress: Number(data.currentPercentComplete || 0),
      priority: data.priority || '',
      createdAt,
      dueDate: stringOf(data.dueDate),
      updatedAt: dateOf(data.last_status_change_at, data.updatedAt, data.createdAt),
      previewImage: repair.beforeImage || (Array.isArray(data.projectPhotos) ? data.projectPhotos[0] : '') || '',
    });
  });
}

function ledgerRows(
  documents: Array<{ id: string; data: Record<string, unknown> }>,
  maps: ReferenceMaps,
  actorLocation: unknown,
): Phase7NormalizedRow[] {
  return documents
    .filter(({ data }) => locationAllowed(actorLocation, { specId: data.specId }, maps))
    .map(({ id, data }) => {
      const createdAt = dateOf(data.createdAt);
      const actorName = userName(maps, data.createdById);
      const code = projectCode(maps, data.referenceProjectId);
      const project = maps.projects.get(stringOf(data.referenceProjectId));
      const label = specLabel(maps, data.specId);
      return row(id, [code, data.referenceBagNumber, label, data.color, data.movementType, actorName, data.notes], createdAt, {
        movementType: stringOf(data.movementType),
        specId: stringOf(data.specId),
        color: stringOf(data.color),
        projectId: stringOf(data.referenceProjectId),
        bagNumber: stringOf(data.referenceBagNumber),
        actorId: stringOf(data.createdById),
        salesRepId: stringOf(project?.salesRepId),
      }, {
        createdAt,
        movementType: data.movementType || '',
        projectId: data.referenceProjectId || '',
        projectCode: code,
        bagNumber: data.referenceBagNumber || '',
        specId: data.specId || '',
        specLabel: label,
        color: data.color || '',
        quantity: Number(data.quantity || 0),
        carats: Number(data.carats || 0),
        unitCost: Number(data.unitCost || 0),
        totalValue: Number(data.totalValue || 0),
        actorId: data.createdById || '',
        actorName,
        salesRepId: project?.salesRepId || '',
        notes: data.notes || '',
      });
    });
}

function movementRows(
  documents: Array<{ id: string; data: Record<string, unknown> }>,
  maps: ReferenceMaps,
  actorLocation: unknown,
  brokenOnly: boolean,
): Phase7NormalizedRow[] {
  const result: Phase7NormalizedRow[] = [];
  for (const document of documents) {
    const movement = document.data;
    if (brokenOnly && stringOf(movement.type) !== 'BROKEN_OUT') continue;
    const lines = Array.isArray(movement.lines) ? movement.lines.map(dataOf) : [];
    const specIds = lines.map(line => stringOf(line.specId)).filter(Boolean);
    if (!locationAllowed(actorLocation, { location: movement.location, specId: specIds[0] }, maps)) continue;
    const createdAt = dateOf(movement.createdAt);
    const actorName = userName(maps, movement.createdById);
    const code = projectCode(maps, movement.referenceProjectId);
    if (brokenOnly) {
      lines.forEach((line, index) => {
        const label = specLabel(maps, line.specId);
        result.push(row(`${document.id}:${index}`, [
          code, movement.referenceBagNumber, label, actorName, movement.notes,
        ], createdAt, {
          type: stringOf(movement.type),
          specId: stringOf(line.specId),
          projectId: stringOf(movement.referenceProjectId),
          bagNumber: stringOf(movement.referenceBagNumber),
          actorId: stringOf(movement.createdById),
          location: stringOf(movement.location),
        }, {
          movementId: document.id,
          createdAt,
          projectId: movement.referenceProjectId || '',
          projectCode: code,
          bagNumber: movement.referenceBagNumber || '',
          specId: line.specId || '',
          specLabel: label,
          pieces: Number(line.pcs || 0),
          carats: Number(line.ct || 0),
          actorName,
          notes: movement.notes || '',
        }));
      });
    } else {
      result.push(row(document.id, [
        code, movement.referenceBagNumber, movement.type, actorName, movement.notes, ...specIds.map(id => specLabel(maps, id)),
      ], createdAt, {
        type: stringOf(movement.type),
        specId: specIds,
        projectId: stringOf(movement.referenceProjectId),
        bagNumber: stringOf(movement.referenceBagNumber),
        actorId: stringOf(movement.createdById),
        location: stringOf(movement.location),
      }, {
        createdAt,
        type: movement.type || '',
        projectId: movement.referenceProjectId || '',
        projectCode: code,
        bagNumber: movement.referenceBagNumber || '',
        actorName,
        location: movement.location || '',
        notes: movement.notes || '',
        lines,
      }));
    }
  }
  return result;
}

function logRows(documents: Array<{ id: string; data: Record<string, unknown> }>, maps: ReferenceMaps): Phase7NormalizedRow[] {
  return documents.map(({ id, data }) => {
    const createdAt = dateOf(data.createdAt);
    const actorName = userName(maps, data.createdById);
    return row(id, [data.action, data.details, actorName], createdAt, {
      action: stringOf(data.action),
      actorId: stringOf(data.createdById),
      severity: stringOf(data.severity || data.type),
    }, {
      createdAt,
      actorId: data.createdById || '',
      actorName,
      action: data.action || '',
      details: data.details || '',
    });
  });
}

function requestRows(documents: Array<{ id: string; data: Record<string, unknown> }>, maps: ReferenceMaps): Phase7NormalizedRow[] {
  return documents.map(({ id, data }) => {
    const requestedAt = dateOf(data.requestedAt);
    const requesterName = userName(maps, data.requestedById);
    const code = projectCode(maps, data.projectId);
    const lines = Array.isArray(data.lines) ? data.lines.map(dataOf) : [];
    const specIds = lines.map(line => stringOf(line.specId)).filter(Boolean);
    return row(id, [code, data.jobNumberSnapshot, requesterName, data.status, ...specIds.map(spec => specLabel(maps, spec))], requestedAt, {
      status: stringOf(data.status),
      requesterId: stringOf(data.requestedById),
      projectId: stringOf(data.projectId),
      specId: specIds,
    }, {
      requestedAt,
      status: data.status || '',
      projectId: data.projectId || '',
      projectCode: code,
      requesterId: data.requestedById || '',
      requesterName,
      jobNumber: data.jobNumberSnapshot || '',
      lines,
    });
  });
}

function returnRows(documents: Array<{ id: string; data: Record<string, unknown> }>, maps: ReferenceMaps): Phase7NormalizedRow[] {
  const result: Phase7NormalizedRow[] = [];
  documents.forEach(({ id: bagId, data: bag }) => {
    const returns = Array.isArray(bag.returns) && bag.returns.length
      ? bag.returns.map(dataOf)
      : stringOf(bag.status) === 'RETURNED_PENDING_COUNT'
        ? [{ id: `legacy-${bagId}`, status: 'PENDING', submittedAt: bag.returnedAt, notes: bag.returnedNotes, lines: bag.returnedLines }]
        : [];
    returns.forEach((returnTx, index) => {
      const id = stringOf(returnTx.id) || `${bagId}:${index}`;
      const submittedAt = dateOf(returnTx.submittedAt, bag.returnedAt);
      const holderName = userName(maps, bag.issuedToId);
      const code = projectCode(maps, bag.projectId);
      const lines = Array.isArray(returnTx.lines) ? returnTx.lines.map(dataOf) : [];
      const specIds = lines.map(line => stringOf(line.specId)).filter(Boolean);
      result.push(row(id, [code, bag.bagNumber, holderName, returnTx.status, returnTx.notes], submittedAt, {
        status: stringOf(returnTx.status),
        holderId: stringOf(bag.issuedToId),
        projectId: stringOf(bag.projectId),
        bagNumber: stringOf(bag.bagNumber),
        specId: specIds,
      }, {
        bagId,
        submittedAt,
        status: returnTx.status || '',
        projectId: bag.projectId || '',
        projectCode: code,
        bagNumber: bag.bagNumber || '',
        holderId: bag.issuedToId || '',
        holderName,
        notes: returnTx.notes || '',
        lines,
      }));
    });
  });
  return result;
}

const MAX_REPORT_CANDIDATES = 10_000;

function indexedCandidateQuery(
  section: Phase7ReportSection,
  request: Phase7FilterRequest,
): FirebaseFirestore.Query {
  const db = getFirestore();
  const collectionName = SECTION_COLLECTIONS[section];
  let query: FirebaseFirestore.Query = db.collection(collectionName);
  const indexedField = ({
    PROJECT_HISTORY: 'status',
    WEEKLY_MOVEMENT: 'movementType',
    INVENTORY_LEDGER: 'type',
    BROKEN_STONES: 'type',
    SYSTEM_LOGS: 'action',
    ALL_PROJECTS: 'status',
    REQUESTS: 'status',
    RETURNS: '',
  } as Record<Phase7ReportSection, string>)[section];
  const requestedValues = section === 'BROKEN_STONES'
    ? ['BROKEN_OUT']
    : indexedField
      ? (request.selections?.[indexedField] || []).filter(Boolean)
      : [];
  if (indexedField && requestedValues.length === 1) {
    query = query.where(indexedField, '==', requestedValues[0]);
  } else if (indexedField && requestedValues.length > 1 && requestedValues.length <= 10) {
    query = query.where(indexedField, 'in', requestedValues);
  }
  return query.limit(MAX_REPORT_CANDIDATES + 1);
}

async function loadRows(
  section: Phase7ReportSection,
  actorLocation: unknown,
  request: Phase7FilterRequest,
): Promise<Phase7NormalizedRow[]> {
  const db = getFirestore();
  const [primary, users, projects, specs] = await Promise.all([
    indexedCandidateQuery(section, request).get(),
    db.collection('users').get(),
    db.collection('projects').get(),
    db.collection('specs').get(),
  ]);
  if (primary.size > MAX_REPORT_CANDIDATES) {
    throw new HttpsError(
      'resource-exhausted',
      'This report has more than 10,000 candidate rows. Add a status, type, or action filter and try again.',
    );
  }
  const maps: ReferenceMaps = {
    users: new Map(users.docs.map(document => [document.id, document.data()])),
    projects: new Map(projects.docs.map(document => [document.id, document.data()])),
    specs: new Map(specs.docs.map(document => [document.id, document.data()])),
  };
  const documents = primary.docs.map(document => ({ id: document.id, data: document.data() }));
  if (section === 'PROJECT_HISTORY' || section === 'ALL_PROJECTS') return projectRows(documents, maps);
  if (section === 'WEEKLY_MOVEMENT') return ledgerRows(documents, maps, actorLocation);
  if (section === 'INVENTORY_LEDGER') return movementRows(documents, maps, actorLocation, false);
  if (section === 'BROKEN_STONES') return movementRows(documents, maps, actorLocation, true);
  if (section === 'SYSTEM_LOGS') return logRows(documents, maps);
  if (section === 'REQUESTS') return requestRows(documents, maps);
  return returnRows(documents, maps);
}

function normalizedRequest(value: unknown): Phase7FilterRequest {
  const input = dataOf(value);
  if (!isPhase7ReportSection(input.section)) {
    throw new HttpsError('invalid-argument', 'A supported report section is required.');
  }
  const dateRange = dataOf(input.dateRange);
  return {
    section: input.section,
    search: stringOf(input.search).slice(0, 200),
    selections: sanitizePhase7Selections(input.selections),
    dateRange: {
      from: stringOf(dateRange.from).slice(0, 10) || undefined,
      to: stringOf(dateRange.to).slice(0, 10) || undefined,
    },
    pageSize: Number(input.pageSize || 25),
    cursor: stringOf(input.cursor) || undefined,
  };
}

async function authorize(section: Phase7ReportSection, request: Parameters<typeof requireActor>[0]) {
  const actor = await requireActor(request);
  if (section !== 'ALL_PROJECTS' && actor.profile.role !== 'Manager' && actor.profile.role !== 'Designer') {
    throw new HttpsError('permission-denied', 'Reports are available only to Managers and Designers.');
  }
  if (MANAGER_ONLY.has(section) && actor.profile.role !== 'Manager') {
    throw new HttpsError('permission-denied', 'Requests and Returns reports are Manager-only.');
  }
  return actor;
}

async function evaluate(request: Phase7FilterRequest, actorLocation: unknown): Promise<Phase7NormalizedRow[]> {
  const filtered = filterPhase7Rows(await loadRows(request.section, actorLocation, request), request);
  if (request.section === 'ALL_PROJECTS') {
    return [...filtered].sort((left, right) => {
      const leftData = left.data;
      const rightData = right.data;
      const leftRush = stringOf(leftData.priority) === 'Rush' ? 1 : 0;
      const rightRush = stringOf(rightData.priority) === 'Rush' ? 1 : 0;
      if (leftRush !== rightRush) return rightRush - leftRush;
      const leftDue = new Date(stringOf(leftData.dueDate)).getTime();
      const rightDue = new Date(stringOf(rightData.dueDate)).getTime();
      if (Number.isFinite(leftDue) && Number.isFinite(rightDue) && leftDue !== rightDue) return rightDue - leftDue;
      if (Number.isFinite(leftDue) !== Number.isFinite(rightDue)) return Number.isFinite(leftDue) ? -1 : 1;
      const leftUpdated = new Date(stringOf(leftData.updatedAt)).getTime() || 0;
      const rightUpdated = new Date(stringOf(rightData.updatedAt)).getTime() || 0;
      if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
      return left.id.localeCompare(right.id);
    });
  }
  return sortPhase7Rows(filtered);
}

export const queryPhase7Report = onCall(CALLABLE_OPTIONS, async callableRequest => {
  const request = normalizedRequest(callableRequest.data);
  const actor = await authorize(request.section, callableRequest);
  const actorLocation = (actor.profile as typeof actor.profile & { location?: unknown }).location;
  const page = paginatePhase7Rows(await evaluate(request, actorLocation), request.pageSize, request.cursor);
  return {
    ...page,
    rows: page.rows.map(reportRow => reportRow.data),
    section: request.section,
  };
});

export const exportPhase7ReportCsv = onCall(CALLABLE_OPTIONS, async callableRequest => {
  const request = normalizedRequest(callableRequest.data);
  const actor = await authorize(request.section, callableRequest);
  const actorLocation = (actor.profile as typeof actor.profile & { location?: unknown }).location;
  const rows = await evaluate(request, actorLocation);
  if (rows.length > 5000) {
    throw new HttpsError('resource-exhausted', 'Narrow the report to 5,000 rows or fewer before exporting.');
  }
  const columns = EXPORT_COLUMNS[request.section];
  return {
    section: request.section,
    total: rows.length,
    columns,
    csv: renderPhase7Csv(rows.map(reportRow => reportRow.data), columns),
  };
});
