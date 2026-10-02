'use client';

import { useCallback, useState } from 'react';

import { StatusPill } from '@/components/status-pill';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  AddRowButton,
  Alert,
  BTN_PRIMARY,
  Block,
  DField,
  DGrid,
  SectionUnavailable,
} from '@/components/franquia/franquia-ui';
import {
  ParecerModal,
  type ParecerDecisao,
} from '@/components/franquia/proposta-franquia-modais';
import { BlocoFranquia } from '@/lib/franquia/ajuste';
import type {
  ParecerFranquiaData,
  FrqSectionResult,
} from '@/lib/franquia/proposta-franquia-mapping';
import {
  decidirParecerAntecipado as defaultDecidirParecer,
} from '@/lib/franquia/parecer.data';
import { ProposalStatus } from '@/lib/opportunities/types';
import {
  ResultadoParecerFranquia,
  franquiaPillVariant,
  isFrqPillCode,
} from '@/lib/franquia/types';
import { formatDateBR } from '@/lib/franquia/format';

/**
 * "Parecer antecipado do time de franquias" block (FRQ-8 — RN-F6-02/03/04).
 *
 * Rendered only when the opinion is exigido (potencial above the J10 limit) or
 * a parecer record already exists — for a below-limit proposal the block is
 * absent, mirroring RN-F4-02 ("parecer dispensado").
 *
 * The decision buttons follow `Permission.FranquiaParecerDecidir` +
 * `vereditos.editavelPorFranquia.parecerFranquia` (mirror of the backend
 * `@Roles(GESTOR_FRANQUIAS, CONSULTOR_EXPANSAO, ADMIN)`); the recall belongs to
 * the LT (`FranquiaPropostaManage`) and only exists while the result is
 * REJEITADO (RN-F6-04). The mandatory-justification rule for ressalvas and
 * rejeição is enforced by the backend — its sentence renders inline.
 */
