import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from '../hooks/useTranslation';
import { setDeletePassword, verifyPassword, verifySecretWord, getLandlordName, setLandlordName, exportAllData, importAllData } from '../services/dbService';
import { hasFirebaseSession, changeOwnPassword, changeOwnEmail, requestPasswordReset, authErrorMessage, MIN_PASSWORD_LENGTH } from '../services/authService';
import { formatDateForInput } from '../utils/dateUtils';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

import { useAuth } from '../contexts/AuthContext';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { getPushStatus, enablePush, disablePush, pushStatusMessage, PushStatus, getPushPrefs, savePushPrefs, PushPrefs } from '../services/pushService';


export type View = 'main' | 'changePassword_auth' | 'changePassword_new' | 'forgotPassword_email' | 'forgotPassword_otp' | 'changeLandlord_auth' | 'changeLandlord_new' | 'showContract_auth' | 'data_management' | 'workerManagement_auth' | 'workerManagement_new' | 'changeEmail_auth' | 'changeEmail_new';

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
  </svg>
);

const DataIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
  </svg>
);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: View;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialView }) => {
  const {
    theme, language, showContractInfo, showDeleteTerminatedTenant,
    setTheme, setLanguage, setShowContractInfo, setShowDeleteTerminatedTenant
  } = useSettings();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isInstallable, handleInstallClick } = useInstallPrompt();


  const [view, setView] = useState<View>('main');
  const [isLoading, setIsLoading] = useState(false);

  const [isDataPasswordOpen, setIsDataPasswordOpen] = useState(false);
  const [isDeleteTenantPasswordOpen, setIsDeleteTenantPasswordOpen] = useState(false);
  const [dataPassword, setDataPassword] = useState('');
  const [deleteTenantPasswordError, setDeleteTenantPasswordError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState<string[]>(new Array(6).fill(''));
  const [generatedCode, setGeneratedCode] = useState('');
  const [newLandlordName, setNewLandlordName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isNative = Capacitor.isNativePlatform();
  const isWorker = !isNative && user?.role === 'worker';

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [versionClickCount, setVersionClickCount] = useState(0);

  // Late-payment notifications on this device.
  const [pushStatus, setPushStatus] = useState<PushStatus>('off');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState('');
  useEffect(() => {
    if (isOpen) getPushStatus().then(setPushStatus).catch(() => setPushStatus('unsupported'));
  }, [isOpen]);
  const canGetOverdueAlerts = user?.role === 'owner' || !!user?.permissions?.canViewAlerts;
  const [pushPrefs, setPushPrefs] = useState<PushPrefs>(getPushPrefs);
  const togglePref = (key: keyof PushPrefs) => {
    const next = { ...pushPrefs, [key]: !pushPrefs[key] };
    setPushPrefs(next);
    savePushPrefs(user, next).catch(err => console.error('Saving notification choices failed:', err));
  };

  const handlePushToggle = async () => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    setPushNote('');
    try {
      if (pushStatus === 'enabled') {
        await disablePush(user);
        setPushStatus('off');
      } else {
        const status = await enablePush(user);
        setPushStatus(status);
        setPushNote(status === 'enabled' ? 'تم التفعيل ✅ اختر أدناه أنواع الإشعارات التي تريدها.' : pushStatusMessage(status));
      }
    } catch (err) {
      console.error('Push toggle failed:', err);
      setPushNote('تعذر تفعيل الإشعارات، حاول مرة أخرى.');
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setView(initialView || 'main');
    } else {
      // If modal is closed, reset everything.
      setView('main');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNewLandlordName('');
      setRecoveryEmail('');
      setRecoveryCode(new Array(6).fill(''));
      setGeneratedCode('');
      setError('');
      setSuccess('');
      setVersionClickCount(0);
    }
  }, [isOpen, initialView]);

  const handleClose = () => {
    onClose();
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(currentPassword)) {
      setView('changePassword_new');
      setError('');
    } else {
      setError(t('settings.passwordFlow.errorIncorrect'));
    }
  };

  const handleStartRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      // Firebase emails a secure reset link; nothing secret passes through the app.
      await requestPasswordReset(recoveryEmail);
      setSuccess('إذا كان هذا البريد مسجلاً، ستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة.');
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setIsLoading(false);
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredCode = recoveryCode.join('');
    if (enteredCode === generatedCode) {
      setView('changePassword_new');
      setError('');
    } else {
      setError('رمز التحقق غير صحيح، حاول مرة أخرى.');
    }
  };

  const handleCodeChange = (element: HTMLInputElement, index: number) => {
    if (isNaN(Number(element.value))) return;
    const newCode = [...recoveryCode];
    newCode[index] = element.value;
    setRecoveryCode(newCode);

    if (element.value !== '' && element.nextElementSibling) {
      (element.nextElementSibling as HTMLInputElement).focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !recoveryCode[index] && e.currentTarget.previousElementSibling) {
      (e.currentTarget.previousElementSibling as HTMLInputElement).focus();
    }
  };

  const handleNewPasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('settings.passwordFlow.errorMismatch'));
      return;
    }
    if (hasFirebaseSession()) {
      // Signed-in account: the password lives in Firebase Authentication.
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        setError(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} خانات على الأقل`);
        return;
      }
      try {
        await changeOwnPassword(newPassword);
      } catch (err) {
        setError(authErrorMessage(err));
        return;
      }
    } else {
      // Native app without an account: device-only password.
      await setDeletePassword(newPassword);
    }
    
    // Also sync the owner's AuthContext if they are currently logged in with this session? Not strictly necessary.
    // The "Delete Password" essentially IS the Owner Password now.
    
    setSuccess(t('settings.passwordFlow.success'));
    
    setTimeout(() => {
      handleClose();
      // Optional: force a reload if you want to ensure session consistency, 
      // but setDeletePassword already updates local state and global users.
    }, 1500);
  };



  const handleLandlordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(currentPassword)) {
      setNewLandlordName(getLandlordName());
      setView('changeLandlord_new');
      setError('');
    } else {
      setError(t('settings.passwordFlow.errorIncorrect'));
    }
  };

  const handleContractAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(currentPassword)) {
      setShowContractInfo(true);
      setView('main');
      setCurrentPassword('');
      setError('');
    } else {
      setError(t('settings.passwordFlow.errorIncorrect'));
    }
  };

  const handleNewLandlordNameSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLandlordName.trim()) return;
    setLandlordName(newLandlordName.trim());
    setSuccess(t('settings.landlordFlow.success'));
    setTimeout(() => {
      handleClose();
    }, 1500);
  };

  const handleWorkerAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(currentPassword)) {
      handleClose();
      navigate('/worker-management');
      setError('');
    } else {
      setError(t('settings.passwordFlow.errorIncorrect'));
    }
  };



  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(currentPassword)) {
      setNewEmail(user?.email || '');
      setView('changeEmail_new');
      setError('');
    } else {
      setError(t('settings.passwordFlow.errorIncorrect'));
    }
  };

  const handleNewEmailSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToSave = newEmail.trim();
    if (!emailToSave) return;
    
    try {
      if (!hasFirebaseSession()) {
        setError('خطأ: لم يتم العثور على هوية المستخدم');
        return;
      }
      const { verificationSent } = await changeOwnEmail(emailToSave);

      // Update the cached session so the new email shows immediately.
      const session = localStorage.getItem('rentals_active_session');
      if (session) {
        const parsed = JSON.parse(session);
        parsed.email = emailToSave;
        localStorage.setItem('rentals_active_session', JSON.stringify(parsed));
      }

      const message = verificationSent
        ? 'تم حفظ البريد ✅ أرسلنا رسالة تأكيد إلى البريد الجديد؛ بعد الضغط على الرابط يمكنك استخدامه لاستعادة كلمة المرور.'
        : 'تم حفظ البريد الإلكتروني بنجاح ✅';
      setSuccess(message);
      alert(message);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error('Email save failed:', err);
      setError(authErrorMessage(err));
    }
  };

  const handleExportData = async () => {
    const dataStr = exportAllData();
    const fileName = `property_tracking_backup_${formatDateForInput(new Date())}.json`;

    if (Capacitor.isNativePlatform()) {
      try {
        // Write file to cache
        const result = await Filesystem.writeFile({
          path: fileName,
          data: dataStr,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        // Share the file
        await Share.share({
          title: t('settings.data.export'),
          files: [result.uri],
        });

        setSuccess(t('settings.data.exportSuccess'));
      } catch (e) {
        console.error('Export failed:', e);
        setError('Export failed: ' + (e as any).message);
      }
    } else {
      // Web fallback
      try {
        const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        setSuccess(t('settings.data.exportSuccess'));
      } catch (e: any) {
        setError('Export failed: ' + e.message);
      }
    }
  };

  const handleImportClick = () => {
    if (window.confirm(t('settings.data.importConfirm'))) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (importAllData(content)) {
        setSuccess(t('settings.data.importSuccess'));
        setTimeout(() => {
          window.location.reload(); // Reload to reflect changes
        }, 1500);
      } else {
        setError(t('settings.data.importError'));
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    e.target.value = '';
  };


  const renderBackButton = (targetView: View) => (
    <button onClick={() => { setView(targetView); setError(''); setCurrentPassword(''); }} className="absolute top-6 left-6 rtl:right-6 rtl:left-auto text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 transform rtl:scale-x-[-1]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
    </button>
  );

  return (
    <>
      <Modal
        isOpen={isDeleteTenantPasswordOpen}
        onClose={() => {
          setIsDeleteTenantPasswordOpen(false);
          setDataPassword('');
          setDeleteTenantPasswordError('');
        }}
        title={t('buildingPage.secretCode')}
      >
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300 text-sm mb-4">
            الرجاء إدخال الرقم السري لتفعيل زر الحذف للمستأجر المفسوخ.
          </p>
          <input
            type="password"
            value={dataPassword}
            onChange={(e) => {
              setDataPassword(e.target.value);
              setDeleteTenantPasswordError('');
            }}
            placeholder={t('buildingPage.secretCode')}
            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                if (await verifyPassword(dataPassword)) {
                  setShowDeleteTerminatedTenant(true);
                  setIsDeleteTenantPasswordOpen(false);
                  setDataPassword('');
                  setDeleteTenantPasswordError('');
                } else {
                  setDeleteTenantPasswordError(t('deleteBuildingModal.incorrectPasswordError'));
                }
              }
            }}
          />
          {deleteTenantPasswordError && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-100/50 dark:bg-red-900/20 p-2 rounded-lg text-center font-bold">
              {deleteTenantPasswordError}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => { setIsDeleteTenantPasswordOpen(false); setDataPassword(''); setDeleteTenantPasswordError(''); }} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2.5 rounded-xl font-bold">{t('addBuildingModal.cancel')}</button>
            <button onClick={async () => {
              if (await verifyPassword(dataPassword)) {
                setShowDeleteTerminatedTenant(true);
                setIsDeleteTenantPasswordOpen(false);
                setDataPassword('');
                setDeleteTenantPasswordError('');
              } else {
                setDeleteTenantPasswordError(t('deleteBuildingModal.incorrectPasswordError'));
              }
            }} className="bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold">{t('addBuildingModal.save')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isOpen} onClose={handleClose} title={t('settings.title')}>
      {success && <div className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 p-3 rounded-md mb-4 text-center">{success}</div>}

      {/* Main View */}
      {view === 'main' && (
        <div className="space-y-5">
          {/* Theme & Language in one row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">{t('settings.theme.label')}</p>
              <div className="flex gap-2">
                <button onClick={() => setTheme('light')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold transition-colors ${theme === 'light' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                  <SunIcon />{t('settings.theme.light')}
                </button>
                <button onClick={() => setTheme('dark')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold transition-colors ${theme === 'dark' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                  <MoonIcon />{t('settings.theme.dark')}
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">{t('settings.language.label')}</p>
              <div className="flex gap-2">
                <button onClick={() => setLanguage('ar')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${language === 'ar' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>{t('settings.language.ar')}</button>
                <button onClick={() => setLanguage('en')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${language === 'en' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>{t('settings.language.en')}</button>
              </div>
            </div>
          </div>

          {isInstallable && (
            <button onClick={handleInstallClick} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3.5 rounded-2xl text-base flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
              {t('settings.installApp')}
            </button>
          )}

          {!isNative && user && canGetOverdueAlerts && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-amber-500 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                  <div>
                    <span className="block text-sm font-bold text-amber-800 dark:text-amber-300">إشعارات الدفعات والعقود</span>
                    <span className="block text-[11px] text-amber-700/80 dark:text-amber-400/80">كل صباح الساعة 9 على هذا الجهاز</span>
                  </div>
                </div>
                <label className={`relative flex-shrink-0 select-none ${pushBusy ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="sr-only" checked={pushStatus === 'enabled'} disabled={pushBusy} onChange={handlePushToggle} />
                  <div className={`block w-12 h-7 rounded-full transition-colors ${pushStatus === 'enabled' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${pushStatus === 'enabled' ? 'transform translate-x-5' : ''}`}></div>
                </label>
              </div>
              {pushStatus === 'enabled' && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {([
                    ['overdue', 'الدفعات المتأخرة'],
                    ['today', 'المستحقة اليوم'],
                    ['upcoming', 'القادمة خلال 3 أيام'],
                    ['contracts', 'العقود قريبة الانتهاء'],
                  ] as [keyof PushPrefs, string][]).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-white/60 dark:bg-slate-800/50 rounded-lg px-2 py-1.5 cursor-pointer">
                      <input type="checkbox" checked={pushPrefs[key]} onChange={() => togglePref(key)} className="accent-amber-500 w-4 h-4" />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              {(pushNote || (pushStatus !== 'enabled' && pushStatus !== 'off')) && (
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{pushNote || pushStatusMessage(pushStatus)}</p>
              )}
            </div>
          )}

          {user?.role === 'owner' && (
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-red-500 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                <span className="text-sm font-bold text-red-700 dark:text-red-400">إظهار زر حذف المستأجر المفسوخ</span>
              </div>
              <label className="relative cursor-pointer flex-shrink-0 select-none">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={showDeleteTerminatedTenant}
                  onChange={() => {
                    if (showDeleteTerminatedTenant) {
                      setShowDeleteTerminatedTenant(false);
                    } else {
                      setIsDeleteTenantPasswordOpen(true);
                    }
                  }}
                />
                <div className={`block w-12 h-7 rounded-full transition-colors ${showDeleteTerminatedTenant ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${showDeleteTerminatedTenant ? 'transform translate-x-5' : ''}`}></div>
              </label>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-700" />

          {(isNative || user?.role === 'owner') && (
            <div className="space-y-2">
              {versionClickCount >= 5 && (
                <div onClick={() => setView('data_management')} className="px-4 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl cursor-pointer flex justify-between items-center group transition-colors">
                  <div className="flex items-center gap-3 text-base font-medium text-slate-700 dark:text-slate-200"><DataIcon /><span>{t('settings.data.label')}</span></div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400 rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </div>
              )}
              <div onClick={() => setView('changePassword_auth')} className="px-4 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl cursor-pointer flex justify-between items-center transition-colors">
                <span className="text-base font-medium text-slate-700 dark:text-slate-200">{t('settings.passwordFlow.changeTitle')}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400 rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </div>
              <div onClick={() => setView('changeEmail_auth')} className="px-4 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl cursor-pointer flex justify-between items-center transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-700 dark:text-slate-200">البريد الإلكتروني</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full mt-1 inline-block ${user?.email ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                      {user?.email ? 'مفعّل ✅' : 'غير محدد'}
                    </span>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400 rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </div>
              <div onClick={() => setView('changeLandlord_auth')} className="px-4 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl cursor-pointer flex justify-between items-center transition-colors">
                <span className="text-base font-medium text-slate-700 dark:text-slate-200">{t('settings.landlordFlow.changeTitle')}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400 rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </div>
              <div onClick={() => { handleClose(); navigate('/worker-management'); }} className="px-4 py-3.5 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-2xl cursor-pointer flex justify-between items-center border border-indigo-100 dark:border-indigo-800 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 dark:bg-indigo-800 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                  </div>
                  <span className="text-base font-bold text-indigo-700 dark:text-indigo-300">إدارة حسابات العمال</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-indigo-400 rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-700" />

          {(isNative || user?.role === 'owner') && (
            <div onClick={() => { if (showContractInfo) { setShowContractInfo(false); } else { setView('showContract_auth'); } }} className="px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl cursor-pointer flex justify-between items-center">
              <span className={`text-sm ${showContractInfo ? 'text-blue-600 font-bold' : ''}`}>{showContractInfo ? t('settings.contractInfo.hide') : t('settings.contractInfo.show')}</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d={showContractInfo ? "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" : "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"} /></svg>
            </div>
          )}

          <div onClick={() => setVersionClickCount(prev => prev + 1)} className="text-center text-xs text-slate-400 dark:text-slate-600 font-mono cursor-pointer select-none pt-1">
            Version 1.1.52
          </div>
        </div>
      )}

      {/* Data Management View */}
      {view === 'data_management' && (
        <div className="relative">
          {renderBackButton('main')}
          <h3 className="text-lg font-medium text-center mb-6">{t('settings.data.title')}</h3>

          <div className="space-y-4">
            <button onClick={handleExportData} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span className="text-lg font-medium">{t('settings.data.export')}</span>
            </button>

            <button onClick={handleImportClick} className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 py-4 rounded-xl border-dashed border-2 border-slate-300 dark:border-slate-500 transition-colors flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-lg font-medium">{t('settings.data.import')}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
            {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
          </div>
        </div>
      )}

      {/* Worker Management - Step 1: Auth */}
      {view === 'workerManagement_auth' && (
        <div className="relative text-center p-4">
          {renderBackButton('main')}
          <div className="flex justify-center mb-4">
            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-4 rounded-3xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-indigo-600 dark:text-indigo-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">إدارة العمال</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">أدخل كلمة مرور المالك للمتابعة</p>
          <form onSubmit={handleWorkerAuth} className="space-y-4">
            <input 
              type="password" 
              placeholder="كلمة المرور" 
              value={currentPassword} 
              onChange={e => setCurrentPassword(e.target.value)} 
              required 
              className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-bold text-lg" 
            />
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-600/40 transition-all active:scale-95 flex items-center justify-center gap-2">
              <span>دخول</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Change Email - Step 1: Auth */}
      {view === 'changeEmail_auth' && (
        <div className="relative text-center p-4">
          {renderBackButton('main')}
          <div className="flex justify-center mb-4">
            <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-3xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-red-600 dark:text-red-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">تغيير البريد الإلكتروني</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">يجب إدخال كلمة المرور لتغيير البريد</p>
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <input 
              type="password" 
              placeholder="كلمة المرور الحالية" 
              value={currentPassword} 
              onChange={e => setCurrentPassword(e.target.value)} 
              required 
              className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-center font-bold text-lg" 
            />
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <button type="submit" className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-red-500/30 hover:bg-red-700 transition-all flex items-center justify-center gap-2">
              التالي
            </button>
          </form>
        </div>
      )}

      {/* Change Email - Step 2: New Email */}
      {view === 'changeEmail_new' && (
        <div className="relative text-center p-4">
          {renderBackButton('changeEmail_auth')}
          <div className="flex justify-center mb-4">
            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-4 rounded-3xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-indigo-600 dark:text-indigo-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">البريد الجديد</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">أدخل عنوان البريد الإلكتروني الجديد</p>
          <form onSubmit={handleNewEmailSave} className="space-y-4">
            <input 
              type="email" 
              placeholder="example@mail.com" 
              value={newEmail} 
              onChange={e => setNewEmail(e.target.value)} 
              required 
              className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-bold text-lg" 
            />
            <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
              حفظ البريد الجديد
            </button>
          </form>
        </div>
      )}

      {/* Change Password - Step 1: Auth */}
      {view === 'changePassword_auth' && (
        <div className="relative text-center p-4">
          {renderBackButton('main')}
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-3xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-blue-600 dark:text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">{t('settings.passwordFlow.authTitle')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">{t('settings.passwordFlow.authMessage')}</p>
          <form onSubmit={handlePasswordAuth} className="space-y-4">
            <input 
              type="password" 
              placeholder={t('settings.passwordFlow.currentPassword')} 
              value={currentPassword} 
              onChange={e => setCurrentPassword(e.target.value)} 
              required 
              className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-lg" 
            />
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <button type="button" onClick={() => { setView('forgotPassword_email'); setError(''); }} className="text-sm text-blue-600 font-bold hover:underline mb-2 block">{t('settings.passwordFlow.forgotLink')}</button>
            <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transition-all active:scale-95 flex items-center justify-center gap-2">
              <span>{t('settings.buttons.next')}</span>
            </button>
          </form>
        </div>
      )}

      {/* Forgot Password - Step 1: Email */}
      {view === 'forgotPassword_email' && (
        <div className="relative text-center p-4">
          {renderBackButton('changePassword_auth')}
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-3xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-blue-600 dark:text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">نسيت كلمة المرور؟</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">أدخل البريد الإلكتروني المسجل وسنرسل لك رابطاً لتعيين كلمة مرور جديدة</p>
          
          <form onSubmit={handleStartRecovery} className="space-y-5">
            <input 
              type="email" 
              placeholder="البريد الإلكتروني" 
              value={recoveryEmail} 
              onChange={e => setRecoveryEmail(e.target.value)} 
              required 
              className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 text-center font-bold" 
            />
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            {success && <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold leading-relaxed">{success}</p>}
            <button type="submit" disabled={isLoading} className={`w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg ${isLoading ? 'opacity-50' : ''}`}>
              {isLoading ? 'جاري الإرسال...' : 'إرسال رابط استعادة كلمة المرور'}
            </button>
          </form>
        </div>
      )}

      {/* Forgot Password - Step 2: OTP */}
      {view === 'forgotPassword_otp' && (
        <div className="relative text-center p-4">
          {renderBackButton('forgotPassword_email')}
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-5 rounded-full text-blue-600 dark:text-blue-400">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">أدخل رمز التحقق</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">تم إرسال الرمز إلى {recoveryEmail}</p>
          
          <form onSubmit={handleVerifyCode} className="space-y-8">
            <div className="flex justify-between gap-2" dir="ltr">
              {recoveryCode.map((data, index) => (
                <input
                  key={index}
                  type="text"
                  maxLength={1}
                  value={data}
                  onChange={e => handleCodeChange(e.target, index)}
                  onKeyDown={e => handleKeyDown(e, index)}
                  className="w-10 h-12 border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xl font-black text-center focus:border-blue-500 outline-none"
                />
              ))}
            </div>
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">تأكيد الرمز</button>
          </form>
        </div>
      )}

      {/* Change/Forgot Password - Step 2: Set New */}

      {view === 'changePassword_new' && (
        <div className="relative text-center p-4">
          {renderBackButton('changePassword_auth')}
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-3xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-blue-600 dark:text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">{t('settings.passwordFlow.newTitle')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">{t('settings.passwordFlow.authMessage')}</p>
          
          <form onSubmit={handleNewPasswordSave} className="space-y-4">
            <div className="space-y-3">
              <input 
                type="password" 
                placeholder={t('settings.passwordFlow.newPassword')} 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                required 
                className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold" 
              />
              <input 
                type="password" 
                placeholder={t('settings.passwordFlow.confirmPassword')} 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required 
                className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold" 
              />
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold animate-shake">
                {error}
              </div>
            )}
            
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('settings.buttons.save')}
            </button>
          </form>
        </div>
      )}



      {/* Show Contract Info - Auth */}
      {view === 'showContract_auth' && (
        <div className="relative">
          {renderBackButton('main')}
          <h3 className="text-lg font-medium text-center mb-4">{t('settings.contractInfo.authTitle')}</h3>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-4">{t('settings.passwordFlow.authMessage')}</p>
          <form onSubmit={handleContractAuth} className="space-y-4">
            <input type="password" placeholder={t('settings.passwordFlow.currentPassword')} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="button" onClick={() => { setView('forgotPassword_email'); setError(''); }} className="text-sm text-blue-600 hover:underline">{t('settings.passwordFlow.forgotLink')}</button>
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md">{t('settings.buttons.next')}</button>
          </form>
        </div>
      )}

      {/* Change Landlord Name - Step 1: Auth */}
      {view === 'changeLandlord_auth' && (
        <div className="relative">
          {renderBackButton('main')}
          <h3 className="text-lg font-medium text-center mb-4">{t('settings.passwordFlow.authTitle')}</h3>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-4">{t('settings.landlordFlow.authMessage')}</p>
          <form onSubmit={handleLandlordAuth} className="space-y-4">
            <input type="password" placeholder={t('settings.passwordFlow.currentPassword')} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="button" onClick={() => { setView('forgotPassword_email'); setError(''); }} className="text-sm text-blue-600 hover:underline">{t('settings.passwordFlow.forgotLink')}</button>
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md">{t('settings.buttons.next')}</button>
          </form>
        </div>
      )}

      {/* Change Landlord Name - Step 2: Set New */}
      {view === 'changeLandlord_new' && (
        <div className="relative">
          {renderBackButton('main')}
          <h3 className="text-lg font-medium text-center mb-4">{t('settings.landlordFlow.changeTitle')}</h3>
          <form onSubmit={handleNewLandlordNameSave} className="space-y-4">
            <input type="text" placeholder={t('settings.landlordFlow.newName')} value={newLandlordName} onChange={e => setNewLandlordName(e.target.value)} required className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md">{t('settings.buttons.save')}</button>
          </form>
        </div>
      )}





    </Modal>
    </>
  );
};

export default SettingsModal;