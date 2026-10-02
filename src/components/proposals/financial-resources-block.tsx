"use client";

import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePicklist } from "@/hooks/use-picklist";
import { PicklistField } from "@/lib/picklists/picklists.types";
import { Finalidade } from "@/lib/picklists/salesforce-values";
import { FieldLabel } from "@/components/ui/field-label";
import { Select } from "@/components/ui/select";
import { PicklistSelect } from "@/components/picklists/picklist-select";
import {
  getObra as defaultGetObra,
  getObrasDisponiveis as defaultListObras,
  obraOptionLabel,
  type Obra,
  type ObraReadModel,
} from "@/lib/obras/obras.data";
import {
  createFinancialResource as defaultCreate,
  deleteFinancialResource as defaultDelete,
  getFinancialResourceDomains as defaultGetDomains,
  getFinancialResources as defaultGetList,
  updateFinancialResource as defaultUpdate,
} from "@/lib/proposals/financial-resources.data";
import { TIPO_BONIFICACAO_LABELS } from "@/lib/proposals/financial-resources.labels";
import {
  aceitaIndiceCorrecaoParcela,
  aceitaCamposDeBonusNovoMutuo,
  aceitaCamposDeRessarcimento,
  exigeJustificativaPorJuros,
  isRecursoDeMutuo,
  MENSAGEM_JUSTIFICATIVA_POR_JUROS,
  RESSARCIMENTO_DERIVADO_HINT,
} from "@/lib/proposals/financial-resource-rules";
import type {
  BpBudget,
  CreateFinancialResourceInput,
  EtapaLiberacaoRecurso,
  FinancialResource,
  FinancialResourceDomains,
  FinancialResourceMutationResult,
  FinancialResourcesListResult,
  PeriodicidadeRecurso,
  SupplierStatus,
  TipoBonificacao,
  TipoRegistroRecursoFinanceiro,
} from "@/lib/proposals/financial-resources.types";
import {
  // Imported as VALUES: the gate and the obra-confirmada set compare against
  // named members so a Salesforce rename breaks the build instead of silently
  // never matching.
  IndiceCorrecao,
  TipoRegistroRecursoFinanceiro as TipoRegistro,
  FinalidadeRecurso,
} from "@/lib/proposals/financial-resources.types";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/auth-permissions";
import {
  BlocoAjusteAction,
  useProposalViewMode,
} from "@/components/proposals/proposal-view-mode";
import { BlocoProposta } from "@/lib/proposals/ajuste";
import {
  motivoDataFinalForaDoContrato,
  motivoPrestacoesForaDaAnalise,
} from "@/lib/proposals/data-final-recurso";
import { getProposal as defaultGetProposal } from "@/lib/proposals/proposal.data";
import type { ProposalSummary } from "@/lib/proposals/proposal.types";
import { useConfirm } from "@/components/confirm-dialog";
import { failureReason, isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import { maskMoneyInput, parseMoneyInput } from "@/lib/franquia/format";
import { ObraParcelasCronograma } from "@/components/obras/obra-parcelas-cronograma";
import type { AdicionarObraRecursosPayload } from "@/lib/obras/obra-da-proposta.api";
import {
  LINHAS_DE_IMAGEM,
  camposDaLinhaDeImagem,
  dataLiberacaoInicialDaObra,
  type LinhaDeImagem,
} from "@/lib/obras/linha-de-imagem";
import { HttpError } from "@/lib/api-errors";
import {
  adicionarObraRecursos as defaultAdicionarObra,
  removerObraRecursos as defaultRemoverObra,
} from "@/lib/obras/obras.data";
import { withOneRetry } from "@/lib/with-retry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * RN-F6-01 (updated 2026-08-11 / VBR-463): the "Recursos financeiros" block
 * renders for proposals with either of these finalidades. Vinculação was the
 * original gate; Implantação was added in the 11/08 QA round.
 */
const FINALIDADES_COM_RECURSO_FINANCEIRO: ReadonlySet<string> = new Set([
  Finalidade.Vinculacao,
  Finalidade.Implantacao,
]);

/*
 * ⚠️ `FINALIDADES_COM_OBRA_CONFIRMADA` foi REMOVIDA em 09/09/2026 (RF-05).
 *
 * Ela decidia em quais finalidades o campo `Obra confirmada (Converge)`
 * aparecia na adição direta de recurso. O campo saiu daquele diálogo — recurso
 * criado diretamente não se associa a obra —, e no diálogo "Adicionar obra" ele
 * é obrigatório em toda finalidade: gatear ali esconderia o único controle que
 * o diálogo existe para preencher.
 */

type GateStatus = "checking" | "not-applicable" | "applicable" | "gate-error";
type LoadStatus = "loading" | "loaded" | "error";

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; resource: FinancialResource }
  /** O diálogo "Adicionar obra" (RF-02) — mesma forma, submit próprio. */
  | { mode: "obra" }
  | null;

/** Sentinela de "o usuário digitou algo que não é número" — distinto de vazio. */
const INVALID_NUMBER = Symbol("invalid-number") as unknown as number;

/** `''` ⇒ `null` (campo limpo); texto não-inteiro ⇒ {@link INVALID_NUMBER}. */
function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : INVALID_NUMBER;
}

/**
 * `''` ⇒ `null`; aceita vírgula decimal (o usuário digita "1,5") e no máximo 2
 * casas — a escala de `Juros__c` no org.
 */
function parseOptionalDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return INVALID_NUMBER;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : INVALID_NUMBER;
}

interface FormState {
  tipoRegistro: TipoRegistroRecursoFinanceiro | "";
  tipoBonificacao: TipoBonificacao | "";
  finalidadeRecurso: FinalidadeRecurso | "";
  etapaLiberacao: EtapaLiberacaoRecurso | "";
  dataLiberacao: string;
  qtdParcelas: string;
  valorParcela: string;
  indiceCorrecao: IndiceCorrecao | "";
  indiceCorrecaoParcela: IndiceCorrecao | "";
  periodicidade: PeriodicidadeRecurso | "";
  /**
   * Este recurso é custeado pela obra (ADR-0048). Vive no `FormState` — e não
   * derivado do vínculo da oportunidade — porque a associação é do RECURSO: é ele
   * que decide se o seletor abre com a obra escolhida ou no placeholder.
   */
  custeadoPelaObra: boolean;
  /*
   * Campos da família de MÚTUO (ADO 67799 / 67800). String porque são inputs —
   * a conversão para número acontece no submit, como em `qtdParcelas`.
   *
   * Não existe campo para o INÍCIO DO RESSARCIMENTO: ele é fórmula no org
   * (`Data_Inicio_Ressarcimento__c`), vem derivado do backend e é EXIBIDO. Um
   * input que o CRM sobrescreve afirma uma escolha que não sobrevive ao
   * acoplamento.
   */
  carenciaMeses: string;
  jurosPercentual: string;
  justificativa: string;
  /**
   * `Qtde_Prestacoes__c` — o "Prestações" do bloco **Ressarcimento**.
   *
   * ⚠️ Campo próprio, **não** `qtdParcelas` renomeado: no layout do org o
   * RecordType `Novo Mútuo` traz os dois, em seções distintas.
   */
  qtdPrestacoes: string;
  /*
   * Bônus do Novo Mútuo (ADO 67587) — `Detalhe_de_Contrato_Mutuo_Enc_Contas__c`.
   *
   * Não há campo para o VALOR TOTAL nem para as duas datas do layout do org:
   * o total é parcelas × valor da parcela (derivado pelo backend) e as datas
   * são fórmula no CRM. Etapa e Finalidade também não: cada picklist tem um
   * único valor ativo, e um select de uma opção só é controle morto.
   */
  bonusPeriodicidade: string;
  bonusQtdParcelas: string;
  bonusValorParcela: string;
  bonusIndiceCorrecaoPrestacao: string;
  bonusTipoAtualizacaoMonetaria: string;
}

/**
 * `Tipo de atualização monetária` do bônus nasce em **"Inicio de Vigência até o
 * mês da data da entrega da(s) parcela(s)."** (código `04`) — pedido do negócio,
 * 03/09/2026. As duas opções ficam em
 * {@link TIPO_ATUALIZACAO_MONETARIA_OPTIONS}, mais abaixo.
 *
 * ⚠️ **Exceção AUTORIZADA à regra "valor de picklist nunca nasce escolhido"**,
 * no mesmo molde do `indiceCorrecao: Sem correção` (ADO 67588). Não remova o
 * default para "consertar" uma inconsistência aparente — o comentário do
 * {@link EMPTY_FORM} nomeava justamente este `04` como o default do org que a
 * gente NÃO pré-selecionava, e é essa decisão que mudou.
 *
 * E aqui a exceção é mais forte que a do índice: `04` é o default **declarado
 * pelo próprio org** (`Tipo_de_Atualizacao_Monetaria__c.defaultValue = "04"`,
 * lido no describe em 03/09/2026), com `04` em 271 dos 273 registros
 * respondidos. Pré-selecioná-lo CONCORDA com o CRM em vez de divergir dele —
 * diferente do default `CIF` do incoterm, que era escolha nossa sobre um campo
 * que o org não defaulta.
 *
 * ⚠️ Mora ACIMA do `EMPTY_FORM` por necessidade, não por estilo: `const` não é
 * hoisted, e declará-la junto das opções (abaixo) derruba o módulo inteiro com
 * `Cannot access … before initialization`.
 *
 * Constante nomeada, e não `'04'` solto nem `OPTIONS[0].value`: a primeira forma
 * some num grep e a segunda é posicional — reordenar as opções mudaria o default
 * em silêncio.
 */
const TIPO_ATUALIZACAO_MONETARIA_DEFAULT = "04";

const EMPTY_FORM: FormState = {
  tipoRegistro: "",
  tipoBonificacao: "",
  finalidadeRecurso: "",
  etapaLiberacao: "",
  dataLiberacao: "",
  qtdParcelas: "1",
  valorParcela: "",
  /**
   * ⚠️ Business exception to the repo rule "picklist value never pre-selected":
   * the business explicitly requested `Sem correção` as the default (ADO 67588).
   * Authorised exception — do not remove the default to "fix" it.
   */
  indiceCorrecao: IndiceCorrecao.SemCorrecao,
  indiceCorrecaoParcela: "",
  periodicidade: "",
  /*
   * Criação NUNCA nasce associada à obra. O seletor pré-seleciona a obra da
   * oportunidade quando ela existe, mas a associação é do RECURSO — herdá-la por
   * padrão associaria em silêncio, que é o defeito do default `CIF`.
   */
  custeadoPelaObra: false,
  // Vazio, não "0": zero afirmaria carência nenhuma como resposta do usuário —
  // o defeito do default que este repositório persegue.
  carenciaMeses: "",
  /**
   * ⚠️ **Exceção autorizada à regra "campo não nasce respondido"** — pedido do
   * negócio, 22/09/2026: *"se o tipo de registro for mútuo, eu preciso que o
   * valor de juros mensais retorne para 1% como default"*.
   *
   * ⚠️ **Isto REVISA o default `0,89` de 18/09/2026, e a revisão tem um custo
   * conhecido e ACEITO pelo negócio — não "conserte" de volta sem uma decisão
   * nova.** O 0,89 não era número plausível: era o número que o Salesforce
   * EXIGE. A VR `IndiceSemCorrecao089` (medida em 18/09/2026: **ativa**, em
   * `Recurso_Financeiro_Da_Oportunidade__c`, sem isenção de perfil) recusa com
   * *"O Índice de Correção 'Sem correção' Tem Por Regra De Negócio Juros De
   * 0.89%."* — e `indiceCorrecao` logo acima **já nasce `Sem correção`** (a
   * outra exceção autorizada, ADO 67588). Com `1`, a combinação que o modal
   * abre por padrão volta a ser exatamente a que o org recusa.
   *
   * ⚠️ **E a recusa é SILENCIOSA.** Ela barra a cópia da cotação para a
   * oportunidade; as outras linhas atravessam e o processo termina como se
   * tivesse dado certo. Foi o que fez o ADO 68476 reabrir quatro vezes. A
   * decisão de 22/09/2026 foi trocar o default **sem** trava na tela, na
   * expectativa de que a VR seja revista no org ou de que o LT troque o índice
   * de correção. Se o sintoma voltar ("a cotação não copia para a
   * oportunidade"), é AQUI que se olha primeiro.
   *
   * ⚠️ **PERCENTUAL, não fração** — `1` é 1% ao mês. Ver
   * {@link formatPercentValue}: escrever `0,01` aqui seria o erro de 100× que o
   * `TIR__c` já custou.
   *
   * ⚠️ **Só na CRIAÇÃO.** `formToState` mantém `null ⇒ ""`, e tem de manter:
   * pré-preencher o default ao ABRIR uma linha gravada faria o valor divergir
   * do `initial`, e o diff do submit gravaria uma taxa de juros que ninguém
   * digitou numa linha que já existe. Há caso de teste prendendo isso.
   *
   * ⚠️ **O default NÃO exige justificativa**, e isso é de propósito: a regra de
   * 22/09/2026 é estritamente MAIOR que 1 ({@link exigeJustificativaPorJuros}),
   * então o modal abre num estado que não cobra nada.
   */
  jurosPercentual: "1",
  justificativa: "",
  // Vazio, e NÃO copiado de `qtdParcelas`: os dois são campos distintos no org, e
  // pré-preencher um com o outro afirmaria uma resposta que ninguém deu.
  qtdPrestacoes: "",
  // Vazios pelo mesmo motivo: valor de picklist do Salesforce nunca nasce
  // escolhido, mesmo quando o org tem default (`Única`, `IGP-M`).
  bonusPeriodicidade: "",
  bonusQtdParcelas: "",
  bonusValorParcela: "",
  bonusIndiceCorrecaoPrestacao: "",
  /**
   * ⚠️ **A exceção entre os cinco** — ver
   * {@link TIPO_ATUALIZACAO_MONETARIA_DEFAULT}. Pedido do negócio de
   * 03/09/2026, e `04` é o default declarado pelo próprio org.
   *
   * Só afeta o Novo Mútuo: em qualquer outro tipo o campo não é renderizado e o
   * payload manda `null` (o DTO recusa o campo fora do Novo Mútuo).
   */
  bonusTipoAtualizacaoMonetaria: TIPO_ATUALIZACAO_MONETARIA_DEFAULT,
};

function formToState(resource: FinancialResource): FormState {
  return {
    tipoRegistro: resource.tipoRegistro,
    tipoBonificacao: resource.tipoBonificacao ?? "",
    finalidadeRecurso: resource.finalidadeRecurso,
    etapaLiberacao: resource.etapaLiberacao,
    dataLiberacao: resource.dataLiberacao.slice(0, 10),
    qtdParcelas: String(resource.qtdParcelas),
    // Money travels as a number; the input shows the pt-BR mask the prototype
    // uses (`fmtMoneyInput`), so the stored value is re-masked for editing.
    valorParcela: maskMoneyInput(resource.valorParcela.toFixed(2)),
    indiceCorrecao: resource.indiceCorrecao ?? "",
    indiceCorrecaoParcela: resource.indiceCorrecaoParcela ?? "",
    periodicidade: resource.periodicidade,
    // Do RECURSO, nunca do vínculo da oportunidade: abrir para editar um recurso
    // não custeado (para mexer em parcelas, digamos) não pode associá-lo.
    custeadoPelaObra: resource.custeadoPelaObra,
    carenciaMeses:
      resource.carenciaMeses === null ? "" : String(resource.carenciaMeses),
    jurosPercentual:
      resource.jurosPercentual === null ? "" : String(resource.jurosPercentual),
    justificativa: resource.justificativa ?? "",
    qtdPrestacoes:
      resource.qtdPrestacoes === null ? "" : String(resource.qtdPrestacoes),
    bonusPeriodicidade: resource.bonusPeriodicidade ?? "",
    bonusQtdParcelas:
      resource.bonusQtdParcelas === null
        ? ""
        : String(resource.bonusQtdParcelas),
    bonusValorParcela:
      resource.bonusValorParcela === null
        ? ""
        : maskMoneyInput(resource.bonusValorParcela.toFixed(2)),
    bonusIndiceCorrecaoPrestacao: resource.bonusIndiceCorrecaoPrestacao ?? "",
    bonusTipoAtualizacaoMonetaria: resource.bonusTipoAtualizacaoMonetaria ?? "",
  };
}

