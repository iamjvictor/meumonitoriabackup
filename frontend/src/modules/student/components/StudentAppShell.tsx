'use client';

import type { ReactNode } from 'react';
import { StudentHeader } from './StudentHeader';
import { StudentMobileNavigation } from './StudentMobileNavigation';
import { StudentRightSidebar } from './StudentRightSidebar';
import { StudentSidebar } from './StudentSidebar';
import type { StudentNavigationKey } from './student-navigation';

export interface StudentAppShellProps {
  activeNav: StudentNavigationKey;
  header?: ReactNode;
  showMobileNavigation?: boolean;
  children: ReactNode;
}

const desktopNavigation: Record<StudentNavigationKey, Parameters<typeof StudentSidebar>[0]['activeNav']> = {
  home: 'overview',
  chat: 'chats',
  practice: 'practice',
  ranking: 'ranking',
  performance: 'performance',
  profile: 'overview',
};

export function StudentAppShell({ activeNav, header, showMobileNavigation = true, children }: StudentAppShellProps) {
  return (
    <main
      data-testid="student-app-content"
      className="min-h-screen w-full overflow-x-clip bg-[#F5F1E8] pb-[calc(5rem+env(safe-area-inset-bottom))] text-[#0F2942] lg:pb-0"
    >
      <div className="flex min-h-screen w-full">
        <StudentSidebar activeNav={desktopNavigation[activeNav]} />

        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
          {header ?? <StudentHeader />}
          <div className="min-w-0">{children}</div>
        </section>

        <StudentRightSidebar />
      </div>

      {showMobileNavigation && <StudentMobileNavigation activeNav={activeNav} />}
    </main>
  );
}
