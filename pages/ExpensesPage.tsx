import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { getExpenses, addExpense, deleteExpense } from '../services/dbService';
import { Expense } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { formatDateForInput, formatDateForDisplay, formatDateForUi, formatDateForDisplayPadded, parseDate } from '../utils/dateUtils';
import { createRoot } from 'react-dom/client';
import { SettingsProvider } from '../contexts/SettingsContext';
import PrintableReport from '../components/PrintableReport';
import { shareFile } from '../utils/shareUtils';
import { Capacitor } from '@capacitor/core';
import DateRangeFilter from '../components/DateRangeFilter';
import DatePickerModal from '../components/DatePickerModal';
import AccessDenied from '../components/AccessDenied';
import { usePermissions } from '../hooks/usePermissions';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const ExpensesPage: React.FC = () => {
    const { buildingName } = useParams<{ buildingName: string }>();
    const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : '';
    const { t } = useTranslation();
    const { isOwner, can, canAccessBuilding } = usePermissions();
    const canViewExpenses = can('canViewExpenses');

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [newExpense, setNewExpense] = useState({ amount: '', note: '', date: formatDateForInput(new Date()) });
    const [forceUpdate, setForceUpdate] = useState(0);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const [isShareFallbackOpen, setShareFallbackOpen] = useState(false);
    const [shareableFile, setShareableFile] = useState<{ blob: Blob; name: string } | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isShareFallbackOpen && shareableFile) {
            const url = URL.createObjectURL(shareableFile.blob);
            setDownloadUrl(url);
            return () => {
                URL.revokeObjectURL(url);
                setDownloadUrl(null);
            };
        }
    }, [isShareFallbackOpen, shareableFile]);

    useEffect(() => {
        const allExpenses = getExpenses(decodedBuildingName);

        const from = parseDate(fromDate);
        const to = parseDate(toDate);

        if (!from || !to) {
            setExpenses(allExpenses);
            return;
        }

        const filteredExpenses = allExpenses.filter(e => {
            const expenseDate = parseDate(e.date);
            return expenseDate && expenseDate >= from && expenseDate <= to;
        });

        setExpenses(filteredExpenses);
    }, [decodedBuildingName, forceUpdate, fromDate, toDate]);

    const handleAddExpense = () => {
        if (!newExpense.amount || !newExpense.note.trim() || !newExpense.date || !(Number(newExpense.amount) > 0)) {
            alert(t('expensesPage.fillAllFields'));
            return;
        }
        addExpense({ building: decodedBuildingName, amount: Number(newExpense.amount), note: newExpense.note, date: newExpense.date });
        setIsModalOpen(false);
        setNewExpense({ amount: '', note: '', date: formatDateForInput(new Date()) });
        setForceUpdate(f => f + 1);
    };

    const handleDateSelect = (date: Date) => {
        const formatted = formatDateForInput(date);
        setNewExpense(prev => ({ ...prev, date: formatted }));
        setShowDatePicker(false);
    };

    const promptDelete = (expense: Expense) => {
        setExpenseToDelete(expense);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (expenseToDelete) {
            deleteExpense(expenseToDelete.id);
            setIsDeleteModalOpen(false);
            setExpenseToDelete(null);
            setForceUpdate(f => f + 1);
        }
    };

    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

    const handleShareReport = async () => {
        if (!fromDate || !toDate) {
            setIsErrorModalOpen(true);
            return;
        }

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = '800px';
        document.body.appendChild(container);

        const root = createRoot(container);

        const headerStyle: React.CSSProperties = {
            padding: '0.75rem',
            textAlign: 'right',
            backgroundColor: '#f3f4f6',
            fontWeight: 'bold',
            borderBottom: '1px solid #ddd',
        };

        const cellStyle: React.CSSProperties = {
            padding: '0.75rem',
            textAlign: 'right',
            borderBottom: '1px solid #ddd',
            verticalAlign: 'middle',
        };

        root.render(
            <SettingsProvider>
                <PrintableReport
                    buildingName={decodedBuildingName}
                    reportTitle={t('printableReport.expensesReportTitle')}
                    subtitle={`${t('expensesPage.from')} ${formatDateForUi(fromDate, '', '-')} ${t('expensesPage.to')} ${formatDateForUi(toDate, '', '-')}`}
                >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                        <thead>
                            <tr>
                                <th style={headerStyle}>{t('expensesPage.date')}</th>
                                <th style={headerStyle}>{t('expensesPage.note')}</th>
                                <th style={{ ...headerStyle, fontFamily: 'Inter, sans-serif' }}>{t('expensesPage.amount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.map((expense) => (
                                <tr key={expense.id}>
                                    <td style={{ ...cellStyle, fontFamily: 'Inter, sans-serif' }}>{formatDateForUi(expense.date, '', '-')}</td>
                                    <td style={cellStyle}>{expense.note}</td>
                                    <td style={{ ...cellStyle, fontFamily: 'Inter, sans-serif' }}>{expense.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ fontWeight: 'bold' }}>
                                <td colSpan={2} style={{ ...cellStyle, textAlign: 'left', borderBottom: 'none' }}>{t('expensesPage.total')}</td>
                                <td style={{ ...cellStyle, fontFamily: 'Inter, sans-serif', borderBottom: 'none' }}>{totalExpenses.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </PrintableReport>
            </SettingsProvider>
        );

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const canvas = await html2canvas(container.firstChild as HTMLElement, { scale: 2, useCORS: true });

            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);

            const pdfBlob = pdf.output('blob');
            const fileName = `${t('expensesPage.shareReportTitle')} - ${decodedBuildingName}.pdf`;

            if (Capacitor.isNativePlatform()) {
                try {
                    await shareFile(pdfBlob, fileName, t('expensesPage.shareReportTitle'));
                    return;
                } catch (error) {
                    console.error('Native share failed:', error);
                }
            }

            const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

            if (navigator.share && !Capacitor.isNativePlatform()) {
                try {
                    await navigator.share({
                        files: [pdfFile],
                        title: t('expensesPage.shareReportTitle'),
                    });
                    return;
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        return;
                    }
                    console.error('Sharing failed, falling back:', error);
                }
            }

            setShareableFile({ blob: pdfBlob, name: fileName });
            setShareFallbackOpen(true);

        } catch (err) {
            console.error('Failed to generate report for sharing:', err);
            alert(t('share.generationError'));
        } finally {
            setIsSharing(false);
            root.unmount();
            document.body.removeChild(container);
        }
    };

    if (!canViewExpenses || !canAccessBuilding(decodedBuildingName)) {
        return (
            <Layout>
                <Header title={`${t('expensesPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />
                <AccessDenied backTo={`/${buildingName}`} />
            </Layout>
        );
    }

    return (
        <Layout>
            <Header title={`${t('expensesPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 mb-4">
                <DateRangeFilter
                    fromDate={fromDate}
                    toDate={toDate}
                    onFromDateChange={setFromDate}
                    onToDateChange={setToDate}
                    onClear={() => {
                        setFromDate('');
                        setToDate('');
                    }}
                />
                {isOwner && (
                    <div className="flex flex-wrap gap-2 mt-4">
                        <button onClick={() => setIsModalOpen(true)} className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-5 py-2.5 rounded-xl shadow-md shadow-green-500/20 transition-all duration-200 text-sm font-bold active:scale-[0.98]">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            {t('expensesPage.add')}
                        </button>
                        <button onClick={handleShareReport} disabled={isSharing} className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all duration-200 text-sm font-bold active:scale-[0.98] ${isSharing ? 'opacity-70 cursor-not-allowed' : ''}`}>
                            {isSharing ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    {t('share.processing')}
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                    </svg>
                                    {t('expensesPage.shareReport')}
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {expenses.length > 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                        <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t('expensesPage.total')}</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full">{expenses.length}</span>
                            <span className="text-base font-black text-rose-600 dark:text-rose-400 font-inter">{totalExpenses.toFixed(2)}</span>
                        </div>
                    </div>
                    <table className="w-full text-start">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                            <tr>
                                <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-300 text-right">{t('expensesPage.date')}</th>
                                <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-300">{t('expensesPage.note')}</th>
                                <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-300 text-left">{t('expensesPage.amount')}</th>
                                {isOwner && <th className="p-3 w-16"></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {expenses.map((expense) => (
                                <tr key={expense.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="p-3 text-sm text-slate-600 dark:text-slate-300 font-inter whitespace-nowrap text-right" style={{ direction: 'ltr' }}>{formatDateForDisplayPadded(expense.date, '', '/')}</td>
                                    <td className="p-3 text-sm text-slate-800 dark:text-slate-200">{expense.note}</td>
                                    <td className="p-3 text-sm font-bold text-slate-900 dark:text-slate-100 font-inter text-left">{expense.amount.toFixed(2)}</td>
                                    {isOwner && (
                                        <td className="p-3 text-sm text-left">
                                            <button onClick={() => promptDelete(expense)} className="text-red-500 hover:text-red-700 font-medium transition-colors">
                                                {t('expensesPage.delete')}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-14 px-6 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <p className="text-4xl mb-3">🧾</p>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">{t('expensesPage.noExpenses')}</p>
                    {isOwner && (
                        <button onClick={() => setIsModalOpen(true)} className="mt-4 text-blue-600 dark:text-blue-400 hover:underline font-bold">
                            {t('expensesPage.addNew')}
                        </button>
                    )}
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('expensesPage.addModalTitle')}>
                <div className="space-y-4">
                    <div>
                        <label className="block mb-1">{t('expensesPage.date')}</label>
                        <div className="relative" style={{ direction: 'ltr' }}>
                            <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none z-10">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18" />
                                </svg>
                            </div>
                            <div
                                onClick={() => setShowDatePicker(true)}
                                className="w-full p-2 text-left ps-10 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 cursor-pointer"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                {formatDateForDisplayPadded(newExpense.date, '', '/')}
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block mb-1">{t('expensesPage.note')}</label>
                        <input type="text" value={newExpense.note} onChange={e => setNewExpense(p => ({ ...p, note: e.target.value }))} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200" />
                    </div>
                    <div>
                        <label className="block mb-1">{t('expensesPage.amount')}</label>
                        <input type="number" value={newExpense.amount} onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200" />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setIsModalOpen(false)} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2.5 rounded-2xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">{t('expensesPage.cancel')}</button>
                        <button onClick={handleAddExpense} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-2xl font-bold shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 active:scale-95 transition-all duration-300">{t('expensesPage.add')}</button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title={t('expensesPage.deleteModalTitle')}
            >
                <div className="space-y-4">
                    <p className="text-slate-700 dark:text-slate-300">
                        {t('expensesPage.deleteModalMessage')}
                    </p>
                    {expenseToDelete && (
                        <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-md text-slate-900 dark:text-slate-200">
                            <p><span className="font-semibold">{t('expensesPage.date')}:</span> <span style={{ direction: 'ltr' }} className="inline-block">{expenseToDelete.date}</span></p>
                            <p><span className="font-semibold">{t('expensesPage.note')}:</span> {expenseToDelete.note}</p>
                            <p><span className="font-semibold">{t('expensesPage.amount')}:</span> {expenseToDelete.amount.toFixed(2)}</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2.5 rounded-2xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">{t('expensesPage.cancel')}</button>
                        <button type="button" onClick={handleConfirmDelete} className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-5 py-2.5 rounded-2xl font-bold shadow-lg shadow-red-500/30 hover:-translate-y-0.5 active:scale-95 transition-all duration-300">{t('expensesPage.delete')}</button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isShareFallbackOpen}
                onClose={() => setShareFallbackOpen(false)}
                title={t('share.fallbackTitle')}
            >
                <div className="text-center space-y-4">
                    <p>{t('share.fallbackMessage1')}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('share.fallbackMessage2')}</p>
                    {downloadUrl && shareableFile && (
                        <a
                            href={downloadUrl}
                            download={shareableFile.name}
                            onClick={() => setTimeout(() => setShareFallbackOpen(false), 300)}
                            className="inline-block w-full bg-blue-600 text-white px-6 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 mt-4"
                        >
                            {t('share.downloadButton')}
                        </a>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={isErrorModalOpen}
                onClose={() => setIsErrorModalOpen(false)}
                title={t('rentalsReportPage.validationErrorTitle')}
            >
                <div className="text-center space-y-4">
                    <p className="text-slate-700 dark:text-slate-300 text-lg">
                        {t('rentalsReportPage.datesRequired')}
                    </p>
                    <div className="flex justify-center mt-6">
                        <button
                            onClick={() => setIsErrorModalOpen(false)}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {t('settings.buttons.back')}
                        </button>
                    </div>
                </div>
            </Modal>

            <DatePickerModal
                isOpen={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                onSelect={handleDateSelect}
                initialDate={newExpense.date ? parseDate(newExpense.date) || undefined : undefined}
            />
        </Layout>
    );
};

export default ExpensesPage;