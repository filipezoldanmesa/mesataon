import { NextResponse } from 'next/server';

import { ESTADO_CIVIL } from '@/lib/garantia/constants';
import {
  GARANTIA_CATEGORIA_OPTIONS,
  GARANTIA_ORIGEM_OPTIONS,
  GARANTIA_TIPO_OPTIONS,
} from '@/lib/garantia/indicacoes.types';
import type {
  EstadoCivil,
  GarantiaCategoria,
  GarantiaIndicacaoInput,
  GarantiaOrigem,
  GarantiaTipoOption,
} from '@/lib/garantia/indicacoes.types';

/**
 * Validação do corpo da garantia indicada, compartilhada pelas duas rotas BFF
 * que a escrevem: `POST .../garantias` e `PATCH .../garantias/:garantiaId`.
 *
 * Uma implementação só porque o corpo é o mesmo — o update é substituição
 * completa do registro, não *merge* de campos presentes. Precedente literal:
 * `parseExcecaoPayload` (ADO 67802), pela mesma razão: duas cópias divergiriam
 * no dia em que um campo novo entrasse só numa delas, e o sintoma seria a
 * alteração aceitando o que a criação recusa.
 *
 * ## Por que existe
 *
 * As duas rotas faziam `(await request.json()) as GarantiaIndicacaoInput` e
 * entregavam o resultado a `mapInputToBackend`, que chama
 * `input.imovel.trim()`. O `as` é asserção, não verificação: **compila e falha
 * em runtime** — o passthrough cru que o CLAUDE.md proíbe na BFF. Corpo sem
 * `imovel`/`matricula`/`observacoes` respondia **500 com corpo vazio**
 * (`TypeError: Cannot read properties of undefined (reading 'trim')`,
 * `indicacoes-mapping.ts:156`), antes de qualquer chamada de rede.
 *
 * Inalcançável pela interface — os oito campos são obrigatórios em
 * `GarantiaIndicacaoInput` e o card semeia `EMPTY_FORM` com strings, então todo
 * call site tipado os manda. Alcançável por qualquer chamador direto da BFF.
 *
 * ## Valida FORMA, nunca regra de negócio
 *
 * A ausência de um campo é **400**, e não um default: `?? ''` faria o mapper
 * omitir o campo, e o `imovel` é `@IsOptional()` no DTO do backend **mesmo para
 * `GARANTIA_REAL`** — ou seja, o default gravaria uma garantia real **sem
 * imóvel**, em silêncio e com 201. Trocar um 500 que recusa por um 201 que
 * persiste registro parcial é piorar.
 *
 * E a recusa não inventa exigência que o backend não tem: ela diz "este corpo
 * não casa com o contrato", não "garantia real precisa de imóvel". Quem decide
 * o que cada tipo exige continua sendo o `GarantiaIndicacaoUpsertDto`
 * (`@ValidateIf(exigeImovel)` / `@IsEmptyWhen`) — string vazia segue permitida
 * e segue sendo omitida pelo mapper.
 *
 * `tipo` e `origem` são conjuntos FECHADOS de rótulos, e um valor fora deles
 * faz `TIPO_LABEL_TO_CODE[...]` devolver `undefined` — o campo desaparece do
 * corpo e o backend recusa por "tipo obrigatório", mensagem que aponta para o
 * lugar errado. Validar aqui nomeia o rótulo inválido.
 */

/** O corpo já verificado, na forma que `mapInputToBackend` consome. */
export type GarantiaPayloadOutcome =
  | { ok: true; input: GarantiaIndicacaoInput }
  | { ok: false; response: NextResponse };

function erro(mensagem: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: mensagem }, { status: 400 }) };
}

