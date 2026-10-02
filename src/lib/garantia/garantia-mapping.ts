/**
 * Anti-corruption mapping for the garantia read model.
 *
 * `GET /v1/opportunities/:id/garantia` returns `BackendGarantia`; this file
 * transforms it into `GarantiaView`, the shape the UI components consume.
 *
 * Rules (CLAUDE.md §BFF mapping rule):
 *  - Null is preserved as null — no convenience defaults.
 *  - All composed text (imovelResumo, coberturaTexto, valoresPorFinalidadeTexto)
 *    comes from the backend; the frontend never assembles these strings.
 *  - The presigned document URL is NEVER passed through — it is replaced with a
 *    same-origin stream URL so it never reaches the browser.
 *  - The `estadoPill` string from the backend ('w'|'i'|'s') is mapped to the
 *    PillVariant the StatusPill component expects.
 *
 * Backend source: apps/api/src/garantia/dto/garantia-view.dto.ts (GAR-16 / VBR-342).
 */

import type { PillVariant } from '@/components/status-pill';

import { formatCurrencyBRL, formatTaxId } from '@/lib/clients/format';

import type {
  EstadoGarantia,
  GarantiaIndicacao,
  GarantiaIndicacaoResumo,
  ResultadoPrevia,
} from './types';

// ---------------------------------------------------------------------------
// Backend contract (as returned by GET /v1/opportunities/:id/garantia)
// ---------------------------------------------------------------------------

/**
 * One row of the full 1:N indication list (`GarantiaViewDto.indicacoes`,
 * fonte única since 26/08/2026) — every guarantee indicated for the
 * opportunity, not just the most recent one `BackendIndicacaoBlock` above
 * carries.
 *
 * Same backend row shape as `GarantiaIndicacaoItemDto` (the inline card on
 * the opportunity screen consumes it too, via `indicacoes-mapping.ts`), typed
 * here to only the fields THIS list renders. `certidaoUrl`/`laudoUrl` are
 * intentionally absent from this type: this read model never resolves them
 * (always `null`, attached or not — no `DocumentStoreProvider` on that
 * service), so there is nothing here to build a download link from.
 */
export interface BackendIndicacaoResumo {
  id: string;
  tipoLabel: string;
  imovel: string | null;
  matricula: string | null;
  categoriaLabel: string | null;
  /** Raw numeric string ("1200000.00") — the mapper formats it as BRL. */
  valorAvaliadoBrl: string | null;
}

/** Prévia block as returned by the backend. */
export interface BackendPreviaBlock {
  parecer: string | null;
  resultado: string | null;
  resultadoLabel: string | null;
  /** Mesmo veredito que `garantia:aprovar-previa` aplica no backend. */
  podeConfirmar?: boolean;
  /** O que falta para confirmar. `null` quando `podeConfirmar`. */
  motivoBloqueio?: string | null;
}

/** Minuta block as returned by the backend. */
export interface BackendMinutaBlock {
  netlexId: string | null;
  status: string | null;
  statusLabel: string | null;
}

/** Opportunity summary for the sidebar panel. */
export interface BackendOportunidadeSummary {
  id: string;
  code: string;
  /** "OPP-2026-000001 · SAP 152201" — composed by backend for the panel row. */
  codigoDisplay?: string;
  clienteNome: string;
  clienteCnpj: string;
  localizacao: string;
  valorBrl: string | null;
  faseLabel: string;
  ltResponsavel: string;
}

/**
 * A atribuição do analista da CCOB, como o backend a devolve (04/09/2026).
 *
 * Todo campo é opcional porque este é o payload de fio: um backend anterior à
 * entrega não manda nada, e o mapper degrada campo a campo.
 */
export interface BackendGarantiaAtribuicao {
  analistaId?: string | null;
  analistaNome?: string | null;
  analistaEmail?: string | null;
  gerencia?: string | null;
  atribuicaoPendente?: boolean;
  atribuidaEm?: string | null;
}

/**
 * Quem responde pela **análise prévia** da garantia.
 *
 * Nasce do roteamento automático da CCOB, no momento em que o subprocesso é
 * promovido a `EM_ANALISE_PREVIA`. Antes disto a tela mostrava o literal
 * `"CCOB"` em todo estado, porque não havia atribuição nenhuma.
 */
