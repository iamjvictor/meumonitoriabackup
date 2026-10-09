import React from 'react';
import { Metadata } from 'next';
import { TeacherProfileView } from '@/modules/teacher/components/TeacherProfileView';

export const metadata: Metadata = {
  title: 'Meu Perfil | MeuMonitor AI',
  description: 'Gerencie suas informações pessoais, foto de perfil e redes sociais no MeuMonitor AI.',
};

export default function TeacherProfilePage() {
  return <TeacherProfileView />;
}
