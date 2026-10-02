'use client';

import { useCallback, useState } from 'react';

import { StatusPill } from '@/components/status-pill';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  AddRowButton,
  Alert,
  Block,
  DField,
  DGrid,
  SectionUnavailable,
} from '@/components/franquia/franquia-ui';
import { CofModal } from '@/components/franquia/proposta-franquia-modais';
import { updateDadosFranquia as defaultUpdateDadosFranquia } from '@/lib/franquia/dados.data';
import type {
  CofData,
  FrqSectionResult,
} from '@/lib/franquia/proposta-franquia-mapping';
import { franquiaPillVariant } from '@/lib/franquia/types';
import { formatDateBR } from '@/lib/franquia/format';
import { BlocoFranquia } from '@/lib/franquia/ajuste';

/**
 * "COF · Circular de Oferta de Franquia" block (FRQ-13, HU-09).
 *
 * ## Visibility is the backend's verdict, not a local string comparison
 *
 * The COF only exists for a **Nova** store (RN-F5-01) — the consumer that
 * creates the record checks `situacaoLoja` and skips "Em operação" entirely.
 * So the presence of `cof.data` **is** the verdict: `data === null` means the
 * COF does not apply and the block is not rendered at all. The prototype
 * toggles the block from the "Tipo de implantação" `<select>`; reproducing that
 * comparison here would let the screen show a COF the backend never created.
 *
 * ## O que é editável, e o que não é
 *
 * O DESTINATÁRIO é — `PATCH .../franquia/:proposalId/dados` aceita
 * `cofDestinatarioEmail`, e é o mesmo `CofModal` (`#cofModal` do protótipo) que
 * a tela de criação usa. Enquanto este card era só leitura, o e-mail respondido
 * na criação não tinha nenhum caminho de correção depois — pendência que o
 * CLAUDE.md nomeava.
 *
 * O DISPARO não é: ele acontece no GATE 1 (RN-F5-01) e a tela apenas o
 * acompanha (HU-09). O "Simular disparo (demo)" do protótipo é artefato de
 * página estática — portá-lo criaria um controle que não faz o que diz.
 *
 * ⚠️ O endereço é PII: nunca vai a log, a span nem a mensagem de erro.
 */
