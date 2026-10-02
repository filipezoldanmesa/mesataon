import { NextResponse } from 'next/server';

/**
 * Validação do corpo da exceção programada, compartilhada pelas duas rotas BFF
 * que a escrevem: `POST .../excecoes` e `PATCH .../excecoes/:excecaoId`
 * (ADO 67802).
 *
 * Uma implementação só porque o corpo é o mesmo — o update é substituição
 * completa do registro, não *merge* de campos presentes. Duas cópias
 * divergiriam no dia em que um campo novo entrasse só numa delas, e o sintoma
 * seria a alteração aceitando o que a criação recusa.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** O corpo já normalizado, pronto para seguir ao backend. */
export interface ExcecaoRequestBody {
  tipoExcecao: string;
  politicaExcecao: unknown;
  vigenciaInicio: unknown;
  vigenciaFim: unknown;
  valorOverrideBrl: number | null;
  motivo: string;
}

export type ExcecaoPayloadOutcome =
  | { ok: true; body: ExcecaoRequestBody }
  | { ok: false; response: NextResponse };

/**
 * Valida e normaliza o corpo da exceção.
 *
 * `motivo` é obrigatório e não pode ser em branco: o backend o grava para a
 * trilha SOX, e um motivo só de espaços seria persistido como justificativa
 * vazia. `vigenciaFim` nulo significa "por todo o contrato" (open-ended), por
 * isso segue como `null` explícito em vez de ser omitido.
 */
export function parseExcecaoPayload(raw: unknown): ExcecaoPayloadOutcome {
  const body = (raw ?? {}) as {
    tipoExcecao?: unknown;
    politicaExcecao?: unknown;
    vigenciaInicio?: unknown;
    vigenciaFim?: unknown;
    valorOverrideBrl?: unknown;
    motivo?: unknown;
  };

  if (typeof body.tipoExcecao !== 'string' || body.tipoExcecao.trim() === '') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Informe o tipo da exceção.' },
        { status: 400 },
      ),
    };
  }

  if (typeof body.motivo !== 'string' || body.motivo.trim() === '') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'O motivo da exceção é obrigatório.' },
        { status: 400 },
      ),
    };
  }

  for (const field of ['vigenciaInicio', 'vigenciaFim'] as const) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || !ISO_DATE.test(value)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Data inválida em "${field}".` },
          { status: 400 },
        ),
      };
    }
  }

  const valor = body.valorOverrideBrl;
  if (
    valor !== undefined &&
    valor !== null &&
    (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Valor de override deve ser um número não negativo.' },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    body: {
      tipoExcecao: body.tipoExcecao.trim(),
      politicaExcecao: body.politicaExcecao ?? null,
      vigenciaInicio: body.vigenciaInicio ?? null,
      vigenciaFim: body.vigenciaFim ?? null,
      valorOverrideBrl: (valor as number | undefined) ?? null,
      motivo: body.motivo.trim(),
    },
  };
}
