import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskCard } from './task-ui.tsx';

afterEach(cleanup);

const sampleTask = (id = 'task-1', publicNumber = '42', title = 'Preparar relatório') => ({
  id,
  publicNumber,
  team: { name: 'Equipe SEAF' },
  cycle: {
    title,
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    deadlineAt: '2025-01-01T12:00:00.000Z',
    overdue: true,
    assignment: { user: { name: 'Maria Técnica' } },
  },
});

describe('cartão de tarefa (TaskCard)', () => {
  it('mostra identidade, prioridade e atraso sem criar status adicional', () => {
    const task = sampleTask();
    render(
      <MemoryRouter>
        <TaskCard task={task} />
      </MemoryRouter>,
    );
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText(/Atrasada/)).toBeInTheDocument();
    expect(screen.queryByText('Atrasada', { selector: '.status' })).not.toBeInTheDocument();
  });

  it('aplica cor padrão ao fundo quando nenhuma cor personalizada for informada', () => {
    const task = sampleTask();
    const { container } = render(
      <MemoryRouter>
        <TaskCard task={task} />
      </MemoryRouter>,
    );
    const card = container.querySelector('article');
    expect(card).toHaveClass('bg-white');
    expect(card).toHaveClass('border-border');
    expect(card?.style.backgroundColor).toBe('');
  });

  it('aplica a cor personalizada aprovada a todo o fundo do cartão com estilo e classes', () => {
    const task = sampleTask();
    const { container } = render(
      <MemoryRouter>
        <TaskCard task={task} color="blue" />
      </MemoryRouter>,
    );
    const card = container.querySelector('article');
    expect(card).toHaveClass('bg-sky-100/80');
    expect(card).toHaveClass('border-sky-300');
    expect(card?.style.backgroundColor).toBe('rgb(224, 242, 254)'); // #e0f2fe
  });

  it('abre o seletor compacto de cores ao clicar no botão de paleta', () => {
    const task = sampleTask();
    const onColorChange = vi.fn();
    render(
      <MemoryRouter>
        <TaskCard task={task} onColorChange={onColorChange} />
      </MemoryRouter>,
    );

    const paletteBtn = screen.getByRole('button', { name: 'Personalizar cor da tarefa #42' });
    expect(paletteBtn).toBeInTheDocument();

    // Clica para abrir o seletor
    fireEvent.click(paletteBtn);

    expect(screen.getByRole('dialog', { name: 'Paleta de cores do cartão' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar cor Azul' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar cor Verde-esmeralda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar cor Amarelo-âmbar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar cor Rosa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar cor Roxo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar cor Laranja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar cor Padrão' })).toBeInTheDocument();
  });

  it('seleciona uma cor e dispara o callback onColorChange sem navegar para os detalhes', () => {
    const task = sampleTask();
    const onColorChange = vi.fn();
    render(
      <MemoryRouter>
        <TaskCard task={task} onColorChange={onColorChange} />
      </MemoryRouter>,
    );

    const paletteBtn = screen.getByRole('button', { name: 'Personalizar cor da tarefa #42' });
    fireEvent.click(paletteBtn);

    const emeraldBtn = screen.getByRole('button', { name: 'Selecionar cor Verde-esmeralda' });
    fireEvent.click(emeraldBtn);

    expect(onColorChange).toHaveBeenCalledTimes(1);
    expect(onColorChange).toHaveBeenCalledWith('emerald');
  });

  it('permite restaurar a cor padrão através do botão "Restaurar cor padrão"', () => {
    const task = sampleTask();
    const onColorChange = vi.fn();
    render(
      <MemoryRouter>
        <TaskCard task={task} color="rose" onColorChange={onColorChange} />
      </MemoryRouter>,
    );

    const paletteBtn = screen.getByRole('button', { name: 'Personalizar cor da tarefa #42' });
    fireEvent.click(paletteBtn);

    const restoreBtn = screen.getByRole('button', { name: /Restaurar cor padrão/i });
    expect(restoreBtn).toBeInTheDocument();

    fireEvent.click(restoreBtn);

    expect(onColorChange).toHaveBeenCalledTimes(1);
    expect(onColorChange).toHaveBeenCalledWith(null);
  });

  it('fluxo completo de regressão: personaliza cor, mantém navegação intacta, recupera preferência e restaura padrão', () => {
    function TestHarness() {
      const [currentColor, setCurrentColor] = useState<string | null>(null);
      const location = useLocation();

      return (
        <div>
          <div data-testid="current-path">{location.pathname}</div>
          <TaskCard
            task={sampleTask('task-99', '99', 'Tarefa Existente')}
            color={currentColor ?? undefined}
            onColorChange={(color) => setCurrentColor(color)}
          />
        </div>
      );
    }

    const { container, rerender } = render(
      <MemoryRouter initialEntries={['/kanban']}>
        <TestHarness />
      </MemoryRouter>,
    );

    const card = container.querySelector('article');
    expect(card).toHaveClass('bg-white');
    expect(card?.style.backgroundColor).toBe('');

    // 1. Abre o seletor de cores
    const paletteBtn = screen.getByRole('button', { name: 'Personalizar cor da tarefa #99' });
    fireEvent.click(paletteBtn);
    expect(screen.getByRole('dialog', { name: 'Paleta de cores do cartão' })).toBeInTheDocument();

    // 2. Seleciona a cor Azul
    const blueBtn = screen.getByRole('button', { name: 'Selecionar cor Azul' });
    fireEvent.click(blueBtn);

    // 3. Fundo do cartão inteiro muda para azul imediatamente
    expect(card).toHaveClass('bg-sky-100/80');
    expect(card?.style.backgroundColor).toBe('rgb(224, 242, 254)'); // #e0f2fe

    // 4. Confirma que a seleção não navegou para a página de detalhes (permaneceu em /kanban)
    expect(screen.getByTestId('current-path')).toHaveTextContent('/kanban');

    // 5. Simula atualização da página com a preferência recuperada do backend (inicia com color='blue')
    rerender(
      <MemoryRouter initialEntries={['/kanban']}>
        <TaskCard
          task={sampleTask('task-99', '99', 'Tarefa Existente')}
          color="blue"
          onColorChange={() => {}}
        />
      </MemoryRouter>,
    );
    const refreshedCard = container.querySelector('article');
    expect(refreshedCard).toHaveClass('bg-sky-100/80');
    expect(refreshedCard?.style.backgroundColor).toBe('rgb(224, 242, 254)');

    // 6. Restaura a cor padrão
    const refreshedPaletteBtn = screen.getByRole('button', { name: 'Personalizar cor da tarefa #99' });
    fireEvent.click(refreshedPaletteBtn);

    // Re-renderiza com null (como ocorre após onColorChange(null))
    rerender(
      <MemoryRouter initialEntries={['/kanban']}>
        <TaskCard
          task={sampleTask('task-99', '99', 'Tarefa Existente')}
          color={undefined}
          onColorChange={() => {}}
        />
      </MemoryRouter>,
    );
    const restoredCard = container.querySelector('article');
    expect(restoredCard).toHaveClass('bg-white');
    expect(restoredCard?.style.backgroundColor).toBe('');
  });
});
