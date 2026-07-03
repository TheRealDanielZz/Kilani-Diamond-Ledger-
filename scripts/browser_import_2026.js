// ════════════════════════════════════════════════════════════════════════════
// KILANI DIAMOND REPORTER — MELEE INVENTORY IMPORT
// Diamond Report 2026 (Jan 2 – Jun 18, 2026)
//
// HOW TO USE:
//   1. Open the Kilani Diamond Reporter app in Chrome and LOG IN as Manager
//   2. Open Chrome DevTools → Console  (Cmd+Option+J on Mac)
//   3. Paste this entire script and press Enter
//   4. Watch the progress logs. Refresh the app when done.
// ════════════════════════════════════════════════════════════════════════════

(async () => {

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA7p4Tdi5qOJtJ_lcyD2t_HS7GV5y1safM",
  authDomain: "kilani-diamond-ledger.firebaseapp.com",
  projectId: "kilani-diamond-ledger",
  storageBucket: "kilani-diamond-ledger.firebasestorage.app",
  messagingSenderId: "1002569437016",
  appId: "1:1002569437016:web:3634503157521d63bddf2d",
};

// ── Stock data from Diamond_Inventory_Report_2026.pdf ─────────────────────
// currentCt  : "Current Stock On Hand" table (as of Jun 18, 2026)
// ctPerStone : "Available Pieces by Size" table (derived from usage)
// costPerCt  : $/ct from "Current Stock On Hand" table
// Note: 1.7mm, 1.75mm, 4.5mm show deficit in PDF → currentCt set to 0
const STOCK_DATA = [
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
  { size: 1.7,  currentCt: 0,      costPerCt: 695,  ctPerStone: 0.02510 }, // deficit in PDF
  { size: 1.75, currentCt: 0,      costPerCt: 695,  ctPerStone: 0.02192 }, // deficit in PDF
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
  { size: 4.5,  currentCt: 0,      costPerCt: 0,    ctPerStone: 0.35037 }, // deficit in PDF
  { size: 4.6,  currentCt: 15.092, costPerCt: 0,    ctPerStone: 0.40071 },
  { size: 4.7,  currentCt: 2.380,  costPerCt: 0,    ctPerStone: 0.40309 },
  { size: 4.8,  currentCt: 1.686,  costPerCt: 0,    ctPerStone: 0.42015 },
  { size: 4.9,  currentCt: 0.005,  costPerCt: 0,    ctPerStone: 0.49926 },
  { size: 5.0,  currentCt: 2.017,  costPerCt: 0,    ctPerStone: 0.50796 },
];

// ── Import Firebase modules ──────────────────────────────────────────────────
console.log('📦 Loading Firebase SDK...');
const [
  { initializeApp, getApps, getApp },
  { getFirestore, doc, setDoc, writeBatch }
] = await Promise.all([
  import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'),
]);

// Re-use the existing Firebase app if one exists, otherwise create a new one
let fbApp;
try {
  fbApp = getApp('import-2026');
} catch {
  fbApp = initializeApp(FIREBASE_CONFIG, 'import-2026');
}
const db = getFirestore(fbApp);
console.log('✓ Firebase ready\n');

// ── Helper ───────────────────────────────────────────────────────────────────
function makeSpecId(size) {
  return `spec-rd-${String(size).replace('.', '_')}`;
}

// ── Step 1: Create specs ─────────────────────────────────────────────────────
console.log(`Creating ${STOCK_DATA.length} diamond specs (Melee)...`);
const specBatch = writeBatch(db);
for (const row of STOCK_DATA) {
  const id = makeSpecId(row.size);
  specBatch.set(doc(db, 'specs', id), {
    id,
    label: `RD ${row.size}mm`,
    sizeMm: row.size,
    ctPerStone: row.ctPerStone,
    defaultCostPerCtUsd: row.costPerCt,
    shape: 'Round',
    color: 'White',
    // no "location" field → Melee (app default)
  });
}
await specBatch.commit();
console.log(`✓ ${STOCK_DATA.length} specs written\n`);

// ── Step 2: Create opening-balance SHIPMENT_IN movement ──────────────────────
const now = new Date().toISOString();
const movId = `mov-import-2026-${Date.now()}`;
const positiveRows = STOCK_DATA.filter(r => r.currentCt > 0);

const lines = positiveRows.map(row => ({
  specId: makeSpecId(row.size),
  pcs: Math.round(row.currentCt / row.ctPerStone),
  ct: row.currentCt,
  costPerCtUsd: row.costPerCt,
}));

const totalCt = lines.reduce((s, l) => s + l.ct, 0);
console.log(`Creating SHIPMENT_IN movement with ${lines.length} lines (${totalCt.toFixed(3)} ct)...`);

await setDoc(doc(db, 'movements', movId), {
  id: movId,
  type: 'SHIPMENT_IN',
  createdAt: now,
  createdById: 'system',
  notes: 'Opening balance import — Diamond Report 2026 (Jan 2 – Jun 18, 2026)',
  supplier: 'Diamond Report 2026',
  invoiceNo: 'IMPORT-2026',
  lines,
});
console.log(`✓ Movement ${movId} written\n`);

// ── Step 3: Create ledger transactions ───────────────────────────────────────
console.log(`Creating ${lines.length} ledger transactions...`);
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
console.log(`✓ ${lines.length} ledger transactions written\n`);

// ── Done ─────────────────────────────────────────────────────────────────────
console.log('════════════════════════════════════════════════');
console.log('✅ IMPORT COMPLETE');
console.log(`   Specs created  : ${STOCK_DATA.length}`);
console.log(`   Lines imported : ${lines.length} (${totalCt.toFixed(3)} ct)`);
console.log(`   Skipped (0 ct) : 1.7mm, 1.75mm, 4.1mm, 4.5mm`);
console.log('   → Refresh the app tab to see the data');
console.log('════════════════════════════════════════════════');

})();
