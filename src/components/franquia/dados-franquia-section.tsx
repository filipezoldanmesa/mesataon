'use client';

import { useCallback, useState } from 'react';

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
import { DadosModal } from '@/components/franquia/proposta-franquia-modais';
import { BlocoFranquia } from '@/lib/franquia/ajuste';
import type {
  DadosFranquiaData,
  FapPotencialData,
  FrqSectionResult,
} from '@/lib/franquia/proposta-franquia-mapping';
import {
  updateDadosFranquia as defaultUpdateDadosFranquia,
} from '@/lib/franquia/dados.data';
import {
  GRUPO_CONTAS_LABEL,
  isSituacaoLoja,
} from '@/lib/franquia/types';
import { formatBrlString, formatDateBR, maskMoneyInput, parseMoneyInput } from '@/lib/franquia/format';
import {
  RASCUNHO_DADOS_VAZIO,
  type DadosFranquiaRascunho,
} from '@/lib/franquia/nova-proposta-franquia';

/**
 * "Dados da franquia" block of `03-proposta-franquia.html` (FRQ-11).
 *
 * Identity rows — the prototype's five, always read-only:
 *   1. Tipo de franquia
 *   2. Grupo de contas — the org's `Account.Grupo_De_Contas__c` label
 *      (`ZBRM - BR MANIA` / `ZLUB - LUBRAX+`), measured 25/08/2026
 *   3. Código da franquia — `codigoMaterialSap`, the code FRQ-19 reconciles
 *   4. Vínculo ao posto — `postoVinculoLabel` from the backend read model
 *   5. Finalidade
 *
 * Executivo de franquia is kept after the mandatory identity fields when
 * present (conditional — only known after routing, RN-F6-01). Decision
 * registered: VBR-506 "manter fora do bloco de identidade → kept in the same
 * DGrid as supplementary info, after the required fields".
 *
 * Negotiation fields (situação da loja, tipo de implantação, início da
 * operação, faturamento proposto, "de acordo com a FAP?", "possui exceção?")
 * render as the prototype's form controls when the backend verdict allows it
 * (`editavelPorFranquia.dadosFranquia` — LT while
 * `EM_PREENCHIMENTO`/`DEVOLVIDA`), saving through
 * `PATCH .../franquia/:proposalId/dados`.
 */
