#!/usr/bin/env node
/**
 * Cancel specific duplicate OPEN diamond requests.
 * Target project codes: 13713, 1282, 1276, 1307
 * These are identified by the user as duplicate/erroneous requests to remove.
 */

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const TARGET_JOB_NUMBERS = ['13713', '1282', '1276', '1307'];
const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  console.log('\n🔍 Finding OPEN requests for project codes:', TARGET_JOB_NUMBERS.join(', '));
  console.log(`   Mode: ${DRY_RUN ? '🏷️  DRY RUN' : '⚡ APPLY'}\n`);

  const requestsSnap = await db.collection('requests').where('status', '==', 'OPEN').get();
  const projectsSnap = await db.collection('projects').get();
  const projectCodeMap = new Map();
  projectsSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.code) projectCodeMap.set(doc.id, String(data.code));
  });

  const toCancel = [];

  for (const doc of requestsSnap.docs) {
    const data = doc.data();
    const jobNumber = data.jobNumberSnapshot || '';
    const projectCode = projectCodeMap.get(data.projectId) || '';
    const match = TARGET_JOB_NUMBERS.find(t => jobNumber === t || projectCode === t);
    if (!match) continue;
    console.log(`   📋 ${match} → request ${doc.id} (${data.lines?.length || 0} lines, requested ${data.requestedAt})`);
    toCancel.push(doc.id);
  }

  // Also check already-cancelled/fulfilled for 13713
  if (!toCancel.length || !toCancel.some(id => requestsSnap.docs.find(d => d.id === id && (d.data().jobNumberSnapshot === '13713' || projectCodeMap.get(d.data().projectId) === '13713')))) {
    const allReqs = await db.collection('requests').get();
    const found13713 = allReqs.docs.filter(doc => {
      const data = doc.data();
      return (data.jobNumberSnapshot === '13713' || projectCodeMap.get(data.projectId) === '13713');
    });
    if (found13713.length) {
      console.log(`\n   ℹ️  13713: found ${found13713.length} request(s) but status = ${found13713.map(d => d.data().status).join(', ')}`);
    } else {
      console.log(`\n   ⚪ 13713: no requests found at all`);
    }
  }

  if (toCancel.length === 0) {
    console.log('\n✅ No OPEN requests to cancel.\n');
    return;
  }

  console.log(`\n   Total to cancel: ${toCancel.length}\n`);

  if (DRY_RUN) {
    console.log('   ➡️  Run with --apply to cancel these requests.\n');
    return;
  }

  for (const requestId of toCancel) {
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`requests/${requestId}`);
        const snap = await tx.get(ref);
        if (!snap.exists) { console.log(`   ⚠️  ${requestId}: not found`); return; }
        const data = snap.data();
        if (data.status !== 'OPEN') { console.log(`   ⚠️  ${requestId}: already ${data.status}`); return; }
        tx.update(ref, {
          status: 'CANCELLED',
          cancelledById: 'system-duplicate-cleanup',
          cancelledAt: new Date().toISOString(),
          serverCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelOperationId: `dup-cleanup-${Date.now()}-${requestId.slice(0, 8)}`,
        });
        console.log(`   ✅ ${requestId}: CANCELLED`);
      });
    } catch (err) {
      console.error(`   ❌ ${requestId}: ${err.message}`);
    }
  }
  console.log('\n✅ Done.\n');
}

main();
