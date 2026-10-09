'use client';

import { StudentRightSidebar } from '@/modules/student';

export default function StudentChatPage() {
  return (
    <main className="min-h-screen w-full overflow-x-clip bg-[#F5F1E8] text-[#0F2942]">
      <div data-testid="student-chat-surface" className="min-h-screen [&_aside]:!flex [&_aside]:!h-[calc(100dvh-3.8125rem-env(safe-area-inset-bottom))] [&_aside]:!w-full">
        <StudentRightSidebar />
      </div>
    </main>
  );
}
