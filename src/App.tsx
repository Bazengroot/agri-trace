import React, { Component, ErrorInfo, ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./store";
import { AccessDenied, Shell } from "./components/layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { FarmsPage, FarmDetailPage, LocationsPage, DepartmentsPage, CategoriesPage, TemplatesPage, RiskMatrixPage } from "./pages/MasterData";
import { ProgramsPage, PlansPage, AuditsListPage, CalendarPage, AuditDetailPage } from "./pages/Audits";
import { MyAuditsPage, ExecutePage, EvidencePage } from "./pages/Execution";
import { FindingsPage, FindingDetailPage, CorrectiveActionsPage, OverduePage, VerificationPage } from "./pages/Findings";
import { ReportsHomePage, ReportViewerPage, FindingReportsPage, CompliancePage, ComparisonPage, TrendsPage } from "./pages/Reports";
import { UsersAdminPage, RolesPage, SettingsPage, ConfigPage, LogsPage } from "./pages/Admin";
import type { Perm } from "./types";

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Application Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
          <div className="card max-w-md p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-ink-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-600 mb-4">
              An unexpected error occurred. Please refresh the page or contact support if the problem persists.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg w-full transition-colors"
            >
              Refresh Page
            </button>
            {false && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-slate-500 cursor-pointer">Error Details</summary>
                <pre className="mt-2 p-2 bg-slate-100 rounded text-xs overflow-auto">
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function Guard({ perm, children }: { perm?: Perm; children: React.ReactNode }) {
  const { user, can } = useApp();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (perm && !can(perm)) return <AccessDenied />;
  return <>{children}</>;
}

function NotFound() {
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginGate />} />
            <Route path="/*" element={<Authenticated />} />
          </Routes>
        </HashRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

function LoginGate() {
  const { user } = useApp();
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

function Authenticated() {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Guard perm="dashboard"><Dashboard /></Guard>} />

        <Route path="/calendar" element={<Guard perm="dashboard"><CalendarPage /></Guard>} />
        <Route path="/programs" element={<Guard perm="manage_programs"><ProgramsPage /></Guard>} />
        <Route path="/plans" element={<Guard perm="schedule_audits"><PlansPage /></Guard>} />
        <Route path="/audits" element={<Guard perm="dashboard"><AuditsListPage /></Guard>} />
        <Route path="/audits/completed" element={<Guard perm="dashboard"><AuditsListPage completed /></Guard>} />
        <Route path="/audit/:id" element={<Guard perm="dashboard"><AuditDetailPage /></Guard>} />

        <Route path="/my-audits" element={<Guard perm="execute_audits"><MyAuditsPage /></Guard>} />
        <Route path="/execute/:id" element={<Guard perm="execute_audits"><ExecutePage /></Guard>} />
        <Route path="/evidence" element={<Guard perm="dashboard"><EvidencePage /></Guard>} />

        <Route path="/findings" element={<Guard perm="dashboard"><FindingsPage /></Guard>} />
        <Route path="/findings/open" element={<Guard perm="dashboard"><FindingsPage openOnly /></Guard>} />
        <Route path="/finding/:id" element={<Guard perm="dashboard"><FindingDetailPage /></Guard>} />
        <Route path="/corrective-actions" element={<Guard perm="dashboard"><CorrectiveActionsPage /></Guard>} />
        <Route path="/overdue" element={<Guard perm="dashboard"><OverduePage /></Guard>} />
        <Route path="/verification" element={<Guard perm="verify_ca"><VerificationPage /></Guard>} />

        <Route path="/farms" element={<Guard perm="manage_master_data"><FarmsPage /></Guard>} />
        <Route path="/farm/:id" element={<Guard perm="dashboard"><FarmDetailPage /></Guard>} />
        <Route path="/locations" element={<Guard perm="manage_master_data"><LocationsPage /></Guard>} />
        <Route path="/departments" element={<Guard perm="manage_master_data"><DepartmentsPage /></Guard>} />
        <Route path="/categories" element={<Guard perm="manage_master_data"><CategoriesPage /></Guard>} />
        <Route path="/templates" element={<Guard perm="manage_master_data"><TemplatesPage /></Guard>} />
        <Route path="/risk-matrix" element={<Guard perm="manage_master_data"><RiskMatrixPage /></Guard>} />

        <Route path="/reports" element={<Guard perm="view_reports"><ReportsHomePage /></Guard>} />
        <Route path="/report/:id" element={<Guard perm="view_reports"><ReportViewerPage /></Guard>} />
        <Route path="/reports/findings" element={<Guard perm="view_reports"><FindingReportsPage /></Guard>} />
        <Route path="/reports/compliance" element={<Guard perm="view_reports"><CompliancePage /></Guard>} />
        <Route path="/comparison" element={<Guard perm="view_reports"><ComparisonPage /></Guard>} />
        <Route path="/trends" element={<Guard perm="view_reports"><TrendsPage /></Guard>} />

        <Route path="/admin/users" element={<Guard perm="manage_users"><UsersAdminPage /></Guard>} />
        <Route path="/admin/roles" element={<Guard perm="manage_users"><RolesPage /></Guard>} />
        <Route path="/admin/settings" element={<Guard perm="manage_settings"><SettingsPage /></Guard>} />
        <Route path="/admin/config" element={<Guard perm="manage_settings"><ConfigPage /></Guard>} />
        <Route path="/admin/logs" element={<Guard perm="view_logs"><LogsPage /></Guard>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}
