import type { ReactNode } from 'react';
import { TeacherSessionGuard } from '@/modules/teacher/components/TeacherSessionGuard';

export default function TeacherAreaLayout({ children }: { children: ReactNode }) {
  return <TeacherSessionGuard>{children}</TeacherSessionGuard>;
}
