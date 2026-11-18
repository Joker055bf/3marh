import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { setDbPrefix, markSetupComplete } from '../services/dbService';
import { fetchFromFirebase, auth } from '../services/firebase';
import { loadAccount, signOutUser, AuthError, isRegistrationInProgress } from '../services/authService';
import { disablePush } from '../services/pushService';

import { User } from '../types';

export type Role = 'owner' | 'worker';

interface AuthContextType {
  user: User | null;
  login: (user: User) => Promise<void>;
  logout: () => void;
  isInitializing: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'rentals_active_session';
const LEGACY_USERS_KEY = 'rentals_global_users';

// Fields from the cloud document that must never be copied onto the device.
const isSensitiveKey = (key: string) => key === LEGACY_USERS_KEY || key.endsWith('_delete_password');

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** Removes the old plaintext user list that earlier versions kept on every device. */
const purgeLegacyUserList = () => {
  try {
    const raw = localStorage.getItem(LEGACY_USERS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) markSetupComplete(); // keeps the native first-run screen from reappearing
      localStorage.removeItem(LEGACY_USERS_KEY);
    }
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed && 'password' in parsed) {
        delete parsed.password;
        localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      }
    }
  } catch {}
};

const readCachedSession = (): User | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const activeUidRef = useRef<string | null>(null);

  // Copy the owner's cloud document into local storage before pages mount.
  const syncFirebaseData = async (ownerId: string): Promise<void> => {
    try {
      const data: any = await withTimeout(fetchFromFirebase(ownerId), 5000);
      if (data) {
        Object.keys(data).forEach(key => {
          const value = data[key];
          if (!value || isSensitiveKey(key)) return;
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        });
      }
    } catch (err) {
      console.warn("Sync failed or timed out", err);
    }
  };

  const startSession = async (account: User) => {
    activeUidRef.current = account.uid || null;
    setDbPrefix(account.ownerId);
    await syncFirebaseData(account.ownerId);
    localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setUser(account);
  };

  const clearSession = () => {
    activeUidRef.current = null;
    setUser(null);
    setDbPrefix('');
    localStorage.removeItem(SESSION_KEY);
  };

  useEffect(() => {
    purgeLegacyUserList();

    // Firebase unavailable (dev offline mode): fall back to the locally cached session.
    if (!auth) {
      const cached = readCachedSession();
      if (cached) {
        setDbPrefix(cached.ownerId);
        setUser(cached);
      }
      setIsInitializing(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        clearSession();
        setIsInitializing(false);
        return;
      }
      if (activeUidRef.current === fbUser.uid) {
        setIsInitializing(false);
        return; // login() already started this session
      }
      if (isRegistrationInProgress()) {
        return; // registerOwner() is still writing the account; login() will start the session
      }
      try {
        const account = await withTimeout(loadAccount(fbUser.uid), 8000);
        await startSession(account);
      } catch (err) {
        if (err instanceof AuthError && err.code === 'ACCOUNT_DISABLED') {
          await signOutUser();
          clearSession();
        } else {
          // Offline: keep working with the last known account for this same login.
          const cached = readCachedSession();
          if (cached && cached.uid === fbUser.uid) {
            activeUidRef.current = fbUser.uid;
            setDbPrefix(cached.ownerId);
            setUser(cached);
          } else {
            clearSession();
          }
        }
      }
      setIsInitializing(false);
    });
    return unsubscribe;
  }, []);

  /** Called after authService.signIn()/registerOwner() succeeded. */
  const login = async (account: User) => {
    setIsInitializing(true);
    await startSession(account);
    setIsInitializing(false);
  };

  const logout = async () => {
    // Stop late-payment notifications for this account on this device before signing out.
    await disablePush(user).catch(() => {});
    clearSession();
    signOutUser();
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center">
          <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-slate-600 dark:text-slate-400 font-bold">جاري تحميل البيانات الأساسية...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isInitializing }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
