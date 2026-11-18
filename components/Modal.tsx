import React, { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed top-0 left-0 w-full h-[100dvh] z-[100] overflow-y-auto" onClick={onClose} dir="rtl">
      {/* Container that takes at least full height to allow vertical centering, with padding so it never touches the edges */}
      <div className="flex min-h-full items-center justify-center p-4 py-16 sm:p-6">
        
        {/* Background overlay */}
        <div className="fixed top-0 left-0 w-full h-[100dvh] bg-slate-900/50 backdrop-blur-sm transition-opacity" aria-hidden="true" />

        {/* Modal panel */}
        <div 
          className="relative w-full max-w-md transform rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-2xl transition-all animate-scale-in border border-slate-100 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{title}</h2>
            <button type="button" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;