import React from 'react';
import { Tenant, Payment } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { getLandlordName, cleanFlatNo } from '../services/dbService';
import { formatDateForDisplayPadded } from '../utils/dateUtils';

interface PrintableTenantStatementProps {
    tenant: Tenant;
    payments: Payment[];
}

const PrintableTenantStatement: React.FC<PrintableTenantStatementProps> = ({ tenant, payments }) => {
    const { t, language } = useTranslation();
    const landlordName = getLandlordName();
    const isRTL = language === 'ar';

    const totalPaid = payments.reduce((sum, p) => sum + (p.isPaid ? p.amount : (p.paidAmount || 0)), 0);
    const totalUnpaid = Math.max(0, payments.reduce((sum, p) => sum + p.amount, 0) - totalPaid);

    const accentColor = '#00838f'; // A teal color similar to the image

    const containerStyle: React.CSSProperties = {
        direction: isRTL ? 'rtl' : 'ltr',
        fontFamily: isRTL ? 'Cairo, sans-serif' : 'Inter, sans-serif',
        padding: '2.5rem',
        backgroundColor: '#fff',
        color: '#1e293b',
        width: '800px',
        border: `2px solid ${accentColor}`,
        minHeight: '1120px',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box'
    };

    const textStyle: React.CSSProperties = {
        textAlign: isRTL ? 'right' : 'left',
    };
    
    const numericFontStyle: React.CSSProperties = {
        fontFamily: 'Inter, sans-serif',
    };

    const headerCellStyle: React.CSSProperties = {
        padding: '0.75rem 1rem',
        textAlign: isRTL ? 'right' : 'left',
        backgroundColor: '#f1f5f9',
        fontWeight: 600,
        color: '#334155',
        borderBottom: `1px solid ${accentColor}`,
    };

    const cellStyle: React.CSSProperties = {
        padding: '0.75rem 1rem',
        textAlign: 'center',
        borderBottom: '1px solid #e2e8f0',
        verticalAlign: 'middle',
        color: '#1e293b', // Explicitly set color to prevent invisibility issues
    };
    
    return (
        <div style={containerStyle}>
            <main style={{ flexGrow: 1 }}>
                <header style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{t('printableReport.tenantStatementTitle')}</h1>
                    <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
                        {`${t('printableReport.building')}: ${tenant.building}`}
                    </p>
                    <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
                        {`${t('printableReport.tenantStatementFor')} ${tenant.name} (${t('tenantsPage.flatNo')}: `}
                        <span style={numericFontStyle}>{cleanFlatNo(tenant.flatNo)}</span>
                        {`)`}
                    </p>
                </header>
                
                <div style={{ borderBottom: `2px solid ${accentColor}`, marginBottom: '2rem' }}></div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                    <thead>
                        <tr>
                            <th style={{...headerCellStyle, textAlign: 'center', width: '15%'}}>{t('printableReport.paymentNo')}</th>
                            <th style={{...headerCellStyle, textAlign: 'center', width: '30%'}}>{t('printableReport.dueDate')}</th>
                            <th style={{...headerCellStyle, textAlign: 'center', width: '30%'}}>{t('printableReport.amount')}</th>
                            <th style={{...headerCellStyle, textAlign: 'center', width: '25%'}}>{t('printableReport.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {payments.map(p => (
                            <tr key={p.id}>
                                <td style={{ ...cellStyle, ...numericFontStyle }}>{p.paymentNo}</td>
                                <td style={{ ...cellStyle, ...numericFontStyle }}>{formatDateForDisplayPadded(p.dueDate, '', '/')}</td>
                                <td style={{ ...cellStyle, ...numericFontStyle }}>{p.amount.toFixed(2)} {t('paymentsPage.currency')}</td>
                                <td style={{ ...cellStyle, fontWeight: 'bold', color: p.isPaid ? '#16a34a' : ((p.paidAmount || 0) > 0 ? '#f97316' : '#dc2626') }}>
                                    {p.isPaid
                                        ? t('printableReport.statusPaid')
                                        : ((p.paidAmount || 0) > 0
                                            ? `${t('paymentsPage.partiallyPaid')} (${(p.paidAmount || 0).toFixed(2)})`
                                            : t('printableReport.statusUnpaid'))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={4} style={{ paddingTop: '1rem', borderBottom: 'none' }}>
                                {/* Refactored summary to use simple divs instead of a nested table for better rendering reliability */}
                                <div style={{ backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '0.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <span style={{ fontWeight: 'bold', color: '#16a34a', fontSize: '1.1rem' }}>{t('printableReport.totalPaid')}:</span>
                                        <span style={{ fontWeight: 'bold', ...numericFontStyle, fontSize: '1.1rem', color: '#1e293b' }}>
                                            {totalPaid.toFixed(2)} {t('paymentsPage.currency')}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold', color: '#dc2626', fontSize: '1.1rem' }}>{t('printableReport.totalUnpaid')}:</span>
                                        <span style={{ fontWeight: 'bold', ...numericFontStyle, fontSize: '1.1rem', color: '#1e293b' }}>
                                            {totalUnpaid.toFixed(2)} {t('paymentsPage.currency')}
                                        </span>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tfoot>
                </table>
                 {payments.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        {t('printableReport.noUnpaidPayments')}
                    </div>
                )}
            </main>
           
            <footer style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#475569' }}>
                <div style={textStyle}>
                    <strong>{t('printableReport.landlord')}:</strong> {landlordName}
                </div>
                <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
                    <strong>{t('printableReport.reportDate')}:</strong> <span style={numericFontStyle}>{formatDateForDisplayPadded(new Date(), '', '/')}</span>
                </div>
            </footer>
        </div>
    );
};

export default PrintableTenantStatement;