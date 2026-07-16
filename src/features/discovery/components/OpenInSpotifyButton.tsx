interface Props {
  href: string;
}

/**
 * A real <a href> (not a JS-triggered window.open) — mobile Safari blocks
 * navigation that isn't a direct result of the click, and the href here is
 * always resolved before the button can be rendered (see DiscoveryPage's
 * spotifyUrl effect). https://open.spotify.com/... links work as a
 * universal/app link on iOS and Android and a normal link on desktop.
 */
export const OpenInSpotifyButton = ({ href }: Props) => (
  <a className="open-in-spotify" href={href} target="_blank" rel="noopener noreferrer">
    <span aria-hidden="true">🎵</span> Åbn i Spotify
  </a>
);
