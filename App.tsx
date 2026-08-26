import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainPage from './pages/MainPage';
import BuildingPage from './pages/BuildingPage';
import TenantFormPage from './pages/TenantFormPage';
import RentalsReportPage from './pages/RentalsReportPage';
import ExpensesPage from './pages/ExpensesPage';
import NotesPage from './pages/NotesPage';
import PaymentsPage from './pages/PaymentsPage';
import LoginPage from './pages/LoginPage';
import WorkerManagementPage from './pages/WorkerManagementPage';
import EventsPage from './pages/EventsPage';
import ContactPage from './pages/ContactPage';

const AppRoutes: React.FC = () => {
  const { user } = useAuth();
  const isNative = Capacitor.isNativePlatform();

  // Only require login on Web
  if (!isNative && !user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/:buildingName" element={<BuildingPage />} />
      <Route path="/:buildingName/tenants/add" element={<TenantFormPage />} />
      <Route path="/:buildingName/tenants/edit/:flatNo" element={<TenantFormPage />} />
      <Route path="/:buildingName/tenants/renew/:flatNo" element={<TenantFormPage />} />
      <Route path="/:buildingName/tenants/:flatNo/payments" element={<PaymentsPage />} />
      <Route path="/:buildingName/rentals" element={<RentalsReportPage />} />
      <Route path="/:buildingName/expenses" element={<ExpensesPage />} />
      <Route path="/:buildingName/notes" element={<NotesPage />} />
      <Route path="/worker-management" element={<WorkerManagementPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/:buildingName/events" element={<EventsPage />} />
      <Route path="/contact" element={<ContactPage />} />
    </Routes>
  );
};

function App() {
  const isNative = Capacitor.isNativePlatform();
  const basename = isNative ? '/' : '/3marh/';

  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;