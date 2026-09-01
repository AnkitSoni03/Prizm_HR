import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.png'],
      // Off by default in vite-plugin-pwa — without this, `npm run dev`
      // never registers a service worker at all, so Chrome's installability
      // check (and therefore beforeinstallprompt, and the Login page's
      // Install App button) silently never fires there. Only `vite build` +
      // `vite preview`/production had it. Harmless in dev: it's the same
      // generated service worker, just also active locally.
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Prizm HR',
        short_name: 'Prizm HR',
        description: 'Prizm HR — Smart HR. Stronger People.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          // Filename deliberately has no spaces — a raw space in a manifest
          // icon `src` breaks Chrome's icon fetch (unlike a normal <img>/
          // <link> tag, which auto-encodes it), which silently fails the
          // installability check with no error, just no install prompt.
          { src: '/pwa-icon.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icon.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages' },
          },
          {
            urlPattern: ({ request }) =>
              ['script', 'style', 'image', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'assets' },
          },
        ],
      },
    }),
  ],
})
