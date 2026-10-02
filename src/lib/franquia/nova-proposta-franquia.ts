/**
 * Draft model for the franchise proposal CREATION screen
 * (`03-proposta-franquia.html` — "Nova proposta de franquia").
 *
 * ## Why a draft exists at all
 *
 * The prototype lets the user fill five cards through modals and only then press
 * "Concluir". Every persistence endpoint of the franchise domain, however, is
 * addressed **by proposal id** (`.../franquia/:proposalId/...`), which does not
 * exist until `POST .../franquia` runs. So the screen holds the answers locally
 * (the prototype's `ST`/`EXC` objects) and {@link aplicarRascunhoFranquia}
 * replays them against the real API right after the proposal is created.
 *
 * ## Partial failure is reported, never swallowed
 *
 * The creation itself is the only step that can abort the flow: if it fails
 * there is nothing to attach the rest to. Once the proposal exists, each block
 * is applied independently and a failure is **collected by name** instead of
 * rolling anything back — the proposal is real at that point, and the user lands
 * on the proposal screen where the very same fields can be corrected. Silently
 * discarding a block would leave the screen claiming data that was never saved.
 *
 * Money crosses this module as the pt-BR masked string the inputs produce and is
 * parsed with `parseMoneyInput`, which answers `null` for an untouched field —
 * so an unanswered amount is never persisted as `0`.
 */

import { failureReason } from '@/lib/api-errors';
import { Finalidade } from '@/lib/picklists/salesforce-values';

import type { ModeloNegocio, SituacaoLoja } from './types';
import { BandeiraFranquia, FormatoLoja, ModeloRoyalty } from './types';
import { parseMoneyInput } from './format';
import {
  snapToFirstDayOfMonth,
  snapToLastDayOfMonth,
} from '@/lib/proposals/proposal-date-validation';

// ---------------------------------------------------------------------------
// "Tipo de implantação" domain (prototype `#dm-impl`)
// ---------------------------------------------------------------------------

/**
 * Royalty models in the order the prototype's `#mm-modelo` lists them, with
 * "Por categoria" first — which is also the option that select opens on.
 *
 * `MODELO_ROYALTY_LABEL` is a lookup map: its insertion order starts at
 * `VALOR_FIXO`, so rendering options straight from it put "Valor fixo" at the
 * top and the default last. The display order is stated here instead of being
 * inherited from a map that exists for another purpose.
 */
export const MODELO_ROYALTY_ORDEM_PROTOTIPO: ModeloRoyalty[] = [
  ModeloRoyalty.PorCategoria,
  ModeloRoyalty.PercentualUnico,
  ModeloRoyalty.PercentualEscalonado,
  ModeloRoyalty.ValorFixo,
];

/**
 * Formatos de loja cuja política de royalty é FIXA em `PERCENTUAL_UNICO`
 * (decisão de negócio, 28/08/2026). Espelha `FORMATOS_SO_PERCENTUAL_UNICO` no
 * backend, que é a autoridade.
 */
const FORMATOS_SO_PERCENTUAL_UNICO: readonly FormatoLoja[] = [
  FormatoLoja.Ponto,
  FormatoLoja.SuperCompacta,
];

/**
 * Royalty models the band AND the store format actually accept.
 *
 * Duas regras, nesta ordem:
 *
 *  1. **Lubrax+ takes `PERCENTUAL_FIXO` and nothing else (22/09/2026 — it was
 *     `VALOR_FIXO`)** — `PUT .../modelo-loja` answers 400 for any other choice.
 *     The percentage and the monthly minimum follow the business model and are
 *     applied by the backend; the screen never repeats those numbers.
 *  2. **`PONTO`/`SUPER_COMPACTA` take `PERCENTUAL_UNICO` and nothing else** —
 *     `PUT .../modelo-loja` answers 400 for the other three. Os dois formatos
 *     enxutos da BR Mania já eram tratados como um patamar único pelo negócio
 *     (3 % de royalty / 1 % de fundo de marketing em toda política percentual,
 *     migration `…117`).
 *
 * O formato ainda não respondido (`''`) não estreita nada: sem chave não há
 * regra a aplicar, e esconder política por leitura incompleta ofereceria menos
 * do que a API aceita. Quem escolhe o formato depois vê a lista estreitar.
 *
 * The prototype's `#mm-modelo` lists the four regardless of `?t=` because a
 * static page has no API to refuse them; offering all four here let the user
 * pick a model the backend rejects only at the end of the creation flow, on a
 * card whose fee it then failed to save.
 *
 * Same shape as the recorte that already governs "Teto máximo"
 * ({@link bandeiraTemTeto} / {@link excecaoTiposParaBandeira}) e o formato de
 * loja ({@link formatosLojaParaBandeira}): the screen narrows what it offers,
 * the backend stays the authority.
 */
export function modelosRoyaltyParaFormato(
  bandeira: BandeiraFranquia,
  formatoLoja: '' | FormatoLoja,
): ModeloRoyalty[] {
  if (bandeira === BandeiraFranquia.LubraxMais) return [ModeloRoyalty.PercentualFixo];
  if (
    formatoLoja !== '' &&
    FORMATOS_SO_PERCENTUAL_UNICO.includes(formatoLoja)
  ) {
    return [ModeloRoyalty.PercentualUnico];
  }
  return MODELO_ROYALTY_ORDEM_PROTOTIPO;
}

/**
 * O modelo de royalty que a bandeira IMPÕE — e que a tela, portanto, não deixa
 * alterar. `null` quando há escolha.
 *
 * Só a Lubrax+ (22/09/2026): *"o campo 'Modelo de Royalty' deverá vir
 * preenchido com 'Percentual Fixo' e sem possibilidade de alteração"*. Por isso
 * o modal SUBSTITUI um modelo gravado antes da regra (o `VALOR_FIXO` de toda
 * Lubrax+ anterior) em vez de preservá-lo como faz no recorte por formato —
 * aqui não há escolha que o usuário pudesse fazer para consertá-lo.
 */
export function modeloRoyaltyImpostoPelaBandeira(
  bandeira: BandeiraFranquia,
): ModeloRoyalty | null {
  return bandeira === BandeiraFranquia.LubraxMais ? ModeloRoyalty.PercentualFixo : null;
}

