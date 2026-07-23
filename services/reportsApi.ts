import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  Phase7FilterRequest,
  Phase7Page,
  Phase7ReportSection,
} from '../functions/src/reports/contract';

export interface Phase7ReportPage<T = Record<string, unknown>> extends Phase7Page<T> {
  section: Phase7ReportSection;
}

export interface Phase7CsvExport {
  section: Phase7ReportSection;
  total: number;
  columns: string[];
  csv: string;
}

export async function queryPhase7Report<T = Record<string, unknown>>(
  request: Phase7FilterRequest,
): Promise<Phase7ReportPage<T>> {
  const callable = httpsCallable<Phase7FilterRequest, Phase7ReportPage<T>>(functions, 'queryPhase7Report');
  return (await callable(request)).data;
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
