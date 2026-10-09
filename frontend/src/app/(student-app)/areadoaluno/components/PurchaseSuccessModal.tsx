'use client';

import { CheckCircle2, X } from 'lucide-react';

type PurchaseSuccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onPractice: () => void;
};

export function PurchaseSuccessModal({ isOpen, onClose, onPractice }: PurchaseSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0F2942]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="purchase-success-title">
      <div className="relative w-full max-w-md rounded-[2rem] bg-[#FDFBF7] p-7 text-center shadow-2xl sm:p-9">
        <button type="button" onClick={onClose} aria-label="Fechar confirmação" className="absolute right-4 top-4 rounded-full p-2 text-[#5E6B73] transition hover:bg-[#EEE8DE]">
          <X size={18} />
        </button>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E6EFEA] text-[#2E6B59]">
          <CheckCircle2 size={36} strokeWidth={2.2} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[#2E6B59]">Pagamento confirmado</p>
        <h2 id="purchase-success-title" className="mt-2 font-serif text-3xl font-semibold text-[#0F2942]">Assinatura ativada!</h2>
        <p className="mt-4 text-sm leading-6 text-[#5E6B73]">Sua assinatura foi concluída com sucesso. Você já pode praticar e começar seus estudos.</p>

        <div className="mt-7 flex flex-col gap-3">
          <button type="button" onClick={onPractice} className="min-h-11 rounded-full bg-[#0F2942] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#183D5D]">
            Começar a praticar
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-6 py-3 text-sm font-semibold text-[#5E6B73] transition hover:bg-[#EEE8DE]">
            Continuar no painel
          </button>
        </div>
      </div>
    </div>
  );
}
