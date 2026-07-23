import { jsPDF } from 'jspdf';

export interface ReportPdfColumn<T> {
  label: string;
  value: (row: T) => unknown;
}

export function generateFilteredReportPDF<T>(
  title: string,
  rows: T[],
  columns: ReportPdfColumn<T>[],
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
    document.text(`${rows.length} filtered result${rows.length === 1 ? '' : 's'} · ${new Date().toLocaleString()}`, pageWidth - margin, y, { align: 'right' });
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
