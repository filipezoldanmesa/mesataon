import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Acesso · Vibra Gestor de Oportunidades',
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
