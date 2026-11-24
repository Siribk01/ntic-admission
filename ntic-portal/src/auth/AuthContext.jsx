// src/auth/AuthContext.jsx
// Who is signed in. Any page can call useAuth() to get { user, login, register, logout }.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.js';
import { getToken, setSignedOutHandler, setToken } from '../api/client.js';

const AuthContext = createContext(null);

// Login answers may name the token differently; accept the usual spellings
const tokenFrom = (d) => d?.token || d?.accessToken || d?.access_token;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken())); // true while we check a saved token

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  // When the server rejects our token (expired after 15 minutes), drop the user so the router sends them to sign in
  useEffect(() => { setSignedOutHandler(() => setUser(null)); }, []);

  // On first load, if a token is saved, ask who it belongs to
  useEffect(() => {
    if (!getToken()) return;
    authApi.me()
      .then((d) => setUser(d.user || d))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await authApi.login(email, password);
    const t = tokenFrom(d);
    if (!t) throw new Error('The server did not return a token. Check src/api/auth.js against your login response.');
    setToken(t);
    setUser(d.user || (await authApi.me().then((m) => m.user || m)));
  }, []);

  const register = useCallback(async (fields) => { await authApi.register(fields); }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
