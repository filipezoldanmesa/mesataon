import type { Metadata } from 'next';

import { RetornoDocusignClient } from './retorno-docusign-client';

export const metadata: Metadata = {
  title: 'Retorno do DocuSign · Vibra Gestor de Oportunidades',
};

/**
 * Página de retorno da Embedded Sender View.
 *
 * Deliberadamente **fora** do `AppShell`: ela vive dentro de uma janela popup
 * que se fecha em seguida, e montar o cabeçalho, o menu e as buscas do app para
 * isso seria carregar a aplicação inteira para exibir uma frase. No caminho de
 * fallback (popup bloqueado) ela redireciona na hora, então também não chega a
 * ser vista.
 */
export default async function RetornoDocusignPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;

  return <RetornoDocusignClient opportunityId={opportunityId} />;
}
