import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DM Companion',
    short_name: 'DM Companion',
    description: 'Campaign management for DnD sessions.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#120f0e',
    theme_color: '#120f0e',
    orientation: 'any',
    icons: [
      {
        src: '/app-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/app-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
