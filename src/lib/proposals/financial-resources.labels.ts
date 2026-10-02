import type { TipoBonificacao } from './financial-resources.types';

/**
 * PT-BR labels for the value sets this platform owns.
 *
 * The Salesforce-owned sets (tipo de registro, finalidade, etapa, periodicidade,
 * índice) deliberately have NO map here: their labels belong to Salesforce, some
 * differ from the value (`Mútuo Enc. Contas` → "Novo Mútuo"), and one set has 44
 * members. Those come from `GET /api/picklists/:field` via `usePicklist`, which
 * returns `{ value, label }` already filtered by the controlling picklist.
 */

export const TIPO_BONIFICACAO_LABELS: Record<TipoBonificacao, string> = {
  ANTECIPADA: 'Antecipada',
  POR_DESEMPENHO: 'Por desempenho',
};

