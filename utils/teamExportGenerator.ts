import { jsPDF } from 'jspdf';
import { StaffPerformanceSnapshot, STAFF_PERFORMANCE_TRACKING_START, STAFF_PERFORMANCE_TIME_ZONE } from '../services/staffPerformance';
import { Role, User } from '../types';

const formatTorontoDate = (value: string | null, includeTime = false) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STAFF_PERFORMANCE_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
};

const trackingStartLabel = formatTorontoDate(STAFF_PERFORMANCE_TRACKING_START);

export function generateTeamMemberCSV(snapshot: StaffPerformanceSnapshot): void {
  const timestamp = new Date().toLocaleString('en-CA', { timeZone: STAFF_PERFORMANCE_TIME_ZONE });
  const rows: string[] = [];

  const escapeCsv = (val: unknown) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const addLine = (...fields: unknown[]) => {
    rows.push(fields.map(escapeCsv).join(','));
  };

  // 1. Header & Metadata
  rows.push('KILANI DIAMOND LEDGER - TEAM MEMBER PERFORMANCE REPORT (ESTIMATES)');
  addLine('Member Name', 'Role', 'Location', 'Reporting Period', 'Generated Timestamp');
  addLine(snapshot.user.name, snapshot.user.role, snapshot.user.location || 'Location not set', `Since ${trackingStartLabel}`, timestamp);
  rows.push('');

  // 2. Performance Summary Metrics
  rows.push('SUMMARY METRICS (ESTIMATES)');
  addLine(
    'Active Projects',
    'Bags In Hand',
    'Pending Returns',
    'Stones Set (Since Tracking)',
    'Estimated Carats Set (Est.)',
    'This Month Stones',
    'This Month Carats (Est.)',
    'Pieces Missing Weight Snapshot'
  );
  addLine(
    snapshot.activeProjectCount,
    snapshot.bagsInHandCount,
    snapshot.pendingReturnCount,
    snapshot.stonesSetSinceTracking,
    snapshot.estimatedCaratsSinceTracking.toFixed(3),
    snapshot.currentMonthStones,
    snapshot.currentMonthEstimatedCarats.toFixed(3),
    snapshot.piecesMissingWeightSnapshot
  );
  rows.push('');

  // 3. Current Project Assignments
  rows.push('CURRENT ASSIGNMENTS');
  addLine('Project Code', 'Piece Name', 'Status', 'Stage', 'Progress (%)', 'Due Date', 'Assigned Date', 'Days Assigned', 'Timing Quality');
  if (snapshot.activeProjects.length === 0) {
    addLine('No current project assignments', '', '', '', '', '', '', '', '');
  } else {
    snapshot.activeProjects.forEach(p => {
      addLine(
        p.code,
        p.pieceName,
        p.status,
        p.stageName,
        `${p.progress}%`,
        p.dueDate || 'No due date',
        p.assignedAt ? formatTorontoDate(p.assignedAt) : 'Unavailable',
        p.daysAssigned !== null ? p.daysAssigned : 'Unavailable',
        p.timingQuality === 'tracked_period' ? 'Tracked period' : p.timingQuality === 'historical_record' ? 'Historical record' : 'Start unavailable'
      );
    });
  }
  rows.push('');

  // 4. Bags In Hand & Pending Returns
  rows.push('BAGS IN HAND AND PENDING RETURNS');
  addLine('Bag Number', 'Project Code', 'Status', 'In Hand', 'Issued Date', 'Days Held', 'Spec Label', 'Issued Pcs', 'Avg Weight Snapshot (ct)');
  if (snapshot.bags.length === 0) {
    addLine('No outstanding bags', '', '', '', '', '', '', '', '');
  } else {
    snapshot.bags.forEach(bag => {
      bag.items.forEach(item => {
        addLine(
          bag.bagNumber,
          bag.projectCode,
          bag.status,
          bag.inHand ? 'Yes' : 'No (Pending Count)',
          formatTorontoDate(bag.issuedAt),
          bag.daysHeld !== null ? bag.daysHeld : '-',
          item.label,
          item.issuedPcs,
          item.averageWeightSnapshot !== null ? item.averageWeightSnapshot.toFixed(4) : 'Missing'
        );
      });
    });
  }
  rows.push('');

  // 5. Diamond Specification Breakdown
  rows.push('DIAMOND SPECIFICATION BREAKDOWN (CONFIRMED)');
  addLine('Spec Label', 'Stones Set', 'Estimated Carats Set (Est.)');
  if (snapshot.specs.length === 0) {
    addLine('No confirmed diamond usage recorded', '', '');
  } else {
    snapshot.specs.forEach(s => {
      addLine(s.label, s.stonesSet, s.estimatedCaratsSet.toFixed(3));
    });
  }
  rows.push('');

  // 6. Monthly Output Trend (Toronto Time)
  rows.push('MONTHLY OUTPUT TREND (TORONTO TIME)');
  addLine('Month Key', 'Month Label', 'Confirmed Stones Set', 'Estimated Carats Set (Est.)');
  snapshot.monthly.forEach(m => {
    addLine(m.key, m.label, m.stonesSet, m.estimatedCaratsSet.toFixed(3));
  });
  rows.push('');

  // 7. Data Quality & Methodology Notes
  rows.push('DATA QUALITY & METHODOLOGY NOTES');
  addLine('Note Type', 'Details');
  addLine('Tracking Start Date', trackingStartLabel);
  if (snapshot.isOverridden) {
    addLine('Manager Override Status', `ACTIVE - ${snapshot.overrideReason || 'Manual adjustments applied'}`);
  }
  addLine('Missing Weight Snapshots', `${snapshot.piecesMissingWeightSnapshot} pieces used are missing a saved weight snapshot and excluded from carat totals.`);
  addLine('Calculation Policy', 'Stones set = Issued - Confirmed Returned - Confirmed Broken. Carats are estimates based on average weight snapshots. No employee rankings or scores are calculated.');

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Team_Member_${snapshot.user.name.replace(/\s+/g, '_')}_Performance_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateTeamMemberPDF(snapshot: StaffPerformanceSnapshot, currentUser: User | null): void {
  if (currentUser?.role !== Role.MANAGER) {
    throw new Error('Manager access required to export individual team member performance reports.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  let y = margin;

  const C_DARK = [18, 19, 24];
  const C_GOLD = [184, 134, 11];
  const C_GRAY = [100, 100, 100];
  const C_LIGHT_BG = [248, 249, 250];

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawFooter();
    }
  };

  const drawFooter = () => {
    const pageCount = (doc.internal as any).getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
    doc.text(`KILANI DIAMOND LEDGER · MANAGER-ONLY CONFIDENTIAL · Page ${pageCount}`, margin, pageHeight - 8);
    doc.text('Calculated carat values are estimates. No employee ranking policy.', pageWidth - margin, pageHeight - 8, { align: 'right' });
  };

  // --- HEADER ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
  doc.text('KILANI', margin, y);

  doc.setFontSize(10);
  doc.setTextColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
  doc.text('DIAMOND LEDGER', margin + 26, y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
  doc.text('INDIVIDUAL TEAM PERFORMANCE REPORT (ESTIMATES)', pageWidth - margin, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString('en-CA', { timeZone: STAFF_PERFORMANCE_TIME_ZONE })}`, pageWidth - margin, y, { align: 'right' });

  y += 6;
  doc.setDrawColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // --- MEMBER PROFILE METADATA BLOCK ---
  doc.setFillColor(C_LIGHT_BG[0], C_LIGHT_BG[1], C_LIGHT_BG[2]);
  doc.roundedRect(margin, y, usableWidth, 24, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
  doc.text(snapshot.user.name, margin + 4, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
  doc.text(`${snapshot.user.role.toUpperCase()} · ${snapshot.user.location || 'Location not set'}`, margin + 4, y + 14);

  doc.setFontSize(8);
  doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
  doc.text(`Reporting Period: Since ${trackingStartLabel}`, margin + 4, y + 19);

  // Quick Stats on right of block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
  doc.text(`Active Projects: ${snapshot.activeProjectCount}`, pageWidth - margin - 4, y + 7, { align: 'right' });
  doc.text(`Bags In Hand: ${snapshot.bagsInHandCount} (${snapshot.pendingReturnCount} pending)`, pageWidth - margin - 4, y + 12, { align: 'right' });
  doc.text(`Stones Set: ${snapshot.stonesSetSinceTracking.toLocaleString()} pcs`, pageWidth - margin - 4, y + 17, { align: 'right' });
  doc.text(`Estimated Carats: ${snapshot.estimatedCaratsSinceTracking.toFixed(3)} ct (Est.)`, pageWidth - margin - 4, y + 22, { align: 'right' });

  y += 30;

  // --- SECTION 1: DATA QUALITY & METHODOLOGY ---
  checkPageBreak(25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
  doc.text('1. Operational Policy & Data Quality Notes', margin, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
  doc.text(`• Confirmed tracking release date: ${trackingStartLabel}. Reliable stone set totals begin from this date.`, margin + 2, y);
  y += 4;
  doc.text('• Formula: Issued pieces − Manager-confirmed returned pieces − Manager-confirmed broken pieces = Stones Set.', margin + 2, y);
  y += 4;
  doc.text('• Carats are estimates based on average weight snapshots per bag item and explicitly labeled as estimates.', margin + 2, y);
  y += 4;
  if (snapshot.piecesMissingWeightSnapshot > 0) {
    doc.setTextColor(180, 80, 0);
    doc.text(`• Notice: ${snapshot.piecesMissingWeightSnapshot} confirmed set pieces lack a saved average weight snapshot and are excluded from carat estimates.`, margin + 2, y);
  } else {
    doc.setTextColor(0, 120, 60);
    doc.text('• Data Integrity: All confirmed set pieces have valid average weight snapshots for carat estimates.', margin + 2, y);
  }
  y += 8;

  // --- SECTION 2: CURRENT PROJECT ASSIGNMENTS ---
  checkPageBreak(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
  doc.text(`2. Current Project Assignments (${snapshot.activeProjects.length})`, margin, y);
  y += 5;

  // Table header
  doc.setFillColor(35, 36, 43);
  doc.rect(margin, y, usableWidth, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);

  const pCols = [
    { label: 'Project', x: margin + 2, width: 25 },
    { label: 'Piece Name', x: margin + 27, width: 55 },
    { label: 'Stage', x: margin + 82, width: 30 },
    { label: 'Progress', x: margin + 112, width: 20 },
    { label: 'Due Date', x: margin + 132, width: 25 },
    { label: 'Assigned', x: margin + 157, width: 23 },
  ];
  pCols.forEach(c => doc.text(c.label, c.x, y + 4));
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);

  if (snapshot.activeProjects.length === 0) {
    doc.setFontSize(8);
    doc.text('No active project assignments.', margin + 2, y + 5);
    y += 8;
  } else {
    snapshot.activeProjects.forEach((proj, idx) => {
      checkPageBreak(7);
      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 248);
        doc.rect(margin, y, usableWidth, 6, 'F');
      }
      doc.setFontSize(8);
      doc.text(proj.code, margin + 2, y + 4);
      doc.text(proj.pieceName.length > 32 ? proj.pieceName.slice(0, 30) + '…' : proj.pieceName, margin + 27, y + 4);
      doc.text(proj.stageName, margin + 82, y + 4);
      doc.text(`${proj.progress}%`, margin + 112, y + 4);
      doc.text(proj.dueDate || '-', margin + 132, y + 4);
      doc.text(proj.daysAssigned !== null ? `${proj.daysAssigned} days` : '-', margin + 157, y + 4);
      y += 6;
    });
  }
  y += 6;

  // --- SECTION 3: OUTSTANDING BAGS IN HAND & PENDING ---
  checkPageBreak(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
  doc.text(`3. Bags In Hand & Pending Returns (${snapshot.bags.length})`, margin, y);
  y += 5;

  doc.setFillColor(35, 36, 43);
  doc.rect(margin, y, usableWidth, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);

  const bCols = [
    { label: 'Bag #', x: margin + 2 },
    { label: 'Project', x: margin + 28 },
    { label: 'Status', x: margin + 60 },
    { label: 'Issued Date', x: margin + 105 },
    { label: 'Days Held', x: margin + 145 },
  ];
  bCols.forEach(c => doc.text(c.label, c.x, y + 4));
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);

  if (snapshot.bags.length === 0) {
    doc.setFontSize(8);
    doc.text('No outstanding bags currently held.', margin + 2, y + 5);
    y += 8;
  } else {
    snapshot.bags.forEach((bag, idx) => {
      checkPageBreak(7);
      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 248);
        doc.rect(margin, y, usableWidth, 6, 'F');
      }
      doc.setFontSize(8);
      doc.text(`Bag #${bag.bagNumber}`, margin + 2, y + 4);
      doc.text(bag.projectCode, margin + 28, y + 4);
      doc.text(bag.inHand ? 'In Hand' : 'Pending Count', margin + 60, y + 4);
      doc.text(formatTorontoDate(bag.issuedAt), margin + 105, y + 4);
      doc.text(bag.daysHeld !== null ? `${bag.daysHeld} days` : '-', margin + 145, y + 4);
      y += 6;

      // Sub-items
      bag.items.forEach(item => {
        checkPageBreak(5);
        doc.setFontSize(7);
        doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
        const weightStr = item.averageWeightSnapshot ? `${item.averageWeightSnapshot.toFixed(4)} ct avg.` : 'Missing weight snapshot';
        doc.text(`  ↳ ${item.label}: ${item.issuedPcs} pcs issued (${weightStr})`, margin + 6, y + 3.5);
        y += 5;
      });
    });
  }
  y += 6;

  // --- SECTION 4: DIAMOND SPEC BREAKDOWN & MONTHLY TREND ---
  checkPageBreak(35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
  doc.text('4. Confirmed Diamond Output & Spec Breakdown', margin, y);
  y += 5;

  // Specs Table
  doc.setFillColor(35, 36, 43);
  doc.rect(margin, y, usableWidth / 2 - 2, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('Diamond Size / Spec', margin + 2, y + 4);
  doc.text('Stones Set', margin + 55, y + 4);
  doc.text('Est. Carats', margin + 75, y + 4);

  // Monthly Table
  doc.setFillColor(35, 36, 43);
  doc.rect(margin + usableWidth / 2 + 2, y, usableWidth / 2 - 2, 6, 'F');
  doc.text('Month (Toronto)', margin + usableWidth / 2 + 4, y + 4);
  doc.text('Stones Set', margin + usableWidth / 2 + 48, y + 4);
  doc.text('Est. Carats', margin + usableWidth / 2 + 68, y + 4);
  y += 6;

  const maxRows = Math.max(snapshot.specs.length, snapshot.monthly.length);
  doc.setFont('helvetica', 'normal');

  for (let i = 0; i < Math.max(1, maxRows); i++) {
    checkPageBreak(6);
    const spec = snapshot.specs[i];
    const month = snapshot.monthly[i];

    if (i % 2 === 0) {
      doc.setFillColor(245, 245, 248);
      doc.rect(margin, y, usableWidth, 6, 'F');
    }

    doc.setFontSize(7.5);
    doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);

    if (spec) {
      doc.text(spec.label.length > 25 ? spec.label.slice(0, 23) + '…' : spec.label, margin + 2, y + 4);
      doc.text(`${spec.stonesSet} pcs`, margin + 55, y + 4);
      doc.text(`${spec.estimatedCaratsSet.toFixed(3)} ct`, margin + 75, y + 4);
    } else if (i === 0) {
      doc.text('No confirmed specs', margin + 2, y + 4);
    }

    if (month) {
      doc.text(`${month.label} (${month.key})`, margin + usableWidth / 2 + 4, y + 4);
      doc.text(`${month.stonesSet} pcs`, margin + usableWidth / 2 + 48, y + 4);
      doc.text(`${month.estimatedCaratsSet.toFixed(3)} ct`, margin + usableWidth / 2 + 68, y + 4);
    }

    y += 6;
  }

  y += 10;
  drawFooter();

  doc.save(`Team_Member_${snapshot.user.name.replace(/\s+/g, '_')}_Performance_${new Date().toISOString().slice(0, 10)}.pdf`);
}