export function DadosFranquiaSection({
  opportunityId,
  proposalId,
  dados,
  fap,
  editavel,
  onChanged,
  headerExtra,
  updateDados = defaultUpdateDadosFranquia,
}: {
  opportunityId: string;
  proposalId: string;
  dados: FrqSectionResult<DadosFranquiaData>;
  /** Same section result the FAP block consumes — the "de acordo com a FAP?"
   *  and "possui exceção" answers live in the FAP/potencial payload. */
  fap: FrqSectionResult<FapPotencialData>;
  /** `vereditos.editavelPorFranquia.dadosFranquia` (backend verdict). */
  editavel: boolean;
  onChanged: () => void;
  headerExtra?: React.ReactNode;
  /** Injectable for tests. */
  updateDados?: typeof defaultUpdateDadosFranquia;
}) {
  const { can, canWrite } = usePermissions();
  const podeEditar =
    canWrite && can(Permission.FranquiaPropostaManage) && editavel;

  if (dados.status === 'unavailable' || dados.data === null) {
    return (
      <Block
        title="Dados da franquia"
        bloco={BlocoFranquia.DadosFranquia}
        headerExtra={headerExtra}
      >
        <SectionUnavailable
          testId="dados-franquia-unavailable"
          message={
            dados.error
              ? `Dados da franquia indisponíveis (${dados.error}).`
              : undefined
          }
        />
      </Block>
    );
  }

  const d = dados.data;
  const f = fap.status === 'ok' ? fap.data : null;

  return (
    <Block
      title="Dados da franquia"
      bloco={BlocoFranquia.DadosFranquia}
      headerExtra={headerExtra}
    >
      <div className="mb-4">
        <DGrid>
          <DField label="Tipo de franquia" value={d.bandeiraLabel} testId="dados-bandeira" />
          {/*
            As duas linhas do protótipo (ver o comentário gêmeo em
            `nova-proposta-franquia-screen.tsx`). VBR-506 as fundiu e pôs o
            código cru sob o rótulo de grupo de contas; a bandeira é as DUAS
            coisas, então cada uma volta com o valor que é dela.

            Bandeira fora do catálogo ⇒ o grupo de contas fica em branco, nunca
            num palpite: `bandeira` é `null` justamente quando o fio trouxe algo
            que não sabemos ler.
          */}
          <DField
            label="Grupo de contas"
            value={d.bandeira === null ? null : GRUPO_CONTAS_LABEL[d.bandeira]}
            testId="dados-grupo-contas"
          />
          {/*
            Aqui o código sai da COLUNA (`codigoMaterialSap`), não da bandeira:
            é o campo que a pendência `CODIGO_FRANQUIA_ZBRM_ZLUB` (FRQ-19)
            cobra e reconcilia, e ele pode estar legitimamente vazio enquanto
            ela está aberta. Derivar da bandeira exibiria um código que ninguém
            preencheu, com a pendência dizendo o contrário na mesma tela.
          */}
          <DField
            label="Código da franquia"
            value={d.codigoMaterialSap}
            testId="dados-codigo-franquia"
          />
          <DField
            label="Vínculo ao posto"
            value={d.postoVinculoLabel}
            testId="dados-vinculo-posto"
          />
          <DField label="Finalidade" value={d.finalidade} testId="dados-finalidade" />
          {d.evNome !== null && (
            <DField label="Executivo de franquia" value={d.evNome} testId="dados-ev" />
          )}
        </DGrid>
      </div>

      {/*
       * A grade de negociação é SEMPRE somente-leitura, e a edição acontece no
       * modal — o modelo do protótipo (`#dadModal` + `.addrow`), o mesmo que a
       * tela de criação usa. Até 26/08/2026 esta tela abria os campos inline
       * dentro do card quando o veredito permitia, então o usuário cadastrava a
       * franquia num modelo e a reabria em outro.
       */}
      <DGrid>
        <DField
          label="Situação atual da loja"
          value={d.situacaoLojaLabel}
          testId="dados-situacao"
        />
        <DField
          label="Tipo de implantação"
          value={d.tipoImplantacao}
          testId="dados-implantacao"
        />
        <DField
          label="Início da operação prevista"
          value={formatDateBR(d.inicioOperacaoPrevista)}
          testId="dados-inicio-operacao"
        />
        <DField
          label="Faturamento proposto atual"
          value={f ? formatBrlString(f.faturamentoPropostoBrl) : null}
          testId="dados-faturamento"
        />
        <DField
          label="Faturamento está de acordo com a FAP?"
          value={boolLabel(f?.faturamentoDeAcordoComFap)}
          testId="dados-fat-fap"
        />
        <DField
        label="Possui exceção no cálculo de royalties"
        value={boolLabel(f?.possuiExcecaoRoyalties)}
        testId="dados-possui-excecao"
        />
      </DGrid>

      {podeEditar && (
        <DadosEdicao
          opportunityId={opportunityId}
          proposalId={proposalId}
          dados={d}
          fap={f}
          onChanged={onChanged}
          updateDados={updateDados}
        />
      )}

      {d.observacoes !== null && (
        <Alert tone="info" testId="dados-observacoes">
          {d.observacoes}
        </Alert>
      )}
    </Block>
  );
}

function boolToSelect(value: boolean | null | undefined): string {
  if (value === true) return 'sim';
  if (value === false) return 'nao';
  return '';
}

function selectToBool(value: string): boolean | null {
  if (value === 'sim') return true;
  if (value === 'nao') return false;
  return null;
}

/**
 * `true`/`false` → pt-BR; `null`/`undefined` stays absent so the caller renders
 * an em dash. A missing answer must not read as "Não".
 */
function boolLabel(value: boolean | null | undefined): string | null {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return null;
}

// ---------------------------------------------------------------------------
// Edição — botão do protótipo (.addrow) + o MESMO modal da tela de criação
// ---------------------------------------------------------------------------

