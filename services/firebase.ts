import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
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
// Use persistent multi-tab cache for fast load times and reliable offline access
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, 'northamerica-northeast1');

export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});
