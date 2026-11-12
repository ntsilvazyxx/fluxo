import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', accessToken: null, user: null });
  const refreshInFlight = useRef(null);
  const apply = useCallback((data) => { setSession({ status: 'authenticated', accessToken: data.accessToken, user: data.user }); return data; }, []);
  const refresh = useCallback(() => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = (async () => {
        const response = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!response.ok) { setSession({ status: 'anonymous', accessToken: null, user: null }); return null; }
        return apply((await response.json()).data);
      })().finally(() => { refreshInFlight.current = null; });
    }
    return refreshInFlight.current;
  }, [apply]);
  useEffect(() => { const restore = async () => { try { await refresh(); } catch { setSession({ status: 'anonymous', accessToken: null, user: null }); } }; restore(); }, [refresh]);
  const request = useCallback(async (path, options = {}) => { const send = (token) => fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'content-type': 'application/json', ...options.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } }); let response = await send(session.accessToken); if (response.status === 401) { const renewed = await refresh(); if (renewed) response = await send(renewed.accessToken); } return response; }, [session.accessToken, refresh]);
  const upload = useCallback(async (path, formData, { headers = {}, onProgress } = {}) => {
    const send = (token) => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}${path}`);
      xhr.withCredentials = true;
      Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
      if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener('error', () => reject(new Error('Falha de rede durante o envio.')));
      xhr.addEventListener('load', () => resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText || '{}'),
      }));
      xhr.send(formData);
    });
    let response = await send(session.accessToken);
    if (response.status === 401) {
      const renewed = await refresh();
      if (renewed) response = await send(renewed.accessToken);
    }
    return response;
  }, [session.accessToken, refresh]);
  const login = async (email, password) => { const response = await fetch(`${API}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); if (!response.ok) throw new Error((await response.json()).error?.message ?? 'Falha ao entrar.'); const data = (await response.json()).data; return apply(data); };
  const logout = async () => { await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {}); setSession({ status: 'anonymous', accessToken: null, user: null }); };
  return <Context.Provider value={{ ...session, login, logout, request, upload }}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Context);
