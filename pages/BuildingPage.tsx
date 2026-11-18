import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import DatePickerModal from '../components/DatePickerModal';
import { 
  getUpcomingOrOverduePayments, 
  getExpiringContracts, 
  getTenantsByBuilding, 
  getBuildingStats, 
  updateBuildingUnits, 
  verifyPassword, 
  getIncompletePayments,
  terminateContract,
  deleteTenant,
  cleanFlatNo,
  getDisplayFlatNo,
  findTenantForPayment,
  getPaymentsForTenant
} from '../services/dbService';
import { Payment, Tenant } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { parseDate, calculateEndDate, formatDateForDisplay, formatDateForUi, formatDateForInput, formatDateForDisplayPadded, getTodayUtc } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useSettings } from '../contexts/SettingsContext';

const BuildingPage: React.FC = () => {
  const { buildingName } = useParams<{ buildingName: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : 'مبنى غير معروف';
  const { t } = useTranslation();
  const { user } = useAuth();
  const isNative = Capacitor.isNativePlatform();
  const { showDeleteTerminatedTenant } = useSettings();

  const isOwner = user?.role === 'owner';
  const canAddTenants = isOwner || user?.permissions?.canAddTenants;
  const canEditTenants = isOwner || user?.permissions?.canEditTenants;
  const canRenewContracts = isOwner || user?.permissions?.canRenewContracts;
  const canViewPayments = isOwner || user?.permissions?.canViewPayments;
  const canViewHistory = isOwner || user?.permissions?.canViewHistory;
  const canViewAlerts = isOwner || user?.permissions?.canViewAlerts;
  const canViewReports = isOwner || user?.permissions?.canViewReports;
  const canViewExpenses = isOwner || user?.permissions?.canViewExpenses;
  const canViewNotes = isOwner || user?.permissions?.canViewNotes;
  const canViewInquiry = isOwner || user?.permissions?.canViewInquiry;
  const canViewEvents = isOwner || user?.permissions?.canViewEvents;
  const canViewUnits = isOwner || (user?.role === 'worker' ? (user?.permissions?.canViewUnits ?? true) : false);

  // ----- STATS & BUILDING STATE -----
  const [alerts, setAlerts] = useState<Payment[]>([]);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [expiringContracts, setExpiringContracts] = useState<Tenant[]>([]);
  const [isExpiringModalOpen, setIsExpiringModalOpen] = useState(false);
  const [incompletePayments, setIncompletePayments] = useState<Payment[]>([]);
  const [isIncompleteModalOpen, setIsIncompleteModalOpen] = useState(false);
  const [stats, setStats] = useState({ totalUnits: 0, rentedUnits: 0, availableUnits: 0 });
  const [isEditUnitsModalOpen, setIsEditUnitsModalOpen] = useState(false);
  const [isViewUnitsModalOpen, setIsViewUnitsModalOpen] = useState(false);
  const [isPasswordConfirmOpen, setIsPasswordConfirmOpen] = useState(false);
  const [editTotalUnits, setEditTotalUnits] = useState(0);
  const [updatePassword, setUpdatePassword] = useState('');
  const [isFinanceMenuOpen, setIsFinanceMenuOpen] = useState(false);

  // ----- TENANTS STATE -----
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

  // ----- CUSTOM DELETE TENANT STATE -----
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [sharingFlatNo, setSharingFlatNo] = useState<string | null>(null);
  const [isInquiryShareFallbackOpen, setIsInquiryShareFallbackOpen] = useState(false);
  const [inquiryShareableFile, setInquiryShareableFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [inquiryDownloadUrl, setInquiryDownloadUrl] = useState<string | null>(null);

  // Refs for printing
  const printRef = useRef<HTMLDivElement>(null);
  const printListRef = useRef<HTMLDivElement>(null);
  const [tenantToPrint, setTenantToPrint] = useState<Tenant | null>(null);

  useEffect(() => {
    if (isInquiryShareFallbackOpen && inquiryShareableFile) {
      const url = URL.createObjectURL(inquiryShareableFile.blob);
      setInquiryDownloadUrl(url);
      return () => { URL.revokeObjectURL(url); setInquiryDownloadUrl(null); };
    }
  }, [isInquiryShareFallbackOpen, inquiryShareableFile]);

  useEffect(() => {
    if (decodedBuildingName) {
      // Permission check for workers
      if (user && user.role === 'worker' && Array.isArray(user.permissions?.allowedBuildings) && user.permissions.allowedBuildings.length > 0) {
        if (!user.permissions.allowedBuildings.includes(decodedBuildingName)) {
          navigate('/');
          return;
        }
      }
      let buildingTenants = getTenantsByBuilding(decodedBuildingName);
      
      // Filter units based on worker permissions
      // Same rule as usePermissions: an empty list means no restriction; compare unit numbers without the -old- suffix.
      const allowed = user && user.role === 'worker' ? user.permissions?.allowedUnits?.[decodedBuildingName] : undefined;
      if (Array.isArray(allowed) && allowed.length > 0) {
        buildingTenants = buildingTenants.filter(t => allowed.some(u => cleanFlatNo(u) === cleanFlatNo(t.flatNo)));
      }

      setAlerts(getUpcomingOrOverduePayments(decodedBuildingName));
      setExpiringContracts(getExpiringContracts(decodedBuildingName));
      setIncompletePayments(getIncompletePayments(decodedBuildingName));
      setTenants(buildingTenants);
      setStats(getBuildingStats(decodedBuildingName));
    }
  }, [decodedBuildingName, forceUpdate, user, navigate]);

  useEffect(() => {
    if (searchParams.get('inquiry') === 'true') {
      setIsInquiryModalOpen(true);
    }
    const modalType = searchParams.get('modal');
    if (modalType === 'alerts' || modalType === 'expiring') {
      setIsAlertsModalOpen(true);
    }
  }, [searchParams]);

  const handleEditStats = () => {
    setEditTotalUnits(stats.totalUnits);
    setIsEditUnitsModalOpen(true);
  };

  const handleRequestSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editTotalUnits !== stats.totalUnits) {
      setUpdatePassword('');
      setIsPasswordConfirmOpen(true);
    } else {
      setIsEditUnitsModalOpen(false);
    }
  };

  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(updatePassword)) {
      if (decodedBuildingName) {
        updateBuildingUnits(decodedBuildingName, editTotalUnits);
        setStats(getBuildingStats(decodedBuildingName));
        setIsPasswordConfirmOpen(false);
        setIsEditUnitsModalOpen(false);
      }
    } else {
      alert(t('deleteBuildingModal.incorrectPasswordError'));
    }
  };

  const getPaymentStatus = (dueDate: string) => {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const due = parseDate(dueDate);
    if (!due) return 'upcoming';

    if (due.getTime() < todayUtc.getTime()) return 'overdue';
    if (due.getTime() === todayUtc.getTime()) return 'dueToday';
    return 'upcoming';
  }

  // --- Tenants Logic ---
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
      setTenants(getTenantsByBuilding(decodedBuildingName));
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

      const pdfBlob = pdf.output('blob');

      // Native platform (Android/iOS)
      if (isNative) {
        try {
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
          return;
        } catch (err) {
          console.error('Native share failed:', err);
        }
      }

      // Web: try navigator.share with file
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (navigator.share) {
        try {
          await navigator.share({ files: [pdfFile], title: t('tenantsPage.inquiryTitle') });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.error('Web share failed, using download fallback:', err);
        }
      }

      // Fallback: show download modal
      setInquiryShareableFile({ blob: pdfBlob, name: fileName });
      setIsInquiryShareFallbackOpen(true);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleShare = async (tenant: Tenant) => {
    setSharingFlatNo(tenant.flatNo.toString());
    setTenantToPrint(tenant);
    setTimeout(async () => {
      if (printRef.current) {
        await generateAndSharePdf(printRef.current, `tenant_${tenant.flatNo}.pdf`);
        setTenantToPrint(null);
      }
      setSharingFlatNo(null);
    }, 10);
  };

  const formatPaymentsDisplay = (t: Tenant): string => {
    const count = Number(t.paymentsCount) || 1;
    if (count === 12) return 'شهري';
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

      let isActive;
      if (hasBeenTerminated) {
        isActive = effectiveEndDate.getTime() > todayUtc.getTime();
      } else {
        isActive = effectiveEndDate.getTime() >= todayUtc.getTime();
      }

      const isFuture = startDate.getTime() > todayUtc.getTime();
      const isPast = !isActive && !isFuture;

      if (filter === 'active') return isActive && !isFuture && !hasBeenTerminated;
      if (filter === 'inactive') return isFuture && !hasBeenTerminated;
      if (filter === 'expired') return isPast && !hasBeenTerminated;
      if (filter === 'terminated') return hasBeenTerminated;
      return false;
    });
  }, [tenants, filter]);

  const getNoTenantsMessage = () => {
    switch (filter) {
      case 'active': return t('tenantsPage.noActiveTenants');
      case 'inactive': return t('tenantsPage.noInactiveTenants');
      case 'expired': return t('tenantsPage.noExpiredTenants');
      case 'terminated': return t('tenantsPage.noTerminatedTenants');
    }
  };

  const totalAlertsCount = 
    (canViewAlerts ? alerts.length : 0) + 
    (canViewAlerts ? expiringContracts.length : 0) + 
    (canViewAlerts ? incompletePayments.length : 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24 font-sans text-slate-800 dark:text-slate-200" dir="rtl">
      
      {/* Custom Top Header with Filters */}
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 rounded-b-2xl mb-4 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Right side: Name and Back */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors flex items-center justify-center"
              title="رجوع"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 rtl:rotate-180 transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h1 className="text-lg md:text-xl font-extrabold text-slate-800 dark:text-white truncate max-w-[150px] md:max-w-[300px]">
              {decodedBuildingName}
            </h1>
          </div>

          {/* Left side: Add Tenant and Alerts */}
          <div className="flex items-center gap-2">
            {canViewAlerts && (
              <button
                onClick={() => setIsAlertsModalOpen(true)}
                className="relative p-1.5 text-orange-600 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-400 rounded-lg transition-colors flex items-center justify-center shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {totalAlertsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-sm animate-pulse">
                    {totalAlertsCount}
                  </span>
                )}
              </button>
            )}

            {canAddTenants && (
              <button
                onClick={() => navigate(`/${buildingName}/tenants/add`)}
                className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 px-3 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                title="إضافة مستأجر"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="text-sm font-bold">إضافة</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters (Directly under Building Name) */}
        <div className="px-4 pb-3">
          <div className="flex flex-row gap-2 w-full overflow-x-auto no-scrollbar justify-start">
            {(['active', 'inactive', 'expired', 'terminated'] as const).map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 shadow-sm border flex-shrink-0
                  ${filter === filterType
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
              >
                {t(`tenantsPage.filter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Area (Tenants List) */}
      <div className="px-4 max-w-7xl mx-auto">

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTenants.length > 0 ? filteredTenants.map(tenant => {
            const isContractActive = tenant.startDate && tenant.duration > 0 && !tenant.terminationDate;
            const effectiveEndDate = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
            const isExpanded = expandedTenants.has(tenant.flatNo);

            return (
              <div
                key={tenant.flatNo}
                className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-5 rounded-3xl shadow-sm border border-white/50 dark:border-slate-700/50 flex flex-col transition-all duration-300 cursor-pointer select-none hover:shadow-lg hover:-translate-y-1 ${isExpanded ? 'ring-2 ring-blue-500 shadow-md scale-[1.02]' : ''}`}
                onDoubleClick={() => toggleTenantExpansion(tenant.flatNo)}
              >
                <div className="flex-grow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{tenant.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-700 inline-block px-2 py-0.5 rounded-md mt-1">{t('tenantsPage.flatNo')}: {getDisplayFlatNo(tenant)}</p>
                      {!isExpanded && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{t('tenantsPage.doubleTapHint')}</p>}
                    </div>
                    {isExpanded && (
                      <div className="text-xs text-slate-400 text-left bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded">
                        {tenant.contractNo && <p>{t('tenantsPage.contractNo')}: {tenant.contractNo}</p>}
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <>
                      <div className="border-t border-slate-100 dark:border-slate-700 my-3"></div>
                      <div className="space-y-1.5 text-sm">
                        <p><span className="text-slate-500 dark:text-slate-400">{t('tenantsPage.phone')}:</span> <span className="font-semibold">{tenant.phone}</span></p>
                        {tenant.city && <p><span className="text-slate-500 dark:text-slate-400">{t('tenantForm.city')}:</span> <span className="font-semibold">{tenant.city}</span></p>}
                        {tenant.district && <p><span className="text-slate-500 dark:text-slate-400">{t('tenantForm.district')}:</span> <span className="font-semibold">{tenant.district}</span></p>}
                        <p><span className="text-slate-500 dark:text-slate-400">{t('tenantsPage.nationality')}:</span> <span className="font-semibold">{tenant.nationality}</span></p>
                        {tenant.startDate ? (
                          <>
                            <p><span className="text-slate-500 dark:text-slate-400">{t('tenantsPage.amount')}:</span> <span className="font-bold text-green-600 dark:text-green-400">{tenant.amount.toFixed(2)}</span></p>
                            {tenant.electricityMeterNumber && (
                              <p><span className="text-slate-500 dark:text-slate-400">{t('tenantForm.electricityMeterNumber')}:</span> <span className="font-semibold">{tenant.electricityMeterNumber}</span></p>
                            )}
                            <p><span className="text-slate-500 dark:text-slate-400">{t('tenantsPage.startDate')}:</span> <span className="font-semibold">{formatDateForUi(tenant.startDate, 'N/A', '-')}</span></p>
                            {tenant.terminationDate && (
                              <p><span className="text-red-500 dark:text-red-400">{t('tenantsPage.terminationDateLabelCard')}:</span> <span className="font-bold text-red-600 dark:text-red-400">{formatDateForUi(tenant.terminationDate, 'N/A', '-')}</span></p>
                            )}
                            <p><span className="text-slate-500 dark:text-slate-400">{t('tenantsPage.endDate')}:</span> <span className="font-semibold">{formatDateForUi(effectiveEndDate, 'N/A', '-')}</span></p>
                          </>
                        ) : (
                          <p className="font-semibold text-amber-600 dark:text-amber-400">{t('tenantsPage.noActiveContract')}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {isExpanded && (
                  <>
                    <div className="border-t border-slate-100 dark:border-slate-700 my-3"></div>
                    <div className="flex justify-end gap-2 flex-wrap">
                      {canViewPayments && (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/${buildingName}/tenants/${tenant.flatNo}/payments`); }} className="bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50">
                          {t('tenantsPage.payments')}
                        </button>
                      )}
                      {!tenant.terminationDate && (
                        <button onClick={(e) => { e.stopPropagation(); handleRenew(tenant); }} className="bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50">
                          {t('tenantsPage.renew')}
                        </button>
                      )}
                      {
                        (filter === 'active' || filter === 'inactive') && canEditTenants && (
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/${buildingName}/tenants/edit/${tenant.flatNo}`); }} className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/50">
                            {t('tenantsPage.edit')}
                          </button>
                        )
                      }
                      {
                        isContractActive && isOwner && (
                          <button onClick={(e) => { e.stopPropagation(); promptTerminateContract(tenant); }} className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/50">
                            {t('tenantsPage.terminateContract')}
                          </button>
                        )
                      }
                      {
                        tenant.terminationDate && isOwner && showDeleteTerminatedTenant && (
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant); }} className="bg-red-600 text-white border border-red-700 dark:bg-red-700 dark:border-red-800 dark:text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 dark:hover:bg-red-600 shadow-sm shadow-red-500/20">
                            حذف نهائي
                          </button>
                        )
                      }
                      <button onClick={(e) => { e.stopPropagation(); setHistoryTenant(tenant); setIsHistoryModalOpen(true); }} className="bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-100 dark:hover:bg-purple-900/50">
                        {t('tenantsPage.previousContracts')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          }) : (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <p className="text-slate-500 dark:text-slate-400 font-medium">{getNoTenantsMessage()}</p>
            </div>
          )}
        </div>
      </div>

      {/* --- Fixed Bottom Navigation Bar --- */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-slate-200/50 dark:border-slate-700/50 pb-safe shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50 rounded-t-3xl">
        <div className="flex justify-between items-center h-16 max-w-md mx-auto px-2 relative">
          
          {(canViewReports || canViewExpenses) && (
            <button onClick={() => setIsFinanceMenuOpen(true)} className="flex-1 flex flex-col items-center justify-center h-full text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors group relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              <span className="text-[10px] font-bold">المالية</span>
            </button>
          )}

          {canViewInquiry && (
            <button onClick={() => setIsInquiryModalOpen(true)} className="flex-1 flex flex-col items-center justify-center h-full text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors group relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <span className="text-[10px] font-bold">الاستعلام</span>
            </button>
          )}

          {canViewEvents && (
            <button onClick={() => navigate(`/${buildingName}/events`)} className="flex-1 flex flex-col items-center justify-center h-full text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors group relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span className="text-[10px] font-bold">الأحداث</span>
            </button>
          )}



          {canViewUnits && (
            <button
              onClick={isOwner ? handleEditStats : () => setIsViewUnitsModalOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center h-full text-slate-500 transition-colors group relative hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              <span className="text-[10px] font-bold">الوحدات</span>
              <span className="absolute top-1 ml-6 bg-slate-100 text-slate-800 text-[9px] font-extrabold px-1.5 rounded-full shadow-sm">{stats.totalUnits}</span>
            </button>
          )}

        </div>
      </div>

      {/* --- Modals --- */}
      
      {/* Finance Menu Modal */}
      <Modal
        isOpen={isFinanceMenuOpen}
        onClose={() => setIsFinanceMenuOpen(false)}
        title="المالية والمزيد"
      >
        <div className="space-y-3 pb-2">
          {canViewReports && (
            <Link to={`/${buildingName}/rentals`} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors border border-slate-100 dark:border-slate-600 shadow-sm">
              <div className="bg-amber-100 dark:bg-amber-900/50 p-3 rounded-full text-amber-600 dark:text-amber-400">
                <span className="text-xl">💰</span>
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-100 text-lg">تقارير الإيجارات</span>
            </Link>
          )}
          {canViewExpenses && (
            <Link to={`/${buildingName}/expenses`} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors border border-slate-100 dark:border-slate-600 shadow-sm">
              <div className="bg-rose-100 dark:bg-rose-900/50 p-3 rounded-full text-rose-600 dark:text-rose-400">
                <span className="text-xl">💸</span>
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-100 text-lg">المصروفات</span>
            </Link>
          )}
          <Link to={`/${buildingName}/notes`} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors border border-slate-100 dark:border-slate-600 shadow-sm">
            <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full text-blue-600 dark:text-blue-400">
              <span className="text-xl">📝</span>
            </div>
            <span className="font-bold text-slate-800 dark:text-slate-100 text-lg">الملاحظات</span>
          </Link>
        </div>
      </Modal>

      {/* Combined Alerts Modal */}
      <Modal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
        title={t('buildingPage.alertsModalTitle')}
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {totalAlertsCount === 0 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl">{t('buildingPage.noAlerts')}</p>
          ) : (
            <div className="space-y-6">
              
              {canViewAlerts && alerts.length > 0 && (
                <div>
                  <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    الدفعات المستحقة والمستقبلية
                  </h3>
                  <ul className="space-y-3">
                    {alerts.map(p => {
                      const status = getPaymentStatus(p.dueDate);
                      const tenant = findTenantForPayment(tenants, p.tenantFlatNo);
                      const tenantName = tenant ? tenant.name : t('buildingPage.unknownTenant');
                      const displayFlat = tenant ? getDisplayFlatNo(tenant) : cleanFlatNo(p.tenantFlatNo);

                      let statusColor = 'text-amber-600 dark:text-amber-400';
                      let itemBg = 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 border border-slate-100 dark:border-slate-600';

                      if (status === 'overdue') {
                        statusColor = 'text-red-600 dark:text-red-400';
                        itemBg = 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30';
                      } else if (status === 'dueToday') {
                        statusColor = 'text-orange-600 dark:text-orange-400';
                        itemBg = 'bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30';
                      }

                      return (
                        <li
                          key={p.id}
                          className={`p-4 rounded-xl cursor-pointer transition-colors shadow-sm ${itemBg}`}
                          onClick={() => {
                            navigate(`/${buildingName}/tenants/${p.tenantFlatNo}/payments?from=alerts`);
                            setIsAlertsModalOpen(false);
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-100 block">{tenantName}</span>
                              <span className="text-xs text-slate-500 font-medium">{t('buildingPage.flat')} {displayFlat}</span>
                            </div>
                            <span className={`text-sm font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded-md shadow-sm ${statusColor}`}>
                              {p.paidAmount && p.paidAmount > 0 
                                ? (status === 'overdue' ? t('buildingPage.partialOverdue') : status === 'dueToday' ? t('buildingPage.partialDueToday') : t('buildingPage.partialUpcoming'))
                                : (status === 'overdue' ? t('buildingPage.overdue') : status === 'dueToday' ? t('buildingPage.dueToday') : t('buildingPage.upcoming'))}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-3 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18" />
                            </svg>
                            {t('buildingPage.paymentDueOn')} {p.dueDate}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {canViewAlerts && expiringContracts.length > 0 && (
                <div>
                  <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    عقود منتهية وقاربت على الانتهاء
                  </h3>
                  <ul className="space-y-3">
                    {expiringContracts.map(tenant => {
                      const endDate = parseDate(calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit));
                      const today = getTodayUtc();
                      const diffTime = endDate ? endDate.getTime() - today.getTime() : 0;
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                      return (
                        <li
                          key={tenant.flatNo}
                          className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                        >
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 block">{tenant.name}</span>
                            <span className="text-xs text-slate-500 font-medium">{t('buildingPage.flat')} {getDisplayFlatNo(tenant)}</span>
                            <p className="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-2">
                              {t('buildingPage.daysRemaining').replace('{days}', String(diffDays))}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              navigate(`/${buildingName}/tenants/renew/${tenant.flatNo}?from=expiring`);
                              setIsAlertsModalOpen(false);
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 w-full sm:w-auto"
                          >
                            {t('buildingPage.renewContractPrompt')}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {canViewAlerts && incompletePayments.length > 0 && (
                <div>
                  <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                    دفعات ناقصة
                  </h3>
                  <ul className="space-y-3">
                    {incompletePayments.map(p => {
                      const tenant = findTenantForPayment(tenants, p.tenantFlatNo);
                      const tenantName = tenant ? tenant.name : t('buildingPage.unknownTenant');
                      const displayFlat = tenant ? getDisplayFlatNo(tenant) : cleanFlatNo(p.tenantFlatNo);
                      const remainingAmount = p.amount - (p.paidAmount || 0);

                      return (
                        <li
                          key={p.id}
                          className="p-4 rounded-xl cursor-pointer bg-pink-50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-900/30 hover:bg-pink-100 shadow-sm transition-colors"
                          onClick={() => {
                            navigate(`/${buildingName}/tenants/${p.tenantFlatNo}/payments`);
                            setIsAlertsModalOpen(false);
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-100 block">{tenantName}</span>
                              <span className="text-xs text-slate-500 font-medium">{t('buildingPage.flat')} {displayFlat}</span>
                            </div>
                            <span className="text-sm font-bold text-pink-600 dark:text-pink-400 bg-white dark:bg-slate-800 px-2 py-1 rounded-md shadow-sm">
                              الإجمالي: {p.amount}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-3 pt-3 border-t border-pink-200/50 dark:border-pink-800/50">
                             <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                 <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18" />
                               </svg>
                               {p.dueDate}
                             </p>
                             <div className="flex items-center gap-3 text-xs font-bold bg-white dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
                               <span className="text-emerald-600 dark:text-emerald-400 text-[11px] md:text-xs">المدفوع: {p.paidAmount}</span>
                               <span className="w-px h-4 bg-slate-300 dark:bg-slate-500"></span>
                               <span className="text-pink-600 dark:text-pink-400 text-[11px] md:text-xs">المتبقي: {remainingAmount}</span>
                             </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

            </div>
          )}
        </div>
      </Modal>

      {/* Edit Units Modal */}
      <Modal
        isOpen={isEditUnitsModalOpen}
        onClose={() => setIsEditUnitsModalOpen(false)}
        title={t('buildingPage.updateUnitsModalTitle')}
      >
        <form onSubmit={handleRequestSave}>
          <div className="space-y-4">
            <div>
              <label htmlFor="totalUnits" className="block mb-2 font-bold text-slate-700 dark:text-slate-300">{t('buildingPage.totalUnitsLabel')}</label>
              <input
                type="number"
                id="totalUnits"
                min="0"
                value={editTotalUnits}
                onChange={e => setEditTotalUnits(Number(e.target.value))}
                className="w-full text-center p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold text-lg"
              />
            </div>
            <div>
              <label className="block mb-2 text-slate-700 dark:text-slate-300 font-semibold">{t('buildingPage.availableUnitsNumbers')}</label>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl max-h-[30vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
                {stats.availableUnits > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const occupiedUnits = new Set(tenants.map(t => {
                        const startDate = parseDate(t.startDate);
                        const endDate = t.terminationDate
                          ? parseDate(t.terminationDate)
                          : parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));
                        const today = getTodayUtc();
                        if (startDate && endDate && (t.terminationDate ? endDate.getTime() > today.getTime() : endDate.getTime() >= today.getTime())) {
                          return t.flatNo;
                        }
                        return null;
                      }).filter(Boolean));

                      const units = [];
                      for (let i = 1; i <= Math.max(stats.totalUnits, editTotalUnits); i++) {
                        units.push(i);
                      }

                      return units.map(unit => {
                        const isOccupied = occupiedUnits.has(String(unit));
                        return (
                          <span
                            key={unit}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm font-bold shadow-sm ${isOccupied
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400 border border-amber-200'
                              : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 border border-emerald-200'
                              }`}
                            title={isOccupied ? t('buildingPage.occupied') : t('buildingPage.available')}
                          >
                            {unit}
                          </span>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">{t('buildingPage.noUnits')}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button type="button" onClick={() => setIsEditUnitsModalOpen(false)} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2.5 rounded-xl font-bold">{t('addBuildingModal.cancel')}</button>
              <button type="submit" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-md hover:bg-emerald-700 font-bold">{t('buildingPage.saveUpdate')}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Worker Read-Only Units View Modal */}
      <Modal
        isOpen={isViewUnitsModalOpen}
        onClose={() => setIsViewUnitsModalOpen(false)}
        title="الوحدات"
      >
        <div className="space-y-4">
          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-center border border-slate-200 dark:border-slate-700">
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{stats.totalUnits}</p>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">إجمالي</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3 text-center border border-amber-200 dark:border-amber-800/50">
              <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{stats.rentedUnits}</p>
              <p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 mt-0.5">مشغولة</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 text-center border border-emerald-200 dark:border-emerald-800/50">
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{stats.availableUnits}</p>
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 mt-0.5">متاحة</p>
            </div>
          </div>

          {/* Units Grid */}
          {stats.totalUnits > 0 ? (
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">خريطة الوحدات</p>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl max-h-[35vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const occupiedUnits = new Set(tenants.map(t => {
                      const startDate = parseDate(t.startDate);
                      const endDate = t.terminationDate
                        ? parseDate(t.terminationDate)
                        : parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));
                      const today = getTodayUtc();
                      if (startDate && endDate && (t.terminationDate ? endDate.getTime() > today.getTime() : endDate.getTime() >= today.getTime())) return t.flatNo;
                      return null;
                    }).filter(Boolean));

                    return Array.from({ length: stats.totalUnits }, (_, i) => i + 1).map(unit => {
                      const isOccupied = occupiedUnits.has(String(unit));
                      return (
                        <span
                          key={unit}
                          className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm font-bold shadow-sm ${
                            isOccupied
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400 border border-amber-200'
                              : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 border border-emerald-200'
                          }`}
                          title={isOccupied ? 'مشغولة' : 'متاحة'}
                        >
                          {unit}
                        </span>
                      );
                    });
                  })()}
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold">
                  <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block"></span>مشغولة
                </span>
                <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                  <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200 inline-block"></span>متاحة
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">لا توجد وحدات مسجلة</p>
          )}
        </div>
      </Modal>

      {/* Password Confirm Modal for Units */}
      <Modal
        isOpen={isPasswordConfirmOpen}
        onClose={() => setIsPasswordConfirmOpen(false)}
        title={t('buildingPage.updateUnitsModalTitle')}
      >
        <form onSubmit={handleConfirmSave}>
          <div className="space-y-4">
            <p className="text-slate-700 dark:text-slate-300 text-center mb-4 font-medium">
              {t('buildingPage.secretCode')}
            </p>
            <div>
              <input
                type="password"
                value={updatePassword}
                onChange={e => setUpdatePassword(e.target.value)}
                required
                placeholder={t('buildingPage.secretCode')}
                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setIsPasswordConfirmOpen(false)} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2 rounded-xl font-bold">{t('addBuildingModal.cancel')}</button>
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-xl shadow-md font-bold">{t('addBuildingModal.save')}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Inquiry Modal */}
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
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
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
            const paymentCount = Number(tenant.paymentsCount) || 1;
            return (
              <div key={tenant.flatNo} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex justify-between items-start mb-2.5">
                  <div>
                    <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100">{getDisplayFlatNo(tenant)}</h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      المستأجر: <strong className="text-slate-800 dark:text-slate-200">{tenant.name}</strong>
                    </span>
                  </div>
                  {isOwner && <button
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
                  </button>}
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs md:text-sm text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.endDate')}:</span> <span style={{ fontFamily: 'Inter, sans-serif' }}>{formatDateForUi(effectiveEndDate, 'N/A', '-')}</span></p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.amount')}:</span> <span className="font-bold text-green-600 font-inter">{tenant.amount.toFixed(2)}</span></p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">عدد الدفعات:</span> <span className="font-bold text-blue-600 dark:text-blue-400">{formatPaymentsDisplay(tenant)}</span></p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">قيمة الدفعة الواحدة:</span> <span className="font-bold">{(tenant.amount / paymentCount).toFixed(2)}</span></p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.phone')}:</span> <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>{tenant.phone}</span></p>
                </div>
              </div>
            );
          })}
          {inquiryTenants.length === 0 && (
            <p className="text-center text-slate-500 py-6">{t('tenantsPage.noTenantsFound')}</p>
          )}
          <div className="flex justify-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
            {isOwner && <button
              type="button"
              onClick={handleShareAll}
              disabled={isSharingAll}
              className={`bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center gap-2 ${isSharingAll ? 'opacity-70 cursor-wait scale-95' : 'hover:scale-105'}`}
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
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  {t('tenantsPage.shareAll')}
                </>
              )}
            </button>}
          </div>
        </div>
      </Modal>

      {/* Inquiry PDF Share Fallback Modal */}
      <Modal
        isOpen={isInquiryShareFallbackOpen}
        onClose={() => setIsInquiryShareFallbackOpen(false)}
        title="تنزيل ملف PDF"
      >
        <div className="text-center space-y-4">
          <p className="text-slate-700 dark:text-slate-300">الملف جاهز للتنزيل</p>
          {inquiryDownloadUrl && inquiryShareableFile && (
            <a
              href={inquiryDownloadUrl}
              download={inquiryShareableFile.name}
              onClick={() => setTimeout(() => setIsInquiryShareFallbackOpen(false), 300)}
              className="inline-block w-full bg-blue-600 text-white px-6 py-3 rounded-xl shadow-md hover:bg-blue-700 hover:shadow-lg transition-all duration-300 mt-4 font-bold"
            >
              📥 تنزيل PDF
            </a>
          )}
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={t('tenantsPage.previousContracts')}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {historyTenant && historyTenant.history && historyTenant.history.length > 0 ? (
            historyTenant.history.slice().reverse().map((contract, index) => (
              <div key={index} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-3 pb-2 border-b border-slate-200 dark:border-slate-600">
                  {t('tenantForm.contractLabel')} {historyTenant.history!.length - index}
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.startDate')}:</span> {formatDateForUi(contract.startDate, 'N/A', '-')}</p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.endDate')}:</span> {formatDateForUi(calculateEndDate(contract.startDate, Number(contract.duration), contract.durationUnit), 'N/A', '-')}</p>
                  <p><span className="font-semibold text-slate-800 dark:text-slate-200">{t('tenantsPage.amount')}:</span> <span className="font-bold text-green-600">{contract.amount.toFixed(2)}</span></p>
                  {contract.terminationDate && (
                    <p className="col-span-2"><span className="font-semibold text-red-600">{t('tenantsPage.terminationDateLabelCard')}:</span> {formatDateForUi(contract.terminationDate, 'N/A', '-')}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-slate-500 py-6">{t('tenantsPage.noExpiredTenants')}</p>
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

      {/* Terminate Modal */}
      <Modal
        isOpen={isTerminateModalOpen}
        onClose={() => setIsTerminateModalOpen(false)}
        title={t('tenantsPage.terminateModalTitle')}
      >
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            {t('tenantsPage.terminateModalMessage').replace('{tenantName}', tenantToTerminate?.name || '')}
          </p>
          <div>
            <label htmlFor="terminationDate" className="block mb-2 font-semibold text-slate-700 dark:text-slate-300">
              {t('tenantsPage.terminationDateLabel')}
            </label>
            <div className="relative" style={{ direction: 'ltr' }}>
              <div className="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none z-10">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18" />
                </svg>
              </div>
              <div
                onClick={() => setShowDatePicker(true)}
                className="w-full p-3 text-left ps-12 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 cursor-pointer font-bold"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {formatDateForDisplayPadded(terminationDate, '', '/')}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsTerminateModalOpen(false)} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2.5 rounded-xl font-bold">{t('addBuildingModal.cancel')}</button>
            <button type="button" onClick={handleConfirmTermination} className="bg-red-600 text-white px-5 py-2.5 rounded-xl shadow-md font-bold">{t('tenantsPage.terminateContract')}</button>
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

      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onSelect={(date) => {
          setTerminationDate(formatDateForInput(date));
        }}
        initialDate={parseDate(terminationDate) || undefined}
      />

      {/* Hidden Print Areas */}
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
                <th className="p-2 border border-slate-200">{t('tenantsPage.flatNo')}</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.name')}</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.endDate')}</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.amount')}</th>
                <th className="p-2 border border-slate-200">عدد الدفعات</th>
                <th className="p-2 border border-slate-200">قيمة الدفعة الواحدة</th>
                <th className="p-2 border border-slate-200">{t('tenantsPage.phone')}</th>
              </tr>
            </thead>
            <tbody>
              {inquiryTenants.map((tenant, index) => {
                const effectiveEndDate = tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
                const paymentCount = Number(tenant.paymentsCount) || 1;
                return (
                  <tr key={index} className="border-b border-slate-200">
                    <td className="p-2 border border-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>{getDisplayFlatNo(tenant)}</td>
                    <td className="p-2 border border-slate-200 font-bold">{tenant.name}</td>
                    <td className="p-2 border border-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>{formatDateForUi(effectiveEndDate, 'N/A', '-')}</td>
                    <td className="p-2 border border-slate-200 font-bold text-green-600" style={{ fontFamily: 'Inter, sans-serif' }}>{tenant.amount.toFixed(2)}</td>
                    <td className="p-2 border border-slate-200 font-medium">{formatPaymentsDisplay(tenant)}</td>
                    <td className="p-2 border border-slate-200 font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>{(tenant.amount / paymentCount).toFixed(2)}</td>
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

    </div>
  );
};

export default BuildingPage;
