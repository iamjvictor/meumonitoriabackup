'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronUp,
  Clock3,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import type { StudentMonitorRecord } from '@/modules/student/context/StudentContext';
import { getWeeklySimulationActionLabel, isWeeklySimulationActionable, type WeeklySimulationStatus } from '../models/weekly-simulation-ui';
import { getNextWeeklySimulationRelease } from '../models/weekly-simulation-release';
import type { WeeklySimulation, WeeklySimulationStatusResponse } from '../services/student-dashboard.service';

export interface ReviewQuestionItem {
  id: string;
  questionId?: string;
  number: number;
  subject: string;
  topic: string;
  statement: string;
  options: Array<{ label: string; text: string }>;
  selectedAnswer?: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  monitorId?: string;
  subjectId?: string;
  topicId?: string;
}

export interface SimulationReviewData {
  id: string;
  title: string;
  subject: string;
  correctCount: number;
  questionCount: number;
  durationSeconds: number;
  date?: string;
  items: ReviewQuestionItem[];
}

interface Props {
  monitors: StudentMonitorRecord[];
  states: Record<string, WeeklySimulationStatusResponse>;
  busyMonitorId: string | null;
  error: string | null;
  onAction: (monitorId: string, status: WeeklySimulationStatus) => void;
  onLoadSimulation?: (monitorId: string) => Promise<WeeklySimulation | null>;
  onAttachAiContext?: (context: {
    id: string;
    monitorId?: string;
    subjectId?: string;
    topicId?: string;
    number: number;
    topic: string;
    statement: string;
    selectedOption?: string;
    options: Array<{ label: string; text: string }>;
    correctAnswer?: string;
    explanation?: string;
  }) => void;
  onReportError?: (questionId: string) => void;
}

