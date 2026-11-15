import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../lib/prisma.js';
import { buildEditedContent, editorTextFromHtml } from './iff-review.js';

const iffWhere = { OR: [
  { providerQuestionId: { startsWith: 'iff-', mode: 'insensitive' as const } },
  { institution: { contains: 'Instituto Federal Fluminense', mode: 'insensitive' as const } },
] };

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const topicName = (value: string) => value.replace(/^(?:Tópico|Topico|Tema)\s*\d+\s*[–—-]\s*/i, '').trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function iffReviewRoutes(app: FastifyInstance) {
 app.get('/iff/competencies', async () => prisma.iffCompetency.findMany({orderBy: [{subject:'asc'}, {topic:'asc'}, {code:'asc'}]}));
 app.get('/iff', async () => {
  const items = await prisma.questionBankItem.findMany({ where: iffWhere, include: { iffCompetencies: true }, orderBy: [{ examYear:'asc' },{ providerQuestionId:'asc' }] });
  return items.map(q => {
   const raw = q.rawPayload && typeof q.rawPayload === 'object' && !Array.isArray(q.rawPayload) ? q.rawPayload as Record<string, unknown> : {};
   const match = q.providerQuestionId.match(/(?:^|[-_])(\d{1,2})$/);
   const numero = typeof raw.numero === 'number' ? raw.numero : match ? Number(match[1]) : null;
   let editor: string | null = null;
   try { editor = editorTextFromHtml(q.statementHtml, q.imageUrls as string[]); } catch { /* incompatibilidade visual exige revisão antes da edição */ }
   return { id:q.id, competence_ids:q.iffCompetencies.map(c => c.competencyId), provider:q.provider, provider_question_id:q.providerQuestionId, ano:q.examYear, numero, subject:q.subject, topic:q.topic, revisao_pendente:raw.verificacao_integral_pendente===true, posicao_imagens_pendente:raw.posicao_imagens_necessita_revisao===true, statement_html:q.statementHtml, statement_editor:editor, alternatives:q.alternatives, correct_answer:q.correctAnswer };
  });
 });
 app.patch<{Params:{id:string};Body:unknown}>('/iff/:id/classification', async (request, reply) => {
  if (!uuid.test(request.params.id)) return reply.code(400).send({error:'Identificador de questão inválido.'});
  const body = request.body as {topic?: unknown; competenceIds?: unknown} | null;
  if (!body || !(body.topic === null || (typeof body.topic === 'string' && body.topic.trim().length > 0)) || !Array.isArray(body.competenceIds) || body.competenceIds.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(body.competenceIds).size !== body.competenceIds.length) return reply.code(400).send({error:'Tópico ou competências inválidos.'});
  const question = await prisma.questionBankItem.findFirst({where:{id:request.params.id,...iffWhere}});
  if (!question) return reply.code(404).send({error:'Questão não encontrada.'});
  const catalog = await prisma.iffCompetency.findMany({where:{matrix:'INTEGRADO'}});
  const subjectCatalog = catalog.filter(c => normalized(c.subject) === normalized(question.subject));
  const ids = body.competenceIds as string[];
  if (ids.some(id => !subjectCatalog.some(c => c.id === id)) || (body.topic !== null && body.topic !== question.topic && !subjectCatalog.some(c => normalized(topicName(c.topic)) === normalized(body.topic as string)))) return reply.code(400).send({error:'Tópico ou competência não pertence à matéria da questão.'});
  await prisma.$transaction(async tx => {
   await tx.questionBankItem.update({where:{id:question.id},data:{topic:body.topic as string | null}});
   await tx.iffQuestionCompetency.deleteMany({where:{questionId:question.id}});
   if (ids.length) await tx.iffQuestionCompetency.createMany({data:ids.map(competencyId => ({questionId:question.id,competencyId}))});
  });
  return {id:question.id, topic:body.topic, competence_ids:ids};
 });
 app.patch<{Params:{id:string};Body:unknown}>('/iff/:id',async(request,reply)=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id))return reply.code(400).send({error:'Identificador de questão inválido.'});
  const q=await prisma.questionBankItem.findFirst({where:{id:request.params.id,...iffWhere}});
  if(!q)return reply.code(404).send({error:'Questão não encontrada.'});
  if(q.provider!=='MANUAL')return reply.code(403).send({error:'Somente questões inseridas manualmente podem ser editadas nesta tela.'});
  try {const updated=buildEditedContent(request.body,q.imageUrls as string[],q.subject,q.topic);await prisma.questionBankItem.update({where:{id:q.id},data:updated});return {id:q.id,statement_html:updated.statementHtml,statement_editor:editorTextFromHtml(updated.statementHtml,q.imageUrls as string[]),alternatives:updated.alternatives,correct_answer:updated.correctAnswer};}
  catch(error){return reply.code(400).send({error:error instanceof Error?error.message:'Dados inválidos.'});}
 });
}
