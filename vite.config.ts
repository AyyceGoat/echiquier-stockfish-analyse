import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Cible ES2020 : compatible Safari 15 / Android 9 (Chrome 80+).
// Les binaires Stockfish vivent dans public/engine/sf18 et ne sont PAS pre-caches
// par le service worker (14 Mo) : ils sont mis en cache a la premiere utilisation
// via une regle runtime CacheFirst sur une URL versionnee (immuable).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Échiquier — Stockfish & Analyse',
        short_name: 'Échiquier',
        description: "Jouer, s'entraîner et analyser ses parties avec Stockfish 18.",
        lang: 'fr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        categories: ['games', 'education'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // On ne precache jamais le moteur : trop lourd pour une premiere visite mobile.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/engine/**', '**/node_modules/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/engine\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            // URL versionnee => contenu immuable => CacheFirst sans risque de WASM perime.
            urlPattern: /\/engine\/sf(?:18|19)\/.*\.(?:js|wasm|nnue)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'moteur-stockfish-19-et-18.0.8',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'polices' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: ['es2020', 'safari15', 'chrome80', 'firefox80'],
    cssTarget: ['safari15', 'chrome80'],
    sourcemap: false,
    rollupOptions: {
      output: {
        // Découpage explicite : React et la couche échecs changent rarement,
        // les isoler garde leur cache valide entre deux déploiements.
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/chess.js') || id.includes('node_modules/chessground')) {
            return 'vendor-chess';
          }
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
