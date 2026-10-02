import type { Finalidade } from '@/lib/picklists/salesforce-values';

/**
 * Purpose of the proposal itself (PRD F3 §7.3 — "Vinculação"/"Implantação").
 * RN-F3-03: persisted on the proposal and read downstream by F4–F6 to
 * condition which blocks apply. Not to be confused with `FinalidadeRecurso`
 * (`financial-resources.types.ts`), which is the purpose of a financial
 * resource itself.
 */
// `Quote.Finalidade_Cotacao__c` has 44 values, of which 12 are reachable from a
// `Tipo_de_Proposta__c`. The previous two-value union was the MVP's subset, not
// the picklist — render options from `GET /api/picklists/quote-finalidade`.
export type ProposalFinalidade = Finalidade;

/**
 * Proposal status values (mirrors backend `ProposalStatus` enum 1:1).
 * Used by the minuta-padrão block to determine the edit window.
 */
export type ProposalStatus = 'EM_PREENCHIMENTO' | 'EM_ANALISE' | 'DEVOLVIDA';

/**
 * Minimal proposal projection consumed by proposal-scoped blocks that only
 * need to know the proposal's `finalidade` to decide whether they apply
 * (e.g. the "Recursos financeiros" block, RN-F6-01/HU-10.2). Not the full
 * `ProposalDto` — this type only covers what this block needs.
 */
