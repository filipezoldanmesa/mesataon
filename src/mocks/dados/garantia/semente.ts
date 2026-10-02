import type { CategoriaBem, EstadoCivil, OrigemGarantia, TipoGarantia } from '@/lib/garantia/constants';
import {
  TIPO_DOCUMENTO_CASAMENTO,
  TIPO_DOCUMENTO_CERTIDAO,
  TIPO_DOCUMENTO_ESTATUTO,
  TIPO_DOCUMENTO_LAUDO,
  TIPO_DOCUMENTO_MINUTA_FIANCA,
} from '@/lib/garantia/constants';
import type { EnderecoPessoa } from '@/lib/garantia/indicacoes.types';
import type { EstadoGarantia, ResultadoPrevia } from '@/lib/garantia/types';

/**
 * Estado interno do domínio garantia — a forma do BANCO (códigos de enum, valor
 * numérico), não a do front. Os handlers montam o DTO do backend a partir daqui
 * e o passam pelos MESMOS mappers que a BFF de produção usa, então a resposta é
 * idêntica à de produção por construção.
 *
 * Tudo fictício: nomes, CPFs/CNPJs (dígitos inválidos de propósito), matrículas.
 */

export interface MatriculaInt {
  id: string;
  ordem: number;
  numero: string;
}

export interface FiadorInt {
  id: string;
  nome: string;
  documento: string;
  estadoCivil: EstadoCivil | null;
  conjugeNome: string | null;
  conjugeDocumento: string | null;
  email: string | null;
  profissao: string | null;
  endereco: EnderecoPessoa | null;
  conjugeEmail: string | null;
  conjugeProfissao: string | null;
  conjugeEndereco: EnderecoPessoa | null;
}

export interface DocumentoInt {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  /** HIP-03 — a matrícula que a certidão lastreia. */
  matriculaId: string | null;
  /** A certidão de casamento é por fiador. */
  fiadorId: string | null;
}

export interface IndicacaoInt {
  id: string;
  tipo: TipoGarantia;
  origem: OrigemGarantia;
  utilizacao: string | null;
  imovel: string | null;
  imovelCidade: string | null;
  imovelUf: string | null;
  matriculas: MatriculaInt[];
  quantidadeLaudos: number | null;
  compartilhada: boolean | null;
  detalhesCompartilhamento: string | null;
  categoria: CategoriaBem | null;
  estadoCivil: EstadoCivil | null;
  valorAvaliadoBRL: number | null;
  observacoes: string | null;
  criadaEm: string;
  fiadores: FiadorInt[];
  documentos: DocumentoInt[];
  /** Colunas legadas da própria linha (slots `certidao`/`laudo`) — nome do arquivo. */
  legado: { certidao: string | null; laudo: string | null };
  sapGarantiaExternaId: string | null;
}

export interface PreviaInt {
  parecer: string | null;
  resultado: ResultadoPrevia | null;
  abertaEm: string;
  concluidaEm: string | null;
}

export interface AtribuicaoInt {
  analistaId: string | null;
  gerencia: string | null;
  atribuidaEm: string | null;
}

export type StatusPerfil = 'CONCLUIDO' | 'EM_EXECUCAO' | 'PENDENTE' | 'ENCERRADO';

export interface GarantiaOppInt {
  subprocessoId: string;
  estado: EstadoGarantia;
  /** Valor da antecipação/mútuo da concessão — `null` ⇒ concessão não exige garantia. */
  antecipacaoBRL: number | null;
  perfil: { status: StatusPerfil | null; classificacao: string | null };
  gerencia: string;
  atribuicaoCcob: AtribuicaoInt | null;
  atribuicaoSneg: AtribuicaoInt | null;
  pendenciaIndicacaoId: string | null;
  indicacoes: IndicacaoInt[];
  /** Todas as prévias, em ordem cronológica; a última é a corrente. */
  previas: PreviaInt[];
  minuta: { netlexNumero: string; status: string | null } | null;
  documentosLegado: Array<{ id: string; type: string; fileName: string; uploadedAt: string }>;
  indicacaoSubmetidaEm: string | null;
}

// ───────────────────────────── helpers de semente ─────────────────────────────

