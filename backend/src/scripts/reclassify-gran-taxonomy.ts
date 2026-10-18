import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { computeQuestionContentHash } from '../modules/question-bank/services/question-bank-content.service.js';
import { prisma } from '../lib/prisma.js';

// Default mode is a read-only preview. --apply writes only validated changes after
// recording a snapshot. Pending questions may have the hierarchy of their existing
// source branch corrected, but remain pending for semantic review.
const ROOT_NAMES = new Map([
  ['403825', 'Matemática'],
  ['403794', 'Matemática Financeira'],
  ['43', 'Estatística'],
  ['404257', 'Raciocínio Lógico'],
]);
const MATH_ROOT = '403825';
const MATH_FINANCE_BRANCH = '425054';
const FINANCE_KEY = 'topic:matematica-financeira';

type GranSubject = {
  id: string | number;
  pai?: string | number | null;
  assunto_raiz?: string | number | null;
  nome?: string | null;
  nome_clean?: string | null;
  materia?: boolean;
};
type RawQuestion = { id?: string | number; assuntos?: GranSubject[] };
type PathPart = { key: string; name: string };
type Candidate = { id: string; lineageIds: string[]; path: PathPart[] };
type Classification = {
  topic: string | null;
  subtopic: string | null;
  subsubtopic: string | null;
  taxonomyPath: string[];
};
type PendingReason = 'MISSING_PARENT' | 'DIFFERENT_TOPICS' | 'NO_VALID_PATH' | 'CYCLE' | 'ROOT_CONFLICT';
type DatabaseChange = {
  id: string;
  providerQuestionId: string;
  updatedAt: Date;
  contentHash: string;
  proposed: Classification;
  proposedContentHash: string;
  current: { topic: string | null; subtopic: string | null; subsubtopic: string | null; taxonomyPath: unknown };
};
type Resolution =
  | { kind: 'complete'; candidate: Candidate }
  | { kind: 'missing'; parentId: string }
  | { kind: 'cycle'; nodeId: string }
  | { kind: 'root-conflict'; nodeId: string };

const cacheDir = resolve(option('--cache-dir') ?? '.cache/gran-100');
const outputDir = resolve(option('--output-dir') ?? `${cacheDir}/reclassification-preview`);
const apply = process.argv.includes('--apply');
if (apply && process.argv.includes('--dry-run')) throw new Error('Use --apply ou --dry-run, nunca ambos.');

