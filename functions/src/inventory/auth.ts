import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { UserProfile } from './models';

export interface AuthenticatedActor {
  uid: string;
  profile: UserProfile;
}

export async function requireActor(request: CallableRequest): Promise<AuthenticatedActor> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');

  const db = getFirestore();
  let profileSnap = await db.doc(`users/${uid}`).get();
  if (!profileSnap.exists) {
    const authEmail = typeof request.auth?.token.email === 'string' ? request.auth.token.email.trim() : '';
    const authName = typeof request.auth?.token.name === 'string' ? request.auth.token.name.trim() : '';
    const ownerEmails = new Set(['kilanimedia@gmail.com', 'harout@kilani.com']);
    const role = ownerEmails.has(authEmail.toLowerCase()) ? 'Manager' : 'Setter';

    const newProfile: UserProfile = {
      id: uid,
      authUid: uid,
      email: authEmail,
      name: authName || (authEmail ? authEmail.split('@')[0] : 'User'),
      role: role as any,
      active: true,
      legacyProfileIds: [],
      securityProfileVersion: 1,
    };
    await db.doc(`users/${uid}`).set(newProfile, { merge: true });
    profileSnap = await db.doc(`users/${uid}`).get();
  }

  const profile = profileSnap.data() as UserProfile;
  if (profile.active === false) throw new HttpsError('permission-denied', 'This account is inactive.');
  return { uid, profile };
}

export async function requireManager(request: CallableRequest): Promise<AuthenticatedActor> {
  const actor = await requireActor(request);
  if (actor.profile.role !== 'Manager') {
    throw new HttpsError('permission-denied', 'Only Managers can perform this inventory operation.');
  }
  return actor;
}

export function isAssignedToProject(project: Record<string, unknown>, actor: AuthenticatedActor): boolean {
  if (actor.profile.role === 'Manager') return true;

  const acceptedIds = new Set([actor.uid, ...(actor.profile.legacyProfileIds || [])]);

  // 1. Check activeAssignees string array
  const activeAssignees = Array.isArray(project.activeAssignees) ? project.activeAssignees : [];
  if (activeAssignees.some((id) => typeof id === 'string' && acceptedIds.has(id))) return true;

  // 2. Check assignments object array
  const assignments = Array.isArray(project.assignments) ? project.assignments : [];
  if (
    assignments.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const assignment = entry as { userId?: unknown; active?: unknown };
      return assignment.active !== false && typeof assignment.userId === 'string' && acceptedIds.has(assignment.userId);
    })
  ) return true;

  // 3. Check direct assignment & creator fields
  if (typeof project.assignedSetterId === 'string' && acceptedIds.has(project.assignedSetterId)) return true;
  if (typeof project.assignedJewellerId === 'string' && acceptedIds.has(project.assignedJewellerId)) return true;
  if (typeof project.assignedDesignerId === 'string' && acceptedIds.has(project.assignedDesignerId)) return true;
  if (typeof project.createdById === 'string' && acceptedIds.has(project.createdById)) return true;

  return false;
}

