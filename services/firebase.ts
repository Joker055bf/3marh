import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, setDoc, getDoc, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";


export const firebaseConfig = {
  apiKey: "AIzaSyA_9K9tL0-DkDcrnZOYIr8ICNxjQbuEsb8",
  authDomain: "marh-6ccfc.firebaseapp.com",
  projectId: "marh-6ccfc",
  storageBucket: "marh-6ccfc.firebasestorage.app",
  messagingSenderId: "596738743777",
  appId: "1:596738743777:web:b3970ac03be74ed64fc6a0",
  measurementId: "G-Z84HL1GCLS"
};

export let app: any = null;
export let db: any = null;
export let auth: any = null;


// Dev-only: `npm run dev:offline` runs with Firebase disabled so the UI can be
// tested with local demo data without reading or writing the real database.
const isOfflineMode = (import.meta as any).env?.VITE_OFFLINE === '1';
// Dev-only: `npm run dev:emulator` talks to the local Firebase emulators instead of the real project.
export const isEmulatorMode = (import.meta as any).env?.VITE_USE_EMULATOR === '1';

try {
  if (isOfflineMode) throw new Error('Offline mode: Firebase disabled');
  app = initializeApp(firebaseConfig);
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  auth = getAuth(app);
  if (isEmulatorMode) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }

} catch (error) {
  console.error("Firebase initialization failed:", error);
}

/**
 * Syncs a specific key to Firestore under the current user's document.
 */
  export const syncToFirebase = async (ownerId: string, key: string, data: any) => {
    if (!ownerId || !db) return;
    try {
      const userRef = doc(db, "users", ownerId);
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Firebase Sync Timeout')), 10000);
        setDoc(userRef, { [key]: data }, { merge: true })
          .then(() => {
            clearTimeout(timeoutId);
            resolve();
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
      });
    } catch (error) {
      console.warn("Firebase Sync suppressed (offline or error):", error);
    }
  };
  
  export const fetchFromFirebase = async (ownerId: string): Promise<any> => {
    if (!ownerId || !db) return null;
    try {
      const userRef = doc(db, "users", ownerId);
      // Use getDoc with a faster fail-safe
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
    } catch (error) {
      console.warn("Firebase Fetch suppressed (offline or error):", error);
    }
    return null;
  };

/**
 * ID photos are stored one per document (users/{ownerId}/idPhotos/{photoId}) instead of
 * inside the tenants list, because a single Firestore document is capped at 1 MB.
 */
export const savePhotoToFirebase = async (ownerId: string, photoId: string, dataUrl: string): Promise<boolean> => {
  if (!ownerId || !db) return false;
  try {
    const ref = doc(db, "users", ownerId, "idPhotos", photoId);
    await Promise.race([
      setDoc(ref, { dataUrl, createdAt: Date.now() }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Photo upload timeout')), 15000)),
    ]);
    return true;
  } catch (error) {
    console.warn("Photo upload failed:", error);
    return false;
  }
};

export const fetchPhotoFromFirebase = async (ownerId: string, photoId: string): Promise<string | null> => {
  if (!ownerId || !db) return null;
  try {
    const snap = await getDoc(doc(db, "users", ownerId, "idPhotos", photoId));
    return snap.exists() ? (snap.data().dataUrl as string) || null : null;
  } catch (error) {
    console.warn("Photo fetch failed:", error);
    return null;
  }
};
