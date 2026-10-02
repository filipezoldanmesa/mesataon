'use client';

import { useCallback, useState } from 'react';

import { useConfirm } from '@/components/confirm-dialog';
import { StatusPill } from '@/components/status-pill';
import { TabelaAnexoA } from '@/components/franquia/tabela-anexo-a';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  AddRowButton,
  Alert,
  BTN_DISABLED,
  Block,
  DField,
  DGrid,
  EmptyState,
  FGrid,
  FieldLabel,
  LockChip,
  SectionUnavailable,
  SubBox,
  SubHeading,
  controlClass,
} from '@/components/franquia/franquia-ui';
import { ModeloModal } from '@/components/franquia/proposta-franquia-modais';
import {
  aceitarRoyaltyPremiado as defaultAceitarRoyaltyPremiado,
  getRoyaltyValidacoes as defaultGetValidacoes,
  setMaturacao as defaultSetMaturacao,
  setModeloLoja as defaultSetModeloLoja,
  setRoyaltyEstrutura as defaultSetRoyaltyEstrutura,
} from '@/lib/franquia/parametros.data';
import type {
  EstruturaExcecoesData,
  FrqSectionResult,
  MaturacaoData,
  ModeloParametrosData,
  RoyaltiesCalculadosData,
} from '@/lib/franquia/proposta-franquia-mapping';
import {
  BandeiraFranquia,
  ModeloRoyalty,
} from '@/lib/franquia/types';
import {
  formatBps,
  formatBrlString,
  maskMoneyInput,
  parseMoneyInput,
} from '@/lib/franquia/format';
import { BlocoFranquia } from '@/lib/franquia/ajuste';
import type { ModeloRascunho } from '@/lib/franquia/nova-proposta-franquia';

type Props = {
  opportunityId: string;
  proposalId: string;
  /**
   * Band of the proposal — narrows which royalty models may be offered
   * (Lubrax+ takes only `PERCENTUAL_FIXO`, 22/09/2026). `null` when the read model
   * could not report it: the select then offers all of them and the backend
   * refuses what does not apply, rather than the screen hiding a valid choice.
   */
  bandeira: BandeiraFranquia | null;
  parametros: FrqSectionResult<ModeloParametrosData>;
  /** Supplies the applied Anexo A band — the screen displays, never resolves it. */
  royalties: FrqSectionResult<RoyaltiesCalculadosData>;
  estrutura: FrqSectionResult<EstruturaExcecoesData>;
  /** `vereditos.editavelPorFranquia.modeloParametros` (RN-F2-06). */
  editavelParametros: boolean;
  /** `vereditos.editavelPorFranquia.estruturaExcecoes` (RN-F2-06). */
  editavelEstrutura: boolean;
  /** `vereditos.royaltyPremiadoIrreversivel` (RN-F2-07). */
  royaltyPremiadoIrreversivel: boolean;
  onChanged: () => void;

  // Injectable for tests.
  setModeloLoja?: typeof defaultSetModeloLoja;
  setRoyaltyEstrutura?: typeof defaultSetRoyaltyEstrutura;
  setMaturacao?: typeof defaultSetMaturacao;
  aceitarRoyaltyPremiado?: typeof defaultAceitarRoyaltyPremiado;
  getValidacoes?: typeof defaultGetValidacoes;
};

/**
 * "Modelo de loja e royalties" block (FRQ-12).
 *
 * Contains four sub-sections from the prototype: the commercial parameters, the
 * applied royalty table, the royalty structure/limits, and maturação + Royalty
 * Premiado.
 *
 * ## The prototype's "Editar como executivo de franquia" toggle is NOT ported
 *
 * That checkbox is a demo artefact: a static page had no session, so it faked
 * one. With real profiles the audience is already resolved — editability comes
 * from `vereditos.editavelPorFranquia` (RN-F2-06) combined with the permission
 * mirroring the route's `@Roles`. Offering a self-service "edit as someone else"
 * switch is the same mistake as the "Ver como SNEG →" link removed in ADR-0018.
 *
 * ## Medida × veredito
 *
 * Amounts (taxa, piso, teto, royalty %) render as neutral text; only the
 * applied-band marker and the irreversible-accept state become pills.
 */
