import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditedContent, editorTextFromHtml } from './iff-review.js';
test('preserva posição das imagens e calcula conteúdo com alternativas corretas',()=>{
 const url='https://example.com/fig.png';
 const text=editorTextFromHtml('<p>Antes</p><p><img src="https://example.com/fig.png"></p><p>Depois</p>',[url]);
 assert.match(text,/Antes[\s\S]*\[\[imagem:1\]\][\s\S]*Depois/);
 const result=buildEditedContent({statement:text,alternatives:['um','dois','três','quatro','cinco'],correctAnswer:'B'},[url],'Matemática','Espaço e forma.');
 assert.ok(result.statementHtml.indexOf('Antes')<result.statementHtml.indexOf('<img'));assert.ok(result.statementHtml.indexOf('<img')<result.statementHtml.indexOf('Depois'));assert.equal(result.alternatives.filter(a=>a.isCorrect).length,1);assert.match(result.contentHash,/^[0-9a-f]{64}$/);
});
test('rejeita ausência ou duplicação de marcadores e alternativa vazia',()=>{
 const u=['https://example.com/a.png'];const base={statement:'Texto',alternatives:['a','b','c','d','e'],correctAnswer:'A'};
 assert.throws(()=>buildEditedContent(base,u,'A',null));
 assert.throws(()=>buildEditedContent({...base,statement:'[[imagem:1]] [[imagem:1]]'},u,'A',null));
 assert.throws(()=>buildEditedContent({...base,statement:'[[imagem:1]]',alternatives:['a','','c','d','e']},u,'A',null));
});