/**
 * Store formats the band actually accepts (ADO 67592).
 *
 * **Lubrax+ takes `PADRAO` and nothing else** — `PUT .../modelo-loja` answers
 * 400 for `PONTO`/`SUPER_COMPACTA` on a ZLUB proposal. Mirrors
 * `formatosLojaParaBandeira` on the backend, which is the authority; the screen
 * only narrows what it offers, so the user never picks a format the save
 * refuses at the end of the creation flow.
 *
 * Same band recorte already applied to the royalty model
 * ({@link modelosRoyaltyParaFormato}) and to "Teto máximo"
 * ({@link excecaoTiposParaBandeira}).
 *
 * ⚠️ Nothing is removed from {@link FormatoLoja} or from the J10 Anexo A
 * catalogue screen: the other two formats are valid for BR Mania, and a Lubrax+
 * proposal already saved with `PONTO` has to keep rendering "Ponto" rather than
 * degrading to the placeholder — `isKnown` × `isSelectable`, the same split the
 * picklist catalogue uses.
 */
export const FORMATOS_LOJA_ORDEM: readonly FormatoLoja[] = [
  FormatoLoja.Padrao,
  FormatoLoja.Ponto,
  FormatoLoja.SuperCompacta,
];

export function formatosLojaParaBandeira(
  bandeira: BandeiraFranquia,
): FormatoLoja[] {
  return bandeira === BandeiraFranquia.LubraxMais
    ? [FormatoLoja.Padrao]
    : [...FORMATOS_LOJA_ORDEM];
}

/**
 * The store format a freshly opened modal starts on.
 *
 * With a single accepted format (Lubrax+) the field is born selected: there is
 * no ambiguity for the "a picklist value never starts chosen" rule to protect
 * against, and leaving it on the placeholder would demand a click that has only
 * one possible outcome. With more than one, it stays empty.
 */
export function formatoLojaPadraoDaBandeira(
  bandeira: BandeiraFranquia,
): FormatoLoja | '' {
  const formatos = formatosLojaParaBandeira(bandeira);
  return formatos.length === 1 ? formatos[0] : '';
}

/**
 * The royalty model a freshly opened modal starts on — and the one it falls back
 * to when a change of store format makes the current choice inadmissible.
 *
 * The prototype's select opens on "Por categoria" (it carries no placeholder
 * option) — which is a legitimate default for BR Mania on `PADRAO`, an invalid
 * one for Lubrax+ (only `PERCENTUAL_FIXO`, 22/09/2026) and an invalid one for
 * `PONTO`/`SUPER_COMPACTA` (only `PERCENTUAL_UNICO`, 28/08/2026). Sempre o
 * primeiro da lista que {@link modelosRoyaltyParaFormato} aceita, nunca um
 * literal — um segundo default aqui divergiria da oferta.
 */
export function modeloRoyaltyPadraoDoFormato(
  bandeira: BandeiraFranquia,
  formatoLoja: '' | FormatoLoja,
): ModeloRoyalty {
  return modelosRoyaltyParaFormato(bandeira, formatoLoja)[0];
}

/**
 * The `Finalidade_Cotacao__c` values the API accepts for a franchise proposal.
 *
 * Mirrors `finalidadesParaBandeira` on the backend, which is the authority — the
 * screen only narrows what it offers. Two per band, and the intersection is what
 * makes it two: the active `Finalidade_BR_Mania` / `Finalidade_Lubrax` validation
 * rules restrict the purpose to the band's family, while the field's
 * `valueSettings` publish only `- Implantação` and `- Renovação` under the `PCR`
 * controller — and the franchise Quote is a PCR.
 *
 * Until 14/08/2026 the screen inherited the POSTO's purpose verbatim
 * (`Implantação`/`Vinculação`), which is exactly the combination the org refuses
 * once the contract type is `BR Mania`/`Lubrax +`.
 */
export function finalidadesFranquiaParaBandeira(
  bandeira: BandeiraFranquia,
): readonly Finalidade[] {
  return bandeira === BandeiraFranquia.BrMania
    ? [Finalidade.BrManiaImplantacao, Finalidade.BrManiaRenovacao]
    : [Finalidade.LubraxMaisImplantacao, Finalidade.LubraxMaisRenovacao];
}

/*
 * `finalidadeFranquiaDerivada` foi REMOVIDA em 26/08/2026, junto com
 * `narrowFinalidade`.
 *
 * A finalidade da franquia é **escolhida nos dados cadastrais**, não derivada da
 * oportunidade nem da proposta de posto (decisão de produto). As duas funções
 * existiam só para aquela herança, e mantê-las exportadas seria deixar à mão a
 * peça que religa a regra revogada — o mesmo motivo pelo qual
 * `GarantiaExistenteDirectory.buscar` saiu quando perdeu o consumidor.
 *
 * O que sobrevive é `finalidadesFranquiaParaBandeira`, que continua sendo o
 * recorte do que pode ser ESCOLHIDO (as duas da bandeira) e espelha o
 * `finalidadesParaBandeira` do backend.
 */

/**
 * The five options the prototype's `#dm-impl` select offers.
 *
 * Free string on the wire — PRD F1 marks every attribute of this field as
 * "❓ a validar", so the backend column stays TEXT and remains the authority.
 * The screen still offers a closed list rather than a text box: that is what the
 * prototype shows, and it keeps the answer comparable between proposals instead
 * of collecting five spellings of "greenfield".
 */
export const TIPO_IMPLANTACAO_OPCOES = [
  'Greenfield loja',
  'Greenfield pista e loja',
  'Bandeira branca em operação',
  'Bandeira branca paralisada',
  'Imóvel construído',
] as const;

// ---------------------------------------------------------------------------
// Anexo A band applied to the registered model
// ---------------------------------------------------------------------------

/**
 * The catalog row shape this module needs, declared structurally so `lib/franquia`
 * does not depend on the J10 admin module — `CatalogoRoyalty` is assignable.
 */
export interface FaixaCatalogo {
  politica: string;
  formatoLoja: string;
  registroSequencial: number;
  /** Limites da faixa de faturamento (BRL). `null` = política sem faixa. */
  inicioFaixaFaturamento: string | null;
  fimFaixaFaturamento: string | null;
  /** Decimal ratios (`"0.050000"` = 5%). */
  percRoyalty: string | null;
  percRoyaltyTabaco: string | null;
  percFundoDeMkt: string | null;
  percFundoDeMktTabaco: string | null;
  valorFixoRoyalty: string | null;
  valorFixoFundoMkt: string | null;
}

