import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleAuthCallback } from '../../modules/spotify';
import { useAuth } from './AuthContext';

export const AuthCallback = () => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await handleAuthCallback(new URL(window.location.href));
        if (cancelled) return;
        refresh();
        navigate('/', { replace: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, refresh]);

  if (error) {
    return (
      <div className="dashboard-status dashboard-status--error">
        <h2>Login fejlede</h2>
        <p>{error}</p>
        <a href="/">Prøv igen</a>
      </div>
    );
  }

  return <div className="dashboard-status">Logger ind...</div>;
};
