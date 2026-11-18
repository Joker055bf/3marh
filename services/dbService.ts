import { DB_KEYS, GLOBAL_DB_KEYS } from '../constants';
import { Tenant, Payment, Expense, Note, Contract, Building, User, WorkerPermissions } from '../types';
import { parseDate, formatDateForInput, calculateEndDate, calculateDurationInYears, getTodayUtc } from '../utils/dateUtils';
import { syncToFirebase, fetchFromFirebase, savePhotoToFirebase, fetchPhotoFromFirebase } from './firebase';
import { hasFirebaseSession, reauthenticate } from './authService';

let activePrefix = '';
export const setDbPrefix = (ownerId: string) => {
  activePrefix = ownerId ? `${ownerId}_` : '';
};
export const getUserDbKey = (key: string) => `rentals_${activePrefix}${key}`;

// --- Helper Functions ---
const getData = <T>(key: string): T[] => {
  try {
    const data = localStorage.getItem(getUserDbKey(key));
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`Error reading from localStorage key "${key}":`, error);
    return [];
  }
};

const saveData = <T>(key: string, data: T[]): void => {
  try {
    const fullKey = getUserDbKey(key);
    localStorage.setItem(fullKey, JSON.stringify(data));
    
    // Sync to Firebase
    const ownerId = activePrefix.replace(/_$/, '');
    if (ownerId) {
      syncToFirebase(ownerId, fullKey, data);
    }
  } catch (error) {
    console.error(`Error writing to localStorage key "${key}":`, error);
  }
};

// --- Sanitization Functions ---
// These functions are the core of the app's stability. They ensure that any data retrieved
// from localStorage is cleaned, validated, and conforms to the expected data types. This prevents
// uncaught errors from malformed, corrupted, or legacy data structures.

const isValidRecord = (record: any): boolean => record && typeof record === 'object';

const sanitizeContract = (contract: any): Contract => ({
  contractNo: String(contract.contractNo || ''),
  startDate: String(contract.startDate || ''),
  duration: Number(contract.duration) || 0,
  durationUnit: contract.durationUnit === 'months' ? 'months' : 'years',
  amount: Number(contract.amount) || 0,
  paymentsCount: Number(contract.paymentsCount) || 0,
  paymentFrequency: contract.paymentFrequency ? String(contract.paymentFrequency) : undefined,
  terminationDate: contract.terminationDate ? String(contract.terminationDate) : undefined,
});

const sanitizeTenant = (tenant: any): Tenant => ({
  name: String(tenant.name || ''),
  nationality: String(tenant.nationality || ''),
  idNumber: String(tenant.idNumber || ''),
  phone: String(tenant.phone || ''),
  city: tenant.city ? String(tenant.city) : undefined,
  district: tenant.district ? String(tenant.district) : undefined,
  flatNo: String(tenant.flatNo || ''),
  electricityMeterNumber: tenant.electricityMeterNumber ? String(tenant.electricityMeterNumber) : undefined,
  building: String(tenant.building || ''),
  idPhoto: tenant.idPhoto ? String(tenant.idPhoto) : undefined,
  // Current contract
  contractNo: String(tenant.contractNo || ''),
  startDate: String(tenant.startDate || ''),
  duration: Number(tenant.duration) || 0,
  durationUnit: tenant.durationUnit === 'months' ? 'months' : 'years',
  amount: Number(tenant.amount) || 0,
  paymentsCount: Number(tenant.paymentsCount) || 0,
  paymentFrequency: tenant.paymentFrequency ? String(tenant.paymentFrequency) : undefined,
  terminationDate: tenant.terminationDate ? String(tenant.terminationDate) : undefined,
  // History
  history: Array.isArray(tenant.history) ? tenant.history.filter(isValidRecord).map(sanitizeContract) : [],
});

const sanitizePayment = (payment: any): Payment => ({
  id: String(payment.id || ''),
  tenantFlatNo: String(payment.tenantFlatNo || ''),
  building: String(payment.building || ''),
  paymentNo: Number(payment.paymentNo) || 0,
  dueDate: String(payment.dueDate || ''),
  amount: Number(payment.amount) || 0,
  isPaid: Boolean(payment.isPaid || false),
  paidAmount: payment.paidAmount ? Number(payment.paidAmount) : undefined,
  partialHistory: Array.isArray(payment.partialHistory) ? payment.partialHistory : undefined,
});

const sanitizeExpense = (expense: any): Expense => ({
  id: String(expense.id || ''),
  building: String(expense.building || ''),
  amount: Number(expense.amount) || 0,
  note: String(expense.note || ''),
  date: String(expense.date || ''),
});

const sanitizeNote = (note: any): Note => ({
  id: String(note.id || ''),
  building: String(note.building || ''),
  note: String(note.note || ''),
});

// --- Internal "Get All" Helpers ---
const getAllTenants = (): Tenant[] => {
  const tenants = getData<any>(DB_KEYS.TENANTS).filter(isValidRecord).map(sanitizeTenant);
  // Self-heal data: if a tenant was edited to have a start date after its termination date, the termination is void.
  let modified = false;
  tenants.forEach(t => {
    if (t.terminationDate) {
      const termDate = parseDate(t.terminationDate);
      const startDate = parseDate(t.startDate);
      if (termDate && startDate && startDate.getTime() > termDate.getTime()) {
        t.terminationDate = undefined;
        modified = true;
      }
    }
  });
  if (modified) {
    saveData(DB_KEYS.TENANTS, tenants);
  }
  return tenants;
};
const getAllPayments = (): Payment[] => getData<any>(DB_KEYS.PAYMENTS).filter(isValidRecord).map(sanitizePayment);
const getAllExpenses = (): Expense[] => getData<any>(DB_KEYS.EXPENSES).filter(isValidRecord).map(sanitizeExpense);
const getAllNotes = (): Note[] => getData<any>(DB_KEYS.NOTES).filter(isValidRecord).map(sanitizeNote);