/**
 * A atribuição do analista da SNEG (20/09/2026) — o payload de fio.
 *
 * A forma é a mesma da irmã da CCOB, e os dois tipos existem separados de
 * propósito: são blocos distintos do payload, e um alias faria uma renomeação
 * de campo em um deles silenciosamente "consertar" o outro.
 */
export interface BackendGarantiaAtribuicaoSneg {
  analistaId?: string | null;
  analistaNome?: string | null;
  analistaEmail?: string | null;
  gerencia?: string | null;
  atribuicaoPendente?: boolean;
  atribuidaEm?: string | null;
}

/**
 * Quem responde pelo **fluxo de garantia** — o analista da SNEG (20/09/2026).
 *
 * Nasce do roteamento automático no momento em que a CCOB **aprova** a análise
 * prévia, lendo a etapa `GARANTIA` da tabela de Governança.
 *
 * ⚠️ Não substitui {@link GarantiaAtribuicao}, que é da CCOB e descreve a etapa
 * ANTERIOR: a tela mostra as duas linhas.
 */
export interface GarantiaAtribuicaoSneg {
  /** ⚠️ Valor de MÁQUINA — alimenta o seletor, nunca a tela. */
  analistaId: string | null;
  /** O nome — é isto que a tela escreve. */
  analistaNome: string | null;
  analistaEmail: string | null;
  /** A gerência que resolveu a atribuição (a chave da tabela de governança). */
  gerencia: string | null;
  /**
   * `true` quando o fluxo começou e a gerência não tem analista parametrizado
   * na etapa `GARANTIA`. **Não bloqueia nada** — o worker de catch-up retenta
   * assim que a Governança preencher a tabela.
   */
  atribuicaoPendente: boolean;
  atribuidaEm: string | null;
}

export interface GarantiaAtribuicao {
  /** ⚠️ Valor de MÁQUINA — alimenta o seletor, nunca a tela. */
  analistaId: string | null;
  /** O nome — é isto que a tela escreve. */
  analistaNome: string | null;
  analistaEmail: string | null;
  /** A gerência que resolveu a atribuição (a chave da tabela de governança). */
  gerencia: string | null;
  /**
   * `true` quando a gerência não tem analista parametrizado. **Não bloqueia
   * nada** — a garantia está em análise prévia do mesmo jeito, e o worker de
   * catch-up retenta assim que a Governança preencher a tabela.
   */
  atribuicaoPendente: boolean;
  atribuidaEm: string | null;
}

/** Full backend DTO for the garantia read model (GAR-16 / VBR-342). */
export interface BackendGarantia {
  estado: string;
  estadoLabel: string;
  /** Pill CSS class from the backend: 'w' | 'i' | 's' | 'n' */
  estadoPill: string;
  /**
   * `true` when the garantia subprocess does not apply (no antecipação/mútuo,
   * FIANCA_SEM_LASTRO, or ENCERRADO). Renders differently from "bloqueado"
   * (no `.locked`, no "aguardando" hint).
   */
  naoSeAplica: boolean;
  /** Backend-composed pt-BR reason when `naoSeAplica` — rendered verbatim. */
  naoSeAplicaMotivo?: string | null;

  // Meta row (always present)
  concessaoFinanceira: string | null;
  analisePerfilPrecondicao: string | null;
  tipoLabel: string | null;
  /**
   * O NOME do analista da CCOB. `null` quando ninguém foi designado — a tela
   * escreve "Aguardando distribuição" (21/09/2026; antes vinha composto como
   * `Nome · CCOB`, com fallback para o literal `CCOB`).
   */
  responsavelPrevia: string | null;
  /**
   * Veredito do backend: a prévia ainda não foi realizada, logo o analista pode
   * ser trocado. A tela NUNCA o recalcula — ela lia o estado por conta própria,
   * e uma segunda cópia da regra ofereceria o CTA onde a API responde 422.
   */
  podeReatribuirPrevia?: boolean;
  /**
   * A atribuição do analista da CCOB (04/09/2026).
   *
   * Opcional (`?:`) só para tolerar um backend anterior a este campo — o mapper
   * degrada para "atribuição desconhecida", nunca para "pendente".
   */
  atribuicao?: BackendGarantiaAtribuicao;
  /**
   * Quem responde pelo FLUXO DE GARANTIA — o analista da SNEG (20/09/2026).
   * `null` enquanto a CCOB não aprovou a prévia.
   */
  responsavelGarantia?: string | null;
  /**
   * Veredito do backend: o fluxo de garantia já começou? A tela NUNCA o
   * recalcula — uma segunda cópia da regra ofereceria o CTA de reatribuição
   * onde a API responde 422.
   */
  fluxoGarantiaIniciado?: boolean;
  /** A atribuição do analista da SNEG (20/09/2026). */
  atribuicaoSneg?: BackendGarantiaAtribuicaoSneg;
  /** Id of the INDICACAO_GARANTIA pendência — target of "Exibir pendência". */
  pendenciaIndicacaoId?: string | null;

