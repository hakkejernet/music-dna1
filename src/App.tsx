import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthCallback } from './features/auth/AuthCallback';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginScreen } from './features/auth/LoginScreen';
import { DashboardPage } from './features/dashboard/DashboardPage';
import './App.css';

const Home = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <DashboardPage /> : <LoginScreen />;
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/callback" element={<AuthCallback />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
