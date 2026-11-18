// services/pushService.ts
//
// Late-payment notifications (web push through Firebase Cloud Messaging).
// Each device that turns notifications on stores its push address in
// users/{ownerId}/pushTokens/{token}. A daily job (notify/send-overdue.mjs, run by GitHub Actions)
// finds late payments and sends one notification to every stored device of that owner.

import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { app, db, isEmulatorMode } from './firebase';
import { User } from '../types';

// Public web push key (safe to ship in the app; the private half stays with Firebase).
const VAPID_KEY = 'BNbxaoZC1dDtapmfnt2E68GV8k8QwDHod7ovxxsTyTuZWNoDW7N9mU4l0wfoHE-EbnEr33ydrE6Rdif9cd5og-U';
const TOKEN_KEY = 'rentals_push_token';

const readToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export type PushStatus = 'unsupported' | 'ios-needs-install' | 'denied' | 'enabled' | 'off';

/** Which daily notifications this device wants (read by notify/send-overdue.mjs). */
export interface PushPrefs {
  overdue: boolean;   // late payments
  today: boolean;     // payments due today
  upcoming: boolean;  // payments due in the next 3 days
  contracts: boolean; // contracts ending in 30 / 7 / 1 day(s) or today
}
const PREFS_KEY = 'rentals_push_prefs';
export const DEFAULT_PUSH_PREFS: PushPrefs = { overdue: true, today: true, upcoming: true, contracts: true };

export const getPushPrefs = (): PushPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PUSH_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PUSH_PREFS };
  } catch {
    return { ...DEFAULT_PUSH_PREFS };
  }
};

/** Saves the choice on this device and, if notifications are on, on the server too. */
export const savePushPrefs = async (user: User | null, prefs: PushPrefs): Promise<void> => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  const token = readToken();
  if (token && user?.ownerId && user.uid) {
    await setDoc(doc(db, 'users', user.ownerId, 'pushTokens', token), { uid: user.uid, prefs }, { merge: true });
  }
};

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

const basePath = () => (import.meta as any).env?.BASE_URL || '/';

export const getPushStatus = async (): Promise<PushStatus> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!('Notification' in window)) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (!app || isEmulatorMode || !(await isSupported().catch(() => false))) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && readToken() ? 'enabled' : 'off';
};

const getRegistration = async (): Promise<ServiceWorkerRegistration> => {
  const base = basePath();
  const existing = await navigator.serviceWorker.getRegistration(base);
  const registration = existing || await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  await navigator.serviceWorker.ready;
  return registration;
};

/** Asks for permission (must be called from a tap) and registers this device for the user's owner. */
export const enablePush = async (user: User): Promise<PushStatus> => {
  const status = await getPushStatus();
  if (status === 'unsupported' || status === 'ios-needs-install' || status === 'denied') return status;
  if (!user.ownerId || !user.uid) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: await getRegistration() });
  if (!token) return 'off';

  await setDoc(doc(db, 'users', user.ownerId, 'pushTokens', token), {
    uid: user.uid,
    role: user.role,
    prefs: getPushPrefs(),
    createdAt: Date.now(),
    device: navigator.userAgent.slice(0, 200),
  });
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  return 'enabled';
};

/** Stops notifications on this device (also called on logout). */
export const disablePush = async (user: User | null): Promise<void> => {
  const token = readToken();
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  if (!token || !app) return;
  if (user?.ownerId) {
    await deleteDoc(doc(db, 'users', user.ownerId, 'pushTokens', token)).catch(() => {});
  }
  if (await isSupported().catch(() => false)) {
    await deleteToken(getMessaging(app)).catch(() => {});
  }
};

/** Arabic explanation for statuses where the button cannot turn notifications on. */
export const pushStatusMessage = (status: PushStatus): string => {
  switch (status) {
    case 'ios-needs-install': return 'على الآيفون: افتح الموقع في Safari ← زر المشاركة ← "إضافة إلى الشاشة الرئيسية"، ثم افتح التطبيق من الشاشة الرئيسية وفعّل الإشعارات.';
    case 'denied': return 'الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح (أيقونة القفل بجانب الرابط) ثم حاول مرة أخرى.';
    case 'unsupported': return 'هذا المتصفح لا يدعم الإشعارات. جرّب Chrome أو Safari بعد إضافة الموقع للشاشة الرئيسية.';
    default: return '';
  }
};
