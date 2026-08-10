import {
  BagStatus,
  DiamondBag,
  DiamondSpec,
  Project,
  ProjectStatus,
  Role,
  User,
} from '../types';

export const STAFF_PERFORMANCE_TIME_ZONE = 'America/Toronto';
export const STAFF_PERFORMANCE_TRACKING_START = '2026-07-24T19:24:13.156Z';

export interface StaffProjectView {
  projectId: string;
  code: string;
  pieceName: string;
  status: ProjectStatus;
  stageName: string;
  progress: number;
  dueDate: string;
  assignedAt: string | null;
  daysAssigned: number | null;
  timingQuality: 'tracked_period' | 'historical_record' | 'unavailable';
}

export interface StaffBagItemView {
  specId: string;
  label: string;
  issuedPcs: number;
  averageWeightSnapshot: number | null;
}

export interface StaffBagView {
  bagId: string;
  bagNumber: string;
  projectId: string;
  projectCode: string;
  issuedAt: string | null;
  daysHeld: number | null;
  status: BagStatus;
  inHand: boolean;
  pendingReturn: boolean;
  items: StaffBagItemView[];
}

export interface StaffDiamondUsageView {
  bagId: string;
  bagNumber: string;
  projectId: string;
  projectCode: string;
  confirmedAt: string;
  stonesSet: number;
  estimatedCaratsSet: number;
  piecesMissingWeightSnapshot: number;
}

export interface StaffMonthlyMetric {
  key: string;
  label: string;
  stonesSet: number;
  estimatedCaratsSet: number;
}

export interface StaffSpecMetric {
  specId: string;
  label: string;
  stonesSet: number;
  estimatedCaratsSet: number;
}

export interface StaffPerformanceSnapshot {
  user: User;
  activeProjects: StaffProjectView[];
  bags: StaffBagView[];
  confirmedUsage: StaffDiamondUsageView[];
  monthly: StaffMonthlyMetric[];
  specs: StaffSpecMetric[];
  activeProjectCount: number;
  bagsInHandCount: number;
  pendingReturnCount: number;
  stonesSetSinceTracking: number;
  estimatedCaratsSinceTracking: number;
  currentMonthStones: number;
  currentMonthEstimatedCarats: number;
  piecesMissingWeightSnapshot: number;
  isOverridden?: boolean;
  overrideReason?: string;
  originalCalculated?: {
    activeProjectCount: number;
    bagsInHandCount: number;
    pendingReturnCount: number;
    stonesSetSinceTracking: number;
    estimatedCaratsSinceTracking: number;
    currentMonthStones: number;
    currentMonthEstimatedCarats: number;
  };
}

interface BuildStaffPerformanceInput {
  users: User[];
  projects: Project[];
  bags: DiamondBag[];
  specs: DiamondSpec[];
  now?: Date;
  trackingStartIso?: string;
}

const normalize = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const validNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const validIso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
};

const identitiesFor = (user: User) => new Set([
  user.id,
  user.authUid,
  user.name,
  user.email,
  user.email?.split('@')[0],
  ...(user.legacyProfileIds || []),
].map(normalize).filter(Boolean));

const matchesUser = (value: unknown, identities: Set<string>) => (
  Boolean(normalize(value)) && identities.has(normalize(value))
);

function assignmentFor(project: Project, user: User) {
  const identities = identitiesFor(user);
  const assignments = (project.assignments || []).filter(assignment => (
    assignment.active !== false && matchesUser(assignment.userId, identities)
  ));
  const direct = user.role === Role.SETTER
    ? (project as Project & { assignedSetterId?: string }).assignedSetterId
    : (project as Project & { assignedJewellerId?: string }).assignedJewellerId;
  const activeAssignee = (project.activeAssignees || []).some(value => matchesUser(value, identities));
  const directlyAssigned = matchesUser(direct, identities);
  if (!assignments.length && !activeAssignee && !directlyAssigned) return null;

  const dates = assignments
    .map(assignment => validIso(assignment.assignedAt))
    .filter((value): value is string => Boolean(value))
    .sort();
  return { assignedAt: dates[0] || null };
}

function torontoMonthParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STAFF_PERFORMANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value || 0);
  const month = Number(parts.find(part => part.type === 'month')?.value || 0);
  return { year, month };
}

export function torontoMonthKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const { year, month } = torontoMonthParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function recentTorontoMonths(now: Date, count = 6): StaffMonthlyMetric[] {
  const current = torontoMonthParts(now);
  return Array.from({ length: count }, (_, reverseIndex) => {
    const offset = count - reverseIndex - 1;
    const absoluteMonth = current.year * 12 + current.month - 1 - offset;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      timeZone: STAFF_PERFORMANCE_TIME_ZONE,
    }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
    return { key, label, stonesSet: 0, estimatedCaratsSet: 0 };
  });
}

