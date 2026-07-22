const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyLegacyProjectServices, stableHash } = require('../lib/projects/phase6');

test('Phase 6 maps known legacy service evidence without guessing', () => {
  assert.equal(classifyLegacyProjectServices({ services: [{ name: 'Resize', status: 'PENDING' }] }).code, 'REPAIR');
  assert.equal(classifyLegacyProjectServices({ services: [{ name: 'Setting', status: 'PENDING' }], repairDetails: {} }).code, 'REPAIR');
  assert.equal(classifyLegacyProjectServices({ services: [{ name: 'Setting', status: 'PENDING' }, { name: 'Custom Make', status: 'IN_PROGRESS' }] }).code, 'CUSTOM_MAKE');
  assert.equal(classifyLegacyProjectServices({ services: [{ name: 'Repair', status: 'COMPLETED' }] }).code, 'REPAIR');
});

test('Phase 6 leaves Setting-only and unsupported records for Manager review', () => {
  const setting = classifyLegacyProjectServices({ services: [{ name: 'Setting', status: 'IN_PROGRESS' }] });
  assert.equal(setting.code, 'MANAGER_REVIEW_REQUIRED');
  assert.equal(setting.ruleId, 'AMBIGUOUS_SETTING');
  assert.equal(setting.status, 'IN_PROGRESS');
  assert.equal(classifyLegacyProjectServices({ services: [] }).code, 'MANAGER_REVIEW_REQUIRED');
  assert.equal(classifyLegacyProjectServices({ services: [{ name: 'Mystery', status: 'PENDING' }] }).code, 'MANAGER_REVIEW_REQUIRED');
});

test('canonical classification and hashes are stable', () => {
  const canonical = classifyLegacyProjectServices({ services: [{ code: 'ENGAGEMENT', status: 'PENDING' }] });
  assert.equal(canonical.code, 'ENGAGEMENT');
  assert.equal(canonical.ruleId, 'ALREADY_CANONICAL');
  assert.equal(stableHash({ b: 2, a: 1 }), stableHash({ a: 1, b: 2 }));
});
