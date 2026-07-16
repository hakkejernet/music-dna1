const base64UrlEncode = (bytes: ArrayBuffer): string => {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const generateCodeVerifier = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes.buffer);
};

export const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
};

export const generateState = (): string => generateCodeVerifier();
