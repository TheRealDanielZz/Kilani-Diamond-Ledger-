import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { createInterface } from 'readline';

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
const db = getFirestore(app);
const auth = getAuth(app);

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Current Stock On Hand — by Stone Size (as of Jun 18, 2026)
// Source: Diamond_Inventory_Report_2026.pdf
// currentCt from "Current Stock On Hand" table
// ctPerStone from "Available Pieces by Size" table (derived from usage data)
// costPerCt ($/ct) from "Current Stock On Hand" table
const stockData = [
  { size: 0.5,  currentCt: 0.611,  costPerCt: 750,  ctPerStone: 0.00200 },
  { size: 0.6,  currentCt: 1.842,  costPerCt: 750,  ctPerStone: 0.00200 },
  { size: 0.7,  currentCt: 1.504,  costPerCt: 750,  ctPerStone: 0.00200 },
  { size: 0.8,  currentCt: 4.632,  costPerCt: 750,  ctPerStone: 0.00240 },
  { size: 0.85, currentCt: 6.575,  costPerCt: 750,  ctPerStone: 0.00290 },
  { size: 0.9,  currentCt: 4.267,  costPerCt: 750,  ctPerStone: 0.00350 },
  { size: 0.95, currentCt: 9.438,  costPerCt: 750,  ctPerStone: 0.00395 },
  { size: 1.0,  currentCt: 4.291,  costPerCt: 750,  ctPerStone: 0.00460 },
  { size: 1.05, currentCt: 14.930, costPerCt: 750,  ctPerStone: 0.00510 },
  { size: 1.1,  currentCt: 4.786,  costPerCt: 750,  ctPerStone: 0.00557 },
  { size: 1.15, currentCt: 3.464,  costPerCt: 750,  ctPerStone: 0.00650 },
  { size: 1.2,  currentCt: 6.155,  costPerCt: 750,  ctPerStone: 0.00728 },
  { size: 1.25, currentCt: 3.426,  costPerCt: 695,  ctPerStone: 0.00800 },
  { size: 1.3,  currentCt: 5.226,  costPerCt: 695,  ctPerStone: 0.00902 },
  { size: 1.35, currentCt: 3.954,  costPerCt: 695,  ctPerStone: 0.01010 },
  { size: 1.4,  currentCt: 3.123,  costPerCt: 695,  ctPerStone: 0.01214 },
  { size: 1.45, currentCt: 5.927,  costPerCt: 695,  ctPerStone: 0.01249 },
  { size: 1.5,  currentCt: 3.334,  costPerCt: 695,  ctPerStone: 0.01405 },
  { size: 1.55, currentCt: 3.972,  costPerCt: 695,  ctPerStone: 0.01512 },
  { size: 1.6,  currentCt: 12.002, costPerCt: 695,  ctPerStone: 0.01644 },
  { size: 1.65, currentCt: 2.043,  costPerCt: 695,  ctPerStone: 0.01790 },
  // 1.7 and 1.75 are in deficit — spec created, no stock added
  { size: 1.7,  currentCt: 0,      costPerCt: 695,  ctPerStone: 0.02510 },
  { size: 1.75, currentCt: 0,      costPerCt: 695,  ctPerStone: 0.02192 },
  { size: 1.8,  currentCt: 7.429,  costPerCt: 695,  ctPerStone: 0.02422 },
  { size: 1.85, currentCt: 6.810,  costPerCt: 695,  ctPerStone: 0.02594 },
  { size: 1.9,  currentCt: 8.032,  costPerCt: 695,  ctPerStone: 0.02761 },
  { size: 1.95, currentCt: 10.227, costPerCt: 695,  ctPerStone: 0.02978 },
  { size: 2.0,  currentCt: 12.004, costPerCt: 695,  ctPerStone: 0.03258 },
  { size: 2.1,  currentCt: 6.519,  costPerCt: 735,  ctPerStone: 0.03872 },
  { size: 2.2,  currentCt: 11.188, costPerCt: 735,  ctPerStone: 0.04413 },
  { size: 2.3,  currentCt: 4.646,  costPerCt: 735,  ctPerStone: 0.04986 },
  { size: 2.4,  currentCt: 12.027, costPerCt: 735,  ctPerStone: 0.05642 },
  { size: 2.5,  currentCt: 23.844, costPerCt: 735,  ctPerStone: 0.06209 },
  { size: 2.6,  currentCt: 2.395,  costPerCt: 735,  ctPerStone: 0.07017 },
  { size: 2.7,  currentCt: 5.355,  costPerCt: 850,  ctPerStone: 0.08158 },
  { size: 2.8,  currentCt: 5.391,  costPerCt: 950,  ctPerStone: 0.08816 },
  { size: 2.9,  currentCt: 9.645,  costPerCt: 950,  ctPerStone: 0.09765 },
  { size: 3.0,  currentCt: 0.323,  costPerCt: 950,  ctPerStone: 0.09496 },
  { size: 3.1,  currentCt: 2.888,  costPerCt: 950,  ctPerStone: 0.11848 },
  { size: 3.2,  currentCt: 0.526,  costPerCt: 950,  ctPerStone: 0.14300 },
  { size: 3.3,  currentCt: 1.940,  costPerCt: 1150, ctPerStone: 0.14333 },
  { size: 3.4,  currentCt: 9.440,  costPerCt: 1180, ctPerStone: 0.15725 },
  { size: 3.5,  currentCt: 4.950,  costPerCt: 1280, ctPerStone: 0.18400 },
  { size: 3.6,  currentCt: 0.582,  costPerCt: 1310, ctPerStone: 0.20207 },
  { size: 3.7,  currentCt: 1.745,  costPerCt: 1310, ctPerStone: 0.22014 },
  { size: 3.8,  currentCt: 0.044,  costPerCt: 1460, ctPerStone: 0.21760 },
  { size: 3.9,  currentCt: 0.931,  costPerCt: 1530, ctPerStone: 0.23467 },
  { size: 4.0,  currentCt: 5.140,  costPerCt: 1530, ctPerStone: 0.24476 },
  { size: 4.1,  currentCt: 0,      costPerCt: 1540, ctPerStone: 0.26531 },
  { size: 4.2,  currentCt: 2.592,  costPerCt: 1550, ctPerStone: 0.28586 },
  { size: 4.3,  currentCt: 7.274,  costPerCt: 1560, ctPerStone: 0.30640 },
  { size: 4.4,  currentCt: 0.244,  costPerCt: 0,    ctPerStone: 0.32695 },
  // 4.5 is in deficit — spec created, no stock added
  { size: 4.5,  currentCt: 0,      costPerCt: 0,    ctPerStone: 0.35037 },
  { size: 4.6,  currentCt: 15.092, costPerCt: 0,    ctPerStone: 0.40071 },
  { size: 4.7,  currentCt: 2.380,  costPerCt: 0,    ctPerStone: 0.40309 },
  { size: 4.8,  currentCt: 1.686,  costPerCt: 0,    ctPerStone: 0.42015 },
  { size: 4.9,  currentCt: 0.005,  costPerCt: 0,    ctPerStone: 0.49926 },
  { size: 5.0,  currentCt: 2.017,  costPerCt: 0,    ctPerStone: 0.50796 },
];