  /**
   * Every guarantee indicated for the opportunity (`guarantee_nominations`,
   * fonte única since 26/08/2026) — ordered `createdAt DESC, id DESC`. Never
   * `null`: `[]` is "nenhuma garantia indicada", a business answer, not a
   * missing field. Optional here (`?:`) only to tolerate a backend deployed
   * before this field existed; the mapper treats a missing array the same as
   * an empty one.
   */
  indicacoes?: BackendIndicacaoResumo[];

  /** Veredito de cobertura do CONJUNTO (spec 28/08/2026 §6). */
  cobertura?: BackendCobertura;
  /** Documentos de garantia sem vínculo com uma indicação (legado). */
  documentosLegado?: BackendDocumentoGarantia[];
  /** Valores reservado/utilizado por finalidade — do conjunto. */
  valoresPorFinalidadeTexto?: string;

  // Blocks (null until the corresponding state is reached)
  previa: BackendPreviaBlock | null;
  /** Concluded prévias, most recent first. Absent on builds before VBR-630. */
  previaHistorico?: BackendPreviaHistorico[] | null;
  minuta: BackendMinutaBlock | null;

  // Sidebar panel
  oportunidade: BackendOportunidadeSummary;
}

// ---------------------------------------------------------------------------
// Frontend shape consumed by the UI
// ---------------------------------------------------------------------------

export interface GarantiaDocumento {
  id: string;
  nome: string;
  pillLabel: string;
  pillVariant: PillVariant;
}

/** Um documento de garantia, como o backend o entrega (spec 28/08/2026 §4). */
export interface BackendDocumentoGarantia {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
}

export interface BackendCoberturaExclusao {
  tipoLabel: string;
  motivo: string;
}

export interface BackendCobertura {
  valorAproveitadoLabel: string | null;
  coberturaSuficiente: boolean | null;
  coberturaTexto: string | null;
  motivoIndisponivel: string | null;
  excluidas: BackendCoberturaExclusao[];
}

/**
 * Cobertura do CONJUNTO, já composta pelo backend (ADR-0018 — a tela renderiza,
 * nunca recompõe).
 *
 * `coberturaSuficiente: null` é "indisponível", NUNCA "não cobre": o motivo vive
 * em `motivoIndisponivel`, e um `false` ali afirmaria um veredito que ninguém
 * calculou.
 */
export interface GarantiaCobertura {
  valorAproveitadoLabel: string | null;
  coberturaSuficiente: boolean | null;
  coberturaTexto: string | null;
  motivoIndisponivel: string | null;
  excluidas: BackendCoberturaExclusao[];
}

/**
 * Um documento de garantia sem vínculo com indicação (legado).
 *
 * Sem `url`: a tela a compõe, como já faz para os documentos do bloco — este
 * mapper não recebe o `opportunityId`, e passá-lo só para isto mudaria a
 * assinatura de três rotas BFF e de toda a suíte.
 */
export interface GarantiaDocumentoLegado {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
}

export interface GarantiaPreviaBlock {
  parecer: string | null;
  resultado: ResultadoPrevia | null;
  resultadoLabel: string | null;
  /**
   * O CCOB pode confirmar a análise prévia agora?
   *
   * É o veredito do backend (`GarantiaService.getPreviaHabilitada`), o MESMO
   * que a rota de escrita aplica. A tela não o recalcula — recalcular é como
   * ela passou a oferecer uma ação que a API recusava.
   */
  podeConfirmar: boolean;
  /** O que falta, em pt-BR. `null` quando `podeConfirmar`. */
  motivoBloqueio: string | null;
}

export interface GarantiaMinutaBlock {
  netlexId: string | null;
  status: string | null;
  statusLabel: string | null;
}