export const cleanFlatNo = (flatNo: string | number | undefined): string => {
  if (flatNo === undefined || flatNo === null) return '';
  const str = String(flatNo);
  return str.split('-old-')[0];
};

export const getDisplayFlatNo = (tenant: any): string => {
  if (!tenant) return '';
  const clean = cleanFlatNo(tenant.flatNo);
  if (tenant.terminationDate) {
    const tenants = getAllTenants();
    const cleanNo = clean;
    const isOccupiedByOther = tenants.some(t => 
      t.building === tenant.building &&
      t.flatNo !== tenant.flatNo &&
      cleanFlatNo(t.flatNo) === cleanNo &&
      !t.terminationDate
    );
    if (isOccupiedByOther) {
      return `${clean} (سابقاً)`;
    }
  }
  return clean;
};


// --- Setup Management (DEPRECATED for Multi-User) ---
export const isSetupComplete = (): boolean => {
  // If global users exist, we consider the app "setup" overall.
  try {
    const users = localStorage.getItem(GLOBAL_DB_KEYS.USERS);
    if (users && JSON.parse(users).length > 0) return true;
  } catch (e) {}
  
  // Backwards compatibility check
  return localStorage.getItem('rentals_setup_complete') === 'true';
};

export const markSetupComplete = (): void => {
  localStorage.setItem('rentals_setup_complete', 'true');
};

// --- Password Management ---
// Signed-in accounts confirm sensitive actions with their Firebase password (checked by Google).
// The locally stored password below is only for the Android app used without an account.
const DEFAULT_SECRET_WORD = 'Basil'; // This is kept as requested

export const getDeletePassword = (): string => {
  return localStorage.getItem(getUserDbKey(DB_KEYS.DELETE_PASSWORD)) || '';
};

export const verifyPassword = async (password: string): Promise<boolean> => {
  if (!password) return false;
  if (hasFirebaseSession()) {
    return reauthenticate(password);
  }
  // No account (native app in local mode): compare with the device-only password.
  const local = getDeletePassword();
  return !!local && password === local;
};

/** Device-only password for the native app without an account. Accounts use changeOwnPassword(). */
export const setDeletePassword = async (newPassword: string): Promise<void> => {
  localStorage.setItem(getUserDbKey(DB_KEYS.DELETE_PASSWORD), newPassword);
};

// --- Secret Word Management ---
export const getSecretWord = (): string => {
  return localStorage.getItem(getUserDbKey(DB_KEYS.SECRET_WORD)) || DEFAULT_SECRET_WORD;
}

export const setSecretWord = (newWord: string): void => {
  const fullKey = getUserDbKey(DB_KEYS.SECRET_WORD);
  localStorage.setItem(fullKey, newWord);
  
  const ownerId = activePrefix.replace(/_$/, '');
  if (ownerId) syncToFirebase(ownerId, fullKey, newWord);
}

export const verifySecretWord = (word: string): boolean => {
  // Case-insensitive comparison
  return word.trim().toLowerCase() === getSecretWord().trim().toLowerCase();
}

// --- Landlord Info ---
export const getLandlordName = (): string => {
  return localStorage.getItem(getUserDbKey(DB_KEYS.LANDLORD_NAME)) || '';
};

export const setLandlordName = (name: string): void => {
  const fullKey = getUserDbKey(DB_KEYS.LANDLORD_NAME);
  localStorage.setItem(fullKey, name);
  
  const ownerId = activePrefix.replace(/_$/, '');
  if (ownerId) syncToFirebase(ownerId, fullKey, name);
};


// --- Buildings ---
// --- Buildings ---

const sanitizeBuilding = (data: any): Building => {
  if (typeof data === 'string') {
    return { name: data, totalUnits: 0 };
  }
  return {
    name: String(data.name || ''),
    totalUnits: Number(data.totalUnits) || 0,
  };
};

export const getBuildings = (): Building[] => {
  const rawData = getData<any>(DB_KEYS.BUILDINGS);
  return rawData.map(sanitizeBuilding).sort((a, b) => a.name.localeCompare(b.name));
};

