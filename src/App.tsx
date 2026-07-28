import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppContextProvider } from './AppContextProvider';
import { AuthCallback } from './features/auth/AuthCallback';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginScreen } from './features/auth/LoginScreen';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DiscoveryPage } from './features/discovery/DiscoveryPage';
import { AppNav } from './features/shell/AppNav';
import { ensureLibrarySynced } from './modules/sync';
import './App.css';

/**
 * The authenticated application bootstrap: the one gate every
 * authenticated route passes through, for both a fresh login and a
 * returning session with an already-valid stored token. This is where
 * `ensureLibrarySynced()` is called — not from either page — so that
 * neither `DiscoveryPage` nor `DashboardPage` owns deciding whether a
 * sync should start.
 *
 * `ensureLibrarySynced()` guarantees its own idempotency (see its own
 * docs) — this effect can fire again on every remount (e.g. navigating
 * between `/` and `/music-dna`, which are two separate `RequireAuth`
 * instances) without ever starting a second sync.
 */
const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) ensureLibrarySynced();
  }, [isAuthenticated]);

  if (!isAuthenticated) return <LoginScreen />;
  return (
    <>
      <AppNav />
      {children}
    </>
  );
};

const App = () => (
  <AuthProvider>
    <AppContextProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DiscoveryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/music-dna"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppContextProvider>
  </AuthProvider>
);

export default App;
