import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { setLandlordName, setDeletePassword, markSetupComplete } from '../services/dbService';

interface SetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const SetupModal: React.FC<SetupModalProps> = ({ isOpen, onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [landlordName, setLandlordNameState] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleLandlordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!landlordName.trim()) {
      setError(t('setupModal.error.nameRequired'));
      return;
    }
    setLandlordName(landlordName.trim());
    setError('');
    setStep(2);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
        setError(t('setupModal.error.passwordRequired'));
        return;
    }
    if (password !== confirmPassword) {
      setError(t('setupModal.error.passwordMismatch'));
      return;
    }
    setDeletePassword(password);
    markSetupComplete();
    onComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-md m-4">
        {step === 1 && (
          <form onSubmit={handleLandlordSubmit}>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center mb-2">{t('setupModal.title')}</h2>
            <p className="text-center text-slate-600 dark:text-slate-400 mb-6">{t('setupModal.welcome')}</p>
            <div className="space-y-4">
              <div>
                <label htmlFor="landlordName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('setupModal.landlordNameLabel')}
                </label>
                <input
                  type="text"
                  id="landlordName"
                  value={landlordName}
                  onChange={(e) => setLandlordNameState(e.target.value)}
                  required
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors">
                {t('setupModal.nextButton')}
              </button>
            </div>
          </form>
        )}
        {step === 2 && (
          <form onSubmit={handlePasswordSubmit}>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center mb-6">{t('setupModal.passwordTitle')}</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('setupModal.passwordLabel')}
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('setupModal.confirmPasswordLabel')}
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors">
                {t('setupModal.finishButton')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SetupModal;
