import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '../services/firebase';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const specsSnap = await getDocs(collection(db, 'specs'));
  console.log('Specs:');
  specsSnap.forEach(d => {
    const data = d.data();
    if (data.sizeMm === 16.5 || data.sizeMm === 1.65 || data.sizeMm === 1.15 || data.label.includes('16.5') || data.label.includes('1.65')) {
      console.log(d.id, data.label, data.sizeMm);
    }
  });

  const bandsSnap = await getDocs(collection(db, 'bands'));
  console.log('Bands:');
  bandsSnap.forEach(d => {
    const data = d.data();
    if (data.minMm <= 16.5 && data.maxMm >= 16.5) {
      console.log(d.id, data.name, data.minMm, data.maxMm);
    }
  });
}

run();
