// Checks the security rules and the migrated logins against the local emulators.
// Run after seed-legacy.mjs and `migrate-accounts.mjs --emulator --apply`:
//   node scripts/emulator/test-security.mjs
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where,
} from 'firebase/firestore';
import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
admin.initializeApp({ projectId: 'marh-6ccfc' });

const config = { apiKey: 'fake-api-key', projectId: 'marh-6ccfc', authDomain: 'marh-6ccfc.firebaseapp.com' };
let n = 0;
const client = () => {
  const app = initializeApp(config, `t${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = initializeFirestore(app, {});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db };
};

let passed = 0, failed = 0;
const expect = async (label, shouldSucceed, fn) => {
  let ok;
  try { await fn(); ok = true; } catch { ok = false; }
  if (ok === shouldSucceed) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} (expected ${shouldSucceed ? 'allowed' : 'denied'}, got ${ok ? 'allowed' : 'denied'})`); }
};

const signInByUsername = async (c, username, password) => {
  const entry = await getDoc(doc(c.db, 'usernames', username.toLowerCase()));
  if (!entry.exists()) throw new Error('no such username');
  return signInWithEmailAndPassword(c.auth, entry.data().authEmail, password);
};

console.log('\nMigration results');
const legacy = await admin.firestore().doc('users/global_system').get();
await expect('plaintext user list was deleted', true, async () => { if (legacy.get('rentals_global_users') !== undefined) throw 0; });
const ali = await admin.firestore().doc('users/Ali').get();
await expect('stored owner password was deleted', true, async () => { if (ali.get('rentals_Ali_delete_password') !== undefined) throw 0; });
await expect('owner data was kept', true, async () => { if (!ali.get('rentals_Ali_buildings')) throw 0; });

console.log('\nNot signed in');
const anon = client();
await expect('cannot read the old user list document', false, () => getDoc(doc(anon.db, 'users', 'global_system')));
await expect('cannot read an owner\'s data', false, () => getDoc(doc(anon.db, 'users', 'Ali')));
await expect('can look up one username (needed to sign in)', true, () => getDoc(doc(anon.db, 'usernames', 'ali')));
await expect('cannot list all usernames', false, () => getDocs(collection(anon.db, 'usernames')));
await expect('cannot list accounts', false, () => getDocs(collection(anon.db, 'accounts')));
await expect('wrong password is rejected', false, () => signInByUsername(anon, 'Ali', 'wrong-password'));

console.log('\nOwner Ali (migrated, old 4-character password)');
const a = client();
await expect('signs in with the old password', true, () => signInByUsername(a, 'ali', 'abcd'));
await expect('reads own data', true, () => getDoc(doc(a.db, 'users', 'Ali')));
await expect('writes own data', true, () => setDoc(doc(a.db, 'users', 'Ali'), { rentals_Ali_notes: [] }, { merge: true }));
await expect('cannot read sara\'s data', false, () => getDoc(doc(a.db, 'users', 'sara')));
await expect('cannot write sara\'s data', false, () => setDoc(doc(a.db, 'users', 'sara'), { x: 1 }, { merge: true }));
await expect('lists own workers', true, async () => {
  const s = await getDocs(query(collection(a.db, 'accounts'), where('ownerId', '==', 'Ali'), where('role', '==', 'worker')));
  if (s.size !== 1) throw new Error('expected 1 worker');
});
await expect('cannot list sara\'s workers', false, () => getDocs(query(collection(a.db, 'accounts'), where('ownerId', '==', 'sara'), where('role', '==', 'worker'))));
await expect('cannot make an account for sara', false, () => setDoc(doc(a.db, 'accounts', 'fake-uid-1'), { username: 'x', role: 'worker', ownerId: 'sara' }));
await expect('can add own worker account', true, () => setDoc(doc(a.db, 'accounts', 'fake-uid-2'), { username: 'w2', role: 'worker', ownerId: 'Ali' }));
await expect('can store an ID photo', true, () => setDoc(doc(a.db, 'users', 'Ali', 'idPhotos', 'p1'), { dataUrl: 'data:,' }));

console.log('\nWorker w1 (belongs to Ali)');
const w = client();
await expect('signs in', true, () => signInByUsername(w, 'w1', 'w1pass'));
await expect('reads Ali\'s data', true, () => getDoc(doc(w.db, 'users', 'Ali')));
await expect('cannot read sara\'s data', false, () => getDoc(doc(w.db, 'users', 'sara')));
await expect('cannot promote itself to owner', false, () => updateDoc(doc(w.db, 'accounts', w.auth.currentUser.uid), { role: 'owner' }));
await expect('cannot move itself to sara', false, () => updateDoc(doc(w.db, 'accounts', w.auth.currentUser.uid), { ownerId: 'sara' }));
await expect('cannot create worker accounts', false, () => setDoc(doc(w.db, 'accounts', 'fake-uid-3'), { username: 'w3', role: 'worker', ownerId: 'Ali' }));
await expect('cannot list workers', false, () => getDocs(query(collection(w.db, 'accounts'), where('ownerId', '==', 'Ali'), where('role', '==', 'worker'))));

console.log('\nNew sign-up trying to take over existing data');
const m = client();
const cred = await createUserWithEmailAndPassword(m.auth, 'attacker@example.com', 'attack123');
const uid = cred.user.uid;
await expect('cannot claim username of an existing owner', false, () => setDoc(doc(m.db, 'usernames', 'sara'), { uid, ownerId: 'sara', role: 'owner', authEmail: 'attacker@example.com' }));
await expect('cannot claim a reserved name (data without login)', false, () => setDoc(doc(m.db, 'usernames', 'orphan'), { uid, ownerId: 'orphan', role: 'owner', authEmail: 'attacker@example.com' }));
await expect('cannot claim "global_system"', false, () => setDoc(doc(m.db, 'usernames', 'global_system'), { uid, ownerId: 'global_system', role: 'owner', authEmail: 'x' }));
await expect('cannot create an owner account for sara', false, () => setDoc(doc(m.db, 'accounts', uid), { username: 'sara', role: 'owner', ownerId: 'sara' }));
await expect('can claim a free username', true, () => setDoc(doc(m.db, 'usernames', 'newowner'), { uid, ownerId: 'newowner', role: 'owner', authEmail: 'attacker@example.com' }));
await expect('cannot use own username to point at sara\'s data', false, () => setDoc(doc(m.db, 'accounts', uid), { username: 'newowner', role: 'owner', ownerId: 'sara' }));
await expect('can create own owner account', true, () => setDoc(doc(m.db, 'accounts', uid), { username: 'newowner', role: 'owner', ownerId: 'newowner' }));
await expect('still cannot read sara\'s data', false, () => getDoc(doc(m.db, 'users', 'sara')));
await expect('cannot read Ali\'s account record', false, async () => {
  const s = await admin.firestore().collection('accounts').where('username', '==', 'Ali').get();
  await getDoc(doc(m.db, 'accounts', s.docs[0].id));
});
await expect('reads and writes own new data', true, () => setDoc(doc(m.db, 'users', 'newowner'), { rentals_newowner_buildings: [] }));

for (const c of [anon, a, w, m]) { await signOut(c.auth).catch(() => {}); await deleteApp(c.app); }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