const mathTemplates = [
  {
    topic: 'Porcentagem e Descontos Sucessivos',
    statement: 'Um produto que custava R$ 250,00 sofreu um aumento de 12% e, em seguida, teve um desconto promocional de 10% sobre o novo valor. Qual é o valor final do produto?',
    options: [
      { label: 'A', text: 'R$ 252,00' },
      { label: 'B', text: 'R$ 255,00' },
      { label: 'C', text: 'R$ 247,50' },
      { label: 'D', text: 'R$ 260,00' },
    ],
    correctAnswer: 'A',
    explanation: 'Valor após o aumento: R$ 250 × 1,12 = R$ 280,00. Valor após o desconto de 10%: R$ 280 × 0,90 = R$ 252,00. Portanto, a alternativa correta é a letra A.',
  },
  {
    topic: 'Equação do 2º Grau e Vértice',
    statement: 'Quais são as raízes reais da equação quadrática x² - 7x + 12 = 0?',
    options: [
      { label: 'A', text: 'x = 2 e x = 5' },
      { label: 'B', text: 'x = 3 e x = 4' },
      { label: 'C', text: 'x = 1 e x = 12' },
      { label: 'D', text: 'x = -3 e x = -4' },
    ],
    correctAnswer: 'B',
    explanation: 'Pela relação de Soma e Produto de raízes: Soma = -b/a = 7 e Produto = c/a = 12. Os dois números que somados dão 7 e multiplicados dão 12 são 3 e 4. Logo, alternativa B.',
  },
  {
    topic: 'Geometria Plana — Áreas e Perímetros',
    statement: 'Um terreno retangular possui 15 metros de largura e 25 metros de comprimento. Qual é o perímetro total e a área desse terreno, respectivamente?',
    options: [
      { label: 'A', text: '80 m e 375 m²' },
      { label: 'B', text: '40 m e 375 m²' },
      { label: 'C', text: '80 m e 187,5 m²' },
      { label: 'D', text: '100 m e 400 m²' },
    ],
    correctAnswer: 'A',
    explanation: 'Perímetro = 2 × (largura + comprimento) = 2 × (15 + 25) = 80 metros. Área = largura × comprimento = 15 × 25 = 375 m².',
  },
  {
    topic: 'Probabilidade Simples e Composta',
    statement: 'Em uma urna com 5 bolas vermelhas, 3 bolas azuis e 2 bolas amarelas, qual é a probabilidade de se retirar aleatoriamente uma bola azul?',
    options: [
      { label: 'A', text: '30%' },
      { label: 'B', text: '50%' },
      { label: 'C', text: '20%' },
      { label: 'D', text: '15%' },
    ],
    correctAnswer: 'A',
    explanation: 'Total de casos favoráveis (azuis) = 3. Total de casos possíveis = 5 + 3 + 2 = 10. Probabilidade = 3/10 = 0,30 = 30%.',
  },
  {
    topic: 'Matemática Financeira — Juros Simples',
    statement: 'Um empréstimo de R$ 2.000,00 foi concedido a uma taxa de juros simples de 3% ao mês durante 4 meses. Qual o montante total a ser pago ao final do período?',
    options: [
      { label: 'A', text: 'R$ 2.240,00' },
      { label: 'B', text: 'R$ 2.120,00' },
      { label: 'C', text: 'R$ 2.060,00' },
      { label: 'D', text: 'R$ 2.400,00' },
    ],
    correctAnswer: 'A',
    explanation: 'Juros J = C × i × t = 2000 × 0,03 × 4 = R$ 240,00. Montante M = Capital + Juros = 2000 + 240 = R$ 2.240,00.',
  },
  {
    topic: 'Função Afim e Taxa de Variação',
    statement: 'Uma corrida de táxi cobra uma taxa fixa de R$ 5,50 mais R$ 2,80 por quilômetro rodado. Se um passageiro pagou R$ 47,50, quantos quilômetros foram percorridos?',
    options: [
      { label: 'A', text: '15 km' },
      { label: 'B', text: '12 km' },
      { label: 'C', text: '18 km' },
      { label: 'D', text: '14 km' },
    ],
    correctAnswer: 'A',
    explanation: 'Equação da função: V(x) = 5,50 + 2,80x = 47,50 => 2,80x = 42,00 => x = 42 / 2,8 = 15 km.',
  },
  {
    topic: 'Trigonometria no Triângulo Retângulo',
    statement: 'Em um triângulo retângulo, a hipotenusa mede 10 cm e o ângulo oposto a um dos catetos mede 30°. Qual é o comprimento desse cateto?',
    options: [
      { label: 'A', text: '5 cm' },
      { label: 'B', text: '5√3 cm' },
      { label: 'C', text: '8 cm' },
      { label: 'D', text: '2,5 cm' },
    ],
    correctAnswer: 'A',
    explanation: 'sen(30°) = Cateto Oposto / Hipotenusa => 1/2 = x / 10 => x = 5 cm.',
  },
  {
    topic: 'Análise Combinatória — Princípio Fundamental',
    statement: 'De quantas maneiras distintas um comitê de 3 pessoas pode ser formado a partir de um grupo de 7 voluntários?',
    options: [
      { label: 'A', text: '35 maneiras' },
      { label: 'B', text: '210 maneiras' },
      { label: 'C', text: '42 maneiras' },
      { label: 'D', text: '21 maneiras' },
    ],
    correctAnswer: 'A',
    explanation: 'Como a ordem dos membros não importa, usamos Combinação: C(7,3) = (7 × 6 × 5) / (3 × 2 × 1) = 35.',
  },
  {
    topic: 'Logaritmos e Propriedades Operatórias',
    statement: 'Sabendo que log 2 = 0,30 e log 3 = 0,48, qual é o valor aproximado de log 18?',
    options: [
      { label: 'A', text: '1,26' },
      { label: 'B', text: '1,14' },
      { label: 'C', text: '1,32' },
      { label: 'D', text: '0,96' },
    ],
    correctAnswer: 'A',
    explanation: '18 = 2 × 3² => log(18) = log(2) + 2·log(3) = 0,30 + 2·(0,48) = 0,30 + 0,96 = 1,26.',
  },
  {
    topic: 'Estatística — Média, Mediana e Moda',
    statement: 'Os salários dos 5 funcionários de uma equipe são: R$ 2.000, R$ 2.500, R$ 2.500, R$ 3.000 e R$ 5.000. Qual é a mediana desses valores?',
    options: [
      { label: 'A', text: 'R$ 2.500' },
      { label: 'B', text: 'R$ 3.000' },
      { label: 'C', text: 'R$ 2.800' },
      { label: 'D', text: 'R$ 2.000' },
    ],
    correctAnswer: 'A',
    explanation: 'Ordenando os valores (rol): 2000, 2500, 2500, 3000, 5000. O elemento central (3º termo) é R$ 2.500.',
  },
];