function confirmedReturns(bag: DiamondBag) {
  return (bag.returns || []).filter(item => item.status === 'CONFIRMED');
}

function confirmedReturnDate(bag: DiamondBag): string | null {
  return confirmedReturns(bag)
    .map(item => validIso(item.confirmedAt))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) || null;
}

function returnedPieces(bag: DiamondBag, specId: string) {
  return confirmedReturns(bag).reduce((total, item) => {
    const line = item.lines.find(candidate => candidate.specId === specId);
    return total + validNumber(line?.confirmedPcs ?? line?.returnedPcs);
  }, 0);
}

function brokenPieces(bag: DiamondBag, specId: string) {
  return confirmedReturns(bag).reduce((total, item) => {
    const explicit = item.confirmedBreakageLines;
    if (Array.isArray(explicit)) {
      return total + explicit
        .filter(line => line.specId === specId)
        .reduce((sum, line) => sum + validNumber(line.pieces), 0);
    }
    const line = item.lines.find(candidate => candidate.specId === specId);
    return total + validNumber(line?.confirmedBrokenPcs);
  }, 0);
}

function dayDifference(startIso: string | null, now: Date) {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now.getTime() - start) / 86_400_000));
}

export function buildStaffPerformance({
  users,
  projects,
  bags,
  specs,
  now = new Date(),
  trackingStartIso = STAFF_PERFORMANCE_TRACKING_START,
}: BuildStaffPerformanceInput): StaffPerformanceSnapshot[] {
  const trackingStart = new Date(trackingStartIso).getTime();
  const specMap = new Map(specs.map(spec => [spec.id, spec]));
  const projectMap = new Map(projects.map(project => [project.id, project]));
  const staff = users.filter(user => (
    user.active !== false && (user.role === Role.SETTER || user.role === Role.JEWELLER)
  ));

  return staff.map(user => {
    const identities = identitiesFor(user);
    const activeProjects = projects
      .filter(project => project.status !== ProjectStatus.CLOSED)
      .map(project => ({ project, assignment: assignmentFor(project, user) }))
      .filter((entry): entry is { project: Project; assignment: { assignedAt: string | null } } => Boolean(entry.assignment))
      .map(({ project, assignment }) => {
        const assignedMs = assignment.assignedAt ? new Date(assignment.assignedAt).getTime() : Number.NaN;
        return {
          projectId: project.id,
          code: project.code,
          pieceName: project.pieceName,
          status: project.status,
          stageName: project.currentStageName,
          progress: project.currentPercentComplete,
          dueDate: project.dueDate,
          assignedAt: assignment.assignedAt,
          daysAssigned: dayDifference(assignment.assignedAt, now),
          timingQuality: !assignment.assignedAt
            ? 'unavailable' as const
            : assignedMs >= trackingStart
              ? 'tracked_period' as const
              : 'historical_record' as const,
        };
      })
      .sort((left, right) => (
        (left.dueDate || '9999').localeCompare(right.dueDate || '9999')
        || left.code.localeCompare(right.code)
      ));

    const staffBags = bags.filter(bag => matchesUser(bag.issuedToId, identities));
    const bagViews = staffBags
      .filter(bag => bag.status === BagStatus.ISSUED || bag.status === BagStatus.RETURNED_PENDING_COUNT)
      .map(bag => ({
        bagId: bag.id,
        bagNumber: bag.bagNumber,
        projectId: bag.projectId,
        projectCode: projectMap.get(bag.projectId)?.code || bag.jobNumberSnapshot || 'Unknown project',
        issuedAt: validIso(bag.issuedAt),
        daysHeld: bag.status === BagStatus.ISSUED ? dayDifference(validIso(bag.issuedAt), now) : null,
        status: bag.status,
        inHand: bag.status === BagStatus.ISSUED,
        pendingReturn: bag.status === BagStatus.RETURNED_PENDING_COUNT,
        items: (bag.items || []).map(item => ({
          specId: item.specId,
          label: specMap.get(item.specId)?.label || item.specId,
          issuedPcs: validNumber(item.issuedPcs),
          averageWeightSnapshot: validNumber(item.averageWeightSnapshot) > 0
            ? validNumber(item.averageWeightSnapshot)
            : null,
        })),
      }))
      .sort((left, right) => (
        Number(right.inHand) - Number(left.inHand)
        || (right.issuedAt || '').localeCompare(left.issuedAt || '')
      ));

    const specTotals = new Map<string, StaffSpecMetric>();
    const usage = staffBags
      .filter(bag => bag.status === BagStatus.COUNTED_CONFIRMED)
      .map(bag => {
        const confirmedAt = confirmedReturnDate(bag);
        if (!confirmedAt || new Date(confirmedAt).getTime() < trackingStart) return null;
        let stonesSet = 0;
        let estimatedCaratsSet = 0;
        let piecesMissingWeightSnapshot = 0;

        (bag.items || []).forEach(item => {
          const issued = validNumber(item.issuedPcs);
          const used = Math.max(0, issued - returnedPieces(bag, item.specId) - brokenPieces(bag, item.specId));
          const averageWeight = validNumber(item.averageWeightSnapshot);
          const estimatedCarats = averageWeight > 0 ? used * averageWeight : 0;
          stonesSet += used;
          estimatedCaratsSet += estimatedCarats;
          if (used > 0 && averageWeight <= 0) piecesMissingWeightSnapshot += used;

          const current = specTotals.get(item.specId) || {
            specId: item.specId,
            label: specMap.get(item.specId)?.label || item.specId,
            stonesSet: 0,
            estimatedCaratsSet: 0,
          };
          current.stonesSet += used;
          current.estimatedCaratsSet += estimatedCarats;
          specTotals.set(item.specId, current);
        });

        return {
          bagId: bag.id,
          bagNumber: bag.bagNumber,
          projectId: bag.projectId,
          projectCode: projectMap.get(bag.projectId)?.code || bag.jobNumberSnapshot || 'Unknown project',
          confirmedAt,
          stonesSet,
          estimatedCaratsSet,
          piecesMissingWeightSnapshot,
        };
      })
      .filter((entry): entry is StaffDiamondUsageView => Boolean(entry))
      .sort((left, right) => right.confirmedAt.localeCompare(left.confirmedAt));

    const monthly = recentTorontoMonths(now);
    const monthlyMap = new Map(monthly.map(month => [month.key, month]));
    usage.forEach(entry => {
      const month = monthlyMap.get(torontoMonthKey(entry.confirmedAt));
      if (!month) return;
      month.stonesSet += entry.stonesSet;
      month.estimatedCaratsSet += entry.estimatedCaratsSet;
    });
    const currentMonth = monthly.at(-1)!;

    const calcActiveProjectCount = activeProjects.length;
    const calcBagsInHandCount = bagViews.filter(bag => bag.inHand).length;
    const calcPendingReturnCount = bagViews.filter(bag => bag.pendingReturn).length;
    const calcStonesSetSinceTracking = usage.reduce((sum, entry) => sum + entry.stonesSet, 0);
    const calcEstimatedCaratsSinceTracking = usage.reduce((sum, entry) => sum + entry.estimatedCaratsSet, 0);
    const calcCurrentMonthStones = currentMonth.stonesSet;
    const calcCurrentMonthEstimatedCarats = currentMonth.estimatedCaratsSet;

    const overrides = user.performanceOverrides;
    const isOverridden = Boolean(
      overrides && (
        (overrides.activeProjectCount !== undefined && overrides.activeProjectCount !== null) ||
        (overrides.bagsInHandCount !== undefined && overrides.bagsInHandCount !== null) ||
        (overrides.pendingReturnCount !== undefined && overrides.pendingReturnCount !== null) ||
        (overrides.stonesSet !== undefined && overrides.stonesSet !== null) ||
        (overrides.currentMonthEstimatedCarats !== undefined && overrides.currentMonthEstimatedCarats !== null) ||
        (overrides.currentMonthStones !== undefined && overrides.currentMonthStones !== null)
      )
    );

    return {
      user,
      activeProjects,
      bags: bagViews,
      confirmedUsage: usage,
      monthly,
      specs: [...specTotals.values()].sort((left, right) => (
        right.stonesSet - left.stonesSet || left.label.localeCompare(right.label)
      )),
      activeProjectCount: (overrides?.activeProjectCount !== undefined && overrides?.activeProjectCount !== null) ? overrides.activeProjectCount : calcActiveProjectCount,
      bagsInHandCount: (overrides?.bagsInHandCount !== undefined && overrides?.bagsInHandCount !== null) ? overrides.bagsInHandCount : calcBagsInHandCount,
      pendingReturnCount: (overrides?.pendingReturnCount !== undefined && overrides?.pendingReturnCount !== null) ? overrides.pendingReturnCount : calcPendingReturnCount,
      stonesSetSinceTracking: (overrides?.stonesSet !== undefined && overrides?.stonesSet !== null) ? overrides.stonesSet : calcStonesSetSinceTracking,
      estimatedCaratsSinceTracking: (overrides?.currentMonthEstimatedCarats !== undefined && overrides?.currentMonthEstimatedCarats !== null) ? overrides.currentMonthEstimatedCarats : calcEstimatedCaratsSinceTracking,
      currentMonthStones: (overrides?.currentMonthStones !== undefined && overrides?.currentMonthStones !== null) ? overrides.currentMonthStones : calcCurrentMonthStones,
      currentMonthEstimatedCarats: (overrides?.currentMonthEstimatedCarats !== undefined && overrides?.currentMonthEstimatedCarats !== null) ? overrides.currentMonthEstimatedCarats : calcCurrentMonthEstimatedCarats,
      piecesMissingWeightSnapshot: usage.reduce((sum, entry) => sum + entry.piecesMissingWeightSnapshot, 0),
      isOverridden,
      overrideReason: overrides?.reason,
      originalCalculated: {
        activeProjectCount: calcActiveProjectCount,
        bagsInHandCount: calcBagsInHandCount,
        pendingReturnCount: calcPendingReturnCount,
        stonesSetSinceTracking: calcStonesSetSinceTracking,
        estimatedCaratsSinceTracking: calcEstimatedCaratsSinceTracking,
        currentMonthStones: calcCurrentMonthStones,
        currentMonthEstimatedCarats: calcCurrentMonthEstimatedCarats,
      },
    };
  }).sort((left, right) => left.user.name.localeCompare(right.user.name));
}

