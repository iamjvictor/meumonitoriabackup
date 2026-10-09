export function QuestionUploadZone({ accept = '.pdf,.doc,.docx,.txt', disabled, onSelect, label }: { accept?: string; disabled?: boolean; onSelect?: (file: File) => void; label: string }) {
  return (
    <label role="region" aria-label="Upload de questões" className="block cursor-pointer rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/30 p-6 text-sm font-semibold text-emerald-900">{label}<input className="sr-only" type="file" accept={accept} disabled={disabled} onChange={(e) => { const file = e.target.files?.[0]; if (file) onSelect?.(file); }} /></label>
  );
}
