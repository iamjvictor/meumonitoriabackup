export function MonitorTabs({ active, tabs, onChange }: { active: string; tabs: [string, string][]; onChange: (tab: string) => void }) {
  return (
      <nav aria-label="Abas do monitor" data-active-tab={active} className="flex min-w-0 overflow-x-auto border-b border-slate-200 bg-white">{tabs.map(([id,label]) => <button key={id} type="button" onClick={() => onChange(id)} className={`min-h-11 shrink-0 border-b-2 px-4 py-3 text-sm font-bold md:px-5 ${active === id ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-slate-500'}`}>{label}</button>)}</nav>
  );
}