function doc(
  id: string,
  type: string,
  fileName: string,
  uploadedAt: string,
  vinculo: { matriculaId?: string; fiadorId?: string } = {},
): DocumentoInt {
  return {
    id,
    type,
    fileName,
    uploadedAt,
    matriculaId: vinculo.matriculaId ?? null,
    fiadorId: vinculo.fiadorId ?? null,
  };
}

function base(parcial: Partial<IndicacaoInt> & Pick<IndicacaoInt, 'id' | 'tipo' | 'criadaEm'>): IndicacaoInt {
  return {
    origem: 'NOVA',
    utilizacao: 'Concessão Financeira',
    imovel: null,
    imovelCidade: null,
    imovelUf: null,
    matriculas: [],
    quantidadeLaudos: null,
    compartilhada: false,
    detalhesCompartilhamento: null,
    categoria: null,
    estadoCivil: null,
    valorAvaliadoBRL: null,
    observacoes: null,
    fiadores: [],
    documentos: [],
    legado: { certidao: null, laudo: null },
    sapGarantiaExternaId: null,
    ...parcial,
  };
}

const CCOB = 'usr-ccob-gabriela';
const SNEG = 'usr-sneg-carla';

/** Garantia real sobre o imóvel do posto, completa (matrículas + certidões + laudo). */
function garantiaRealPosto(
  id: string,
  criadaEm: string,
  imovel: string,
  cidade: string,
  uf: string,
  matriculas: string[],
  valor: number,
): IndicacaoInt {
  const ms = matriculas.map((numero, i) => ({ id: `${id}-m${i + 1}`, ordem: i + 1, numero }));
  return base({
    id,
    tipo: 'GARANTIA_REAL',
    criadaEm,
    imovel,
    imovelCidade: cidade,
    imovelUf: uf,
    matriculas: ms,
    quantidadeLaudos: 1,
    categoria: 'POSTO',
    valorAvaliadoBRL: valor,
    documentos: [
      ...ms.map((m) =>
        doc(
          `${id}-cert${m.ordem}`,
          TIPO_DOCUMENTO_CERTIDAO,
          `certidao-inteiro-teor-matricula-${m.numero.replace(/\D/g, '')}.pdf`,
          criadaEm,
          { matriculaId: m.id },
        ),
      ),
      doc(`${id}-laudo1`, TIPO_DOCUMENTO_LAUDO, 'laudo-avaliacao-imovel-posto.pdf', criadaEm),
    ],
  });
}

