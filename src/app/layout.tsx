import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { ThemeProvider } from '@/components/theme-provider';
import { DynamicGradientBackground } from '@/components/dynamic-gradient-background';
import './globals.css';

export const metadata: Metadata = {
  title: 'Portal CMSA',
  description: 'Portal oficial con acceso al buscador de libros y al cronometro.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <DynamicGradientBackground />
          <Header />
          <main className="flex-1">
            {children}
          </main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
