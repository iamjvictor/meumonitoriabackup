'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  Loader2,
  Plus,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { OptimizedImage } from '@/shared';
import type { TeacherMonitor } from '../services/TeacherMonitorService';

export interface RankingStudent {
  rank: number;
  studentId: string;
  fullName: string;
  avatarUrl: string | null;
  score: number;
  correctAnswers: number;
  totalAnswered: number;
  accuracy: number;
  streakDays: number;
  totalChallenges?: number;
  isCurrentUser?: boolean;
}

interface TeacherMonitorRankingViewProps {
  monitors: TeacherMonitor[];
  onCreateMonitor?: () => void;
}

export const TeacherMonitorRankingView: React.FC<TeacherMonitorRankingViewProps> = ({
  monitors,
  onCreateMonitor,
}) => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

  // Monitor selecionado
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>(() => monitors[0]?.id || '');
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [searchQuery, setSearchQuery] = useState('');

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const [selectedMonth] = useState<string>(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date());
  });

  const [rankingList, setRankingList] = useState<RankingStudent[]>([]);
  const [totalChallengesInPeriod, setTotalChallengesInPeriod] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Sincroniza o monitor selecionado caso a lista de monitores mude
  useEffect(() => {
    if (monitors.length > 0 && (!selectedMonitorId || !monitors.some((m) => m.id === selectedMonitorId))) {
      setSelectedMonitorId(monitors[0].id);
    }
  }, [monitors, selectedMonitorId]);

  // Carrega os dados do ranking para o monitor e período selecionados
  useEffect(() => {
    if (!selectedMonitorId) {
      setRankingList([]);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(false);

    const fetchRanking = async () => {
      try {
        const res = await fetch(
          `${apiUrl}/api/v1/student/monitors/${selectedMonitorId}/daily-challenge/ranking?period=${selectedPeriod}&month=${selectedMonth}`,
          { credentials: 'include', cache: 'no-store' }
        );

        if (res.status === 404) {
          if (!isCancelled) {
            setRankingList([]);
            setTotalChallengesInPeriod(selectedPeriod === 'week' ? 7 : 0);
          }
          return;
        }

        if (!res.ok) {
          throw new Error(`Falha ao buscar ranking: ${res.status}`);
        }

        const data = await res.json();
        if (isCancelled) return;

        if (data.data && Array.isArray(data.data.ranking) && data.data.ranking.length > 0) {
          const mapped: RankingStudent[] = data.data.ranking.map((item: RankingStudent) => ({
            ...item,
            fullName: item.fullName || 'Estudante',
            avatarUrl: item.avatarUrl || null,
          }));

          const periodChallenges =
            typeof data.data.totalChallenges === 'number'
              ? data.data.totalChallenges
              : selectedPeriod === 'week'
              ? 7
              : 0;

          setRankingList(mapped);
          setTotalChallengesInPeriod(periodChallenges);
        } else {
          setRankingList([]);
          setTotalChallengesInPeriod(selectedPeriod === 'week' ? 7 : 0);
        }
      } catch (err) {
        console.error('Erro ao carregar ranking do monitor:', err);
        if (!isCancelled) {
          setError(true);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchRanking();

    return () => {
      isCancelled = true;
    };
  }, [apiUrl, retryNonce, selectedMonth, selectedMonitorId, selectedPeriod]);

  // Informações do monitor ativo
  const activeMonitor = useMemo(() => {
    return monitors.find((m) => m.id === selectedMonitorId) || monitors[0] || null;
  }, [monitors, selectedMonitorId]);

  const periodLabel = useMemo(() => {
    if (selectedPeriod === 'week') return 'Últimos 7 dias';
    if (selectedPeriod === 'all') return 'Histórico Geral';
    return 'Este mês';
  }, [selectedPeriod]);

  // Métricas agregadas do ranking deste monitor
  const monitorStats = useMemo(() => {
    const totalParticipants = rankingList.length;
    const totalAnswers = rankingList.reduce((acc, curr) => acc + (curr.totalAnswered || 0), 0);
    const totalCorrect = rankingList.reduce((acc, curr) => acc + (curr.correctAnswers || 0), 0);
    const avgAccuracy =
      totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
    const topScore = rankingList[0]?.score ?? 0;
    const leaderName = rankingList[0]?.fullName ?? 'Nenhum participante';

    return {
      totalParticipants,
      totalAnswers,
      totalCorrect,
      avgAccuracy,
      topScore,
      leaderName,
    };
  }, [rankingList]);

  // Lista filtrada pela barra de pesquisa
  const filteredRanking = useMemo(() => {
    if (!searchQuery.trim()) return rankingList;
    return rankingList.filter((student) =>
      student.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [rankingList, searchQuery]);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedPeriod, selectedMonitorId, pageSize]);

  // Pódio Top 3
  const top3 = useMemo(() => {
    const first = filteredRanking.find((s) => s.rank === 1) || (filteredRanking.length > 0 ? filteredRanking[0] : null);
    const second = filteredRanking.find((s) => s.rank === 2) || (filteredRanking.length > 1 ? filteredRanking[1] : null);
    const third = filteredRanking.find((s) => s.rank === 3) || (filteredRanking.length > 2 ? filteredRanking[2] : null);
    return { first, second, third };
  }, [filteredRanking]);

  // Paginação dos alunos
  const totalPages = Math.max(1, Math.ceil(filteredRanking.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedStudents = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredRanking.slice(startIndex, startIndex + pageSize);
  }, [filteredRanking, safeCurrentPage, pageSize]);

  // Se o professor não tiver nenhum monitor criado
  if (monitors.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 text-center shadow-sm space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-[#132E20]/10 text-[#132E20] flex items-center justify-center mx-auto">
          <Bot className="w-8 h-8" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="font-heading text-xl font-bold text-[#0F2942]">
            Nenhum Monitor de IA criado ainda
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            Crie seu primeiro agente inteligente de estudo para que os alunos possam interagir, responder desafios e participar do ranking.
          </p>
        </div>
        {onCreateMonitor && (
          <button
            type="button"
            onClick={onCreateMonitor}
            className="min-h-11 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#132E20] hover:bg-[#1B3B2B] text-white text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Primeiro Monitor</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SELETOR DE MONITORIA E CABEÇALHO */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 text-xs font-extrabold uppercase tracking-wider text-[#2E5B37]">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Ranking dos Alunos por Monitor</span>
            </div>
            <h2 className="font-heading text-2xl font-bold text-[#0F2942]">
              Desempenho no Monitor
            </h2>
            <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
              Selecione o monitor para visualizar o engajamento, os acertos dos alunos e a classificação no Desafio Diário.
            </p>
          </div>

          {/* Dropdown Seletor de Monitores */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-600 hidden sm:inline">
              Monitor:
            </span>
            <div className="relative min-w-[240px] sm:min-w-[280px]">
              <select
                value={selectedMonitorId}
                onChange={(e) => setSelectedMonitorId(e.target.value)}
                className="w-full appearance-none rounded-2xl border border-slate-300 bg-slate-50 hover:bg-white px-4 py-3 pr-10 text-xs font-bold text-[#0F2942] shadow-sm transition hover:border-[#2E5B37] focus:outline-none focus:ring-2 focus:ring-[#2E5B37]/30 cursor-pointer"
              >
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.status === 'PUBLISHED' ? '(Publicado)' : '(Rascunho)'}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
        </div>

        {/* 3 KPIS DO MONITOR SELECIONADO (VERDE DA MARCA #2E5B37) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
          {/* KPI 1: ALUNOS PARTICIPANTES / RESPOSTAS */}
          <div className="relative overflow-hidden rounded-2xl bg-[#2E5B37] p-5 sm:p-6 text-white shadow-md transition hover:shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                Alunos Participantes
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                <Users className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2 min-h-[38px]">
              {isLoading ? (
                <div className="h-8 w-20 animate-pulse rounded-lg bg-white/20" />
              ) : (
                <>
                  <p className="font-heading text-3xl sm:text-4xl font-black text-white">
                    {monitorStats.totalParticipants.toLocaleString('pt-BR')}
                  </p>
                  <span className="text-xs font-semibold text-white/80">
                    {monitorStats.totalParticipants === 1 ? 'aluno' : 'alunos'}
                  </span>
                </>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-white/70 truncate">
              {monitorStats.totalAnswers.toLocaleString('pt-BR')} respostas computadas
            </p>
          </div>

          {/* KPI 2: ACERTOS & TAXA DE PRECISÃO */}
          <div className="relative overflow-hidden rounded-2xl bg-[#2E5B37] p-5 sm:p-6 text-white shadow-md transition hover:shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                Precisão Média
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-[#76D69B]">
                <CheckCircle2 className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2 min-h-[38px]">
              {isLoading ? (
                <div className="h-8 w-24 animate-pulse rounded-lg bg-white/20" />
              ) : (
                <>
                  <p className="font-heading text-3xl sm:text-4xl font-black text-white">
                    {monitorStats.avgAccuracy}%
                  </p>
                  <span className="text-xs font-semibold text-emerald-200">
                    ({monitorStats.totalCorrect.toLocaleString('pt-BR')} acertos)
                  </span>
                </>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-white/70 truncate">
              Aproveitamento médio geral do monitor
            </p>
          </div>

          {/* KPI 3: LÍDER DO RANKING */}
          <div className="relative overflow-hidden rounded-2xl bg-[#2E5B37] p-5 sm:p-6 text-white shadow-md transition hover:shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                Líder do Monitor
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-amber-300">
                <Crown className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2 min-h-[38px]">
              {isLoading ? (
                <div className="h-8 w-28 animate-pulse rounded-lg bg-white/20" />
              ) : (
                <>
                  <p className="font-heading text-2xl sm:text-3xl font-black text-amber-300 truncate max-w-full">
                    {rankingList.length > 0 ? `${monitorStats.topScore.toLocaleString('pt-BR')} XP` : '0 XP'}
                  </p>
                </>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-white/80 truncate">
              1º Lugar: <strong className="text-white font-bold">{monitorStats.leaderName}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS E PESQUISA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#0F2942]/70 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            Monitor: <strong>{activeMonitor?.name || 'Selecionado'}</strong>
          </span>

          {/* Filtros de Período */}
          <div className="flex items-center rounded-xl bg-white p-1 border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => setSelectedPeriod('week')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedPeriod === 'week'
                  ? 'bg-[#132E20] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Esta semana
            </button>
            <button
              type="button"
              onClick={() => setSelectedPeriod('month')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedPeriod === 'month'
                  ? 'bg-[#132E20] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Este mês
            </button>
            <button
              type="button"
              onClick={() => setSelectedPeriod('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedPeriod === 'all'
                  ? 'bg-[#132E20] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Geral (Histórico)
            </button>
          </div>
        </div>

        {/* Campo de Pesquisa de Aluno */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar estudante..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs text-[#0F2942] shadow-sm placeholder:text-slate-400 focus:border-[#2E5B37] focus:outline-none focus:ring-2 focus:ring-[#2E5B37]/30"
          />
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL DO RANKING */}
      {isLoading ? (
        <div className="flex min-h-[340px] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-[#2E5B37]" />
            Carregando o ranking dos alunos deste monitor...
          </div>
        </div>
      ) : error ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-rose-200 bg-white px-6 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-rose-600" />
          <h3 className="mt-3 font-heading text-lg font-bold text-[#0F2942]">
            Erro ao carregar dados do ranking
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            Não foi possível carregar as informações do ranking deste monitor.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setRetryNonce((val) => val + 1)}
              className="rounded-xl bg-[#2E5B37] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#1B4332] cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : rankingList.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 text-center shadow-sm">
          <Trophy className="h-10 w-10 text-[#2E5B37]/40 mb-2" />
          <h3 className="font-heading text-lg font-bold text-[#0F2942]">
            Ainda não há participantes {selectedPeriod === 'week' ? 'nesta semana' : selectedPeriod === 'all' ? 'no histórico desta monitoria' : 'neste mês'}
          </h3>
          <p className="mt-1 max-w-md text-xs text-slate-500 leading-relaxed">
            Assim que seus alunos responderem às questões e desafios do monitor <strong>{activeMonitor?.name}</strong>, a pontuação e classificação aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-7">
          {/* Header da Classificação */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2E5B37]">
                Classificação · {periodLabel}
              </p>
              <h3 className="mt-1 font-heading text-xl sm:text-2xl font-bold text-[#0F2942]">
                Alunos Classificados ({activeMonitor?.name})
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
              <span>
                {searchQuery
                  ? `Exibindo ${filteredRanking.length} ${filteredRanking.length === 1 ? 'resultado' : 'resultados'}`
                  : `Total de ${rankingList.length} alunos classificados`}
              </span>
              {/* Seletor de itens por página quando há muitos alunos */}
              {rankingList.length > 20 && (
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-[11px] text-slate-400 font-normal">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-[#0F2942] cursor-pointer"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* PÓDIO TOP 3 (Exibido na Página 1) */}
          {safeCurrentPage === 1 && !searchQuery && rankingList.length > 0 && (
            <div className="pt-2 pb-6 border-b border-slate-100">
              <div className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:items-end sm:gap-4 lg:gap-8">
                {/* 2º LUGAR - PRATA */}
                {top3.second && (
                  <div className="order-2 flex w-full max-w-[220px] flex-col items-center sm:order-1">
                    <div className="relative mb-3 flex flex-col items-center">
                      <div className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-slate-300 bg-slate-100 text-slate-700 shadow-md ring-4 ring-slate-200/50 overflow-hidden">
                        {top3.second.avatarUrl ? (
                          <OptimizedImage
                            src={top3.second.avatarUrl}
                            alt={top3.second.fullName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="font-heading text-xl font-extrabold">{top3.second.fullName.charAt(0)}</span>
                        )}
                      </div>
                      <span className="absolute -bottom-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-400 font-heading text-xs font-bold text-white shadow-sm ring-2 ring-white">
                        2º
                      </span>
                    </div>
                    <h4 className="mt-2 text-center text-sm font-bold truncate max-w-full text-[#0F2942]">
                      {top3.second.fullName}
                    </h4>
                    <p className="text-xs font-extrabold text-slate-600">
                      {top3.second.score.toLocaleString('pt-BR')} XP
                    </p>
                    <div className="mt-3 h-28 w-full rounded-t-2xl bg-gradient-to-t from-slate-200 to-slate-100 p-3 text-center border-t border-slate-300 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">2º Lugar</span>
                      <p className="mt-1 text-xs font-semibold text-slate-700">
                        {top3.second.correctAnswers}/{top3.second.totalChallenges || totalChallengesInPeriod} acertos ({top3.second.accuracy}%)
                      </p>
                      <span className="text-[10px] text-slate-500">🔥 {top3.second.streakDays}d seguidos</span>
                    </div>
                  </div>
                )}

                {/* 1º LUGAR - OURO (CAMPEÃO) */}
                {top3.first && (
                  <div className="order-1 flex w-full max-w-[240px] flex-col items-center sm:order-2">
                    <div className="relative mb-3 flex flex-col items-center">
                      <Crown className="mb-1 h-7 w-7 text-amber-500 animate-bounce" />
                      <div className="flex h-22 w-22 items-center justify-center rounded-full border-4 border-amber-400 bg-amber-50 text-amber-800 shadow-lg ring-4 ring-amber-400/30 overflow-hidden">
                        {top3.first.avatarUrl ? (
                          <OptimizedImage
                            src={top3.first.avatarUrl}
                            alt={top3.first.fullName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="font-heading text-2xl font-extrabold">{top3.first.fullName.charAt(0)}</span>
                        )}
                      </div>
                      <span className="absolute -bottom-3 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 font-heading text-sm font-bold text-white shadow-md ring-2 ring-white">
                        1º
                      </span>
                    </div>
                    <h4 className="font-heading text-base font-bold text-[#0F2942] truncate max-w-full mt-2">
                      {top3.first.fullName}
                    </h4>
                    <p className="text-sm font-black text-amber-600">
                      {top3.first.score.toLocaleString('pt-BR')} XP
                    </p>
                    <div className="mt-3 h-36 w-full rounded-t-2xl bg-gradient-to-t from-amber-200 via-amber-100 to-amber-50 p-4 text-center border-t-2 border-amber-400 shadow-sm">
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Campeão</span>
                      <p className="mt-1 text-xs font-bold text-amber-900">
                        {top3.first.correctAnswers}/{top3.first.totalChallenges || totalChallengesInPeriod} acertos ({top3.first.accuracy}%)
                      </p>
                      <span className="inline-block mt-1 text-[11px] font-extrabold text-amber-800 bg-amber-300/40 px-2 py-0.5 rounded-md">
                        🔥 Sequência de {top3.first.streakDays} dias
                      </span>
                    </div>
                  </div>
                )}

                {/* 3º LUGAR - BRONZE */}
                {top3.third && (
                  <div className="order-3 flex w-full max-w-[220px] flex-col items-center">
                    <div className="relative mb-3 flex flex-col items-center">
                      <div className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-amber-700/40 bg-amber-900/10 text-amber-900 shadow-md ring-4 ring-amber-700/20 overflow-hidden">
                        {top3.third.avatarUrl ? (
                          <OptimizedImage
                            src={top3.third.avatarUrl}
                            alt={top3.third.fullName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="font-heading text-xl font-extrabold">{top3.third.fullName.charAt(0)}</span>
                        )}
                      </div>
                      <span className="absolute -bottom-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-800 font-heading text-xs font-bold text-white shadow-sm ring-2 ring-white">
                        3º
                      </span>
                    </div>
                    <h4 className="mt-2 text-center text-sm font-bold truncate max-w-full text-[#0F2942]">
                      {top3.third.fullName}
                    </h4>
                    <p className="text-xs font-extrabold text-amber-800">
                      {top3.third.score.toLocaleString('pt-BR')} XP
                    </p>
                    <div className="mt-3 h-24 w-full rounded-t-2xl bg-gradient-to-t from-amber-100 to-amber-50 p-3 text-center border-t border-amber-800/30 shadow-2xs">
                      <span className="text-[10px] font-bold text-amber-900/70 uppercase tracking-wider">3º Lugar</span>
                      <p className="mt-1 text-xs font-semibold text-amber-900">
                        {top3.third.correctAnswers}/{top3.third.totalChallenges || totalChallengesInPeriod} acertos ({top3.third.accuracy}%)
                      </p>
                      <span className="text-[10px] text-amber-900/80">🔥 {top3.third.streakDays}d seguidos</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TABELA DE CLASSIFICAÇÃO DOS PARTICIPANTES */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-16">Posição</th>
                  <th className="py-3 px-4">Estudante</th>
                  <th className="py-3 px-4 text-center">Acertos</th>
                  <th className="py-3 px-4 text-center">Precisão</th>
                  <th className="py-3 px-4 text-center">Sequência</th>
                  <th className="py-3 px-4 text-right">Pontuação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {paginatedStudents.map((studentItem) => (
                  <tr
                    key={studentItem.studentId}
                    className="hover:bg-slate-50 transition"
                  >
                    {/* Posição */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg font-heading text-xs font-extrabold ${
                          studentItem.rank === 1
                            ? 'bg-amber-400 text-amber-950 shadow-2xs'
                            : studentItem.rank === 2
                            ? 'bg-slate-300 text-slate-900 shadow-2xs'
                            : studentItem.rank === 3
                            ? 'bg-amber-700 text-amber-50 shadow-2xs'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {studentItem.rank}º
                      </span>
                    </td>

                    {/* Estudante */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#132E20]/10 text-[#132E20] font-bold text-[11px] flex items-center justify-center shrink-0">
                          {studentItem.fullName.charAt(0)}
                        </div>
                        <span className="font-heading text-xs font-bold text-[#0F2942]">
                          {studentItem.fullName}
                        </span>
                      </div>
                    </td>

                    {/* Acertos */}
                    <td className="py-3.5 px-4 text-center font-bold text-[#0F2942]">
                      {studentItem.correctAnswers}/{studentItem.totalAnswered}
                    </td>

                    {/* Precisão */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${
                          studentItem.accuracy >= 80
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : studentItem.accuracy >= 65
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {studentItem.accuracy ?? 0}%
                      </span>
                    </td>

                    {/* Sequência */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700 font-bold text-[11px] border border-amber-200">
                        <Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        {studentItem.streakDays ?? 0}d
                      </div>
                    </td>

                    {/* Pontuação */}
                    <td className="py-3.5 px-4 text-right font-heading text-sm font-extrabold text-[#2E5B37]">
                      {studentItem.score.toLocaleString('pt-BR')} <span className="text-[10px] text-slate-400 font-normal">XP</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RODAPÉ COM PAGINAÇÃO */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-slate-100 pt-5">
              <div className="text-xs text-slate-500">
                Mostrando{' '}
                <strong className="text-[#0F2942]">
                  {(safeCurrentPage - 1) * pageSize + 1}
                </strong>{' '}
                a{' '}
                <strong className="text-[#0F2942]">
                  {Math.min(safeCurrentPage * pageSize, filteredRanking.length)}
                </strong>{' '}
                de <strong className="text-[#0F2942]">{filteredRanking.length.toLocaleString('pt-BR')}</strong> alunos
              </div>

              {/* Controles de Página */}
              <div className="flex items-center space-x-1.5 self-center sm:self-auto">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Números das páginas */}
                <div className="flex items-center space-x-1 text-xs font-bold">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                    let pageNum = idx + 1;
                    if (totalPages > 5 && safeCurrentPage > 3) {
                      pageNum = safeCurrentPage - 3 + idx;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - idx);
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`min-w-[34px] h-[34px] rounded-xl flex items-center justify-center transition cursor-pointer ${
                          safeCurrentPage === pageNum
                            ? 'bg-[#132E20] text-white shadow-sm font-extrabold'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  title="Próxima Página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
