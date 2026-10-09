'use client';
import { OptimizedImage } from '@/shared';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bot, Brain, MessageCircle, Search, Plus, Layers
} from 'lucide-react';
import { StudentHeader, StudentRightSidebar, StudentSidebar, TeacherAvatar, useEntitlements, useStudent } from '@/modules/student';
import type { StudentMonitorRecord } from '@/modules/student/context/StudentContext';
import type { EntitlementMonitor } from '@/modules/student';
import { useAlert } from '@/shared';

interface SubscribedAgent {
  id: string;
  subject: string;
  title: string;
  teacherName: string;
  teacherInitials: string;
  teacherArea: string;
  teacherAvatarUrl?: string | null;
  coverUrl?: string | null;
  progress: number;
  questionsCount: number;
  flashcardsCount: number;
  lastAccess: string;
  coverGradient: string;
  icon: string;
  description: string;
}

const gradients = [
  'from-[#1B4332] via-[#2E5B37] to-[#40916C]',
  'from-[#0F2942] via-[#173C67] to-[#2563EB]',
  'from-[#78350F] via-[#92400E] to-[#D97706]',
  'from-[#4C1D95] via-[#6B21A8] to-[#9333EA]',
  'from-[#064E3B] via-[#059669] to-[#10B981]',
  'from-[#7F1D1D] via-[#991B1B] to-[#DC2626]',
];