export function ParecerFranquiaSection({
  opportunityId,
  franquiaId,
  parecer,
  parecerExigido,
  statusProposta,
  editavel,
  onChanged,
  decidirParecer = defaultDecidirParecer,
}: {
  opportunityId: string;
  /** `dadosFranquia.franquiaId` — the parecer routes key on the franquia. */
  franquiaId: string | null;
  parecer: FrqSectionResult<ParecerFranquiaData>;
  /** `vereditos.parecerExigido` (RN-F4-02) — null while the potencial is unknown. */
  parecerExigido: boolean | null;
  /**
   * `dadosFranquia.statusProposta` — `null` quando a seção de dados degradou.
   * Governa apenas a VISIBILIDADE do card enquanto nada foi emitido (ver abaixo).
   */
  statusProposta: ProposalStatus | null;
  /** `vereditos.editavelPorFranquia.parecerFranquia`. */
  editavel: boolean;
  onChanged: () => void;
  /** Injectable for tests. */
  decidirParecer?: typeof defaultDecidirParecer;
}) {
  const { can, canWrite } = usePermissions();

  const data = parecer.status === 'ok' ? parecer.data : null;

  /*
   * O parecer não existe enquanto a proposta está sendo PREENCHIDA.
   *
   * Quem o emite é o time de franquias, e ele só é acionado no envio à análise —
   * pela pendência `franquia:parecer`, aberta pelo
   * `FranquiaParecerPendenciaConsumer` (RN-F6-02). Antes disso o card mostrava
   * um bloco vazio, com o rótulo de uma etapa que ninguém podia executar, ao
   * lado de uma barra que recusava o envio por causa dele.
   *
   * Um status desconhecido (`null` — a seção de dados degradou) é tratado como
   * "ainda em preenchimento": esconder um card informativo por leitura
   * incompleta é a degradação barata; mostrá-lo repetiria o defeito.
   */
  const emPreenchimento =
    statusProposta === null ||
    statusProposta === ProposalStatus.EmPreenchimento ||
    statusProposta === ProposalStatus.Devolvida;

  /*
   * Registro JÁ existente sempre renderiza, inclusive em `DEVOLVIDA` — depois de
   * um recall (RN-F6-04) a proposta volta a ser editável e o histórico do
   * parecer é justamente o que explica por quê.
   */
  if (parecer.status === 'ok' && data === null && (parecerExigido !== true || emPreenchimento)) {
    return null;
  }

  if (parecer.status === 'unavailable') {
    return (
      <Block title="Parecer antecipado · time de franquias" bloco={BlocoFranquia.ParecerFranquia}>
        <SectionUnavailable
          testId="parecer-unavailable"
          message={
            parecer.error ? `Parecer indisponível (${parecer.error}).` : undefined
          }
        />
      </Block>
    );
  }

  const podeDecidir =
    canWrite && can(Permission.FranquiaParecerDecidir) && editavel;
  const podeRecall =
    canWrite &&
    can(Permission.FranquiaPropostaManage) &&
    data?.resultado === ResultadoParecerFranquia.Rejeitado;

  return (
    <Block
      title="Parecer antecipado · time de franquias"
      bloco={BlocoFranquia.ParecerFranquia}
      headerExtra={
        data?.resultado != null ? (
          <StatusPill
            variant={franquiaPillVariant(
              isFrqPillCode(data.resultadoPill) ? data.resultadoPill : null,
            )}
            data-testid="parecer-resultado-pill"
          >
            {data.resultadoLabel ?? '—'}
          </StatusPill>
        ) : (
          <StatusPill variant="warning" data-testid="parecer-pendente-pill">
            Pendente
          </StatusPill>
        )
      }
    >
      <DGrid>
        <DField
          label="Resultado"
          value={data?.resultadoLabel ?? 'Aguardando parecer'}
          testId="parecer-resultado"
        />
        <DField
          label="Submetido em"
          value={formatDateBR(data?.submetidoEm ?? null)}
          testId="parecer-submetido-em"
        />
      </DGrid>

      {/*
       * ADO 68191 — a REAPRESENTAÇÃO fica visível.
       *
       * O recall do LT (RN-F6-04) zera o parecer, então este card volta a
       * "Aguardando parecer" com `Submetido em: —`: sem esta linha ele é
       * indistinguível do card de uma franquia que nunca teve parecer, e o time
       * de franquias reabre a tela sem saber que já rejeitou antes. Medido em
       * staging em 08/09/2026 na `PCR-RODSUL-000097`, onde duas rodadas de
       * rejeição + recall aconteceram em 4 minutos e produziram três pendências
       * de título idêntico — a queixa literal do ticket.
       *
       * `> 0` e não truthy: `0` é a primeira rodada, e "reapresentação #0"
       * leria como uma rodada que não existe.
       *
       * ⚠️ **A FRASE ramifica em `resultado`, e a versão que não ramificava era o
       * defeito.** `numRecalls` é HISTÓRICO: ele continua > 0 depois de a rodada
       * nova ser decidida. Medido em staging em 09/09/2026 na mesma
       * `PCR-RODSUL-000097` — o card lia, no mesmo bloco, `[Aprovado]` /
       * `RESULTADO: Aprovado` / `SUBMETIDO EM: 09/09/2026` e, logo abaixo, *"é
       * preciso emitir um novo"*: o aviso mandava fazer o que o card acima diz
       * feito. O imperativo só é verdade enquanto o parecer está pendente.
       *
       * `tone="warn"` e o MESMO `testId` nos dois ramos de propósito: o fato é o
       * mesmo (esta não é a primeira rodada), e ele continua merecendo o destaque
       * de exceção — um parecer de 2ª reapresentação não se lê como um de 1ª.
       * Muda só a frase.
       */}
      {(data?.numRecalls ?? 0) > 0 && (
        <Alert tone="warn" testId="parecer-reapresentacao">
          {data?.resultado == null ? (
            <>
              Franquia reapresentada pelo LT — {data?.numRecalls}ª reapresentação
              (RN-F6-04). O parecer anterior foi <b>rejeitado</b> e zerado; é
              preciso emitir um novo.
            </>
          ) : (
            <>
              Este parecer é o da {data?.numRecalls}ª reapresentação (RN-F6-04) —
              o anterior foi <b>rejeitado</b> e zerado pelo LT.
            </>
          )}
        </Alert>
      )}

      {data?.texto != null && (
        <Alert tone="info" testId="parecer-texto">
          {data.texto}
        </Alert>
      )}

      {parecerExigido === true && data?.resultado == null && (
        <Alert tone="warn" testId="parecer-exigido-aviso">
          Parecer antecipado obrigatório — o potencial excede o limite
          parametrizável (RN-F4-02). A decisão corre em paralelo à análise da
          SNEG (RN-F6-02).
        </Alert>
      )}

      {/*
       * Registro pelo modal, como todos os outros cards desta tela — o modelo
       * de preenchimento do protótipo. Antes eram três botões de submit lado a
       * lado com um textarea solto no card.
       */}
      {podeDecidir && data?.resultado == null && (
        <DecisaoParecer
          opportunityId={opportunityId}
          franquiaId={franquiaId}
          onChanged={onChanged}
          decidirParecer={decidirParecer}
          podeRejeitar={can(Permission.FranquiaParecerRejeitar)}
        />
      )}

      {podeRecall && (
        <RecallForm
          opportunityId={opportunityId}
          franquiaId={franquiaId}
          onChanged={onChanged}
          decidirParecer={decidirParecer}
        />
      )}
    </Block>
  );
}

