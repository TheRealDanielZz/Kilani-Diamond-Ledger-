import { httpsCallable } from 'firebase/functions';
import { CanonicalProjectServiceCode } from '../types';
import { functions } from './firebase';

export interface Phase6DryRunBackupRow {
  projectId: string;
  projectCode: string;
  originalServices: unknown[];
  originalServicesHash: string;
  classification: CanonicalProjectServiceCode;
  ruleId: string;
  alreadyMigrated: boolean;
}

export interface Phase6ServiceDryRun {
  version: string;
  generatedAt: string;
  dryRunHash: string;
  projectCount: number;
  classificationCounts: Record<CanonicalProjectServiceCode, number>;
  ruleCounts: Record<string, number>;
  ambiguousCount: number;
  alreadyMigratedCount: number;
  backupRows: Phase6DryRunBackupRow[];
  writesPerformed: 0;
}

export async function getPhase6ServiceMigrationDryRun(): Promise<Phase6ServiceDryRun> {
  const callable = httpsCallable<Record<string, never>, Phase6ServiceDryRun>(functions, 'getPhase6ServiceMigrationDryRun');
  return (await callable({})).data;
}