export const addBuilding = (name: string, totalUnits: number = 0): void => {
  const buildings = getBuildings();
  if (buildings.some(b => b.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('DUPLICATE_BUILDING_NAME');
  }
  buildings.push({ name, totalUnits });
  saveData(DB_KEYS.BUILDINGS, buildings);
};

export const updateBuildingUnits = (name: string, totalUnits: number): void => {
  const buildings = getBuildings();
  const building = buildings.find(b => b.name === name);
  if (building) {
    building.totalUnits = totalUnits;
    saveData(DB_KEYS.BUILDINGS, buildings);
  }
};

export const deleteBuilding = (name: string): void => {
  let buildings = getBuildings();
  let tenants = getAllTenants();
  let payments = getAllPayments();
  let expenses = getAllExpenses();
  let notes = getAllNotes();

  buildings = buildings.filter(b => b.name !== name);
  tenants = tenants.filter(t => t.building !== name);
  payments = payments.filter(p => p.building !== name);
  expenses = expenses.filter(e => e.building !== name);
  notes = notes.filter(n => n.building !== name);

  saveData(DB_KEYS.BUILDINGS, buildings);
  saveData(DB_KEYS.TENANTS, tenants);
  saveData(DB_KEYS.PAYMENTS, payments);
  saveData(DB_KEYS.EXPENSES, expenses);
  saveData(DB_KEYS.NOTES, notes);
};

export const getBuildingStats = (buildingName: string): { totalUnits: number; rentedUnits: number; availableUnits: number } => {
  const buildings = getBuildings();
  const building = buildings.find(b => b.name === buildingName);
  const totalUnits = building ? building.totalUnits : 0;

  const tenants = getTenantsByBuilding(buildingName);
  const now = new Date();
  // Normalize to UTC midnight to match parseDate behavior
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  // Count active tenants (those with current or future active contracts)
  const rentedUnits = tenants.filter(t => {
    // If terminated, check if termination is in the future (strictly greater than today)
    // If today is 10th and term is 10th, 10 > 10 is False -> Not Rented.
    if (t.terminationDate) {
      const termDate = parseDate(t.terminationDate);
      return termDate && termDate.getTime() > todayUtc.getTime();
    }
    // If not terminated, check if contract end date is in future or today
    const endDateString = calculateEndDate(t.startDate, Number(t.duration), t.durationUnit);
    const endDate = parseDate(endDateString);
    return endDate && endDate.getTime() >= todayUtc.getTime();
  }).length;

  const availableUnits = Math.max(0, totalUnits - rentedUnits);

  return { totalUnits, rentedUnits, availableUnits };
};


// --- Tenants ---
export const getTenantsByBuilding = (building: string): Tenant[] => {
  const tenants = getAllTenants();
  return tenants
    .filter((t) => t.building === building)
    .sort((a, b) => a.flatNo.localeCompare(b.flatNo, undefined, { numeric: true }));
};

export const findTenantForPayment = (tenants: Tenant[], flatNo: string): Tenant | undefined => {
  if (!flatNo) return undefined;

  // 1. Try exact match first
  const exactMatches = tenants.filter(t => t.flatNo === flatNo);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    const today = getTodayUtc();
    const active = exactMatches.filter(t => {
      if (t.terminationDate) {
        const termDate = parseDate(t.terminationDate);
        return termDate && termDate.getTime() > today.getTime();
      }
      const endDate = parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));
      return endDate && endDate.getTime() >= today.getTime();
    });
    if (active.length > 0) {
      return active.sort((a, b) => (parseDate(b.startDate)?.getTime() || 0) - (parseDate(a.startDate)?.getTime() || 0))[0];
    }
    return exactMatches.sort((a, b) => (parseDate(b.startDate)?.getTime() || 0) - (parseDate(a.startDate)?.getTime() || 0))[0];
  }

  // 2. Fallback to clean flatNo match (e.g. "7-old-5751" -> clean "7")
  const targetClean = cleanFlatNo(flatNo);
  const cleanMatches = tenants.filter(t => cleanFlatNo(t.flatNo) === targetClean);

  if (cleanMatches.length === 1) return cleanMatches[0];
  if (cleanMatches.length > 1) {
    const today = getTodayUtc();
    const active = cleanMatches.filter(t => {
      if (t.terminationDate) {
        const termDate = parseDate(t.terminationDate);
        return termDate && termDate.getTime() > today.getTime();
      }
      const endDate = parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));
      return endDate && endDate.getTime() >= today.getTime();
    });
    if (active.length > 0) {
      return active.sort((a, b) => (parseDate(b.startDate)?.getTime() || 0) - (parseDate(a.startDate)?.getTime() || 0))[0];
    }
    return cleanMatches.sort((a, b) => (parseDate(b.startDate)?.getTime() || 0) - (parseDate(a.startDate)?.getTime() || 0))[0];
  }

  return undefined;
};

// --- ID Photos ---
// tenant.idPhoto is either a reference "photo:<id>" (image stored in its own Firestore document)
// or, for older records / when the upload failed, a small inline data URL.
const PHOTO_REF_PREFIX = 'photo:';
const photoCache = new Map<string, string>();

export const isPhotoRef = (value?: string): boolean => !!value && value.startsWith(PHOTO_REF_PREFIX);

/** Uploads a data URL and returns the value to keep on the tenant record. */
export const storeIdPhoto = async (dataUrl: string, inlineFallback: string): Promise<string> => {
  const ownerId = activePrefix.replace(/_$/, '');
  const photoId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ok = await savePhotoToFirebase(ownerId, photoId, dataUrl);
  if (!ok) return inlineFallback;
  photoCache.set(photoId, dataUrl);
  return `${PHOTO_REF_PREFIX}${photoId}`;
};

/** Returns a displayable image URL for a stored tenant.idPhoto value. */
export const resolveIdPhoto = async (value?: string): Promise<string | null> => {
  if (!value) return null;
  if (!isPhotoRef(value)) return value;
  const photoId = value.slice(PHOTO_REF_PREFIX.length);
  if (photoCache.has(photoId)) return photoCache.get(photoId)!;
  const ownerId = activePrefix.replace(/_$/, '');
  const url = await fetchPhotoFromFirebase(ownerId, photoId);
  if (url) photoCache.set(photoId, url);
  return url;
};

export const getTenantByFlatNo = (building: string, flatNo: string): Tenant | undefined => {
  const tenants = getTenantsByBuilding(building);
  return findTenantForPayment(tenants, flatNo);
};

