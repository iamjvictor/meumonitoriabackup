import type { NormalizedProviderPage, ProviderPageInput } from '../../models/question-bank.model.js';
import { normalizedQuestionBankItemSchema } from '../../models/question-bank.model.js';
import { extractImageUrls, htmlToPlainText, sanitizeQuestionHtml } from '../../services/question-bank-content.service.js';
import type { GranQuestion, GranQuestionPage } from './gran.client.js';

const mathSubjectId = '403825';
const topicAliases = new Map([
  ['403794', 'Matemática Financeira'],
  ['43', 'Estatística'],
  ['404257', 'Raciocínio Lógico'],
]);

type GranPageClient = {
  listQuestions(page: number, perPage: number): Promise<GranQuestionPage>;
};

export class GranQuestionAdapter {
  private readonly seenIds = new Set<string>();
  private expectedTotal: number | null = null;
  private totalPages = 0;
  private rootOnlyQuestions = 0;
  private skippedQuestions = 0;
  private readonly classifiedTopics: Record<string, number> = {};

  constructor(
    private readonly client: GranPageClient,
    private readonly options: { onQuestionSkipped?: (id: string, reason: string) => void } = {},
  ) {}

  async fetchPage(input: ProviderPageInput): Promise<NormalizedProviderPage> {
    const response = await this.client.listQuestions(input.page, input.pageSize);
    const data = response.data!;
    this.expectedTotal = data.total!;
    this.totalPages = data.pages!;
    const items = [];
    for (const question of data.rows!) {
      const id = String(question.id);
      if (!/^\d+$/.test(id)) {
        this.skip(id, 'ID da questão inválido.');
        continue;
      }
      if (this.seenIds.has(id)) {
        this.skip(id, 'ID duplicado em outra página do resultado.');
        continue;
      }
      this.seenIds.add(id);
      try {
        const normalized = normalizeGranQuestion(question);
        items.push(normalized);
        if (normalized.topic) this.classifiedTopics[normalized.topic] = (this.classifiedTopics[normalized.topic] ?? 0) + 1;
        else this.rootOnlyQuestions += 1;
      } catch (error) {
        this.skip(id, error instanceof Error ? error.message : String(error));
      }
    }
    const total = data.total!;
    const page = data.page ?? input.page;
    const pageSize = data.perPage ?? input.pageSize;
    return { items, page, pageSize, total, hasNextPage: page < (data.pages ?? 0) && data.rows!.length > 0 };
  }

  getSummary() {
    return {
      expectedTotal: this.expectedTotal,
      totalPages: this.totalPages,
      uniqueRowsRead: this.seenIds.size,
      rootOnlyQuestions: this.rootOnlyQuestions,
      classifiedTopics: { ...this.classifiedTopics },
      skippedQuestions: this.skippedQuestions,
    };
  }

  private skip(id: string, reason: string) {
    this.skippedQuestions += 1;
    this.options.onQuestionSkipped?.(id, reason);
  }
}

