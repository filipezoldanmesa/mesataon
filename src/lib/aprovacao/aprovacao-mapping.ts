import { ESTADO_EM_APROVACAO } from './aprovacao.types';
import type {
  Aprovacao,
  AprovacaoNivel,
  AprovacaoPill,
} from './aprovacao.types';

/** Shape of `AprovacaoDto` as the backend serialises it. */
export type BackendAprovacao = {
  salesforceId: string | null;
  salesforceCode: string | null;
  salesforceUrl: string | null;
  stageName: string | null;
  outcome: string;
  outcomeLabel: string;
  outcomePill: string;
  cadeiaAprovacao: Array<{
    processInstanceId: string;
    definicao: string | null;
    status: string;
    statusLabel: string;
    pill: string;
    ator: string | null;
    comentario: string | null;
    concluidaEm: string | null;
    criadaEm: string;
    passos: Array<{
      status: string;
      statusLabel: string;
      ator: string | null;
      comentario: string | null;
      data: string;
    }>;
    pendentes: string[];
  }>;
  lidoEm: string | null;
  erroLeitura: string | null;
  iniciarMinuta: { liberado: boolean; motivos: string[] };
  /** Optional: builds anteriores ao ADO 68194 não enviam o campo. */
  orientacaoReprovacao?: string | null;
  /** Optional: builds anteriores a esta entrega não enviam o campo. */
  avancoAutomatico?: { tentadoEm: string | null; motivo: string | null };
  /** Optional: idem. Ausente ⇒ a tela assume que a fase não mudou. */
  estadoAtual?: string;
};

const PILLS: readonly AprovacaoPill[] = ['s', 'w', 'd', 'i', 'n'];

/**
 * Narrows a pill code, falling back to neutral.
 *
 * An unknown code renders neutral rather than throwing or defaulting to a
 * colour that asserts something: `.d` (danger) and `.n` (neutral) already
 * shipped inverted once (VBR-500), and the failure mode is invisible — the pill
 * always renders, just in the wrong colour.
 */
function pill(value: string): AprovacaoPill {
  return (PILLS as readonly string[]).includes(value) ? (value as AprovacaoPill) : 'n';
}

function mapNivel(raw: BackendAprovacao['cadeiaAprovacao'][number]): AprovacaoNivel {
  return {
    processInstanceId: raw.processInstanceId,
    definicao: raw.definicao,
    status: raw.status,
    statusLabel: raw.statusLabel,
    pill: pill(raw.pill),
    ator: raw.ator ?? null,
    comentario: raw.comentario ?? null,
    concluidaEm: raw.concluidaEm,
    criadaEm: raw.criadaEm,
    passos: (raw.passos ?? []).map((p) => ({ ...p })),
    pendentes: raw.pendentes ?? [],
  };
}

/**
 * Maps the backend payload to the screen model.
 *
 * Explicit mapping and not a passthrough: a passthrough compiles (it is
 * `NextResponse.json(await res.json())`, untyped) and only fails at runtime,
 * rendering blank fields and `Invalid Date` — the repo rule for every BFF.
 */
export function mapAprovacao(raw: BackendAprovacao): Aprovacao {
  return {
    salesforceId: raw.salesforceId,
    salesforceCode: raw.salesforceCode,
    salesforceUrl: raw.salesforceUrl,
    stageName: raw.stageName,
    outcome: raw.outcome,
    outcomeLabel: raw.outcomeLabel,
    outcomePill: pill(raw.outcomePill),
    cadeiaAprovacao: (raw.cadeiaAprovacao ?? []).map(mapNivel),
    lidoEm: raw.lidoEm,
    erroLeitura: raw.erroLeitura,
    iniciarMinuta: {
      liberado: raw.iniciarMinuta?.liberado ?? false,
      motivos: raw.iniciarMinuta?.motivos ?? [],
    },
    /*
     * ADO 68194 — a frase é do BACKEND. `?? null` e nunca um texto local: uma
     * orientação composta aqui apareceria contra um build da API que decidiu
     * NÃO orientar (qualquer desfecho que não seja a reprovação).
     */
    orientacaoReprovacao: raw.orientacaoReprovacao ?? null,
    /*
     * Campo ausente degrada para "nada a dizer": inventar um motivo aqui seria
     * afirmar uma recusa que o backend não relatou. A frase é dele, verbatim.
     */
    avancoAutomatico: {
      tentadoEm: raw.avancoAutomatico?.tentadoEm ?? null,
      motivo: raw.avancoAutomatico?.motivo ?? null,
    },
    /*
     * Ausente ⇒ `EM_APROVACAO`, ou seja "a fase NÃO mudou".
     *
     * É a degradação segura: o campo só existe para a tela saber que precisa
     * ceder lugar à fase de minuta, e assumir que mudou contra um build antigo
     * da API tiraria o usuário de uma tela que ainda é a correta.
     */
    estadoAtual: raw.estadoAtual ?? ESTADO_EM_APROVACAO,
  };
}