export const saveTenant = (tenant: Tenant, flags: { isEditing: boolean; isRenewing: boolean }, originalFlatNo?: string): void => {
  const { isEditing, isRenewing } = flags;
  const sanitizedTenant = sanitizeTenant(tenant);
  let tenants = getAllTenants();
  let payments = getAllPayments();
  const flatNoForUpdate = originalFlatNo || sanitizedTenant.flatNo;

  const isChangingTargetFlat = (!isEditing && !isRenewing) || (isEditing && originalFlatNo && originalFlatNo !== sanitizedTenant.flatNo);

  // Prevent adding a tenant to an already occupied flat
  if (isChangingTargetFlat) {
    const today = getTodayUtc();

    const isFlatOccupied = tenants.some(existingTenant => {
      // Don't conflict with ourselves if we are just renaming something, though originalFlatNo means we are moving.
      // If we are moving, we shouldn't care about our old flat, but we do care about the NEW flat.
      // So checking if the new flat is occupied by ANY active tenant is correct.
      if (existingTenant.building !== sanitizedTenant.building || existingTenant.flatNo !== sanitizedTenant.flatNo) {
        return false;
      }
      if (!existingTenant.startDate) return false;
      const endDateString = existingTenant.terminationDate || calculateEndDate(existingTenant.startDate, Number(existingTenant.duration), existingTenant.durationUnit);
      const endDate = parseDate(endDateString);
      return endDate && endDate.getTime() >= today.getTime();
    });
    if (isFlatOccupied) {
      throw new Error('DUPLICATE_FLAT_NO');
    }

    // Archive previous inactive tenants on the same target flat to prevent data collision
    const existingInactiveTenants = tenants.filter(t => t.building === sanitizedTenant.building && t.flatNo === sanitizedTenant.flatNo);
    existingInactiveTenants.forEach(oldTenant => {
        const randomId = Math.floor(Math.random() * 10000);
        const archivedFlatNo = `${oldTenant.flatNo}-old-${randomId}`;
        
        // Update payments for this old tenant so they are preserved
        payments.forEach(p => {
            if (p.building === oldTenant.building && p.tenantFlatNo === oldTenant.flatNo) {
                p.tenantFlatNo = archivedFlatNo;
            }
        });
        oldTenant.flatNo = archivedFlatNo;
    });
  }

  const tenantIndex = isEditing || isRenewing
    ? tenants.findIndex(t => t.building === sanitizedTenant.building && t.flatNo === flatNoForUpdate)
    : -1;

  const existingTenant = tenantIndex !== -1 ? tenants[tenantIndex] : undefined;

  // Determine if the contract details changed, warranting payment regeneration
  const contractChanged = !existingTenant || isRenewing || (isEditing && (
    existingTenant.startDate !== sanitizedTenant.startDate ||
    existingTenant.duration !== sanitizedTenant.duration ||
    existingTenant.durationUnit !== sanitizedTenant.durationUnit ||
    existingTenant.amount !== sanitizedTenant.amount ||
    existingTenant.paymentsCount !== sanitizedTenant.paymentsCount
  ));

  if (isRenewing && existingTenant) {
    // On RENEWAL, archive the old contract.
    const historicalContract: Contract = {
      contractNo: existingTenant.contractNo,
      startDate: existingTenant.startDate,
      duration: Number(existingTenant.duration),
      durationUnit: existingTenant.durationUnit || 'years',
      amount: Number(existingTenant.amount),
      paymentsCount: Number(existingTenant.paymentsCount),
      paymentFrequency: existingTenant.paymentFrequency,
      terminationDate: existingTenant.terminationDate,
    };
    sanitizedTenant.history = [...(existingTenant.history || []), historicalContract];
    sanitizedTenant.terminationDate = undefined; // New contract is not terminated
    
    // Archive old payments to prevent them from being deleted
    const randomId = Math.floor(Math.random() * 10000);
    const archivedFlatNo = `${sanitizedTenant.flatNo}-old-${randomId}`;
    payments.forEach(p => {
        if (p.building === sanitizedTenant.building && p.tenantFlatNo === flatNoForUpdate) {
            p.tenantFlatNo = archivedFlatNo;
        }
    });
  } else if (existingTenant) {
    // On simple EDIT, just preserve the existing history.
    sanitizedTenant.history = existingTenant.history || [];
  }

  // Update or add the tenant record
  if (tenantIndex !== -1) {
    tenants[tenantIndex] = sanitizedTenant;
  } else {
    tenants.push(sanitizedTenant);
  }

  // Handle Flat Number Change (Cascade to Payments)
  if (isEditing && originalFlatNo && originalFlatNo !== sanitizedTenant.flatNo) {
    payments.forEach(p => {
      if (p.building === sanitizedTenant.building && p.tenantFlatNo === originalFlatNo) {
        p.tenantFlatNo = sanitizedTenant.flatNo;
      }
    });
  }

  // Regenerate payments if the contract has changed
  if (contractChanged) {
    // Clear terminationDate since regenerating payments implies a fresh/active contract state
    sanitizedTenant.terminationDate = undefined;

    // Remove old payments for this contract period if regenerating
    // Note: This logic might need refinement if we want to keep paid payments, but usually regeneration implies a reset or re-calculation.
    // For now, we follow existing logic but ensure we target the correct flatNo (new one).
    const isSameContractEdit = isEditing && !isRenewing && !!existingTenant;
    const replacedPayments = payments.filter(p => p.building === sanitizedTenant.building && p.tenantFlatNo === sanitizedTenant.flatNo);
    payments = payments.filter(p => !(p.building === sanitizedTenant.building && p.tenantFlatNo === sanitizedTenant.flatNo));

    // When editing the same contract, money already received must not be lost.
    // Collect every receipt (with its date) so it can be re-applied to the new schedule below.
    const carriedReceipts: { amount: number; date: string }[] = [];
    if (isSameContractEdit) {
      replacedPayments.forEach(p => {
        const history = (p.partialHistory || []).filter(h => h && Number(h.amount) > 0);
        const received = p.isPaid ? p.amount : (p.paidAmount || 0);
        if (history.length > 0) {
          history.forEach(h => carriedReceipts.push({ amount: Number(h.amount), date: String(h.date || p.dueDate) }));
        } else if (received > 0) {
          carriedReceipts.push({ amount: received, date: p.dueDate });
        }
      });
      carriedReceipts.sort((a, b) => (parseDate(a.date)?.getTime() || 0) - (parseDate(b.date)?.getTime() || 0));
    }

    const { startDate, amount, paymentsCount, flatNo, building, duration, durationUnit } = sanitizedTenant;
    const start = parseDate(startDate);

    if (start && Number(paymentsCount) > 0 && Number(duration) > 0 && Number(amount) > 0) {
      const singlePaymentAmount = Math.round((Number(amount) / Number(paymentsCount)) * 100) / 100;
      const totalMonths = durationUnit === 'months' ? Number(duration) : Number(duration) * 12;
      const intervalMonths = totalMonths / Number(paymentsCount);
      const newPayments: Payment[] = [];

      for (let i = 0; i < Number(paymentsCount); i++) {
        const dueDate = new Date(start.getTime());
        dueDate.setUTCMonth(start.getUTCMonth() + Math.round(intervalMonths * i));
        newPayments.push({
          id: `${building}-${flatNo}-${i + 1}-${Date.now()}`,
          building: building,
          tenantFlatNo: flatNo,
          paymentNo: i + 1,
          dueDate: formatDateForInput(dueDate),
          amount: singlePaymentAmount,
          isPaid: false,
        });
      }

      // Re-apply carried receipts in order: fill payment 1, then 2, and so on.
      // Anything beyond the new contract total stays on the last payment so it is never dropped.
      let pIdx = 0;
      carriedReceipts.forEach(receipt => {
        let remaining = receipt.amount;
        while (remaining > 0.001 && newPayments.length > 0) {
          const target = newPayments[Math.min(pIdx, newPayments.length - 1)];
          const isLast = pIdx >= newPayments.length - 1;
          const room = isLast ? remaining : Math.max(0, target.amount - (target.paidAmount || 0));
          const applied = Math.min(room, remaining);
          if (applied > 0) {
            target.paidAmount = Math.round(((target.paidAmount || 0) + applied) * 100) / 100;
            target.partialHistory = [...(target.partialHistory || []), { amount: Math.round(applied * 100) / 100, date: receipt.date }];
            remaining -= applied;
          }
          if ((target.paidAmount || 0) >= target.amount - 0.001) {
            target.isPaid = true;
            if (!isLast) pIdx++;
          } else if (applied === 0 && !isLast) {
            pIdx++;
          }
        }
      });

      payments.push(...newPayments);
    } else if (carriedReceipts.length > 0) {
      // The new contract details are incomplete; keep the old payments rather than lose recorded money.
      payments.push(...replacedPayments);
    }
  }

  saveData(DB_KEYS.TENANTS, tenants);
  saveData(DB_KEYS.PAYMENTS, payments);

  // Log activity
  const session = localStorage.getItem('rentals_active_session');
  const sessionUser = session ? JSON.parse(session) : null;
  if (sessionUser) {
    addActivityLog({
      type: isEditing || isRenewing ? 'tenant_edited' : 'tenant_added',
      description: `${isRenewing ? 'تجديد عقد' : isEditing ? 'تعديل' : 'إضافة'} المستأجر ${sanitizedTenant.name} في وحدة ${sanitizedTenant.flatNo}`,
      buildingName: sanitizedTenant.building,
      tenantName: sanitizedTenant.name,
      flatNo: sanitizedTenant.flatNo,
      performedBy: sessionUser.username,
      performedByName: sessionUser.workerName || sessionUser.username,
      isWorkerAction: sessionUser.role === 'worker'
    });
  }
};

