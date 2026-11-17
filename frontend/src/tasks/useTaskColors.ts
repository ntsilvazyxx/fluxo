import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';

export function useTaskColors(taskIds: string[] = []) {
  const { request } = useAuth();
  const [colors, setColors] = useState<Record<string, string>>({});

  const requestSeqRef = useRef<Record<string, number>>({});
  const loadSeqRef = useRef(0);

  // Chave estável serializada para evitar chamadas duplicadas
  const taskIdsKey = useMemo(() => {
    return Array.from(new Set(taskIds.filter((id) => Boolean(id) && typeof id === 'string'))).sort().join(',');
  }, [taskIds]);

  useEffect(() => {
    if (!taskIdsKey) return;

    let cancelled = false;
    const currentSeq = ++loadSeqRef.current;

    const load = async () => {
      try {
        const query = new URLSearchParams({ taskIds: taskIdsKey });
        const response = await request(`/user-preferences/kanban-colors?${query}`);
        if (!response.ok) return;

        const body = await response.json();
        const receivedColors = body.data?.colors ?? {};

        if (!cancelled && loadSeqRef.current === currentSeq) {
          setColors((prev) => ({
            ...prev,
            ...receivedColors,
          }));
        }
      } catch {
        // Falhas transitórias de rede na busca de cores não interrompem a UI
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [request, taskIdsKey]);

  const setColor = useCallback(
    async (taskId: string, newColor: string | null) => {
      if (!taskId) return;

      const normalizedColor = !newColor || newColor === 'default' ? null : newColor;
      let previousColor: string | null = null;

      const currentSeq = (requestSeqRef.current[taskId] || 0) + 1;
      requestSeqRef.current[taskId] = currentSeq;

      // 1. Atualização otimista imediata capturando a cor anterior
      setColors((prev) => {
        previousColor = prev[taskId] ?? null;
        const next = { ...prev };
        if (normalizedColor) {
          next[taskId] = normalizedColor;
        } else {
          delete next[taskId];
        }
        return next;
      });

      // 2. Disparo ao backend
      try {
        const response = await request(`/user-preferences/kanban-colors/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color: normalizedColor ?? 'default' }),
        });

        if (!response.ok) {
          throw new Error('Falha ao salvar preferência de cor.');
        }

        // Se uma requisição mais recente já foi iniciada pelo usuário, descarta esta resposta
        if (requestSeqRef.current[taskId] !== currentSeq) {
          return;
        }

        const body = await response.json();
        const savedColor = body.data?.color ?? null;

        setColors((prev) => {
          const next = { ...prev };
          if (savedColor) {
            next[taskId] = savedColor;
          } else {
            delete next[taskId];
          }
          return next;
        });
      } catch {
        // 3. Em caso de erro, reverte somente se esta for a última ação
        if (requestSeqRef.current[taskId] === currentSeq) {
          setColors((prev) => {
            const next = { ...prev };
            if (previousColor) {
              next[taskId] = previousColor;
            } else {
              delete next[taskId];
            }
            return next;
          });
        }
      }
    },
    [request],
  );

  return {
    colors,
    setColor,
  };
}