export interface GarantiaOportunidadeSummary {
  id: string;
  code: string;
  /** Panel "Código" row text — falls back to `code` when backend omits it. */
  codigoDisplay: string;
  clienteNome: string;
  clienteCnpj: string;
  localizacao: string;
  valorBrl: string | null;
  faseLabel: string;
  ltResponsavel: string;
}

/** Frontend shape consumed by `GarantiaScreen` and its sub-components. */
export interface GarantiaView {
  estado: EstadoGarantia | string;
  estadoLabel: string;
  estadoPill: PillVariant;
  naoSeAplica: boolean;
  naoSeAplicaMotivo: string | null;

  // Meta row
  concessaoFinanceira: string | null;
  analisePerfilPrecondicao: string | null;
  tipoLabel: string | null;
  /**
   * O NOME do analista da CCOB atribuído à análise prévia. `null` ⇒ ninguém foi
   * designado, e a linha "Analista CCOB" mostra "Aguardando distribuição".
   */
  responsavelPrevia: string | null;
  /**
   * Veredito do backend — governa SÓ o CTA de reatribuição da prévia
   * (21/09/2026). ⚠️ Nunca a linha: o responsável (ou a falta dele) continua
   * visível depois que a prévia é realizada.
   */
  podeReatribuirPrevia: boolean;
  /**
   * Quem responde pela análise prévia — a atribuição da CCOB (04/09/2026).
   *
   * Existe ao lado de `responsavelPrevia` (o NOME que a meta escreve) porque o
   * seletor de reatribuição precisa do `analistaId` para destacar a linha atual,
   * e o botão precisa saber se a atribuição está pendente. Id opaco nunca é
   * escrito na tela — é valor de máquina.
   */
  atribuicao: GarantiaAtribuicao;
  /**
   * Quem responde pelo fluxo de garantia — o TEXTO que a meta escreve
   * (`Juliana Costa · SNEG`). `null` enquanto a prévia não foi aprovada: a tela
   * não renderiza a linha, porque ninguém assumiu ainda.
   */
  responsavelGarantia: string | null;
  /** Veredito do backend — governa a linha e o CTA de reatribuição da SNEG. */
  fluxoGarantiaIniciado: boolean;
  /** A atribuição da SNEG — alimenta o seletor de reatribuição. */
  atribuicaoSneg: GarantiaAtribuicaoSneg;
  /** Id of the INDICACAO_GARANTIA pendência — "Exibir pendência" links to it. */
  pendenciaIndicacaoId: string | null;

  /**
   * Every guarantee indicated for the opportunity — the "Garantias
   * indicadas" list block. `[]` when none has been indicated yet; never
   * `null` (same reasoning as `previaHistorico` below).
   */
  indicacoes: GarantiaIndicacaoResumo[];

  /**
   * Cobertura do CONJUNTO (RN-F1-02 — spec 28/08/2026 §6).
   *
   * `null` só quando o backend é anterior a este campo; a tela então não
   * renderiza o bloco, em vez de afirmar um veredito.
   */
  cobertura: GarantiaCobertura | null;
  /**
   * Documentos de garantia anexados antes de o vínculo existir, que o backfill
   * não pôde atribuir. `[]` é o caso normal.
   */
  documentosLegado: GarantiaDocumentoLegado[];
  /** Valores por finalidade do conjunto — `null` enquanto a GAR-12 não existir. */
  valoresPorFinalidadeTexto: string | null;

  // Blocks
  previa: GarantiaPreviaBlock | null;
  /**
   * Concluded prévias, most recent first — the verdict history.
   *
   * `[]` when none has been concluded. Never `null`: "no decision yet" and
   * "the field is missing" would render the same, and the list is the record of
   * what the CCOB already refused (VBR-630).
   */
  previaHistorico: GarantiaPreviaHistorico[];
  minuta: GarantiaMinutaBlock | null;

  // Sidebar
  oportunidade: GarantiaOportunidadeSummary;
}

/** One concluded prévia as the backend sends it. */
export interface BackendPreviaHistorico {
  parecer: string;
  resultado: string;
  resultadoLabel: string;
  resultadoPill: string;
  concluidaEm: string | null;
}

/**
 * One concluded prévia, ready for the screen.
 *
 * `resultado` is narrowed to the known enum; an unrecognised value keeps the
 * label the backend sent but loses the pill (`null`) rather than guessing a
 * colour for a verdict this build does not understand.
 */