export const deleteTenant = (building: string, flatNo: string): void => {
  let tenants = getAllTenants();
  let payments = getAllPayments();

  tenants = tenants.filter(t => !(t.building === building && t.flatNo === flatNo));
  payments = payments.filter(p => !(p.building === building && p.tenantFlatNo === flatNo));

  saveData(DB_KEYS.TENANTS, tenants);
  saveData(DB_KEYS.PAYMENTS, payments);

  const session = localStorage.getItem('rentals_active_session');
  const sessionUser = session ? JSON.parse(session) : null;
  if (sessionUser) {
    addActivityLog({
      type: 'tenant_deleted',
      description: `حذف نهائي للمستأجر من وحدة ${flatNo}`,
      buildingName: building,
      tenantName: 'مستأجر محذوف',
      flatNo: flatNo,
      performedBy: sessionUser.username,
      performedByName: sessionUser.workerName || sessionUser.username,
      isWorkerAction: sessionUser.role === 'worker'
    });
  }
};

export const terminateContract = (building: string, flatNo: string, terminationDate: string): void => {
  let tenants = getAllTenants();
  
  // Find all matching tenants
  const matchingIndices = tenants.map((t, index) => ({ t, index })).filter(({ t }) => t.building === building && t.flatNo === flatNo);

  if (matchingIndices.length > 0) {
    let tenantIndex = matchingIndices[0].index;
    
    // If there are duplicates, find the active one (most recent start date, not terminated)
    if (matchingIndices.length > 1) {
      const today = getTodayUtc();
      
      const activeTenants = matchingIndices.filter(({ t }) => {
          if (t.terminationDate) {
              const termDate = parseDate(t.terminationDate);
              return termDate && termDate.getTime() > today.getTime();
          }
          const endDate = parseDate(calculateEndDate(t.startDate, Number(t.duration), t.durationUnit));
          return endDate && endDate.getTime() >= today.getTime();
      });
      
      if (activeTenants.length > 0) {
          // Sort by start date descending
          activeTenants.sort((a, b) => (parseDate(b.t.startDate)?.getTime() || 0) - (parseDate(a.t.startDate)?.getTime() || 0));
          tenantIndex = activeTenants[0].index;
      } else {
          // Fallback to newest tenant by start date
          matchingIndices.sort((a, b) => (parseDate(b.t.startDate)?.getTime() || 0) - (parseDate(a.t.startDate)?.getTime() || 0));
          tenantIndex = matchingIndices[0].index;
      }
    }

    const tenant = tenants[tenantIndex];

    // Set the termination date on the current contract.
    tenant.terminationDate = terminationDate;

    tenants[tenantIndex] = tenant;
    saveData(DB_KEYS.TENANTS, tenants);

    // Log activity
    const session = localStorage.getItem('rentals_active_session');
    const sessionUser = session ? JSON.parse(session) : null;
    if (sessionUser) {
      addActivityLog({
        type: 'tenant_terminated',
        description: `إنهاء عقد المستأجر ${tenant.name} في وحدة ${tenant.flatNo}`,
        buildingName: building,
        tenantName: tenant.name,
        flatNo: tenant.flatNo,
        performedBy: sessionUser.username,
        performedByName: sessionUser.workerName || sessionUser.username,
        isWorkerAction: sessionUser.role === 'worker'
      });
    }
  }
};



