import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TaskLifecyclePanel } from './TaskLifecyclePanel.tsx';

const activeTask = {
  id: 'parent', parentCycleId: null,
  cycles: [{ id: 'cycle-1', cycleNumber: 1, status: 'IN_PROGRESS', openedAt: '2026-11-12T12:00:00.000Z', deadlineAt: null, assignments: [] }],
};

describe('painel de ciclos', () => {
  it('não exibe controles ou bloqueios de subtarefas', () => {
    render(<MemoryRouter><TaskLifecyclePanel task={activeTask} cycle={{ ...activeTask.cycles[0], version: 2 }} canManage={false} busy={false} mutate={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByText(/subtarefa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conclusão da tarefa principal está bloqueada/i)).not.toBeInTheDocument();
    expect(screen.getByText('Percurso da tarefa')).toBeInTheDocument();
  });

  it('exige justificativa e aciona a reabertura de ciclo concluído', () => {
    const mutate = vi.fn().mockResolvedValue(true);
    const completed = { ...activeTask, cycles: [{ ...activeTask.cycles[0], status: 'COMPLETED', closedAt: '2026-11-12T14:00:00.000Z' }] };
    render(<MemoryRouter><TaskLifecyclePanel task={completed} cycle={{ ...completed.cycles[0], version: 3 }} canManage busy={false} mutate={mutate} /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Justificativa obrigatória'), { target: { value: 'Nova execução autorizada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir tarefa' }));
    expect(mutate).toHaveBeenCalledWith('/tasks/parent/reopen', { expectedVersion: 3, reason: 'Nova execução autorizada' });
  });
});
