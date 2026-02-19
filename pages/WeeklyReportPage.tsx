
import React, { useState } from 'react';
import { store } from '../services/store';
import { WeeklyReportSnapshot } from '../types';
import { Card, Button, Input, Badge } from '../components/UI';
import { FileBarChart, Download, ChevronRight, Calendar } from 'lucide-react';

const WeeklyReportPage: React.FC = () => {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeReport, setActiveReport] = useState<WeeklyReportSnapshot | null>(null);
  const [history, setHistory] = useState<WeeklyReportSnapshot[]>(store.getWeeklyReports());

  const handleGenerate = () => {
    const report = store.generateWeeklyReport(
        new Date(startDate), 
        new Date(endDate), 
        store.getCurrentUser()?.id || 'unknown'
    );
    setActiveReport(report);
    setHistory(store.getWeeklyReports());
  };

  const exportCSV = (report: WeeklyReportSnapshot) => {
    let csv = "Diamond Spec,Opening Pcs,Opening Ct,Come In Pcs,Come In Ct,Issued Pcs,Issued Ct,Returned Pcs,Returned Ct,Closing Pcs,Closing Ct\n";
    report.lines.forEach(l => {
      csv += `"${l.spec.label}",${l.openingPcs},${l.openingCt.toFixed(3)},${l.comeInPcs},${l.comeInCt.toFixed(3)},${l.issuedPcs},${l.issuedCt.toFixed(3)},${l.returnedPcs},${l.returnedCt.toFixed(3)},${l.closingPcs},${l.closingCt.toFixed(3)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Weekly_Report_${report.weekEndDate}.csv`;
    a.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-lux-cream flex items-center gap-2">
          <FileBarChart className="w-6 h-6 text-lux-gold" /> Weekly Reports
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: History */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-4 bg-zinc-900/50 border-lux-border">
             <h3 className="font-semibold text-lux-cream mb-3 text-sm uppercase tracking-wide">Generate New</h3>
             <div className="space-y-3">
               <Input type="date" label="Start Date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-black border-zinc-700" />
               <Input type="date" label="End Date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-black border-zinc-700" />
               <Button onClick={handleGenerate} className="w-full">Create Snapshot</Button>
             </div>
          </Card>

          <div className="space-y-2">
            <h3 className="font-semibold text-zinc-500 px-1 text-sm uppercase tracking-wide">Past Reports</h3>
            {history.map(rep => (
              <button 
                key={rep.id} 
                onClick={() => setActiveReport(rep)}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${activeReport?.id === rep.id ? 'bg-lux-gold/10 border-lux-gold ring-1 ring-lux-gold' : 'bg-lux-surface border-zinc-800 hover:border-zinc-700'}`}
              >
                <div>
                   <div className="text-sm font-bold text-lux-cream">Week Ending</div>
                   <div className="text-xs text-zinc-500">{new Date(rep.weekEndDate).toLocaleDateString()}</div>
                </div>
                <ChevronRight className={`w-4 h-4 ${activeReport?.id === rep.id ? 'text-lux-gold' : 'text-zinc-600'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Main: Report View */}
        <div className="lg:col-span-3">
           {activeReport ? (
             <Card className="overflow-hidden border-lux-border">
               <div className="p-4 border-b border-zinc-800 bg-zinc-900/30 flex justify-between items-center">
                 <div>
                   <h2 className="font-bold text-lg text-lux-cream">Report: {new Date(activeReport.weekStartDate).toLocaleDateString()} - {new Date(activeReport.weekEndDate).toLocaleDateString()}</h2>
                   <p className="text-xs text-zinc-500">Generated {new Date(activeReport.createdAt).toLocaleString()}</p>
                 </div>
                 <Button variant="secondary" size="sm" onClick={() => exportCSV(activeReport)}>
                   <Download className="w-4 h-4 mr-2" /> Export CSV
                 </Button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-xs text-left whitespace-nowrap">
                   <thead className="bg-zinc-900 text-zinc-400 font-semibold border-b border-zinc-800">
                     <tr>
                       <th className="p-3 sticky left-0 bg-zinc-900 z-10">Spec</th>
                       <th className="p-3 text-right bg-zinc-900/50 text-zinc-500">Opening</th>
                       <th className="p-3 text-right text-blue-400">Come In</th>
                       <th className="p-3 text-right text-amber-500">Issued</th>
                       <th className="p-3 text-right text-emerald-400">Returned</th>
                       <th className="p-3 text-right text-zinc-500">Adj</th>
                       <th className="p-3 text-right bg-zinc-900/50 font-bold text-lux-cream">Closing</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-800/50">
                     {activeReport.lines.map((line, i) => (
                       <tr key={i} className="hover:bg-zinc-900/30">
                         <td className="p-3 font-medium text-lux-cream sticky left-0 bg-lux-surface border-r border-zinc-800">{line.spec.label}</td>
                         <td className="p-3 text-right bg-zinc-900/20 text-zinc-400">
                           <div>{line.openingPcs}</div>
                           <div className="text-[10px] text-zinc-600">{line.openingCt.toFixed(3)}</div>
                         </td>
                         <td className="p-3 text-right">
                           {line.comeInPcs > 0 && <span className="font-bold text-blue-400">+{line.comeInPcs}</span>}
                         </td>
                         <td className="p-3 text-right">
                           {line.issuedPcs > 0 && <span className="text-amber-500">-{line.issuedPcs}</span>}
                         </td>
                         <td className="p-3 text-right">
                           {line.returnedPcs > 0 && <span className="text-emerald-400">+{line.returnedPcs}</span>}
                         </td>
                         <td className="p-3 text-right text-zinc-500">
                           {line.adjustmentsPcs !== 0 && <span>{line.adjustmentsPcs}</span>}
                         </td>
                         <td className="p-3 text-right bg-zinc-900/30 font-bold text-lux-cream border-l border-zinc-800">
                           <div>{line.closingPcs}</div>
                           <div className="text-[10px] text-zinc-500">{line.closingCt.toFixed(3)}</div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </Card>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-zinc-600 p-12 border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
               <FileBarChart className="w-16 h-16 mb-4 opacity-20" />
               <p>Select a report or generate a new snapshot.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyReportPage;
