import type { Metadata, Viewport } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Nav } from '@/components/Nav';
import { Toasts } from '@/components/Toasts';

export const metadata: Metadata = {
  title: 'Ranked Life',
  description: 'Your day, scored. Climb the ladder or fall off it.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Ranked Life' },
};

export const viewport: Viewport = {
  themeColor: '#07080c',
  width: 'device-width',
  initialScale: 1,
  // Room for the iPhone home indicator and notch.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StoreProvider>
          <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
            <main className="flex-1 pb-28 pt-4">{children}</main>
            <Nav />
          </div>
          <Toasts />
        </StoreProvider>
      </body>
    </html>
  );
}