/**
 * O modal é `DadosModal`, compartilhado com `nova-proposta-franquia-screen`.
 * Duas diferenças, ambas declaradas como prop e não como cópia do componente:
 *
 * - **FAP, fotos e potencial ficam de fora** (`incluirFapPotencialFotos`): aqui
 *   eles têm card próprio, com três caminhos de escrita e o "Solicitar ajuste"
 *   do analista incidindo só neles (FRQ-14).
 * - **"Possui exceção no cálculo de royalties" entra** — pergunta que só esta
 *   tela faz, porque só ela tem o `PATCH .../dados` e só ela exibe a resposta.
 *
 * A finalidade **nunca** é perguntada (`herancaResolvida={false}`): ela foi
 * respondida na criação, está persistida e a grade acima a afirma como fato —
 * não existe caminho de escrita para ela depois disso.
 */
function DadosEdicao({
  opportunityId,
  proposalId,
  dados,
  fap,
  onChanged,
  updateDados,
}: {
  opportunityId: string;
  proposalId: string;
  dados: DadosFranquiaData;
  fap: FapPotencialData | null;
  onChanged: () => void;
  updateDados: typeof defaultUpdateDadosFranquia;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preenchido =
    dados.situacaoLoja !== null ||
    dados.tipoImplantacao !== null ||
    dados.inicioOperacaoPrevista !== null ||
    (fap?.faturamentoPropostoBrl ?? null) !== null;

  const handleSave = useCallback(
    async (value: DadosFranquiaRascunho) => {
      setSalvando(true);
      setError(null);
      try {
        await updateDados(opportunityId, proposalId, {
          situacaoLoja: isSituacaoLoja(value.situacaoLoja)
            ? value.situacaoLoja
            : null,
          tipoImplantacao:
            value.tipoImplantacao.trim() === '' ? null : value.tipoImplantacao,
          inicioOperacaoPrevista:
            value.inicioOperacaoPrevista === ''
              ? null
              : value.inicioOperacaoPrevista,
          faturamentoPropostoBrl: parseMoneyInput(value.faturamentoProposto),
          faturamentoDeAcordoComFap: selectToBool(value.faturamentoDeAcordoComFap),
          possuiExcecaoRoyalties: selectToBool(value.possuiExcecaoRoyalties),
        });
        setAberto(false);
        onChanged();
      } catch (err) {
        /* O modal fica ABERTO no erro: as respostas do usuário são o payload
           inteiro, e fechá-lo as descartaria (mesma regra do modal de ajuste). */
        setError(
          err instanceof Error
            ? err.message
            : 'Falha ao salvar os dados da franquia.',
        );
      } finally {
        setSalvando(false);
      }
    },
    [updateDados, opportunityId, proposalId, onChanged],
  );

  return (
    <>
      {dados.bandeira !== null && (
        <AddRowButton onClick={() => setAberto(true)} testId="abrir-dados">
          {preenchido
            ? 'Editar dados da franquia'
            : '+ Cadastrar dados da franquia'}
        </AddRowButton>
      )}

      {aberto && dados.bandeira !== null && (
        <DadosModal
          error={error}
          dados={{
            ...RASCUNHO_DADOS_VAZIO,
            situacaoLoja: dados.situacaoLoja ?? '',
            tipoImplantacao: dados.tipoImplantacao ?? '',
            inicioOperacaoPrevista: dados.inicioOperacaoPrevista ?? '',
            faturamentoProposto: moneyToInput(fap?.faturamentoPropostoBrl),
            faturamentoDeAcordoComFap: boolToSelect(
              fap?.faturamentoDeAcordoComFap,
            ) as DadosFranquiaRascunho['faturamentoDeAcordoComFap'],
            possuiExcecaoRoyalties: boolToSelect(
              fap?.possuiExcecaoRoyalties,
            ) as DadosFranquiaRascunho['possuiExcecaoRoyalties'],
          }}
          bandeira={dados.bandeira}
          /*
            A finalidade NÃO é editável aqui: ela vive em `Proposal`, é gravada
            na criação, e o `PATCH .../franquia/:proposalId/dados` não a aceita.
            Exibi-la neste modal seria formulário sem destino. Ela aparece como
            FATO na grade de identidade deste card.
          */
          incluirFinalidade={false}
          incluirFapPotencialFotos={false}
          incluirPossuiExcecao
          salvando={salvando}
          onCancel={() => setAberto(false)}
          onSave={(value) => void handleSave(value)}
        />
      )}
    </>
  );
}

/** `numeric(14,2)` do fio → a string mascarada que o input do modal espera. */
function moneyToInput(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return maskMoneyInput(String(Math.round(Number(value) * 100)));
}
