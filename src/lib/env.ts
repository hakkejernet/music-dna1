const required = (key: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(
      `Missing required env var ${key}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
};

// Lazy getters: reading `import.meta.env` only happens when a value is actually
// needed (e.g. when the user clicks "Log ind"), so the app can still render the
// login screen and surface a clear error instead of a blank page on first run.
export const env = {
  get spotifyClientId(): string {
    return required(
      'VITE_SPOTIFY_CLIENT_ID',
      import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined,
    );
  },
  get spotifyRedirectUri(): string {
    return (
      (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ??
      `${window.location.origin}/callback`
    );
  },
};
