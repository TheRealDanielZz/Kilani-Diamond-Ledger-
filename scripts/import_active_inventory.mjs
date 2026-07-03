import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, query, where, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA7p4Tdi5qOJtJ_lcyD2t_HS7GV5y1safM",
  authDomain: "kilani-diamond-ledger.firebaseapp.com",
  projectId: "kilani-diamond-ledger",
  storageBucket: "kilani-diamond-ledger.firebasestorage.app",
  messagingSenderId: "1002569437016",
  appId: "1:1002569437016:web:3634503157521d63bddf2d",
  measurementId: "G-FCB5KNY1H1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Verified data: Toronto + Miami REST CT from Diamond Report 2026.xlsx INVENTORY sheet.
// ctPerStone derived from USED row (USED_ct / USED_pcs). Sizes 1.7, 1.75, 3.0, 4.1, 4.5mm excluded
// (negative or zero combined REST CT).
const activeInventory = [
  { sizeMm: 0.50, ctPerStone: 0.00200000, restCt: 1.0600 },  // 530 pcs
  { sizeMm: 0.60, ctPerStone: 0.00200000, restCt: 3.7830 },  // 1891 pcs
  { sizeMm: 0.70, ctPerStone: 0.00200000, restCt: 2.9080 },  // 1454 pcs
  { sizeMm: 0.80, ctPerStone: 0.00240000, restCt: 9.0264 },  // 3761 pcs
  { sizeMm: 0.85, ctPerStone: 0.00290000, restCt: 13.8965 },  // 4792 pcs
  { sizeMm: 0.90, ctPerStone: 0.00350000, restCt: 7.8035 },  // 2230 pcs
  { sizeMm: 0.95, ctPerStone: 0.00395104, restCt: 19.8405 },  // 5022 pcs
  { sizeMm: 1.00, ctPerStone: 0.00460000, restCt: 8.0022 },  // 1740 pcs
  { sizeMm: 1.05, ctPerStone: 0.00510000, restCt: 30.7758 },  // 6034 pcs
  { sizeMm: 1.10, ctPerStone: 0.00557283, restCt: 9.2285 },  // 1656 pcs
  { sizeMm: 1.15, ctPerStone: 0.00650000, restCt: 6.9560 },  // 1070 pcs
  { sizeMm: 1.20, ctPerStone: 0.00728013, restCt: 11.6003 },  // 1593 pcs
  { sizeMm: 1.25, ctPerStone: 0.00800000, restCt: 7.0440 },  // 880 pcs
  { sizeMm: 1.30, ctPerStone: 0.00902022, restCt: 10.7520 },  // 1192 pcs
  { sizeMm: 1.35, ctPerStone: 0.01010049, restCt: 8.8670 },  // 878 pcs
  { sizeMm: 1.40, ctPerStone: 0.01213523, restCt: 4.0500 },  // 334 pcs
  { sizeMm: 1.45, ctPerStone: 0.01249486, restCt: 9.4460 },  // 756 pcs
  { sizeMm: 1.50, ctPerStone: 0.01404653, restCt: 7.9330 },  // 565 pcs
  { sizeMm: 1.55, ctPerStone: 0.01512402, restCt: 7.0820 },  // 468 pcs
  { sizeMm: 1.60, ctPerStone: 0.01643911, restCt: 22.6650 },  // 1379 pcs
  { sizeMm: 1.65, ctPerStone: 0.01789865, restCt: 3.2920 },  // 184 pcs
  { sizeMm: 1.80, ctPerStone: 0.02421770, restCt: 14.6810 },  // 606 pcs
  { sizeMm: 1.85, ctPerStone: 0.02593546, restCt: 12.1475 },  // 468 pcs
  { sizeMm: 1.90, ctPerStone: 0.02761397, restCt: 14.8165 },  // 537 pcs
  { sizeMm: 1.95, ctPerStone: 0.02977778, restCt: 20.3490 },  // 683 pcs
  { sizeMm: 2.00, ctPerStone: 0.03258475, restCt: 23.3340 },  // 716 pcs
  { sizeMm: 2.10, ctPerStone: 0.03872496, restCt: 10.8910 },  // 281 pcs
  { sizeMm: 2.20, ctPerStone: 0.04413465, restCt: 21.0915 },  // 478 pcs
  { sizeMm: 2.30, ctPerStone: 0.04986224, restCt: 8.7575 },  // 176 pcs
  { sizeMm: 2.40, ctPerStone: 0.05642436, restCt: 24.8155 },  // 440 pcs
  { sizeMm: 2.50, ctPerStone: 0.06209412, restCt: 47.3360 },  // 762 pcs
  { sizeMm: 2.60, ctPerStone: 0.07016630, restCt: 4.5320 },  // 65 pcs
  { sizeMm: 2.70, ctPerStone: 0.08158019, restCt: 9.8590 },  // 121 pcs
  { sizeMm: 2.80, ctPerStone: 0.08816357, restCt: 10.6940 },  // 121 pcs
  { sizeMm: 2.90, ctPerStone: 0.09764693, restCt: 18.9048 },  // 194 pcs
  { sizeMm: 3.10, ctPerStone: 0.11847917, restCt: 5.0570 },  // 43 pcs
  { sizeMm: 3.20, ctPerStone: 0.14300000, restCt: 0.5180 },  // 4 pcs
  { sizeMm: 3.30, ctPerStone: 0.15666667, restCt: 2.3820 },  // 15 pcs
  { sizeMm: 3.40, ctPerStone: 0.17033333, restCt: 18.8800 },  // 111 pcs
  { sizeMm: 3.50, ctPerStone: 0.18400000, restCt: 9.9000 },  // 54 pcs
  { sizeMm: 3.60, ctPerStone: 0.19520000, restCt: 1.1640 },  // 6 pcs
  { sizeMm: 3.70, ctPerStone: 0.20640000, restCt: 3.4900 },  // 17 pcs
  { sizeMm: 3.80, ctPerStone: 0.21760000, restCt: 0.0880 },  // 1 pcs
  { sizeMm: 3.90, ctPerStone: 0.23582479, restCt: 1.8620 },  // 8 pcs
  { sizeMm: 4.00, ctPerStone: 0.25404957, restCt: 10.2800 },  // 40 pcs
  { sizeMm: 4.20, ctPerStone: 0.29049915, restCt: 5.1840 },  // 18 pcs
  { sizeMm: 4.30, ctPerStone: 0.30872393, restCt: 14.5480 },  // 47 pcs
  { sizeMm: 4.40, ctPerStone: 0.32694872, restCt: 0.4880 },  // 1 pcs
  { sizeMm: 4.60, ctPerStone: 0.37673002, restCt: 30.1840 },  // 80 pcs
  { sizeMm: 4.70, ctPerStone: 0.40308824, restCt: 4.7600 },  // 12 pcs
  { sizeMm: 4.80, ctPerStone: 0.42015385, restCt: 2.9460 },  // 7 pcs
  { sizeMm: 4.90, ctPerStone: 0.49926087, restCt: 0.0100 },  // 1 pcs
  { sizeMm: 5.00, ctPerStone: 0.50796341, restCt: 4.0340 },  // 8 pcs
];

