import React, { useState, useMemo, useRef } from 'react';
import { Download, Printer, Search, ArrowDownLeft, ArrowUpRight, Filter, Calendar, Activity, Gem, TrendingUp, X, ChevronRight, Factory, Layers, Info, BarChart3, Diamond, Sparkles, Eye } from 'lucide-react';
import { Card, Button } from '../UI';
import { motion, AnimatePresence } from 'motion/react';

export type DiamondShape = 'Round Brilliant' | 'Princess' | 'Emerald' | 'Oval' | 'Cushion' | 'Marquise' | 'Pear' | 'Radiant';

export interface DailyStatementRow {
  size: number;
  shape: DiamondShape;
  costPerCt: number;
  quantityPcs: number;
  weightCt: number;
  totalValueUsd: number;
  incomingCt: number;
  usedCt: number;
  factorySentCt?: number;
}

export const AUG_4_STATEMENT_DATA: DailyStatementRow[] = [
  { size: 0.50, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 701, weightCt: 0.645, totalValueUsd: 483.75, incomingCt: 0, usedCt: 0.104, factorySentCt: 0.200 },
  { size: 0.60, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 1326, weightCt: 1.591, totalValueUsd: 1193.25, incomingCt: 0, usedCt: 0.7252, factorySentCt: 0.850 },
  { size: 0.70, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 1306, weightCt: 1.959, totalValueUsd: 1469.25, incomingCt: 0, usedCt: 1.4575, factorySentCt: 1.600 },
  { size: 0.80, shape: 'Princess', costPerCt: 750, quantityPcs: 1332, weightCt: 3.463, totalValueUsd: 2597.25, incomingCt: 6.9436, usedCt: 3.2942, factorySentCt: 4.500 },
  { size: 0.85, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 2491, weightCt: 7.473, totalValueUsd: 5604.75, incomingCt: 0, usedCt: 2.2848, factorySentCt: 3.000 },
  { size: 0.90, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 601, weightCt: 2.284, totalValueUsd: 1713.00, incomingCt: 7.496, usedCt: 5.4637, factorySentCt: 6.200 },
  { size: 0.95, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 2579, weightCt: 10.058, totalValueUsd: 7543.50, incomingCt: 0.081, usedCt: 2.7698, factorySentCt: 3.200 },
  { size: 1.00, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 601, weightCt: 2.704, totalValueUsd: 2028.00, incomingCt: 5.087, usedCt: 5.7244, factorySentCt: 5.800 },
  { size: 1.05, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 2869, weightCt: 14.919, totalValueUsd: 11189.25, incomingCt: 0.024, usedCt: 3.3852, factorySentCt: 4.100 },
  { size: 1.10, shape: 'Emerald', costPerCt: 750, quantityPcs: 426, weightCt: 2.471, totalValueUsd: 1853.25, incomingCt: 5.253, usedCt: 7.8945, factorySentCt: 6.500 },
  { size: 1.15, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 537, weightCt: 3.490, totalValueUsd: 2617.50, incomingCt: 0.052, usedCt: 1.7615, factorySentCt: 2.100 },
  { size: 1.20, shape: 'Round Brilliant', costPerCt: 750, quantityPcs: 331, weightCt: 2.317, totalValueUsd: 1737.75, incomingCt: 10.605, usedCt: 11.8205, factorySentCt: 11.000 },
  { size: 1.25, shape: 'Oval', costPerCt: 695, quantityPcs: 426, weightCt: 3.280, totalValueUsd: 2279.60, incomingCt: 0.291, usedCt: 5.0273, factorySentCt: 4.200 },
  { size: 1.30, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 310, weightCt: 3.007, totalValueUsd: 2089.87, incomingCt: 11.444, usedCt: 17.1282, factorySentCt: 14.500 },
  { size: 1.35, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 422, weightCt: 4.220, totalValueUsd: 2932.90, incomingCt: 5.474, usedCt: 6.9490, factorySentCt: 6.100 },
  { size: 1.40, shape: 'Emerald', costPerCt: 695, quantityPcs: 579, weightCt: 6.716, totalValueUsd: 4667.62, incomingCt: 16.115, usedCt: 16.0156, factorySentCt: 16.000 },
  { size: 1.45, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 295, weightCt: 3.658, totalValueUsd: 2542.31, incomingCt: 0.094, usedCt: 11.2512, factorySentCt: 10.500 },
  { size: 1.50, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 296, weightCt: 4.144, totalValueUsd: 2880.08, incomingCt: 15.496, usedCt: 18.4690, factorySentCt: 16.800 },
  { size: 1.55, shape: 'Cushion', costPerCt: 695, quantityPcs: 209, weightCt: 3.198, totalValueUsd: 2222.61, incomingCt: 10.563, usedCt: 8.5340, factorySentCt: 9.200 },
  { size: 1.60, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 582, weightCt: 10.476, totalValueUsd: 7280.82, incomingCt: 20.771, usedCt: 16.0430, factorySentCt: 18.500 },
  { size: 1.65, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 5, weightCt: 0.095, totalValueUsd: 66.03, incomingCt: 5.507, usedCt: 6.8930, factorySentCt: 6.000 },
  { size: 1.70, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 480, weightCt: 9.600, totalValueUsd: 6672.00, incomingCt: 24.966, usedCt: 23.9830, factorySentCt: 24.000 },
  { size: 1.75, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 400, weightCt: 8.640, totalValueUsd: 6004.80, incomingCt: 13.021, usedCt: 23.5708, factorySentCt: 20.100 },
  { size: 1.80, shape: 'Princess', costPerCt: 695, quantityPcs: 137, weightCt: 3.288, totalValueUsd: 2285.16, incomingCt: 36.944, usedCt: 37.7050, factorySentCt: 36.500 },
  { size: 1.85, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 221, weightCt: 5.812, totalValueUsd: 4039.34, incomingCt: 20.679, usedCt: 17.5568, factorySentCt: 18.900 },
  { size: 1.90, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 424, weightCt: 12.296, totalValueUsd: 8545.72, incomingCt: 20.712, usedCt: 21.1025, factorySentCt: 20.500 },
  { size: 1.95, shape: 'Oval', costPerCt: 695, quantityPcs: 326, weightCt: 9.976, totalValueUsd: 6933.32, incomingCt: 8.776, usedCt: 6.0410, factorySentCt: 7.200 },
  { size: 2.00, shape: 'Round Brilliant', costPerCt: 695, quantityPcs: 307, weightCt: 10.223, totalValueUsd: 7104.99, incomingCt: 23.109, usedCt: 29.2586, factorySentCt: 26.000 },
  { size: 2.10, shape: 'Round Brilliant', costPerCt: 735, quantityPcs: 128, weightCt: 5.222, totalValueUsd: 3838.17, incomingCt: 14.096, usedCt: 24.2730, factorySentCt: 20.000 },
  { size: 2.20, shape: 'Round Brilliant', costPerCt: 735, quantityPcs: 207, weightCt: 9.336, totalValueUsd: 6861.96, incomingCt: 25.040, usedCt: 25.2148, factorySentCt: 25.100 },
  { size: 2.30, shape: 'Cushion', costPerCt: 735, quantityPcs: 26, weightCt: 1.244, totalValueUsd: 914.34, incomingCt: 15.289, usedCt: 28.2799, factorySentCt: 22.000 },
  { size: 2.40, shape: 'Round Brilliant', costPerCt: 735, quantityPcs: 315, weightCt: 17.766, totalValueUsd: 13058.01, incomingCt: 28.107, usedCt: 24.0749, factorySentCt: 26.500 },
  { size: 2.50, shape: 'Round Brilliant', costPerCt: 735, quantityPcs: 358, weightCt: 22.769, totalValueUsd: 16735.22, incomingCt: 31.948, usedCt: 15.8340, factorySentCt: 22.000 },
  { size: 2.60, shape: 'Marquise', costPerCt: 735, quantityPcs: 32, weightCt: 2.179, totalValueUsd: 1601.57, incomingCt: 21.816, usedCt: 32.7800, factorySentCt: 28.000 },
  { size: 2.70, shape: 'Round Brilliant', costPerCt: 850, quantityPcs: 68, weightCt: 5.447, totalValueUsd: 4629.95, incomingCt: 6.108, usedCt: 17.4530, factorySentCt: 12.000 },
  { size: 2.80, shape: 'Round Brilliant', costPerCt: 950, quantityPcs: 93, weightCt: 8.482, totalValueUsd: 8057.90, incomingCt: 20.780, usedCt: 20.6344, factorySentCt: 20.700 },
  { size: 2.90, shape: 'Emerald', costPerCt: 950, quantityPcs: 101, weightCt: 9.848, totalValueUsd: 9355.60, incomingCt: 15.280, usedCt: 16.7942, factorySentCt: 16.000 },
  { size: 3.00, shape: 'Round Brilliant', costPerCt: 950, quantityPcs: 0, weightCt: 0.000, totalValueUsd: 0.00, incomingCt: 0.670, usedCt: 1.3120, factorySentCt: 1.000 },
  { size: 3.10, shape: 'Round Brilliant', costPerCt: 950, quantityPcs: 24, weightCt: 2.856, totalValueUsd: 2713.20, incomingCt: 0.000, usedCt: 5.6870, factorySentCt: 4.000 },
  { size: 3.20, shape: 'Round Brilliant', costPerCt: 950, quantityPcs: 0, weightCt: 0.000, totalValueUsd: 0.00, incomingCt: 0.000, usedCt: 0.1430, factorySentCt: 0.100 },
  { size: 3.30, shape: 'Oval', costPerCt: 1150, quantityPcs: 14, weightCt: 2.100, totalValueUsd: 2415.00, incomingCt: 0.430, usedCt: 0.0000, factorySentCt: 0.200 },
  { size: 3.40, shape: 'Round Brilliant', costPerCt: 1180, quantityPcs: 60, weightCt: 9.420, totalValueUsd: 11115.60, incomingCt: 0.629, usedCt: 0.0000, factorySentCt: 0.300 },
  { size: 3.50, shape: 'Cushion', costPerCt: 1280, quantityPcs: 28, weightCt: 4.928, totalValueUsd: 6307.84, incomingCt: 2.321, usedCt: 0.1840, factorySentCt: 1.500 },
];

