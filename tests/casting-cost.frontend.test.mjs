import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectDetail = await readFile(new URL('../pages/ProjectDetail.tsx', import.meta.url), 'utf8');
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const phase5 = await readFile(new URL('../functions/src/projects/phase5.ts', import.meta.url), 'utf8');

test('casting and metal-cost UI is limited to Managers and assigned Designers', () => {
  assert.match(projectDetail, /const canViewCastingDesign = isManager \|\| \(isDesigner && assignedToProject\)/);
  assert.match(projectDetail, /!repair && canViewCastingDesign && \(project\.goldComponents\?\.length \|\| 0\) > 0/);
  assert.match(projectDetail, /canViewCastingDesign && project\.castingEvents/);
  assert.match(projectDetail, /if \(!canModifyCastingDesign\) return showToast\('Only Managers and assigned Designers may receive casting\.'\)/);
});

test('receipt UI captures a rate per component and shows component and overall costs', () => {
  assert.match(projectDetail, /Casting cost per gram \(CAD\/g\)/);
  assert.match(projectDetail, /Component casting cost/);
  assert.match(projectDetail, /Overall casting cost/);
  assert.match(projectDetail, /Math\.round\(\(weightMg \* rateCents\) \/ 1000\)/);
});

test('supplier draft requires Manager confirmation and replacement costing is explained plainly', () => {
  assert.match(projectDetail, /A Manager must confirm and lock it before it changes the project total/);
  assert.match(projectDetail, /We only use the newest casting cost\. We do not add the old and new costs together\./);
  assert.match(projectDetail, /phase5Rates\[revisionId\] \?\? draftRateValue/);
});

test('backend and direct-write rules protect casting financial data from production roles', () => {
  assert.match(phase5, /Only Managers and assigned Designers may receive casting/);
  assert.match(phase5, /Only Managers and assigned Designers may record final component weights/);
  assert.match(rules, /'goldComponents', 'primaryGoldComponentId',\s*'castingEvents'/);
  const productionWhitelist = rules.match(/function productionProjectUpdateIsSafe\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.doesNotMatch(productionWhitelist, /'castingEvents'/);
});
