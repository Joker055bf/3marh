import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  backTo?: string;
}

const BackArrowIcon: React.FC = () => {
  const { language } = useTranslation();
  const isRTL = language === 'ar';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      {isRTL ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75" />
      )}
    </svg>
  );
};


const Header: React.FC<HeaderProps> = ({ title, showBackButton = false, backTo = '..' }) => {
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        // give it a bit of a buffer, scrollWidth > clientWidth means it's overflowing
        const isCurrentlyOverflowing = textRef.current.scrollWidth > containerRef.current.clientWidth + 2; 
        setIsOverflowing(isCurrentlyOverflowing);
        if (isCurrentlyOverflowing) {
            const extraWidth = textRef.current.scrollWidth - containerRef.current.clientWidth + 30; // 30px buffer
            textRef.current.style.setProperty('--scroll-amount', `${extraWidth}px`);
        } else {
            textRef.current.style.removeProperty('--scroll-amount');
        }
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [title]);

  return (
    <header className="sticky top-2 z-40 flex items-center justify-between px-4 py-3 glass mb-6 rounded-2xl shadow-sm transition-all duration-300">
      <div className="flex-none w-12 flex justify-start">
        {showBackButton && (
          <button
            onClick={() => navigate(backTo)}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
            aria-label={t('header.back')}
          >
            <BackArrowIcon />
          </button>
        )}
      </div>

      <div ref={containerRef} className="flex-grow px-2 overflow-hidden flex justify-center items-center">
        <h1 
            ref={textRef} 
            className={`text-xl font-bold text-slate-800 dark:text-white whitespace-nowrap ${isOverflowing ? (language === 'ar' ? 'scrolling-title-rtl' : 'scrolling-title-ltr') : 'truncate'}`}
        >
          {title}
        </h1>
      </div>

      <div className="flex-none w-12"></div>
    </header>
  );
};

export default Header;