export function ModeloParametrosSection({
  opportunityId,
  proposalId,
  bandeira,
  parametros,
  royalties,
  estrutura,
  editavelParametros,
  editavelEstrutura,
  royaltyPremiadoIrreversivel,
  onChanged,
  setModeloLoja = defaultSetModeloLoja,
  setRoyaltyEstrutura = defaultSetRoyaltyEstrutura,
  setMaturacao = defaultSetMaturacao,
  aceitarRoyaltyPremiado = defaultAceitarRoyaltyPremiado,
  getValidacoes = defaultGetValidacoes,
}: Props) {
  const { can, canWrite } = usePermissions();

  /*
   * Modelo de loja, TAXA DE FRANQUIA, parcelas e maturação — espelho de
   * `@Roles(LT, GestorFranquias, ConsultorExpansao, ADMIN)` nas três rotas que
   * este card escreve (`modelo-loja`, `royalty`, `maturacao`).
   *
   * ⚠️ `FranquiaPropostaManage` NÃO serve aqui: ela exclui o GestorFranquias,
   * a quem o backend abre as três.
   */
  const podeEditarParametros =
    canWrite && can(Permission.FranquiaModeloParametrosManage) && editavelParametros;
  // The structure/limits and the exceptions are the restricted step: the
  // backend gates them to the franchise team (RN-F2-06 / HU-04b.1).
  const podeEditarEstrutura =
    canWrite && can(Permission.FranquiaRoyaltyOverride) && editavelEstrutura;

  if (parametros.status === 'unavailable') {
    return (
      <Block
        title="Modelo de loja e royalties"
        bloco={BlocoFranquia.ModeloParametros}
      >
        <SectionUnavailable
          testId="parametros-unavailable"
          message={
            parametros.error
              ? `Parâmetros comerciais indisponíveis (${parametros.error}).`
              : undefined
          }
        />
      </Block>
    );
  }

  return (
    <Block
      title="Modelo de loja e royalties"
      bloco={BlocoFranquia.ModeloParametros}
      headerExtra={
        !podeEditarParametros ? <LockChip>Somente leitura</LockChip> : undefined
      }
    >
      {/*
       * O modelo é o do protótipo (`#modModal` + `.addrow`), o MESMO da tela de
       * criação: a grade é dado e a edição acontece no modal. Até 26/08/2026
       * este card trazia TRÊS formulários inline (modelo, taxa, maturação) com
       * um "Salvar" cada, e a criação já perguntava as mesmas coisas num modal
       * só.
       */}
      <ModeloResumo
        opportunityId={opportunityId}
        proposalId={proposalId}
        bandeira={bandeira}
        parametros={parametros.data}
        royaltyMensalBrl={royaltyMensalCalculado(royalties)}
        maturacao={
          estrutura.status === 'ok' ? (estrutura.data?.maturacao ?? null) : null
        }
        podeEditar={podeEditarParametros}
        onChanged={onChanged}
        setModeloLoja={setModeloLoja}
        setRoyaltyEstrutura={setRoyaltyEstrutura}
        setMaturacao={setMaturacao}
        getValidacoes={getValidacoes}
      />

      {parametros.data?.modeloRoyalty === ModeloRoyalty.PercentualFixo ? (
        <PoliticaPercentualFixo data={parametros.data} />
      ) : (
        <TabelaRoyalties parametros={parametros} royalties={royalties} />
      )}

      <EstruturaLimites
        data={parametros.data}
        royaltyMensalBrl={royaltyMensalCalculado(royalties)}
      />

      <RoyaltyPremiado
        opportunityId={opportunityId}
        proposalId={proposalId}
        estrutura={estrutura}
        /*
         * O ACEITE do Royalty Premiado continua restrito: `POST
         * .../royalty-premiado:aceitar` é `@Roles(GestorFranquias,
         * ConsultorExpansao, ADMIN)`, e é irreversível (RN-F2-07). Abrir a
         * maturação ao LT não pode arrastar o aceite junto.
         */
        podeAceitar={podeEditarEstrutura}
        irreversivel={royaltyPremiadoIrreversivel}
        onChanged={onChanged}
        aceitarRoyaltyPremiado={aceitarRoyaltyPremiado}
      />
    </Block>
  );
}

// ---------------------------------------------------------------------------
// Modelo de negócio · formato · modelo de royalty
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Resumo do modelo + o MESMO modal da tela de criação
// ---------------------------------------------------------------------------

/**
 * Grade somente-leitura com o que está gravado, e um `.addrow` que abre o
 * `ModeloModal` compartilhado com `nova-proposta-franquia-screen`.
 *
 * ## Um modal, TRÊS endpoints
 *
 * O modal do protótipo pergunta modelo, taxa/parcelas e maturação de uma vez;
 * o backend recebe isso por três rotas com donos e regras diferentes
 * (`modelo-loja`, `royalty`, `maturacao`). Só é chamada a rota cujo grupo de
 * campos MUDOU — assim salvar o modelo não reenvia uma taxa que ninguém tocou,
 * e uma recusa de uma rota não é atribuída às outras.
 *
 * A ordem é `modelo-loja` → `royalty` → `maturacao` de propósito: o formato de
 * loja é a chave da parametrização da taxa (bandeira × formato), então gravá-lo
 * primeiro é o que faz o teto de parcelas ser conferido contra o formato novo.
 *
 * ⚠️ Não são atômicas. Uma falha no meio deixa o que já passou gravado — e é
 * por isso que a mensagem de erro é a do backend, sem reescrita: ela nomeia
 * qual pedaço recusou.
 */
