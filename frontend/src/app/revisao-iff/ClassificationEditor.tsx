'use client';

import { useMemo, useState } from 'react';
import { getApiUrl } from '@/shared/utils/env';

export type Competency = { id: string; subject: string; topic: string; code: string; description: string; matrix: string };
type Question = { id: string; subject: string; topic: string | null; competence_ids: string[] };
type Result = { id: string; topic: string | null; competence_ids: string[] };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const topicName = (value: string) => value.replace(/^(?:Tópico|Topico|Tema)\s*\d+\s*[–—-]\s*/i, '').trim();
const normalizeTopic = (value: string) => normalize(value).replace(/^(topico|tema)\s*\d+\s*[–—-]\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function ClassificationEditor({question, competencies, catalogError, onSaved}: {question: Question; competencies: Competency[]; catalogError: boolean; onSaved: (result: Result) => void}) {
  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState(question.topic ?? '');
  const [selected, setSelected] = useState<string[]>(question.competence_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const available = useMemo(() => competencies.filter(c => c.matrix === 'INTEGRADO' && normalize(c.subject) === normalize(question.subject)), [competencies, question.subject]);
  const topics = useMemo(() => Array.from(new Set(available.map(c => c.topic))).sort((a,b) => a.localeCompare(b,'pt-BR')), [available]);
  const matchingTopic = topics.find(item => normalizeTopic(item) === normalizeTopic(topic));
  const visibleCompetencies = available.filter(c => matchingTopic && c.topic === matchingTopic);
  const hiddenSelected = selected.filter(id => !visibleCompetencies.some(c => c.id === id)).length;
  const selectedItems = selected.map(id => competencies.find(c => c.id === id)).filter((c): c is Competency => Boolean(c));
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const cancel = () => { setTopic(question.topic ?? ''); setSelected(question.competence_ids ?? []); setError(''); setEditing(false); };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/public-review/iff/${question.id}/classification`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({topic:topic ? topicName(topic) : null, competenceIds:selected})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a classificação.');
      onSaved(result as Result); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a classificação.'); }
    finally { setSaving(false); }
  };
  return <section className="iff-classification" aria-label="Classificação da questão">
    <div className="iff-edit-header"><h3 className="iff-section-title">TÓPICO E COMPETÊNCIAS</h3>{!editing && <button type="button" className="iff-edit-button" onClick={()=>{setTopic(question.topic ?? '');setSelected(question.competence_ids ?? []);setEditing(true)}} disabled={catalogError || !available.length}>Editar classificação</button>}</div>
    {catalogError ? <p className="iff-error" role="alert">Não foi possível carregar as competências. Atualize a página.</p> : !available.length ? <p className="iff-classification-empty">Nenhuma competência encontrada para esta matéria.</p> : editing ? <>
      <label className="iff-edit-label">Tópico da questão<select value={topic} onChange={e=>setTopic(e.target.value)}><option value="">Não informado</option>{topic && !topics.includes(topic) && <option value={topic}>{topic} (atual)</option>}{topics.map(item=><option key={item} value={item}>{topicName(item)}</option>)}</select></label>
      <fieldset className="iff-competency-fieldset"><legend>Competências da questão</legend><p>Selecione as competências relacionadas ao tópico escolhido.</p>{hiddenSelected > 0 && <p>{hiddenSelected} competência(s) de outros tópicos permanecem selecionadas.</p>}<div className="iff-competency-options">{visibleCompetencies.length === 0 && <p>Selecione um tópico do edital para ver as competências.</p>}{visibleCompetencies.map(c=><label className="iff-competency-option" key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>toggle(c.id)}/><span><strong>{c.code}</strong> — {c.description}<small>{topicName(c.topic)}</small></span></label>)}</div></fieldset>
      {error && <p className="iff-error" role="alert">{error}</p>}<div className="iff-actions"><button type="button" className="iff-reject" disabled={saving} onClick={cancel}>Cancelar</button><button type="button" className="iff-approve" disabled={saving} onClick={save}>{saving?'Salvando…':'Salvar classificação'}</button></div>
    </> : <><p className="iff-classification-topic"><strong>Tópico:</strong> {question.topic || 'Não informado'}</p>{selectedItems.length ? <ul className="iff-competency-list">{selectedItems.map(c=><li key={c.id}><strong>{c.code}</strong> — {c.description}<small>{topicName(c.topic)}</small></li>)}</ul> : <p className="iff-classification-empty">Nenhuma competência atribuída.</p>}</>}
  </section>;
}