async function main() {
  const { catalog, cachedRows, pages, cacheQuestionIds, catalogFingerprint } = await loadCatalog(cacheDir);
  const rows = await prisma.questionBankItem.findMany({
    where: { provider: 'GRAN' },
    select: {
      id: true,
      providerQuestionId: true,
      subject: true,
      topic: true,
      subtopic: true,
      subsubtopic: true,
      taxonomyPath: true,
      rawPayload: true,
      contentHash: true,
      updatedAt: true,
      statementText: true,
      alternatives: true,
      correctAnswer: true,
    },
    orderBy: { providerQuestionId: 'asc' },
  });

  const currentTopics = new Map<string, number>();
  const proposedTopics = new Map<string, number>();
  const proposedSubtopics = new Map<string, number>();
  const changes: Array<Record<string, unknown>> = [];
  const databaseChanges: DatabaseChange[] = [];
  const pending: Array<Record<string, unknown>> = [];
  const missingParents = new Map<string, number>();
  const counts = {
    saved: rows.length,
    ready: 0,
    changed: 0,
    changedTopic: 0,
    unchanged: 0,
    rootOnlyMath: 0,
    pendingMissingParent: 0,
    pendingDifferentTopics: 0,
    pendingBoth: 0,
    pendingOther: 0,
    anchoredPending: 0,
    anchoredChanged: 0,
    curatedConjuntosPending: 0,
    curatedConjuntosChanged: 0,
    multipleBranchesSameTopic: 0,
    questionsWithForeignSubjects: 0,
    nonMathSubjects: 0,
  };

  for (const row of rows) {
    const current = {
      topic: row.topic,
      subtopic: row.subtopic,
      subsubtopic: row.subsubtopic,
      taxonomyPath: row.taxonomyPath,
    };
    increment(currentTopics, row.topic ?? '(sem tópico)');
    if (row.subject !== 'Matemática') counts.nonMathSubjects++;
    const raw = asRawQuestion(row.rawPayload);
    const result = classify(raw.assuntos ?? [], catalog);
    if (result.foreignSubjectIds.length > 0) counts.questionsWithForeignSubjects++;

    for (const parentId of result.missingParentIds) increment(missingParents, parentId);
    const isPending = result.pendingReasons.length > 0 || !result.classification;
    const anchored = isPending ? anchoredClassification(raw.assuntos ?? [], catalog, row.topic, row.subtopic) : null;
    const curatedConjuntos = isPending && !anchored && result.pendingReasons.includes('MISSING_PARENT')
      && !result.pendingReasons.includes('DIFFERENT_TOPICS')
      ? curatedConjuntosClassification(raw.assuntos ?? [], catalog, row.topic, row.subtopic) : null;
    if (isPending) {
      const missing = result.pendingReasons.includes('MISSING_PARENT');
      const different = result.pendingReasons.includes('DIFFERENT_TOPICS');
      if (missing && different) counts.pendingBoth++;
      else if (missing) counts.pendingMissingParent++;
      else if (different) counts.pendingDifferentTopics++;
      else counts.pendingOther++;
      pending.push({
        providerQuestionId: row.providerQuestionId,
        current,
        reasons: result.pendingReasons,
        missingParentIds: result.missingParentIds,
        foreignSubjectIds: result.foreignSubjectIds,
        candidatePaths: result.candidatePaths,
        anchoredProposal: anchored,
        curatedConjuntosProposal: curatedConjuntos,
      });
      if (anchored) counts.anchoredPending++;
      if (curatedConjuntos) counts.curatedConjuntosPending++;
    } else {
      counts.ready++;
      if (result.rootOnlyMath) counts.rootOnlyMath++;
      if (result.multipleBranchesSameTopic) counts.multipleBranchesSameTopic++;
    }

    const proposed = isPending ? anchored ?? curatedConjuntos : result.classification;
    if (!proposed) {
      increment(proposedTopics, row.topic ?? '(sem tópico)');
      increment(proposedSubtopics, subtopicKey(row.topic, row.subtopic));
      continue;
    }
    increment(proposedTopics, proposed.topic ?? '(sem tópico)');
    increment(proposedSubtopics, subtopicKey(proposed.topic, proposed.subtopic));
    if (sameClassification(current, proposed)) {
      counts.unchanged++;
      continue;
    }
    counts.changed++;
    if (current.topic !== proposed.topic) counts.changedTopic++;
    if (anchored) counts.anchoredChanged++;
    if (curatedConjuntos) counts.curatedConjuntosChanged++;
    changes.push({ providerQuestionId: row.providerQuestionId, current, proposed, candidatePaths: result.candidatePaths, reviewRequired: isPending, classificationBasis: curatedConjuntos ? 'CURATED_CONJUNTOS' : isPending ? 'EXISTING_BRANCH_ANCESTRY' : 'COMPLETE_PATH' });
    databaseChanges.push({
      id: row.id,
      providerQuestionId: row.providerQuestionId,
      updatedAt: row.updatedAt,
      contentHash: row.contentHash,
      proposed,
      proposedContentHash: computeQuestionContentHash({
        provider: 'GRAN',
        providerQuestionId: row.providerQuestionId,
        subject: row.subject,
        topic: proposed.topic,
        statementText: row.statementText,
        alternatives: hashAlternatives(row.alternatives, row.providerQuestionId),
        correctAnswer: row.correctAnswer,
      }),
      current,
    });
  }

  const copies = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::integer AS count
    FROM questions q
    JOIN question_bank_items b ON b.id = q.question_bank_item_id
    WHERE b.provider = 'GRAN'
  `;
  const summary = {
    mode: apply ? 'apply' : 'preview',
    generatedAt: new Date().toISOString(),
    cacheDir,
    catalogFingerprint,
    cache: { pages, questions: cachedRows, uniqueQuestionIds: cacheQuestionIds, subjectNodes: catalog.size },
    database: { ...counts, pending: pending.length, materializedCopies: copies[0]?.count ?? 0 },
    missingParentIds: [...missingParents].sort((a, b) => b[1] - a[1]).map(([id, questions]) => ({ id, questions })),
    currentTopics: sortedCounts(currentTopics),
    proposedTopics: sortedCounts(proposedTopics),
  };

  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await atomicWrite(resolve(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  await atomicWrite(resolve(outputDir, 'changes.json'), JSON.stringify(changes, null, 2));
  await atomicWrite(resolve(outputDir, 'pending.json'), JSON.stringify(pending, null, 2));
  await atomicWrite(resolve(outputDir, 'topic-counts.csv'), topicCsv(currentTopics, proposedTopics));
  await atomicWrite(resolve(outputDir, 'projected-subtopic-counts.csv'), subtopicCsv(proposedSubtopics));
  if (apply) {
    if ((copies[0]?.count ?? 0) !== 0) throw new Error('Há questões GRAN materializadas em monitores. Aplique uma política de propagação antes de alterar o acervo.');
    await applyChanges(databaseChanges, outputDir, catalogFingerprint);
  }
  console.log(JSON.stringify({
    mode: summary.mode,
    outputDir,
    catalogFingerprint,
    cache: summary.cache,
    database: summary.database,
    topProposedTopics: summary.proposedTopics.slice(0, 20),
    firstChanges: changes.slice(0, 8),
    firstPending: pending.slice(0, 4),
  }, null, 2));
}

async function loadCatalog(directory: string) {
  const names = (await readdir(directory))
    .filter((name) => /^page-\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
  if (names.length === 0) throw new Error(`Nenhuma página bruta encontrada em ${directory}.`);
  const catalog = new Map<string, GranSubject>();
  const ids = new Set<string>();
  let cachedRows = 0;
  let expectedPages: number | null = null;
  for (const [index, name] of names.entries()) {
    const page = JSON.parse(await readFile(resolve(directory, name), 'utf8')) as {
      data?: { page?: number; pages?: number; rows?: RawQuestion[] };
    };
    if (page.data?.page !== index + 1 || !Array.isArray(page.data.rows)) {
      throw new Error(`Cache de páginas incompleto ou fora de ordem: ${name}.`);
    }
    expectedPages ??= page.data.pages ?? null;
    if (page.data.pages !== expectedPages) throw new Error(`Total de páginas divergente em ${name}.`);
    for (const question of page.data.rows) {
      cachedRows++;
      ids.add(String(question.id));
      for (const node of question.assuntos ?? []) {
        const id = String(node.id);
        const previous = catalog.get(id);
        if (previous && !sameNode(previous, node)) throw new Error(`Assunto ${id} tem metadados conflitantes no cache.`);
        catalog.set(id, node);
      }
    }
  }
  if (expectedPages !== names.length) throw new Error(`Cache incompleto: ${names.length} de ${expectedPages} páginas.`);
  for (const id of ROOT_NAMES.keys()) {
    if (!catalog.has(id)) throw new Error(`Raiz ${id} ausente do catálogo local.`);
  }
  const catalogFingerprint = createHash('sha256').update(JSON.stringify([...catalog]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, node]) => [id, subjectName(node), node.pai ?? null, node.assunto_raiz ?? null, node.materia ?? false]))).digest('hex');
  return { catalog, cachedRows, pages: names.length, cacheQuestionIds: ids.size, catalogFingerprint };
}

function classify(assuntos: GranSubject[], catalog: Map<string, GranSubject>) {
  const candidates: Candidate[] = [];
  const pendingReasons = new Set<PendingReason>();
  const missingParentIds = new Set<string>();
  const foreignSubjectIds: string[] = [];
  const rootIds = new Set<string>();
  for (const node of assuntos) {
    const id = String(node.id);
    const declaredRoot = String(node.assunto_raiz ?? id);
    if (!ROOT_NAMES.has(declaredRoot)) {
      foreignSubjectIds.push(id);
      continue;
    }
    if (ROOT_NAMES.has(id)) rootIds.add(id);
    const resolution = resolvePath(node, catalog);
    if (resolution.kind === 'complete') {
      if (resolution.candidate.path.length > 0) candidates.push(resolution.candidate);
    } else if (resolution.kind === 'missing') {
      pendingReasons.add('MISSING_PARENT');
      missingParentIds.add(resolution.parentId);
    } else if (resolution.kind === 'cycle') pendingReasons.add('CYCLE');
    else pendingReasons.add('ROOT_CONFLICT');
  }

  const leaves = candidates.filter((candidate) => !candidates.some((other) =>
    other !== candidate && other.lineageIds.includes(candidate.id)));
  if (leaves.length === 0) {
    for (const id of rootIds) {
      if (id === MATH_ROOT) continue;
      leaves.push({ id, lineageIds: [id], path: [{ key: aliasKey(id), name: ROOT_NAMES.get(id)! }] });
    }
  }
  const rootOnlyMath = leaves.length === 0 && rootIds.has(MATH_ROOT) && pendingReasons.size === 0;
  if (rootOnlyMath) {
    return {
      classification: toClassification([]),
      rootOnlyMath: true,
      multipleBranchesSameTopic: false,
      pendingReasons: [] as PendingReason[],
      missingParentIds: [] as string[],
      foreignSubjectIds,
      candidatePaths: [] as string[][],
    };
  }
  if (leaves.length === 0) pendingReasons.add('NO_VALID_PATH');
  const topics = new Set(leaves.map((candidate) => candidate.path[0]?.key));
  if (topics.size > 1) pendingReasons.add('DIFFERENT_TOPICS');
  const path = commonPrefix(leaves.map((candidate) => candidate.path));
  return {
    classification: pendingReasons.size === 0 ? toClassification(path) : null,
    rootOnlyMath: false,
    multipleBranchesSameTopic: leaves.length > 1 && topics.size === 1,
    pendingReasons: [...pendingReasons],
    missingParentIds: [...missingParentIds],
    foreignSubjectIds,
    candidatePaths: leaves.map((candidate) => candidate.path.map((part) => part.name)),
  };
}

// Keep the branch already selected by the importer. A complete ancestry for that
// very subject can safely move its name from topic to subtopic (or deeper) even
// when another subject on the question still needs a human choice or is missing
// from the cached catalog.
function anchoredClassification(assuntos: GranSubject[], catalog: Map<string, GranSubject>, currentTopic: string | null, currentSubtopic?: string | null): Classification | null {
  if (!currentTopic) return null;
  const anchors = assuntos.filter((node) => subjectName(node) === currentTopic);
  if (new Set(anchors.map((node) => String(node.id))).size !== 1) return null;
  const anchor = anchors[0];
  if (!anchor || !ROOT_NAMES.has(String(anchor.assunto_raiz ?? anchor.id))) return null;
  const resolved = resolvePath(anchor, catalog);
  if (resolved.kind !== 'complete' || resolved.candidate.path.length < 2) return null;
  const anchorId = String(anchor.id);
  if (!currentSubtopic) return toClassification(resolved.candidate.path);
  const branch = assuntos.map((node) => resolvePath(node, catalog))
    .filter((resolution): resolution is Extract<Resolution, { kind: 'complete' }> => resolution.kind === 'complete')
    .map((resolution) => resolution.candidate)
    .filter((candidate) => candidate.lineageIds.includes(anchorId)
      && candidate.path[0]?.key === resolved.candidate.path[0]?.key)
    .filter((candidate) => candidate.path[resolved.candidate.path.length]?.name === currentSubtopic);
  const matching = new Set(branch.map((candidate) => candidate.path[resolved.candidate.path.length]?.key));
  if (matching.size !== 1) return null;
  const path = commonPrefix(branch.map((candidate) => candidate.path));
  return path.length > resolved.candidate.path.length ? toClassification(path) : null;
}

// Product taxonomy decision: the cached Gran payload omits parent nodes 408601
// and 408638. Their descendants about sets and number sets belong under the
// local Conjuntos topic. Scope this rule to the question's already selected node;
// the missing source ancestors remain visible in pending.json for later review.
function curatedConjuntosClassification(assuntos: GranSubject[], catalog: Map<string, GranSubject>, currentTopic: string | null, currentSubtopic: string | null): Classification | null {
  if (!currentTopic) return null;
  const anchors = assuntos.filter((node) => subjectName(node) === currentTopic
    && String(node.assunto_raiz) === MATH_ROOT);
  if (new Set(anchors.map((node) => String(node.id))).size !== 1) return null;
  const anchor = anchors[0];
  if (!anchor) return null;
  const lineage = [anchor];
  const visited = new Set([String(anchor.id)]);
  let parentId = String(anchor.pai);
  while (!['408601', '408638'].includes(parentId)) {
    const parent = catalog.get(parentId);
    if (!parent || visited.has(parentId) || String(parent.assunto_raiz) !== MATH_ROOT) return null;
    lineage.unshift(parent);
    visited.add(parentId);
    parentId = String(parent.pai);
  }
  const path = ['Matemática', 'Conjuntos', ...lineage.map(subjectName)];
  if (currentSubtopic) {
    const children = assuntos.filter((node) => String(node.pai) === String(anchor.id)
      && subjectName(node) === currentSubtopic);
    if (new Set(children.map((node) => String(node.id))).size !== 1) return null;
    path.push(currentSubtopic);
  }
  return {
    topic: 'Conjuntos',
    subtopic: path[2]!,
    subsubtopic: path.length > 3 ? path.slice(3).join(' > ') : null,
    taxonomyPath: path,
  };
}

function resolvePath(start: GranSubject, catalog: Map<string, GranSubject>): Resolution {
  const reversed: GranSubject[] = [];
  const visited = new Set<string>();
  let current: GranSubject | undefined = start;
  while (current) {
    const id = String(current.id);
    if (visited.has(id)) return { kind: 'cycle', nodeId: id };
    visited.add(id);
    reversed.unshift(current);
    if (current.pai === null || current.pai === undefined) {
      if (!ROOT_NAMES.has(id) || String(start.assunto_raiz ?? id) !== id) {
        return { kind: 'root-conflict', nodeId: id };
      }
      const lineageIds = reversed.map((node) => String(node.id));
      let path: PathPart[];
      if (id === MATH_ROOT) {
        path = reversed.slice(1).map((node) => ({ key: String(node.id), name: subjectName(node) }));
        const financeIndex = reversed.findIndex((node) => String(node.id) === MATH_FINANCE_BRANCH);
        if (financeIndex >= 0) {
          path = [
            { key: FINANCE_KEY, name: 'Matemática Financeira' },
            ...reversed.slice(financeIndex + 1).map((node) => ({ key: String(node.id), name: subjectName(node) })),
          ];
        }
      } else {
        path = [
          { key: aliasKey(id), name: ROOT_NAMES.get(id)! },
          ...reversed.slice(1).map((node) => ({ key: String(node.id), name: subjectName(node) })),
        ];
      }
      return { kind: 'complete', candidate: { id: String(start.id), lineageIds, path } };
    }
    const parentId = String(current.pai);
    current = catalog.get(parentId);
    if (!current) return { kind: 'missing', parentId };
  }
  return { kind: 'root-conflict', nodeId: String(start.id) };
}

function aliasKey(rootId: string) {
  return rootId === '403794' ? FINANCE_KEY : `topic:${rootId}`;
}

function commonPrefix(paths: PathPart[][]): PathPart[] {
  if (paths.length === 0) return [];
  let prefix = paths[0]!.slice();
  for (const path of paths.slice(1)) {
    let matching = 0;
    while (matching < prefix.length && prefix[matching]?.key === path[matching]?.key) matching++;
    prefix = prefix.slice(0, matching);
  }
  return prefix;
}

function toClassification(path: PathPart[]): Classification {
  const names = path.map((part) => part.name);
  return {
    topic: names[0] ?? null,
    subtopic: names[1] ?? null,
    subsubtopic: names.length > 2 ? names.slice(2).join(' > ') : null,
    taxonomyPath: ['Matemática', ...names],
  };
}

function sameNode(left: GranSubject, right: GranSubject) {
  return subjectName(left) === subjectName(right)
    && String(left.pai ?? '') === String(right.pai ?? '')
    && String(left.assunto_raiz ?? '') === String(right.assunto_raiz ?? '')
    && Boolean(left.materia) === Boolean(right.materia);
}

function subjectName(node: GranSubject) {
  return (node.nome ?? node.nome_clean ?? '').trim();
}

function asRawQuestion(value: unknown): RawQuestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as RawQuestion;
}

function hashAlternatives(value: unknown, questionId: string): Array<{ label: string; text: string }> {
  if (!Array.isArray(value)) throw new Error(`Alternativas inválidas na questão ${questionId}.`);
  return value.map((alternative) => {
    if (!alternative || typeof alternative.label !== 'string' || typeof alternative.text !== 'string') {
      throw new Error(`Alternativa inválida na questão ${questionId}.`);
    }
    return { label: alternative.label, text: alternative.text };
  });
}

async function applyChanges(changes: DatabaseChange[], directory: string, catalogFingerprint: string) {
  const snapshotPath = resolve(directory, `snapshot-before-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await atomicWrite(snapshotPath, JSON.stringify({
    catalogFingerprint,
    createdAt: new Date().toISOString(),
    rows: changes.map((change) => ({
      id: change.id,
      providerQuestionId: change.providerQuestionId,
      updatedAt: change.updatedAt.toISOString(),
      contentHash: change.contentHash,
      ...change.current,
    })),
  }, null, 2));
  console.log(JSON.stringify({ event: 'gran_taxonomy_snapshot_saved', snapshotPath, rows: changes.length }));

  let applied = 0;
  try {
    for (let offset = 0; offset < changes.length; offset += 25) {
      const batch = changes.slice(offset, offset + 25);
      await prisma.$transaction(async (tx) => {
        for (const change of batch) {
          const result = await tx.questionBankItem.updateMany({
            where: {
              id: change.id,
              provider: 'GRAN',
              updatedAt: change.updatedAt,
              contentHash: change.contentHash,
            },
            data: {
              topic: change.proposed.topic,
              subtopic: change.proposed.subtopic,
              subsubtopic: change.proposed.subsubtopic,
              taxonomyPath: change.proposed.taxonomyPath,
              contentHash: change.proposedContentHash,
              updatedAt: new Date(),
            },
          });
          if (result.count !== 1) throw new Error(`Questão ${change.providerQuestionId} mudou após a prévia; lote cancelado.`);
        }
      }, { timeout: 120_000 });
      applied += batch.length;
      console.log(JSON.stringify({ event: 'gran_taxonomy_batch_applied', applied, total: changes.length }));
    }

    const persisted = await prisma.questionBankItem.findMany({
      where: { provider: 'GRAN', id: { in: changes.map((change) => change.id) } },
      select: { id: true, topic: true, subtopic: true, subsubtopic: true, taxonomyPath: true, contentHash: true },
    });
    const byId = new Map(persisted.map((row) => [row.id, row]));
    const mismatches = changes.filter((change) => {
      const row = byId.get(change.id);
      return !row || !sameClassification(row, change.proposed) || row.contentHash !== change.proposedContentHash;
    });
    if (mismatches.length > 0) throw new Error(`${mismatches.length} questões não correspondem à classificação aplicada.`);
    await atomicWrite(resolve(directory, 'apply-report.json'), JSON.stringify({
      status: 'complete', catalogFingerprint, snapshotPath, applied, verified: changes.length,
    }, null, 2));
    console.log(JSON.stringify({ event: 'gran_taxonomy_apply_complete', applied, verified: changes.length, snapshotPath }));
  } catch (error) {
    await atomicWrite(resolve(directory, 'apply-report.json'), JSON.stringify({
      status: 'incomplete', catalogFingerprint, snapshotPath, applied,
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2));
    throw error;
  }
}

function sameClassification(current: { topic: string | null; subtopic: string | null; subsubtopic: string | null; taxonomyPath: unknown }, proposed: Classification) {
  return current.topic === proposed.topic
    && current.subtopic === proposed.subtopic
    && current.subsubtopic === proposed.subsubtopic
    && JSON.stringify(current.taxonomyPath) === JSON.stringify(proposed.taxonomyPath);
}

function subtopicKey(topic: string | null, subtopic: string | null) {
  return JSON.stringify([topic ?? '(sem tópico)', subtopic ?? '(sem subtopic)']);
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map: Map<string, number>) {
  return [...map].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, questions]) => ({ name, questions }));
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function topicCsv(current: Map<string, number>, proposed: Map<string, number>) {
  const names = new Set([...current.keys(), ...proposed.keys()]);
  const rows = [...names].map((name) => ({ name, before: current.get(name) ?? 0, after: proposed.get(name) ?? 0 }))
    .sort((left, right) => right.after - left.after || left.name.localeCompare(right.name));
  return ['topic,atual,projetado', ...rows.map((row) => [row.name, row.before, row.after].map(csvCell).join(','))].join('\n') + '\n';
}

function subtopicCsv(counts: Map<string, number>) {
  const rows = [...counts].map(([key, questions]) => ({ names: JSON.parse(key) as [string, string], questions }))
    .sort((left, right) => left.names[0].localeCompare(right.names[0]) || right.questions - left.questions || left.names[1].localeCompare(right.names[1]));
  return ['topic,subtopic,questoes_projetadas', ...rows.map((row) => [row.names[0], row.names[1], row.questions].map(csvCell).join(','))].join('\n') + '\n';
}

async function atomicWrite(path: string, value: string) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, path);
}

function option(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
