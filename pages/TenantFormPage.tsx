import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useSettings } from '../contexts/SettingsContext';
import { getTenantByFlatNo, saveTenant, getBuildingStats, getTenantsByBuilding, verifyPassword, cleanFlatNo, storeIdPhoto, resolveIdPhoto } from '../services/dbService';
import DatePickerModal from '../components/DatePickerModal';
import UnitSelectionModal from '../components/UnitSelectionModal';
import { Tenant, Payment } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { calculateEndDate, formatDateForDisplayPadded, formatDateForInput, parseDate, getTodayUtc } from '../utils/dateUtils';
import { preprocessImage, extractIdDataFromImage, shrinkDataUrl } from '../utils/ocrUtils';
import AccessDenied from '../components/AccessDenied';
import { usePermissions } from '../hooks/usePermissions';

const TenantFormPage: React.FC = () => {
    const { buildingName, flatNo } = useParams<{ buildingName: string; flatNo?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : '';

    const isEditing = location.pathname.includes('/edit/');
    const isRenewing = location.pathname.includes('/renew/');
    const { t } = useTranslation();
    const { can, canAccessBuilding, canAccessUnit } = usePermissions();
    const hasFormPermission = isRenewing ? can('canRenewContracts') : isEditing ? can('canEditTenants') : can('canAddTenants');
    const { showContractInfo } = useSettings();

    const [tenant, setTenant] = useState<Tenant>({
        name: '', nationality: '', idNumber: '', phone: '', flatNo: '', electricityMeterNumber: '', contractNo: '',
        startDate: formatDateForInput(new Date()),
        duration: 1, durationUnit: 'years', amount: 0, paymentsCount: 1, paymentFrequency: 'annual', building: decodedBuildingName,
        history: [],
    });

    const [availableUnits, setAvailableUnits] = useState<string[]>([]);
    const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [isFlatNoUnlocked, setIsFlatNoUnlocked] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showUnitModal, setShowUnitModal] = useState(false);
    const [isScheduleOpen, setIsScheduleOpen] = useState(false);

    // ID Photo and OCR State
    const [isOcrLoading, setIsOcrLoading] = useState(false);
    const [ocrMessage, setOcrMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
    const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
    const [isPhotoSectionOpen, setIsPhotoSectionOpen] = useState(false);
    // Displayable image for tenant.idPhoto (which may be a stored reference rather than an image).
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const loadedPhotoRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        const value = tenant.idPhoto;
        if (!value) { setPhotoPreview(null); return; }
        if (value.startsWith('data:')) { setPhotoPreview(value); return; }
        if (loadedPhotoRef.current === value) return;
        loadedPhotoRef.current = value;
        let cancelled = false;
        resolveIdPhoto(value).then(url => { if (!cancelled) setPhotoPreview(url); });
        return () => { cancelled = true; };
    }, [tenant.idPhoto]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (decodedBuildingName) {
            const buildingStats = getBuildingStats(decodedBuildingName);
            const buildingTenants = getTenantsByBuilding(decodedBuildingName);
            const occupied = new Set<string>();
            const today = getTodayUtc();

            buildingTenants.forEach(t => {
                const startDate = parseDate(t.startDate);
                const endDate = t.terminationDate
                    ? parseDate(t.terminationDate)
                    : parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));

                if (startDate && endDate && endDate >= today) {
                    occupied.add(t.flatNo);
                }
            });

            const available: string[] = [];
            for (let i = 1; i <= buildingStats.totalUnits; i++) {
                if (!occupied.has(String(i))) {
                    available.push(String(i));
                }
            }
            setAvailableUnits(available);
        }
    }, [decodedBuildingName, isEditing, isRenewing]);

    useEffect(() => {
        if (flatNo) {
            const tenantData = getTenantByFlatNo(decodedBuildingName, flatNo);
            if (tenantData) {
                if (isRenewing) {
                    let newStartDate = formatDateForInput(new Date());
                    const { startDate, duration, durationUnit } = tenantData;
                    const start = parseDate(startDate);
                    if (start && typeof duration === 'number' && duration > 0) {
                        if (durationUnit === 'months') {
                            start.setUTCMonth(start.getUTCMonth() + Math.round(duration));
                        } else {
                            start.setUTCFullYear(start.getUTCFullYear() + Number(duration));
                        }
                        newStartDate = formatDateForInput(start);
                    }
                    setTenant({
                        ...tenantData,
                        durationUnit: tenantData.durationUnit || 'years',
                        startDate: newStartDate,
                        contractNo: '',
                    });
                } else { // isEditing
                    setTenant({
                        ...tenantData,
                        durationUnit: tenantData.durationUnit || 'years',
                    });
                }
            }
        }
    }, [isEditing, isRenewing, flatNo, decodedBuildingName]);

    // Calculate total duration in months for installments calculation
    const totalDurationInMonths = useMemo(() => {
        const dur = Number(tenant.duration) || 0;
        if (tenant.durationUnit === 'months') {
            return dur;
        }
        return dur * 12;
    }, [tenant.duration, tenant.durationUnit]);

    // Calculate paymentsCount based on frequency and duration
    const calculatePaymentsForFrequency = (frequency: string, months: number): number => {
        const m = Math.max(1, months || 12);
        switch (frequency) {
            case 'monthly':
                return m;
            case 'quarterly':
                return Math.max(1, Math.round(m / 3));
            case 'semi-annual':
                return Math.max(1, Math.round(m / 6));
            case 'annual':
                return Math.max(1, Math.round(m / 12));
            default:
                return Number(tenant.paymentsCount) || 1;
        }
    };

    const handleDurationUnitChange = (newUnit: 'months' | 'years') => {
        if (newUnit === tenant.durationUnit) return;
        let newDuration = Number(tenant.duration) || 1;

        if (newUnit === 'months') {
            // Converted from years to months: 1 year -> 12 months, capped at 24
            newDuration = Math.min(24, Math.max(1, newDuration * 12));
        } else {
            // Converted from months to years: 12 months -> 1 year, capped at 10
            newDuration = Math.min(10, Math.max(1, Math.round(newDuration / 12)));
        }

        const newMonths = newUnit === 'months' ? newDuration : newDuration * 12;
        const newPayments = tenant.paymentFrequency && tenant.paymentFrequency !== 'custom'
            ? calculatePaymentsForFrequency(tenant.paymentFrequency, newMonths)
            : tenant.paymentsCount;

        setTenant(prev => ({
            ...prev,
            durationUnit: newUnit,
            duration: newDuration,
            paymentsCount: newPayments
        }));
    };

    const handleDurationChange = (valStr: string) => {
        let val = valStr.replace(/[^0-9]/g, '');
        if (val === '') {
            setTenant(prev => ({ ...prev, duration: '' as any }));
            return;
        }
        let numVal = Number(val);
        const isMonthly = tenant.durationUnit === 'months';
        const maxVal = isMonthly ? 24 : 10;
        if (numVal > maxVal) {
            numVal = maxVal;
        }
        if (numVal < 1) {
            numVal = 1;
        }

        const newMonths = isMonthly ? numVal : numVal * 12;
        const newPayments = tenant.paymentFrequency && tenant.paymentFrequency !== 'custom'
            ? calculatePaymentsForFrequency(tenant.paymentFrequency, newMonths)
            : tenant.paymentsCount;

        setTenant(prev => ({
            ...prev,
            duration: numVal,
            paymentsCount: newPayments
        }));
    };

    const handlePaymentFrequencyChange = (frequency: string) => {
        if (frequency === 'custom') {
            setTenant(prev => ({ ...prev, paymentFrequency: 'custom' }));
            return;
        }

        const newCount = calculatePaymentsForFrequency(frequency, totalDurationInMonths);
        setTenant(prev => ({
            ...prev,
            paymentFrequency: frequency,
            paymentsCount: newCount
        }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numericInputFields = ['idNumber', 'phone', 'flatNo', 'electricityMeterNumber', 'contractNo', 'amount', 'paymentsCount'];

        if (numericInputFields.includes(name)) {
            const sanitizedValue = value.replace(/[^0-9]/g, '');
            if (name === 'paymentsCount') {
                if (tenant.paymentFrequency && tenant.paymentFrequency !== 'custom') {
                    return; // Prevent editing when a frequency is selected
                }
                const count = sanitizedValue === '' ? '' : Number(sanitizedValue);
                setTenant(prev => ({
                    ...prev,
                    paymentsCount: count as any,
                    paymentFrequency: 'custom' // Manual override
                }));
            } else if (name === 'amount') {
                setTenant(prev => ({
                    ...prev,
                    amount: sanitizedValue === '' ? '' : Number(sanitizedValue) as any
                }));
            } else {
                setTenant(prev => ({ ...prev, [name]: sanitizedValue }));
            }
        } else {
            setTenant(prev => ({ ...prev, [name]: value }));
        }
    };

    // Handle Image Upload and OCR
    const processImageFile = async (file: File) => {
        try {
            setIsPhotoSectionOpen(true);
            setIsOcrLoading(true);
            setOcrMessage({ type: 'info', text: 'جاري فحص وقراءة بيانات الهوية / الإقامة...' });

            const optimizedDataUrl = await preprocessImage(file);
            setTenant(prev => ({ ...prev, idPhoto: optimizedDataUrl }));

            const extracted = await extractIdDataFromImage(optimizedDataUrl);

            const updates: Partial<Tenant> = {};
            const foundFields: string[] = [];

            if (extracted.name && extracted.name.trim().length > 2) {
                updates.name = extracted.name.trim();
                foundFields.push('الاسم');
            }
            if (extracted.idNumber && extracted.idNumber.length === 10) {
                updates.idNumber = extracted.idNumber;
                foundFields.push('رقم الهوية');
            }
            if (extracted.nationality && extracted.nationality.trim().length > 1) {
                updates.nationality = extracted.nationality.trim();
                foundFields.push('الجنسية');
            }

            if (foundFields.length > 0) {
                setTenant(prev => ({
                    ...prev,
                    ...updates
                }));
                setOcrMessage({
                    type: 'success',
                    text: `تم استخراج (${foundFields.join('، ')}) تلقائياً بنجاح! يمكنك مراجعتها وتعديلها.`
                });
            } else {
                setOcrMessage({
                    type: 'info',
                    text: 'لم نتمكن من قراءة البيانات تلقائياً بوضوح. يمكنك إدخال البيانات يدوياً في الحقول أدناه.'
                });
            }
        } catch (err) {
            console.error('Image processing error:', err);
            setOcrMessage({
                type: 'error',
                text: 'تعذر استخراج البيانات من الصورة. يمكنك إدخال البيانات يدوياً بكل سهولة.'
            });
        } finally {
            setIsOcrLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processImageFile(file);
        }
        e.target.value = '';
    };

    const handleRemovePhoto = () => {
        setTenant(prev => ({ ...prev, idPhoto: undefined }));
        setOcrMessage(null);
    };

    const endDate = useMemo(() => {
        return tenant.terminationDate || calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
    }, [tenant.startDate, tenant.duration, tenant.durationUnit, tenant.terminationDate]);

    const paymentSchedule = useMemo(() => {
        const { startDate, amount, paymentsCount, duration, durationUnit } = tenant;
        const payments: Partial<Payment>[] = [];

        const isValidNumber = (val: any): val is number => typeof val === 'number' && isFinite(val) && val > 0;
        if (!startDate || !isValidNumber(amount) || !isValidNumber(paymentsCount) || !isValidNumber(duration)) {
            return [];
        }

        const start = parseDate(startDate);
        if (!start) {
            return [];
        }
        const singlePaymentAmount = Math.round((amount / paymentsCount) * 100) / 100;
        const totalMonths = durationUnit === 'months' ? Number(duration) : Number(duration) * 12;
        const intervalMonths = totalMonths / paymentsCount;

        for (let i = 0; i < paymentsCount; i++) {
            const dueDate = new Date(start.getTime());
            dueDate.setUTCMonth(start.getUTCMonth() + Math.round(intervalMonths * i));
            payments.push({
                paymentNo: i + 1,
                dueDate: formatDateForInput(dueDate),
                amount: singlePaymentAmount,
            });
        }
        return payments;
    }, [tenant.startDate, tenant.amount, tenant.paymentsCount, tenant.duration, tenant.durationUnit]);

    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            const finalDuration = Number(tenant.duration) || 1;
            const isMonthly = tenant.durationUnit === 'months';
            const clampedDuration = isMonthly
                ? Math.min(24, Math.max(1, finalDuration))
                : Math.min(10, Math.max(1, finalDuration));

            const tenantToSave = {
                ...tenant,
                duration: clampedDuration,
                paymentsCount: Number(tenant.paymentsCount) || 1
            };

            // A newly attached photo is uploaded on its own; only a short reference is kept on the tenant.
            if (tenantToSave.idPhoto && tenantToSave.idPhoto.startsWith('data:')) {
                const forUpload = await shrinkDataUrl(tenantToSave.idPhoto, 1200, 0.75);
                const inlineFallback = await shrinkDataUrl(tenantToSave.idPhoto, 480, 0.5);
                tenantToSave.idPhoto = await storeIdPhoto(forUpload, inlineFallback);
            }

            saveTenant(tenantToSave, { isEditing, isRenewing }, flatNo);
            setIsSuccessModalOpen(true);
        } catch (error: any) {
            if (error.message === 'DUPLICATE_FLAT_NO') {
                alert(t('tenantForm.duplicateFlatError'));
            }
            console.error(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSuccessModalClose = () => {
        setIsSuccessModalOpen(false);
        navigate(`/${buildingName}`);
    };

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await verifyPassword(unlockPassword)) {
            setIsFlatNoUnlocked(true);
            setIsUnlockModalOpen(false);
            setUnlockPassword('');
        } else {
            alert(t('deleteBuildingModal.incorrectPasswordError'));
        }
    };

    const handleDateSelect = (date: Date) => {
        const formatted = formatDateForInput(date);
        setTenant(prev => ({ ...prev, startDate: formatted }));
    };

    const handleUnitSelect = (unit: string) => {
        setTenant(prev => ({ ...prev, flatNo: unit }));
    };

    const unitOptions = useMemo(() => {
        const currentUnit = isEditing ? flatNo : null;
        let options = availableUnits.filter(u => canAccessUnit(decodedBuildingName, u));
        if (currentUnit && !options.includes(currentUnit)) {
            options.push(currentUnit);
        }
        return options.sort((a, b) => Number(a) - Number(b));
    }, [availableUnits, isEditing, flatNo, canAccessUnit, decodedBuildingName]);

    const pageTitle = isRenewing
        ? t('tenantForm.renewTitle')
        : (isEditing ? t('tenantForm.editTitle') : t('tenantForm.addTitle'));

    const backLink = searchParams.get('from') === 'expiring'
        ? `/${buildingName}?modal=expiring`
        : `/${buildingName}`;

    if (!hasFormPermission || !canAccessBuilding(decodedBuildingName) || ((isEditing || isRenewing) && !canAccessUnit(decodedBuildingName, flatNo))) {
        return (
            <Layout>
                <AccessDenied backTo={`/${buildingName}`} />
            </Layout>
        );
    }

    return (
        <Layout>
            {/* Header */}
            <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 rounded-b-2xl mb-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate(backLink)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors flex items-center justify-center shadow-sm"
                            title="رجوع"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 rtl:rotate-180 transform">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <h1 className="text-lg md:text-xl font-extrabold text-slate-800 dark:text-white truncate max-w-[250px]">
                            {isEditing || isRenewing ? tenant.name : pageTitle}
                        </h1>
                    </div>
                </div>
            </header>

            <form onSubmit={handleSubmit} className="glass-card p-5 md:p-6 rounded-3xl shadow-xl border border-white/50 dark:border-slate-700/50 space-y-5 animate-scale-in mb-8 mt-4">

                {/* Section: ID / Iqama Photo & OCR Extraction (Compact & Collapsible / Dropdown) */}
                <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/60 dark:from-slate-800 dark:to-slate-700/80 rounded-2xl border border-blue-200/80 dark:border-slate-600 shadow-sm overflow-hidden transition-all">
                    {/* Collapsible Header Bar */}
                    <div
                        onClick={() => setIsPhotoSectionOpen(!isPhotoSectionOpen)}
                        className="p-3 px-3.5 flex items-center justify-between cursor-pointer hover:bg-blue-100/40 dark:hover:bg-slate-700/50 transition-colors select-none"
                    >
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 bg-blue-600 text-white rounded-lg shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                                </svg>
                            </span>
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-white text-xs md:text-sm flex items-center gap-1.5">
                                    <span>صورة الهوية أو الإقامة</span>
                                    <span className="text-[10px] font-normal text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-full">
                                        تعبئة تلقائية
                                    </span>
                                </h3>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {tenant.idPhoto ? (
                                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                    ✓ مرفقة
                                </span>
                            ) : (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                                    اضغط للفتح
                                </span>
                            )}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isPhotoSectionOpen ? 'transform rotate-180' : ''}`}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                        </div>
                    </div>

                    {/* Dropdown Content */}
                    {isPhotoSectionOpen && (
                        <div className="p-3 pt-1 border-t border-blue-100/70 dark:border-slate-700/60 space-y-2.5">
                            {/* Hidden inputs for camera and gallery */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <input
                                type="file"
                                ref={cameraInputRef}
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handleFileChange}
                            />

                            {/* Small Action Buttons (if no photo yet) */}
                            {!tenant.idPhoto ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        disabled={isOcrLoading}
                                        onClick={() => cameraInputRef.current?.click()}
                                        className="flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-slate-600 py-2 px-3 rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                        </svg>
                                        <span>التقاط بالكاميرا</span>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={isOcrLoading}
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-slate-600 py-2 px-3 rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                        </svg>
                                        <span>اختيار صورة</span>
                                    </button>
                                </div>
                            ) : (
                                /* Compact Preview & Controls */
                                <div className="flex items-center justify-between gap-2.5 bg-white dark:bg-slate-800/80 p-2 px-2.5 rounded-xl border border-blue-200 dark:border-slate-600">
                                    <div
                                        onClick={() => setIsPhotoPreviewOpen(true)}
                                        className="relative cursor-pointer group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 w-14 h-11 bg-slate-100 dark:bg-slate-700 flex-shrink-0"
                                    >
                                        <img
                                            src={photoPreview || undefined}
                                            alt="هوية المستأجر"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                                            🔍
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                                            صورة الهوية / الإقامة
                                        </p>
                                        <p className="text-[10px] text-slate-400">انقر للتكبير أو استبدل</p>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setIsPhotoPreviewOpen(true)}
                                            className="text-xs bg-blue-50 hover:bg-blue-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-blue-600 dark:text-blue-400 p-1.5 px-2 rounded-lg font-bold transition-colors"
                                            title="تكبير"
                                        >
                                            تكبير
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isOcrLoading}
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 p-1.5 px-2 rounded-lg font-bold transition-colors"
                                            title="تغيير"
                                        >
                                            تغيير
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isOcrLoading}
                                            onClick={handleRemovePhoto}
                                            className="text-xs bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 p-1.5 px-2 rounded-lg font-bold transition-colors"
                                            title="حذف"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* OCR Loading State */}
                            {isOcrLoading && (
                                <div className="flex items-center justify-center gap-2 p-2 bg-blue-100/70 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold animate-pulse">
                                    <svg className="animate-spin h-3.5 w-3.5 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    جاري قراءة واستخراج البيانات من الهوية...
                                </div>
                            )}

                            {/* OCR Result Message */}
                            {!isOcrLoading && ocrMessage && (
                                <div className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between ${
                                    ocrMessage.type === 'success'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                                        : ocrMessage.type === 'error'
                                        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50'
                                        : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                                }`}>
                                    <span>{ocrMessage.text}</span>
                                    <button
                                        type="button"
                                        onClick={() => setOcrMessage(null)}
                                        className="text-slate-400 hover:text-slate-600 text-sm px-1"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Name */}
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('tenantForm.name')}</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={tenant.name}
                        onChange={handleInputChange}
                        required
                        placeholder="الاسم الكامل للمستأجر"
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                </div>

                {/* ID & Nationality - Forced Single Row */}
                <div className="grid grid-cols-[1fr_130px] gap-4">
                    <div>
                        <label htmlFor="idNumber" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.idNumber')}</label>
                        <input
                            type="text"
                            id="idNumber"
                            name="idNumber"
                            value={tenant.idNumber}
                            onChange={handleInputChange}
                            required
                            maxLength={10}
                            inputMode="numeric"
                            placeholder="10 أرقام (هوية / إقامة)"
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                        />
                    </div>
                    <div>
                        <label htmlFor="nationality" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.nationality')}</label>
                        <input
                            type="text"
                            id="nationality"
                            name="nationality"
                            value={tenant.nationality}
                            onChange={handleInputChange}
                            required
                            placeholder="الجنسية"
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                        />
                    </div>
                </div>

                {/* Phone & Electricity Meter */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.phone')}</label>
                        <div className="flex direction-ltr">
                            <input
                                type="text"
                                id="phone"
                                name="phone"
                                value={tenant.phone}
                                onChange={(e) => {
                                    let val = e.target.value.replace(/[^0-9]/g, '');
                                    if (val.length > 0 && !val.startsWith('05')) {
                                        if (val === '0') {
                                            // typed 0, wait for 5
                                        } else if (val === '5') {
                                            val = '05';
                                        } else {
                                            // something else, prepend 05
                                            if (val.startsWith('0')) val = '05' + val.substring(1);
                                            else val = '05' + val;
                                        }
                                    }
                                    if (val.length > 10) val = val.slice(0, 10);
                                    setTenant(prev => ({ ...prev, phone: val }));
                                }}
                                onFocus={() => {
                                    if (!tenant.phone) setTenant(prev => ({ ...prev, phone: '05' }));
                                }}
                                required
                                maxLength={10}
                                inputMode="numeric"
                                placeholder="05xxxxxxxx"
                                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="electricityMeterNumber" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.electricityMeterNumber')}</label>
                        <input
                            type="text"
                            id="electricityMeterNumber"
                            name="electricityMeterNumber"
                            value={tenant.electricityMeterNumber || ''}
                            onChange={handleInputChange}
                            maxLength={11}
                            inputMode="numeric"
                            placeholder="اختياري"
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                </div>

                {/* City & District */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="city" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.city')}</label>
                        <input
                            type="text"
                            id="city"
                            name="city"
                            value={tenant.city || ''}
                            onChange={handleInputChange}
                            placeholder="المدينة"
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                    <div>
                        <label htmlFor="district" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.district')}</label>
                        <input
                            type="text"
                            id="district"
                            name="district"
                            value={tenant.district || ''}
                            onChange={handleInputChange}
                            placeholder="الحي"
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                </div>

                {/* Unit No */}
                <div>
                    <label htmlFor="flatNo" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.flatNo')}</label>
                    <div className="flex gap-2">
                        <div className="relative min-w-[9rem]">
                            <div
                                onClick={() => {
                                    if (isEditing && !isFlatNoUnlocked) return;
                                    setShowUnitModal(true);
                                }}
                                className={`w-full p-2.5 px-3 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-200 cursor-pointer flex items-center justify-between gap-2 ${isEditing && !isFlatNoUnlocked ? 'bg-slate-200 dark:bg-slate-600 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600/70 transition-colors'}`}
                            >
                                <span className="text-sm font-bold whitespace-nowrap">{cleanFlatNo(tenant.flatNo) || t('buildingPage.availableUnitsNumbers')}</span>
                                {(!isEditing || isFlatNoUnlocked) && (
                                    <svg className="fill-current h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                )}
                            </div>
                        </div>
                        {isEditing && !isFlatNoUnlocked && (
                            <button
                                type="button"
                                onClick={() => setIsUnlockModalOpen(true)}
                                className="bg-slate-200 dark:bg-slate-700 p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Contract Details (Hidden by default in Edit mode only) */}
                {(showContractInfo || !isEditing) && (
                    <>
                        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                تفاصيل العقد والمدة
                            </h3>

                            {/* Contract No & Duration Mode (Compact & Small) */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="contractNo" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('tenantForm.contractNo')}</label>
                                    <input
                                        type="text"
                                        id="contractNo"
                                        name="contractNo"
                                        value={tenant.contractNo}
                                        onChange={handleInputChange}
                                        maxLength={11}
                                        inputMode="numeric"
                                        placeholder="رقم العقد"
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                                    />
                                </div>

                                {/* Duration: Compact with inline unit switch */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label htmlFor="duration" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                            مدة العقد
                                        </label>
                                        <div className="flex bg-slate-200 dark:bg-slate-700 p-0.5 rounded-lg text-[10px] font-bold">
                                            <button
                                                type="button"
                                                onClick={() => handleDurationUnitChange('years')}
                                                className={`px-1.5 py-0.5 rounded transition-all ${
                                                    tenant.durationUnit === 'years'
                                                        ? 'bg-blue-600 text-white shadow-xs font-extrabold'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                                                }`}
                                            >
                                                سنوي
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDurationUnitChange('months')}
                                                className={`px-1.5 py-0.5 rounded transition-all ${
                                                    tenant.durationUnit === 'months'
                                                        ? 'bg-blue-600 text-white shadow-xs font-extrabold'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                                                }`}
                                            >
                                                شهري
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <input
                                            type="text"
                                            id="duration"
                                            name="duration"
                                            value={tenant.duration}
                                            onChange={(e) => handleDurationChange(e.target.value)}
                                            onBlur={() => {
                                                if (!tenant.duration || Number(tenant.duration) < 1) {
                                                    handleDurationChange('1');
                                                }
                                            }}
                                            inputMode="numeric"
                                            maxLength={2}
                                            placeholder={tenant.durationUnit === 'months' ? "1 - 24" : "1 - 10"}
                                            className="w-full p-2 ps-14 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm text-center"
                                        />
                                        <div className="absolute inset-y-0 start-0 flex items-center ps-2 pointer-events-none">
                                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/40">
                                                {tenant.durationUnit === 'months' ? 'أشهر' : 'سنوات'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="startDate" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.startDate')}</label>
                                <div className="relative" style={{ direction: 'ltr' }}>
                                    <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none z-10">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18" />
                                        </svg>
                                    </div>
                                    <div
                                        onClick={() => setShowDatePicker(true)}
                                        className="w-full p-2.5 text-left ps-10 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 cursor-pointer text-sm font-semibold hover:border-blue-500 transition-colors"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                    >
                                        {formatDateForDisplayPadded(tenant.startDate, '', '/')}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="endDate" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">{t('tenantForm.endDate')}</label>
                                <input
                                    type="text"
                                    id="endDate"
                                    value={formatDateForDisplayPadded(endDate)}
                                    disabled
                                    className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-200/80 dark:bg-slate-600/80 text-slate-900 dark:text-slate-200 text-sm font-semibold"
                                    style={{ direction: 'ltr', fontFamily: 'Inter, sans-serif' }}
                                />
                            </div>
                        </div>

                        {/* Amount & Payments Count with Frequency Options (Small & Compact) */}
                        <div className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="amount" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('tenantForm.amount')}</label>
                                    <input
                                        type="text"
                                        id="amount"
                                        name="amount"
                                        value={tenant.amount}
                                        onChange={handleInputChange}
                                        min={1}
                                        inputMode="numeric"
                                        placeholder="إجمالي الإيجار"
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label htmlFor="paymentsCount" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                            {t('tenantForm.paymentsCount')}
                                        </label>
                                        {tenant.paymentFrequency !== 'custom' && (
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                                                🔒 مقفل
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        id="paymentsCount"
                                        name="paymentsCount"
                                        value={tenant.paymentsCount}
                                        onChange={handleInputChange}
                                        readOnly={tenant.paymentFrequency !== 'custom'}
                                        disabled={tenant.paymentFrequency !== 'custom'}
                                        min={1}
                                        inputMode="numeric"
                                        className={`w-full p-2 border rounded-xl text-sm font-bold text-center transition-colors ${
                                            tenant.paymentFrequency !== 'custom'
                                                ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed select-none'
                                                : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500'
                                        }`}
                                        title={tenant.paymentFrequency !== 'custom' ? 'العدد محسوب تلقائياً حسب نوع التوزيع. اختر "مخصص" للكتابة اليدوية' : 'أدخل عدد الدفعات يدوياً'}
                                    />
                                </div>
                            </div>

                            {/* Payment Frequency: Dropdown (منسدلة) & Small Buttons (صغيرة) */}
                            <div>
                                <label htmlFor="paymentFrequency" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    توزيع الدفعات (اختياري):
                                </label>
                                
                                {/* Dropdown / قائمة منسدلة */}
                                <div className="relative">
                                    <select
                                        id="paymentFrequency"
                                        value={tenant.paymentFrequency || 'annual'}
                                        onChange={(e) => handlePaymentFrequencyChange(e.target.value)}
                                        className="w-full p-2 px-3 pe-8 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 text-xs md:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                                    >
                                        <option value="monthly">شهري (كل شهر دفعة)</option>
                                        <option value="quarterly">ربع سنوي (كل 3 أشهر)</option>
                                        <option value="semi-annual">نصف سنوي (كل 6 أشهر)</option>
                                        <option value="annual">سنوي (دفعة سنوية)</option>
                                        <option value="custom">مخصص (إدخال يدوي لعدد الدفعات)</option>
                                    </select>
                                    <div className="absolute inset-y-0 end-0 flex items-center pe-2.5 pointer-events-none text-slate-500">
                                        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                                            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Small Buttons / أزرار صغيرة */}
                                <div className="flex gap-1 mt-2">
                                    {[
                                        { key: 'monthly', label: 'شهري' },
                                        { key: 'quarterly', label: 'ربع سنوي' },
                                        { key: 'semi-annual', label: 'نصف سنوي' },
                                        { key: 'annual', label: 'سنوي' },
                                        { key: 'custom', label: 'مخصص' }
                                    ].map(item => {
                                        const isSelected = tenant.paymentFrequency === item.key;
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => handlePaymentFrequencyChange(item.key)}
                                                className={`flex-auto py-1.5 px-1.5 rounded-lg border text-[11px] font-bold whitespace-nowrap transition-all ${
                                                    isSelected
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                                        : 'bg-slate-50 dark:bg-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {paymentSchedule.length > 0 && (
                            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsScheduleOpen(!isScheduleOpen)}
                                    className="w-full flex justify-between items-center p-3.5 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                            {t('tenantForm.paymentSchedule')} ({paymentSchedule.length} دفعة)
                                        </span>
                                    </div>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={1.5}
                                        stroke="currentColor"
                                        className={`w-5 h-5 text-slate-500 transition-transform ${isScheduleOpen ? 'transform rotate-180' : ''}`}
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                    </svg>
                                </button>

                                {isScheduleOpen && (
                                    <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                                        <ul className="space-y-2">
                                            {paymentSchedule.map(p => (
                                                <li key={p.paymentNo} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl flex justify-between flex-wrap gap-2 text-xs border border-slate-100 dark:border-slate-700">
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{t('tenantForm.payment')} {p.paymentNo}</span>
                                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t('tenantForm.paymentAmount')}: {p.amount?.toFixed(2)}</span>
                                                    <span className="text-slate-600 dark:text-slate-400 font-mono" style={{ direction: 'ltr' }}>{t('tenantForm.dueDate')}: {formatDateForDisplayPadded(p.dueDate)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                <div className="flex justify-end pt-2">
                    <button type="submit" disabled={isSaving} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-6 py-3.5 rounded-2xl shadow-lg shadow-blue-500/30 transition-all duration-300 transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:cursor-wait">
                        {isSaving ? 'جاري الحفظ...' : t('tenantForm.save')}
                    </button>
                </div>
            </form>

            {/* Photo Preview Modal */}
            <Modal
                isOpen={isPhotoPreviewOpen}
                onClose={() => setIsPhotoPreviewOpen(false)}
                title="معاينة صورة الهوية / الإقامة"
            >
                <div className="space-y-4 text-center">
                    {tenant.idPhoto ? (
                        <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-2 flex items-center justify-center">
                            <img
                                src={photoPreview || undefined}
                                alt="هوية المستأجر مكبرة"
                                className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-sm"
                            />
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm">لا توجد صورة محددة</p>
                    )}

                    <div className="flex justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsPhotoPreviewOpen(false)}
                            className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-md text-sm"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Save Success Modal */}
            <Modal
                isOpen={isSuccessModalOpen}
                onClose={handleSuccessModalClose}
                title={t('tenantForm.saveSuccess')}
            >
                <div className="flex flex-col items-center justify-center p-4">
                    <button
                        onClick={handleSuccessModalClose}
                        className="w-full max-w-xs bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md active:scale-95"
                    >
                        OK
                    </button>
                </div>
            </Modal>

            {/* Unlock Flat No Modal */}
            <Modal
                isOpen={isUnlockModalOpen}
                onClose={() => setIsUnlockModalOpen(false)}
                title={t('buildingPage.secretCode')}
            >
                <form onSubmit={handleUnlock}>
                    <div className="space-y-4">
                        <p className="text-slate-700 dark:text-slate-300 text-center mb-4">
                            {t('buildingPage.secretCode')}
                        </p>
                        <div>
                            <input
                                type="password"
                                value={unlockPassword}
                                onChange={e => setUnlockPassword(e.target.value)}
                                required
                                placeholder={t('buildingPage.secretCode')}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                            />
                        </div>
                        <div className="flex justify-end gap-4 mt-4">
                            <button type="button" onClick={() => setIsUnlockModalOpen(false)} className="bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-md">{t('addBuildingModal.cancel')}</button>
                            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md">{t('addBuildingModal.save')}</button>
                        </div>
                    </div>
                </form>
            </Modal>

            <DatePickerModal
                isOpen={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                onSelect={handleDateSelect}
                initialDate={tenant.startDate ? parseDate(tenant.startDate) || undefined : undefined}
            />
            <UnitSelectionModal
                isOpen={showUnitModal}
                onClose={() => setShowUnitModal(false)}
                availableUnits={unitOptions}
                selectedUnit={tenant.flatNo}
                onSelect={handleUnitSelect}
                title={t('buildingPage.availableUnitsNumbers')}
            />
        </Layout>
    );
};

export default TenantFormPage;