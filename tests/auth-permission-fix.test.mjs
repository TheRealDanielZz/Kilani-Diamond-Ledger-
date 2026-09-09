import test from 'node:test';
import assert from 'node:assert/strict';

test('return submission authorization accepts Manager role or matching setter identities', () => {
  function canSubmitReturn(actor, bag, projectId) {
    const isManager = actor.profile.role === 'Manager';
    const actorName = typeof actor.profile.name === 'string' ? actor.profile.name.trim().toLowerCase() : '';
    const actorEmail = typeof actor.profile.email === 'string' ? actor.profile.email.trim().toLowerCase() : '';
    const acceptedIds = new Set([
      actor.uid,
      ...(actor.profile.legacyProfileIds || []),
      ...(actorName ? [actorName] : []),
      ...(actorEmail ? [actorEmail] : []),
    ]);
    const issuedToRaw = String(bag.issuedToId || '').trim();
    const isIssuedToActor = acceptedIds.has(issuedToRaw) || (issuedToRaw ? acceptedIds.has(issuedToRaw.toLowerCase()) : false);
    return bag.projectId === projectId && (isManager || isIssuedToActor);
  }

  const managerActor = {
    uid: 'manager-uid-1',
    profile: { role: 'Manager', name: 'Harout Kilani', email: 'harout@kilani.com' },
  };

  const setterActor = {
    uid: 'setter-uid-2',
    profile: {
      role: 'Setter',
      name: 'Vatche Setter',
      email: 'vatche@kilani.com',
      legacyProfileIds: ['vatche-legacy-id', 'temp-vatche-123'],
    },
  };

  // 1. Manager can submit return on any bag
  assert.equal(canSubmitReturn(managerActor, { projectId: 'proj-1', issuedToId: 'vatche-legacy-id' }, 'proj-1'), true);

  // 2. Setter matches by UID
  assert.equal(canSubmitReturn(setterActor, { projectId: 'proj-1', issuedToId: 'setter-uid-2' }, 'proj-1'), true);

  // 3. Setter matches by legacy profile ID
  assert.equal(canSubmitReturn(setterActor, { projectId: 'proj-1', issuedToId: 'vatche-legacy-id' }, 'proj-1'), true);

  // 4. Setter matches by display name (case-insensitive)
  assert.equal(canSubmitReturn(setterActor, { projectId: 'proj-1', issuedToId: 'Vatche Setter' }, 'proj-1'), true);
  assert.equal(canSubmitReturn(setterActor, { projectId: 'proj-1', issuedToId: 'vatche setter' }, 'proj-1'), true);

  // 5. Setter matches by email
  assert.equal(canSubmitReturn(setterActor, { projectId: 'proj-1', issuedToId: 'vatche@kilani.com' }, 'proj-1'), true);

  // 6. Non-matching setter is rejected
  assert.equal(canSubmitReturn(setterActor, { projectId: 'proj-1', issuedToId: 'another-setter' }, 'proj-1'), false);

  // 7. Mismatched project is rejected even for manager
  assert.equal(canSubmitReturn(managerActor, { projectId: 'proj-1', issuedToId: 'vatche-legacy-id' }, 'proj-2'), false);
});

test('non-manager profile update filters out restricted fields', () => {
  function getUpdatePayload(mergedProfile, finalRole, isOwnerEmail) {
    const isManager = finalRole === 'Manager' || isOwnerEmail;
    return isManager
      ? mergedProfile
      : {
          name: mergedProfile.name,
          email: mergedProfile.email,
          ...(mergedProfile.profilePhoto ? { profilePhoto: mergedProfile.profilePhoto } : {}),
          ...(mergedProfile.setterColor ? { setterColor: mergedProfile.setterColor } : {}),
        };
  }

  const setterProfile = {
    id: 'uid-setter',
    authUid: 'uid-setter',
    name: 'Setter Name',
    email: 'setter@kilani.com',
    role: 'Setter',
    active: true,
    legacyProfileIds: ['old-id-1'],
    profilePhoto: 'https://example.com/photo.jpg',
    setterColor: '#ff0000',
  };

  const payload = getUpdatePayload(setterProfile, 'Setter', false);
  assert.equal('role' in payload, false);
  assert.equal('active' in payload, false);
  assert.equal('authUid' in payload, false);
  assert.equal('legacyProfileIds' in payload, false);
  assert.equal(payload.name, 'Setter Name');
  assert.equal(payload.email, 'setter@kilani.com');
  assert.equal(payload.profilePhoto, 'https://example.com/photo.jpg');
  assert.equal(payload.setterColor, '#ff0000');
});

test('uploaderUid resolves to canonical Firebase Auth UID', () => {
  function getUploaderUid(authCurrentUser, storeCurrentUser) {
    return authCurrentUser?.uid || storeCurrentUser?.authUid || storeCurrentUser?.id;
  }

  const authUser = { uid: 'auth-canonical-uid' };
  const storeUser = { id: 'legacy-store-id', authUid: 'auth-canonical-uid' };

  assert.equal(getUploaderUid(authUser, storeUser), 'auth-canonical-uid');
  assert.equal(getUploaderUid(null, storeUser), 'auth-canonical-uid');
  assert.equal(getUploaderUid(null, { id: 'fallback-id' }), 'fallback-id');
});