/**
 * Anexo A bands that apply to the registered model.
 *
 * The catalog key is exactly `(política × formato de loja)` — the same one the
 * backend uses in `PUT .../modelo-loja` — so filtering by it here shows the
 * percentuais that will actually be applied, instead of the four hardcoded rows
 * the prototype paints (its `#royBody` is demo data: the real catalog has no
 * categoria/subcategoria/artigo at all).
 *
 * The business model is NOT part of the key (Vibra, 13/08/2026 — backend
 * migration `…074`).
 *
 * Returns `[]` for an incomplete model: with no key there is nothing to look up.
 */
export function selecionarFaixasDoCatalogo(
  itens: readonly FaixaCatalogo[],
  modelo: ModeloRascunho,
): FaixaCatalogo[] {
  if (!modeloLojaCompleto(modelo)) return [];
  return itens
    .filter(
      (item) =>
        item.politica === modelo.modeloRoyalty &&
        item.formatoLoja === modelo.formatoLoja,
    )
    .sort((a, b) => a.registroSequencial - b.registroSequencial);
}

/**
 * `true` when the royalty table sub-block applies.
 *
 * ⚠️ **Divergência deliberada do protótipo, decidida em 26/08/2026 (ADO 67572).**
 * O `renderMod()` de `03-proposta-franquia.html` faz
 * `royTableWrap.style.display = (m.modelo === 'Percentual escalonado') ? 'none' : ''`,
 * e esta função reproduzia isso — escondendo a tabela para a política cuja
 * tabela o negócio publicou e pediu em tela. Era esse o "Não consta em tela" da
 * reabertura: na tela de criação, o bloco inteiro não renderizava.
 *
 * O protótipo escondia porque era página estática, com um `ESCAL` de quatro
 * faixas no script e nenhuma tabela para paginar. Aqui as faixas vêm do catálogo
 * e são renderizadas todas, sem nenhuma marcada — a proposta ainda não existe,
 * então não há faturamento que resolva a aplicável.
 */
export function exibeTabelaDeRoyalties(modelo: ModeloRascunho): boolean {
  // `PERCENTUAL_FIXO` (Lubrax+, 22/09/2026) não tem tabela no Anexo A: a
  // política vem do modelo de negócio, e uma tabela vazia leria "sem cobrança".
  return (
    modeloLojaCompleto(modelo) &&
    modelo.modeloRoyalty !== ModeloRoyalty.PercentualFixo
  );
}

// ---------------------------------------------------------------------------
// Analysis window — inherited, never asked for
// ---------------------------------------------------------------------------

/**
 * Resolves the analysis window the franchise proposal is created with.
 *
 * The prototype's modal has no date fields because the franchise proposal is
 * *vinculada ao posto*: it inherits the window of the PCR proposal it hangs
 * from, which the head card states as a settled fact.
 *
 * ## The inherited window is CLAMPED, never copied verbatim
 *
 * The posto proposal was created earlier — often months earlier — and the org's
 * `Data_Inicio_Analise_Mes_Seguite_Criacao` measures the limit from the day the
 * **Quote is inserted**, which for this franchise is now. Copying the posto's
 * dates therefore produced a window that is already in the past and that the CRM
 * would refuse, surfacing as "a data início da análise precisa ser igual ou
 * posterior a …" on a screen that never offered a date field to fix.
 *
 * So each end is pushed forward to the server limit when the inherited value
 * falls short. The limits are never computed here — they are a function of the
 * API's clock and a local copy would disagree with the backend on the 1st of
 * every month.
 *
 * Both ends are then snapped to the month boundaries the org requires
 * (`Data_Inicio_Analise_Primeiro_Dia` / `Data_Fim_Analise_Ultimo_Dia`).
 *
 * Returns empty strings when neither source can answer: the caller then blocks
 * "Concluir" and names what is missing, instead of posting a window it invented.
 */
export function derivarJanelaAnalise(
  posto: { dataInicioAnalise?: string; dataFimAnalise?: string } | null,
  constraints: {
    minDataInicioAnalise?: string;
    minDataFimAnalise?: string;
  } | null,
): { dataInicioAnalise: string; dataFimAnalise: string } {
  // ISO `YYYY-MM-DD` compares correctly as a string.
  const maisTarde = (a: string, b: string): string => (a > b ? a : b);

  const inicio = maisTarde(
    posto?.dataInicioAnalise ?? '',
    constraints?.minDataInicioAnalise ?? '',
  );
  if (inicio === '') return { dataInicioAnalise: '', dataFimAnalise: '' };

  const inicioFinal = snapToFirstDayOfMonth(inicio);
  const fim = maisTarde(
    maisTarde(posto?.dataFimAnalise ?? '', constraints?.minDataFimAnalise ?? ''),
    inicioFinal,
  );

  return {
    dataInicioAnalise: inicioFinal,
    dataFimAnalise: snapToLastDayOfMonth(fim),
  };
}

// ---------------------------------------------------------------------------
// Exception vocabulary (prototype "Exceções Programadas" modal)
// ---------------------------------------------------------------------------

/**
 * `tipoExcecao` values accepted by `POST .../franquia/:proposalId/excecoes`.
 *
 * Declared `as const` so every comparison is against a NAMED member — the wire
 * value is a free string on the backend contract, which is exactly the shape
 * that rots silently when compared to literals.
 */
export const ExcecaoTipo = {
  Isencao: 'ISENCAO',
  BaseReal: 'BASE_REAL',
  Teto: 'TETO',
  Cessao: 'CESSAO',
} as const;

export type ExcecaoTipo = (typeof ExcecaoTipo)[keyof typeof ExcecaoTipo];

export const EXCECAO_TIPO_LABEL: Record<ExcecaoTipo, string> = {
  [ExcecaoTipo.Isencao]: 'Isenção de cobrança',
  [ExcecaoTipo.BaseReal]: 'Fixação de base real de cálculo',
  [ExcecaoTipo.Teto]: 'Teto máximo',
  [ExcecaoTipo.Cessao]: 'Cessão programada',
};

/**
 * Only "Teto máximo" carries a monetary override, so the value field is
 * conditional rather than always rendered — the prototype's `excFields()` adds
 * `#ex_val` for that type alone.
 *
 * "Fixação de base real de cálculo" does NOT take a value here (product
 * decision, 13/08/2026): the base it fixes is the proposal's own faturamento,
 * not a number typed on the exception. The wire field stays `null` for it, so
 * nothing is silently persisted as an override.
 */
