import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Only the production build is served from a subpath
  // (https://<user>.github.io/music-dna1/, a project Pages site) — keep
  // local dev at "/" so http://127.0.0.1:5173 in the README still works.
  base: command === 'build' ? '/music-dna1/' : '/',
}))