export function CofSection({
  opportunityId,
  proposalId,
  cof,
  editavel,
  onChanged,
  updateDados = defaultUpdateDadosFranquia,
}: {
  opportunityId: string;
  proposalId: string;
  cof: FrqSectionResult<CofData>;
  /** `vereditos.editavelPorFranquia.cof` (veredito do backend). */
  editavel: boolean;
  onChanged: () => void;
  /** Injectable for tests. */
  updateDados?: typeof defaultUpdateDadosFranquia;
}) {
  if (cof.status === 'unavailable') {
    return (
      <Block
        title="COF · Circular de Oferta de Franquia"
        bloco={BlocoFranquia.Cof}
      >
        <SectionUnavailable
          testId="cof-unavailable"
          message={cof.error ? `COF indisponível (${cof.error}).` : undefined}
        />
      </Block>
    );
  }

  // Not applicable to this proposal — render nothing (see the visibility note).
  if (cof.data === null) return null;

  const data = cof.data;

  return (
    <Block
      title="COF · Circular de Oferta de Franquia"
      bloco={BlocoFranquia.Cof}
      headerExtra={
        <StatusPill
          variant={franquiaPillVariant(data.statusCofPill)}
          data-testid="cof-status-pill"
        >
          {data.statusCofLabel}
        </StatusPill>
      }
    >
      <DGrid>
        <DField
          label="Documento"
          value="Circular de Oferta de Franquia (modelo)"
        />
        <DField label="Canal" value="E-mail (automatizado)" />
        {/*
         * Sem resposta é travessão, não uma frase descrevendo para onde a COF
         * iria (04/09/2026). O fallback do primeiro contato do CRM continua no
         * backend — linha anterior a esta regra, catch-up —, mas com o GATE 1
         * exigindo o destinatário, anunciá-lo aqui contradiria a pendência que
         * a barra logo abaixo lista.
         */}
        <DField
          label="Destinatário"
          value={data.destinatarioEmail}
          testId="cof-destinatario"
        />
        <DField
          label="Número da COF"
          value={data.numeroCof}
          testId="cof-numero"
        />
        <DField
          label="Prazo legal"
          value="14 dias antes do envio à assinatura"
        />
        <DField
          label="Data de envio"
          value={formatDateBR(data.cofEnviadaEm)}
          testId="cof-enviada-em"
        />
        <DField
          label="Assinatura liberada a partir de"
          value={formatDateBR(data.dataMinAssinatura)}
          testId="cof-data-min"
        />
        <DField
          label="Enviada para assinatura em"
          value={formatDateBR(data.enviadoAssinaturaEm)}
          testId="cof-enviada-assinatura"
        />
        <DField
          label="Assinada em"
          value={formatDateBR(data.assinadoEm)}
          testId="cof-assinada-em"
        />
      </DGrid>

      {/*
       * Tracking sentence for the 14-day window (RN-F5-02) — only once the COF
       * has actually been dispatched, because only then is there a window to
       * track.
       *
       * The third branch was an `Alert tone="info"` restating RN-F5-01 ("a COF
       * será disparada quando a proposta for enviada para análise"). It is a
       * rule, not a state of this record, and the backend already enforces it
       * by not creating the row — so the box told the reader nothing about the
       * proposal in front of them. Removed with the two on the creation screen.
       */}
      <CofDestinatario
        opportunityId={opportunityId}
        proposalId={proposalId}
        email={data.destinatarioEmail}
        editavel={editavel}
        onChanged={onChanged}
        updateDados={updateDados}
      />

      {data.cofEnviadaEm === null ? null : data.prazoLegalCumprido === true ? (
        <Alert tone="ok" testId="cof-tracking-cumprido">
          Prazo legal de 14 dias cumprido — o envio ao portal de assinaturas está
          liberado desde {formatDateBR(data.dataMinAssinatura) ?? '—'}.
        </Alert>
      ) : (
        <Alert tone="warn" testId="cof-tracking-em-curso">
          Prazo legal de 14 dias em curso — o envio ao portal de assinaturas fica
          liberado a partir de {formatDateBR(data.dataMinAssinatura) ?? '—'}.
        </Alert>
      )}
    </Block>
  );
}

// ---------------------------------------------------------------------------
// Destinatário — botão do protótipo (.addrow) + o MESMO modal da criação
// ---------------------------------------------------------------------------

function CofDestinatario({
  opportunityId,
  proposalId,
  email,
  editavel,
  onChanged,
  updateDados,
}: {
  opportunityId: string;
  proposalId: string;
  email: string | null;
  editavel: boolean;
  onChanged: () => void;
  updateDados: typeof defaultUpdateDadosFranquia;
}) {
  const { can, canWrite } = usePermissions();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const podeEditar =
    canWrite && can(Permission.FranquiaPropostaManage) && editavel;

  const handleSave = useCallback(
    async (valor: string) => {
      setSalvando(true);
      setError(null);
      try {
        /* O modal recusa o campo vazio, então aqui sempre há endereço. O `null`
           permanece como o único jeito de LIMPAR pela API — a tela não o
           oferece mais, mas o backend continua aceitando (PRD F5). */
        await updateDados(opportunityId, proposalId, {
          cofDestinatarioEmail: valor === '' ? null : valor,
        });
        setAberto(false);
        onChanged();
      } catch (err) {
        /* Nunca ecoar o endereço na mensagem: é PII. */
        setError(
          err instanceof Error
            ? err.message
            : 'Falha ao salvar o destinatário da COF.',
        );
      } finally {
        setSalvando(false);
      }
    },
    [updateDados, opportunityId, proposalId, onChanged],
  );

  if (!podeEditar) return null;

  return (
    <>
      <AddRowButton onClick={() => setAberto(true)} testId="abrir-cof">
        {email === null ? '+ Cadastrar envio da COF' : 'Editar envio da COF'}
      </AddRowButton>

      {aberto && (
        <CofModal
          email={email ?? ''}
          salvando={salvando}
          error={error}
          onCancel={() => setAberto(false)}
          onSave={(valor) => void handleSave(valor)}
        />
      )}
    </>
  );
}
