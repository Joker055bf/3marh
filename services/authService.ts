// services/authService.ts
//
// Accounts live in Firebase Authentication (passwords are hashed and checked by Google, never
// stored in Firestore). Two small Firestore collections hold what the app needs to know:
//
//   usernames/{username lowercased}  -> { uid, ownerId, role, authEmail, pendingEmail? }
//       Lets someone sign in with a username. Readable by id only (no listing).
//   accounts/{uid}                   -> { username, role, ownerId, email?, workerName?, permissions? }
//       Who the signed-in user is and which owner's data they may reach (enforced by firestore.rules).
//
// Owners whose account has a real email use it as their sign-in email, so "forgot password" can
// send a Firebase reset link. Everyone else gets a private placeholder email that never receives mail.

import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  reauthenticateWithCredential, EmailAuthProvider, updatePassword, sendPasswordResetEmail,
  verifyBeforeUpdateEmail, User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, firebaseConfig, isEmulatorMode } from './firebase';
import { User, WorkerPermissions } from '../types';

export const MIN_PASSWORD_LENGTH = 6; // Firebase Authentication's minimum for new passwords
const PLACEHOLDER_EMAIL_DOMAIN = 'noemail.marh-6ccfc.firebaseapp.com';
const RESERVED_USERNAMES = ['global_system'];

export class AuthError extends Error {
  constructor(public code: string, message?: string) {
    super(message || code);
  }
}

export const usernameKey = (username: string): string => username.trim().toLowerCase();

/** Firestore document ids cannot contain "/" or be "." / ".." / "__x__". */
export const validateUsername = (username: string): void => {
  const u = username.trim();
  if (!u) throw new AuthError('USERNAME_REQUIRED');
  if (u.includes('/') || u === '.' || u === '..' || /^__.*__$/.test(u) || u.length > 100) {
    throw new AuthError('USERNAME_INVALID');
  }
  if (RESERVED_USERNAMES.includes(usernameKey(u))) throw new AuthError('USERNAME_TAKEN');
};

const randomId = (len = 10): string => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => (b % 36).toString(36)).join('');
};

const placeholderEmail = (): string => `u-${randomId(16)}@${PLACEHOLDER_EMAIL_DOMAIN}`;

export const isPlaceholderEmail = (email?: string | null): boolean =>
  !!email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);

const requireFirebase = () => {
  if (!auth || !db) throw new AuthError('FIREBASE_UNAVAILABLE');
};

const mapFirebaseError = (err: any): AuthError => {
  const code: string = err?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email')) {
    return new AuthError('INVALID_CREDENTIALS');
  }
  if (code.includes('email-already-in-use')) return new AuthError('EMAIL_TAKEN');
  if (code.includes('weak-password')) return new AuthError('WEAK_PASSWORD');
  if (code.includes('too-many-requests')) return new AuthError('TOO_MANY_ATTEMPTS');
  if (code.includes('network-request-failed')) return new AuthError('NETWORK');
  if (code.includes('requires-recent-login')) return new AuthError('REAUTH_REQUIRED');
  if (err instanceof AuthError) return err;
  return new AuthError('UNKNOWN', err?.message);
};

/** Arabic messages for the AuthError codes above. */
export const authErrorMessage = (err: any): string => {
  const code = err instanceof AuthError ? err.code : mapFirebaseError(err).code;
  switch (code) {
    case 'INVALID_CREDENTIALS': return 'اسم المستخدم أو كلمة المرور غير صحيحة';
    case 'USERNAME_TAKEN': return 'اسم المستخدم هذا مسجل مسبقاً، يرجى اختيار اسم آخر.';
    case 'USERNAME_REQUIRED': return 'يرجى إدخال اسم المستخدم';
    case 'USERNAME_INVALID': return 'اسم المستخدم غير صالح (لا يمكن أن يحتوي على /)';
    case 'EMAIL_TAKEN': return 'هذا البريد الإلكتروني مستخدم في حساب آخر';
    case 'WEAK_PASSWORD': return `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} خانات على الأقل`;
    case 'TOO_MANY_ATTEMPTS': return 'محاولات كثيرة، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى';
    case 'NETWORK': return 'تعذر الاتصال بالإنترنت، تأكد من الاتصال وحاول مرة أخرى';
    case 'ACCOUNT_DISABLED': return 'هذا الحساب لم يعد مفعّلاً. تواصل مع مالك العقار.';
    case 'NO_RESET_EMAIL': return 'لا يوجد بريد إلكتروني مرتبط بهذا الحساب لاستعادة كلمة المرور. تواصل مع الدعم.';
    case 'FIREBASE_UNAVAILABLE': return 'الخدمة غير متاحة حالياً';
    case 'REAUTH_REQUIRED': return 'يرجى تسجيل الدخول من جديد ثم المحاولة';
    case 'PASSWORD_REQUIRED_FOR_RENAME': return 'عند تغيير اسم المستخدم يجب إدخال كلمة مرور جديدة للعامل';
    default: return 'حدث خطأ غير متوقع، حاول مرة أخرى';
  }
};

