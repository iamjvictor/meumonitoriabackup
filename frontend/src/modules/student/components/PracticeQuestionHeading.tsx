type Provenance = {
  board?: string | null;
  examName?: string | null;
  examYear?: number | null;
} | null;

type PracticeQuestionHeadingProps = {
  questionNumber: number;
  totalQuestions: number;
  topic: string;
  provenance: Provenance;
};

export function PracticeQuestionHeading({
  questionNumber,
  totalQuestions,
  topic,
  provenance,
}: PracticeQuestionHeadingProps) {
  const examLabel = provenance?.board?.trim() || provenance?.examName?.trim() || '';
  const yearLabel = typeof provenance?.examYear === 'number'
      && Number.isInteger(provenance.examYear)
      && provenance.examYear > 0
    ? String(provenance.examYear)
    : '';
  const provenanceLabel = [examLabel, yearLabel].filter(Boolean).join(' • ');

  return (
    <p className="text-xs font-bold uppercase tracking-wider text-[#2E5B37]">
      Questão {questionNumber} de {totalQuestions} • {topic}
      {provenanceLabel && <span> • {provenanceLabel}</span>}
    </p>
  );
}
