import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../components/reports/ReportFilterBar.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../components/reports/report-filter-date.css', import.meta.url), 'utf8');

test('date filters expose explicit, accessible calendar controls', () => {
  assert.match(source, /const DateFilter/);
  assert.match(source, /input\.showPicker\?\.\(\)/);
  assert.match(source, /Open \$\{label\.toLowerCase\(\)\} date calendar/);
  assert.match(source, /aria-label=\{`\$\{label\} date`\}/);
  assert.match(source, /<CalendarDays/);
  assert.match(styles, /color-scheme: dark/);
  assert.match(styles, /calendar-picker-indicator/);
});