export interface GarantiaPreviaHistorico {
  parecer: string;
  resultado: ResultadoPrevia | null;
  resultadoLabel: string;
  resultadoPill: PillVariant | null;
  concluidaEm: string | null;
}

// ---------------------------------------------------------------------------
// Pill variant mapping
// ---------------------------------------------------------------------------

/** Maps a backend pill CSS class to the `PillVariant` the StatusPill component expects. */
/**
 * Backend pill code → design-system variant.
 *
 * Exported so the track mapper reuses it instead of keeping a second copy: the
 * codes come from one catalog on the backend (`ESTADO_GARANTIA_PILL`), so their
 * translation belongs in one place on this side too (VBR-500 CA-5).
 */
export function mapPillVariant(raw: string): PillVariant {
  switch (raw) {
    case 's':
      return 'success';
    case 'w':
      return 'warning';
    case 'i':
      return 'info';
    case 'n':
      return 'neutral';
    case 'd':
      return 'danger';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Read mapper — backend → frontend
// ---------------------------------------------------------------------------

/**
 * Maps `BackendGarantia` (GET `/v1/opportunities/:id/garantia`) to
 * `GarantiaView`. Called by the BFF route; the component receives only the
 * frontend shape.
 *
 * Null is preserved — no convenience defaults. An unknown `estadoPill` falls
 * back to 'neutral' (safe state: worst case the pill is grey, not missing).
 * An unknown `resultado` falls back to null (no veredito rendered).
 */
export function mapGarantia(b: BackendGarantia): GarantiaView {
  return {
    estado: b.estado,
    estadoLabel: b.estadoLabel,
    estadoPill: mapPillVariant(b.estadoPill),
    naoSeAplica: b.naoSeAplica,
    naoSeAplicaMotivo: b.naoSeAplicaMotivo ?? null,

    concessaoFinanceira: b.concessaoFinanceira,
    analisePerfilPrecondicao: b.analisePerfilPrecondicao,
    tipoLabel: b.tipoLabel,
    responsavelPrevia: b.responsavelPrevia,
    /*
     * ⚠️ `=== true`: ausência é "não sei", e "não sei" NÃO abre o CTA — a rota
     * responde 422 depois da prévia realizada, e um botão que só pode falhar é
     * pior que nenhum. Mesma leitura do `fluxoGarantiaIniciado` logo abaixo.
     */
    podeReatribuirPrevia: b.podeReatribuirPrevia === true,
    atribuicao: {
      analistaId: b.atribuicao?.analistaId ?? null,
      analistaNome: b.atribuicao?.analistaNome ?? null,
      analistaEmail: b.atribuicao?.analistaEmail ?? null,
      gerencia: b.atribuicao?.gerencia ?? null,
      /*
       * ⚠️ `=== true`, não truthy: campo ausente (backend anterior à entrega)
       * significa "não sei", e "não sei" não pode virar "pendente" — a tela
       * anunciaria uma atribuição em falta que talvez exista.
       */
      atribuicaoPendente: b.atribuicao?.atribuicaoPendente === true,
      atribuidaEm: b.atribuicao?.atribuidaEm ?? null,
    },
    /*
     * ⚠️ `?? null`, nunca um fallback para `"SNEG"`: backend anterior à entrega
     * não manda o campo, e escrever a área afirmaria que ela assumiu o processo.
     */
    responsavelGarantia: b.responsavelGarantia ?? null,
    /*
     * ⚠️ `=== true`: ausência é "não sei", e "não sei" NÃO abre a linha nem o
     * CTA — a API recusaria a reatribuição com 422.
     */
    fluxoGarantiaIniciado: b.fluxoGarantiaIniciado === true,
    atribuicaoSneg: {
      analistaId: b.atribuicaoSneg?.analistaId ?? null,
      analistaNome: b.atribuicaoSneg?.analistaNome ?? null,
      analistaEmail: b.atribuicaoSneg?.analistaEmail ?? null,
      gerencia: b.atribuicaoSneg?.gerencia ?? null,
      atribuicaoPendente: b.atribuicaoSneg?.atribuicaoPendente === true,
      atribuidaEm: b.atribuicaoSneg?.atribuidaEm ?? null,
    },
    pendenciaIndicacaoId: b.pendenciaIndicacaoId ?? null,
    indicacoes: (b.indicacoes ?? []).map(mapIndicacaoResumo),

    cobertura: b.cobertura
      ? {
          valorAproveitadoLabel: emptyToNull(b.cobertura.valorAproveitadoLabel ?? ''),
          coberturaSuficiente:
            typeof b.cobertura.coberturaSuficiente === 'boolean'
              ? b.cobertura.coberturaSuficiente
              : null,
          coberturaTexto: emptyToNull(b.cobertura.coberturaTexto ?? ''),
          motivoIndisponivel: emptyToNull(b.cobertura.motivoIndisponivel ?? ''),
          excluidas: b.cobertura.excluidas ?? [],
        }
      : null,
    documentosLegado: (b.documentosLegado ?? []).map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      uploadedAt: d.uploadedAt,
    })),
    valoresPorFinalidadeTexto: emptyToNull(b.valoresPorFinalidadeTexto ?? ''),

    previa: b.previa
      ? {
          parecer: b.previa.parecer,
          resultado: isKnownResultado(b.previa.resultado) ? b.previa.resultado : null,
          resultadoLabel: b.previa.resultadoLabel,
          /*
           * Campo ausente degrada para BLOQUEADO, nunca para liberado — abrir o
           * CTA por falta de informação faria a tela oferecer a ação que a API
           * recusaria, que é o defeito inteiro que este campo fecha (mesmo
           * critério do `mapGate` da alçada).
           */
          podeConfirmar: b.previa.podeConfirmar === true,
          motivoBloqueio:
            b.previa.podeConfirmar === true ? null : (b.previa.motivoBloqueio ?? null),
        }
      : null,

    /*
     * `?? []` and not `?? null`: an empty history is a fact ("nothing decided
     * yet"), and collapsing it with "the field is absent" would make the screen
     * unable to tell them apart. Entries without a parecer are dropped — the
     * parecer IS the content of a verdict.
     */
    previaHistorico: (b.previaHistorico ?? [])
      .filter((row) => row.parecer != null && row.parecer.trim() !== '')
      .map((row) => ({
        parecer: row.parecer,
        resultado: isKnownResultado(row.resultado) ? row.resultado : null,
        resultadoLabel: row.resultadoLabel,
        resultadoPill: isKnownResultado(row.resultado)
          ? mapPillVariant(row.resultadoPill)
          : null,
        concluidaEm: row.concluidaEm,
      })),

    minuta: b.minuta
      ? {
          netlexId: b.minuta.netlexId,
          status: b.minuta.status,
          statusLabel: b.minuta.statusLabel,
        }
      : null,

    oportunidade: {
      id: b.oportunidade.id,
      code: b.oportunidade.code,
      codigoDisplay: b.oportunidade.codigoDisplay ?? b.oportunidade.code,
      clienteNome: b.oportunidade.clienteNome,
      // Backend delivers the raw taxId from the CRM; the display mask lives
      // here (same rule as customer-mapping.ts — prototype "12.345.678/0001-90").
      // formatTaxId passes non-numeric values ("—") through unchanged.
      clienteCnpj: formatTaxId(b.oportunidade.clienteCnpj),
      localizacao: b.oportunidade.localizacao,
      valorBrl: b.oportunidade.valorBrl,
      faseLabel: b.oportunidade.faseLabel,
      ltResponsavel: b.oportunidade.ltResponsavel,
    },
  };
}

