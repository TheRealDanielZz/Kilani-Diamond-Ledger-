import { jsPDF } from 'jspdf';
import { Phase7CsvExport } from '../services/reportsApi';

export interface ReportColumn<T> {
  label: string;
  value: (row: T) => unknown;
}

/**
 * Downscales a base64 image data string using an HTML Canvas to ensure
 * image buffers remain compact during PDF generation on mobile devices.
 */
export async function downscaleBase64Image(
  base64Str: string,
  maxWidth = 1000,
  maxHeight = 1000,
  quality = 0.85,
): Promise<string> {
  if (!base64Str || !base64Str.startsWith('data:image')) {
    return base64Str;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(base64Str);
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width <= maxWidth && height <= maxHeight) {
        resolve(base64Str);
        return;
      }

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64Str;
  });
}

/**
 * Generates a clean, stylized landscape PDF report from any table dataset.
 */
export function generateFilteredReportPDF<T>(
  title: string,
  rows: T[],
  columns: ReportColumn<T>[],
  filename: string,
): void {
  const document = new jsPDF({ orientation: 'landscape' });
  const margin = 12;
  const pageWidth = document.internal.pageSize.getWidth();
  const usableWidth = pageWidth - margin * 2;
  const columnWidth = usableWidth / Math.max(1, columns.length);
  let y = 14;

  const drawHeader = () => {
    document.setFont('helvetica', 'bold');
    document.setFontSize(14);
    document.text(`KILANI · ${title}`, margin, y);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.text(
      `${rows.length} filtered result${rows.length === 1 ? '' : 's'} · ${new Date().toLocaleString()}`,
      pageWidth - margin,
      y,
      { align: 'right' },
    );
    y += 8;
    document.setFillColor(35, 36, 43);
    document.rect(margin, y - 4, usableWidth, 7, 'F');
    document.setTextColor(255, 255, 255);
    document.setFont('helvetica', 'bold');
    columns.forEach((column, index) => {
      document.text(column.label, margin + index * columnWidth + 1, y);
    });
    document.setTextColor(25, 25, 25);
    document.setFont('helvetica', 'normal');
    y += 6;
  };

  drawHeader();
  rows.forEach((row, rowIndex) => {
    if (y > document.internal.pageSize.getHeight() - 12) {
      document.addPage();
      y = 14;
      drawHeader();
    }
    if (rowIndex % 2 === 0) {
      document.setFillColor(245, 245, 245);
      document.rect(margin, y - 4, usableWidth, 6, 'F');
    }
    document.setFontSize(7);
    columns.forEach((column, columnIndex) => {
      const raw = column.value(row);
      const text = raw === null || raw === undefined ? '' : String(raw);
      const clipped = text.length > 42 ? `${text.slice(0, 39)}…` : text;
      document.text(clipped, margin + columnIndex * columnWidth + 1, y, {
        maxWidth: columnWidth - 2,
      });
    });
    y += 6;
  });
  document.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Downloads a CSV file with UTF-8 BOM encoding for proper Excel formatting.
 */
export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Converts any array of JSON objects to CSV string format.
 */
export function arrayToCsv<T extends Record<string, unknown>>(data: T[], columns?: string[]): string {
  if (!data.length) return '';
  const cols = columns || Object.keys(data[0]);
  const header = cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
  const rows = data.map(row => (
    cols.map(col => {
      const val = row[col];
      const str = val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  ));
  return [header, ...rows].join('\r\n');
}

/**
 * Batch exports a multi-project selection to CSV format.
 */
export function exportBatchProjectsCsv(projects: any[], filename = 'selected_projects_batch'): void {
  if (!projects.length) return;
  const rows = projects.map(p => ({
    'Project Code': p.code || '',
    'Client Name': p.clientName || '',
    'Client Phone': p.clientPhone || '',
    'Piece Name': p.pieceName || '',
    'Status': p.status || '',
    'Service': p.service || p.services?.[0]?.name || '',
    'Sales Rep': p.salesRepName || '',
    'Progress (%)': p.progress || p.currentPercentComplete || 0,
    'Created At': p.createdAt || '',
    'Due Date': p.dueDate || '',
    'Date Picked Up': p.datePickedUp || p.date_picked_up || '',
  }));
  const csvStr = arrayToCsv(rows);
  downloadCsvFile(csvStr, filename);
}

/**
 * Batch exports a multi-project selection to landscape PDF.
 */
export function generateBatchProjectsPDF(projects: any[], filename = 'selected_projects_summary'): void {
  const columns: ReportColumn<any>[] = [
    { label: 'Code', value: p => p.code || '' },
    { label: 'Client', value: p => p.clientName || '' },
    { label: 'Piece Name', value: p => p.pieceName || '' },
    { label: 'Status', value: p => p.status || '' },
    { label: 'Service', value: p => p.service || '' },
    { label: 'Sales Rep', value: p => p.salesRepName || '' },
    { label: 'Progress', value: p => `${p.progress || p.currentPercentComplete || 0}%` },
    { label: 'Due Date', value: p => p.dueDate || '' },
  ];
  generateFilteredReportPDF('BATCH PROJECTS SUMMARY REPORT', projects, columns, filename);
}