type Props = {
  proposalId: string;
  /**
   * Oportunidade dona da proposta — necessária para a obra do Converge, cuja
   * API é chaveada por oportunidade e **não** por proposta (ADR-0048: uma
   * estimativa serve N oportunidades; cada oportunidade admite ≤1).
   *
   * Opcional de propósito: ausente, o seletor de obra renderiza desabilitado e
   * NENHUMA chamada ao Converge acontece. Isso mantém as suítes que montam o
   * bloco sem oportunidade (e o CA-2, que só afere a presença do campo) sem
   * disparar rede em jsdom.
   */
  opportunityId?: string;
  /** Injectable for tests; defaults to the real BFF client. */
  listObrasDisponiveis?: (opportunityId: string) => Promise<Obra[]>;
  /** Injectable for tests; defaults to the real BFF client. */
  getObraSelecionada?: (opportunityId: string) => Promise<ObraReadModel>;
  /** Injectable for tests; defaults to the real BFF client. */
  /**
   * A seção de INVESTIMENTOS já tem a obra desta proposta (SH-02/SH-03).
   *
   * Vem do painel porque a obra é da proposta inteira e gera itens de UM tipo
   * só: sem isto, cada seção olharia apenas a própria lista e a de recursos
   * ofereceria "+ Adicionar obra" numa proposta que já tem uma — pedido que o
   * backend recusa com 422.
   */
  temObraNaOutraSecao?: boolean;
  /** Avisa o painel (e a faixa da oportunidade) que a obra mudou. */
  onObraChanged?: () => void;
  /**
   * Reporta ao painel se ESTA seção tem a obra — é assim que o SH-03 troca o
   * rótulo do botão na OUTRA. O painel é quem cruza as duas: nenhuma das
   * seções lê a lista da vizinha.
   */
  onObraPresenteChange?: (temObra: boolean) => void;
  /**
   * Contador que o painel incrementa quando a OUTRA seção mexeu na obra.
   *
   * ⚠️ **O vínculo é da PROPOSTA** (`proposal_estimate_links`,
   * `UNIQUE (proposal_id)`), então "Remover obra" nos investimentos apaga o
   * vínculo e os itens gerados por ele AQUI. Sem este sinal esta seção seguia
   * exibindo os cartões e o botão "Remover obra" de uma obra que não existe
   * mais — e o segundo clique abria o diálogo dizendo "Esta proposta não tem
   * obra vinculada", sem nada na tela para consertar a não ser um F5.
   *
   * É o par de {@link temObraNaOutraSecao}: aquele diz o que a vizinha TEM,
   * este avisa que ela MUDOU. O painel continua sendo o único que cruza as
   * duas — nenhuma seção lê a lista da outra.
   */
  obraExternaSignal?: number;
  adicionarObra?: (
    proposalId: string,
    payload: AdicionarObraRecursosPayload,
  ) => Promise<FinancialResource[]>;
  removerObra?: (proposalId: string) => Promise<void>;
  /**
   * Proposal summary provided by the parent (`ProposalDetailPanel`) as part of
   * the shared single-fetch pattern (CA-5 / VBR-548). Supplies `finalidade`
   * for the RN-F6-01 gate and the analysis period (`dataInicioAnalise` /
   * `dataFimAnalise`) for the dataLiberacao validation (CA-3).
   *
   * When absent, `getProposal` is used as a fallback (backward compat / tests).
   */
  proposalSummary?: ProposalSummary | null;
  /** Injectable for tests; only called when `proposalSummary` is not passed. */
  getProposal?: (id: string) => Promise<ProposalSummary>;
  /** Injectable for tests; defaults to the real BFF client. */
  listResources?: (proposalId: string) => Promise<FinancialResourcesListResult>;
  /** Injectable for tests; defaults to the real BFF client. */
  createResource?: (
    proposalId: string,
    input: CreateFinancialResourceInput,
  ) => Promise<FinancialResourceMutationResult>;
  /** Injectable for tests; defaults to the real BFF client. */
  updateResource?: (
    proposalId: string,
    resourceId: string,
    input: Partial<CreateFinancialResourceInput>,
  ) => Promise<FinancialResourceMutationResult>;
  /** Injectable for tests; defaults to the real BFF client. */
  deleteResource?: (proposalId: string, resourceId: string) => Promise<void>;
  /** Injectable for tests; defaults to the real BFF client. */
  getDomains?: () => Promise<FinancialResourceDomains>;
  /**
   * Called after a resource is successfully created, edited, or deleted.
   * Used by the parent to bump the auto-calc refresh signal so "Investimento
   * Vibra" in `ProposalAutoCalcBlock` reflects the new totals without a page
   * reload (Bug 67533).
   */
  onResourcesChanged?: () => void;
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Builds the PUT payload from what the user actually CHANGED, not the whole
 * form: rows migrated before the picklist catalog may hold legacy values
 * (`CAPITAL_DE_GIRO`, `BONIFICACAO`, `ASSINATURA_DO_CONTRATO`) that
 * `@IsPicklistValue` rejects if resent — an edit touching only `valorParcela`
 * must not re-submit them.
 */
function diffUpdateInput(
  stored: FinancialResource,
  input: CreateFinancialResourceInput,
): Partial<CreateFinancialResourceInput> {
  const patch: Partial<CreateFinancialResourceInput> = {};
  if (input.tipoRegistro !== stored.tipoRegistro)
    patch.tipoRegistro = input.tipoRegistro;
  if ((input.tipoBonificacao ?? null) !== (stored.tipoBonificacao ?? null)) {
    patch.tipoBonificacao = input.tipoBonificacao;
  }
  if (input.finalidadeRecurso !== stored.finalidadeRecurso) {
    patch.finalidadeRecurso = input.finalidadeRecurso;
  }
  if (input.etapaLiberacao !== stored.etapaLiberacao)
    patch.etapaLiberacao = input.etapaLiberacao;
  if (input.dataLiberacao !== stored.dataLiberacao)
    patch.dataLiberacao = input.dataLiberacao;
  if (input.qtdParcelas !== stored.qtdParcelas)
    patch.qtdParcelas = input.qtdParcelas;
  if (input.valorParcela !== stored.valorParcela)
    patch.valorParcela = input.valorParcela;
  if ((input.indiceCorrecao ?? null) !== (stored.indiceCorrecao ?? null)) {
    patch.indiceCorrecao = input.indiceCorrecao;
  }
  if (
    (input.indiceCorrecaoParcela ?? null) !==
    (stored.indiceCorrecaoParcela ?? null)
  ) {
    patch.indiceCorrecaoParcela = input.indiceCorrecaoParcela;
  }
  if (input.periodicidade !== stored.periodicidade)
    patch.periodicidade = input.periodicidade;
  /*
   * Campos de Mútuo (ADO 67799 / 67800). Como no `custeadoPelaObra`, sem estas
   * linhas o valor nunca viajaria na EDIÇÃO: o PATCH só carrega o que mudou.
   *
   * `?? null` nos dois lados para que LIMPAR o campo viaje como `null` — que é o
   * que o DTO aceita para apagar. Comparar `undefined` com `null` mandaria um
   * patch a cada abertura do modal.
   */
  if ((input.carenciaMeses ?? null) !== (stored.carenciaMeses ?? null)) {
    patch.carenciaMeses = input.carenciaMeses ?? null;
  }
  if ((input.jurosPercentual ?? null) !== (stored.jurosPercentual ?? null)) {
    patch.jurosPercentual = input.jurosPercentual ?? null;
  }
  if ((input.justificativa ?? null) !== (stored.justificativa ?? null)) {
    patch.justificativa = input.justificativa ?? null;
  }
  if ((input.qtdPrestacoes ?? null) !== (stored.qtdPrestacoes ?? null)) {
    patch.qtdPrestacoes = input.qtdPrestacoes ?? null;
  }
  /*
   * Bônus do Novo Mútuo (ADO 67587) — mesma razão: sem estas linhas o valor
   * nunca viajaria na EDIÇÃO, porque o PATCH só carrega o que mudou.
   */
  if (
    (input.bonusPeriodicidade ?? null) !== (stored.bonusPeriodicidade ?? null)
  ) {
    patch.bonusPeriodicidade = input.bonusPeriodicidade ?? null;
  }
  if ((input.bonusQtdParcelas ?? null) !== (stored.bonusQtdParcelas ?? null)) {
    patch.bonusQtdParcelas = input.bonusQtdParcelas ?? null;
  }
  if (
    (input.bonusValorParcela ?? null) !== (stored.bonusValorParcela ?? null)
  ) {
    patch.bonusValorParcela = input.bonusValorParcela ?? null;
  }
  if (
    (input.bonusIndiceCorrecaoPrestacao ?? null) !==
    (stored.bonusIndiceCorrecaoPrestacao ?? null)
  ) {
    patch.bonusIndiceCorrecaoPrestacao =
      input.bonusIndiceCorrecaoPrestacao ?? null;
  }
  if (
    (input.bonusTipoAtualizacaoMonetaria ?? null) !==
    (stored.bonusTipoAtualizacaoMonetaria ?? null)
  ) {
    patch.bonusTipoAtualizacaoMonetaria =
      input.bonusTipoAtualizacaoMonetaria ?? null;
  }
  /*
   * ADR-0048. Sem esta linha, associar ou desassociar a obra numa EDIÇÃO nunca
   * viajaria: o PATCH só carrega o que mudou, e o campo não existia no diff.
   *
   * A comparação também é o que impede a associação silenciosa no sentido
   * inverso — recurso não custeado, aberto para mexer em parcelas, não ganha
   * `custeadoPelaObra: true` só por passar pelo modal.
   */
  if ((input.custeadoPelaObra ?? false) !== stored.custeadoPelaObra) {
    patch.custeadoPelaObra = input.custeadoPelaObra ?? false;
  }
  return patch;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(
    "pt-BR",
    {
      timeZone: "UTC",
    },
  );
}

/**
 * `Juros__c` na forma em que ele é guardado: PERCENTUAL, `1` = 1%.
 *
 * ⚠️ **Não reuse `formatPercentFromDecimal`** (`lib/opportunities-indicators/`).
 * Aquele existe para `tir`/`vpl`, que chegam como FRAÇÃO, e multiplica por 100:
 * aplicado aqui renderizaria `89%` para 0,89 — o erro de 100× que o `TIR__c` já
 * custou uma vez neste repo. Aqui ele apontaria para o lado errado da única
 * regra que decide se o Mútuo atravessa da cotação para a oportunidade no org
 * (`IndiceSemCorrecao089`, que exige exatamente 0,89% com "Sem correção").
 */
function formatPercentValue(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  /**
   * Linha secundária, subordinada ao valor. Existe para procedência — hoje só a
   * data do retrato da obra ("conforme o Converge em …"). Não é lugar para
   * dado: quem é dado vira campo próprio.
   */
  hint?: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] uppercase tracking-wide text-(--color-text-muted)">
        {label}
      </div>
      <div className="break-words text-(length:--t-caption) font-bold">
        {value}
      </div>
      {hint && (
        <div className="break-words text-[12px] text-(--color-text-muted)">
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Readable card title, composed the way the prototype composes it
 * (`ciclo1.js:238-239`): `Bonificação · Antecipada`, `Novo Mútuo`.
 *
 * `tipoRegistro` is a Salesforce API name — a machine value that must never
 * reach the screen (CLAUDE.md). Two of the six values do not even read as their
 * label (`Mútuo Enc. Contas` → "Novo Mútuo"; `BONIFICACAO` → "Bonificação"), so
 * the label comes from the picklist catalog, which is the single source for it.
 *
 * The three bonus types get the `Bonificação · ` prefix, because at this grain
 * `Antecipada`/`Desempenho` ARE the bonus subtypes — the same grouping the form
 * already uses to decide whether the bonus fields apply. The prototype's third
 * shape, `Concessão financeira · Nova Imagem`, comes from `r.origem === 'Converge'`
 * and is NOT reproduced: this platform has no Converge origin on the resource, so
 * composing it would assert a provenance no field carries.
 *
 * @param tipoLabels value → label from the catalog. An entry missing (catalog
 * still loading, or down) falls back to the API name: the alternative is an
 * untitled card, and a title is how the user tells two resources apart.
 */
export function resourceCardTitle(
  resource: Pick<
    FinancialResource,
    "tipoRegistro" | "tipoBonificacao" | "custeadoPelaObra"
  >,
  tipoLabels: ReadonlyMap<string, string>,
  /**
   * A obra vinculada à oportunidade, quando há. Só a CONJUNÇÃO com
   * `custeadoPelaObra` troca o título — flag sem obra não afirma nada.
   */
  obraVinculada?: Obra | null,
): string {
  const base = tipoLabels.get(resource.tipoRegistro) ?? resource.tipoRegistro;

  /*
   * `ciclo1.js:240` — o protótipo SUBSTITUI o título quando a origem é o
   * Converge: `Concessão financeira · Nova Imagem`. O `"Nova Imagem"` chumbado
   * lá é o `EstimateType` da fonte (medido: `"Nova imagem"`), então o segundo
   * termo vem da estimativa, não de uma constante nossa.
   *
   * Sim, isto perde o tipo de registro (Mútuo, Bonificação) no título — é o que
   * o protótipo faz, e a decisão de 22/08/2026 é seguir o protótipo e ajustar
   * quando a Vibra revisar. O tipo continua legível na grade do cartão.
   */
  if (resource.custeadoPelaObra && obraVinculada) {
    return `Concessão financeira · ${obraVinculada.tipo}`;
  }

  if (resource.tipoRegistro === TipoRegistro.Antecipada)
    return "Bonificação · Antecipada";
  if (resource.tipoRegistro === TipoRegistro.Desempenho)
    return "Bonificação · Por desempenho";
  if (resource.tipoRegistro === TipoRegistro.Bonificacao) {
    /*
     * Legacy value (`BONIFICACAO`): the subtype travels in its own field. The
     * word is spelled here rather than read from `base` because this API name is
     * the one that is NOT readable — falling back to it would put SCREAMING_CASE
     * on screen whenever the catalog is unavailable.
     */
    return resource.tipoBonificacao
      ? `Bonificação · ${TIPO_BONIFICACAO_LABELS[resource.tipoBonificacao]}`
      : "Bonificação";
  }
  return base;
}

/**
 * One resource, rendered as the prototype's flat `.sit-resumo` list
 * (`03-proposta-ciclo1.html:111-113` + `ciclo1.js:236-265`) — VBR-507.
 *
 * No "Detalhes" / "Valores" / "Saldo" sub-headings: the prototype has a single
 * two-column grid, and three headings over eleven fields read as three cards.
 *
 * **Field-by-field decisions** for where the app and the prototype differ:
 *
 * | Field | Prototype | App | Decision |
 * | -- | -- | -- | -- |
 * | `Obra (Converge)` | yes (conditional) | `custeadoPelaObra` + vínculo | **rendered** (ADR-0048) — primeiro campo, condicional na conjunção |
 * | `Parcelas` | `1× · Mensal` | qty + periodicity apart | merged into the single field |
 * | `Data final` | yes | derived by the backend | **rendered** (ADO 67800) — `dataFinal`, alongside `Data de liberação` |
 * | `Valor da parcela` | no | yes | KEPT — it is what the user types; `Valor total` has no visible origin without it |
 * | `Parcelas pagas` / `restantes` / `Saldo a pagar` | no | yes | **RETIRADOS da tela em 10/09/2026** — medem vencimento, não pagamento (ver a nota no JSX). O backend segue publicando os três. |
 *
 * The kept extras sit next to the field they explain, so the prototype's
 * relative order (Finalidade → Etapa → Parcelas → Valor total → Índice de
 * correção) is preserved — sem `Saldo a pagar`, retirado em 10/09/2026.
 */
function ResourceCard({
  resource,
  tipoLabels,
  onEdit,
  onDelete,
  isDeleting,
  showActions = true,
  obraVinculada,
}: {
  resource: FinancialResource;
  /** Picklist value → label, so the title is never an API name. */
  tipoLabels: ReadonlyMap<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  /** false while the proposal is under analysis — edits are closed. */
  showActions?: boolean;
  /**
   * A obra vinculada à oportunidade (ADR-0048), quando há. O campo
   * `Obra (Converge)` e o título só mudam na CONJUNÇÃO com
   * `resource.custeadoPelaObra`: o flag é intenção do usuário, e sem obra
   * vinculada não há o que afirmar.
   */
  obraVinculada?: Obra | null;
}) {
  return (
    <div
      data-testid="resource-card"
      className="mb-2.5 rounded-[var(--radius-xs)] border border-(--color-border) px-4 py-3.5"
    >
      {/* Prototype `.rec-card-h` */}
      <div className="mb-2.5 flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h4
            className="text-(length:--t-caption) font-bold"
            data-testid="resource-card-title"
          >
            {resourceCardTitle(resource, tipoLabels, obraVinculada)}
          </h4>
          {/*
            SH-05 — selo que distingue o item GERADO por obra do criado
            diretamente. Lê `resource.obra`, e não o `custeadoPelaObra` legado:
            o vínculo por linha é o que decide as travas do §6, e um selo que
            discordasse delas seria pior que nenhum.
          */}
          {resource.obra && (
            <span
              data-testid="selo-obra"
              className="shrink-0 rounded-[var(--radius-xxs)] bg-(--neutral-100) px-2 py-0.5 text-(length:--t-caption-sm) font-bold text-(--neutral-800)"
            >
              Obra
            </span>
          )}
        </div>
        {showActions && (
          <div className="flex shrink-0 items-center gap-2">
            {/*
             * The two controls are NOT the same weight in the prototype, and the
             * asymmetry is the point: `.lnk-edit` is an OUTLINED BUTTON and
             * `.lnk-del` is a bare red link. Rendering both as links (which this
             * card did) flattens the primary action into the destructive one.
             *
             * Same classes `financial-items-block.tsx` already applies, so the
             * two cards on this screen match each other. Size is `--t-caption`
             * (14px): the prototype itself disagrees — `03-proposta-ciclo1.html`
             * says 12px while `03-proposta-nova.html` and `03-proposta-analise.html`
             * say 14px — and 14px is what the sibling block shipped.
             */}
            <button
              type="button"
              onClick={onEdit}
              /* Prototype `.lnk-edit` — outlined, 5px/12px padding. */
              className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-white px-3 py-[5px] text-(length:--t-caption) leading-[normal] font-bold text-(--secondary-600)"
            >
              Editar
            </button>
            {/*
              §6 — item gerado por obra NÃO é removido individualmente: some com
              a obra inteira ("Remover obra"). O botão é escondido porque a API
              recusa com 409; deixá-lo visível ofereceria uma ação que sempre
              falha.
            */}
            {!resource.obra && (
              <>
                {/* Prototype `.lnk-del` — bare red link, 5px/6px padding. */}
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="border-none bg-none px-1.5 py-[5px] text-(length:--t-caption) leading-[normal] font-bold text-(--red-700) hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? "Excluindo…" : "Excluir"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Prototype `.sit-resumo`: `grid-template-columns:1fr 1fr; gap:12px 24px`. */}
      <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {/*
          Primeiro campo da grade, como no protótipo (`ciclo1.js:256`), e
          condicional pela mesma razão que lá (`r.obra ? … : ''`): rótulo sem
          valor leria como dado que o sistema falhou em carregar.
        */}
        {/*
          Item GERADO por obra traz a própria origem (`resource.obra`), que não
          depende de a oportunidade ter vínculo. A conjunção antiga
          (`custeadoPelaObra` + `obraVinculada`) segue valendo para a LINHA
          LEGADA, gravada quando o seletor vivia neste modal.
        */}
        {(resource.obra || (resource.custeadoPelaObra && obraVinculada)) && (
          <DetailField
            label="Obra (Converge)"
            /*
              A origem preferida é a da própria LINHA; a da oportunidade só
              atende a linha legada. `?? ''` em vez de `?.` interpolado: uma
              interpolação de `undefined` renderizaria "undefined · undefined"
              no dia em que a condição acima mudasse.
            */
            value={
              resource.obra
                ? `${resource.obra.estimateId} · ${resource.obra.tipo}`
                : obraVinculada
                  ? `${obraVinculada.estimateId} · ${obraVinculada.tipo}`
                  : ""
            }
            /*
              DATA o retrato. É o que a ADR-0048 promete ao levar o `synced_at`
              no read model: sem isto, um retrato de dias se apresenta como o
              estado atual do Converge. Sem data não se inventa uma — nulo omite
              a linha em vez de renderizar "Invalid Date".
            */
            hint={
              obraVinculada?.sincronizadoEm
                ? `conforme o Converge em ${formatDate(obraVinculada.sincronizadoEm)}`
                : null
            }
          />
        )}
        <DetailField label="Finalidade" value={resource.finalidadeRecurso} />
        <DetailField
          label="Etapa da liberação"
          value={resource.etapaLiberacao}
        />
        <DetailField
          label="Data de liberação"
          value={formatDate(resource.dataLiberacao)}
        />
        {/*
          `Data final` — vencimento da ÚLTIMA parcela, derivado pelo backend
          (ADO 67800; o bloco "Valores" do recurso financeiro no Salesforce, e o
          campo homônimo do protótipo). Sem ele o cartão mostrava só o começo do
          cronograma: uma linha de 7 parcelas trimestrais dizia "01/05/2026" e
          nada dizia até quando ela vai.

          Ausente ⇒ a linha não é renderizada, em vez de um rótulo com "—":
          rótulo sem valor lê como dado que o sistema falhou em carregar.
        */}
        {resource.dataFinal && (
          <DetailField
            label="Data final"
            value={formatDate(resource.dataFinal)}
          />
        )}
        <DetailField
          label="Parcelas"
          value={`${resource.qtdParcelas}× · ${resource.periodicidade}`}
        />
        <DetailField
          label="Valor da parcela"
          value={formatCurrency(resource.valorParcela)}
        />
        <DetailField
          label="Valor total"
          value={formatCurrency(resource.valorTotal)}
        />
        {/*
          ⚠️ `Parcelas pagas`, `Parcelas restantes` e `Saldo a pagar` foram
          RETIRADOS da tela em 10/09/2026 — só da exibição; o backend continua
          derivando e publicando os três (`financial-resource-calculations.ts`).

          Os três medem **vencimento**, não pagamento: a conta é de calendário
          (quantas parcelas já venceram entre a liberação e hoje), e nenhuma
          fonte deste fluxo sabe se o dinheiro saiu — o Converge publica
          `Number`/`Description`/`Value`/`PaymentTerm` na parcela e um webhook
          de andamento FÍSICO da obra, nada financeiro.

          `Saldo a pagar` é `parcelasRestantes × valorParcela`, ou seja saldo
          **a vencer**: ele herda o defeito inteiro dos outros dois e some com
          eles. `Valor total` (`qtdParcelas × valorParcela`) permanece — aquele
          não afirma nada sobre pagamento.
        */}
        <DetailField
          label="Índice de correção"
          value={resource.indiceCorrecao ?? "Nenhum"}
        />
        {/*
          Prestações do ressarcimento (`Qtde_Prestacoes__c`) — omitida quando
          nula, como `Data final`: rótulo sem valor lê como dado que o sistema
          falhou em carregar, e aqui "não informado" é o caso comum (nulo em 146
          de 477 linhas `Mútuo Enc. Contas` e em todas as 1.713 `Mútuo` no org).
        */}
        {resource.qtdPrestacoes !== null && (
          <DetailField
            label="Prestações"
            value={`${resource.qtdPrestacoes}×`}
          />
        )}
        {/* ADO 67588: o índice das PRESTAÇÕES — exibido só onde o bloco
            Ressarcimento existe. Fica fora da bonificação (que não tem prestação
            a corrigir) e, desde 03/09/2026, do Novo Mútuo. O rótulo acompanha o
            do modal (27/08/2026): mantê-lo como "da parcela" aqui faria o cartão
            contradizer o formulário que o preenche.

            ⚠️ Aqui o gate é o TIPO, e não `indiceCorrecaoParcela !== null` como
            em `Prestações` logo acima: este campo renderiza com a reserva "Não
            informado", então sem o gate o cartão de um Novo Mútuo exibiria para
            sempre um rótulo de campo que o formulário não tem. `Prestações` é
            omitido quando nulo, então o valor legado continua legível até a
            próxima gravação limpá-lo — dado que existe não é escondido. */}
        {aceitaCamposDeRessarcimento(resource.tipoRegistro) && (
          <DetailField
            label="Índice de correção das prestações"
            value={resource.indiceCorrecaoParcela ?? "Não informado"}
          />
        )}
        {/*
          ADO 68476 — `Carência` e `Juros mensais` eram coletados no modal,
          viajavam ao Salesforce e NUNCA mais apareciam.

          Não é cosmético: o org recusa a cópia da cotação para a oportunidade
          quando um Mútuo com `Sem correção` tem juros diferente de 0,89% (VR
          `IndiceSemCorrecao089`, a única do objeto sem isenção de perfil), e a
          recusa é SILENCIOSA — as outras linhas atravessam e o processo termina
          como se tivesse dado certo. Com o campo invisível, nem quem preencheu
          nem quem investiga pelo print consegue dizer qual valor está gravado;
          o ticket reabriu quatro vezes por isso.

          Gate pelo TIPO e reserva "Não informado", como no índice das
          prestações logo acima e pela mesma razão: os dois são OBRIGATÓRIOS na
          escrita (carência em 10/09/2026, juros em 17/09/2026), então a
          ausência é dado a corrigir e precisa ser vista — omitir a linha
          esconderia justamente a lacuna que trava a cópia no org.

          ⚠️ `0` é resposta de alguém nos dois (mútuo sem juros, carência
          nenhuma), então o gate é `!= null`, NUNCA truthiness — a mesma
          disciplina que o modal aplica ao medir o vazio pela string em branco.
        */}
        {aceitaCamposDeRessarcimento(resource.tipoRegistro) && (
          <DetailField
            label="Carência (meses)"
            value={
              resource.carenciaMeses !== null
                ? String(resource.carenciaMeses)
                : "Não informado"
            }
          />
        )}
        {aceitaCamposDeRessarcimento(resource.tipoRegistro) && (
          <DetailField
            label="Juros mensais (%)"
            value={
              resource.jurosPercentual !== null
                ? formatPercentValue(resource.jurosPercentual)
                : "Não informado"
            }
          />
        )}
        {/*
          A `Justificativa__c` é a ÚNICA do bloco que continua OPCIONAL (588 de
          48.807 linhas no org), então ela segue a regra da `Data final` e das
          `Prestações`: ausente ⇒ a linha não é renderizada. "Não informado"
          sobre um campo legitimamente opcional leria como pendência.
        */}
        {isRecursoDeMutuo(resource.tipoRegistro) && resource.justificativa && (
          <DetailField
            label="Justificativa"
            value={resource.justificativa}
          />
        )}
      </div>

      {/*
        ADO 67924 — as parcelas que o Converge publica, com valor e data de
        lançamento. FORA da grade de duas colunas de propósito: é uma tabela, e
        dentro de uma célula ela ficaria com metade da largura.

        Condicional na MESMA conjunção do campo `Obra (Converge)` acima
        (`custeadoPelaObra` + vínculo): o flag sozinho não afirma obra nenhuma.
      */}
      {resource.custeadoPelaObra && obraVinculada && (
        <ObraParcelasCronograma
          parcelas={obraVinculada.parcelas}
          dataLiberacao={resource.dataLiberacao}
          periodicidade={resource.periodicidade}
        />
      )}
    </div>
  );
}

function BpBudgetBar({ bpBudget }: { bpBudget: BpBudget }) {
  const pct = Math.min(100, Math.max(0, bpBudget.percentualUtilizado));
  return (
    <div
      data-testid="bp-budget"
      className="mt-3.5 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3.5 py-3"
    >
      <div className="flex items-baseline justify-between text-(length:--t-caption)">
        <span className="text-(--color-text-muted)">Verba (BP) disponível</span>
        <b>{`${bpBudget.percentualUtilizado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</b>
      </div>
      <div className="my-2 h-[7px] overflow-hidden rounded-full bg-(--neutral-100)">
        <i
          style={{ width: `${pct}%` }}
          className={`block h-full rounded-full ${bpBudget.excedido ? "bg-(--red-700)" : "bg-(--secondary-500)"}`}
        />
      </div>
      <div className="text-[14px] text-(--color-text-muted)">
        {formatCurrency(bpBudget.utilizado)} de {formatCurrency(bpBudget.verba)}{" "}
        utilizados
      </div>
      {bpBudget.excedido && (
        <div
          role="alert"
          data-testid="bp-excedido-alert"
          className="mt-2.5 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-(length:--t-small) text-(--red-700)"
        >
          ⚠ BP excedido — o valor total dos recursos financeiros ultrapassa a
          verba disponível.
        </div>
      )}
    </div>
  );
}

function ZfpjAlert({ supplierStatus }: { supplierStatus?: SupplierStatus }) {
  if (!supplierStatus || supplierStatus.registradoZFPJ) return null;

  return (
    <div
      role="alert"
      data-testid="zfpj-alert"
      className="mt-2.5 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2 text-(length:--t-small) text-(--yellow-700)"
    >
      ⚠ Há recurso financeiro (antecipação/mútuo): o cliente precisa estar
      cadastrado como <b>fornecedor (ZFPJ) no SAP</b>. Status:{" "}
      <b>não cadastrado</b> — providenciar antes da ativação.
    </div>
  );
}

/** Salesforce resource types that carry a bonus sub-type (see `isBonificacao`). */
const BONUS_TIPOS: ReadonlySet<string> = new Set([
  TipoRegistro.Antecipada,
  TipoRegistro.Desempenho,
  TipoRegistro.Bonificacao,
]);

/**
 * Salesforce's `Tipo__c` already ENCODES the bonus sub-type (`Antecipada`,
 * `Desempenho`) — `tipoBonificacao` is this platform's own column, kept for
 * legacy rows. Asking the user the same question twice allowed a contradiction
 * (Tipo "Antecipada" + bonificação "Por desempenho"), so the sub-type is now
 * DERIVED from the catalog value; only the legacy `BONIFICACAO` rows — where
 * the tipo does not say which bonus it is — still show the select.
 */
const DERIVED_TIPO_BONIFICACAO: Readonly<
  Partial<Record<string, TipoBonificacao>>
> = {
  [TipoRegistro.Antecipada]: "ANTECIPADA",
  [TipoRegistro.Desempenho]: "POR_DESEMPENHO",
};

/**
 * Prototype `.in` input style (03-proposta-nova.html / vibra-ui.css): neutral-40
 * background, 2px bottom border only, square corners, green focus.
 * Used for `<input>` and `<textarea>` elements. `<select>` elements use the
 * `<Select>` DS component directly — no className needed.
 * Disabled tokens: --disabled-bg (#f4f5f5), --disabled-text (#767676) from globals.css.
 */
/**
 * `Tipo_de_Atualizacao_Monetaria__c` do Bônus do Novo Mútuo (ADO 67587).
 *
 * ⚠️ Fixo aqui, e não vindo do catálogo, porque **estas duas opções SÃO o value
 * set inteiro** (medido no org em 26/08/2026) e o campo não está no catálogo de
 * picklists desta plataforma. O `value` é o CÓDIGO (`04`/`05`) — é o que o CRM
 * reconhece; o rótulo é a frase que o usuário lê lá, verbatim (inclusive o
 * "Inicio" sem acento e o ponto final, que são do org).
 *
 * O campo NASCE em `04` — ver {@link TIPO_ATUALIZACAO_MONETARIA_DEFAULT}, que
 * mora acima do `EMPTY_FORM` porque `const` não é hoisted.
 */
const TIPO_ATUALIZACAO_MONETARIA_OPTIONS = [
  {
    value: "04",
    label: "Inicio de Vigência até o mês da data da entrega da(s) parcela(s).",
  },
  { value: "05", label: "Sem Reajuste" },
] as const;

const FIELD_INPUT_CLASS =
  "w-full min-w-0 bg-(--neutral-40) border-0 border-b-2 border-(--neutral-600) rounded-none px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800) placeholder:text-(--neutral-500) focus:outline-none focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:bg-(--disabled-bg) disabled:border-(--neutral-200) disabled:text-(--disabled-text)";

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function ResourceModal({
  variant = "recurso",
  camposDaObraTravados = false,
  mode,
  initial,
  domains,
  onSave,
  onClose,
  isSaving,
  errorMessage,
  analysisStart,
  analysisEnd,
  obras,
  obraVinculada,
  obrasLoading,
  obrasError,
  obrasHabilitadas,
  onSaveObra,
}: {
  mode: "create" | "edit";
  initial: FormState;
  domains: FinancialResourceDomains;
  /**
   * ⚠️ Sem `estimateId`: a criação direta NÃO associa obra (RF-05). A obra tem
   * submit próprio (`onSaveObra`), que fala com a rota de ação.
   */
  onSave: (input: CreateFinancialResourceInput) => void;
  onClose: () => void;
  isSaving: boolean;
  errorMessage: string | null;
  /** ISO-8601 lower bound for dataLiberacao (proposal.dataInicioAnalise). */
  analysisStart?: string;
  /** ISO-8601 upper bound for dataLiberacao (proposal.dataFimAnalise). */
  analysisEnd?: string;
  /**
   * `'obra'` é o diálogo "Adicionar obra" (RF-02): os mesmos campos, **menos**
   * os quatro que a parcela define, com `Data de liberação` → `Data de
   * liberação inicial` e `Obra confirmada (Converge)` obrigatório.
   *
   * ⚠️ **Uma variante, e não um componente irmão.** Os blocos Ressarcimento,
   * Bônus do Novo Mútuo e Justificativa são idênticos nos dois diálogos
   * (RF-03: preenchidos na obra e copiados iguais em cada item gerado) e somam
   * ~400 linhas de campos com gate por tipo de registro. Um segundo componente
   * os duplicaria, e os dois divergiriam na primeira regra nova — o defeito que
   * `colunasDoRecursoFinanceiro` acabou de corrigir do lado do backend.
   */
  variant?: "recurso" | "obra";
  /**
   * Item gerado por obra em EDIÇÃO: os SETE campos que a obra define ficam em
   * leitura (§6 + US 68333) — os quatro da parcela (qtd., valor, índice,
   * periodicidade) mais finalidade, etapa e data de liberação, que a obra
   * DERIVA. Tipo de registro e os campos de ressarcimento seguem editáveis: o
   * LT os escolhe, e travar tudo faria do item uma linha morta.
   *
   * A tela desabilita e o backend **recusa** (400): veredito é do backend, a
   * tela renderiza. A lista de verdade é `CAMPOS_TRAVADOS_RECURSO`.
   */
  camposDaObraTravados?: boolean;
  /** Submit da variante `'obra'` — o backend gera N recursos, um por parcela. */
  onSaveObra?: (payload: AdicionarObraRecursosPayload) => void;
  /** `null` = ainda não carregadas. `[]` = o cliente não tem obra no Converge. */
  obras: Obra[] | null;
  /** A obra já vinculada à oportunidade, para pré-selecionar. */
  obraVinculada: Obra | null;
  obrasLoading: boolean;
  obrasError: string | null;
  /** `false` quando não há oportunidade — nenhuma chamada ao Converge acontece. */
  obrasHabilitadas: boolean;
}) {
  /** Read-only profiles cannot submit (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  const [form, setForm] = useState<FormState>(initial);
  const [validationError, setValidationError] = useState<string | null>(null);

  /*
   * Options come from the picklist catalog, not from local label maps. Two
   * reasons the maps had to go: they held values Salesforce does not have
   * (`CAPITAL_DE_GIRO`, `ASSINATURA_DO_CONTRATO`, `IGPM`), and the purpose list
   * is DEPENDENT on the resource type — `Finalidade__c` ← `Tipo__c` — so the
   * correct set is a function of what the user just picked.
   */
  const { options: tipoRegistroOptions, status: tipoRegistroStatus } =
    usePicklist(PicklistField.RecursoFinanceiroTipo);

  /*
   * O diálogo "Adicionar obra" não oferece `Desempenho`: a bonificação por
   * desempenho é medida depois, contra o volume realizado, e não tem parcela
   * de obra que a origine — o fluxo aqui gera um item POR PARCELA do Converge.
   * O recorte é só de apresentação e só desta variante: o modal direto segue
   * oferecendo o valor, e nada é removido do catálogo (que é do Salesforce).
   */
  const tipoOptionsDaVariante =
    variant === "obra"
      ? tipoRegistroOptions.filter((o) => o.value !== TipoRegistro.Desempenho)
      : tipoRegistroOptions;

  /*
   * When editing a legacy row whose `tipoRegistro` is no longer active in the
   * catalog (e.g. "Parcelamento de Débito", hidden since Bug 67513), keep the
   * persisted value visible in the select so the user can see what is stored.
   *
   * The value is NOT offered for new rows — the catalog's `options()` omits
   * inactive entries, so `tipoRegistroOptions` never contains it. It is only
   * re-added here when we are in edit mode, the catalog has loaded, and the
   * initial tipo is absent from the returned list.
   *
   * Saving without changing the tipo is safe: `diffUpdateInput` compares the
   * form state to the stored resource and omits fields that did not change, so
   * the inactive value never travels in the PATCH body and `@IsPicklistValue`
   * never rejects it.
   */
  const visibleTipoOptions =
    mode === "edit" &&
    tipoRegistroStatus === "loaded" &&
    initial.tipoRegistro !== "" &&
    !tipoOptionsDaVariante.some((o) => o.value === initial.tipoRegistro)
      ? [
          ...tipoOptionsDaVariante,
          {
            value: initial.tipoRegistro,
            label: initial.tipoRegistro,
            isDefault: false,
          },
        ]
      : tipoOptionsDaVariante;

  const {
    options: finalidadeRecursoOptions,
    status: finalidadeStatus,
    awaitingController: finalidadeAwaitingTipo,
  } = usePicklist(
    PicklistField.RecursoFinanceiroFinalidade,
    form.tipoRegistro || null,
  );
  const { options: periodicidadeOptions } = usePicklist(
    PicklistField.RecursoFinanceiroPeriodicidade,
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /*
   * `tipoBonificacao` is this platform's own distinction (antecipada × por
   * desempenho) and it hangs off the two Salesforce types that carry a bonus:
   * `Antecipada` and `Desempenho`. The legacy `BONIFICACAO` value predates the
   * catalog and is kept so an existing row still renders its sub-type.
   */
  const isBonificacao =
    form.tipoRegistro === TipoRegistro.Antecipada ||
    form.tipoRegistro === TipoRegistro.Desempenho ||
    form.tipoRegistro === TipoRegistro.Bonificacao;

  /*
   * ADO 67588 — "Índice de correção da parcela" fica fora de TODA bonificação,
   * que é o que o work item diz: *"Criar o campo Índice de Correção da Parcela.
   * (exceto Bonificação)"*. `aceitaIndiceCorrecaoParcela` é o predicado único,
   * espelhado do backend; ver o docblock dele para as três fontes que
   * concordam e para o porquê de não re-derivar isto pelo fluxo de caixa.
   */
  const exigeIndiceParcela = aceitaIndiceCorrecaoParcela(
    form.tipoRegistro,
    form.tipoBonificacao,
  );

  /*
   * Prestações, carência, juros e o início do ressarcimento (ADO 67799 / 67800)
   * — o Mútuo e o Parcelamento de Débito, NUNCA o Novo Mútuo (decisão do
   * negócio, 03/09/2026: no Novo Mútuo essas perguntas são as do bloco "Bônus
   * do Novo Mútuo" logo abaixo, e os dois conjuntos duplicavam o índice de
   * correção da prestação na mesma caixa).
   *
   * `aceitaCamposDeRessarcimento` é o espelho do predicado do backend, o MESMO
   * que o `@ValidateIf` do DTO e o `create` usam: um campo que a tela mostra e o
   * serviço anula é perda silenciosa; um campo que a tela esconde e o DTO exige
   * recusa o save sem nada na tela para consertar.
   */
  const exigeCamposRessarcimento = aceitaCamposDeRessarcimento(
    form.tipoRegistro,
  );
  /*
   * A `Justificativa` tem gate PRÓPRIO — toda a família de Mútuo, Novo Mútuo
   * incluído. Ela não foi nomeada no pedido de 03/09/2026 e é o único campo do
   * bloco que o layout do Novo Mútuo tem sem par no bloco do bônus.
   */
  const exigeJustificativa = isRecursoDeMutuo(form.tipoRegistro);
  /**
   * A `Justificativa` está OBRIGATÓRIA por causa dos juros? (22/09/2026)
   *
   * ⚠️ **Um predicado só para o `*`, o aviso em vermelho e o gate do submit.**
   * Marcar a tela por uma condição e recusar por outra é a divergência que este
   * repositório persegue: o usuário veria o campo sem asterisco e levaria a
   * recusa ao clicar, ou o contrário.
   *
   * ⚠️ **Mesmo recorte de `jurosExigidoAgora`/`carenciaExigidaAgora`** — na
   * edição, só quando o usuário TOCA no juros ou na justificativa. A regra
   * nasceu hoje: cobrá-la de uma linha gravada antes com juros acima de 1% e sem
   * justificativa travaria qualquer OUTRA alteração por um campo que ninguém
   * tocou, que é o defeito que 3 testes de linha legada acusaram no ADO 67588. O
   * backend aplica o MESMO recorte (`dto.jurosPercentual !== undefined ||
   * dto.justificativa !== undefined`).
   *
   * ⚠️ Lê os juros DIGITADOS, não os gravados: o aviso tem de aparecer enquanto
   * o usuário sobe o valor, não depois de salvar. Texto não-numérico devolve o
   * sentinela do parser e `exigeJustificativaPorJuros` o descarta — ali quem
   * fala é a mensagem de formato, mais específica.
   *
   * ⚠️ **O gate é `exigeCamposRessarcimento`, e NÃO `exigeJustificativa`** —
   * mais estreito de propósito. A `Justificativa` existe em toda a família de
   * Mútuo, mas os JUROS não: o Novo Mútuo não os carrega desde 03/09/2026, e
   * tanto o submit quanto o `colunasDoRecursoFinanceiro` do backend os anulam
   * ali. Sem o recorte, digitar 2% num Mútuo e trocar o tipo para Novo Mútuo
   * deixaria a tela cobrando justificativa por um juros que ninguém vai gravar —
   * a divergência tela × API que os espelhos existem para impedir.
   */
  const justificativaExigidaPorJuros =
    exigeCamposRessarcimento &&
    exigeJustificativaPorJuros(parseOptionalDecimal(form.jurosPercentual)) &&
    (mode === "create" ||
      form.jurosPercentual !== initial.jurosPercentual ||
      form.justificativa !== initial.justificativa);
  /*
   * O bloco "Ressarcimento" (27/08/2026) abre quando QUALQUER campo dele se
   * aplica. Os dois predicados acima são hoje o mesmo
   * (`aceitaCamposDeRessarcimento`), então a disjunção é redundante em runtime —
   * e é de propósito: se um dia divergirem, um `&&` faria o bloco sumir levando
   * um campo que o DTO ainda exige, que é a divergência tela × API que os
   * espelhos existem para impedir.
   *
   * ⚠️ A `Justificativa` fica FORA desta conta: no Novo Mútuo ela é o único
   * campo que sobra, e um título "Ressarcimento" sozinho acima de um texto livre
   * anunciaria uma seção que o tipo não tem.
   */
  const exigeRessarcimento = exigeIndiceParcela || exigeCamposRessarcimento;
  // ADO 67587 — MAIS ESTREITO que o de cima: o detalhe do bônus só existe para
  // `Mútuo Enc. Contas` no org.
  const exigeCamposBonusNovoMutuo = aceitaCamposDeBonusNovoMutuo(
    form.tipoRegistro,
  );

  /**
   * As PRESTAÇÕES do ressarcimento estouram o fim da análise? (11/09/2026)
   *
   * ⚠️ Calculado a CADA render, não no submit: o pedido é que o botão fique
   * desabilitado enquanto a combinação for inválida, e um veredito preso ao
   * submit só existiria depois do clique que o botão impede.
   *
   * Só no ramo em que as prestações EXISTEM — fora dele o serviço as descarta,
   * e cobrar por um campo que não será gravado recusaria uma bonificação por
   * nada. O `analysisEnd` é o fim da análise da proposta; ausente ⇒ a regra
   * degrada para `null` e nada é bloqueado.
   */
  /*
   * ⚠️ A regra só vale com a LIBERAÇÃO já dentro da janela, e isso é
   * load-bearing: o cronograma do ressarcimento é derivado dela, então com uma
   * liberação fora do período a data que eu calcularia não significa nada — e,
   * pior, o botão desabilitado ESCONDERIA a recusa mais específica do CA-3
   * ("a data de liberação deve estar dentro do período"), deixando o usuário
   * sem a frase que nomeia o conserto de verdade. Medido: 11 casos existentes
   * do modal deixaram de alcançar o submit quando esta guarda não existia.
   */
  const liberacaoNaJanela =
    !!analysisStart &&
    !!analysisEnd &&
    !!form.dataLiberacao &&
    form.dataLiberacao.slice(0, 10) > analysisStart &&
    form.dataLiberacao.slice(0, 10) <= analysisEnd;

  const motivoPrestacoes = useMemo(
    () =>
      exigeCamposRessarcimento && liberacaoNaJanela
        ? motivoPrestacoesForaDaAnalise(
            {
              dataLiberacao: form.dataLiberacao,
              /*
               * `Number` cru, e não `parseOptionalInt`: aquele devolve um
               * Symbol sentinela para texto inválido, e depender de como ele
               * coage seria frágil. Aqui `""` vira `0` — que é o que a fórmula
               * do org faz com carência nula — e texto inválido vira `NaN`,
               * que as guardas `Number.isFinite` do domínio recusam. Os dois
               * desfechos degradam para "não bloqueia".
               */
              carenciaMeses: Number(form.carenciaMeses.trim()),
              qtdPrestacoes: Number(form.qtdPrestacoes.trim()),
            },
            { fim: analysisEnd },
          )
        : null,
    [
      exigeCamposRessarcimento,
      form.dataLiberacao,
      form.carenciaMeses,
      form.qtdPrestacoes,
      analysisEnd,
    ],
  );

  // The sub-type select renders ONLY for legacy `BONIFICACAO` rows — for the
  // catalog types the sub-type is derived from `Tipo__c` itself.
  const isLegacyBonificacao = form.tipoRegistro === TipoRegistro.Bonificacao;

  /**
   * CA-2: obra confirmada (Converge link) is shown only for physical investment
   * finalidades. "Serviço Especializado em Garantia Real" and "Impostos
   * referentes a Imagem" are administrative types with no associated obra.
   */
  const ehObra = variant === "obra";

  /*
   * O cliente não tem obra no Converge — e isso é um FATO DE NEGÓCIO, não
   * falha: a lista veio, veio vazia. Falha de leitura tem estado próprio
   * (`obrasError`), e colapsar os dois faria a tela afirmar "não tem obra"
   * quando a fonte apenas não respondeu.
   *
   * `obras === null` é "ainda não carregou" — sem esta guarda a mensagem
   * piscaria antes da resposta chegar.
   */
  const semObraNoConverge =
    ehObra &&
    !obrasLoading &&
    !obrasError &&
    obras !== null &&
    obras.length === 0;

  /*
   * O diálogo de obra AGUARDA a resposta do Converge antes de decidir o que
   * mostrar (10/09/2026).
   *
   * ⚠️ Sem isto o formulário abria completo e, quando a lista chegava vazia,
   * ele SUMIA e dava lugar ao aviso — o usuário podia já ter começado a
   * preencher. No stub o intervalo é imperceptível; no driver real a leitura é
   * ao vivo contra um terceiro que já bloqueou por taxa outra integração desta
   * plataforma (a ANP), então a troca aconteceria bem depois do primeiro
   * clique.
   *
   * `obras === null` faz parte da condição (e não só `obrasLoading`): o efeito
   * que busca dispara DEPOIS do primeiro render, e naquele instante
   * `obrasLoading` ainda é `false` — o formulário piscaria por um frame.
   *
   * Os dois casos que NÃO esperam: sem oportunidade (não há a quem perguntar e
   * a lista nunca chega — seria espera infinita) e erro de leitura (o
   * formulário permanece, com a frase do backend sob o seletor).
   */
  const aguardandoObras =
    ehObra &&
    obrasHabilitadas &&
    !obrasError &&
    (obras === null || obrasLoading);

  /*
   * No diálogo de obra o seletor é OBRIGATÓRIO e aparece sempre: a obra é o
   * assunto do diálogo, e escondê-la por finalidade deixaria o usuário sem o
   * único campo que o formulário existe para preencher.
   */
  /*
   * RF-05 — o campo `Obra confirmada (Converge)` **SAIU da adição direta**:
   * recurso criado diretamente não se associa a uma obra. Ele existe apenas no
   * diálogo de obra, onde é obrigatório.
   *
   * ⚠️ A condição antiga (`finalidade ∈ FINALIDADES_COM_OBRA_CONFIRMADA`) some
   * junto: com o campo restrito ao diálogo de obra, gatear por finalidade
   * esconderia o único controle que aquele diálogo existe para preencher.
   */
  const showObraConfirmada = ehObra;

  /**
   * A obra escolhida no seletor.
   *
   * Estado LOCAL do modal, e não escrita imediata: a obra só é vinculada no
   * submit. Escrever no `onChange` faria o botão Cancelar mentir — o vínculo é
   * da oportunidade inteira, então uma troca abandonada ficaria valendo para
   * todos os recursos e para o Termo de Cessão.
   *
   * Inicia na obra já vinculada, para o seletor mostrar o vínculo atual em vez
   * de um placeholder que sugere que não há nenhum.
   */
  const [obraEscolhida, setObraEscolhida] = useState<string>(
    initial.custeadoPelaObra ? (obraVinculada?.estimateId ?? "") : "",
  );
  useEffect(() => {
    /*
     * ⚠️ Condicionado ao `initial.custeadoPelaObra`, e essa condição é a defesa
     * inteira. O vínculo é da OPORTUNIDADE e chega depois (carga tardia); o flag
     * é do RECURSO. Sem a condição, abrir para editar um recurso que não é
     * custeado pela obra — para mexer em parcelas, digamos — pré-selecionaria a
     * obra e o save o associaria em SILÊNCIO. Associação silenciosa é o defeito
     * do default `CIF` e do CPV fictício.
     *
     * Na criação, `initial.custeadoPelaObra` é `false`, então o seletor abre no
     * placeholder e a associação exige escolha explícita.
     */
    if (initial.custeadoPelaObra && obraVinculada)
      setObraEscolhida(obraVinculada.estimateId);
  }, [obraVinculada, initial.custeadoPelaObra]);

  /**
   * A obra a exibir no cronograma: a escolhida agora no seletor.
   *
   * Lê da lista carregada, e cai na obra já vinculada quando ela não está lá —
   * a lista é leitura ao vivo do Converge e pode falhar, e nesse caso o retrato
   * local é o que a tela tem. Sem nenhuma das duas, não há cronograma.
   */
  const obraDoCronograma =
    obraEscolhida === ""
      ? null
      : ((obras ?? []).find((o) => o.estimateId === obraEscolhida) ??
        (obraVinculada?.estimateId === obraEscolhida ? obraVinculada : null));

  /**
   * Escolher a obra apenas REGISTRA a escolha — não preenche mais campo nenhum.
   *
   * ⚠️ O preenchimento automático (`prefillFromObra`: qtd. de parcelas, valor
   * da parcela, periodicidade e índice) foi REMOVIDO em 09/09/2026 junto com a
   * função: os quatro campos que ele preenchia saíram do único diálogo que tem
   * seletor de obra (RF-02), porque agora é a PARCELA que os define, um item
   * por linha (RF-04). Preencher campo que não está na tela seria trabalho
   * invisível — e a nota de procedência descreveria uma conta que ninguém vê.
   */
  const handleObraChange = useCallback((estimateId: string) => {
    setObraEscolhida(estimateId);
    /*
     * Trocar de obra descarta a linha escolhida à mão: ela era resposta sobre
     * a obra ANTERIOR, e mantê-la faria a nova obra herdar em silêncio uma
     * finalidade que ninguém escolheu para ela.
     */
    setLinhaEscolhida("");
  }, []);

  /*
   * ── Termo de Cessão e linha da obra (pedido do negócio, 10/09/2026) ───────
   *
   * O flag nasce MARCADO: *"O padrão comercial exige a utilização de Termo de
   * Cessão"*. Desmarcá-lo é um desvio, e tem duas consequências — a liberação
   * anda 30 dias, e o parecer SNEG recebe um apontamento com "Atende padrão
   * comercial" respondido "Não". A segunda é do BACKEND (é ele que gera o
   * parecer); a tela apenas a anuncia, para o gesto não ter efeito invisível.
   */
  const [termoCessao, setTermoCessao] = useState(true);

  /**
   * A linha respondida pelo LT — só existe quando a OBRA não a declara.
   *
   * ⚠️ A tela não deriva linha nenhuma: `obra.linhaImagem` já vem derivada do
   * backend, que lê o prefixo do `AnotherValueList`. Uma segunda derivação
   * aqui divergiria justamente no envelope ambíguo.
   */
  const [linhaEscolhida, setLinhaEscolhida] = useState<LinhaDeImagem | "">("");

  const linhaDaObra = obraDoCronograma?.linhaImagem ?? null;
  const linhaEfetiva: LinhaDeImagem | null =
    linhaDaObra ?? (linhaEscolhida === "" ? null : linhaEscolhida);
  /** A obra foi escolhida, mas não diz qual é a linha — quem responde é o LT. */
  const precisaEscolherLinha =
    ehObra && obraEscolhida !== "" && linhaDaObra === null;
  const camposDaObra = linhaEfetiva
    ? camposDaLinhaDeImagem(linhaEfetiva)
    : null;

  /**
   * A data de liberação inicial, derivada — o LT não a escolhe mais.
   *
   * ⚠️ O BACKEND deriva a mesma data e é ele quem grava (o campo saiu do
   * corpo). Isto é o que a tela exibe, travado: os dois lados têm de mostrar e
   * gravar o mesmo dia, e por isso a conta está em `lib/obras`, testada.
   */
  const dataLiberacaoDaObra = ehObra
    ? dataLiberacaoInicialDaObra(analysisStart, termoCessao)
    : null;

  /*
   * Os três campos travados acompanham a obra, a linha e o flag. Efeito, e não
   * valor derivado direto no JSX, porque eles continuam vivendo no `form` — é
   * de lá que o submit e a lista de "campos faltando" os leem, e mantê-los
   * fora criaria uma segunda fonte da verdade dentro do mesmo formulário.
   */
  useEffect(() => {
    if (!ehObra) return;
    setForm((f) => {
      const finalidadeRecurso = camposDaObra?.finalidade ?? "";
      const etapaLiberacao = camposDaObra?.etapaContratacao ?? "";
      const dataLiberacao = dataLiberacaoDaObra ?? "";
      if (
        f.finalidadeRecurso === finalidadeRecurso &&
        f.etapaLiberacao === etapaLiberacao &&
        f.dataLiberacao === dataLiberacao
      ) {
        // Sem isto, `setForm` com objeto novo a cada render entraria em laço.
        return f;
      }
      return { ...f, finalidadeRecurso, etapaLiberacao, dataLiberacao };
    });
  }, [
    ehObra,
    camposDaObra?.finalidade,
    camposDaObra?.etapaContratacao,
    dataLiberacaoDaObra,
  ]);

  function handleSubmit(e: React.FormEvent) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    e.preventDefault();
    setValidationError(null);

    /*
     * Name the fields that are missing, never "preencha todos os campos".
     *
     * The generic sentence left the user hunting: measured on 20/08/2026, a
     * submit missing only **Periodicidade** — the last control, below the fold —
     * reported the same text as a submit missing everything.
     *
     * ⚠️ A lista tem de cobrir TODO obrigatório vazio, não um subconjunto. Ela
     * nasceu com 5 rótulos enquanto o formulário tem 8 campos com `*`, e os
     * outros três (`Valor da parcela`, `Índice de correção da parcela`,
     * `Tipo de bonificação`) eram cobrados depois, um por submit: o usuário
     * corrigia os listados, submetia, e levava outra mensagem. Reportado com o
     * tipo `Antecipada`, onde o índice da parcela passou a ser obrigatório
     * (ADO 67588) e ficava de fora.
     *
     * A ordem é a da TELA, de cima para baixo — é o que permite varrer a lista
     * contra o formulário.
     *
     * "Vazio" e "preenchido mas inválido" são consertos diferentes e NÃO
     * colapsam: quantidade e valor com conteúdo inválido seguem com as
     * mensagens próprias (mais abaixo), que dizem qual é o limite.
     */
    /*
     * ADO 67588: o índice da parcela é obrigatório em todo recurso pago
     * ADIANTADO — inclusive a bonificação ANTECIPADA (`aceitaIndiceCorrecaoParcela`).
     *
     * Cobrado na criação e, na edição, só quando o campo MUDOU — o mesmo recorte
     * que a validação de `dataLiberacao` mais abaixo aplica, e pela mesma razão:
     * com a exigência estendida ao `Antecipada`, uma linha gravada antes (sem
     * índice) passaria a exigir o preenchimento dele para qualquer outra
     * alteração. Editar o valor da parcela ficaria bloqueado por um campo que o
     * usuário não tocou — foi o que 3 testes de linha legada acusaram.
     *
     * Uma variável, um lugar: esta condição já existiu duplicada (aqui e num
     * `if` próprio depois da lista), e duas cópias fariam a lista pedir um campo
     * que a validação não cobra, ou o contrário.
     */
    const indiceParcelaExigidoAgora =
      exigeIndiceParcela &&
      (mode === "create" ||
        form.indiceCorrecaoParcela !== initial.indiceCorrecaoParcela);

    /*
     * Prestações e Carência viraram obrigatórias em 10/09/2026, por pedido do
     * negócio — *"se o tipo de registro for mútuo … preciso que esses campos
     * sejam obrigatórios e sinalizados"*.
     *
     * ⚠️ **Mesmo recorte do `indiceParcelaExigidoAgora`, e pela MESMA razão:** o
     * campo era opcional até esta data, então cobrá-lo na edição de uma linha
     * gravada antes travaria qualquer OUTRA alteração por um campo que o usuário
     * não tocou. Editar o valor da parcela de um Mútuo antigo ficaria bloqueado
     * pela carência — o defeito que 3 testes de linha legada acusaram quando o
     * índice da parcela passou a ser exigido (ADO 67588).
     *
     * O backend concorda por construção: a exigência está no `create` DTO
     * (`@ValidateIf(aceitaCamposDeRessarcimento)` sem `@IsOptional`) e o `update`
     * segue permissivo.
     *
     * ⚠️ **`Juros mensais` entrou em 17/09/2026, pelo MESMO pedido e com o MESMO
     * recorte** — *"colocar como obrigatório o campo de juros mensais assim como
     * já está a carência e deixar habilitado em caso de troca"*. Isto REVISA a
     * nota de 10/09/2026 ("`Juros` não entra: continua opcional, não foi
     * pedido"), que era verdadeira enquanto o campo não tinha sido nomeado — e
     * revisa junto o caso de teste que a prendia. O "em caso de troca" é a
     * segunda metade do gate: quem TROCA o valor tem de deixá-lo preenchido; a
     * linha legada que ninguém tocou continua editável.
     *
     * Um gate POR CAMPO, não um só para os três: quem corrige a carência de uma
     * linha legada não deve ser cobrado pelas prestações que não mexeu.
     */
    const prestacoesExigidaAgora =
      exigeCamposRessarcimento &&
      (mode === "create" || form.qtdPrestacoes !== initial.qtdPrestacoes);
    const carenciaExigidaAgora =
      exigeCamposRessarcimento &&
      (mode === "create" || form.carenciaMeses !== initial.carenciaMeses);
    const jurosExigidoAgora =
      exigeCamposRessarcimento &&
      (mode === "create" || form.jurosPercentual !== initial.jurosPercentual);

    const faltando = [
      !form.tipoRegistro && "Tipo de registro",
      // Só existe na tela para a linha legada `BONIFICACAO`; nos tipos do
      // catálogo o sub-tipo vem do próprio `Tipo__c`.
      isLegacyBonificacao && !form.tipoBonificacao && "Tipo de bonificação",
      !form.finalidadeRecurso && "Finalidade",
      !form.etapaLiberacao && "Etapa da liberação",
      !form.dataLiberacao &&
        (ehObra ? "Data de liberação inicial" : "Data de liberação"),
      /*
       * Os quatro campos que a PARCELA define não existem no diálogo de obra
       * (RF-02/RF-04) — cobrá-los mandaria o usuário procurar um controle que a
       * tela não tem. `Obra confirmada (Converge)` entra no lugar deles.
       */
      !ehObra && !form.qtdParcelas.trim() && "Qtd. de parcelas",
      !ehObra && !form.valorParcela.trim() && "Valor da parcela",
      ehObra && obraEscolhida === "" && "Obra confirmada (Converge)",
      /*
       * A obra não declara a linha (Pista / BR Mania / Lubrax+) e ela define
       * finalidade e etapa. Sem resposta, o backend recusa com 422 — cobrar
       * aqui evita a ida ao servidor e nomeia o controle que está na tela.
       */
      precisaEscolherLinha && linhaEscolhida === "" && "Linha da obra",
      /*
       * Os quatro do Ressarcimento, na ordem em que a tela os desenha
       * (`Prestações` → `Índice de correção das prestações` → `Carência` →
       * `Juros mensais`).
       */
      prestacoesExigidaAgora && !form.qtdPrestacoes.trim() && "Prestações",
      // O rótulo acompanha o do campo na tela (27/08/2026): nomear "da parcela"
      // aqui mandaria o usuário procurar um controle que não existe mais.
      indiceParcelaExigidoAgora &&
        !form.indiceCorrecaoParcela &&
        "Índice de correção das prestações",
      // `0` é resposta válida (carência nenhuma), então o vazio é a string em
      // branco — nunca `!Number(...)`, que trataria "0" como não preenchido.
      carenciaExigidaAgora && !form.carenciaMeses.trim() && "Carência (meses)",
      // Como a carência, `0` é resposta válida (mútuo sem juros), então o vazio
      // é a string em branco — `!Number(...)` leria "0" como não preenchido.
      jurosExigidoAgora && !form.jurosPercentual.trim() && "Juros mensais (%)",
      /*
       * A `Justificativa` é a última do bloco na tela, e a única que entra nesta
       * lista por VALOR de outro campo (juros > 1% — 22/09/2026) em vez de por
       * tipo de registro. O predicado é o MESMO que marca o `*` e desenha o
       * aviso em vermelho: uma condição para sinalizar e outra para recusar
       * deixaria o usuário descobrir a exigência só no clique.
       */
      justificativaExigidaPorJuros &&
        !form.justificativa.trim() &&
        "Justificativa",
      // Como qtd. e valor: o campo não existe no diálogo de obra (a parcela o
      // define como `Única`), então cobrá-lo mandaria o usuário procurar um
      // controle que a tela não tem.
      !ehObra && !form.periodicidade && "Periodicidade",
    ].filter((label): label is string => typeof label === "string");

    if (faltando.length > 0) {
      setValidationError(
        faltando.length === 1
          ? `Informe ${faltando[0]}.`
          : `Informe: ${faltando.join(", ")}.`,
      );
      return;
    }

    /*
     * Redundant at runtime — `faltando` is empty here — but it is what narrows
     * the four `'' | Enum` fields for the payload below. The array form cannot
     * narrow, and widening the payload types instead would let a genuinely
     * empty value through to the API.
     */
    if (
      !form.tipoRegistro ||
      !form.finalidadeRecurso ||
      !form.etapaLiberacao ||
      !form.dataLiberacao ||
      // Periodicidade é derivada da parcela no diálogo de obra (`Única`): ela
      // não está no formulário e não pode barrar o submit.
      (!ehObra && !form.periodicidade)
    ) {
      return;
    }

    if (isBonificacao && !form.tipoBonificacao) {
      setValidationError(
        "Tipo de bonificação é obrigatório para recursos do tipo Bonificação.",
      );
      return;
    }

    // CA-3 / Bug-67514: data de liberação must fall within (dataInicioAnalise,
    // dataFimAnalise] — strictly after the start, at or before the end.
    // Only checked when the date is NEW or CHANGED — mirrors the backend, which
    // revalidates only when `dataLiberacao` travels in the PATCH. An edit that
    // touches only `valorParcela` on a row whose (grandfathered) date is out of
    // the window must not be bricked by a field the user never touched.
    const dataLiberacaoChanged =
      mode === "create" ||
      form.dataLiberacao.slice(0, 10) !== initial.dataLiberacao.slice(0, 10);
    if (
      analysisStart &&
      analysisEnd &&
      form.dataLiberacao &&
      dataLiberacaoChanged
    ) {
      const d = form.dataLiberacao.slice(0, 10);
      /*
       * ⚠️ Limite inferior INCLUSIVO nos DOIS diálogos desde 16/09/2026 (o
       * Bug-67514 revisto). A frase é própria — a genérica ("fora do período")
       * seria enganosa —, e espelha a do backend, que é a autoridade.
       */
      if (d < analysisStart) {
        setValidationError(
          `A data de liberação não pode ser anterior à data de início da análise (${formatDate(analysisStart)}).`,
        );
        return;
      }
      if (d > analysisEnd) {
        setValidationError(
          `Data de liberação deve estar dentro do período de análise (${formatDate(analysisStart)} a ${formatDate(analysisEnd)}).`,
        );
        return;
      }
    }

    const qtdParcelas = Number(form.qtdParcelas);
    // Masked pt-BR input ("1.234,56") — Number() would misread the separators.
    const valorParcela = parseMoneyInput(form.valorParcela) ?? NaN;

    /*
     * Os dois não existem no diálogo de obra (RF-02): a parcela define
     * quantidade (1) e valor. Validá-los ali recusaria o formulário por campos
     * vazios que a tela nem mostra.
     */
    if (!ehObra) {
      if (!Number.isInteger(qtdParcelas) || qtdParcelas < 1) {
        setValidationError(
          "Quantidade de parcelas deve ser um número inteiro maior que zero.",
        );
        return;
      }

      if (!Number.isFinite(valorParcela) || valorParcela <= 0) {
        setValidationError("Valor da parcela deve ser maior que zero.");
        return;
      }
    }

    /*
     * A DATA FINAL do cronograma tem de caber no contrato (10/09/2026).
     *
     * O CA-3 acima cobre só o COMEÇO: no relato, a liberação estava dentro da
     * janela e as 17 parcelas mensais terminavam dois meses depois do fim do
     * contrato. O término é `analysisEnd` — `prazoContratoMeses` é DERIVADO da
     * janela de análise, não um campo à parte.
     *
     * Mesmo recorte do CA-3, e pela mesma razão: só quando uma das três
     * entradas da data final é nova ou mudou. Sem isso, editar o valor de um
     * recurso legado cujo cronograma já estoura o contrato deixaria a linha
     * INEDITÁVEL — e é a tela que teria de consertá-la.
     *
     * ⚠️ O veredito do backend continua sendo a autoridade; isto o antecipa.
     */
    const cronogramaMudou =
      mode === "create" ||
      form.dataLiberacao.slice(0, 10) !== initial.dataLiberacao.slice(0, 10) ||
      form.qtdParcelas !== initial.qtdParcelas ||
      form.periodicidade !== initial.periodicidade;

    if (cronogramaMudou) {
      const motivo = motivoDataFinalForaDoContrato(
        {
          dataLiberacao: form.dataLiberacao,
          qtdParcelas,
          // `""` (não escolhida) vira `null`: sem periodicidade não há
          // cronograma a conferir, e a regra degrada para "não sei".
          periodicidade: form.periodicidade || null,
        },
        { fim: analysisEnd },
      );
      if (motivo) {
        setValidationError(motivo);
        return;
      }
    }

    /*
     * Campos da família de MÚTUO (ADO 67799 / 67800). ⚠️ **Carência e juros
     * deixaram de ser opcionais** — a carência em 10/09/2026 e os juros em
     * 17/09/2026, os dois por pedido do negócio, contra a medição do org
     * (`Carencia_meses__c` está em 1.240 das ~1.703 linhas `Mútuo`). A
     * `Justificativa__c` segue opcional (588 de 48.807).
     *
     * O parse continua tolerante ao vazio de propósito: na EDIÇÃO de uma linha
     * gravada antes da regra o campo intocado não é cobrado (ver
     * `carenciaExigidaAgora`/`jurosExigidoAgora`), e é este caminho que manda
     * `null` em vez de `0` — zero afirmaria carência nenhuma e juros 0% como
     * resposta do usuário.
     */
    const carenciaMeses = exigeCamposRessarcimento
      ? parseOptionalInt(form.carenciaMeses)
      : null;
    const jurosPercentual = exigeCamposRessarcimento
      ? parseOptionalDecimal(form.jurosPercentual)
      : null;

    if (exigeCamposRessarcimento && carenciaMeses === INVALID_NUMBER) {
      setValidationError(
        "Carência deve ser um número inteiro de meses (0 ou mais).",
      );
      return;
    }
    if (exigeCamposRessarcimento && jurosPercentual === INVALID_NUMBER) {
      setValidationError(
        "Juros deve ser um percentual mensal com até 2 casas decimais.",
      );
      return;
    }
    /*
     * Prestações do ressarcimento (`Qtde_Prestacoes__c`) — OPCIONAL, como os
     * outros campos da família de Mútuo: o org não o exige (nulo em 146 de 477
     * linhas `Mútuo Enc. Contas` e em todas as 1.713 `Mútuo`), e exigi-lo
     * recusaria o que o CRM aceita.
     *
     * Vazio ⇒ `null`; `0` é recusado pelo `@Min(1)` do DTO, e a mensagem daqui
     * nomeia o limite em vez de deixar o 400 genérico do backend aparecer.
     */
    const qtdPrestacoes = exigeCamposRessarcimento
      ? parseOptionalInt(form.qtdPrestacoes)
      : null;

    if (exigeCamposRessarcimento && qtdPrestacoes === INVALID_NUMBER) {
      setValidationError("Prestações deve ser um número inteiro.");
      return;
    }
    if (
      exigeCamposRessarcimento &&
      qtdPrestacoes !== null &&
      (qtdPrestacoes as number) < 1
    ) {
      setValidationError("Prestações deve ser maior que zero.");
      return;
    }
    const bonusQtdParcelas = exigeCamposBonusNovoMutuo
      ? parseOptionalInt(form.bonusQtdParcelas)
      : null;
    /*
     * `parseMoneyInput`, não `parseOptionalDecimal`: o input carrega a máscara
     * pt-BR ("283.888,83"), e o parser de decimal genérico a lê como número
     * inválido — o save era recusado com uma mensagem sobre casas decimais para
     * um valor perfeitamente válido. Vazio continua sendo `null` (o campo é
     * opcional), nunca `0`.
     */
    const bonusValorParcela = !exigeCamposBonusNovoMutuo
      ? null
      : form.bonusValorParcela.trim() === ""
        ? null
        : (parseMoneyInput(form.bonusValorParcela) ?? INVALID_NUMBER);

    if (exigeCamposBonusNovoMutuo && bonusQtdParcelas === INVALID_NUMBER) {
      setValidationError(
        "Quantidade de parcelas do bônus deve ser um número inteiro.",
      );
      return;
    }
    if (
      exigeCamposBonusNovoMutuo &&
      bonusQtdParcelas !== null &&
      (bonusQtdParcelas as number) > 99
    ) {
      // Teto do org: `Quantidade_de_Parcelas__c` é `Número(2,0)`, então 100
      // seria truncado lá — recusar aqui é melhor que perder o dígito.
      setValidationError(
        "O bônus aceita no máximo 99 parcelas (limite do campo no CRM).",
      );
      return;
    }
    if (exigeCamposBonusNovoMutuo && bonusValorParcela === INVALID_NUMBER) {
      setValidationError(
        "Valor da parcela do bônus deve ser um número com até 2 casas decimais.",
      );
      return;
    }

    if (exigeJustificativa && form.justificativa.trim().length > 255) {
      setValidationError("Justificativa deve ter no máximo 255 caracteres.");
      return;
    }

    if (ehObra) {
      /*
       * O diálogo de obra tem submit PRÓPRIO: o backend gera N recursos a
       * partir das parcelas, então não há "um recurso" a mandar — só os campos
       * copiados (RF-03) e a obra. Reaproveitar o `onSave` obrigaria a inventar
       * aqui a quantidade e o valor que a parcela é quem define.
       */
      onSaveObra?.({
        estimateId: obraEscolhida,
        termoCessao,
        /*
         * Só viaja quando a OBRA não declara a linha: quando ela declara, o
         * backend ignora este campo de qualquer forma (a fonte vence), e
         * mandá-lo sugeriria uma escolha que o usuário não fez.
         */
        ...(linhaDaObra === null && linhaEscolhida !== ""
          ? { linhaImagem: linhaEscolhida }
          : {}),
        tipoRegistro: form.tipoRegistro,
        tipoBonificacao: isBonificacao ? form.tipoBonificacao || null : null,
        indiceCorrecaoParcela: exigeIndiceParcela
          ? form.indiceCorrecaoParcela || null
          : null,
        carenciaMeses: carenciaMeses as number | null,
        jurosPercentual: jurosPercentual as number | null,
        justificativa: exigeJustificativa
          ? form.justificativa.trim() || null
          : null,
        qtdPrestacoes: qtdPrestacoes as number | null,
        bonusPeriodicidade: exigeCamposBonusNovoMutuo
          ? form.bonusPeriodicidade || null
          : null,
        bonusQtdParcelas: exigeCamposBonusNovoMutuo
          ? (bonusQtdParcelas as number | null)
          : null,
        bonusValorParcela: exigeCamposBonusNovoMutuo
          ? (bonusValorParcela as number | null)
          : null,
        bonusIndiceCorrecaoPrestacao: exigeCamposBonusNovoMutuo
          ? form.bonusIndiceCorrecaoPrestacao || null
          : null,
        bonusTipoAtualizacaoMonetaria: exigeCamposBonusNovoMutuo
          ? form.bonusTipoAtualizacaoMonetaria || null
          : null,
      });
      return;
    }

    /*
     * Estreita o tipo de `periodicidade` para o `onSave`. A guarda de campos
     * vazios lá em cima passou a ser condicional (`!ehObra && …`) porque o
     * diálogo de obra não tem o campo, e com isso o compilador perdeu a
     * garantia — este caminho só é alcançado fora daquele diálogo. Um `as`
     * aqui esconderia um dia em que a guarda mudasse.
     */
    if (!form.periodicidade) return;

    onSave({
      tipoRegistro: form.tipoRegistro,
      tipoBonificacao: isBonificacao
        ? (form.tipoBonificacao as TipoBonificacao)
        : undefined,
      finalidadeRecurso: form.finalidadeRecurso,
      etapaLiberacao: form.etapaLiberacao,
      dataLiberacao: form.dataLiberacao,
      qtdParcelas,
      valorParcela,
      indiceCorrecao: form.indiceCorrecao || undefined,
      /*
       * ADO 67588: só viaja onde o bloco Ressarcimento existe — fora dele
       * (bonificação, e o Novo Mútuo desde 03/09/2026) vai `undefined`, ou seja
       * omitido.
       *
       * ⚠️ Omitir NÃO limpa um valor já gravado (é o único campo do bloco cujo
       * tipo de entrada não admite `null`). Quem limpa a linha de Novo Mútuo
       * anterior à mudança é o `update` do backend, que anula os quatro pelo
       * mesmo predicado — sem isso o índice ficaria num estado inalcançável,
       * invisível na tela e impossível de corrigir.
       */
      indiceCorrecaoParcela: exigeIndiceParcela
        ? (form.indiceCorrecaoParcela as IndiceCorrecao) || undefined
        : undefined,
      periodicidade: form.periodicidade,
      /*
       * RF-05 — a criação direta NÃO associa obra: `initial` é o formulário
       * vazio, com `false`. A associação nova é o `proposal_estimate_link_id`
       * que o fluxo "Adicionar obra" grava.
       *
       * ⚠️ **Na EDIÇÃO, PRESERVA o valor gravado.** O seletor saiu deste
       * modal, então não existe mais gesto de desassociar aqui — e mandar
       * `false` fixo DESLIGARIA em silêncio a obra de toda linha legada que
       * alguém abrisse para corrigir outra coisa. Não é cosmético: aquele flag
       * é a entrada de `deriveContractingModel` no caminho legado, e a linha
       * desligada deixa de contar no GATE 1.
       */
      custeadoPelaObra: initial.custeadoPelaObra,
      /*
       * `null` quando o tipo não carrega o campo — bonificação, e o Novo Mútuo
       * desde 03/09/2026 — ou quando o campo foi limpo; e `null` é o que apaga
       * no PUT. Omitir manteria o valor gravado, tornando um engano permanente,
       * e é o que faria uma linha de Novo Mútuo anterior à mudança ficar com
       * carência e juros inalcançáveis pela tela.
       */
      carenciaMeses: carenciaMeses as number | null,
      jurosPercentual: jurosPercentual as number | null,
      justificativa: exigeJustificativa
        ? form.justificativa.trim() || null
        : null,
      qtdPrestacoes: qtdPrestacoes as number | null,
      /*
       * Bônus do Novo Mútuo (ADO 67587). Fora do Novo Mútuo vai `null`: o DTO
       * recusa esses campos com 400 nos demais tipos, então mandá-los ali
       * derrubaria o save inteiro por um valor que a tela nem mostra.
       */
      bonusPeriodicidade: exigeCamposBonusNovoMutuo
        ? form.bonusPeriodicidade || null
        : null,
      bonusQtdParcelas: exigeCamposBonusNovoMutuo
        ? (bonusQtdParcelas as number | null)
        : null,
      bonusValorParcela: exigeCamposBonusNovoMutuo
        ? (bonusValorParcela as number | null)
        : null,
      bonusIndiceCorrecaoPrestacao: exigeCamposBonusNovoMutuo
        ? form.bonusIndiceCorrecaoPrestacao || null
        : null,
      bonusTipoAtualizacaoMonetaria: exigeCamposBonusNovoMutuo
        ? form.bonusTipoAtualizacaoMonetaria || null
        : null,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        ehObra
          ? "Adicionar obra"
          : mode === "create"
            ? "Adicionar recurso financeiro"
            : "Editar recurso financeiro"
      }
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* noValidate: min/max on the date input exist to grey out-of-range days
          in the PICKER; native constraint validation would also block the form
          submit — including edits of grandfathered rows whose stored date is
          outside the current window, which must keep saving (see handleSubmit). */}
      <form
        noValidate
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-md)] bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,.3)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h4 className="text-(length:--t-h4) font-bold">
            {ehObra
              ? "Adicionar obra"
              : mode === "create"
                ? "Adicionar recurso financeiro"
                : "Editar recurso financeiro"}
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            &times;
          </button>
        </div>

        {/*
          Sem obra no Converge, o diálogo mostra SÓ o aviso: nenhum campo deste
          formulário é preenchível sem uma obra a escolher, e um formulário
          inteiro atrás de um seletor vazio convida a preencher o que não vai
          salvar.
        */}
        {aguardandoObras ? (
          <div
            role="status"
            aria-label="Carregando obras do cliente…"
            data-testid="obra-carregando"
            className="flex items-center gap-2 py-8 text-(length:--t-caption) text-(--color-text-muted)"
          >
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
            />
            Carregando obras do cliente…
          </div>
        ) : semObraNoConverge ? (
          <div
            role="status"
            data-testid="obra-sem-obra-aviso"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-(length:--t-small) text-(--yellow-700)"
          >
            Este cliente não tem obra no Converge
          </div>
        ) : (
          <>
            {/*
              ⚠️ `items-start` no diálogo de obra: a célula do flag tem o aviso
              sob o controle, e alinhar pela BASE empurraria o rótulo "Tipo de
              registro" para baixo — o mesmo defeito de 46 px que a linha
              "Qtd. de parcelas × Valor da parcela" já pagou.
            */}
            <div
              className={`mb-3 grid grid-cols-2 gap-3 ${ehObra ? "items-start" : "items-end"}`}
            >
              <div className="min-w-0">
                <FieldLabel htmlFor="rm-tipo" required>
                  Tipo de registro
                </FieldLabel>
                <Select
                  id="rm-tipo"
                  value={form.tipoRegistro}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      tipoRegistro: v as TipoRegistroRecursoFinanceiro,
                      // Derived from the catalog value; kept as picked on a legacy
                      // BONIFICACAO row; cleared for non-bonus types.
                      tipoBonificacao:
                        DERIVED_TIPO_BONIFICACAO[v] ??
                        (BONUS_TIPOS.has(v) ? f.tipoBonificacao : ""),
                    }))
                  }
                  options={visibleTipoOptions}
                />
              </div>

              {/*
                O flag "Termo de Cessão" (10/09/2026), AO LADO do tipo de
                registro e marcado por padrão. O aviso fica sob ele porque é
                ele que explica o default — e, desmarcado, a tela nomeia as
                duas consequências: o gesto tem efeito no PARECER, que é outra
                tela e outro perfil, e um efeito invisível seria indistinguível
                de nenhum efeito.
              */}
              {ehObra && (
                <div className="min-w-0">
                  <label className="flex items-center gap-2 text-(length:--t-body)">
                    <input
                      type="checkbox"
                      checked={termoCessao}
                      onChange={(e) => setTermoCessao(e.target.checked)}
                      data-testid="obra-termo-cessao"
                      className="h-4 w-4 accent-(--secondary-500)"
                    />
                    Termo de Cessão
                  </label>
                  <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
                    O padrão comercial exige a utilização de Termo de Cessão
                  </p>
                  {!termoCessao && (
                    <p
                      role="status"
                      data-testid="obra-sem-termo-cessao-aviso"
                      className="mt-1 text-(length:--t-caption) text-(--yellow-700)"
                    >
                      Sem o Termo de Cessão, a liberação inicial passa a 30 dias
                      após o início da análise, o parecer SNEG recebe um
                      apontamento e “Atende padrão comercial” fica marcado como
                      “Não”.
                    </p>
                  )}
                </div>
              )}

              {isLegacyBonificacao && (
                <div className="min-w-0">
                  <FieldLabel htmlFor="rm-sub" required>
                    Tipo de bonificação
                  </FieldLabel>
                  <Select
                    id="rm-sub"
                    value={form.tipoBonificacao}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        tipoBonificacao: v as TipoBonificacao,
                      }))
                    }
                    options={domains.tipoBonificacao.map((v) => ({
                      value: v,
                      label: TIPO_BONIFICACAO_LABELS[v],
                    }))}
                  />
                </div>
              )}
            </div>

            {/*
              ⚠️ ORDEM (10/09/2026): a obra vem ANTES de Finalidade, Etapa e
              Data de liberação inicial, porque é ela que define os três. O
              pedido do negócio é explícito ("é preciso alterar a ordem dos
              campos na tela"), e a ordem antiga pedia ao LT que respondesse
              campos que a escolha seguinte ia sobrescrever.
            */}
            {/* CA-2: obra confirmada (Converge) — only for physical investment finalidades.
            Hidden for "Serviço Especializado em Garantia Real" and "Impostos referentes
            a Imagem" (administrative types with no associated obra). Field is
            informational only and does not travel in the mutation payload until the
            Converge integration is built (D3.8 / G11 / VBR-463). */}
            {showObraConfirmada && (
              <div className="mb-3">
                <FieldLabel htmlFor="rm-obra" required={ehObra}>
                  Obra confirmada (Converge)
                </FieldLabel>
                {/*
              Quatro estados distintos, e nenhum deles é uma lista vazia
              silenciosa (ADR-0048):

              1. sem oportunidade  → desabilitado, nomeia a razão. Não há a quem
                 perguntar; nenhuma chamada ao Converge acontece.
              2. carregando        → desabilitado, "Carregando obras…".
              3. erro              → o seletor NÃO renderiza uma lista vazia (que
                 afirmaria "o cliente não tem obra"); a frase do backend aparece
                 abaixo, porque é ela que diz o que fazer.
              4. carregado         → o seletor real, ou a frase de negócio quando
                 o cliente realmente não tem obra.

              O rótulo de cada opção é o do protótipo: `id · tipo — valor ·
              status`, com o status CRU da fonte (`obraOptionLabel`).
            */}
                <Select
                  id="rm-obra"
                  value={obraEscolhida}
                  onChange={handleObraChange}
                  options={(obras ?? []).map((obra) => ({
                    value: obra.estimateId,
                    label: obraOptionLabel(obra),
                  }))}
                  placeholder={
                    !obrasHabilitadas
                      ? "Obra indisponível nesta tela — abra a proposta pela oportunidade"
                      : obrasLoading
                        ? "Carregando obras…"
                        : obrasError
                          ? "Não foi possível carregar as obras"
                          : obras && obras.length === 0
                            ? "Este cliente não tem obra no Converge"
                            : "Selecione a obra…"
                  }
                  disabled={
                    !obrasHabilitadas ||
                    obrasLoading ||
                    !obras ||
                    obras.length === 0
                  }
                  data-testid="obra-confirmada-field"
                />
                {obrasError && (
                  <p className="mt-1 text-(length:--t-caption) text-(--yellow-700)">
                    {obrasError}
                  </p>
                )}
                {/*
                  ⚠️ Aqui havia o aviso "A oportunidade admite uma obra só: ao
                  salvar, esta escolha substitui a obra X em todos os recursos",
                  REMOVIDO em 10/09/2026 (ADR-0051).
                  
                  Ele afirmava duas coisas que deixaram de valer: o limite é por
                  PROPOSTA, não por oportunidade, e nada é substituído em
                  silêncio — adicionar obra numa proposta que já tem uma é
                  recusado com 422 nomeando o conserto ("Remova a obra atual
                  antes de adicionar outra").
                  
                  Ele também aparecia indevidamente: `obraVinculada` é lido na
                  montagem do bloco e não é limpo ao remover a obra, então
                  bastava adicionar, remover e reabrir o diálogo sem recarregar
                  a página para ler um aviso sobre uma obra que não existe mais.
                */}
              </div>
            )}

            {/*
              A obra não declara a linha de imagem — quem responde é o LT.

              ⚠️ Só aparece nesse caso, e é deliberado: quando a obra declara,
              oferecer o controle convidaria a contradizer a fonte. Medido em
              10/09/2026, as 7 estimativas do Converge `tst` declaram (4 Pista
              pelo prefixo `IMG`, 1 Lubrax+ por `LBX`, 1 BR Mania por `BRM`),
              então este select é a exceção, não o caminho comum.
            */}
            {precisaEscolherLinha && (
              <div className="mb-3">
                <FieldLabel htmlFor="rm-linha" required>
                  Linha da obra
                </FieldLabel>
                <Select
                  id="rm-linha"
                  value={linhaEscolhida}
                  onChange={(v) => setLinhaEscolhida(v as LinhaDeImagem)}
                  options={[...LINHAS_DE_IMAGEM]}
                  placeholder="Selecione a linha…"
                  data-testid="obra-linha-field"
                />
                <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
                  Esta obra não informa se é Imagem Pista, BR Mania ou Lubrax+,
                  e é isso que define a finalidade e a etapa da liberação.
                </p>
              </div>
            )}

            <div className="mb-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                {/* Prototype label is "Finalidade" (03-proposta-nova.html modal). */}
                <FieldLabel htmlFor="rm-fin" required>
                  Finalidade
                </FieldLabel>
                {/*
              An empty-and-clickable dropdown reads as "there is nothing to
              pick"; the truth is "answer the tipo first" or "the catalog did
              not load". Same two states `PicklistSelect` renders — the block
              uses the raw hook, so it has to say them itself.
            */}
                {/*
                  ⚠️ TRAVADA no diálogo de obra (10/09/2026): a finalidade é
                  derivada da LINHA e o backend a recalcula, ignorando o corpo
                  — deixá-la editável ofereceria uma escolha sem efeito.

                  E ela não passa pelo catálogo ali, pela mesma razão da etapa:
                  as opções de `Finalidade__c` são filtradas por `Tipo__c`, e o
                  valor derivado tem de aparecer mesmo que a matriz do org não
                  o publique para o tipo escolhido. O que a tela mostra é o que
                  o backend grava.
                */}
                {/*
                  ⚠️ E TRAVADA também na EDIÇÃO de um item gerado (Bug 68395,
                  reaberto em 14/09/2026): a US 68333 manda a finalidade vir da
                  obra "e não permitir alteração", e travá-la só na criação
                  deixava a trava decorativa — bastava reabrir o diálogo.

                  O valor derivado precisa aparecer MESMO travado, e ele pode
                  não estar no catálogo: `Finalidade__c` é filtrada por
                  `Tipo__c`, e o `Select` cru renderiza o PLACEHOLDER quando o
                  valor não casa com nenhuma opção. É a mesma razão pela qual o
                  diálogo de obra monta a opção única — aqui a opção única é o
                  fallback, para não trocar o catálogo de quem PODE editar
                  (a SNEG, que segue com a lista inteira).
                */}
                <Select
                  id="rm-fin"
                  value={form.finalidadeRecurso}
                  disabled={
                    ehObra ||
                    camposDaObraTravados ||
                    finalidadeAwaitingTipo ||
                    finalidadeStatus === "error"
                  }
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      finalidadeRecurso: v as FinalidadeRecurso,
                    }))
                  }
                  placeholder={
                    ehObra
                      ? "Escolha a obra para preencher"
                      : finalidadeStatus === "error"
                        ? "Opções indisponíveis"
                        : finalidadeAwaitingTipo
                          ? "Selecione o tipo de registro primeiro"
                          : "Selecione…"
                  }
                  options={
                    !ehObra && !camposDaObraTravados
                      ? finalidadeRecursoOptions
                      : form.finalidadeRecurso
                        ? [
                            {
                              value: form.finalidadeRecurso,
                              label: form.finalidadeRecurso,
                            },
                          ]
                        : []
                  }
                />
              </div>
              <div className="min-w-0">
                {/* "Etapa DA liberação" — prototype wording, and the Salesforce
                field is `Etapa_Da_Liberacao__c`. Controlled by Finalidade__c.
                PicklistSelect handles loading / awaiting-controller / error
                states automatically; with the valueSettings matrix measured
                (16/08/2026) the backend now answers ControladorAusente before a
                finalidade is chosen, so the select disables and names what to
                answer first (CA-3).

                A row written while the matrix was still unmapped can carry a
                pair the filter no longer offers; `PicklistSelect` keeps the
                persisted value visible so it does not read as "não respondido". */}
                <FieldLabel htmlFor="rm-etapa" required>
                  Etapa da liberação
                </FieldLabel>
                {/*
                  ⚠️ No diálogo de obra a etapa é DERIVADA e travada, e por
                  isso não passa pelo `PicklistSelect`: o catálogo filtra por
                  finalidade, e a etapa da 1ª parcela ("Após Contratação
                  Fornecedor — Imagem X") tem de aparecer mesmo que a matriz do
                  org não a publique para aquela finalidade. O que a tela
                  mostra é o que o backend grava; a matriz não decide aqui.

                  As parcelas 2 em diante levam "Após Implantação — Imagem X",
                  e é a tabela do cronograma abaixo que as exibe: um campo só
                  não cabe duas etapas.
                */}
                {ehObra ? (
                  <Select
                    id="rm-etapa"
                    value={form.etapaLiberacao}
                    onChange={() => {}}
                    disabled
                    placeholder="Escolha a obra para preencher"
                    options={
                      form.etapaLiberacao
                        ? [
                            {
                              value: form.etapaLiberacao,
                              label: form.etapaLiberacao,
                            },
                          ]
                        : []
                    }
                    data-testid="obra-etapa-field"
                  />
                ) : (
                  <PicklistSelect
                    id="rm-etapa"
                    /*
                      Bug 68395 (14/09/2026): travada na EDIÇÃO do item gerado,
                      pela mesma razão da finalidade. Aqui o `PicklistSelect`
                      fica — e não o `Select` de opção única do diálogo de obra
                      —, porque ele já mantém visível o valor persistido que a
                      matriz não publica para a finalidade corrente.
                    */
                    disabled={camposDaObraTravados}
                    field={PicklistField.RecursoFinanceiroEtapaLiberacao}
                    controllingValue={form.finalidadeRecurso || null}
                    controllingLabel="a finalidade"
                    noPublishedValuesNote="O Salesforce não publica etapas para esta finalidade — todas estão listadas."
                    value={form.etapaLiberacao}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        etapaLiberacao: v as EtapaLiberacaoRecurso,
                      }))
                    }
                  />
                )}
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor="rm-dtlib" required>
                  {/* RF-02: no diálogo de obra a data é a BASE da contagem do prazo
                  de cada parcela, não a data de uma liberação só. */}
                  {ehObra ? "Data de liberação inicial" : "Data de liberação"}
                </FieldLabel>
                {/*
                  CA-3 / Bug-67514, REVISTO em 16/09/2026: o limite inferior é a
                  própria data de início da análise — *"para que eu possa colocar
                  a partir da data de início"*. Antes o picker acinzentava o dia
                  do início (`min = início + 1`), e o diálogo de OBRA precisava
                  de uma exceção porque a 1ª parcela vence exatamente ali: os
                  dois caminhos pediam bordas diferentes para o mesmo campo.
                  Agora é uma só, e a checagem do submit segue como rede — o
                  usuário pode DIGITAR a data, driblando o picker, e os limites
                  podem estar ausentes.

                  ⚠️ O campo continua TRAVADO no diálogo de obra: ali a data é
                  derivada pelos dois lados (o backend a recalcula e o corpo não
                  a carrega mais).
                */}
                <input
                  id="rm-dtlib"
                  type="date"
                  min={analysisStart || undefined}
                  max={analysisEnd}
                  className={FIELD_INPUT_CLASS}
                  value={form.dataLiberacao}
                  /*
                    ⚠️ Bug 68395 (14/09/2026) — travada também na EDIÇÃO do item
                    gerado, e esta é a que o print da reabertura mostra sendo
                    digitada. Ela não é só "mais um campo derivado": é a BASE do
                    cronograma. O item 1 vence nela e os demais um mês depois
                    DELE, então editar a data de um item gerado dessincroniza a
                    série sem nada na tela dizendo isso.
                  */
                  readOnly={ehObra || camposDaObraTravados}
                  disabled={ehObra || camposDaObraTravados}
                  data-testid={ehObra ? "obra-data-liberacao-field" : undefined}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dataLiberacao: e.target.value }))
                  }
                />
              </div>
            </div>

            {/*
          ADO 67924 — as parcelas que o Converge publica para a obra escolhida,
          com valor e data de lançamento.

          Fica logo abaixo do seletor, e não no fim do formulário, porque é ele
          que a explica: escolher a obra preenche qtd. e valor da parcela, e esta
          tabela é a conta de onde os dois saíram. As datas reagem à `Data de
          liberação` (acima) e à `Periodicidade` (abaixo) enquanto o usuário as
          mexe — é o que responde a pergunta do anexo do bug ("que data é esta?").

          Condicional na escolha, não em `showObraConfirmada`: sem obra escolhida
          não há parcela nenhuma a mostrar.
        */}
            {showObraConfirmada && obraDoCronograma && (
              <ObraParcelasCronograma
                /*
                 * A parcela de impostos GERA item aqui (RF-04), então a nota
                 * do cartão legado não vale. A coluna de DATA, que também
                 * tinha saído, voltou em 10/09/2026: com a regra nova (1ª na
                 * data de liberação inicial, demais 30 dias depois) a tabela
                 * mostra exatamente o que o backend vai gravar.
                 */
                variante="dialogo-de-obra"
                parcelas={obraDoCronograma.parcelas}
                dataLiberacao={form.dataLiberacao}
                periodicidade={form.periodicidade}
                /*
                 * Um campo só não cabe as duas etapas (a 1ª parcela libera na
                 * contratação do fornecedor e as demais na implantação), então
                 * é aqui que a segunda aparece — e é a linha da obra que as
                 * define. Sem linha resolvida, nenhuma etapa é afirmada.
                 */
                etapas={camposDaObra}
                testId="obra-parcelas-cronograma-modal"
              />
            )}

            {/*
          ⚠️ `items-start`, e NÃO `items-end`. A célula da direita tem a nota de
          procedência sob o input, então alinhar pelo BASE empurrava a coluna
          "Qtd. de parcelas" 46 px para baixo (medido na tela em 03/09/2026) — o
          rótulo e o campo dela desciam junto e a linha ficava visivelmente
          torta. Com o topo alinhado, rótulo e input ficam na mesma altura e a
          nota simplesmente pende embaixo, que é o lugar dela.
        */}
            <div className="mb-3 mt-3 grid grid-cols-2 items-start gap-3">
              {/* RF-02/RF-04: fora do diálogo de obra — cada item gerado nasce com 1 parcela. */}
              {!ehObra && (
                <div className="min-w-0">
                  <FieldLabel htmlFor="rm-qtd" required>
                    Qtd. de parcelas
                  </FieldLabel>
                  <input
                    id="rm-qtd"
                    disabled={camposDaObraTravados}
                    type="number"
                    min={1}
                    step={1}
                    className={FIELD_INPUT_CLASS}
                    value={form.qtdParcelas}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, qtdParcelas: e.target.value }));
                    }}
                  />
                </div>
              )}
              {/* RF-02/RF-04: fora do diálogo de obra — o valor é o da própria parcela. */}
              {!ehObra && (
                <div className="min-w-0">
                  <FieldLabel htmlFor="rm-vparc" required>
                    Valor da parcela (R$)
                  </FieldLabel>
                  {/* Prototype money input: text + numeric keypad + pt-BR mask
                  (`fmtMoneyInput`), not a raw number field. */}
                  <input
                    id="rm-vparc"
                    disabled={camposDaObraTravados}
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    className={FIELD_INPUT_CLASS}
                    value={form.valorParcela}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        valorParcela: maskMoneyInput(e.target.value),
                      }));
                    }}
                  />
                </div>
              )}
            </div>

            <div className="mb-4 grid grid-cols-2 items-end gap-3">
              {/* RF-02/RF-04: fora do diálogo de obra — cada item nasce `Sem correção`. */}
              {!ehObra && (
                <div className="min-w-0">
                  {/* ADO 67588 / VBR-598: `PicklistSelect`, não `Select` cru.
                  O `Select` renderiza `selectedOption?.label ?? placeholder`, e
                  `selectedOption` sai de `options.find(o => o.value === value)` —
                  então, enquanto o catálogo não responde (ou se a chamada falha),
                  o gatilho mostra o PLACEHOLDER mesmo com o form state já em
                  `Sem correção`. Com o placeholder "Nenhum" isso era o próprio
                  sintoma que o negócio pediu para eliminar: a tela dizia "Nenhum"
                  para um campo cujo valor era `Sem correção`, e sem nenhum sinal
                  de carregamento ou de erro. `PicklistSelect` cobre os três
                  estados (carregando / erro com "Tentar novamente" / valor
                  persistido fora da lista) — ver `picklist-select.tsx`. */}
                  <FieldLabel htmlFor="rm-indice">
                    Índice de correção
                  </FieldLabel>
                  <PicklistSelect
                    id="rm-indice"
                    disabled={camposDaObraTravados}
                    field={PicklistField.RecursoFinanceiroIndiceCorrecao}
                    value={form.indiceCorrecao}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        indiceCorrecao: v as IndiceCorrecao | "",
                      }))
                    }
                    placeholder="Nenhum"
                  />
                </div>
              )}
              {/*
               * O "Índice de Correção da Parcela" (ADO 67588) MOROU AQUI até
               * 27/08/2026. Saiu para o bloco `Ressarcimento` abaixo, com o rótulo
               * correto ("Índice de correção das prestações"): o campo corrige as
               * PRESTAÇÕES do ressarcimento, e do lado do "Índice de correção" ele
               * lia como um segundo índice das mesmas parcelas — foi assim que a UAT
               * o reportou ("dois campos para índice de correção").
               */}
              {/* RF-02/RF-04: fora do diálogo de obra — cada item nasce `Única`. */}
              {!ehObra && (
                <div className="min-w-0">
                  <FieldLabel htmlFor="rm-per" required>
                    Periodicidade
                  </FieldLabel>
                  <Select
                    id="rm-per"
                    disabled={camposDaObraTravados}
                    value={form.periodicidade}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        periodicidade: v as PeriodicidadeRecurso,
                      }))
                    }
                    options={periodicidadeOptions}
                  />
                </div>
              )}

              {/*
               * ── Bloco RESSARCIMENTO ───────────────────────────────────────────
               *
               * O título e os dois primeiros campos ("Prestações" e "Índice de
               * correção das prestações") vêm do pedido do negócio de 27/08/2026, e
               * o agrupamento tem lastro no próprio org: medido no `describe/layouts/`
               * por RecordType de `Recurso_Financeiro_Da_Cotacao__c`, a seção
               * `Prestações` reúne exatamente estes campos —
               *
               *   Mútuo      → [Prestações] Qtde_De_Parcelas__c, Juros__c,
               *                Carencia_meses__c, Justificativa__c,
               *                Indice_De_Correcao__c, Valor_Total…, Data_Inicio_Ressarcimento…
               *   Novo Mútuo → [Prestações] Qtde_Prestacoes__c, Juros__c, Justificativa__c
               *
               * Por isso carência, juros e o início do ressarcimento ficam SOB este
               * título em vez de num grupo separado: são campos do ressarcimento, e
               * o "Início do ressarcimento" acima de um bloco chamado
               * "Ressarcimento" leria como órfão. A `Justificativa` saiu do
               * fragmento em 03/09/2026 (gate próprio, ver abaixo) e por isso
               * renderiza depois dele.
               *
               * ⚠️ **O Novo Mútuo NÃO tem este bloco desde 03/09/2026** (decisão do
               * negócio): lá o cronograma de devolução é o do `Bônus do Novo Mútuo`
               * logo abaixo, e os dois juntos punham "Índice de correção das
               * prestações" e "Índice de correção da prestação" na mesma caixa — a
               * forma exata do defeito que a UAT de 25/08/2026 reportou como "dois
               * campos para índice de correção". Isso DIVERGE do layout do org, que
               * tem `Qtde_Prestacoes__c` e `Juros__c` na seção `Prestações` do Novo
               * Mútuo; a divergência está registrada em
               * `aceitaCamposDeRessarcimento` (backend), que é a autoridade.
               *
               * `exigeIndiceParcela` e `exigeCamposRessarcimento` são hoje o MESMO
               * predicado (`aceitaCamposDeRessarcimento`), mas continuam separados no
               * gate: se um dia divergirem, o bloco ainda abre para quem tiver só um
               * dos dois, em vez de sumir com um campo que o DTO exige.
               *
               * Campos do bloco (ADO 67799 / 67800) — `Carencia_meses__c`,
               * `Juros__c` e `Justificativa__c`, medidos no describe do org em
               * 26/08/2026. Opcionais: o CRM não os exige, e exigir aqui recusaria o
               * que ele aceita.
               */}
              {exigeRessarcimento && (
                <div className="min-w-0 sm:col-span-2">
                  <h4
                    data-testid="rm-ressarcimento"
                    className="mt-1 text-(length:--t-caption) font-bold text-(--neutral-800)"
                  >
                    Ressarcimento
                  </h4>
                </div>
              )}
              {exigeRessarcimento && (
                <div className="min-w-0">
                  {/*
                   * "Prestações", não "Qtd. de prestações": é o rótulo que o negócio
                   * pediu. Campo PRÓPRIO — o modal já tem "Qtd. de parcelas" acima, e
                   * no org os dois convivem no layout do Novo Mútuo (`Valores` ×
                   * `Prestações`), com uma linha medida em que divergem.
                   */}
                  {/*
                   * ⚠️ O `required` segue `exigeCamposRessarcimento`, e NÃO o
                   * `exigeRessarcimento` que renderiza este bloco: o primeiro é o
                   * espelho do `@ValidateIf` do DTO. Se os dois divergirem, marcar
                   * pelo largo exigiria na tela um campo que o `create` descarta —
                   * a perda silenciosa que os espelhos existem para impedir.
                   */}
                  <FieldLabel
                    htmlFor="rm-prestacoes"
                    required={exigeCamposRessarcimento}
                  >
                    Prestações
                  </FieldLabel>
                  <input
                    id="rm-prestacoes"
                    data-testid="rm-prestacoes"
                    type="text"
                    inputMode="numeric"
                    value={form.qtdPrestacoes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, qtdPrestacoes: e.target.value }))
                    }
                    placeholder="0"
                    className={FIELD_INPUT_CLASS}
                  />
                </div>
              )}
              {exigeIndiceParcela && (
                <div className="min-w-0">
                  {/*
                   * MESMO campo que era "Índice de correção da parcela" (ADO 67588) —
                   * mudou de lugar e de rótulo em 27/08/2026, não de coluna. O `id`
                   * segue `rm-indice-parcela` porque a coluna é
                   * `installment_adjustment_index`: renomeá-lo esconderia que este é
                   * o campo antigo.
                   */}
                  <FieldLabel htmlFor="rm-indice-parcela" required>
                    Índice de correção das prestações
                  </FieldLabel>
                  <PicklistSelect
                    id="rm-indice-parcela"
                    field={PicklistField.RecursoFinanceiroIndiceCorrecao}
                    value={form.indiceCorrecaoParcela}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        indiceCorrecaoParcela: v as IndiceCorrecao | "",
                      }))
                    }
                  />
                </div>
              )}
              {exigeCamposRessarcimento && (
                <>
                  <div className="min-w-0">
                    {/* Obrigatório desde 10/09/2026 (pedido do negócio). Este
                    bloco já renderiza sob `exigeCamposRessarcimento`, então o
                    `required` é incondicional aqui — o mesmo predicado que o
                    `@ValidateIf` do DTO usa. */}
                    <FieldLabel htmlFor="rm-carencia" required>
                      Carência (meses)
                    </FieldLabel>
                    <input
                      id="rm-carencia"
                      type="text"
                      inputMode="numeric"
                      value={form.carenciaMeses}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          carenciaMeses: e.target.value,
                        }))
                      }
                      placeholder="0"
                      className={FIELD_INPUT_CLASS}
                    />
                  </div>
                  <div className="min-w-0">
                    {/* "Juros mensais" é o help text do próprio campo no org, não
                    inferência — e o valor é PERCENTUAL (1 = 1%).

                    Obrigatório desde 17/09/2026 (pedido do negócio), pelo mesmo
                    motivo e da mesma forma que a carência acima: este bloco já
                    renderiza sob `exigeCamposRessarcimento`, então o `required`
                    é incondicional aqui — o mesmo predicado que o `@ValidateIf`
                    do DTO usa. */}
                    <FieldLabel htmlFor="rm-juros" required>
                      Juros mensais (%)
                    </FieldLabel>
                    <input
                      id="rm-juros"
                      type="text"
                      inputMode="decimal"
                      value={form.jurosPercentual}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          jurosPercentual: e.target.value,
                        }))
                      }
                      placeholder="1"
                      className={FIELD_INPUT_CLASS}
                    />
                  </div>
                  <div className="min-w-0">
                    {/*
                     * DERIVADO, não perguntado: `Data_Inicio_Ressarcimento__c` é
                     * fórmula no org. A tela exibe o que o backend calculou pela
                     * MESMA regra — um input aqui seria sobrescrito pelo CRM.
                     *
                     * Antes de salvar não há valor derivado (a conta é do backend,
                     * sobre a linha persistida), e o rótulo diz de onde ele vem em
                     * vez de mostrar um traço mudo.
                     */}
                    <FieldLabel htmlFor="rm-ressarc">
                      Início do ressarcimento
                    </FieldLabel>
                    <p
                      id="rm-ressarc"
                      data-testid="rm-ressarcimento-derivado"
                      className="mt-1 text-(length:--t-caption) text-(--color-text-muted)"
                    >
                      {RESSARCIMENTO_DERIVADO_HINT}
                    </p>
                  </div>
                </>
              )}

              {/*
               * `Justificativa__c` — gate PRÓPRIO, toda a família de Mútuo (Novo
               * Mútuo incluído). Ela não foi nomeada no pedido de 03/09/2026 e é o
               * único campo do bloco que o layout do Novo Mútuo tem sem par no
               * bloco do bônus; por isso ela fica FORA do fragmento acima e não
               * aparece sob o título "Ressarcimento" no Novo Mútuo — o título só
               * renderiza quando há campo de ressarcimento de fato.
               */}
              {exigeJustificativa && (
                <div className="min-w-0 sm:col-span-2">
                  {/*
                   * ⚠️ O `*` é CONDICIONAL aqui — é o único do modal que depende
                   * do VALOR de outro campo, e não do tipo de registro. Juros
                   * acima de 1% ao mês tornam a justificativa obrigatória
                   * (22/09/2026); em 1% (o default) e abaixo ela segue opcional,
                   * como sempre foi.
                   */}
                  <FieldLabel
                    htmlFor="rm-justificativa"
                    required={justificativaExigidaPorJuros}
                  >
                    Justificativa
                  </FieldLabel>
                  <textarea
                    id="rm-justificativa"
                    rows={2}
                    maxLength={255}
                    value={form.justificativa}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, justificativa: e.target.value }))
                    }
                    /*
                     * O placeholder acompanha o veredito: anunciar "Opcional"
                     * num campo que o submit recusa vazio contradiz o `*` logo
                     * acima e o aviso logo abaixo.
                     */
                    placeholder={
                      justificativaExigidaPorJuros
                        ? "Informe o motivo dos juros — máx. 255 caracteres"
                        : "Opcional — máx. 255 caracteres"
                    }
                    className={FIELD_INPUT_CLASS}
                  />
                  {/*
                   * O aviso que o negócio pediu, com a frase dele verbatim
                   * (22/09/2026) — inclusive a concordância.
                   *
                   * ⚠️ Fonte ÚNICA com a recusa do backend
                   * (`MENSAGEM_JUSTIFICATIVA_POR_JUROS` nos dois lados): a tela
                   * e a API têm de anunciar o mesmo limite, senão o usuário lê
                   * "maior que 1" aqui e leva uma recusa por outro número.
                   *
                   * `--color-danger` é deliberado e diverge da regra geral desta
                   * tela ("falta o próximo passo é hint de atenção, nunca
                   * vermelho"): aqui não é um passo pendente, é o texto pedido
                   * pelo negócio para um campo que o save RECUSA vazio, e ele
                   * acompanha o `*` — que já é `--color-danger` no `FieldLabel`.
                   *
                   * Sem `role="alert"`: o aviso aparece enquanto o usuário
                   * digita os juros, e um live region anunciaria a cada
                   * tecla. Quem interrompe a leitura é a recusa do submit,
                   * que já é um `role="alert"` (`modal-error`).
                   */}
                  {justificativaExigidaPorJuros && (
                    <p
                      data-testid="rm-justificativa-obrigatoria"
                      className="mt-1 text-(length:--t-small) text-(--color-danger)"
                    >
                      {MENSAGEM_JUSTIFICATIVA_POR_JUROS}
                    </p>
                  )}
                </div>
              )}

              {/*
               * Bônus do Novo Mútuo (ADO 67587) —
               * `Detalhe_de_Contrato_Mutuo_Enc_Contas__c`, o acessório pendurado em
               * outro acessório. Só no Novo Mútuo: no org os 283 vínculos com o
               * detalhe são todos `Tipo__c = 'Mútuo Enc. Contas'`.
               *
               * Etapa e Finalidade não são perguntadas (uma opção ativa cada, e
               * 277/277 nela); as duas datas do layout são fórmula no CRM; e o
               * Valor Total é derivado de parcelas × valor da parcela.
               */}
              {exigeCamposBonusNovoMutuo && (
                <>
                  <div className="min-w-0 sm:col-span-2">
                    <h4
                      data-testid="rm-bonus-novo-mutuo"
                      className="mt-1 text-(length:--t-caption) font-bold text-(--neutral-800)"
                    >
                      Bônus do Novo Mútuo
                    </h4>
                  </div>
                  <div className="min-w-0">
                    <FieldLabel htmlFor="rm-bonus-periodicidade">
                      Periodicidade de pagamento
                    </FieldLabel>
                    <PicklistSelect
                      id="rm-bonus-periodicidade"
                      data-testid="rm-bonus-periodicidade"
                      field={PicklistField.RecursoFinanceiroPeriodicidade}
                      value={form.bonusPeriodicidade}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, bonusPeriodicidade: v }))
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    {/* Rótulo com "do bônus" porque o modal já tem um "Qtd. de
                    parcelas" do RECURSO: dois campos com o mesmo nome na mesma
                    caixa são ambíguos, e para leitor de tela são idênticos. */}
                    <FieldLabel htmlFor="rm-bonus-parcelas">
                      Qtd. de parcelas do bônus
                    </FieldLabel>
                    <input
                      id="rm-bonus-parcelas"
                      data-testid="rm-bonus-parcelas"
                      type="text"
                      inputMode="numeric"
                      value={form.bonusQtdParcelas}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          bonusQtdParcelas: e.target.value,
                        }))
                      }
                      placeholder="0"
                      className={FIELD_INPUT_CLASS}
                    />
                  </div>
                  <div className="min-w-0">
                    <FieldLabel htmlFor="rm-bonus-valor">
                      Valor da parcela do bônus (R$)
                    </FieldLabel>
                    <input
                      id="rm-bonus-valor"
                      data-testid="rm-bonus-valor"
                      type="text"
                      inputMode="numeric"
                      value={form.bonusValorParcela}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          bonusValorParcela: maskMoneyInput(e.target.value),
                        }))
                      }
                      placeholder="0,00"
                      className={FIELD_INPUT_CLASS}
                    />
                  </div>
                  <div className="min-w-0">
                    <FieldLabel htmlFor="rm-bonus-indice">
                      Índice de correção da prestação
                    </FieldLabel>
                    <PicklistSelect
                      id="rm-bonus-indice"
                      data-testid="rm-bonus-indice"
                      field={PicklistField.RecursoFinanceiroIndiceCorrecao}
                      value={form.bonusIndiceCorrecaoPrestacao}
                      onChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          bonusIndiceCorrecaoPrestacao: v,
                        }))
                      }
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    {/* O valor persistido é o CÓDIGO do org (`04`/`05`); o rótulo é
                    uma frase inteira e vem do backend em
                    `bonusTipoAtualizacaoMonetariaLabel`. Aqui, no formulário, as
                    duas opções são fixas porque são o value set inteiro. */}
                    <FieldLabel htmlFor="rm-bonus-atualizacao">
                      Tipo de atualização monetária
                    </FieldLabel>
                    <Select
                      id="rm-bonus-atualizacao"
                      data-testid="rm-bonus-atualizacao"
                      value={form.bonusTipoAtualizacaoMonetaria}
                      onChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          bonusTipoAtualizacaoMonetaria: v,
                        }))
                      }
                      options={TIPO_ATUALIZACAO_MONETARIA_OPTIONS}
                      placeholder="Selecione..."
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/*
          As PRESTAÇÕES estourando o fim da análise (11/09/2026).

          ⚠️ Mensagem AO VIVO, e não só no submit: o pedido do negócio é que o
          botão fique desabilitado, e um botão morto sem nada explicando por quê
          é o controle mudo que este repositório persegue. Ela aparece enquanto
          a combinação for inválida e some sozinha quando o usuário corrige.

          `role="status"`, não `alert`: nada falhou — é orientação sobre o que
          ainda está sendo preenchido. O `modal-error` abaixo continua sendo o
          canal das recusas de fato.
        */}
        {motivoPrestacoes && (
          <div
            role="status"
            data-testid="prestacoes-fora-da-analise"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-700) bg-(--color-warning-bg) px-3 py-2 text-(length:--t-small) text-(--yellow-700)"
          >
            {motivoPrestacoes}
          </div>
        )}

        {(validationError || errorMessage) && (
          <div
            role="alert"
            data-testid="modal-error"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-(length:--t-small) text-(--red-700)"
          >
            {validationError ?? errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-(--color-border) pt-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-xxs)] border border-(--color-border) px-4 py-2 text-(length:--t-caption) font-bold text-(--color-text-muted) hover:bg-(--neutral-50)"
          >
            Cancelar
          </button>
          {/* Sem obra a escolher — ou antes de saber se há — não existe o que
              salvar: o botão sairia daqui só para recusar o próprio clique. */}
          {!semObraNoConverge && !aguardandoObras && (
            <button
              type="submit"
              /*
               * Desabilitado com as prestações fora da janela — pedido explícito
               * do negócio (11/09/2026). É seguro porque a razão está na
               * mensagem logo acima: botão morto sem explicação seria o
               * controle mudo. E a recusa do backend permanece a garantia — a
               * tela ANTECIPA o veredito, não o substitui.
               */
              disabled={isSaving || motivoPrestacoes !== null}
              className="rounded-[var(--radius-xxs)] bg-(--secondary-600) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-700) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? "Salvando…"
                : mode === "create"
                  ? "Adicionar"
                  : "Salvar"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FinancialResourcesBlock({
  proposalId,
  proposalSummary,
  getProposal = defaultGetProposal,
  listResources = defaultGetList,
  createResource = defaultCreate,
  updateResource = defaultUpdate,
  deleteResource = defaultDelete,
  getDomains = defaultGetDomains,
  opportunityId,
  listObrasDisponiveis = defaultListObras,
  getObraSelecionada = defaultGetObra,
  onResourcesChanged,
  temObraNaOutraSecao = false,
  onObraChanged,
  onObraPresenteChange,
  obraExternaSignal = 0,
  adicionarObra = defaultAdicionarObra,
  removerObra = defaultRemoverObra,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  /*
   * ADO 67805 — a Verba (BP) é informação restrita a BP Financeiro, SNEG, TI
   * Administrador, Gerente Varejo e TI Sustentação.
   *
   * O gate REAL é o backend, que omite `bpBudget` da resposta de
   * `.../financial-resources` (`BP_BUDGET_VIEW_ROLES`); esta consulta é o
   * espelho de tela, para o card não aparecer por um stub de teste nem por uma
   * resposta antiga em cache. Não é gate de escrita: o LT continua editando os
   * recursos financeiros logo acima.
   */
  const canViewBpBudget = can(Permission.BpBudgetView);
  /*
   * Bug 68395 — a exceção do §6: a SNEG (e o ADMIN) edita os campos que a obra
   * define; os demais perfis de escrita seguem com eles desabilitados. Espelha
   * `CAMPOS_TRAVADOS_POR_OBRA_BYPASS_ROLES`, que é quem de fato recusa o `PUT`
   * com 400 — veredito é do backend, a tela renderiza.
   *
   * ⚠️ Desde a reabertura de 14/09/2026 são SETE campos, não quatro: entraram
   * finalidade, etapa e data de liberação, que a US 68333 manda vir da obra "e
   * não permitir alteração". Travá-los só no diálogo de criação deixava a
   * trava decorativa — o `Editar` desfazia tudo.
   */
  const podeEditarCamposDaObra = can(Permission.ObraCamposTravadosEditar);
  /** Confirmação das ações destrutivas desta tela. */
  const confirm = useConfirm();

  /*
   * Resolved here, not inside the modal: the CARD title needs it too, and the
   * card renders whether or not the modal is open. Two of the six values do not
   * read as their API name (`Mútuo Enc. Contas` → "Novo Mútuo"), so this is what
   * keeps a machine value off the screen (VBR-507 CA-3).
   */
  const { options: tipoRegistroLabelOptions } = usePicklist(
    PicklistField.RecursoFinanceiroTipo,
  );
  const tipoRegistroLabels = useMemo(
    () => new Map(tipoRegistroLabelOptions.map((o) => [o.value, o.label])),
    [tipoRegistroLabelOptions],
  );

  const [gateStatus, setGateStatus] = useState<GateStatus>("checking");
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [items, setItems] = useState<FinancialResource[]>([]);
  const [removendoObra, setRemovendoObra] = useState(false);
  const [bpBudget, setBpBudget] = useState<BpBudget | null>(null);
  const [supplierStatus, setSupplierStatus] = useState<
    SupplierStatus | undefined
  >(undefined);
  const [domains, setDomains] = useState<FinancialResourceDomains | null>(null);
  /** CA-3: analysis period bounds for dataLiberacao validation. */
  const [analysisStart, setAnalysisStart] = useState<string | undefined>(
    undefined,
  );
  const [analysisEnd, setAnalysisEnd] = useState<string | undefined>(undefined);

  const [modal, setModal] = useState<ModalState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /*
   * Obra do Converge (ADR-0048). Carregada de forma TARDIA — só quando o modal
   * abre — e uma vez por montagem do bloco.
   *
   * Por que tardia: `.../obra/disponiveis` é leitura AO VIVO contra o Converge,
   * um terceiro que responde `HTTP 200` para tudo e que já bloqueou por taxa
   * outra integração desta plataforma (a ANP). Buscá-la a cada render do painel
   * da proposta gastaria a chamada em quem nunca vai abrir o modal.
   *
   * `obrasState` distingue os quatro estados que a tela precisa: sem fonte,
   * carregando, carregado (possivelmente vazio) e erro. `[]` NUNCA é usado para
   * representar falha: vazio é a afirmação "este cliente não tem obra".
   */
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [obraVinculada, setObraVinculada] = useState<Obra | null>(null);
  const [obrasLoading, setObrasLoading] = useState(false);
  const [obrasError, setObrasError] = useState<string | null>(null);
  const obrasCarregadasRef = useRef(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /*
   * O VÍNCULO vem na montagem, e não na abertura do modal: o cartão de cada
   * recurso mostra `Obra (Converge)` (protótipo `ciclo1.js:256`) e é renderizado
   * na LISTA, sem modal nenhum. Esta leitura é local — o retrato no nosso banco —
   * e portanto barata; é a listagem de disponíveis que fala com o Converge.
   *
   * Falha aqui é silenciosa de propósito: sem o vínculo o cartão simplesmente
   * omite o campo (a conjunção), o que é o mesmo que a linha não ser custeada
   * pela obra. Barulho aqui não daria ao usuário nenhuma ação.
   */
  useEffect(() => {
    if (!opportunityId) return;
    void getObraSelecionada(opportunityId)
      .then((rm: ObraReadModel) => {
        if (mountedRef.current) setObraVinculada(rm.selecionada);
      })
      .catch(() => undefined);
  }, [opportunityId, getObraSelecionada]);

  useEffect(() => {
    /*
     * ⚠️ Só no diálogo de OBRA. Desde o RF-05 o modal direto não tem o campo, e
     * `.../obra/disponiveis` é leitura AO VIVO contra um terceiro que já
     * bloqueou por taxa outra integração desta plataforma (a ANP): chamá-lo ao
     * abrir um modal que não usa a resposta é custo puro.
     */
    if (modal?.mode !== "obra" || !opportunityId || obrasCarregadasRef.current)
      return;
    obrasCarregadasRef.current = true;
    setObrasLoading(true);
    setObrasError(null);

    void listObrasDisponiveis(opportunityId)
      .then((lista: Obra[]) => {
        if (!mountedRef.current) return;
        setObras(lista);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        // A frase do backend é a acionável (422 nomeia o CNPJ que falta na
        // oportunidade; 503 diz que cabe nova tentativa). Uma frase genérica
        // aqui apagaria justamente o que o usuário precisa saber.
        setObrasError(
          err instanceof Error && err.message
            ? err.message
            : "Não foi possível carregar as obras do cliente.",
        );
        // Permite nova tentativa numa reabertura do modal — um erro de rede não
        // pode deixar o seletor morto pelo resto da sessão.
        obrasCarregadasRef.current = false;
      })
      .finally(() => {
        if (mountedRef.current) setObrasLoading(false);
      });
  }, [modal, opportunityId, listObrasDisponiveis]);

  // Incremented on each fetchResources call; lets in-flight .then callbacks
  // detect that a newer fetch has superseded them (e.g. proposalId changed
  // while the component stayed mounted).
  const fetchGenRef = useRef(0);

  const applyListResult = useCallback(
    (result: FinancialResourcesListResult) => {
      setItems(result.items);
      setBpBudget(result.bpBudget ?? null);
      setSupplierStatus(result.supplierStatus);
    },
    [],
  );

  // Gate check (RN-F6-01/HU-10.2) + resources + domains, in parallel.
  //
  // CA-5 (VBR-548): when `proposalSummary` is provided by the parent
  // (ProposalDetailPanel), use it directly for the gate check and analysis
  // period — no additional `GET /api/proposals/:id` call is made.
  const fetchResources = useCallback(() => {
    setGateStatus("checking");
    setLoadStatus("loading");
    const gen = ++fetchGenRef.current;

    const applyProposalGate = (proposal: ProposalSummary) => {
      if (!mountedRef.current || fetchGenRef.current !== gen) return;

      if (!FINALIDADES_COM_RECURSO_FINANCEIRO.has(proposal.finalidade)) {
        setGateStatus("not-applicable");
        return;
      }
      setGateStatus("applicable");
      // CA-3: capture analysis period for dataLiberacao validation in the modal.
      setAnalysisStart(proposal.dataInicioAnalise);
      setAnalysisEnd(proposal.dataFimAnalise);

      Promise.all([
        withOneRetry(() => listResources(proposalId)),
        withOneRetry(() => getDomains()),
      ])
        .then(([list, domainsResult]) => {
          if (!mountedRef.current || fetchGenRef.current !== gen) return;
          applyListResult(list);
          setDomains(domainsResult);
          setLoadStatus("loaded");
        })
        .catch((err: unknown) => {
          if (isExpiredSessionError(err)) {
            redirectToLogin();
            return;
          }
          if (!mountedRef.current || fetchGenRef.current !== gen) return;
          setLoadStatus("error");
        });
    };

    if (proposalSummary !== undefined) {
      // Provided by parent — use directly, no fetch.
      if (proposalSummary === null) {
        // Parent's proposal fetch failed; we can't evaluate the gate.
        if (mountedRef.current && fetchGenRef.current === gen) {
          setGateStatus("gate-error");
        }
      } else {
        applyProposalGate(proposalSummary);
      }
    } else {
      // Fallback: fetch the proposal ourselves (tests / backward compat).
      withOneRetry(() => getProposal(proposalId))
        .then(applyProposalGate)
        .catch((err: unknown) => {
          if (isExpiredSessionError(err)) {
            redirectToLogin();
            return;
          }
          if (!mountedRef.current || fetchGenRef.current !== gen) return;
          setGateStatus("gate-error");
        });
    }
  }, [
    proposalId,
    proposalSummary,
    getProposal,
    listResources,
    getDomains,
    applyListResult,
  ]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const reload = useCallback(async () => {
    setLoadStatus("loading");
    try {
      const list = await listResources(proposalId);
      if (!mountedRef.current) return;
      applyListResult(list);
      setLoadStatus("loaded");
    } catch {
      if (!mountedRef.current) return;
      setLoadStatus("error");
    }
  }, [proposalId, listResources, applyListResult]);

  const handleSave = useCallback(
    async (input: CreateFinancialResourceInput) => {
      setIsSaving(true);
      setModalError(null);
      try {
        const result =
          modal?.mode === "edit"
            ? await updateResource(
                proposalId,
                modal.resource.id,
                diffUpdateInput(modal.resource, input),
              )
            : await createResource(proposalId, input);

        /*
         * O recurso JÁ ESTÁ GRAVADO: o resultado é aplicado à tela antes de
         * tentar o vínculo da obra. Enquanto isso vinha depois, uma falha na
         * segunda chamada abortava o bloco inteiro e a linha recém-salva não
         * aparecia na lista — a tela discordando do banco.
         */
        if (!mountedRef.current) return;
        setBpBudget(result.bpBudget ?? null);
        setSupplierStatus(result.supplierStatus);
        setItems((prev) => {
          const idx = prev.findIndex((r) => r.id === result.resource.id);
          if (idx === -1) return [...prev, result.resource];
          const next = [...prev];
          next[idx] = result.resource;
          return next;
        });

        /*
         * ⚠️ Aqui havia a SEGUNDA chamada — salvar o recurso e depois vincular
         * a obra —, removida em 09/09/2026 (RF-05 / ADR-0051).
         *
         * Ela existia porque a API da obra era chaveada por OPORTUNIDADE e a
         * do recurso por proposta, o que impedia atomicidade e criava o estado
         * "salvo, mas sem obra" que `mensagemFalhaVinculoObra` explicava. Com o
         * vínculo por proposta, o fluxo "Adicionar obra" faz as duas escritas
         * numa transação só — e a criação DIRETA não associa obra nenhuma.
         */
        if (!mountedRef.current) return;
        setModal(null);
        onResourcesChanged?.();
      } catch (err) {
        if (!mountedRef.current) return;
        /*
         * `failureReason` no lugar do par de `instanceof`: os erros tipados
         * continuam contemplados (a mensagem deles é nossa), e o `HttpError` —
         * que carrega a frase do backend e era o único descartado — deixa de
         * cair na frase genérica.
         */
        setModalError(
          failureReason(
            err,
            "Falha ao salvar o recurso financeiro. Tente novamente.",
          ),
        );
      } finally {
        if (mountedRef.current) setIsSaving(false);
      }
    },
    [
      modal,
      proposalId,
      createResource,
      updateResource,
      onResourcesChanged,
      opportunityId,
      obraVinculada,
    ],
  );

  const handleDelete = useCallback(
    async (resourceId: string) => {
      setDeletingId(resourceId);
      try {
        await deleteResource(proposalId, resourceId);
        if (!mountedRef.current) return;
        await reload();
        onResourcesChanged?.();
      } finally {
        if (mountedRef.current) setDeletingId(null);
      }
    },
    [proposalId, deleteResource, reload, onResourcesChanged],
  );

  /**
   * Esta PROPOSTA tem obra — SH-03.
   *
   * Derivado dos itens, e não de um estado próprio: o vínculo vive no backend e
   * chega em cada linha (`item.obra`). Um `useState` paralelo divergiria no
   * primeiro reload. `temObraNaOutraSecao` vem do painel, porque o SH-03 troca
   * o rótulo do botão nas DUAS seções.
   */
  const temObraNestaSecao = items.some((item) => item.obra);
  const temObra = temObraNestaSecao || temObraNaOutraSecao;

  /*
   * Reporta ao painel, que é quem cruza as duas seções (SH-03). Em efeito, e
   * não no handler de salvar: a lista também muda por reload e por remoção, e
   * um aviso preso ao handler perderia esses caminhos.
   */
  useEffect(() => {
    onObraPresenteChange?.(temObraNestaSecao);
  }, [temObraNestaSecao, onObraPresenteChange]);

  /*
   * A OUTRA seção mexeu na obra ⇒ releia a lista E o vínculo.
   *
   * A lista porque os itens gerados pela obra somem junto com ela; o vínculo
   * porque é dele que sai o rótulo `Obra (Converge)` do cartão e a decisão de
   * mostrar "Remover obra". Reler só um dos dois deixaria a metade velha na
   * tela — que é o defeito, com outra cara.
   *
   * ⚠️ **Guardado por ref para NÃO rodar na montagem.** O valor inicial já foi
   * carregado pelos efeitos acima; sem a guarda, todo mount dispararia um
   * segundo par de requisições.
   */
  const obraExternaAplicadaRef = useRef(obraExternaSignal);
  useEffect(() => {
    if (obraExternaSignal === obraExternaAplicadaRef.current) return;
    obraExternaAplicadaRef.current = obraExternaSignal;

    void reload();

    if (!opportunityId) return;
    // Falha silenciosa, como no efeito de montagem: sem o vínculo o cartão
    // omite o campo, e barulho aqui não daria ao usuário nenhuma ação.
    void getObraSelecionada(opportunityId)
      .then((rm: ObraReadModel) => {
        if (mountedRef.current) setObraVinculada(rm.selecionada);
      })
      .catch(() => undefined);
  }, [obraExternaSignal, reload, opportunityId, getObraSelecionada]);

  const handleAdicionarObra = useCallback(
    async (payload: AdicionarObraRecursosPayload) => {
      setIsSaving(true);
      setModalError(null);
      try {
        await adicionarObra(proposalId, payload);
        if (!mountedRef.current) return;
        await reload();
        setModal(null);
        onResourcesChanged?.();
        onObraChanged?.();
      } catch (err) {
        /*
         * O diálogo FICA ABERTO e mostra a frase do backend: o que falta é um
         * dado do formulário (a data de uma parcela fora da janela, a obra que
         * já existe), e fechá-lo faria o usuário redigitar tudo para descobrir
         * o mesmo erro.
         */
        if (mountedRef.current) {
          setModalError(
            err instanceof HttpError
              ? err.message
              : "Falha ao adicionar a obra.",
          );
        }
      } finally {
        if (mountedRef.current) setIsSaving(false);
      }
    },
    [proposalId, adicionarObra, reload, onResourcesChanged, onObraChanged],
  );

  const handleRemoverObra = useCallback(async () => {
    setRemovendoObra(true);
    try {
      await removerObra(proposalId);
      if (!mountedRef.current) return;
      await reload();
      onResourcesChanged?.();
      onObraChanged?.();
    } finally {
      if (mountedRef.current) setRemovendoObra(false);
    }
  }, [proposalId, removerObra, reload, onResourcesChanged, onObraChanged]);

  const initialForm = useMemo<FormState>(
    () => (modal?.mode === "edit" ? formToState(modal.resource) : EMPTY_FORM),
    [modal],
  );

  // Prototype: every `.block` card collapses from its own header (ciclo1.js
  // `initCollapse`), starting expanded.
  const collapse = useCardCollapse();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // HU-10.2 / RN-F6-01 (updated VBR-463): block not shown at all when the
  // proposal's finalidade is not in FINALIDADES_COM_RECURSO_FINANCEIRO.
  if (gateStatus === "not-applicable") {
    return null;
  }

  return (
    <section
      aria-labelledby="financial-resources-title"
      {...collapse.sectionProps}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      {confirm.dialog}
      <div {...collapse.headProps} className="mb-1 flex items-center gap-2.5">
        <h3
          id="financial-resources-title"
          className="text-(length:--t-h4) font-bold"
        >
          Recursos financeiros
        </h3>
        <BlocoAjusteAction bloco={BlocoProposta.Recursos} />
        <CardCollapseToggle {...collapse.toggleProps} />
      </div>

      {(gateStatus === "checking" || loadStatus === "loading") && (
        <div
          role="status"
          aria-label="Carregando recursos financeiros…"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="loading-state"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando…
        </div>
      )}

      {gateStatus === "gate-error" && (
        <div
          role="alert"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          data-testid="load-error-state"
        >
          Falha ao carregar a proposta. Verifique sua conexão e tente novamente.
          <button
            type="button"
            onClick={fetchResources}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {gateStatus === "applicable" && loadStatus === "error" && (
        <div
          role="alert"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          data-testid="load-error-state"
        >
          Falha ao carregar os recursos financeiros. Verifique sua conexão e
          tente novamente.
          <button
            type="button"
            onClick={fetchResources}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {gateStatus === "applicable" && loadStatus === "loaded" && (
        <div data-testid="filled-state">
          {items.length === 0 ? (
            <div
              className="mb-3 rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
              data-testid="empty-state"
            >
              Nenhum recurso financeiro adicionado ainda.
            </div>
          ) : (
            <div data-testid="resource-list">
              {items.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  tipoLabels={tipoRegistroLabels}
                  obraVinculada={obraVinculada}
                  showActions={canWrite}
                  onEdit={() => setModal({ mode: "edit", resource })}
                  onDelete={() =>
                    confirm.ask({
                      title: "Excluir recurso financeiro?",
                      description:
                        "O recurso sai da proposta e a verba (BP) utilizada é recalculada.",
                      confirmLabel: "Excluir",
                      tone: "danger",
                      onConfirm: () => handleDelete(resource.id),
                    })
                  }
                  isDeleting={deletingId === resource.id}
                />
              ))}
            </div>
          )}

          {/* Write control: hidden for a read-only profile (the API answers 403). */}
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModal({ mode: "create" })}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
              >
                + Adicionar recurso financeiro
              </button>
              {/*
                RF-01 — "+ Adicionar obra" ao lado do botão de recurso; SH-03 —
                havendo obra em QUALQUER das duas seções, ele vira "Remover
                obra" nas duas. Rótulo "Remover", que é o padrão do repo nas
                ações de linha (SH-06).
              */}
              {temObra ? (
                <button
                  type="button"
                  disabled={removendoObra}
                  onClick={() =>
                    confirm.ask({
                      title: "Remover obra?",
                      description:
                        "A obra sai da proposta e TODOS os itens gerados por ela são " +
                        "removidos junto. Depois disso é possível adicionar outra obra.",
                      confirmLabel: "Remover",
                      tone: "danger",
                      onConfirm: () => handleRemoverObra(),
                    })
                  }
                  className="rounded-[var(--radius-xxs)] border border-(--red-700) bg-white px-4 py-2 text-(length:--t-caption) font-bold text-(--red-700) transition hover:bg-(--neutral-100) disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removendoObra ? "Removendo…" : "Remover obra"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setModal({ mode: "obra" })}
                  className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
                >
                  + Adicionar obra
                </button>
              )}
            </div>
          )}

          {/* ADO 67805: a verba (e o alerta de estouro que vive dentro do card)
              só para BP Financeiro, SNEG, TI Administrador, Gerente Varejo e TI
              Sustentação. `bpBudget` já vem ausente da API para os demais. */}
          {canViewBpBudget && bpBudget && <BpBudgetBar bpBudget={bpBudget} />}
          <ZfpjAlert supplierStatus={supplierStatus} />
        </div>
      )}

      {modal && domains && (
        <ResourceModal
          variant={modal.mode === "obra" ? "obra" : "recurso"}
          // O diálogo de obra é sempre criação; `edit` de item gerado trava os
          // SETE campos que a obra define (§6 + US 68333: os quatro da parcela,
          // mais finalidade, etapa e data de liberação) — menos para a SNEG, a
          // exceção que o Bug 68395 nomeou.
          mode={modal.mode === "obra" ? "create" : modal.mode}
          camposDaObraTravados={
            modal.mode === "edit" &&
            !!modal.resource.obra &&
            !podeEditarCamposDaObra
          }
          onSaveObra={(payload) => void handleAdicionarObra(payload)}
          initial={initialForm}
          domains={domains}
          onSave={(input) => void handleSave(input)}
          onClose={() => {
            setModal(null);
            setModalError(null);
          }}
          isSaving={isSaving}
          errorMessage={modalError}
          analysisStart={analysisStart}
          analysisEnd={analysisEnd}
          obras={obras}
          obraVinculada={obraVinculada}
          obrasLoading={obrasLoading}
          obrasError={obrasError}
          obrasHabilitadas={!!opportunityId}
        />
      )}
    </section>
  );
}
