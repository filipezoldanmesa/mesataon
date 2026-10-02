import {
  CATEGORIA_BEM,
  ESTADO_CIVIL,
  ORIGEM_GARANTIA,
  TIPO_GARANTIA,
  exigeConjuge,
  exigeFiador,
  exigeImovel,
  fiadorEhPessoaJuridica as ehPessoaJuridica,
  type CategoriaBem,
  type EstadoCivil,
  type OrigemGarantia,
  type TipoGarantia,
} from '@/lib/garantia/constants';
import type { GarantiaIndicarPayload } from '@/lib/garantia/indicacao-mapping';
import { TIPO_LABEL_TO_CODE, parseValorBrl } from '@/lib/garantia/indicacoes-mapping';
import {
  enderecoCompleto,
  type EnderecoPessoa,
  GARANTIA_CATEGORIA_OPTIONS,
  GARANTIA_ORIGEM_OPTIONS,
  GARANTIA_TIPO_OPTIONS,
  type GarantiaCategoria,
  type GarantiaTipoOption,
} from '@/lib/garantia/indicacoes.types';

import { novoId } from '../../core/store';
import type { FiadorInt, IndicacaoInt, MatriculaInt } from './semente';

/**
 * Corpos de escrita da garantia → registro interno.
 *
 * Dois corpos para o mesmo registro, como em produção: o CARD manda rótulos
 * pt-BR (`GarantiaIndicacaoInput`, validado como `parseGarantiaIndicacaoPayload`
 * da BFF) e o TICKET manda códigos (`GarantiaIndicarPayload`). A escrita é
 * substituição completa; documentos e anexos legados ficam com a linha.
 */

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

const CATEGORIA_LABEL_TO_CODE: Record<GarantiaCategoria, CategoriaBem> = {
  Posto: 'POSTO',
  Comercial: 'COMERCIAL',
  Residencial: 'RESIDENCIAL',
  Rural: 'RURAL',
};

function ehEstadoCivil(v: unknown): v is EstadoCivil {
  return typeof v === 'string' && (Object.values(ESTADO_CIVIL) as string[]).includes(v);
}

type CamposDaLinha = Omit<IndicacaoInt, 'id' | 'criadaEm' | 'documentos' | 'legado'>;

const textoOuNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** `null` quando ausente ou incompleto (só o complemento é opcional). */
function enderecoDe(raw: unknown): EnderecoPessoa | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const endereco: EnderecoPessoa = {
    cep: textoOuNull(e.cep) ?? '',
    logradouro: textoOuNull(e.logradouro) ?? '',
    numero: textoOuNull(e.numero) ?? '',
    complemento: textoOuNull(e.complemento) ?? '',
    bairro: textoOuNull(e.bairro) ?? '',
    cidade: textoOuNull(e.cidade) ?? '',
    uf: textoOuNull(e.uf) ?? '',
  };
  return enderecoCompleto(endereco) ? endereco : null;
}

function fiadoresDe(
  raw: unknown,
  anteriores: FiadorInt[],
): Resultado<FiadorInt[]> {
  if (raw === undefined || raw === null) return { ok: true, valor: [] };
  if (!Array.isArray(raw)) return falha('Campo "fiadores" inválido.');
  const out: FiadorInt[] = [];
  for (const [i, item] of raw.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return falha(`Fiador ${i + 1} inválido.`);
    const f = item as Record<string, unknown>;
    if (typeof f.nome !== 'string' || !f.nome.trim()) return falha(`Informe o nome do fiador ${i + 1}.`);
    if (typeof f.documento !== 'string' || !f.documento.trim()) {
      return falha(`Informe o documento (CPF/CNPJ) do fiador ${i + 1}.`);
    }
    if (f.estadoCivil !== undefined && f.estadoCivil !== null && !ehEstadoCivil(f.estadoCivil)) {
      return falha(`Estado civil do fiador ${i + 1} inválido.`);
    }
    const email = textoOuNull(f.email);
    const profissao = textoOuNull(f.profissao);
    const endereco = enderecoDe(f.endereco);
    const conjugeEmail = textoOuNull(f.conjugeEmail);
    const conjugeProfissao = textoOuNull(f.conjugeProfissao);
    const conjugeEndereco = enderecoDe(f.conjugeEndereco);
    // Regra do DTO: pessoa física informa e-mail, profissão e endereço completo
    // (o banco, CNPJ, não); com cônjuge, o cônjuge também.
    if (!ehPessoaJuridica(f.documento)) {
      if (!email || !profissao || !endereco) {
        return falha(`Informe e-mail, profissão e endereço completo do fiador ${i + 1}.`);
      }
      if (ehEstadoCivil(f.estadoCivil) && exigeConjuge(f.estadoCivil)) {
        if (!conjugeEmail || !conjugeProfissao || !conjugeEndereco) {
          return falha(`Informe e-mail, profissão e endereço completo do cônjuge do fiador ${i + 1}.`);
        }
      }
    }
    // Mantém o id do fiador na mesma posição: a certidão de casamento é dele.
    out.push({
      id: anteriores[i]?.id ?? novoId('gfi'),
      nome: f.nome.trim(),
      documento: f.documento.trim(),
      estadoCivil: ehEstadoCivil(f.estadoCivil) ? f.estadoCivil : null,
      conjugeNome: typeof f.conjugeNome === 'string' && f.conjugeNome.trim() ? f.conjugeNome.trim() : null,
      conjugeDocumento:
        typeof f.conjugeDocumento === 'string' && f.conjugeDocumento.trim() ? f.conjugeDocumento.trim() : null,
      email,
      profissao,
      endereco,
      conjugeEmail,
      conjugeProfissao,
      conjugeEndereco,
    });
  }
  return { ok: true, valor: out };
}

