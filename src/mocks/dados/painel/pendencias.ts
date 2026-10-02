import type { BackendPendenciaEvento } from '@/lib/pendencias/pendencia-mapping';
import type { PendenciaAnexo } from '@/lib/pendencias/types';

import { usuarioPorId } from '../../core/session';
import type { EstadoBackend } from '../../elenco';
import { haDias, maisHoras, prazoEmDias } from './tempo';

/**
 * Pendências do protótipo, guardadas na FORMA DO BACKEND (`PendenciaDetailDto`,
 * enums em caixa alta). A rota mapeia com os mesmos mappers da BFF de produção
 * (`lib/pendencias/pendencia-mapping.ts`), então o tipo que chega à tela é
 * provado pelo compilador, e não por uma cópia.
 *
 * Os campos derivados (SLA, fase, cliente, rótulo de área, permissão de
 * encerrar) NÃO ficam aqui: são calculados a cada leitura, a partir do estado
 * vivo da oportunidade e do usuário da sessão.
 */

export type StatusPendencia = 'ABERTA' | 'EM_ANDAMENTO' | 'RESOLVIDA' | 'CANCELADA';
export type PrioridadePendencia = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type TipoPendencia = 'DOCUMENTACAO' | 'ANALISE' | 'APROVACAO' | 'OUTRO';

export interface AnexoMock extends PendenciaAnexo {
  /** Quem enviou — para o ticket nomear o autor. */
  uploadedById: string;
}

export interface PendenciaMock {
  id: string;
  code: string;
  opportunityId: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoPendencia;
  /** Discriminador de máquina (`sneg:devolver`, `engine:DOCUMENTO_AUSENTE`). */
  origem: string;
  /** Token da área (`LT/EV`, `COMPLIANCE`); null = sem caixa. */
  area: string | null;
  /** Pessoa responsável; null = a caixa da área. */
  responsavelId: string | null;
  status: StatusPendencia;
  prioridade: PrioridadePendencia;
  prazo: string | null;
  canais: string[];
  abertaEm: string;
  resolvidaEm: string | null;
  anexoId: string | null;
  automatica: boolean;
  obrigatoria: boolean;
  /** `upload` | `marcar` | `automatica` | `hub` | `reenvio` | `ddi` | ... */
  acaoResolucao: string;
  acaoResolucaoDetalhe: string | null;
  /** Uma PESSOA reatribuiu (só a reatribuição vence a área no encerramento). */
  reatribuida: boolean;
  /** Fase da oportunidade quando a pendência nasceu — ver `sincronizarComFases`. */
  faseOrigem: EstadoBackend;
  historico: BackendPendenciaEvento[];
  anexos: AnexoMock[];
}

/** Rótulo pt-BR da origem — o backend compõe, a tela só exibe. */
export const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Criada manualmente',
  'engine:DOCUMENTO_AUSENTE': 'Gerada automaticamente · Documento ausente no checklist',
  'engine:DOCUMENTO_REJEITADO': 'Gerada automaticamente · Documento recusado na conferência',
  'engine:DADO_OBRIGATORIO_AUSENTE': 'Gerada automaticamente · Dado obrigatório ausente',
  'sneg:devolver': 'Devolução da SNEG ao LT',
  'ddi:parecer': 'Parecer da Integridade (DDI)',
  'ddi:documento': 'Documento solicitado pela Integridade (DDI)',
  'garantia:previa': 'Análise prévia da garantia (CCOB)',
  'franquia:parecer_antecipado': 'Parecer antecipado da franquia',
  'franquia:fap': 'Documentos da proposta de franquia',
  'contrato:minuta': 'Minuta do contrato',
  'assinatura:envelope': 'Assinatura eletrônica (DocuSign)',
  'pagamento:liberacao': 'Liberação de pagamento',
};

const SISTEMA = 'sistema';

