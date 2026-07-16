# Changelog

## Discovery-side (UI only)

Forsiden er nu en Discovery-side i stedet for Music DNA-dashboardet.
Dashboardet ligger uændret på `/music-dna`, tilgængeligt via en ny
top-navigation.

- Ny `/` (home): Discovery — viser én sang ad gangen fra det lokalt
  synkroniserede bibliotek (shufflet, ingen algoritme endnu)
- Sang-kort: albumcover, titel, kunstner(e), album, genre (hvis
  tilgængelig via kunstner-data), og en 30-sekunders Spotify-preview
  (native `<audio>`-afspiller), eller en besked hvis `preview_url`
  mangler
- Handlingsknapper: ❤️ Gem, ❌ Afvis, 👀 Kendte allerede, ➡ Næste — alle
  går videre til næste sang; ingen af dem gemmer noget endnu (ren UI)
- "Hvorfor denne?"-knap åbner et sidepanel med placeholder-grunde
  (matcher musiksmag / ligner playlist-sange / samme genre / samme
  stemning) — ingen rigtig analyse
- Music DNA-dashboardet flyttet til `/music-dna`, funktionalitet
  uændret
- Ny top-nav (`AppNav`) til at skifte mellem Discovery og Music DNA

Nye moduler: `features/discovery/` (DiscoveryPage +
DiscoveryCard/PreviewPlayer/ActionBar/WhyPanel-komponenter),
`features/shell/AppNav`, `lib/shuffle`. Ingen ændringer i
`modules/spotify`, `modules/storage`, `modules/sync` eller
`modules/analysis` — ren UI-opgave.

## v0.1 — Spotify OAuth + Music DNA-dashboard

- Login med Spotify (OAuth Authorization Code + PKCE)
- Hent brugerens playlists og alle sange heri
- Analysér sangene lokalt (genre, årti, popularitet, explicit,
  kunstner-diversitet) — uden audio-features, som Spotify lukkede for
  nye apps i nov. 2024
- Gem metadata lokalt i IndexedDB
- Music DNA-dashboard
