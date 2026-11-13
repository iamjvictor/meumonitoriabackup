import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const backend = resolve(root, 'backend');
const require = createRequire(resolve(backend, 'package.json'));
const dotenv = require('dotenv');
const envFile = dotenv.parse(await readFile(resolve(backend, '.env')));
const status = require('node:child_process').spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Supabase local dbtemp não está disponível.');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap(line => { const m=line.match(/^([A-Z0-9_]+)=(.*)$/); return m?[[m[1],m[2].replace(/^"|"$/g,'')]]:[]; }));
Object.assign(process.env, envFile, { NODE_ENV:'test', DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:56322/postgres', SUPABASE_URL:local.API_URL, SUPABASE_PUBLISHABLE_KEY:local.PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY, REDIS_URL:'redis://127.0.0.1:6379', ASAAS_WEBHOOK_URL:'http://127.0.0.1:33671/api/webhooks/asaas' });
const { StructuredQuestionExtractionService } = await import('../backend/src/worker/services/structured-question-extraction.service.ts');
const { createQuestionExtractorGraph } = await import('../backend/src/worker/services/question-graph/extractor.node.ts');
const { createQuestionReviewerGraph, createQuestionGraphInput } = await import('../backend/src/worker/services/question-graph/reviewer.ts');
const { prisma } = await import('../backend/src/lib/prisma.ts');
const documentId = process.argv[2] ?? 'e2000000-0000-4000-8000-000000000012';
try {
  const document = await prisma.monitorDocument.findUnique({ where:{id:documentId}, select:{id:true, processingVersion:true} });
  if (!document) throw new Error(`Documento ${documentId} não encontrado no dbtemp.`);
  const extracted = await createQuestionExtractorGraph(new StructuredQuestionExtractionService()).invoke({ documentId });
  const candidates = extracted.questions.map(q=>({number:q.number,statement:q.statement,alternatives:q.alternatives,correctAnswer:q.correctAnswer,sourceChunkIds:q.sourceChunkIds,visualEvidence:q.visualEvidence,visualAssetIds:q.visualEvidence.map(v=>v.assetId)}));
  const stateInput = createQuestionGraphInput({ executionId:`e2e:${documentId}:${Date.now()}`,documentId,documentVersion:String(document.processingVersion),model:envFile.QUESTION_EXTRACTION_MODEL??'deepseek/deepseek-v4.1-flash',promptVersion:'structured-extraction-current',contextRefs:{chunkIds:[...new Set(candidates.flatMap(q=>q.sourceChunkIds))],pageNumbers:[],formulaEvidenceRefs:[],imageAssetIds:[...new Set(candidates.flatMap(q=>q.visualAssetIds))]},candidates});
  const reviewed=await createQuestionReviewerGraph().invoke(stateInput);
  const result={documentId,database:'dbtemp-local-only',persisted:false,llmCalls:extracted.llmCalls,questionCount:reviewed.candidates.length,selectedRoute:reviewed.selectedRoute,stage:reviewed.stage,contextRefs:reviewed.contextRefs,decisions:reviewed.reviewDecisions.map((d,i)=>({number:reviewed.candidates[i]?.number??null,route:d.route,missingAlternativeLabels:d.missingAlternativeLabels,missingAnswer:d.missingAnswer,pendingIssues:d.pendingIssues}))};
  const out=resolve(root,'dbtemp/artifacts/Quimica-3.langgraph-e2e-review.json');await mkdir(resolve(root,'dbtemp/artifacts'),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({outputPath:out,...result},null,2));
} finally {await prisma.$disconnect();}
