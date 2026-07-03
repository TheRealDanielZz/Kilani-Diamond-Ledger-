import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

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

const dataToImport = [
    { size: 0.5, ct: 0.611, pcs: 306, cost: 750, ctPerStone: 0.00200 },
    { size: 0.6, ct: 1.842, pcs: 921, cost: 750, ctPerStone: 0.00200 },
    { size: 0.7, ct: 1.504, pcs: 752, cost: 750, ctPerStone: 0.00200 },
    { size: 0.8, ct: 4.632, pcs: 1930, cost: 750, ctPerStone: 0.00240 },
    { size: 0.85, ct: 6.575, pcs: 2267, cost: 750, ctPerStone: 0.00290 },
    { size: 0.9, ct: 4.267, pcs: 1219, cost: 750, ctPerStone: 0.00350 },
    { size: 0.95, ct: 9.438, pcs: 2389, cost: 750, ctPerStone: 0.00395 },
    { size: 1, ct: 4.291, pcs: 933, cost: 750, ctPerStone: 0.00460 },
    { size: 1.05, ct: 14.930, pcs: 2928, cost: 750, ctPerStone: 0.00510 },
    { size: 1.1, ct: 4.786, pcs: 859, cost: 750, ctPerStone: 0.00557 },
    { size: 1.15, ct: 3.464, pcs: 533, cost: 750, ctPerStone: 0.00650 },
    { size: 1.2, ct: 6.155, pcs: 845, cost: 750, ctPerStone: 0.00728 },
    { size: 1.25, ct: 3.426, pcs: 428, cost: 695, ctPerStone: 0.00800 },
    { size: 1.3, ct: 5.226, pcs: 579, cost: 695, ctPerStone: 0.00902 },
    { size: 1.35, ct: 3.954, pcs: 391, cost: 695, ctPerStone: 0.01010 },
    { size: 1.4, ct: 3.123, pcs: 257, cost: 695, ctPerStone: 0.01214 },
    { size: 1.45, ct: 5.927, pcs: 474, cost: 695, ctPerStone: 0.01249 },
    { size: 1.5, ct: 3.334, pcs: 237, cost: 695, ctPerStone: 0.01405 },
    { size: 1.55, ct: 3.972, pcs: 263, cost: 695, ctPerStone: 0.01512 },
    { size: 1.6, ct: 12.002, pcs: 730, cost: 695, ctPerStone: 0.01644 },
    { size: 1.65, ct: 2.043, pcs: 114, cost: 695, ctPerStone: 0.01790 },
    { size: 1.8, ct: 7.429, pcs: 307, cost: 695, ctPerStone: 0.02422 },
    { size: 1.85, ct: 6.810, pcs: 263, cost: 695, ctPerStone: 0.02594 },
    { size: 1.9, ct: 8.032, pcs: 291, cost: 695, ctPerStone: 0.02761 },
    { size: 1.95, ct: 10.227, pcs: 343, cost: 695, ctPerStone: 0.02978 },
    { size: 2, ct: 12.004, pcs: 368, cost: 695, ctPerStone: 0.03258 },
    { size: 2.1, ct: 6.519, pcs: 168, cost: 735, ctPerStone: 0.03872 },
    { size: 2.2, ct: 11.188, pcs: 253, cost: 735, ctPerStone: 0.04413 },
    { size: 2.3, ct: 4.646, pcs: 93, cost: 735, ctPerStone: 0.04986 },
    { size: 2.4, ct: 12.027, pcs: 213, cost: 735, ctPerStone: 0.05642 },
    { size: 2.5, ct: 23.844, pcs: 384, cost: 735, ctPerStone: 0.06209 },
    { size: 2.6, ct: 2.395, pcs: 34, cost: 735, ctPerStone: 0.07017 },
    { size: 2.7, ct: 5.355, pcs: 66, cost: 850, ctPerStone: 0.08158 },
    { size: 2.8, ct: 5.391, pcs: 61, cost: 950, ctPerStone: 0.08816 },
    { size: 2.9, ct: 9.645, pcs: 99, cost: 950, ctPerStone: 0.09765 },
    { size: 3, ct: 0.323, pcs: 3, cost: 950, ctPerStone: 0.09496 },
    { size: 3.1, ct: 2.888, pcs: 24, cost: 950, ctPerStone: 0.11848 },
    { size: 3.2, ct: 0.526, pcs: 4, cost: 950, ctPerStone: 0.14300 },
    { size: 3.3, ct: 1.940, pcs: 14, cost: 1150, ctPerStone: 0.14333 },
    { size: 3.4, ct: 9.440, pcs: 60, cost: 1180, ctPerStone: 0.15725 },
    { size: 3.5, ct: 4.950, pcs: 27, cost: 1280, ctPerStone: 0.18400 },
    { size: 3.6, ct: 0.582, pcs: 3, cost: 1310, ctPerStone: 0.20207 },
    { size: 3.7, ct: 1.745, pcs: 8, cost: 1310, ctPerStone: 0.22014 },
    { size: 3.9, ct: 0.931, pcs: 4, cost: 1530, ctPerStone: 0.23467 },
    { size: 4, ct: 5.140, pcs: 21, cost: 1530, ctPerStone: 0.24476 },
    { size: 4.2, ct: 2.592, pcs: 9, cost: 1550, ctPerStone: 0.28586 },
    { size: 4.3, ct: 7.274, pcs: 24, cost: 1560, ctPerStone: 0.30640 },
    { size: 4.4, ct: 0.244, pcs: 1, cost: 0, ctPerStone: 0.32695 },
    { size: 4.6, ct: 15.092, pcs: 38, cost: 0, ctPerStone: 0.40071 },
    { size: 4.7, ct: 2.380, pcs: 6, cost: 0, ctPerStone: 0.40309 },
    { size: 4.8, ct: 1.686, pcs: 4, cost: 0, ctPerStone: 0.42015 },
    { size: 5, ct: 2.017, pcs: 4, cost: 0, ctPerStone: 0.50796 },
];

async function run() {
    try {
        console.log("Fetching existing specs...");
        const specDocs = await getDocs(collection(db, 'specs'));
        const currentSpecs = specDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const specIdMap = new Map();

        for (const item of dataToImport) {
            let spec = currentSpecs.find((s: any) => s.sizeMm === item.size && s.shape === 'Round');
            if (!spec) {
                const newId = 'sp-' + Math.random().toString(36).substr(2, 9);
                const specData = {
                    label: `${item.size}mm Round`,
                    sizeMm: item.size,
                    shape: 'Round',
                    ctPerStone: item.ctPerStone,
                    defaultCostPerCtUsd: item.cost,
                    isOverride: false
                };
                console.log(`Adding new spec: ${specData.label}`);
                await setDoc(doc(db, 'specs', newId), specData);
                specIdMap.set(item.size, newId);
            } else {
                specIdMap.set(item.size, spec.id);
            }
        }

        console.log("Creating inventory movement...");
        const movId = 'mov-' + Math.random().toString(36).substr(2, 9);
        const movementData = {
            type: 'SHIPMENT_IN',
            createdAt: new Date().toISOString(),
            createdById: 'admin-script',
            supplier: 'PDF Import',
            invoiceNo: 'Report 2026',
            notes: 'Imported from Diamond_Inventory_Report_2026.pdf',
            lines: dataToImport.map(item => ({
                specId: specIdMap.get(item.size),
                pcs: item.pcs,
                ct: item.ct,
                costPerCtUsd: item.cost
            }))
        };

        await setDoc(doc(db, 'movements', movId), movementData);
        console.log("Success! Data imported.");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

run();
