import re

with open("DailyDiamondStatement.tsx.old", "r") as f:
    content = f.read()

# Replace the statementDate state with dateRange
new_state = """  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);
"""
content = re.sub(r"  const \[statementDate, setStatementDate\] = useState\(\(\) => new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]\);", new_state, content)

# Inject getDateRangeBounds and isDateInRange just before useMemo
bounds_logic = """
  const getDateRangeBounds = () => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (dateRange === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (dateRange === 'this_week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
    } else if (dateRange === 'this_month') {
      start.setDate(1);
    } else if (dateRange === 'custom') {
      start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
    }
    
    return { start, end };
  };

  const { start: boundsStart, end: boundsEnd } = getDateRangeBounds();
  
  const isDateInRange = (dateString?: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return date >= boundsStart && date <= boundsEnd;
  };
"""

content = content.replace("  // Map Store Data to Detailed Statement Rows (Per Spec Size)", bounds_logic + "\n  // Map Store Data to Detailed Statement Rows (Per Spec Size)")

# Update the useMemo dependencies
content = content.replace("  }, [specs, movements, projects]);", "  }, [specs, movements, projects, boundsStart, boundsEnd]);")

# Update calculation logic in useMemo
new_calc_logic = """
      // 1. Calculate incoming for this spec
      let incomingCt = 0;
      movements.filter(m => m.type === InventoryMovementType.SHIPMENT_IN && isDateInRange(m.createdAt)).forEach(m => {
        m.lines.forEach(l => {
          if (l.specId === spec.id || l.averageWeightSnapshot === spec.ctPerStone) {
            incomingCt += l.ct || 0;
          }
        });
      });

      // 2. Calculate sent to factory for this spec
      let factorySentCt = 0;
      movements.filter(m => m.type === InventoryMovementType.ISSUE && isDateInRange(m.createdAt)).forEach(m => {
        m.lines.forEach(l => {
          if (l.specId === spec.id) {
            factorySentCt += l.ct || 0;
          }
        });
      });

      // 3. Calculate used in factory for this spec
      let usedCt = 0;
      const issues = movements.filter(m => m.type === InventoryMovementType.ISSUE && isDateInRange(m.createdAt));
      const returns = movements.filter(m => m.type === InventoryMovementType.RETURN && isDateInRange(m.createdAt));
      
      issues.forEach(m => {
        m.lines.forEach(l => {
          if (l.specId === spec.id) {
            usedCt += l.ct || 0;
          }
        });
      });
      returns.forEach(m => {
        m.lines.forEach(l => {
          if (l.specId === spec.id) {
            usedCt -= l.ct || 0;
          }
        });
      });
      usedCt = Math.max(0, usedCt); // Ensure non-negative
"""

old_calc_logic_regex = r"      // 1\. Calculate incoming for this spec.*?      }\);\n      }\);"
# Wait, let's just use string replace for the whole block from "// 1. Calculate" to the end of projects loop
old_calc_logic = """      // 1. Calculate incoming for this spec
      let incomingCt = 0;
      movements.filter(m => m.type === InventoryMovementType.SHIPMENT_IN).forEach(m => {
        m.lines.forEach(l => {
          if (l.specId === spec.id || l.averageWeightSnapshot === spec.ctPerStone) {
            incomingCt += l.ct || 0;
          }
        });
      });

      // 2. Calculate sent to factory for this spec
      let factorySentCt = 0;
      movements.filter(m => m.type === InventoryMovementType.ISSUE).forEach(m => {
        m.lines.forEach(l => {
          if (l.specId === spec.id) {
            factorySentCt += l.ct || 0;
          }
        });
      });

      // 3. Calculate used in factory for this spec across projects
      let usedCt = 0;
      projects.forEach(p => {
        const summary = store.getProjectCostSummary(p.id);
        summary.breakdown.forEach(b => {
          if (b.componentId === spec.id) {
            usedCt += (b.usedPcs || 0) * (spec.ctPerStone || 0);
          }
        });
      });"""

content = content.replace(old_calc_logic, new_calc_logic)

# Replace the single date input with a dropdown and custom date inputs
old_date_input = """<div className="flex items-center gap-2.5 bg-[#0d1220]/80 border border-zinc-800 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg">
              <Calendar className="w-4 h-4 text-amber-400" />
              <input
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              />
            </div>"""

new_date_input = """<div className="flex items-center gap-2.5 bg-[#0d1220]/80 border border-zinc-800 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg">
              <Calendar className="w-4 h-4 text-amber-400" />
              <select 
                value={dateRange} 
                onChange={(e) => setDateRange(e.target.value as any)}
                className="bg-transparent text-white focus:outline-none cursor-pointer border-none outline-none"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>
            
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 bg-[#0d1220]/80 border border-zinc-800 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                />
                <span className="text-zinc-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                />
              </div>
            )}"""

content = content.replace(old_date_input, new_date_input)

# Update handleExportExcel to use formatted date bounds instead of statementDate
export_regex = r"`Kilani_Diamond_Statement_\$\{statementDate\}\.csv`"
content = re.sub(export_regex, r"`Kilani_Diamond_Statement_${boundsStart.toISOString().split('T')[0]}_to_${boundsEnd.toISOString().split('T')[0]}.csv`", content)

content = content.replace("Date: ${statementDate}", "Date: ${boundsStart.toISOString().split('T')[0]} to ${boundsEnd.toISOString().split('T')[0]}")

with open("components/reports/DailyDiamondStatement.tsx", "w") as f:
    f.write(content)

