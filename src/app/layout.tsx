import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vibra Gestor de Oportunidades',
  description: 'Gestão de oportunidades',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      {/*
        Browser extensions (ColorZilla, Grammarly, password managers) inject
        attributes into <body> between the SSR response and hydration, which
        React reports as a hydration mismatch. suppressHydrationWarning is
        scoped to this element's own attributes and text — children are still
        diffed normally, so a real mismatch in the app is not hidden.
      */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
