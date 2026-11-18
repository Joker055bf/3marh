import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tenant } from '../types';
import { formatDateForDisplay, calculateEndDate } from './dateUtils';

// Define the font for Arabic support (using a standard font that supports Arabic if available, or fallback)
// Note: jsPDF default fonts don't support Arabic well. For a real production app, we'd need to load a custom font.
// For now, we will use English labels or transliteration if Arabic renders poorly, 
// but since the user asked for this specifically, we will try to make it work.
// Ideally, we would import a base64 encoded Arabic font here. 
// Given the constraints, we'll assume the system font or standard ASCII for now, 
// but we'll structure it to be easily replaceable.

export const generateTenantPdf = (tenant: Tenant, t: (key: string) => string): string => {
    const doc = new jsPDF();
    const effectiveEndDate = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);

    doc.setFontSize(20);
    doc.text(t('tenantsPage.inquiryTitle'), 105, 20, { align: 'center' });

    doc.setFontSize(14);
    let y = 40;
    const lineHeight = 10;

    const addLine = (label: string, value: string) => {
        doc.text(`${label}: ${value}`, 20, y);
        y += lineHeight;
    };

    addLine(t('tenantsPage.name'), tenant.name);
    addLine(t('tenantsPage.flatNo'), tenant.flatNo);
    addLine(t('tenantsPage.phone'), tenant.phone);
    addLine(t('tenantsPage.startDate'), formatDateForDisplay(tenant.startDate, 'N/A', '-'));
    addLine(t('tenantsPage.endDate'), formatDateForDisplay(effectiveEndDate, 'N/A', '-'));
    addLine(t('tenantsPage.amount'), tenant.amount.toFixed(2));

    return doc.output('datauristring');
};

export const generateTenantsListPdf = (tenants: Tenant[], t: (key: string) => string): string => {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text(t('tenantsPage.inquiryTitle'), 105, 20, { align: 'center' });

    const tableData = tenants.map(tenant => {
        const effectiveEndDate = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
        return [
            tenant.name,
            tenant.flatNo,
            tenant.phone,
            formatDateForDisplay(tenant.startDate, 'N/A', '-'),
            formatDateForDisplay(effectiveEndDate, 'N/A', '-'),
            tenant.amount.toFixed(2)
        ];
    });

    autoTable(doc, {
        head: [[
            t('tenantsPage.name'),
            t('tenantsPage.flatNo'),
            t('tenantsPage.phone'),
            t('tenantsPage.startDate'),
            t('tenantsPage.endDate'),
            t('tenantsPage.amount')
        ]],
        body: tableData,
        startY: 30,
        styles: { halign: 'right', font: 'helvetica' }, // Align right for Arabic context if possible
        headStyles: { fillColor: [41, 128, 185] },
    });

    return doc.output('datauristring');
};
