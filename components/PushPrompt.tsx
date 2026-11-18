import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPushStatus, enablePush, pushStatusMessage, PushStatus } from '../services/pushService';

const DISMISS_KEY = 'rentals_push_prompt_dismissed';

/** Small card inviting the user to turn on late-payment notifications on this device. */
const PushPrompt: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    getPushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const canGetAlerts = user?.role === 'owner' || !!user?.permissions?.canViewAlerts;
  if (!user || !canGetAlerts || dismissed || status === null || status === 'enabled' || status === 'unsupported') return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setDismissed(true);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const result = await enablePush(user);
      setStatus(result);
      setNote(result === 'enabled' ? '' : pushStatusMessage(result));
    } catch (err) {
      console.error('Enabling notifications failed:', err);
      setNote('تعذر تفعيل الإشعارات، حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-8 mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-right">
      <div className="flex items-start gap-2.5">
        <span className="text-xl leading-none">🔔</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">إشعارات الدفعات والعقود</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed">
            {note || (status === 'off' ? 'فعّل الإشعارات لتصلك كل صباح: الدفعات المتأخرة والمستحقة اليوم والقادمة، والعقود قريبة الانتهاء.' : pushStatusMessage(status))}
          </p>
          <div className="flex gap-2 mt-2">
            {status === 'off' && (
              <button onClick={enable} disabled={busy} className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-60">
                {busy ? 'جاري التفعيل...' : 'تفعيل الإشعارات'}
              </button>
            )}
            <button onClick={dismiss} className="px-3 py-1.5 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs font-bold">
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PushPrompt;