function ModeloResumo({
  opportunityId,
  proposalId,
  bandeira,
  parametros,
  royaltyMensalBrl,
  maturacao,
  podeEditar,
  onChanged,
  setModeloLoja,
  setRoyaltyEstrutura,
  setMaturacao,
  getValidacoes,
}: {
  opportunityId: string;
  proposalId: string;
  bandeira: BandeiraFranquia | null;
  parametros: ModeloParametrosData | null;
  /** O royalty mensal CALCULADO pelo backend (F3) — `null` quando não há cálculo. */
  royaltyMensalBrl: string | null;
  maturacao: MaturacaoData | null;
  podeEditar: boolean;
  onChanged: () => void;
  setModeloLoja: typeof defaultSetModeloLoja;
  setRoyaltyEstrutura: typeof defaultSetRoyaltyEstrutura;
  setMaturacao: typeof defaultSetMaturacao;
  getValidacoes: typeof defaultGetValidacoes;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogoIndisponivel, setCatalogoIndisponivel] = useState(false);
  const [aplicado, setAplicado] = useState<boolean | null>(null);

  /*
   * ⚠️ Os LIMITES saíram do rascunho (ADO 67867): royalty mínimo, fundo de
   * marketing mínimo, valor fixo, piso e teto são parametrização por bandeira,
   * mantida na aba de Governança. Este modal escreve modelo de loja, taxa,
   * parcelas e maturação — o que o PRD F2 marca `Edit. = Sim`.
   */
  const atual: ModeloRascunho = {
    modeloNegocio: parametros?.modeloNegocio ?? '',
    formatoLoja: parametros?.formatoLoja ?? '',
    modeloRoyalty: parametros?.modeloRoyalty ?? '',
    taxaFranquia: brlToMask(parametros?.taxaFranquiaBrl),
    parcelas:
      parametros?.taxaFranquiaParcelas === null ||
      parametros?.taxaFranquiaParcelas === undefined
        ? ''
        : String(parametros.taxaFranquiaParcelas),
    /* ADO 68495 — `''` é o não respondido, e é ele que o GATE 1 cobra. */
    isencaoTaxa:
      parametros?.isencaoTaxaFranquia === true
        ? 'sim'
        : parametros?.isencaoTaxaFranquia === false
          ? 'nao'
          : '',
    maturada:
      maturacao?.isMaturada === true
        ? 'sim'
        : maturacao?.isMaturada === false
          ? 'nao'
          : '',
    periodoMaturacaoMeses:
      maturacao?.maturacaoMesesTotal === null ||
      maturacao?.maturacaoMesesTotal === undefined
        ? ''
        : String(maturacao.maturacaoMesesTotal),
    /*
     * `false`: o que está aqui veio do BACKEND, não de um default que o modal
     * acabou de pré-preencher. O flag existe para o replay da criação omitir a
     * taxa e deixar o backend semeá-la; aqui a taxa só é enviada quando muda.
     */
    taxaFranquiaDoParametro: false,
  };

  /*
   * ADO 68495 — a isenção da taxa entra no predicado pela mesma razão que entrou
   * em `modeloPreenchido` na tela de criação: ela é gravável sozinha (`PUT
   * .../royalty`), e sem isto uma franquia com a isenção respondida e nenhum
   * modelo renderizaria "Nenhum modelo cadastrado ainda." — a tela negando a
   * resposta que o GATE 1 já considera dada.
   */
  const preenchido =
    parametros?.formatoLoja != null ||
    parametros?.modeloRoyalty != null ||
    parametros?.isencaoTaxaFranquia != null;

  const handleSave = useCallback(
    async (value: ModeloRascunho) => {
      setSalvando(true);
      setError(null);
      setCatalogoIndisponivel(false);
      try {
        setAplicado(null);
        if (
          value.formatoLoja !== atual.formatoLoja ||
          value.modeloRoyalty !== atual.modeloRoyalty ||
          value.modeloNegocio !== atual.modeloNegocio
        ) {
          if (value.formatoLoja === '' || value.modeloRoyalty === '') {
            setError(
              'Informe o formato de loja e o modelo de royalty para salvar.',
            );
            return;
          }
          const result = await setModeloLoja(opportunityId, proposalId, {
            /* Omitido quando não respondido: o backend mantém o que está
               gravado, então salvar o formato nunca apaga uma resposta anterior. */
            ...(value.modeloNegocio === ''
              ? {}
              : { modeloNegocio: value.modeloNegocio }),
            formatoLoja: value.formatoLoja,
            modeloRoyalty: value.modeloRoyalty,
          });
          setAplicado(result.catalogoAplicado);
          setCatalogoIndisponivel(result.catalogoIndisponivel === true);
        }

        if (
          value.taxaFranquia !== atual.taxaFranquia ||
          value.parcelas !== atual.parcelas ||
          value.isencaoTaxa !== atual.isencaoTaxa
        ) {
          await setRoyaltyEstrutura(opportunityId, proposalId, {
            taxaFranquiaBrl: parseMoneyInput(value.taxaFranquia),
            taxaFranquiaParcelas:
              value.parcelas === '' ? null : Number(value.parcelas),
            /* `''` limpa a resposta; `false` é "Não", que é resposta. */
            isencaoTaxaFranquia:
              value.isencaoTaxa === '' ? null : value.isencaoTaxa === 'sim',
          });
        }

        if (
          value.maturada !== atual.maturada ||
          value.periodoMaturacaoMeses !== atual.periodoMaturacaoMeses
        ) {
          if (value.maturada !== '') {
            await setMaturacao(opportunityId, proposalId, {
              isMaturada: value.maturada === 'sim',
              maturacaoMesesTotal:
                value.periodoMaturacaoMeses === ''
                  ? null
                  : Number(value.periodoMaturacaoMeses),
            });
          }
        }

        setAberto(false);
        onChanged();
      } catch (err) {
        /* A frase do backend sobe sem reescrita: é ela que nomeia qual das três
           rotas recusou, e o teto de parcelas é regra dele, não daqui. */
        setError(
          err instanceof Error ? err.message : 'Falha ao salvar o modelo.',
        );
      } finally {
        setSalvando(false);
      }
    },
    [
      atual.formatoLoja,
      atual.modeloRoyalty,
      atual.modeloNegocio,
      atual.taxaFranquia,
      atual.parcelas,
      atual.isencaoTaxa,
      atual.maturada,
      atual.periodoMaturacaoMeses,
      setModeloLoja,
      setRoyaltyEstrutura,
      setMaturacao,
      opportunityId,
      proposalId,
      onChanged,
    ],
  );

  return (
    <>
      {preenchido ? (
        <DGrid>
          <DField
            label="Modelo de negócio"
            value={parametros?.modeloNegocioLabel ?? null}
            testId="resumo-modelo-negocio"
          />
          <DField
            label="Formato de loja"
            value={parametros?.formatoLojaLabel ?? null}
            testId="resumo-formato-loja"
          />
          <DField
            label="Modelo de royalty"
            value={parametros?.modeloRoyaltyLabel ?? null}
            testId="resumo-modelo-royalty"
          />
          <DField
            label="Taxa de franquia"
            value={formatBrlString(parametros?.taxaFranquiaBrl)}
            testId="resumo-taxa"
          />
          <DField
            label="Nº de parcelas"
            value={
              parametros?.taxaFranquiaParcelas === null ||
              parametros?.taxaFranquiaParcelas === undefined
                ? null
                : String(parametros.taxaFranquiaParcelas)
            }
            testId="resumo-parcelas"
          />
          {/* ADO 68495 — não respondido é travessão, NUNCA "Não": afirmar a
              resposta que ninguém deu é o que o GATE 1 existe para impedir. */}
          <DField
            label="Isenção de taxa de franquia"
            value={
              parametros?.isencaoTaxaFranquia === true
                ? 'Sim'
                : parametros?.isencaoTaxaFranquia === false
                  ? 'Não'
                  : null
            }
            testId="resumo-isencao-taxa"
          />
          <DField
            label="Loja maturada"
            value={
              maturacao?.isMaturada === true
                ? 'Maturada'
                : maturacao?.isMaturada === false
                  ? 'Não maturada'
                  : null
            }
            testId="resumo-maturada"
          />
          <DField
            label="Período de maturação"
            value={
              maturacao?.maturacaoMesesTotal === null ||
              maturacao?.maturacaoMesesTotal === undefined
                ? null
                : `${maturacao.maturacaoMesesTotal} meses`
            }
            testId="resumo-maturacao-periodo"
          />
          {parametros?.modeloRoyalty === ModeloRoyalty.ValorFixo && (
            <DField
              label="Valor fixo"
              value={formatBrlString(parametros.valorFixoBrl)}
              testId="resumo-valor-fixo"
            />
          )}
          {/* Lubrax+ (22/09/2026): o "Valor fixo" virou "Total Royalties
              mensal" — o royalty que o backend CALCULOU (percentual × faturamento,
              com o mínimo mensal). Sem cálculo, travessão. */}
          {parametros?.modeloRoyalty === ModeloRoyalty.PercentualFixo && (
            <DField
              label="Total Royalties mensal"
              value={formatBrlString(royaltyMensalBrl)}
              testId="resumo-total-royalties-mensal"
            />
          )}
        </DGrid>
      ) : (
        <EmptyState testId="modelo-vazio">
          Nenhum modelo cadastrado ainda.
        </EmptyState>
      )}

      {parametros?.motivoSemFaixaLabel != null && (
        <Alert tone="warn" testId="modelo-sem-faixa">
          {parametros.motivoSemFaixaLabel}
        </Alert>
      )}

      {/* `catalogoAplicado` / `catalogoIndisponivel` são resposta do backend,
          nunca inferência local. */}
      {parametros?.modeloRoyalty !== ModeloRoyalty.PercentualFixo && catalogoIndisponivel && (
        <Alert tone="warn" testId="parametros-catalogo-indisponivel">
          Catálogo de royalties (Anexo A) não configurado — percentuais não
          aplicados automaticamente. Contacte o time de parametrização para
          configurar o catálogo.
        </Alert>
      )}
      {!catalogoIndisponivel && aplicado === true && (
        <Alert tone="ok" testId="parametros-catalogo-aplicado">
          Tabela de royalty do Anexo A aplicada automaticamente à proposta.
        </Alert>
      )}
      {/* PERCENTUAL_FIXO não passa pelo Anexo A, e o backend responde
          `catalogoAplicado: false` para ele — "nenhuma faixa corresponde" seria
          falso. O motivo que importa ali (modelo de negócio) vem acima. */}
      {parametros?.modeloRoyalty !== ModeloRoyalty.PercentualFixo &&
        !catalogoIndisponivel &&
        aplicado === false && (
        <Alert tone="warn" testId="parametros-catalogo-nao-aplicado">
          Nenhuma faixa do Anexo A corresponde a esta combinação — a estrutura de
          royalties precisa ser informada manualmente pelo time de franquia.
        </Alert>
      )}

      {/*
       * Sem bandeira resolvida não há botão: `ModeloModal` lê a parametrização
       * da taxa por bandeira × formato, e um palpite ali mostraria o teto de
       * parcelas de outra bandeira — número errado na tela, que é pior que
       * controle ausente. A lacuna de identidade já é nomeada no card "Dados
       * da franquia".
       */}
      {podeEditar && bandeira !== null && (
        <AddRowButton onClick={() => setAberto(true)} testId="abrir-modelo">
          {preenchido
            ? 'Editar modelo e royalties'
            : '+ Cadastrar modelo e royalties'}
        </AddRowButton>
      )}

      {aberto && bandeira !== null && (
        <ModeloModal
          bandeira={bandeira}
          modelo={atual}
          getValidacoes={getValidacoes}
          salvando={salvando}
          error={error}
          onCancel={() => setAberto(false)}
          onSave={(value) => void handleSave(value)}
        />
      )}
    </>
  );
}

