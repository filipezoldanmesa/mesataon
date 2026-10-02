import type { GarantiaExistente, GarantiaExistentesResult } from '@/lib/garantia/garantia.api';
import {
  mapGarantia,
  mapGarantiaIndicacao as mapIndicacaoLeitura,
  type GarantiaAtribuicao,
  type GarantiaAtribuicaoSneg,
  type GarantiaDocumentoLegado,
  type GarantiaView,
} from '@/lib/garantia/garantia-mapping';
import { mapGarantiaTrack } from '@/lib/garantia/garantia-track-mapping';
import type { GarantiaTrackResult } from '@/lib/garantia/garantia-track.types';
import {
  mapGarantiaIndicacao as mapIndicacaoEscrita,
  type GarantiaIndicacao as GarantiaIndicacaoEscrita,
} from '@/lib/garantia/indicacao-mapping';
import { mapBackendToItem } from '@/lib/garantia/indicacoes-mapping';
import type { GarantiaIndicacaoItem } from '@/lib/garantia/indicacoes.types';
import type { GarantiaIndicacao } from '@/lib/garantia/types';
import { TIPO_DOCUMENTO_CASAMENTO, TIPO_DOCUMENTO_CERTIDAO, TIPO_DOCUMENTO_LAUDO } from '@/lib/garantia/constants';

import {
  arquivoEnviado,
  campo,
  erro,
  json,
  pdf,
  semConteudo,
  semPermissao,
} from '../core/respostas';
import { rotas, type MockContext } from '../core/router';
import { temPapel } from '../core/session';
import { agoraIso, fatia, novoId } from '../core/store';
import { oportunidade } from '../estado-compartilhado';
import type { OportunidadeElenco } from '../elenco';
import { linhaDoCard, linhaDoTicket } from '../dados/garantia/payloads';
import {
  analiseIniciada,
  analistaDaArea,
  envioPreviaGate,
  indicacaoEscritaBackend,
  indicacaoViewBackend,
  indicacoesEditaveis,
  itemBackend,
  podeConfirmarPrevia,
  trilhaBackend,
  viewBackend,
} from '../dados/garantia/regras';
import {
  GARANTIAS_EXISTENTES_POR_CLIENTE,
  garantiaVazia,
  sementeGarantias,
  type GarantiaOppInt,
  type IndicacaoInt,
} from '../dados/garantia/semente';

/**
 * Mocks do domínio garantia — trilha, read model da tela da CCOB, indicações
 * (card da 01b e ticket de pendência), análise prévia, minuta e reatribuições.
 *
 * O estado mora em `GarantiaOppInt` (forma de banco); cada resposta passa pelo
 * MESMO mapper da BFF de produção (`mapGarantia`, `mapGarantiaTrack`,
 * `mapBackendToItem`, `mapGarantiaIndicacao`).
 */

const garantias = fatia<Record<string, GarantiaOppInt>>('garantia-estado', sementeGarantias);

/** Papéis com autoridade de LT (`LT_AUTHORITY_ROLES` + ADMIN). */
const PAPEIS_LT = ['LT', 'EXPANSAO', 'SPCOM', 'TI_SUSTENTACAO', 'ADMIN'];
/** `GARANTIA_CARD_WRITE_ROLES` — o card também aceita SNEG e BP. */
const PAPEIS_CARD = [...PAPEIS_LT, 'SNEG', 'BP_FINANCEIRO'];

type Contexto = { opp: OportunidadeElenco; g: GarantiaOppInt };

/** Resolve oportunidade + garantia; oportunidade nova no protótipo ganha garantia vazia. */
function carregar(id: string): Contexto | null {
  const opp = oportunidade(id);
  if (!opp) return null;
  const mapa = garantias();
  mapa[id] ??= garantiaVazia(id, opp.valorEstimado);
  return { opp, g: mapa[id] };
}

function semOportunidade(): Response {
  return erro(404, 'Oportunidade não encontrada.');
}

const view = ({ g, opp }: Contexto) => json<GarantiaView>(mapGarantia(viewBackend(g, opp)));
const item = (opp: OportunidadeElenco, i: IndicacaoInt) => mapBackendToItem(opp.id, itemBackend(i));

