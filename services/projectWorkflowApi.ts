import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ProjectHandoffPayload {
  operationId: string;
  projectId: string;
  targetUserId: string;
  note: string;
  weightG: number;
}

export async function handoffProject(payload: ProjectHandoffPayload): Promise<void> {
  const callable = httpsCallable<ProjectHandoffPayload, unknown>(functions, 'handoffProject');
  await callable(payload);
}
