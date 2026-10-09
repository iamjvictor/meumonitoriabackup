import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import '@fontsource/fredericka-the-great/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';

const fontChalk = localFont({
  src: './fonts/schoolbell-latin-400-normal.woff2',
  variable: '--font-chalk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MeuMonitor AI — Assistente de Estudos com IA para Professores',
  description: 'Transforme seus materiais em um assistente de estudos com IA e tenha receita recorrente com seus alunos, sem se preocupar com tecnologia.',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-96x96.png?v=2', sizes: '96x96', type: 'image/png' },
      { url: '/logoSemfundo.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=2',
    apple: '/apple-icon.png?v=2',
  },
  manifest: '/site.webmanifest',
};

import { AlertProvider } from '@/shared';
import { SessionAuthInterceptor } from '@/shared/context/SessionAuthInterceptor';
import { SessionLoginModal } from '@/shared/context/SessionLoginModal';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={fontChalk.variable}>
      <body className="bg-[#F5F1E8] text-[#0F2942] antialiased selection:bg-[#2E5B37] selection:text-white">
        <AlertProvider>
          <SessionAuthInterceptor />
          <SessionLoginModal />
          {children}
        </AlertProvider>
      </body>
    </html>
  );
}
