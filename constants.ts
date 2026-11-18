// FIX: Defined and exported constants to be used across the application.
// This resolves circular dependency issues and missing export errors by removing service logic
// and only exporting constant values. This also defines LANDLORD_DATA to fix import errors in printable components.
// Global DB keys (not prefixed by user)
export const GLOBAL_DB_KEYS = {
  USERS: 'rentals_global_users', // Stores array of all users
};

// Base DB keys mapping for entities
export const DB_KEYS = {
  BUILDINGS: 'buildings',
  TENANTS: 'tenants',
  PAYMENTS: 'payments',
  EXPENSES: 'expenses',
  NOTES: 'notes',
  LANDLORD_NAME: 'landlord_name',
  DELETE_PASSWORD: 'delete_password',
  SECRET_WORD: 'secret_word',
  ACTIVITY_LOG: 'activity_log',
};