function acharIndicacao(g: GarantiaOppInt, id: string): IndicacaoInt | undefined {
  return g.indicacoes.find((i) => i.id === id);
}

/** Promove o conjunto à análise prévia e distribui à CCOB (roteamento da Governança). */
function promoverParaPrevia(g: GarantiaOppInt): void {
  const agora = agoraIso();
  g.estado = 'EM_ANALISE_PREVIA';
  g.indicacaoSubmetidaEm = agora;
  g.pendenciaIndicacaoId = null;
  g.atribuicaoCcob = { analistaId: 'usr-ccob-gabriela', gerencia: g.gerencia, atribuidaEm: agora };
  g.previas.push({ parecer: null, resultado: null, abertaEm: agora, concluidaEm: null });
}

/** Promove sozinho quando o conjunto ficou apto (o `reconciliar` do backend). */
function reconciliar(ctx: Contexto): void {
  if (ctx.g.estado !== 'AGUARDANDO_INDICACAO' || !analiseIniciada(ctx.opp.estado)) return;
  if (envioPreviaGate(ctx.g).habilitado) promoverParaPrevia(ctx.g);
}

/** Ticket de pendência só escreve enquanto o subprocesso espera a indicação. */
function recusaDoTicket(g: GarantiaOppInt): Response | null {
  if (g.estado === 'AGUARDANDO_INDICACAO' || g.estado === 'PREVIA_REPROVADA') return null;
  return erro(409, 'As garantias não podem ser alteradas agora: o conjunto já foi enviado para a análise prévia da CCOB.');
}

/** O card só escreve com a oportunidade em preenchimento (`indicacaoMutavel`). */
function recusaDoCard(opp: OportunidadeElenco): Response | null {
  if (indicacoesEditaveis(opp.estado)) return null;
  return erro(
    409,
    'As garantias não podem ser alteradas agora: a oportunidade já saiu do preenchimento. Use a pendência de garantia para corrigi-las.',
  );
}

function corpoJson(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body) && !(body instanceof FormData)
    ? (body as Record<string, unknown>)
    : null;
}

function removerGarantia({ params, user }: MockContext): Response {
  if (!temPapel(user, ...PAPEIS_CARD)) return semPermissao();
  const ctx = carregar(params.id);
  if (!ctx) return semOportunidade();
  const idx = ctx.g.indicacoes.findIndex((i) => i.id === params.garantiaId);
  if (idx < 0) return erro(404, 'Garantia não encontrada.');
  const recusa = recusaDoCard(ctx.opp);
  if (recusa) return recusa;
  ctx.g.indicacoes.splice(idx, 1);
  return semConteudo();
}

function analistaInvalido(area: 'CCOB' | 'SNEG'): Response {
  return erro(422, `O analista escolhido não pertence ao grupo do perfil ${area} no Entra ID.`);
}

