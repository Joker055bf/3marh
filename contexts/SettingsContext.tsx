import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';

type Theme = 'light' | 'dark';
type Language = 'ar' | 'en';

interface SettingsContextProps {
  theme: Theme;
  language: Language;
  showContractInfo: boolean;
  showDeleteTerminatedTenant: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setShowContractInfo: (show: boolean) => void;
  setShowDeleteTerminatedTenant: (show: boolean) => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('rentals_theme') as Theme) || 'light');
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem('rentals_language') as Language) || 'ar');

  const [showContractInfo, setShowContractInfoState] = useState<boolean>(false);
  const [showDeleteTerminatedTenant, setShowDeleteTerminatedTenantState] = useState<boolean>(false);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('rentals_theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.lang = language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('rentals_language', language);
  }, [language]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage);
  };

  const setShowContractInfo = (show: boolean) => {
    setShowContractInfoState(show);
  };

  const setShowDeleteTerminatedTenant = (show: boolean) => {
    setShowDeleteTerminatedTenantState(show);
  };

  return (
    <SettingsContext.Provider value={{ theme, language, showContractInfo, showDeleteTerminatedTenant, setTheme, setLanguage, setShowContractInfo, setShowDeleteTerminatedTenant }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextProps => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};