/** Preserva o id da matrícula de mesmo número (é a chave da certidão, HIP-03). */
function matriculasDe(numeros: string[], anteriores: MatriculaInt[]): MatriculaInt[] {
  return numeros
    .map((n) => n.trim())
    .filter(Boolean)
    .map((numero, i) => ({
      id: anteriores.find((m) => m.numero === numero)?.id ?? novoId('gmat'),
      ordem: i + 1,
      numero,
    }));
}

/** Regras do DTO do backend que a tela precisa ver recusadas. */
function regrasDeTipo(c: CamposDaLinha): string | null {
  if (exigeFiador(c.tipo) && c.fiadores.length === 0) return 'Informe ao menos um fiador para este tipo de garantia.';
  if (c.compartilhada && !c.detalhesCompartilhamento) {
    return 'Informe os números das oportunidades e/ou detalhes do compartilhamento.';
  }
  return null;
}

/** Corpo do CARD (`POST`/`PATCH .../garantias`). */
export function linhaDoCard(raw: unknown, anterior?: IndicacaoInt): Resultado<CamposDaLinha> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return falha('Corpo da requisição inválido.');
  const b = raw as Record<string, unknown>;
  if (typeof b.tipo !== 'string' || !(GARANTIA_TIPO_OPTIONS as readonly string[]).includes(b.tipo)) {
    return falha('Informe o tipo da garantia.');
  }
  if (typeof b.origem !== 'string' || !(GARANTIA_ORIGEM_OPTIONS as readonly string[]).includes(b.origem)) {
    return falha('Informe a origem da garantia.');
  }
  for (const campo of ['imovel', 'valor', 'observacoes', 'utilizacao'] as const) {
    if (typeof b[campo] !== 'string') return falha(`Campo "${campo}" ausente ou inválido.`);
  }
  if (b.categoria !== null && (typeof b.categoria !== 'string' || !(GARANTIA_CATEGORIA_OPTIONS as readonly string[]).includes(b.categoria))) {
    return falha('Categoria do bem inválida.');
  }
  const estadoCivil = b.estadoCivil ?? null;
  if (estadoCivil !== null && !ehEstadoCivil(estadoCivil)) return falha('Estado civil inválido.');
  if (!Array.isArray(b.matriculas) || b.matriculas.some((m) => typeof m !== 'string')) {
    return falha('Campo "matriculas" ausente ou inválido.');
  }
  if (
    b.quantidadeLaudos !== null &&
    (typeof b.quantidadeLaudos !== 'number' || !Number.isInteger(b.quantidadeLaudos) || b.quantidadeLaudos < 1)
  ) {
    return falha('Campo "quantidadeLaudos" inválido — informe um inteiro maior que zero.');
  }
  if (typeof b.compartilhada !== 'boolean') return falha('Informe se a garantia será compartilhada com outras oportunidades.');
  if (typeof b.detalhesCompartilhamento !== 'string') return falha('Campo "detalhesCompartilhamento" ausente ou inválido.');
  const fiadores = fiadoresDe(b.fiadores, anterior?.fiadores ?? []);
  if (!fiadores.ok) return fiadores;

  const tipo = TIPO_LABEL_TO_CODE[b.tipo as GarantiaTipoOption] as TipoGarantia;
  const temBem = exigeImovel(tipo);
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const campos: CamposDaLinha = {
    tipo,
    origem: (b.origem === 'Nova' ? ORIGEM_GARANTIA.NOVA : ORIGEM_GARANTIA.EXISTENTE) as OrigemGarantia,
    utilizacao: (b.utilizacao as string) === '' ? null : (b.utilizacao as string),
    imovel: temBem ? texto(b.imovel) : null,
    imovelCidade: temBem ? texto(b.imovelCidade) : null,
    imovelUf: temBem ? texto(b.imovelUf) : null,
    matriculas: temBem ? matriculasDe(b.matriculas as string[], anterior?.matriculas ?? []) : [],
    quantidadeLaudos: temBem ? ((b.quantidadeLaudos as number | null) ?? null) : null,
    compartilhada: b.compartilhada,
    detalhesCompartilhamento: b.compartilhada ? texto(b.detalhesCompartilhamento) : null,
    categoria: temBem && b.categoria ? CATEGORIA_LABEL_TO_CODE[b.categoria as GarantiaCategoria] : null,
    estadoCivil: estadoCivil as EstadoCivil | null,
    valorAvaliadoBRL: parseValorBrl(b.valor as string) ?? null,
    observacoes: texto(b.observacoes),
    fiadores: exigeFiador(tipo) ? fiadores.valor : [],
    sapGarantiaExternaId: anterior?.sapGarantiaExternaId ?? null,
  };
  const regra = regrasDeTipo(campos);
  return regra ? falha(regra) : { ok: true, valor: campos };
}

