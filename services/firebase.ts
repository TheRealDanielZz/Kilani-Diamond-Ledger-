
import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { initializeAuth, browserLocalPersistence } from 'firebase/auth';

import { getStorage } from 'firebase/storage';

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
export const db = getFirestore(app);
export const storage = getStorage(app);

// Enable Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Persistence failed: browser does not support it');
    }
});

export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});
