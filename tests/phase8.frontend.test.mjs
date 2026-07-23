import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Overview requests seven summaries, renders at most six, and links to All Projects', async () => {
  const source = await read('pages/ManagerDashboard.tsx');
  assert.match(source, /pageSize:\s*7/);
  assert.match(source, /rows\.slice\(0,\s*6\)/);
  assert.match(source, />View All Projects</);
  assert.match(source, /navigate\('\/projects'\)/);
});

test('Overview and All Projects use separate UID-scoped preference keys with safe mobile defaults', async () => {
  const hook = await read('hooks/useProjectViewPreference.ts');
  const overview = await read('pages/ManagerDashboard.tsx');
  const allProjects = await read('pages/AllProjectsPage.tsx');
  assert.match(hook, /kilani:view:\$\{page\}:\$\{userId \|\| 'anonymous'\}/);
  assert.match(hook, /event\.matches \? 'GRID'/);
  assert.match(hook, /value === 'LIST' \|\| value === 'GRID'/);
  assert.match(overview, /currentUser\.id,\s*'overview'/);
  assert.match(allProjects, /currentUser\?\.id \|\| '',\s*'all-projects'/);
  assert.doesNotMatch(allProjects, /localStorage\.getItem\(['"]projectViewMode/);
});

test('Shared project views reserve image space, lazy-load real images, and expose accessible toggles', async () => {
  const source = await read('components/projects/ProjectViews.tsx');
  assert.match(source, /aspect-\[16\/9\]/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /decoding="async"/);
  assert.match(source, /aria-pressed=\{value === 'LIST'\}/);
  assert.match(source, /aria-pressed=\{value === 'GRID'\}/);
  assert.match(source, /min-w-11 min-h-11/);
  assert.doesNotMatch(source, /No (Image|Preview)/i);
});

test('All Projects consumes paginated summaries instead of joining a full client project cache', async () => {
  const source = await read('pages/AllProjectsPage.tsx');
  assert.match(source, /usePhase7Report<ProjectSummary>\('ALL_PROJECTS'/);
  assert.match(source, /pageSize:\s*24/);
  assert.doesNotMatch(source, /store\.getProjects\(\)/);
});
