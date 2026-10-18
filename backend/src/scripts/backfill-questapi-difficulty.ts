import 'dotenv/config';
import { prisma } from '../lib/prisma.js';

const PAGE_SIZE = 500;
const applyChanges = process.argv.includes('--apply');

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
type RawQuestion = { dificuldade?: unknown };
type QuestionBankRow = {
  id: string;
  difficulty: string | null;
  rawPayload: unknown;
};

const difficultyCounts: Record<string, number> = {};
let scanned = 0;
let alreadyCorrect = 0;
let wouldUpdate = 0;
let updated = 0;
let missingOrInvalid = 0;
let lastId: string | undefined;

try {
  while (true) {
    const rows: QuestionBankRow[] = await prisma.questionBankItem.findMany({
      where: {
        provider: 'QAPI',
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      select: { id: true, difficulty: true, rawPayload: true },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      const rawDifficulty = getRawDifficulty(row.rawPayload);
      const targetDifficulty = mapQuestApiDifficulty(rawDifficulty);

      if (!targetDifficulty) {
        missingOrInvalid += 1;
        difficultyCounts[String(rawDifficulty ?? 'missing/invalid')] =
          (difficultyCounts[String(rawDifficulty ?? 'missing/invalid')] ?? 0) + 1;
        continue;
      }

      difficultyCounts[String(rawDifficulty)] = (difficultyCounts[String(rawDifficulty)] ?? 0) + 1;
      if (row.difficulty === targetDifficulty) {
        alreadyCorrect += 1;
        continue;
      }

      wouldUpdate += 1;
    }

    lastId = rows.at(-1)?.id;
  }

  if (applyChanges) updated = await applyDifficultyUpdates();

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    source: 'QAPI',
    mapping: { '1-2': 'EASY', '3-4': 'MEDIUM', '5': 'HARD' },
    scanned,
    countsByRawDifficulty: difficultyCounts,
    alreadyCorrect,
    wouldUpdate,
    updated,
    missingOrInvalid,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}

async function applyDifficultyUpdates() {
  return prisma.$executeRaw`
    UPDATE public.question_bank_items
    SET difficulty = CASE (raw_payload->>'dificuldade')::integer
      WHEN 1 THEN 'EASY'
      WHEN 2 THEN 'EASY'
      WHEN 3 THEN 'MEDIUM'
      WHEN 4 THEN 'MEDIUM'
      WHEN 5 THEN 'HARD'
    END
    WHERE provider = 'QAPI'
      AND raw_payload->>'dificuldade' ~ '^[1-5]$'
      AND difficulty IS DISTINCT FROM CASE (raw_payload->>'dificuldade')::integer
        WHEN 1 THEN 'EASY'
        WHEN 2 THEN 'EASY'
        WHEN 3 THEN 'MEDIUM'
        WHEN 4 THEN 'MEDIUM'
        WHEN 5 THEN 'HARD'
      END
  `;
}

function getRawDifficulty(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return undefined;
  return (rawPayload as RawQuestion).dificuldade;
}

function mapQuestApiDifficulty(value: unknown): Difficulty | null {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : NaN;
  if (!Number.isInteger(numericValue)) return null;
  if (numericValue === 1 || numericValue === 2) return 'EASY';
  if (numericValue === 3 || numericValue === 4) return 'MEDIUM';
  if (numericValue === 5) return 'HARD';
  return null;
}
