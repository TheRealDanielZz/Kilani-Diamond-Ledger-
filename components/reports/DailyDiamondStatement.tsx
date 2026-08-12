import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Download, Printer, Search, ArrowDownLeft, ArrowUpRight, Calendar as CalendarIcon,
  Activity, Gem, X, ChevronRight, Factory, Layers, BarChart3, Diamond,
  Clock, AlertTriangle, RefreshCw, ChevronLeft, Check, Info, SlidersHorizontal, LayoutGrid, List
} from 'lucide-react';
import { Card, Button } from '../UI';
import { motion, AnimatePresence } from 'motion/react';
import { store } from '../../services/store';
import {
  computeLineDelta, normalizeBalance, resolveAvgWeight, resolveLineCarats,
  isMeleeLocation, roundCt
} from '../../services/inventoryMath';
import { DiamondSpec, InventoryMovement, InventoryMovementType, BagReturnTransaction } from '../../types';
import { DiamondShapeIcon } from '../common/DiamondShapeIcon';

export type DiamondShape = 'Round Brilliant' | 'Princess' | 'Emerald' | 'Oval' | 'Cushion' | 'Marquise' | 'Pear' | 'Radiant';

export interface DailyStatementRow {
  specId: string;
  size: number;
  shape: DiamondShape;
  costPerCt: number;
  quantityPcs: number;
  weightCt: number;
  totalValueUsd: number;
  incomingCt: number;
  incomingUsd: number;
  usedCt: number;
  factorySentCt: number;
}

export interface DailyBreakdownRow {
  dateStr: string; // YYYY-MM-DD
  displayDate: string; // e.g. "Wed, Aug 20"
  incomingCt: number;
  incomingUsd: number;
  factorySentCt: number;
  usedCt: number;
  closingPcs: number;
  closingWeightCt: number;
  closingValueUsd: number;
  hasActivity: boolean;
}

/* ── Helper: Parse YYYY-MM-DD + HH:mm in Eastern Time (America/New_York) to Epoch ms ── */
export function parseETToEpoch(dateStr: string, timeStr: string): number {
  if (!dateStr || !timeStr) return Date.now();
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);

  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);
  try {
    const etString = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset'
    }).format(new Date(utcGuess));
    const match = etString.match(/GMT([+-]\d+)/);
    const offsetHours = match ? parseInt(match[1], 10) : -4;
    return Date.UTC(y, m - 1, d, hh - offsetHours, mm);
  } catch {
    return Date.UTC(y, m - 1, d, hh + 4, mm);
  }
}

/* ── Helper: Format ET Date String to YYYY-MM-DD ── */
export function getTodayETStr(): string {
  const d = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return etFormatter.format(d);
}

/* ── Helper: Format Display Date ── */
export function formatWeekdayDate(dateStr: string): { full: string; short: string; dayOfWeek: string } {
  if (!dateStr) return { full: '', short: '', dayOfWeek: '' };
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  
  const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const monthName = dateObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const monthLong = dateObj.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();
  
  return {
    full: `${dayOfWeek}, ${monthLong} ${d}, ${y}`,
    short: `${dayOfWeek}, ${monthName} ${d}`,
    dayOfWeek
  };
}

/* ── Helper: Generate array of YYYY-MM-DD dates inclusive ── */
export function generateDateRange(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr) return [getTodayETStr()];
  const dates: string[] = [];
  const current = new Date(`${startStr}T12:00:00Z`);
  const end = new Date(`${endStr}T12:00:00Z`);

  if (current > end) return [startStr];

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/* ── Calendar Helper: Get grid days for month ── */
export function getMonthGrid(year: number, monthIndex: number): (number | null)[] {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysCount; d++) {
    days.push(d);
  }
  return days;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/* ── Animated Counter Component ── */
const AnimatedValue: React.FC<{ value: number; prefix?: string; suffix?: string; decimals?: number }> = ({ value, prefix = '', suffix = '', decimals = 2 }) => {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      {prefix}{value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </motion.span>
  );
};

