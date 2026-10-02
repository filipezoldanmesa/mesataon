/**
 * Anti-corruption mapping between the backend `GarantiaIndicacaoDto`
 * (GET/POST `/v1/opportunities/:id/garantia/indicacao`) and the
 * frontend `GarantiaIndicacao` shape consumed by the UI.
 *
 * Read and write paths use the SAME mapper so the contract never diverges
 * between leitura and escrita (CLAUDE.md §BFF mapping rule).
 *
 * Backend source: `apps/api/src/garantia/dto/garantia-indicacao.dto.ts`
 * Backend write:  `apps/api/src/garantia/dto/garantia-indicar.dto.ts`
 */

import type { TipoGarantia, CategoriaBem, OrigemGarantia, EstadoCivil } from './constants';
import type { EnderecoPessoa } from './indicacoes.types';

// ---------------------------------------------------------------------------
// Backend contract (as returned by GET+POST garantia/indicacao)
// ---------------------------------------------------------------------------

/** Shape produced by the backend `GarantiaIndicacaoDto`. */
export interface BackendIndicacao {
  id: string | null;
  indicacaoId?: string | null;
  estado: string;
  estadoLabel: string;
  estadoPill: string;
  estadosPermitidos: string[];
  tipo: string | null;
  tipoLabel: string | null;
  origem: string | null;
  origemLabel: string | null;
  /** `Utilizacao__c` — API name verbatim; `null` = "Nenhum". */
  utilizacao?: string | null;
  categoria: string | null;
  categoriaLabel: string | null;
  /** Composed display string: "Av. Paulista, 1000 · matrícula 45.678 · São Paulo/SP" */
  imovelDisplay: string | null;
  /**
   * Raw parts of the property — what the re-indication FORM hydrates from.
   *
   * `imovelDisplay` above is a composed sentence for reading; a form needs the
   * pieces, and they cannot be recovered from it (an address may contain the
   * "·" separator). Before VBR-630 the re-indication opened blank and the LT
   * retyped the whole indication to fix one document.
   */
  imovelEndereco?: string | null;
  imovelMatricula?: string | null;
  imovelCidade?: string | null;
  imovelUf?: string | null;
  valorAvaliadoBrl: string | null;
  percentualAproveitamento: string | null;
  observacoes: string | null;
  sapGarantiaExternaId: string | null;
  indicacaoSubmetidaEm: string | null;
}

// ---------------------------------------------------------------------------
// Frontend shape
// ---------------------------------------------------------------------------

/** Indicação da garantia consumed by the UI. */
export interface GarantiaIndicacao {
  id: string | null;
  /**
   * Id da INDICAÇÃO criada (`guarantee_nominations`) — não do subprocesso.
   *
   * É com ele que o ticket anexa os documentos depois de submeter: eles
   * pertencem à garantia, e ela só existe a partir desta resposta.
   */
  indicacaoId: string | null;
  estado: string;
  estadoLabel: string;
  estadoPill: string;
  estadosPermitidos: string[];
  tipo: TipoGarantia | null;
  tipoLabel: string | null;
  origem: OrigemGarantia | null;
  origemLabel: string | null;
  /**
   * `Utilizacao__c` — o que a garantia lastreia ("Fornecimento" | "Concessão
   * Financeira"). `null` = "Nenhum", que é estado legítimo (a picklist do org
   * é `nillable`). Sem par `*Label`: o API name É o rótulo pt-BR.
   */
  utilizacao: string | null;
  categoria: CategoriaBem | null;
  categoriaLabel: string | null;
  /** Composed display string from backend (never re-derived on the front). */
  imovelDisplay: string | null;
  /** Raw parts — the re-indication form hydrates from these (VBR-630). */
  imovelEndereco: string | null;
  imovelMatricula: string | null;
  imovelCidade: string | null;
  imovelUf: string | null;
  /** Formatted value string from backend, e.g. "R$ 1.200.000,00". */
  valorAvaliadoBrl: string | null;
  observacoes: string | null;
  sapGarantiaExternaId: string | null;
  indicacaoSubmetidaEm: string | null;
}

// ---------------------------------------------------------------------------
// Read mapper — backend → frontend (SAME result for GET and POST responses)
// ---------------------------------------------------------------------------

/**
 * Maps a backend `GarantiaIndicacaoDto` to the frontend `GarantiaIndicacao`.
 *
 * Null is preserved as null — no default values of convenience (a silent
 * default masks a missing backend field and causes a divergence between leitura
 * and escrita). Fields that the frontend does not consume (e.g.
 * `percentualAproveitamento`) are dropped here instead of leaking to the UI,
 * so adding a backend field does not silently widen the FE type.
 */
