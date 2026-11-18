// Seeds the local Firestore emulator with fake data in the OLD format (plaintext user list),
// so the migration and the security rules can be tested without touching real data.
//   node scripts/emulator/seed-legacy.mjs
import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
admin.initializeApp({ projectId: 'marh-6ccfc' });
const db = admin.firestore();

const users = [
  { username: 'Ali', password: 'abcd', role: 'owner', ownerId: 'Ali', email: 'ali@example.com' },
  { username: 'sara', password: 'sara123', role: 'owner', ownerId: 'sara' },
  {
    username: 'w1', password: 'w1pass', role: 'worker', ownerId: 'Ali', workerName: 'عامل تجريبي', workerId: 'w_1',
    permissions: { canAddTenants: true, canEditTenants: false, canRenewContracts: false, canViewPayments: true, canViewHistory: false,
      canViewAlerts: true, canViewReports: false, canViewExpenses: false, canViewNotes: false, canViewInquiry: false, canViewEvents: true, canViewUnits: true },
  },
];

await db.doc('users/global_system').set({ rentals_global_users: users });
await db.doc('users/Ali').set({
  rentals_Ali_buildings: [{ name: 'عمارة الاختبار', totalUnits: 4 }],
  rentals_Ali_tenants: [],
  rentals_Ali_delete_password: 'abcd',
  rentals_Ali_landlord_name: 'علي',
});
await db.doc('users/sara').set({ rentals_sara_buildings: [{ name: 'برج سارة', totalUnits: 6 }], rentals_sara_delete_password: 'sara123' });
await db.doc('users/orphan').set({ rentals_orphan_buildings: [] });
console.log('Seeded legacy data: 3 users (Ali, sara, worker w1) and 3 owner documents.');
process.exit(0);
