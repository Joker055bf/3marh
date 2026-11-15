// notify/overdue.mjs
// Which payments are late — the same rules the app uses for its alerts
// (services/dbService.ts: getUpcomingOrOverduePayments, findTenantForPayment, isPaymentActiveAndValid),
// rewritten without browser storage so the daily job can run them on the server.

const parseDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
};

const toIso = (date) => date.toISOString().split('T')[0];

const calculateEndDate = (startDate, duration, unit = 'years') => {
  const start = parseDate(startDate);
  if (!start || typeof duration !== 'number' || !isFinite(duration) || duration <= 0) return '';
  const end = new Date(start.getTime());
  if (unit === 'months') {
    end.setUTCMonth(end.getUTCMonth() + Math.round(duration));
    end.setUTCDate(end.getUTCDate() - 1);
    return toIso(end);
  }
  const years = Math.floor(duration);
  const days = Math.round((duration - years) * 365.25);
  end.setUTCFullYear(end.getUTCFullYear() + years);
  end.setUTCDate(end.getUTCDate() + days - 1);
  return toIso(end);
};

export const cleanFlatNo = (flatNo) => String(flatNo ?? '').split('-old-')[0];

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
};

const sanitizeTenant = (t) => {
  const tenant = {
    name: String(t.name || ''),
    flatNo: String(t.flatNo || ''),
    building: String(t.building || ''),
    startDate: String(t.startDate || ''),
    duration: Number(t.duration) || 0,
    durationUnit: t.durationUnit === 'months' ? 'months' : 'years',
    terminationDate: t.terminationDate ? String(t.terminationDate) : undefined,
    history: Array.isArray(t.history) ? t.history.filter(h => h && typeof h === 'object').map(h => ({
      startDate: String(h.startDate || ''),
      duration: Number(h.duration) || 0,
      durationUnit: h.durationUnit === 'months' ? 'months' : 'years',
      terminationDate: h.terminationDate ? String(h.terminationDate) : undefined,
    })) : [],
  };
  // Same self-heal as the app: a termination before the start date is void.
  const term = parseDate(tenant.terminationDate), start = parseDate(tenant.startDate);
  if (term && start && start.getTime() > term.getTime()) tenant.terminationDate = undefined;
  return tenant;
};

const sanitizePayment = (p) => ({
  id: String(p.id || ''),
  tenantFlatNo: String(p.tenantFlatNo || ''),
  building: String(p.building || ''),
  paymentNo: Number(p.paymentNo) || 0,
  dueDate: String(p.dueDate || ''),
  amount: Number(p.amount) || 0,
  isPaid: Boolean(p.isPaid),
  paidAmount: p.paidAmount ? Number(p.paidAmount) : 0,
});

const isActiveOn = (t, today) => {
  if (t.terminationDate) {
    const term = parseDate(t.terminationDate);
    return !!term && term.getTime() > today.getTime();
  }
  const end = parseDate(calculateEndDate(t.startDate, t.duration, t.durationUnit));
  return !!end && end.getTime() >= today.getTime();
};

const newestFirst = (a, b) => (parseDate(b.startDate)?.getTime() || 0) - (parseDate(a.startDate)?.getTime() || 0);

const findTenantForPayment = (tenants, flatNo, today) => {
  if (!flatNo) return undefined;
  for (const matches of [tenants.filter(t => t.flatNo === flatNo), tenants.filter(t => cleanFlatNo(t.flatNo) === cleanFlatNo(flatNo))]) {
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const active = matches.filter(t => isActiveOn(t, today));
      return (active.length ? active : matches).sort(newestFirst)[0];
    }
  }
  return undefined;
};

const isPaymentActiveAndValid = (payment, tenant) => {
  const due = parseDate(payment.dueDate);
  if (!due || !tenant) return false;
  const dueTime = due.getTime();
  const archived = payment.tenantFlatNo.includes('-old-');

  if (archived) {
    const curStart = parseDate(tenant.startDate);
    if (curStart && dueTime >= curStart.getTime()) return false;
    if (tenant.history.length > 0) {
      const fits = tenant.history.some(h => {
        const hStart = parseDate(h.startDate);
        const hEnd = parseDate(h.terminationDate || calculateEndDate(h.startDate, h.duration, h.durationUnit));
        if (!hStart || !hEnd) return false;
        const hTerm = parseDate(h.terminationDate);
        if (hTerm && dueTime >= hTerm.getTime()) return false;
        return dueTime >= hStart.getTime() && dueTime <= hEnd.getTime();
      });
      if (!fits) return false;
    }
  } else {
    const start = parseDate(tenant.startDate);
    if (start && dueTime < start.getTime()) return false;
  }
  const term = parseDate(tenant.terminationDate);
  if (term && dueTime >= term.getTime()) return false;
  if (tenant.startDate && tenant.duration) {
    const end = parseDate(calculateEndDate(tenant.startDate, tenant.duration, tenant.durationUnit));
    if (end && dueTime > end.getTime()) return false;
  }
  return true;
};

/** Today's calendar date in Saudi Arabia as a UTC-midnight Date. */
export const todayInRiyadh = (now = new Date()) =>
  parseDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now));

/**
 * Late payments in one owner's data document: not fully paid, due before today, on a contract
 * that is still running. Returns [{ building, flatNo, tenantName, dueDate, remaining }].
 */
export const findOverduePayments = (ownerId, ownerDoc, today = todayInRiyadh()) => {
  const tenants = asArray(ownerDoc[`rentals_${ownerId}_tenants`]).filter(x => x && typeof x === 'object').map(sanitizeTenant);
  const payments = asArray(ownerDoc[`rentals_${ownerId}_payments`]).filter(x => x && typeof x === 'object').map(sanitizePayment);
  const result = [];

  for (const p of payments) {
    if (p.isPaid) continue;
    const due = parseDate(p.dueDate);
    if (!due || due.getTime() >= today.getTime()) continue;

    const buildingTenants = tenants.filter(t => t.building === p.building);
    const tenant = findTenantForPayment(buildingTenants, p.tenantFlatNo, today);
    if (!tenant) continue;
    const term = parseDate(tenant.terminationDate);
    if (term && term.getTime() <= today.getTime()) continue;
    if (tenant.startDate && tenant.duration) {
      const end = parseDate(calculateEndDate(tenant.startDate, tenant.duration, tenant.durationUnit));
      if (end && end.getTime() < today.getTime()) continue;
    }
    if (!isPaymentActiveAndValid(p, tenant)) continue;

    result.push({
      id: p.id,
      building: p.building,
      flatNo: cleanFlatNo(p.tenantFlatNo),
      tenantName: tenant.name,
      dueDate: p.dueDate,
      remaining: Math.max(0, Math.round((p.amount - (p.paidAmount || 0)) * 100) / 100),
    });
  }
  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};
