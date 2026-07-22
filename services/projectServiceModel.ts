import { CanonicalProjectServiceCode, Project, ProjectService } from '../types';

export const PHASE6_SERVICE_MIGRATION_VERSION = 'phase6-service-canonical-v1';

export const PROJECT_SERVICE_LABELS: Record<CanonicalProjectServiceCode, string> = {
  CUSTOM_MAKE: 'Custom Make',
  ENGAGEMENT: 'Engagement',
  REPAIR: 'Repair',
  OTHER: 'Other',
  MANAGER_REVIEW_REQUIRED: 'Manager Review Required',
};

export const CREATABLE_PROJECT_SERVICE_CODES = [
  'CUSTOM_MAKE',
  'ENGAGEMENT',
  'REPAIR',
] as const;

const CANONICAL_CODES = new Set<CanonicalProjectServiceCode>([
  ...CREATABLE_PROJECT_SERVICE_CODES,
  'OTHER',
  'MANAGER_REVIEW_REQUIRED',
]);

export function isCanonicalProjectServiceCode(value: unknown): value is CanonicalProjectServiceCode {
  return typeof value === 'string' && CANONICAL_CODES.has(value as CanonicalProjectServiceCode);
}

export function legacyServiceName(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') {
    return value.name.trim();
  }
  return '';
}

export function getCanonicalServiceCode(project: Pick<Project, 'services' | 'repair' | 'repairDetails' | 'isQuickRepair'>): CanonicalProjectServiceCode {
  const services = Array.isArray(project.services) ? project.services : [];
  const canonical = services
    .map(service => service && typeof service === 'object' ? service.code : undefined)
    .filter(isCanonicalProjectServiceCode);
  if (canonical.length === 1) return canonical[0];

  const names = new Set(services.map(legacyServiceName).filter(Boolean).map(name => name.toLowerCase()));
  const repairEvidence = !!project.repair || !!project.repairDetails || !!project.isQuickRepair || names.has('repair');
  if (names.has('resize') || (names.has('setting') && repairEvidence)) return 'REPAIR';
  if (names.has('custom make')) return 'CUSTOM_MAKE';
  // Owner-approved one-time interpretation for pre-Phase-6 Setting-only records.
  if (names.size === 1 && names.has('setting')) return 'CUSTOM_MAKE';
  if (names.has('engagement')) return 'ENGAGEMENT';
  if (names.has('other')) return 'OTHER';
  if (names.size === 1 && names.has('repair')) return 'REPAIR';
  return 'MANAGER_REVIEW_REQUIRED';
}

export function getProjectServiceLabel(project: Pick<Project, 'services' | 'repair' | 'repairDetails' | 'isQuickRepair'>): string {
  return PROJECT_SERVICE_LABELS[getCanonicalServiceCode(project)];
}

export function createCanonicalService(
  code: CanonicalProjectServiceCode,
  status: ProjectService['status'] = 'PENDING'
): ProjectService {
  return { code, status };
}

export function requireCreatableService(services: ProjectService[] | undefined): CanonicalProjectServiceCode {
  if (!Array.isArray(services) || services.length !== 1) {
    throw new Error('Choose exactly one project service.');
  }
  const code = services[0]?.code;
  if (!CREATABLE_PROJECT_SERVICE_CODES.includes(code as typeof CREATABLE_PROJECT_SERVICE_CODES[number])) {
    if (code === 'OTHER') throw new Error('Other project workflows will be available in a future update.');
    throw new Error('Choose Custom Make, Engagement, or Repair.');
  }
  return code;
}
