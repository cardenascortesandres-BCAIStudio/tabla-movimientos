import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Build separado para publicar en una URL real (Railway, Netlify, etc.) como
// PWA instalable — a diferencia de vite.config.js (un solo archivo, doble
// clic, sin servidor), esta versión SÍ necesita servirse por http(s) porque
// el service worker que la hace instalable/offline no funciona sobre file://.
// El build de doble clic (npm run build) sigue existiendo tal cual, sin
// tocar; este es un target adicional, no un reemplazo.
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Tabla de Movimientos por Producto',
        short_name: 'Tabla Movimientos',
        description: 'Cálculo de inventarios por producto y sede — compras, entradas, ventas, salidas, teórico, disponible y diferencia KL.',
        theme_color: '#8b1e1e',
        background_color: '#f7f8fa',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Todo el cálculo corre en el navegador y no hay llamadas a un backend,
        // así que basta con precachear los assets del build (app shell).
        globPatterns: ['**/*.{js,css,html,png,svg,ico}']
      }
    })
  ],
  build: {
    target: 'es2020',
    outDir: 'dist-web'
  },
  server: {
    // Durante "npm run dev:web", las llamadas a /api/balance/* se reenvían al
    // servidor local (npm run dev:server, puerto 4173) en vez de necesitar
    // desplegar a Railway para probar el módulo de Balance.
    proxy: {
      '/api': 'http://localhost:4173'
    }
  }
});