export interface ProposalSummary {
  id: string;
  /**
   * Business code assigned by the sequencer (migration `1783036800067`).
   * `null` for proposals created before the backfill (`1783036800072`) that
   * were not yet assigned a code (e.g. some ZLUB/ZBRM rows). PCR proposals
   * are 100% backfilled as of the issue date (VBR-548 measurement).
   *
   * When present, always display this over any derived form — CLAUDE.md:
   * "texto de tela nunca é valor de máquina".
   */
  codigo?: string | null;
  finalidade: ProposalFinalidade;
  /**
   * `Programa Acelera+` (backend `aceleraMais`) — campo 4 do bloco "Dados da
   * proposta". Desde 24/08/2026 é ele que governa a **Adesão ao PIM** enviada
   * ao Salesforce (o PIM é este programa): a oportunidade deixou de perguntar,
   * e o valor é derivado da proposta PCR eleita.
   *
   * Opcional porque `ProposalSummary` cresce por campos opcionais e a BFF
   * repassa o `ProposalDto` verbatim. Ausente ⇒ exibir `—`, **nunca** `Não`.
   */
  aceleraMais?: boolean;
  /**
   * Referência do posto (Código SAP) captured at creation — the opportunity's
   * client. Null on proposals older than the column; optional so blocks that
   * do not read it are unaffected. Prefills the read-only field of the
   * posto-situation modal.
   */
  postoRef?: string | null;
  /**
   * Analysis window (ISO-8601 dates). Present in the backend `ProposalDto` and
   * proxied verbatim by the BFF (`GET /api/proposals/:id`). Optional here so
   * blocks that only need `finalidade` are unaffected. Used by the F5 product
   * block to bound `fimConsumo` on the front (RN-F5-04: `fimConsumo` cannot be
   * after `dataFimAnalise`).
   */
  dataInicioAnalise?: string;
  dataFimAnalise?: string;
  /**
   * Prazo do contrato em MESES — derivado no backend da janela de análise
   * (`contractTermMonths`), nunca recalculado aqui. Ver `prazoContratoLabel`.
   *
   * Opcional pela mesma razão dos campos acima (o tipo cresce por campos
   * opcionais e a BFF repassa o `ProposalDto` verbatim). Ausente ⇒ `—`.
   */
  prazoContratoMeses?: number | null;
  /**
   * CTR-F1 (HU-02 / RN-F1-05): false ⇒ proposal does NOT follow the standard
   * minuta template. Null/undefined when the BFF hasn't been updated yet —
   * treat as true (standard).
   */
  minutaPadrao?: boolean | null;
  /** CTR-F1 (HU-02.1): Netlex legal-review code; null when none was registered. */
  netlexConsultaCodigo?: string | null;
  /** CTR-F1: current proposal lifecycle status — drives the edit window guard. */
  status?: ProposalStatus;
  /**
   * Reason the SNEG gave when returning the proposal (RN-F2-03). Only set while
   * the status is `DEVOLVIDA` — the backend clears it on resubmission, so a
   * value here always describes the CURRENT devolução.
   */
  motivoDevolucao?: string | null;
  /** When the proposal was returned (ISO-8601). Null outside `DEVOLVIDA`. */
  devolvidaEm?: string | null;
  /**
   * Veredito do backend: `POST /api/proposals/:id/reenviar` seria aceito AGORA?
   *
   * Desde 28/08/2026 devolver uma proposta devolve a OPORTUNIDADE ao
   * preenchimento, e o caminho de volta é a barra "Enviar para análise" (GATE 1)
   * — que traz a proposta devolvida junto e resolve a pendência. Então este
   * veredito é `false` no fluxo normal e `true` só na linha legada (proposta
   * devolvida quando a oportunidade ficava em análise).
   *
   * Ausente ⇒ `false`: oferecer o CTA por desconhecimento é a divergência tela ×
   * gate que ele existe para impedir.
   */
  reenvioHabilitado?: boolean;
  /**
   * A tela deve abrir esta proposta para edição AGORA? Veredito do backend
   * (`ProposalDto.editavel`), que cruza o status da proposta com o ESTADO da
   * oportunidade.
   *
   * O status sozinho não responde: ele nunca sai de `EM_ANALISE` quando a
   * oportunidade avança, e uma proposta criada já em fase posterior nasce
   * `EM_PREENCHIMENTO` — era assim que a tela abria editável uma proposta
   * dentro de uma oportunidade em minuta.
   *
   * Ausente ⇒ tratar como `false` (somente leitura): abrir por desconhecimento
   * é a divergência tela × gate que o veredito existe para impedir.
   */
  editavel?: boolean;
  /** Por que a edição está fechada — `null`/ausente quando ela está aberta. */
  motivoEdicaoBloqueada?: string | null;
  /**
   * A análise está ACONTECENDO (proposta em análise **e** oportunidade em
   * análise)? Governa as afordâncias do analista — o banner da visão da SNEG e
   * o "Solicitar ajuste" de cada bloco, que abre pendência ao LT. Ausente ⇒
   * `false`: nenhuma ação de análise numa fase que não se conseguiu ler.
   */
  analiseEmCurso?: boolean;
  /**
   * Client's default supply center code (`Codigo_Do_Centro__c`) — exposed by
   * the backend via VBR-481 (Trilha B). Used to pre-select the "Base" field
   * in the "Adicionar produto" modal (creation only; editing keeps the persisted
   * value). `null` or absent ⇒ no pre-selection (field opens at "Selecione…").
   */
  supplyCenterCode?: string | null;
  /**
   * Incoterm padrão do cliente (SAP code, e.g. `"Z10"`) — Bug 67530.
   * Pré-seleciona o campo "Incoterms" no modal "Adicionar produto" (criação
   * apenas). `null` ou ausente ⇒ campo abre em "Selecione…".
   *
   * Vem de `Area_De_Vendas__c.Incoterms__c` quando as áreas de venda da conta
   * concordam num único valor; divergindo, o backend devolve `null`
   * (`architecture/Salesforce-Evidencias-Incoterm-Prazo-2026-08-18.md`).
   */
  incotermPadrao?: string | null;
  /**
   * Prazo de pagamento padrão do cliente (SAP code, e.g. `"Y001"`) — Bug 67530.
   * Pré-seleciona o campo "Prazo de pagamento" no modal "Adicionar produto"
   * (criação apenas). `null` ou ausente ⇒ campo abre em "Selecione…".
   *
   * ⚠️ Hoje é SEMPRE `null`: o Salesforce não tem o prazo de pagamento padrão do
   * cliente, e isso foi medido — `Account.Condicoes_De_Pagamento__c`, o único
   * candidato do mesmo domínio de valores, coincide com o prazo que a cotação PCR
   * usou em 4 de 82 contas (4,9%). Ver o doc de evidências §2.
   */
  prazoPagamentoPadrao?: string | null;
}

/**
 * Payload sent to `PATCH /api/proposals/:id` for the minuta-padrão update
 * (CTR-F1 / HU-02).
 */
export interface UpdateMinutaPadraoPayload {
  minutaPadrao: boolean;
  netlexConsultaCodigo?: string;
}

/**
 * Backend response after a successful PATCH on the proposal
 * (minuta-padrão fields only — the full response carries more fields).
 */
export interface UpdateMinutaPadraoResult {
  minutaPadrao: boolean;
  netlexConsultaCodigo: string | null;
  /** Advisory: true when minutaPadrao=false but no code was provided. Never blocks. */
  consultaJuridicaPendente: boolean;
}
