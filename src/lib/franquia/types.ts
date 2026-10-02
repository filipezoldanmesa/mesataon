/**
 * Frontend mirror of the franchise domain enums (`apps/api/src/franquia/domain/`).
 *
 * Declared `as const` so every comparison in the UI is against a NAMED member,
 * never a loose string literal (CLAUDE.md §"Enum do backend atravessa o BFF
 * 1:1"). The backend stays the single source of truth — this file only lets the
 * screen display and disable; the real enforcement is the API (403 / 400).
 *
 * Unknown wire values resolve to `null` through the type guards, never to the
 * first enum member: silently misidentifying a royalty model would change which
 * economic block the reader believes they are looking at.
 *
 * @see apps/api/src/franquia/read-model/proposta-franquia-read-model.domain.ts
 */

import type { PillVariant } from '@/components/status-pill';

// ---------------------------------------------------------------------------
// BandeiraFranquia — franchise band (also the SAP material code)
// ---------------------------------------------------------------------------

export const BandeiraFranquia = {
  BrMania: 'ZBRM',
  LubraxMais: 'ZLUB',
} as const;

export type BandeiraFranquia =
  (typeof BandeiraFranquia)[keyof typeof BandeiraFranquia];

export const BANDEIRA_FRANQUIA_LABEL: Record<BandeiraFranquia, string> = {
  [BandeiraFranquia.BrMania]: 'BR Mania',
  [BandeiraFranquia.LubraxMais]: 'Lubrax+',
};

export function isBandeiraFranquia(value: unknown): value is BandeiraFranquia {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(BANDEIRA_FRANQUIA_LABEL, value)
  );
}

/**
 * Rótulo do **grupo de contas** — o valor que o org publica, verbatim.
 *
 * Medido em 25/08/2026 (`Account.Grupo_De_Contas__c`, describe da UAT):
 * é picklist de 13 valores ativos, e `ZBRM`/`ZLUB` estão entre eles com os
 * rótulos `"ZBRM - BR MANIA"` e `"ZLUB - LUBRAX+"` — 4.701 e 3.659 contas.
 *
 * Ou seja, a bandeira é **as duas coisas**: o grupo de contas da conta de
 * franquia no CRM *e* o código de franquia que a pendência FRQ-19
 * (`CODIGO_FRANQUIA_ZBRM_ZLUB`) cobra. Por isso o card mostra os dois campos —
 * é o que o protótipo faz — e não é redundância: um é o cadastro no CRM, o
 * outro é o código que vai ao contrato.
 *
 * O rótulo é do org e não uma composição nossa (`${b} - ${label}`): o org
 * escreve a bandeira em CAIXA ALTA (`BR MANIA`, `LUBRAX+`) e o nosso
 * `BANDEIRA_FRANQUIA_LABEL` em caixa mista (`BR Mania`, `Lubrax+`) — compor
 * produziria uma terceira grafia que não existe em lugar nenhum.
 */
export const GRUPO_CONTAS_LABEL: Record<BandeiraFranquia, string> = {
  [BandeiraFranquia.BrMania]: 'ZBRM - BR MANIA',
  [BandeiraFranquia.LubraxMais]: 'ZLUB - LUBRAX+',
};

// ---------------------------------------------------------------------------
// SituacaoLoja — current state of the store
// ---------------------------------------------------------------------------

export const SituacaoLoja = {
  Nova: 'NOVA',
  EmOperacao: 'EM_OPERACAO',
} as const;

export type SituacaoLoja = (typeof SituacaoLoja)[keyof typeof SituacaoLoja];

export const SITUACAO_LOJA_LABEL: Record<SituacaoLoja, string> = {
  [SituacaoLoja.Nova]: 'Nova',
  [SituacaoLoja.EmOperacao]: 'Em operação',
};

export function isSituacaoLoja(value: unknown): value is SituacaoLoja {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SITUACAO_LOJA_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// ModeloNegocio / FormatoLoja / ModeloRoyalty — commercial parameters (FRQ-12)
// ---------------------------------------------------------------------------

export const ModeloNegocio = {
  Rodovia: 'RODOVIA',
  Urbano: 'URBANO',
} as const;

export type ModeloNegocio = (typeof ModeloNegocio)[keyof typeof ModeloNegocio];

export const MODELO_NEGOCIO_LABEL: Record<ModeloNegocio, string> = {
  [ModeloNegocio.Rodovia]: 'Rodovia',
  [ModeloNegocio.Urbano]: 'Urbano',
};

export function isModeloNegocio(value: unknown): value is ModeloNegocio {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(MODELO_NEGOCIO_LABEL, value)
  );
}

export const FormatoLoja = {
  Padrao: 'PADRAO',
  Ponto: 'PONTO',
  SuperCompacta: 'SUPER_COMPACTA',
} as const;

export type FormatoLoja = (typeof FormatoLoja)[keyof typeof FormatoLoja];

