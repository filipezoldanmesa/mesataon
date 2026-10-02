/**
 * Mapeamento dos três quadros da Evolução do Dashboard SNEG (visão do BP
 * Financeiro, 23/09/2026):
 *
 * - `GET /v1/dashboard/distribuicao-por-fase`
 * - `GET /v1/dashboard/distribuicao-por-analista`
 * - `GET /v1/dashboard/indicadores-sneg`
 *
 * ⚠️ **A BFF nunca faz passthrough cru** (CLAUDE.md §Frontend): cada payload
 * passa por um mapper com a interface `Backend*` explícita.
 *
 * ⚠️ **Nenhuma regra de cálculo vive aqui.** Fase, desfecho do ciclo, dias
 * úteis, SLA e quais cartões aparecem são vereditos do backend — a tela só
 * formata e desenha. A proporção das barras é a régua compartilhada com os
 * quadros do resumo ({@link proportions}).
 */

import { proportions } from './resumo-mapping';

type Gap = { secao: string; fonte: string; motivo: string };

export interface OpcaoAnalista {
  id: string;
  nome: string;
  total: number;
}

// ── Distribuição por fase ────────────────────────────────────────────────────

export interface BackendDistribuicaoPorFase {
  itens: { fase: string; label: string; total: number }[];
  total: number | null;
  analistas: OpcaoAnalista[];
  gaps: Gap[];
}

export interface FaseBarra {
  fase: string;
  label: string;
  quantidade: number;
  /** [0–100], relativo à maior fase. */
  percentual: number;
}

export interface DistribuicaoPorFaseData {
  itens: FaseBarra[];
  total: number | null;
  analistas: OpcaoAnalista[];
  gaps: Gap[];
}

function mapAnalistas(raw: OpcaoAnalista[] | undefined): OpcaoAnalista[] {
  return (raw ?? []).map((a) => ({ id: a.id, nome: a.nome || a.id, total: a.total }));
}

export function mapDistribuicaoPorFase(raw: BackendDistribuicaoPorFase): DistribuicaoPorFaseData {
  const itens = raw.itens ?? [];
  const pct = proportions(itens.map((i) => i.total));
  return {
    itens: itens.map((i, idx) => ({
      fase: i.fase,
      // Rótulo do backend; o valor cru só se faltar (expõe a lacuna).
      label: i.label || i.fase,
      quantidade: i.total,
      percentual: pct[idx],
    })),
    total: typeof raw.total === 'number' ? raw.total : null,
    analistas: mapAnalistas(raw.analistas),
    gaps: raw.gaps ?? [],
  };
}

// ── Distribuição por analista (com status) ───────────────────────────────────

export interface BackendDistribuicaoPorAnalista {
  itens: { analistaId: string | null; analistaNome: string | null; total: number }[];
  fases: { fase: string; label: string }[];
  gaps: Gap[];
}

export interface AnalistaBarra {
  /** `null` = linha "Sem analista" (vermelha). */
  analistaId: string | null;
  /** Rótulo pronto: nome, id quando o nome falta, ou "Sem analista". */
  label: string;
  semAnalista: boolean;
  quantidade: number;
  percentual: number;
}

export interface DistribuicaoPorAnalistaData {
  itens: AnalistaBarra[];
  fases: { fase: string; label: string }[];
  gaps: Gap[];
}

export function mapDistribuicaoPorAnalista(
  raw: BackendDistribuicaoPorAnalista,
): DistribuicaoPorAnalistaData {
  const itens = raw.itens ?? [];
  const pct = proportions(itens.map((i) => i.total));
  return {
    itens: itens.map((i, idx) => {
      // `== null` frouxo: payload antigo pode trazer `undefined`.
      const semAnalista = i.analistaId == null || i.analistaId === '';
      return {
        analistaId: semAnalista ? null : i.analistaId,
        label: semAnalista ? 'Sem analista' : i.analistaNome || i.analistaId!,
        semAnalista,
        quantidade: i.total,
        percentual: pct[idx],
      };
    }),
    fases: (raw.fases ?? []).map((f) => ({ fase: f.fase, label: f.label || f.fase })),
    gaps: raw.gaps ?? [],
  };
}

// ── Indicadores da SNEG ──────────────────────────────────────────────────────

/** Espelho de `UnidadeIndicador` do backend. */
export const UnidadeIndicador = {
  DiasUteis: 'DIAS_UTEIS',
  Percentual: 'PERCENTUAL',
} as const;

export type UnidadeIndicador = (typeof UnidadeIndicador)[keyof typeof UnidadeIndicador];

export interface BackendIndicadoresSneg {
  atribuicao: string;
  atribuicoes: { atribuicao: string; label: string }[];
  analistas: OpcaoAnalista[];
  cartoes: {
    indicador: string;
    label: string;
    valor: number | null;
    unidade: string;
    slaDiasUteis: number | null;
  }[];
  gaps: Gap[];
}

export interface CartaoIndicador {
  indicador: string;
  label: string;
  /** Texto pronto: "0,2 d", "12,5%" ou "—" sem amostra. */
  valorTexto: string;
  /** Rodapé "SLA: 5 dias"; `null` = o cartão não tem rodapé. */
  slaTexto: string | null;
}

export interface IndicadoresSnegData {
  atribuicao: string;
  atribuicoes: { atribuicao: string; label: string }[];
  analistas: OpcaoAnalista[];
  cartoes: CartaoIndicador[];
  gaps: Gap[];
}

const UMA_CASA = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * "0,2 d" / "12,5%" — uma casa decimal, vírgula pt-BR (§4: *"Tempo deve ser
 * mostrado em dias úteis (ex.: '0,2 d') e taxa em percentual"*). Sem amostra ⇒
 * travessão: "0,0 d" afirmaria resposta imediata.
 */
export function formatarValorIndicador(valor: number | null, unidade: string): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  const n = UMA_CASA.format(valor);
  return unidade === UnidadeIndicador.Percentual ? `${n}%` : `${n} d`;
}

export function mapIndicadoresSneg(raw: BackendIndicadoresSneg): IndicadoresSnegData {
  return {
    atribuicao: raw.atribuicao,
    atribuicoes: (raw.atribuicoes ?? []).map((a) => ({
      atribuicao: a.atribuicao,
      label: a.label || a.atribuicao,
    })),
    analistas: mapAnalistas(raw.analistas),
    cartoes: (raw.cartoes ?? []).map((c) => ({
      indicador: c.indicador,
      label: c.label || c.indicador,
      valorTexto: formatarValorIndicador(c.valor, c.unidade),
      slaTexto:
        typeof c.slaDiasUteis === 'number'
          ? `SLA: ${c.slaDiasUteis} ${c.slaDiasUteis === 1 ? 'dia' : 'dias'}`
          : null,
    })),
    gaps: raw.gaps ?? [],
  };
}
