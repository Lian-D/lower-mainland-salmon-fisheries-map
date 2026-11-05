import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lower Mainland Salmon',
  description: 'Where you can fish for salmon in the Lower Mainland today, from DFO Region 2 and Area 29 rules, checked daily.',
  icons: { icon: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Salmon Map', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#dfeaee' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1519' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get('lang')?.value;
  return (
    <html lang={lang === 'zh-Hant' || lang === 'zh-Hans' ? lang : 'en'}>
      <body>{children}</body>
    </html>
  );
}