rotas('garantia', [
  // ───────────────────────────── leitura ─────────────────────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantia',
    handler: ({ params }) => {
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      return json<GarantiaTrackResult>(mapGarantiaTrack(trilhaBackend(ctx.g, ctx.opp)));
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantia/view',
    handler: ({ params }) => {
      const ctx = carregar(params.id);
      if (!ctx) return erro(404, 'Garantia não encontrada — a oportunidade ainda não entrou em análise.');
      return view(ctx);
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantia/indicacao',
    handler: ({ params }) => {
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      return json<GarantiaIndicacao>(mapIndicacaoLeitura(indicacaoViewBackend(ctx.g)));
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantia/existentes',
    handler: ({ params }) => {
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const items: Array<GarantiaExistente & { vigenteAte: string | null }> = (
        GARANTIAS_EXISTENTES_POR_CLIENTE[ctx.opp.clienteSap] ?? []
      ).map((g) => ({
        sapId: g.externalId,
        descricao: g.descricaoBem,
        tipo: g.tipo,
        valorAvaliadoBRL: g.valorAvaliadoBRL,
        vigenteAte: g.vigenteAte,
      }));
      return json<GarantiaExistentesResult>({ items, lacuna: false });
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantia/documento-suporte',
    // Mesmo documento para toda oportunidade — e, como em produção, um PLACEHOLDER.
    handler: () =>
      pdf('Documento de Suporte da CCOB (placeholder - em elaboração)', 'documento-suporte-ccob.pdf', true),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantia/documents/:docId/stream',
    handler: ({ params }) => {
      const ctx = carregar(params.id);
      if (!ctx) return erro(404, 'Documento não encontrado.');
      const legado = ctx.g.documentosLegado.find((d) => d.id === params.docId);
      const daGarantia = ctx.g.indicacoes.flatMap((i) => i.documentos).find((d) => d.id === params.docId);
      const doc = legado ?? daGarantia;
      if (!doc) return erro(404, 'Documento não encontrado.');
      return pdf(`${doc.type} - ${ctx.opp.code}`, doc.fileName, true);
    },
  },

  // ───────────────────────────── indicações (card da 01b) ─────────────────────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantias',
    handler: ({ params }) => {
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      return json<GarantiaIndicacaoItem[]>(ctx.g.indicacoes.map((i) => item(ctx.opp, i)));
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantias',
    handler: ({ params, body, user }) => {
      if (!temPapel(user, ...PAPEIS_CARD)) return semPermissao();
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const recusa = recusaDoCard(ctx.opp);
      if (recusa) return recusa;
      const linha = linhaDoCard(body);
      if (!linha.ok) return erro(400, linha.erro);
      const nova: IndicacaoInt = {
        ...linha.valor,
        id: novoId('gi'),
        criadaEm: agoraIso(),
        documentos: [],
        legado: { certidao: null, laudo: null },
      };
      // A lista vem `createdAt DESC`: a mais nova primeiro.
      ctx.g.indicacoes.unshift(nova);
      return json<GarantiaIndicacaoItem>(item(ctx.opp, nova), 201);
    },
  },
  {
    method: 'PATCH',
    pattern: '/opportunities/:id/garantias/:garantiaId',
    handler: ({ params, body, user }) => {
      if (!temPapel(user, ...PAPEIS_CARD)) return semPermissao();
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const atual = acharIndicacao(ctx.g, params.garantiaId);
      if (!atual) return erro(404, 'Garantia não encontrada.');
      const recusa = recusaDoCard(ctx.opp);
      if (recusa) return recusa;
      const linha = linhaDoCard(body, atual);
      if (!linha.ok) return erro(400, linha.erro);
      Object.assign(atual, linha.valor);
      return json<GarantiaIndicacaoItem>(item(ctx.opp, atual));
    },
  },
  // Remoção: o browser usa POST (o edge recusa DELETE); os dois verbos, uma implementação.
  { method: 'POST', pattern: '/opportunities/:id/garantias/:garantiaId', handler: removerGarantia },
  { method: 'DELETE', pattern: '/opportunities/:id/garantias/:garantiaId', handler: removerGarantia },
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantias/:garantiaId/documentos',
    handler: ({ params, body, user }) => {
      if (!temPapel(user, ...PAPEIS_CARD)) return semPermissao();
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const atual = acharIndicacao(ctx.g, params.garantiaId);
      if (!atual) return erro(404, 'Garantia não encontrada.');
      const tipo = campo<string>(body, 'type');
      if (typeof tipo !== 'string' || !tipo.trim()) return erro(400, 'Informe o tipo do documento.');
      const arquivo = arquivoEnviado(body);
      if (!arquivo) return erro(400, 'Arquivo obrigatório.');

      const ordemMatricula = Number(campo<string>(body, 'matriculaOrdem') ?? NaN);
      const ordemFiador = Number(campo<string>(body, 'fiadorOrdem') ?? NaN);
      const substituir = campo<string>(body, 'substituirDocumentoId');
      const matricula = Number.isFinite(ordemMatricula) ? atual.matriculas.find((m) => m.ordem === ordemMatricula) : undefined;
      const fiador = Number.isFinite(ordemFiador) ? atual.fiadores[ordemFiador - 1] : undefined;
      if (Number.isFinite(ordemMatricula) && !matricula) return erro(400, `A matrícula ${ordemMatricula} não existe nesta garantia.`);
      if (Number.isFinite(ordemFiador) && !fiador) return erro(400, `O fiador ${ordemFiador} não existe nesta garantia.`);

      const novo = {
        id: novoId('gdoc'),
        type: tipo.trim(),
        fileName: arquivo.nome,
        uploadedAt: agoraIso(),
        matriculaId: matricula?.id ?? null,
        fiadorId: fiador?.id ?? null,
      };
      // Tipos `single` (certidão por matrícula, casamento por fiador, demais por garantia) trocam em lugar;
      // o laudo é múltiplo e só troca quando o formulário diz qual.
      const ocupante =
        typeof substituir === 'string' && substituir
          ? atual.documentos.findIndex((d) => d.id === substituir)
          : novo.type === TIPO_DOCUMENTO_LAUDO
            ? -1
            : atual.documentos.findIndex(
                (d) => d.type === novo.type && d.matriculaId === novo.matriculaId && d.fiadorId === novo.fiadorId,
              );
      if (ocupante >= 0) atual.documentos.splice(ocupante, 1, novo);
      else atual.documentos.push(novo);
      reconciliar(ctx);
      return json<GarantiaDocumentoLegado>(
        { id: novo.id, type: novo.type, fileName: novo.fileName, uploadedAt: novo.uploadedAt },
        201,
      );
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantias/:garantiaId/:slot',
    handler: ({ params, body, user }) => {
      if (!['certidao', 'laudo', 'certidaoCasamento'].includes(params.slot)) return erro(400, 'Slot inválido.');
      if (!temPapel(user, ...PAPEIS_CARD)) return semPermissao();
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const atual = acharIndicacao(ctx.g, params.garantiaId);
      if (!atual) return erro(404, 'Garantia não encontrada.');
      const arquivo = arquivoEnviado(body);
      if (!arquivo) return erro(400, 'Arquivo obrigatório.');
      if (params.slot === 'certidaoCasamento') {
        // Não há coluna legada para ela: vai ao repositório, vinculada ao 1º fiador.
        const fiadorId = atual.fiadores[0]?.id ?? null;
        atual.documentos = atual.documentos.filter((d) => !(d.type === TIPO_DOCUMENTO_CASAMENTO && d.fiadorId === fiadorId));
        atual.documentos.push({
          id: novoId('gdoc'),
          type: TIPO_DOCUMENTO_CASAMENTO,
          fileName: arquivo.nome,
          uploadedAt: agoraIso(),
          matriculaId: null,
          fiadorId,
        });
      } else {
        atual.legado[params.slot as 'certidao' | 'laudo'] = arquivo.nome;
      }
      return json<GarantiaIndicacaoItem>(item(ctx.opp, atual), 201);
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/garantias/:garantiaId/:slot/view',
    handler: ({ params }) => {
      if (params.slot !== 'certidao' && params.slot !== 'laudo') return erro(400, 'Slot inválido.');
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const atual = acharIndicacao(ctx.g, params.garantiaId);
      if (!atual) return erro(404, 'Garantia não encontrada.');
      const nome = atual.legado[params.slot];
      if (!nome) return erro(404, 'Documento não anexado.');
      const titulo = params.slot === 'certidao' ? TIPO_DOCUMENTO_CERTIDAO : TIPO_DOCUMENTO_LAUDO;
      return pdf(`${titulo} - ${ctx.opp.code}`, nome, true);
    },
  },

  // ───────────────────────────── ticket de pendência ─────────────────────────────
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantia/indicar',
    handler: ({ params, body, user }) => {
      if (!temPapel(user, ...PAPEIS_LT)) return erro(403, 'Sem permissão para indicar a garantia. Apenas LT e Admin.');
      const ctx = carregar(params.id);
      if (!ctx) return erro(404, 'Garantia não encontrada — a oportunidade ainda não entrou em análise.');
      if (!corpoJson(body)) return erro(400, 'Corpo inválido.');
      const recusa = recusaDoTicket(ctx.g);
      if (recusa) return recusa;
      const linha = linhaDoTicket(body);
      if (!linha.ok) return erro(400, linha.erro);
      const nova: IndicacaoInt = {
        ...linha.valor,
        id: novoId('gi'),
        criadaEm: agoraIso(),
        documentos: [],
        legado: { certidao: null, laudo: null },
      };
      ctx.g.indicacoes.unshift(nova);
      ctx.g.indicacaoSubmetidaEm = agoraIso();
      if (ctx.g.estado === 'PREVIA_REPROVADA') ctx.g.estado = 'AGUARDANDO_INDICACAO';
      // Os documentos chegam DEPOIS (por `.../documentos`), e é o `reconciliar` que promove.
      return json<GarantiaIndicacaoEscrita>(mapIndicacaoEscrita(indicacaoEscritaBackend(ctx.g, nova.id)));
    },
  },
  {
    method: 'PATCH',
    pattern: '/opportunities/:id/garantia/indicacoes/:indicacaoId',
    handler: ({ params, body, user }) => {
      if (!temPapel(user, ...PAPEIS_CARD)) return semPermissao();
      if (!corpoJson(body)) return erro(400, 'Corpo inválido.');
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const atual = acharIndicacao(ctx.g, params.indicacaoId);
      if (!atual) return erro(404, 'Garantia não encontrada.');
      const recusa = recusaDoTicket(ctx.g);
      if (recusa) return recusa;
      const linha = linhaDoTicket(body, atual);
      if (!linha.ok) return erro(400, linha.erro);
      Object.assign(atual, linha.valor);
      return json<GarantiaIndicacaoItem>(item(ctx.opp, atual));
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantia/reconciliar',
    handler: ({ params }) => {
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      reconciliar(ctx);
      return semConteudo();
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantia/enviar-analise-previa',
    handler: ({ params, user }) => {
      if (!temPapel(user, ...PAPEIS_CARD)) return semPermissao();
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      const gate = envioPreviaGate(ctx.g);
      if (!gate.disponivel) return erro(409, gate.motivo ?? 'A análise prévia da garantia já foi acionada.');
      if (!analiseIniciada(ctx.opp.estado)) {
        return erro(
          422,
          'A análise prévia da garantia só pode ser acionada depois que a oportunidade for enviada para análise (GATE 1).',
        );
      }
      if (!gate.habilitado) {
        return erro(422, [gate.motivo, ...gate.motivos.map((m) => `• ${m}`)].filter(Boolean).join('\n'));
      }
      promoverParaPrevia(ctx.g);
      return semConteudo();
    },
  },

  // ───────────────────────────── CCOB: análise prévia ─────────────────────────────
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantia/previa',
    handler: ({ params, body, user }) => {
      const b = corpoJson(body);
      if (!b) return erro(400, 'Corpo inválido.');
      if (b.resultado !== 'APROVADA' && b.resultado !== 'REPROVADA') {
        return erro(400, 'Resultado inválido. Selecione Aprovar ou Reprovar.');
      }
      if (typeof b.parecer !== 'string' || !b.parecer.trim()) {
        return erro(400, 'O parecer da CCOB é obrigatório e não pode ser em branco.');
      }
      if (!temPapel(user, 'CCOB', 'ADMIN')) {
        return erro(403, 'Sem permissão para registrar a análise prévia. Apenas CCOB e Admin.');
      }
      const ctx = carregar(params.id);
      if (!ctx || ctx.g.estado !== 'EM_ANALISE_PREVIA') {
        return erro(404, 'Garantia não encontrada ou estado inválido para esta ação.');
      }
      const gate = podeConfirmarPrevia(ctx.g);
      if (!gate.habilitada) return erro(422, gate.motivoBloqueio ?? 'A análise prévia não pode ser confirmada agora.');

      const agora = agoraIso();
      const previa = ctx.g.previas[ctx.g.previas.length - 1];
      previa.parecer = b.parecer.trim();
      previa.resultado = b.resultado;
      previa.concluidaEm = agora;
      if (b.resultado === 'APROVADA') {
        ctx.g.estado = 'PREVIA_APROVADA';
        // O fluxo de garantia passa à SNEG (etapa GARANTIA da Governança).
        ctx.g.atribuicaoSneg = {
          analistaId: ctx.opp.analistaSnegId ?? 'usr-sneg-carla',
          gerencia: ctx.g.gerencia,
          atribuidaEm: agora,
        };
      } else {
        // Dupla transição de propósito: PREVIA_REPROVADA → AGUARDANDO_INDICACAO (volta ao ticket do LT).
        ctx.g.estado = 'AGUARDANDO_INDICACAO';
        ctx.g.pendenciaIndicacaoId = `pend-garantia-${ctx.opp.id}`;
      }
      return view(ctx);
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantia/reatribuir',
    handler: ({ params, body, user }) => {
      const b = corpoJson(body);
      if (!b) return erro(400, 'Corpo inválido.');
      if (typeof b.analistaId !== 'string' || !b.analistaId.trim()) return erro(400, 'Informe o analista da CCOB.');
      if (!temPapel(user, 'CCOB', 'ADMIN')) return semPermissao();
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      if (ctx.g.estado !== 'EM_ANALISE_PREVIA') {
        return erro(422, 'A análise prévia já foi realizada (ou ainda não começou) — o analista não pode ser trocado agora.');
      }
      if (!analistaDaArea(b.analistaId, 'CCOB')) return analistaInvalido('CCOB');
      ctx.g.atribuicaoCcob = { analistaId: b.analistaId, gerencia: ctx.g.gerencia, atribuidaEm: agoraIso() };
      return json<GarantiaAtribuicao>(mapGarantia(viewBackend(ctx.g, ctx.opp)).atribuicao);
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantia/reatribuir-sneg',
    handler: ({ params, body, user }) => {
      const b = corpoJson(body);
      if (!b) return erro(400, 'Corpo inválido.');
      if (typeof b.analistaId !== 'string' || !b.analistaId.trim()) return erro(400, 'Informe o analista da SNEG.');
      if (!temPapel(user, 'SNEG', 'ADMIN')) return semPermissao();
      const ctx = carregar(params.id);
      if (!ctx) return semOportunidade();
      if (ctx.g.estado !== 'PREVIA_APROVADA' && ctx.g.estado !== 'MINUTA_EM_ANDAMENTO') {
        return erro(422, 'O fluxo de garantia ainda não começou — ele começa quando a CCOB aprova a análise prévia.');
      }
      if (!analistaDaArea(b.analistaId, 'SNEG')) return analistaInvalido('SNEG');
      ctx.g.atribuicaoSneg = { analistaId: b.analistaId, gerencia: ctx.g.gerencia, atribuidaEm: agoraIso() };
      return json<GarantiaAtribuicaoSneg>(mapGarantia(viewBackend(ctx.g, ctx.opp)).atribuicaoSneg);
    },
  },

  // ───────────────────────────── SNEG: minuta de garantia ─────────────────────────────
  {
    method: 'POST',
    pattern: '/opportunities/:id/garantia/minuta',
    handler: ({ params, body, user }) => {
      const b = corpoJson(body);
      if (!b) return erro(400, 'Corpo inválido.');
      if (typeof b.netlexId !== 'string' || !b.netlexId.trim()) return erro(400, 'Número do Netlex é obrigatório.');
      if (!temPapel(user, 'SNEG', 'ADMIN')) return erro(403, 'Sem permissão para registrar a minuta. Apenas SNEG e Admin.');
      const ctx = carregar(params.id);
      if (!ctx) return erro(404, 'Garantia não encontrada ou estado inválido para esta ação.');
      if (ctx.g.estado !== 'PREVIA_APROVADA' && ctx.g.estado !== 'MINUTA_EM_ANDAMENTO') {
        return erro(422, 'A minuta de garantia só pode ser registrada depois da aprovação da análise prévia.');
      }
      const numero = b.netlexId.trim();
      const mesmo = ctx.g.minuta?.netlexNumero === numero;
      ctx.g.minuta = { netlexNumero: numero, status: mesmo ? (ctx.g.minuta?.status ?? null) : null };
      ctx.g.estado = 'MINUTA_EM_ANDAMENTO';
      return view(ctx);
    },
  },
]);