function randId(prefix) {
  return prefix + '-' + Math.random().toString(36).substr(2, 9);
}

async function deleteInChunks(docs, collectionName) {
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    docs.slice(i, i + chunkSize).forEach(d => batch.delete(doc(db, collectionName, d.id)));
    await batch.commit();
  }
}

async function run() {
  console.log('Signing in...');
  await signInWithEmailAndPassword(auth, 'YOUR_EMAIL', 'YOUR_PASSWORD');
  console.log('Signed in.');

  // ── Step 1: Delete old Active specs ──
  console.log('\nDeleting old Active specs...');
  const specsSnap = await getDocs(query(collection(db, 'specs'), where('location', '==', 'Active')));
  console.log(`  Found ${specsSnap.size} Active specs to delete.`);
  if (specsSnap.size > 0) await deleteInChunks(specsSnap.docs, 'specs');
  console.log('  Done.');

  // ── Step 2: Delete old Active import movements ──
  console.log('\nDeleting old Active import movements...');
  const movSnap = await getDocs(query(collection(db, 'movements'), where('supplier', '==', 'Diamond Report 2026 Import')));
  console.log(`  Found ${movSnap.size} import movements to delete.`);
  if (movSnap.size > 0) await deleteInChunks(movSnap.docs, 'movements');
  console.log('  Done.');

  // ── Step 3: Create new correct specs ──
  console.log('\nCreating corrected Active specs...');
  const specs = activeInventory.map(row => ({
    id: randId('sp-active'),
    label: `${row.sizeMm}mm Round`,
    sizeMm: row.sizeMm,
    shape: 'Round',
    ctPerStone: row.ctPerStone,
    defaultCostPerCtUsd: 0,
    location: 'Active',
  }));

  const chunkSize = 400;
  for (let i = 0; i < specs.length; i += chunkSize) {
    const batch = writeBatch(db);
    specs.slice(i, i + chunkSize).forEach(spec => {
      batch.set(doc(collection(db, 'specs'), spec.id), spec);
    });
    await batch.commit();
  }
  console.log(`  Created ${specs.length} specs.`);

  // ── Step 4: Create one SHIPMENT_IN movement ──
  console.log('\nCreating SHIPMENT_IN movement...');
  const movementId = randId('mov-active-import');
  const lines = specs.map((spec, idx) => {
    const row = activeInventory[idx];
    const pcs = Math.max(1, Math.round(row.restCt / spec.ctPerStone));
    const ct = pcs * spec.ctPerStone;
    return { specId: spec.id, pcs, ct };
  });

  const movement = {
    id: movementId,
    type: 'SHIPMENT_IN',
    createdAt: new Date().toISOString(),
    createdById: 'import-script',
    supplier: 'Diamond Report 2026 Import',
    notes: 'Combined Toronto + Miami REST CT from Diamond Report 2026.xlsx — corrected import',
    lines,
  };

  const movBatch = writeBatch(db);
  movBatch.set(doc(collection(db, 'movements'), movementId), movement);
  await movBatch.commit();
  console.log(`  Movement written: ${movementId} (${lines.length} lines)`);

  console.log('\nDone! Active inventory import complete.');
  console.log(`Total: ${specs.length} specs, ${lines.reduce((s, l) => s + l.pcs, 0)} pcs, ${lines.reduce((s, l) => s + l.ct, 0).toFixed(4)} ct`);
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
