'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  resolveStudentNavigationKey,
  studentMobileDestinations,
  type StudentNavigationKey,
} from './student-navigation';

export function StudentMobileNavigation({ activeNav }: { activeNav?: StudentNavigationKey }) {
  const pathname = usePathname();
  const currentNav = activeNav ?? resolveStudentNavigationKey(pathname || '/areadoaluno');
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0F2942]/10 bg-[#F8F5EE]/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(15,41,66,0.08)] backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-lg items-end justify-around gap-1">
        {studentMobileDestinations.map(({ key, label, href, icon: Icon, prominent }) => {
          const isActive = currentNav === key;
          return (
            <Link
              key={key}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-bold transition-colors sm:min-h-12 sm:text-[11px] ${
                prominent
                  ? `relative -mt-5 max-w-20 rounded-full bg-[#2E5B37] px-2 py-2.5 text-white shadow-[0_8px_18px_rgba(46,91,55,0.35)] ring-4 ${isActive ? 'ring-[#76D69B]' : 'ring-[#F8F5EE]'}`
                  : isActive
                    ? 'bg-[#E3F1E4] text-[#2E5B37]'
                    : 'text-[#0F2942]/60 hover:bg-white hover:text-[#0F2942]'
              }`}
            >
              <Icon aria-hidden="true" className={prominent ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