export function excecaoTemValor(tipo: ExcecaoTipo): boolean {
  return tipo === ExcecaoTipo.Teto;
}

/**
 * The exception types a user may CHOOSE, in the canonical PRD order — the single
 * source for every "Tipo de exceção" selector (the exceptions block on the
 * proposal screen and the creation screen).
 *
 * ⚠️ `ExcecaoTipo.Cessao` ("Cessão programada") is deliberately absent: the
 * business asked for it to be dropped from the modal in BOTH bands (24/08/2026),
 * and `ZBRM`/`ZLUB` are the only two, so it is offered nowhere.
 *
 * It leaves the OFFER, not the vocabulary — `ExcecaoTipo.Cessao` and its entry
 * in {@link EXCECAO_TIPO_LABEL} stay. An exception already saved with that type
 * has to keep rendering "Cessão programada" instead of the raw wire value or a
 * blank; the backend also still accepts it, so nothing persisted becomes
 * unreadable or unrepairable. Same `isKnown` × `isSelectable` split the
 * Salesforce picklist catalog uses.
 *
 * To bring it back: put the member back in this list. Nothing else changes.
 */
export const EXCECAO_TIPOS_OFERECIDOS: readonly ExcecaoTipo[] = [
  ExcecaoTipo.Isencao,
  ExcecaoTipo.BaseReal,
  ExcecaoTipo.Teto,
];

/**
 * Exception types offered per band.
 *
 * Lubrax+ has no "Teto máximo" — the prototype drops it from both the exception
 * list and the limits sub-block when `?t=lubrax`. This mirrors that recorte and
 * nothing more: the backend remains the authority and still validates the value
 * it receives, so a band rule that changes there does not silently pass here.
 *
 * Derived from {@link EXCECAO_TIPOS_OFERECIDOS}, never from its own literal
 * list: a second array here is how the band filter and the unfiltered fallback
 * came to disagree about `CESSAO` before.
 */
export function excecaoTiposParaBandeira(
  bandeira: BandeiraFranquia,
): ExcecaoTipo[] {
  return EXCECAO_TIPOS_OFERECIDOS.filter(
    (tipo) =>
      !(bandeira === BandeiraFranquia.LubraxMais && tipo === ExcecaoTipo.Teto),
  );
}

/** `true` when the band exposes a "Teto máximo" limit (prototype `tetoWrap`). */
export function bandeiraTemTeto(bandeira: BandeiraFranquia): boolean {
  return bandeira !== BandeiraFranquia.LubraxMais;
}

// ---------------------------------------------------------------------------
// Draft shape
// ---------------------------------------------------------------------------

/** Tri-state answer of the prototype's Sim/Não selects (`''` = unanswered). */
export type SimNao = '' | 'sim' | 'nao';

export interface DadosFranquiaRascunho {
  /** Required by `POST .../franquia` (RN-F1-03). */
  postoProposalId: string;
  /** Required by `POST .../franquia`. */
  finalidade: '' | Finalidade;
  /** Required by `POST .../franquia` (ISO date). */
  dataInicioAnalise: string;
  /** Required by `POST .../franquia` (ISO date). */
  dataFimAnalise: string;
  situacaoLoja: '' | SituacaoLoja;
  tipoImplantacao: string;
  inicioOperacaoPrevista: string;
  /** pt-BR masked money. */
  faturamentoProposto: string;
  faturamentoDeAcordoComFap: SimNao;
  /**
   * Só a tela da PROPOSTA pergunta (`incluirPossuiExcecao` no `DadosModal`) —
   * ela é quem tem o `PATCH .../franquia/:proposalId/dados` e quem exibe a
   * resposta na grade. Na criação fica `''` e não é enviada: `POST .../franquia`
   * não a aceita, e mandar um `false` fabricado afirmaria que o negociador
   * respondeu "não".
   */
  possuiExcecaoRoyalties: SimNao;
  /** pt-BR masked money. */
  potencial: string;
  fapFile: File | null;
  fotos: File[];
}

/**
 * Os campos do rascunho que a tela DERIVA — nunca perguntados num formulário.
 *
 * `postoProposalId` é derivado da lista de propostas (RN-F1-03: a franquia
 * sempre pendura numa PCR) e a janela de análise é HERDADA da proposta de posto,
 * numa segunda leitura. As três são afirmadas como fato pelo protótipo, e
 * nenhuma delas aparece no `DadosModal`.
 */
export const CAMPOS_DERIVADOS_DA_FRANQUIA = [
  'postoProposalId',
  'dataInicioAnalise',
  'dataFimAnalise',
] as const satisfies readonly (keyof DadosFranquiaRascunho)[];

/**
 * Aplica o que o modal respondeu SEM deixá-lo sobrescrever o que a tela derivou.
 *
 * ⚠️ **É o conserto de um estado irrecuperável, não uma precaução.** O
 * `DadosModal` faz `useState(dados)` — snapshot no MOUNT, sem re-sync e sem
 * `key` — e o `onSave` devolve o rascunho INTEIRO, inclusive os campos que ele
 * nunca renderiza. A janela de análise chega numa segunda requisição
 * (`GET /v1/proposals/:postoId`, ~1,5–2,5 s no browser por causa do hairpin da
 * BFF), então quem abre o cartão no primeiro segundo e digita por dez segundos
 * salva um snapshot ANTERIOR à herança — e a substituição completa apaga a
 * janela que já havia sido derivada. O efeito da herança depende de
 * `[postoProposalId, constraints, getProposal]`, nada disso muda, e ele **não
 * roda de novo**: a janela fica vazia para sempre e todo save seguinte é
 * recusado com "a janela de análise não pôde ser herdada da proposta de posto",
 * sem nenhuma ação na tela capaz de destravar (só recarregar a página).
 *
 * Medido no stage em 27/08/2026, `OPP-2026-000043`: a BR Mania criada às
 * 13:43:18 passou (`POST .../franquia 201`) e a Lubrax+ 73 s depois, mesma
 * oportunidade e mesmas leituras (todas 200, a herança em 2 ms), ficou travada
 * sem **nenhuma** requisição — a segunda vez o usuário abriu o modal mais
 * rápido, porque já sabia onde clicar.
 *
 * O valor do modal vence em todo o resto: ele é quem pergunta.
 */
