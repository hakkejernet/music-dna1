import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  buildAuthorizeUrl,
  isAuthenticated as checkIsAuthenticated,
  logout as clearSession,
} from '../../modules/spotify';

interface AuthContextValue {
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authenticated, setAuthenticated] = useState(checkIsAuthenticated());

  const login = useCallback(async () => {
    window.location.assign(await buildAuthorizeUrl());
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setAuthenticated(false);
  }, []);

  const refresh = useCallback(() => {
    setAuthenticated(checkIsAuthenticated());
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated: authenticated, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
