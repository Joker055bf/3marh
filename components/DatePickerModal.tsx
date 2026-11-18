import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';

interface DatePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (date: Date) => void;
    initialDate?: Date;
    title?: string;
}


interface YearListProps {
    years: number[];
    selectedYear: number;
    onSelect: (year: number) => void;
    onBack: () => void;
}

const YearList: React.FC<YearListProps> = ({ years, selectedYear, onSelect, onBack }) => {
    const selectedRef = React.useRef<HTMLButtonElement>(null);

    useEffect(() => {
        // Small timeout to ensure layout is ready
        const timer = setTimeout(() => {
            selectedRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex flex-col gap-2 w-full h-full bg-slate-700 text-white relative z-10">
            <button
                onClick={onBack}
                className="w-full text-center py-3 text-sm text-teal-400 font-bold border-b border-slate-600 hover:bg-slate-600 shrink-0"
            >
                &uarr; العودة للتقويم (Back)
            </button>
            <div className="flex flex-col items-center gap-2 overflow-y-auto w-full h-64 p-2">
                {years.map(year => (
                    <button
                        key={year}
                        ref={year === selectedYear ? selectedRef : null}
                        onClick={() => onSelect(year)}
                        className={`
                            text-lg font-medium w-full text-center py-3 rounded-md shrink-0 block
                            ${year === selectedYear
                                ? 'text-2xl font-bold text-teal-400 bg-slate-800 border border-teal-500'
                                : 'text-slate-300 hover:text-white hover:bg-slate-600 bg-slate-700'}
                        `}
                    >
                        {year}
                    </button>
                ))}
            </div>
        </div>
    );
};

const DatePickerModal: React.FC<DatePickerModalProps> = ({ isOpen, onClose, onSelect, initialDate, title }) => {
    const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date());
    const [viewDate, setViewDate] = useState<Date>(initialDate || new Date());
    const [viewMode, setViewMode] = useState<'date' | 'year'>('date');

    useEffect(() => {
        if (isOpen) {
            const d = initialDate ? new Date(initialDate) : new Date();
            // Reset hours to avoid timezone issues affecting the stored date string
            d.setHours(12, 0, 0, 0);
            setSelectedDate(d);
            setViewDate(d);
        }
    }, [isOpen, initialDate]);

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

    const getDayName = (date: Date) => new Intl.DateTimeFormat('ar-SA', { weekday: 'long', calendar: 'gregory' }).format(date);
    const getMonthName = (date: Date) => new Intl.DateTimeFormat('ar-SA', { month: 'long', calendar: 'gregory' }).format(date);

    // Arabic locales can be tricky with short names, so we might want manual ones if 'ar-SA' isn't perfect.
    // But let's try Intl first. 'ar-SA' usually formats well.

    const handleDaySelect = (day: number) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day, 12, 0, 0, 0);
        setSelectedDate(newDate);
    };

    const handleMonthChange = (offset: number) => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
    };

    const handleYearChange = (offset: number) => {
        setViewDate(new Date(viewDate.getFullYear() + offset, viewDate.getMonth(), 1));
    };

    const handleYearSelect = (year: number) => {
        setViewDate(new Date(year, viewDate.getMonth(), 1));
        setViewMode('date');
    };

    const handleConfirm = () => {
        onSelect(selectedDate);
        onClose();
    };

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const totalDays = daysInMonth(year, month);
        const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday

        // Standard Arabic calendar usually starts on Sunday or Saturday?
        // In React/JS: 0=Sun. 
        // In the screenshot: Right to Left.
        // If we render standard RTL grid, flex-wrap, 7 cols.
        // We need to match the days correctly.
        // Let's use standard Sat-Fri or Sun-Sat based on locale?
        // Let's stick to standard 0-6 (Sun-Sat) and let CSS direction: rtl handle the order if needed.
        // Screenshot shows: Rightmost col is likely Sunday ('أ' for Ahad?).

        const blanks = Array(firstDay).fill(null);
        const days = Array.from({ length: totalDays }, (_, i) => i + 1);

        const weekDays = ['أ', 'إ', 'ث', 'ر', 'خ', 'ج', 'س']; // Ahad, Ithnayn, Thulatha, Arbi'a, Khamis, Jumu'a, Sabt?
        // Wait, standard order: Sun, Mon, Tue, Wed, Thu, Fri, Sat.
        // Arabic: الأحد, الإثنين, الثلاثاء, الأربعاء, الخميس, الجمعة, السبت
        // Initials: 
        // Sun: ح or أ
        // Mon: ن or إ
        // Tue: ث
        // Wed: ر or أ
        // Thu: خ
        // Fri: ج
        // Sat: س

        // Using simple initials to match likely design
        const weekHeaders = ['أ', 'إ', 'ث', 'ر', 'خ', 'ج', 'س']; // Sun -> Sat

        return (
            <div className="text-white" style={{ direction: 'rtl' }}>
                <div className="grid grid-cols-7 mb-2 text-center text-slate-400 text-sm">
                    {weekHeaders.map((d, i) => <div key={i}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                    {blanks.map((_, i) => <div key={`blank-${i}`} />)}
                    {days.map(d => {
                        const isSelected =
                            selectedDate.getDate() === d &&
                            selectedDate.getMonth() === month &&
                            selectedDate.getFullYear() === year;

                        return (
                            <div
                                key={d}
                                onClick={() => handleDaySelect(d)}
                                className={`
                  w-8 h-8 flex items-center justify-center rounded-full cursor-pointer mx-auto text-sm
                  ${isSelected ? 'bg-teal-400 text-slate-900 font-bold' : 'hover:bg-slate-600 text-slate-200'}
                `}
                            >
                                {d}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 50;
        const endYear = currentYear + 50;
        return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
    }, []);

    // renderYears logic moved to YearList component


    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-700 rounded-xl overflow-hidden shadow-2xl w-full max-w-sm relative z-[10000]">
                {/* Header */}
                <div className="bg-slate-600 p-4 border-b border-slate-500">
                    <div
                        onClick={() => setViewMode(prev => prev === 'year' ? 'date' : 'year')}
                        className={`text-sm font-medium mb-1 text-right cursor-pointer transition-colors flex items-center justify-end gap-1 ${viewMode === 'year' ? 'text-teal-400 font-bold' : 'text-slate-300 hover:text-teal-200'}`}
                    >
                        <span>{selectedDate.getFullYear()}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform ${viewMode === 'year' ? 'rotate-180' : ''}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </div>
                    <div
                        onClick={() => setViewMode('date')}
                        className={`text-3xl font-bold text-right cursor-pointer transition-colors ${viewMode === 'date' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        {getDayName(selectedDate)}، {selectedDate.getDate()} {getMonthName(selectedDate)}
                    </div>
                </div>

                {/* Body */}
                <div className="p-4 bg-slate-700" style={{ minHeight: '300px' }}>
                    {/* Month Navigation (Only in Date Mode) */}
                    {viewMode === 'date' && (
                        <div className="flex justify-between items-center mb-4 px-2 text-white" style={{ direction: 'rtl' }}>
                            <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-slate-600 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                            </button>
                            <div onClick={() => setViewMode('year')} className="font-bold text-lg cursor-pointer hover:text-teal-400 transition-colors">
                                {getMonthName(viewDate)} {viewDate.getFullYear()}
                            </div>
                            <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-slate-600 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {viewMode === 'date' ? renderCalendar() : (
                        <YearList
                            years={years}
                            selectedYear={viewDate.getFullYear()}
                            onSelect={handleYearSelect}
                            onBack={() => setViewMode('date')}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-4 p-4 bg-slate-700 relative z-20">
                    <button onClick={onClose} className="text-teal-400 font-bold text-sm px-4 py-2 hover:bg-slate-600 rounded-md">
                        إلغاء
                    </button>
                    <button onClick={handleConfirm} className="text-teal-400 font-bold text-sm px-4 py-2 hover:bg-slate-600 rounded-md">
                        تعيين
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default DatePickerModal;
