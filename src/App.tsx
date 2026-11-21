import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { DataProvider } from './context/DataContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './components/ux/Toast';
import { SearchPaletteProvider } from './components/ux/SearchPalette';
import { ConfirmProvider } from './components/ux/ConfirmDialog';
import KeyboardShortcutsOverlay from './components/ux/KeyboardShortcuts';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import PageLoader from './components/ux/PageLoader';

function safeLazy<T extends React.ComponentType<any>>(importFn: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error: any) {
      console.warn('Chunk load error (new deployment detected):', error);
      const hasReloaded = sessionStorage.getItem('chunk_reload_retry');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_reload_retry', 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      sessionStorage.removeItem('chunk_reload_retry');
      throw error;
    }
  });
}

const DashboardRouter = safeLazy(() => import('./pages/DashboardRouter'));
const ScanQueue = safeLazy(() => import('./pages/radiographer/ScanQueue'));
const ReviewQueue = safeLazy(() => import('./pages/radiologist/ReviewQueue'));
const CaseDetail = safeLazy(() => import('./pages/shared/CaseDetail'));
const PatientDetail = safeLazy(() => import('./pages/shared/PatientDetail'));
const UsersManagement = safeLazy(() => import('./pages/admin/UsersManagement'));
const ClinicsManagement = safeLazy(() => import('./pages/mo/ClinicsManagement'));
const MoPatientsList = safeLazy(() => import('./pages/mo/PatientsList'));
const MoPatientRegistration = safeLazy(() => import('./pages/mo/PatientRegistration'));
const MoNewCaseRegistration = safeLazy(() => import('./pages/mo/NewCaseRegistration'));
const MoAllCases = safeLazy(() => import('./pages/mo/AllCases'));
const PatientReportView = safeLazy(() => import('./pages/shared/PatientReportView'));
const NotFound = safeLazy(() => import('./pages/shared/NotFound'));

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><DashboardRouter /></Suspense>} />
        <Route path="/case/:caseId" element={<CaseDetail />} />
        <Route path="/patient/:patientId" element={<PatientDetail />} />

        {/* Medical Officer routes */}
        <Route path="/patients" element={<ProtectedRoute allowedRoles={['Medical Officer']}><MoPatientsList /></ProtectedRoute>} />
        <Route path="/patients/register" element={<ProtectedRoute allowedRoles={['Medical Officer']}><MoPatientRegistration /></ProtectedRoute>} />
        <Route path="/cases" element={<ProtectedRoute allowedRoles={['Medical Officer']}><MoAllCases /></ProtectedRoute>} />
        <Route path="/cases/new" element={<ProtectedRoute allowedRoles={['Medical Officer']}><MoNewCaseRegistration /></ProtectedRoute>} />
        <Route path="/track-status" element={<Navigate to="/cases" replace />} />

        {/* Radiographer routes */}
        <Route path="/scan-queue" element={<ProtectedRoute allowedRoles={['Radiographer', 'Public Hospital Radiographer', 'Private Hospital Radiographer']}><ScanQueue /></ProtectedRoute>} />
        <Route path="/schedule" element={<Navigate to="/scan-queue" replace />} />
        <Route path="/upload" element={<Navigate to="/scan-queue" replace />} />

        {/* Radiologist routes */}
        <Route path="/review-queue" element={<ProtectedRoute allowedRoles={['Radiologist']}><ReviewQueue /></ProtectedRoute>} />
        <Route path="/reporting" element={<Navigate to="/review-queue" replace />} />

        {/* Administrator routes */}
        <Route path="/clinics" element={<ProtectedRoute allowedRoles={['Administrator', 'Super Admin']}><ClinicsManagement /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute allowedRoles={['Administrator', 'Super Admin']}><UsersManagement /></ProtectedRoute>} />
      </Route>

      {/* Public patient report access */}
      <Route
        path="/report/:caseId/:token"
        element={
          <Suspense
            fallback={
              <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <PatientReportView />
          </Suspense>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Suspense fallback={<div />}><NotFound /></Suspense>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <DataProvider>
              <ToastProvider>
                <SearchPaletteProvider>
                  <ConfirmProvider>
                    <AppRoutes />
                    <KeyboardShortcutsOverlay />
                  </ConfirmProvider>
                </SearchPaletteProvider>
              </ToastProvider>
            </DataProvider>
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
