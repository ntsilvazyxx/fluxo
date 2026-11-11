import { createContext, useCallback, useContext, useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', accessToken: null, user: null });
  const apply = useCallback((data) => { setSession({ status: 'authenticated', accessToken: data.accessToken, user: data.user }); return data; }, []);
  const refresh = useCallback(async () => { const response = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' }); if (!response.ok) { setSession({ status: 'anonymous', accessToken: null, user: null }); return null; } return apply((await response.json()).data); }, [apply]);
  useEffect(() => { const restore = async () => { try { await refresh(); } catch { setSession({ status: 'anonymous', accessToken: null, user: null }); } }; restore(); }, [refresh]);
  const request = useCallback(async (path, options = {}) => { const send = (token) => fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'content-type': 'application/json', ...options.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } }); let response = await send(session.accessToken); if (response.status === 401) { const renewed = await refresh(); if (renewed) response = await send(renewed.accessToken); } return response; }, [session.accessToken, refresh]);
  const login = async (email, password) => { const response = await fetch(`${API}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); if (!response.ok) throw new Error((await response.json()).error?.message ?? 'Falha ao entrar.'); apply((await response.json()).data); };
  const logout = async () => { await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {}); setSession({ status: 'anonymous', accessToken: null, user: null }); };
  return <Context.Provider value={{ ...session, login, logout, request }}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Context);
