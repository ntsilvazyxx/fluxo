import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdvancedColorPicker } from './AdvancedColorPicker.tsx';
import {
  getCardColorConfig,
  getLuminance,
  hexToHsv,
  hsvToHex,
  isDarkColor,
  isValidHex,
  normalizeHex,
} from './task-colors.ts';

describe('AdvancedColorPicker and Color Mathematics', () => {
  afterEach(() => {
    cleanup();
  });
  it('valida expressões hexadecimais corretamente', () => {
    expect(isValidHex('#fff')).toBe(true);
    expect(isValidHex('#ffffff')).toBe(true);
    expect(isValidHex('#1a3281')).toBe(true);
    expect(isValidHex('#XYZ123')).toBe(false);
    expect(isValidHex('123456')).toBe(false);
    expect(isValidHex('#12')).toBe(false);
  });

  it('normaliza cores hexadecimais curtas para 6 dígitos', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex('#1A3281')).toBe('#1a3281');
  });

  it('converte bidirecionalmente HSV <-> HEX com precisão', () => {
    const redHsv = hexToHsv('#ff0000');
    expect(redHsv.h).toBe(0);
    expect(redHsv.s).toBe(100);
    expect(redHsv.v).toBe(100);
    expect(hsvToHex(0, 100, 100)).toBe('#ff0000');

    const blueHsv = hexToHsv('#0000ff');
    expect(blueHsv.h).toBe(240);
    expect(blueHsv.s).toBe(100);
    expect(blueHsv.v).toBe(100);
    expect(hsvToHex(240, 100, 100)).toBe('#0000ff');
  });

  it('calcula luminância relativa e identifica cores claras e escuras (WCAG)', () => {
    // Branco = 1.0 (claro)
    expect(getLuminance('#ffffff')).toBeCloseTo(1.0, 1);
    expect(isDarkColor('#ffffff')).toBe(false);

    // Azul institucional SEAF #1a3281 = escuro
    expect(getLuminance('#1a3281')).toBeLessThan(0.45);
    expect(isDarkColor('#1a3281')).toBe(true);

    // Preto = 0.0 (escuro)
    expect(isDarkColor('#000000')).toBe(true);

    // Amarelo pastel = claro
    expect(isDarkColor('#fef3c7')).toBe(false);
  });

  it('gera configurações de contraste adequadas para o cartão conforme o fundo', () => {
    // Cor escura: texto branco e número em destaque claro
    const darkConfig = getCardColorConfig('#1e293b');
    expect(darkConfig.isCustom).toBe(true);
    expect(darkConfig.isDark).toBe(true);
    expect(darkConfig.textClass).toBe('text-white');
    expect(darkConfig.mutedClass).toBe('text-white/80');
    expect(darkConfig.numberClass).toBe('text-sky-300');

    // Cor clara: texto escuro padrão
    const lightConfig = getCardColorConfig('#f1f5f9');
    expect(lightConfig.isCustom).toBe(true);
    expect(lightConfig.isDark).toBe(false);
    expect(lightConfig.textClass).toBe('text-text');
    expect(lightConfig.mutedClass).toBe('text-muted');
  });

  it('renderiza o componente AdvancedColorPicker com todos os elementos obrigatórios', () => {
    const handleApply = vi.fn();
    const handleCancel = vi.fn();

    render(
      <AdvancedColorPicker
        initialColor="#38bdf8"
        onApply={handleApply}
        onCancel={handleCancel}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Paleta avançada de cores' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seleção de saturação e brilho' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Barra de tonalidade' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prévia da cor selecionada')).toBeInTheDocument();
    expect(screen.getByLabelText('Código hexadecimal da cor')).toHaveValue('#38BDF8');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar cor' })).toBeInTheDocument();
  });

  it('sincroniza digitação manual do campo HEX com a prévia da cor', () => {
    const handleApply = vi.fn();
    const handleCancel = vi.fn();

    render(
      <AdvancedColorPicker
        initialColor="#38bdf8"
        onApply={handleApply}
        onCancel={handleCancel}
      />,
    );

    const input = screen.getByLabelText('Código hexadecimal da cor');
    fireEvent.change(input, { target: { value: '#ff5722' } });
    expect(input).toHaveValue('#ff5722');

    const preview = screen.getByLabelText('Prévia da cor selecionada');
    expect(preview).toHaveStyle({ backgroundColor: '#ff5722' });
  });

  it('clique em "Aplicar cor" chama callback com a cor final formatada', () => {
    const handleApply = vi.fn();
    const handleCancel = vi.fn();

    render(
      <AdvancedColorPicker
        initialColor="#38bdf8"
        onApply={handleApply}
        onCancel={handleCancel}
      />,
    );

    const input = screen.getByLabelText('Código hexadecimal da cor');
    fireEvent.change(input, { target: { value: '#10b981' } });

    const applyBtn = screen.getByRole('button', { name: 'Aplicar cor' });
    fireEvent.click(applyBtn);

    expect(handleApply).toHaveBeenCalledWith('#10b981');
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('clique em "Cancelar" descarta as alterações sem chamar onApply', () => {
    const handleApply = vi.fn();
    const handleCancel = vi.fn();

    render(
      <AdvancedColorPicker
        initialColor="#38bdf8"
        onApply={handleApply}
        onCancel={handleCancel}
      />,
    );

    const input = screen.getByLabelText('Código hexadecimal da cor');
    fireEvent.change(input, { target: { value: '#10b981' } });

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelBtn);

    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleApply).not.toHaveBeenCalled();
  });

  it('tecla Escape dentro do diálogo aciona o cancelamento', () => {
    const handleApply = vi.fn();
    const handleCancel = vi.fn();

    render(
      <AdvancedColorPicker
        initialColor="#38bdf8"
        onApply={handleApply}
        onCancel={handleCancel}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Paleta avançada de cores' });
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleApply).not.toHaveBeenCalled();
  });
});
