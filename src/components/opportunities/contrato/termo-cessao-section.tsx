'use client';

import type { TermoCessaoData, PacoteItem } from '@/lib/contratos/contrato-mapping';
import { contratoPillVariant } from '@/lib/contratos/pill-variant';
import { StatusPill } from '@/components/status-pill';

/**
 * Seção "Termo de Cessão" (protótipo `01g`, `#cessao`).
 *
 * ## Por que ela existe separada da Assinatura
 *
 * O Termo tem um ciclo a mais que as outras minutas: viaja no pacote principal
 * como qualquer uma delas e, **depois que todo mundo assina**, o documento
 * assinado sai de novo — sozinho — para a empresa homologada. O protótipo é
 * explícito sobre a separação ser intencional: *"A empresa homologada recebe
 * apenas o Termo de Cessão — ela não visualiza as demais minutas do pacote. É
 * uma separação intencional (não é uma etapa esquecida)."*
 *
 * ## O que esta seção NÃO decide
 *
 * Nada. `situacaoLabel`, `podeEnviar` e `podeAnular` são vereditos do backend —
 * quem sabe o estado dos dois envelopes é ele, e uma segunda regra aqui
 * divergiria exatamente no caso ambíguo (o pacote principal que conclui entre o
 * render e o clique).
 */
export function TermoCessaoSection({
  termo,
  pacoteHomologada,
  onEnviar,
  onAnular,
}: {
  termo: TermoCessaoData;
  /** O pacote 2, quando existe — para listar quem assina e em que estado está. */
  pacoteHomologada: PacoteItem | null;
  /** Undefined = o perfil não pode enviar (o botão some, a frase fica). */
  onEnviar?: () => void;
  /** Undefined = o perfil não pode anular. */
  onAnular?: () => void;
}) {
  return (
    <div data-testid="termo-cessao-section">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-(length:--t-caption) text-(--color-text-muted)">Documento</dt>
          <dd className="text-(length:--t-caption) font-bold">
            {termo.minutaNome ?? 'Termo de Cessão de Crédito'}
            {!termo.minutaDisponivel && (
              <span className="ml-2 font-normal text-(--color-text-muted)">
                (ainda não anexado)
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-(length:--t-caption) text-(--color-text-muted)">Situação</dt>
          <dd>
            <StatusPill
              variant={contratoPillVariant(termo.situacaoPill)}
              size="sm"
              data-testid="termo-cessao-pill"
            >
              {termo.situacaoLabel}
            </StatusPill>
          </dd>
        </div>
        <div>
          <dt className="text-(length:--t-caption) text-(--color-text-muted)">Destinatário</dt>
          <dd className="text-(length:--t-caption) font-bold">Empresa homologada</dd>
        </div>
      </dl>

      {/*
        A frase do protótipo, verbatim. Ela existe para quem olha a tela e acha
        que faltou mandar as outras minutas para a homologada.
      */}
      <p className="mt-4 rounded-[var(--radius-xs)] bg-(--color-info-bg) px-3 py-2.5 text-(length:--t-caption) text-(--color-info)">
        A empresa homologada recebe <b>apenas o Termo de Cessão</b> — ela não
        visualiza as demais minutas do pacote. É uma separação intencional (não é
        uma etapa esquecida).
      </p>

      {/*
        ⚠️ O pacote ANULADO não lista signatários. Ele continua no payload — é o
        último fato conhecido sobre a sequência 2 —, mas os status dele pararam
        no momento da anulação: a tela mostrava "Pendente" para pessoas que não
        podem mais assinar nada, ao lado da frase que diz que o envio foi
        anulado. Medido na tela em 13/09/2026.
      */}
      {pacoteHomologada && termo.situacao !== 'ANULADO' && (
        <ul className="mt-4 flex flex-col gap-2" data-testid="termo-cessao-signatarios">
          {pacoteHomologada.signatarios.map((signatario) => (
            <li
              key={signatario.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-xxs)] border border-(--color-border) px-3 py-2"
            >
              {/*
                `papelLabel` já traz o nome para este papel — o backend monta
                "Homologada — <nome>" no mesmo molde de LT e Cliente. Concatenar
                o nome aqui o repetiria.
              */}
              <span className="text-(length:--t-caption)">
                <b>
                  {signatario.sequencia} · {signatario.papelLabel}
                </b>
              </span>
              <StatusPill variant={contratoPillVariant(signatario.statusPill)} size="sm">
                {signatario.statusLabel}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}

      {(onEnviar ?? onAnular) && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {onAnular && (
            <button
              type="button"
              data-testid="termo-cessao-anular"
              onClick={onAnular}
              className="rounded-[var(--radius-xxs)] border border-(--color-border) px-3.5 py-2 text-(length:--t-caption) font-bold text-(--color-danger) hover:bg-(--color-danger-bg)"
            >
              Anular envio
            </button>
          )}
          {onEnviar && (
            <button
              type="button"
              data-testid="termo-cessao-enviar"
              onClick={onEnviar}
              className="rounded-[var(--radius-xxs)] bg-(--secondary-500) px-3.5 py-2 text-(length:--t-caption) font-bold text-white hover:brightness-110"
            >
              Enviar para assinatura da homologada
            </button>
          )}
        </div>
      )}
    </div>
  );
}