// --- Payments ---
export const getPaymentsByBuilding = (building: string): Payment[] => {
  const allPayments = getAllPayments();
  return allPayments
    .filter((p) => p.building === building);
};

export const getPaymentsForTenant = (building: string, flatNo: string): Payment[] => {
  const buildingPayments = getPaymentsByBuilding(building);
  return buildingPayments.filter(p => p.tenantFlatNo === flatNo).sort((a, b) => a.paymentNo - b.paymentNo);
};

export const updatePaymentStatus = (paymentId: string, isPaid: boolean, paidAmount?: number): void => {
  let payments = getAllPayments();
  const paymentIndex = payments.findIndex(p => p.id === paymentId);
  if (paymentIndex !== -1) {
    const payment = payments[paymentIndex];
    if (!payment.partialHistory) {
      payment.partialHistory = [];
    }

    const previousPaidAmount = payment.paidAmount || 0;

    if (paidAmount !== undefined) {
      const currentInstallment = paidAmount - previousPaidAmount;
      payment.paidAmount = paidAmount;
      if (currentInstallment > 0) {
        payment.partialHistory.push({
          amount: currentInstallment,
          date: formatDateForInput(new Date())
        });
      }
    } else if (isPaid) {
      // If marked as fully paid without specifying amount, assume full amount is paid
      const remainingAmount = payment.amount - previousPaidAmount;
      payment.paidAmount = payment.amount;
      if (remainingAmount > 0) {
          payment.partialHistory.push({
              amount: remainingAmount,
              date: formatDateForInput(new Date())
          });
      }
    } else {
      // If marked as unpaid without specifying amount, reset paid amount
      payment.paidAmount = 0;
      payment.partialHistory = [];
    }
    
    if (payment.paidAmount !== undefined && payment.paidAmount >= payment.amount) {
      payment.isPaid = true;
    } else {
      payment.isPaid = isPaid;
    }
    saveData(DB_KEYS.PAYMENTS, payments);

    // Log activity
    const session = localStorage.getItem('rentals_active_session');
    const sessionUser = session ? JSON.parse(session) : null;
    if (sessionUser) {
      addActivityLog({
        type: payment.isPaid ? 'payment_paid' : 'payment_partial',
        description: `تسجيل دفع مبلغ ${payment.paidAmount} للوحدة ${payment.tenantFlatNo}`,
        buildingName: payment.building,
        flatNo: payment.tenantFlatNo,
        amount: payment.paidAmount,
        performedBy: sessionUser.username,
        performedByName: sessionUser.workerName || sessionUser.username,
        isWorkerAction: sessionUser.role === 'worker'
      });
    }
  }
};


/**
 * Determines whether a payment belongs to an active, valid contract period.
 * Strict rules:
 * 1. If contract has terminationDate ("اذا مفسوخ ينتهي مع تاريخ فسخه"):
 *    Any payment with dueDate >= terminationDate is CANCELLED (invalid).
 * 2. If contract has startDate and duration:
 *    Any payment with dueDate > calculateEndDate is EXPIRED/OUT OF BOUNDS (invalid).
 *    Any payment with dueDate < startDate is INVALID (unless archived matching history).
 * 3. If archived contract (-old-):
 *    Superseded if dueDate >= current contract startDate, or outside historical contract lifespan.
 */
export const isPaymentActiveAndValid = (payment: Payment, tenant?: Tenant, allTenants?: Tenant[]): boolean => {
  if (!payment || !payment.dueDate) return false;
  const due = parseDate(payment.dueDate);
  if (!due) return false;
  const dueTime = due.getTime();

  let targetTenant = tenant;
  if (!targetTenant && allTenants) {
    targetTenant = findTenantForPayment(allTenants, payment.tenantFlatNo);
  }

  // If no tenant record is found, cannot validate against contract dates
  if (!targetTenant) return false;

  // 1. Check if archived unit (-old-)
  if (payment.tenantFlatNo.includes('-old-')) {
    // If there is an active/newer contract on this unit, payment cannot be >= its startDate
    if (targetTenant.startDate) {
      const curStart = parseDate(targetTenant.startDate);
      if (curStart && dueTime >= curStart.getTime()) {
        return false;
      }
    }

    // If tenant has historical contracts, check if payment fits within any history entry
    if (targetTenant.history && targetTenant.history.length > 0) {
      const validInHistory = targetTenant.history.some(h => {
        const hStart = parseDate(h.startDate);
        if (!hStart) return false;
        const hEffectiveEndStr = h.terminationDate || calculateEndDate(h.startDate, Number(h.duration), h.durationUnit);
        const hEnd = parseDate(hEffectiveEndStr);
        if (!hEnd) return false;

        // If terminated, cannot be on or after termination date
        if (h.terminationDate) {
          const hTerm = parseDate(h.terminationDate);
          if (hTerm && dueTime >= hTerm.getTime()) return false;
        }

        return dueTime >= hStart.getTime() && dueTime <= hEnd.getTime();
      });

      if (!validInHistory) {
        return false;
      }
    }
  }

  // 2. Check current contract startDate
  if (!payment.tenantFlatNo.includes('-old-') && targetTenant.startDate) {
    const start = parseDate(targetTenant.startDate);
    if (start && dueTime < start.getTime()) {
      return false;
    }
  }

  // 3. Check terminationDate: "اذا مفسوخ ينتهي مع تاريخ فسخه"
  if (targetTenant.terminationDate) {
    const termDate = parseDate(targetTenant.terminationDate);
    if (termDate && dueTime >= termDate.getTime()) {
      return false;
    }
  }

  // 4. Check contract calculated end date
  if (targetTenant.startDate && targetTenant.duration) {
    const endStr = calculateEndDate(targetTenant.startDate, Number(targetTenant.duration), targetTenant.durationUnit);
    const endDate = parseDate(endStr);
    if (endDate && dueTime > endDate.getTime()) {
      return false;
    }
  }

  return true;
};