function makeSpecId(size: number): string {
  return `spec-rd-${String(size).replace('.', '_')}`;
}

async function run() {
  // Authenticate before writing to Firestore
  const email = 'danielzaeryzadeh@gmail.com';
  const password = await prompt(`Enter password for ${email}: `);
  console.log('\nSigning in...');
  await signInWithEmailAndPassword(auth, email, password);
  console.log('✓ Authenticated\n');

  const now = new Date().toISOString();
  const movId = `mov-import-2026-${Date.now()}`;

  // ── Step 1: Create DiamondSpec documents ────────────────────────────────────
  console.log(`Creating ${stockData.length} specs...`);
  const specBatch = writeBatch(db);
  for (const row of stockData) {
    const id = makeSpecId(row.size);
    specBatch.set(doc(db, 'specs', id), {
      id,
      label: `RD ${row.size}mm`,
      sizeMm: row.size,
      ctPerStone: row.ctPerStone,
      defaultCostPerCtUsd: row.costPerCt,
      shape: 'Round',
      color: 'White',
      // no location = Melee (the app default)
    });
  }
  await specBatch.commit();
  console.log(`✓ ${stockData.length} specs created`);

  // ── Step 2: Build SHIPMENT_IN movement lines (positive stock only) ──────────
  const positiveRows = stockData.filter(r => r.currentCt > 0);
  const lines = positiveRows.map(row => {
    const pcs = Math.round(row.currentCt / row.ctPerStone);
    return {
      specId: makeSpecId(row.size),
      pcs,
      ct: row.currentCt,
      costPerCtUsd: row.costPerCt,
    };
  });

  const totalCt = lines.reduce((s, l) => s + l.ct, 0);
  console.log(`\nBuilding SHIPMENT_IN with ${lines.length} lines (${totalCt.toFixed(3)} ct total)`);

  const movement = {
    id: movId,
    type: 'SHIPMENT_IN',
    createdAt: now,
    createdById: 'system',
    notes: 'Opening balance import — Diamond Report 2026 (Jan 2 – Jun 18, 2026)',
    supplier: 'Diamond Report 2026',
    invoiceNo: 'IMPORT-2026',
    lines,
  };
  await setDoc(doc(db, 'movements', movId), movement);
  console.log(`✓ Movement ${movId} created`);

  // ── Step 3: Create DiamondLedgerTransaction for each line ───────────────────
  console.log(`\nCreating ${lines.length} ledger transactions...`);
  const txBatch = writeBatch(db);
  for (const line of lines) {
    const txId = `tx-mov-${movId}-${line.specId}`;
    txBatch.set(doc(db, 'diamond_transactions', txId), {
      id: txId,
      createdAt: now,
      createdById: 'system',
      specId: line.specId,
      color: 'White',
      quantity: line.pcs,
      carats: line.ct,
      movementType: 'added',
      unitCost: line.costPerCtUsd,
      totalValue: parseFloat((line.ct * line.costPerCtUsd).toFixed(2)),
      notes: 'Opening balance import — Diamond Report 2026',
      mainStockChange: line.pcs,
      wipStockChange: 0,
      status: 'active',
    });
  }
  await txBatch.commit();
  console.log(`✓ ${lines.length} ledger transactions created`);

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('Import complete!');
  console.log(`  Specs created  : ${stockData.length}`);
  console.log(`  Lines imported : ${lines.length}`);
  console.log(`  Total carats   : ${totalCt.toFixed(3)} ct  (PDF: 288.508 ct)`);
  console.log(`  Sizes skipped  : 1.7mm, 1.75mm, 4.5mm (deficit) and 1.7mm, 1.75mm, 4.1mm, 4.5mm (zero/deficit — specs still created)`);
  console.log('════════════════════════════════════════');
  process.exit(0);
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
