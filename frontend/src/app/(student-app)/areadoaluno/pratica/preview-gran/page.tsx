import { OptimizedImage } from '@/shared';

const imageBase =
  'https://arquivos.infra-questoes.grancursosonline.com.br/imagem/prova/263858/questao';

const inlineImages = [
  {
    src: `${imageBase}/4373850-20260310092721000000-0.png`,
    alt: 'Notação do lado AC no enunciado',
    className: 'inline-block h-6 w-auto align-middle',
  },
  {
    src: `${imageBase}/4373850-20260310092721000000-1.png`,
    alt: 'Notação do lado AC no enunciado',
    className: 'inline-block h-6 w-auto align-middle',
  },
  {
    src: `${imageBase}/4373850-20260310092721000000-2.png`,
    alt: 'Notação do ângulo ABC no enunciado',
    className: 'inline-block h-6 w-auto align-middle',
  },
];

const alternatives = [
  { label: 'A', text: '0° < m ≤ 36°' },
  { label: 'B', text: '36° < m ≤ 72°' },
  { label: 'C', text: '72° < m ≤ 108°', correct: true },
  { label: 'D', text: '108° < m ≤ 144°' },
  { label: 'E', text: '144° < m < 180°' },
];

export default function GranQuestionPreviewPage() {
  return (
    <main className="min-h-screen bg-[#F5F1E8] px-4 py-8 text-[#0F2942] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#557086]">
              Prévia de importação · Gran Questões
            </p>
            <h1 className="mt-1 text-xl font-bold">Questão 4373850</h1>
          </div>
          <span className="rounded-full border border-[#D8CDAF] bg-[#FFF9E8] px-3 py-1.5 text-xs font-semibold text-[#725B20]">
            Demonstração local · não salva respostas
          </span>
        </div>

        <article className="space-y-5 rounded-2xl border border-[#0F2942]/12 bg-white p-4 shadow-sm sm:p-7">
          <header className="space-y-2 border-b border-[#0F2942]/10 pb-4">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="rounded-md bg-[#EAF1F7] px-2.5 py-1">Matemática</span>
              <span className="rounded-md bg-[#F3F0E9] px-2.5 py-1">Tópico não informado pela API</span>
              <span className="rounded-md bg-[#EAF4EB] px-2.5 py-1 text-[#2E5B37]">Dificuldade média · 4</span>
            </div>
            <p className="text-sm leading-6 text-[#557086]">
              CESGRANRIO · Fundação Osorio · Professor — Área: Matemática · 2026
            </p>
          </header>

          <section aria-label="Enunciado" className="space-y-4 text-base font-medium leading-8 sm:text-lg">
            <p>
              Considere um triângulo ABC cuja altura relativa ao lado{' '}
              <OptimizedImage {...inlineImages[0]} width={96} height={32} unoptimized />
              {' '}mede 6 cm. Essa altura divide o lado{' '}
              <OptimizedImage {...inlineImages[1]} width={96} height={32} unoptimized />
              {' '}em dois segmentos que medem 4 cm e 9 cm.
            </p>
            <p>
              Nessas condições, sendo m a medida do ângulo{' '}
              <OptimizedImage {...inlineImages[2]} width={112} height={32} unoptimized />
              , tem-se
            </p>
          </section>

          <section aria-label="Alternativas" className="space-y-2.5">
            {alternatives.map((alternative) => (
              <div
                key={alternative.label}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-sm sm:text-base ${
                  alternative.correct
                    ? 'border-[#2E6B49] bg-[#E8F3E9] font-semibold text-[#24533A]'
                    : 'border-[#0F2942]/12 bg-[#F8F5EE]'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-current bg-white/80 text-sm font-bold">
                  {alternative.label}
                </span>
                <span>{alternative.text}</span>
                {alternative.correct && (
                  <span className="ml-auto text-xs font-bold uppercase tracking-wide">Gabarito</span>
                )}
              </div>
            ))}
          </section>

          <footer className="rounded-xl border border-[#D9E5EE] bg-[#F3F8FC] p-4 text-sm leading-6 text-[#334B5E]">
            <strong className="text-[#0F2942]">Conferência do gabarito:</strong>{' '}
            a resposta da API é o ID <code className="rounded bg-white px-1.5 py-0.5">17947418</code>,
            que corresponde ao item C. As três figuras acima são as imagens inline do enunciado.
          </footer>
        </article>
      </div>
    </main>
  );
}