/** Narrows `resultado` to `ResultadoPrevia`; unknown values fall back to null. */
function isKnownResultado(value: string | null): value is ResultadoPrevia {
  return value === 'APROVADA' || value === 'REPROVADA';
}

/** Backend composes strings with "" meaning "no data" — the UI renders null as "—". */
function emptyToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

/**
 * Maps one row of `BackendGarantia.indicacoes` to `GarantiaIndicacaoResumo`.
 *
 * Formats the raw numeric value as BRL here, at the edge — same discipline
 * as `formatValorBrl` in `indicacoes-mapping.ts`, the mapper for the OTHER
 * 1:N surface that reads this same backend row shape. An unparsable value
 * (should not happen — `valorAvaliadoBrl` is a raw numeric string or `null`
 * on the wire) degrades to `null` rather than rendering "R$ NaN".
 */
function mapIndicacaoResumo(b: BackendIndicacaoResumo): GarantiaIndicacaoResumo {
  const raw = b.valorAvaliadoBrl == null ? null : Number(b.valorAvaliadoBrl);
  return {
    id: b.id,
    tipoLabel: b.tipoLabel,
    imovel: b.imovel ?? null,
    matricula: b.matricula ?? null,
    categoriaLabel: b.categoriaLabel ?? null,
    valorAvaliadoBrl: raw != null && Number.isFinite(raw) ? formatCurrencyBRL(raw) : null,
  };
}

