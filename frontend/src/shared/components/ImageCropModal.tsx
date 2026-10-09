'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Crop, ZoomIn, ZoomOut, RotateCcw, Check, Sparkles } from 'lucide-react';

export interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  cropType: 'avatar' | 'banner';
  title?: string;
  onClose: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  cropType,
  title,
  onClose,
  onConfirm,
}) => {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 1, height: 1 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Configurações do tamanho da janela de corte na tela
  // Avatar: 220x220 circular (proporção 1:1)
  // Banner: 420x140 panorâmico (proporção 3:1)
  const isAvatar = cropType === 'avatar';
  const cropBoxWidth = isAvatar ? 220 : 390;
  const cropBoxHeight = isAvatar ? 220 : 130;

  // Tamanho de saída exportado pelo canvas
  const outputWidth = isAvatar ? 400 : 1200;
  const outputHeight = isAvatar ? 400 : 400;

  // Redefinir valores ao abrir uma nova imagem
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setImageLoaded(false);

      if (imageSrc) {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
          setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          setImageLoaded(true);
        };
      }
    }
  }, [isOpen, imageSrc, cropType]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch drag handlers para mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Escala base para cobrir o cropBox
  const baseScale = Math.max(
    cropBoxWidth / naturalDimensions.width,
    cropBoxHeight / naturalDimensions.height
  );

  const renderedWidth = naturalDimensions.width * baseScale * zoom;
  const renderedHeight = naturalDimensions.height * baseScale * zoom;

  // Confirmação e geração do Canvas de alta resolução
  const handleCropSave = () => {
    if (!imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      // Se for avatar, aplica o corte circular transparente para eliminar qualquer canto branco
      if (isAvatar) {
        ctx.beginPath();
        ctx.arc(outputWidth / 2, outputHeight / 2, outputWidth / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }

      // Proporção de escala entre o tamanho do box exibido e a resolução final
      const ratio = outputWidth / cropBoxWidth;

      const scaledW = renderedWidth * ratio;
      const scaledH = renderedHeight * ratio;

      const drawX = (outputWidth - scaledW) / 2 + offset.x * ratio;
      const drawY = (outputHeight - scaledH) / 2 + offset.y * ratio;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, drawX, drawY, scaledW, scaledH);

      const mimeType = isAvatar ? 'image/png' : 'image/jpeg';
      const quality = isAvatar ? undefined : 0.92;
      const croppedUrl = canvas.toDataURL(mimeType, quality);

      onConfirm(croppedUrl);
    };
  };

  if (!isOpen || !imageSrc) return null;

  const modalTitle = title || (isAvatar ? 'Ajustar Foto de Perfil' : 'Ajustar Capa da Página de Vendas');
  const modalDescription = isAvatar
    ? 'Arraste a foto e use o zoom para enquadrar perfeitamente seu rosto no formato circular.'
    : 'Arraste e ajuste o zoom para posicionar a foto no formato panorâmico que será exibido no topo da sua página.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden p-5 sm:p-6 space-y-4 sm:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2 text-[#0F2942]">
            <div className="p-2 rounded-xl bg-[#2E5B37]/10 text-[#2E5B37]">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-heading font-extrabold text-base text-[#0F2942]">{modalTitle}</h4>
              <p className="text-[11px] text-slate-500 font-medium">
                {isAvatar ? 'Formato 1:1 Redondo' : 'Formato Panorâmico 3:1 (1200×400px)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 text-center leading-relaxed">
          {modalDescription}
        </p>

        {/* Viewport Cropper Container */}
        <div className="relative w-full flex items-center justify-center overflow-hidden rounded-2xl bg-slate-950 border-2 border-slate-800 shadow-inner select-none h-[280px] sm:h-[300px]">
          {/* Overlay com máscara de recorte */}
          <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {imageLoaded && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageSrc}
                alt="Preview"
                draggable={false}
                className="absolute max-w-none transition-transform duration-75 pointer-events-none select-none"
                style={{
                  width: `${renderedWidth}px`,
                  height: `${renderedHeight}px`,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            )}

            {/* Máscara de corte visual */}
            {isAvatar ? (
              /* Recorte Circular para Avatar */
              <div
                className="pointer-events-none absolute rounded-full border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
                style={{
                  width: `${cropBoxWidth}px`,
                  height: `${cropBoxHeight}px`,
                }}
              >
                <div className="absolute inset-0 rounded-full border border-white/40" />
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-300 uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded-full">
                  Área do Perfil
                </span>
              </div>
            ) : (
              /* Recorte Panorâmico para Banner de Capa */
              <div
                className="pointer-events-none absolute rounded-xl border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
                style={{
                  width: `${cropBoxWidth}px`,
                  height: `${cropBoxHeight}px`,
                }}
              >
                <div className="absolute inset-0 rounded-xl border border-white/40" />
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-300 uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Capa da Página de Vendas
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Zoom Slider & Reset Controls */}
        <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
            <span className="flex items-center font-bold text-[#0F2942]">
              <ZoomIn className="w-4 h-4 mr-1 text-[#2E5B37]" /> Zoom da Imagem:
            </span>
            <span className="font-mono text-xs font-bold text-[#0F2942] bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
              {zoom.toFixed(1)}x
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(1, +(prev - 0.1).toFixed(2)))}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
              title="Diminuir zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-[#2E5B37] cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(3, +(prev + 0.1).toFixed(2)))}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Centralizar</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCropSave}
              className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-[#2E5B37] hover:bg-[#1B4332] transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-300" />
              <span>Confirmar Imagem</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