/** O royalty mensal que o backend calculou, ou `null` sem cálculo (ou com a fonte fora). */
function royaltyMensalCalculado(
  royalties: FrqSectionResult<RoyaltiesCalculadosData>,
): string | null {
  return royalties.status === 'ok'
    ? (royalties.data?.royaltyMensalBrl ?? null)
    : null;
}

// ---------------------------------------------------------------------------
// Política Percentual fixo (Lubrax+ — no lugar da tabela do Anexo A)
// ---------------------------------------------------------------------------

/**
 * `PERCENTUAL_FIXO` não tem tabela no Anexo A (22/09/2026): a política é UMA
 * linha, escolhida pelo modelo de negócio. Renderizar `TabelaAnexoA` vazia
 * leria "sem cobrança"; esta frase diz a política que o backend gravou na
 * proposta — os números são os de `percentualBps`/`valorMinimoMensalBrl`,
 * nunca uma cópia da regra aqui.
 */
function PoliticaPercentualFixo({ data }: { data: ModeloParametrosData }) {
  const percentual = formatBps(data.percentualBps);
  const minimo = formatBrlString(data.valorMinimoMensalBrl);
  return (
    <>
      <SubHeading>Tabela de royalties</SubHeading>
      <SubBox>
        {percentual !== null && minimo !== null ? (
          <p className="text-[14px]" data-testid="politica-percentual-fixo">
            <b>{percentual}</b> sobre o faturamento, com mínimo de{' '}
            <b>{minimo}</b>/mês
            {data.modeloNegocioLabel ? ` (${data.modeloNegocioLabel})` : ''}.
          </p>
        ) : (
          /* O motivo pt-BR (modelo de negócio não informado) já renderiza
             acima, composto pelo backend. */
          data.motivoSemFaixaLabel == null && (
            <p
              className="text-[14px] italic text-(--color-text-muted)"
              data-testid="politica-percentual-fixo-vazia"
            >
              Informe o modelo de negócio para aplicar o percentual e o mínimo
              mensal.
            </p>
          )
        )}
      </SubBox>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tabela de royalties (Anexo A — read-only)
// ---------------------------------------------------------------------------

/**
 * A tabela do Anexo A da chave desta proposta, com a faixa aplicada marcada.
 *
 * ⚠️ Até 26/08/2026 este card mostrava só a faixa APLICADA, como pares
 * Componente/Valor, e ainda escondia componente nulo
 * (`.filter(linha => linha.valor !== null)`). O negócio publicou uma tarifa de
 * QUATRO faixas e reabriu o ADO 67572 dizendo "Não consta em tela": numa linha
 * de catálogo sem tabaco a tabela tinha duas linhas em vez de seis, e as outras
 * três faixas não estavam em lugar nenhum.
 *
 * A tabela vem de `modeloParametros.faixasCatalogo` e não de
 * `royaltiesCalculados` — de propósito. O cálculo devolve `null` sem faturamento
 * e 503 quando a faixa não resolve, e é justamente aí que o usuário mais precisa
 * ver a tarifa para escolher. Com a fonte separada, **a tabela continua na tela
 * mesmo quando o cálculo cai**; só não há linha marcada.
 */
function TabelaRoyalties({
  parametros,
  royalties,
}: {
  parametros: FrqSectionResult<ModeloParametrosData>;
  royalties: FrqSectionResult<RoyaltiesCalculadosData>;
}) {
  const faixas = parametros.status === 'ok' ? (parametros.data?.faixasCatalogo ?? null) : null;
  const temMotivo =
    parametros.status === 'ok' && parametros.data?.motivoSemFaixaLabel != null;

  // Marcação vem do backend, que resolveu a faixa a partir do faturamento uma
  // única vez. Uma segunda seleção aqui seria a segunda cópia de um limite de
  // faixa (ADR-0025 §D3).
  const seqAplicada =
    royalties.status === 'ok'
      ? (royalties.data?.faixa?.registroSequencial ?? null)
      : null;

  return (
    <>
      <SubHeading>Tabela de royalties</SubHeading>
      <SubBox>
        {parametros.status === 'unavailable' || faixas === null ? (
          <SectionUnavailable
            testId="tabela-royalties-unavailable"
            message={
              parametros.status === 'unavailable' && parametros.error
                ? `Tabela de royalties indisponível (${parametros.error}).`
                : 'Tabela de royalties indisponível — o catálogo (Anexo A) não pôde ser lido.'
            }
          />
        ) : faixas.length === 0 ? (
          /* O motivo pt-BR já renderiza acima (`modelo-sem-faixa`), composto pelo
             backend. Repeti-lo aqui seria o mesmo veredito duas vezes na mesma
             tela. Sem motivo, esta frase é a única explicação que sobra. */
          !temMotivo && (
            <p
              className="text-[14px] italic text-(--color-text-muted)"
              data-testid="tabela-royalties-vazia"
            >
              Selecione o modelo de royalty e o formato de loja para o backend
              aplicar a faixa do Anexo A.
            </p>
          )
        ) : (
          <>
            <TabelaAnexoA
              faixas={faixas}
              seqAplicada={seqAplicada}
              testId="tabela-royalties"
            />
            {seqAplicada === null && (
              <p
                className="mt-2 text-[12px] text-(--color-text-muted)"
                data-testid="tabela-royalties-sem-aplicada"
              >
                A faixa aplicável depende do faturamento proposto.
              </p>
            )}
          </>
        )}
      </SubBox>
    </>
  );
}

// ---------------------------------------------------------------------------
// Estrutura de royalties · limites (RN-F2-06)
// ---------------------------------------------------------------------------

/**
 * ADO 67867 — o sub-bloco é SOMENTE LEITURA.
 *
 * O cadastro dos seis patamares saiu daqui e virou parametrização por bandeira
 * (Parametrização de Franquias → Estrutura de Royalties), pelos quatro perfis que o
 * ticket nomeia. O que havia era um `FGrid` de cinco `MoneyField` mais um
 * "Salvar estrutura" — na tela de criação, os mesmos campos atrás de um "Editar
 * como time de franquia", e foi ali que um Consultor de Expansão gravou `1111`
 * em "Royalty mínimo (%)".
 *
 * ⚠️ **O bloco continua RENDERIZADO**, e isso não é meio-caminho: a HU-04b.1 do
 * PRD de Franquias exige que o LT veja esses campos em modo leitura, e esconder o
 * sub-bloco deixaria a proposta sem dizer qual política a governa. O que
 * desapareceu é o controle, não a informação.
 *
 * Os valores exibidos são os da PROPOSTA — piso, teto e valor mínimo mensal são
 * semeados por `setModeloLoja` a partir da parametrização da bandeira; royalty e
 * fundo de marketing vêm da faixa do Anexo A.
 */
function EstruturaLimites({
  data,
  royaltyMensalBrl,
}: {
  data: ModeloParametrosData | null;
  royaltyMensalBrl: string | null;
}) {
  /*
   * Lubrax+ (22/09/2026): *"onde há 'Fundo de Marketing' o termo 'Valor Fixo'
   * deverá ser retirado e o campo cujo título é 'Valor Fixo' deverá ser
   * alterado para 'Total Royalties mensal' e refletir a regra"*. Só neste
   * modelo — na BR Mania os dois fundos (% e valor) convivem, e tirar o
   * qualificador deixaria dois campos com o mesmo nome.
   */
  const percentualFixo = data?.modeloRoyalty === ModeloRoyalty.PercentualFixo;
  return (
    <>
      <SubHeading extra={<LockChip>Parametrização · J10</LockChip>}>
        Estrutura de royalties · limites
      </SubHeading>
      <SubBox>
          <>
            <DGrid>
              <DField
                label="Royalty (%)"
                value={formatBps(data?.percentualBps)}
                testId="estrutura-percentual"
              />
              <DField
                label="Fundo de marketing (%)"
                value={formatBps(data?.fundoMktPercBps)}
                testId="estrutura-fundo-mkt"
              />
              {/*
               * Rendered unconditionally, next to the percentage — the same
               * shape as "Valor fixo" sitting next to "Royalty (%)". Which of
               * the two carries the answer is a property of the Anexo A band
               * (a VALOR_FIXO band publishes the amount and leaves the rate
               * NULL), so branching on `modeloRoyalty` here would be the screen
               * re-deciding what the catalogue already decided.
               */}
              <DField
                label={
                  percentualFixo
                    ? 'Fundo de marketing'
                    : 'Fundo de marketing (valor fixo)'
                }
                value={formatBrlString(data?.fundoMktValorFixoBrl)}
                testId="estrutura-fundo-mkt-valor-fixo"
              />
              {percentualFixo ? (
                <DField
                  label="Total Royalties mensal"
                  value={formatBrlString(royaltyMensalBrl)}
                  testId="estrutura-total-royalties-mensal"
                />
              ) : (
                <DField
                  label="Valor fixo"
                  value={formatBrlString(data?.valorFixoBrl)}
                  testId="estrutura-valor-fixo"
                />
              )}
              <DField
                label="Valor mínimo mensal"
                value={formatBrlString(data?.valorMinimoMensalBrl)}
                testId="estrutura-valor-minimo"
              />
              <DField
                label="Piso mínimo"
                value={formatBrlString(data?.pisoBrl)}
                testId="estrutura-piso"
              />
              <DField
                label="Teto máximo"
                value={formatBrlString(data?.tetoBrl)}
                testId="estrutura-teto"
              />
            </DGrid>
            {/*
              * CA-5, reescrita no ADO 67867: os quatro campos de patamar (Valor
              * fixo / Valor mínimo mensal / Piso mínimo / Teto máximo) deixaram
              * de ser digitados por proposta e passaram a ser parametrização por
              * bandeira. O travessão num campo continua NÃO significando dado
              * faltando — significa que a bandeira ainda não tem aquele patamar
              * parametrizado. A frase diz onde consertar, que é o que a nota
              * anterior deixou de fazer quando o controle saiu da tela.
              */}
            <p
              className="mt-2 text-[12px] italic text-(--color-text-muted)"
              data-testid="estrutura-limites-nota-franquia"
            >
              Os patamares são parametrizados por bandeira em Governança →
              Parametrização de Franquias → Estrutura de Royalties. Piso mínimo,
              Teto máximo e Valor mínimo mensal são aplicados à proposta ao
              cadastrar o modelo de loja.
            </p>

            {/*
             * Why "Royalty (%)" and "Fundo de marketing (%)" are blank — those
             * two DO come from the Anexo A catalogue, so the note above does
             * not explain them. Without this the block rendered two em dashes
             * and said nothing: `catalogoIndisponivel` is transient client
             * state, set only after a save, so on a fresh page load the reader
             * got no signal at all and read `—` as "this proposal has no
             * royalty".
             *
             * Attention, not danger: each reason has an owner and a fix
             * (answer the model, answer the revenue, or parametrize the Anexo
             * A) — nothing is broken.
             */}
            {data?.motivoSemFaixaLabel ? (
              <p
                className="mt-1 text-[12px] text-(--yellow-700)"
                data-testid="estrutura-limites-motivo-sem-faixa"
              >
                {data.motivoSemFaixaLabel}
              </p>
            ) : null}
          </>
      </SubBox>
    </>
  );
}


function brlToMask(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return maskMoneyInput(String(Math.round(parsed * 100)));
}

// ---------------------------------------------------------------------------
// Maturação e Royalty Premiado (RN-F2-05 / RN-F2-07)
// ---------------------------------------------------------------------------

function RoyaltyPremiado({
  opportunityId,
  proposalId,
  estrutura,
  podeAceitar,
  irreversivel,
  onChanged,
  aceitarRoyaltyPremiado,
}: {
  opportunityId: string;
  proposalId: string;
  estrutura: FrqSectionResult<EstruturaExcecoesData>;
  /** Aceite do Royalty Premiado — gate do time de franquia (RN-F2-07). */
  podeAceitar: boolean;
  irreversivel: boolean;
  onChanged: () => void;
  aceitarRoyaltyPremiado: typeof defaultAceitarRoyaltyPremiado;
}) {
  const confirm = useConfirm();
  const premiado = estrutura.status === 'ok' ? (estrutura.data?.royaltyPremiado ?? null) : null;

  const [bps, setBps] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAceitar = useCallback(() => {
    if (!podeAceitar || irreversivel) return;
    const parsed = Number(bps);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('Informe o percentual do Royalty Premiado em basis points.');
      return;
    }
    confirm.ask({
      title: 'Aceitar o Royalty Premiado?',
      description:
        'O aceite do Royalty Premiado NÃO pode ser revertido (RN-F2-07): o percentual passa a valer para toda a vigência do contrato desta franquia.',
      confirmLabel: 'Aceitar definitivamente',
      tone: 'danger',
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          await aceitarRoyaltyPremiado(opportunityId, proposalId, parsed);
          onChanged();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Falha ao registrar o aceite.');
          throw err;
        } finally {
          setBusy(false);
        }
      },
    });
  }, [
    podeAceitar,
    irreversivel,
    bps,
    confirm,
    aceitarRoyaltyPremiado,
    opportunityId,
    proposalId,
    onChanged,
  ]);

  return (
    <>
      {/*
       * A maturação saiu daqui: ela é resposta do MODELO e agora vive na grade
       * do topo do card e no modal, como na tela de criação. O que sobra é o
       * aceite do Royalty Premiado, que não é formulário — é uma AÇÃO, com dono
       * próprio (RN-F2-07) e irreversível.
       */}
      <SubHeading>Royalty Premiado</SubHeading>
      <SubBox>
        {estrutura.status === 'unavailable' ? (
          <SectionUnavailable
            testId="premiado-unavailable"
            message={
              estrutura.error
                ? `Royalty Premiado indisponível (${estrutura.error}).`
                : undefined
            }
          />
        ) : (
          <>
            {/*
             * Aceito, o controle some por inteiro — um "Aceitar" permanentemente
             * desabilitado leria como ação ainda esperada do usuário.
             *
             * Sem a permissão de aceite (o LT, por exemplo), vira DADO: botão
             * desabilitado ali seria controle morto, e habilitado levaria 403.
             */}
            {!podeAceitar ? (
              <DGrid>
                <DField
                  label="Royalty Premiado"
                  value={
                    premiado?.ativo === true
                      ? `Aceito · ${formatBps(premiado.percentualBps) ?? '—'}`
                      : 'Não aceito'
                  }
                  testId="premiado-readonly"
                />
              </DGrid>
            ) : irreversivel || premiado?.ativo === true ? (
              <div
                className="flex flex-wrap items-center gap-2"
                data-testid="premiado-aceito"
              >
                <StatusPill variant="success">Royalty Premiado aceito</StatusPill>
                <span className="text-[14px] text-(--color-text-muted)">
                  {formatBps(premiado?.percentualBps) ?? '—'} · aceite irreversível
                  (RN-F2-07)
                </span>
              </div>
            ) : (
              <FGrid cols={2}>
                <div>
                  <FieldLabel htmlFor="premiado-bps">
                    Royalty Premiado (basis points)
                  </FieldLabel>
                  <input
                    id="premiado-bps"
                    className={controlClass()}
                    type="number"
                    min={1}
                    max={10000}
                    value={bps}
                    disabled={busy}
                    onChange={(e) => setBps(e.target.value)}
                    data-testid="premiado-bps-input"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAceitar}
                    disabled={busy}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-xxs)] border border-(--yellow-300) bg-(--yellow-100) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--yellow-700) transition hover:bg-(--yellow-200) ${BTN_DISABLED}`}
                    data-testid="premiado-aceitar"
                  >
                    Aceitar Royalty Premiado
                  </button>
                </div>
              </FGrid>
            )}

            {podeAceitar && !irreversivel && premiado?.ativo !== true && (
              <Alert tone="warn" testId="premiado-aviso">
                O aceite do Royalty Premiado não pode ser revertido (RN-F2-07).
              </Alert>
            )}

            {error !== null && (
              <Alert tone="bad" testId="premiado-erro">
                {error}
              </Alert>
            )}
          </>
        )}
      </SubBox>
      {confirm.dialog}
    </>
  );
}
