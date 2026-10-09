import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { cache } from 'react';
import StorefrontClient from './StorefrontClient';

type TeacherPublicProfile = {
  fullName: string;
  username: string;
  area: string;
  customArea: string | null;
  bio: string | null;
  pageSlug: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  status: string;
  monitors?: Array<{
    id: string;
    name: string;
    description: string | null;
    avatarUrl?: string | null;
    detailedDescription?: string | null;
    subjects?: Array<{
      id: string;
      name: string;
      topics?: Array<{
        id: string;
        name: string;
      }>;
    }>;
    _count?: {
      questions: number;
      flashcards: number;
    };
  }>;
};

type TeacherPublicPageProps = {
  params: Promise<{ teacherSlug: string }>;
};

const getTeacherProfile = cache(async (slug: string): Promise<TeacherPublicProfile> => {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
  const response = await fetch(`${backendUrl}/api/v1/teachers/public/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });

  if (!response.ok) notFound();

  const payload = await response.json();
  return payload.data;
});

export async function generateMetadata({ params }: TeacherPublicPageProps): Promise<Metadata> {
  const { teacherSlug } = await params;
  try {
    const teacher = await getTeacherProfile(teacherSlug);
    return {
      title: `${teacher.fullName} - Professor | MeuMonitor AI`,
      description: teacher.bio || `Acesse os monitores e assistentes de estudo do professor ${teacher.fullName} no MeuMonitor AI.`,
    };
  } catch {
    return {
      title: 'Página do Professor | MeuMonitor AI',
    };
  }
}

export default async function TeacherPublicPage({ params }: TeacherPublicPageProps) {
  const { teacherSlug } = await params;
  const teacher = await getTeacherProfile(teacherSlug);

  return <StorefrontClient teacher={teacher} />;
}
