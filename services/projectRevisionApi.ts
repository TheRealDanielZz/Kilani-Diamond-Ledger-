import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ProjectRevision } from '../types';
import { db, functions } from './firebase';

export interface ProjectRevisionResult {
  projectId: string;
  revisionId: string;
  kind: 'INSTRUCTIONS' | 'METAL';
  version: number;
}

export type ProjectRevisionPayload = {
  operationId: string;
  projectId: string;
  reason: string;
  expectedVersion: number;
} & (
  { kind: 'INSTRUCTIONS'; expectedInstructions: string; instructions: string }
  | { kind: 'METAL'; expectedMetal: string; expectedPurity: string; metal: string; purity: string }
);

export async function reviseProjectDetails(payload: ProjectRevisionPayload): Promise<ProjectRevisionResult> {
  const callable = httpsCallable<ProjectRevisionPayload, ProjectRevisionResult>(functions, 'reviseProjectDetails');
  return (await callable(payload)).data;
}

export async function getProjectRevisions(projectId: string): Promise<ProjectRevision[]> {
  const revisions = query(collection(db, 'projects', projectId, 'revisions'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(revisions);
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ProjectRevision));
}