/* ── Net Movement Micro-Bar Component ── */
const NetBar: React.FC<{ incoming: number; used: number; maxRange: number }> = ({ incoming, used, maxRange }) => {
  const net = incoming - used;
  const pct = maxRange > 0 ? Math.min(Math.abs(net) / maxRange, 1) * 100 : 0;
  const isPositive = net >= 0;

  return (
    <div className="flex items-center gap-1.5 w-16 sm:w-20">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
        />
      </div>
      <span className={`text-[10px] font-bold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isPositive ? '+' : ''}{net.toFixed(1)}
      </span>
    </div>
  );
};

export const DailyDiamondStatement: React.FC = () => {
  // Store sync key
  const [storeTick, setStoreTick] = useState(0);
  useEffect(() => {
    const unsub = store.subscribe(() => setStoreTick(t => t + 1));
    return () => unsub();
  }, []);

  // Filter State
  const todayET = useMemo(() => getTodayETStr(), []);
  const [startDate, setStartDate] = useState<string>(todayET);
  const [endDate, setEndDate] = useState<string>(todayET);
  const [startTime, setStartTime] = useState<string>('10:00');
  const [endTime, setEndTime] = useState<string>('18:00');

  // Filter Modal State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'dates' | 'presets'>('dates');

  // Temporary Modal Filter Selection State
  const [tempStartDate, setTempStartDate] = useState<string>(startDate);
  const [tempEndDate, setTempEndDate] = useState<string>(endDate);
  const [tempStartTime, setTempStartTime] = useState<string>(startTime);
  const [tempEndTime, setTempEndTime] = useState<string>(endTime);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Nav Month state for Dual-Calendar view
  const [navYear, setNavYear] = useState(() => Number(startDate.split('-')[0]) || 2026);
  const [navMonth, setNavMonth] = useState(() => (Number(startDate.split('-')[1]) - 1) || 7);

  // Sync temp modal state when modal opens
  useEffect(() => {
    if (isFilterModalOpen) {
      setTempStartDate(startDate);
      setTempEndDate(endDate);
      setTempStartTime(startTime);
      setTempEndTime(endTime);
      const [y, m] = startDate.split('-').map(Number);
      if (y && m) {
        setNavYear(y);
        setNavMonth(m - 1);
      }
    }
  }, [isFilterModalOpen, startDate, endDate, startTime, endTime]);

  // Mobile View Mode for Breakdown: 'table' or 'cards'
  const [breakdownViewMode, setBreakdownViewMode] = useState<'table' | 'cards'>('table');

  // Table & Row Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShape, setSelectedShape] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'gains' | 'consumed' | 'high_value'>('all');
  const [selectedRow, setSelectedRow] = useState<DailyStatementRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Modal Input Validation Error
  const validationError = useMemo(() => {
    if (!tempStartDate || !tempEndDate) return 'Please select valid start and end dates.';
    if (tempStartDate > tempEndDate) return 'Start date must be on or before end date.';
    if (tempEndDate > todayET) return 'Future dates are not permitted.';

    const dStart = new Date(tempStartDate);
    const dEnd = new Date(tempEndDate);
    const diffDays = Math.ceil((dEnd.getTime() - dStart.getTime()) / (1000 * 3600 * 24));
    if (diffDays > 90) return 'Maximum date range allowed is 90 calendar days.';

    if (tempStartTime >= tempEndTime) return 'Start time (10:00 AM min) must be earlier than end time (6:00 PM max).';
    if (tempStartTime < '10:00' || tempEndTime > '18:00') return 'Business hours must remain between 10:00 AM and 6:00 PM ET.';

    return null;
  }, [tempStartDate, tempEndDate, tempStartTime, tempEndTime, todayET]);

  // Calendar Day Selection Handler
  const handleCalendarDayClick = (dateStr: string) => {
    if (dateStr > todayET) return;

    if (!tempStartDate || (tempStartDate && tempEndDate && tempStartDate !== tempEndDate)) {
      setTempStartDate(dateStr);
      setTempEndDate(dateStr);
    } else if (tempStartDate && tempStartDate === tempEndDate) {
      if (dateStr < tempStartDate) {
        setTempEndDate(tempStartDate);
        setTempStartDate(dateStr);
      } else {
        setTempEndDate(dateStr);
      }
    }
  };

  // Handle Preset Selections
  const applyPreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth') => {
    const today = new Date(`${todayET}T12:00:00Z`);
    setTempStartTime('10:00');
    setTempEndTime('18:00');

    if (preset === 'today') {
      setTempStartDate(todayET);
      setTempEndDate(todayET);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setTempStartDate(yStr);
      setTempEndDate(yStr);
    } else if (preset === '7days') {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - 6);
      setTempStartDate(d.toISOString().split('T')[0]);
      setTempEndDate(todayET);
    } else if (preset === '30days') {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - 29);
      setTempStartDate(d.toISOString().split('T')[0]);
      setTempEndDate(todayET);
    } else if (preset === 'thisMonth') {
      const [yStr, mStr] = todayET.split('-');
      setTempStartDate(`${yStr}-${mStr}-01`);
      setTempEndDate(todayET);
    }
  };

  const handleApplyFilter = () => {
    if (validationError) return;
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
    setStartTime(tempStartTime);
    setEndTime(tempEndTime);
    setIsFilterModalOpen(false);
  };

  // Format Header Title String
  const formatPeriodTitle = (sDate: string, eDate: string, sTime: string, eTime: string) => {
    const isSingleDay = sDate === eDate;
    const formatTime12 = (tStr: string) => {
      const [h, m] = tStr.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${m < 10 ? '0' : ''}${m}${ampm}`;
    };

    const timeWindowStr = `${formatTime12(sTime)}-${formatTime12(eTime)} ET`;

    if (isSingleDay) {
      const fmt = formatWeekdayDate(sDate);
      return `Viewing ${fmt.full} | ${timeWindowStr}`;
    } else {
      const [y1, m1, d1] = sDate.split('-');
      const [y2, m2, d2] = eDate.split('-');
      const date1 = new Date(Date.UTC(Number(y1), Number(m1) - 1, Number(d1), 12));
      const date2 = new Date(Date.UTC(Number(y2), Number(m2) - 1, Number(d2), 12));
      
      const m1Name = date1.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
      const m2Name = date2.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

      let rangeDateStr = '';
      if (m1Name === m2Name && y1 === y2) {
        rangeDateStr = `${m1Name} ${Number(d1)}-${Number(d2)}, ${y1}`;
      } else if (y1 === y2) {
        rangeDateStr = `${m1Name} ${Number(d1)} - ${m2Name} ${Number(d2)}, ${y1}`;
      } else {
        rangeDateStr = `${m1Name} ${Number(d1)}, ${y1} - ${m2Name} ${Number(d2)}, ${y2}`;
      }

      return `Viewing ${rangeDateStr} | DAILY ${timeWindowStr}`;
    }
  };

  const periodHeaderString = useMemo(() => {
    return formatPeriodTitle(startDate, endDate, startTime, endTime);
  }, [startDate, endDate, startTime, endTime]);

  const tempPeriodHeaderString = useMemo(() => {
    return formatPeriodTitle(tempStartDate, tempEndDate, tempStartTime, tempEndTime);
  }, [tempStartDate, tempEndDate, tempStartTime, tempEndTime]);

  // Date range list for active selection
  const dateRangeList = useMemo(() => {
    return generateDateRange(startDate, endDate);
  }, [startDate, endDate]);

  const dailyWindows = useMemo(() => {
    return dateRangeList.map(dStr => ({
      dateStr: dStr,
      startMs: parseETToEpoch(dStr, startTime),
      endMs: parseETToEpoch(dStr, endTime)
    }));
  }, [dateRangeList, startTime, endTime]);

  const snapshotEndpointMs = useMemo(() => {
    return parseETToEpoch(endDate, endTime);
  }, [endDate, endTime]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL CALCULATIONS (Read-Only Mirror from store.ts)
  // ═══════════════════════════════════════════════════════════════════════════
  const calculatedReport = useMemo(() => {
    const allSpecs = store.getSpecs();
    const meleeSpecs = allSpecs.filter(s => isMeleeLocation(s.location));
    meleeSpecs.sort((a, b) => a.sizeMm - b.sizeMm);

    const movements = store.getInventoryMovements();
    const projects = store.getProjects();
    
    const confirmedReturns: { confirmedAtMs: number; lines: any[]; managerId?: string; correctionReason?: string }[] = [];
    projects.forEach(p => {
      const bagTxs = store.getBags(p.id);
      bagTxs.forEach(bag => {
        if (bag.returns && bag.returns.length > 0) {
          bag.returns.forEach((ret: BagReturnTransaction) => {
            if (ret.status === 'CONFIRMED' && ret.confirmedAt) {
              confirmedReturns.push({
                confirmedAtMs: new Date(ret.confirmedAt).getTime(),
                lines: ret.lines || [],
                managerId: ret.managerId || ret.correctingManagerId,
                correctionReason: ret.correctionReason
              });
            }
          });
        }
      });
    });

    const incomingCtBySpec: Record<string, number> = {};
    const incomingUsdBySpec: Record<string, number> = {};
    const sentCtBySpec: Record<string, number> = {};
    const usedCtBySpec: Record<string, number> = {};

    const dailyMetrics: Record<string, { incomingCt: number; incomingUsd: number; sentCt: number; usedCt: number }> = {};
    dateRangeList.forEach(dStr => {
      dailyMetrics[dStr] = { incomingCt: 0, incomingUsd: 0, sentCt: 0, usedCt: 0 };
    });

    const findMatchingDay = (txTimeMs: number) => {
      return dailyWindows.find(w => txTimeMs >= w.startMs && txTimeMs <= w.endMs);
    };

    movements.forEach(m => {
      const txMs = new Date(m.createdAt).getTime();
      const matchDay = findMatchingDay(txMs);
      if (!matchDay) return;

      m.lines.forEach(line => {
        if (!line.specId) return;
        const spec = meleeSpecs.find(s => s.id === line.specId);
        const carats = resolveLineCarats(m, line, spec);
        const unitCost = line.costPerCtUsd || spec?.defaultCostPerCtUsd || 0;
        const valUsd = roundCt(carats * unitCost);

        if (m.type === InventoryMovementType.SHIPMENT_IN) {
          incomingCtBySpec[line.specId] = (incomingCtBySpec[line.specId] || 0) + carats;
          incomingUsdBySpec[line.specId] = (incomingUsdBySpec[line.specId] || 0) + valUsd;

          dailyMetrics[matchDay.dateStr].incomingCt += carats;
          dailyMetrics[matchDay.dateStr].incomingUsd += valUsd;
        } else if (m.type === InventoryMovementType.ISSUE) {
          sentCtBySpec[line.specId] = (sentCtBySpec[line.specId] || 0) + carats;

          dailyMetrics[matchDay.dateStr].sentCt += carats;
        }
      });
    });

    confirmedReturns.forEach(ret => {
      const matchDay = findMatchingDay(ret.confirmedAtMs);
      if (!matchDay) return;

      ret.lines.forEach((line: any) => {
        if (!line.specId) return;
        const spec = meleeSpecs.find(s => s.id === line.specId);
        const ctPerStone = line.averageWeightSnapshot || spec?.ctPerStone || 0;

        const issuedPcs = line.originalIssuedPcs || 0;
        const returnedPcs = line.confirmedPcs !== undefined ? line.confirmedPcs : (line.returnedPcs || 0);
        const usedPcs = Math.max(0, issuedPcs - returnedPcs);
        const usedCt = roundCt(usedPcs * ctPerStone);

        if (usedCt > 0) {
          usedCtBySpec[line.specId] = (usedCtBySpec[line.specId] || 0) + usedCt;
          dailyMetrics[matchDay.dateStr].usedCt += usedCt;
        }
      });
    });

    const statementRows: DailyStatementRow[] = meleeSpecs.map(spec => {
      const livePcs = spec.pcs || 0;
      const liveCt = spec.ct || 0;

      let deltaPcsAfter = 0;
      let deltaCtAfter = 0;

      movements.forEach(m => {
        const txMs = new Date(m.createdAt).getTime();
        if (txMs > snapshotEndpointMs) {
          m.lines.forEach(line => {
            if (line.specId === spec.id) {
              const delta = computeLineDelta(m, line, spec);
              deltaPcsAfter += delta.pieceDelta;
              deltaCtAfter += delta.caratDelta;
            }
          });
        }
      });

      const rawPcs = livePcs - deltaPcsAfter;
      const rawCt = liveCt - deltaCtAfter;

      const norm = normalizeBalance({ pcs: rawPcs, ct: rawCt }, spec.id);

      const costPerCt = spec.defaultCostPerCtUsd || 750;
      const closingPcs = norm.pcs;
      const closingCt = norm.ct;
      const totalValueUsd = roundCt(closingCt * costPerCt);

      const incCt = incomingCtBySpec[spec.id] || 0;
      const incUsd = incomingUsdBySpec[spec.id] || 0;
      const uCt = usedCtBySpec[spec.id] || 0;
      const fSentCt = sentCtBySpec[spec.id] || 0;

      const shape: DiamondShape = (spec.shape as DiamondShape) || 'Round Brilliant';

      return {
        specId: spec.id,
        size: spec.sizeMm,
        shape,
        costPerCt,
        quantityPcs: closingPcs,
        weightCt: closingCt,
        totalValueUsd,
        incomingCt: incCt,
        incomingUsd: incUsd,
        usedCt: uCt,
        factorySentCt: fSentCt
      };
    });

    let runningPcs = statementRows.reduce((sum, r) => sum + r.quantityPcs, 0);
    let runningCt = statementRows.reduce((sum, r) => sum + r.weightCt, 0);
    let runningValue = statementRows.reduce((sum, r) => sum + r.totalValueUsd, 0);

    const dailyBreakdownRows: DailyBreakdownRow[] = dateRangeList.map((dStr) => {
      const fmt = formatWeekdayDate(dStr);
      const met = dailyMetrics[dStr] || { incomingCt: 0, incomingUsd: 0, sentCt: 0, usedCt: 0 };
      const hasAct = met.incomingCt > 0 || met.sentCt > 0 || met.usedCt > 0;

      return {
        dateStr: dStr,
        displayDate: fmt.short,
        incomingCt: roundCt(met.incomingCt),
        incomingUsd: roundCt(met.incomingUsd),
        factorySentCt: roundCt(met.sentCt),
        usedCt: roundCt(met.usedCt),
        closingPcs: runningPcs,
        closingWeightCt: runningCt,
        closingValueUsd: runningValue,
        hasActivity: hasAct
      };
    });

    const summaryTotals = {
      pcs: statementRows.reduce((acc, r) => acc + r.quantityPcs, 0),
      weight: statementRows.reduce((acc, r) => acc + r.weightCt, 0),
      value: statementRows.reduce((acc, r) => acc + r.totalValueUsd, 0),
      incoming: statementRows.reduce((acc, r) => acc + r.incomingCt, 0),
      incomingUsd: statementRows.reduce((acc, r) => acc + r.incomingUsd, 0),
      used: statementRows.reduce((acc, r) => acc + r.usedCt, 0),
      factorySent: statementRows.reduce((acc, r) => acc + r.factorySentCt, 0),
      sizesTracked: statementRows.length
    };

    return {
      statementRows,
      dailyBreakdownRows,
      summaryTotals
    };
  }, [storeTick, dateRangeList, dailyWindows, snapshotEndpointMs]);

  const { statementRows, dailyBreakdownRows, summaryTotals } = calculatedReport;

  const filteredData = useMemo(() => {
    return statementRows.filter((row) => {
      const sizeStr = row.size.toFixed(2);
      const matchesSearch = !searchQuery || sizeStr.includes(searchQuery) || row.costPerCt.toString().includes(searchQuery) || row.shape.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesShape = selectedShape === 'all' || row.shape === selectedShape;
      const netCt = row.incomingCt - row.usedCt;

      if (!matchesSearch || !matchesShape) return false;
      if (filterMode === 'gains') return netCt > 0;
      if (filterMode === 'consumed') return netCt < 0;
      if (filterMode === 'high_value') return row.totalValueUsd >= 5000;
      return true;
    });
  }, [statementRows, searchQuery, selectedShape, filterMode]);

  const netMovementTotal = summaryTotals.incoming - summaryTotals.used;
  const maxNetRange = useMemo(() => {
    return Math.max(...statementRows.map(r => Math.abs(r.incomingCt - r.usedCt)), 0.1);
  }, [statementRows]);

  const handleSelectRow = (row: DailyStatementRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  const handleExportExcel = () => {
    const headers = ['Size (mm)', 'Shape', 'Cost/ct (USD)', 'Quantity (pcs)', 'Weight (ct)', 'Total Value (USD)', 'RECEIVED (ct)', 'SENT TO FACTORY (ct)', 'USED IN FACTORY (ct)', 'Net Movement (ct)'];
    const rows = statementRows.map(r => [
      r.size.toFixed(2),
      r.shape,
      r.costPerCt,
      r.quantityPcs,
      r.weightCt.toFixed(4),
      r.totalValueUsd.toFixed(2),
      r.incomingCt.toFixed(4),
      r.factorySentCt.toFixed(4),
      r.usedCt.toFixed(4),
      (r.incomingCt - r.usedCt).toFixed(4)
    ]);
    
    const summaryRow = ['TOTALS', '', '', summaryTotals.pcs, summaryTotals.weight.toFixed(4), summaryTotals.value.toFixed(2), summaryTotals.incoming.toFixed(4), summaryTotals.factorySent.toFixed(4), summaryTotals.used.toFixed(4), netMovementTotal.toFixed(4)];

    const dailyHeaders = ['Date', 'Received (ct)', 'Received (USD)', 'Sent to Factory (ct)', 'Used in Factory (ct)', 'Closing Pieces', 'Closing Weight (ct)', 'Closing Value (USD)'];
    const dailyRows = dailyBreakdownRows.map(d => [
      d.displayDate,
      d.incomingCt.toFixed(4),
      d.incomingUsd.toFixed(2),
      d.factorySentCt.toFixed(4),
      d.usedCt.toFixed(4),
      d.closingPcs,
      d.closingWeightCt.toFixed(4),
      d.closingValueUsd.toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + ['KILANI DIAMOND REPORTER - DAILY DIAMOND STATEMENT', periodHeaderString, '']
          .concat(['SUMMARY METRICS'])
          .concat([`Inventory Total Value: $${summaryTotals.value.toFixed(2)} USD`])
          .concat([`Total Received: ${summaryTotals.incoming.toFixed(3)} ct ($${summaryTotals.incomingUsd.toFixed(2)})`])
          .concat([`Total Pieces: ${summaryTotals.pcs}`])
          .concat([`Total Weight: ${summaryTotals.weight.toFixed(3)} ct`])
          .concat([`Sent to Factory: ${summaryTotals.factorySent.toFixed(3)} ct`])
          .concat([`Used in Factory: ${summaryTotals.used.toFixed(3)} ct`])
          .concat([''])
          .concat(['DAILY BREAKDOWN'])
          .concat([dailyHeaders.join(',')])
          .concat(dailyRows.map(e => e.join(',')))
          .concat([''])
          .concat(['DIAMOND STATEMENT BY SIZE'])
          .concat([headers.join(',')])
          .concat(rows.map(e => e.join(',')))
          .concat([''])
          .concat([summaryRow.join(',')])
          .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Kilani_Daily_Diamond_Statement_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    // Dynamically import jsPDF to avoid SSR issues
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PAGE_W = 210;
      const PAGE_H = 297;
      const MARGIN = 18;
      const CONTENT_W = PAGE_W - MARGIN * 2;
      let y = 0;

      const GOLD = [212, 175, 55] as const;
      const DARK = [15, 15, 20] as const;
      const DARK2 = [30, 30, 38] as const;
      const LIGHT_GREY = [200, 200, 205] as const;
      const MID_GREY = [140, 140, 148] as const;
      const WHITE = [255, 255, 255] as const;
      const GREEN = [52, 211, 153] as const;
      const RED = [248, 113, 113] as const;

      const usd = (v: number) =>
        '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const ct4 = (v: number) => v.toFixed(3) + ' ct';
      const nowStr = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const checkNewPage = (needed: number = 20) => {
        if (y + needed > PAGE_H - 14) {
          doc.addPage();
          // Footer on previous page
          doc.setFontSize(7);
          doc.setTextColor(...MID_GREY);
          doc.text('Kilani Diamond Reporter — Confidential', MARGIN, PAGE_H - 6);
          doc.text(`Page ${(doc as any).internal.getCurrentPageInfo().pageNumber - 1}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
          y = 18;
        }
      };

      // ═══════════════════════════════════════
      // PAGE 1: COVER / EXECUTIVE SUMMARY HEADER
      // ═══════════════════════════════════════
      // Dark header band
      doc.setFillColor(...DARK);
      doc.rect(0, 0, PAGE_W, 58, 'F');

      // Gold accent bar at top
      doc.setFillColor(...GOLD);
      doc.rect(0, 0, PAGE_W, 3, 'F');

      // Company name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...GOLD);
      doc.text('KILANI DIAMOND', MARGIN, 20);

      doc.setFontSize(10);
      doc.setTextColor(...MID_GREY);
      doc.text('MELEE INVENTORY MANAGEMENT SYSTEM', MARGIN, 27);

      // Report title
      doc.setFontSize(17);
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.text('Daily Diamond Statement', MARGIN, 40);

      doc.setFontSize(9);
      doc.setTextColor(...LIGHT_GREY);
      doc.setFont('helvetica', 'normal');
      doc.text(periodHeaderString, MARGIN, 48);

      // Generated timestamp (right side)
      doc.setFontSize(7.5);
      doc.setTextColor(...MID_GREY);
      doc.text(`Generated: ${nowStr} ET`, PAGE_W - MARGIN, 48, { align: 'right' });
      doc.text('CONFIDENTIAL — FOR INTERNAL USE ONLY', PAGE_W - MARGIN, 54, { align: 'right' });

      y = 68;

      // ═══════════════════════════════════════
      // SECTION 1: EXECUTIVE SUMMARY BOX
      // ═══════════════════════════════════════
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...GOLD);
      doc.text('SECTION 1 — EXECUTIVE SUMMARY', MARGIN, y);
      y += 5;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MID_GREY);
      doc.text(
        'A high-level snapshot of all melee diamond inventory during the selected period.',
        MARGIN, y
      );
      y += 7;

      // KPI card grid — 3 per row
      const kpis = [
        { label: 'INVENTORY VALUE', value: usd(summaryTotals.value), sub: `${summaryTotals.pcs.toLocaleString()} pcs on hand`, color: GOLD },
        { label: 'TOTAL WEIGHT ON HAND', value: ct4(summaryTotals.weight), sub: `${statementRows.length} size specs tracked`, color: WHITE },
        { label: 'NET MOVEMENT', value: ct4(summaryTotals.incoming - summaryTotals.used), sub: netMovementTotal >= 0 ? '▲ Net gain this period' : '▼ Net reduction this period', color: netMovementTotal >= 0 ? GREEN : RED },
        { label: 'DIAMONDS RECEIVED', value: ct4(summaryTotals.incoming), sub: usd(summaryTotals.incomingUsd) + ' value received', color: WHITE },
        { label: 'SENT TO FACTORY', value: ct4(summaryTotals.factorySent), sub: 'Total dispatched to production', color: WHITE },
        { label: 'USED IN FACTORY', value: ct4(summaryTotals.used), sub: 'Confirmed consumed in projects', color: WHITE },
      ];

      const kpiW = CONTENT_W / 3 - 2;
      kpis.forEach((kpi, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const kx = MARGIN + col * (kpiW + 3);
        const ky = y + row * 30;

        doc.setFillColor(...DARK2);
        doc.roundedRect(kx, ky, kpiW, 26, 2, 2, 'F');
        doc.setDrawColor(...(GOLD as [number, number, number]));
        doc.setLineWidth(0.3);
        doc.roundedRect(kx, ky, kpiW, 26, 2, 2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...MID_GREY);
        doc.text(kpi.label, kx + 4, ky + 7);

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(kpi.color as [number, number, number]));
        doc.text(kpi.value, kx + 4, ky + 16);

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID_GREY);
        doc.text(kpi.sub, kx + 4, ky + 22);
      });

      y += 65;

      // ─── Plain-language interpretation box ───
      doc.setFillColor(30, 36, 30);
      doc.setDrawColor(52, 211, 153);
      doc.setLineWidth(0.4);
      doc.roundedRect(MARGIN, y, CONTENT_W, 26, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...GREEN);
      doc.text('WHAT DOES THIS MEAN?', MARGIN + 4, y + 7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...WHITE);

      const netAbs = Math.abs(netMovementTotal).toFixed(3);
      const netDir = netMovementTotal >= 0 ? 'gained' : 'consumed';
      const interpretation = [
        `During the selected period, Kilani held ${summaryTotals.pcs.toLocaleString()} melee diamond pieces weighing ${ct4(summaryTotals.weight)} in stock.`,
        `The total estimated inventory value was ${usd(summaryTotals.value)}.  The factory ${netDir} a net ${netAbs} ct overall.`,
      ];
      interpretation.forEach((line, li) => {
        doc.text(line, MARGIN + 4, y + 14 + li * 5.5);
      });
      y += 34;

      // ═══════════════════════════════════════
      // SECTION 2: DAILY ACTIVITY BREAKDOWN
      // ═══════════════════════════════════════
      checkNewPage(40);
      y += 6;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...GOLD);
      doc.text('SECTION 2 — DAY-BY-DAY ACTIVITY', MARGIN, y);
      y += 5;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MID_GREY);
      doc.text(
        'Shows what happened each day: diamonds received, sent to factory, used, and the running inventory balance.',
        MARGIN, y
      );
      y += 7;

      // Table header
      const dailyCols = [
        { label: 'DATE', w: 38 },
        { label: 'RECEIVED (ct)', w: 30 },
        { label: 'TO FACTORY (ct)', w: 32 },
        { label: 'USED (ct)', w: 28 },
        { label: 'CLOSING PCS', w: 25 },
        { label: 'CLOSING VALUE', w: 0 }, // fill remainder
      ];
      // Calculate last column width
      const dailyUsed = dailyCols.slice(0, -1).reduce((s, c) => s + c.w, 0);
      dailyCols[dailyCols.length - 1].w = CONTENT_W - dailyUsed;

      // Header bg
      doc.setFillColor(...DARK2);
      doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...GOLD);
      let cx = MARGIN + 3;
      dailyCols.forEach(col => {
        doc.text(col.label, cx, y + 5);
        cx += col.w;
      });
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      dailyBreakdownRows.forEach((day, idx) => {
        checkNewPage(9);
        const bg = idx % 2 === 0 ? DARK : DARK2;
        doc.setFillColor(...(bg as [number, number, number]));
        doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F');

        const cols_vals = [
          day.displayDate,
          day.incomingCt > 0 ? ct4(day.incomingCt) : '—',
          day.factorySentCt > 0 ? ct4(day.factorySentCt) : '—',
          day.usedCt > 0 ? ct4(day.usedCt) : '—',
          day.closingPcs.toLocaleString(),
          usd(day.closingValueUsd),
        ];

        let dcx = MARGIN + 3;
        cols_vals.forEach((val, vi) => {
          // Color activity columns
          const col = dailyCols[vi];
          if (vi === 1 && day.incomingCt > 0) doc.setTextColor(...GREEN);
          else if ((vi === 2 || vi === 3) && (day.factorySentCt > 0 || day.usedCt > 0)) doc.setTextColor(...RED);
          else if (vi === 5) doc.setTextColor(...GOLD);
          else doc.setTextColor(...LIGHT_GREY);
          doc.text(val, dcx, y + 5.2);
          dcx += col.w;
        });

        // Activity indicator dot
        if (day.hasActivity) {
          doc.setFillColor(...GOLD);
          doc.circle(MARGIN + 1.5, y + 3.5, 0.8, 'F');
        }

        y += 7.5;
      });

      // Totals row
      doc.setFillColor(40, 36, 20);
      doc.setDrawColor(...(GOLD as [number, number, number]));
      doc.setLineWidth(0.3);
      doc.rect(MARGIN, y, CONTENT_W, 8, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...GOLD);
      const dailyTotalVals = [
        'PERIOD TOTALS',
        ct4(summaryTotals.incoming),
        ct4(summaryTotals.factorySent),
        ct4(summaryTotals.used),
        summaryTotals.pcs.toLocaleString(),
        usd(summaryTotals.value),
      ];
      let dtcx = MARGIN + 3;
      dailyTotalVals.forEach((v, vi) => {
        doc.text(v, dtcx, y + 5.5);
        dtcx += dailyCols[vi].w;
      });
      y += 14;

      // ═══════════════════════════════════════
      // SECTION 3: DIAMOND INVENTORY BY SIZE
      // ═══════════════════════════════════════
      checkNewPage(40);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...GOLD);
      doc.text('SECTION 3 — DIAMOND INVENTORY BY SIZE & SHAPE', MARGIN, y);
      y += 5;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MID_GREY);
      doc.text(
        'Detailed breakdown of every diamond size and cut we carry, showing current stock and factory activity this period.',
        MARGIN, y
      );
      y += 7;

      // Table headers
      const sizeCols = [
        { label: 'SIZE', w: 18 },
        { label: 'SHAPE', w: 30 },
        { label: 'COST/CT', w: 24 },
        { label: 'ON HAND', w: 20 },
        { label: 'WEIGHT (ct)', w: 26 },
        { label: 'RECEIVED (ct)', w: 28 },
        { label: 'USED (ct)', w: 24 },
        { label: 'VALUE', w: 0 },
      ];
      const sizeUsed = sizeCols.slice(0, -1).reduce((s, c) => s + c.w, 0);
      sizeCols[sizeCols.length - 1].w = CONTENT_W - sizeUsed;

      doc.setFillColor(...DARK2);
      doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...GOLD);
      let sx = MARGIN + 3;
      sizeCols.forEach(col => {
        doc.text(col.label, sx, y + 5);
        sx += col.w;
      });
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      statementRows.sort((a, b) => a.size - b.size).forEach((row, idx) => {
        checkNewPage(9);
        const bg = idx % 2 === 0 ? DARK : DARK2;
        doc.setFillColor(...(bg as [number, number, number]));
        doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F');

        const rowVals = [
          `${row.size.toFixed(2)}mm`,
          row.shape,
          `$${row.costPerCt.toFixed(0)}/ct`,
          row.quantityPcs.toLocaleString(),
          ct4(row.weightCt),
          row.incomingCt > 0 ? ct4(row.incomingCt) : '—',
          row.usedCt > 0 ? ct4(row.usedCt) : '—',
          usd(row.totalValueUsd),
        ];

        let scx = MARGIN + 3;
        rowVals.forEach((val, vi) => {
          if (vi === 3) doc.setTextColor(...WHITE);
          else if (vi === 5 && row.incomingCt > 0) doc.setTextColor(...GREEN);
          else if (vi === 6 && row.usedCt > 0) doc.setTextColor(...RED);
          else if (vi === 7) doc.setTextColor(...GOLD);
          else doc.setTextColor(...LIGHT_GREY);
          doc.text(val, scx, y + 5.2);
          scx += sizeCols[vi].w;
        });
        y += 7.5;
      });

      // Grand total row
      checkNewPage(12);
      doc.setFillColor(40, 36, 20);
      doc.setDrawColor(...(GOLD as [number, number, number]));
      doc.setLineWidth(0.4);
      doc.rect(MARGIN, y, CONTENT_W, 8.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...GOLD);

      const grandVals = [
        'TOTALS',
        '',
        '',
        summaryTotals.pcs.toLocaleString() + ' pcs',
        ct4(summaryTotals.weight),
        ct4(summaryTotals.incoming),
        ct4(summaryTotals.used),
        usd(summaryTotals.value),
      ];
      let gcx = MARGIN + 3;
      grandVals.forEach((v, vi) => {
        doc.text(v, gcx, y + 5.8);
        gcx += sizeCols[vi].w;
      });
      y += 14;

      // ═══════════════════════════════════════
      // SECTION 4: NOTES FOR THE CEO
      // ═══════════════════════════════════════
      checkNewPage(60);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...GOLD);
      doc.text('SECTION 4 — NOTES & KEY DEFINITIONS', MARGIN, y);
      y += 5;

      const notes = [
        ['Inventory Value', 'The total estimated dollar value of all melee diamonds currently on hand, calculated using each stone\'s size, weight, and our cost-per-carat rate.'],
        ['Received', 'Diamonds physically added to our melee inventory during the period. This includes stock purchases and confirmed deliveries.'],
        ['Sent to Factory', 'Diamonds dispatched to the factory floor for use in customer jewelry projects. These are still tracked as ours until confirmed used.'],
        ['Used in Factory', 'Diamonds confirmed as consumed in finished jewelry. These have been deducted from our inventory balance.'],
        ['Net Movement', 'The net change in diamond carats: Received minus Used. A positive number means we added more than we consumed (good). Negative means we consumed more than we received.'],
        ['Closing Value', 'The estimated total inventory value at the end of each day, reflecting all activity up to that point.'],
        ['Melee Diamonds', 'Small diamonds (under 0.20ct each) used as accent stones in jewelry. We track these by size (mm) and cut shape as they are handled in bulk.'],
      ];

      notes.forEach(([term, def]) => {
        checkNewPage(14);
        doc.setFillColor(...DARK2);
        doc.roundedRect(MARGIN, y, CONTENT_W, 13, 1.5, 1.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...GOLD);
        doc.text(term + ':', MARGIN + 4, y + 5.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...LIGHT_GREY);
        const lines = doc.splitTextToSize(def, CONTENT_W - 8);
        doc.text(lines[0] || '', MARGIN + 4, y + 10.5);
        y += 15;
      });

      // ═══════════════════════════════════════
      // LAST PAGE: FOOTER ON EACH PAGE
      // ═══════════════════════════════════════
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFillColor(...DARK);
        doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
        doc.setFillColor(...GOLD);
        doc.rect(0, PAGE_H - 10, PAGE_W, 0.5, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...MID_GREY);
        doc.text('Kilani Diamond Reporter — Daily Diamond Statement — CONFIDENTIAL', MARGIN, PAGE_H - 4);
        doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' });
      }

      // Save PDF
      const filename = `Kilani_Diamond_Statement_${startDate}_to_${endDate}.pdf`;
      doc.save(filename);
    });
  };

  const getShapeIcon = (shape: DiamondShape) => {
    switch (shape) {
      case 'Princess': return '◆';
      case 'Emerald': return '▬';
      case 'Oval': return '◯';
      case 'Cushion': return '▢';
      case 'Marquise': return '◇';
      default: return '◈';
    }
  };

  const getShapeColor = (shape: DiamondShape) => {
    switch (shape) {
      case 'Princess': return 'text-violet-400';
      case 'Emerald': return 'text-emerald-400';
      case 'Oval': return 'text-sky-400';
      case 'Cushion': return 'text-rose-400';
      case 'Marquise': return 'text-amber-400';
      default: return 'text-lux-gold';
    }
  };

  const uniqueShapes = useMemo(() => {
    const shapes = new Set(statementRows.map(r => r.shape));
    return Array.from(shapes);
  }, [statementRows]);

  const shapeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    statementRows.forEach(r => {
      counts[r.shape] = (counts[r.shape] || 0) + 1;
    });
    return counts;
  }, [statementRows]);

  // Compute second month for dual-calendar display
  const nextMonthData = useMemo(() => {
    let m = navMonth + 1;
    let y = navYear;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    return { year: y, monthIndex: m };
  }, [navYear, navMonth]);

  const handleNavPrevMonth = () => {
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear(y => y - 1);
    } else {
      setNavMonth(m => m - 1);
    }
  };

  const handleNavNextMonth = () => {
    if (navMonth === 11) {
      setNavMonth(0);
      setNavYear(y => y + 1);
    } else {
      setNavMonth(m => m + 1);
    }
  };

  // Helper to render calendar month cell grid
  const renderCalendarGrid = (year: number, monthIndex: number) => {
    const daysGrid = getMonthGrid(year, monthIndex);
    const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    return (
      <div className="space-y-2">
        <div className="text-center font-extrabold text-white text-xs tracking-wide">
          {MONTH_NAMES[monthIndex]} {year}
        </div>
        <div className="grid grid-cols-7 text-center gap-1">
          {dayNames.map(d => (
            <span key={d} className="text-[10px] font-bold text-zinc-500 py-1">
              {d}
            </span>
          ))}
          {daysGrid.map((d, i) => {
            if (d === null) {
              return <div key={`empty-${i}`} className="h-8" />;
            }

            const mm = String(monthIndex + 1).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            const dateStr = `${year}-${mm}-${dd}`;
            const isDisabled = dateStr > todayET;

            const isStart = tempStartDate === dateStr;
            const isEnd = tempEndDate === dateStr;

            // Determine if date falls in active or draft hover range
            const effectiveEnd = (tempStartDate && tempEndDate && tempStartDate !== tempEndDate)
              ? tempEndDate
              : hoverDate;

            const minD = tempStartDate && effectiveEnd ? (tempStartDate < effectiveEnd ? tempStartDate : effectiveEnd) : null;
            const maxD = tempStartDate && effectiveEnd ? (tempStartDate < effectiveEnd ? effectiveEnd : tempStartDate) : null;

            const isInRange = minD && maxD && dateStr > minD && dateStr < maxD;

            return (
              <button
                key={dateStr}
                disabled={isDisabled}
                onClick={() => handleCalendarDayClick(dateStr)}
                onMouseEnter={() => {
                  if (tempStartDate && tempStartDate === tempEndDate) {
                    setHoverDate(dateStr);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                className={`h-8 w-full flex items-center justify-center text-xs font-bold transition-all relative ${
                  isDisabled
                    ? 'text-zinc-700 cursor-not-allowed opacity-40 rounded-full'
                    : isStart || isEnd
                    ? 'bg-lux-gold text-black shadow-lg shadow-amber-400/40 z-10 font-black scale-105 rounded-full'
                    : isInRange
                    ? 'bg-amber-500/25 text-amber-300 font-bold hover:bg-amber-500/40 rounded-full border border-amber-400/20'
                    : 'text-zinc-200 hover:bg-zinc-800 hover:text-white rounded-full'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═══════════════════════════════════════════════════════
          COMMAND & CONTROL BAR — Airbnb-Style Trigger & Actions
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800/80 p-3.5 sm:p-4 rounded-2xl backdrop-blur-md shadow-xl"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-400/30 flex items-center justify-center shrink-0 shadow-inner">
              <DiamondShapeIcon shape="Round Brilliant" size={16} className="text-lux-gold shrink-0" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-none">Daily Diamond Statement</h2>
              <p className="text-[10px] sm:text-[11px] text-zinc-400 font-medium mt-0.5">Melee inventory snapshots, factory transfers & usage mirror</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Airbnb-style Filter Trigger Button */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-between sm:justify-start gap-2 bg-zinc-950/90 border border-amber-400/40 hover:border-amber-400/80 px-3.5 py-2.5 min-h-[44px] rounded-xl text-white shadow-lg transition-all hover:bg-zinc-900 active:scale-[0.98] group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CalendarIcon size={14} className="text-lux-gold shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold tracking-wide text-zinc-200 truncate">{periodHeaderString}</span>
            </div>
            <SlidersHorizontal size={13} className="text-zinc-400 shrink-0 ml-1" />
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs px-3.5 py-2.5 min-h-[44px] rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
            >
              <Download size={13} /> Export Excel
            </Button>

            <Button
              onClick={handlePrint}
              variant="outline"
              className="flex-1 sm:flex-none border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-xs px-3.5 py-2.5 min-h-[44px] rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Printer size={13} /> Print
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Validation Alert */}
      {validationError && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-400 text-xs font-semibold"
        >
          <AlertTriangle size={15} className="shrink-0 text-rose-400" />
          <span>{validationError}</span>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
          HERO BANNER — Touch-Optimized Cards
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4"
      >
        {/* Inventory Total Value */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-2xl border border-zinc-800/80 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(18,19,24,0.95) 0%, rgba(31,33,40,0.9) 50%, rgba(18,19,24,0.95) 100%)',
          }}
        >
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-amber-500/[0.06] rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-blue-500/[0.04] rounded-full blur-[60px] pointer-events-none" />
          
          <div className="relative z-10 p-4 sm:p-6 md:p-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                  <DiamondShapeIcon shape="Round Brilliant" size={13} className="text-black shrink-0" />
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-400/90">Inventory Total Value</span>
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                Endpoint Snapshot
              </span>
            </div>
            <div className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-none">
              <AnimatedValue value={summaryTotals.value} prefix="$" suffix=" USD" />
            </div>
            <div className="mt-2.5 sm:mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-lux-gold inline-block" />
                {summaryTotals.sizesTracked} Melee Diamond Sizes Tracked
              </span>
            </div>
          </div>
        </div>

        {/* TOTAL RECEIVED */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-emerald-500/30 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(4,40,28,0.6) 0%, rgba(18,19,24,0.95) 100%)',
          }}
        >
          <div className="absolute -top-14 -right-14 w-48 h-48 bg-emerald-400/[0.08] rounded-full blur-[60px] pointer-events-none" />
          
          <div className="relative z-10 p-4 sm:p-6 md:p-8 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
                  <ArrowDownLeft size={12} className="text-black" />
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-400">Total Received</span>
              </div>
              <div className="px-2 py-0.5 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
                <span className="text-[9px] sm:text-[10px] font-bold text-emerald-400">Shipments Only</span>
              </div>
            </div>
            <div className="mt-2.5 sm:mt-3">
              <div className="text-2xl sm:text-3xl md:text-4xl font-black text-emerald-300 tracking-tight leading-none">
                +{summaryTotals.incoming.toFixed(3)} ct
              </div>
              <div className="text-xs text-emerald-400/70 mt-1.5 sm:mt-2 font-semibold">
                {summaryTotals.incoming > 0
                  ? `+${summaryTotals.incomingUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD received`
                  : '$0.00 USD received in selected period'}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          4 METRIC CARDS — 2x2 Mobile Grid
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3"
      >
        {[
          { label: 'Total Pieces', value: summaryTotals.pcs.toLocaleString(), sub: 'closing balance', color: 'text-white', border: 'border-zinc-800', bg: 'bg-zinc-900/60', icon: <Layers size={14} className="text-zinc-400" /> },
          { label: 'Total Weight', value: `${summaryTotals.weight.toFixed(3)} ct`, sub: 'closing balance', color: 'text-white', border: 'border-zinc-800', bg: 'bg-zinc-900/60', icon: <BarChart3 size={14} className="text-zinc-400" /> },
          { label: 'Sent to Factory', value: `${summaryTotals.factorySent.toFixed(2)} ct`, sub: 'transferred in period', color: 'text-blue-300', border: 'border-blue-500/25', bg: 'bg-blue-950/20', icon: <Factory size={14} className="text-blue-400" /> },
          { label: 'Used in Factory', value: `${summaryTotals.used.toFixed(2)} ct`, sub: 'confirmed usage', color: 'text-amber-300', border: 'border-amber-500/25', bg: 'bg-amber-950/20', icon: <ArrowUpRight size={14} className="text-amber-400" /> },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.12 + i * 0.05 }}
          >
            <Card className={`p-3.5 sm:p-4 ${card.bg} ${card.border} hover:border-zinc-600 transition-all duration-300 group`}>
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 group-hover:text-zinc-300 transition-colors">{card.label}</span>
                {card.icon}
              </div>
              <div className={`text-base sm:text-xl font-black ${card.color} tracking-tight tabular-nums`}>{card.value}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{card.sub}</div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          DAILY BREAKDOWN MATRIX — Dual View (Table / Cards)
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <Card className="overflow-hidden border-zinc-800/80 bg-zinc-950/60 shadow-2xl backdrop-blur-sm">
          <div className="p-3.5 sm:p-4 border-b border-zinc-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400/15 to-amber-600/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                <Activity size={13} className="text-lux-gold" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white leading-none">Daily Breakdown Matrix</h3>
                <span className="text-[10px] text-zinc-400 font-medium">
                  {dailyBreakdownRows.length} calendar day{dailyBreakdownRows.length > 1 ? 's' : ''} in range ({startTime} - {endTime} ET)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
              <button
                onClick={() => setBreakdownViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  breakdownViewMode === 'table' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Table View"
              >
                <List size={13} />
              </button>
              <button
                onClick={() => setBreakdownViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  breakdownViewMode === 'cards' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Card View (Mobile)"
              >
                <LayoutGrid size={13} />
              </button>
            </div>
          </div>

          {breakdownViewMode === 'table' ? (
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full text-left text-[11px] min-w-[650px] sm:min-w-full">
                <thead>
                  <tr className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase text-[9px] tracking-widest font-extrabold">
                    <th className="py-3 px-4 sticky left-0 bg-zinc-900/95">Date</th>
                    <th className="py-3 px-3 text-right text-emerald-400/80">Received (ct)</th>
                    <th className="py-3 px-3 text-right text-emerald-400/80">Received (USD)</th>
                    <th className="py-3 px-3 text-right text-blue-400/80">Sent to Factory</th>
                    <th className="py-3 px-3 text-right text-amber-400/80">Used in Factory</th>
                    <th className="py-3 px-3 text-right text-zinc-400">Closing Pcs</th>
                    <th className="py-3 px-3 text-right text-zinc-400">Closing Weight</th>
                    <th className="py-3 px-3 text-right text-amber-400">Closing Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {dailyBreakdownRows.map((row) => (
                    <tr
                      key={row.dateStr}
                      className={`transition-colors ${
                        row.hasActivity ? 'bg-zinc-950/40 hover:bg-white/[0.02]' : 'bg-zinc-900/20 hover:bg-zinc-900/30'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-bold text-white flex items-center gap-2 sticky left-0 bg-zinc-950/95 sm:bg-transparent">
                        <span>{row.displayDate}</span>
                        {!row.hasActivity && (
                          <span className="text-[9px] font-bold text-zinc-500 bg-zinc-800/60 border border-zinc-700/50 px-1.5 py-0.5 rounded">
                            Zero Activity
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {row.incomingCt > 0 ? (
                          <span className="text-emerald-400 font-semibold">+{row.incomingCt.toFixed(3)} ct</span>
                        ) : (
                          <span className="text-zinc-600">0.000 ct</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-zinc-400">
                        {row.incomingUsd > 0 ? `$${row.incomingUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '$0.00'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {row.factorySentCt > 0 ? (
                          <span className="text-blue-300 font-semibold">{row.factorySentCt.toFixed(3)} ct</span>
                        ) : (
                          <span className="text-zinc-600">0.000 ct</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {row.usedCt > 0 ? (
                          <span className="text-amber-300 font-semibold">{row.usedCt.toFixed(3)} ct</span>
                        ) : (
                          <span className="text-zinc-600">0.000 ct</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300 font-medium">{row.closingPcs.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-zinc-200 font-bold">{row.closingWeightCt.toFixed(3)} ct</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-amber-300/90">
                        ${row.closingValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-3 space-y-2.5">
              {dailyBreakdownRows.map((row) => (
                <div
                  key={row.dateStr}
                  className={`p-3.5 rounded-xl border ${
                    row.hasActivity ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-900/20 border-zinc-800/40 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800/60">
                    <span className="text-xs font-extrabold text-white">{row.displayDate}</span>
                    {!row.hasActivity ? (
                      <span className="text-[9px] font-bold text-zinc-500 bg-zinc-800/60 border border-zinc-700/50 px-2 py-0.5 rounded">
                        Zero Activity
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded">
                        Active Day
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-500 text-[10px] block uppercase">Received</span>
                      <span className="font-bold text-emerald-400">+{row.incomingCt.toFixed(3)} ct</span>
                      <span className="text-zinc-500 text-[10px] block">${row.incomingUsd.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block uppercase">Sent to Factory</span>
                      <span className="font-bold text-blue-300">{row.factorySentCt.toFixed(3)} ct</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block uppercase">Used in Factory</span>
                      <span className="font-bold text-amber-300">{row.usedCt.toFixed(3)} ct</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block uppercase">Closing Stock</span>
                      <span className="font-bold text-white">{row.closingWeightCt.toFixed(3)} ct</span>
                      <span className="text-amber-300 text-[10px] block">${row.closingValueUsd.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          FILTER BAR — Search + Modes + Shape Badges
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.18 }}
        className="space-y-3 bg-zinc-900/30 backdrop-blur-sm p-3.5 sm:p-4 rounded-2xl border border-zinc-800/60"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search size, shape, or cost..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/80 border border-zinc-800 text-white placeholder:text-zinc-600 text-xs sm:text-[11px] rounded-xl pl-8 pr-4 py-2.5 sm:py-2 focus:outline-none focus:border-lux-gold/50 focus:ring-1 focus:ring-lux-gold/20 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            {[
              { key: 'all' as const, label: `All (${statementRows.length})`, active: 'bg-zinc-700 text-white', inactive: 'bg-zinc-900 text-zinc-400 hover:text-zinc-200' },
              { key: 'gains' as const, label: 'Net Gain ↑', active: 'bg-emerald-500/90 text-black', inactive: 'bg-zinc-900 text-emerald-400/80 hover:text-emerald-300' },
              { key: 'consumed' as const, label: 'Net Loss ↓', active: 'bg-rose-500/90 text-white', inactive: 'bg-zinc-900 text-rose-400/80 hover:text-rose-300' },
              { key: 'high_value' as const, label: '$5k+', active: 'bg-amber-400 text-black', inactive: 'bg-zinc-900 text-amber-400/80 hover:text-amber-300' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterMode(f.key)}
                className={`flex-1 sm:flex-none py-2 px-3 sm:py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all duration-200 border min-h-[36px] sm:min-h-0 flex items-center justify-center ${
                  filterMode === f.key
                    ? `${f.active} border-transparent shadow-sm`
                    : `${f.inactive} border-zinc-800 hover:border-zinc-700`
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-800/40 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          <button
            onClick={() => setSelectedShape('all')}
            className={`px-3 py-1.5 sm:py-1 rounded-full text-[10px] font-bold tracking-wide transition-all duration-200 shrink-0 ${
              selectedShape === 'all'
                ? 'bg-lux-gold text-black shadow-sm shadow-amber-400/20'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            All Shapes
          </button>
          {uniqueShapes.map(shape => (
            <button
              key={shape}
              onClick={() => setSelectedShape(shape)}
              className={`px-3 py-1.5 sm:py-1 rounded-full text-[10px] font-bold tracking-wide transition-all duration-200 flex items-center gap-1.5 shrink-0 ${
                selectedShape === shape
                  ? 'bg-lux-gold text-black shadow-sm shadow-amber-400/20'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <span className={`${getShapeColor(shape as DiamondShape)} ${selectedShape === shape ? '!text-black' : ''}`}>
                <DiamondShapeIcon shape={shape} size={12} className="shrink-0" />
              </span>
              {shape}
              <span className="opacity-60">({shapeCounts[shape]})</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          MAIN STATEMENT TABLE + MOVEMENT DRAWER
          ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className={`${drawerOpen && selectedRow ? 'lg:col-span-2' : 'lg:col-span-3'} transition-all duration-500`}
        >
          <Card className="overflow-hidden border-zinc-800/80 bg-zinc-950/60 shadow-2xl backdrop-blur-sm">
            <div className="p-3.5 sm:p-4 border-b border-zinc-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400/15 to-amber-600/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                  <DiamondShapeIcon shape="Round Brilliant" size={14} className="text-lux-gold shrink-0" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white leading-none">Diamond Statement by Size</h3>
                  <span className="text-[10px] text-zinc-400 font-medium">
                    {filteredData.length} of {statementRows.length} sizes
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500 italic hidden md:block">Tap any row to see movement details →</span>
            </div>

            <div ref={tableRef} className="overflow-x-auto max-h-[540px] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin', scrollbarColor: 'rgba(245,194,73,0.15) transparent' }}>
              <table className="w-full text-left text-[11px] min-w-[600px] sm:min-w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
                    <th className="py-3 px-4 font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-400">Size</th>
                    <th className="py-3 px-3 font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-400">Shape</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-400">Cost/ct</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-400">Closing Qty</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-400">Closing Weight</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-amber-400/80">Value</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-emerald-400/80">IN</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-rose-400/80">USED</th>
                    <th className="py-3 px-3 font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-400">Net</th>
                    <th className="py-3 px-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30">
                  {filteredData.map((row, idx) => {
                    const isSelected = selectedRow?.specId === row.specId;

                    return (
                      <motion.tr
                        key={row.specId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15, delay: idx * 0.005 }}
                        onClick={() => handleSelectRow(row)}
                        className={`cursor-pointer transition-all duration-200 group/row ${
                          isSelected
                            ? 'bg-amber-500/[0.08] border-l-[3px] border-l-amber-400'
                            : 'hover:bg-white/[0.02] border-l-[3px] border-l-transparent'
                        }`}
                      >
                        <td className="py-3 sm:py-2.5 px-4">
                          <span className="font-bold text-white tabular-nums">{row.size.toFixed(2)}</span>
                          <span className="text-zinc-500 ml-0.5">mm</span>
                        </td>
                        <td className="py-3 sm:py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1.5 ${getShapeColor(row.shape)}`}>
                            <DiamondShapeIcon shape={row.shape} size={14} className="shrink-0" />
                            <span className="text-zinc-400 text-[10px] font-medium">{row.shape.split(' ')[0]}</span>
                          </span>
                        </td>
                        <td className="py-3 sm:py-2.5 px-3 text-right text-zinc-400 tabular-nums">${row.costPerCt}</td>
                        <td className="py-3 sm:py-2.5 px-3 text-right text-zinc-300 tabular-nums font-medium">{row.quantityPcs.toLocaleString()}</td>
                        <td className="py-3 sm:py-2.5 px-3 text-right text-zinc-200 font-bold tabular-nums">{row.weightCt.toFixed(3)}</td>
                        <td className="py-3 sm:py-2.5 px-3 text-right font-bold tabular-nums">
                          <span className="text-amber-300/90">${row.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </td>
                        <td className="py-3 sm:py-2.5 px-3 text-right tabular-nums">
                          {row.incomingCt > 0 ? (
                            <span className="text-emerald-400 font-semibold">+{row.incomingCt.toFixed(2)}</span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="py-3 sm:py-2.5 px-3 text-right tabular-nums">
                          {row.usedCt > 0 ? (
                            <span className="text-rose-400/80 font-semibold">{row.usedCt.toFixed(2)}</span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="py-3 sm:py-2.5 px-3">
                          <NetBar incoming={row.incomingCt} used={row.usedCt} maxRange={maxNetRange} />
                        </td>
                        <td className="py-3 sm:py-2.5 px-2">
                          <ChevronRight size={12} className={`transition-all duration-200 ${isSelected ? 'text-amber-400 translate-x-0.5' : 'text-zinc-700 group-hover/row:text-zinc-500'}`} />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr className="bg-zinc-900/95 backdrop-blur-sm border-t-2 border-amber-400/30">
                    <td className="py-3 px-4 font-extrabold text-[10px] uppercase text-lux-gold tracking-wider" colSpan={3}>Totals ({statementRows.length} sizes)</td>
                    <td className="py-3 px-3 text-right font-extrabold text-white tabular-nums">{summaryTotals.pcs.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-white tabular-nums">{summaryTotals.weight.toFixed(3)}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-lux-gold tabular-nums">${summaryTotals.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-emerald-400 tabular-nums">+{summaryTotals.incoming.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-rose-400 tabular-nums">{summaryTotals.used.toFixed(2)}</td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-black tabular-nums ${netMovementTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {netMovementTotal >= 0 ? '+' : ''}{netMovementTotal.toFixed(2)} ct
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* Movement Detail Drawer */}
        <AnimatePresence mode="wait">
          {drawerOpen && selectedRow && (
            <>
              <div
                onClick={() => setDrawerOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
              />

              <motion.div
                key={`drawer-${selectedRow.specId}`}
                initial={{ opacity: 0, y: 50, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.97 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-50 lg:relative lg:inset-auto lg:z-auto lg:col-span-1 max-h-[85vh] lg:max-h-none overflow-y-auto"
              >
                <Card className="p-0 bg-zinc-950/95 lg:bg-zinc-950/80 border-amber-500/30 shadow-2xl backdrop-blur-xl sticky top-6 overflow-hidden rounded-t-3xl lg:rounded-2xl">
                  <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mt-2.5 mb-1 lg:hidden" />

                  <div className="p-4 sm:p-5 pb-4 border-b border-zinc-800/60 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-400/[0.04] rounded-full blur-[40px] pointer-events-none" />
                    
                    <div className="flex items-start justify-between relative z-10">
                      <div>
                        <div className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-400/80 flex items-center gap-1.5 mb-1">
                          <Activity size={11} /> Period Movement
                        </div>
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-xl font-black text-white tracking-tight">{selectedRow.size.toFixed(2)} mm</h3>
                          <span className={`text-sm font-medium flex items-center gap-1.5 ${getShapeColor(selectedRow.shape)}`}>
                            <DiamondShapeIcon shape={selectedRow.shape} size={16} className="shrink-0" /> {selectedRow.shape}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setDrawerOpen(false)}
                        className="w-8 h-8 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 flex items-center justify-center transition-colors"
                      >
                        <X size={14} className="text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 space-y-2">
                      <div className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-[0.15em]">Closing Valuation</div>
                      <div className="text-2xl font-black text-lux-gold tracking-tight tabular-nums">
                        ${selectedRow.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span>Stock: <strong className="text-zinc-200">{selectedRow.weightCt.toFixed(3)} ct</strong></span>
                        <span>Qty: <strong className="text-zinc-200">{selectedRow.quantityPcs} pcs</strong></span>
                        <span>Rate: <strong className="text-zinc-200">${selectedRow.costPerCt}/ct</strong></span>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="p-3.5 rounded-xl bg-emerald-950/25 border border-emerald-500/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-emerald-400/90 flex items-center gap-1.5">
                            <ArrowDownLeft size={12} /> Received in Period
                          </span>
                          <span className="text-xs font-black text-emerald-300 tabular-nums">+{selectedRow.incomingCt.toFixed(3)} ct</span>
                        </div>
                        <div className="text-[10px] text-emerald-400/70 font-medium">
                          Worth ${selectedRow.incomingUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-blue-400/90 flex items-center gap-1.5">
                            <Factory size={12} /> Sent to Factory
                          </span>
                          <span className="text-xs font-black text-blue-300 tabular-nums">{selectedRow.factorySentCt.toFixed(3)} ct</span>
                        </div>
                        <div className="text-[10px] text-blue-400/70 font-medium">
                          Transferred to factory setters
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-amber-400/90 flex items-center gap-1.5">
                            <ArrowUpRight size={12} /> Used in Factory
                          </span>
                          <span className="text-xs font-black text-amber-300 tabular-nums">{selectedRow.usedCt.toFixed(3)} ct</span>
                        </div>
                        <div className="text-[10px] text-amber-400/70 font-medium">
                          Confirmed usage by Managers
                        </div>
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border text-center ${
                      (selectedRow.incomingCt - selectedRow.usedCt) >= 0
                        ? 'bg-emerald-950/15 border-emerald-500/15'
                        : 'bg-rose-950/15 border-rose-500/15'
                    }`}>
                      <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400 mb-1">Net Change in Period</div>
                      <div className={`text-lg font-black tabular-nums ${
                        (selectedRow.incomingCt - selectedRow.usedCt) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {(selectedRow.incomingCt - selectedRow.usedCt) >= 0 ? '+' : ''}
                        {(selectedRow.incomingCt - selectedRow.usedCt).toFixed(3)} ct
                      </div>
                    </div>

                    {/* Deep Drill-Down Navigation Trace */}
                    {store.getBags().filter(b => b.items.some(i => i.specId === selectedRow.specId)).length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center justify-between">
                          <span>Project & Bag Trace ({store.getBags().filter(b => b.items.some(i => i.specId === selectedRow.specId)).length})</span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {store.getBags().filter(b => b.items.some(i => i.specId === selectedRow.specId)).slice(0, 6).map(bag => {
                            const project = store.getProject(bag.projectId);
                            const holder = store.getUser(bag.issuedToId);
                            return (
                              <div key={bag.id} className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-center justify-between text-xs">
                                <div>
                                  <div className="font-bold text-white flex items-center gap-1.5">
                                    <span>Bag #{bag.bagNumber}</span>
                                    {project && <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded-full font-mono">{project.code}</span>}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 mt-0.5">Holder: {holder?.name || 'Setter'} | {bag.issuedAt ? new Date(bag.issuedAt).toLocaleDateString() : '-'}</div>
                                </div>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase bg-zinc-800 px-2 py-1 rounded-lg">
                                  {bag.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════════════════
          AIRBNB-STYLE DUAL-MONTH CALENDAR & TIME FILTER MODAL
          (Exact Implementation of User's Selected Mockup)
          ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-2xl bg-zinc-950 border border-amber-400/30 rounded-3xl shadow-2xl overflow-hidden p-4 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto"
            >
              {/* Modal Drag Pill on mobile */}
              <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto sm:hidden" />

              {/* Segmented Top Tab Toggle */}
              <div className="grid grid-cols-2 p-1 bg-zinc-900/90 rounded-2xl border border-zinc-800">
                <button
                  onClick={() => setModalTab('dates')}
                  className={`py-2 text-xs font-extrabold rounded-xl transition-all ${
                    modalTab === 'dates'
                      ? 'bg-zinc-950 text-amber-400 border border-amber-400/60 shadow-lg shadow-amber-400/10'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Dates
                </button>
                <button
                  onClick={() => setModalTab('presets')}
                  className={`py-2 text-xs font-extrabold rounded-xl transition-all ${
                    modalTab === 'presets'
                      ? 'bg-zinc-950 text-amber-400 border border-amber-400/60 shadow-lg shadow-amber-400/10'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Presets
                </button>
              </div>

              {/* TAB 1: DUAL-MONTH CALENDAR & TIME WINDOW */}
              {modalTab === 'dates' && (
                <div className="space-y-5">
                  {/* Month Navigation & Calendar Grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleNavPrevMonth}
                        className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <span className="text-xs font-bold text-zinc-400">
                        Select Start & End Dates (Max 90 Days)
                      </span>

                      <button
                        onClick={handleNavNextMonth}
                        className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* Dual Month View on desktop / Single month view on mobile */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-zinc-900/40 border border-zinc-800/80 p-4 rounded-2xl">
                      <div>{renderCalendarGrid(navYear, navMonth)}</div>
                      <div className="hidden sm:block">{renderCalendarGrid(nextMonthData.year, nextMonthData.monthIndex)}</div>
                    </div>
                  </div>

                  {/* Time-Window Selection Controls */}
                  <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-400" /> Time-window selection
                    </label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block mb-1">Start Time</span>
                        <select
                          value={tempStartTime}
                          onChange={(e) => setTempStartTime(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-white text-[16px] sm:text-xs font-semibold rounded-xl px-3 py-2.5 min-h-[44px] focus:outline-none focus:border-amber-400"
                        >
                          <option value="10:00">10:00 AM</option>
                          <option value="11:00">11:00 AM</option>
                          <option value="12:00">12:00 PM</option>
                          <option value="13:00">1:00 PM</option>
                          <option value="14:00">2:00 PM</option>
                          <option value="15:00">3:00 PM</option>
                          <option value="16:00">4:00 PM</option>
                          <option value="17:00">5:00 PM</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block mb-1">End Time</span>
                        <select
                          value={tempEndTime}
                          onChange={(e) => setTempEndTime(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-white text-[16px] sm:text-xs font-semibold rounded-xl px-3 py-2.5 min-h-[44px] focus:outline-none focus:border-amber-400"
                        >
                          <option value="11:00">11:00 AM</option>
                          <option value="12:00">12:00 PM</option>
                          <option value="13:00">1:00 PM</option>
                          <option value="14:00">2:00 PM</option>
                          <option value="15:00">3:00 PM</option>
                          <option value="16:00">4:00 PM</option>
                          <option value="17:00">5:00 PM</option>
                          <option value="18:00">6:00 PM</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block mb-1">Timezone</span>
                        <div className="bg-zinc-900 border border-zinc-800 text-amber-400 text-xs font-bold rounded-xl px-3 py-2.5 min-h-[44px] flex items-center">
                          Eastern Time (ET)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Preset Pills Section */}
                  <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                    <label className="text-xs font-bold text-white block">Quick preset pills</label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { key: 'today', label: 'Today' },
                        { key: 'yesterday', label: 'Yesterday' },
                        { key: '7days', label: 'Last 7 Days' },
                        { key: '30days', label: 'Last 30 Days' },
                        { key: 'thisMonth', label: 'This Month' },
                      ].map(p => (
                        <button
                          key={p.key}
                          onClick={() => applyPreset(p.key as any)}
                          className="px-3.5 py-2 rounded-full text-xs font-bold bg-zinc-900 hover:bg-amber-500/10 border border-zinc-800 hover:border-amber-400/40 text-zinc-300 hover:text-amber-300 transition-all active:scale-[0.98] min-h-[38px]"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PRESETS MODE */}
              {modalTab === 'presets' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2">
                  {[
                    { key: 'today', label: 'Today (ET)', sub: '10:00 AM - 6:00 PM' },
                    { key: 'yesterday', label: 'Yesterday', sub: 'Previous Business Day' },
                    { key: '7days', label: 'Last 7 Days', sub: 'Past 1 Week Window' },
                    { key: '30days', label: 'Last 30 Days', sub: 'Past Month Window' },
                    { key: 'thisMonth', label: 'This Month', sub: 'Month-to-Date Window' },
                  ].map(p => (
                    <button
                      key={p.key}
                      onClick={() => applyPreset(p.key as any)}
                      className="p-4 rounded-2xl bg-zinc-900 hover:bg-amber-500/10 border border-zinc-800 hover:border-amber-400/40 text-left transition-all active:scale-[0.98] group min-h-[64px]"
                    >
                      <span className="text-xs font-extrabold text-white group-hover:text-amber-300 block">{p.label}</span>
                      <span className="text-[10px] text-zinc-500 block mt-1">{p.sub}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Validation Alert inside Modal */}
              {validationError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-400 text-xs font-semibold">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* Modal Action Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-zinc-800">
                <div className="text-xs font-extrabold text-amber-400 truncate max-w-full">
                  {tempPeriodHeaderString}
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={() => applyPreset('today')}
                    className="flex-1 sm:flex-none border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs font-extrabold px-4 py-2.5 min-h-[44px] rounded-xl transition-colors"
                  >
                    Reset
                  </button>
                  <Button
                    disabled={!!validationError}
                    onClick={handleApplyFilter}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-amber-400 to-amber-500 text-black font-black text-xs px-6 py-2.5 min-h-[44px] rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-[0.98]"
                  >
                    Apply Filter
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
