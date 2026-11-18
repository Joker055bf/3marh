import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import Layout from '../components/Layout';
import { getTenantByFlatNo, getPaymentsForTenant, updatePaymentStatus } from '../services/dbService';
import { Tenant, Payment } from '../types';
import PrintableReceipt from '../components/PrintableReceipt';
import PrintableTenantStatement from '../components/PrintableTenantStatement';
import { useTranslation } from '../hooks/useTranslation';
import { parseDate, calculateEndDate, formatDateForDisplayPadded } from '../utils/dateUtils';
import { SettingsProvider } from '../contexts/SettingsContext';
import Modal from '../components/Modal';
import { shareFile } from '../utils/shareUtils';

import { Capacitor } from '@capacitor/core';
import AccessDenied from '../components/AccessDenied';
import { usePermissions } from '../hooks/usePermissions';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const PaymentsPage: React.FC = () => {
    const { buildingName, flatNo } = useParams<{ buildingName: string; flatNo: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : '';
    const { t } = useTranslation();
    const { isOwner, can, canAccessBuilding, canAccessUnit } = usePermissions();
    const canViewPayments = can('canViewPayments');
    const canHandlePayments = isOwner;

    // Determine back link based on source
    const backLink = searchParams.get('from') === 'alerts'
        ? `/${buildingName}?modal=alerts`
        : `/${buildingName}`;

    const [tenant, setTenant] = useState<Tenant | undefined>(undefined);
    const [isLoaded, setIsLoaded] = useState(false);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [forceUpdate, setForceUpdate] = useState(0);

    const [isShareFallbackOpen, setShareFallbackOpen] = useState(false);
    const [shareableFile, setShareableFile] = useState<{ blob: Blob; name: string } | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [isSharing, setIsSharing] = useState(false);

    const [selectedPaymentForModal, setSelectedPaymentForModal] = useState<Payment | null>(null);
    const [showPartialPaymentModal, setShowPartialPaymentModal] = useState(false);
    const [isPartialMode, setIsPartialMode] = useState(false);
    const [partialPaidAmount, setPartialPaidAmount] = useState<string>('');
    const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});

    const toggleParts = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedParts(prev => ({ ...prev, [id]: !prev[id] }));
    };

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
        if (decodedBuildingName && flatNo) {
            setTenant(getTenantByFlatNo(decodedBuildingName, flatNo));
            setPayments(getPaymentsForTenant(decodedBuildingName, flatNo));
        }
        setIsLoaded(true);
    }, [decodedBuildingName, flatNo, forceUpdate]);

    const handleStatusChange = (payment: Payment, isPaid: boolean) => {
        if (isPaid) {
            setSelectedPaymentForModal(payment);
            setShowPartialPaymentModal(true);
            setIsPartialMode(false);
            setPartialPaidAmount('');
        } else {
            // Un-marking erases the recorded amounts and dates for this payment, so ask first.
            const hasRecordedMoney = payment.isPaid || (payment.paidAmount || 0) > 0;
            if (hasRecordedMoney && !window.confirm('إلغاء تسجيل هذه الدفعة؟ سيتم حذف المبالغ المسجلة وتواريخها لهذه الدفعة.')) {
                return;
            }
            updatePaymentStatus(payment.id, false);
            setForceUpdate(f => f + 1);
        }
    };

    const confirmPayment = (isFull: boolean) => {
        if (selectedPaymentForModal) {
            if (isFull) {
                updatePaymentStatus(selectedPaymentForModal.id, true);
            } else {
                const amount = Number(partialPaidAmount);
                if (amount > 0) {
                    const newTotal = (selectedPaymentForModal.paidAmount || 0) + amount;
                    const finalAmount = Math.min(newTotal, selectedPaymentForModal.amount);
                    updatePaymentStatus(selectedPaymentForModal.id, false, finalAmount);
                }
            }
            setForceUpdate(f => f + 1);
        }
        setShowPartialPaymentModal(false);
        setSelectedPaymentForModal(null);
    };

    const handleShareReceipt = async (payment: Payment) => {
        if (isSharing) return;
        setIsSharing(true);
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0px';
        container.style.width = '800px';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'pdf-export-container';
        container.appendChild(contentWrapper);
        document.body.appendChild(container);

        const root = createRoot(contentWrapper);
        root.render(
            <SettingsProvider>
                <PrintableReceipt tenant={tenant} payment={payment} />
            </SettingsProvider>
        );

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const canvas = await html2canvas(contentWrapper, { scale: 2 });
            // const { jsPDF } = window.jspdf; // Removed: using import
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);

            const pdfBlob = pdf.output('blob');
            const fileName = `${tenant?.name}-${t('paymentsPage.shareReceiptTitle')}.pdf`;

            if (Capacitor.isNativePlatform()) {
                try {
                    await shareFile(pdfBlob, fileName, t('paymentsPage.shareReceiptTitle'));
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
                        title: t('paymentsPage.shareReceiptTitle'),
                    });
                    return;
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        return; // User cancelled
                    }
                    console.error('Sharing failed, falling back:', error);
                }
            }

            setShareableFile({ blob: pdfBlob, name: fileName });
            setShareFallbackOpen(true);

        } catch (err) {
            console.error('Failed to generate receipt for sharing:', err);
            alert(t('share.generationError'));
        } finally {
            root.unmount();
            document.body.removeChild(container);
            setIsSharing(false);
        }
    };

    const handleShareStatement = async () => {
        if (isSharing) return;
        setIsSharing(true);
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0px';
        container.style.width = '800px';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'pdf-export-container';
        container.appendChild(contentWrapper);
        document.body.appendChild(container);

        const root = createRoot(contentWrapper);
        if (tenant) {
            const terminationTime = tenant.terminationDate ? parseDate(tenant.terminationDate)?.getTime() : undefined;
            const contractEndTime = tenant.startDate ? parseDate(calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit))?.getTime() : undefined;
            const isCancelled = (payment: Payment) => {
                const dueTime = parseDate(payment.dueDate)?.getTime();
                if (!dueTime) return false;
                if (terminationTime && dueTime >= terminationTime) return true;
                if (contractEndTime && dueTime > contractEndTime) return true;
                return false;
            };
            const currentActivePayments = payments.filter(p => !isCancelled(p));
            const currentTotalDue = currentActivePayments.reduce((sum, p) => sum + p.amount, 0);
            const currentEffectiveAmount = tenant.terminationDate ? currentTotalDue : tenant.amount;

            root.render(
                <SettingsProvider>
                    <PrintableTenantStatement tenant={{ ...tenant, amount: currentEffectiveAmount }} payments={currentActivePayments} />
                </SettingsProvider>
            );
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const canvas = await html2canvas(contentWrapper, { scale: 2 });
            // const { jsPDF } = window.jspdf; // Removed: using import
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);

            const pdfBlob = pdf.output('blob');
            const fileName = `${t('paymentsPage.shareStatementTitle')} - ${tenant?.name}.pdf`;

            if (Capacitor.isNativePlatform()) {
                try {
                    await shareFile(pdfBlob, fileName, t('paymentsPage.shareStatementTitle'));
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
                        title: t('paymentsPage.shareStatementTitle'),
                    });
                    return;
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        return; // User cancelled
                    }
                    console.error('Sharing failed, falling back:', error);
                }
            }

            setShareableFile({ blob: pdfBlob, name: fileName });
            setShareFallbackOpen(true);

        } catch (err) {
            console.error('Failed to generate statement for sharing:', err);
            alert(t('share.generationError'));
        } finally {
            root.unmount();
            document.body.removeChild(container);
            setIsSharing(false);
        }
    };

    if (!canViewPayments || !canAccessBuilding(decodedBuildingName) || !canAccessUnit(decodedBuildingName, flatNo)) {
        return (
            <Layout>
                <AccessDenied backTo={`/${buildingName}`} />
            </Layout>
        );
    }

    if (!tenant) {
        return (
            <Layout>
                <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 rounded-b-2xl mb-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                            <button onClick={() => navigate(backLink)} className="p-1.5 text-slate-500 bg-slate-100 rounded-full flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 rtl:rotate-180 transform">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                            </button>
                            <h1 className="text-lg font-bold text-slate-400">{isLoaded ? t('paymentsPage.tenantNotFound') : t('paymentsPage.loading')}</h1>
                        </div>
                    </div>
                </header>
            </Layout>
        );
    }

    const terminationTime = tenant.terminationDate ? parseDate(tenant.terminationDate)?.getTime() : undefined;
    const contractEndTime = tenant.startDate ? parseDate(calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit))?.getTime() : undefined;
    const isCancelledPayment = (payment: Payment) => {
        const dueTime = parseDate(payment.dueDate)?.getTime();
        if (!dueTime) return false;
        if (terminationTime && dueTime >= terminationTime) return true;
        if (contractEndTime && dueTime > contractEndTime) return true;
        return false;
    };
    const activePayments = payments.filter(p => !isCancelledPayment(p));
    const totalDue = activePayments.reduce((sum, p) => sum + p.amount, 0);
    const totalCollected = activePayments.reduce((sum, p) => sum + (p.isPaid ? p.amount : (p.paidAmount || 0)), 0);
    const collectedPercent = totalDue > 0 ? Math.min(100, (totalCollected / totalDue) * 100) : 0;
    const effectiveRentAmount = tenant.terminationDate ? totalDue : tenant.amount;

    return (
        <Layout>
            {/* Custom Styled Header for Payments */}
            <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 rounded-b-2xl mb-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between px-4 py-3">
                    {/* Right side: Small Back Button + Small Tenant Name */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => navigate(backLink)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors flex items-center justify-center"
                            title="رجوع"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 rtl:rotate-180 transform">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <h1 className="text-sm font-bold text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                            {tenant.name}
                        </h1>
                    </div>

                    {/* Left side: Empty or for future use */}
                    <div className="flex items-center gap-2">
                    </div>
                </div>
            </header>

            <div className="px-4 mb-5">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4">
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div className="bg-slate-50 dark:bg-slate-700/60 rounded-xl py-2.5 border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">{t('paymentsPage.amount')}</p>
                            <p className="text-sm font-black text-slate-800 dark:text-slate-100 font-inter">{effectiveRentAmount.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/60 rounded-xl py-2.5 border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">{t('paymentsPage.dueTotal')}</p>
                            <p className="text-sm font-black text-blue-600 dark:text-blue-400 font-inter">{totalDue.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/60 rounded-xl py-2.5 border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">{t('paymentsPage.collectedTotal')}</p>
                            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-inter">{totalCollected.toFixed(2)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-600 transition-all duration-500" style={{ width: `${collectedPercent}%` }} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 font-inter w-9 text-left">{collectedPercent.toFixed(0)}%</span>
                    </div>
                    <div>
                        {isOwner && (
                            <div>
                                <button
                                    onClick={handleShareStatement}
                                    disabled={isSharing}
                                    className={`flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 text-sm font-bold mx-auto shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 hover:-translate-y-0.5 active:scale-95 ${isSharing ? 'opacity-75 cursor-not-allowed' : ''}`}
                                >
                                    {isSharing ? (
                                        <>
                                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            {t('share.processing') || 'جاري المشاركة...'}
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                            </svg>
                                            {t('paymentsPage.shareStatement')}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-6 flow-root pb-6">
                <ul className="space-y-4">
                    {payments.map((payment) => {
                        const isCancelled = isCancelledPayment(payment);

                        return (
                            <li key={payment.id} data-unpaid={!payment.isPaid && !isCancelled ? 'true' : 'false'} className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 transition-all duration-200">
                                <div className="relative flex items-center gap-4 md:gap-6">
                                    <div>
                                        <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white dark:ring-slate-800 ${isCancelled ? 'bg-red-500' : payment.isPaid ? 'bg-green-500' : (payment.paidAmount && payment.paidAmount > 0) ? 'bg-orange-400' : 'bg-slate-400'}`}>
                                            <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                {isCancelled ? (
                                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                ) : payment.isPaid ? (
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                ) : (
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                )}
                                            </svg>
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1 flex justify-between items-center">
                                        <div>
                                            <p className="text-sm font-black text-slate-900 dark:text-slate-100 font-inter">{payment.amount.toFixed(2)}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('paymentsPage.payment')} <span className="font-bold text-slate-700 dark:text-slate-200">{payment.paymentNo}</span></p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('paymentsPage.dueDate')}: <span className="font-inter" style={{ direction: 'ltr' }}>{formatDateForDisplayPadded(payment.dueDate, '', '/')}</span></p>
                                            
                                            {(() => {
                                                const parts = payment.partialHistory;
                                                const isFullyPaidInOneGo = parts?.length === 1 && parts[0].amount >= payment.amount;
                                                const showPartsUI = parts && parts.length > 0 && !isFullyPaidInOneGo;
                                                
                                                if (showPartsUI) {
                                                    const isExpanded = expandedParts[payment.id];
                                                    const paidSoFar = payment.paidAmount || parts.reduce((s, h) => s + h.amount, 0);
                                                    return (
                                                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                                            {!payment.isPaid && (
                                                                <p className="font-bold text-orange-500 mb-1">
                                                                    {t('paymentsPage.partiallyPaid')}: <span className="font-inter">{paidSoFar.toFixed(2)}</span>
                                                                    {' · '}
                                                                    {t('paymentsPage.remainingNow')}: <span className="font-inter">{Math.max(0, payment.amount - paidSoFar).toFixed(2)}</span>
                                                                </p>
                                                            )}
                                                            <button 
                                                                onClick={(e) => toggleParts(payment.id, e)}
                                                                className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-1 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                </svg>
                                                                {t('paymentsPage.paymentParts')}
                                                            </button>
                                                            
                                                            <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                                                <div className="border-l-2 border-orange-200 dark:border-orange-800/50 rtl:border-l-0 rtl:border-r-2 pl-2 rtl:pr-2 ml-1 rtl:mr-1 space-y-2">
                                                                    {parts.map((h, idx) => (
                                                                        <div key={idx} className="flex justify-between items-center gap-2 pr-4">
                                                                            <span className="text-slate-500 font-inter" style={{ direction: 'ltr' }}>{formatDateForDisplayPadded(h.date, '', '/')}</span>
                                                                            <span className="font-bold text-orange-600 dark:text-orange-400">+{h.amount.toFixed(2)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                } else if (!payment.isPaid && payment.paidAmount && payment.paidAmount > 0) {
                                                    return (
                                                        <p className="text-xs font-bold text-orange-500 mt-1">
                                                            {t('paymentsPage.partiallyPaid')}: {payment.paidAmount.toFixed(2)}
                                                            {' · '}
                                                            {t('paymentsPage.remainingNow')}: {(payment.amount - payment.paidAmount).toFixed(2)}
                                                        </p>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={`text-sm font-bold ${!isCancelled && canHandlePayments ? 'cursor-pointer' : ''}`} onClick={() => { if (!isCancelled && canHandlePayments) handleStatusChange(payment, !payment.isPaid); }}>
                                                {isCancelled ? (
                                                    <span className="text-red-600 text-lg">{t('paymentsPage.cancelled')}</span>
                                                ) : payment.isPaid ? (
                                                    <span className="text-green-600 text-lg">{t('paymentsPage.paid')}</span>
                                                ) : (
                                                    <span className="text-slate-500">{t('paymentsPage.unpaid')}</span>
                                                )}
                                            </div>

                                            {!isCancelled && (
                                                <div className="flex flex-col items-center gap-2">
                                                    <label className={`relative ${canHandlePayments ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                                        <input type="checkbox" className="sr-only" checked={payment.isPaid} disabled={!canHandlePayments} onChange={(e) => handleStatusChange(payment, e.target.checked)} />
                                                        <div className={`block w-12 h-7 rounded-full transition-colors ${payment.isPaid ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                                        <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${payment.isPaid ? 'transform translate-x-5' : ''}`}></div>
                                                    </label>

                                                    {payment.isPaid && isOwner && (
                                                        <button
                                                            onClick={() => handleShareReceipt(payment)}
                                                            disabled={isSharing}
                                                            className={`flex items-center gap-1 glass text-blue-600 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 no-print whitespace-nowrap shadow-sm hover:shadow-md hover:scale-105 active:scale-95 ${isSharing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            {isSharing ? (
                                                                <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                                                </svg>
                                                            )}
                                                            {isSharing ? (t('share.processing') || '...') : t('paymentsPage.shareReceipt')}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>

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
                isOpen={showPartialPaymentModal}
                onClose={() => setShowPartialPaymentModal(false)}
                title={t('paymentsPage.partialPaymentModalTitle')}
            >
                <div className="space-y-4">
                    {selectedPaymentForModal && (
                        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-700/60 rounded-xl p-3 border border-slate-200 dark:border-slate-600">
                            <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">{t('paymentsPage.amount')}</p>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 font-inter">{selectedPaymentForModal.amount.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">{t('paymentsPage.paidPreviously')}</p>
                                <p className="text-xs font-bold text-green-600 dark:text-green-400 font-inter">{(selectedPaymentForModal.paidAmount || 0).toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">{t('paymentsPage.remainingNow')}</p>
                                <p className="text-xs font-bold text-orange-600 dark:text-orange-400 font-inter">{Math.max(0, selectedPaymentForModal.amount - (selectedPaymentForModal.paidAmount || 0)).toFixed(2)}</p>
                            </div>
                        </div>
                    )}

                    <p className="text-center font-bold text-slate-800 dark:text-slate-100 mb-4">
                        {selectedPaymentForModal?.paidAmount && selectedPaymentForModal.paidAmount > 0 
                            ? t('paymentsPage.isPaymentCompletePartial')
                            : t('paymentsPage.isPaymentComplete')}
                    </p>
                    
                    {!isPartialMode ? (
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => confirmPayment(true)}
                                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-green-500/30 transition-all duration-300 transform hover:-translate-y-1 active:scale-95"
                            >
                                {selectedPaymentForModal?.paidAmount && selectedPaymentForModal.paidAmount > 0 
                                    ? t('paymentsPage.yesCompletePartial')
                                    : t('paymentsPage.yesComplete')}
                            </button>
                            <button
                                onClick={() => setIsPartialMode(true)}
                                className="w-full bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-orange-500/30 transition-all duration-300 transform hover:-translate-y-1 active:scale-95"
                            >
                                {selectedPaymentForModal?.paidAmount && selectedPaymentForModal.paidAmount > 0 
                                    ? t('paymentsPage.noPartialAgain')
                                    : t('paymentsPage.noPartial')}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('paymentsPage.howMuchPaid')}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max={selectedPaymentForModal ? selectedPaymentForModal.amount - (selectedPaymentForModal.paidAmount || 0) : 0}
                                    value={partialPaidAmount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                            setPartialPaidAmount('');
                                            return;
                                        }
                                        const numVal = Number(val);
                                        const maxAllowed = selectedPaymentForModal ? selectedPaymentForModal.amount - (selectedPaymentForModal.paidAmount || 0) : 0;
                                        if (numVal > maxAllowed) {
                                            setPartialPaidAmount(maxAllowed.toString());
                                        } else {
                                            setPartialPaidAmount(val);
                                        }
                                    }}
                                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="0"
                                    autoFocus
                                />
                                <div className="text-xs mt-2 flex justify-between items-center px-2 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <span className="text-slate-600 dark:text-slate-300 font-bold">{t('paymentsPage.amount')}: {selectedPaymentForModal?.amount?.toFixed(2)}</span>
                                    {selectedPaymentForModal && (
                                        <span className={(selectedPaymentForModal.amount - ((selectedPaymentForModal.paidAmount || 0) + (Number(partialPaidAmount) || 0))) > 0 ? "text-orange-600 dark:text-orange-400 font-bold" : "text-green-600 dark:text-green-400 font-bold"}>
                                            {t('paymentsPage.remaining')}: {Math.max(0, selectedPaymentForModal.amount - ((selectedPaymentForModal.paidAmount || 0) + (Number(partialPaidAmount) || 0))).toFixed(2)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => confirmPayment(false)}
                                    disabled={!partialPaidAmount || Number(partialPaidAmount) <= 0}
                                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
                                >
                                    {t('paymentsPage.save')}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsPartialMode(false);
                                        setPartialPaidAmount('');
                                    }}
                                    className="flex-1 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 font-bold py-3 px-4 rounded-xl shadow-md transition-all duration-200"
                                >
                                    {t('paymentsPage.cancel')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </Layout>
    );
};

export default PaymentsPage;