/** Corpo do TICKET (`garantia:indicar` e `PATCH .../garantia/indicacoes/:id`). */
export function linhaDoTicket(raw: unknown, anterior?: IndicacaoInt): Resultado<CamposDaLinha> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return falha('Corpo inválido.');
  const b = raw as Partial<GarantiaIndicarPayload> & Record<string, unknown>;
  if (!b.tipo || !(Object.values(TIPO_GARANTIA) as string[]).includes(b.tipo)) return falha('Tipo de garantia inválido.');
  if (!b.origem || !(Object.values(ORIGEM_GARANTIA) as string[]).includes(b.origem)) return falha('Origem da garantia inválida.');
  if (typeof b.compartilhadaComOutrasOportunidades !== 'boolean') {
    return falha('Informe se a garantia será compartilhada com outras oportunidades.');
  }
  if (b.categoria !== undefined && !(Object.values(CATEGORIA_BEM) as string[]).includes(b.categoria)) {
    return falha('Categoria do bem inválida.');
  }
  if (b.origem === 'EXISTENTE' && !b.sapGarantiaExternaId?.trim()) {
    return falha('Selecione a garantia existente.');
  }
  const fiadores = fiadoresDe(b.fiadores, anterior?.fiadores ?? []);
  if (!fiadores.ok) return fiadores;

  const tipo = b.tipo;
  const temBem = exigeImovel(tipo);
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const campos: CamposDaLinha = {
    tipo,
    origem: b.origem,
    utilizacao: b.utilizacao ?? null,
    imovel: temBem ? texto(b.imovelEndereco) : null,
    imovelCidade: temBem ? texto(b.imovelCidade) : null,
    imovelUf: temBem ? texto(b.imovelUf) : null,
    matriculas: temBem
      ? matriculasDe((b.matriculas ?? []).map((m) => (typeof m?.numero === 'string' ? m.numero : '')), anterior?.matriculas ?? [])
      : [],
    quantidadeLaudos: temBem ? (b.quantidadeLaudos ?? null) : null,
    compartilhada: b.compartilhadaComOutrasOportunidades,
    detalhesCompartilhamento: b.compartilhadaComOutrasOportunidades ? texto(b.detalhesCompartilhamento) : null,
    categoria: temBem ? (b.categoria ?? null) : null,
    estadoCivil: fiadores.valor[0]?.estadoCivil ?? null,
    valorAvaliadoBRL: typeof b.valorAvaliadoBRL === 'number' && b.valorAvaliadoBRL > 0 ? b.valorAvaliadoBRL : null,
    observacoes: texto(b.observacoes),
    fiadores: exigeFiador(tipo) ? fiadores.valor : [],
    sapGarantiaExternaId: b.origem === 'EXISTENTE' ? (b.sapGarantiaExternaId?.trim() ?? null) : null,
  };
  const regra = regrasDeTipo(campos);
  return regra ? falha(regra) : { ok: true, valor: campos };
}