const biologyTemplates = [
  {
    topic: 'Citologia — Organelas Celulares',
    statement: 'Qual organela citoplasmática é responsável primordial pela produção de ATP por meio da respiração celular aeróbica?',
    options: [
      { label: 'A', text: 'Mitocôndria' },
      { label: 'B', text: 'Complexo de Golgi' },
      { label: 'C', text: 'Retículo Endoplasmático Liso' },
      { label: 'D', text: 'Lisossomo' },
    ],
    correctAnswer: 'A',
    explanation: 'As mitocôndrias realizam o ciclo de Krebs e a cadeia respiratória (fosforilação oxidativa), gerando a maior parte do ATP celular.',
  },
  {
    topic: 'Genética Mendeliana — 1ª Lei de Mendel',
    statement: 'No cruzamento entre dois indivíduos heterozigotos (Aa × Aa) para uma característica com dominância completa, qual a proporção fenotípica esperada na prole?',
    options: [
      { label: 'A', text: '3 dominantes para 1 recessivo' },
      { label: 'B', text: '1 dominante para 1 recessivo' },
      { label: 'C', text: '1 dominante, 2 intermediários e 1 recessivo' },
      { label: 'D', text: '4 dominantes' },
    ],
    correctAnswer: 'A',
    explanation: 'Genótipos: 1 AA : 2 Aa : 1 aa. Como A é dominante sobre a, tanto AA quanto Aa manifestam o fenótipo dominante (3/4 = 75%), e aa manifesta o recessivo (1/4 = 25%).',
  },
  {
    topic: 'Ecologia — Cadeias e Níveis Tróficos',
    statement: 'Em um ecossistema aquático, o fitoplâncton atua primordialmente como qual nível trófico na cadeia alimentar?',
    options: [
      { label: 'A', text: 'Produtor primário autotrófico' },
      { label: 'B', text: 'Consumidor primário herbívoro' },
      { label: 'C', text: 'Decompositor saprófito' },
      { label: 'D', text: 'Consumidor secundário carnívoro' },
    ],
    correctAnswer: 'A',
    explanation: 'O fitoplâncton realiza fotossíntese e produz matéria orgânica a partir de luz e nutrientes inorgânicos, sendo a base produtora primária dos ecossistemas aquáticos.',
  },
  {
    topic: 'Fisiologia Humana — Sistema Circulatório',
    statement: 'Qual câmara cardíaca recebe o sangue oxigenado proveniente dos pulmões por meio das veias pulmonares?',
    options: [
      { label: 'A', text: 'Átrio esquerdo' },
      { label: 'B', text: 'Ventrículo direito' },
      { label: 'C', text: 'Átrio direito' },
      { label: 'D', text: 'Ventrículo esquerdo' },
    ],
    correctAnswer: 'A',
    explanation: 'O sangue arterial oxigenado nos alvéolos pulmonares retorna ao coração pelas 4 veias pulmonares, desembocando diretamente no átrio esquerdo.',
  },
  {
    topic: 'Biotecnologia — Engenharia Genética',
    statement: 'As enzimas de restrição bacterianas são fundamentais para a tecnologia do DNA recombinante porque:',
    options: [
      { label: 'A', text: 'Cortam o DNA em sequências de nucleotídeos palindrômicas específicas' },
      { label: 'B', text: 'Unem covalentemente fragmentos de RNA mensageiro' },
      { label: 'C', text: 'Desnaturam as pontes de hidrogênio da dupla hélice' },
      { label: 'D', text: 'Sintetizam novas fitas de DNA sem necessidade de molde' },
    ],
    correctAnswer: 'A',
    explanation: 'As endonucleases de restrição atuam como "tesouras moleculares", reconhecendo e clivando sítios palindrômicos específicos na molécula de DNA.',
  },
];

