import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../hooks/useTranslation';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200 transition-colors duration-300 relative bg-transparent">
      <div className="container mx-auto p-4 max-w-4xl animate-fade-in">
        {children}
      </div>
    </div>
  );
};

export default Layout;