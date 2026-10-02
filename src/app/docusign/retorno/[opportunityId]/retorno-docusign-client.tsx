'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { montarMensagemRetorno } from '@/lib/contratos/janela-docusign';

/**
 * Onde o DocuSign devolve o browser ao sair da Embedded Sender View.
 *
 * ## Por que uma rota própria, e por que o id no PATH
 *
 * O `returnUrl` é montado pelo backend (`envelope.service.ts`,
 * `senderReturnUrl`). Medido em 14/09/2026 contra o sandbox: **o DocuSign
 * SUBSTITUI a query string** que mandamos pela dele (`?envelopeId=…&event=Send`).
 * O **path sobrevive**; a query, não. Por isso a oportunidade viaja como
 * segmento de rota — qualquer marcador nosso na query seria apagado antes de
 * chegar aqui.
 *
 * ## Dois comportamentos, decididos por `window.opener`
 *
 * 1. **Dentro da janela** que a tela do contrato abriu: avisa a janela-mãe por
 *    `postMessage` e **se fecha**. Não busca nada — quem relê o estado é a
 *    janela de trás, que já tem sessão, dados e a barra na tela. Fazer fetch
 *    aqui duplicaria a sincronização e competiria com ela.
 * 2. **Sem `opener`** — o popup foi bloqueado e o fluxo caiu para navegação de
 *    página inteira: redireciona de volta para a oportunidade com o marcador
 *    que o handler de retorno já reconhece. ⚠️ **Este ramo não é opcional:**
 *    bloqueador de popup corporativo é comum, e sem ele a pessoa ficaria presa
 *    numa página que só sabe falar com uma janela-mãe que não existe.
 *
 * ## O que esta página NÃO faz
 *
 * Não lê `envelopeId` nem `event` da URL para decidir coisa alguma. Eles dizem
 * "você voltou de lá", e nada mais: qual envelope sincronizar sai do banco, sob
 * a sessão de quem voltou. Aceitar o id do browser deixaria o cliente escolher
 * qual envelope a plataforma lê — a mesma regra que o `senderReturnUrl` já
 * carrega do lado do backend.
 */
export function RetornoDocusignClient({ opportunityId }: { opportunityId: string }) {
  const [semJanelaMae, setSemJanelaMae] = useState(false);
  const jaRodou = useRef(false);
  const router = useRouter();

  useEffect(() => {
    // Guarda contra a dupla invocação do StrictMode em dev — mesmo motivo do
    // `/auth/callback`. Sem ela o `window.close()` roda duas vezes.
    if (jaRodou.current) return;
    jaRodou.current = true;

    const mae = window.opener as Window | null;

    if (!mae || mae.closed) {
      setSemJanelaMae(true);
      /*
       * Pelo ROUTER, não por `window.location` com `withBasePath`: rota interna
       * do app é prefixada pelo próprio Next, e prefixar à mão duplica o
       * `basePath` e dá 404 em todos os ambientes (`next-link-base-path.test.ts`
       * guarda essa regra, e ela custou a navegação de TW-01 no stage).
       */
      router.replace(`/oportunidades/${encodeURIComponent(opportunityId)}?docusign=retorno`);
      return;
    }

    /*
     * A mensagem é um GATILHO, não um dado: diz "algo aconteceu, releia" e nada
     * mais. Ela carrega a oportunidade só para a janela-mãe poder recusar um
     * aviso que não é dela (uma segunda aba, em outra oportunidade) — nunca
     * status, nunca `envelopeId`.
     *
     * O `targetOrigin` é a nossa origem exata — nunca `'*'`, que entregaria a
     * mensagem a qualquer janela que tivesse navegado para cá.
     *
     * ⚠️ Os parâmetros que o DocuSign devolve na URL (`envelopeId`, `event`)
     * NÃO são repassados. Eles dizem "você voltou de lá", e nada mais: usar o
     * `event=Send` para escolher a frase criaria uma segunda fonte de verdade
     * sobre o envelope, que discorda da API justamente no caso ambíguo.
     */
    mae.postMessage(montarMensagemRetorno(opportunityId), window.location.origin);
    window.close();

    /*
     * `window.close()` só é garantido para janelas abertas por script. Se por
     * algum motivo ela sobreviver, a pessoa não pode ficar olhando para uma
     * página vazia — o texto abaixo dá a saída manual.
     */
  }, [opportunityId, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      {semJanelaMae ? (
        <p className="text-(--color-text-muted)">Voltando para a oportunidade…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-(--color-text-muted)">
            Pronto. Pode fechar esta janela.
          </p>
          <Link
            href={`/oportunidades/${encodeURIComponent(opportunityId)}`}
            className="font-semibold text-(--secondary-600) hover:underline"
          >
            Voltar para a oportunidade
          </Link>
        </div>
      )}
    </main>
  );
}