export function sementeGarantias(): Record<string, GarantiaOppInt> {
  return {
    // Recém-criada: nada indicado, LT ainda preenchendo.
    'opp-001': {
      subprocessoId: 'gar-001',
      estado: 'AGUARDANDO_INDICACAO',
      antecipacaoBRL: 400_000,
      perfil: { status: null, classificacao: null },
      gerencia: 'Gerência Regional São Paulo Interior',
      atribuicaoCcob: null,
      atribuicaoSneg: null,
      pendenciaIndicacaoId: null,
      indicacoes: [],
      previas: [],
      minuta: null,
      documentosLegado: [],
      indicacaoSubmetidaEm: null,
    },

    // Pronta para o GATE 1: garantia real completa cadastrada pelo card.
    'opp-002': {
      subprocessoId: 'gar-002',
      estado: 'AGUARDANDO_INDICACAO',
      antecipacaoBRL: 650_000,
      perfil: { status: null, classificacao: null },
      gerencia: 'Gerência Regional Minas Gerais',
      atribuicaoCcob: null,
      atribuicaoSneg: null,
      pendenciaIndicacaoId: null,
      indicacoes: [
        garantiaRealPosto(
          'gi-002-1',
          '2026-09-12T14:20:00Z',
          'Av. Amazonas, 4.820 — Gameleira',
          'Belo Horizonte',
          'MG',
          ['58.214'],
          1_400_000,
        ),
      ],
      previas: [],
      minuta: null,
      documentosLegado: [],
      indicacaoSubmetidaEm: null,
    },

    // Em análise prévia na CCOB: hipoteca do posto + fiança com lastro.
    'opp-003': {
      subprocessoId: 'gar-003',
      estado: 'EM_ANALISE_PREVIA',
      antecipacaoBRL: 900_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Baixo' },
      gerencia: 'Gerência Regional Sul',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional Sul', atribuidaEm: '2026-09-08T13:05:00Z' },
      atribuicaoSneg: null,
      pendenciaIndicacaoId: null,
      indicacoes: [
        garantiaRealPosto(
          'gi-003-1',
          '2026-09-02T16:40:00Z',
          'Rod. SC-401, km 4, 3.150 — Saco Grande',
          'Florianópolis',
          'SC',
          ['112.405', '112.406'],
          1_600_000,
        ),
        base({
          id: 'gi-003-2',
          tipo: 'FIANCA_COM_LASTRO',
          criadaEm: '2026-09-02T16:55:00Z',
          imovel: 'Rua Bocaiúva, 1.210, ap. 802 — Centro',
          imovelCidade: 'Florianópolis',
          imovelUf: 'SC',
          matriculas: [{ id: 'gi-003-2-m1', ordem: 1, numero: '77.931' }],
          quantidadeLaudos: 1,
          categoria: 'RESIDENCIAL',
          estadoCivil: 'CASADO',
          valorAvaliadoBRL: 980_000,
          observacoes: 'Imóvel residencial do sócio-administrador, oferecido como lastro da fiança.',
          fiadores: [
            {
              id: 'gi-003-2-f1',
              nome: 'Marcos Vinícius Teles',
              documento: '123.456.789-00',
              estadoCivil: 'CASADO',
              conjugeNome: 'Renata Albuquerque Teles',
              conjugeDocumento: '987.654.321-00',
              email: 'marcos.teles@exemplo.com.br',
              profissao: 'Empresário',
              endereco: {
                cep: '01310-100',
                logradouro: 'Avenida Exemplo',
                numero: '1000',
                complemento: 'Apto 52',
                bairro: 'Bela Vista',
                cidade: 'São Paulo',
                uf: 'SP',
              },
              conjugeEmail: 'renata.teles@exemplo.com.br',
              conjugeProfissao: 'Arquiteta',
              conjugeEndereco: {
                cep: '01310-100',
                logradouro: 'Avenida Exemplo',
                numero: '1000',
                complemento: 'Apto 52',
                bairro: 'Bela Vista',
                cidade: 'São Paulo',
                uf: 'SP',
              },
            },
          ],
          documentos: [
            doc('gi-003-2-cert1', TIPO_DOCUMENTO_CERTIDAO, 'certidao-inteiro-teor-matricula-77931.pdf', '2026-09-03T10:12:00Z', {
              matriculaId: 'gi-003-2-m1',
            }),
            doc('gi-003-2-laudo1', TIPO_DOCUMENTO_LAUDO, 'laudo-avaliacao-apartamento-centro.pdf', '2026-09-03T10:14:00Z'),
            doc('gi-003-2-cas1', TIPO_DOCUMENTO_CASAMENTO, 'certidao-casamento-marcos-renata.pdf', '2026-09-03T10:16:00Z', {
              fiadorId: 'gi-003-2-f1',
            }),
          ],
        }),
      ],
      previas: [{ parecer: null, resultado: null, abertaEm: '2026-09-08T13:05:00Z', concluidaEm: null }],
      minuta: null,
      documentosLegado: [],
      indicacaoSubmetidaEm: '2026-09-08T13:05:00Z',
    },

    // Prévia aprovada no 2º round; a fiança com lastro foi a RECUSADA no 1º.
    'opp-004': {
      subprocessoId: 'gar-004',
      estado: 'PREVIA_APROVADA',
      antecipacaoBRL: 600_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Médio' },
      gerencia: 'Gerência Regional Centro-Oeste',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional Centro-Oeste', atribuidaEm: '2026-08-28T12:00:00Z' },
      atribuicaoSneg: { analistaId: SNEG, gerencia: 'Gerência Regional Centro-Oeste', atribuidaEm: '2026-09-18T17:30:00Z' },
      pendenciaIndicacaoId: null,
      indicacoes: [
        garantiaRealPosto(
          'gi-004-2',
          '2026-09-10T11:00:00Z',
          'BR-153, km 497 — Jardim Guanabara',
          'Goiânia',
          'GO',
          ['203.118'],
          2_000_000,
        ),
        base({
          id: 'gi-004-1',
          tipo: 'FIANCA_COM_LASTRO',
          criadaEm: '2026-08-22T15:30:00Z',
          imovel: 'Rua T-37, 1.455 — Setor Bueno',
          imovelCidade: 'Goiânia',
          imovelUf: 'GO',
          matriculas: [{ id: 'gi-004-1-m1', ordem: 1, numero: '64.502' }],
          quantidadeLaudos: 1,
          categoria: 'RESIDENCIAL',
          estadoCivil: 'DIVORCIADO',
          valorAvaliadoBRL: 720_000,
          observacoes:
            'Recusada na análise prévia de 05/09/2026 (penhora averbada na matrícula) — mantida no conjunto apenas como reforço.',
          fiadores: [
            {
              id: 'gi-004-1-f1',
              nome: 'Lúcia Andrade Prado',
              documento: '234.567.890-00',
              estadoCivil: 'DIVORCIADO',
              conjugeNome: null,
              conjugeDocumento: null,
              email: 'lucia.prado@exemplo.com.br',
              profissao: 'Contadora',
              endereco: {
                cep: '30130-000',
                logradouro: 'Rua Exemplo',
                numero: '250',
                complemento: '',
                bairro: 'Centro',
                cidade: 'Belo Horizonte',
                uf: 'MG',
              },
              conjugeEmail: null,
              conjugeProfissao: null,
              conjugeEndereco: null,
            },
          ],
          documentos: [
            doc('gi-004-1-cert1', TIPO_DOCUMENTO_CERTIDAO, 'certidao-inteiro-teor-matricula-64502.pdf', '2026-08-23T09:00:00Z', {
              matriculaId: 'gi-004-1-m1',
            }),
            doc('gi-004-1-laudo1', TIPO_DOCUMENTO_LAUDO, 'laudo-avaliacao-setor-bueno.pdf', '2026-08-23T09:05:00Z'),
          ],
        }),
      ],
      previas: [
        {
          parecer:
            'Fiança com lastro recusada: o imóvel residencial da fiadora possui penhora averbada (R.4 da matrícula 64.502) e a categoria Residencial não tem percentual de aproveitamento aprovado — o conjunto não cobre a antecipação de R$ 600 mil. Solicitada a indicação de garantia real sobre o imóvel do posto.',
          resultado: 'REPROVADA',
          abertaEm: '2026-08-28T12:00:00Z',
          concluidaEm: '2026-09-05T18:20:00Z',
        },
        {
          parecer:
            'Garantia real sobre o imóvel do posto aprovada: matrícula 203.118 livre de ônus, laudo de avaliação de 09/2026 com valor de R$ 2.000.000,00 — o aproveitamento de 90% cobre a antecipação. A fiança com lastro permanece no conjunto apenas como reforço, sem computar na cobertura.',
          resultado: 'APROVADA',
          abertaEm: '2026-09-12T09:40:00Z',
          concluidaEm: '2026-09-18T17:30:00Z',
        },
      ],
      minuta: null,
      documentosLegado: [],
      indicacaoSubmetidaEm: '2026-09-12T09:40:00Z',
    },

    // Franquia: prévia REPROVADA, de volta ao LT (reindicação) — falta a minuta da fiança.
    'opp-005': {
      subprocessoId: 'gar-005',
      estado: 'AGUARDANDO_INDICACAO',
      antecipacaoBRL: 250_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Baixo' },
      gerencia: 'Gerência Regional Nordeste',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional Nordeste', atribuidaEm: '2026-09-15T10:00:00Z' },
      atribuicaoSneg: null,
      pendenciaIndicacaoId: 'pend-garantia-opp-005',
      indicacoes: [
        base({
          id: 'gi-005-1',
          tipo: 'FIANCA_BANCARIA',
          criadaEm: '2026-09-04T14:00:00Z',
          valorAvaliadoBRL: 250_000,
          observacoes: 'Carta de fiança com vigência de 12 meses.',
          fiadores: [
            {
              id: 'gi-005-1-f1',
              nome: 'Banco Exemplo Múltiplo S.A.',
              documento: '12.345.678/0001-00',
              estadoCivil: null,
              conjugeNome: null,
              conjugeDocumento: null,
              email: null,
              profissao: null,
              endereco: null,
              conjugeEmail: null,
              conjugeProfissao: null,
              conjugeEndereco: null,
            },
          ],
          documentos: [
            doc('gi-005-1-est1', TIPO_DOCUMENTO_ESTATUTO, 'estatuto-banco-exemplo.pdf', '2026-09-04T14:10:00Z'),
          ],
        }),
      ],
      previas: [
        {
          parecer:
            'Carta de fiança apresentada com vigência de 12 meses, inferior ao prazo do contrato de franquia (60 meses). Reapresentar a minuta do contrato de fiança bancária com vigência compatível e cláusula de renovação automática.',
          resultado: 'REPROVADA',
          abertaEm: '2026-09-15T10:00:00Z',
          concluidaEm: '2026-09-24T16:45:00Z',
        },
      ],
      minuta: null,
      documentosLegado: [],
      indicacaoSubmetidaEm: '2026-09-15T10:00:00Z',
    },

    // Em aprovação: prévia aprovada, minuta ainda não registrada no Netlex.
    'opp-006': {
      subprocessoId: 'gar-006',
      estado: 'PREVIA_APROVADA',
      antecipacaoBRL: 1_200_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Baixo' },
      gerencia: 'Gerência Regional Sudeste',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional Sudeste', atribuidaEm: '2026-08-12T11:00:00Z' },
      atribuicaoSneg: { analistaId: SNEG, gerencia: 'Gerência Regional Sudeste', atribuidaEm: '2026-08-20T15:10:00Z' },
      pendenciaIndicacaoId: null,
      indicacoes: [
        garantiaRealPosto(
          'gi-006-1',
          '2026-08-05T10:30:00Z',
          'Av. Fernando Ferrari, 2.300 — Goiabeiras',
          'Vitória',
          'ES',
          ['31.877'],
          1_900_000,
        ),
      ],
      previas: [
        {
          parecer:
            'Imóvel do posto livre de ônus, laudo compatível com o valor de mercado da região. Aproveitamento de 90% (R$ 1.710.000,00) cobre a antecipação de R$ 1,2 mi. Aprovada.',
          resultado: 'APROVADA',
          abertaEm: '2026-08-12T11:00:00Z',
          concluidaEm: '2026-08-20T15:10:00Z',
        },
      ],
      minuta: null,
      documentosLegado: [],
      indicacaoSubmetidaEm: '2026-08-12T11:00:00Z',
    },

    'opp-007': {
      subprocessoId: 'gar-007',
      estado: 'MINUTA_EM_ANDAMENTO',
      antecipacaoBRL: 800_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Médio' },
      gerencia: 'Gerência Regional Centro-Oeste',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional Centro-Oeste', atribuidaEm: '2026-07-20T10:00:00Z' },
      atribuicaoSneg: { analistaId: SNEG, gerencia: 'Gerência Regional Centro-Oeste', atribuidaEm: '2026-07-29T14:00:00Z' },
      pendenciaIndicacaoId: null,
      indicacoes: [
        garantiaRealPosto(
          'gi-007-1',
          '2026-07-15T09:00:00Z',
          'SIA Trecho 3, Lote 625 — Zona Industrial',
          'Brasília',
          'DF',
          ['145.290'],
          1_300_000,
        ),
        base({
          id: 'gi-007-2',
          tipo: 'FIANCA_SEM_LASTRO',
          criadaEm: '2026-07-15T09:20:00Z',
          estadoCivil: 'SOLTEIRO',
          valorAvaliadoBRL: 800_000,
          utilizacao: 'Fornecimento',
          fiadores: [
            {
              id: 'gi-007-2-f1',
              nome: 'Eduardo Siqueira Lemos',
              documento: '345.678.901-00',
              estadoCivil: 'SOLTEIRO',
              conjugeNome: null,
              conjugeDocumento: null,
              email: 'eduardo.lemos@exemplo.com.br',
              profissao: 'Engenheiro',
              endereco: {
                cep: '80010-000',
                logradouro: 'Rua Exemplo',
                numero: '75',
                complemento: 'Sala 3',
                bairro: 'Centro',
                cidade: 'Curitiba',
                uf: 'PR',
              },
              conjugeEmail: null,
              conjugeProfissao: null,
              conjugeEndereco: null,
            },
          ],
        }),
      ],
      previas: [
        {
          parecer: 'Garantia real aprovada; a fiança sem lastro do sócio segue como garantia pessoal adicional.',
          resultado: 'APROVADA',
          abertaEm: '2026-07-20T10:00:00Z',
          concluidaEm: '2026-07-29T14:00:00Z',
        },
      ],
      minuta: { netlexNumero: 'NTX-2026-0412', status: 'Em elaboração' },
      documentosLegado: [],
      indicacaoSubmetidaEm: '2026-07-20T10:00:00Z',
    },

    'opp-008': {
      subprocessoId: 'gar-008',
      estado: 'MINUTA_EM_ANDAMENTO',
      antecipacaoBRL: 1_500_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Baixo' },
      gerencia: 'Gerência Regional Sul',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional Sul', atribuidaEm: '2026-07-02T10:00:00Z' },
      atribuicaoSneg: { analistaId: SNEG, gerencia: 'Gerência Regional Sul', atribuidaEm: '2026-07-10T16:00:00Z' },
      pendenciaIndicacaoId: null,
      indicacoes: [
        garantiaRealPosto(
          'gi-008-1',
          '2026-06-28T13:00:00Z',
          'Av. Assis Brasil, 8.950 — Sarandi',
          'Porto Alegre',
          'RS',
          ['98.442', '98.443'],
          2_600_000,
        ),
      ],
      previas: [
        {
          parecer: 'Duas matrículas contíguas do mesmo terreno, ambas livres. Cobertura suficiente. Aprovada.',
          resultado: 'APROVADA',
          abertaEm: '2026-07-02T10:00:00Z',
          concluidaEm: '2026-07-10T16:00:00Z',
        },
      ],
      minuta: { netlexNumero: 'NTX-2026-0377', status: 'Em revisão jurídica' },
      documentosLegado: [],
      indicacaoSubmetidaEm: '2026-07-02T10:00:00Z',
    },

    'opp-009': {
      subprocessoId: 'gar-009',
      estado: 'MINUTA_EM_ANDAMENTO',
      antecipacaoBRL: 500_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Baixo' },
      gerencia: 'Gerência Regional São Paulo Interior',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional São Paulo Interior', atribuidaEm: '2026-05-25T10:00:00Z' },
      atribuicaoSneg: { analistaId: SNEG, gerencia: 'Gerência Regional São Paulo Interior', atribuidaEm: '2026-06-02T11:00:00Z' },
      pendenciaIndicacaoId: null,
      indicacoes: [
        {
          ...garantiaRealPosto(
            'gi-009-1',
            '2026-05-20T10:00:00Z',
            'Rod. Dom Pedro I, km 131 — Jardim Santa Cândida',
            'Campinas',
            'SP',
            ['176.033'],
            2_300_000,
          ),
          compartilhada: true,
          detalhesCompartilhamento: 'Compartilhada com a OPP-0001 (vinculação de bandeira do mesmo posto).',
        },
      ],
      previas: [
        {
          parecer: 'Imóvel já hipotecado à Vibra em contrato anterior, com saldo de aproveitamento suficiente. Aprovada.',
          resultado: 'APROVADA',
          abertaEm: '2026-05-25T10:00:00Z',
          concluidaEm: '2026-06-02T11:00:00Z',
        },
      ],
      minuta: { netlexNumero: 'NTX-2026-0291', status: 'Registrada em cartório' },
      documentosLegado: [
        {
          id: 'gdl-009-1',
          type: 'Escritura de hipoteca',
          fileName: 'escritura-hipoteca-digitalizada.pdf',
          uploadedAt: '2026-06-30T15:00:00Z',
        },
      ],
      indicacaoSubmetidaEm: '2026-05-25T10:00:00Z',
    },

    'opp-010': {
      subprocessoId: 'gar-010',
      estado: 'MINUTA_EM_ANDAMENTO',
      antecipacaoBRL: 950_000,
      perfil: { status: 'CONCLUIDO', classificacao: 'Baixo' },
      gerencia: 'Gerência Regional Minas Gerais',
      atribuicaoCcob: { analistaId: CCOB, gerencia: 'Gerência Regional Minas Gerais', atribuidaEm: '2026-03-10T10:00:00Z' },
      atribuicaoSneg: { analistaId: SNEG, gerencia: 'Gerência Regional Minas Gerais', atribuidaEm: '2026-03-18T10:00:00Z' },
      pendenciaIndicacaoId: null,
      indicacoes: [
        garantiaRealPosto(
          'gi-010-1',
          '2026-03-05T10:00:00Z',
          'Av. Cristiano Machado, 6.100 — Primeiro de Maio',
          'Belo Horizonte',
          'MG',
          ['41.560'],
          1_800_000,
        ),
      ],
      previas: [
        {
          parecer: 'Garantia real sobre o imóvel do posto aprovada sem ressalvas.',
          resultado: 'APROVADA',
          abertaEm: '2026-03-10T10:00:00Z',
          concluidaEm: '2026-03-18T10:00:00Z',
        },
      ],
      minuta: { netlexNumero: 'NTX-2026-0118', status: 'Concluída' },
      documentosLegado: [],
      indicacaoSubmetidaEm: '2026-03-10T10:00:00Z',
    },
  };
}

