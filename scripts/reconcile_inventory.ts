// ============================================================================
// reconcile_inventory.ts — Offline audit & safe repair of diamond balances.
//
// Recomputes every Melee spec balance from the COMPLETE movement history using
// the same snapshot-based math as the app (services/inventoryMath.ts), compares
// it against the data invariants, and:
//   • prints a full audit report FIRST (nothing is changed on a dry run),
//   • with --repair, auto-fixes ONLY mathematically-certain stale-zero cases
//     (0 pieces ⇒ carats normalized to 0) by writing an auditable
//     INVENTORY_CORRECTION movement + ledger transaction that cancels the
//     residue, preserving the previous value in the movement note,
//   • flags every ambiguous case (negative balances, pieces-with-no-carats)
//     for manual manager review and leaves it untouched.
//
// Usage:
//   npx tsx scripts/reconcile_inventory.ts            # dry-run audit only
//   npx tsx scripts/reconcile_inventory.ts --repair   # audit + auto-repair
// ============================================================================

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, getDocs, doc, setDoc, writeBatch,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { createInterface } from 'readline';
import {
  computeLineDelta, normalizeBalance, roundCt, MIXED_UNSORTED_SPEC_ID,
} from '../services/inventoryMath';
import { InventoryMovement, DiamondSpec, InventoryMovementType } from '../types';

const firebaseConfig = {
  apiKey: 'AIzaSyA7p4Tdi5qOJtJ_lcyD2t_HS7GV5y1safM',
  authDomain: 'kilani-diamond-ledger.firebaseapp.com',
  projectId: 'kilani-diamond-ledger',
  storageBucket: 'kilani-diamond-ledger.firebasestorage.app',
  messagingSenderId: '1002569437016',
  appId: '1:1002569437016:web:3634503157521d63bddf2d',
  measurementId: 'G-FCB5KNY1H1',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, a => { rl.close(); resolve(a); }));
}