export function aplicarRespostasDoModalDeDados(
  atual: DadosFranquiaRascunho,
  doModal: DadosFranquiaRascunho,
): DadosFranquiaRascunho {
  const preservados = Object.fromEntries(
    CAMPOS_DERIVADOS_DA_FRANQUIA.map((campo) => [campo, atual[campo]]),
  ) as Pick<DadosFranquiaRascunho, (typeof CAMPOS_DERIVADOS_DA_FRANQUIA)[number]>;

  return { ...doModal, ...preservados };
}

export interface ModeloRascunho {
  /**
   * Descriptive attribute (`Rodovia`/`Urbano`), not part of the Anexo A key
   * since 13/08/2026 — but still one of the answers the backend lists as missing
   * in `pendenciasEnvio` ("Modelo de negócio não informado"), so the creation
   * screen offers it rather than shipping a proposal that cannot be sent.
   */
  modeloNegocio: '' | ModeloNegocio;
  formatoLoja: '' | FormatoLoja;
  modeloRoyalty: '' | ModeloRoyalty;
  /** pt-BR masked money. */
  taxaFranquia: string;
  /**
   * `true` while {@link taxaFranquia} still holds the value the modal pre-filled
   * from the parametrization (bandeira × formato — Bugs 67575 / 67594) and nobody
   * has typed over it.
   *
   * It exists so the replay can OMIT the fee in that case and let the backend
   * seed it: `PUT .../royalty` marks every fee it receives as answered by a
   * person, and a fee laundered into "manual" that way would stop following the
   * store format — leaving `PADRAO`'s R$ 55.000 on a proposal switched to
   * `PONTO`, whose policy says R$ 20.000. A typed fee must never be overwritten;
   * a default must never stop being one.
   */
  taxaFranquiaDoParametro: boolean;
  parcelas: string;
  /**
   * "Isenção de Taxa de Franquia?" (ADO 68495) — `''` = não respondido.
   *
   * É a marcação que o SAP/SD lê para cobrar a taxa do franqueado
   * (`Isencao_De_Taxa_De_Franquia__c` no Salesforce), e o GATE 1 recusa o envio
   * à análise enquanto ela não existir. Fica ao lado da taxa e das parcelas
   * porque é atributo delas — é assim que o org a agrupa.
   */
  isencaoTaxa: SimNao;
  maturada: SimNao;
  periodoMaturacaoMeses: string;
  /*
   * ⚠️ **Os LIMITES saíram deste rascunho (ADO 67867)** — royalty mínimo, fundo
   * de marketing mínimo, valor fixo, piso e teto. Eles eram os `.tf` do
   * protótipo, editados no cartão atrás do "Editar como time de franquia", e
   * passaram a ser parametrização por bandeira (aba de Governança). Reintroduzir
   * qualquer um deles aqui devolveria o campo aberto que gravou `1111` em
   * "Royalty mínimo (%)" na UAT — e o mapeamento antigo mandava esse patamar
   * para `percentualBps`, que é a ALÍQUOTA aplicada pelo catálogo Anexo A.
   */
}

export interface ExcecaoRascunho {
  tipo: ExcecaoTipo;
  motivo: string;
  /** "Por todo o contrato" — an OPEN-ENDED vigência, i.e. a null end date. */
  todoContrato: boolean;
  inicio: string;
  fim: string;
  /** pt-BR masked money. */
  valor: string;
}

export interface RascunhoFranquia {
  dados: DadosFranquiaRascunho;
  modelo: ModeloRascunho;
  excecoes: ExcecaoRascunho[];
  /**
   * Destinatário da COF (protótipo `#cofModal`). `''` ⇒ não respondido — o modal
   * recusa salvar em branco desde 04/09/2026, então só chega vazio quem nunca o
   * abriu. Vazio, o `PATCH` OMITE o campo (nunca manda `null`, que LIMPARIA um
   * destinatário já gravado).
   */
  cofEmail: string;
}

export const RASCUNHO_DADOS_VAZIO: DadosFranquiaRascunho = {
  postoProposalId: '',
  finalidade: '',
  dataInicioAnalise: '',
  dataFimAnalise: '',
  situacaoLoja: '',
  tipoImplantacao: '',
  inicioOperacaoPrevista: '',
  faturamentoProposto: '',
  faturamentoDeAcordoComFap: '',
  possuiExcecaoRoyalties: '',
  potencial: '',
  fapFile: null,
  fotos: [],
};

export const RASCUNHO_MODELO_VAZIO: ModeloRascunho = {
  modeloNegocio: '',
  formatoLoja: '',
  modeloRoyalty: '',
  taxaFranquia: '',
  taxaFranquiaDoParametro: false,
  parcelas: '',
  isencaoTaxa: '',
  maturada: '',
  periodoMaturacaoMeses: '',
};

/**
 * Percent as typed → basis points, the unit `PUT .../royalty` takes.
 *
 * Accepts the pt-BR comma ("3,5" → 350) and answers `null` for anything without
 * a number, so an untouched limit is never persisted as `0` — which would read
 * as a floor of zero rather than "not set".
 */