let seq = 0;
function evento(
  tipo: string,
  autorId: string,
  conteudo: string,
  createdAt: string,
  extra: { anexoId?: string; anexoNome?: string; metadados?: Record<string, unknown> } = {},
): BackendPendenciaEvento {
  seq += 1;
  return {
    id: `pev-${String(seq).padStart(3, '0')}`,
    tipo,
    autorId,
    autorNome: autorId === SISTEMA ? 'Sistema' : (usuarioPorId(autorId)?.name ?? null),
    conteudo,
    anexoNome: extra.anexoNome ?? null,
    metadados: extra.anexoId ? { anexoId: extra.anexoId, ...extra.metadados } : (extra.metadados ?? null),
    createdAt,
  };
}

function anexo(id: string, fileName: string, autorId: string, uploadedAt: string): AnexoMock {
  return {
    id,
    fileName,
    mimeType: fileName.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf',
    uploadedByName: usuarioPorId(autorId)?.name ?? null,
    uploadedById: autorId,
    uploadedAt,
  };
}

type Base = Omit<
  PendenciaMock,
  'historico' | 'anexos' | 'resolvidaEm' | 'anexoId' | 'reatribuida' | 'canais' | 'acaoResolucaoDetalhe'
> &
  Partial<Pick<PendenciaMock, 'resolvidaEm' | 'anexoId' | 'reatribuida' | 'canais' | 'acaoResolucaoDetalhe'>>;

function pendencia(
  base: Base,
  historico: (abertaEm: string) => BackendPendenciaEvento[],
  anexos: AnexoMock[] = [],
): PendenciaMock {
  return {
    canais: ['CHAT', 'EMAIL'],
    resolvidaEm: null,
    anexoId: null,
    reatribuida: false,
    acaoResolucaoDetalhe: null,
    ...base,
    historico: historico(base.abertaEm),
    anexos,
  };
}

const LT = 'usr-lt-ana';
const SNEG = 'usr-sneg-carla';
const SPCOM = 'usr-spcom-fabio';
const INT = 'usr-int-marina';
const GV = 'usr-gv-henrique';