const accountToUser = (uid: string, data: any): User => ({
  uid,
  username: String(data.username || ''),
  role: data.role === 'worker' ? 'worker' : 'owner',
  ownerId: String(data.ownerId || ''),
  email: data.email || undefined,
  workerName: data.workerName || undefined,
  workerId: data.role === 'worker' ? uid : undefined,
  permissions: data.permissions || undefined,
});

/** Loads the app-level account for a Firebase user; throws ACCOUNT_DISABLED if it no longer exists. */
export const loadAccount = async (uid: string): Promise<User> => {
  requireFirebase();
  const snap = await getDoc(doc(db, 'accounts', uid));
  if (!snap.exists()) throw new AuthError('ACCOUNT_DISABLED');
  return accountToUser(uid, snap.data());
};

const lookupUsername = async (username: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'usernames', usernameKey(username)));
  return snap.exists() ? snap.data() : null;
};

/** Signs in with a username (or the account's email) and password. */
export const signIn = async (identifier: string, password: string): Promise<User> => {
  requireFirebase();
  const id = identifier.trim();
  let candidates: string[] = [];
  let entry: any = null;

  if (id.includes('@')) {
    candidates = [id];
  } else {
    entry = await lookupUsername(id);
    if (!entry || !entry.uid || entry.reserved) throw new AuthError('INVALID_CREDENTIALS');
    candidates = [entry.authEmail, entry.pendingEmail].filter(Boolean);
  }

  let lastError: any = null;
  for (const email of candidates) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // A pending email change was confirmed from the inbox: remember the new sign-in email.
      if (entry && email === entry.pendingEmail && email !== entry.authEmail) {
        await updateDoc(doc(db, 'usernames', usernameKey(id)), { authEmail: email, pendingEmail: null }).catch(() => {});
      }
      return await loadAccount(cred.user.uid);
    } catch (err) {
      lastError = err;
      if (err instanceof AuthError) throw err;
    }
  }
  throw mapFirebaseError(lastError);
};

export const signOutUser = async (): Promise<void> => {
  if (auth) await signOut(auth).catch(() => {});
};

// While an owner is being registered, the new login exists before its account record does.
// AuthContext checks this so it does not treat the half-created account as disabled.
let registrationInProgress = false;
export const isRegistrationInProgress = (): boolean => registrationInProgress;

/** Creates a new owner account. ownerId equals the username, as before. */
export const registerOwner = async (username: string, password: string, email?: string): Promise<User> => {
  requireFirebase();
  validateUsername(username);
  if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('WEAK_PASSWORD');
  const name = username.trim();
  const key = usernameKey(name);
  if (await lookupUsername(name)) throw new AuthError('USERNAME_TAKEN');
  registrationInProgress = true;
  try {
    return await createOwnerAccount(name, key, password, email);
  } finally {
    registrationInProgress = false;
  }
};

const createOwnerAccount = async (name: string, key: string, password: string, email?: string): Promise<User> => {
  const realEmail = email?.trim() || '';
  const authEmail = realEmail || placeholderEmail();
  let fbUser: FirebaseUser;
  try {
    fbUser = (await createUserWithEmailAndPassword(auth, authEmail, password)).user;
  } catch (err) {
    throw mapFirebaseError(err);
  }

  try {
    // Claim the username first; the rules only allow one account per username.
    await setDoc(doc(db, 'usernames', key), { uid: fbUser.uid, ownerId: name, role: 'owner', authEmail });
    await setDoc(doc(db, 'accounts', fbUser.uid), {
      username: name, role: 'owner', ownerId: name, email: realEmail || null, createdAt: Date.now(),
    });
  } catch (err) {
    // Someone took the username in the meantime (or the write was refused): undo the login we created.
    await fbUser.delete().catch(() => {});
    throw new AuthError('USERNAME_TAKEN');
  }
  return loadAccount(fbUser.uid);
};

/** Confirms the signed-in user's password (used before sensitive actions). */
export const reauthenticate = async (password: string): Promise<boolean> => {
  if (!auth?.currentUser?.email || !password) return false;
  try {
    await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password));
    return true;
  } catch {
    return false;
  }
};

export const hasFirebaseSession = (): boolean => !!auth?.currentUser;

/** Changes the signed-in user's password. Call reauthenticate() first. */
export const changeOwnPassword = async (newPassword: string): Promise<void> => {
  if (!auth?.currentUser) throw new AuthError('REAUTH_REQUIRED');
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new AuthError('WEAK_PASSWORD');
  try {
    await updatePassword(auth.currentUser, newPassword);
  } catch (err) {
    throw mapFirebaseError(err);
  }
};

/** Sends a Firebase password-reset link. Only accounts that signed up with a real email can use it. */
export const requestPasswordReset = async (email: string): Promise<void> => {
  requireFirebase();
  const e = email.trim();
  if (!e || isPlaceholderEmail(e)) throw new AuthError('NO_RESET_EMAIL');
  try {
    await sendPasswordResetEmail(auth, e);
  } catch (err: any) {
    // Do not reveal whether an email is registered.
    if (String(err?.code || '').includes('user-not-found')) return;
    throw mapFirebaseError(err);
  }
};

