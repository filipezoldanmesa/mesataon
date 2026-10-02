import type {
  AuditoriaEntry,
  AuditoriaEventTipo,
  ListAuditoriaResult,
} from './types';

/**
 * Maps the backend `GET /v1/auditoria` payload to the frontend shape. The BFF
 * never passes the backend payload through raw (see CLAUDE.md): the explicit
 * `Backend*` interface + mapper keeps the contract visible and testable.
 */
export interface BackendAuditoriaEntry {
  id: string;
  /** ISO-8601 timestamp. */
  dataHora: string;
  usuario: string;
  perfil: string | null;
  tipo: string;
  acao: string;
  acaoCodigo: string;
  objeto: string | null;
  /** Código da oportunidade do registro (ADO 67958). Ausente em backend anterior. */
  oportunidade?: string | null;
  /** Razão social do cliente daquela oportunidade (ADO 67958). */
  cliente?: string | null;
  detalhe: string;
  /** Structured state before the action (VBR-451). Null for pre-migration records. */
  estadoAnterior: Record<string, unknown> | null;
  /** Structured state after the action (VBR-451). Null for pre-migration records. */
  estadoPosterior: Record<string, unknown> | null;
  /** Action justification when required. Null when not applicable. */
  motivo: string | null;
}

export interface BackendListAuditoriaResponse {
  items: BackendAuditoriaEntry[];
  total: number;
  page: number;
  limit: number;
}

const TIPOS: readonly AuditoriaEventTipo[] = ['critica', 'transicao', 'acesso'];

function isAuditoriaEventTipo(value: unknown): value is AuditoriaEventTipo {
  return (TIPOS as readonly unknown[]).includes(value);
}

/**
 * "21/07/2026 09:00" — the prototype's format, pinned to the business
 * timezone so the trail reads the same regardless of the viewer's machine.
 * An unparseable timestamp falls back to the raw string (visible gap).
 */
export function formatDataHora(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace(',', '');
}

export function mapAuditoriaEntry(entry: BackendAuditoriaEntry): AuditoriaEntry {
  return {
    id: entry.id,
    dataHora: formatDataHora(entry.dataHora),
    dataHoraIso: entry.dataHora,
    usuario: entry.usuario,
    perfil: entry.perfil,
    // Unknown tipo falls back to the safest facet ('critica' renders the
    // neutral "Ação" pill) — never dropped, never crashes the row.
    tipo: isAuditoriaEventTipo(entry.tipo) ? entry.tipo : 'critica',
    acao: entry.acao,
    objeto: entry.objeto,
    /*
     * ADO 67958 — identificação da oportunidade do registro. `?? null` porque o
     * campo é ausente num backend anterior a esta entrega: aí a célula "Objeto"
     * volta ao estado anterior em vez de renderizar `undefined`.
     */
    oportunidade: entry.oportunidade ?? null,
    cliente: entry.cliente ?? null,
    detalhe: entry.detalhe,
    estadoAnterior: entry.estadoAnterior ?? null,
    estadoPosterior: entry.estadoPosterior ?? null,
    motivo: entry.motivo ?? null,
  };
}

export function mapAuditoriaListResponse(
  data: BackendListAuditoriaResponse,
): ListAuditoriaResult {
  return {
    items: data.items.map(mapAuditoriaEntry),
    total: data.total,
    page: data.page,
    limit: data.limit,
  };
}