export const getIncompletePayments = (building: string): Payment[] => {
  const payments = getPaymentsByBuilding(building);
  const tenants = getTenantsByBuilding(building);
  const today = getTodayUtc();

  return payments.filter(p => {
    // 1. Must have partial payment and not be fully paid
    if (p.isPaid || !p.paidAmount || p.paidAmount <= 0) return false;

    // 2. Find associated tenant
    const tenant = findTenantForPayment(tenants, p.tenantFlatNo);
    if (!tenant) return false;

    // 3. If contract is already terminated in the past, exclude!
    if (tenant.terminationDate) {
      const termDate = parseDate(tenant.terminationDate);
      if (termDate && termDate.getTime() <= today.getTime()) {
        return false;
      }
    }

    // 4. If contract is already expired in the past, exclude!
    if (tenant.startDate && tenant.duration) {
      const endDateStr = calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
      const endDate = parseDate(endDateStr);
      if (endDate && endDate.getTime() < today.getTime()) {
        return false;
      }
    }

    // 5. Must be an active and valid payment
    if (!isPaymentActiveAndValid(p, tenant, tenants)) {
      return false;
    }

    return true;
  }).sort((a, b) => {
    const dateA = parseDate(a.dueDate);
    const dateB = parseDate(b.dueDate);
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  });
};

export const getUpcomingOrOverduePayments = (building: string): Payment[] => {
  const payments = getPaymentsByBuilding(building);
  const tenants = getTenantsByBuilding(building);

  const today = getTodayUtc();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  return payments
    .filter(p => {
      // 1. If Paid, exclude
      if (p.isPaid) return false;

      // 2. Find associated tenant using smart lookup
      const tenant = findTenantForPayment(tenants, p.tenantFlatNo);
      if (!tenant) return false;

      // 3. If contract is already terminated in the past, exclude!
      if (tenant.terminationDate) {
        const termDate = parseDate(tenant.terminationDate);
        if (termDate && termDate.getTime() <= today.getTime()) {
          return false;
        }
      }

      // 4. If contract is already expired in the past, exclude!
      if (tenant.startDate && tenant.duration) {
        const endDateStr = calculateEndDate(tenant.startDate, Number(tenant.duration), tenant.durationUnit);
        const endDate = parseDate(endDateStr);
        if (endDate && endDate.getTime() < today.getTime()) {
          return false;
        }
      }

      // 5. Must be an active and valid payment within contract duration & before termination
      if (!isPaymentActiveAndValid(p, tenant, tenants)) {
        return false;
      }

      // 6. Check if within range (Overdue or Upcoming within 30 days)
      const dueDate = parseDate(p.dueDate);
      return dueDate && dueDate.getTime() < thirtyDaysFromNow.getTime();
    })
    .sort((a, b) => {
      const dateA = parseDate(a.dueDate);
      const dateB = parseDate(b.dueDate);
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.getTime() - dateB.getTime();
    });
};

export const getExpiringContracts = (building: string): Tenant[] => {
  const tenants = getTenantsByBuilding(building);
  const today = getTodayUtc();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  return tenants
    .filter(t => {
      // Only consider active, non-terminated contracts
      if (t.terminationDate) return false;

      const endDateString = calculateEndDate(t.startDate, Number(t.duration), t.durationUnit);
      const endDate = parseDate(endDateString);

      // Ensure there is a valid end date
      if (!endDate) return false;

      // Check if the end date is between today and 30 days from now
      return endDate.getTime() >= today.getTime() && endDate.getTime() <= thirtyDaysFromNow.getTime();
    })
    .sort((a, b) => {
      const dateA = parseDate(calculateEndDate(a.startDate, Number(a.duration), a.durationUnit));
      const dateB = parseDate(calculateEndDate(b.startDate, Number(b.duration), b.durationUnit));
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.getTime() - dateB.getTime(); // Sort by soonest expiring
    });
};


// --- Expenses ---
export const getExpenses = (building: string): Expense[] => {
  const allExpenses = getAllExpenses();
  return allExpenses
    .filter((e) => e.building === building)
    .sort((a, b) => {
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      if (!dateA) return 1;
      if (!dateB) return -1;
      // FIX: Changed a.getTime() to dateA.getTime() to correctly reference the parsed Date object.
      return dateB.getTime() - dateA.getTime(); // Sort descending
    });
};

export const addExpense = (expense: Omit<Expense, 'id'>): void => {
  const expenses = getAllExpenses();
  const newExpense: Expense = { ...expense, id: `exp-${Date.now()}` };
  expenses.push(newExpense);
  saveData(DB_KEYS.EXPENSES, expenses);

  // Log activity
  const session = localStorage.getItem('rentals_active_session');
  const sessionUser = session ? JSON.parse(session) : null;
  if (sessionUser) {
    addActivityLog({
      type: 'expense_added',
      description: `إضافة مصروف بقيمة ${expense.amount}: ${expense.note}`,
      buildingName: expense.building,
      amount: expense.amount,
      performedBy: sessionUser.username,
      performedByName: sessionUser.workerName || sessionUser.username,
      isWorkerAction: sessionUser.role === 'worker'
    });
  }
};


