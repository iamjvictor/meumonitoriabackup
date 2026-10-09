export function FlashcardCard({ front, back, topic, children }: { front?: string; back?: string; topic?: string; children?: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div className="mb-3 flex items-center justify-between"><span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-900">{topic || 'Flashcard'}</span><span className="text-[10px] uppercase tracking-wider text-slate-400">Ficha de estudo</span></div><div className="grid gap-3 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><p className="mb-1 text-[10px] font-black uppercase text-slate-400">Frente</p><p className="text-sm font-bold text-slate-800">{front}</p></div><div className="rounded-xl bg-emerald-50/50 p-4"><p className="mb-1 text-[10px] font-black uppercase text-emerald-700">Verso</p><p className="text-sm text-slate-700">{back}</p></div></div>{children}</article>
  );
}
