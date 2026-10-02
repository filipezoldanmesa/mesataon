'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

import { DdiPanel } from '@/components/opportunities/ddi-panel';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';

// ---------------------------------------------------------------------------
// Detalhamento da análise de integridade (DDI) — ADO 67882
// ---------------------------------------------------------------------------
//
// *"Da forma que está, continua com o risco alto e não apareceu nenhuma
// informação com o LT com a informação do risco."*
//
// E não aparecia porque `DdiPanel` — o único componente que mostra racional,
// score, achados e parecer — era montado em UM lugar só: dentro do ticket de
// pendência (`pendencia-ticket.tsx`, condicionado a `origem` começar com
// `ddi:`). Emitido o parecer, a `ddi:parecer` da Integridade fecha; sem
// nenhuma pendência `ddi:*` aberta, NÃO EXISTIA superfície em que o LT lesse a
// análise. O card "Análises" da oportunidade renderizava só a pill.
//
// Mesma solução — e mesmo molde — do ADO 67948, que tornou clicável a linha
// "Perfil / Risco" (`PerfilCreditoDetalhesTrigger`): o resumo que já está na
// tela vira o gatilho do detalhamento.

/**
 * Modal do detalhamento. Puramente casca: quem carrega e renderiza o conteúdo
 * é o próprio {@link DdiPanel}.
 */
function DdiDetalhesModal({
  opportunityId,
  subtitulo,
  onClose,
}: {
  opportunityId: string;
  subtitulo?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const conteudo = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ddi-detalhes-titulo"
        data-testid="ddi-detalhes-modal"
        /*
         * `text-left` explícito: o gatilho vive dentro de linhas alinhadas à
         * direita (o `AnRow` do workspace SNEG e o `justify-between` do card
         * "Análises"), e sem isto o card inteiro herdava aquele alinhamento —
         * exatamente o que aconteceu no ADO 67948.
         */
        className="flex max-h-[calc(100vh-40px)] w-full max-w-[460px] flex-col overflow-hidden rounded-[var(--radius-md)] bg-white text-left shadow-[0_20px_50px_rgba(0,0,0,.3)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--color-border) px-5 py-[18px]">
          <div>
            <h4 id="ddi-detalhes-titulo" className="text-(length:--t-h4) font-bold">
              Análise de integridade (DDI)
            </h4>
            {subtitulo && (
              <p className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">
                {subtitulo}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {/*
           * O CORPO é o próprio painel, não um segundo renderizador.
           *
           * Ele já traz Status · Risco · Score · "Racional / critérios" ·
           * "Achados (N)" · "Parecer de integridade" · reclassificação ·
           * decisão do LT, com estados de carga e erro próprios. Escrever um
           * segundo componente para os mesmos campos criaria duas telas do
           * mesmo dado, que é a divergência que este repositório combate — e
           * elas divergiriam justamente no campo que alguém acrescentasse a só
           * uma delas.
           *
           * `readOnly` mantém o "Reclassificar" fora: aquele write é da
           * Integridade e vive no formulário do ticket. `bare` tira a moldura e
           * o título duplicados — o modal já os fornece.
           */}
          <DdiPanel opportunityId={opportunityId} readOnly bare />
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  /*
   * Portal no `body`: o card "Análises" vive numa coluna `lg:sticky`, e
   * `position: sticky` cria stacking context — sem o portal o `z-[200]` fica
   * preso dentro dele e o modal renderiza atrás do resto da tela.
   */
  return createPortal(conteudo, document.body);
}

/**
 * Torna clicável o resumo do DDI e abre o detalhamento (ADO 67882).
 *
 * ## Um componente, duas telas
 *
 * Montado no card "Análises" da oportunidade (a visão do LT, onde o bug foi
 * reportado) e na linha "DDI · Integridade" do workspace SNEG. Se cada tela
 * abrisse o próprio detalhe, as duas divergiriam — que é a razão de o
 * `PerfilCreditoDetalhesTrigger` existir com esta mesma forma.
 *
 * ## A busca é TARDIA
 *
 * O `DdiPanel` só monta — e só chama `GET .../ddi` — quando o modal abre. As
 * telas que exibem a pill já buscaram o resumo no render; carregar o detalhe
 * junto poria uma requisição a mais em toda pintura para um modal que quase
 * nunca é aberto.
 *
 * ## Sem gate de permissão, e isso é deliberado
 *
 * `GET /v1/opportunities/:id/ddi` não tem `@Roles` — todo perfil autenticado
 * lê. Diferente do perfil de crédito (`@Roles(LT, SNEG, CCOB, ADMIN)`), aqui
 * não há perfil a quem o clique renderizaria um 403, então não há controle
 * morto a esconder.
 */
export function DdiDetalhesTrigger({
  opportunityId,
  children,
  subtitulo,
}: {
  opportunityId: string;
  /** O texto do gatilho — normalmente a pill já exibida na linha. */
  children: ReactNode;
  /** Cabeçalho do modal: a oportunidade a que a análise se refere. */
  subtitulo?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const { can } = usePermissions();

  /*
   * Sem `DdiView` (Matriz RBAC v2.1) o detalhamento responderia 403 — o resumo
   * que o chamador já tem fica na tela, só deixa de ser gatilho.
   */
  if (!can(Permission.DdiView)) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Ver detalhes da análise de integridade"
        data-testid="ddi-detalhes-trigger"
        className="text-left underline decoration-dotted decoration-from-font underline-offset-2 hover:decoration-solid"
      >
        {children}
      </button>

      {aberto && (
        <DdiDetalhesModal
          opportunityId={opportunityId}
          subtitulo={subtitulo}
          onClose={() => setAberto(false)}
        />
      )}
    </>
  );
}
