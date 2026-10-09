import { Sparkles } from 'lucide-react';

interface AskAiContextButtonProps {
  onClick: () => void;
  isAttached?: boolean;
}

export function AskAiContextButton({ onClick, isAttached = false }: AskAiContextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#1C466D]"
    >
      <Sparkles className="h-4 w-4" />
      <span>{isAttached ? 'Contexto anexado ao chat' : 'Tirar dúvida com IA'}</span>
    </button>
  );
}
