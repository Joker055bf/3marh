import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { getPaymentsByBuilding, getExpenses, getTenantByFlatNo, getTenantsByBuilding, findTenantForPayment, cleanFlatNo, isPaymentActiveAndValid } from '../services/dbService';
import { Payment, Tenant } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { parseDate, formatDateForDisplay, formatDateForUi, formatDateForDisplayPadded } from '../utils/dateUtils';
import { createRoot } from 'react-dom/client';
import { SettingsProvider } from '../contexts/SettingsContext';
import PrintableReport from '../components/PrintableReport';
import DateRangeFilter from '../components/DateRangeFilter';
import Modal from '../components/Modal';
import { shareFile } from '../utils/shareUtils';
import { Capacitor } from '@capacitor/core';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { usePermissions } from '../hooks/usePermissions';
import AccessDenied from '../components/AccessDenied';

interface ReportTransaction {
    id: string;
    date: string;
    amount: number;
    kind: 'rent' | 'expense';
    label: string;
    detail: string;
}

interface DueRow {
    id: string;
    date: string;
    amount: number;
    label: string;
    detail: string;
    status: 'paid' | 'partial' | 'unpaid';
    paidAmount: number;
}

type CardKey = 'due' | 'paid' | 'expenses';

const RentalsReportPage: React.FC = () => {
    const { buildingName } = useParams<{ buildingName: string }>();
    const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : '';
    const { t } = useTranslation();
    const { can, canAccessBuilding } = usePermissions();
    const canViewReports = can('canViewReports');

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const [reportData, setReportData] = useState({
        totalDue: 0,
        totalPaid: 0,
        totalExpenses: 0,
        netIncome: 0,
    });
    const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
    const [dueRows, setDueRows] = useState<DueRow[]>([]);
    const [hasDateRange, setHasDateRange] = useState(false);
    const [selectedCard, setSelectedCard] = useState<CardKey | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

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
        if (!decodedBuildingName) return;

        const from = parseDate(fromDate);
        const to = parseDate(toDate);
        setHasDateRange(!!from && !!to);
        setSelectedCard(null);
        setIsDetailOpen(false);

        if (!from || !to) {
            setReportData({ totalDue: 0, totalPaid: 0, totalExpenses: 0, netIncome: 0 });
            setTransactions([]);
            setDueRows([]);
            return;
        }

        const allPayments = getPaymentsByBuilding(decodedBuildingName);
        const allExpenses = getExpenses(decodedBuildingName);
        const allTenants = getTenantsByBuilding(decodedBuildingName);

        const inRange = (dateStr: string) => {
            const d = parseDate(dateStr);
            if (!d) return false;
            return d >= from && d <= to;
        };

        const getReceipts = (p: Payment): { amount: number; date: string }[] => {
            const history = (p.partialHistory || []).filter(h => h && h.amount > 0 && parseDate(h.date));
            if (history.length > 0) return history;
            const received = p.isPaid ? p.amount : (p.paidAmount || 0);
            if (received > 0) return [{ amount: received, date: p.dueDate }];
            return [];
        };

        const tenantLabel = (flatNo: string) => {
            const tnt = findTenantForPayment(allTenants, flatNo);
            return tnt?.name || `${t('paymentsPage.flat')} ${cleanFlatNo(flatNo)}`;
        };

        const due: DueRow[] = allPayments
            .filter(p => inRange(p.dueDate) && isPaymentActiveAndValid(p, undefined, allTenants))
            .map(p => ({
                id: p.id,
                date: p.dueDate,
                amount: p.amount,
                label: tenantLabel(p.tenantFlatNo),
                detail: `${t('paymentsPage.flat')} ${cleanFlatNo(p.tenantFlatNo)} - ${t('paymentsPage.payment')} ${p.paymentNo}`,
                status: p.isPaid ? 'paid' : ((p.paidAmount || 0) > 0 ? 'partial' : 'unpaid') as DueRow['status'],
                paidAmount: p.isPaid ? p.amount : (p.paidAmount || 0),
            }))
            .sort((a, b) => (parseDate(a.date)?.getTime() || 0) - (parseDate(b.date)?.getTime() || 0));

        const rows: ReportTransaction[] = [];

        allPayments.forEach(p => {
            if (!isPaymentActiveAndValid(p, undefined, allTenants)) return;
            getReceipts(p).forEach((r, idx) => {
                if (!inRange(r.date)) return;
                rows.push({
                    id: `${p.id}-${idx}`,
                    date: r.date,
                    amount: r.amount,
                    kind: 'rent',
                    label: tenantLabel(p.tenantFlatNo),
                    detail: `${t('paymentsPage.flat')} ${cleanFlatNo(p.tenantFlatNo)} - ${t('paymentsPage.payment')} ${p.paymentNo}`,
                });
            });
        });

        allExpenses.forEach(e => {
            if (!inRange(e.date)) return;
            rows.push({
                id: e.id,
                date: e.date,
                amount: e.amount,
                kind: 'expense',
                label: e.note || t('rentalsReportPage.typeExpense'),
                detail: '',
            });
        });

        rows.sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0));

        const totalDue = due.reduce((sum, r) => sum + r.amount, 0);
        const totalExpenses = rows.filter(r => r.kind === 'expense').reduce((sum, r) => sum + r.amount, 0);
        const totalPaid = rows.filter(r => r.kind === 'rent').reduce((sum, r) => sum + r.amount, 0);

        setReportData({ totalDue, totalPaid, totalExpenses, netIncome: totalPaid - totalExpenses });
        setTransactions(rows);
        setDueRows(due);
    }, [decodedBuildingName, fromDate, toDate]);

    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

    const emptyState = (
        <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-6">
            {t('rentalsReportPage.noTransactions')}
        </div>
    );

    const renderPrintTransactions = () => {
        if (transactions.length === 0) {
            return <div style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem 0' }}>{t('rentalsReportPage.noTransactions')}</div>;
        }

        const cellStyle: React.CSSProperties = { padding: '10px', fontSize: '0.9rem', borderBottom: '1px solid #e2e8f0' };

        return (
            <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>{t('rentalsReportPage.transactionsTitle')}</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f1f5f9' }}>
                            {[t('rentalsReportPage.colDate'), t('rentalsReportPage.colDescription'), t('rentalsReportPage.colType'), t('rentalsReportPage.colAmount')].map(h => (
                                <th key={h} style={{ padding: '10px', fontSize: '0.9rem', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(row => (
                            <tr key={row.id}>
                                <td style={{ ...cellStyle, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{formatDateForDisplayPadded(row.date, '', '-')}</td>
                                <td style={cellStyle}>{row.label}</td>
                                <td style={{ ...cellStyle, color: row.kind === 'rent' ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                                    {row.kind === 'rent' ? t('rentalsReportPage.typeRent') : t('rentalsReportPage.typeExpense')}
                                    {row.detail && <div style={{ fontWeight: 'normal', color: '#64748b', fontSize: '0.8rem' }}>{row.detail}</div>}
                                </td>
                                <td style={{ ...cellStyle, fontWeight: 'bold', fontFamily: 'Inter, sans-serif', color: row.kind === 'rent' ? '#16a34a' : '#dc2626' }}>
                                    {row.amount.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const statusLabels: Record<DueRow['status'], { text: string; cls: string }> = {
        paid: { text: t('printableReport.statusPaid'), cls: 'text-green-600 dark:text-green-400' },
        partial: { text: t('paymentsPage.partiallyPaid'), cls: 'text-orange-500' },
        unpaid: { text: t('printableReport.statusUnpaid'), cls: 'text-red-600 dark:text-red-400' },
    };

    const cardViews: Record<CardKey, { title: string; rows: any[] }> = {
        due: {
            title: t('rentalsReportPage.totalDue'),
            rows: dueRows.map(r => ({
                key: r.id,
                date: r.date,
                title: r.label,
                subtitle: r.detail,
                amount: r.amount,
                tone: 'text-blue-600 dark:text-blue-400',
                badge: statusLabels[r.status],
            })),
        },
        paid: {
            title: t('rentalsReportPage.totalPaid'),
            rows: transactions.filter(r => r.kind === 'rent').map(r => ({
                key: r.id,
                date: r.date,
                title: r.label,
                subtitle: r.detail,
                amount: r.amount,
                tone: 'text-green-600 dark:text-green-400',
                sign: '+',
            })),
        },
        expenses: {
            title: t('rentalsReportPage.totalExpenses'),
            rows: transactions.filter(r => r.kind === 'expense').map(r => ({
                key: r.id,
                date: r.date,
                title: r.label,
                subtitle: t('rentalsReportPage.typeExpense'),
                amount: r.amount,
                tone: 'text-red-600 dark:text-red-400',
                sign: '-',
            })),
        },
    };

    const activeView = selectedCard ? cardViews[selectedCard] : null;

    const renderRows = (rows: any[]) => {
        if (rows.length === 0) return emptyState;

        return (
            <div className="overflow-auto max-h-[55vh] -mx-2 px-2">
                <table className="w-full text-right text-sm">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-700">
                            <th className="py-2 px-2 font-bold whitespace-nowrap">{t('rentalsReportPage.colDate')}</th>
                            <th className="py-2 px-2 font-bold">{t('rentalsReportPage.colDescription')}</th>
                            <th className="py-2 px-2 font-bold whitespace-nowrap">{t('rentalsReportPage.colAmount')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row: any) => (
                            <tr key={row.key} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0">
                                <td className="py-2.5 px-2 text-xs text-slate-500 dark:text-slate-400 font-inter whitespace-nowrap align-top">
                                    {formatDateForDisplayPadded(row.date, '', '-')}
                                </td>
                                <td className="py-2.5 px-2">
                                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{row.title}</p>
                                    <p className={`text-[11px] font-medium ${row.badge ? row.badge.cls : row.tone}`}>
                                        {row.badge ? row.badge.text : row.subtitle}
                                    </p>
                                </td>
                                <td dir="ltr" className={`py-2.5 px-2 font-bold font-inter whitespace-nowrap align-top ${row.tone}`}>
                                    {row.sign || ''}{row.amount.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const handleCardClick = (key: CardKey) => {
        if (!hasDateRange) return;
        if (selectedCard === key) {
            setIsDetailOpen(true);
        } else {
            setSelectedCard(key);
        }
    };

    const combinedRows = transactions.map(r => ({
        key: r.id,
        date: r.date,
        title: r.label,
        subtitle: `${r.kind === 'rent' ? t('rentalsReportPage.typeRent') : t('rentalsReportPage.typeExpense')}${r.detail ? ` · ${r.detail}` : ''}`,
        amount: r.amount,
        tone: r.kind === 'rent' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
        sign: r.kind === 'rent' ? '+' : '-',
    }));

    const handleShareReport = async () => {
        if (!fromDate || !toDate) {
            setIsErrorModalOpen(true);
            return;
        }

        setIsSharing(true);


        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = '800px';
        document.body.appendChild(container);

        const root = createRoot(container);

        root.render(
            <SettingsProvider>
                <PrintableReport
                    buildingName={decodedBuildingName}
                    reportTitle={t('printableReport.rentalsReportTitle')}
                    subtitle={`${t('rentalsReportPage.from')} ${formatDateForUi(fromDate, '', '-')} ${t('rentalsReportPage.to')} ${formatDateForUi(toDate, '', '-')}`}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', textAlign: 'center' }}>
                        <div style={{ padding: '1.5rem', borderRadius: '0.5rem', backgroundColor: '#e0f2fe' }}>
                            <h3 style={{ fontSize: '1.125rem', color: '#64748b' }}>{t('rentalsReportPage.totalDue')}</h3>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0284c7', fontFamily: 'Inter, sans-serif' }}>{reportData.totalDue.toFixed(2)}</p>
                        </div>
                        <div style={{ padding: '1.5rem', borderRadius: '0.5rem', backgroundColor: '#dcfce7' }}>
                            <h3 style={{ fontSize: '1.125rem', color: '#64748b' }}>{t('rentalsReportPage.totalPaid')}</h3>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a', fontFamily: 'Inter, sans-serif' }}>{reportData.totalPaid.toFixed(2)}</p>
                        </div>
                        <div style={{ padding: '1.5rem', borderRadius: '0.5rem', backgroundColor: '#fee2e2' }}>
                            <h3 style={{ fontSize: '1.125rem', color: '#64748b' }}>{t('rentalsReportPage.totalExpenses')}</h3>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626', fontFamily: 'Inter, sans-serif' }}>{reportData.totalExpenses.toFixed(2)}</p>
                        </div>
                        <div style={{ padding: '1.5rem', borderRadius: '0.5rem', backgroundColor: '#dbeafe' }}>
                            <h3 style={{ fontSize: '1.125rem', color: '#64748b' }}>{t('rentalsReportPage.netIncome')}</h3>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e3a8a', fontFamily: 'Inter, sans-serif' }}>{reportData.netIncome.toFixed(2)}</p>
                        </div>
                    </div>
                    {renderPrintTransactions()}
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
            const fileName = `${t('rentalsReportPage.shareReportTitle')} - ${decodedBuildingName}.pdf`;

            if (Capacitor.isNativePlatform()) {
                try {
                    await shareFile(pdfBlob, fileName, t('rentalsReportPage.shareReportTitle'));
                    return;
                } catch (error) {
                    console.error('Native share failed:', error);
                    // Fallback to default behavior if native share fails
                }
            }

            const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

            if (navigator.share && !Capacitor.isNativePlatform()) {
                try {
                    await navigator.share({
                        files: [pdfFile],
                        title: t('rentalsReportPage.shareReportTitle'),
                    });
                    return;
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        return; // User cancelled share
                    }
                    console.error('Sharing failed, falling back:', error);
                }
            }

            // Fallback for browsers that don't support sharing or if sharing fails
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


    if (!canViewReports || !canAccessBuilding(decodedBuildingName)) {
        return (
            <Layout>
                <Header title={`${t('rentalsReportPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />
                <AccessDenied backTo={`/${buildingName}`} />
            </Layout>
        );
    }

    const kpiCards: { key: CardKey; label: string; value: number; accent: string; icon: React.ReactNode }[] = [
        {
            key: 'due',
            label: t('rentalsReportPage.totalDue'),
            value: reportData.totalDue,
            accent: 'from-sky-500 to-blue-600',
            icon: (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M8 6h8a2 2 0 012 2v11a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2z" />
            ),
        },
        {
            key: 'paid',
            label: t('rentalsReportPage.totalPaid'),
            value: reportData.totalPaid,
            accent: 'from-emerald-500 to-green-600',
            icon: (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            ),
        },
        {
            key: 'expenses',
            label: t('rentalsReportPage.totalExpenses'),
            value: reportData.totalExpenses,
            accent: 'from-rose-500 to-red-600',
            icon: (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            ),
        },
    ];

    return (
        <Layout>
            <Header title={`${t('rentalsReportPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-4">
                <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                    <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                    </span>
                    <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t('rentalsReportPage.periodSectionTitle')}</h2>
                </div>
                <div className="px-4 pb-4">
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
                    <button onClick={handleShareReport} disabled={isSharing} className={`mt-2 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 text-sm font-bold shadow-md shadow-blue-500/20 active:scale-[0.98] ${isSharing ? 'opacity-70 cursor-not-allowed' : ''}`}>
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
                                    {t('rentalsReportPage.shareReport')}
                                </>
                            )}
                        </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {kpiCards.map(card => {
                    const isSelected = selectedCard === card.key;
                    return (
                        <button
                            key={card.key}
                            type="button"
                            onClick={() => handleCardClick(card.key)}
                            disabled={!hasDateRange}
                            className={`relative text-right bg-white dark:bg-slate-800 rounded-2xl p-3.5 transition-all duration-200 border ${
                                isSelected
                                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/15 ring-1 ring-indigo-500/40'
                                    : 'border-slate-100 dark:border-slate-700 shadow-sm'
                            } ${hasDateRange ? 'active:scale-[0.97] cursor-pointer' : 'opacity-55 cursor-not-allowed'}`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${card.accent} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        {card.icon}
                                    </svg>
                                </span>
                                <h3 className="text-[11px] leading-tight font-bold text-slate-500 dark:text-slate-400">{card.label}</h3>
                            </div>
                            <p className={`text-xl font-black font-inter ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                                {card.value.toFixed(2)}
                            </p>
                            <p className={`mt-1 text-[10px] font-bold ${isSelected ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-500'}`}>
                                {isSelected ? t('rentalsReportPage.tapAgainForTable') : t('rentalsReportPage.tapForTable')}
                            </p>
                        </button>
                    );
                })}

                <div className="bg-slate-900 dark:bg-slate-700 rounded-2xl p-3.5 text-white shadow-md">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5m4.5 4.5V9" />
                            </svg>
                        </span>
                        <h3 className="text-[11px] leading-tight font-bold text-white/75">{t('rentalsReportPage.netIncome')}</h3>
                    </div>
                    <p className={`text-xl font-black font-inter ${reportData.netIncome < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                        {reportData.netIncome.toFixed(2)}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-white/50">{t('rentalsReportPage.netIncomeHint')}</p>
                </div>
            </div>

            <div className="mt-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t('rentalsReportPage.transactionsTitle')}</h3>
                    <span className="text-[11px] font-black text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full font-inter">{transactions.length}</span>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3 font-inter">
                    {hasDateRange
                        ? `${formatDateForDisplayPadded(fromDate, '', '-')} — ${formatDateForDisplayPadded(toDate, '', '-')}`
                        : t('rentalsReportPage.datesRequired')}
                </p>
                {hasDateRange ? renderRows(combinedRows) : (
                    <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-6">
                        {t('rentalsReportPage.selectRangeFirst')}
                    </div>
                )}
            </div>

            <Modal
                isOpen={isDetailOpen && !!activeView}
                onClose={() => setIsDetailOpen(false)}
                title={activeView?.title || ''}
            >
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3 font-inter">
                    {`${t('rentalsReportPage.from')} ${formatDateForDisplayPadded(fromDate, '', '-')} ${t('rentalsReportPage.to')} ${formatDateForDisplayPadded(toDate, '', '-')}`}
                </p>
                {activeView && renderRows(activeView.rows)}
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
        </Layout>
    );
};

export default RentalsReportPage;