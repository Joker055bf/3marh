import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { setLandlordName } from '../services/dbService';
import { signIn, registerOwner, requestPasswordReset, authErrorMessage, MIN_PASSWORD_LENGTH } from '../services/authService';

const LoginPage: React.FC = () => {
  const [view, setView] = useState<'login' | 'forgot_email'>('login');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [landlordName, setLandlordNameState] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  // Forgot Password States
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const { t } = useTranslation();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('auth.errorRequired'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (isRegisterMode) {
        if (password !== confirmPassword) {
          setError(t('setupModal.error.passwordMismatch'));
          return;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} خانات على الأقل`);
          return;
        }
        if (!landlordName.trim()) {
          setError(t('setupModal.error.nameRequired'));
          return;
        }
        const account = await registerOwner(username.trim(), password, email.trim());
        await login(account);
        setLandlordName(landlordName.trim());
      } else {
        const account = await signIn(username.trim(), password);
        await login(account);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Firebase emails a secure reset link; the code never passes through the browser.
  const handleStartRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await requestPasswordReset(recoveryEmail);
      setResetSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const renderLoginForm = () => (
    <div className="animate-fade-in">
      <h2 className="text-3xl font-black mb-2 bg-gradient-to-l from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
        {isRegisterMode ? 'إنشاء حساب مالك' : t('auth.loginTitle')}
      </h2>
      {isRegisterMode ? (
        <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">
          قم بإعداد حسابك كمالك عقار وابدأ الآن
        </p>
      ) : (
        <div className="mb-6" />
      )}

      <form onSubmit={handleAuth} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t('auth.username')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 rtl:right-0 rtl:left-auto pl-3 rtl:pr-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 rtl:pr-10 rtl:pl-4 p-3.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder={t('auth.username')}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t('auth.password')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 rtl:right-0 rtl:left-auto pl-3 rtl:pr-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 rtl:pr-10 rtl:pl-4 p-3.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder={t('auth.password')}
            />
          </div>
          {!isRegisterMode && (
            <button
              type="button"
              onClick={() => { setView('forgot_email'); setError(''); }}
              className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline block w-full text-right rtl:text-right"
            >
              نسيت كلمة المرور؟
            </button>
          )}
        </div>

        {isRegisterMode && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('setupModal.confirmPasswordLabel')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 rtl:right-0 rtl:left-auto pl-3 rtl:pr-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('setupModal.confirmPasswordLabel')}
                  className="w-full pl-10 rtl:pr-10 rtl:pl-4 p-3.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 rtl:right-0 rtl:left-auto pl-3 rtl:pr-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 rtl:pr-10 rtl:pl-4 p-3.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="example@mail.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('setupModal.landlordNameLabel')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 rtl:right-0 rtl:left-auto pl-3 rtl:pr-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={landlordName}
                  onChange={(e) => setLandlordNameState(e.target.value)}
                  placeholder={t('setupModal.landlordNameLabel')}
                  className="w-full pl-10 rtl:pr-10 rtl:pl-4 p-3.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-start gap-2 animate-shake">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 px-4 rounded-2xl shadow-lg transition-all text-lg mt-2 flex justify-center items-center gap-2 ${isLoading ? 'opacity-70 cursor-wait' : 'shadow-blue-500/40 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 active:scale-[0.98]'}`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {isRegisterMode ? 'جاري إنشاء الحساب...' : 'جاري تسجيل الدخول...'}
            </>
          ) : (
            isRegisterMode ? 'إنشاء حساب جديد' : t('auth.loginButton')
          )}
        </button>
      </form>

      <div className="mt-7 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          {isRegisterMode ? 'لديك حساب مسجل مسبقاً؟' : 'مستخدم جديد؟'}{' '}
          <button
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setError('');
            }}
            className="text-blue-600 dark:text-blue-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-extrabold transition-colors underline-offset-4 hover:underline focus:outline-none"
          >
            {isRegisterMode ? 'سجل دخولك من هنا' : 'قم بإنشاء حساب جديد الآن'}
          </button>
        </p>
      </div>
    </div>
  );

  const renderForgotEmail = () => (
    <div className="animate-fade-in">
      <button onClick={() => { setView('login'); setRecoveryEmail(''); setResetSent(false); setError(''); }} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors font-bold">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        رجوع لتسجيل الدخول
      </button>
      <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">نسيت كلمة المرور؟</h2>
      <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">أدخل البريد الإلكتروني المسجل في حسابك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة</p>
      
      {resetSent ? (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm font-medium leading-relaxed">
          إذا كان هذا البريد مسجلاً لدينا، ستصلك رسالة خلال دقائق تحتوي على رابط لتعيين كلمة مرور جديدة. تحقق أيضاً من مجلد الرسائل غير المرغوب فيها.
        </div>
      ) : (
      <form onSubmit={handleStartRecovery} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">البريد الإلكتروني المسجل</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 rtl:right-0 rtl:left-auto pl-3 rtl:pr-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <input
              type="email"
              value={recoveryEmail}
              onChange={e => setRecoveryEmail(e.target.value)}
              required
              className="w-full pl-10 rtl:pr-10 rtl:pl-4 p-3.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="example@mail.com"
            />
          </div>
        </div>
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-start gap-2 animate-shake">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        <button type="submit" disabled={isLoading} className={`w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all ${isLoading ? 'opacity-50' : ''}`}>
          {isLoading ? 'جاري الإرسال...' : 'إرسال رابط استعادة كلمة المرور'}
        </button>
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
          إذا لم يكن لحسابك بريد إلكتروني، تواصل مع الدعم لإعادة تعيين كلمة المرور. حسابات العمال يعيد تعيينها المالك.
        </p>
      </form>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/30 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 transition-colors duration-500 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full" />
      <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] bg-violet-400/5 blur-[80px] rounded-full" />

      <div className="w-full max-w-md z-10">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl p-8 md:p-10 rounded-[2.5rem] shadow-[0_25px_60px_rgba(59,130,246,0.12)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.4)] border border-white/60 dark:border-slate-700/50">
          
          {/* App Icon */}
          <div className="flex justify-center mb-7">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 rounded-3xl blur-xl opacity-40 scale-110" />
              <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 p-4 rounded-3xl shadow-2xl shadow-blue-500/40">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-11 h-11 text-white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
              </div>
            </div>
          </div>

          {view === 'login' && renderLoginForm()}
          {view === 'forgot_email' && renderForgotEmail()}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-6 font-medium">
          تطوير وبرمجة: <span className="text-blue-500 dark:text-blue-400 font-bold">JokeR_β</span>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
