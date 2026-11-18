import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import Modal from '../components/Modal';
import DatePickerModal from '../components/DatePickerModal';
import { getTenantsByBuilding, terminateContract, deleteTenant, verifyPassword, cleanFlatNo, getDisplayFlatNo, getPaymentsForTenant } from '../services/dbService';
import { Tenant } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { usePermissions } from '../hooks/usePermissions';
import AccessDenied from '../components/AccessDenied';
import { calculateEndDate, formatDateForDisplay, formatDateForUi, parseDate, formatDateForInput, formatDateForDisplayPadded, getTodayUtc } from '../utils/dateUtils';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useSettings } from '../contexts/SettingsContext';

const TenantsPage: React.FC = () => {
  const { buildingName } = useParams<{ buildingName: string }>();
  const navigate = useNavigate();
  const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : '';
  const { t } = useTranslation();
  const { isOwner, can, canAccessBuilding, canAccessUnit } = usePermissions();
  const { showDeleteTerminatedTenant } = useSettings();

  const canViewTenants = can('canViewUnits', true) || can('canAddTenants') || can('canEditTenants');
  const canViewHistory = can('canViewHistory');
  const canViewInquiry = can('canViewInquiry');
  const canRenewContracts = can('canRenewContracts');
  const canEditTenants = can('canEditTenants');
  const hasTenantActions = can('canViewPayments') || canRenewContracts || canEditTenants || canViewHistory || isOwner;

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [filter, setFilter] = useState<'active' | 'inactive' | 'expired' | 'terminated'>('active');
  const [inquiryFilter, setInquiryFilter] = useState<'current' | 'previous'>('current');

  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [tenantToTerminate, setTenantToTerminate] = useState<Tenant | null>(null);
  const [terminationDate, setTerminationDate] = useState(formatDateForInput(new Date()));

  // ----- OVERDUE WARNING STATE -----
  const [isOverdueWarningOpen, setIsOverdueWarningOpen] = useState(false);
  const [tenantWithOverdue, setTenantWithOverdue] = useState<Tenant | null>(null);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set());
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyTenant, setHistoryTenant] = useState<Tenant | null>(null);
  const [isSharingAll, setIsSharingAll] = useState(false);
  const [sharingFlatNo, setSharingFlatNo] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  // ----- CUSTOM DELETE TENANT STATE -----
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (searchParams.get('inquiry') === 'true' && canViewInquiry) {
      setIsInquiryModalOpen(true);
    }
  }, [searchParams, canViewInquiry]);

  const toggleTenantExpansion = (flatNo: string) => {
    setExpandedTenants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(flatNo)) {
        newSet.delete(flatNo);
      } else {
        newSet.add(flatNo);
      }
      return newSet;
    });
  };

  // Refs for printing
  const printRef = React.useRef<HTMLDivElement>(null);
  const printListRef = React.useRef<HTMLDivElement>(null);
  const [tenantToPrint, setTenantToPrint] = useState<Tenant | null>(null);

  useEffect(() => {
    if (decodedBuildingName) {
      const all = getTenantsByBuilding(decodedBuildingName);
      setTenants(isOwner ? all : all.filter(tn => canAccessUnit(decodedBuildingName, tn.flatNo)));
    }
  }, [decodedBuildingName, forceUpdate, isOwner, canAccessUnit]);

  const promptTerminateContract = (tenant: Tenant) => {
    // Check if the tenant has any overdue/unpaid payments
    if (decodedBuildingName) {
      const tenantPayments = getPaymentsForTenant(decodedBuildingName, tenant.flatNo);
      const today = getTodayUtc();
      const hasOverdue = tenantPayments.some(p => !p.isPaid && parseDate(p.dueDate) && parseDate(p.dueDate)!.getTime() <= today.getTime());

      if (hasOverdue) {
        setTenantWithOverdue(tenant);
        setIsOverdueWarningOpen(true);
        return;
      }
    }

    setTenantToTerminate(tenant);
    setTerminationDate(formatDateForInput(new Date()));
    setIsTerminateModalOpen(true);
  };

  const handleContinueTermination = () => {
    if (tenantWithOverdue) {
      setTenantToTerminate(tenantWithOverdue);
      setTerminationDate(formatDateForInput(new Date()));
      setIsOverdueWarningOpen(false);
      setIsTerminateModalOpen(true);
      setTenantWithOverdue(null);
    }
  };

  const handleGoToPayments = () => {
    if (tenantWithOverdue) {
      setIsOverdueWarningOpen(false);
      navigate(`/${buildingName}/tenants/${tenantWithOverdue.flatNo}/payments`);
      setTenantWithOverdue(null);
    }
  };

  const handleCloseWarning = () => {
    setIsOverdueWarningOpen(false);
    setTenantWithOverdue(null);
  };

  const handleConfirmTermination = () => {
    if (tenantToTerminate && terminationDate) {
      const startDate = parseDate(tenantToTerminate.startDate);
      const termDate = parseDate(terminationDate);
      if (startDate && termDate && termDate < startDate) {
        alert(t('tenantsPage.terminationDateError'));
        return;
      }
      terminateContract(decodedBuildingName, tenantToTerminate.flatNo, terminationDate);
      setForceUpdate(f => f + 1);
      setIsTerminateModalOpen(false);
      setTenantToTerminate(null);
    }
  };

  const handleRenew = (tenant: Tenant) => {
    navigate(`/${buildingName}/tenants/renew/${tenant.flatNo}`);
  };

  const handleDeleteTenant = (tenant: Tenant) => {
    setTenantToDelete(tenant);
    setDeletePassword('');
    setDeleteError('');
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteTenant = async () => {
    if (!tenantToDelete) return;
    if (await verifyPassword(deletePassword)) {
      deleteTenant(tenantToDelete.building, tenantToDelete.flatNo);
      setForceUpdate(f => f + 1);
      setIsDeleteModalOpen(false);
      setTenantToDelete(null);
    } else {
      setDeleteError("الرقم السري غير صحيح! يرجى المحاولة مرة أخرى.");
    }
  };

  const generateAndSharePdf = async (element: HTMLElement, fileName: string) => {
    try {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      // Split tall content across as many A4 pages as needed instead of cutting it off.
      const pageHeight = pdf.internal.pageSize.getHeight();
      let heightLeft = pdfHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 1) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      const pdfBase64 = pdf.output('datauristring');

      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64.split(',')[1],
        directory: Directory.Cache,
      });

      await Share.share({
        title: t('tenantsPage.inquiryTitle'),
        url: savedFile.uri,
        dialogTitle: t('tenantsPage.shareDialogTitle'),
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleShare = async (tenant: Tenant) => {
    setSharingFlatNo(tenant.flatNo.toString());
    setTenantToPrint(tenant);
    // Wait for state update and render
    setTimeout(async () => {
      if (printRef.current) {
        await generateAndSharePdf(printRef.current, `tenant_${tenant.flatNo}.pdf`);
        setTenantToPrint(null); // Clear after printing
      }
      setSharingFlatNo(null);
    }, 10);
  };

  const formatPaymentsDisplay = (t: Tenant): string => {
    const count = Number(t.paymentsCount) || 1;
    if (t.paymentFrequency === 'monthly') return `شهري (${count})`;
    if (t.paymentFrequency === 'quarterly') return `ربع سنوي (${count})`;
    if (t.paymentFrequency === 'semi-annual') return `نصف سنوي (${count})`;
    if (t.paymentFrequency === 'annual') return `سنوي (${count})`;
    if (count === 1) return 'دفعة واحدة';
    if (count === 2) return 'دفعتان';
    if (count <= 10) return `${count} دفعات`;
    return `${count} دفعة`;
  };

  const currentTenantsList = useMemo(() => {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    return tenants.filter(t => {
      if (t.terminationDate) return false;
      const effectiveEndDate = parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));
      return effectiveEndDate ? effectiveEndDate.getTime() >= todayUtc.getTime() : true;
    });
  }, [tenants]);

  const previousTenantsList = useMemo(() => {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    return tenants.filter(t => {
      if (t.terminationDate) return true;
      const effectiveEndDate = parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));
      return effectiveEndDate ? effectiveEndDate.getTime() < todayUtc.getTime() : false;
    });
  }, [tenants]);

  const inquiryTenants = inquiryFilter === 'current' ? currentTenantsList : previousTenantsList;

  const handleShareAll = async () => {
    setIsSharingAll(true);
    if (printListRef.current) {
      const fileName = inquiryFilter === 'current'
        ? `current_tenants_${decodedBuildingName}.pdf`
        : `previous_tenants_${decodedBuildingName}.pdf`;
      await generateAndSharePdf(printListRef.current, fileName);
    }
    setIsSharingAll(false);
  };

  const filteredTenants = useMemo(() => {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    return tenants.filter(tenant => {
      const effectiveEndDateString = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
      const effectiveEndDate = parseDate(effectiveEndDateString);
      const startDate = parseDate(tenant.startDate);

      if (!effectiveEndDate || !startDate) return false;

      const hasBeenTerminated = !!tenant.terminationDate;

      // Active Status Logic:
      // If terminated: Active only if date is strictly in future (> today).
      // If normal: Active if date is future or today (>= today).
      let isActive;
      if (hasBeenTerminated) {
        isActive = effectiveEndDate.getTime() > todayUtc.getTime();
      } else {
        isActive = effectiveEndDate.getTime() >= todayUtc.getTime();
      }

      // Future: Start date > today
      const isFuture = startDate.getTime() > todayUtc.getTime();

      // Past: Not Active and Not Future (and implicitly check end date for clarity)
      // Actually simpler: !isActive && !isFuture
      const isPast = !isActive && !isFuture;


      if (filter === 'active') {
        return isActive && !isFuture;
      }
      if (filter === 'inactive') {
        return isFuture && !hasBeenTerminated;
      }
      if (filter === 'expired') {
        return isPast && !hasBeenTerminated;
      }
      if (filter === 'terminated') {
        return hasBeenTerminated;
      }
      return false;
    });
  }, [tenants, filter]);

  const getNoTenantsMessage = () => {
    switch (filter) {
      case 'active':
        return t('tenantsPage.noActiveTenants');
      case 'inactive':
        return t('tenantsPage.noInactiveTenants');
      case 'expired':
        return t('tenantsPage.noExpiredTenants');
      case 'terminated':
        return t('tenantsPage.noTerminatedTenants');
    }
  };

  if (!canViewTenants || !canAccessBuilding(decodedBuildingName)) {
    return (
      <Layout>
        <Header title={`${t('tenantsPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />
        <AccessDenied backTo={`/${buildingName}`} />
      </Layout>
    );
  }

  return (
    <Layout>
      <Header title={`${t('tenantsPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />

      <div className="flex flex-col items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
          {t('tenantsPage.contractsLabel')}
        </h1>
        <div className="flex flex-row gap-1 w-full overflow-x-auto no-scrollbar pb-1 justify-center flex-wrap">
          {(['active', 'inactive', 'expired', 'terminated'] as const).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`whitespace-nowrap px-2 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 shadow-sm border flex-shrink-0
                ${filter === filterType
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
            >
              {t(`tenantsPage.filter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTenants.length > 0 ? filteredTenants.map(tenant => {
          const isContractActive = tenant.startDate && tenant.duration > 0 && !tenant.terminationDate;
          const effectiveEndDate = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
          const isExpanded = expandedTenants.has(tenant.flatNo);

          return (
            <div
              key={tenant.flatNo}
              className={`bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md flex flex-col transition-all duration-200 cursor-pointer select-none ${isExpanded ? 'ring-2 ring-blue-500' : ''}`}
              onDoubleClick={() => toggleTenantExpansion(tenant.flatNo)}
            >
              <div className="flex-grow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{tenant.name}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{t('tenantsPage.flatNo')}: {getDisplayFlatNo(tenant)}</p>
                    {!isExpanded && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{t('tenantsPage.doubleTapHint')}</p>}
                  </div>
                  {isExpanded && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 text-left">
                      {tenant.contractNo && <p>{t('tenantsPage.contractNo')}: {tenant.contractNo}</p>}
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <>
                    <div className="border-t border-slate-200 dark:border-slate-700 my-4"></div>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-semibold">{t('tenantsPage.phone')}:</span> {tenant.phone}</p>
                      {tenant.city && <p><span className="font-semibold">{t('tenantForm.city')}:</span> {tenant.city}</p>}
                      {tenant.district && <p><span className="font-semibold">{t('tenantForm.district')}:</span> {tenant.district}</p>}
                      <p><span className="font-semibold">{t('tenantsPage.nationality')}:</span> {tenant.nationality}</p>
                      {tenant.startDate ? (
                        <>
                          <p><span className="font-semibold">{t('tenantsPage.amount')}:</span> {tenant.amount.toFixed(2)}</p>
                          {tenant.electricityMeterNumber && (
                            <p><span className="font-semibold">{t('tenantForm.electricityMeterNumber')}:</span> {tenant.electricityMeterNumber}</p>
                          )}
                          <p><span className="font-semibold">{t('tenantsPage.startDate')}:</span> {formatDateForUi(tenant.startDate, 'N/A', '-')}</p>
                          {tenant.terminationDate && (
                            <p><span className="font-semibold text-red-600 dark:text-red-400">{t('tenantsPage.terminationDateLabelCard')}:</span> <span className="font-bold text-red-600 dark:text-red-400">{formatDateForUi(tenant.terminationDate, 'N/A', '-')}</span></p>
                          )}
                          <p><span className="font-semibold">{t('tenantsPage.endDate')}:</span> {formatDateForUi(effectiveEndDate, 'N/A', '-')}</p>
                        </>
                      ) : (
                        <p className="font-semibold text-amber-600 dark:text-amber-400">{t('tenantsPage.noActiveContract')}</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {isExpanded && hasTenantActions && (
                <>
                  <div className="border-t border-slate-200 dark:border-slate-700 my-4"></div>
                  <div className="flex justify-end gap-2 flex-wrap">
                    {can('canViewPayments') && (
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/${buildingName}/tenants/${tenant.flatNo}/payments`); }} className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 px-3 py-1 rounded-md text-sm hover:bg-green-200 dark:hover:bg-green-900/80">
                        {t('tenantsPage.payments')}
                      </button>
                    )}
                    {!tenant.terminationDate && canRenewContracts && (
                      <button onClick={(e) => { e.stopPropagation(); handleRenew(tenant); }} className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 px-3 py-1 rounded-md text-sm hover:bg-blue-200 dark:hover:bg-blue-900/80">
                        {t('tenantsPage.renew')}
                      </button>
                    )}
                    {
                      (filter === 'active' || filter === 'inactive') && canEditTenants && (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/${buildingName}/tenants/edit/${tenant.flatNo}`); }} className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 px-3 py-1 rounded-md text-sm hover:bg-yellow-200 dark:hover:bg-yellow-900/80">
                          {t('tenantsPage.edit')}
                        </button>
                      )
                    }
                    {
                      isContractActive && isOwner && (
                        <button onClick={(e) => { e.stopPropagation(); promptTerminateContract(tenant); }} className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 px-3 py-1 rounded-md text-sm hover:bg-red-200 dark:hover:bg-red-900/80">
                          {t('tenantsPage.terminateContract')}
                        </button>
                      )
                    }
                    {
                      tenant.terminationDate && isOwner && showDeleteTerminatedTenant && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant); }} className="bg-red-600 text-white border border-red-700 dark:bg-red-700 dark:border-red-800 dark:text-white px-3 py-1 rounded-md text-sm hover:bg-red-700 dark:hover:bg-red-600 shadow-sm shadow-red-500/20">
                          {t('tenantsPage.permanentDelete')}
                        </button>
                      )
                    }
                    {canViewHistory && (
                      <button onClick={(e) => { e.stopPropagation(); setHistoryTenant(tenant); setIsHistoryModalOpen(true); }} className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 px-3 py-1 rounded-md text-sm hover:bg-purple-200 dark:hover:bg-purple-900/80">
                      {t('tenantsPage.previousContracts')}
                    </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        }) : (
          <div className="col-span-1 md:col-span-2 lg:grid-cols-3 text-center p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md">
            <p className="text-slate-500 dark:text-slate-400">{getNoTenantsMessage()}</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={t('tenantsPage.previousContracts')}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {historyTenant && historyTenant.history && historyTenant.history.length > 0 ? (
            historyTenant.history.slice().reverse().map((contract, index) => (
              <div key={index} className="p-4 bg-slate-100 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2">{t('tenantForm.contractLabel')} {historyTenant.history!.length - index}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p><span className="font-semibold">{t('tenantsPage.startDate')}:</span> {formatDateForUi(contract.startDate, 'N/A', '-')}</p>
                  <p><span className="font-semibold">{t('tenantsPage.endDate')}:</span> {formatDateForUi(calculateEndDate(contract.startDate, Number(contract.duration), contract.durationUnit), 'N/A', '-')}</p>
                  <p><span className="font-semibold">{t('tenantsPage.amount')}:</span> {contract.amount.toFixed(2)}</p>
                  {contract.terminationDate && (
                    <p className="col-span-2"><span className="font-semibold text-red-600">{t('tenantsPage.terminationDateLabelCard')}:</span> {formatDateForUi(contract.terminationDate, 'N/A', '-')}</p>
                  )}
                </div>
              </div>
            ))
          ) : null}
          {(!historyTenant || !historyTenant.history || historyTenant.history.length === 0) && (
            <p className="text-center text-slate-500">{t('tenantsPage.noExpiredTenants')}</p>
          )}
        </div>
      </Modal>

      {/* Overdue Warning Modal */}
      <Modal
        isOpen={isOverdueWarningOpen}
        onClose={handleCloseWarning}
        title="تنبيه: دفعات متأخرة معلقة"
      >
        <div className="space-y-4" dir="rtl">
          <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200/50 dark:border-amber-900/30">
            <span className="text-3xl">⚠️</span>
            <div>
              <h4 className="font-bold text-amber-800 dark:text-amber-400 text-sm">المستأجر لديه مبالغ متأخرة!</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                المستأجر <strong className="text-slate-900 dark:text-slate-100">{tenantWithOverdue?.name}</strong> لديه دفعة أو أكثر مستحقة لم يتم دفعها بعد.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            يرجى تحديد الإجراء المناسب. يمكنك المتابعة في فسخ العقد مباشرة، أو الانتقال لصفحة الدفعات لتحصيل المبالغ المستحقة أولاً، أو التراجع والعودة.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleContinueTermination}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-colors text-xs"
            >
              متابعة
            </button>
            <button
              onClick={handleGoToPayments}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-colors text-xs"
            >
              دفع
            </button>
            <button
              onClick={handleCloseWarning}
              className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 py-2.5 rounded-xl font-bold transition-colors text-xs"
            >
              عودة
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isTerminateModalOpen}
        onClose={() => setIsTerminateModalOpen(false)}
        title={t('tenantsPage.terminateModalTitle')}
      >
        <div className="space-y-4">
          <p>
            {t('tenantsPage.terminateModalMessage').replace('{tenantName}', tenantToTerminate?.name || '')}
          </p>
          <div>
            <label htmlFor="terminationDate" className="block mb-1 text-slate-700 dark:text-slate-300">
              {t('tenantsPage.terminationDateLabel')}
            </label>
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
                {formatDateForDisplayPadded(terminationDate, '', '/')}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-4">
            <button type="button" onClick={() => setIsTerminateModalOpen(false)} className="bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-md">{t('addBuildingModal.cancel')}</button>
            <button type="button" onClick={handleConfirmTermination} className="bg-red-600 text-white px-4 py-2 rounded-md">{t('tenantsPage.terminateContract')}</button>
          </div>
        </div>
      </Modal>

      {/* Custom Delete Tenant Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="تأكيد الحذف النهائي"
      >
        <div className="space-y-4" dir="rtl">
          <p className="text-slate-700 dark:text-slate-300 font-medium">
            هل أنت متأكد من الحذف النهائي للمستأجر <strong className="text-red-600">{tenantToDelete?.name}</strong> من الوحدة <strong className="text-slate-900 dark:text-slate-100">{getDisplayFlatNo(tenantToDelete)}</strong>؟
          </p>
          <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2.5 rounded-lg border border-red-100 dark:border-red-950/30">
            ⚠️ هذا الإجراء لا يمكن التراجع عنه وسيحذف جميع الدفعات والبيانات المرتبطة بهذا المستأجر نهائياً.
          </p>
          <div>
            <label className="block mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              الرجاء إدخال الرقم السري للمالك لتأكيد الحذف:
            </label>
            <input
              type="password"
              placeholder="••••"
              value={deletePassword}
              onChange={(e) => {
                setDeletePassword(e.target.value);
                setDeleteError('');
              }}
              className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmDeleteTenant();
              }}
            />
          </div>
          {deleteError && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-100/50 dark:bg-red-900/20 p-2 rounded-lg text-center font-bold">
              {deleteError}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-bold transition-colors text-sm"
            >
              تراجع
            </button>
            <button
              onClick={confirmDeleteTenant}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold transition-colors shadow-md shadow-red-500/10 text-sm"
            >
              حذف نهائي
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isInquiryModalOpen}
        onClose={() => {
          setIsInquiryModalOpen(false);
          if (searchParams.get('inquiry') === 'true') {
            navigate(`/${buildingName}`);
          }
        }}
        title={t('tenantsPage.inquiryTitle')}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Inquiry Filter Toggles */}
          <div className="flex p-1 space-x-1 bg-slate-100 dark:bg-slate-700 rounded-xl mb-4 rtl:space-x-reverse">
            <button
              onClick={() => setInquiryFilter('current')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${inquiryFilter === 'current'
                ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
            >
              المستأجرون الحاليون
            </button>
            <button
              onClick={() => setInquiryFilter('previous')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${inquiryFilter === 'previous'
                ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
            >
              المستأجرون السابقون
            </button>
          </div>

          {inquiryTenants.map(tenant => {
            const effectiveEndDate = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
            return (
              <div key={tenant.flatNo} className="bg-slate-50 dark:bg-slate-700/60 p-4 rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm">
                <div className="flex justify-between items-start mb-2.5">
                  <div>
                    <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100">{tenant.name}</h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      الوحدة: <strong className="text-slate-800 dark:text-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>{getDisplayFlatNo(tenant)}</strong>
                    </span>
                  </div>
                  <button
                    onClick={() => handleShare(tenant)}
                    disabled={sharingFlatNo === tenant.flatNo}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg shadow-sm"
                    title="مشاركة تفاصيل المستأجر"
                  >
                    {sharingFlatNo === tenant.flatNo ? (
                      <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs md:text-sm text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200/60 dark:border-slate-600">
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">عدد الدفعات:</span> <span className="font-bold text-blue-600 dark:text-blue-400">{formatPaymentsDisplay(tenant)}</span></p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.endDate')}:</span> <span style={{ fontFamily: 'Inter, sans-serif' }}>{formatDateForUi(effectiveEndDate, 'N/A', '-')}</span></p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.amount')}:</span> <span className="font-bold text-green-600 font-inter">{tenant.amount.toFixed(2)}</span></p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.phone')}:</span> <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>{tenant.phone}</span></p>
                </div>
              </div>
            );
          })}
          {inquiryTenants.length === 0 && (
            <p className="text-center text-slate-500 py-6">{t('tenantsPage.noTenantsFound')}</p>
          )}
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={handleShareAll}
              disabled={isSharingAll}
              className={`bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2 ${isSharingAll ? 'opacity-70 cursor-wait' : ''}`}
            >
              {isSharingAll ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('share.processing')}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  {t('tenantsPage.shareAll')}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Hidden Print Area for Single Tenant */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        {tenantToPrint && (
          <div ref={printRef} style={{
            direction: 'rtl',
            fontFamily: 'Cairo, sans-serif',
            padding: '2.5rem',
            backgroundColor: '#fff',
            color: '#1e293b',
            width: '800px',
            border: '2px solid #004466',
            minHeight: '1120px',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}>
            <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>{t('tenantsPage.inquiryTitle')}</h1>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#004466' }}>
                {`${t('printableReceipt.building')} (${tenantToPrint.building})`}
              </p>
            </header>

            <main style={{ flexGrow: 1 }}>
              <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: '#1e293b',
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #004466',
                  textAlign: 'right'
                }}>{t('tenantsPage.tenantInfo')}</h2>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.name')}:</span>
                  <strong>{tenantToPrint.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.idNumber')}:</span>
                  <strong style={{ fontFamily: 'Inter, sans-serif' }}>{tenantToPrint.idNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.nationality')}:</span>
                  <strong>{tenantToPrint.nationality}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.phone')}:</span>
                  <strong style={{ fontFamily: 'Inter, sans-serif' }}>{tenantToPrint.phone}</strong>
                </div>
              </section>

              <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: '#1e293b',
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #004466',
                  textAlign: 'right'
                }}>{t('tenantsPage.contractDetails')}</h2>

                {tenantToPrint.city && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                    <span>{t('tenantForm.city')}:</span>
                    <strong>{tenantToPrint.city}</strong>
                  </div>
                )}
                {tenantToPrint.district && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                    <span>{t('tenantForm.district')}:</span>
                    <strong>{tenantToPrint.district}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.flatNo')}:</span>
                  <strong style={{ fontFamily: 'Inter, sans-serif' }}>{getDisplayFlatNo(tenantToPrint)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.contractNo')}:</span>
                  <strong style={{ fontFamily: 'Inter, sans-serif' }}>{tenantToPrint.contractNo}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>عدد الدفعات:</span>
                  <strong>{formatPaymentsDisplay(tenantToPrint)}</strong>
                </div>
                {tenantToPrint.electricityMeterNumber && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                    <span>{t('tenantForm.electricityMeterNumber')}:</span>
                    <strong style={{ fontFamily: 'Inter, sans-serif' }}>{tenantToPrint.electricityMeterNumber}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.startDate')}:</span>
                  <strong style={{ fontFamily: 'Inter, sans-serif' }}>{formatDateForUi(tenantToPrint.startDate, 'N/A', '-')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  <span>{t('tenantsPage.endDate')}:</span>
                  <strong style={{ fontFamily: 'Inter, sans-serif' }}>{formatDateForUi(tenantToPrint.terminationDate || calculateEndDate(tenantToPrint.startDate, Number(tenantToPrint.duration), tenantToPrint.durationUnit), 'N/A', '-')}</strong>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                  fontSize: '1rem',
                  marginTop: '1.5rem',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid #eee'
                }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 500 }}>{t('tenantsPage.amount')}:</span>
                  <strong style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '1.5rem', fontFamily: 'Inter, sans-serif' }}>
                    {tenantToPrint.amount.toFixed(2)} {t('paymentsPage.currency')}
                  </strong>
                </div>
              </section>
            </main>

            <footer style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
              <p>{t('printableReceipt.footer')}</p>
            </footer>
          </div>
        )}
      </div>

      {/* Hidden Print Area for All Tenants */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printListRef} style={{
          direction: 'rtl',
          fontFamily: 'Cairo, sans-serif',
          padding: '2.5rem',
          backgroundColor: '#fff',
          color: '#1e293b',
          width: '800px',
          minHeight: '1120px',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}>
          <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.75rem' }}>
              {inquiryFilter === 'current' ? 'استعلام المستأجرين الحاليين' : 'استعلام المستأجرين السابقين'}
            </h1>
            <p style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#004466' }}>{`${t('printableReceipt.building')} (${decodedBuildingName})`}</p>
          </header>

          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-300">
                <th className="p-2 border border-slate-200">{t('tenantsPage.name')}</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.flatNo')}</th>
                <th className="p-2 border border-slate-200">عدد الدفعات</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.endDate')}</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.amount')}</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.phone')}</th>
              </tr>
            </thead>
            <tbody>
              {inquiryTenants.map((tenant, index) => {
                const effectiveEndDate = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
                return (
                  <tr key={index} className="border-b border-slate-200">
                    <td className="p-2 border border-slate-200 font-bold">{tenant.name}</td>
                    <td className="p-2 border border-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>{getDisplayFlatNo(tenant)}</td>
                    <td className="p-2 border border-slate-200 font-medium">{formatPaymentsDisplay(tenant)}</td>
                    <td className="p-2 border border-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>{formatDateForUi(effectiveEndDate, 'N/A', '-')}</td>
                    <td className="p-2 border border-slate-200 font-bold text-green-600" style={{ fontFamily: 'Inter, sans-serif' }}>{tenant.amount.toFixed(2)}</td>
                    <td className="p-2 border border-slate-200" style={{ fontFamily: 'Inter, sans-serif', direction: 'ltr' }}>{tenant.phone}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <footer style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
            <p>{t('printableReceipt.footer')}</p>
          </footer>
        </div>
      </div>

      <DatePickerModal
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onSelect={(date) => {
          setTerminationDate(formatDateForInput(date));
        }}
        initialDate={parseDate(terminationDate) || undefined}
      />
    </Layout>
  );
};

export default TenantsPage;