/** Os fiadores, verificados na FORMA — nunca na regra de negócio do tipo. */
function validarFiadores(
  raw: unknown,
):
  | { ok: true; valor: GarantiaIndicacaoInput['fiadores'] }
  | { ok: false; response: NextResponse } {
  if (raw === undefined || raw === null) return { ok: true, valor: undefined };
  if (!Array.isArray(raw)) return erro('Campo "fiadores" inválido.');

  const valor: NonNullable<GarantiaIndicacaoInput['fiadores']> = [];
  for (const [i, item] of raw.entries()) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return erro(`Fiador ${i + 1} inválido.`);
    }
    const f = item as Record<string, unknown>;

    if (typeof f.nome !== 'string' || f.nome.trim() === '') {
      return erro(`Informe o nome do fiador ${i + 1}.`);
    }
    if (typeof f.documento !== 'string' || f.documento.trim() === '') {
      return erro(`Informe o documento (CPF/CNPJ) do fiador ${i + 1}.`);
    }

    // Pessoa JURÍDICA (o banco) não tem nenhum dos três — ausente é legítimo.
    if (
      f.estadoCivil !== undefined &&
      !Object.values(ESTADO_CIVIL).includes(f.estadoCivil as EstadoCivil)
    ) {
      return erro(`Estado civil do fiador ${i + 1} inválido.`);
    }
    for (const campo of ['conjugeNome', 'conjugeDocumento'] as const) {
      if (f[campo] !== undefined && typeof f[campo] !== 'string') {
        return erro(`Campo "${campo}" do fiador ${i + 1} inválido.`);
      }
    }

    valor.push({
      nome: f.nome,
      documento: f.documento,
      ...(f.estadoCivil === undefined ? {} : { estadoCivil: f.estadoCivil as EstadoCivil }),
      ...(f.conjugeNome === undefined ? {} : { conjugeNome: f.conjugeNome as string }),
      ...(f.conjugeDocumento === undefined
        ? {}
        : { conjugeDocumento: f.conjugeDocumento as string }),
    });
  }

  return { ok: true, valor };
}

/**
 * Valida o corpo da indicação.
 *
 * `categoria` aceita `null` ("Selecione…" — o tipo já o declara nullable);
 * `utilizacao` é `string` aberta de propósito (as opções vêm do catálogo de
 * picklists, não de uma união literal aqui), e `''` significa "Nenhum", que o
 * mapper converte no `null` explícito que apaga a utilização anterior.
 */
