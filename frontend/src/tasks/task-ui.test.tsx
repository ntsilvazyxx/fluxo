import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('dispara onSelect ao clicar no cartão e impede navegação', () => {
    const task = sampleTask('task-10', '10', 'Tarefa para Modal');
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <TaskCard task={task} onSelect={onSelect} />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Abrir tarefa #10: Tarefa para Modal' });
    fireEvent.click(link);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(task, expect.anything());
  });

  it('não dispara onSelect ao clicar no botão de paleta de cores', () => {
    const task = sampleTask('task-11', '11', 'Tarefa com Paleta');
    const onSelect = vi.fn();
    const onColorChange = vi.fn();
    render(
      <MemoryRouter>
        <TaskCard task={task} onSelect={onSelect} onColorChange={onColorChange} />
      </MemoryRouter>,
    );

    const paletteBtn = screen.getByRole('button', { name: 'Personalizar cor da tarefa #11' });
    fireEvent.click(paletteBtn);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Paleta de cores do cartão' })).toBeInTheDocument();
  });

  it('abre o pop-up compacto ao selecionar "Resumo da tarefa" no menu e exibe apenas as informações essenciais', () => {
    const task = sampleTask('task-12', '12', 'Elaborar Parecer Técnico');
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <TaskCard task={task} compact onSelect={onSelect} />
      </MemoryRouter>,
    );

    // Clica nos três pontinhos
    const menuSummary = screen.getByLabelText('Ações da tarefa #12');
    fireEvent.click(menuSummary);

    // Clica em "Resumo da tarefa"
    const resumoBtn = screen.getByRole('button', { name: 'Resumo da tarefa' });
    fireEvent.click(resumoBtn);

    // Dialog compacto de resumo deve estar presente
    const popup = screen.getByRole('dialog', { name: 'Resumo da tarefa #12' });
    expect(popup).toBeInTheDocument();

    // Informações essenciais presentes
    expect(popup).toHaveTextContent('#12');
    expect(popup).toHaveTextContent('Elaborar Parecer Técnico');
    expect(popup).toHaveTextContent('Equipe SEAF');
    expect(popup).toHaveTextContent('Maria Técnica');
    expect(popup).toHaveTextContent(/Atrasada/);
    expect(popup).toHaveTextContent('Em andamento');
    expect(popup).toHaveTextContent('Urgente');

    // Não deve conter seções pesadas como histórico, comentários ou anexos
    expect(popup).not.toHaveTextContent('Histórico de alterações');
    expect(popup).not.toHaveTextContent('Comentários e Atividades');
    expect(popup).not.toHaveTextContent('Anexos');

    // onSelect NÃO foi chamado ao apenas abrir o resumo compacto
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fecha o resumo compacto ao clicar no botão X e ao pressionar Escape', () => {
    const task = sampleTask('task-13', '13', 'Revisão Cadastral');
    render(
      <MemoryRouter>
        <TaskCard task={task} compact />
      </MemoryRouter>,
    );

    const menuSummary = screen.getByLabelText('Ações da tarefa #13');
    fireEvent.click(menuSummary);
    fireEvent.click(screen.getByRole('button', { name: 'Resumo da tarefa' }));

    expect(screen.getByRole('dialog', { name: 'Resumo da tarefa #13' })).toBeInTheDocument();

    // Fecha pelo botão X
    const closeBtn = screen.getByRole('button', { name: 'Fechar resumo' });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog', { name: 'Resumo da tarefa #13' })).not.toBeInTheDocument();

    // Reabre e fecha via Escape
    fireEvent.click(menuSummary);
    fireEvent.click(screen.getByRole('button', { name: 'Resumo da tarefa' }));
    expect(screen.getByRole('dialog', { name: 'Resumo da tarefa #13' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Resumo da tarefa #13' })).not.toBeInTheDocument();
  });

  it('botão "Ver detalhes completos" fecha o resumo compacto e aciona onSelect', () => {
    const task = sampleTask('task-14', '14', 'Auditoria de Processo');
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <TaskCard task={task} compact onSelect={onSelect} />
      </MemoryRouter>,
    );

    const menuSummary = screen.getByLabelText('Ações da tarefa #14');
    fireEvent.click(menuSummary);
    fireEvent.click(screen.getByRole('button', { name: 'Resumo da tarefa' }));

    const verDetalhesBtn = screen.getByRole('button', { name: 'Ver detalhes completos' });
    fireEvent.click(verDetalhesBtn);

    // Pop-up fechado
    expect(screen.queryByRole('dialog', { name: 'Resumo da tarefa #14' })).not.toBeInTheDocument();

    // onSelect disparado com a tarefa para abrir o modal completo
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toEqual(task);
  });

  it('não permite múltiplos pop-ups abertos simultaneamente (abrir outro fecha o anterior)', () => {
    const taskA = sampleTask('task-A', '101', 'Tarefa A');
    const taskB = sampleTask('task-B', '102', 'Tarefa B');

    const { container } = render(
      <MemoryRouter>
        <div>
          <TaskCard task={taskA} compact onColorChange={vi.fn()} />
          <TaskCard task={taskB} compact onColorChange={vi.fn()} />
        </div>
      </MemoryRouter>,
    );

    const cardA = container.querySelector('article[data-task-id="task-A"]') as HTMLElement;
    const cardB = container.querySelector('article[data-task-id="task-B"]') as HTMLElement;

    // Abre o resumo da Tarefa A
    fireEvent.click(screen.getByLabelText('Ações da tarefa #101'));
    fireEvent.click(within(cardA).getByRole('button', { name: 'Resumo da tarefa' }));
    expect(screen.getByRole('dialog', { name: 'Resumo da tarefa #101' })).toBeInTheDocument();

    // Abre a paleta de cores da Tarefa B
    fireEvent.click(screen.getByLabelText('Personalizar cor da tarefa #102'));
    expect(screen.getByRole('dialog', { name: 'Paleta de cores do cartão' })).toBeInTheDocument();

    // O resumo da Tarefa A deve ter sido fechado automaticamente
    expect(screen.queryByRole('dialog', { name: 'Resumo da tarefa #101' })).not.toBeInTheDocument();

    // Agora abre o resumo da Tarefa B
    fireEvent.click(screen.getByLabelText('Ações da tarefa #102'));
    fireEvent.click(within(cardB).getByRole('button', { name: 'Resumo da tarefa' }));
    expect(screen.getByRole('dialog', { name: 'Resumo da tarefa #102' })).toBeInTheDocument();

    // A paleta de cores deve ter sido fechada automaticamente
    expect(screen.queryByRole('dialog', { name: 'Paleta de cores do cartão' })).not.toBeInTheDocument();
  });
});