const historyTemplates = [
  {
    topic: 'Brasil Colônia — Economia Açucareira',
    statement: 'Durante o período colonial brasileiro, o modelo produtivo do açúcar no Nordeste caracterizou-se pelo sistema de plantation, que combinava:',
    options: [
      { label: 'A', text: 'Latifúndio, monocultura, mão de obra escravizada e produção voltada para exportação' },
      { label: 'B', text: 'Pequena propriedade familiar, policultura e mercado interno' },
      { label: 'C', text: 'Trabalho assalariado livre, cooperativismo e manufatura local' },
      { label: 'D', text: 'Arrendamento de terras indígenas com divisão paritária de lucros' },
    ],
    correctAnswer: 'A',
    explanation: 'A plantation colonial baseava-se nos quatro pilares: grandes propriedades (latifúndios), produto único (açúcar), trabalho escravo compulsório e mercado externo europeu.',
  },
  {
    topic: 'Revolução Francesa — Queda do Antigo Regime',
    statement: 'Qual evento de 14 de julho de 1789 simbolizou o colapso do absolutismo monárquico francês e o início da Revolução Popular?',
    options: [
      { label: 'A', text: 'A Tomada da Bastilha' },
      { label: 'B', text: 'A Batalha de Waterloo' },
      { label: 'C', text: 'O Golpe do 18 de Brumário' },
      { label: 'D', text: 'A Noite de São Bartolomeu' },
    ],
    correctAnswer: 'A',
    explanation: 'A Queda da Bastilha, fortaleza-prisão símbolo da tirania real dos Bourbons, marcou a irrupção das massas populares no processo revolucionário.',
  },
  {
    topic: 'Era Vargas — Estado Novo e Trabalhismo',
    statement: 'A criação da Consolidação das Leis do Trabalho (CLT) em 1943 durante o governo de Getúlio Vargas consolidou a política de:',
    options: [
      { label: 'A', text: 'Trabalhismo e tutela estatal dos sindicatos' },
      { label: 'B', text: 'Liberalismo econômico irrestrito e livre associação' },
      { label: 'C', text: 'Estatização completa de todas as indústrias privadas' },
      { label: 'D', text: 'Extinção de benefícios trabalhistas para controle fiscal' },
    ],
    correctAnswer: 'A',
    explanation: 'Getúlio Vargas instituiu direitos trabalhistas pioneiros atrelando a organização sindical diretamente ao Ministério do Trabalho sob controle estatal.',
  },
  {
    topic: 'Guerra Fria — Doutrina Truman e Bipolaridade',
    statement: 'A polarização ideológica mundial após a 2ª Guerra Mundial envolveu duas superpotências com blocos antagônicos liderados por:',
    options: [
      { label: 'A', text: 'Estados Unidos (capitalismo) e União Soviética (socialismo)' },
      { label: 'B', text: 'Inglaterra (monarquia) e Alemanha (nazifascismo)' },
      { label: 'C', text: 'França (república) e Japão (imperialismo)' },
      { label: 'D', text: 'China (maoísmo) e Índia (não alinhados)' },
    ],
    correctAnswer: 'A',
    explanation: 'A Guerra Fria (1947–1991) foi o confronto geopolítico, militar e ideológico global entre o bloco ocidental capitalista (EUA) e o bloco oriental comunista (URSS).',
  },
];

function buildMockReviewItems(monitorName: string, correctCount: number, totalCount = 30): ReviewQuestionItem[] {
  let templatePool = mathTemplates;
  let defaultSubject = 'Matemática';

  if (monitorName.toLowerCase().includes('biol')) {
    templatePool = biologyTemplates;
    defaultSubject = 'Biologia';
  } else if (monitorName.toLowerCase().includes('hum') || monitorName.toLowerCase().includes('hist')) {
    templatePool = historyTemplates;
    defaultSubject = 'História';
  }

  return Array.from({ length: totalCount }, (_, index) => {
    const qNum = index + 1;
    const template = templatePool[(qNum - 1) % templatePool.length];
    const isCorrect = qNum <= correctCount;
    const wrongOptions = template.options.filter((opt) => opt.label !== template.correctAnswer);
    const wrongChoice = wrongOptions[(qNum - 1) % wrongOptions.length]?.label || 'B';
    const selectedAnswer = isCorrect ? template.correctAnswer : wrongChoice;

    return {
      id: `review-q-${qNum}`,
      number: qNum,
      subject: defaultSubject,
      topic: template.topic,
      statement: `[Questão ${qNum}] ${template.statement}`,
      options: template.options,
      selectedAnswer,
      correctAnswer: template.correctAnswer,
      isCorrect,
      explanation: template.explanation,
    };
  });
}

