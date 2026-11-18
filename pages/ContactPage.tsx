import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import emailjs from '@emailjs/browser';
import Layout from '../components/Layout';
import { useTranslation } from '../hooks/useTranslation';

const ContactPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useRef<HTMLFormElement>(null);
  
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSending(true);
    setSuccess(null);
    setError(null);

    if (form.current) {
      emailjs
        .sendForm(
          'service_urhagje',    // Gmail Service ID
          'template_kas36sh',   // Contact Form Template ID
          form.current,
          {
            publicKey: 'CscpnAXudUmh_XgeT', // Public Key الصحيح (X كبيرة)
          }
        )
        .then(
          () => {
            setIsSending(false);
            setSuccess(t('contactPage.successMessage'));
            form.current?.reset();
          },
          (err) => {
            setIsSending(false);
            // Fallback: open mailto so the message is never lost
            const formData = new FormData(form.current!);
            const name = formData.get('user_name') as string;
            const email = formData.get('user_email') as string;
            const message = formData.get('message') as string;
            const mailtoLink = `mailto:joker.bo.jd@gmail.com?subject=رسالة من ${encodeURIComponent(name)} - ${encodeURIComponent(email)}&body=${encodeURIComponent(message)}`;
            window.open(mailtoLink, '_blank');
            setSuccess('تم فتح تطبيق البريد لإرسال رسالتك مباشرة');
            form.current?.reset();
            console.error('EmailJS failed, opened mailto fallback:', err.text);
          }
        );
    }
  };

  return (
    <Layout>
      <div className="min-h-screen p-4 flex flex-col items-center justify-center">
        {/* Header */}
        <div className="w-full max-w-md flex items-center mb-6 relative">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-center w-full text-blue-700 dark:text-blue-400">
            {t('contactPage.title')}
          </h1>
        </div>

        {/* Contact Form Card */}
        <div className="glass-card rounded-[2rem] w-full max-w-md overflow-hidden relative animate-scale-in border border-white/60 dark:border-slate-700/60 shadow-2xl p-8">
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm">
              {t('contactPage.description')}
            </p>
          </div>

          {success && (
            <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm font-medium animate-fade-in flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mt-0.5 shrink-0">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm font-medium animate-fade-in flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mt-0.5 shrink-0">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form ref={form} onSubmit={sendEmail} className="space-y-5">
            <div>
              <label htmlFor="user_name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                {t('contactPage.name')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <input
                  type="text"
                  name="user_name"
                  id="user_name"
                  required
                  placeholder={t('contactPage.name')}
                  className="block w-full pl-3 pr-10 py-3 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="user_email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                {t('contactPage.email')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <input
                  type="email"
                  name="user_email"
                  id="user_email"
                  required
                  placeholder={t('contactPage.email')}
                  className="block w-full pl-3 pr-10 py-3 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                {t('contactPage.message')}
              </label>
              <textarea
                name="message"
                id="message"
                required
                rows={4}
                placeholder={t('contactPage.message')}
                className="block w-full p-3 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm resize-none"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={isSending}
              className={`w-full py-3.5 px-4 rounded-xl text-white font-bold text-lg shadow-lg shadow-blue-500/30 transition-all duration-300 flex items-center justify-center gap-2 
                ${isSending ? 'bg-blue-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transform hover:-translate-y-1 active:scale-95 hover:shadow-blue-600/40'}`}
            >
              {isSending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('contactPage.sending')}
                </>
              ) : (
                <>
                  <span>{t('contactPage.send')}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 -rotate-90">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default ContactPage;
