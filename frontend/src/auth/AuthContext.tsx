import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
type User = { id: string; name: string; role: { code: string; label?: string } };
type Features = { adminTaskCreation: boolean };
type Session = { status: 'loading' | 'authenticated' | 'anonymous'; accessToken: string | null; user: User | null; features: Features };
type LoginData = { accessToken: string; user: User; features?: Partial<Features> };
type UploadResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
type UploadOptions = { headers?: Record<string, string>; onProgress?: (value: number) => void };
type ContextValue = Session & { login: (email: string, password: string) => Promise<LoginData>; logout: () => Promise<void>; request: (path: string, options?: RequestInit) => Promise<Response>; upload: (path: string, form: FormData, options?: UploadOptions) => Promise<UploadResponse> };
const empty: Session = { status: 'loading', accessToken: null, user: null, features: { adminTaskCreation: false } };
const Context = createContext<ContextValue | null>(null);
const dataOf = (value: unknown) => value && typeof value === 'object' ? (value as { data?: unknown }).data : undefined;
function isLogin(value: unknown): value is LoginData { return !!value && typeof value === 'object' && typeof (value as { accessToken?: unknown }).accessToken === 'string' && !!(value as { user?: unknown }).user; }
function errorOf(value: unknown, fallback: string) { const error = value && typeof value === 'object' ? (value as { error?: { message?: unknown } }).error : undefined; return typeof error?.message === 'string' ? error.message : fallback; }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(empty);
  const inFlight = useRef<Promise<LoginData | null> | null>(null);
  const apply = useCallback((data: LoginData) => { const features = { adminTaskCreation: data.features?.adminTaskCreation === true }; setSession({ status: 'authenticated', accessToken: data.accessToken, user: data.user, features }); return data; }, []);
  const refresh = useCallback(() => {
    if (!inFlight.current) inFlight.current = (async () => { const response = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' }); if (!response.ok) { setSession({ status: 'anonymous', accessToken: null, user: null, features: { adminTaskCreation: false } }); return null; } const data = dataOf(await response.json()); if (!isLogin(data)) throw new Error('Resposta de autenticação inválida.'); return apply(data); })().finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [apply]);
  useEffect(() => { void refresh().catch(() => setSession({ status: 'anonymous', accessToken: null, user: null, features: { adminTaskCreation: false } })); }, [refresh]);
  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const rawHeaders = options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : (Array.isArray(options.headers) ? Object.fromEntries(options.headers) : (options.headers || {}));
    const hasContentType = Object.keys(rawHeaders).some((k) => k.toLowerCase() === 'content-type');
    const headers = {
      ...(hasContentType ? {} : { 'content-type': 'application/json' }),
      ...rawHeaders,
    };
    const send = (token: string | null) => fetch(`${API}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...headers,
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    });
    let response = await send(session.accessToken);
    if (response.status === 401) {
      const renewed = await refresh();
      if (renewed) response = await send(renewed.accessToken);
    }
    return response;
  }, [refresh, session.accessToken]);
  const upload = useCallback(async (path: string, form: FormData, { headers = {}, onProgress }: UploadOptions = {}) => { const send = (token: string | null) => new Promise<UploadResponse>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('POST', `${API}${path}`); xhr.withCredentials = true; Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value)); if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`); xhr.upload.addEventListener('progress', (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)); }); xhr.addEventListener('error', () => reject(new Error('Falha de rede durante o envio.'))); xhr.addEventListener('load', () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => JSON.parse(xhr.responseText || '{}') as unknown })); xhr.send(form); }); let response = await send(session.accessToken); if (response.status === 401) { const renewed = await refresh(); if (renewed) response = await send(renewed.accessToken); } return response; }, [refresh, session.accessToken]);
  const login = async (email: string, password: string) => { const response = await fetch(`${API}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); const body: unknown = await response.json(); if (!response.ok) throw new Error(errorOf(body, 'Falha ao entrar.')); const data = dataOf(body); if (!isLogin(data)) throw new Error('Resposta de autenticação inválida.'); return apply(data); };
  const logout = async () => { await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {}); setSession({ status: 'anonymous', accessToken: null, user: null, features: { adminTaskCreation: false } }); };
  return <Context.Provider value={{ ...session, login, logout, request, upload }}>{children}</Context.Provider>;
}
export const useAuth = () => { const context = useContext(Context); if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.'); return context; };
