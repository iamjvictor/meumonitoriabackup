'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Download, ListFilter, Pencil, X } from 'lucide-react';
import { getApiUrl } from '@/shared/utils/env';
import './review.css';

type Alternative = { label: string; text: string; isCorrect: boolean };
type Question = { id: string; provider: string; provider_question_id: string; ano: number | null; numero: number | null; subject: string; topic: string | null; revisao_pendente?: boolean; posicao_imagens_pendente?: boolean; statement_html: string; statement_editor: string | null; alternatives: Alternative[]; correct_answer: string };
type Decision = 'aprovada' | 'recusada';
type Review = Record<string, { decisao: Decision; observacao?: string; atualizadoEm: string }>;
const storageKey = 'meumonitor-iff-review-v2';
const legacyKey = 'meumonitor-iff-2010-review-v1';

export default function RevisaoIffPage() {
  const [questions,setQuestions]=useState<Question[]>([]);
  const [reviews,setReviews]=useState<Review>({});
  const [active,setActive]=useState('');
  const [filter,setFilter]=useState('todas');
  const [year,setYear]=useState('todos');
  const [subject,setSubject]=useState('todas');
  const [editing,setEditing]=useState(false);
  const [draftStatement,setDraftStatement]=useState('');
  const [draftAlternatives,setDraftAlternatives]=useState<string[]>([]);
  const [draftAnswer,setDraftAnswer]=useState('A');
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    fetch(`${getApiUrl()}/api/v1/public-review/iff`).then(r=>{if(!r.ok)throw Error();return r.json()}).then((data:Question[])=>{
      setQuestions(data);setActive(data[0]?.id||'');
      try {
        const saved=JSON.parse(localStorage.getItem(storageKey)||'{}') as Review;
        const legacy=JSON.parse(localStorage.getItem(legacyKey)||'{}') as Review;
        for(const q of data){if(q.provider==='MANUAL'&&q.ano===2010&&q.numero!==null&&legacy[q.numero]&&!saved[q.id])saved[q.id]=legacy[q.numero];}
        localStorage.setItem(storageKey,JSON.stringify(saved));setReviews(saved);
      } catch { setError('Não foi possível carregar a revisão salva neste navegador.'); }
    }).catch(()=>setError('Não foi possível carregar as questões do banco. Atualize a página.')).finally(()=>setLoading(false));
  },[]);
  const years=useMemo(()=>Array.from(new Set(questions.map(q=>q.ano).filter((n):n is number=>n!==null))).sort((a,b)=>a-b),[questions]);
  const byYear=useMemo(()=>questions.filter(q=>year==='todos'||String(q.ano)===year),[questions,year]);
  const subjects=useMemo(()=>Array.from(new Set(byYear.map(q=>q.subject))).sort((a,b)=>a.localeCompare(b,'pt-BR')),[byYear]);
  const scoped=byYear.filter(q=>subject==='todas'||q.subject===subject);
  const filtered=scoped.filter(q=>filter==='todas'||(filter==='pendentes'?!reviews[q.id]:reviews[q.id]?.decisao===filter));
  const current=filtered.find(q=>q.id===active)||filtered[0];
  const currentIndex=current?filtered.findIndex(q=>q.id===current.id):-1;
  const approved=scoped.filter(q=>reviews[q.id]?.decisao==='aprovada').length;
  const rejected=scoped.filter(q=>reviews[q.id]?.decisao==='recusada').length;
  const select=(id:string)=>{setActive(id);setEditing(false);};
  const startEdit=()=>{if(!current||current.statement_editor===null)return;setDraftStatement(current.statement_editor);setDraftAlternatives(current.alternatives.map(a=>a.text));setDraftAnswer(current.correct_answer);setEditing(true);setError('');};
  const saveEdit=async()=>{if(!current)return;setSaving(true);setError('');try{const response=await fetch(`${getApiUrl()}/api/v1/public-review/iff/${current.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({statement:draftStatement,alternatives:draftAlternatives,correctAnswer:draftAnswer})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível salvar.');setQuestions(all=>all.map(q=>q.id===current.id?{...q,...result}:q));setEditing(false);}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setSaving(false)}};
  const decide=(decision:Decision)=>{if(!current)return;const next={...reviews,[current.id]:{decisao:decision,atualizadoEm:new Date().toISOString()}};try{localStorage.setItem(storageKey,JSON.stringify(next));setReviews(next);setError('');}catch{setError('Não foi possível salvar a decisão neste navegador.');}};
  const download=()=>{const blob=new Blob([JSON.stringify({revisao:reviews},null,2)],{type:'application/json'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download='revisao-iff.json';a.click();URL.revokeObjectURL(href)};
  const number=(q:Question)=>q.numero===null?q.provider_question_id:String(q.numero).padStart(2,'0');
  return <main className="iff-review">
    <header className="iff-top"><div className="iff-top-inner"><div className="iff-brand"><span className="iff-brand-mark">M</span><span>MeuMonitor<span className="iff-brand-light"> / Revisão de questões</span></span></div><span className="iff-access">Acesso público</span></div></header>
    <div className="iff-wrap"><div className="iff-heading"><div><div className="iff-eyebrow">BANCO DE QUESTÕES <span> / </span> IFF</div><h1>Revisão das provas do IFF</h1><p>Confira o enunciado, as imagens e o gabarito de cada questão.</p></div><button className="iff-export" onClick={download}><Download size={16}/> Exportar revisão</button></div>
      <div className="iff-progress"><div className="iff-progress-copy"><span>Progresso da revisão</span><strong>{approved+rejected} <small>/ {scoped.length} questões</small></strong></div><div className="iff-progress-line"><span style={{width:`${scoped.length?(approved+rejected)/scoped.length*100:0}%`}}/></div><div className="iff-totals"><span><i className="iff-dot approved"/> {approved} aprovadas</span><span><i className="iff-dot rejected"/> {rejected} recusadas</span><span><i className="iff-dot pending"/> {scoped.length-approved-rejected} pendentes</span></div></div>
      {error&&<p role="alert" className="iff-error">{error}</p>}
      <div className="iff-layout"><aside className="iff-sidebar"><div className="iff-side-title"><div><span>NAVEGAÇÃO</span><h2>Questões</h2></div><ListFilter size={18}/></div><div className="iff-filter-group"><label className="iff-field">Ano da prova<select value={year} onChange={e=>{setYear(e.target.value);setSubject('todas');setFilter('todas');setEditing(false)}}><option value="todos">Todos os anos</option>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><label className="iff-field">Matéria<select value={subject} onChange={e=>{setSubject(e.target.value);setFilter('todas');setEditing(false)}}><option value="todas">Todas as matérias</option>{subjects.map(name=><option key={name} value={name}>{name}</option>)}</select></label></div><label className="iff-filter"><span className="sr-only">Filtrar questões por situação</span><select value={filter} onChange={e=>{setFilter(e.target.value);setEditing(false)}}><option value="todas">Todas as questões</option><option value="pendentes">Pendentes</option><option value="aprovada">Aprovadas</option><option value="recusada">Recusadas</option></select></label><div className="iff-question-grid">{filtered.map(q=><button key={q.id} onClick={()=>select(q.id)} aria-label={`Questão ${number(q)}, ${q.ano??'ano não informado'}, ${reviews[q.id]?.decisao||'pendente'}`} aria-current={current?.id===q.id?'true':undefined} className={`iff-number ${current?.id===q.id?'active':''} ${reviews[q.id]?.decisao||''}`}>{number(q)}</button>)}</div>{!loading&&filtered.length===0&&<p className="iff-empty">Nenhuma questão encontrada para estes filtros.</p>}<p className="iff-sidebar-note">As decisões são salvas neste navegador. Exporte o arquivo para compartilhá-las.</p></aside>
      {current?<article className="iff-paper"><div className="iff-paper-head"><div><span className="iff-paper-label">QUESTÃO {number(current)} <span> / {current.ano??'ANO NÃO INFORMADO'}</span></span><h2>{current.subject}</h2><p>{current.topic}</p></div><span className={`iff-status ${reviews[current.id]?.decisao||'pendente'}`}>{reviews[current.id]?.decisao==='aprovada'?<CheckCircle2 size={14}/>:reviews[current.id]?.decisao==='recusada'?<X size={14}/>:<Circle size={14}/>} {reviews[current.id]?.decisao==='aprovada'?'Aprovada':reviews[current.id]?.decisao==='recusada'?'Recusada':'Pendente'}</span></div>
      <div className="iff-paper-body">{current.posicao_imagens_pendente&&<p className="iff-review-alert">As imagens foram anexadas ao final do enunciado. Confira a posição delas no PDF antes de aprovar.</p>}<div className="iff-edit-header"><div className="iff-section-title">ENUNCIADO</div>{!editing&&current.provider==='MANUAL'&&current.statement_editor!==null&&'ABCDE'.includes(current.correct_answer)&&current.correct_answer.length===1&&<button className="iff-edit-button" onClick={startEdit}><Pencil size={15}/> Editar questão</button>}</div>{editing?<><label className="iff-edit-label" htmlFor="edit-statement">Enunciado</label><textarea id="edit-statement" rows={12} value={draftStatement} onChange={e=>setDraftStatement(e.target.value)}/><p className="iff-note-help">Mantenha os marcadores [[imagem:1]] na posição desejada para preservar as figuras.</p></>:<div className="iff-statement" dangerouslySetInnerHTML={{__html:current.statement_html}}/>}<div className="iff-section-title iff-alts-title">ALTERNATIVAS <span>Gabarito oficial: {current.correct_answer}</span></div>{editing?<div className="iff-edit-alts">{draftAlternatives.map((text,i)=><label className="iff-edit-label" key={i}>Alternativa {'ABCDE'[i]}<textarea rows={2} value={text} onChange={e=>setDraftAlternatives(all=>all.map((v,j)=>i===j?e.target.value:v))}/></label>)}<label className="iff-edit-label">Gabarito<select value={draftAnswer} onChange={e=>setDraftAnswer(e.target.value)}>{'ABCDE'.split('').map(a=><option key={a}>{a}</option>)}</select></label><div className="iff-actions"><button className="iff-reject" onClick={()=>setEditing(false)} disabled={saving}>Cancelar</button><button className="iff-approve" onClick={saveEdit} disabled={saving}>{saving?'Salvando…':'Salvar alterações'}</button></div></div>:<div className="iff-alternatives">{current.alternatives.map(a=><div key={a.label} className={`iff-alternative ${a.isCorrect?'correct':''}`}><span className="iff-letter">{a.label}</span><span>{a.text}</span>{a.isCorrect&&<Check size={17} className="iff-correct-icon"/>}</div>)}</div>}<div className="iff-actions"><button disabled={editing} className="iff-reject" onClick={()=>decide('recusada')}><X size={17}/> Recusar questão</button><button disabled={editing} className="iff-approve" onClick={()=>decide('aprovada')}><Check size={17}/> Aprovar questão</button></div></div>
      <footer className="iff-footer"><button disabled={currentIndex<=0} onClick={()=>select(filtered[currentIndex-1].id)}><ArrowLeft size={16}/> Anterior</button><span>{currentIndex+1} / {filtered.length}</span><button disabled={currentIndex>=filtered.length-1} onClick={()=>select(filtered[currentIndex+1].id)}>Próxima <ArrowRight size={16}/></button></footer></article>:<div className="iff-loading">{loading?'Carregando questões…':'Nenhuma questão selecionada.'}</div>}</div></div>
  </main>;
}
