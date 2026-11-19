import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HEX_COLOR_REGEX,
  hexToHsv,
  hsvToHex,
  isValidHex,
  normalizeHex,
} from './task-colors.ts';

export interface AdvancedColorPickerProps {
  initialColor?: string | null;
  onApply: (color: string) => void;
  onCancel: () => void;
}

export function AdvancedColorPicker({
  initialColor,
  onApply,
  onCancel,
}: AdvancedColorPickerProps) {
  const startHex = initialColor && isValidHex(initialColor) ? normalizeHex(initialColor) : '#38bdf8';
  // Inicializa HSV com base na cor inicial ou fallback para azul suave (#38bdf8)
  const [hsv, setHsv] = useState(() => hexToHsv(startHex));
  const [inputHex, setInputHex] = useState(startHex.toUpperCase());

  const satValRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSatVal = useRef(false);
  const isDraggingHue = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const normalizedInput = inputHex.startsWith('#') ? inputHex : `#${inputHex}`;
  const validHex = isValidHex(normalizedInput) ? normalizeHex(normalizedInput) : null;
  const displayHex = validHex || currentHex;

  // Manipulação da área 2D Saturação/Brilho
  const updateSatValFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!satValRef.current) return;
    const rect = satValRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const s = (x / rect.width) * 100;
    const v = (1 - y / rect.height) * 100;

    setHsv((prev) => {
      const next = { ...prev, s, v };
      setInputHex(hsvToHex(next.h, next.s, next.v).toUpperCase());
      return next;
    });
  }, []);

  // Manipulação da barra de Matiz (Hue)
  const updateHueFromPointer = useCallback((clientX: number) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const h = Math.round((x / rect.width) * 360) % 360;

    setHsv((prev) => {
      const next = { ...prev, h };
      setInputHex(hsvToHex(next.h, next.s, next.v).toUpperCase());
      return next;
    });
  }, []);

  // Listeners globais de arrasto com isolamento total de eventos do Kanban
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isDraggingSatVal.current) {
        e.preventDefault();
        e.stopPropagation();
        updateSatValFromPointer(e.clientX, e.clientY);
      } else if (isDraggingHue.current) {
        e.preventDefault();
        e.stopPropagation();
        updateHueFromPointer(e.clientX);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingSatVal.current || isDraggingHue.current) {
        e.preventDefault();
        e.stopPropagation();
        isDraggingSatVal.current = false;
        isDraggingHue.current = false;
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [updateSatValFromPointer, updateHueFromPointer]);

  // Tecla Escape para cancelar e isolamento de atalhos
  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setInputHex(val);

    const formatted = val.startsWith('#') ? val : `#${val}`;
    if (isValidHex(formatted)) {
      const normalized = normalizeHex(formatted);
      const newHsv = hexToHsv(normalized);
      setHsv(newHsv);
    }
  };

  const handleInputBlur = () => {
    // Ao perder o foco, se o valor digitado for inválido, restaura o hex atual
    if (!isValidHex(inputHex.startsWith('#') ? inputHex : `#${inputHex}`)) {
      setInputHex(currentHex.toUpperCase());
    }
  };

  const handleApply = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const formatted = inputHex.startsWith('#') ? inputHex : `#${inputHex}`;
    const finalHex = isValidHex(formatted) ? normalizeHex(formatted) : currentHex;
    onApply(finalHex);
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Paleta avançada de cores"
      className="w-[270px] select-none rounded-xl border border-border bg-white p-3 text-left shadow-2xl transition"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">Paleta Personalizada</span>
        <span className="text-[11px] text-muted font-mono">{displayHex.toUpperCase()}</span>
      </div>

      {/* 1. Área 2D Saturação e Brilho */}
      <div
        ref={satValRef}
        aria-label="Seleção de saturação e brilho"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="relative h-28 w-full cursor-crosshair overflow-hidden rounded-lg border border-slate-300"
        style={{
          backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          isDraggingSatVal.current = true;
          updateSatValFromPointer(e.clientX, e.clientY);
        }}
      >
        {/* Gradiente branco horizontal (Saturação) */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, #ffffff, rgba(255, 255, 255, 0))',
          }}
        />
        {/* Gradiente preto vertical (Brilho / Valor) */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, #000000, rgba(0, 0, 0, 0))',
          }}
        />
        {/* Indicador de posição / Cursor */}
        <div
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* 2. Barra de Matiz (Hue Slider) */}
      <div className="mt-2.5">
        <div
          ref={hueRef}
          aria-label="Barra de tonalidade"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={360}
          tabIndex={0}
          className="relative h-3 w-full cursor-pointer rounded-full border border-slate-300"
          style={{
            background:
              'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            isDraggingHue.current = true;
            updateHueFromPointer(e.clientX);
          }}
        >
          {/* Indicador do Hue */}
          <div
            className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-400 bg-white shadow-sm pointer-events-none"
            style={{
              left: `${(hsv.h / 360) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* 3. Prévia da cor e campo HEX sincronizado */}
      <div className="mt-3 flex items-center gap-2">
        <div
          aria-label="Prévia da cor selecionada"
          className="size-8 shrink-0 rounded-lg border border-slate-300 shadow-inner transition-colors"
          style={{ backgroundColor: displayHex }}
        />
        <div className="relative flex-1">
          <input
            type="text"
            value={inputHex}
            maxLength={7}
            aria-label="Código hexadecimal da cor"
            placeholder="#RRGGBB"
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApply(e as unknown as React.MouseEvent);
              }
            }}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 transition focus:border-brand-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>
      </div>

      {/* 4. Botões de Ação */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={handleCancelClick}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="rounded-lg bg-brand-700 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-800 transition"
        >
          Aplicar cor
        </button>
      </div>
    </div>
  );
}
