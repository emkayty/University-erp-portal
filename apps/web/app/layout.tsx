import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default:  'UniPortal ERP',
    template: '%s — UniPortal ERP',
  },
  description: 'Comprehensive University Enterprise Resource Planning Platform',
  robots: {
    index:  false, // Do not index this internal application
    follow: false,
  },
  icons: {
    icon:   '/favicon.ico',
    apple:  '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0056B3' },
    { media: '(prefers-color-scheme: dark)',  color: '#003D80' },
  ],
  width:          'device-width',
  initialScale:   1,
  maximumScale:   5, // Allow zoom for accessibility
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to API and CDN */}
        <link rel="preconnect" href={process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Accessibility: skip navigation link */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <Providers>
          <div id="main-content">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