export const FORMATO_LOJA_LABEL: Record<FormatoLoja, string> = {
  [FormatoLoja.Padrao]: 'Padrão',
  [FormatoLoja.Ponto]: 'Ponto',
  [FormatoLoja.SuperCompacta]: 'Super compacta',
};

export function isFormatoLoja(value: unknown): value is FormatoLoja {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(FORMATO_LOJA_LABEL, value)
  );
}

export const ModeloRoyalty = {
  ValorFixo: 'VALOR_FIXO',
  PercentualUnico: 'PERCENTUAL_UNICO',
  PercentualEscalonado: 'PERCENTUAL_ESCALONADO',
  PorCategoria: 'POR_CATEGORIA',
  /** Lubrax+ only (22/09/2026) — percentual e mínimo pelo modelo de negócio. */
  PercentualFixo: 'PERCENTUAL_FIXO',
} as const;

export type ModeloRoyalty = (typeof ModeloRoyalty)[keyof typeof ModeloRoyalty];

export const MODELO_ROYALTY_LABEL: Record<ModeloRoyalty, string> = {
  [ModeloRoyalty.ValorFixo]: 'Valor fixo',
  [ModeloRoyalty.PercentualUnico]: 'Percentual único',
  [ModeloRoyalty.PercentualEscalonado]: 'Percentual escalonado',
  [ModeloRoyalty.PorCategoria]: 'Por categoria',
  [ModeloRoyalty.PercentualFixo]: 'Percentual fixo',
};

export function isModeloRoyalty(value: unknown): value is ModeloRoyalty {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(MODELO_ROYALTY_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// StatusCof — COF dispatch lifecycle (FRQ-13)
// ---------------------------------------------------------------------------

export const StatusCof = {
  Pendente: 'PENDENTE',
  Enviada: 'ENVIADA',
  EmElaboracao: 'EM_ELABORACAO',
  AguardandoAssinatura: 'AGUARDANDO_ASSINATURA',
  Assinado: 'ASSINADO',
  Cancelado: 'CANCELADO',
} as const;

export type StatusCof = (typeof StatusCof)[keyof typeof StatusCof];

export const STATUS_COF_LABEL: Record<StatusCof, string> = {
  [StatusCof.Pendente]: 'Pendente de disparo',
  [StatusCof.Enviada]: 'Enviada',
  [StatusCof.EmElaboracao]: 'Em elaboração',
  [StatusCof.AguardandoAssinatura]: 'Aguardando assinatura',
  [StatusCof.Assinado]: 'Assinado',
  [StatusCof.Cancelado]: 'Cancelado',
};

export function isStatusCof(value: unknown): value is StatusCof {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(STATUS_COF_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// ResultadoParecerFranquia — anticipated opinion outcome (FRQ-13)
// ---------------------------------------------------------------------------

export const ResultadoParecerFranquia = {
  Aprovado: 'APROVADO',
  AprovadoComRessalvas: 'APROVADO_COM_RESSALVAS',
  Rejeitado: 'REJEITADO',
} as const;

export type ResultadoParecerFranquia =
  (typeof ResultadoParecerFranquia)[keyof typeof ResultadoParecerFranquia];

export const RESULTADO_PARECER_FRANQUIA_LABEL: Record<
  ResultadoParecerFranquia,
  string
> = {
  [ResultadoParecerFranquia.Aprovado]: 'Aprovado',
  [ResultadoParecerFranquia.AprovadoComRessalvas]: 'Aprovado com ressalvas',
  [ResultadoParecerFranquia.Rejeitado]: 'Rejeitado',
};

export function isResultadoParecerFranquia(
  value: unknown,
): value is ResultadoParecerFranquia {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(
      RESULTADO_PARECER_FRANQUIA_LABEL,
      value,
    )
  );
}

// ---------------------------------------------------------------------------
// Pill codes
// ---------------------------------------------------------------------------

/** Prototype pill codes emitted by the read model. */
export type FrqPillCode = 'i' | 'w' | 's' | 'n' | 'd';

const PILL_CODES = new Set<FrqPillCode>(['i', 'w', 's', 'n', 'd']);

export function isFrqPillCode(value: unknown): value is FrqPillCode {
  return typeof value === 'string' && PILL_CODES.has(value as FrqPillCode);
}

/**
 * Single source for pill code → `StatusPill` variant on the franchise screens.
 *
 * An unknown/absent code falls back to `neutral` — never to a colour that would
 * read as a verdict the backend did not author (ADR-0018 §medida × veredito).
 */
export function franquiaPillVariant(
  code: FrqPillCode | null | undefined,
): PillVariant {
  switch (code) {
    case 's':
      return 'success';
    case 'w':
      return 'warning';
    case 'd':
      return 'danger';
    case 'i':
      return 'info';
    default:
      return 'neutral';
  }
}