// ---------------------------------------------------------------------------
// Indicação read model (GAR-F1 — GET /v1/opportunities/:id/garantia/indicacao)
//
// Distinct from the `GarantiaView` mapping above: that one feeds the dedicated
// garantia screen (GAR-16/GAR-17), this one the indication section of the
// opportunity detail (GAR-19). Different endpoints, different shapes.
// ---------------------------------------------------------------------------


/**
 * Backend `GET /v1/opportunities/:id/garantia/indicacao` response shape.
 * Mirrors `GarantiaIndicacaoDto` from the API (GAR-8).
 *
 * Typed loose (all fields optional) so an incomplete backend response does
 * not crash the mapper — missing fields become `null`, never an invented value.
 */
export interface BackendGarantiaIndicacao {
  id?: string | null;
  estado: string;
  estadoLabel: string;
  estadoPill: string;
  estadosPermitidos?: string[];
  tipo?: string | null;
  tipoLabel?: string | null;
  origem?: string | null;
  origemLabel?: string | null;
  utilizacao?: string | null;
  categoria?: string | null;
  categoriaLabel?: string | null;
  imovelDisplay?: string | null;
  /** Raw parts of the property, for hydrating the re-indication form (VBR-630). */
  imovelEndereco?: string | null;
  imovelMatricula?: string | null;
  imovelCidade?: string | null;
  imovelUf?: string | null;
  valorAvaliadoBrl?: string | null;
  percentualAproveitamento?: string | null;
  observacoes?: string | null;
  sapGarantiaExternaId?: string | null;
  indicacaoSubmetidaEm?: Date | string | null;
}

/**
 * Maps the backend `GarantiaIndicacaoDto` to the frontend {@link GarantiaIndicacao}.
 *
 * Design rules:
 *  - **No defaults of convenience.** A field absent in the backend response maps
 *    to `null`. The UI is responsible for omitting the element when `null`.
 *  - `estado` is carried 1:1 (it is a machine code — the UI gates CTAs on it).
 *  - `estadosPermitidos` defaults to `[]` (safest choice — no CTA is shown when
 *    the list is empty, rather than crashing on `.includes(undefined)`).
 *  - `indicacaoSubmetidaEm` is coerced to an ISO string when the backend sends
 *    a `Date` (JSON serialisation should already stringify it, but be defensive).
 */
export function mapGarantiaIndicacao(b: BackendGarantiaIndicacao): GarantiaIndicacao {
  const indicacaoSubmetidaEm =
    b.indicacaoSubmetidaEm instanceof Date
      ? b.indicacaoSubmetidaEm.toISOString()
      : (b.indicacaoSubmetidaEm ?? null);

  return {
    id: b.id ?? null,
    estado: b.estado as EstadoGarantia,
    estadoLabel: b.estadoLabel,
    estadoPill: b.estadoPill,
    estadosPermitidos: (b.estadosPermitidos ?? []) as EstadoGarantia[],
    tipo: b.tipo ?? null,
    tipoLabel: b.tipoLabel ?? null,
    origem: b.origem ?? null,
    origemLabel: b.origemLabel ?? null,
    utilizacao: b.utilizacao ?? null,
    categoria: b.categoria ?? null,
    categoriaLabel: b.categoriaLabel ?? null,
    imovelDisplay: b.imovelDisplay ?? null,
    /*
     * Raw parts kept ALONGSIDE the composed sentence: `imovelDisplay` is for
     * reading, these are what the re-indication form hydrates from. They are
     * not derived from it — an address can contain the "·" separator, so
     * splitting the display string back apart is not safe (VBR-630 §B).
     */
    imovelEndereco: b.imovelEndereco ?? null,
    imovelMatricula: b.imovelMatricula ?? null,
    imovelCidade: b.imovelCidade ?? null,
    imovelUf: b.imovelUf ?? null,
    valorAvaliadoBrl: b.valorAvaliadoBrl ?? null,
    percentualAproveitamento: b.percentualAproveitamento ?? null,
    observacoes: b.observacoes ?? null,
    sapGarantiaExternaId: b.sapGarantiaExternaId ?? null,
    indicacaoSubmetidaEm,
  };
}