/** Semente — coerente com o `cenario` de cada oportunidade do elenco. */
export function sementePendencias(): PendenciaMock[] {
  seq = 0;
  const a003 = haDias(2.2);
  const a014 = haDias(1.1);

  return [
    // ── opp-001 · recém-criada, checklist incompleto ──────────────────────────
    pendencia(
      {
        id: 'pnd-001',
        code: 'PN-3001',
        opportunityId: 'opp-001',
        titulo: 'Anexar contrato social atualizado',
        descricao:
          'O checklist da oportunidade não tem o contrato social consolidado da empresa. Anexe a versão registrada na Junta Comercial (emitida há menos de 90 dias).',
        tipo: 'DOCUMENTACAO',
        origem: 'engine:DOCUMENTO_AUSENTE',
        area: 'LT/EV',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(3),
        abertaEm: haDias(4),
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'hub',
        acaoResolucaoDetalhe: 'Anexe o documento no checklist da oportunidade — a pendência fecha sozinha.',
        faseOrigem: 'EM_PREENCHIMENTO',
      },
      (t) => [
        evento('ABERTURA', SISTEMA, 'Pendência aberta automaticamente: o checklist não tem o contrato social da empresa.', t),
      ],
    ),
    pendencia(
      {
        id: 'pnd-002',
        code: 'PN-3002',
        opportunityId: 'opp-001',
        titulo: 'Informar volume mensal estimado (m³)',
        descricao: 'A proposta PCR está sem o volume mensal estimado por produto, necessário para o cálculo do ARP.',
        tipo: 'OUTRO',
        origem: 'engine:DADO_OBRIGATORIO_AUSENTE',
        area: 'LT/EV',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'MEDIA',
        prazo: prazoEmDias(6),
        abertaEm: haDias(4),
        automatica: true,
        obrigatoria: false,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_PREENCHIMENTO',
      },
      (t) => [evento('ABERTURA', SISTEMA, 'Pendência aberta automaticamente: dado obrigatório ausente na proposta.', t)],
    ),

    // ── opp-002 · pronta para o GATE 1 ───────────────────────────────────────
    pendencia(
      {
        id: 'pnd-003',
        code: 'PN-3003',
        opportunityId: 'opp-002',
        titulo: 'Anexar alvará de funcionamento',
        descricao: 'Alvará de funcionamento vigente do posto, emitido pela prefeitura.',
        tipo: 'DOCUMENTACAO',
        origem: 'engine:DOCUMENTO_AUSENTE',
        area: 'LT/EV',
        responsavelId: null,
        status: 'RESOLVIDA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(-1),
        abertaEm: haDias(12),
        resolvidaEm: haDias(2),
        anexoId: 'anx-003a',
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'upload',
        faseOrigem: 'EM_PREENCHIMENTO',
      },
      (t) => [
        evento('ABERTURA', SISTEMA, 'Pendência aberta automaticamente: o checklist não tem o alvará de funcionamento.', t),
        evento('COMENTARIO', LT, 'Alvará renovado pela prefeitura em setembro. Segue o documento.', haDias(2.1), {
          anexoId: 'anx-003a',
          anexoNome: 'alvara-funcionamento-2026.pdf',
        }),
        evento('RESOLUCAO', LT, 'Resolvida com o anexo alvara-funcionamento-2026.pdf.', haDias(2), {
          anexoId: 'anx-003a',
          anexoNome: 'alvara-funcionamento-2026.pdf',
        }),
      ],
      [anexo('anx-003a', 'alvara-funcionamento-2026.pdf', LT, haDias(2.1))],
    ),
    pendencia(
      {
        id: 'pnd-004',
        code: 'PN-3004',
        opportunityId: 'opp-002',
        titulo: 'Atualizar cadastro do cliente no Salesforce',
        descricao: 'Endereço de cobrança divergente entre o cadastro e o cartão CNPJ.',
        tipo: 'OUTRO',
        origem: 'manual',
        area: 'LT/EV',
        responsavelId: LT,
        status: 'CANCELADA',
        prioridade: 'BAIXA',
        prazo: null,
        abertaEm: haDias(9),
        resolvidaEm: haDias(8),
        automatica: false,
        obrigatoria: false,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_PREENCHIMENTO',
      },
      (t) => [
        evento('ABERTURA', LT, 'Pendência criada manualmente.', t),
        evento('MUDANCA_STATUS', LT, 'Status alterado: Aberta → Cancelada. Motivo: a integração já atualizou o endereço.', haDias(8), {
          metadados: { de: 'ABERTA', para: 'CANCELADA' },
        }),
      ],
    ),

    // ── opp-003 · em análise: DDI em andamento, garantia na CCOB ─────────────
    pendencia(
      {
        id: 'pnd-005',
        code: 'PN-3005',
        opportunityId: 'opp-003',
        titulo: 'DDI: emitir parecer de integridade',
        descricao:
          'Due diligence de integridade do cliente e dos sócios. Emita o parecer e classifique o risco na tela de análise da oportunidade.',
        tipo: 'ANALISE',
        origem: 'ddi:parecer',
        area: 'COMPLIANCE',
        responsavelId: null,
        status: 'EM_ANDAMENTO',
        prioridade: 'ALTA',
        prazo: prazoEmDias(2),
        abertaEm: a003,
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'ddi',
        acaoResolucaoDetalhe: 'Encerrada pela decisão do parecer da Integridade, na tela de análise.',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [
        evento('ABERTURA', SISTEMA, 'Pendência aberta automaticamente: a oportunidade entrou em análise e exige parecer de integridade.', t),
        evento('MUDANCA_STATUS', INT, 'Status alterado: Aberta → Em andamento.', maisHoras(t, 5), {
          metadados: { de: 'ABERTA', para: 'EM_ANDAMENTO' },
        }),
        evento(
          'COMENTARIO',
          INT,
          'Consulta NeoWay concluída sem apontamentos para a empresa. Aguardando a certidão trabalhista de um dos sócios para fechar o parecer.',
          maisHoras(t, 26),
        ),
      ],
    ),
    pendencia(
      {
        id: 'pnd-006',
        code: 'PN-3006',
        opportunityId: 'opp-003',
        titulo: 'Analisar garantia (análise prévia)',
        descricao: 'Hipoteca do imóvel do posto indicada pelo LT. Avalie matrícula, laudo e certidões antes do GATE 2.',
        tipo: 'ANALISE',
        origem: 'garantia:previa',
        area: 'CCOB',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(0),
        abertaEm: haDias(2),
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'previa_garantia',
        acaoResolucaoDetalhe: 'Encerrada pela decisão da CCOB na tela de Garantia.',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [evento('ABERTURA', SISTEMA, 'Garantia indicada pelo LT enviada para análise prévia da CCOB.', t)],
    ),
    pendencia(
      {
        id: 'pnd-007',
        code: 'PN-3007',
        opportunityId: 'opp-003',
        titulo: 'Enviar certidão negativa de débitos trabalhistas',
        descricao: 'A Integridade precisa da CNDT de um dos sócios (emitida há menos de 30 dias) para concluir a DDI.',
        tipo: 'DOCUMENTACAO',
        origem: 'ddi:documento',
        area: 'LT',
        responsavelId: LT,
        status: 'ABERTA',
        prioridade: 'MEDIA',
        prazo: prazoEmDias(4),
        abertaEm: haDias(1),
        automatica: true,
        obrigatoria: false,
        acaoResolucao: 'upload',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [
        evento('ABERTURA', INT, 'Documento solicitado pela Integridade para concluir a due diligence.', t),
      ],
    ),

    // ── opp-004 · devolvida ao LT ─────────────────────────────────────────────
    pendencia(
      {
        id: 'pnd-008',
        code: 'PN-3008',
        opportunityId: 'opp-004',
        titulo: 'Ajustar proposta devolvida pela SNEG',
        descricao:
          'Motivo: o volume mensal informado (450 m³) diverge do histórico ANP dos últimos 12 meses (média de 310 m³). Revise o volume e o investimento da proposta PCR-GOP-00000105/2026 e reenvie para análise.',
        tipo: 'OUTRO',
        origem: 'sneg:devolver',
        area: 'LT/EV',
        responsavelId: LT,
        status: 'ABERTA',
        prioridade: 'URGENTE',
        prazo: prazoEmDias(-2),
        abertaEm: haDias(5),
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'reenvio',
        acaoResolucaoDetalhe: 'Encerrada no reenvio da proposta para análise.',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [
        evento(
          'ABERTURA',
          SNEG,
          'Proposta devolvida ao LT. Motivo: o volume mensal informado (450 m³) diverge do histórico ANP dos últimos 12 meses (média de 310 m³).',
          t,
        ),
        evento(
          'COMENTARIO',
          LT,
          'Conversei com o cliente: o volume considera a nova pista de diesel. Vou anexar o projeto da ampliação e ajustar o investimento.',
          maisHoras(t, 20),
        ),
        evento(
          'COMENTARIO',
          SNEG,
          'Ok. Com o projeto anexado, considero o volume projetado. Mantenha o histórico ANP visível no racional.',
          maisHoras(t, 27),
        ),
      ],
    ),
    pendencia(
      {
        id: 'pnd-009',
        code: 'PN-3009',
        opportunityId: 'opp-004',
        titulo: 'Reenviar documento: Licença ambiental de operação',
        descricao:
          'O documento "Licença ambiental de operação" foi recusado na conferência do checklist. Envie uma nova versão pelo checklist de documentos da oportunidade.',
        tipo: 'DOCUMENTACAO',
        origem: 'engine:DOCUMENTO_REJEITADO',
        area: 'LT/EV',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(1),
        abertaEm: haDias(5),
        automatica: true,
        obrigatoria: false,
        acaoResolucao: 'hub',
        acaoResolucaoDetalhe: 'Anexe a nova versão no checklist da oportunidade — a pendência fecha sozinha.',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [evento('ABERTURA', SNEG, 'Licença ambiental recusada: o documento anexado venceu em 08/2026.', t)],
    ),

    // ── opp-005 · franquia BR Mania ───────────────────────────────────────────
    pendencia(
      {
        id: 'pnd-010',
        code: 'PN-3010',
        opportunityId: 'opp-005',
        titulo: 'Emitir parecer antecipado da franquia BR Mania',
        descricao: 'Avalie o ponto comercial, o royalty proposto e as exceções antes da análise financeira.',
        tipo: 'ANALISE',
        origem: 'franquia:parecer_antecipado',
        area: 'FRANQUIA',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(2),
        abertaEm: haDias(3),
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'franquia_parecer',
        acaoResolucaoDetalhe: 'Encerrada na submissão do parecer, na proposta de franquia.',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [evento('ABERTURA', SISTEMA, 'Proposta ZBRM enviada para o parecer antecipado do time de franquias.', t)],
    ),
    pendencia(
      {
        id: 'pnd-011',
        code: 'PN-3011',
        opportunityId: 'opp-005',
        titulo: 'Anexar FAP e fotos do ponto comercial',
        descricao: 'Ficha de Avaliação do Ponto e ao menos 4 fotos (fachada, pista, loja e entorno).',
        tipo: 'DOCUMENTACAO',
        origem: 'franquia:fap',
        area: 'LT/EV',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'MEDIA',
        prazo: prazoEmDias(5),
        abertaEm: haDias(3),
        automatica: true,
        obrigatoria: false,
        acaoResolucao: 'franquia',
        acaoResolucaoDetalhe: 'Anexe na própria proposta de franquia.',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [evento('ABERTURA', SISTEMA, 'Documentos da proposta de franquia pendentes.', t)],
    ),
    // Id fixo: é o `pendenciaIndicacaoId` que o domínio `garantia` grava na
    // reprovação da prévia — o "Exibir pendência" da tela de garantia abre esta.
    pendencia(
      {
        id: 'pend-garantia-opp-005',
        code: 'PN-3021',
        opportunityId: 'opp-005',
        titulo: 'Reindicar a garantia reprovada na análise prévia',
        descricao:
          'A CCOB reprovou a fiança bancária: falta a Minuta do Contrato de Fiança Bancária. Complete a indicação e reenvie.',
        tipo: 'DOCUMENTACAO',
        origem: 'garantia:previa_reprovada',
        area: 'LT/EV',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(3),
        abertaEm: haDias(2),
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'garantia',
        acaoResolucaoDetalhe: 'Complete a indicação na tela de Garantia — a pendência fecha no reenvio.',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [evento('ABERTURA', SISTEMA, 'Análise prévia da garantia reprovada pela CCOB.', t)],
    ),

    // ── opp-006 · em aprovação ────────────────────────────────────────────────
    pendencia(
      {
        id: 'pnd-012',
        code: 'PN-3012',
        opportunityId: 'opp-006',
        titulo: 'Validar exceção de política comercial (bonificação acima do teto)',
        descricao:
          'A bonificação antecipada proposta (R$ 820.000,00) supera o teto da política para a faixa de volume. A exceção precisa do aval do Gerente Varejo.',
        tipo: 'APROVACAO',
        origem: 'manual',
        area: 'SNEG',
        responsavelId: GV,
        status: 'ABERTA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(1),
        abertaEm: haDias(6),
        reatribuida: true,
        automatica: false,
        obrigatoria: false,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_APROVACAO',
      },
      (t) => [
        evento('ABERTURA', SNEG, 'Pendência criada manualmente.', t),
        evento('REATRIBUICAO', SNEG, 'Reatribuída a Henrique Barros: a exceção depende do aval do Gerente Varejo.', maisHoras(t, 2), {
          metadados: { de: SNEG, para: GV },
        }),
      ],
    ),
    pendencia(
      {
        id: 'pnd-013',
        code: 'PN-3013',
        opportunityId: 'opp-006',
        titulo: 'Revisar indicadores econômicos no ARP',
        descricao: 'Conferir TIR e VPL recalculados após o ajuste do prazo contratual.',
        tipo: 'ANALISE',
        origem: 'manual',
        area: 'SNEG',
        responsavelId: SNEG,
        status: 'RESOLVIDA',
        prioridade: 'MEDIA',
        prazo: prazoEmDias(-4),
        abertaEm: haDias(10),
        resolvidaEm: haDias(3),
        automatica: false,
        obrigatoria: false,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [
        evento('ABERTURA', SNEG, 'Pendência criada manualmente.', t),
        evento('RESOLUCAO', SNEG, 'Indicadores conferidos: TIR 18,4% a.a. e VPL de R$ 1,9 mi.', haDias(3)),
      ],
    ),

    // ── opp-007 · em minuta: pendente de anexo, SPCOM atribuído ──────────────
    pendencia(
      {
        id: 'pnd-014',
        code: 'PN-3014',
        opportunityId: 'opp-007',
        titulo: 'Anexar minuta do Mútuo revisada pelo Jurídico',
        descricao: 'A minuta do Mútuo em Dinheiro voltou do Jurídico com ajustes na cláusula de garantia. Anexe a versão final para seguir à assinatura.',
        tipo: 'DOCUMENTACAO',
        origem: 'contrato:minuta',
        area: 'SPCOM',
        responsavelId: SPCOM,
        status: 'EM_ANDAMENTO',
        prioridade: 'ALTA',
        prazo: prazoEmDias(0),
        abertaEm: a014,
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'upload',
        faseOrigem: 'EM_MINUTA',
      },
      (t) => [
        evento('ABERTURA', SISTEMA, 'Minuta do Mútuo gerada sem o anexo revisado.', t),
        evento('MUDANCA_STATUS', SPCOM, 'Status alterado: Aberta → Em andamento.', maisHoras(t, 3), {
          metadados: { de: 'ABERTA', para: 'EM_ANDAMENTO' },
        }),
        evento('COMENTARIO', SPCOM, 'Jurídico prometeu a versão final ainda hoje. Anexo assim que chegar.', maisHoras(t, 8)),
      ],
    ),
    pendencia(
      {
        id: 'pnd-015',
        code: 'PN-3015',
        opportunityId: 'opp-007',
        titulo: 'Conferir dados bancários do cliente para o CPCVM',
        descricao: 'Banco, agência e conta do cliente precisam bater com o cadastro do SAP antes da emissão do CPCVM.',
        tipo: 'OUTRO',
        origem: 'manual',
        area: 'SNEG',
        responsavelId: SNEG,
        status: 'ABERTA',
        prioridade: 'MEDIA',
        prazo: prazoEmDias(3),
        abertaEm: haDias(1),
        automatica: false,
        obrigatoria: false,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_MINUTA',
      },
      (t) => [evento('ABERTURA', SPCOM, 'Pendência criada manualmente.', t)],
    ),

    // ── opp-008 · em assinatura ───────────────────────────────────────────────
    pendencia(
      {
        id: 'pnd-016',
        code: 'PN-3016',
        opportunityId: 'opp-008',
        titulo: 'Acompanhar assinatura do envelope DocuSign',
        descricao: '2 de 4 signatários já assinaram. A pendência fecha sozinha quando o envelope for concluído.',
        tipo: 'OUTRO',
        origem: 'assinatura:envelope',
        area: 'LT/EV',
        responsavelId: null,
        status: 'ABERTA',
        prioridade: 'BAIXA',
        prazo: null,
        abertaEm: haDias(4),
        automatica: true,
        obrigatoria: false,
        acaoResolucao: 'automatica',
        faseOrigem: 'EM_ASSINATURA',
      },
      (t) => [evento('ABERTURA', SISTEMA, 'Envelope enviado aos signatários pelo DocuSign.', t)],
    ),

    // ── opp-009 · em pagamento ────────────────────────────────────────────────
    pendencia(
      {
        id: 'pnd-017',
        code: 'PN-3017',
        opportunityId: 'opp-009',
        titulo: 'Validar dados bancários para liberação do pagamento',
        descricao: 'Confirmar a conta de crédito da bonificação antes da liberação no Salesforce.',
        tipo: 'OUTRO',
        origem: 'pagamento:liberacao',
        area: 'SPCOM',
        responsavelId: SPCOM,
        status: 'ABERTA',
        prioridade: 'MEDIA',
        prazo: prazoEmDias(-1),
        abertaEm: haDias(5),
        automatica: false,
        obrigatoria: false,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_PAGAMENTO',
      },
      (t) => [evento('ABERTURA', SISTEMA, 'Contratos ativados — liberação de pagamento aguardando validação.', t)],
    ),
    pendencia(
      {
        id: 'pnd-018',
        code: 'PN-3018',
        opportunityId: 'opp-009',
        titulo: 'Confirmar ativação dos contratos no SAP',
        descricao: null,
        tipo: 'OUTRO',
        origem: 'manual',
        area: 'SPCOM',
        responsavelId: SPCOM,
        status: 'RESOLVIDA',
        prioridade: 'ALTA',
        prazo: prazoEmDias(-6),
        abertaEm: haDias(9),
        resolvidaEm: haDias(5),
        automatica: false,
        obrigatoria: false,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_PAGAMENTO',
      },
      (t) => [
        evento('ABERTURA', SPCOM, 'Pendência criada manualmente.', t),
        evento('RESOLUCAO', SPCOM, 'Contratos CPCVM e Mútuo ativos no SAP.', haDias(5)),
      ],
    ),

    // ── opp-010 · concluída: tudo resolvido ───────────────────────────────────
    pendencia(
      {
        id: 'pnd-019',
        code: 'PN-3019',
        opportunityId: 'opp-010',
        titulo: 'Emitir parecer técnico SNEG',
        descricao: null,
        tipo: 'ANALISE',
        origem: 'manual',
        area: 'SNEG',
        responsavelId: SNEG,
        status: 'RESOLVIDA',
        prioridade: 'ALTA',
        prazo: '2026-03-20T20:00:00.000Z',
        abertaEm: '2026-03-12T13:00:00.000Z',
        resolvidaEm: '2026-03-18T17:20:00.000Z',
        automatica: false,
        obrigatoria: true,
        acaoResolucao: 'marcar',
        faseOrigem: 'EM_ANALISE',
      },
      (t) => [
        evento('ABERTURA', SNEG, 'Pendência criada manualmente.', t),
        evento('RESOLUCAO', SNEG, 'Parecer técnico emitido: favorável.', '2026-03-18T17:20:00.000Z'),
      ],
    ),
    pendencia(
      {
        id: 'pnd-020',
        code: 'PN-3020',
        opportunityId: 'opp-010',
        titulo: 'Anexar contrato assinado ao Salesforce',
        descricao: null,
        tipo: 'DOCUMENTACAO',
        origem: 'contrato:minuta',
        area: 'SPCOM',
        responsavelId: SPCOM,
        status: 'RESOLVIDA',
        prioridade: 'MEDIA',
        prazo: '2026-05-30T20:00:00.000Z',
        abertaEm: '2026-05-22T12:00:00.000Z',
        resolvidaEm: '2026-05-27T15:40:00.000Z',
        anexoId: 'anx-020a',
        automatica: true,
        obrigatoria: true,
        acaoResolucao: 'upload',
        faseOrigem: 'EM_PAGAMENTO',
      },
      (t) => [
        evento('ABERTURA', SISTEMA, 'Envelope concluído — contrato assinado aguardando anexo no Salesforce.', t),
        evento('RESOLUCAO', SPCOM, 'Resolvida com o anexo contrato-cpcvm-assinado.pdf.', '2026-05-27T15:40:00.000Z', {
          anexoId: 'anx-020a',
          anexoNome: 'contrato-cpcvm-assinado.pdf',
        }),
      ],
      [anexo('anx-020a', 'contrato-cpcvm-assinado.pdf', SPCOM, '2026-05-27T15:39:00.000Z')],
    ),
  ];
}

/** Evento novo, em ações do mock. */
export function novoEvento(
  id: string,
  tipo: string,
  autorId: string,
  conteudo: string,
  extra: { anexoId?: string; anexoNome?: string; metadados?: Record<string, unknown> } = {},
): BackendPendenciaEvento {
  return {
    id,
    tipo,
    autorId,
    autorNome: autorId === SISTEMA ? 'Sistema' : (usuarioPorId(autorId)?.name ?? null),
    conteudo,
    anexoNome: extra.anexoNome ?? null,
    metadados: extra.anexoId ? { anexoId: extra.anexoId, ...extra.metadados } : (extra.metadados ?? null),
    createdAt: new Date().toISOString(),
  };
}
