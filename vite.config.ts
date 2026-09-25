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
      includeAssets: ['favicon.svg', 'icons/*.png', 'fonts/*.woff2'],
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
        background_color: '#14120f',
        theme_color: '#14120f',
        categories: ['games', 'education'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // On ne precache jamais le moteur : trop lourd pour une premiere visite mobile.
        // Les pastilles de bouche sont PRE-cachees, pas seulement mises en
        // cache a l'usage : elles servent des la premiere replique du
        // professeur, quelques centaines de millisecondes apres l'ouverture
        // de l'ecran. Fetchees a ce moment-la elles arrivaient trop tard, et
        // les premieres prises de parole restaient muettes. Huit fichiers,
        // 130 Ko en tout : le cout est negligeable.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', '**/profs/*-bouche-*.webp'],
        // Les voix pré-générées ne sont PAS pré-cachées : une quarantaine de
        // mégaoctets à la première visite serait absurde alors qu'une partie
        // n'en consomme qu'une poignée. Elles sont mises en cache à l'usage,
        // sur des URL immuables — le nom de fichier EST l'empreinte du texte
        // et de la voix.
        globIgnores: ['**/engine/**', '**/node_modules/**', '**/voix/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/engine\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            // Voix des professeurs. Le nom de fichier est l'empreinte du
            // texte et de la voix : l'URL est donc immuable par construction,
            // et un fichier mis en cache ne peut jamais être périmé.
            urlPattern: /\/voix\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'voix-professeurs-v1',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // Portraits des professeurs, toutes largeurs et pastilles de
            // bouche comprises. Mis en cache a l'usage : cinq largeurs par
            // professeur pesent un demi-mega, dont l'appareil ne telecharge
            // en pratique qu'une seule.
            //
            // Le motif couvrait `nom-512.webp` mais pas
            // `nom-bouche-ouverte.webp` : les pastilles n'etaient donc mises
            // en cache nulle part et repartaient sur le reseau a chaque
            // visite.
            urlPattern: /\/profs\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'portraits-professeurs-v1',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