function formatRemaining(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(total / 86400)}d ${String(Math.floor((total % 86400) / 3600)).padStart(2, '0')}h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m ${String(total % 60).padStart(2, '0')}s`;
}

function Countdown() {
  const [remaining, setRemaining] = useState(() => getNextWeeklySimulationRelease(new Date()).getTime() - Date.now());
  useEffect(() => {
    const timer = window.setInterval(
      () => setRemaining(getNextWeeklySimulationRelease(new Date()).getTime() - Date.now()),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span
      role="timer"
      aria-label={`Próxima liberação em ${formatRemaining(remaining)}`}
      className="font-mono text-xs font-bold text-[#0F2942]"
    >
      {formatRemaining(remaining)}
    </span>
  );
}

function requestedDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : null;
}

function formatDurationShort(seconds: number) {
  if (seconds <= 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function formatDurationPerQuestion(totalSeconds: number, totalQuestions: number) {
  if (!totalQuestions || totalQuestions <= 0 || totalSeconds <= 0) return '0s';
  const perQ = Math.round(totalSeconds / totalQuestions);
  const minutes = Math.floor(perQ / 60);
  const secs = perQ % 60;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function description(status?: WeeklySimulationStatus) {
  if (status === 'AVAILABLE_TO_GENERATE') return 'Seu diagnóstico da semana está pronto para montar o simulado.';
  if (status === 'READY') return 'Seu simulado está pronto para começar.';
  if (status === 'IN_PROGRESS') return 'Você pode continuar de onde parou.';
  if (status === 'COMPLETED') return 'Simulado concluído. Veja sua revisão detalhada.';
  if (status === 'PENDING' || status === 'PROCESSING') return 'Analisando seu desempenho e preparando questões.';
  if (status === 'FAILED') return 'Não foi possível montar o simulado.';
  return 'Este simulado será liberado na próxima sexta-feira.';
}

function parseAlternatives(value: unknown): Array<{ label: string; text: string }> {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      typeof item === 'string'
        ? { label: String.fromCharCode(65 + index), text: item }
        : {
            label: String((item as { label?: string }).label || String.fromCharCode(65 + index)),
            text: String((item as { text?: string }).text || ''),
          },
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([label, text]) => ({ label, text: String(text) }));
  }
  return [];
}

export function PracticeWeeklySimulationsSection({
  monitors,
  states,
  busyMonitorId,
  error,
  onAction,
  onLoadSimulation,
  onAttachAiContext,
  onReportError,
}: Props) {
  const totalMonitorCount = monitors.length;
  const [selectedReview, setSelectedReview] = useState<SimulationReviewData | null>(null);
  const [loadingReviewId, setLoadingReviewId] = useState<string | null>(null);
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);

  const scrollToReview = () => {
    window.setTimeout(() => {
      reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleReviewRealSimulation = async (monitorId: string, monitorName: string, monitorSubject?: string) => {
    const state = states[monitorId];
    if (!state?.simulationId) return;

    setLoadingReviewId(monitorId);
    try {
      if (onLoadSimulation) {
        const sim = await onLoadSimulation(monitorId);
        if (sim && sim.items) {
          const items: ReviewQuestionItem[] = sim.items.map((item, idx) => {
            const rawAlternatives = parseAlternatives(item.question.alternatives);
            const isCorrect = Boolean(item.answer?.isCorrect);
            return {
              id: item.id || `q-${idx + 1}`,
              questionId: item.question.id,
              number: item.position || idx + 1,
              subject: item.question.subject?.name || monitorSubject || 'Matéria Geral',
              topic: item.question.topic?.name || 'Tópico do Simulado',
              statement: item.question.text,
              options: rawAlternatives,
              selectedAnswer: item.answer?.selectedAnswer,
              correctAnswer: item.question.correctAnswer || item.answer?.selectedAnswer || 'A',
              isCorrect,
              explanation: item.question.explanation || 'Resolução comentada e gabarito analisado pela IA.',
              monitorId,
              subjectId: item.question.subject?.id,
              topicId: item.question.topic?.id,
            };
          });

          setSelectedReview({
            id: sim.id,
            title: monitorName,
            subject: monitorSubject || 'Monitor de estudos',
            correctCount: sim.correctCount ?? 0,
            questionCount: sim.questionCount || 30,
            durationSeconds: sim.durationSeconds ?? 0,
            date: requestedDate(sim.completedAt || undefined) || undefined,
            items,
          });
          scrollToReview();
          return;
        }
      }

      // Fallback mock review if real items aren't directly available
      const items = buildMockReviewItems(monitorName, state.correctCount ?? 24, state.questionCount ?? 30);
      setSelectedReview({
        id: state.simulationId,
        title: monitorName,
        subject: monitorSubject || 'Monitor de estudos',
        correctCount: state.correctCount ?? 24,
        questionCount: state.questionCount ?? 30,
        durationSeconds: state.durationSeconds ?? 3000,
        date: requestedDate(state.completedAt || undefined) || undefined,
        items,
      });
      scrollToReview();
    } finally {
      setLoadingReviewId(null);
    }
  };

  return (
    <section className="mt-10" aria-labelledby="simulados-section">
      <div className="flex flex-col gap-4 border-b border-[#0F2942]/10 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7C4A27]">Treinos & Avaliações</p>
          <h2 id="simulados-section" className="mt-0.5 font-heading text-xl font-bold tracking-[-0.03em] text-[#0F2942]">
            Simulados
          </h2>
        </div>
          <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5E6B73]">Próxima liberação</p>
            <div className="mt-1 flex items-center justify-end gap-2"><Clock3 className="h-3.5 w-3.5 text-[#0F2942]" aria-hidden="true" /><Countdown /></div>
          </div>
          <span className="text-xs font-bold text-[#7C4A27]">
            {totalMonitorCount} {totalMonitorCount === 1 ? 'monitor' : 'monitores'}
          </span>
        </div>
      </div>

      {/* Simulation Cards Grid */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {monitors.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#0F2942]/20 bg-white/50 p-8 text-center sm:col-span-2 lg:col-span-3">
            <Brain className="mx-auto h-8 w-8 text-[#7C4A27]/50" />
            <p className="mt-3 text-sm font-semibold text-[#0F2942]">
              Assine um monitor para liberar seus simulados personalizados.
            </p>
          </div>
        ) : (
          monitors.map((monitor) => {
            const current = states[monitor.id];
            const status = current?.status;
            const isBusy = busyMonitorId === monitor.id || loadingReviewId === monitor.id;
            const generated = Boolean(status && ['READY', 'IN_PROGRESS', 'COMPLETED'].includes(status));
            const isCompleted = status === 'COMPLETED';
            const retryable = status === 'FAILED';
            const date = requestedDate(current?.requestedAt);
            const totalQuestions = current?.questionCount || 30;
            const correctCount = current?.correctCount ?? 0;
            const durationSeconds = current?.durationSeconds ?? 0;
            const formattedGrade = (correctCount / 3).toLocaleString('pt-BR', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            });

            const isReviewOpen = Boolean(
              selectedReview &&
                (selectedReview.id === current?.simulationId || selectedReview.title === monitor.name),
            );

            return (
              <article
                key={monitor.id}
                className={`flex min-h-[245px] flex-col justify-between rounded-[24px] border p-5 shadow-sm transition ${
                  generated ? 'border-[#2E6B59]/20 bg-white' : 'border-[#0F2942]/10 bg-white/75'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          generated ? 'bg-[#E6EFEA] text-[#2E6B59]' : 'bg-[#F5EBE6] text-[#7C4A27]'
                        }`}
                      >
                        <Brain className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-base font-bold text-[#0F2942]">{monitor.name}</h3>
                        <p className="truncate text-xs text-[#0F2942]/55">
                          {monitor.subject || monitor.area || 'Monitor de estudos'}
                        </p>
                      </div>
                    </div>
                    {generated ? (
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#2E6B59]" aria-label="Simulado disponível" />
                    ) : null}
                  </div>

                  {isCompleted ? (
                    <div className="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl border border-[#2E6B59]/20 bg-[#F4F9F6] p-2.5 text-center">
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold uppercase tracking-wider text-[#5E6B73]">Acertos</p>
                        <p className="mt-0.5 truncate text-xs font-bold text-[#0F2942]">
                          {correctCount}/{totalQuestions}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold uppercase tracking-wider text-[#5E6B73]">Nota</p>
                        <p className="mt-0.5 truncate text-xs font-bold text-[#2E6B59]">{formattedGrade}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold uppercase tracking-wider text-[#5E6B73]">Tempo</p>
                        <p className="mt-0.5 truncate text-xs font-bold text-[#0F2942]">
                          {formatDurationShort(durationSeconds)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold uppercase tracking-wider text-[#5E6B73]">Tempo/Q</p>
                        <p className="mt-0.5 truncate text-xs font-bold text-[#0F2942]">
                          {formatDurationPerQuestion(durationSeconds, totalQuestions)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-5 text-sm leading-6 text-[#0F2942]/70">{description(status)}</p>
                      {generated && date ? (
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#0F2942]/55">
                          <span>Gerado em {date}</span>
                          <span>{totalQuestions} questões</span>
                        </div>
                      ) : null}
                      {!generated && !retryable && status !== 'AVAILABLE_TO_GENERATE' && status !== 'PENDING' && status !== 'PROCESSING' ? (
                        <div className="mt-4 rounded-2xl bg-[#F8F3EA] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7C4A27]">
                            Próxima liberação
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <Clock3 className="h-3.5 w-3.5 text-[#7C4A27]" aria-hidden="true" />
                            <Countdown />
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    isBusy ||
                    !status ||
                    !isWeeklySimulationActionable(status)
                  }
                  onClick={() => {
                    if (isCompleted) {
                      if (isReviewOpen) {
                        setSelectedReview(null);
                      } else {
                        void handleReviewRealSimulation(monitor.id, monitor.name, monitor.subject || monitor.area);
                      }
                    } else {
                      onAction(monitor.id, status || 'AVAILABLE_TO_GENERATE');
                    }
                  }}
                  className={`mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition cursor-pointer ${
                    isCompleted && isReviewOpen
                      ? 'bg-[#2E5B37] text-white hover:bg-[#234d2e]'
                      : generated || retryable || status === 'AVAILABLE_TO_GENERATE' || status === 'BLOCKED_BY_PREVIOUS'
                      ? 'bg-[#0F2942] text-white hover:bg-[#183D5D]'
                      : 'cursor-not-allowed bg-[#D8D4CB] text-[#8D8B84]'
                  }`}
                >
                  {retryable ? <RefreshCw size={15} aria-hidden="true" /> : null}
                  {isBusy
                    ? 'Carregando…'
                    : isCompleted
                    ? isReviewOpen
                      ? 'Ocultar revisão'
                      : 'Ver revisão'
                    : generated
                    ? getWeeklySimulationActionLabel(status!)
                    : retryable
                    ? 'Tentar novamente'
                    : status === 'AVAILABLE_TO_GENERATE' || status === 'BLOCKED_BY_PREVIOUS'
                    ? getWeeklySimulationActionLabel(status)
                    : 'Aguardando liberação'}
                  {isCompleted && isReviewOpen ? (
                    <ChevronUp size={15} aria-hidden="true" />
                  ) : generated || retryable || status === 'AVAILABLE_TO_GENERATE' || status === 'BLOCKED_BY_PREVIOUS' ? (
                    <ArrowRight size={15} aria-hidden="true" />
                  ) : null}
                </button>
              </article>
            );
          })
        )}

      </div>

      {/* REVISÃO EXPANDIDA DO SIMULADO (EXIBIDA LOGO ABAIXO DOS SIMULADOS) */}
      {selectedReview && (
        <section
          ref={reviewSectionRef}
          id="revisao-simulado-section"
          className="mt-10 rounded-[28px] border-2 border-[#2E6B59]/30 bg-[#FBFDFB] p-6 sm:p-8 shadow-md animate-fade-in"
          aria-labelledby="revisao-simulado-title"
        >
          {/* Header da Revisão */}
          <div className="flex flex-col gap-4 border-b border-[#0F2942]/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#2E5B37] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Revisão do Simulado
                </span>
                {selectedReview.date ? (
                  <span className="text-xs text-[#5E6B73]">• Concluído em {selectedReview.date}</span>
                ) : null}
              </div>
              <h3 id="revisao-simulado-title" className="mt-2 font-heading text-2xl font-bold tracking-[-0.03em] text-[#0F2942]">
                {selectedReview.title}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Badges de métricas da revisão */}
              <div className="flex items-center gap-2 rounded-2xl bg-white border border-[#0F2942]/10 px-4 py-2 shadow-xs">
                <div className="text-center">
                  <p className="text-[9px] font-bold uppercase text-[#5E6B73]">Acertos</p>
                  <p className="text-sm font-bold text-[#0F2942]">
                    {selectedReview.correctCount}/{selectedReview.questionCount}
                  </p>
                </div>
                <div className="h-6 w-px bg-[#0F2942]/10" />
                <div className="text-center">
                  <p className="text-[9px] font-bold uppercase text-[#5E6B73]">Nota</p>
                  <p className="text-sm font-bold text-[#2E6B59]">
                    {(selectedReview.correctCount / 3).toLocaleString('pt-BR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="h-6 w-px bg-[#0F2942]/10" />
                <div className="text-center">
                  <p className="text-[9px] font-bold uppercase text-[#5E6B73]">Tempo</p>
                  <p className="text-sm font-bold text-[#0F2942]">
                    {formatDurationShort(selectedReview.durationSeconds)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedReview(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#0F2942]/15 bg-white px-4 py-2 text-xs font-bold text-[#0F2942] hover:bg-[#0F2942]/5 transition cursor-pointer shadow-xs"
              >
                <X className="h-4 w-4" />
                <span>Fechar revisão</span>
              </button>
            </div>
          </div>

          {/* Lista de Questões em Cards com o mesmo estilo do Banco de Questões */}
          <div className="mt-6 space-y-6">
            {selectedReview.items.map((q) => {
              return (
                <div
                  key={q.id}
                  className="rounded-[24px] border border-[#0F2942]/10 bg-white p-6 sm:p-7 shadow-xs space-y-4 transition hover:border-[#2E5B37]/30"
                >
                  {/* Top bar da questão */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0F2942]/8 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-[#0F2942]/5 px-2.5 py-1 text-xs font-black text-[#0F2942]">
                        Questão {q.number} de {selectedReview.items.length}
                      </span>
                      <span className="text-xs font-bold text-[#5E6B73]">
                        {q.subject} • {q.topic}
                      </span>
                    </div>

                    {q.isCorrect ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E3F1E4] px-3 py-1 text-xs font-bold text-[#2E5B37] border border-[#2E5B37]/20">
                        <Check className="h-3.5 w-3.5" /> Acertou
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                        <X className="h-3.5 w-3.5" /> Errou
                      </span>
                    )}
                  </div>

                  {/* Enunciado da questão */}
                  <h4 className="text-base font-semibold leading-relaxed text-[#0F2942]">
                    {q.statement}
                  </h4>

                  {/* Alternativas */}
                  <div className="space-y-2.5">
                    {q.options.map((opt) => {
                      const isCorrectAnswer = opt.label.toUpperCase() === q.correctAnswer.toUpperCase();
                      const isSelectedByUser = q.selectedAnswer && opt.label.toUpperCase() === q.selectedAnswer.toUpperCase();

                      let optionStyle = 'border-[#0F2942]/12 bg-[#F8F5EE]/60 text-[#0F2942]';
                      let badge = null;

                      if (isCorrectAnswer) {
                        optionStyle = 'border-[#2E5B37] bg-[#E3F1E4] text-[#2E5B37] font-bold shadow-xs';
                        badge = (
                          <span className="rounded-md bg-white/90 border border-[#2E5B37]/30 px-2 py-0.5 text-[10px] font-bold text-[#2E5B37] uppercase tracking-wider">
                            Gabarito correto
                          </span>
                        );
                      } else if (isSelectedByUser && !isCorrectAnswer) {
                        optionStyle = 'border-rose-300 bg-rose-50 text-rose-700 font-semibold';
                        badge = (
                          <span className="rounded-md bg-white/90 border border-rose-300 px-2 py-0.5 text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                            Sua resposta
                          </span>
                        );
                      }

                      return (
                        <div
                          key={opt.label}
                          className={`flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left text-xs transition ${optionStyle}`}
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-bold ${
                              isCorrectAnswer
                                ? 'bg-[#2E5B37] text-white'
                                : isSelectedByUser
                                ? 'bg-rose-600 text-white'
                                : 'bg-white border border-[#0F2942]/15 text-[#0F2942]'
                            }`}
                          >
                            {opt.label}
                          </span>
                          <span className="flex-1 text-sm">{opt.text}</span>
                          {badge}
                          {isCorrectAnswer && <Check className="h-5 w-5 text-[#2E5B37] shrink-0" />}
                          {isSelectedByUser && !isCorrectAnswer && <X className="h-5 w-5 text-rose-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Resolução Comentada pela IA */}
                  {q.explanation && (
                    <div className="rounded-2xl bg-[#E3F1E4]/50 p-4 border border-[#2E5B37]/20 space-y-1.5 animate-fade-in">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#2E5B37]">
                        <Bot className="h-4 w-4" />
                        <span>Gabarito e Resolução Comentada pela IA</span>
                      </div>
                      <p className="text-xs sm:text-sm leading-relaxed text-[#0F2942]/90">
                        {q.explanation}
                      </p>
                    </div>
                  )}

                  {/* Rodapé de Ações por Questão */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#0F2942]/10">
                    <button
                      type="button"
                      disabled={!q.questionId}
                      onClick={() => {
                        if (onAttachAiContext && q.questionId) {
                          onAttachAiContext({
                            id: q.questionId || q.id,
                            monitorId: q.monitorId,
                            subjectId: q.subjectId,
                            topicId: q.topicId,
                            number: q.number,
                            topic: q.topic,
                            statement: q.statement,
                            selectedOption: q.selectedAnswer,
                            options: q.options,
                            correctAnswer: q.correctAnswer,
                            explanation: q.explanation,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 justify-center rounded-xl bg-[#0F2942] hover:bg-[#1C466D] px-4 py-2 text-xs font-bold text-white transition cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Tirar dúvida com IA</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onReportError) onReportError(q.id);
                      }}
                      className="inline-flex items-center gap-1.5 justify-center rounded-xl border border-red-200/50 bg-red-50/50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 cursor-pointer shadow-sm"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Reportar erro</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setSelectedReview(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#0F2942] px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-[#183D5D] transition cursor-pointer"
            >
              <span>Voltar ao topo dos Simulados</span>
            </button>
          </div>
        </section>
      )}

      {error ? <p role="alert" className="mt-3 text-sm text-[#B84732]">{error}</p> : null}
    </section>
  );
}
