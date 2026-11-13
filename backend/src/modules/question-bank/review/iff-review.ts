import { z } from 'zod';
import { computeQuestionContentHash, htmlToPlainText } from '../services/question-bank-content.service.js';

const schema=z.object({statement:z.string().trim().min(1).max(50000),alternatives:z.array(z.string().trim().min(1).max(20000)).length(5),correctAnswer:z.enum(['A','B','C','D','E'])}).strict();
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function editorTextFromHtml(html:string, urls:string[]):string {
 let index=0;
 const marked=html.replace(/<img\b[^>]*>/gi,()=>`\n\n[[imagem:${++index}]]\n\n`);
 if(index!==urls.length)throw Error('As imagens do enunciado não coincidem com os anexos.');
 return htmlToPlainText(marked).replace(/\n{3,}/g,'\n\n').trim();
}
export function buildEditedContent(input:unknown, urls:string[],subject:string,topic:string|null) {
 const data=schema.parse(input); const found=[...data.statement.matchAll(/\[\[imagem:(\d+)\]\]/g)].map(m=>Number(m[1]));
 if(found.length!==urls.length||found.some((n,i)=>n!==i+1)) throw Error('Mantenha cada marcador de imagem uma vez e na ordem original.');
 if(urls.some(url=>!/^https?:\/\//i.test(url)))throw Error('URL de imagem inválida.');
 let statementHtml='';let last=0;for(const match of data.statement.matchAll(/\[\[imagem:(\d+)\]\]/g)){let before=data.statement.slice(last,match.index);if(before.trim())statementHtml+=`<p>${escape(before.trim()).replace(/\n/g,'<br>')}</p>`;statementHtml+=`<p><img src="${escape(urls[Number(match[1])-1]!)}"></p>`;last=match.index!+match[0].length}let rest=data.statement.slice(last);if(rest.trim())statementHtml+=`<p>${escape(rest.trim()).replace(/\n/g,'<br>')}</p>`;
 const statementText=data.statement.replace(/\[\[imagem:\d+\]\]/g,'').replace(/\n{3,}/g,'\n\n').trim();if(!statementText)throw Error('O enunciado é obrigatório.');
 const alternatives=data.alternatives.map((text,i)=>({providerId:null,label:'ABCDE'[i]!,text,isCorrect:'ABCDE'[i]===data.correctAnswer,html:`<p>${escape(text).replace(/\n/g,'<br>')}</p>`}));
 const contentHash=computeQuestionContentHash({provider:'MANUAL',providerQuestionId:'',subject,topic,statementText,alternatives:alternatives.map(({label,text})=>({label,text})),correctAnswer:data.correctAnswer});
 return {statementText,statementHtml,alternatives,correctAnswer:data.correctAnswer,contentHash};
}
