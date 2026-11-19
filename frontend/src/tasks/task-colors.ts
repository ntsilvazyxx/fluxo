export const CARD_COLORS = {
  default: {
    id: 'default',
    label: 'Padrão',
    bgClass: 'bg-white',
    borderClass: 'border-border',
    hoverBorderClass: 'hover:border-brand-700',
    swatchBg: '#ffffff',
    swatchBorder: '#cbd5e1',
    bgColor: '#ffffff',
    borderColor: '#dce3ef',
  },
  blue: {
    id: 'blue',
    label: 'Azul',
    bgClass: 'bg-sky-100/80',
    borderClass: 'border-sky-300',
    hoverBorderClass: 'hover:border-sky-400',
    swatchBg: '#bae6fd',
    swatchBorder: '#7dd3fc',
    bgColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  emerald: {
    id: 'emerald',
    label: 'Verde-esmeralda',
    bgClass: 'bg-emerald-100/80',
    borderClass: 'border-emerald-300',
    hoverBorderClass: 'hover:border-emerald-400',
    swatchBg: '#a7f3d0',
    swatchBorder: '#6ee7b7',
    bgColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  amber: {
    id: 'amber',
    label: 'Amarelo-âmbar',
    bgClass: 'bg-amber-100/80',
    borderClass: 'border-amber-300',
    hoverBorderClass: 'hover:border-amber-400',
    swatchBg: '#fde68a',
    swatchBorder: '#fcd34d',
    bgColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  rose: {
    id: 'rose',
    label: 'Rosa',
    bgClass: 'bg-rose-100/80',
    borderClass: 'border-rose-300',
    hoverBorderClass: 'hover:border-rose-400',
    swatchBg: '#fecdd3',
    swatchBorder: '#fda4af',
    bgColor: '#ffe4e6',
    borderColor: '#fecdd3',
  },
  purple: {
    id: 'purple',
    label: 'Roxo',
    bgClass: 'bg-purple-100/80',
    borderClass: 'border-purple-300',
    hoverBorderClass: 'hover:border-purple-400',
    swatchBg: '#e9d5ff',
    swatchBorder: '#d8b4fe',
    bgColor: '#f3e8ff',
    borderColor: '#e9d5ff',
  },
  orange: {
    id: 'orange',
    label: 'Laranja',
    bgClass: 'bg-orange-100/80',
    borderClass: 'border-orange-300',
    hoverBorderClass: 'hover:border-orange-400',
    swatchBg: '#fed7aa',
    swatchBorder: '#fdba74',
    bgColor: '#ffedd5',
    borderColor: '#fed7aa',
  },
} as const;

export type CardColorKey = keyof typeof CARD_COLORS;

export const COLOR_OPTIONS = Object.values(CARD_COLORS);

// ==========================================
// Utilitários Matemáticos de Conversão de Cor
// ==========================================

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidHex(hex: string): boolean {
  return HEX_COLOR_REGEX.test(hex.trim());
}

export function normalizeHex(hex: string): string {
  const clean = hex.trim().toLowerCase();
  if (!HEX_COLOR_REGEX.test(clean)) return '#ffffff';
  if (clean.length === 4) {
    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSV {
  h: number; // 0 a 360
  s: number; // 0 a 100
  v: number; // 0 a 100
}

export function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const toHex = (c: number) => clamp(c).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  let h = 0;
  if (diff === 0) {
    h = 0;
  } else if (max === rNorm) {
    h = ((gNorm - bNorm) / diff) % 6;
  } else if (max === gNorm) {
    h = (bNorm - rNorm) / diff + 2;
  } else {
    h = (rNorm - gNorm) / diff + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : (diff / max) * 100;
  const v = max * 100;

  return { h, s, v };
}

export function hexToHsv(hex: string): HSV {
  const rgb = hexToRgb(hex);
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const vNorm = Math.max(0, Math.min(100, v)) / 100;
  const hMod = ((h % 360) + 360) % 360;

  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((hMod / 60) % 2) - 1));
  const m = vNorm - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hMod < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hMod < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hMod < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hMod < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hMod < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const rgb = hsvToRgb(h, s, v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// Cálculo de Luminância Relativa (WCAG)
export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linearize = (val: number) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// Define se uma cor precisa de contraste escuro ou claro (Luminância limiar de 0.45)
export function isDarkColor(color?: string | null): boolean {
  if (!color || color === 'default') return false;
  if (color in CARD_COLORS) return false;
  if (!isValidHex(color)) return false;
  return getLuminance(color) < 0.45;
}

// Retorna uma cor de borda proporcionalmente ajustada ao fundo personalizado
export function getBorderColorForHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const dark = isDarkColor(hex);
  if (dark) {
    // Para fundos escuros, borda ligeiramente mais clara
    return rgbToHex(Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40));
  }
  // Para fundos claros, borda ligeiramente mais escura
  return rgbToHex(Math.max(0, r - 35), Math.max(0, g - 35), Math.max(0, b - 35));
}

// Configuração unificada de cores e contraste do cartão
export function getCardColorConfig(color?: string | null) {
  const isPreset = Boolean(color && color in CARD_COLORS);
  const isCustom = Boolean(color && isValidHex(color) && !isPreset);
  const dark = isDarkColor(color);

  if (isPreset && color && color in CARD_COLORS) {
    const preset = CARD_COLORS[color as CardColorKey];
    return {
      isPreset: true,
      isCustom: false,
      isDark: false,
      bgClass: preset.bgClass,
      borderClass: preset.borderClass,
      hoverBorderClass: preset.hoverBorderClass,
      bgColor: preset.bgColor,
      borderColor: preset.borderColor,
      style: { backgroundColor: preset.bgColor, borderColor: preset.borderColor },
      textClass: 'text-text',
      mutedClass: 'text-muted',
      numberClass: 'text-brand-700',
      actionIconClass: 'text-muted hover:text-text hover:bg-black/5',
    };
  }

  if (isCustom && color) {
    const normalized = normalizeHex(color);
    const borderColor = getBorderColorForHex(normalized);
    return {
      isPreset: false,
      isCustom: true,
      isDark: dark,
      bgClass: '',
      borderClass: '',
      hoverBorderClass: '',
      bgColor: normalized,
      borderColor,
      style: { backgroundColor: normalized, borderColor },
      textClass: dark ? 'text-white' : 'text-text',
      mutedClass: dark ? 'text-white/80' : 'text-muted',
      numberClass: dark ? 'text-sky-300' : 'text-brand-700',
      actionIconClass: dark ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-muted hover:text-text hover:bg-black/5',
    };
  }

  const def = CARD_COLORS.default;
  return {
    isPreset: false,
    isCustom: false,
    isDark: false,
    bgClass: def.bgClass,
    borderClass: def.borderClass,
    hoverBorderClass: def.hoverBorderClass,
    bgColor: def.bgColor,
    borderColor: def.borderColor,
    style: undefined,
    textClass: 'text-text',
    mutedClass: 'text-muted',
    numberClass: 'text-brand-700',
    actionIconClass: 'text-muted hover:text-text hover:bg-black/5',
  };
}
