import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';

interface AccessDeniedProps {
    backTo?: string;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ backTo = '..' }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800/60 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8 text-red-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
            </div>
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mb-1">{t('access.deniedTitle')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs leading-relaxed">{t('access.deniedMessage')}</p>
            <button
                onClick={() => navigate(backTo)}
                className="bg-slate-800 dark:bg-slate-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-700 dark:hover:bg-slate-600 active:scale-95 transition-all"
            >
                {t('access.backToApp')}
            </button>
        </div>
    );
};

export default AccessDenied;
