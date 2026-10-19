import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import institucion from './config/institucion.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // La app se actualiza sola cuando hay una versión nueva publicada.
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg', 'icono-192.png'],
      manifest: {
        name: `${institucion.nombreApp} - ${institucion.nombreInstitucion}`,
        short_name: institucion.nombreCorto,
        description: 'Inscripciones a eventos, funciona sin conexión.',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: institucion.colores.fondo,
        theme_color: institucion.colores.principal,
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Guarda en el dispositivo todo lo necesario para abrir la app sin internet.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