/* ── Animated Counter ────────────────────────────── */
const AnimatedValue: React.FC<{ value: number; prefix?: string; suffix?: string; decimals?: number }> = ({ value, prefix = '', suffix = '', decimals = 2 }) => {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      {prefix}{value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </motion.span>
  );
};

/* ── Net Movement Micro-Bar ────────────────────── */
const NetBar: React.FC<{ incoming: number; used: number; maxRange: number }> = ({ incoming, used, maxRange }) => {
  const net = incoming - used;
  const pct = maxRange > 0 ? Math.min(Math.abs(net) / maxRange, 1) * 100 : 0;
  const isPositive = net >= 0;

  return (
    <div className="flex items-center gap-1.5 w-20">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
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
  const [statementDate, setStatementDate] = useState('2026-08-04');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShape, setSelectedShape] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'gains' | 'consumed' | 'high_value'>('all');
  const [selectedRow, setSelectedRow] = useState<DailyStatementRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const filteredData = useMemo(() => {
    return AUG_4_STATEMENT_DATA.filter((row) => {
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
  }, [searchQuery, selectedShape, filterMode]);

  const totals = useMemo(() => {
    return AUG_4_STATEMENT_DATA.reduce(
      (acc, r) => {
        acc.pcs += r.quantityPcs;
        acc.weight += r.weightCt;
        acc.value += r.totalValueUsd;
        acc.incoming += r.incomingCt;
        acc.used += r.usedCt;
        acc.factorySent += r.factorySentCt || (r.usedCt * 1.05);
        return acc;
      },
      { pcs: 0, weight: 0, value: 0, incoming: 0, used: 0, factorySent: 0 }
    );
  }, []);

  const netMovementTotal = totals.incoming - totals.used;

  // Max net range for bar chart scaling
  const maxNetRange = useMemo(() => {
    return Math.max(...AUG_4_STATEMENT_DATA.map(r => Math.abs(r.incomingCt - r.usedCt)));
  }, []);

  const handleSelectRow = (row: DailyStatementRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  const handleExportExcel = () => {
    const headers = ['Size (mm)', 'Shape', 'Cost/ct (USD)', 'Quantity (pcs)', 'Weight (ct)', 'Total Value (USD)', 'INCOME TODAY (ct)', 'SENT TO FACTORY (ct)', 'USED IN FACTORY TODAY (ct)', 'Net Movement (ct)'];
    const rows = AUG_4_STATEMENT_DATA.map(r => [
      r.size.toFixed(2),
      r.shape,
      r.costPerCt,
      r.quantityPcs,
      r.weightCt.toFixed(4),
      r.totalValueUsd.toFixed(2),
      r.incomingCt.toFixed(4),
      (r.factorySentCt || 0).toFixed(4),
      r.usedCt.toFixed(4),
      (r.incomingCt - r.usedCt).toFixed(4)
    ]);
    
    const summaryRow = ['TOTALS', '', '', totals.pcs, totals.weight.toFixed(4), totals.value.toFixed(2), totals.incoming.toFixed(4), totals.factorySent.toFixed(4), totals.used.toFixed(4), netMovementTotal.toFixed(4)];

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + ['KILANI DIAMOND REPORTER - DAILY DIAMOND STATEMENT', `Date: ${statementDate}`, '']
          .concat([headers.join(',')])
          .concat(rows.map(e => e.join(',')))
          .concat([''])
          .concat([summaryRow.join(',')])
          .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Kilani_Daily_Diamond_Statement_${statementDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
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

  // Unique shapes for filter
  const uniqueShapes = useMemo(() => {
    const shapes = new Set(AUG_4_STATEMENT_DATA.map(r => r.shape));
    return Array.from(shapes);
  }, []);

  const shapeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    AUG_4_STATEMENT_DATA.forEach(r => {
      counts[r.shape] = (counts[r.shape] || 0) + 1;
    });
    return counts;
  }, []);

  return (
    <div className="space-y-5">
      {/* ═══════════════════════════════════════════════════════
          HEADER BAR — Date picker + Actions
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-400/30 flex items-center justify-center">
              <Diamond size={15} className="text-lux-gold" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight leading-none">Daily Diamond Statement</h2>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">What came in, what went out, what's left</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-3 py-2 rounded-xl backdrop-blur-sm">
            <Calendar size={13} className="text-lux-gold" />
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="bg-transparent text-white text-xs font-semibold focus:outline-none w-[120px]"
            />
          </div>

          <Button
            onClick={handleExportExcel}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-[11px] px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/30 hover:-translate-y-px"
          >
            <Download size={13} /> Export Excel
          </Button>

          <Button
            onClick={handlePrint}
            variant="outline"
            className="border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-[11px] px-3.5 py-2.5 rounded-xl flex items-center gap-2 transition-all"
          >
            <Printer size={13} /> Print
          </Button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          HERO BANNER — Total Inventory Value + TOTAL INCOME TODAY
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="grid grid-cols-1 lg:grid-cols-5 gap-4"
      >
        {/* Portfolio Value — spans 3 cols */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-2xl border border-zinc-800/80 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(18,19,24,0.95) 0%, rgba(31,33,40,0.9) 50%, rgba(18,19,24,0.95) 100%)',
          }}
        >
          {/* Ambient glow */}
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-amber-500/[0.06] rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-blue-500/[0.04] rounded-full blur-[60px] pointer-events-none" />
          
          <div className="relative z-10 p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Gem size={12} className="text-black" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-400/90">Inventory Total Value</span>
            </div>
            <div className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none">
              <AnimatedValue value={totals.value} prefix="$" suffix=" USD" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-lux-gold inline-block" />
                43 Diamond Sizes Tracked
              </span>
            </div>
          </div>
        </div>

        {/* TOTAL INCOME TODAY — spans 2 cols */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-emerald-500/30 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(4,40,28,0.6) 0%, rgba(18,19,24,0.95) 100%)',
          }}
        >
          <div className="absolute -top-14 -right-14 w-48 h-48 bg-emerald-400/[0.08] rounded-full blur-[60px] pointer-events-none" />
          
          <div className="relative z-10 p-6 md:p-8 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <ArrowDownLeft size={12} className="text-black" />
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-400">Total Income Today</span>
              </div>
              <div className="px-2 py-0.5 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
                <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <TrendingUp size={10} /> +4.2%
                </span>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl md:text-4xl font-black text-emerald-300 tracking-tight leading-none">
                +<AnimatedValue value={totals.incoming} suffix=" ct" decimals={3} />
              </div>
              <div className="text-xs text-emerald-400/70 mt-2 font-semibold">
                +${(totals.incoming * 735).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD received today
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          4 METRIC CARDS
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {[
          { label: 'Total Pieces', value: totals.pcs.toLocaleString(), sub: 'in stock right now', color: 'text-white', border: 'border-zinc-800', bg: 'bg-zinc-900/60', icon: <Layers size={14} className="text-zinc-400" /> },
          { label: 'Total Weight', value: `${totals.weight.toFixed(3)} ct`, sub: 'in stock right now', color: 'text-white', border: 'border-zinc-800', bg: 'bg-zinc-900/60', icon: <BarChart3 size={14} className="text-zinc-400" /> },
          { label: 'Sent to Factory', value: `${totals.factorySent.toFixed(2)} ct`, sub: 'sent out today', color: 'text-blue-300', border: 'border-blue-500/25', bg: 'bg-blue-950/20', icon: <Factory size={14} className="text-blue-400" /> },
          { label: 'Used in Factory', value: `${totals.used.toFixed(2)} ct`, sub: 'used today', color: 'text-amber-300', border: 'border-amber-500/25', bg: 'bg-amber-950/20', icon: <ArrowUpRight size={14} className="text-amber-400" /> },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.12 + i * 0.05 }}
          >
            <Card className={`p-4 ${card.bg} ${card.border} hover:border-zinc-600 transition-all duration-300 group`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-400 transition-colors">{card.label}</span>
                {card.icon}
              </div>
              <div className={`text-xl font-black ${card.color} tracking-tight tabular-nums`}>{card.value}</div>
              <div className="text-[11px] text-zinc-600 mt-0.5">{card.sub}</div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          FILTER BAR — Search + Modes + Shape Badges
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="space-y-3 bg-zinc-900/30 backdrop-blur-sm p-4 rounded-2xl border border-zinc-800/60"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full md:w-72">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search size, shape, or cost..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/80 border border-zinc-800 text-white placeholder:text-zinc-600 text-[11px] rounded-xl pl-8 pr-4 py-2 focus:outline-none focus:border-lux-gold/50 focus:ring-1 focus:ring-lux-gold/20 transition-all"
            />
          </div>

          {/* Filter Modes */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'all' as const, label: `All (${AUG_4_STATEMENT_DATA.length})`, active: 'bg-zinc-700 text-white', inactive: 'bg-zinc-900 text-zinc-500 hover:text-zinc-300' },
              { key: 'gains' as const, label: 'Net Gain ↑', active: 'bg-emerald-500/90 text-black', inactive: 'bg-zinc-900 text-emerald-500/70 hover:text-emerald-400' },
              { key: 'consumed' as const, label: 'Net Loss ↓', active: 'bg-rose-500/90 text-white', inactive: 'bg-zinc-900 text-rose-400/70 hover:text-rose-400' },
              { key: 'high_value' as const, label: '$5k+', active: 'bg-amber-400 text-black', inactive: 'bg-zinc-900 text-amber-400/70 hover:text-amber-300' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterMode(f.key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all duration-200 border ${
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

        {/* Shape Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-800/40">
          <button
            onClick={() => setSelectedShape('all')}
            className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide transition-all duration-200 ${
              selectedShape === 'all'
                ? 'bg-lux-gold text-black shadow-sm shadow-amber-400/20'
                : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800'
            }`}
          >
            All Shapes
          </button>
          {uniqueShapes.map(shape => (
            <button
              key={shape}
              onClick={() => setSelectedShape(shape)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide transition-all duration-200 flex items-center gap-1.5 ${
                selectedShape === shape
                  ? 'bg-lux-gold text-black shadow-sm shadow-amber-400/20'
                  : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800'
              }`}
            >
              <span className={`${getShapeColor(shape as DiamondShape)} ${selectedShape === shape ? '!text-black' : ''}`}>{getShapeIcon(shape as DiamondShape)}</span>
              {shape}
              <span className="opacity-60">({shapeCounts[shape]})</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          MAIN CONTENT — Table + Movement Drawer
          ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Diamond Statement Table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className={`${drawerOpen && selectedRow ? 'lg:col-span-2' : 'lg:col-span-3'} transition-all duration-500`}
        >
          <Card className="overflow-hidden border-zinc-800/80 bg-zinc-950/60 shadow-2xl backdrop-blur-sm">
            {/* Table Header */}
            <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400/15 to-amber-600/10 border border-amber-400/20 flex items-center justify-center">
                  <Gem size={13} className="text-lux-gold" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-none">Diamond Statement</h3>
                  <span className="text-[10px] text-zinc-500 font-medium">
                    {filteredData.length} of {AUG_4_STATEMENT_DATA.length} sizes
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-zinc-600 italic hidden md:block">Tap any row to see details →</span>
            </div>

            {/* Table */}
            <div ref={tableRef} className="overflow-x-auto max-h-[540px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(245,194,73,0.15) transparent' }}>
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
                    <th className="py-3 px-4 font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-500">Size</th>
                    <th className="py-3 px-3 font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-500">Shape</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-500">Cost/ct</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-500">Qty</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-500">Weight</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-amber-500/60">Value</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-emerald-500/60">IN</th>
                    <th className="py-3 px-3 text-right font-extrabold text-[9px] uppercase tracking-[0.15em] text-rose-400/60">USED</th>
                    <th className="py-3 px-3 font-extrabold text-[9px] uppercase tracking-[0.15em] text-zinc-500">Net</th>
                    <th className="py-3 px-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30">
                  {filteredData.map((row, idx) => {
                    const isSelected = selectedRow?.size === row.size && selectedRow?.shape === row.shape;
                    const netCt = row.incomingCt - row.usedCt;

                    return (
                      <motion.tr
                        key={`${row.size}-${row.shape}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: idx * 0.01 }}
                        onClick={() => handleSelectRow(row)}
                        className={`cursor-pointer transition-all duration-200 group/row ${
                          isSelected
                            ? 'bg-amber-500/[0.08] border-l-[3px] border-l-amber-400'
                            : 'hover:bg-white/[0.02] border-l-[3px] border-l-transparent'
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <span className="font-bold text-white tabular-nums">{row.size.toFixed(2)}</span>
                          <span className="text-zinc-600 ml-0.5">mm</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1.5 ${getShapeColor(row.shape)}`}>
                            <span className="text-xs">{getShapeIcon(row.shape)}</span>
                            <span className="text-zinc-400 text-[10px] font-medium">{row.shape.split(' ')[0]}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-400 tabular-nums">${row.costPerCt}</td>
                        <td className="py-2.5 px-3 text-right text-zinc-300 tabular-nums font-medium">{row.quantityPcs.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-zinc-200 font-bold tabular-nums">{row.weightCt.toFixed(3)}</td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                          <span className="text-amber-300/90">${row.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.incomingCt > 0 ? (
                            <span className="text-emerald-400 font-semibold">+{row.incomingCt.toFixed(2)}</span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.usedCt > 0 ? (
                            <span className="text-rose-400/80 font-semibold">{row.usedCt.toFixed(2)}</span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <NetBar incoming={row.incomingCt} used={row.usedCt} maxRange={maxNetRange} />
                        </td>
                        <td className="py-2.5 px-2">
                          <ChevronRight size={12} className={`transition-all duration-200 ${isSelected ? 'text-amber-400 translate-x-0.5' : 'text-zinc-700 group-hover/row:text-zinc-500'}`} />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
                {/* Summary Footer */}
                <tfoot className="sticky bottom-0">
                  <tr className="bg-zinc-900/95 backdrop-blur-sm border-t-2 border-amber-400/30">
                    <td className="py-3 px-4 font-extrabold text-[10px] uppercase text-lux-gold tracking-wider" colSpan={3}>Totals ({AUG_4_STATEMENT_DATA.length} sizes)</td>
                    <td className="py-3 px-3 text-right font-extrabold text-white tabular-nums">{totals.pcs.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-white tabular-nums">{totals.weight.toFixed(3)}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-lux-gold tabular-nums">${totals.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-emerald-400 tabular-nums">+{totals.incoming.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-rose-400 tabular-nums">{totals.used.toFixed(2)}</td>
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

        {/* ═══════════════════════════════════════════════════════
            MOVEMENT DETAIL DRAWER (Animated Slide-In)
            ═══════════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          {drawerOpen && selectedRow && (
            <motion.div
              key={`drawer-${selectedRow.size}-${selectedRow.shape}`}
              initial={{ opacity: 0, x: 40, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.97 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="lg:col-span-1"
            >
              <Card className="p-0 bg-zinc-950/80 border-amber-500/20 shadow-2xl backdrop-blur-md sticky top-6 overflow-hidden">
                {/* Drawer Header */}
                <div className="p-5 pb-4 border-b border-zinc-800/60 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-400/[0.04] rounded-full blur-[40px] pointer-events-none" />
                  
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <div className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-400/80 flex items-center gap-1.5 mb-1.5">
                        <Activity size={11} /> Today's Movement
                      </div>
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-xl font-black text-white tracking-tight">{selectedRow.size.toFixed(2)} mm</h3>
                        <span className={`text-sm font-medium ${getShapeColor(selectedRow.shape)}`}>
                          {getShapeIcon(selectedRow.shape)} {selectedRow.shape}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDrawerOpen(false)}
                      className="w-7 h-7 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 flex items-center justify-center transition-colors"
                    >
                      <X size={13} className="text-zinc-400" />
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* Size Valuation Card */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-zinc-900/80 to-zinc-950 border border-zinc-800 space-y-2">
                    <div className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-[0.15em]">This Size Value</div>
                    <div className="text-2xl font-black text-lux-gold tracking-tight tabular-nums">
                      ${selectedRow.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Stock: <strong className="text-zinc-300">{selectedRow.weightCt.toFixed(3)} ct</strong></span>
                      <span>Qty: <strong className="text-zinc-300">{selectedRow.quantityPcs} pcs</strong></span>
                      <span>Rate: <strong className="text-zinc-300">${selectedRow.costPerCt}/ct</strong></span>
                    </div>
                  </div>

                  {/* Movement Cards */}
                  <div className="space-y-2.5">
                    {/* Income Today */}
                    <motion.div
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="p-3.5 rounded-xl bg-emerald-950/25 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-emerald-400/90 flex items-center gap-1.5">
                          <ArrowDownLeft size={12} /> Came In Today
                        </span>
                        <span className="text-xs font-black text-emerald-300 tabular-nums">+{selectedRow.incomingCt.toFixed(3)} ct</span>
                      </div>
                      <div className="text-sm font-bold text-white tabular-nums">
                        +{Math.round(selectedRow.incomingCt * 120)} pcs
                      </div>
                      <div className="text-[10px] text-emerald-400/60 mt-0.5 font-medium">
                        Worth ${(selectedRow.incomingCt * selectedRow.costPerCt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </motion.div>

                    {/* Sent to Factory */}
                    <motion.div
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 }}
                      className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20 hover:border-blue-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-blue-400/90 flex items-center gap-1.5">
                          <Factory size={12} /> Sent to Factory
                        </span>
                        <span className="text-xs font-black text-blue-300 tabular-nums">{(selectedRow.factorySentCt || (selectedRow.usedCt * 1.05)).toFixed(3)} ct</span>
                      </div>
                      <div className="text-sm font-bold text-white tabular-nums">
                        {Math.round((selectedRow.factorySentCt || (selectedRow.usedCt * 1.05)) * 120)} pcs
                      </div>
                      <div className="text-[10px] text-blue-400/60 mt-0.5 font-medium">
                        Handed to factory today
                      </div>
                    </motion.div>

                    {/* Used in Factory */}
                    <motion.div
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 hover:border-amber-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-amber-400/90 flex items-center gap-1.5">
                          <ArrowUpRight size={12} /> Used Today
                        </span>
                        <span className="text-xs font-black text-amber-300 tabular-nums">{selectedRow.usedCt.toFixed(3)} ct</span>
                      </div>
                      <div className="text-sm font-bold text-white tabular-nums">
                        {Math.round(selectedRow.usedCt * 120)} pcs
                      </div>
                      <div className="text-[10px] text-amber-400/60 mt-0.5 font-medium">
                        Set into jewelry today
                      </div>
                    </motion.div>
                  </div>

                  {/* Net Movement Summary */}
                  <div className={`p-3 rounded-xl border text-center ${
                    (selectedRow.incomingCt - selectedRow.usedCt) >= 0
                      ? 'bg-emerald-950/15 border-emerald-500/15'
                      : 'bg-rose-950/15 border-rose-500/15'
                  }`}>
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-500 mb-1">Net Change Today</div>
                    <div className={`text-lg font-black tabular-nums ${
                      (selectedRow.incomingCt - selectedRow.usedCt) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {(selectedRow.incomingCt - selectedRow.usedCt) >= 0 ? '+' : ''}
                      {(selectedRow.incomingCt - selectedRow.usedCt).toFixed(3)} ct
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
