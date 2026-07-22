
import { initializeApp } from 'firebase/app';
import { clearIndexedDbPersistence, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { initializeAuth, browserLocalPersistence } from 'firebase/auth';

import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

export const firebaseConfig = {
  apiKey: "AIzaSyA7p4Tdi5qOJtJ_lcyD2t_HS7GV5y1safM",
  authDomain: "kilani-diamond-ledger.firebaseapp.com",
  projectId: "kilani-diamond-ledger",
  storageBucket: "kilani-diamond-ledger.firebasestorage.app",
  messagingSenderId: "1002569437016",
  appId: "1:1002569437016:web:3634503157521d63bddf2d",
  measurementId: "G-FCB5KNY1H1"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
// Inventory data must never remain in a Setter's persistent browser cache.
// The app now uses memory-only Firestore caching for every role. Clear any
// IndexedDB cache created by older builds before the first Firestore operation.
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
export const storage = getStorage(app);
export const functions = getFunctions(app, 'northamerica-northeast1');

void clearIndexedDbPersistence(db).catch((error) => {
  // A second open tab can temporarily hold the old cache. It is no longer used
  // by this memory-only Firestore instance and will be retried on the next load.
  console.warn('Legacy Firestore cache could not be cleared yet:', error?.code || error);
});

export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});
