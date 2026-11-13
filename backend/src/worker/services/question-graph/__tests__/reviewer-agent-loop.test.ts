import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';
import type { QuestionGraphState } from '../state.js';
function input(): QuestionGraphState {
  return createQuestionGraphInput({ executionId:'run-1',documentId:'doc-1',documentVersion:'v1',model:'deepseek/test',promptVersion:'p1',contextRefs:{chunkIds:['c1'],pageNumbers:[1],formulaEvidenceRefs:[],imageAssetIds:[]},candidates:[{id:'q1',number:'01',statement:'Quanto é 2 + 2?',alternatives:[{label:'A',text:'4'}],correctAnswer:null,sourceChunkIds:['c1']}] });
}
test('reviewer loops through alternatives before answer node and returns consolidated state', async () => {
 const requests:Array<{schemaName:string;prompt:string}> = [];
 const graph=createQuestionReviewerGraph({contextProvider:{load:async()=>({text:'Questão e contexto do documento.',images:[]})},client:{createStructuredChatCompletion:async<T>(request:any)=>{const prompt=request.messages.map((message:any)=>typeof message.content==='string'?message.content:message.content.map((part:any)=>part.text??'').join('\n')).join('\n');requests.push({schemaName:request.schemaName,prompt});const value=request.schemaName==='question_alternatives_completion'?{alternatives:['A','B','C','D','E'].map(label=>({label,text:label==='A'?'4':`Opção ${label}`,origin:'AI_GENERATED',evidenceQuote:null})),corrections:[],pendingIssue:null,optionsUsable:true}:{answerLabel:'A',foundInSource:false,evidence:'2 + 2 = 4',confidence:0.95,unresolvedReason:null};return value as T;}}});
 const result=await graph.invoke(input());
 assert.deepEqual(requests.map(r=>r.schemaName),['question_alternatives_completion','question_answer_key']);
 assert.match(requests[1]!.prompt,/A\) 4[\s\S]*B\) Opção B[\s\S]*E\) Opção E/);
 assert.equal(result.candidates[0]?.alternatives.length,5);assert.equal(result.candidates[0]?.correctAnswer,'A');assert.equal(result.agentResults.q1?.alternativesOrigin,'AI_GENERATED');assert.equal(result.agentResults.q1?.correctAnswerOrigin,'AI_GENERATED');assert.equal(result.stage,'ready');
 const [backendQuestion]=result.backendOutput;
 assert.equal(backendQuestion?.questionNumber,'01');assert.equal(backendQuestion?.alternativesGenerated,true);assert.equal(backendQuestion?.answerGenerated,true);
 assert.equal(backendQuestion?.alternativesOrigin,'AI_GENERATED');assert.equal(backendQuestion?.correctAnswerOrigin,'AI_GENERATED');
 assert.equal(backendQuestion?.needsReview,true);assert.equal(backendQuestion?.status,'PENDING_REVIEW');
});
test('answer agent is not called when alternatives agent marks structurally complete A-E as unusable', async () => {
 const schemas:string[]=[];
 const graph=createQuestionReviewerGraph({contextProvider:{load:async()=>({text:'Contexto insuficiente.',images:[]})},client:{createStructuredChatCompletion:async<T>(request:any)=>{schemas.push(request.schemaName);return{alternatives:['A','B','C','D','E'].map(label=>({label,text:`Opção ${label}`,origin:'AI_GENERATED',evidenceQuote:null})),corrections:[],pendingIssue:'Não foi possível gerar opções coerentes.',optionsUsable:false} as T;}}});
 const result=await graph.invoke(input());assert.deepEqual(schemas,['question_alternatives_completion']);assert.equal(result.nextNode,'end');assert.equal(result.stage,'awaiting_both');assert.equal(result.agentResults.q1?.correctAnswer,null);assert.ok(result.agentResults.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_INCOMPLETE'));
});

test('reviewer forwards a low-confidence generated answer in the pending-review payload', async () => {
 const graph=createQuestionReviewerGraph({contextProvider:{load:async()=>({text:'',images:[]})},client:{createStructuredChatCompletion:async<T>()=>({answerLabel:'A',foundInSource:false,evidence:'A é a melhor opção pelo enunciado.',confidence:0.3,unresolvedReason:'Contexto limitado.'} as T)}});
 const result=await graph.invoke(createQuestionGraphInput({executionId:'run-low-confidence',documentId:'doc-1',documentVersion:'v1',model:'deepseek/test',promptVersion:'p1',contextRefs:{chunkIds:[],pageNumbers:[],formulaEvidenceRefs:[],imageAssetIds:[]},candidates:[{id:'q-low',number:'01',statement:'Enunciado',alternatives:['A','B','C','D','E'].map(label=>({label,text:`Opção ${label}`})),correctAnswer:null,sourceChunkIds:[]}]}));
 const [backendQuestion]=result.backendOutput;
 assert.equal(backendQuestion?.correctAnswer,'A');assert.equal(backendQuestion?.answerGenerated,true);
 assert.ok(backendQuestion?.pendingIssues.includes('ANSWER_LOW_CONFIDENCE'));
 assert.ok(backendQuestion?.pendingIssues.includes('ANSWER_CONTEXT_INSUFFICIENT'));
 assert.equal(backendQuestion?.needsReview,true);assert.equal(backendQuestion?.status,'PENDING_REVIEW');
});
