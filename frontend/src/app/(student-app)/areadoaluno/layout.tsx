import type { ReactNode } from 'react';
import { EntitlementProvider, StudentMobileNavigation, StudentProvider, StudentSessionGuard } from '@/modules/student';

export default function StudentAreaLayout({ children }: { children: ReactNode }) {
  return (
    <StudentProvider>
      <EntitlementProvider>
        <StudentSessionGuard>
          <StudentMobileNavigation />
          {children}
        </StudentSessionGuard>
      </EntitlementProvider>
    </StudentProvider>
  );
}