async function run() {
  const doRepair = process.argv.includes('--repair');
  const email = 'danielzaeryzadeh@gmail.com';
  const password = await prompt(`Enter password for ${email}: `);
  console.log('\nSigning in...');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  console.log('✓ Authenticated\n');

  const [specsSnap, movementsSnap] = await Promise.all([
    getDocs(collection(db, 'specs')),
    getDocs(collection(db, 'movements')),
  ]);
  const specs = specsSnap.docs.map(d => ({ ...d.data(), id: d.id })) as DiamondSpec[];
  const movements = movementsSnap.docs.map(d => ({ ...d.data(), id: d.id })) as InventoryMovement[];
  console.log(`Loaded ${specs.length} specs, ${movements.length} movements.\n`);

  // Compute raw Melee balances (snapshot-based, un-normalized).
  const raw = new Map<string, { pcs: number; ct: number }>();
  for (const m of movements) {
    for (const l of (m.lines || [])) {
      if (!l.specId) continue;
      if (l.specId !== MIXED_UNSORTED_SPEC_ID) {
        const spec = specs.find(s => s.id === l.specId);
        if ((spec?.location || 'Melee') !== 'Melee') continue;
      }
      const spec = specs.find(s => s.id === l.specId);
      const { pieceDelta, caratDelta } = computeLineDelta(m, l, spec);
      const cur = raw.get(l.specId) || { pcs: 0, ct: 0 };
      cur.pcs += pieceDelta;
      cur.ct = roundCt(cur.ct + caratDelta);
      raw.set(l.specId, cur);
    }
  }

  interface Issue { specId: string; label: string; type: string; pcs: number; ct: number; autoRepairable: boolean; }
  const issues: Issue[] = [];
  raw.forEach((bal, specId) => {
    if (specId === MIXED_UNSORTED_SPEC_ID) return;
    const spec = specs.find(s => s.id === specId);
    const label = spec?.label || specId;
    const zeroPcs = Math.abs(bal.pcs) < 1e-6;
    if (zeroPcs && bal.ct > 0.0005) issues.push({ specId, label, type: 'ZERO_PCS_NONZERO_CT', pcs: bal.pcs, ct: bal.ct, autoRepairable: true });
    else if (zeroPcs && bal.ct < -0.0005) issues.push({ specId, label, type: 'ZERO_PCS_NEGATIVE_CT', pcs: bal.pcs, ct: bal.ct, autoRepairable: true });
    else if (bal.pcs < -1e-6) issues.push({ specId, label, type: 'NEGATIVE_PCS', pcs: bal.pcs, ct: bal.ct, autoRepairable: false });
    else if (bal.ct < -0.0005) issues.push({ specId, label, type: 'NEGATIVE_CT', pcs: bal.pcs, ct: bal.ct, autoRepairable: false });
    else if (bal.pcs > 0 && bal.ct <= 0.0005) issues.push({ specId, label, type: 'POSITIVE_PCS_ZERO_CT', pcs: bal.pcs, ct: bal.ct, autoRepairable: false });
  });

  console.log('════════════════════ AUDIT REPORT ════════════════════');
  console.log(`Scanned ${raw.size} Melee specs. Found ${issues.length} issue(s).\n`);
  if (issues.length === 0) console.log('✓ All balances consistent. Nothing to repair.');
  for (const i of issues) {
    const norm = normalizeBalance({ pcs: i.pcs, ct: i.ct }, i.specId);
    console.log(`  [${i.autoRepairable ? 'AUTO' : 'REVIEW'}] ${i.type.padEnd(22)} ${i.label.padEnd(14)} raw=${i.pcs}pc/${i.ct.toFixed(4)}ct  → resolves to ${norm.pcs}pc/${norm.ct.toFixed(3)}ct`);
  }

  const autoRepairable = issues.filter(i => i.autoRepairable);
  const review = issues.filter(i => !i.autoRepairable);

  if (!doRepair) {
    console.log(`\n${autoRepairable.length} auto-repairable, ${review.length} need manager review.`);
    console.log('Dry run only. Re-run with --repair to apply auto-repairs.');
    process.exit(0);
  }

  if (autoRepairable.length === 0) {
    console.log('\nNo auto-repairable issues. Manager-review items left untouched.');
    process.exit(0);
  }

  console.log(`\nApplying ${autoRepairable.length} auto-repair correction(s)...`);
  const nowStr = new Date().toISOString();
  const batch = writeBatch(db);
  for (const i of autoRepairable) {
    const spec = specs.find(s => s.id === i.specId);
    const snapshot = spec?.ctPerStone || 0;
    const movId = `mov-reconcile-${i.specId}-${Date.now()}`;
    const line = { specId: i.specId, pcs: 0, ct: roundCt(-i.ct), averageWeightSnapshot: snapshot > 0 ? snapshot : undefined };
    batch.set(doc(db, 'movements', movId), {
      id: movId, type: InventoryMovementType.INVENTORY_CORRECTION, createdAt: nowStr,
      createdById: cred.user.uid,
      notes: `Reconciliation auto-repair (${i.type}): ${i.label} Melee — normalized ${i.pcs}pc/${i.ct.toFixed(4)}ct to 0pc/0ct (stale carats after all pieces removed).`,
      lines: [line], location: 'Melee',
    });
    const txId = `tx-mov-${movId}-${i.specId}`;
    batch.set(doc(db, 'diamond_transactions', txId), {
      id: txId, createdAt: nowStr, createdById: cred.user.uid, specId: i.specId,
      color: spec?.color || 'White', quantity: 0, carats: roundCt(-i.ct),
      movementType: 'corrected', unitCost: spec?.defaultCostPerCtUsd || 0,
      totalValue: roundCt(-i.ct * (spec?.defaultCostPerCtUsd || 0)),
      averageWeightSnapshot: snapshot > 0 ? snapshot : undefined,
      notes: `Reconciliation: stale carats normalized to 0.`,
      mainStockChange: 0, wipStockChange: 0, status: 'active',
    });
  }
  await batch.commit();
  console.log(`✓ ${autoRepairable.length} correction(s) written.`);
  console.log(`\n${review.length} item(s) still require manual manager review:`);
  for (const i of review) console.log(`  • ${i.label}: ${i.type} (${i.pcs}pc/${i.ct.toFixed(4)}ct)`);
  console.log('\nReconciliation complete.');
  process.exit(0);
}

run().catch(err => { console.error('Reconciliation failed:', err); process.exit(1); });
