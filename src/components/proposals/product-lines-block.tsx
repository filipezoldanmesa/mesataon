"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";

import {
  createProductLine as defaultCreate,
  deleteProductLine as defaultDelete,
  listEligibleProducts as defaultListEligible,
  listProductLines as defaultListLines,
  resolveCommercialTerms as defaultProbeCommercialTerms,
  resolveProductDefaults as defaultResolveProductDefaults,
  updateProductLine as defaultUpdate,
} from "@/lib/proposals/product-lines.data";
import type {
  CommercialTerms,
  ProductDefaults,
} from "@/lib/proposals/product-lines.api";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/auth-permissions";
import {
  BlocoAjusteAction,
  useProposalViewMode,
} from "@/components/proposals/proposal-view-mode";
import { BlocoProposta } from "@/lib/proposals/ajuste";
import {
  listProposalSupplyCenters as defaultListSupplyCenters,
  type ProposalSupplyCenter,
} from "@/lib/proposals/supply-centers.data";
import type { ProposalSupplyCenters } from "@/lib/proposals/supply-centers.types";
import { PicklistSelect } from "@/components/picklists/picklist-select";
import { Select } from "@/components/ui/select";
import { PicklistField } from "@/lib/picklists/picklists.types";
import {
  AVISO_MATURACAO,
  temMaturacaoAplicada,
} from "@/lib/proposals/maturacao-volume";
import { deriveDaysFromSapCode } from "@/lib/proposals/sap-payment-term-days";
import {
  fmtDateBR,
  isJanelaAnaliseInvertida,
  resolveDefaultInicioConsumo,
  validateConsumptionWindow,
} from "@/lib/proposals/consumption-window";
import type {
  EligibleProduct,
  EligibleProductListing,
  Incoterm,
  ProductLine,
  UpsertProductLineInput,
} from "@/lib/proposals/types";
import {
  ConsumptionWindowError,
  OpportunityWithoutSalesAreaError,
  PricingReferenceUnavailableError,
  ProductLineValidationError,
  ProductNotEligibleError,
} from "@/lib/proposals/types";
import { getProposal as defaultGetProposal } from "@/lib/proposals/proposal.data";
import type { ProposalSummary } from "@/lib/proposals/proposal.types";
import { useConfirm } from "@/components/confirm-dialog";
import { isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import { withOneRetry } from "@/lib/with-retry";
import { SalesAreaModal } from "@/components/proposals/sales-area-modal";
import { ProductBatchTable } from "@/components/proposals/product-batch-table";
import { definirAreaVendaOportunidade } from "@/lib/opportunities/opportunity-creation.api";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Bottom-border input style — prototype `.in` (vibra-ui.css): neutral-40
 * background, 2px bottom border only, square corners, green focus.
 * Used for `<input>` elements. `<select>` → `<Select>` DS component.
 * `label.f` — uppercase, bold, muted, tight tracking.
 * Disabled tokens: --disabled-bg (#f4f5f5), --disabled-text (#767676) from globals.css.
 */
const DS_INPUT =
  "w-full bg-(--neutral-40) border-0 border-b-2 border-(--neutral-600) rounded-none px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800) placeholder:text-(--neutral-500) focus:outline-none focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:bg-(--disabled-bg) disabled:border-(--neutral-200) disabled:text-(--disabled-text)";
const DS_LABEL =
  "mb-1 block text-[14px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = "loading" | "loaded" | "error";
type SaveStatus =
  | "idle"
  | "saving"
  | "error-eligibility"
  | "error-window"
  | "error-unavailable"
  | "error-generic";

type Props = {
  proposalId: string;
  /**
   * Oportunidade dona da proposta — habilita o CTA que preenche a área de
   * venda quando ela falta (ADO 67913).
   *
   * Opcional: sem ele a recusa ainda é NOMEADA no seletor, só não oferece o
   * conserto. Um CTA que não leva a lugar nenhum seria pior que a frase.
   */
  opportunityId?: string;
  /** Injectable for tests; defaults to the real BFF client. */
  list?: (proposalId: string) => Promise<ProductLine[]>;
  listEligible?: (
    proposalId: string,
    q?: string,
    /** Base escolhida — habilita o sinal de CPV por produto (VBR-643). */
    base?: string,
  ) => Promise<EligibleProductListing>;
  create?: (
    proposalId: string,
    input: UpsertProductLineInput,
  ) => Promise<ProductLine>;
  update?: (
    proposalId: string,
    lineId: string,
    input: UpsertProductLineInput,
  ) => Promise<ProductLine>;
  remove?: (proposalId: string, lineId: string) => Promise<void>;
  /**
   * Proposal summary provided by the parent (`ProposalDetailPanel`) as part of
   * the shared single-fetch pattern (CA-5 / VBR-548). Supplies `dataFimAnalise`
   * (RN-F5-04 upper bound for fimConsumo) and `supplyCenterCode` (pre-select
   * "Base" for new product lines — VBR-481/VBR-482).
   *
   * When absent, `getProposal` is used as a fallback (backward compat / tests).
   */
  proposalSummary?: ProposalSummary | null;
  /**
   * Injectable for tests; only called when `proposalSummary` is not passed.
   * Failure degrades gracefully (no client-side upper bound, backend enforces).
   */
  getProposal?: (proposalId: string) => Promise<ProposalSummary>;
  /**
   * "Base" options for THIS proposal — the account's supply centers, not the
   * whole catalog (VBR-643). Injectable for tests.
   */
  listSupplyCenters?: (proposalId: string) => Promise<ProposalSupplyCenters>;
  /**
   * Sondagem dos termos comerciais no simulador de preço SAP (Bug 67530).
   * Injetável para testes; o default é o cliente real da BFF.
   */
  probeCommercialTerms?: (
    proposalId: string,
    input: {
      produtoCodigo: string;
      base?: string;
      baseCodigo?: string;
      volume: number;
      incoterm?: string;
    },
  ) => Promise<CommercialTerms>;
  /**
   * Base e incoterm padrão do produto, do Salesforce (Bug 67530). Injetável para
   * testes; o default é o cliente real da BFF.
   */
  resolveProductDefaults?: (
    proposalId: string,
    produtoCodigo: string,
  ) => Promise<ProductDefaults>;
  /**
   * Called after any successful create / update / delete so that sibling
   * panels (e.g. ProposalAutoCalcBlock) can revalidate without a full reload.
   * CA-2 VBR-536.
   */
  onLinesChanged?: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a R$/m³ value (e.g. margins, CPV, preço final) as "R$ 0,1800". */
function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/** Formats a volume in m³/mês. */
function formatVolume(value: number): string {
  return `${value.toLocaleString("pt-BR")} m³/mês`;
}

/** Mirrors the backend's formula (RN-F5-02): precoFinal = cpv + margemProposta. */
function computePrecoFinalPreview(
  cpv: number | null,
  margemProposta: number | null,
): number | null {
  if (cpv === null || margemProposta === null) return null;
  return Math.round((cpv + margemProposta) * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Product picker (combobox restricted to eligible products — RN-F5-01)
// ---------------------------------------------------------------------------

function ProductPicker({
  proposalId,
  selected,
  onSelect,
  listEligible,
  baseCodigo,
  disabled,
  onEscolherAreaVenda,
  areaVendaSignal,
}: {
  proposalId: string;
  selected: EligibleProduct | null;
  onSelect: (product: EligibleProduct) => void;
  listEligible: (
    proposalId: string,
    q?: string,
    base?: string,
  ) => Promise<EligibleProductListing>;
  /**
   * Código do centro fornecedor escolhido no modal. Habilita o sinal
   * `cpvDisponivel` por produto (VBR-643); sem ele os itens vêm `null` e
   * nenhuma marca é renderizada — a tela não pode dizer "sem CPV" sobre uma
   * base que ninguém escolheu.
   */
  baseCodigo: string | null;
  disabled: boolean;
  /**
   * Abre a escolha da área de venda quando a oportunidade não tem uma
   * (ADO 67913). Ausente ⇒ a falta é nomeada sem CTA — é o caso de quem monta
   * o bloco sem `opportunityId`, e um botão que não leva a lugar nenhum seria
   * pior que a frase sozinha.
   */
  onEscolherAreaVenda?: () => void;
  /** Contador — ao mudar, a busca é refeita (a área acabou de ser definida). */
  areaVendaSignal?: number;
}) {
  // Start in search mode when no product is selected; switch to display mode
  // after picking so the full name is always readable without scrolling.
  const [isSearching, setIsSearching] = useState(!selected);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EligibleProduct[]>([]);
  const [restritaAoCliente, setRestritaAoCliente] = useState(false);
  /**
   * O recorte é por FAMÍLIA de produto e não por material? (03/09/2026)
   *
   * Nasce `false` pela mesma razão que `restritaAoCliente`: é o regime mais
   * MODESTO, e afirmar o corte largo sem resposta do backend acusaria o cadastro
   * do cliente de ser mais frouxo do que talvez seja.
   */
  const [restritaPorFamilia, setRestritaPorFamilia] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "loaded" | "error" | "sem-area"
  >("idle");
  /** Frase do backend quando falta a área de venda (ADO 67913). */
  const [semAreaMessage, setSemAreaMessage] = useState("");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input whenever we enter search mode (e.g. after
  // "Trocar" is clicked) so the user can type immediately without a second click.
  useEffect(() => {
    if (isSearching) inputRef.current?.focus();
  }, [isSearching]);

  useEffect(() => {
    if (!open) return;

    const term = query.trim();
    const mySeq = (seq.current += 1);
    setStatus("loading");

    const timer = setTimeout(() => {
      listEligible(proposalId, term || undefined, baseCodigo ?? undefined)
        .then((found) => {
          if (mySeq !== seq.current) return;
          setResults(found.produtos);
          setRestritaAoCliente(found.restritaAoCliente);
          setRestritaPorFamilia(found.restritaPorFamilia);
          setStatus("loaded");
        })
        .catch((err: unknown) => {
          if (mySeq !== seq.current) return;
          // ADO 67913: falta de área é estado com CONSERTO na tela, não falha
          // de busca — a frase e o CTA são outros.
          if (err instanceof OpportunityWithoutSalesAreaError) {
            setSemAreaMessage(err.message);
            setStatus("sem-area");
            return;
          }
          setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listEligible/proposalId are stable per mount
    // `baseCodigo` entra nas deps: trocar a Base muda a resposta de
    // `cpvDisponivel` por produto, e sem re-buscar a lista manteria o sinal da
    // base anterior — pior que sinal nenhum (VBR-643).
    // `areaVendaSignal` entra nas deps: a lista estava RECUSADA por falta de
    // área, e sem refazer a busca o seletor continuaria exibindo uma recusa já
    // resolvida (ADO 67913).
  }, [query, open, baseCodigo, areaVendaSignal]);

  /*
   * A lista está RESTRITA aos produtos do cliente? (ADO 67951)
   *
   * ⚠️ Veredito do BACKEND, e não mais derivado dos itens. A derivação anterior
   * (`results.some(p => p.elegivelParaCliente !== null)`) morre exatamente no
   * caso que mais importa agora: com o filtro ligado, buscar um produto fora da
   * allowlist devolve ZERO itens, e não há de onde derivar coisa nenhuma — a
   * tela precisa dizer se o vazio é "este cliente não tem cadastro" ou "tem, e
   * sua busca não casou".
   */

  function pick(product: EligibleProduct) {
    onSelect(product);
    setIsSearching(false);
    setQuery("");
    setOpen(false);
  }

  function startSearch() {
    setQuery("");
    setIsSearching(true);
    setOpen(true);
  }

  return (
    // `min-w-0` pelo mesmo motivo do `minmax(0, …)` no track: sem ele o item do
    // grid não encolhe abaixo do min-content e o `truncate` nunca entra.
    <div className="relative min-w-0">
      <label
        className={DS_LABEL}
        htmlFor={isSearching ? "pm-produto" : undefined}
      >
        Produto · cód.
      </label>

      {/*
        ── Display mode: produto escolhido, em UMA linha com ellipsis ──

        Truncar, e não quebrar. O campo nasceu `break-words` e crescia para três
        linhas com nome longo (`GASOLINA ESPECIAL BR-M10-R95 - KG · 01.000.012`),
        empurrando Volume e Margem para cima e desalinhando a linha inteira — e
        nenhuma largura de modal resolve isso, porque o nome não tem teto.

        É também o que o protótipo faz: ali o campo é um `<select>`, que trunca
        com ellipsis. O texto completo fica no `title` (tooltip nativo), então
        nada é perdido — e o código do material, que é a identidade, está no fim
        justamente por ser a parte que o usuário confere.
      */}
      {!isSearching && selected ? (
        <div
          data-testid="pm-produto-selected"
          className="flex min-h-[44px] w-full items-center justify-between gap-2 border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800)"
        >
          <span
            className="truncate leading-snug"
            title={`${selected.nome} · ${selected.codigo}`}
          >
            {selected.nome} · {selected.codigo}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={startSearch}
              className="shrink-0 text-[12px] font-bold text-(--secondary-600) hover:underline"
              data-testid="pm-produto-trocar"
            >
              Trocar
            </button>
          )}
        </div>
      ) : (
        /* ── Search mode: combobox input + results dropdown ── */
        <>
          <input
            ref={inputRef}
            id="pm-produto"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="pm-produto-results"
            autoComplete="off"
            disabled={disabled}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder="Buscar produto elegível…"
            className={DS_INPUT}
          />

          {open && (
            <div
              id="pm-produto-results"
              role="listbox"
              aria-label="Produtos elegíveis"
              className="absolute z-10 mt-1 max-h-[440px] w-full min-w-[420px] max-w-[calc(100vw-4rem)] overflow-auto rounded-[var(--radius-xs)] border border-(--color-border) bg-white shadow-md"
            >
              {status === "loading" && (
                <p className="px-3 py-2.5 text-[13px] text-(--color-text-muted)">
                  Buscando…
                </p>
              )}
              {status === "error" && (
                <p className="px-3 py-2.5 text-[13px] text-(--color-danger)">
                  Falha ao buscar produtos elegíveis.
                </p>
              )}
              {/*
                ADO 67913 — a oportunidade não tem área de venda escolhida.
                Não é `--color-danger`: nada falhou, falta uma resposta. O CTA
                só aparece quando quem monta o bloco passou o `opportunityId`;
                sem ele a frase ainda nomeia a falta, que é melhor que um
                controle que não leva a lugar nenhum.
              */}
              {status === "sem-area" && (
                <div className="px-3 py-2.5" data-testid="pm-sem-area-venda">
                  <p className="text-[13px] text-(--yellow-700)">
                    {semAreaMessage}
                  </p>
                  {onEscolherAreaVenda && (
                    <button
                      type="button"
                      data-testid="pm-escolher-area-venda"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={onEscolherAreaVenda}
                      className="mt-2 inline-flex items-center rounded-(--radius-xxs) border border-(--secondary-500) bg-(--neutral-25) px-3 py-1.5 text-[13px] font-bold text-(--secondary-500) hover:bg-(--neutral-50)"
                    >
                      Escolher área de venda
                    </button>
                  )}
                </div>
              )}
              {/*
               * Vazio: a frase depende do REGIME (ADO 67951).
               *
               * Com a lista restrita, "nenhum produto elegível encontrado" é
               * ambíguo no pior momento — o usuário acabou de digitar o nome de
               * um produto que este cliente não pode comprar, e precisa saber
               * que o motivo é o cadastro, não a busca.
               */}
              {status === "loaded" && results.length === 0 && (
                <p
                  data-testid="pm-produto-vazio"
                  className="px-3 py-2.5 text-[13px] text-(--color-text-muted)"
                >
                  {restritaAoCliente
                    ? "Nenhum produto cadastrado para este cliente corresponde à busca."
                    : "Nenhum produto elegível encontrado."}
                </p>
              )}
              {/*
               * A dica que nomeia o REGIME da lista (ADO 67951).
               *
               * Duas frases, porque são dois fatos diferentes com dois consertos
               * diferentes — e a de antes ("aparecem primeiro, marcados como do
               * cliente") descrevia o comportamento que este ticket removeu.
               *
               * ⚠️ No modo restrito não há selo por linha: todo item é do
               * cliente, e N selos idênticos são ruído, não sinal.
               */}
              {status === "loaded" && (
                <p
                  data-testid="product-allowlist-hint"
                  className="border-b border-(--color-border) bg-(--neutral-25) px-3 py-2 text-[12px] text-(--color-text-muted)"
                >
                  {!restritaAoCliente ? (
                    <>
                      Este cliente não tem <b>Produtos Elegíveis</b> cadastrados
                      no Salesforce — a lista mostra o catálogo da área de
                      venda.
                    </>
                  ) : restritaPorFamilia ? (
                    /*
                     * ⚠️ Frase PRÓPRIA para o recorte por família (03/09/2026), e
                     * a diferença não é cosmética: o cadastro do cliente em
                     * `Produtos Elegíveis` pode declarar um MATERIAL ou uma
                     * FAMÍLIA de produto, e a precisão dos dois é muito
                     * diferente — por material a lista cai a poucas unidades,
                     * por família continua na casa dos milhares (medido no setor
                     * de lubrificantes: de 2.205 para ~1.800).
                     *
                     * Dizer "apenas os produtos cadastrados para este cliente"
                     * sobre 1.800 itens prometeria uma precisão que o cadastro
                     * do Salesforce não tem — e é assim que o usuário conclui
                     * que o filtro não funciona. A frase nomeia o grão e para
                     * onde ir para estreitá-lo.
                     */
                    <>
                      Mostrando as <b>famílias de produto</b> cadastradas para
                      este cliente em <b>Produtos Elegíveis</b> no Salesforce —
                      o cadastro é por família, não por produto, então a lista é
                      mais ampla.
                    </>
                  ) : (
                    <>
                      Mostrando apenas os produtos cadastrados para este cliente
                      em <b>Produtos Elegíveis</b> no Salesforce.
                    </>
                  )}
                </p>
              )}
              {status === "loaded" &&
                results.map((product) => (
                  <button
                    key={product.codigo}
                    type="button"
                    role="option"
                    aria-selected={selected?.codigo === product.codigo}
                    onClick={() => pick(product)}
                    className="block w-full px-3 py-2.5 text-left text-[13px] hover:bg-(--secondary-100)"
                  >
                    {product.nome} · {product.codigo}
                    {/*
                     * O selo "do cliente" só sobrevive no modo CATÁLOGO, e lá
                     * ele é inalcançável na prática (sem allowlist todo item vem
                     * `null`). Fica de pé porque o switch `RESTRINGIR_AO_CLIENTE`
                     * pode ser desligado no backend, e nesse dia a marcação por
                     * item volta a valer sem costura nova aqui.
                     *
                     * ⚠️ No modo restrito NÃO renderiza: todo item seria marcado,
                     * e um selo em 100% das linhas não separa nada — quem diz o
                     * regime é a dica acima, uma vez.
                     */}
                    {!restritaAoCliente &&
                      product.elegivelParaCliente === true && (
                        <span
                          // `data-testid` porque a dica acima repete este texto em
                          // negrito (de propósito: ela nomeia o selo). Sem ele um
                          // `getAllByText('do cliente')` casa os dois.
                          data-testid="product-do-cliente"
                          className="ml-1.5 rounded-full bg-(--secondary-100) px-1.5 py-0.5 text-[11px] font-bold text-(--secondary-600)"
                        >
                          do cliente
                        </span>
                      )}
                    {/*
                     * VBR-643: o picker oferece ~2.705 produtos elegíveis contra
                     * ~1.500 linhas de CPV, então o usuário escolhia produto,
                     * preenchia volume e prazo, e só o save recusava. Sinal, e
                     * NUNCA filtro: esconder o produto faria uma lacuna de
                     * parametrização parecer catálogo.
                     *
                     * Só `false` marca. `null` é "não verificado" (nenhuma base
                     * escolhida — o caso majoritário) e marcá-lo diria "sem CPV"
                     * sobre todos.
                     */}
                    {product.cpvDisponivel === false && (
                      <span className="ml-1.5 rounded-full bg-(--yellow-100) px-1.5 py-0.5 text-[11px] font-bold text-(--yellow-700)">
                        sem CPV nesta base
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product modal (add/edit)
// ---------------------------------------------------------------------------

type FormState = {
  product: EligibleProduct | null;
  /** Nome da base — é o que o select exibe e o que filtra a referência comercial. */
  base: string;
  /**
   * Código do centro fornecedor do registro escolhido. `null` quando a base foi
   * digitada à mão (fallback) ou veio de uma linha antiga sem código.
   * Vai num campo próprio: o backend recusa nome onde espera código.
   */
  baseCodigo: string | null;
  volume: string;
  margemProposta: string;
  /**
   * Início do consumo — entrada do usuário desde o ADO 67795. Numa linha nova
   * abre no padrão (1º dia do mês seguinte, elevado ao início da análise);
   * editando, abre no valor PERSISTIDO. Antes o campo não existia no form e a
   * tela exibia o padrão do relógio mesmo ao editar uma linha antiga — a data
   * na tela não era a data gravada.
   */
  inicioConsumo: string;
  fimConsumo: string;
  incoterm: Incoterm;
  /**
   * Código SAP (`Prazo_De_Pagamento__c`). Obrigatório — `prazoPagamentoDias`
   * é derivado deste campo via `deriveDaysFromSapCode`. A picklist é restrita
   * aos códigos com contagem determinística (Opção B, VBR-480).
   */
  prazoPagamento: string;
};

function initialFormState(
  line: ProductLine | null,
  defaultInicioConsumo: string,
  defaultFimConsumo: string,
): FormState {
  if (!line) {
    return {
      product: null,
      base: "",
      baseCodigo: null,
      volume: "",
      margemProposta: "",
      inicioConsumo: defaultInicioConsumo,
      fimConsumo: defaultFimConsumo,
      incoterm: "",
      prazoPagamento: "",
    };
  }
  return {
    /*
     * `cpvDisponivel: null` — a linha PERSISTIDA não carrega o sinal, e a
     * edição não repergunta: o produto já foi aceito com CPV, senão o save
     * original teria sido recusado (VBR-643).
     *
     * `elegivelParaCliente: null` pela mesma razão, com uma a mais: a
     * elegibilidade é sinal do momento da ESCOLHA, e a allowlist do cliente pode
     * ter mudado desde então. Afirmar `false` numa linha já gravada acusaria de
     * irregular um produto que a proposta legitimamente contratou.
     */
    product: {
      codigo: line.produtoCodigo,
      nome: line.produtoNome,
      cpvDisponivel: null,
      elegivelParaCliente: null,
    },
    base: line.base,
    baseCodigo: line.baseCodigo,
    volume: String(line.volume),
    margemProposta: String(line.margemProposta),
    inicioConsumo: line.inicioConsumo,
    fimConsumo: line.fimConsumo,
    incoterm: line.incoterm,
    // Only codes with a deterministic day-count are offered; if the persisted
    // code is non-deterministic (pre-migration data), the select shows empty
    // and the user must re-select.
    prazoPagamento: line.prazoPagamento ?? "",
  };
}

function ProductModal({
  proposalId,
  editing,
  listEligible,
  listSupplyCenters = defaultListSupplyCenters,
  clientSupplyCenterCode,
  clientIncotermPadrao,
  clientPrazoPagamentoPadrao,
  probeCommercialTerms = defaultProbeCommercialTerms,
  resolveProductDefaults = defaultResolveProductDefaults,
  onClose,
  onSubmit,
  saveStatus,
  saveErrorMessage,
  onClearSaveError,
  minConsumo,
  maxConsumo,
  defaultInicioConsumo,
  onEscolherAreaVenda,
  areaVendaSignal,
}: {
  proposalId: string;
  editing: ProductLine | null;
  listEligible: (
    proposalId: string,
    q?: string,
    base?: string,
  ) => Promise<EligibleProductListing>;
  /** Injectable for tests; defaults to the proposal-scoped BFF client (VBR-643). */
  listSupplyCenters?: (proposalId: string) => Promise<ProposalSupplyCenters>;
  /**
   * Client's default supply center code (VBR-481 / VBR-482). When set and
   * this is a **creation** modal (editing=null), the matching supply center is
   * pre-selected once the catalog has loaded. The user can change it freely
   * (CA-2). `null` or absent ⇒ no pre-selection (CA-3). Editing an existing
   * line ignores this value entirely (CA-4).
   */
  clientSupplyCenterCode?: string | null;
  /**
   * Incoterm padrão do cliente (SAP code, e.g. `"Z10"`) — Bug 67530.
   * Pré-seleciona o campo "Incoterms" exatamente uma vez por abertura do modal
   * de criação. O usuário pode alterar livremente após o pré-preenchimento.
   * `null` ou ausente ⇒ campo abre em "Selecione…".
   * Ignorado na edição de uma linha existente (a linha já tem valor persistido).
   */
  clientIncotermPadrao?: string | null;
  /**
   * Prazo de pagamento padrão do cliente (SAP code, e.g. `"Y001"`) — Bug 67530.
   * Pré-seleciona o campo "Prazo de pagamento" exatamente uma vez por abertura
   * do modal de criação. Só pré-seleciona se o código tem dias determinísticos
   * (mesmo critério do `filter` da `PicklistSelect`). O usuário pode alterar.
   * `null` ou ausente ⇒ campo abre em "Selecione…".
   * Ignorado na edição de uma linha existente.
   *
   * ⚠️ O backend hoje devolve SEMPRE `null` aqui — o org não tem o campo
   * (medido; ver o doc de evidências). O caminho fica montado para quando a
   * Vibra indicar a fonte, e o `filter` de dias determinísticos existe para que
   * um código sem dias nunca seja pré-selecionado.
   */
  clientPrazoPagamentoPadrao?: string | null;
  /**
   * Sondagem dos termos comerciais no simulador de preço SAP (Bug 67530).
   * Injetável para testes; o default é o cliente real da BFF.
   */
  probeCommercialTerms?: (
    proposalId: string,
    input: {
      produtoCodigo: string;
      base?: string;
      baseCodigo?: string;
      volume: number;
      incoterm?: string;
    },
  ) => Promise<CommercialTerms>;
  /**
   * Base e incoterm padrão do produto, do Salesforce (Bug 67530). Injetável para
   * testes; o default é o cliente real da BFF.
   */
  resolveProductDefaults?: (
    proposalId: string,
    produtoCodigo: string,
  ) => Promise<ProductDefaults>;
  onClose: () => void;
  onSubmit: (input: UpsertProductLineInput) => void;
  saveStatus: SaveStatus;
  saveErrorMessage: string;
  /**
   * Drops the refusal shown under the form.
   *
   * A refusal names a product AND a base ("não há CPV para 01.000.005 na base
   * 5265"). Both are editable right above it, and the message survived the
   * edit — the user changed exactly what was asked and kept reading the old
   * complaint, now pointing at values no longer in the form.
   */
  onClearSaveError: () => void;
  /**
   * Início da janela da análise da proposta (`dataInicioAnalise`) — o piso das
   * DUAS datas de consumo (RN-F5-04 / US 67601). `null` quando a leitura da
   * proposta não resolveu: aí a tela não impõe piso e o backend decide.
   */
  minConsumo: string | null;
  /** Fim da janela da análise (`dataFimAnalise`) — teto das duas datas; `null` quando desconhecido. */
  maxConsumo: string | null;
  /** Valor com que "Início consumo" abre numa linha NOVA (ADO 67795). */
  defaultInicioConsumo: string;
  /** Abre a escolha da área de venda da oportunidade (ADO 67913). */
  onEscolherAreaVenda?: () => void;
  /** Contador que refaz a busca de produtos depois de definir a área. */
  areaVendaSignal?: number;
}) {
  /** Read-only profiles cannot submit (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  /*
   * ADO 67913 — "o sistema deve trazer pré-preenchida data início E FIM do
   * consumo a partir da definição vinda da etapa de criação da proposta".
   *
   * O fim nascia vazio enquanto o início já nascia preenchido (ADO 67795), o
   * que também divergia do protótipo, onde os dois têm `value`
   * (03-proposta-nova.html, `#pm-ini` / `#pm-fim`). O teto da janela é valor de
   * negócio — `assertConsumptionWindow` aceita `fim === dataFimAnalise` —, não
   * um número inventado.
   *
   * `maxConsumo === null` (janela da análise desconhecida) ⇒ segue vazio: sem
   * fonte, nada é preenchido.
   */
  const defaultFimConsumo = maxConsumo ?? "";
  const [form, setForm] = useState<FormState>(() =>
    initialFormState(editing, defaultInicioConsumo, defaultFimConsumo),
  );
  const [validationError, setValidationError] = useState("");

  /*
   * Supply centers for the "Base" select (VBR-468): records of the Salesforce
   * custom object `Centro_Fornecedor__c` — the quote-line field is a LOOKUP,
   * so the options are records, never a local list. A failed load degrades to
   * the free-text input (error is not an empty list: `[]` would read as "the
   * org has no bases").
   */
  const [centers, setCenters] = useState<ProposalSupplyCenter[]>([]);
  const [centersScopeDetail, setCentersScopeDetail] = useState<string | null>(
    null,
  );
  const [centersStatus, setCentersStatus] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  useEffect(() => {
    let cancelled = false;
    listSupplyCenters(proposalId)
      .then((result) => {
        if (cancelled) return;
        setCenters(result.items);
        // `detail` só vem quando NENHUMA base pôde ser sugerida. Mostrá-lo é o
        // que separa "o catálogo está aí, escolha" de "a conta não tem base".
        setCentersScopeDetail(result.detail);
        setCentersStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setCentersStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [listSupplyCenters, proposalId]);

  /*
   * CA-1 (VBR-482): pre-select the client's supply center on creation.
   *
   * Applies exactly once per modal mount — guarded by a ref so a user who
   * changes their selection (even back to "Selecione…") is never overridden
   * again (CA-2).
   *
   * Conditions:
   *  - editing === null  → creation, never edits (CA-4)
   *  - centersStatus === 'loaded'  → catalog is ready; skipped on error (CA-5)
   *  - clientSupplyCenterCode  → client has a known base; absent ⇒ "Selecione…" (CA-3)
   *  - center found in catalog  → code must resolve to a real record (CA-1)
   */
  const clientDefaultApplied = useRef(false);
  useEffect(() => {
    if (clientDefaultApplied.current) return;
    if (editing !== null) return;
    if (centersStatus !== "loaded") return;
    if (!clientSupplyCenterCode) return;

    const center = centers.find((c) => c.code === clientSupplyCenterCode);
    if (!center) return;

    clientDefaultApplied.current = true;
    setForm((f) => ({ ...f, base: center.name, baseCodigo: center.code }));
  }, [centersStatus, centers, clientSupplyCenterCode, editing]);

  /*
   * CA-1 (Bug 67530): pré-seleciona Incoterms do cliente exatamente uma vez
   * por abertura do modal de criação.
   *
   * Condições:
   *  - editing === null  → criação; nunca edição (CA-4)
   *  - clientIncotermPadrao  → cliente tem incoterm único; null ⇒ "Selecione…"
   *
   * O guard `useRef` garante que o usuário pode mudar a seleção livremente
   * depois do pré-preenchimento sem ser sobrescrito (mesma lógica do supply center).
   *
   * Nota: não aguarda carregamento de catálogo — Incoterms e Prazo de pagamento
   * vêm do picklist (sempre disponível) e não de um fetch assíncrono.
   */
  const clientIncotermApplied = useRef(false);
  useEffect(() => {
    if (clientIncotermApplied.current) return;
    if (editing !== null) return;
    if (!clientIncotermPadrao) return;

    clientIncotermApplied.current = true;
    setForm((f) => ({ ...f, incoterm: clientIncotermPadrao }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIncotermPadrao, editing]);

  /*
   * CA-1 (Bug 67530): pré-seleciona Prazo de pagamento da NEG ativa exatamente
   * uma vez por abertura do modal de criação.
   *
   * Adicionalmente, o prazo só é pré-selecionado quando o código tem contagem
   * de dias determinística (`deriveDaysFromSapCode` !== null) — mesma restrição
   * da PicklistSelect com `filter`. Um código sem dias deriváveis (ex.: `ZM*`,
   * `ZV*`) não deve ser pré-selecionado: o usuário precisaria trocar mesmo assim,
   * e pior — o `handleSubmit` o rejeitaria como se fosse escolha do usuário.
   */
  const clientPrazoApplied = useRef(false);
  useEffect(() => {
    if (clientPrazoApplied.current) return;
    if (editing !== null) return;
    if (!clientPrazoPagamentoPadrao) return;
    // Código sem contagem de dias determinística (`ZM*`, `ZV*`, …) não é
    // pré-selecionado: o `handleSubmit` o rejeitaria como se fosse escolha do
    // usuário, e o campo ficaria acusando um erro que ninguém cometeu.
    if (deriveDaysFromSapCode(clientPrazoPagamentoPadrao) === null) {
      return;
    }

    clientPrazoApplied.current = true;
    setForm((f) => ({ ...f, prazoPagamento: clientPrazoPagamentoPadrao }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientPrazoPagamentoPadrao, editing]);

  /*
   * Bug 67530 — o prazo de pagamento vem do SIMULADOR DE PREÇO, não do
   * Salesforce.
   *
   * O incoterm tem fonte no org (`Area_De_Vendas__c.Incoterms__c`) e o efeito
   * acima já o pré-seleciona. O prazo **não tem**: medido e refutado em
   * 18/08/2026, e a resposta do negócio em 21/08/2026 foi "desvincular a
   * informação trazida do Salesforce; considerar incoterms e prazos de pagamento
   * vindas do simulador de preços". O callback do simulador traz
   * `lstItem[].condPagamento` e `lstItem[].incoterms` por item.
   *
   * A sondagem roda **em segundo plano** e NUNCA bloqueia o "Adicionar": o ciclo
   * do simulador leva segundos (6,4 s / 8,1 s / ~7 s medidos no stage em
   * 25/08/2026) e o usuário continua preenchendo o resto do formulário enquanto
   * ela corre. Nada resolvido ⇒ os campos ficam em "Selecione…", exatamente o
   * comportamento anterior — nenhum valor de reserva é fabricado.
   *
   * Dispara uma vez por trio produto × base × incoterm, e só quando o prazo
   * ainda está vazio: trocar de base muda o CPV e pode mudar o termo, mas
   * reperguntar depois de o usuário ter escolhido sobrescreveria a resposta dele.
   *
   * ⚠️ O incoterm entra na chave como INSUMO: a ida ao SAP com `inco1` em branco
   * volta sem item nenhum (medido no stage em 26/08/2026, três sondagens), e o
   * org nunca o manda vazio. O backend o resolve pela área de venda do produto;
   * quando nem ele responde, escolher o incoterms aqui refaz a consulta.
   */
  /*
   * Bug 67530 — a Base e o incoterm do produto, do Salesforce.
   *
   * ## Por que este efeito existe, e por que ele vem ANTES da sondagem
   *
   * A **Base é o gate de tudo**: sem ela o backend recusa a sondagem (o CPV é
   * chaveado por centro fornecedor), então o prazo de pagamento e o incoterm
   * também não vinham. E a Base só era pré-selecionada pelo veredito de CONTA
   * INTEIRA (`proposals.supply_center_code`), que exige todas as áreas
   * concordarem — medido em 27/08/2026, isso responde em **8 de 39** contas com
   * cotação PCR. Na conta SAP 3095 do relato, seis áreas apontam o centro 5025 e
   * uma aponta o 5266: veredito nulo, e os três campos em "Selecione…".
   *
   * Pelo SETOR do produto — a regra do `obterAreasVendas` do org — a Base
   * resolve em **35 de 39** (97,1% de acerto) e o incoterm em **38 de 39**
   * (100%). É uma leitura só de Salesforce, sem SAP, então preenche de imediato.
   *
   * ## Só preenche campo VAZIO
   *
   * A escolha do usuário sempre vence, e o veredito de conta inteira também: ele
   * só existe quando TODAS as áreas concordam, e nesse caso coincide com o do
   * setor. Dispara uma vez por produto: trocar o produto muda o setor, e pode
   * mudar as duas respostas.
   *
   * Falha **nunca** vira erro de formulário: os campos continuam pedindo a
   * resposta, que é o comportamento anterior a este pré-preenchimento.
   */
  const defaultsProductRef = useRef<string | null>(null);
  /*
   * Enquanto esta leitura está em voo, Base e Incoterms ficam DESABILITADOS com
   * o placeholder "Carregando…" — o mesmo tratamento que a Base já dava ao
   * catálogo de centros (`centersStatus === 'loading'`).
   *
   * Sem isso os dois campos ficavam em "Selecione…", habilitados, e mudavam
   * sozinhos alguns instantes depois de escolher o produto: quem estava
   * escolhendo à mão tinha a resposta sobrescrita à sua frente (a sondagem só
   * preenche campo vazio, mas o clique já podia ter acontecido) — e quem não
   * estava não tinha como saber que valia esperar.
   */
  const [defaultsStatus, setDefaultsStatus] = useState<
    "idle" | "loading" | "done"
  >("idle");
  const padroesCarregando = defaultsStatus === "loading";
  /*
   * POR QUE o prazo (e às vezes o incoterm) continuou em "Selecione…".
   *
   * Medido em staging em 04/09/2026, cliente SAP 300945: escolhendo
   * `ÓLEO DIESEL A S500` a Base vem pré-preenchida `5080 - BAMAT` (pelo setor do
   * produto) e a sondagem responde **400** — `"Não há CPV cadastrado para o
   * produto 01.008.341 na base 5080"`. O `catch` era VAZIO, então os dois campos
   * ficavam pedindo a resposta sem nada explicando, o que é exatamente o sintoma
   * do Bug 67530 ("o sistema não apresenta o prazo de pagamento") — só que agora
   * por uma lacuna de CPV, e não pela allowlist de códigos.
   *
   * ⚠️ Continua NÃO sendo erro de formulário: é dica muted sob a Base, o campo
   * segue habilitado e o "Adicionar" segue liberado. A recusa dura, quando ela
   * existir, continua vindo do save — que é onde o CPV de fato é exigido.
   *
   * ⚠️ Não substitui o selo `sem CPV nesta base` do picker de produto (VBR-643):
   * aquele só aparece quando a Base JÁ estava escolhida ao abrir o picker, e
   * neste fluxo ela é preenchida DEPOIS do produto — então na prática o usuário
   * nunca o via.
   */
  const [termosMotivo, setTermosMotivo] = useState<string | null>(null);
  useEffect(() => {
    if (editing !== null) return;
    const produtoCodigo = form.product?.codigo;
    if (!produtoCodigo) return;
    if (defaultsProductRef.current === produtoCodigo) return;
    defaultsProductRef.current = produtoCodigo;

    let cancelled = false;
    setDefaultsStatus("loading");
    resolveProductDefaults(proposalId, produtoCodigo)
      .then((defaults) => {
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          incoterm: f.incoterm || (defaults.incoterm ?? ""),
          // A Base viaja em par (rótulo + código): o código é a chave do CPV, e
          // o rótulo é o que o select mostra. Preencher um sem o outro deixaria
          // a tela dizendo uma base e o save enviando outra.
          ...(f.baseCodigo || f.base || !defaults.baseCodigo
            ? {}
            : {
                base: defaults.base ?? defaults.baseCodigo,
                baseCodigo: defaults.baseCodigo,
              }),
        }));
      })
      .catch(() => {
        // Sem padrão é o estado anterior a este pré-preenchimento: os campos
        // ficam em "Selecione…" e o motivo já está no log do backend.
      })
      .finally(() => {
        // `finally`, não só no `then`: falha também LIBERA os campos — deixá-los
        // desabilitados prenderia o formulário por causa de um
        // pré-preenchimento que é conveniência.
        if (!cancelled) setDefaultsStatus("done");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, form.product?.codigo, proposalId]);

  const probedKey = useRef<string | null>(null);
  useEffect(() => {
    if (editing !== null) return;
    const produtoCodigo = form.product?.codigo;
    if (!produtoCodigo) return;
    // Já respondido (pelo usuário ou pelo snapshot da proposta) — não repergunta.
    if (form.prazoPagamento) return;

    /*
     * A chave é produto × base, e o VOLUME não entra nela — nem nas dependências
     * do efeito.
     *
     * O termo que se busca é do par cliente × material (o incoterm da área de
     * venda e a condição de pagamento da negociação vigente); o volume viaja na
     * simulação apenas como `kmeng`. Depender dele disparava uma simulação por
     * TECLA: digitar "150" pedia o termo com volume 1 e nunca mais repetia,
     * porque a chave já estava marcada.
     *
     * Sem volume informado ainda, vai `1`: é sondagem, não a proposta — nada do
     * que volta é persistido como valor comercial, e disparar cedo faz a espera
     * de ~7 s correr enquanto o usuário preenche o resto do formulário.
     */
    const volumeDigitado = Number(form.volume.replace(",", "."));
    const volume =
      Number.isFinite(volumeDigitado) && volumeDigitado > 0
        ? volumeDigitado
        : 1;

    /*
     * Sem BASE não se sonda — e a chave nem é marcada, para a sondagem
     * acontecer assim que ela for escolhida.
     *
     * O backend exige o centro fornecedor ("Informe a base de fornecimento: o
     * CPV é cadastrado por centro fornecedor") e responde 400. Medido no stage
     * em 26/08/2026: com o centro da conta divergente entre as áreas de venda a
     * Base NÃO vinha pré-selecionada, então a primeira sondagem saía sempre sem
     * ela, gastava ~2 s e caía no `catch` — que na época pintava uma frase
     * culpando o SAP por uma consulta que nunca foi feita.
     *
     * Desde 27/08/2026 a Base é resolvida pelo setor do produto e chega antes
     * daqui na esmagadora maioria dos casos; a guarda fica para o resto (áreas
     * do setor em desacordo), onde continua sendo o comportamento correto.
     */
    const baseCodigo = form.baseCodigo ?? undefined;
    const baseLivre = form.base || undefined;
    if (!baseCodigo && !baseLivre) return;

    /*
     * O INCOTERM entra na chave porque é insumo da sondagem, não a pergunta: a
     * ida com `inco1` em branco não traz item nenhum do SAP (medido no stage em
     * 26/08/2026), e o org nunca o manda vazio. Quando o backend não consegue
     * resolvê-lo pela área de venda do produto, a primeira sondagem volta sem
     * prazo — e escolher o incoterms na tela muda a chave e refaz a consulta,
     * agora com o insumo que faltava.
     */
    const incoterm = form.incoterm || undefined;

    const key = `${produtoCodigo}|${baseCodigo ?? baseLivre}|${incoterm ?? ""}`;
    if (probedKey.current === key) return;
    probedKey.current = key;

    let cancelled = false;
    // Sondagem nova ⇒ o motivo anterior deixou de valer (trocou produto, base
    // ou incoterm). Limpar aqui, e não no `finally`, é o que evita a dica velha
    // sobreviver a uma consulta que agora vai dar certo.
    setTermosMotivo(null);
    probeCommercialTerms(proposalId, {
      produtoCodigo,
      base: baseLivre,
      baseCodigo,
      volume,
      incoterm,
    })
      .then((terms) => {
        if (cancelled) return;
        /*
         * Só preenche campo VAZIO: entre o disparo e a resposta o usuário pode
         * ter escolhido, e a escolha dele vence a sondagem.
         *
         * O prazo passa pelo mesmo `deriveDaysFromSapCode` do `filter` da
         * picklist: um código sem contagem única (`ZM*`, `ZV*`, `Y*`) não pode
         * ser pré-selecionado, senão o `handleSubmit` o recusaria como se fosse
         * escolha do usuário.
         */
        const prazoUtilizavel =
          terms.prazoPagamento !== null &&
          deriveDaysFromSapCode(terms.prazoPagamento) !== null
            ? terms.prazoPagamento
            : "";
        /*
         * O SAP respondeu, e ainda assim o campo fica vazio — dois casos, e o
         * usuário precisava saber qual:
         *  - nenhum prazo veio (`null`): o par cliente × material não tem
         *    condição de pagamento na negociação vigente;
         *  - veio um código sem contagem de dias única (`ZM*`, `ZV*`, `Y000`…):
         *    ele NÃO pode ser pré-selecionado, porque o `handleSubmit` o
         *    recusaria como se fosse escolha do usuário.
         */
        if (prazoUtilizavel === "") {
          setTermosMotivo(
            terms.prazoPagamento === null
              ? "O simulador do SAP não devolveu prazo de pagamento para este produto nesta base — escolha o prazo na lista."
              : `O SAP devolveu o prazo "${terms.prazoPagamento}", que não tem contagem de dias única — escolha o prazo na lista.`,
          );
        }
        setForm((f) => ({
          ...f,
          incoterm: f.incoterm || (terms.incoterm ?? ""),
          prazoPagamento: f.prazoPagamento || prazoUtilizavel,
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        /*
         * Indisponibilidade do SAP continua NÃO sendo erro de formulário — mas
         * o motivo deixou de morrer só no log do backend. A mensagem do 4xx é
         * texto de usuário (o `AllExceptionsFilter` a compõe e a BFF repassa
         * 4xx verbatim), e é ela que nomeia o conserto: trocar de base, ou
         * pedir o cadastro do CPV. No 5xx sobra o fallback do `throwApiError`,
         * que ao menos diz que a consulta ao SAP falhou.
         */
        setTermosMotivo(
          err instanceof Error && err.message.trim() !== ""
            ? err.message
            : "Não foi possível consultar o incoterm e o prazo de pagamento no SAP — escolha os dois na lista.",
        );
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editing,
    form.product?.codigo,
    form.base,
    form.baseCodigo,
    form.incoterm,
  ]);

  // Known commercial reference for the live price preview (RN-F5-02/HU-08.1).
  // Only available when editing a persisted line — a brand-new line has no
  // CPV until the backend snapshots it on first save.
  const cpv = editing?.cpv ?? null;
  const margemSugerida = editing?.margemSugerida ?? null;
  const margemBp = editing?.margemBp ?? null;

  const margemPropostaValue =
    form.margemProposta.trim() === ""
      ? margemSugerida
      : Number(form.margemProposta.replace(",", "."));
  const precoFinalPreview = computePrecoFinalPreview(
    cpv,
    margemPropostaValue ?? null,
  );

  /**
   * Janela de consumo impossível: a análise da proposta TERMINA antes de
   * começar. Nenhuma data satisfaz `minConsumo <= data <= maxConsumo`, então o
   * formulário não tem submissão válida — os campos ficam com `min > max` e o
   * navegador nem oferece um dia selecionável. A correção é nos dados da
   * PROPOSTA, não aqui.
   *
   * ⚠️ O predicado MUDOU no ADO 67795: comparava `dataFimAnalise` com o 1º dia
   * do mês seguinte, e disparava para toda proposta cuja análise terminasse no
   * mês corrente. Com o início do consumo escolhido pelo usuário dentro da
   * janela inteira da análise, essa combinação é perfeitamente válida.
   */
  const janelaVazia = isJanelaAnaliseInvertida(minConsumo, maxConsumo);

  /**
   * Trecho pt-BR da janela da análise para a dica abaixo dos campos. `null`
   * quando NENHUM dos dois limites foi lido — a dica some, em vez de anunciar
   * um período que ninguém resolveu.
   */
  const janelaAnaliseTexto =
    minConsumo && maxConsumo
      ? `de ${fmtDateBR(minConsumo)} a ${fmtDateBR(maxConsumo)}`
      : minConsumo
        ? `a partir de ${fmtDateBR(minConsumo)}`
        : maxConsumo
          ? `até ${fmtDateBR(maxConsumo)}`
          : null;

  const isSaving = saveStatus === "saving";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    e.preventDefault();
    setValidationError("");

    if (!form.product) {
      setValidationError("Selecione um produto elegível.");
      return;
    }
    const volume = Number(form.volume.replace(",", "."));
    if (!form.volume || !Number.isFinite(volume) || volume <= 0) {
      setValidationError("Informe um volume válido (m³/mês).");
      return;
    }
    // RN-F5-04 (front guard): as duas datas dentro do período da análise, e
    // início ≤ fim — mesma ordem de recusa do backend, para a tela nunca
    // acusar um limite diferente do que a API acusaria. O backend continua
    // sendo a fonte da verdade; aqui só antecipamos a mensagem.
    if (janelaVazia) {
      setValidationError(
        `Não há período de consumo possível: a análise da proposta termina em ${fmtDateBR(maxConsumo as string)}, antes de começar em ${fmtDateBR(minConsumo as string)}. Corrija as datas da análise nos dados da proposta.`,
      );
      return;
    }
    const janelaInvalida = validateConsumptionWindow({
      inicioConsumo: form.inicioConsumo,
      fimConsumo: form.fimConsumo,
      dataInicioAnalise: minConsumo,
      dataFimAnalise: maxConsumo,
    });
    if (janelaInvalida) {
      setValidationError(janelaInvalida);
      return;
    }
    /*
     * O incoterm nasce vazio — antes defaultava para `CIF`, que é um valor
     * legítimo e portanto indistinguível de uma escolha real na tela e no CRM.
     * Exigir a resposta é o que impede gravar um frete que ninguém escolheu.
     */
    if (!form.incoterm) {
      setValidationError("Selecione o incoterm.");
      return;
    }

    /*
     * Prazo de pagamento — código SAP obrigatório, dias derivados (Opção B,
     * VBR-480). A picklist é restrita aos códigos com contagem determinística;
     * portanto `deriveDaysFromSapCode` sempre retorna um número para os valores
     * selecionáveis. `null` só aparece em dados legados com código
     * não-determinístico — nesse caso o usuário deve re-selecionar.
     */
    if (!form.prazoPagamento) {
      setValidationError("Selecione o prazo de pagamento.");
      return;
    }
    const prazoPagamentoDias = deriveDaysFromSapCode(form.prazoPagamento);
    if (prazoPagamentoDias === null) {
      setValidationError(
        "O prazo de pagamento selecionado não tem contagem de dias determinística. Selecione outro código.",
      );
      return;
    }

    const margemProposta =
      form.margemProposta.trim() === ""
        ? undefined
        : Number(form.margemProposta.replace(",", "."));

    // RN-F5-03 (front guard): when EDITING a persisted line whose margemSugerida
    // is already null (pricing adapter returned null on first save), the backend
    // will reject the request with 422 unless margemProposta is provided. Catch
    // it here so the user gets the message before the round-trip. For NEW lines
    // margemSugerida is always null (not yet calculated) — the 422 path remains
    // the safety net if the adapter returns null after first save.
    if (editing && margemSugerida === null && margemProposta === undefined) {
      setValidationError(
        "Informe a margem proposta: a margem realizada não está disponível para este produto nesta base.",
      );
      return;
    }

    onSubmit({
      produtoCodigo: form.product.codigo,
      base: form.base.trim() || undefined,
      baseCodigo: form.baseCodigo ?? undefined,
      volume,
      margemProposta,
      inicioConsumo: form.inicioConsumo,
      fimConsumo: form.fimConsumo,
      incoterm: form.incoterm,
      prazoPagamentoDias,
      prazoPagamento: form.prazoPagamento,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/*
        760px, e não os 660px do `.pm` do protótipo (03-proposta-nova.html:100).
        Desvio deliberado, e a razão é uma divergência NOSSA anterior: ali o
        "Produto · cód." é um `<select>` simples, que trunca com ellipsis; aqui
        ele virou combobox com busca (o recorte DCVIM tem 2.705 produtos) e, uma
        vez escolhido, renderiza a pill com nome + código + "Trocar". Em 660px
        essa pill quebrava em três linhas e empurrava Volume e Margem para cima.
        Os demais modais seguem em 660px — este é o único com esse conteúdo.
      */}
      <div className="w-full max-w-[760px] max-h-[92vh] overflow-auto rounded-[var(--radius-md)] bg-white px-8 py-[30px] shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
        <div className="flex items-start justify-between gap-3">
          <h4
            id="product-modal-title"
            className="text-(length:--t-h4) font-bold"
          >
            {editing ? "Editar produto" : "Adicionar produto"}
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
        {/* Prototype subtitle (03-proposta-nova.html, `#prodModal`). */}
        <p className="text-[14px] text-(--color-text-muted)">
          Selecione o produto e preencha os dados comerciais.
        </p>
        {/*
          ADO 67913 — a lista oferece só os produtos elegíveis do cadastro do
          cliente, no setor da área de venda da oportunidade (o recorte de oferta
          vive em `AREA_VENDA_ALLOW`, `lib/opportunities/sales-area-scope.ts`).
          Sem esta nota, "meu produto não
          está aqui" não tem conserto visível: a inclusão é no Salesforce, não
          nesta tela. Texto verbatim do ticket.

          Fica sob o subtítulo — é onde o usuário está olhando quando abre a
          lista e não acha o produto.
        */}
        <p
          className="mb-3 text-[12px] text-(--color-text-muted)"
          data-testid="pm-produto-elegivel-nota"
        >
          Caso o produto desejado não esteja na lista, realize a inclusão em
          &quot;Produtos Elegíveis&quot; no cadastro do cliente no SALESFORCE.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/*
            Protótipo `.fgrid.c3`: Produto · Volume · Margem proposta — mas com
            a primeira coluna MAIS LARGA (`1.6fr`) em vez das três iguais.
            Volume e Margem são campos numéricos curtos; o nome do produto é que
            precisa da largura (`GASOLINA ESPECIAL BR-M10-R95 - KG · 01.000.012`).
            Dividir em três partes iguais gastava a mesma largura nos três e
            quebrava só o que não cabia.

            `minmax(0, …)` em vez de `1.6fr` puro é obrigatório, não estilo: um
            track `fr` tem mínimo `auto`, ou seja **min-content** — então a
            coluna do produto não encolhia abaixo do nome inteiro, roubava a
            largura das outras duas e fazia `VOLUME (M³/MÊS)` e `MARGEM PROPOSTA`
            quebrarem em duas linhas. Com o mínimo em `0` o track respeita a
            proporção e o `truncate` da pill faz o resto.

            `items-end` é o `align-items:end` do `.pm .fgrid` do protótipo: se
            algum label quebrar, os inputs continuam alinhados pela base.

            O breakpoint continua o do protótipo (`max-width:760px` colapsa) — é
            viewport, não largura do modal, então alargá-lo não o move.
          */}
          <div className="grid gap-x-6 gap-y-5 min-[761px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] min-[761px]:items-end">
            <ProductPicker
              proposalId={proposalId}
              selected={form.product}
              onSelect={(product) => {
                onClearSaveError();
                setForm((f) => ({ ...f, product }));
              }}
              listEligible={listEligible}
              baseCodigo={form.baseCodigo}
              disabled={isSaving || Boolean(editing)}
              onEscolherAreaVenda={onEscolherAreaVenda}
              areaVendaSignal={areaVendaSignal}
            />

            <div>
              <label htmlFor="pm-volume" className={DS_LABEL}>
                Volume (m³/mês)
              </label>
              <input
                id="pm-volume"
                type="number"
                min="0"
                step="any"
                disabled={isSaving}
                value={form.volume}
                onChange={(e) =>
                  setForm((f) => ({ ...f, volume: e.target.value }))
                }
                className={DS_INPUT}
              />
            </div>

            <div>
              <label htmlFor="pm-margem" className={DS_LABEL}>
                Margem proposta
                {editing && margemSugerida === null && (
                  <span
                    className="ml-1 font-normal normal-case text-(--yellow-700)"
                    aria-hidden="true"
                  >
                    (obrigatória)
                  </span>
                )}
              </label>
              <input
                id="pm-margem"
                type="number"
                step="any"
                placeholder={
                  editing && margemSugerida === null
                    ? "obrigatória"
                    : "sugerida"
                }
                disabled={isSaving}
                value={form.margemProposta}
                onChange={(e) =>
                  setForm((f) => ({ ...f, margemProposta: e.target.value }))
                }
                className={DS_INPUT}
                aria-required={
                  editing && margemSugerida === null ? "true" : undefined
                }
              />
            </div>
          </div>

          {/* Prototype `.pm-info`: Base + read-only commercial reference,
              stacked (flex column, neutral-40 panel). */}
          <div className="my-[18px] flex flex-col gap-2.5 rounded-[var(--radius-xs)] bg-(--neutral-40) px-[18px] py-4 text-[14px] text-(--color-text-muted)">
            <div className="flex items-center gap-2">
              <label htmlFor="pm-base">Base:</label>
              {/*
                Base de fornecimento (VBR-468): select alimentado pelos
                REGISTROS do custom object Salesforce Centro_Fornecedor__c —
                QuoteLineItem.Centro_Fornecedor__c é um LOOKUP, não picklist
                ("Análise Picklists Vibra Contratos"), e o payload de
                referência da Vibra ("Fluxo Mesa Contratos") o envia como
                "Centro_Fornecedor__r": { "Codigo_Do_Centro__c": "5099" }.
                As 5 opções fixas do protótipo (03-proposta-ciclo1.html:289)
                eram mock — a lista real vem do backend.
                O valor selecionado é o Name (é o FILTRO que a referência
                comercial entende; a base GRAVADA volta do ACL). Fonte fora do
                ar ⇒ degrade para texto livre, nunca select vazio.

                ADO 67869: a lista é o CATÁLOGO COMPLETO, com as bases das áreas
                de venda da conta marcadas "sugerida" e no topo, e `searchable`
                porque são ~559 registros ("podendo ser digitaveis o código da
                base ou nome da mesma"). A restrição da VBR-643 deixava contas
                com UMA opção — e quando aquela opção não tinha CPV para nenhum
                produto, não havia produto que o LT conseguisse adicionar. O que
                protege contra a base errada continua sendo o sinal "sem CPV
                nesta base" por produto e a recusa no save, que NOMEIAM o
                problema em vez de esconder as opções.
              */}
              {centersStatus === "error" ? (
                <input
                  id="pm-base"
                  type="text"
                  placeholder={
                    padroesCarregando ? "Carregando…" : "Digite a base…"
                  }
                  disabled={isSaving || padroesCarregando}
                  value={form.base}
                  // Base digitada à mão não tem código: o backend resolve pelo
                  // nome no envio ao ARP, e manda null se não encontrar.
                  onChange={(e) => (
                    onClearSaveError(),
                    setForm((f) => ({
                      ...f,
                      base: e.target.value,
                      baseCodigo: null,
                    }))
                  )}
                  title="Não foi possível carregar as bases do Salesforce — informe manualmente."
                  className={`${DS_INPUT} !w-64 !py-1.5`}
                  data-testid="pm-base-fallback"
                />
              ) : (
                <Select
                  id="pm-base"
                  disabled={
                    isSaving || centersStatus === "loading" || padroesCarregando
                  }
                  value={form.base}
                  // Guarda o par do MESMO registro: o nome para exibir, o código
                  // para o ARP. Descartar o código aqui era o defeito reportado.
                  onChange={(name) => {
                    onClearSaveError();
                    setForm((f) => ({
                      ...f,
                      base: name,
                      baseCodigo:
                        centers.find((c) => c.name === name)?.code ?? null,
                    }));
                  }}
                  className="!w-64"
                  data-testid="pm-base"
                  searchable
                  searchPlaceholder="Buscar por código ou nome…"
                  placeholder={
                    centersStatus === "loading" || padroesCarregando
                      ? "Carregando…"
                      : "Selecione…"
                  }
                  options={[
                    // A persisted line whose base predates the select (or came
                    // from the ACL default) still renders its value.
                    ...(form.base !== "" &&
                    !centers.some((c) => c.name === form.base)
                      ? [{ value: form.base, label: form.base }]
                      : []),
                    ...centers.map((center) => ({
                      value: center.name,
                      label: center.name,
                      // O `Name` do Salesforce já começa pelo código
                      // ("5029 - BAFOR Base de Fortaleza"), mas nem toda fonte
                      // escreve assim — declarar o código como termo de busca faz
                      // a busca por código valer sempre, não por coincidência.
                      keywords: center.code,
                      hint: center.sugerida ? "sugerida" : undefined,
                    })),
                  ]}
                />
              )}
              {/*
               * Nenhuma base pôde ser SUGERIDA (conta sem centro, sem cliente
               * vinculado, ou CRM fora do ar). A lista continua completa —
               * dizer por que nada está marcado "sugerida" é o que impede o
               * catálogo de parecer a resposta certa (ADO 67869).
               */}
              {centersScopeDetail && centersStatus === "loaded" && (
                <p
                  data-testid="pm-base-escopo"
                  className="mt-1 text-[11px] text-(--color-text-muted)"
                >
                  {centersScopeDetail}
                </p>
              )}
              {/*
               * Bug 67530 — por que o prazo (e às vezes o incoterm) continua em
               * "Selecione…". Ver o docblock de `termosMotivo`.
               *
               * ⚠️ Só aparece enquanto o PRAZO está vazio: respondido o campo,
               * a dica descreveria um estado que já não existe. Tom de atenção
               * (`--yellow-700`, a família "Exceção/Atenção"), nunca
               * `--color-danger`: nada falhou do lado do usuário e o formulário
               * segue submissível.
               */}
              {termosMotivo && form.prazoPagamento === "" && (
                <p
                  data-testid="pm-termos-motivo"
                  className="mt-1 text-[11px] text-(--yellow-700)"
                >
                  {termosMotivo}
                </p>
              )}
            </div>
            <span>
              Margem BP:{" "}
              <b className="text-(--color-text)" data-testid="pm-margem-bp">
                {formatMoney(margemBp)}
              </b>
            </span>
            <span>
              Margem realizada:{" "}
              <b
                className="text-(--color-text)"
                data-testid="pm-margem-sugerida"
              >
                {formatMoney(margemSugerida)}
              </b>
            </span>
            <span>
              CPV:{" "}
              <b className="text-(--color-text)" data-testid="pm-cpv">
                {formatMoney(cpv)}
              </b>
            </span>
            {/* App-only preview (RN-F5-02/HU-08.1) — lives in the reference
                panel so the layout stays the prototype's. */}
            <span>
              Preço final:{" "}
              <b className="text-(--color-text)" data-testid="pm-preco-preview">
                {precoFinalPreview === null
                  ? "—"
                  : formatMoney(precoFinalPreview)}
              </b>
            </span>
          </div>
          {!editing && (
            <p className="mt-1 text-[12px] italic text-(--color-text-muted)">
              Margem BP, CPV e preço final são calculados pela referência
              comercial ao salvar.
            </p>
          )}
          {/*
            A fonte real (Salesforce) publica o CPV mas NÃO publica margem
            neste ponto do fluxo — ela nasce da simulação de preço do SAP,
            depois (ADR-0040). Quando a margem sugerida vem nula o backend
            passa a exigir a margem proposta (422), então o aviso tem de vir
            ANTES do submit: sem ele o usuário só descobre a exigência pelo
            erro, e um "—" mudo na linha acima não explica nada.
            Nota: o aviso só aparece na EDIÇÃO (editing !== null), pois para
            uma linha nova margemSugerida é sempre null antes do primeiro save
            (ainda não foi calculada) — mostrar o aviso sempre seria ruído.
          */}
          {editing && margemSugerida === null && (
            <p
              className="mt-1 text-[12px] text-(--yellow-700)"
              data-testid="pm-sem-margem-referencia"
            >
              Margem realizada indisponível: a referência de margem só existe
              após a simulação de preço — informe a{" "}
              <strong>margem proposta</strong> manualmente.
            </p>
          )}

          {/* Prototype `.fgrid.c2`: Início consumo · Fim consumo. */}
          <div className="mt-[18px] grid grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label htmlFor="pm-ini" className={DS_LABEL}>
                Início consumo
              </label>
              {/*
                ADO 67795: campo EDITÁVEL, como o protótipo e a Feature F5
                sempre descreveram ("Entrada do usuário"). Ele abria
                `disabled` porque o backend derivava a data e recusava o campo
                no corpo — o usuário via a data que o servidor escolheria e não
                tinha como mudá-la, nem no cadastro nem na edição.
                O teto é `form.fimConsumo` quando já existe: início depois do
                fim é a recusa que o próprio date picker pode evitar.
              */}
              <input
                id="pm-ini"
                type="date"
                disabled={isSaving}
                min={minConsumo ?? undefined}
                max={form.fimConsumo || maxConsumo || undefined}
                value={form.inicioConsumo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, inicioConsumo: e.target.value }))
                }
                className={DS_INPUT}
              />
            </div>
            <div>
              <label htmlFor="pm-fim" className={DS_LABEL}>
                Fim consumo
              </label>
              <input
                id="pm-fim"
                type="date"
                disabled={isSaving}
                min={form.inicioConsumo || minConsumo || undefined}
                max={maxConsumo ?? undefined}
                value={form.fimConsumo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fimConsumo: e.target.value }))
                }
                className={DS_INPUT}
              />
              {janelaVazia ? (
                /*
                 * Janela impossível: a análise da proposta termina antes de
                 * começar. Nenhuma data satisfaz os dois limites, então em vez
                 * de instruir o usuário a escolher uma data — não existe uma —
                 * dizemos qual é o dado errado e onde corrigi-lo.
                 */
                <p
                  className="mt-1 text-[12px] text-(--color-danger)"
                  data-testid="pm-fim-consumo-hint"
                  role="alert"
                >
                  Não há período de consumo possível nesta proposta: a análise
                  termina em {fmtDateBR(maxConsumo as string)}, antes de começar
                  em {fmtDateBR(minConsumo as string)}. Corrija as{" "}
                  <strong>datas da análise</strong> nos dados da proposta.
                </p>
              ) : (
                /*
                 * A frase antiga dizia "início do consumo é definido
                 * automaticamente" — o texto que a US 67601 mandou remover, e
                 * que a partir do ADO 67795 seria falso: o campo é do usuário.
                 * O que fica é o limite que ele precisa respeitar, e só quando
                 * a leitura da proposta o resolveu (prometer uma janela que não
                 * se leu seria pior que não dizer nada).
                 */
                janelaAnaliseTexto && (
                  <p
                    className="mt-1 text-[12px] text-(--color-text-muted)"
                    data-testid="pm-fim-consumo-hint"
                  >
                    As datas de consumo devem ficar dentro do período da análise
                    da proposta ({janelaAnaliseTexto}).
                  </p>
                )
              )}
            </div>
          </div>

          {/* Prototype `.fgrid.c2`: Incoterms · Prazo de pagamento. */}
          <div className="mt-[18px] grid grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label htmlFor="pm-inco" className={DS_LABEL}>
                Incoterms
              </label>
              {/*
                Do catálogo, nunca literal. Até 07/08/2026 este select tinha
                `CIF`/`FOB` fixos — 2 de 51 valores, e nenhum dos dois é o que o
                negócio seleciona (os códigos SAP `Z10`, `Z02`, `ZSF`… são).
              */}
              <PicklistSelect
                id="pm-inco"
                field={PicklistField.ProductLineIncoterm}
                data-testid="pm-incoterm"
                disabled={isSaving || padroesCarregando}
                placeholder={padroesCarregando ? "Carregando…" : "Selecione…"}
                value={form.incoterm}
                onChange={(incoterm) => setForm((f) => ({ ...f, incoterm }))}
              />
            </div>
            <div>
              <label htmlFor="pm-prazo-sap" className={DS_LABEL}>
                Prazo de pagamento
              </label>
              {/*
                Opção B (VBR-480, 11/08/2026): a picklist é restrita aos códigos
                com contagem de dias DETERMINÍSTICA via `deriveDaysFromSapCode`.
                `Z030`, `ZB30`, `ZG30` e `ZR30` são todos "30 dias" com encargos
                diferentes — todos entram na allowlist porque o número de dias
                É derivável. Excluídos: `ZM*` (prazo múltiplo), `ZV*`/`ZX*`
                (vencimento em dia do mês), `Y*` e outros padrões calendários.
                O número derivado alimenta margem/ARP; o código vai para
                `QuoteLineItem.Prazo_De_Pagamento__c`. O campo manual de dias
                foi removido — a derivação é sempre automática.
              */}
              <PicklistSelect
                id="pm-prazo-sap"
                field={PicklistField.ProductLinePrazoPagamento}
                data-testid="pm-prazo-pagamento"
                disabled={isSaving}
                value={form.prazoPagamento}
                onChange={(prazoPagamento) =>
                  setForm((f) => ({ ...f, prazoPagamento }))
                }
                filter={(code) => deriveDaysFromSapCode(code) !== null}
                placeholder="Selecione…"
              />
              {/*
                ⚠️ **Nenhuma mensagem sob este select** — decisão do negócio em
                27/08/2026 ("remova qualquer mensagem dessas nesse select").
                Saíram as três frases de lacuna da sondagem ("O SAP não publicou
                prazo de pagamento…", "Selecione o incoterms…", "A simulação de
                preço não foi disparada…"), a de carregamento e o explicador
                genérico ("Código SAP enviado ao Salesforce; dias alimentam
                margem e ARP").

                A sondagem continua rodando e pré-preenchendo o campo — ela só
                deixou de NARRAR o que fez. Quando não resolve, o campo em
                "Selecione…" já pede a resposta; o diagnóstico do porquê fica no
                log do backend, com o `correlationId` que localiza o envelope cru
                em `price_simulation_callbacks`.

                O que fica é a leitura do valor ESCOLHIDO — dias derivados do
                código, que alimentam margem e ARP. Não é orientação: é o que o
                código selecionado significa.
              */}
              {form.prazoPagamento ? (
                <p
                  className="mt-1 text-[12px] text-(--color-text-muted)"
                  data-testid="pm-prazo-dias-derivados"
                >
                  {deriveDaysFromSapCode(form.prazoPagamento) !== null
                    ? `${deriveDaysFromSapCode(form.prazoPagamento)} dias (derivado do código SAP)`
                    : "Código sem contagem única — selecione outro."}
                </p>
              ) : null}
            </div>
          </div>

          {validationError && (
            <p
              role="alert"
              data-testid="pm-validation-error"
              className="mt-3 rounded-[var(--radius-xs)] bg-(--color-danger-bg) px-3 py-2 text-[13px] text-(--color-danger)"
            >
              {validationError}
            </p>
          )}

          {saveStatus === "error-window" && (
            <p
              role="alert"
              data-testid="pm-window-error"
              className="mt-3 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-[13px] text-(--red-700)"
            >
              ⚠ {saveErrorMessage}
            </p>
          )}

          {saveStatus === "error-eligibility" && (
            <p
              role="alert"
              className="mt-3 rounded-[var(--radius-xs)] bg-(--color-danger-bg) px-3 py-2 text-[13px] text-(--color-danger)"
            >
              {saveErrorMessage}
            </p>
          )}

          {(saveStatus === "error-unavailable" ||
            saveStatus === "error-generic") && (
            <p
              role="alert"
              className="mt-3 rounded-[var(--radius-xs)] bg-(--color-danger-bg) px-3 py-2 text-[13px] text-(--color-danger)"
            >
              {saveErrorMessage}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-[var(--radius-xxs)] border border-(--color-border) px-4 py-2 text-[13px] font-bold text-(--color-text) transition hover:bg-(--neutral-40) disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              // Janela vazia ⇒ não existe submissão válida; manter o botão ativo
              // só devolveria o mesmo erro a cada clique.
              disabled={isSaving || janelaVazia}
              title={
                janelaVazia
                  ? "Corrija a data fim da análise da proposta para habilitar."
                  : undefined
              }
              className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Salvando…" : editing ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProductLinesBlock({
  proposalId,
  opportunityId,
  list = defaultListLines,
  listEligible = defaultListEligible,
  create = defaultCreate,
  update = defaultUpdate,
  remove = defaultDelete,
  proposalSummary,
  getProposal = defaultGetProposal,
  listSupplyCenters = defaultListSupplyCenters,
  probeCommercialTerms = defaultProbeCommercialTerms,
  resolveProductDefaults = defaultResolveProductDefaults,
  onLinesChanged,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  /** Confirmação das ações destrutivas desta tela. */
  const confirm = useConfirm();
  /** Escolha da área de venda quando a oportunidade não tem uma (ADO 67913). */
  const [areaVendaModalOpen, setAreaVendaModalOpen] = useState(false);
  /** Faz o seletor de produto refazer a busca depois que a área é definida. */
  const [areaVendaSignal, setAreaVendaSignal] = useState(0);
  /** Código SAP do cliente — chave do prefill de áreas (ADO 67913). */
  const [postoRef, setPostoRef] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [lines, setLines] = useState<ProductLine[]>([]);
  // Janela da análise da proposta (`dataInicioAnalise`/`dataFimAnalise`) — os
  // dois limites das datas de consumo (RN-F5-04 / US 67601). Mantidos separados
  // da carga das linhas: a ausência deles nunca pode bloquear o bloco.
  const [minConsumo, setMinConsumo] = useState<string | null>(null);
  const [maxConsumo, setMaxConsumo] = useState<string | null>(null);
  // Client's default supply center code (VBR-481 / VBR-482): pre-selects the
  // "Base" field in the add-product modal (creation only). Absent when the
  // backend hasn't provided the field yet — degrades to "Selecione…" (CA-3).
  const [clientSupplyCenterCode, setClientSupplyCenterCode] = useState<
    string | null
  >(null);
  // Bug 67530: incoterm e prazo padrão do cliente/NEG ativa — pré-selecionam
  // os campos "Incoterms" e "Prazo de pagamento" no modal de criação.
  // null até que o campo Salesforce seja confirmado via sonda.
  const [clientIncotermPadrao, setClientIncotermPadrao] = useState<
    string | null
  >(null);
  const [clientPrazoPagamentoPadrao, setClientPrazoPagamentoPadrao] = useState<
    string | null
  >(null);
  const [modalLine, setModalLine] = useState<ProductLine | null | undefined>(
    undefined,
  ); // undefined = closed
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [busyLineId, setBusyLineId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Incremented on each fetchLines call; lets in-flight .then callbacks
  // detect that a newer fetch has superseded them (e.g. proposalId changed
  // while the component stayed mounted).
  const fetchGenRef = useRef(0);

  const fetchLines = useCallback(() => {
    setLoadStatus("loading");
    const gen = ++fetchGenRef.current;

    withOneRetry(() => list(proposalId))
      .then((result) => {
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setLines(result);
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
  }, [proposalId, list]);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  // Resolve proposal-level fields used by the modal. Non-blocking: any failure
  // just leaves the values unset — the backend still enforces invariants.
  //
  // - `dataInicioAnalise`/`dataFimAnalise` → limites das datas de consumo (RN-F5-04)
  // - `supplyCenterCode` → `clientSupplyCenterCode` (VBR-481/VBR-482: pre-select
  //   "Base" for new product lines; absent field degrades to "Selecione…")
  // - `incotermPadrao` → `clientIncotermPadrao` (Bug 67530: pre-select Incoterms)
  // - `prazoPagamentoPadrao` → `clientPrazoPagamentoPadrao` (Bug 67530: pre-select Prazo)
  //
  // CA-5 (VBR-548): when `proposalSummary` is provided by the parent
  // (ProposalDetailPanel), use it directly — no additional fetch needed.
  useEffect(() => {
    if (proposalSummary !== undefined) {
      setMinConsumo(proposalSummary?.dataInicioAnalise ?? null);
      setMaxConsumo(proposalSummary?.dataFimAnalise ?? null);
      setPostoRef(proposalSummary?.postoRef ?? null);
      setClientSupplyCenterCode(proposalSummary?.supplyCenterCode ?? null);
      setClientIncotermPadrao(proposalSummary?.incotermPadrao ?? null);
      setClientPrazoPagamentoPadrao(
        proposalSummary?.prazoPagamentoPadrao ?? null,
      );
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const proposal = await getProposal(proposalId);
        if (!cancelled && mountedRef.current) {
          setMinConsumo(proposal.dataInicioAnalise ?? null);
          setMaxConsumo(proposal.dataFimAnalise ?? null);
          // ADO 67913 — sem isto o CTA de escolher a área RENDERIZA e não abre
          // nada: o modal exige o `postoRef` (chave do prefill de áreas), e
          // este ramo é o que a tela da proposta usa.
          setPostoRef(proposal.postoRef ?? null);
          setClientSupplyCenterCode(proposal.supplyCenterCode ?? null);
          setClientIncotermPadrao(proposal.incotermPadrao ?? null);
          setClientPrazoPagamentoPadrao(proposal.prazoPagamentoPadrao ?? null);
        }
      } catch {
        /* degrade: no client-side upper bound or supply-center default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId, proposalSummary, getProposal]);

  /**
   * Valor com que "Início consumo" abre numa linha NOVA (ADO 67795): o 1º dia
   * do mês seguinte, elevado ao início da análise quando esta começa depois —
   * o mesmo default que o backend aplica a quem não manda o campo.
   */
  const defaultInicioConsumo = resolveDefaultInicioConsumo(
    new Date(),
    minConsumo,
  );

  const handleSubmit = useCallback(
    async (input: UpsertProductLineInput) => {
      setSaveStatus("saving");
      setSaveErrorMessage("");

      try {
        const saved =
          modalLine && modalLine.id
            ? await update(proposalId, modalLine.id, input)
            : await create(proposalId, input);

        if (!mountedRef.current) return;

        setLines((prev) => {
          const exists = prev.some((l) => l.id === saved.id);
          return exists
            ? prev.map((l) => (l.id === saved.id ? saved : l))
            : [...prev, saved];
        });
        setSaveStatus("idle");
        setModalLine(undefined);
        // Notify sibling panels (e.g. ProposalAutoCalcBlock) to revalidate (CA-2 VBR-536).
        onLinesChanged?.();
      } catch (err) {
        if (!mountedRef.current) return;

        if (err instanceof ProductNotEligibleError) {
          setSaveStatus("error-eligibility");
          setSaveErrorMessage(err.message);
          return;
        }
        // Field-level 400 (picklist/volume/date): surface the backend's own
        // message — this is NOT an eligibility refusal.
        if (err instanceof ProductLineValidationError) {
          setSaveStatus("error-generic");
          setSaveErrorMessage(err.message);
          return;
        }
        if (err instanceof ConsumptionWindowError) {
          setSaveStatus("error-window");
          setSaveErrorMessage(err.message);
          return;
        }
        if (err instanceof PricingReferenceUnavailableError) {
          setSaveStatus("error-unavailable");
          setSaveErrorMessage(err.message);
          return;
        }
        setSaveStatus("error-generic");
        setSaveErrorMessage("Falha ao salvar o produto. Tente novamente.");
      }
    },
    [proposalId, modalLine, create, update, onLinesChanged],
  );

  /*
   * A rejeição NÃO é capturada aqui — de propósito (ADO 67796).
   *
   * Ela sobe para o `onConfirm` do `useConfirm`, que mantém o diálogo aberto e
   * renderiza a frase DENTRO dele (a mesma decisão do ADO 67595, e a mesma
   * forma do `handleRemove` da garantia indicada e do `handleDelete` do recurso
   * financeiro). O `catch {}` vazio que estava aqui apostava que "a tela já
   * mostra a falha", e não mostrava: o diálogo fechava como se tivesse dado
   * certo, a linha continuava na tabela e nada explicava o motivo — que é
   * exatamente o defeito relatado ("apresenta a mensagem conforme esperado, mas
   * não exclui de fato o produto").
   *
   * O `finally` continua liberando `busyLineId` para o botão sair de
   * "Removendo…" e a segunda tentativa não ser engolida pela guarda de topo.
   */
  const handleDelete = useCallback(
    async (line: ProductLine) => {
      if (busyLineId) return;
      setBusyLineId(line.id);
      try {
        await remove(proposalId, line.id);
        if (!mountedRef.current) return;
        setLines((prev) => prev.filter((l) => l.id !== line.id));
        // Notify sibling panels to revalidate (CA-2 VBR-536).
        onLinesChanged?.();
      } finally {
        if (mountedRef.current) setBusyLineId(null);
      }
    },
    [proposalId, remove, busyLineId, onLinesChanged],
  );

  function openEditModal(line: ProductLine) {
    setSaveStatus("idle");
    setSaveErrorMessage("");
    setModalLine(line);
  }

  function closeModal() {
    setModalLine(undefined);
    setSaveStatus("idle");
    setSaveErrorMessage("");
  }

  const isEmpty = loadStatus === "loaded" && lines.length === 0;
  const isFilled = loadStatus === "loaded" && lines.length > 0;

  // Prototype: every `.block` card collapses from its own header (ciclo1.js
  // `initCollapse`), starting expanded.
  const collapse = useCardCollapse();
  return (
    <section
      aria-labelledby="product-lines-title"
      {...collapse.sectionProps}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      {confirm.dialog}
      <div {...collapse.headProps} className="mb-3 flex items-center gap-2.5">
        <h3 id="product-lines-title" className="text-(length:--t-h4) font-bold">
          Produtos e simulação comercial
        </h3>
        <BlocoAjusteAction bloco={BlocoProposta.Produtos} />
        <CardCollapseToggle {...collapse.toggleProps} />
      </div>

      {/* Loading state */}
      {loadStatus === "loading" && (
        <div
          role="status"
          aria-label="Carregando produtos…"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="product-lines-loading"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando…
        </div>
      )}

      {/* Error state */}
      {loadStatus === "error" && (
        <div
          role="alert"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          data-testid="product-lines-error"
        >
          Falha ao carregar os produtos da proposta. Verifique sua conexão e
          tente novamente.
          <button
            type="button"
            onClick={fetchLines}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div
          className="mb-3 rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="product-lines-empty"
        >
          Nenhum produto adicionado ainda.
        </div>
      )}

      {/*
        ADO 68235 — o aviso de maturação. Vem ANTES da tabela porque ele explica
        um número que está nela: sem isso, o "Volume (m³/mês)" de regime ao lado
        de um volume total 16 % menor no card de cálculos se lê como defeito.

        `role="note"` e não `alert`: nada falhou, e a regra foi aplicada com
        sucesso. O veredito é do backend (`maturacaoAplicada`, gravado na linha);
        a tela não reavalia a situação do posto.
      */}
      {isFilled && temMaturacaoAplicada(lines) && (
        <p
          role="note"
          className="mb-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3 py-2 text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="product-lines-maturacao"
        >
          {AVISO_MATURACAO}
        </p>
      )}

      {/* Filled state — table */}
      {isFilled && (
        <div className="overflow-x-auto" data-testid="product-lines-table">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-(--color-text-muted)">
                <th className="py-2 pr-2 font-bold">Produto · cód.</th>
                <th className="py-2 pr-2 font-bold">Base</th>
                <th className="py-2 pr-2 font-bold">Volume (m³/mês)</th>
                <th className="py-2 pr-2 font-bold">Margem BP</th>
                <th className="py-2 pr-2 font-bold">Margem realizada</th>
                <th className="py-2 pr-2 font-bold">Margem proposta</th>
                <th className="py-2 pr-2 font-bold">CPV</th>
                <th className="py-2 pr-2 font-bold">Preço final</th>
                <th className="py-2 pr-2 font-bold">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-(--color-border)"
                  data-testid="product-line-row"
                >
                  <td className="py-2 pr-2">
                    {line.produtoNome} · {line.produtoCodigo}
                  </td>
                  <td className="py-2 pr-2">{line.base}</td>
                  <td className="py-2 pr-2">{formatVolume(line.volume)}</td>
                  <td className="py-2 pr-2">{formatMoney(line.margemBp)}</td>
                  <td className="py-2 pr-2">
                    {formatMoney(line.margemSugerida)}
                  </td>
                  <td className="py-2 pr-2">
                    {formatMoney(line.margemProposta)}
                  </td>
                  <td className="py-2 pr-2">{formatMoney(line.cpv)}</td>
                  <td className="py-2 pr-2 font-bold">
                    {formatMoney(line.precoFinal)}
                  </td>
                  <td className="py-2 pr-2">
                    {canWrite && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(line)}
                          /* Prototype `.lnk-edit` (03-proposta-nova.html:CSS): GREEN
                           outline + green label on white, 5px/12px, 14px bold —
                           not the neutral grey box this rendered before (it read
                           as a disabled control next to a red-bordered
                           "Remover"). */
                          className="rounded-(--radius-xxs) border border-(--secondary-600) bg-white px-3 py-[5px] text-(length:--t-caption) font-bold text-(--secondary-600) hover:bg-(--neutral-40)"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={busyLineId === line.id}
                          onClick={() =>
                            confirm.ask({
                              title: "Excluir linha de produto?",
                              description: `${line.produtoNome ?? line.produtoCodigo} sai da proposta e os indicadores precisam ser recalculados.`,
                              confirmLabel: "Excluir",
                              tone: "danger",
                              onConfirm: () => handleDelete(line),
                            })
                          }
                          /* Prototype `.lnk-del`: a red TEXT action — no border, no
                           background, underline on hover. Boxing it gave a
                           destructive action the same weight as the edit. */
                          className="border-0 bg-transparent px-1.5 py-[5px] text-(length:--t-caption) font-bold text-(--red-700) hover:underline disabled:opacity-50"
                        >
                          {busyLineId === line.id ? "Removendo…" : "Remover"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Write control: hidden for a read-only profile (the API answers 403). */}
      {loadStatus === "loaded" && canWrite && (
        <div className="mt-4">
          <ProductBatchTable
            proposalId={proposalId}
            savedLines={lines}
            minConsumo={minConsumo}
            maxConsumo={maxConsumo}
            listEligible={listEligible}
            onSaved={(created) => {
              setLines((prev) => [...prev, ...created]);
              // Notify sibling panels to revalidate (CA-2 VBR-536).
              onLinesChanged?.();
            }}
          />
        </div>
      )}

      {modalLine !== undefined && (
        <ProductModal
          proposalId={proposalId}
          editing={modalLine}
          listEligible={listEligible}
          listSupplyCenters={listSupplyCenters}
          clientSupplyCenterCode={clientSupplyCenterCode}
          clientIncotermPadrao={clientIncotermPadrao}
          clientPrazoPagamentoPadrao={clientPrazoPagamentoPadrao}
          probeCommercialTerms={probeCommercialTerms}
          resolveProductDefaults={resolveProductDefaults}
          onClose={closeModal}
          onSubmit={(input) => void handleSubmit(input)}
          saveStatus={saveStatus}
          saveErrorMessage={saveErrorMessage}
          onClearSaveError={() => {
            setSaveStatus("idle");
            setSaveErrorMessage("");
          }}
          minConsumo={minConsumo}
          maxConsumo={maxConsumo}
          defaultInicioConsumo={defaultInicioConsumo}
          /*
           * Exige `postoRef` além do `opportunityId`: o modal o usa como
           * chave do prefill de áreas, e sem ele o CTA renderizava e não
           * abria nada — controle morto, que é justamente o que a ausência do
           * CTA (com a frase sozinha) existe para evitar.
           */
          onEscolherAreaVenda={
            opportunityId && postoRef
              ? () => setAreaVendaModalOpen(true)
              : undefined
          }
          areaVendaSignal={areaVendaSignal}
        />
      )}

      {areaVendaModalOpen && opportunityId && postoRef && (
        <SalesAreaModal
          postoRef={postoRef}
          onClose={() => setAreaVendaModalOpen(false)}
          onConfirm={async (code) => {
            await definirAreaVendaOportunidade(opportunityId, code);
            setAreaVendaModalOpen(false);
            // Refaz a busca: a lista estava recusada por falta de área, e sem
            // o sinal o seletor continuaria mostrando a recusa já resolvida.
            setAreaVendaSignal((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}
