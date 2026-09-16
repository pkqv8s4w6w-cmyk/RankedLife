import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Installing to the home screen is the difference between an app
 * you open and a tab you forget, and this is a two-taps-a-day app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ranked Life',
    short_name: 'Ranked',
    description: 'Your day, scored.',
    start_url: '/',
    display: 'standalone',
    background_color: '#07080c',
    theme_color: '#07080c',
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