export function parsePercentToBps(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

// ---------------------------------------------------------------------------
// Predicates the screen renders from
// ---------------------------------------------------------------------------

/**
 * The four answers `POST .../franquia` cannot be created without.
 *
 * Everything else on this screen is optional at creation and can be completed on
 * the proposal screen afterwards — gating "Concluir" on a field the API does not
 * require would invent a rule the backend does not hold.
 */
export function dadosObrigatoriosCompletos(
  dados: DadosFranquiaRascunho,
): boolean {
  return (
    dados.postoProposalId !== '' &&
    dados.finalidade !== '' &&
    dados.dataInicioAnalise !== '' &&
    dados.dataFimAnalise !== ''
  );
}

/** `true` once any optional answer of the "Dados da franquia" card was given. */
export function dadosPreenchidos(dados: DadosFranquiaRascunho): boolean {
  return (
    dados.situacaoLoja !== '' ||
    dados.tipoImplantacao.trim() !== '' ||
    dados.inicioOperacaoPrevista !== '' ||
    dados.faturamentoProposto !== '' ||
    dados.faturamentoDeAcordoComFap !== '' ||
    dados.potencial !== '' ||
    dados.fapFile !== null ||
    dados.fotos.length > 0
  );
}

/** `true` once the model card carries anything worth persisting. */
export function modeloPreenchido(modelo: ModeloRascunho): boolean {
  return (
    modelo.modeloNegocio !== '' ||
    modelo.formatoLoja !== '' ||
    modelo.modeloRoyalty !== '' ||
    modelo.taxaFranquia !== '' ||
    modelo.parcelas !== '' ||
    /* ADO 68495 — sem isto, responder SÓ a isenção deixava o card dizendo
       "Nenhum modelo cadastrado ainda." com a resposta no rascunho e a caminho
       do backend: a tela negando o que o "Salvar" acabou de aceitar. */
    modelo.isencaoTaxa !== '' ||
    modelo.maturada !== '' ||
    modelo.periodoMaturacaoMeses !== ''
  );
}

/**
 * `PUT .../modelo-loja` resolves the Anexo A band from `formato de loja ×
 * modelo de royalty`, so a partial answer has no band to match and is not sent.
 *
 * The business model is not required: since the Vibra decision of 13/08/2026 it
 * does not take part in the lookup (backend migration `…074`).
 */
export function modeloLojaCompleto(modelo: ModeloRascunho): boolean {
  return modelo.formatoLoja !== '' && modelo.modeloRoyalty !== '';
}

// ---------------------------------------------------------------------------
// Replaying the draft against the real API
// ---------------------------------------------------------------------------

/** The subset of API clients {@link aplicarRascunhoFranquia} drives. */
export interface AplicarRascunhoDeps {
  updateDadosFranquia: (
    opportunityId: string,
    proposalId: string,
    payload: {
      situacaoLoja?: SituacaoLoja | null;
      tipoImplantacao?: string | null;
      inicioOperacaoPrevista?: string | null;
      faturamentoPropostoBrl?: number | null;
      faturamentoDeAcordoComFap?: boolean | null;
      cofDestinatarioEmail?: string | null;
    },
  ) => Promise<unknown>;
  setPotencial: (
    opportunityId: string,
    proposalId: string,
    potencialBrl: number,
  ) => Promise<unknown>;
  uploadFap: (
    opportunityId: string,
    proposalId: string,
    file: File,
  ) => Promise<unknown>;
  uploadPostoPhoto: (proposalId: string, file: File) => Promise<unknown>;
  setModeloLoja: (
    opportunityId: string,
    proposalId: string,
    payload: {
      modeloNegocio?: ModeloNegocio;
      formatoLoja: FormatoLoja;
      modeloRoyalty: ModeloRoyalty;
    },
  ) => Promise<unknown>;
  setRoyaltyEstrutura: (
    opportunityId: string,
    proposalId: string,
    payload: {
      valorFixoBrl?: number | null;
      taxaFranquiaBrl?: number | null;
      taxaFranquiaParcelas?: number | null;
      isencaoTaxaFranquia?: boolean | null;
      percentualBps?: number | null;
      fundoMktPercBps?: number | null;
      pisoBrl?: number | null;
      tetoBrl?: number | null;
    },
  ) => Promise<unknown>;
  setMaturacao: (
    opportunityId: string,
    proposalId: string,
    payload: { isMaturada: boolean; maturacaoMesesTotal?: number | null },
  ) => Promise<unknown>;
  createExcecao: (
    opportunityId: string,
    proposalId: string,
    payload: {
      tipoExcecao: string;
      vigenciaInicio?: string | null;
      vigenciaFim?: string | null;
      valorOverrideBrl?: number | null;
      motivo: string;
    },
  ) => Promise<unknown>;
}

export interface AplicarRascunhoResultado {
  /** pt-BR names of the blocks that could not be persisted. Empty ⇒ all saved. */
  falhas: string[];
}

/**
 * Os blocos que {@link aplicarRascunhoFranquia} sabe aplicar.
 *
 * Existe para o AUTOSAVE (UAT de 25/08/2026 — "ao preencher os campos, a
 * proposta deve ser salva automaticamente"). Sem o recorte, salvar depois de
 * fechar um modal reenviaria o rascunho inteiro, e três dos blocos são **POST**:
 * `anexos` e `excecoes` duplicariam a cada save, e o usuário veria a mesma FAP
 * três vezes sem ter feito nada.
 *
 * Os blocos são a unidade em que os CARTÕES da tela salvam, não um por endpoint:
 * `dados` carrega o destinatário da COF porque é aquele PATCH que arma o fluxo
 * (a linha da COF ainda não existe — quem a cria é o consumer), e `modelo` leva
 * estrutura e maturação porque saem do mesmo modal.
 */
export type BlocoRascunho =
  | 'dados'
  | 'potencial'
  | 'anexos'
  | 'modelo'
  | 'estrutura'
  | 'maturacao'
  | 'excecoes';

const TODOS_OS_BLOCOS: readonly BlocoRascunho[] = [
  'dados',
  'potencial',
  'anexos',
  'modelo',
  'estrutura',
  'maturacao',
  'excecoes',
];

export interface AplicarRascunhoOpcoes {
  /**
   * Quais blocos aplicar. Ausente ⇒ **todos**, que é o comportamento de sempre e
   * o que o caminho de criação em lote usa.
   */
  blocos?: readonly BlocoRascunho[];
}

/**
 * Runs one step, turning a rejection into a named failure instead of an abort.
 *
 * ⚠️ A MENSAGEM do backend viaja junto (ADO 68184). O `catch` era vazio e só
 * guardava o nome do bloco, então a sendbar dizia `não foi possível salvar: FAP`
 * — o bloco certo, sem o motivo. Quem anexava a FAP errada lia isso e não tinha
 * como saber que bastava trocar o arquivo. `Error.message` aqui é texto de
 * usuário: `throwApiError` já compôs a frase do backend.
 *
 * `failureReason` é o mesmo filtro do resto do app: exceção de RUNTIME
 * (`Failed to fetch`, `Unexpected token <`) degrada para o nome do bloco
 * sozinho, em vez de colar inglês sobre transporte numa barra que o LT lê
 * enquanto preenche formulário.
 */
async function passo(
  falhas: string[],
  nome: string,
  executar: () => Promise<unknown>,
): Promise<void> {
  try {
    await executar();
  } catch (err) {
    // Um bloco entra UMA vez, ainda que falhe N vezes (as fotos são um upload
    // por arquivo). O `new Set` do fim deduplica strings idênticas; com o motivo
    // anexado elas deixam de ser idênticas, então a colapsagem é feita aqui,
    // pelo nome — e o motivo mostrado é o da PRIMEIRA falha do bloco.
    if (falhas.some((f) => f === nome || f.startsWith(`${nome} (`))) return;
    const motivo = failureReason(err, '');
    falhas.push(motivo === '' ? nome : `${nome} (${motivo})`);
  }
}

/**
 * Applies a {@link RascunhoFranquia} to a proposal that already exists.
 *
 * Order follows the domain's own dependencies: the franchise data (which arms
 * the COF flow when `situacaoLoja = NOVA`, RN-F5-01) → potential → attachments →
 * commercial model (which makes the backend apply the Anexo A band) → structure
 * → maturação → scheduled exceptions.
 *
 * `permiteEstrutura` mirrors the API's own gate: `royalty`, `maturacao` and
 * `excecoes` are restricted to the franchise team (RN-F2-06 / HU-04b.1). Posting
 * them for a profile that lacks the permission would collect a 403 as a
 * "failure" for something the user was never offered.
 */
export async function aplicarRascunhoFranquia(
  opportunityId: string,
  proposalId: string,
  rascunho: RascunhoFranquia,
  deps: AplicarRascunhoDeps,
  opcoes: AplicarRascunhoOpcoes = {},
): Promise<AplicarRascunhoResultado> {
  const falhas: string[] = [];
  const { dados, modelo, excecoes, cofEmail } = rascunho;
  const alvo = new Set(opcoes.blocos ?? TODOS_OS_BLOCOS);
  const aplicar = (bloco: BlocoRascunho): boolean => alvo.has(bloco);

  /*
   * The COF recipient rides the "dados" PATCH: that endpoint owns the franchise
   * aggregate during composition and is what arms the COF flow via
   * `situacaoLoja = NOVA`. The COF row itself does not exist yet — it is created
   * by the consumer — so there is nothing else to patch it onto.
   *
   * The block is therefore sent when EITHER the dados card or the COF card was
   * answered; gating on `dadosPreenchidos` alone would drop a recipient typed on
   * an otherwise untouched proposal.
   */
  const cofEmailLimpo = cofEmail.trim();

  if (aplicar('dados') && (dadosPreenchidos(dados) || cofEmailLimpo !== '')) {
    await passo(falhas, 'Dados da franquia', () =>
      deps.updateDadosFranquia(opportunityId, proposalId, {
        situacaoLoja: dados.situacaoLoja === '' ? null : dados.situacaoLoja,
        tipoImplantacao:
          dados.tipoImplantacao.trim() === '' ? null : dados.tipoImplantacao.trim(),
        inicioOperacaoPrevista:
          dados.inicioOperacaoPrevista === '' ? null : dados.inicioOperacaoPrevista,
        cofDestinatarioEmail: cofEmailLimpo === '' ? undefined : cofEmailLimpo,
        faturamentoPropostoBrl: parseMoneyInput(dados.faturamentoProposto),
        faturamentoDeAcordoComFap: simNaoParaBoolean(dados.faturamentoDeAcordoComFap),
      }),
    );
  }

  const potencial = parseMoneyInput(dados.potencial);
  if (aplicar('potencial') && potencial !== null) {
    await passo(falhas, 'Potencial de franquia', () =>
      deps.setPotencial(opportunityId, proposalId, potencial),
    );
  }

  if (aplicar('anexos') && dados.fapFile !== null) {
    const file = dados.fapFile;
    await passo(falhas, 'FAP', () => deps.uploadFap(opportunityId, proposalId, file));
  }

  for (const foto of aplicar('anexos') ? dados.fotos : []) {
    await passo(falhas, 'Fotos do ponto', () =>
      deps.uploadPostoPhoto(proposalId, foto),
    );
  }

  const modeloLojaEnviado = modeloLojaCompleto(modelo);

  if (aplicar('modelo') && modeloLojaEnviado) {
    await passo(falhas, 'Modelo de loja', () =>
      deps.setModeloLoja(opportunityId, proposalId, {
        // Descriptive attribute — omitted when unanswered so the backend keeps
        // whatever was already there (it does not take part in the Anexo A key).
        ...(modelo.modeloNegocio === ''
          ? {}
          : { modeloNegocio: modelo.modeloNegocio }),
        formatoLoja: modelo.formatoLoja as FormatoLoja,
        modeloRoyalty: modelo.modeloRoyalty as ModeloRoyalty,
      }),
    );
  }

  /*
   * Taxa, parcelas and maturação are offered to whoever fills the proposal (PRD
   * F2 lists them with `Edit. = Sim`; the limits and the exceções are
   * `Sim (time franquia)`), so they are replayed unconditionally. If the backend
   * still refuses one — taxa shares an endpoint with the limits — the block is
   * NAMED as a failure rather than dropped without a word.
   */
  /*
   * A fee still holding the parametrized default is NOT sent: `setModeloLoja`
   * above seeds it server-side and records that it came from the parametrization,
   * so it keeps following the store format later. Sending it here would mark it
   * as answered by a person (Bugs 67575 / 67594) and freeze `PADRAO`'s R$ 55.000
   * onto a proposal that later becomes `PONTO`.
   *
   * Only when the modelo-loja step did NOT run — no formato, so no default could
   * have been resolved and nothing will seed — the value travels, because
   * dropping it would lose the answer outright.
   */
  const taxaEhDefaultDoParametro = modelo.taxaFranquiaDoParametro && modeloLojaEnviado;
  const taxa = taxaEhDefaultDoParametro
    ? null
    : parseMoneyInput(modelo.taxaFranquia);
  const parcelas = modelo.parcelas === '' ? null : Number(modelo.parcelas);

  /*
   * ADO 67867 — os LIMITES saíram deste replay.
   *
   * Eles eram enviados no mesmo `PUT .../royalty`, a partir dos campos abertos do
   * sub-bloco "Estrutura de royalties · limites" — e o mapeamento estava errado
   * nos dois patamares percentuais: "Royalty mínimo (%)" ia para `percentualBps`
   * e "Fundo de marketing mínimo (%)" para `fundoMktPercBps`, que são a ALÍQUOTA
   * APLICADA que o catálogo Anexo A acabou de escrever em `setModeloLoja`. Ou
   * seja, o `1111` digitado na UAT não era só um patamar absurdo: sobrescrevia a
   * alíquota do catálogo.
   *
   * Agora os seis patamares são parametrização por bandeira (aba de Governança),
   * e `setModeloLoja` semeia piso, teto e valor mínimo mensal na proposta. Este
   * passo carrega apenas taxa e parcelas, que o PRD F2 dá a quem preenche a
   * proposta.
   */

  /*
   * An unanswered field is OMITTED, never sent as `null`.
   *
   * The backend reads "informed" as `!== undefined`, and `valorFixoBrl` is one of
   * the LIMITES it reserves to the franchise team (RN-F2-06). Posting it as an
   * explicit `null` therefore made the LT's franchise fee — a field PRD F2 says
   * they own — come back 403 on every creation, naming limits the screen had kept
   * locked and empty. On this path `null` never means "erase" either: nothing was
   * persisted yet.
   */
  /*
   * ADO 68495 — `''` (não respondido) vira `null` e é filtrado fora; `false`
   * ("Não") SOBREVIVE ao filtro, e tem de sobreviver: ele é a resposta de que a
   * taxa é cobrada, e o GATE 1 distingue isso de "ninguém respondeu".
   */
  const isencaoTaxa =
    modelo.isencaoTaxa === '' ? null : modelo.isencaoTaxa === 'sim';

  const royaltyPayload = Object.fromEntries(
    Object.entries({
      taxaFranquiaBrl: taxa,
      taxaFranquiaParcelas: parcelas,
      isencaoTaxaFranquia: isencaoTaxa,
    }).filter(([, valor]) => valor !== null),
  );

  if (aplicar('estrutura') && Object.keys(royaltyPayload).length > 0) {
    /*
     * O passo é nomeado pelo que o payload de fato carrega. Desde o ADO 67867 ele
     * carrega **só** taxa e parcelas — os limites saíram —, então o rótulo deixou
     * de depender do perfil: chamá-lo "Estrutura de royalty" apontaria o usuário
     * para um campo que esta tela não tem mais.
     */
    await passo(falhas, 'Taxa de franquia', () =>
      deps.setRoyaltyEstrutura(opportunityId, proposalId, royaltyPayload),
    );
  }

  if (aplicar('maturacao') && modelo.maturada !== '') {
    const meses = parseMesesMaturacao(modelo.periodoMaturacaoMeses);
    await passo(falhas, 'Maturação', () =>
      deps.setMaturacao(opportunityId, proposalId, {
        isMaturada: modelo.maturada === 'sim',
        maturacaoMesesTotal: meses,
      }),
    );
  }

  /*
   * The scheduled exceptions are replayed unconditionally: the list is only
   * ever non-empty for a profile the creation screen let fill the card, and
   * that gate is `podeExcecao` (`Permission.FranquiaExcecaoManage`) — NOT
   * o gate dos limites, que desde o ADO 67867 não existe mais nesta tela.
   *
   * Adding any gate to this loop would be a second copy of that rule and would
   * silently DROP answers if the two ever disagreed. A block the user was
   * allowed to fill must never be discarded on the way out; a refusal comes
   * back as the NAMED step `Exceção · <tipo>` instead.
   */
  for (const excecao of aplicar('excecoes') ? excecoes : []) {
    await passo(falhas, `Exceção · ${EXCECAO_TIPO_LABEL[excecao.tipo]}`, () =>
      deps.createExcecao(opportunityId, proposalId, {
        tipoExcecao: excecao.tipo,
        vigenciaInicio: excecao.inicio === '' ? null : excecao.inicio,
        // "Por todo o contrato" is an open-ended vigência — a null end date,
        // not a separate flag the backend does not model.
        vigenciaFim:
          excecao.todoContrato || excecao.fim === '' ? null : excecao.fim,
        valorOverrideBrl: excecaoTemValor(excecao.tipo)
          ? parseMoneyInput(excecao.valor)
          : null,
        motivo: excecao.motivo.trim(),
      }),
    );
  }

  // Duplicates collapse: N failed photos are one failed block on screen.
  return { falhas: [...new Set(falhas)] };
}

/**
 * Month count out of the prototype's free-text "Período de maturação".
 *
 * The field accepts "12 meses" (its own placeholder is `ex.: 12 meses`) while
 * `PUT .../maturacao` takes an integer, so the digits are extracted here. A
 * value with no digits answers `null` and the field is simply not sent — never
 * `NaN`, which `JSON.stringify` would turn into `null` anyway but only after
 * passing every guard that tests for "informed".
 */
export function parseMesesMaturacao(value: string): number | null {
  const digits = value.match(/\d+/);
  if (digits === null) return null;
  const parsed = Number.parseInt(digits[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `''` stays `null`: an unanswered question must not be recorded as "Não". */
export function simNaoParaBoolean(value: SimNao): boolean | null {
  if (value === 'sim') return true;
  if (value === 'nao') return false;
  return null;
}

/** `null`/`undefined` stays absent so the caller renders an em dash. */
export function simNaoLabel(value: SimNao): string | null {
  if (value === 'sim') return 'Sim';
  if (value === 'nao') return 'Não';
  return null;
}

/** Estado do autosave da tela de criação (o rótulo do rodapé lê o mesmo). */
export type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'falhou';

/**
 * O que a grade escreve ao lado de um anexo que AINDA não está no servidor.
 *
 * O rótulo era `salvando…` fixo, derivado só de "existe arquivo no rascunho e
 * não existe documento persistido" — e ficava assim **para sempre** quando a
 * criação da proposta falhava, porque `enviarAnexos` só roda depois de a
 * proposta existir. Medido em staging em 07/09/2026: salvar apenas FAP + foto,
 * sem a finalidade, deixava `FAP fap-teste-A.pdf · salvando…` indefinidamente,
 * sem Remover e sem reversão, com a sendbar dizendo ao lado que não foi
 * possível salvar.
 *
 * Duas frases, porque os consertos são diferentes: `salvando…` pede espera;
 * `não enviado` diz que o arquivo continua só no navegador e que o caminho é
 * corrigir o que a sendbar aponta (ou descartar a escolha).
 */
export function rotuloAnexoPendente(salvamento: EstadoSalvamento): string {
  return salvamento === 'falhou' ? 'não enviado' : 'salvando…';
}
