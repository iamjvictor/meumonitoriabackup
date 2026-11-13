import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../backend/src/lib/prisma.ts';

const documentId = 'afa89696-4eb0-472f-8290-198ef02fc4f4';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extractionPath = resolve(root, 'tests/document-parser/iff-provas-workspace/extracaogemini.json');
const apply = process.argv.includes('--apply');

function fail(message) { throw new Error(message); }
function normalizeAlternatives(value, number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Questão ${number}: alternativas inválidas.`);
  const entries = Object.entries(value).map(([label, text]) => ({ label: label.toUpperCase(), text: String(text).trim() }));
  if (entries.length !== 5 || entries.some((entry) => !/^[A-E]$/.test(entry.label) || !entry.text)
      || new Set(entries.map((entry) => entry.label)).size !== 5) fail(`Questão ${number}: esperadas cinco alternativas A-E.`);
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

try {
  const extraction = JSON.parse(await readFile(extractionPath, 'utf8'));
  if (!Array.isArray(extraction.questoes) || extraction.questoes.length !== 40 || extraction.totalQuestoes !== 40) {
    fail('A extração Gemini não contém exatamente 40 questões.');
  }
  const numbers = extraction.questoes.map((q) => q.numero);
  if (new Set(numbers).size !== 40 || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 40)) {
    fail('Números das questões ausentes, duplicados ou fora de 1–40.');
  }

  const questions = await prisma.question.findMany({
    where: { sources: { some: { documentId } } },
    select: { id: true, metadata: true, text: true, sources: { where: { documentId }, select: { documentId: true } } },
  });
  const byNumber = new Map();
  for (const question of questions) {
    const n = Number(question.metadata?.questionNumber);
    if (!Number.isInteger(n) || byNumber.has(n)) fail(`Correspondência ambígua no banco para a questão ${n}.`);
    byNumber.set(n, question);
  }
  const missing = numbers.filter((n) => !byNumber.has(n));
  if (missing.length || byNumber.size !== 40) fail(`Banco não corresponde 1:1 à extração. Faltando=${missing.join(',')}; encontradas=${byNumber.size}.`);

  const updates = extraction.questoes.map((item) => {
    if (!item.enunciado?.trim() || !/^[A-E]$/i.test(item.gabarito ?? '')) fail(`Questão ${item.numero}: enunciado/gabarito inválido.`);
    const alternatives = normalizeAlternatives(item.alternativas, item.numero);
    const text = item.textoApoio?.trim()
      ? `${item.textoApoio.trim()}\n\n[QUESTÃO ${item.numero}]\n${item.enunciado.trim()}`
      : item.enunciado.trim();
    const current = byNumber.get(item.numero);
    return {
      number: item.numero,
      id: current.id,
      data: {
        text,
        alternatives,
        kind: 'MULTIPLE_CHOICE',
        correctAnswer: item.gabarito.toUpperCase(),
        explanation: null,
        status: 'PENDING_REVIEW',
        needsReview: true,
        completenessStatus: 'COMPLETE_FROM_SOURCE',
        statementOrigin: 'SOURCE_DOCUMENT',
        alternativesOrigin: 'SOURCE_DOCUMENT',
        correctAnswerOrigin: 'SOURCE_DOCUMENT',
        metadata: {
          ...(current.metadata ?? {}),
          year: item.ano ?? extraction.ano,
          institution: item.instituicao ?? extraction.instituicao,
          edital: extraction.edital,
          process: item.processoSeletivo ?? extraction.processoSeletivo,
          discipline: item.disciplina,
          questionNumber: item.numero,
          supportingText: item.textoApoio ?? null,
          images: item.imagens ?? [],
          importedFrom: 'extracaogemini.json',
          reviewStatus: 'PENDING_REVIEW',
        },
      },
    };
  });

  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', documentId, matched: updates.length,
    sample: updates.slice(0, 3).map(({ number, id, data }) => ({ number, id, answer: data.correctAnswer, alternativeCount: data.alternatives.length })) }, null, 2));
  if (apply) {
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.question.update({ where: { id: update.id }, data: update.data });
      }
    }, { timeout: 60_000, maxWait: 10_000 });
    console.log('Atualização concluída: 40 questões atualizadas e mantidas PENDING_REVIEW.');
  } else {
    console.log('Nenhuma alteração gravada. Execute com --apply para atualizar.');
  }
} finally {
  await prisma.$disconnect();
}
