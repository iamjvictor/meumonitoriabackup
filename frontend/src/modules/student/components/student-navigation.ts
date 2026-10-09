import type { LucideIcon } from 'lucide-react';
import { BarChart3, Bot, LayoutGrid, MessageCircle, Trophy } from 'lucide-react';

export type StudentNavigationKey = 'home' | 'chat' | 'practice' | 'ranking' | 'performance' | 'profile';

export interface StudentNavigationDestination {
  key: StudentNavigationKey;
  label: string;
  href: string;
  icon: LucideIcon;
  prominent?: boolean;
}

export const studentMobileDestinations: readonly StudentNavigationDestination[] = [
  { key: 'home', label: 'Início', href: '/areadoaluno', icon: LayoutGrid },
  { key: 'chat', label: 'Chat', href: '/areadoaluno/chat', icon: MessageCircle },
  { key: 'practice', label: 'Praticar', href: '/areadoaluno/pratica', icon: Bot, prominent: true },
  { key: 'ranking', label: 'Ranking', href: '/areadoaluno/ranking', icon: Trophy },
  { key: 'performance', label: 'Desempenho', href: '/areadoaluno/desempenho', icon: BarChart3 },
] as const;

export function resolveStudentNavigationKey(pathname: string): StudentNavigationKey {
  if (pathname === '/areadoaluno' || pathname === '/areadoaluno/') return 'home';
  if (pathname.startsWith('/areadoaluno/pratica')) return 'practice';
  if (pathname.startsWith('/areadoaluno/ranking')) return 'ranking';
  if (pathname.startsWith('/areadoaluno/desempenho')) return 'performance';
  if (pathname.startsWith('/areadoaluno/perfil')) return 'profile';
  if (pathname.startsWith('/areadoaluno/chat')) return 'chat';
  return 'home';
}
