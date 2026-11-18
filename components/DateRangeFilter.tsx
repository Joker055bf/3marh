import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { formatDateForInput, formatDateForDisplayPadded, parseDate } from '../utils/dateUtils';
import DatePickerModal from './DatePickerModal';
import { useState } from 'react';

interface DateRangeFilterProps {
    fromDate: string;
    toDate: string;
    onFromDateChange: (date: string) => void;
    onToDateChange: (date: string) => void;
    onClear?: () => void;
}

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
    fromDate,
    toDate,
    onFromDateChange,
    onToDateChange,
    onClear,
}) => {
    const { t } = useTranslation();

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [activeDateField, setActiveDateField] = useState<'from' | 'to' | null>(null);

    const [activeQuick, setActiveQuick] = useState<'day' | 'week' | 'month' | 'year' | null>(null);

    const handleQuickFilter = (type: 'day' | 'week' | 'month' | 'year') => {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);

        switch (type) {
            case 'day':
                break;
            case 'week': {
                // Saturday-based week (local convention)
                const offset = (now.getDay() + 1) % 7;
                start.setDate(now.getDate() - offset);
                break;
            }
            case 'month':
                start.setDate(1);
                end.setDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
                break;
            case 'year':
                start.setMonth(0, 1);
                end.setMonth(11, 31);
                break;
        }

        setActiveQuick(type);
        onFromDateChange(formatDateForInput(start));
        onToDateChange(formatDateForInput(end));
    };

    const openDatePicker = (field: 'from' | 'to') => {
        setActiveDateField(field);
        setShowDatePicker(true);
    };

    const handleDateSelect = (date: Date) => {
        setActiveQuick(null);
        if (activeDateField === 'from') {
            onFromDateChange(formatDateForInput(date));
        } else if (activeDateField === 'to') {
            onToDateChange(formatDateForInput(date));
        }
        setShowDatePicker(false);
        setActiveDateField(null);
    };

    const from = parseDate(fromDate);
    const to = parseDate(toDate);
    const isInvalidRange = !!from && !!to && from.getTime() > to.getTime();

    return (
        <div className="bg-slate-50 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            {/* Date Inputs Row */}
            <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-1 flex-1">
                    <span className="text-slate-500 dark:text-slate-400 text-xs font-bold whitespace-nowrap">{t('dateFilter.from')}</span>
                    <div
                        onClick={() => openDatePicker('from')}
                        className="bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-1 flex items-center gap-1 w-full cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        <span className={`w-full text-xs text-center font-medium ${fromDate ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'} h-6 flex items-center justify-center`} style={{ fontFamily: 'Inter, sans-serif' }}>
                            {fromDate ? formatDateForDisplayPadded(fromDate, '', '/') : t('dateFilter.startDate')}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1 flex-1">
                    <span className="text-slate-500 dark:text-slate-400 text-xs font-bold whitespace-nowrap">{t('dateFilter.to')}</span>
                    <div
                        onClick={() => openDatePicker('to')}
                        className={`bg-white dark:bg-slate-800 rounded-lg border px-2 py-1 flex items-center gap-1 w-full cursor-pointer transition-colors ${isInvalidRange ? 'border-red-400 dark:border-red-600' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        <span className={`w-full text-xs text-center font-medium ${toDate ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'} h-6 flex items-center justify-center`} style={{ fontFamily: 'Inter, sans-serif' }}>
                            {toDate ? formatDateForDisplayPadded(toDate, '', '/') : t('dateFilter.endDate')}
                        </span>
                    </div>
                </div>

                {onClear && (fromDate || toDate) && (
                    <button
                        onClick={() => {
                            setActiveQuick(null);
                            onClear?.();
                        }}
                        className="text-red-500 hover:text-red-700 p-1.5 transition-colors bg-red-50 dark:bg-red-900/30 rounded-lg flex-shrink-0"
                        title={t('dateFilter.clear')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}

            </div>

            {isInvalidRange && (
                <p className="text-[10px] font-bold text-red-500 dark:text-red-400 mt-2 text-center">{t('dateFilter.invalidRange')}</p>
            )}

            {/* Quick Filters Row */}
            <div className="flex justify-between gap-2 overflow-x-auto pb-0.5 no-scrollbar mt-3">
                {(['day', 'week', 'month', 'year'] as const).map(type => (
                    <button
                        key={type}
                        onClick={() => handleQuickFilter(type)}
                        className={`flex-1 text-xs py-2 px-3 rounded-lg transition-all duration-200 font-bold whitespace-nowrap active:scale-95 ${
                            activeQuick === type
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-blue-400 text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        {t(`dateFilter.${type}`)}
                    </button>
                ))}
            </div>

            <DatePickerModal
                isOpen={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                onSelect={handleDateSelect}
                initialDate={activeDateField === 'from' && fromDate ? parseDate(fromDate) : (activeDateField === 'to' && toDate ? parseDate(toDate) : undefined)}
                title={activeDateField === 'from' ? t('dateFilter.modalStartTitle') : t('dateFilter.modalEndTitle')}
            />
        </div>
    );
};

export default DateRangeFilter;
