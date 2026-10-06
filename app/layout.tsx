import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import Header from '@/components/Header';
import Ticker from '@/components/Ticker';
import Footer from '@/components/Footer';
import SoundNudge from '@/components/SoundNudge';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.treeterminal.fun'),
  title: 'TREE · a coin that grows a family tree',
  applicationName: 'TREE',
  openGraph: { siteName: 'TREE · treeterminal.fun', type: 'website', url: '/' },
  twitter: { card: 'summary_large_image' },
  description:
    'Plant a coin. When its vault fills, it launches a child. Every child pays every ancestor. One tree, forever growing, on Solana.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1b1815',
};

const themeScript = `try{if(localStorage.getItem('tree.theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <Providers>
          <Header />
          <Ticker />
          <main>{children}</main>
          <Footer />
          <SoundNudge />
        </Providers>
      </body>
    </html>
  );
}
