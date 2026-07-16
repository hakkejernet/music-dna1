import { useAuth } from './AuthContext';

export const LoginScreen = () => {
  const { login } = useAuth();

  return (
    <div className="login-screen">
      <div className="login-card">
        <span className="login-card__eyebrow">Music DNA</span>
        <h1>Kend din musiksmag. Ikke afspil den.</h1>
        <p className="login-card__tagline">
          Ikke en musikafspiller. Ikke en Spotify-klon. Kun discovery.
        </p>
        <p>
          Log ind med Spotify for at analysere dine playlister og kortlægge dit personlige
          Music DNA — genrer, årtier, popularitet og kunstner-diversitet. Alt gemmes lokalt i
          din browser, intet sendes til en server.
        </p>
        <button type="button" className="btn btn--spotify" onClick={() => void login()}>
          Log ind med Spotify
        </button>
      </div>
    </div>
  );
};