/** Garantia vazia para oportunidade criada no protótipo (fora da semente). */
export function garantiaVazia(oportunidadeId: string, valorEstimado: number): GarantiaOppInt {
  return {
    subprocessoId: `gar-${oportunidadeId}`,
    estado: 'AGUARDANDO_INDICACAO',
    antecipacaoBRL: Math.round(valorEstimado * 0.2),
    perfil: { status: null, classificacao: null },
    gerencia: 'Gerência Regional Sudeste',
    atribuicaoCcob: null,
    atribuicaoSneg: null,
    pendenciaIndicacaoId: null,
    indicacoes: [],
    previas: [],
    minuta: null,
    documentosLegado: [],
    indicacaoSubmetidaEm: null,
  };
}

/**
 * Garantias já cadastradas no SAP/Salesforce, por Código SAP do cliente — o
 * seletor "Existente" do ticket. Ids no formato do Salesforce (18 chars), fictícios.
 */
export const GARANTIAS_EXISTENTES_POR_CLIENTE: Record<
  string,
  Array<{ externalId: string; tipo: string; descricaoBem: string | null; valorAvaliadoBRL: number | null; vigenteAte: string | null }>
> = {
  '900101': [
    {
      externalId: 'a0X8c00000EXMP01AA',
      tipo: 'Hipoteca Imóvel com Interesse Comercial',
      descricaoBem: null,
      valorAvaliadoBRL: 2_300_000,
      vigenteAte: '2031-05-31',
    },
  ],
  '900102': [
    {
      externalId: 'a0X8c00000EXMP02AA',
      tipo: 'Hipoteca Imóvel com Interesse Comercial',
      descricaoBem: null,
      valorAvaliadoBRL: 1_800_000,
      vigenteAte: '2031-03-31',
    },
    {
      externalId: 'a0X8c00000EXMP03AA',
      tipo: 'Carta de Fiança Bancária',
      descricaoBem: null,
      valorAvaliadoBRL: 300_000,
      vigenteAte: '2027-02-28',
    },
  ],
  '900104': [
    {
      externalId: 'a0X8c00000EXMP04AA',
      tipo: 'Hipoteca Imóvel com Interesse Comercial',
      descricaoBem: null,
      valorAvaliadoBRL: 2_000_000,
      vigenteAte: null,
    },
  ],
};

/** Tipos de documento usados nas regras de aptidão. */
export const TIPOS_DOC = {
  certidao: TIPO_DOCUMENTO_CERTIDAO,
  laudo: TIPO_DOCUMENTO_LAUDO,
  casamento: TIPO_DOCUMENTO_CASAMENTO,
  minutaFianca: TIPO_DOCUMENTO_MINUTA_FIANCA,
} as const;
