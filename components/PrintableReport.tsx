import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { getLandlordName } from '../services/dbService';
import { formatDateForDisplay, formatDateForUi } from '../utils/dateUtils';

interface PrintableReportProps {
    buildingName: string;
    reportTitle: string;
    subtitle?: string;
    children: React.ReactNode;
}

const PrintableReport: React.FC<PrintableReportProps> = ({ buildingName, reportTitle, subtitle, children }) => {
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
        position: 'relative',
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

    return (
        <div style={containerStyle}>


            <header style={{ ...textStyle, marginBottom: '1.5rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1e293b' }}>{reportTitle}</h1>
                <p style={{ fontSize: '1.125rem', color: '#475569' }}>
                    {`${t('printableReport.building')}: ${buildingName}`}
                </p>
                {subtitle && (
                    <p style={{ fontSize: '1.125rem', color: '#475569' }}>
                        {subtitle}
                    </p>
                )}
            </header>

            <div style={{ borderBottom: `2px solid ${accentColor}`, marginBottom: '2.5rem' }}></div>

            <main style={{ flexGrow: 1 }}>
                {children}
            </main>

            <footer style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#475569' }}>
                <div style={textStyle}>
                    <strong>{t('printableReport.landlord')}:</strong> {landlordName}
                </div>
                <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
                    <strong>{t('printableReport.reportDate')}:</strong> <span style={numericFontStyle}>{formatDateForUi(new Date(), '', '-')}</span>
                </div>
            </footer>
        </div>
    );
};

export default PrintableReport;