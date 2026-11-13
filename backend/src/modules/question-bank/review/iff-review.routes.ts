import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../lib/prisma.js';
import { buildEditedContent, editorTextFromHtml } from './iff-review.js';

const iffWhere = { OR: [
  { providerQuestionId: { startsWith: 'iff-', mode: 'insensitive' as const } },
  { institution: { contains: 'Instituto Federal Fluminense', mode: 'insensitive' as const } },
] };

export async function iffReviewRoutes(app: FastifyInstance) {
 app.get('/iff', async () => {
  const items = await prisma.questionBankItem.findMany({ where: iffWhere, orderBy: [{ examYear:'asc' },{ providerQuestionId:'asc' }] });
  return items.map(q => {
   const raw = q.rawPayload && typeof q.rawPayload === 'object' && !Array.isArray(q.rawPayload) ? q.rawPayload as Record<string, unknown> : {};
   const match = q.providerQuestionId.match(/(?:^|[-_])(\d{1,2})$/);
   const numero = typeof raw.numero === 'number' ? raw.numero : match ? Number(match[1]) : null;
   let editor: string | null = null;
   try { editor = editorTextFromHtml(q.statementHtml, q.imageUrls as string[]); } catch { /* incompatibilidade visual exige revisão antes da edição */ }
   return { id:q.id, provider:q.provider, provider_question_id:q.providerQuestionId, ano:q.examYear, numero, subject:q.subject, topic:q.topic, revisao_pendente:raw.verificacao_integral_pendente===true, posicao_imagens_pendente:raw.posicao_imagens_necessita_revisao===true, statement_html:q.statementHtml, statement_editor:editor, alternatives:q.alternatives, correct_answer:q.correctAnswer };
  });
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
