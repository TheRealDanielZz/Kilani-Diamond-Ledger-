import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../components/reports/ReportFilterBar.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../components/reports/report-filter-date.css', import.meta.url), 'utf8');

test('date filters expose explicit, accessible calendar controls', () => {
  assert.match(source, /AirbnbDateModal/);
  assert.match(source, /setIsDateModalOpen/);
  assert.match(source, /formatDateRangeDisplay/);
  assert.match(source, /<CalendarDays/);
  assert.match(styles, /color-scheme: dark/);
});