export function mapGarantiaIndicacao(b: BackendIndicacao): GarantiaIndicacao {
  return {
    id: b.id,
    indicacaoId: b.indicacaoId ?? null,
    estado: b.estado,
    estadoLabel: b.estadoLabel,
    estadoPill: b.estadoPill,
    estadosPermitidos: b.estadosPermitidos ?? [],
    tipo: (b.tipo as TipoGarantia | null) ?? null,
    tipoLabel: b.tipoLabel,
    origem: (b.origem as OrigemGarantia | null) ?? null,
    origemLabel: b.origemLabel,
    utilizacao: b.utilizacao ?? null,
    categoria: (b.categoria as CategoriaBem | null) ?? null,
    categoriaLabel: b.categoriaLabel,
    imovelDisplay: b.imovelDisplay,
    imovelEndereco: b.imovelEndereco ?? null,
    imovelMatricula: b.imovelMatricula ?? null,
    imovelCidade: b.imovelCidade ?? null,
    imovelUf: b.imovelUf ?? null,
    valorAvaliadoBrl: b.valorAvaliadoBrl,
    observacoes: b.observacoes,
    sapGarantiaExternaId: b.sapGarantiaExternaId,
    indicacaoSubmetidaEm: b.indicacaoSubmetidaEm,
  };
}

// ---------------------------------------------------------------------------
// Write payload — frontend form → backend DTO (GarantiaIndicarDto)
// ---------------------------------------------------------------------------

/** Fiador as the backend `FiadorDto` expects it. */
export interface BackendFiador {
  nome: string;
  documento: string;
  /**
   * Optional because a legal-entity fiador has none: in a `FIANCA_BANCARIA` the
   * fiador is the bank (a CNPJ), and the backend `FiadorDto` only requires the
   * field for a natural person (`fiadorEhPessoaJuridica`). Omit it — an empty
   * string fails the `@IsEnum` and refuses the whole indication.
   */
  estadoCivil?: EstadoCivil;
  conjugeNome?: string;
  conjugeDocumento?: string;
  /** Natural person only — omitted for the bank, like `estadoCivil`. */
  email?: string;
  profissao?: string;
  endereco?: EnderecoPessoa;
  /** Only with a spouse (`exigeConjuge`). */
  conjugeEmail?: string;
  conjugeProfissao?: string;
  conjugeEndereco?: EnderecoPessoa;
}

/**
 * The payload sent to `POST /api/opportunities/:id/garantia/indicar`.
 *
 * Field names match the backend `GarantiaIndicarDto` exactly so the BFF can
 * forward the body with only auth-header injection and no field translation.
 * The BFF mapper validates this shape before forwarding.
 */
export interface GarantiaIndicarPayload {
  tipo: TipoGarantia;
  origem: OrigemGarantia;
  /**
   * `Utilizacao__c` — `null` (ou ausente) significa "Nenhum".
   *
   * Faltava aqui, e a falta era um beco sem saída: o org recusa a
   * sincronização da cotação quando há mútuo/antecipação sem garantia de
   * "Concessão Financeira", e o ticket é o caminho que FECHA o card inline
   * (o subprocesso passa a `EM_ANALISE_PREVIA`). Sem este campo, a garantia
   * indicada pela pendência nascia sem utilização e ninguém conseguia
   * corrigir.
   */
  utilizacao?: string | null;
  // Property fields (required when exigePrevia(tipo) && origem === NOVA)
  imovelEndereco?: string;
  /**
   * HIP-01 — as matrículas do imóvel, na ordem da tela.
   *
   * Substituiu `imovelMatricula` (texto único). A ordem é a do array: o backend
   * não aceita posição do cliente, porque é ela que rotula o slot da certidão.
   */
  matriculas?: Array<{ numero: string }>;
  /** HIP-02 — quantos laudos. Ausente ⇒ o backend lê como 1. */
  quantidadeLaudos?: number;
  imovelCidade?: string;
  imovelUf?: string;
  // Category and appraised value (required when exigePrevia(tipo))
  categoria?: CategoriaBem;
  valorAvaliadoBRL?: number;
  // Fiadores (required when exigeFiador(tipo))
  fiadores?: BackendFiador[];
  // Bank charter (required for FIANCA_BANCARIA)
  estatutoBancoDocumentId?: string;
  // Inline ticket uploads for imóvel guarantees (certidão + laudo — exigeImovel)
  // These IDs are recorded on the pendência resolution event so the documents
  // remain accessible from the ticket after submit (CA-1 / VBR-issue ef539a41).
  certidaoDocumentId?: string;
  laudoDocumentId?: string;
  // Existing guarantee in SAP (required when origem === EXISTENTE)
  sapGarantiaExternaId?: string;
  /**
   * GER-03 — obrigatória no DTO do backend (`@IsBoolean()` sem `@IsOptional()`).
   * Omiti-la responde 400.
   */
  compartilhadaComOutrasOportunidades: boolean;
  /** GER-03 — só com a resposta "Sim"; o backend recusa (400) o inverso. */
  detalhesCompartilhamento?: string;
  // Free-text observations
  observacoes?: string;
}
