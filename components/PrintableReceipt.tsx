import React from 'react';
import { Tenant, Payment } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { getLandlordName, cleanFlatNo } from '../services/dbService';
import { formatDateForDisplay, formatDateForUi } from '../utils/dateUtils';

interface PrintableReceiptProps {
    tenant?: Tenant;
    payment: Payment;
}

const PrintableReceipt: React.FC<PrintableReceiptProps> = ({ tenant, payment }) => {
    const { t, language } = useTranslation();
    const landlordName = getLandlordName();
    const isRTL = language === 'ar';
    const accentColor = '#004466';

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
        boxSizing: 'border-box',
    };

    const textStyle: React.CSSProperties = {
        textAlign: isRTL ? 'right' : 'left',
    };

    const numericFontStyle: React.CSSProperties = {
        fontFamily: 'Inter, sans-serif',
    };

    const sectionTitleStyle: React.CSSProperties = {
        fontSize: '1.25rem',
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: `1px solid ${accentColor}`
    };

    const detailItemStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
        fontSize: '1rem'
    };

    const amountStyle: React.CSSProperties = {
        color: '#16a34a',
        fontWeight: 'bold',
        fontSize: '1.5rem',
        ...numericFontStyle,
    };

    return (
        <div style={containerStyle}>
            <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1e293b' }}>{t('printableReceipt.title')}</h1>
                <p style={{ fontSize: '1.125rem', color: '#475569' }}>
                    {`${t('printableReceipt.building')} (${tenant?.building})`}
                </p>
            </header>

            <main style={{ flexGrow: 1 }}>
                <section style={{ marginBottom: '2.5rem' }}>
                    <h2 style={{ ...sectionTitleStyle, ...textStyle }}>{t('printableReceipt.tenantInfo')}</h2>
                    <div style={detailItemStyle}>
                        <span>{t('printableReceipt.tenantName')}:</span>
                        <strong>{tenant?.name}</strong>
                    </div>
                    <div style={detailItemStyle}>
                        <span>{t('printableReceipt.contractNo')}:</span>
                        <strong style={numericFontStyle}>{tenant?.contractNo}</strong>
                    </div>
                    <div style={detailItemStyle}>
                        <span>{t('printableReceipt.flatNo')}:</span>
                        <strong style={numericFontStyle}>{cleanFlatNo(tenant?.flatNo)}</strong>
                    </div>
                    {tenant?.city && (
                        <div style={detailItemStyle}>
                            <span>{t('tenantForm.city')}:</span>
                            <strong>{tenant?.city}</strong>
                        </div>
                    )}
                    {tenant?.district && (
                        <div style={detailItemStyle}>
                            <span>{t('tenantForm.district')}:</span>
                            <strong>{tenant?.district}</strong>
                        </div>
                    )}
                </section>

                <section style={{ marginBottom: '2.5rem' }}>
                    <h2 style={{ ...sectionTitleStyle, ...textStyle }}>{t('printableReceipt.paymentDetails')}</h2>
                    <div style={detailItemStyle}>
                        <span>{t('printableReceipt.paymentNo')}:</span>
                        <strong style={numericFontStyle}>{payment.paymentNo}</strong>
                    </div>
                    <div style={detailItemStyle}>
                        <span>{t('printableReceipt.dueDate')}:</span>
                        <strong style={numericFontStyle}>{formatDateForUi(payment.dueDate, '', '-')}</strong>
                    </div>
                    <div style={detailItemStyle}>
                        <span>{t('printableReceipt.paymentDate')}:</span>
                        <strong style={numericFontStyle}>{formatDateForUi(new Date(), '', '-')}</strong>
                    </div>
                    <div style={{ ...detailItemStyle, marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 500 }}>{t('printableReceipt.paidAmount')}:</span>
                        <strong style={amountStyle}>{payment.amount.toFixed(2)} {t('paymentsPage.currency')}</strong>
                    </div>
                </section>

                <section>
                    <h2 style={{ ...sectionTitleStyle, ...textStyle }}>{t('printableReceipt.landlordInfo')}</h2>
                    <div style={detailItemStyle}>
                        <span>{t('printableReceipt.landlordName')}:</span>
                        <strong>{landlordName}</strong>
                    </div>
                    <div style={{ ...detailItemStyle, marginTop: '3rem' }}>
                        <span>{t('printableReceipt.signature')}:</span>
                        <div style={{ borderBottom: '1px dotted #000', width: '250px' }}></div>
                    </div>
                </section>
            </main>

            <footer style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                <p>{t('printableReceipt.footer')}</p>
            </footer>
        </div>
    );
};

export default PrintableReceipt;