export function normalizeGranQuestion(question: GranQuestion) {
  const statementHtml = sanitizeQuestionHtml(question.enunciado ?? '');
  const statementText = htmlToPlainText(statementHtml) || extractImageUrls(statementHtml).map((url) => `[Imagem: ${url}]`).join("\n");
  if (!statementHtml.trim() || !statementText.trim()) throw new Error('Enunciado ausente ou vazio.');

  const alternatives = (question.itens ?? []).map((item) => {
    const label = item.rotulo?.trim().toUpperCase() ?? '';
    const html = sanitizeQuestionHtml(item.corpo ?? '');
    const text = htmlToPlainText(html) || extractImageUrls(html).map((url) => `[Imagem: ${url}]`).join("\n");
    if (!label || !text) throw new Error('Alternativa sem rótulo ou texto.');
    return { providerId: String(item.id), label, text, html, isCorrect: String(item.id) === String(question.resposta) };
  });
  const correct = alternatives.filter((alternative) => alternative.isCorrect);
  if (correct.length !== 1) throw new Error(`Gabarito não corresponde a exatamente uma alternativa (resposta=${String(question.resposta)}).`);

  const taxonomy = mapTaxonomy(question.assuntos ?? []);
  const exam = question.provas?.[0];
  const board = clean(exam?.banca?.nome) ?? clean(question.bancas?.[0]?.nome) ?? clean(exam?.banca?.sigla) ?? clean(question.bancas?.[0]?.sigla);
  const institution = clean(exam?.orgao?.nome) ?? clean(question.orgaos?.[0]?.nome);
  const examYear = validYear(exam?.ano) ?? validYear(question.anos?.[0]);
  const examName = clean(exam?.nome)
    ?? ([board, institution, clean(exam?.cargo?.descricao) ?? clean(question.cargos?.[0]?.descricao), examYear]
      .filter(Boolean).join(' — ') || 'Concurso CESGRANRIO');
  const difficulty = mapGranDifficulty(question.dificuldade);
  const slug = clean(question.slug);
  const statementImages = extractImageUrls(statementHtml);

  return normalizedQuestionBankItemSchema.parse({
    provider: 'GRAN',
    providerQuestionId: String(question.id),
    externalId: clean(question.hashId) ?? clean(question.hash),
    examType: 'CONCURSO',
    examName,
    board,
    institution,
    examYear,
    subject: 'Matemática',
    topic: taxonomy.topic,
    subtopic: taxonomy.subtopic,
    subsubtopic: taxonomy.subsubtopic,
    taxonomyPath: taxonomy.path,
    statementHtml,
    statementText,
    alternatives,
    correctAnswer: correct[0]!.label,
    difficulty,
    sourceUrl: slug ? `https://questoes.grancursosonline.com.br/questoes-de-concursos/${slug.split('/').map(encodeURIComponent).join('/')}` : null,
    imageUrls: [...new Set([...statementImages, ...alternatives.flatMap((item) => extractImageUrls(item.html))])],
    rawPayload: question,
    sourceFetchedAt: new Date(),
  });
}

function mapTaxonomy(assuntos: NonNullable<GranQuestion['assuntos']>) {
  const nodes = new Map(assuntos.map((node) => [String(node.id), node]));
  const candidates = assuntos.flatMap((node, index) => {
    const id = String(node.id);
    const rootId = String(node.assunto_raiz ?? mathSubjectId);
    if (topicAliases.has(id)) {
      return [{ node, index, path: [topicAliases.get(id)!] }];
    }
    if (node.materia || id === mathSubjectId) return [];
    const branch = pathFor(node, nodes);
    if (rootId === mathSubjectId) return branch.length ? [{ node, index, path: branch }] : [];
    const alias = topicAliases.get(rootId);
    return alias ? [{ node, index, path: branch[0] === alias ? branch : [alias, ...branch] }] : [];
  });

  if (candidates.length === 0) {
    return { topic: null, subtopic: null, subsubtopic: null, path: ['Matemática'] };
  }

  candidates.sort((left, right) => {
    const priority = (path: string[]) => {
      const index = [...topicAliases.values()].indexOf(path[0] ?? '');
      return index < 0 ? 100 : index;
    };
    const leftPriority = priority(left.path);
    const rightPriority = priority(right.path);
    return leftPriority - rightPriority || right.path.length - left.path.length || left.index - right.index;
  });
  const names = candidates[0]!.path;
  const [topic, subtopic, ...deeper] = names;
  return {
    topic: topic ?? null,
    subtopic: subtopic ?? null,
    subsubtopic: deeper.length > 0 ? deeper.join(' > ') : null,
    path: ['Matemática', ...names],
  };
}

function pathFor(
  node: NonNullable<GranQuestion['assuntos']>[number],
  nodes: Map<string, NonNullable<GranQuestion['assuntos']>[number]>,
) {
  const reversed: string[] = [];
  const visited = new Set<string>();
  let current: typeof node | undefined = node;
  while (current) {
    const id = String(current.id);
    if (visited.has(id)) break;
    visited.add(id);
    if (id === mathSubjectId || current.materia) break;
    const name = clean(current.nome) ?? clean(current.nome_clean) ?? topicAliases.get(id);
    if (name) reversed.push(name);

    const parentId = current.pai === null || current.pai === undefined ? null : String(current.pai);
    if (!parentId || parentId === mathSubjectId) break;
    const parent = nodes.get(parentId);
    if (parent) {
      current = parent;
      continue;
    }
    const knownParent = topicAliases.get(parentId);
    if (knownParent) reversed.push(knownParent);
    break;
  }
  return reversed.reverse();
}

function mapGranDifficulty(value: number | string | null | undefined) {
  const score = Number(value);
  if (!Number.isInteger(score)) return null;
  if (score === 1 || score === 2) return 'EASY';
  if (score === 3 || score === 4) return 'MEDIUM';
  if (score === 5) return 'HARD';
  return null;
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result || null;
}

function validYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year > 0 ? year : null;
}
