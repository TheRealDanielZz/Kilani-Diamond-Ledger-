import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

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

async function run() {
  console.log("Starting inventory reset...");

  // 1. Clear movements
  const movementsRef = collection(db, 'movements');
  const movementsSnap = await getDocs(movementsRef);
  console.log(`Found ${movementsSnap.size} movements to delete.`);
  
  if (movementsSnap.size > 0) {
    // Firestore batch limits to 500 writes. If there are more, we process in chunks of 400.
    const docs = movementsSnap.docs;
    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + chunkSize);
      chunk.forEach(d => {
        batch.delete(doc(db, 'movements', d.id));
      });
      await batch.commit();
      console.log(`Deleted chunk ${i / chunkSize + 1} (${chunk.length} movements)`);
    }
    console.log("Successfully deleted all movements.");
  } else {
    console.log("No movements found to delete.");
  }

  // 2. Clear diamond_transactions
  const txsRef = collection(db, 'diamond_transactions');
  const txsSnap = await getDocs(txsRef);
  console.log(`Found ${txsSnap.size} diamond ledger transactions to delete.`);

  if (txsSnap.size > 0) {
    const docs = txsSnap.docs;
    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + chunkSize);
      chunk.forEach(d => {
        batch.delete(doc(db, 'diamond_transactions', d.id));
      });
      await batch.commit();
      console.log(`Deleted chunk ${i / chunkSize + 1} (${chunk.length} transactions)`);
    }
    console.log("Successfully deleted all diamond ledger transactions.");
  } else {
    console.log("No transactions found to delete.");
  }

  console.log("Inventory reset complete!");
}

run().catch(err => {
  console.error("Error during reset:", err);
  process.exit(1);
});