// ---------------------------------------------------------------------------
// Decisão — botão do protótipo (.addrow) + modal
// ---------------------------------------------------------------------------

function DecisaoParecer({
  opportunityId,
  franquiaId,
  onChanged,
  decidirParecer,
  podeRejeitar,
}: {
  opportunityId: string;
  franquiaId: string | null;
  onChanged: () => void;
  decidirParecer: typeof defaultDecidirParecer;
  podeRejeitar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(
    async (value: { acao: ParecerDecisao; texto: string | null }) => {
      if (franquiaId === null) return;
      setSalvando(true);
      setError(null);
      try {
        await decidirParecer(opportunityId, franquiaId, value.acao, value.texto);
        setAberto(false);
        onChanged();
      } catch (err) {
        /* Modal aberto no erro: a justificativa digitada é o payload. A frase
           da justificativa obrigatória é do backend (RN-F6-03). */
        setError(
          err instanceof Error ? err.message : 'Falha ao registrar o parecer.',
        );
      } finally {
        setSalvando(false);
      }
    },
    [decidirParecer, opportunityId, franquiaId, onChanged],
  );

  return (
    <>
      <AddRowButton onClick={() => setAberto(true)} testId="abrir-parecer">
        + Registrar parecer
      </AddRowButton>

      {aberto && (
        <ParecerModal
          podeRejeitar={podeRejeitar}
          salvando={salvando}
          error={error}
          onCancel={() => setAberto(false)}
          onSave={(value) => void handleSave(value)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Recall (LT — RN-F6-04)
// ---------------------------------------------------------------------------

function RecallForm({
  opportunityId,
  franquiaId,
  onChanged,
  decidirParecer,
}: {
  opportunityId: string;
  franquiaId: string | null;
  onChanged: () => void;
  decidirParecer: typeof defaultDecidirParecer;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recall = useCallback(async () => {
    if (franquiaId === null) return;
    setBusy(true);
    setError(null);
    try {
      await decidirParecer(opportunityId, franquiaId, 'recall', null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao reapresentar a franquia.');
    } finally {
      setBusy(false);
    }
  }, [decidirParecer, opportunityId, franquiaId, onChanged]);

  return (
    <div className="mt-3.5">
      <Alert tone="warn" testId="parecer-rejeitado-aviso">
        Franquia rejeitada pelo time de franquias. Reapresente-a para novo
        parecer após os ajustes — edição não financeira não dispara novo fluxo
        de aprovação (RN-F6-04).
      </Alert>
      <div className="mt-2.5">
        <button
          type="button"
          onClick={() => void recall()}
          disabled={busy}
          className={BTN_PRIMARY}
          data-testid="parecer-recall"
        >
          {busy ? 'Reapresentando…' : 'Reapresentar para novo parecer (recall)'}
        </button>
      </div>
      {error !== null && (
        <Alert tone="bad" testId="parecer-recall-erro">
          {error}
        </Alert>
      )}
    </div>
  );
}
