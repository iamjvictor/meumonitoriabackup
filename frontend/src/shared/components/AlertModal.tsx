import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, Headphones, MessageCircle } from 'lucide-react';

export interface AlertOptions {
  title?: string;
  message: React.ReactNode;
  type?: 'error' | 'success' | 'warning' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  showSupport?: boolean;
  supportLink?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface AlertModalProps extends AlertOptions {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  confirmLabel = 'Entendi',
  cancelLabel = 'Cancelar',
  showCancel = false,
  showSupport = true,
  supportLink = 'https://wa.me/5522997892095?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20no%20MeuMonitor%20AI',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  const typeConfig = {
    error: {
      icon: <XCircle className="w-8 h-8 text-rose-600" />,
      bg: 'bg-rose-50',
      border: 'border-rose-200/80',
      titleColor: 'text-rose-950',
      btnBg: 'bg-rose-700 hover:bg-rose-800 text-white',
      defaultTitle: 'Atenção',
    },
    success: {
      icon: <CheckCircle2 className="w-8 h-8 text-[#2E5B37]" />,
      bg: 'bg-[#E3F1E4]',
      border: 'border-[#2E5B37]/20',
      titleColor: 'text-[#0F2942]',
      btnBg: 'bg-[#2E5B37] hover:bg-[#22472a] text-white',
      defaultTitle: 'Sucesso!',
    },
    warning: {
      icon: <AlertTriangle className="w-8 h-8 text-amber-600" />,
      bg: 'bg-amber-50',
      border: 'border-amber-200/80',
      titleColor: 'text-amber-950',
      btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
      defaultTitle: 'Aviso',
    },
    info: {
      icon: <Info className="w-8 h-8 text-[#0F2942]" />,
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      titleColor: 'text-[#0F2942]',
      btnBg: 'bg-[#0F2942] hover:bg-[#1C466D] text-white',
      defaultTitle: 'Informação',
    },
  };

  const config = typeConfig[type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#0F2942]/60 backdrop-blur-xs transition-opacity animate-in fade-in" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-[24px] bg-white p-6 text-left shadow-2xl transition-all border border-[#0F2942]/10 animate-in zoom-in-95">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon & Message */}
        <div className="flex flex-col items-center text-center mt-1">
          <div className={`p-3.5 rounded-2xl ${config.bg} ${config.border} border mb-3.5 flex items-center justify-center shadow-xs`}>
            {config.icon}
          </div>
          
          <h3 className={`text-lg font-heading font-extrabold leading-tight mb-2 ${config.titleColor}`}>
            {title || config.defaultTitle}
          </h3>
          
          <div className="text-xs text-slate-600 font-medium whitespace-pre-line leading-relaxed max-w-sm">
            {message}
          </div>
        </div>

        {/* Support Contact Box */}
        {showSupport && (
          <div className="mt-5 pt-3.5 border-t border-[#0F2942]/08 flex flex-col items-center bg-[#F8F5EE] rounded-2xl p-3.5 border border-[#0F2942]/05">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F2942]">
              <Headphones className="w-4 h-4 text-[#2E5B37]" />
              <span>Dúvidas ou problemas?</span>
            </div>
            <p className="text-[11px] text-slate-500 text-center mt-0.5 mb-2">
              Fale diretamente com a equipe de suporte do MeuMonitor AI.
            </p>
            <a
              href={supportLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#2E5B37]/30 text-xs font-bold text-[#2E5B37] hover:bg-[#E3F1E4] transition cursor-pointer shadow-xs"
            >
              <MessageCircle className="w-4 h-4 text-[#2E5B37]" />
              <span>Contato do Suporte via WhatsApp</span>
            </a>
          </div>
        )}

        {/* Confirm Button */}
        <div className={`mt-5 flex justify-center gap-2 ${showCancel ? 'flex-col-reverse sm:flex-row' : ''}`}>
          {showCancel && (
            <button
              type="button"
              onClick={() => {
                onCancel?.();
                onClose();
              }}
              className="w-full rounded-xl border border-[#0F2942]/15 bg-white py-3 text-xs font-extrabold uppercase tracking-wider text-[#0F2942] shadow-sm transition-all hover:bg-[#F8F5EE] cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={`w-full py-3 rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-sm transition-all cursor-pointer ${config.btnBg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
