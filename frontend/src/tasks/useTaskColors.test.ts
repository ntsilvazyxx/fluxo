import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskColors } from './useTaskColors.ts';

const auth = vi.hoisted(() => ({ request: vi.fn(), user: { id: 'user-1' } }));
vi.mock('../auth/AuthContext.tsx', () => ({ useAuth: () => auth }));

describe('useTaskColors', () => {
  beforeEach(() => {
    auth.request.mockReset();
  });

  it('carrega cores em lote para as tarefas visíveis', async () => {
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          colors: {
            'task-1': 'blue',
            'task-2': 'rose',
          },
        },
      }),
    });

    const { result } = renderHook(() => useTaskColors(['task-1', 'task-2']));

    await vi.waitFor(() => {
      expect(result.current.colors).toEqual({
        'task-1': 'blue',
        'task-2': 'rose',
      });
    });

    expect(auth.request).toHaveBeenCalledTimes(1);
    expect(auth.request.mock.calls[0][0]).toContain('/user-preferences/kanban-colors?taskIds=task-1%2Ctask-2');
  });

  it('aplica atualização otimista imediatamente e persiste no backend', async () => {
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { colors: {} } }),
    });

    const { result } = renderHook(() => useTaskColors(['task-1']));

    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { taskId: 'task-1', color: 'emerald' } }),
    });

    await act(async () => {
      await result.current.setColor('task-1', 'emerald');
    });

    expect(result.current.colors['task-1']).toBe('emerald');
    expect(auth.request).toHaveBeenCalledWith('/user-preferences/kanban-colors/task-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: 'emerald' }),
    });
  });

  it('protege contra respostas fora de ordem: a última escolha do usuário sempre prevalece', async () => {
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { colors: {} } }),
    });

    const { result } = renderHook(() => useTaskColors(['task-1']));

    let resolveFirstRequest: any;
    const firstPromise = new Promise((resolve) => {
      resolveFirstRequest = resolve;
    });

    // 1ª chamada: usuário escolhe 'blue' (resposta lenta)
    auth.request.mockImplementationOnce(() => firstPromise);

    // 2ª chamada: usuário muda de ideia rapidamente para 'orange' (resposta rápida)
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { taskId: 'task-1', color: 'orange' } }),
    });

    await act(async () => {
      void result.current.setColor('task-1', 'blue');
      await result.current.setColor('task-1', 'orange');
    });

    expect(result.current.colors['task-1']).toBe('orange');

    // Agora a 1ª requisição lenta resolve com a cor antiga 'blue'
    await act(async () => {
      resolveFirstRequest({
        ok: true,
        json: async () => ({ data: { taskId: 'task-1', color: 'blue' } }),
      });
    });

    // A cor DEVE permanecer 'orange' (a última escolha), não ser sobrescrita por 'blue'
    expect(result.current.colors['task-1']).toBe('orange');
  });

  it('reverte a cor em caso de falha de rede', async () => {
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { colors: { 'task-1': 'blue' } } }),
    });

    const { result } = renderHook(() => useTaskColors(['task-1']));

    await vi.waitFor(() => {
      expect(result.current.colors['task-1']).toBe('blue');
    });

    // Erro ao tentar mudar para 'purple'
    auth.request.mockRejectedValueOnce(new Error('Network failure'));

    await act(async () => {
      await result.current.setColor('task-1', 'purple');
    });

    // Revertido para 'blue'
    expect(result.current.colors['task-1']).toBe('blue');
  });

  it('restaura cor padrão (remove preferência)', async () => {
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { colors: { 'task-1': 'amber' } } }),
    });

    const { result } = renderHook(() => useTaskColors(['task-1']));

    await vi.waitFor(() => {
      expect(result.current.colors['task-1']).toBe('amber');
    });

    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { taskId: 'task-1', color: null } }),
    });

    await act(async () => {
      await result.current.setColor('task-1', null);
    });

    expect(result.current.colors['task-1']).toBeUndefined();
  });
});