const icons = ['∑', 'Φ', '△', '⚗', '🧬', '📜', '⚛', '⚡'];

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'MA';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export default function MeusAgentesPage() {
  const { student, status } = useStudent();
  const { monitors: entitlementMonitors, isLoading: isLoadingEntitlements } = useEntitlements();
  const { showAlert } = useAlert();
  const [agents, setAgents] = useState<SubscribedAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('Todos');

  const isTeacher = ['teacher', 'professor', 'admin'].includes(student?.role?.toLowerCase() || '');

  useEffect(() => {
    async function loadAgents() {
      if (status === 'loading') return;
      setIsLoading(true);
      try {
      const rawMonitors = entitlementMonitors.map((monitor: EntitlementMonitor) => ({
          id: monitor.monitorId, name: monitor.name, description: monitor.description ?? undefined,
          avatarUrl: monitor.avatarUrl ?? null, teacherName: monitor.teacherName,
          teacher: { fullName: monitor.teacherName, avatarUrl: monitor.teacherAvatarUrl ?? null },
          subjects: monitor.subjects, _count: { questions: monitor.approvedQuestionCount, flashcards: monitor.approvedFlashcardCount },
        })) as StudentMonitorRecord[];
        const mapped: SubscribedAgent[] = rawMonitors.map((m: StudentMonitorRecord, index: number) => {
          const teacherName = m.teacher?.fullName || student?.fullName || 'Professor';
          const teacherInitials = getInitials(teacherName);
          const teacherArea = m.teacher?.area || 'Monitoria';
          const subjectName = m.subjects?.[0]?.name || m.teacher?.area || 'Geral';
          const teacherAvatarUrl = m.teacher?.avatarUrl || (isTeacher ? student?.avatarUrl : null);
          const coverUrl = m.avatarUrl || null;

          return {
            id: m.id,
            subject: subjectName,
            title: m.name,
            teacherName,
            teacherInitials,
            teacherArea,
            teacherAvatarUrl,
            coverUrl,
            progress: 0,
            questionsCount: m._count?.questions ?? 0,
            flashcardsCount: m._count?.flashcards ?? 0,
            lastAccess: 'Recente',
            coverGradient: gradients[index % gradients.length],
            icon: icons[index % icons.length],
            description: m.description || m.detailedDescription || 'Agente de IA treinado com a metodologia do professor.',
          };
        });

        setAgents(mapped);
      } catch (err) {
        console.error('[MeusAgentesPage] Erro ao carregar agentes:', err);
        setAgents([]);
      } finally {
        setIsLoading(false);
      }
    }

    void loadAgents();
  }, [status, entitlementMonitors, isTeacher, student]);

  useEffect(() => { if (isLoadingEntitlements) setIsLoading(true); }, [isLoadingEntitlements]);

  const uniqueSubjects = Array.from(new Set(agents.map((a) => a.subject).filter(Boolean)));
  const subjects = ['Todos', ...uniqueSubjects];

  const filteredAgents = agents.filter((agent) => {
    const title = typeof agent.title === 'string' ? agent.title : '';
    const subject = typeof agent.subject === 'string' ? agent.subject : '';
    const teacherName = typeof agent.teacherName === 'string' ? agent.teacherName : '';
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      title.toLowerCase().includes(query) ||
      subject.toLowerCase().includes(query) ||
      teacherName.toLowerCase().includes(query);
    const matchesSubject = selectedSubject === 'Todos' || subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#0F2942]">
      <div className="flex min-h-screen w-full">
        <StudentSidebar activeNav="agents" />

        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
          <StudentHeader
            title={isTeacher ? 'Agentes do Professor' : 'Meus Agentes Assinados'}
            breadcrumbs={[
              { label: 'Área do aluno', href: '/areadoaluno' },
              { label: 'Meus agentes' },
            ]}
          />

          {/* Controls: Search and Subject Filters */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0F2942]/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar agente, matéria ou professor..."
                className="w-full rounded-xl border border-[#0F2942]/12 bg-white px-10 py-2.5 text-xs font-semibold text-[#0F2942] placeholder-[#0F2942]/40 shadow-sm transition focus:border-[#2E5B37] focus:outline-none focus:ring-2 focus:ring-[#2E5B37]/15"
              />
            </div>

            {subjects.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {subjects.map((subj) => (
                  <button
                    key={subj}
                    onClick={() => setSelectedSubject(subj)}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                      selectedSubject === subj
                        ? 'bg-[#0F2942] text-white shadow-sm'
                        : 'bg-white/70 text-[#0F2942]/65 border border-[#0F2942]/10 hover:bg-white hover:text-[#0F2942]'
                    }`}
                  >
                    {subj}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agents Grid */}
          <div className="mt-6">
            {isLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-64 rounded-[24px] border border-[#0F2942]/10 bg-white/50 animate-pulse p-4 flex flex-col justify-between"
                  >
                    <div className="h-24 rounded-xl bg-slate-200/60 w-full" />
                    <div className="space-y-2 mt-4">
                      <div className="h-4 bg-slate-200/60 rounded w-1/3" />
                      <div className="h-5 bg-slate-200/60 rounded w-3/4" />
                      <div className="h-3 bg-slate-200/60 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredAgents.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {filteredAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] border border-[#0F2942]/10 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#2E5B37]/30 hover:shadow-[0_20px_40px_rgba(46,91,55,0.12)]"
                  >
                    {/* Top Cover Banner */}
                    <div
                      className={`relative h-28 w-full ${agent.coverUrl ? 'bg-slate-900' : `bg-gradient-to-r ${agent.coverGradient}`} p-4 flex items-start justify-between overflow-hidden`}
                    >
                      {agent.coverUrl ? (
                        <>
                          <OptimizedImage
                            src={agent.coverUrl}
                            alt={agent.title}
                            className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30" />
                        </>
                      ) : (
                        <span className="absolute -right-2 -bottom-3 text-7xl font-bold text-white/10 select-none font-heading">
                          {agent.icon}
                        </span>
                      )}

                      <span className="relative z-10 rounded-md bg-white/20 backdrop-blur-md px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white border border-white/25 shadow-sm">
                        {agent.subject}
                      </span>

                      <span className="relative z-10 inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-md px-2.5 py-0.5 text-[9px] font-bold text-white border border-white/25 shadow-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#76D69B] animate-pulse" />
                        Ativo
                      </span>
                    </div>

                    {/* Teacher Profile Avatar Overlapping Cover */}
                    <div className="relative -mt-8 px-4 flex items-end justify-between z-10">
                      <TeacherAvatar
                        src={agent.teacherAvatarUrl}
                        alt={agent.teacherName}
                        initials={agent.teacherInitials}
                        sizeClassName="h-16 w-16 text-sm"
                      />

                      <span className="text-[10px] font-bold text-[#2E5B37] bg-[#E3F1E4] px-2 py-0.5 rounded-md">
                        Domínio: {agent.progress}%
                      </span>
                    </div>

                    {/* Compact Text Area */}
                    <div className="p-4 pt-2 flex flex-col justify-between flex-1">
                      <div>
                        <p className="text-[11px] font-bold text-[#0F2942]/50">
                          {agent.teacherName}
                        </p>

                        <h3 className="mt-0.5 font-heading text-base font-bold leading-tight text-[#0F2942] group-hover:text-[#2E5B37] transition line-clamp-1">
                          {agent.title}
                        </h3>

                        <p className="mt-1.5 text-xs leading-relaxed text-[#0F2942]/65 line-clamp-2">
                          {agent.description}
                        </p>

                        {/* Clean Stats Row */}
                        <div className="mt-3.5 flex items-center justify-between text-xs font-medium text-[#0F2942]">
                          <div className="flex items-center gap-1.5">
                            <Brain className="h-4 w-4 text-[#0F2942]/75" />
                            <span>{agent.questionsCount} questões</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Layers className="h-4 w-4 text-[#0F2942]/75" />
                            <span>{agent.flashcardsCount} flashcards</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 pt-3 border-t border-[#0F2942]/08 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => showAlert({
                            title: 'Iniciar Conversa',
                            message: `Preparando sala de chat com o monitor: ${agent.title}.`,
                            type: 'info',
                            showSupport: false,
                          })}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0F2942] px-3 py-2 text-xs font-bold text-white transition duration-200 hover:bg-[#1C466D] shadow-sm cursor-pointer"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-[#76D69B]" />
                          <span>Conversar</span>
                        </button>
                        <Link
                          href="/areadoaluno/pratica"
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-3 py-2 text-xs font-bold text-[#0F2942] transition duration-200 hover:bg-white hover:border-[#2E5B37]/30 hover:text-[#2E5B37] cursor-pointer"
                        >
                          <Brain className="h-3.5 w-3.5" />
                          <span>Praticar</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-[#0F2942]/10 bg-white/70 p-12 text-center shadow-sm">
                <Bot className="mx-auto h-12 w-12 text-[#0F2942]/30" />
                <h3 className="mt-4 font-heading text-lg font-bold text-[#0F2942]">
                  Nenhum agente encontrado
                </h3>
                <p className="mt-1 text-xs text-[#0F2942]/50 max-w-sm mx-auto">
                  {isTeacher
                    ? 'Você ainda não possui agentes cadastrados no sistema. Acesse o painel do professor para criar seu primeiro monitor.'
                    : searchQuery || selectedSubject !== 'Todos'
                    ? 'Tente alterar os termos da busca ou selecione outro filtro de disciplina.'
                    : 'Você ainda não assinou nenhum agente. Explore os monitores disponíveis para iniciar.'}
                </p>
                {searchQuery || selectedSubject !== 'Todos' ? (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedSubject('Todos');
                    }}
                    className="mt-4 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#1C466D]"
                  >
                    Limpar filtros
                  </button>
                ) : isTeacher ? (
                  <Link
                    href="/professor"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Criar no Painel do Professor</span>
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <StudentRightSidebar />
      </div>
    </main>
  );
}