export interface TeamOverviewMetrics {
  totalTeamMembers: number;
  assignedTeamMembersCount: number;
  totalActiveProjects: number;
  avgProjectsPerMember: number;

  totalBagsInHand: number;
  totalPendingReturn: number;
  totalOutstandingBags: number;
  inHandPercentage: number;
  pendingPercentage: number;

  totalStonesSetSinceTracking: number;
  totalEstimatedCaratsSinceTracking: number;
  monthlyTeamTrend: StaffMonthlyMetric[];

  setterCount: number;
  jewellerCount: number;
  setterActiveProjects: number;
  jewellerActiveProjects: number;
}

export function buildTeamOverviewMetrics(snapshots: StaffPerformanceSnapshot[]): TeamOverviewMetrics {
  const totalTeamMembers = snapshots.length;
  const assignedTeamMembersCount = snapshots.filter(s => s.activeProjectCount > 0).length;
  const totalActiveProjects = snapshots.reduce((sum, s) => sum + s.activeProjectCount, 0);
  const avgProjectsPerMember = totalTeamMembers > 0 ? +(totalActiveProjects / totalTeamMembers).toFixed(1) : 0;

  const totalBagsInHand = snapshots.reduce((sum, s) => sum + s.bagsInHandCount, 0);
  const totalPendingReturn = snapshots.reduce((sum, s) => sum + s.pendingReturnCount, 0);
  const totalOutstandingBags = totalBagsInHand + totalPendingReturn;
  const inHandPercentage = totalOutstandingBags > 0 ? Math.round((totalBagsInHand / totalOutstandingBags) * 100) : 0;
  const pendingPercentage = totalOutstandingBags > 0 ? 100 - inHandPercentage : 0;

  const totalStonesSetSinceTracking = snapshots.reduce((sum, s) => sum + s.stonesSetSinceTracking, 0);
  const totalEstimatedCaratsSinceTracking = snapshots.reduce((sum, s) => sum + s.estimatedCaratsSinceTracking, 0);

  const monthlyTeamMap = new Map<string, StaffMonthlyMetric>();
  snapshots.forEach(s => {
    s.monthly.forEach(m => {
      const existing = monthlyTeamMap.get(m.key) || { key: m.key, label: m.label, stonesSet: 0, estimatedCaratsSet: 0 };
      existing.stonesSet += m.stonesSet;
      existing.estimatedCaratsSet += m.estimatedCaratsSet;
      monthlyTeamMap.set(m.key, existing);
    });
  });
  const monthlyTeamTrend = Array.from(monthlyTeamMap.values());

  const setters = snapshots.filter(s => s.user.role === Role.SETTER);
  const jewellers = snapshots.filter(s => s.user.role === Role.JEWELLER);
  const setterCount = setters.length;
  const jewellerCount = jewellers.length;
  const setterActiveProjects = setters.reduce((sum, s) => sum + s.activeProjectCount, 0);
  const jewellerActiveProjects = jewellers.reduce((sum, s) => sum + s.activeProjectCount, 0);

  return {
    totalTeamMembers,
    assignedTeamMembersCount,
    totalActiveProjects,
    avgProjectsPerMember,
    totalBagsInHand,
    totalPendingReturn,
    totalOutstandingBags,
    inHandPercentage,
    pendingPercentage,
    totalStonesSetSinceTracking,
    totalEstimatedCaratsSinceTracking,
    monthlyTeamTrend,
    setterCount,
    jewellerCount,
    setterActiveProjects,
    jewellerActiveProjects,
  };
}

