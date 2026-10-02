import type { Obra, ObraAndamento, ObraStatusInterno } from '@/lib/obras/obra-mapping';

import { CLIENTES } from '../../elenco';

/**
 * Obras do Converge (ADR-0048) — fictícias. O catálogo é por CLIENTE (é o que o
 * `GetEstimates` devolve para o CNPJ), e o vínculo é por OPORTUNIDADE.
 *
 * ⚠️ `valorTotalBrl` é TRUNCADO de propósito (o `TotalValue` do Converge é
 * int32) e as parcelas somam com centavos — a tela soma as parcelas.
 */

export type ModeloContratacaoObra = 'RECURSO_FINANCEIRO' | 'INVESTIMENTO';

export interface VinculoObra {
  estimateId: string;
  /** Recurso financeiro ⇒ o Termo de Cessão faz parte do pacote. */
  modelo: ModeloContratacaoObra;
  statusInterno: ObraStatusInterno;
  andamento: ObraAndamento | null;
}

function obraBase(sap: string, extra: Partial<Obra> & Pick<Obra, 'estimateId' | 'tipo' | 'parcelas'>): Obra {
  const cliente = CLIENTES.find((c) => c.sapCode === sap);
  const totalCentavos = extra.parcelas.reduce((t, p) => t + Math.round(p.valor * 100), 0);
  return {
    globalConstructionId: null,
    status: 'Orçamento gerado',
    tipoNegocio: 'Embandeiramento',
    clienteNome: cliente?.razaoSocial ?? 'Cliente',
    clienteCnpj: cliente?.cnpj ?? '',
    empreiteiraNome: 'Construtora Ponte Alta Ltda',
    empreiteiraCnpj: '45.678.901/0001-00',
    ltNome: 'Ana Ribeiro',
    ltEmail: 'ana.ribeiro@exemplo.com.br',
    engenheiroNome: 'Rafael Moura',
    engenheiroEmail: 'rafael.moura@exemplo.com.br',
    valorTotalBrl: String(Math.trunc(totalCentavos / 100)),
    outrosValores: [],
    linhaImagem: 'PISTA',
    sincronizadoEm: null,
    ...extra,
  };
}

/** A obra da opp-008 (Posto Pampa): estimativa confirmada, aguardando início. */
const OBRA_PAMPA = obraBase('900108', {
  estimateId: '5821',
  tipo: 'Nova Imagem completa',
  globalConstructionId: 'OBR-2026-0457',
  status: 'Orçamento gerado',
  parcelas: [
    { numero: 1, descricao: 'Pista 1ª parcela', valor: 138742.4, prazoPagamentoDias: 30, imposto: false },
    { numero: 2, descricao: 'Pista 2ª parcela', valor: 138742.38, prazoPagamentoDias: 60, imposto: false },
    { numero: 3, descricao: 'Pista 3ª parcela', valor: 92494.92, prazoPagamentoDias: 90, imposto: false },
    { numero: 0, descricao: 'Imposto', valor: 42370.3, prazoPagamentoDias: null, imposto: true },
  ],
  outrosValores: [
    { descricao: 'IMG · Comunicação visual da testeira', valor: 28500 },
    { descricao: 'IMG · Adesivagem de bombas', valor: 6400 },
  ],
  sincronizadoEm: '2026-09-29T14:10:00Z',
});

/** A obra da opp-009 (Horizonte Azul · ampliação): em andamento. */
const OBRA_HORIZONTE = obraBase('900101', {
  estimateId: '5307',
  tipo: 'Ampliação de pista',
  globalConstructionId: 'OBR-2026-0391',
  tipoNegocio: 'Renovação contratual',
  empreiteiraNome: 'Engenharia Vale Claro Ltda',
  empreiteiraCnpj: '56.789.012/0001-00',
  parcelas: [
    { numero: 1, descricao: 'Pista 1ª parcela', valor: 92097.88, prazoPagamentoDias: 30, imposto: false },
    { numero: 2, descricao: 'Pista 2ª parcela', valor: 92097.88, prazoPagamentoDias: 60, imposto: false },
    { numero: 0, descricao: 'Imposto', valor: 1961.46, prazoPagamentoDias: null, imposto: true },
  ],
  sincronizadoEm: '2026-09-28T08:00:00Z',
});

/** Obras "soltas" de cada cliente — o que o seletor de obra lista ao vivo. */
function obrasAvulsas(sap: string, indice: number): Obra[] {
  const base = 6100 + indice * 10;
  return [
    obraBase(sap, {
      estimateId: String(base + 1),
      tipo: 'Nova Imagem completa',
      parcelas: [
        { numero: 1, descricao: 'Pista 1ª parcela', valor: 120000 + indice * 1500.25, prazoPagamentoDias: 30, imposto: false },
        { numero: 2, descricao: 'Pista 2ª parcela', valor: 120000 + indice * 1500.25, prazoPagamentoDias: 60, imposto: false },
        { numero: 0, descricao: 'Imposto', valor: 18240.5, prazoPagamentoDias: null, imposto: true },
      ],
    }),
    obraBase(sap, {
      estimateId: String(base + 2),
      tipo: 'Reforma de loja BR Mania',
      tipoNegocio: 'Franquia',
      linhaImagem: indice % 2 === 0 ? 'BR_MANIA' : null,
      parcelas: [
        { numero: 1, descricao: 'Pista 1ª parcela', valor: 64350.1, prazoPagamentoDias: 45, imposto: false },
        { numero: 0, descricao: 'Imposto', valor: 5148.0, prazoPagamentoDias: null, imposto: true },
      ],
    }),
  ];
}

export function catalogoInicialDeObras(): Record<string, Obra[]> {
  const catalogo: Record<string, Obra[]> = {};
  CLIENTES.forEach((c, i) => {
    catalogo[c.sapCode] = obrasAvulsas(c.sapCode, i);
  });
  catalogo['900108'] = [OBRA_PAMPA, ...catalogo['900108']];
  catalogo['900101'] = [OBRA_HORIZONTE, ...catalogo['900101']];
  return catalogo;
}

export function vinculosIniciaisDeObra(): Record<string, VinculoObra> {
  return {
    'opp-008': {
      estimateId: '5821',
      modelo: 'RECURSO_FINANCEIRO',
      statusInterno: { status: 'Aguardando início', pill: 'i', acompanhadaNoConverge: true },
      andamento: {
        status: 'Aguardando início',
        statusLabel: 'Aguardando início',
        constructionId: 'OBR-2026-0457',
        statusPill: 'n',
        percentualAvanco: 0,
        sla: '120',
        holdTimeInDays: 0,
        inicio: '2026-10-20',
        fim: '2027-02-17',
        atualizadoEm: '2026-09-29T14:10:00Z',
      },
    },
    'opp-009': {
      estimateId: '5307',
      modelo: 'RECURSO_FINANCEIRO',
      statusInterno: { status: 'Obra em andamento', pill: 'w', acompanhadaNoConverge: true },
      andamento: {
        status: 'Em dia',
        statusLabel: 'Em dia',
        constructionId: 'OBR-2026-0391',
        statusPill: 's',
        percentualAvanco: 45,
        sla: '90',
        holdTimeInDays: 0,
        inicio: '2026-09-08',
        fim: '2026-12-07',
        atualizadoEm: '2026-09-28T08:00:00Z',
      },
    },
  };
}