export function parseGarantiaIndicacaoPayload(raw: unknown): GarantiaPayloadOutcome {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return erro('Corpo da requisição inválido.');
  }

  const body = raw as Record<string, unknown>;

  if (
    typeof body.tipo !== 'string' ||
    !(GARANTIA_TIPO_OPTIONS as readonly string[]).includes(body.tipo)
  ) {
    return erro('Informe o tipo da garantia.');
  }

  if (
    typeof body.origem !== 'string' ||
    !(GARANTIA_ORIGEM_OPTIONS as readonly string[]).includes(body.origem)
  ) {
    return erro('Informe a origem da garantia.');
  }

  // Texto livre: presente e string, podendo ser vazia. Vazia é resposta
  // legítima ("não informado") e o mapper a omite; AUSENTE é corpo malformado.
  for (const campo of ['imovel', 'valor', 'observacoes'] as const) {
    if (typeof body[campo] !== 'string') {
      return erro(`Campo "${campo}" ausente ou inválido.`);
    }
  }

  if (typeof body.utilizacao !== 'string') {
    return erro('Campo "utilizacao" ausente ou inválido.');
  }

  if (
    body.categoria !== null &&
    (typeof body.categoria !== 'string' ||
      !(GARANTIA_CATEGORIA_OPTIONS as readonly string[]).includes(body.categoria))
  ) {
    return erro('Categoria do bem inválida.');
  }

  /*
   * Estado civil (31/08/2026) — `null`/ausente é resposta legítima, diferente dos
   * campos de texto acima: o campo só existe nos tipos de `exigeEstadoCivil`, e
   * exigir presença aqui recusaria toda garantia real e toda fiança bancária.
   * Quem decide em QUAL tipo ele é aceito é o DTO do backend (`@IsEmptyWhen`);
   * aqui só se verifica que, quando vem, o valor pertence ao vocabulário.
   */
  const estadoCivil = body.estadoCivil ?? null;
  if (
    estadoCivil !== null &&
    !Object.values(ESTADO_CIVIL).includes(estadoCivil as EstadoCivil)
  ) {
    return erro('Estado civil inválido.');
  }

  /*
   * HIP-01 — array de strings. `[]` é resposta legítima (o tipo pode não ter bem,
   * ou o usuário ainda não informou nenhuma); AUSENTE é corpo malformado, como
   * nos campos de texto acima.
   */
  if (
    !Array.isArray(body.matriculas) ||
    body.matriculas.some((m) => typeof m !== 'string')
  ) {
    return erro('Campo "matriculas" ausente ou inválido.');
  }

  /*
   * HIP-02 — inteiro ≥ 1 ou `null`. `null` é "não declarado" (o backend lê como
   * 1); `0` e fracionário são recusados aqui em vez de virarem 400 no backend com
   * uma frase sobre `@Min`.
   */
  if (
    body.quantidadeLaudos !== null &&
    (typeof body.quantidadeLaudos !== 'number' ||
      !Number.isInteger(body.quantidadeLaudos) ||
      body.quantidadeLaudos < 1)
  ) {
    return erro('Campo "quantidadeLaudos" inválido — informe um inteiro maior que zero.');
  }

  /*
   * GER-03 — a resposta é OBRIGATÓRIA, e é aqui que a exigência aparece na borda
   * da BFF: sem ela o backend responderia 400 e a frase chegaria como erro
   * genérico.
   */
  if (typeof body.compartilhada !== 'boolean') {
    return erro('Informe se a garantia será compartilhada com outras oportunidades.');
  }
  if (typeof body.detalhesCompartilhamento !== 'string') {
    return erro('Campo "detalhesCompartilhamento" ausente ou inválido.');
  }
  if (body.compartilhada && body.detalhesCompartilhamento.trim() === '') {
    return erro(
      'Informe os números das oportunidades e/ou detalhes do compartilhamento.',
    );
  }

  /*
   * Cidade e UF do imóvel (02/09/2026) — OPCIONAIS, e é a diferença que importa:
   * o card só as envia sob `needsImovel`, então exigir presença recusaria toda
   * fiança bancária. Quando vêm, têm de ser string.
   */
  for (const campo of ['imovelCidade', 'imovelUf'] as const) {
    if (body[campo] !== undefined && typeof body[campo] !== 'string') {
      return erro(`Campo "${campo}" inválido.`);
    }
  }

  /*
   * FB-01/FB-02 — os fiadores (na fiança bancária, o BANCO: nome + CNPJ).
   *
   * OPCIONAIS: o campo só existe nos tipos de `exigeFiador`, e o card manda
   * `undefined` quando nenhum bloco foi preenchido. Quem decide em QUAL tipo
   * eles são aceitos é o DTO do backend (`@ValidateIf`/`@IsEmptyWhen`) — aqui só
   * se verifica a FORMA, como no estado civil acima.
   *
   * `nome` e `documento` são exigidos por ITEM porque `FiadorDto` os exige: um
   * item pela metade viraria 400 no backend com uma frase que não diz qual dos N
   * blocos está incompleto.
   */
  const fiadores = validarFiadores(body.fiadores);
  if (!fiadores.ok) return fiadores;

  return {
    ok: true,
    input: {
      tipo: body.tipo as GarantiaTipoOption,
      origem: body.origem as GarantiaOrigem,
      utilizacao: body.utilizacao,
      imovel: body.imovel as string,
      matriculas: body.matriculas as string[],
      quantidadeLaudos: body.quantidadeLaudos as number | null,
      categoria: body.categoria as GarantiaCategoria | null,
      estadoCivil: estadoCivil as EstadoCivil | null,
      valor: body.valor as string,
      compartilhada: body.compartilhada,
      detalhesCompartilhamento: body.detalhesCompartilhamento,
      observacoes: body.observacoes as string,
      /*
       * ⚠️ Estes três chegaram ao card em 02/09/2026 e NÃO estavam aqui — o
       * parser monta o `input` a partir de uma lista fechada, então campo que
       * ele não conhece é DESCARTADO em silêncio. Sintoma medido no stage: o
       * nome e o CNPJ do banco eram digitados, o card salvava com 201, a linha
       * exibia "—" e reabrir para editar vinha vazio.
       */
      imovelCidade: body.imovelCidade as string | undefined,
      imovelUf: body.imovelUf as string | undefined,
      fiadores: fiadores.valor,
    },
  };
}
