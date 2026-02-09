'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { Sidebar } from '@/components/layout/sidebar';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 ml-60 transition-all duration-200">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </div>
    </AuthGuard>
  );
}
