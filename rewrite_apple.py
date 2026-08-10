import re

with open("DailyDiamondStatement.tsx.apple", "r") as f:
    content = f.read()

# 1. Fix mobx and getSpecs
content = content.replace("import { observer } from 'mobx-react-lite';\n", "")
content = content.replace("export const DailyDiamondStatement = observer(() => {", "export const DailyDiamondStatement = () => {")
content = content.replace("});\n", "};\n")

# Replace old state logic with proper store sync
old_state = """  const diamondSpecs = store.getDiamondSpecs();
  const allMovements = store.getInventoryMovements();

  // Update "last updated" time whenever movements change
  useEffect(() => {
    setLastUpdated(new Date());
  }, [allMovements.length]);"""

new_state = """  const [diamondSpecs, setDiamondSpecs] = useState(() => store.getSpecs());
  const [allMovements, setAllMovements] = useState(() => store.getInventoryMovements());

  useEffect(() => {
    const sync = () => {
      setDiamondSpecs(store.getSpecs());
      setAllMovements(store.getInventoryMovements());
      setLastUpdated(new Date());
    };
    return store.subscribe(sync);
  }, []);"""
content = content.replace(old_state, new_state)

# 2. Add Date Range logic
old_date_state = """  const [statementDate, setStatementDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });"""

new_date_state = """  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);

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
  };"""

content = content.replace(old_date_state, new_date_state)

# 3. Fix the filtering in useMemo blocks
# First useMemo: Selected Date Metrics
old_movements_filter_1 = """    const movementsForDate = allMovements.filter(mov => {
      const d = new Date(mov.createdAt);
      const movDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return movDate === statementDate;
    });"""
new_movements_filter_1 = """    const movementsForDate = allMovements.filter(mov => isDateInRange(mov.createdAt));"""
content = content.replace(old_movements_filter_1, new_movements_filter_1)
content = content.replace("}, [allMovements, allMovements.length, statementDate, diamondSpecs, diamondSpecs.length]);", "}, [allMovements, allMovements.length, boundsStart, boundsEnd, diamondSpecs, diamondSpecs.length]);")

# Second useMemo: Filtered Table Data
content = content.replace(old_movements_filter_1, new_movements_filter_1)
content = content.replace("}, [allMovements, allMovements.length, statementDate, diamondSpecs, diamondSpecs.length, searchQuery, filterMode]);", "}, [allMovements, allMovements.length, boundsStart, boundsEnd, diamondSpecs, diamondSpecs.length, searchQuery, filterMode]);")


# 4. Replace the UI Date Picker
old_ui_date = """          <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-4 py-3 rounded-2xl backdrop-blur-md">
            <Calendar size={16} className="text-lux-gold" />
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer"
            />
          </div>"""

new_ui_date = """          <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-4 py-3 rounded-2xl backdrop-blur-md">
            <Calendar size={16} className="text-lux-gold" />
            <select 
                value={dateRange} 
                onChange={(e) => setDateRange(e.target.value as any)}
                className="bg-transparent text-white focus:outline-none cursor-pointer border-none outline-none font-bold text-sm"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
          </div>
          {dateRange === 'custom' && (
              <div className="flex items-center gap-2 bg-[#0d1220]/80 border border-zinc-800 px-4 py-3 rounded-2xl text-xs font-semibold shadow-lg">
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

content = content.replace(old_ui_date, new_ui_date)

with open("components/reports/DailyDiamondStatement.tsx", "w") as f:
    f.write(content)

