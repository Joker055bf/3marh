export interface Contract {
  contractNo: string;
  startDate: string;
  duration: number;
  amount: number;
  paymentsCount: number;
  terminationDate?: string;
}

export interface Tenant {
  name: string;
  nationality: string;
  idNumber: string;
  phone: string;
  city?: string;
  district?: string;
  flatNo: string;
  building: string;
  // Current contract details
  contractNo: string;
  startDate: string;
  duration: number;
  amount: number;
  paymentsCount: number;
  terminationDate?: string;
  // History of previous contracts
  history?: Contract[];
  electricityMeterNumber?: string;
}

export interface Payment {
  id: string;
  tenantFlatNo: string;
  building: string;
  paymentNo: number;
  dueDate: string;
  amount: number;
  isPaid: boolean;
  paidAmount?: number;
  partialHistory?: { amount: number; date: string }[];
}

export interface Expense {
  id: string;
  building: string;
  amount: number;
  note: string;
  date: string;
}

export interface Note {
  id: string;
  building: string;
  note: string;
}

export interface Building {
  name: string;
  totalUnits: number;
  maintenanceUnits?: number;
}

export interface WorkerPermissions {
  canAddTenants: boolean;
  canEditTenants: boolean;
  canRenewContracts: boolean;
  canViewPayments: boolean;
  canViewHistory: boolean;
  canViewAlerts: boolean;
  canViewReports: boolean;
  canViewExpenses: boolean;
  canViewNotes: boolean;
  canViewInquiry: boolean;
  canViewEvents: boolean;
  canViewUnits: boolean;
  allowedBuildings?: string[];
  allowedUnits?: Record<string, string[]>;
}

export interface User {
  username: string;
  password?: string;
  email?: string;
  role: 'owner' | 'worker';
  ownerId: string;
  workerName?: string;
  workerId?: string; // unique ID for each worker
  permissions?: WorkerPermissions;
}

export type ActivityType = 'tenant_added' | 'tenant_edited' | 'tenant_terminated' | 'payment_paid' | 'payment_partial' | 'payment_unpaid' | 'expense_added' | 'expense_deleted' | 'worker_action';

export interface ActivityLog {
  id: string;
  type: ActivityType;
  description: string;
  buildingName?: string;
  tenantName?: string;
  flatNo?: string;
  amount?: number;
  date: string; // ISO date string
  timestamp: number; // Unix ms
  performedBy: string; // username
  performedByName?: string; // display name
  isWorkerAction: boolean;
}