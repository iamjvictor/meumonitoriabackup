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
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-white shadow-sm transition cursor-pointer ${
        isAttached
          ? 'bg-[#2E5B37] ring-2 ring-[#76D69B]'
          : 'bg-[#0F2942] hover:bg-[#1C466D]'
      }`}
    >
      <Sparkles className="h-4 w-4" />
      <span>{isAttached ? 'Contexto anexado ao chat ✓' : 'Tirar dúvida com IA'}</span>
    </button>
  );
}
