import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { build } from 'esbuild';

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `kilani-staff-performance-${process.pid}.mjs`);
const exportBundlePath = path.join(os.tmpdir(), `kilani-team-export-${process.pid}.mjs`);

await build({
  entryPoints: [path.join(root, 'services/staffPerformance.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
});

const {
  STAFF_PERFORMANCE_TRACKING_START,
  buildStaffPerformance,
  buildTeamOverviewMetrics,
  torontoMonthKey,
} = await import(`file://${bundlePath}?v=${Date.now()}`);

after(async () => {
  await fs.rm(bundlePath, { force: true });
  await fs.rm(exportBundlePath, { force: true });
});

const setter = {
  id: 'setter-1',
  authUid: 'setter-auth-1',
  legacyProfileIds: ['legacy-setter'],
  name: 'Ava Setter',
  email: 'ava@kilani.com',
  role: 'Setter',
  active: true,
};

const jeweller = {
  id: 'jeweller-1',
  authUid: 'jeweller-auth-1',
  name: 'Jacob Jeweller',
  email: 'jacob@kilani.com',
  role: 'Jeweller',
  active: true,
};

const project = {
  id: 'project-1',
  code: 'K-100',
  pieceName: 'Diamond ring',
  status: 'Active',
  dueDate: '2026-08-20',
  currentStageName: 'Setting',
  currentPercentComplete: 80,
  assignments: [{ userId: 'legacy-setter', assignedAt: '2026-07-25T14:00:00.000Z', active: true }],
  activeAssignees: ['setter-auth-1'],
  services: [],
  progress: [],
  priority: 'Normal',
  createdAt: '2026-07-20T12:00:00.000Z',
};

const specs = [{ id: 'round-1', label: '1.2mm Round', sizeMm: 1.2, ctPerStone: 0.01, defaultCostPerCtUsd: 100 }];

test('confirmed usage applies issued minus Manager-confirmed returned and broken pieces', () => {
  const bags = [{
    id: 'bag-1',
    bagNumber: 'K-100',
    projectId: 'project-1',
    issuedToId: 'setter-auth-1',
    issuedById: 'manager-1',
    issuedAt: '2026-07-25T15:00:00.000Z',
    status: 'Counted_Confirmed',
    items: [{ specId: 'round-1', issuedPcs: 100, averageWeightSnapshot: 0.01 }],
    returns: [{
      id: 'return-1',
      projectId: 'project-1',
      bagId: 'bag-1',
      bagNumber: 'K-100',
      setterId: 'setter-auth-1',
      submittedAt: '2026-08-03T12:00:00.000Z',
      confirmedAt: '2026-08-03T15:00:00.000Z',
      status: 'CONFIRMED',
      lines: [{ specId: 'round-1', returnedPcs: 20, confirmedPcs: 20 }],
      confirmedBreakageLines: [{ specId: 'round-1', pieces: 5 }],
    }],
  }];

  const [summary] = buildStaffPerformance({
    users: [setter],
    projects: [project],
    bags,
    specs,
    now: new Date('2026-08-10T12:00:00.000Z'),
  });

  assert.equal(summary.activeProjectCount, 1);
  assert.equal(summary.stonesSetSinceTracking, 75);
  assert.equal(summary.estimatedCaratsSinceTracking, 0.75);
  assert.equal(summary.currentMonthStones, 75);
  assert.equal(summary.currentMonthEstimatedCarats, 0.75);
  assert.equal(summary.activeProjects[0].timingQuality, 'tracked_period');
});

test('unreturned bags stay in hand and never count as stones set', () => {
  const bags = [
    {
      id: 'bag-open',
      bagNumber: 'K-100A',
      projectId: 'project-1',
      issuedToId: 'setter-1',
      issuedById: 'manager-1',
      issuedAt: '2026-08-01T12:00:00.000Z',
      status: 'Issued',
      items: [{ specId: 'round-1', issuedPcs: 40, averageWeightSnapshot: 0.01 }],
    },
    {
      id: 'bag-pending',
      bagNumber: 'K-100B',
      projectId: 'project-1',
      issuedToId: 'setter-1',
      issuedById: 'manager-1',
      issuedAt: '2026-08-01T12:00:00.000Z',
      status: 'Returned_Pending_Count',
      items: [{ specId: 'round-1', issuedPcs: 30, averageWeightSnapshot: 0.01 }],
    },
  ];

  const [summary] = buildStaffPerformance({
    users: [setter],
    projects: [project],
    bags,
    specs,
    now: new Date('2026-08-10T12:00:00.000Z'),
  });

  assert.equal(summary.bagsInHandCount, 1);
  assert.equal(summary.pendingReturnCount, 1);
  assert.equal(summary.stonesSetSinceTracking, 0);
});

test('returns before the tracking release are excluded and missing weight is never guessed', () => {
  const bags = [{
    id: 'bag-old',
    bagNumber: 'OLD',
    projectId: 'project-1',
    issuedToId: 'setter-1',
    issuedById: 'manager-1',
    issuedAt: '2026-07-01T12:00:00.000Z',
    status: 'Counted_Confirmed',
    items: [{ specId: 'round-1', issuedPcs: 10 }],
    returns: [{
      id: 'return-old',
      projectId: 'project-1',
      bagId: 'bag-old',
      bagNumber: 'OLD',
      setterId: 'setter-1',
      submittedAt: '2026-07-20T12:00:00.000Z',
      confirmedAt: '2026-07-20T12:00:00.000Z',
      status: 'CONFIRMED',
      lines: [{ specId: 'round-1', returnedPcs: 0, confirmedPcs: 0 }],
    }],
  }, {
    id: 'bag-new',
    bagNumber: 'NEW',
    projectId: 'project-1',
    issuedToId: 'setter-1',
    issuedById: 'manager-1',
    issuedAt: STAFF_PERFORMANCE_TRACKING_START,
    status: 'Counted_Confirmed',
    items: [{ specId: 'round-1', issuedPcs: 12 }],
    returns: [{
      id: 'return-new',
      projectId: 'project-1',
      bagId: 'bag-new',
      bagNumber: 'NEW',
      setterId: 'setter-1',
      submittedAt: '2026-08-02T12:00:00.000Z',
      confirmedAt: '2026-08-02T12:00:00.000Z',
      status: 'CONFIRMED',
      lines: [{ specId: 'round-1', returnedPcs: 2, confirmedPcs: 2 }],
    }],
  }];

  const [summary] = buildStaffPerformance({
    users: [setter],
    projects: [project],
    bags,
    specs,
    now: new Date('2026-08-10T12:00:00.000Z'),
  });

  assert.equal(summary.stonesSetSinceTracking, 10);
  assert.equal(summary.estimatedCaratsSinceTracking, 0);
  assert.equal(summary.piecesMissingWeightSnapshot, 10);
});

test('monthly attribution uses Toronto time at the UTC month boundary', () => {
  assert.equal(torontoMonthKey('2026-08-01T02:00:00.000Z'), '2026-07');
  assert.equal(torontoMonthKey('2026-08-01T05:00:00.000Z'), '2026-08');
});

test('buildTeamOverviewMetrics aggregates capacity, bag status distribution, confirmed output, and workload mix', () => {
  const bags = [
    {
      id: 'bag-open',
      bagNumber: 'K-100A',
      projectId: 'project-1',
      issuedToId: 'setter-1',
      issuedById: 'manager-1',
      issuedAt: '2026-08-01T12:00:00.000Z',
      status: 'Issued',
      items: [{ specId: 'round-1', issuedPcs: 40, averageWeightSnapshot: 0.01 }],
    },
    {
      id: 'bag-pending',
      bagNumber: 'K-100B',
      projectId: 'project-1',
      issuedToId: 'setter-1',
      issuedById: 'manager-1',
      issuedAt: '2026-08-01T12:00:00.000Z',
      status: 'Returned_Pending_Count',
      items: [{ specId: 'round-1', issuedPcs: 30, averageWeightSnapshot: 0.01 }],
    },
  ];

  const snapshots = buildStaffPerformance({
    users: [setter, jeweller],
    projects: [project],
    bags,
    specs,
    now: new Date('2026-08-10T12:00:00.000Z'),
  });

  const overview = buildTeamOverviewMetrics(snapshots);

  assert.equal(overview.totalTeamMembers, 2);
  assert.equal(overview.assignedTeamMembersCount, 1);
  assert.equal(overview.totalActiveProjects, 1);
  assert.equal(overview.avgProjectsPerMember, 0.5);
  assert.equal(overview.totalBagsInHand, 1);
  assert.equal(overview.totalPendingReturn, 1);
  assert.equal(overview.totalOutstandingBags, 2);
  assert.equal(overview.inHandPercentage, 50);
  assert.equal(overview.pendingPercentage, 50);
  assert.equal(overview.setterCount, 1);
  assert.equal(overview.jewellerCount, 1);
  assert.equal(overview.setterActiveProjects, 1);
  assert.equal(overview.jewellerActiveProjects, 0);
});

test('Reports Hub exposes Team dashboard only to Managers, uses Team label, and supports routing and PDF/CSV export actions', async () => {
  const reports = await fs.readFile(path.join(root, 'pages/ReportsPage.tsx'), 'utf8');
  const dashboard = await fs.readFile(path.join(root, 'components/reports/StaffPerformanceDashboard.tsx'), 'utf8');
  const app = await fs.readFile(path.join(root, 'App.tsx'), 'utf8');
  const teamExport = await fs.readFile(path.join(root, 'utils/teamExportGenerator.ts'), 'utf8');

  // Renamed visible labels
  assert.match(reports, /isManager && \([\s\S]*<Users size=\{14\} \/>\s*Team/);
  assert.match(reports, /activeTab === 'staff' && isManager/);
  assert.match(dashboard, /id="team-heading"[\s\S]*Team/);
  assert.match(dashboard, /currentUser\?\.role !== Role\.MANAGER/);
  assert.match(dashboard, /Search team members by name, role, email, or location/);
  assert.match(dashboard, /No ranking or combined employee score is used/);

  // Routes & Same-tab Navigation
  assert.match(app, /path="\/reports\/team"/);
  assert.match(app, /path="\/reports\/team\/:memberId"/);
  assert.match(dashboard, /navigate\(`\/reports\/team\/\$\{snapshot\.user\.id\}`/);
  assert.match(dashboard, /Team Overview/);

  // PDF & CSV Export integration
  assert.match(dashboard, /Export PDF/);
  assert.match(dashboard, /Export CSV/);
  assert.match(teamExport, /generateTeamMemberPDF/);
  assert.match(teamExport, /generateTeamMemberCSV/);
  assert.match(teamExport, /INDIVIDUAL TEAM PERFORMANCE REPORT \(ESTIMATES\)/);
  assert.match(teamExport, /SUMMARY METRICS \(ESTIMATES\)/);
  assert.match(teamExport, /DATA QUALITY & METHODOLOGY NOTES/);
});

test('performanceOverrides override calculated metrics while keeping originalCalculated for auditing', () => {
  const overriddenSetter = {
    ...setter,
    performanceOverrides: {
      activeProjectCount: 5,
      bagsInHandCount: 12,
      stonesSet: 350,
      currentMonthEstimatedCarats: 4.5,
      reason: 'Physical inventory audit override',
      updatedAt: '2026-08-10T12:00:00.000Z',
    },
  };

  const [summary] = buildStaffPerformance({
    users: [overriddenSetter],
    projects: [project],
    bags: [],
    specs,
    now: new Date('2026-08-10T12:00:00.000Z'),
  });

  assert.equal(summary.isOverridden, true);
  assert.equal(summary.overrideReason, 'Physical inventory audit override');
  assert.equal(summary.activeProjectCount, 5);
  assert.equal(summary.bagsInHandCount, 12);
  assert.equal(summary.stonesSetSinceTracking, 350);
  assert.equal(summary.currentMonthEstimatedCarats, 4.5);

  // Original calculated values preserved
  assert.equal(summary.originalCalculated.activeProjectCount, 1);
  assert.equal(summary.originalCalculated.bagsInHandCount, 0);
  assert.equal(summary.originalCalculated.stonesSetSinceTracking, 0);
  assert.equal(summary.originalCalculated.currentMonthEstimatedCarats, 0);
});
