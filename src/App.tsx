import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthCallback } from './features/auth/AuthCallback';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginScreen } from './features/auth/LoginScreen';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DiscoveryPage } from './features/discovery/DiscoveryPage';
import { AppNav } from './features/shell/AppNav';
import './App.css';

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
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
  </AuthProvider>
);

export default App;