export const deleteExpense = (expenseId: string): void => {
  let expenses = getAllExpenses();
  const expenseToDelete = expenses.find(e => e.id === expenseId);
  
  expenses = expenses.filter(e => e.id !== expenseId);
  saveData(DB_KEYS.EXPENSES, expenses);

  // Log activity
  if (expenseToDelete) {
    const session = localStorage.getItem('rentals_active_session');
    const sessionUser = session ? JSON.parse(session) : null;
    if (sessionUser) {
      addActivityLog({
        type: 'expense_deleted',
        description: `حذف مصروف بقيمة ${expenseToDelete.amount}: ${expenseToDelete.note}`,
        buildingName: expenseToDelete.building,
        amount: expenseToDelete.amount,
        performedBy: sessionUser.username,
        performedByName: sessionUser.workerName || sessionUser.username,
        isWorkerAction: sessionUser.role === 'worker'
      });
    }
  }
};



// --- Notes ---
export const getNotes = (building: string): Note[] => {
  const allNotes = getAllNotes();
  // Sort by ID descending to show newest first, since ID is based on timestamp
  return allNotes.filter(n => n.building === building).sort((a, b) => b.id.localeCompare(a.id));
};

export const addNote = (note: Omit<Note, 'id'>): void => {
  const notes = getAllNotes();
  const newNote: Note = { ...note, id: `note-${Date.now()}` };
  notes.push(newNote);
  saveData(DB_KEYS.NOTES, notes);
};

export const deleteNote = (noteId: string): void => {
  let notes = getAllNotes();
  notes = notes.filter(n => n.id !== noteId);
  saveData(DB_KEYS.NOTES, notes);
};

// --- Data Management (Import/Export) ---
export const exportAllData = (): string => {
  const data = {
    [DB_KEYS.BUILDINGS]: getData(DB_KEYS.BUILDINGS),
    [DB_KEYS.TENANTS]: getData(DB_KEYS.TENANTS),
    [DB_KEYS.PAYMENTS]: getData(DB_KEYS.PAYMENTS),
    [DB_KEYS.EXPENSES]: getData(DB_KEYS.EXPENSES),
    [DB_KEYS.NOTES]: getData(DB_KEYS.NOTES),
    [DB_KEYS.LANDLORD_NAME]: getLandlordName(),
    [DB_KEYS.SECRET_WORD]: getSecretWord(),
  };
  return JSON.stringify(data, null, 2);
};

export const importAllData = (jsonData: string): boolean => {
  try {
    const data = JSON.parse(jsonData);
    if (!data || typeof data !== 'object') return false;

    // Handle both old 'rentals_...' keys and new '...' keys
    const buildings = data[DB_KEYS.BUILDINGS] || data[`rentals_${DB_KEYS.BUILDINGS}`];
    const tenants = data[DB_KEYS.TENANTS] || data[`rentals_${DB_KEYS.TENANTS}`];
    const payments = data[DB_KEYS.PAYMENTS] || data[`rentals_${DB_KEYS.PAYMENTS}`];
    const expenses = data[DB_KEYS.EXPENSES] || data[`rentals_${DB_KEYS.EXPENSES}`];
    const notes = data[DB_KEYS.NOTES] || data[`rentals_${DB_KEYS.NOTES}`];

    if (buildings) saveData(DB_KEYS.BUILDINGS, buildings);
    if (tenants) saveData(DB_KEYS.TENANTS, tenants);
    if (payments) saveData(DB_KEYS.PAYMENTS, payments);
    if (expenses) saveData(DB_KEYS.EXPENSES, expenses);
    if (notes) saveData(DB_KEYS.NOTES, notes);

    const landlordName = data[DB_KEYS.LANDLORD_NAME] || data[`rentals_${DB_KEYS.LANDLORD_NAME}`];
    const secretWord = data[DB_KEYS.SECRET_WORD] || data[`rentals_${DB_KEYS.SECRET_WORD}`];

    if (landlordName) setLandlordName(landlordName);
    // The password is deliberately not restored: setDeletePassword() also changes the login
    // password, so importing an old backup would silently change how the owner signs in.
    if (secretWord) setSecretWord(secretWord);

    return true;
  } catch (error) {
    console.error('Import failed:', error);
    return false;
  }
};

// --- Activity Log ---
export const getActivityLog = (): import('../types').ActivityLog[] => {
  try {
    const data = localStorage.getItem(getUserDbKey(DB_KEYS.ACTIVITY_LOG));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

export const addActivityLog = (entry: Omit<import('../types').ActivityLog, 'id' | 'timestamp' | 'date'>): void => {
  const logs = getActivityLog();
  const now = Date.now();
  const newEntry: import('../types').ActivityLog = {
    ...entry,
    id: `log_${now}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    date: formatDateForInput(new Date(now)),
  };
  // Keep last 2000 entries
  const updated = [newEntry, ...logs].slice(0, 2000);
  const fullKey = getUserDbKey(DB_KEYS.ACTIVITY_LOG);
  localStorage.setItem(fullKey, JSON.stringify(updated));
  const ownerId = activePrefix.replace(/_$/, '');
  if (ownerId) syncToFirebase(ownerId, fullKey, updated);
};


export const syncFromFirebase = async (ownerId: string): Promise<boolean> => {
  if (!ownerId) return false;
  try {
    const data = await fetchFromFirebase(ownerId);
    if (!data) return false;

    // Iterate through keys and save to localStorage
    Object.keys(data).forEach(key => {
      localStorage.setItem(key, JSON.stringify(data[key]));
    });
    
    return true;
  } catch (error) {
    console.error("Manual sync failed:", error);
    return false;
  }
};
