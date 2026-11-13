import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TaskLifecyclePanel } from './TaskLifecyclePanel.tsx';

const activeTask = {
  id: 'parent', parentCycleId: null,
  cycles: [{ id: 'cycle-1', cycleNumber: 1, status: 'IN_PROGRESS', openedAt: '2026-11-12T12:00:00.000Z', deadlineAt: null, assignments: [] }],
  subtasks: [{ id: 'child', publicNumber: '12', parentCycleId: 'cycle-1', cycle: { title: 'Preparar anexo', status: 'IN_PROGRESS', priority: 'HIGH', deadlineAt: null, assignment: null } }],
};

describe('painel de subtarefas e ciclos', () => {
  it('informa o bloqueio da conclusão e permite navegar para a subtarefa', () => {
    render(<MemoryRouter><TaskLifecyclePanel task={activeTask} cycle={{ ...activeTask.cycles[0], version: 2 }} users={[]} canManage={false} busy={false} mutate={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(/conclusão da tarefa principal está bloqueada/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Preparar anexo/i })).toHaveAttribute('href', '/tarefas/child');
  });

  it('exige justificativa e aciona a reabertura de ciclo concluído', () => {
    const mutate = vi.fn().mockResolvedValue(true);
    const completed = { ...activeTask, cycles: [{ ...activeTask.cycles[0], status: 'COMPLETED', closedAt: '2026-11-12T14:00:00.000Z' }], subtasks: [] };
    render(<MemoryRouter><TaskLifecyclePanel task={completed} cycle={{ ...completed.cycles[0], version: 3 }} users={[]} canManage busy={false} mutate={mutate} /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Justificativa obrigatória'), { target: { value: 'Nova execução autorizada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir tarefa' }));
    expect(mutate).toHaveBeenCalledWith('/tasks/parent/reopen', { expectedVersion: 3, reason: 'Nova execução autorizada' });
  });
});
