import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';

const buildId = process.env.LIFEOS_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || (() => { try { return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { return `local-${Date.now()}`; } })();

export default defineConfig({
  define: { __LIFEOS_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    { name:'lifeos-build-version', generateBundle() { this.emitFile({type:'asset',fileName:'build-version.json',source:JSON.stringify({version:buildId})}); } },
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['lifeos-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LifeOS',
        short_name: 'LifeOS',
        description:
          'Personal operating system for planning, health, workouts, finances, and AI review.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        orientation: 'portrait',
        categories: ['productivity', 'health', 'finance'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
