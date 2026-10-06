import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TREE · a coin that grows a family tree',
    short_name: 'TREE',
    start_url: '/',
    display: 'standalone',
    background_color: '#1b1815',
    theme_color: '#1b1815',
    icons: [
      { src: '/brand/logo-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
