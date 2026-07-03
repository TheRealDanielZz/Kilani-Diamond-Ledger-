import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';

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
  const q = query(collection(db, 'projects'), where('code', '==', 'SO-01-001848'));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("Project not found by code. Trying ID...");
    const docSnap = await getDoc(doc(db, 'projects', 'SO-01-001848'));
    if (docSnap.exists()) {
      console.log("Found by ID:", docSnap.id, docSnap.data());
    } else {
      console.log("Not found.");
    }
    return;
  }
  snap.forEach(d => {
    console.log("Found by code:", d.id, d.data());
  });
}

run().catch(console.error);
