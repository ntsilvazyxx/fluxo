/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
export function useTasks(path) {
  const { request } = useAuth();
  const sequence = useRef(0);
  const [state, setState] = useState({ loading: Boolean(path), error: '', tasks: [], meta: null });
  const load = useCallback(async () => {
    const current = ++sequence.current;
    if (!path) { setState({ loading: false, error: '', tasks: [], meta: null }); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const response = await request(path);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível carregar as tarefas.');
      if (sequence.current === current) setState({ loading: false, error: '', tasks: json.data.tasks, meta: json.meta });
    } catch (error) {
      if (sequence.current === current) setState({ loading: false, error: error.message, tasks: [], meta: null });
    }
  }, [request, path]);
  useEffect(() => { const guard = sequence; load(); return () => { guard.current++; }; }, [load]);
  return { ...state, reload: load };
}