/**
 * Sets the signed-in user's contact email. If it differs from the sign-in email, Firebase sends a
 * confirmation link; once confirmed, the new address becomes the sign-in (and reset) email.
 */
export const changeOwnEmail = async (newEmail: string): Promise<{ verificationSent: boolean }> => {
  requireFirebase();
  const current = auth.currentUser as FirebaseUser | null;
  if (!current) throw new AuthError('REAUTH_REQUIRED');
  const email = newEmail.trim();
  await updateDoc(doc(db, 'accounts', current.uid), { email });
  if (current.email?.toLowerCase() === email.toLowerCase()) return { verificationSent: false };
  try {
    await verifyBeforeUpdateEmail(current, email);
  } catch (err) {
    throw mapFirebaseError(err);
  }
  const account = await loadAccount(current.uid);
  await updateDoc(doc(db, 'usernames', usernameKey(account.username)), { pendingEmail: email }).catch(() => {});
  return { verificationSent: true };
};

// --- Workers (managed by their owner) ---

export const listWorkers = async (ownerId: string): Promise<User[]> => {
  requireFirebase();
  const q = query(collection(db, 'accounts'), where('ownerId', '==', ownerId), where('role', '==', 'worker'));
  const snap = await getDocs(q);
  return snap.docs.map(d => accountToUser(d.id, d.data()));
};

/**
 * Creating a Firebase login normally signs the creator in as the new user. A temporary second
 * Firebase app is used so the owner stays signed in while the worker's login is created.
 */
const createLoginInSideApp = async (email: string, password: string): Promise<string> => {
  let sideApp: FirebaseApp | null = null;
  try {
    sideApp = initializeApp(firebaseConfig, `worker-create-${Date.now()}`);
    const sideAuth = getAuth(sideApp);
    if (isEmulatorMode) connectAuthEmulator(sideAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(sideAuth, email, password);
    await signOut(sideAuth).catch(() => {});
    return cred.user.uid;
  } catch (err) {
    throw mapFirebaseError(err);
  } finally {
    if (sideApp) await deleteApp(sideApp).catch(() => {});
  }
};

export const createWorker = async (
  ownerId: string, username: string, password: string, workerName: string, permissions: WorkerPermissions,
): Promise<void> => {
  requireFirebase();
  validateUsername(username);
  if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('WEAK_PASSWORD');
  const name = username.trim();
  if (await lookupUsername(name)) throw new AuthError('USERNAME_TAKEN');

  const authEmail = placeholderEmail();
  const uid = await createLoginInSideApp(authEmail, password);
  await setDoc(doc(db, 'usernames', usernameKey(name)), { uid, ownerId, role: 'worker', authEmail });
  await setDoc(doc(db, 'accounts', uid), {
    username: name, role: 'worker', ownerId, workerName, permissions, createdAt: Date.now(),
  });
};

/**
 * Updates a worker. Name and permissions are edited in place. A new username or password needs a
 * new login (only the worker can change their own Firebase password), so a replacement login is
 * created and the old one loses all access when its account record is removed.
 */
export const updateWorker = async (
  worker: User, changes: { username: string; password?: string; workerName: string; permissions: WorkerPermissions },
): Promise<void> => {
  requireFirebase();
  if (!worker.uid) throw new AuthError('UNKNOWN', 'Worker has no uid');
  const newName = changes.username.trim();
  const usernameChanged = usernameKey(newName) !== usernameKey(worker.username);
  const needsNewLogin = usernameChanged || !!changes.password;

  if (!needsNewLogin) {
    await updateDoc(doc(db, 'accounts', worker.uid), {
      workerName: changes.workerName, permissions: changes.permissions, username: newName,
    });
    return;
  }

  validateUsername(newName);
  if (usernameChanged && await lookupUsername(newName)) throw new AuthError('USERNAME_TAKEN');
  if (!changes.password) throw new AuthError('PASSWORD_REQUIRED_FOR_RENAME');
  if (changes.password.length < MIN_PASSWORD_LENGTH) throw new AuthError('WEAK_PASSWORD');

  const authEmail = placeholderEmail();
  const newUid = await createLoginInSideApp(authEmail, changes.password);
  await setDoc(doc(db, 'accounts', newUid), {
    username: newName, role: 'worker', ownerId: worker.ownerId,
    workerName: changes.workerName, permissions: changes.permissions, createdAt: Date.now(),
  });
  await setDoc(doc(db, 'usernames', usernameKey(newName)), { uid: newUid, ownerId: worker.ownerId, role: 'worker', authEmail });
  if (usernameChanged) await deleteDoc(doc(db, 'usernames', usernameKey(worker.username))).catch(() => {});
  await deleteDoc(doc(db, 'accounts', worker.uid));
};

export const deleteWorker = async (worker: User): Promise<void> => {
  requireFirebase();
  if (!worker.uid) return;
  await deleteDoc(doc(db, 'accounts', worker.uid));
  await deleteDoc(doc(db, 'usernames', usernameKey(worker.username))).catch(() => {});
};
