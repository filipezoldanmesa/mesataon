'use client';

import type { ComponentType } from 'react';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DANGER_OUTLINE_BTN,
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useConfirm } from '@/components/confirm-dialog';
import { StatusPill, type PillVariant } from '@/components/status-pill';
import { ENABLE_PENDENCIA_FILE_UPLOAD } from '@/lib/feature-flags';
import { ApiValidationError } from '@/lib/api-errors';
import { clienteOppLine } from '@/lib/pendencias/cliente-opp';
import { withBasePath } from '@/lib/base-path';
import {
  adicionarComentario,
  getPendenciaDetalhe,
  listPendenciaAnexos,
  resolverPendencia,
  uploadPendenciaAnexo,
} from '@/lib/pendencias/pendencia-detail.data';
import type {
  AdicionarComentarioPayload,
  HistoricoEntry,
  HistoricoTipo,
  PendenciaAnexo,
  PendenciaDetalhe,
  PendenciaDetalhePrioridade,
  PendenciaDetalheStatus,
  ResolverPendenciaPayload,
} from '@/lib/pendencias/types';
import { PendenciaNotFoundError } from '@/lib/pendencias/types';
import {
  TIPO_GARANTIA_LABEL,
  TIPO_GARANTIA_OPTIONS,
  CATEGORIA_GARANTIA_OPTIONS,
  ORIGEM_GARANTIA_OPTIONS,
  TIPO_DOCUMENTO_CERTIDAO,
  TIPO_DOCUMENTO_CASAMENTO,
  TIPO_DOCUMENTO_LAUDO,
  TIPO_DOCUMENTO_COMPLEMENTAR,
  TIPO_DOCUMENTO_MINUTA_FIANCA,
  ACEITOS_DOCUMENTO_GARANTIA,
  ACEITOS_DOCUMENTO_COMPLEMENTAR,
  MINUTA_FIANCA_DOC_ID,
  PENDENCIA_DOC_ID,
  exigeImovel,
  exigeFiador,
  exigeConjuge,
  fiadorEhPessoaJuridica,
  AVISO_FIANCA_COM_LASTRO,
  AVISO_FIANCA_SEM_LASTRO,
  PERGUNTA_COMPARTILHAMENTO,
  TIPO_GARANTIA,
  ORIGEM_GARANTIA,
} from '@/lib/garantia/constants';
import {
  FIADOR_EMPTY,
  FiadoresRepetidor,
  type FiadorField,
} from '@/components/garantia/fiadores-repetidor';
import { DocumentoSuporteCcob } from '@/components/garantia/documento-suporte-ccob';
import {
  AdicionarGarantiaBotao,
  GarantiasLista,
  GarantiasVazio,
  type GarantiaLinhaVM,
} from '@/components/garantia/garantias-lista';
import {
  LaudosBlocos,
  MatriculasBlocos,
} from '@/components/garantia/matriculas-laudos-blocos';
import {
  GARANTIA_FORM_EMPTY,
  itemParaFormularioDoTicket,
  type GarantiaFormFields,
} from '@/components/pendencias/garantia-form-fields';
import { maskMoneyInput } from '@/lib/franquia/format';
import { PicklistSelect } from '@/components/picklists/picklist-select';
import { PicklistField } from '@/lib/picklists/picklists.types';
import type {
  TipoGarantia,
  CategoriaBem,
  OrigemGarantia,
  EstadoCivil,
} from '@/lib/garantia/constants';
import {
  atualizarGarantiaIndicadaDoTicket,
  indicarGarantia,
  garantiaExistenteLabel,
  getGarantia,
  getGarantiasExistentes,
  reconciliarGarantia as reconciliarGarantiaCliente,
} from '@/lib/garantia/garantia.api';
import type { GarantiaView } from '@/lib/garantia/garantia-mapping';
import { indicacaoTemMudancaQueResolve } from '@/lib/garantia/resolucao-da-indicacao';
import { ResultadoPrevia } from '@/lib/garantia/types';
import { AvisoGarantia } from '@/components/garantia/aviso-garantia';
import { anexarDocumentoGarantia } from '@/lib/garantia/indicacoes.api';
/*
 * ADO 68110 — as garantias JÁ PERSISTIDAS entram por aqui, e `indicacoes.data`
 * é o ponto único de importação da família (nunca `.api`/`.mock` direto).
 */
import {
  deleteGarantiaIndicada,
  loadGarantiasIndicadas,
} from '@/lib/garantia/indicacoes.data';
import {
  ENDERECO_VAZIO,
  enderecoCompleto,
  type GarantiaIndicacaoItem,
} from '@/lib/garantia/indicacoes.types';
import { linhaGarantiaPersistida } from '@/components/garantia/linha-garantia-persistida';
/*
 * O MESMO parse que o card da 01b usa para montar o payload (ADO 68002). As
 * duas superfícies escrevem a mesma garantia, então o que a tela aceita e o
 * que viaja no corpo têm de ser decididos por uma implementação só: este
 * arquivo tinha um `parseFloat` próprio, duplicado ainda por cima entre o
 * payload e a lista de faltantes.
 */
import { parseValorBrl } from '@/lib/garantia/indicacoes-mapping';
import type {
  GarantiaIndicarPayload,
  BackendFiador,
} from '@/lib/garantia/indicacao-mapping';
import type { GarantiaExistente } from '@/lib/garantia/garantia.api';
import { attachDoc } from '@/lib/documents/documents.api';
import { DdiPanel } from '@/components/opportunities/ddi-panel';
import {
  getDdiResult,
  reclassifyDdi,
  requestDdiDocument,
  solicitarRevisaoDdi,
} from '@/lib/opportunities/ddi.api';
import { DDI_REVISAO_JUSTIFICATIVA_MIN_LENGTH } from '@/lib/opportunities/ddi.types';
import type {
  DdiDecision,
  DdiDocumentRequestPayload,
  DdiReclassifyPayload,
  DdiResult,
  DdiRevisaoPayload,
  DdiRiskLevel,
} from '@/lib/opportunities/ddi.types';
import { Permission } from '@/lib/auth-permissions';
import {
  AttachmentIcon,
  CheckCircleIcon,
  CommentIcon,
  DocumentIcon,
  GearIcon,
  InfoIcon,
  SearchIcon,
  StatusChangeIcon,
  UserIcon,
} from '@/components/icons';
import { Select } from '@/components/ui/select';
import { nomeDeArquivoSeguro } from '@/lib/arquivo/nome-de-arquivo';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error' | 'not-found';
type AnexoLoadStatus = 'loading' | 'loaded' | 'error';
type ActionStatus = 'idle' | 'saving' | 'error';

/**
 * Upload state for a single file attachment in the garantia form.
 *
 * `pendente` existe desde 28/08/2026: o documento pertence à GARANTIA, e a
 * garantia só nasce no submit — então o arquivo escolhido espera no cliente e
 * sobe depois, com a indicação a que vincular. Antes ele subia no instante da
 * escolha, e era exatamente por isso que ia parar no checklist da oportunidade,
 * sem vínculo com garantia nenhuma.
 */
type FileUploadState =
  | { status: 'idle' }
  | { status: 'pendente'; file: File; type: string; fileName: string }
  | { status: 'uploading' }
  | { status: 'uploaded'; docId: string; fileName: string }
  | { status: 'error'; error: string; fileName: string };

type Props = {
  pendenciaId: string;
  /**
   * Id of the signed-in user, used to render the prototype's `.msg.me` variant
   * on entries they authored. Matched by id — never by name, which is not a
   * stable identity. Absent ⇒ no entry is highlighted (safe default).
   */
  currentUserId?: string | null;
  /** Injectable for tests; defaults to the real BFF client. */
  load?: (id: string) => Promise<PendenciaDetalhe>;
  comentar?: (
    id: string,
    payload: AdicionarComentarioPayload,
  ) => Promise<PendenciaDetalhe>;
  resolver?: (
    id: string,
    payload: ResolverPendenciaPayload,
  ) => Promise<PendenciaDetalhe>;
  /**
   * Injectable for tests; defaults to the real indicarGarantia client.
   * Called instead of `resolver` when acaoResolucao === 'garantia'.
   */
  indicar?: (
    opportunityId: string,
    payload: GarantiaIndicarPayload,
  ) => ReturnType<typeof indicarGarantia>;
  /**
   * Injectable for tests; defaults to the real client. Anexa um documento à
   * garantia recém-criada (spec 28/08/2026 §4.3).
   *
   * `matriculaOrdem` (1..N) diz qual matrícula a certidão de inteiro teor
   * lastreia (HIP-03) — ausente em tudo que não pertence a uma.
   */
  anexarDoc?: (
    opportunityId: string,
    indicacaoId: string,
    type: string,
    file: File,
    matriculaOrdem?: number,
    fiadorOrdem?: number,
  ) => Promise<void>;
  /**
   * Injectable for tests; defaults to the real getGarantiasExistentes client.
   */
  carregarExistentes?: (
    opportunityId: string,
  ) => ReturnType<typeof getGarantiasExistentes>;
  /**
   * Injectable for tests; defaults to the real client. As garantias JÁ
   * PERSISTIDAS nesta oportunidade — o conjunto que a CCOB analisa (ADO 68110).
   *
   * O ticket listava só o LOTE local (o que ainda não foi enviado), então uma
   * pendência reaberta depois de a prévia ser reprovada dizia "Nenhuma garantia
   * cadastrada ainda." sobre garantias que existem. E a partir de 02/09/2026 o
   * card da oportunidade é somente leitura passada a fase de preenchimento
   * (`indicacaoMutavel`), então este ticket é a ÚNICA superfície onde o LT vê e
   * corrige o conjunto.
   */
  carregarGarantias?: (opportunityId: string) => Promise<GarantiaIndicacaoItem[]>;
  /**
   * Injectable for tests; defaults to the real client. O read model da garantia,
   * lido por UMA razão: saber se a última análise prévia foi REPROVADA.
   *
   * ⚠️ O sinal NÃO é o estado do subprocesso nem o título da pendência. Depois de
   * `reprovarPrevia` o estado volta a `AGUARDANDO_INDICACAO` — indistinguível de
   * uma primeira indicação —, e casar o título ("… revisão após análise prévia")
   * seria decidir por texto de tela, que é o anti-padrão que este repo proíbe.
   * O veredito é `previa.resultado`, que o backend publica.
   *
   * É uma segunda leitura, e não um campo em `carregarGarantias`, porque aquela
   * rota devolve a LISTA de garantias e esta pergunta é sobre o CONJUNTO — pendurar
   * o veredito na lista daria dois donos à mesma resposta.
   */
  carregarGarantiaView?: (opportunityId: string) => Promise<GarantiaView>;
  /**
   * Injectable for tests; defaults to `deleteGarantiaIndicada`.
   *
   * ⚠️ **`POST`, não `DELETE`** — a chamada sai do BROWSER e o host do web está
   * atrás do edge que recusa o método (ADO 67557/67595). Quem sabe disso é o
   * cliente; aqui é só a porta.
   */
  /**
   * Injectable for tests; defaults to `atualizarGarantiaIndicadaDoTicket`.
   *
   * A edição de uma garantia JÁ PERSISTIDA, aplicada só quando a pendência é
   * resolvida. Mesmo corpo do `indicar` — ver o docblock da rota BFF.
   */
  atualizarGarantia?: (
    opportunityId: string,
    indicacaoId: string,
    payload: GarantiaIndicarPayload,
  ) => Promise<void>;
  /**
   * Injectable for tests; defaults to `reconciliarGarantia`.
   *
   * O passo que FECHA a pendência quando o conjunto ficou apto. Chamado UMA vez,
   * no fim — ver a ordem em `handleIndicar`.
   */
  reconciliarGarantia?: (opportunityId: string) => Promise<void>;
  /**
   * Injectable for tests; defaults to `deleteGarantiaIndicada`.
   *
   * ⚠️ **`POST`, não `DELETE`** — a chamada sai do BROWSER e o host do web está
   * atrás do edge que recusa o método (ADO 67557/67595). Quem sabe disso é o
   * cliente; aqui é só a porta.
   *
   * ⚠️ Chamado SÓ no submit, nunca no clique da linha: a exclusão é marcação de
   * tela até a pendência ser resolvida (04/09/2026).
   */
  removerGarantia?: (opportunityId: string, id: string) => Promise<void>;
  /**
   * Injectable for tests; defaults to the real attachDoc client.
   * Used to upload files for certidão, laudo, estatuto, and regular upload pendências.
   */
  /**
   * Assinatura idêntica à do `attachDoc` — inclusive o `target`, que estes slots
   * não usam (o `docId` deles é a chave sintética `category::type`, que o próprio
   * cliente sabe partir). Espelhar a assinatura em vez de encurtá-la é o que
   * permite passar `replace` na posição certa: com um parâmetro a menos, o
   * booleano caía no lugar do `target` (VBR-641).
   */
  uploadDoc?: typeof attachDoc;
  /**
   * Injectable for tests; defaults to the real getChecklist client. Used to
   * prefill the certidão/laudo attachment state when the documents were
   * already attached to the opportunity (documents tab / GATE 1) — the LT
   * must not be forced to re-upload them in the ticket.
   */
  /** Injectable for tests; defaults to the real thread-attachment client. */
  uploadAnexo?: (
    pendenciaId: string,
    file: File,
  ) => Promise<{ anexoId: string; anexoNome: string }>;
  /**
   * Injectable for tests; defaults to the real attachment-index client.
   * Loads the flat list of all files sent in this pendência.
   */
  listarAnexos?: (pendenciaId: string) => Promise<PendenciaAnexo[]>;
  /**
   * DDI clients, injectable for tests. Used only by the parecer flow
   * (`acaoResolucao === 'ddi'`): the pendência carries no risk of its own, so
   * the block reads the analysis to preselect the level Integridade is
   * reviewing instead of asking them to retype it.
   */
  carregarDdi?: (opportunityId: string) => Promise<DdiResult | null>;
  emitirParecer?: (
    opportunityId: string,
    payload: DdiReclassifyPayload,
  ) => Promise<DdiResult>;
  solicitarDocumento?: (
    opportunityId: string,
    payload: DdiDocumentRequestPayload,
  ) => Promise<{ pendenciaId: string }>;
  /**
   * Pedido de nova avaliação de uma DDI reprovada — o fluxo `ddi_revisao`, do
   * LT. Cliente próprio (e não um modo de `emitirParecer`) porque a rota e a
   * autoridade são outras: `POST .../ddi/solicitar-revisao`, `@Roles(LT, ADMIN)`.
   */
  solicitarRevisao?: (
    opportunityId: string,
    payload: DdiRevisaoPayload,
  ) => Promise<DdiResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<PendenciaDetalheStatus, PillVariant> = {
  aberta: 'warning',
  em_andamento: 'info',
  resolvida: 'success',
  cancelada: 'neutral',
};

const STATUS_LABEL: Record<PendenciaDetalheStatus, string> = {
  aberta: 'Aberta',
  // "Em tratativa" — same display label the list/canonical mapping uses for
  // EM_ANDAMENTO (`pendencia-mapping.ts`); keeps the wording consistent across
  // the list and the ticket (was "Em andamento" here).
  em_andamento: 'Em tratativa',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
};

const PRIORIDADE_VARIANT: Record<PendenciaDetalhePrioridade, PillVariant> = {
  urgente: 'danger',
  alta: 'danger',
  media: 'warning',
  baixa: 'neutral',
};

const PRIORIDADE_LABEL: Record<PendenciaDetalhePrioridade, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

/**
 * Icon per history entry type.
 */
const HISTORICO_ICON: Partial<
  Record<HistoricoTipo, ComponentType<{ className?: string }>>
> = {
  sistema: GearIcon,
  comentario: CommentIcon,
  status: StatusChangeIcon,
  resolucao: CheckCircleIcon,
  reatribuicao: UserIcon,
};

/**
 * Avatar background colour per area, expressed as DS tokens.
 *
 * ⚠️ As chaves são **rótulos pt-BR**, não tokens de máquina — `Integridade`, e
 * nunca `COMPLIANCE`. Para SNEG/LT/CCOB os dois coincidem, e é por isso que a
 * divergência passou despercebida: o parecer da Integridade era o único caso em
 * que o token difere do rótulo, então ele caía no cinza de sistema enquanto os
 * demais tingiam certo. Quem alimenta este mapa é sempre um campo já rotulado
 * pelo backend (`areaDisplay`, ou o perfil de acesso dos participantes).
 */
const AREA_AVATAR_COLOR: Record<string, string> = {
  SNEG: 'var(--color-info)',
  'LT/EV': 'var(--secondary-500)',
  LT: 'var(--secondary-500)',
  Sistema: 'var(--neutral-500)',
  sistema: 'var(--neutral-500)',
  CCOB: 'var(--color-warning)',
  Integridade: 'var(--color-danger)',
};

const SYSTEM_AVATAR_COLOR = 'var(--neutral-500)';

/**
 * Two-letter monogram, like the prototype's "AR" / "JC". First and LAST word,
 * not the first two: "Pedro Henrique Pimenta Rubinger" reads as PR, not PH.
 */
function initials(nome: string): string {
  const words = nome.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Area colour when known — the prototype tints the avatar per area. */
function avatarColorForParticipante(p: { area: string | null }): string {
  return (p.area && AREA_AVATAR_COLOR[p.area]) || 'var(--secondary-500)';
}

function avatarColor(tipo: HistoricoTipo, area?: string | null): string {
  if (tipo === 'sistema') return SYSTEM_AVATAR_COLOR;
  if (area && AREA_AVATAR_COLOR[area]) return AREA_AVATAR_COLOR[area];
  return SYSTEM_AVATAR_COLOR;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]">
      <div className="mb-3.5 flex items-baseline justify-between">
        <h2 className="text-(length:--t-h4) font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function DataField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-(length:--t-caption) font-normal tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">
        {value ?? "—"}
      </div>
    </div>
  );
}

function ThreadEntry({
  entry,
  areaResponsavel,
  currentUserId,
  autorArea,
}: {
  entry: HistoricoEntry;
  areaResponsavel?: string | null;
  currentUserId?: string | null;
  /**
   * Perfil de acesso de quem escreveu — o grupo do Entra da pessoa, resolvido
   * pelo backend a partir dos participantes (o evento guarda autor, não
   * lotação). O protótipo escreve "Juliana Costa · SNEG" no cabeçalho de cada
   * mensagem: sem ele, o thread diz quem falou mas não de que lado.
   *
   * `null` significa "o diretório não resolveu esta pessoa", e aí NADA é escrito
   * ao lado do nome. Nunca um rótulo de reserva: o `"LT"` que o backend chumbava
   * no criador da oportunidade era indistinguível de um correto, e rotulava como
   * Líder de Território gente que nunca foi (ADO 27/08/2026).
   */
  autorArea?: string | null;
}) {
  const EntryIcon = HISTORICO_ICON[entry.tipo];
  const isSystem = entry.tipo === 'sistema';
  const isMine =
    !isSystem && !!currentUserId && entry.autorId === currentUserId;
  const bgColor = avatarColor(entry.tipo, areaResponsavel);

  if (isSystem) {
    return (
      <div
        data-testid="historico-entry"
        data-variant="sys"
        className="rounded-[var(--radius-xs)] border border-dashed border-(--color-border) bg-(--neutral-25) px-[14px] py-3 text-center text-(length:--t-caption) text-(--color-text-muted)"
      >
        <span className="whitespace-pre-wrap">{entry.mensagem}</span>
        <span className="ml-2">{formatDateTime(entry.criadoEm)}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="historico-entry"
      data-variant={isMine ? 'me' : 'default'}
      className={`rounded-[var(--radius-xs)] border px-[14px] py-3 ${
        isMine
          ? 'border-(--secondary-200) bg-(--secondary-100)'
          : 'border-(--color-border)'
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          aria-hidden="true"
          style={{ backgroundColor: bgColor }}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-(length:--t-caption) font-bold text-white"
        >
          {EntryIcon ? <EntryIcon className="size-4" /> : "·"}
        </span>
        <span className="flex min-w-0 items-baseline gap-1 text-(length:--t-caption)">
          <span className="truncate font-bold">{entry.autor ?? "—"}</span>
          {autorArea && (
            <span className="shrink-0 text-(--color-text-muted)">
              · {autorArea}
            </span>
          )}
        </span>
        <span className="ml-auto shrink-0 text-(length:--t-caption) text-(--color-text-muted)">
          {formatDateTime(entry.criadoEm)}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-(length:--t-caption)">
        {entry.mensagem}
      </p>

      {entry.anexoNome &&
        /*
          Download, not a label: the file is the answer to what was asked in the
          thread, and a name nobody can open is a receipt for a document that
          might as well not have been sent. Same-origin — the BFF streams the
          bytes so the store's signed URL stays server-side.
        */
        (entry.anexoUrl ? (
          <a
            href={urlDeMidiaSegura(entry.anexoUrl) ?? undefined}
            download={nomeDeArquivoSeguro(entry.anexoNome) ?? true}
            className="mt-1.5 inline-flex items-center gap-1 rounded-[var(--radius-xxs)] bg-(--neutral-60) px-[7px] py-0.5 text-(length:--t-small) font-bold text-(--neutral-700) underline decoration-dotted underline-offset-2 transition hover:bg-(--neutral-100) hover:text-(--neutral-900)"
          >
            <AttachmentIcon />
            <span>{entry.anexoNome}</span>
          </a>
        ) : (
          /*
            CA-4: a file name that cannot be opened is worse than nothing. Events
            recorded before the attachment-id was stored in metadados fall here.
            Rendering a non-interactive chip labelled with a filename implies the
            user can open it — they cannot. The tooltip explains why and points to
            the Anexos panel as the recovery path.
          */
          <div
            className="mt-1.5 inline-flex items-center gap-1 rounded-[var(--radius-xxs)] bg-(--neutral-60) px-[7px] py-0.5 text-(length:--t-small) font-bold text-(--neutral-700) opacity-60"
            title="Arquivo enviado com uma versão anterior do sistema. Acesse o painel Anexos para baixá-lo."
            aria-label={`${entry.anexoNome} — não disponível para download direto neste evento; acesse o painel Anexos`}
          >
            <AttachmentIcon />
            <span>{entry.anexoNome}</span>
            <span className="ml-1 text-(--color-text-muted) font-normal">
              (ver Anexos)
            </span>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Garantia form — fiador fields sub-component
// ---------------------------------------------------------------------------

/**
 * Uma garantia já montada, esperando o submit do LOTE.
 *
 * ## Por que o lote existe
 *
 * GER-05 pede *"mais de uma garantia"* na pendência, e o desenho anterior era
 * submeter uma por vez — o `indicar` cria uma linha nova a cada chamada, e o
 * modal até dizia "Cadastrar mais uma garantia?". **Só que a segunda quase nunca
 * cabia**, e não por um limite: assim que a PRIMEIRA garantia fica apta, o
 * `GarantiaIndicacaoPendenciaWorker` (`@Interval(60s)`) promove o subprocesso
 * para `EM_ANALISE_PREVIA` e **auto-resolve a pendência**. A partir daí, dois
 * bloqueios ao mesmo tempo:
 *
 *  1. o ticket devolve a faixa "Pendência resolvida" ANTES do formulário
 *     (`if (isResolved)` precede o `if (isGar)`), então o formulário desaparece;
 *  2. e `indicar` recusa — `EM_ANALISE_PREVIA` não está em `ESTADOS_PERMITIDOS`.
 *
 * Ou seja: cadastrar a segunda só funcionava dentro de uma janela de menos de um
 * minuto. Quem preenchesse com calma via "só permite cadastrar 1".
 *
 * ## Por que acumular, e não afrouxar o estado
 *
 * As duas alternativas foram recusadas: **não auto-resolver a pendência** a
 * deixaria aberta (ela é `obrigatoria: true` e trava o GATE 2) sobre uma garantia
 * que já está apta; e **aceitar `indicar` em `EM_ANALISE_PREVIA`** mudaria o
 * CONJUNTO enquanto a CCOB o analisa — a prévia é do conjunto, e acrescentar item
 * no meio da análise é exatamente o que `indicacaoMutavel` existe para impedir.
 *
 * Acumular na tela e submeter tudo de uma vez não toca a máquina de estados: as
 * N linhas entram antes de qualquer promoção, e o worker encontra o conjunto
 * completo no primeiro ciclo.
 */
interface GarantiaEmLote {
  payload: GarantiaIndicarPayload;
  anexos: Array<{
    file: File;
    type: string;
    /** HIP-03 — a matrícula que a certidão de inteiro teor lastreia. */
    matriculaOrdem?: number;
    /** Migration `…139` — o fiador de quem é a certidão de casamento. */
    fiadorOrdem?: number;
  }>;
  /** Rótulo curto para a lista na tela — tipo + valor, sem PII de fiador. */
  resumo: string;
  /**
   * O estado do FORMULÁRIO que gerou esta entrada (02/09/2026).
   *
   * O modal reabre preenchido a partir daqui. O `payload` não serve: ele é o
   * corpo da API (códigos, número), e o formulário guarda texto mascarado, blocos
   * de matrícula/laudo e os `File` escolhidos — reconstruí-lo do payload perderia
   * exatamente os arquivos.
   */
  campos: GarantiaFormFields;
  camposFiadores: FiadorField[];
  camposMinuta: FileUploadState;
}

/**
 * Tudo o que o ticket tem para aplicar quando a pendência é resolvida
 * (04/09/2026).
 *
 * As três operações viajam JUNTAS porque a ordem entre elas é a regra: quem
 * promove o subprocesso é o backend a cada ANEXO, e a promoção auto-resolve a
 * pendência — o que fecha a janela de `indicacaoMutavel` e faz `PATCH`/`DELETE`
 * seguintes virem 409. Ver `handleIndicar`.
 */
interface RascunhoDeGarantias {
  /** Garantias que ainda não existem no backend. */
  novas: GarantiaEmLote[];
  /** Alterações em garantias que existem — id + o formulário inteiro. */
  edicoes: Array<{ indicacaoId: string; entrada: GarantiaEmLote }>;
  /** Ids marcados para excluir na tela. */
  exclusoes: string[];
}

/**
 * O que o submit CONSEGUIU aplicar — inclusive quando ele falhou no meio.
 *
 * Volta pelo próprio `onIndicar` em vez de um segundo canal: o pai já publica o
 * desfecho por `actionStatus`, e o que faltava era só *o quê* saiu do rascunho.
 * Sem isso, um erro parcial deixava a garantia recém-criada na lista relida E no
 * rascunho, e o retry a criava de novo.
 */
interface RascunhoAplicado {
  novas: GarantiaEmLote[];
  edicoes: string[];
  exclusoes: string[];
}

/** "2 garantias novas, 1 alterada e 1 excluída" — o que o confirm anuncia. */
function descreverRascunho(r: RascunhoDeGarantias): string {
  const partes = [
    r.novas.length > 0
      ? `${r.novas.length} garantia(s) nova(s)`
      : '',
    r.edicoes.length > 0 ? `${r.edicoes.length} alterada(s)` : '',
    r.exclusoes.length > 0 ? `${r.exclusoes.length} excluída(s)` : '',
  ].filter(Boolean);

  return `${partes.join(', ')}.`;
}

/**
 * `Garantia real · R$ 100.000,00` — o que a lista do lote mostra.
 *
 * ⚠️ Nunca nome nem documento de fiador: a lista fica na tela junto do thread da
 * pendência, e fiador é PII.
 */
function resumirGarantia(payload: GarantiaIndicarPayload): string {
  const tipo =
    TIPO_GARANTIA_LABEL[payload.tipo as TipoGarantia] ?? payload.tipo;
  const valor =
    typeof payload.valorAvaliadoBRL === "number"
      ? payload.valorAvaliadoBRL.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })
      : null;

  return [tipo, valor].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Upload widget for a single file attachment
// ---------------------------------------------------------------------------

function FileAttachWidget({
  label,
  required,
  uploadState,
  disabled,
  accept,
  onFile,
  onRetry,
  testId,
}: {
  label: string;
  required?: boolean;
  uploadState: FileUploadState;
  disabled: boolean;
  accept?: string;
  onFile: (file: File) => void;
  onRetry?: () => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  let statusText: string;
  let statusClass: string;
  /*
   * The document TYPE is the row's identity, so it stays on screen in every
   * state — the file name is appended, never substituted for it.
   *
   * Replacing the label with the file name made two rows indistinguishable
   * whenever the same file was attached to both slots (certidão and laudo both
   * reading `foto-posto-qa.png`), leaving no way to tell which one to swap.
   */
  let fileNameText: string | null = null;

  switch (uploadState.status) {
    case 'idle':
      statusText = label;
      statusClass = 'text-(--color-text-muted)';
      break;
    case 'pendente':
      /*
       * O arquivo está escolhido e sobe ao salvar — a garantia a que ele
       * pertence só nasce no submit (spec 28/08/2026 §4.3). O rótulo diz isso
       * em vez de "Enviando…", que prometeria um upload que não começou.
       */
      statusText = label;
      statusClass = 'font-bold text-(--color-text)';
      fileNameText = `${uploadState.fileName} · anexado ao salvar`;
      break;
    case 'uploading':
      statusText = label;
      statusClass = 'text-(--color-text-muted) animate-pulse';
      fileNameText = 'Enviando…';
      break;
    case 'uploaded':
      statusText = label;
      statusClass = 'font-bold text-(--color-text)';
      fileNameText = uploadState.fileName;
      break;
    case 'error':
      statusText = label;
      statusClass = 'text-(--color-danger)';
      fileNameText = `Erro: ${uploadState.error}`;
      break;
  }

  return (
    <div data-testid={testId} className="space-y-1">
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption)">
        <span className={statusClass}>
          {required && uploadState.status === 'idle' && (
            <span aria-hidden="true" className="mr-1 text-(--color-danger)">
              *
            </span>
          )}
          {statusText}
          {fileNameText && (
            <span className="ml-1 font-normal text-(--color-text-muted)">
              · {fileNameText}
            </span>
          )}
        </span>

        {uploadState.status === 'error' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={disabled}
            className="shrink-0 rounded-[var(--radius-xxs)] border border-(--color-danger) px-3 py-1 text-(length:--t-small) font-bold text-(--color-danger) hover:bg-(--color-danger-bg) disabled:opacity-50"
          >
            Tentar novamente
          </button>
        )}

        {uploadState.status !== "uploading" &&
          uploadState.status !== "error" && (
            <label className="shrink-0 cursor-pointer rounded-[var(--radius-xxs)] border border-(--secondary-500) px-3 py-1 text-(length:--t-small) font-bold text-(--secondary-500) hover:bg-(--neutral-40) disabled:opacity-50">
              {uploadState.status === "uploaded" ? "Trocar" : "Anexar"}
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept={accept ?? ".pdf,.png,.jpg,.jpeg"}
                disabled={disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onFile(file);
                    // Reset input so the same file can be re-selected after error.
                    e.target.value = "";
                  }
                }}
              />
            </label>
          )}
      </div>

      {uploadState.status === 'error' && (
        <p
          className="text-(length:--t-small) text-(--color-danger)"
          role="alert"
        >
          {uploadState.error} — selecione o arquivo novamente para tentar.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Garantia form fields (local state for the isGar resolve flow)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Parecer da Integridade (acaoResolucao === 'ddi')
// ---------------------------------------------------------------------------

const DDI_RISK_OPTIONS: Array<{ value: DdiRiskLevel; label: string }> = [
  { value: 'low', label: 'Baixo' },
  { value: 'medium', label: 'Médio' },
  { value: 'high', label: 'Alto' },
];

/** Minimum accepted by the backend DTO — mirrored so the modal says so first. */
const PARECER_MIN_LENGTH = 10;

/**
 * O que dizer quando a Integridade não pode mais agir (`emTratativa: false`).
 *
 * Na prática só `LIBERADA` chega aqui — a pendência de parecer nasce em
 * `PENDENTE_PARECER` e `REPROVADA` continua em tratativa —, mas os demais
 * estados têm frase porque o ticket pode ser reaberto depois de a análise ser
 * cancelada, falhar ou ser re-executada, e uma frase genérica sobre "não é
 * possível agir" não diria ao analista o que aconteceu.
 */
function textoTratativaEncerrada(
  situacao: DdiResult["situacao"] | null,
): string {
  switch (situacao) {
    case 'LIBERADA':
      return 'Parecer emitido: a Integridade LIBEROU esta oportunidade para aprovação. A liberação não é revertida por um novo parecer.';
    case 'PENDENTE':
    case 'EM_ANDAMENTO':
      return 'A análise de integridade ainda está em execução — o parecer pode ser emitido quando ela concluir.';
    case 'CONCLUIDA':
      return 'Esta análise não exige parecer da Integridade.';
    case 'CANCELADA':
      return 'A análise de integridade foi cancelada.';
    case 'ERRO':
      return 'A análise de integridade falhou e precisa ser executada novamente antes de receber parecer.';
    case 'NAO_ELEGIVEL':
      return 'Esta oportunidade não é elegível a análise de integridade.';
    default:
      // Inclui `null` (nenhuma análise lida) e um valor que este build não
      // conhece: nunca afirma um desfecho que não se leu.
      return 'Esta análise de integridade não está em tratativa — nenhuma ação está disponível aqui.';
  }
}

/**
 * "Resolver pendência" for the DDI parecer.
 *
 * This pendência is NOT closed by `POST .../resolver` (the backend answers 400
 * for its origin): what closes it is Integridade's decision, which is the only
 * place the parecer, the reviewed risk and the verdict are recorded together.
 *
 * The verdict is deliberately independent of the risk level: releasing an
 * opportunity whose risk honestly stayed "Alto" — mitigated by contract — is a
 * legitimate call, and rejecting one whose findings were archived is too.
 */
function DdiParecerBlock({
  pendencia,
  carregarDdi,
  emitirParecer,
  solicitarDocumento,
  onDone,
}: {
  pendencia: PendenciaDetalhe;
  carregarDdi: (opportunityId: string) => Promise<DdiResult | null>;
  emitirParecer: (
    opportunityId: string,
    payload: DdiReclassifyPayload,
  ) => Promise<DdiResult>;
  solicitarDocumento: (
    opportunityId: string,
    payload: DdiDocumentRequestPayload,
  ) => Promise<{ pendenciaId: string }>;
  onDone: () => void | Promise<void>;
}) {
  const { canWrite, can } = usePermissions();
  const podeEmitir = canWrite && can(Permission.DdiReclassify);
  const podeSolicitar = canWrite && can(Permission.DdiRequestDocument);
  /** `GET .../ddi` é `MATRIZ_DDI_VISUALIZAR` — sem a permissão, não busca (403). */
  const podeVerDdi = can(Permission.DdiView);
  const oportunidadeId = pendencia.oportunidadeId ?? '';

  const [ddiStatus, setDdiStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [risco, setRisco] = useState<DdiRiskLevel>("medium");
  /**
   * "Se tiver risco baixo, fica automaticamente marcado e ninguém pode mexer;
   * se tiver médio ou alto, o analista pode alterar."
   *
   * Reads the risk the TOOL gave (`engineRiskLevel`), never the current one:
   * after Integridade lowers a MÉDIO to Baixo, the field must stay editable —
   * locking it there would trap the analyst in their own last answer. Unknown
   * (older rows) counts as editable, the recoverable side.
   */
  const [riscoTravado, setRiscoTravado] = useState(false);
  const [situacao, setSituacao] = useState<DdiResult['situacao'] | null>(null);
  /**
   * Veredito do backend: a Integridade ainda pode agir nesta DDI?
   *
   * Enquanto isso não existia, os três botões eram oferecidos sempre — e depois
   * de "Liberar para aprovação" o segundo clique só podia terminar na recusa da
   * API, *"deixando o usuário em dúvida se a aprovação foi efetivada ou não"*
   * (ADO 02/09/2026). Começa `true` para o formulário não piscar fechado no
   * primeiro frame, antes de a leitura responder.
   */
  const [emTratativa, setEmTratativa] = useState(true);
  const [parecer, setParecer] = useState('');
  const [submitStatus, setSubmitStatus] = useState<ActionStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [showDocModal, setShowDocModal] = useState(false);

  // Preselect the level under review and prefill any parecer already written —
  // an empty form would read as "nothing has been said yet" on a reopened DDI.
  useEffect(() => {
    if (!oportunidadeId) {
      setDdiStatus('error');
      return;
    }
    // Sem `DdiView` a leitura só daria 403: fica com os defaults, e o gate da
    // escrita segue sendo a permissão (e a API).
    if (!podeVerDdi) {
      setDdiStatus('loaded');
      return;
    }
    let cancelled = false;

    carregarDdi(oportunidadeId)
      .then((result) => {
        if (cancelled) return;
        if (result?.riskLevel) setRisco(result.riskLevel);
        if (result?.opinion) setParecer(result.opinion);
        setRiscoTravado(result?.engineRiskLevel === 'low');
        setSituacao(result?.situacao ?? null);
        // Sem análise nenhuma (`null`) não há o que tratar — e nesse caso o
        // formulário já cai no aviso de leitura acima.
        setEmTratativa(result?.emTratativa ?? false);
        setDdiStatus('loaded');
      })
      .catch(() => {
        if (!cancelled) setDdiStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [oportunidadeId, carregarDdi, podeVerDdi]);

  async function submit(decision: DdiDecision) {
    // The form submits on Enter even with the button hidden — the guard has to
    // live in the handler, not only in `disabled`.
    if (!podeEmitir || !oportunidadeId || !emTratativa) return;

    const texto = parecer.trim();
    if (texto.length < PARECER_MIN_LENGTH) {
      setFieldError(
        `O parecer deve ter pelo menos ${PARECER_MIN_LENGTH} caracteres — ele é o registro da análise.`,
      );
      return;
    }

    setFieldError('');
    setSubmitError('');
    setSubmitStatus('saving');
    try {
      /*
       * O resultado é CONSUMIDO, não descartado — é ele que fecha o formulário.
       *
       * O `useEffect` da leitura tem deps `[oportunidadeId, carregarDdi]`, então
       * não roda de novo: sem isto, `situacao`/`emTratativa` continuariam com o
       * valor de antes da decisão e os botões seguiriam vivos até alguém
       * remontar a tela — que é o defeito reportado. E o veredito vem do
       * BACKEND, não de um flip otimista: é ele que sabe se a decisão de fato
       * fechou a tratativa.
       */
      const atualizado = await emitirParecer(oportunidadeId, {
        reclassifiedTo: risco,
        rationale: texto,
        decision,
      });
      setSituacao(atualizado.situacao);
      setEmTratativa(atualizado.emTratativa);
      await onDone();
      setSubmitStatus('idle');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Erro ao emitir o parecer.",
      );
      setSubmitStatus("error");
    }
  }

  const isSaving = submitStatus === 'saving';

  if (!podeEmitir) {
    return (
      <div
        role="status"
        aria-label="Parecer restrito à Integridade"
        className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          O parecer desta análise de integridade é emitido pela Integridade, que
          classifica o risco e libera ou reprova a oportunidade. Use o histórico
          abaixo para enviar informações e documentos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/*
        Instrução, e não descrição: encerrada a tratativa ela manda fazer algo
        que a tela não oferece mais. Quem fala pelo estado é a faixa abaixo.
      */}
      {emTratativa && (
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Confirme o risco após analisar os achados, registre o parecer e
          decida. Liberar destrava a oportunidade para aprovação; reprovar a
          mantém bloqueada — e pode ser revertido por um novo parecer.
        </p>
      )}

      {ddiStatus === 'error' && (
        <p
          role="alert"
          className="text-(length:--t-small) text-(--color-danger)"
        >
          Não foi possível carregar a análise DDI. Confira o risco antes de
          confirmar — o valor abaixo pode não ser o da análise.
        </p>
      )}

      {situacao === 'REPROVADA' && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-warning) bg-(--color-warning-bg) px-4 py-3 text-(length:--t-caption) text-(--color-warning)"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Esta oportunidade está <b>reprovada</b> pela Integridade. Um novo
            parecer com &quot;Liberar&quot; reverte a decisão.
          </p>
        </div>
      )}

      {/*
        A tratativa acabou: o parecer fica como REGISTRO, e nenhuma das três
        ações é oferecida — `reclassify` e `ddi/documento` compartilham o mesmo
        predicado no backend, então as três recusariam.

        ⚠️ Estado, não botão desabilitado. O contrato da sendbar já fixa a regra
        ("CTA que não pode ser pressionado é controle morto"), e um "Liberar para
        aprovação" cinza para sempre não responderia a pergunta que gerou o
        relato — se a liberação valeu. Esta frase responde.
      */}
      {!emTratativa && ddiStatus === 'loaded' && (
        <div
          role="status"
          data-testid="ddi-tratativa-encerrada"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <p>{textoTratativaEncerrada(situacao)}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="ddi-risco"
            className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Risco confirmado{" "}
            <span aria-hidden="true" className="text-(--color-danger)">
              *
            </span>
          </label>
          <Select
            id="ddi-risco"
            value={risco}
            onChange={(v) => setRisco(v as DdiRiskLevel)}
            options={DDI_RISK_OPTIONS}
            disabled={
              isSaving ||
              ddiStatus === "loading" ||
              riscoTravado ||
              !emTratativa
            }
          />
          {riscoTravado && (
            <p className="mt-1 text-(length:--t-small) text-(--color-text-muted)">
              A análise classificou o risco como <b>Baixo</b> — a classificação
              fica travada.
            </p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="ddi-parecer"
          className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
        >
          Parecer da Integridade{" "}
          <span aria-hidden="true" className="text-(--color-danger)">
            *
          </span>
        </label>
        <textarea
          id="ddi-parecer"
          rows={4}
          value={parecer}
          onChange={(e) => {
            setParecer(e.target.value);
            setFieldError('');
          }}
          // Encerrada a tratativa, o parecer é REGISTRO: editável ele sugeriria
          // que há um novo submit possível.
          disabled={isSaving || !emTratativa}
          placeholder="Descreva os achados analisados, o que os afasta ou os sustenta, e o fundamento da decisão."
          className="w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit] placeholder:text-(--color-text-muted) focus:outline-none focus:ring-2 focus:ring-(--secondary-500) disabled:opacity-50"
        />
      </div>

      {(fieldError || submitError) && (
        <p
          role="alert"
          className="text-(length:--t-small) text-(--color-danger)"
        >
          {fieldError || submitError}
        </p>
      )}

      {emTratativa && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void submit('release')}
            className={PRIMARY_ACTION_BTN}
          >
            {isSaving ? 'Salvando…' : 'Liberar para aprovação'}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void submit('reject')}
            className={DANGER_OUTLINE_BTN}
          >
            Reprovar
          </button>
          {/*
            "Solicitar documento ao LT" sai junto, e não por simetria visual: o
            `requestDocument` do backend aplica o MESMO `ddiEmTratativa`, então
            ele também recusaria. Era o segundo botão morto da mesma tela — só
            não foi o clicado.
          */}
          {podeSolicitar && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setShowDocModal(true)}
              className={`${SECONDARY_OUTLINE_BTN} ml-auto`}
            >
              <AttachmentIcon className="size-4" />
              Solicitar documento ao LT
            </button>
          )}
        </div>
      )}

      {showDocModal && (
        <SolicitarDocumentoModal
          onClose={() => setShowDocModal(false)}
          onSubmit={async (payload) => {
            await solicitarDocumento(oportunidadeId, payload);
            setShowDocModal(false);
            await onDone();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DDI reprovada — o LT justifica e pede nova avaliação (`ddi_revisao`)
// ---------------------------------------------------------------------------

/**
 * "Resolver pendência" da DDI **reprovada**, devolvida ao LT.
 *
 * ## Por que este bloco existe (14/09/2026)
 *
 * *"Depois que uma pendência de DDI foi reprovada, ela não aparece para o LT
 * justificar e reenviar."* `REPROVADA` bloqueia o GATE 1 (`ddi_reprovada`) e a
 * barra de envio mandava *"trate os apontamentos e peça nova avaliação"* — sem
 * que houvesse onde pedir: o parecer fechava a pendência da Integridade e não
 * abria nada, e a única cura registrada era um novo parecer da própria área que
 * acabara de reprovar.
 *
 * ## O que ele NÃO faz
 *
 * ⚠️ **Não há botão de liberar, e a ausência é a regra.** O submit devolve a
 * análise a `PENDENTE_PARECER`, nunca a `LIBERADA`: quem decide sobre
 * integridade é a Integridade (`ddi/reclassify`, `[INTEGRIDADE, ADMIN]`), e o
 * próprio `STATUS_SUPERAVEIS_PELO_DE_ACORDO` mantém `REPROVADA` fora do que o
 * de acordo do Diretor supera — *"o de acordo apressa uma espera, não revoga a
 * decisão de outra área"*. O pedido REABRE a decisão; não a substitui.
 *
 * ⚠️ **Nem "Marcar como resolvida":** `POST .../resolver` recusa a origem
 * `ddi:reprovacao` com 400, porque fechar por ali deixaria a DDI reprovada com
 * a tarefa cumprida e o GATE 1 travado sem nada que o explicasse.
 *
 * O bloco **não renderiza os apontamentos**: o `DdiPanel` (somente leitura) já
 * é montado acima para toda pendência `ddi:*`, com risco, racional, achados e o
 * parecer da Integridade. Repeti-los aqui seria uma segunda superfície do mesmo
 * dado, livre para divergir.
 */
function DdiRevisaoBlock({
  pendencia,
  carregarDdi,
  solicitarRevisao,
  onDone,
}: {
  pendencia: PendenciaDetalhe;
  carregarDdi: (opportunityId: string) => Promise<DdiResult | null>;
  solicitarRevisao: (
    opportunityId: string,
    payload: DdiRevisaoPayload,
  ) => Promise<DdiResult>;
  onDone: () => void | Promise<void>;
}) {
  const { canWrite, can } = usePermissions();
  /**
   * Espelho do `@Roles(...MATRIZ_DDI_EXECUTAR)` da rota `solicitar-revisao` —
   * `DdiDecide`. Na Matriz RBAC v2.1 (28/09/2026) a linha "Análise DDI ·
   * Executar" é só da Integridade, então o LT deixou de pedir a revisão por
   * aqui; quem não pode lê o FATO (a reprovação) sem o formulário. O par está
   * em `PERMISSAO_POR_FLUXO` (`resolve-cta.ts`), que é o que faz a lista dizer
   * "Resolver" para as mesmas pessoas.
   */
  const podePedirRevisao = canWrite && can(Permission.DdiDecide);
  /** `GET .../ddi` é `MATRIZ_DDI_VISUALIZAR` — sem a permissão, não busca (403). */
  const podeVerDdi = can(Permission.DdiView);
  const oportunidadeId = pendencia.oportunidadeId ?? '';

  const [ddiStatus, setDdiStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  /**
   * Situação lida do backend. Começa `null` e o formulário já aparece: o gate
   * real é a API, e esconder o campo até a leitura responder faria a tela
   * piscar fechada no primeiro frame — o defeito que o `emTratativa: true`
   * inicial do bloco de parecer evita pelo mesmo motivo.
   */
  const [situacao, setSituacao] = useState<DdiResult['situacao'] | null>(null);
  /** Pedido anterior, se houver: é o registro de que a reprovação já foi contestada. */
  const [pedidoAnterior, setPedidoAnterior] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [submitStatus, setSubmitStatus] = useState<ActionStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    if (!oportunidadeId) {
      setDdiStatus('error');
      return;
    }
    // Sem `DdiView` a leitura só daria 403: fica com os defaults, e o gate da
    // escrita segue sendo a permissão (e a API).
    if (!podeVerDdi) {
      setDdiStatus('loaded');
      return;
    }
    let cancelled = false;

    carregarDdi(oportunidadeId)
      .then((result) => {
        if (cancelled) return;
        setSituacao(result?.situacao ?? null);
        setPedidoAnterior(result?.ltReviewRequestReason ?? null);
        setDdiStatus('loaded');
      })
      .catch(() => {
        if (!cancelled) setDdiStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [oportunidadeId, carregarDdi, podeVerDdi]);

  /**
   * A reprovação ainda está de pé? Só então há o que contestar.
   *
   * `null` (leitura falhou, ou backend sem o campo) conta como **sim**: o gate
   * é da API, e fechar o formulário por leitura incompleta tiraria do LT a
   * única ação que destrava a oportunidade. O 400 do backend nomeia o motivo.
   */
  const reprovacaoDePe = situacao == null || situacao === 'REPROVADA';

  async function submit() {
    // O form submete no Enter mesmo com o botão escondido — a guarda mora no
    // handler, não só no `disabled`.
    if (!podePedirRevisao || !oportunidadeId || !reprovacaoDePe) return;

    const texto = justificativa.trim();
    if (texto.length < DDI_REVISAO_JUSTIFICATIVA_MIN_LENGTH) {
      setFieldError(
        `A justificativa deve ter pelo menos ${DDI_REVISAO_JUSTIFICATIVA_MIN_LENGTH} ` +
          `caracteres — é o que a Integridade vai ler para reavaliar.`,
      );
      return;
    }

    setFieldError('');
    setSubmitError('');
    setSubmitStatus('saving');
    try {
      /*
       * O resultado é CONSUMIDO: o `useEffect` da leitura tem deps
       * `[oportunidadeId, carregarDdi]` e não roda de novo, então sem isto a
       * `situacao` continuaria `REPROVADA` e o formulário seguiria vivo depois
       * de o pedido ter sido enviado — o defeito que o bloco de parecer já
       * pagou uma vez. E o veredito vem do BACKEND, nunca de um flip otimista.
       */
      const atualizado = await solicitarRevisao(oportunidadeId, {
        justification: texto,
      });
      setSituacao(atualizado.situacao);
      setPedidoAnterior(atualizado.ltReviewRequestReason);
      await onDone();
      setSubmitStatus('idle');
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Erro ao pedir nova avaliação da DDI.',
      );
      setSubmitStatus('error');
    }
  }

  const isSaving = submitStatus === 'saving';

  if (!podePedirRevisao) {
    return (
      <div
        role="status"
        aria-label="Pedido de nova avaliação restrito ao LT"
        data-testid="ddi-revisao-somente-leitura"
        className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        {/*
          ⚠️ A nota NOMEIA o fato, não só a falta de permissão: quem não age
          quase sempre lê, e é ele quem valida a regra. Retirar o formulário não
          pode retirar a frase que diz por que a oportunidade está parada.
        */}
        <p>
          A Integridade <b>reprovou</b> esta oportunidade na due diligence, e o
          envio para análise fica bloqueado enquanto a reprovação estiver de pé.
          O pedido de nova avaliação é feito pelo LT responsável por esta
          pendência.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ddiStatus === 'error' && (
        <p role="alert" className="text-(length:--t-small) text-(--color-danger)">
          Não foi possível carregar a análise DDI. O pedido continua disponível —
          confira os apontamentos acima antes de enviar.
        </p>
      )}

      {/*
        O pedido JÁ FOI feito: a análise voltou para a Integridade. Estado, não
        botão cinza — um "Pedir nova avaliação" desabilitado para sempre não
        responderia a pergunta que o LT tem ("o pedido valeu?").
      */}
      {!reprovacaoDePe && ddiStatus === 'loaded' ? (
        <div
          role="status"
          data-testid="ddi-revisao-enviada"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-success) bg-(--color-success-bg) px-4 py-3 text-(length:--t-caption) text-(--color-success)"
        >
          <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Nova avaliação solicitada</p>
            <p>
              A análise voltou para a Integridade emitir novo parecer. O envio
              para análise segue bloqueado até o parecer sair — agora aguardando
              a Integridade, não você.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Descreva o que foi tratado dos apontamentos da Integridade. O pedido
            devolve a análise para novo parecer — ele <b>não</b> libera a
            oportunidade: quem decide sobre integridade é a Integridade.
          </p>

          <div>
            <label
              htmlFor="ddi-revisao-justificativa"
              className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
            >
              O que foi tratado{' '}
              <span aria-hidden="true" className="text-(--color-danger)">
                *
              </span>
            </label>
            <textarea
              id="ddi-revisao-justificativa"
              rows={4}
              value={justificativa}
              onChange={(e) => {
                setJustificativa(e.target.value);
                setFieldError('');
              }}
              disabled={isSaving}
              placeholder="Ex.: processo do sócio administrador arquivado em 02/09/2026; certidão atualizada anexada no hub de documentos."
              className="w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit] placeholder:text-(--color-text-muted) focus:outline-none focus:ring-2 focus:ring-(--secondary-500) disabled:opacity-50"
            />
          </div>

          {(fieldError || submitError) && (
            <p
              role="alert"
              className="text-(length:--t-small) text-(--color-danger)"
            >
              {fieldError || submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void submit()}
              className={PRIMARY_ACTION_BTN}
            >
              {isSaving ? 'Enviando…' : 'Pedir nova avaliação'}
            </button>
          </div>
        </>
      )}

      {/*
        O pedido anterior fica visível nos DOIS estados: enquanto a reprovação
        está de pé ele mostra que já houve uma contestação (a Integridade
        reprovou de novo), e depois do envio ele é o registro do que foi dito.
      */}
      {pedidoAnterior && (
        <div
          data-testid="ddi-revisao-pedido-anterior"
          className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--neutral-25) px-4 py-3"
        >
          <p className="mb-1 text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
            Último pedido de nova avaliação
          </p>
          <p className="whitespace-pre-line text-(length:--t-caption)">
            {pedidoAnterior}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Asks the LT for a document. Failure keeps the modal open WITH the text: the
 * two sentences the analyst typed are the whole payload, and losing them to a
 * transient 5xx would mean writing them again.
 */
function SolicitarDocumentoModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (payload: DdiDocumentRequestPayload) => Promise<void>;
  onClose: () => void;
}) {
  const [documento, setDocumento] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!documento.trim() || !motivo.trim()) {
      setError('Informe o documento e o motivo.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({ documento: documento.trim(), motivo: motivo.trim() });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao solicitar o documento.",
      );
      setSaving(false);
    }
  }

  const fieldClass =
    'w-full rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit] placeholder:text-(--color-text-muted) focus:outline-none focus:ring-2 focus:ring-(--secondary-500) disabled:opacity-50';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ddi-doc-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-5 py-4">
          <h4
            id="ddi-doc-modal-title"
            className="text-(length:--t-h4) font-bold"
          >
            Solicitar documento ao LT
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-5 py-4">
            <div>
              <label
                htmlFor="ddi-doc-nome"
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Documento{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <input
                id="ddi-doc-nome"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                disabled={saving}
                placeholder="Certidão de distribuição cível do sócio administrador"
                className={fieldClass}
              />
              <p className="mt-1 text-(length:--t-small) text-(--color-text-muted)">
                Vira o título da pendência do LT — nomeie o documento, não o
                assunto.
              </p>
            </div>

            <div>
              <label
                htmlFor="ddi-doc-motivo"
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Motivo{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <textarea
                id="ddi-doc-motivo"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={saving}
                placeholder="Por que o documento é necessário e de onde extraí-lo."
                className={`${fieldClass} resize-y`}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="text-(length:--t-small) text-(--color-danger)"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-(--color-border) px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={SECONDARY_OUTLINE_BTN}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={PRIMARY_ACTION_BTN}
            >
              {saving ? 'Enviando…' : 'Solicitar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolve section — upload, marcar, garantia, or automatica
// ---------------------------------------------------------------------------

function ResolveSection({
  pendencia,
  actionStatus,
  actionError,
  onResolver,
  onIndicar,
  uploadDocFn,
  carregarExistentesFn,
  carregarGarantiasFn,
  carregarGarantiaViewFn,
  canIndicar,
  carregarDdiFn,
  emitirParecerFn,
  solicitarDocumentoFn,
  solicitarRevisaoFn,
  onDdiDone,
}: {
  pendencia: PendenciaDetalhe;
  actionStatus: ActionStatus;
  actionError: string;
  onResolver: (payload: ResolverPendenciaPayload) => void;
  /**
   * Submete a indicação e, com a garantia já criada, anexa os arquivos
   * escolhidos (spec 28/08/2026 §4.3) — nessa ordem, que é o ponto da mudança.
   */
  /**
   * Submete N garantias e, com cada uma criada, anexa os arquivos dela — nessa
   * ordem, que é o ponto da mudança de 28/08/2026.
   *
   * ⚠️ **Lista, não uma por chamada** (GER-05, 02/09/2026): as N linhas têm de
   * entrar ANTES de qualquer promoção do subprocesso, senão a segunda é recusada
   * por `EM_ANALISE_PREVIA` e a pendência já foi auto-resolvida. Ver
   * {@link GarantiaEmLote}.
   */
  onIndicar: (rascunho: RascunhoDeGarantias) => Promise<RascunhoAplicado>;
  uploadDocFn: typeof attachDoc;
  carregarExistentesFn: (
    opportunityId: string,
  ) => ReturnType<typeof getGarantiasExistentes>;
  /** ADO 68110 — as garantias já persistidas nesta oportunidade. */
  carregarGarantiasFn: (opportunityId: string) => Promise<GarantiaIndicacaoItem[]>;
  /** Read model da garantia — só o veredito da última prévia é lido daqui. */
  carregarGarantiaViewFn: (opportunityId: string) => Promise<GarantiaView>;
  /**
   * Relê a PENDÊNCIA depois de uma escrita de garantia que falhou.
   *
   * Existe para um caso só, e ele é real: `resolverPendenciaSeAberta` fecha esta
   * pendência no instante em que uma garantia fica apta, e o ticket não faz
   * polling. Uma tela aberta há minutos pode oferecer "Remover" sobre uma
   * pendência que o backend já encerrou — a recusa vem 409, e reler troca o
   * formulário pela faixa "Pendência resolvida" em vez de deixar um controle
   * morto na tela.
   */
  canIndicar: boolean;
  carregarDdiFn: (opportunityId: string) => Promise<DdiResult | null>;
  emitirParecerFn: (
    opportunityId: string,
    payload: DdiReclassifyPayload,
  ) => Promise<DdiResult>;
  solicitarDocumentoFn: (
    opportunityId: string,
    payload: DdiDocumentRequestPayload,
  ) => Promise<{ pendenciaId: string }>;
  solicitarRevisaoFn: (
    opportunityId: string,
    payload: DdiRevisaoPayload,
  ) => Promise<DdiResult>;
  onDdiDone: () => void | Promise<void>;
}) {
  // ---- Upload pendência state
  const { canWrite, can } = usePermissions();
  /*
   * Uploading a document needs `DocumentManage`, not the broad write floor.
   *
   * `canWrite` only answers "is this profile read-only?" — the SNEG passes it,
   * so the dropzone and "Anexar e resolver" were offered to an analyst whose
   * submit the API then refused with 403 (VBR-633). The permission mirrors the
   * `@Roles(LT, GERENTE_VAREJO, CONSULTOR_EXPANSAO, GESTOR_FRANQUIAS, ADMIN)`
   * that actually guards the attach route; hiding the control is UX, the 403 is
   * still the guarantee.
   *
   * Deliberately NOT applied to the "Marcar como resolvida" branch: that one
   * resolves without attaching anything and is not gated by `DocumentManage`.
   */
  const podeAnexar = canWrite && can(Permission.DocumentManage);
  const [fileInfo, setFileInfo] = useState<{ name: string; id: string } | null>(
    null,
  );
  const [fileUploadStatus, setFileUploadStatus] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [fileUploadError, setFileUploadError] = useState("");
  /*
   * The `File` the user picked, kept across a failed upload so the retry does
   * not ask them to find it again. `fileInfo` stays null on error (the form must
   * not look "uploaded"), but throwing the selection away punished the user for
   * a failure that, in the reported case, they should never have been offered at
   * all (VBR-633).
   */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Garantia form state
  const [garFields, setGarFields] = useState<GarantiaFormFields>(GARANTIA_FORM_EMPTY);
  /**
   * GER-05 — quantas garantias foram cadastradas NESTA sessão do ticket.
   *
   * *"Suporte a mais de uma garantia por oportunidade: a tela de pendências deve
   * permitir a inclusão de mais de uma garantia."*
   *
   * O backend já aceitava: `garantia:indicar` cria uma linha NOVA a cada chamada e
   * (desde a spec de 28/08/2026) **não** transiciona o subprocesso, então chamá-lo
   * de novo é legítimo. O que faltava era a tela — depois do primeiro submit ela
   * ficava com o formulário preenchido e nenhum caminho para o segundo.
   *
   * O contador é da SESSÃO, não da oportunidade: quem tem a lista completa é o
   * card de garantias, e repetir aqui um total lido de outra fonte criaria dois
   * números que podem discordar. Aqui ele só responde "o que EU acabei de fazer".
   */
  const [garantiasNestaSessao, setGarantiasNestaSessao] = useState(0);
  /** As garantias já montadas nesta sessão, esperando o submit do lote (GER-05). */
  const [garantiasEmLote, setGarantiasEmLote] = useState<GarantiaEmLote[]>([]);
  /*
   * O modal do formulário (02/09/2026) — antes os campos ficavam SEMPRE abertos
   * na página. `garEditandoIndex` é a posição no lote em edição, `null` quando é
   * uma garantia nova.
   */
  const [garModalOpen, setGarModalOpen] = useState(false);
  const [garEditandoIndex, setGarEditandoIndex] = useState<number | null>(null);
  /**
   * O id da garantia PERSISTIDA aberta no modal — `null` quando é uma nova ou
   * uma entrada do lote (04/09/2026).
   *
   * Distinto de `garEditandoIndex` de propósito: aquele é a POSIÇÃO no lote (o
   * que ainda não existe no backend) e este é a IDENTIDADE de uma linha que
   * existe. Um campo só para os dois obrigaria a inventar um índice para algo
   * que tem id, ou um id para algo que não tem.
   */
  const [garEditandoId, setGarEditandoId] = useState<string | null>(null);
  /**
   * Edições PENDENTES de garantias persistidas — id → o mesmo snapshot do lote.
   *
   * ⚠️ Rascunho: nada foi ao backend. É o que o "Cancelar" desfaz e o botão do
   * fim aplica, e é também o que evita gravar uma a uma — cada gravação avulsa
   * arrisca a promoção do subprocesso no meio, que fecha a janela de
   * `indicacaoMutavel` e faz as chamadas seguintes virem 409.
   */
  const [edicoes, setEdicoes] = useState<Map<string, GarantiaEmLote>>(new Map());
  /**
   * Garantias marcadas para excluir QUANDO a pendência for resolvida.
   *
   * Pedido do negócio: *"se for excluída, não deve ser excluída de verdade,
   * apenas um controle na tela"*. Antes o clique fazia `DELETE` na hora, sem
   * volta — e num ticket de revisão isso apaga a garantia que a CCOB analisou.
   */
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [fiadores, setFiadores] = useState<FiadorField[]>([
    { ...FIADOR_EMPTY },
  ]);

  /*
   * ---- As garantias JÁ PERSISTIDAS na oportunidade (ADO 68110)
   *
   * Distintas do LOTE acima em tudo o que importa: elas existem no backend, a
   * CCOB as analisou, e é uma delas que o parecer reprovou. O lote é o que ainda
   * não foi enviado.
   */
  const [persistidas, setPersistidas] = useState<GarantiaIndicacaoItem[]>([]);
  const [persistidasStatus, setPersistidasStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'error'
  >('idle');
  const [persistidasErro, setPersistidasErro] = useState('');
  /** Contador que força a releitura da lista — bump depois de toda escrita. */
  const [recarregarPersistidas, setRecarregarPersistidas] = useState(0);
  /**
   * A última análise prévia desta oportunidade foi REPROVADA?
   *
   * `false` é o estado inicial E o de falha de leitura — nunca prometer uma
   * recusa por leitura incompleta. Ver o efeito abaixo.
   */
  const [previaReprovada, setPreviaReprovada] = useState(false);
  /**
   * Quando a CCOB concluiu a prévia reprovada — a fronteira que separa, na
   * lista, o que ela analisou do que o LT cadastrou depois.
   *
   * `null` sempre que `previaReprovada` é `false`: sem recusa não há linha a
   * rotular, e um carimbo remanescente rotularia a rodada errada.
   */
  const [previaReprovadaEm, setPreviaReprovadaEm] = useState<string | null>(null);

  /*
   * Upload do estatuto do banco — o ÚNICO slot fixo que sobrou (01/09/2026).
   *
   * A certidão de inteiro teor e o laudo tinham um estado cada e saíram: os dois
   * são N por garantia, e a escolha deles vive no bloco (`garFields.matriculas`,
   * `garFields.laudos`), que sobe no submit como todo o resto do formulário.
   */
  const [minutaFiancaState, setMinutaFiancaState] = useState<FileUploadState>({
    status: "idle",
  });

  // Garantia existente seletor
  type ExistentesStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'lacuna';
  const [existentesStatus, setExistentesStatus] =
    useState<ExistentesStatus>("idle");
  const [existentes, setExistentes] = useState<GarantiaExistente[]>([]);
  const [existentesError, setExistentesError] = useState('');

  const confirm = useConfirm();

  const isUpload = pendencia.acaoResolucao === 'upload';
  const isAutomatica = pendencia.acaoResolucao === 'automatica';
  /*
   * GER-05 — o sucesso do submit é a transição `saving → idle` (o erro vai para
   * `error`). Um efeito e não um callback novo: `onIndicar` é `void` e o pai já
   * publica o desfecho por `actionStatus`; acrescentar um segundo canal deixaria
   * dois sinais para o mesmo fato.
   */
  const statusAnterior = useRef<ActionStatus>(actionStatus);
  useEffect(() => {
    if (statusAnterior.current === 'saving' && actionStatus === 'idle') {
      setGarantiasNestaSessao((n) => n + 1);
      /*
       * Limpa o formulário INTEIRO, inclusive os fiadores: a garantia seguinte é
       * outra: outro bem, outro banco. Preservar campos faria a segunda nascer com
       * os dados da primeira — que é exatamente como o ticket criava garantia
       * duplicada antes da spec de 28/08/2026 (o formulário vinha pré-preenchido
       * com a indicação mais recente e o usuário confirmava).
       */
      setGarFields(GARANTIA_FORM_EMPTY);
      setFiadores([{ ...FIADOR_EMPTY }]);
      /*
       * ⚠️ O lote NÃO é zerado aqui desde 04/09/2026 — quem o esvazia é
       * `aplicarRascunho`, podando exatamente o que o pai conseguiu aplicar. Um
       * `setGarantiasEmLote([])` cego apagaria da tela, num erro parcial, a
       * garantia que NÃO foi criada.
       */
      /*
       * ADO 68110 — e as garantias recém-criadas passam a existir NO BACKEND,
       * então a lista das persistidas tem de ser relida. Sem isto o lote sai da
       * tela e nada entra no lugar: a caixa vazia voltaria a dizer "Nenhuma
       * garantia cadastrada ainda." sobre o que acabou de ser cadastrado.
       */
      setRecarregarPersistidas((n) => n + 1);
    }
    statusAnterior.current = actionStatus;
  }, [actionStatus]);

  const isGar = pendencia.acaoResolucao === 'garantia';
  const isDdi = pendencia.acaoResolucao === 'ddi';
  /** DDI reprovada devolvida ao LT — o pedido de nova avaliação (14/09/2026). */
  const isDdiRevisao = pendencia.acaoResolucao === 'ddi_revisao';
  const isHub = pendencia.acaoResolucao === 'hub';
  const isReenvio = pendencia.acaoResolucao === 'reenvio';
  /**
   * ADO 67972 — FAP / fotos do ponto de uma proposta de franquia (RN-F4-01).
   *
   * NAVEGA, nunca anexa. Mesma classe do `hub`, com um destino diferente: o
   * upload do ticket escreve em `opportunity_repository_documents`, e o
   * `FranquiaGateService` lê `franchise_fap_documents` / `station_photos` — a
   * pendência fecharia sem o gate ser satisfeito, e o worker abriria outra
   * idêntica no ciclo seguinte (o loop medido na VBR-628). O hub também não
   * serve: anexar lá satisfaz a LINHA do checklist e não o gate.
   */
  const isFranquia = pendencia.acaoResolucao === 'franquia';
  /**
   * Roteamento da CCOB (04/09/2026) — a análise prévia da garantia.
   *
   * NAVEGA, nunca fecha. Quem encerra é a DECISÃO da CCOB na tela de Garantia
   * (`garantia:aprovar-previa` / `:reprovar-previa`), que auto-resolve a
   * pendência pela mesma chave com que a promoção do subprocesso a abriu;
   * `POST .../resolver` recusa esta origem com 400.
   *
   * ⚠️ Sem este ramo o fluxo caía no `mapAcaoResolucao` → `'automatica'` e a
   * tela dizia **"Resolução automática"** sobre uma análise que uma pessoa tem
   * de fazer — o defeito que o docblock daquele mapa previa, e que já custou o
   * `hub` (VBR-628). Medido na tela em 04/09/2026, antes do conserto.
   */
  const isPreviaGarantia = pendencia.acaoResolucao === 'previa_garantia';
  /**
   * Parecer antecipado do time de franquias (ADO 68191 · 04/09/2026).
   *
   * NAVEGA, nunca fecha. Quem encerra é a SUBMISSÃO do parecer na proposta de
   * franquia, que auto-resolve a pendência pela mesma chave com que o
   * `FranquiaParecerPendenciaConsumer` a abriu; `POST .../resolver` recusa esta
   * origem com 400.
   *
   * ⚠️ Sem este ramo o fluxo caía no fallback por `tipo` (`ANALISE` ⇒ `marcar`)
   * e o ticket oferecia **"Marcar como resolvida"**: o clique fechava a cobrança
   * sem parecer, e o consumer reabria uma pendência idêntica na mudança de
   * composição seguinte. É o anexo do ticket — `PN-0215` "Resolvida" ao lado de
   * `PN-0216`, a mesma cobrança, de volta em "3 abertas".
   */
  const isFranquiaParecer = pendencia.acaoResolucao === 'franquia_parecer';
  const isResolved = pendencia.status === 'resolvida';
  const isSaving = actionStatus === 'saving';
  const oportunidadeId = pendencia.oportunidadeId ?? '';
  /**
   * A pendência ainda LICENCIA escrita de garantia? (ADO 68110)
   *
   * O backend abre a janela por pendência ATIVA
   * (`ACTIVE_PENDENCIA_STATUSES` = `ABERTA | EM_ANDAMENTO`), e `isResolved` testa
   * só `resolvida` — uma pendência **cancelada** cai neste mesmo bloco, e ali o
   * "Remover" apareceria sobre um 409 garantido. A tela não pode oferecer o que a
   * API recusa.
   *
   * ⚠️ Espelha `escritaDeIndicacaoPermitida` no backend, e é por isso que os dois
   * vocabulários têm de continuar casando: um status novo do lado de lá entra
   * aqui no mesmo commit.
   */
  const pendenciaAtiva =
    pendencia.status === 'aberta' || pendencia.status === 'em_andamento';

  // Derived predicates from current garantia form state
  const garTipo = garFields.tipo as TipoGarantia | '';
  const garOrigem = garFields.origem as OrigemGarantia | '';
  const needsFiador = garTipo ? exigeFiador(garTipo) : false;
  /**
   * A fiança bancária pede a MINUTA do contrato de fiança (02/09/2026).
   *
   * Era `needsEstatuto`, e o estatuto do banco foi RETIRADO — pedido do negócio:
   * *"em Fiança Bancária não existe mais o anexo Estatuto. Deve ter apenas a
   * Minuta, e ela deve ser obrigatória."* O predicado é o mesmo (`FIANCA_BANCARIA`);
   * mudou o documento que ele governa.
   */
  const needsMinutaFianca = garTipo === TIPO_GARANTIA.FIANCA_BANCARIA;
  /**
   * Grupo "Imóvel / bem" (endereço, matrícula, cidade/UF, categoria, valor
   * avaliado, certidão, laudo) — governado por `exigeImovel`, NÃO por
   * `exigePrevia`.
   *
   * `exigePrevia` inclui a fiança bancária, onde o garantidor é o banco: pedir
   * endereço, matrícula e laudo ali é pedir dado de um imóvel que não existe, e
   * o DTO recusava a indicação sem eles. PRD Garantias v1.0 §7.2 ("Imóvel / bem
   * … Base da avaliação (garantia real)") + RN-F1-03 / CA-F1-01.2, que na
   * bancária pedem fiador e estatuto do banco — nunca imóvel.
   */
  const needsBem = garTipo ? exigeImovel(garTipo) : false;
  const needsImóvel = needsBem && garOrigem === ORIGEM_GARANTIA.NOVA;
  const needsExistente = garOrigem === ORIGEM_GARANTIA.EXISTENTE;

  /*
   * ---- Nem prefill do CHECKLIST, nem hidratação do FORMULÁRIO
   *
   * O prefill de documentos a partir do checklist saiu em 28/08/2026: com o
   * documento pertencendo à GARANTIA, um anexo do checklist não conta
   * (`garantiaApta` olha os documentos da indicação), então o slot marcaria a
   * exigência como atendida, o submit passaria, e a pendência ficaria aberta
   * para sempre.
   *
   * ⚠️ **A hidratação dos CAMPOS saiu no ADO 68110.** Ela lia a indicação mais
   * recente (`carregarIndicacao`) e preenchia o formulário, para poupar o LT de
   * redigitar a indicação que a CCOB reprovou. Fazia sentido enquanto o
   * formulário vivia ABERTO na página; com o molde modal + lista de 02/09/2026
   * ela passou a abrir o **"+ Adicionar garantia"** já preenchido com a garantia
   * reprovada — convidando a salvá-la de novo como linha NOVA, que é
   * exatamente o que `indicar` faz (reindicação não apaga nada). Duplicata
   * silenciosa, medida na PN-0108.
   *
   * O que substitui a comodidade que ela dava é melhor: a garantia reprovada
   * agora APARECE na lista das persistidas, com o `Remover` ao lado. Revisar é
   * retirar a recusada e cadastrar a corrigida — não reconfirmar a recusada.
   */

  /*
   * ---- Lê as garantias já persistidas (ADO 68110)
   *
   * Três gatilhos, e só três: montagem, troca de oportunidade e o contador que a
   * submissão do lote e a remoção bombeiam. Nada de polling — o que muda a lista
   * são gestos desta própria tela.
   *
   * ⚠️ **Falha NÃO branqueia a lista nem toca o lote.** `persistidas` fica com o
   * que já estava na tela e `garantiasEmLote` é intocado: perder o que a pessoa
   * acabou de digitar por causa de um GET é pior que a lacuna, e apagar linhas
   * que existem é o próprio defeito que este trabalho corrige.
   *
   * ⚠️ Com `active` (e sem ref de "roda uma vez"): é o inverso da hidratação que
   * saiu daqui, cujo par ref+cancel se sabotava sob StrictMode — ali a segunda
   * passada saía cedo pelo ref e a resposta em voo caía num `cancelled`. Aqui não
   * há ref, então a segunda passada refaz o fetch e a resposta DELA é aplicada.
   */
  useEffect(() => {
    if (!isGar || !oportunidadeId) return;

    let active = true;
    setPersistidasStatus('loading');
    carregarGarantiasFn(oportunidadeId)
      .then((itens) => {
        if (!active) return;
        setPersistidas(itens);
        setPersistidasErro('');
        setPersistidasStatus('loaded');
      })
      .catch((err) => {
        if (!active) return;
        setPersistidasErro(
          err instanceof Error && err.message.trim() !== ''
            ? err.message
            : 'Não foi possível carregar as garantias já cadastradas.',
        );
        setPersistidasStatus('error');
      });

    return () => {
      active = false;
    };
  }, [isGar, oportunidadeId, carregarGarantiasFn, recarregarPersistidas]);

  /*
   * ---- O veredito da última prévia (04/09/2026)
   *
   * O LT chega a este ticket porque a CCOB recusou o conjunto, e até aqui a tela
   * não dizia isso em lugar nenhum acima da lista: a recusa vivia na descrição
   * da pendência e num comentário do histórico, ambos longe das garantias que ela
   * descreve. Quem abria o ticket via o conjunto sem saber que era o conjunto
   * recusado.
   *
   * ⚠️ Falha degrada para `false` — "não deu para ler" nunca pode virar "foi
   * reprovada": o aviso manda RETIRAR uma garantia, e afirmá-lo por engano manda
   * desfazer um conjunto que ninguém recusou. Sem faixa de erro, também de
   * propósito: o aviso é contexto, e uma lacuna nele não é acionável pelo LT (a
   * lista, que é o conteúdo, tem a faixa dela).
   *
   * Relido no mesmo contador das persistidas: submeter o lote pode fazer o
   * backend promover o subprocesso e abrir uma prévia nova, e aí o aviso deixa de
   * valer no mesmo gesto.
   */
  useEffect(() => {
    if (!isGar || !oportunidadeId) return;

    let active = true;
    carregarGarantiaViewFn(oportunidadeId)
      .then((view) => {
        if (!active) return;
        const reprovada = view.previa?.resultado === ResultadoPrevia.REPROVADA;
        setPreviaReprovada(reprovada);
        /*
         * `previaHistorico[0]` é a prévia CONCLUÍDA mais recente — o backend
         * ordena `createdAt DESC` e filtra as que ainda não têm resultado. Com
         * `previa.resultado === REPROVADA`, a última concluída É essa.
         */
        setPreviaReprovadaEm(
          reprovada ? (view.previaHistorico?.[0]?.concluidaEm ?? null) : null,
        );
      })
      .catch(() => {
        if (!active) return;
        setPreviaReprovada(false);
        setPreviaReprovadaEm(null);
      });

    return () => {
      active = false;
    };
  }, [isGar, oportunidadeId, carregarGarantiaViewFn, recarregarPersistidas]);


  // ---- Load garantia existentes when origem switches to EXISTENTE
  useEffect(() => {
    if (!isGar || garOrigem !== ORIGEM_GARANTIA.EXISTENTE || !oportunidadeId)
      return;
    if (existentesStatus !== "idle") return;

    setExistentesStatus('loading');
    carregarExistentesFn(oportunidadeId)
      .then((result) => {
        setExistentes(result.items);
        setExistentesStatus(result.lacuna ? 'lacuna' : 'loaded');
      })
      .catch((err) => {
        setExistentesError(
          err instanceof Error ? err.message : "Erro ao carregar garantias.",
        );
        setExistentesStatus("error");
      });
  }, [
    isGar,
    garOrigem,
    oportunidadeId,
    existentesStatus,
    carregarExistentesFn,
  ]);

  // Reset existentes when origem changes away from EXISTENTE
  useEffect(() => {
    if (garOrigem !== ORIGEM_GARANTIA.EXISTENTE) {
      setExistentesStatus('idle');
      setExistentes([]);
      setExistentesError('');
      setGarFields((f) => ({ ...f, sapGarantiaExternaId: '' }));
    }
  }, [garOrigem]);

  // ---- File upload for the regular upload pendência
  async function handleFile(file: File) {
    if (!ENABLE_PENDENCIA_FILE_UPLOAD) {
      // Flag is off: record local placeholder so the dropzone shows the file;
      // the disabled submit keeps it from reaching the backend.
      setFileInfo({ name: file.name, id: `anexo-${Date.now()}` });
      return;
    }

    if (!oportunidadeId) {
      setFileUploadError('Oportunidade não vinculada — upload indisponível.');
      setFileUploadStatus('error');
      return;
    }

    setFileUploadStatus('uploading');
    setFileUploadError('');
    setFileInfo(null);
    // Remembered for the retry — see `pendingFile`.
    setPendingFile(file);

    try {
      const doc = await uploadDocFn(oportunidadeId, PENDENCIA_DOC_ID, file);
      setFileInfo({ name: file.name, id: doc.id });
      setFileUploadStatus('uploaded');
      setPendingFile(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao enviar o arquivo.";
      setFileUploadError(msg);
      setFileUploadStatus('error');
      // fileInfo stays null — the form must not look "uploaded" on error.
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  /**
   * Guarda o arquivo escolhido — o upload acontece no submit.
   *
   * O documento pertence à garantia, e a garantia só existe depois de
   * `garantia:indicar`. Subir aqui é o que fazia o arquivo cair no checklist da
   * oportunidade, com um slot `single` por tipo para a oportunidade inteira e
   * nenhum vínculo com a garantia que ele lastreia (spec 28/08/2026 §4.3).
   *
   * `docId` é a chave `categoria::tipo` do catálogo; só o TIPO viaja para a rota
   * nova, que resolve a categoria (sempre `Garantia`).
   */
  function handleGarantiaUpload(
    file: File,
    docId: string,
    setState: (s: FileUploadState) => void,
  ) {
    if (!oportunidadeId) {
      setState({
        status: 'error',
        error: 'Oportunidade não vinculada — upload indisponível.',
        fileName: file.name,
      });
      return;
    }
    const type = docId.includes('::') ? docId.split('::')[1] : docId;
    setState({ status: 'pendente', file, type, fileName: file.name });
  }

  // ---- Submit handlers

  function handleSubmitUpload() {
    if (!fileInfo) return;
    confirm.ask({
      title: 'Anexar documento e resolver a pendência?',
      description:
        `"${fileInfo.name}" será anexado e a pendência ${pendencia.codigo ?? ""} encerrada. A área solicitante é notificada.`.trim(),
      confirmLabel: "Anexar e resolver",
      onConfirm: () =>
        onResolver({ anexoId: fileInfo.id, anexoNome: fileInfo.name }),
    });
  }

  function handleMarkResolved() {
    confirm.ask({
      title: 'Marcar pendência como resolvida?',
      description:
        `A pendência ${pendencia.codigo ?? ""} será encerrada e a área solicitante notificada. Esta ação não pode ser desfeita nesta tela.`.trim(),
      confirmLabel: "Marcar como resolvida",
      onConfirm: () => onResolver({}),
    });
  }

  /**
   * A garantia que está no formulário AGORA, pronta para o lote — ou `null`
   * quando ela não está submetível.
   *
   * Era `handleSubmitGarantia`, que montava e submetia num passo. Separar é o
   * que permite acumular N garantias antes de qualquer chamada ao backend — ver
   * {@link garantiasEmLote}.
   */
  function montarGarantiaAtual(): GarantiaEmLote | null {
    // Guard: submit lives in the handler so the form cannot bypass it on Enter.
    if (!canIndicar) return null;
    if (!garFields.tipo || !garFields.origem) return null;

    const tipo = garFields.tipo as TipoGarantia;
    const origem = garFields.origem as OrigemGarantia;

    // Build fiadores payload.
    const fiadoresPayload: BackendFiador[] = needsFiador
      ? fiadores.map((f) => {
          const base: BackendFiador = {
            nome: f.nome,
            documento: f.documento,
          };
          /*
           * A legal-entity fiador (the bank of a fiança bancária) has no
           * marital status — the field is not rendered and the DTO no longer
           * requires it, so it is OMITTED rather than sent empty. An empty
           * string would fail the `@IsEnum` and refuse the whole indication.
           */
          if (!fiadorEhPessoaJuridica(f.documento)) {
            base.estadoCivil = f.estadoCivil as EstadoCivil;
            if (exigeConjuge(f.estadoCivil)) {
              base.conjugeNome = f.conjugeNome;
              base.conjugeDocumento = f.conjugeDocumento;
              base.conjugeEmail = f.conjugeEmail;
              base.conjugeProfissao = f.conjugeProfissao;
              base.conjugeEndereco = f.conjugeEndereco;
            }
            // Contact data is, like the marital status, natural-person only.
            base.email = f.email;
            base.profissao = f.profissao;
            base.endereco = f.endereco;
          }
          return base;
        })
      : [];

    const payload: GarantiaIndicarPayload = {
      tipo,
      origem,
      // Vazio = "Nenhum" (a picklist do org é `nillable`) — mandar string
      // vazia seria recusada por ser `restricted`.
      utilizacao: garFields.utilizacao || null,
      // GER-03 — sempre presente: o DTO do backend a exige.
      compartilhadaComOutrasOportunidades: garFields.compartilhada,
      observacoes: garFields.observacoes || undefined,
    };

    /*
     * GER-03 — o detalhe só viaja com a resposta "Sim". O backend recusa (400) o
     * detalhe com "Não" (`@IsEmptyWhen`), e o CHECK do banco proíbe o estado.
     */
    if (garFields.compartilhada && garFields.detalhesCompartilhamento.trim()) {
      payload.detalhesCompartilhamento =
        garFields.detalhesCompartilhamento.trim();
    }

    if (needsImóvel) {
      payload.imovelEndereco = garFields.imovelEndereco || undefined;
      /*
       * HIP-01 — só as linhas COM número. A tela mantém uma linha em branco
       * enquanto o usuário digita (é o repetidor), e mandá-la faria o backend
       * recusar por um campo que o usuário ainda não preencheu.
       */
      const matriculas = garFields.matriculas
        .map((m) => m.numero.trim())
        .filter((n) => n !== '')
        .map((numero) => ({ numero }));
      if (matriculas.length > 0) payload.matriculas = matriculas;

      payload.imovelCidade = garFields.imovelCidade || undefined;
      payload.imovelUf = garFields.imovelUf || undefined;
    }

    if (needsBem) {
      // HIP-02 — a QUANTIDADE é a contagem de blocos; não há campo numérico.
      payload.quantidadeLaudos = garFields.laudos.length;
    }

    if (needsBem) {
      payload.categoria = (garFields.categoria as CategoriaBem) || undefined;
    }

    /*
     * O VALOR viaja em TODO tipo (ADO 68002) — fora do `needsBem`. Ele estava
     * dentro, então numa fiança bancária ou sem lastro o campo era descartado e
     * o org recebia `Valor_Avaliado__c` nulo.
     */
    {
      const valNum = parseValorBrl(garFields.valorAvaliadoBRL);
      if (valNum !== undefined) {
        payload.valorAvaliadoBRL = valNum;
      }
    }

    if (needsFiador && fiadoresPayload.length > 0) {
      payload.fiadores = fiadoresPayload;
    }

    /*
     * Os ids dos documentos NÃO viajam mais no payload.
     *
     * Eles serviam para o backend registrar os anexos no evento de resolução da
     * pendência — e nesse desenho o arquivo já existia antes do submit. Agora
     * ele sobe DEPOIS, vinculado à garantia (spec 28/08/2026 §4.3), então não há
     * id a enviar aqui.
     */

    if (needsExistente && garFields.sapGarantiaExternaId) {
      payload.sapGarantiaExternaId = garFields.sapGarantiaExternaId;
    }

    /*
     * Os arquivos escolhidos sobem DEPOIS da indicação existir — é ela que dá a
     * eles uma garantia a que pertencer. A ordem é o ponto inteiro da mudança.
     */
    /*
     * Os arquivos escolhidos sobem DEPOIS da indicação existir. Além do estatuto
     * (slot único), a certidão de CADA matrícula (com a posição dela — HIP-03) e
     * cada laudo (sem posição: o laudo avalia o bem, não um registro — HIP-02).
     *
     * `matriculaOrdem` é `i + 1` porque é assim que o backend numera
     * (`resolverMatriculas` atribui a ordem pela posição no array que este mesmo
     * submit envia em `payload.matriculas`) — e é ela que escopa o `single` a
     * `(garantia, matrícula)`.
     *
     * ⚠️ A posição é contada sobre as matrículas COM número, o mesmo filtro do
     * payload: uma linha em branco no meio não viaja, então incluí-la aqui
     * deslocaria a certidão de todas as seguintes.
     */
    const anexos: Array<{
      file: File;
      type: string;
      matriculaOrdem?: number;
      fiadorOrdem?: number;
    }> = [];

    if (minutaFiancaState.status === 'pendente') {
      anexos.push({
        file: minutaFiancaState.file,
        type: minutaFiancaState.type,
      });
    }

    if (needsBem) {
      garFields.matriculas
        .filter((m) => m.numero.trim() !== '')
        .forEach((m, i) => {
          if (!m.certidaoFile) return;
          anexos.push({
            file: m.certidaoFile,
            type: TIPO_DOCUMENTO_CERTIDAO,
            matriculaOrdem: i + 1,
          });
        });

      for (const laudo of garFields.laudos) {
        if (!laudo.file) continue;
        anexos.push({ file: laudo.file, type: TIPO_DOCUMENTO_LAUDO });
      }
    }

    /*
     * A certidão de casamento de CADA fiador (migration `…139`).
     *
     * Este formulário não tinha slot nenhum para ela — só o card da 01b tinha, e
     * lá era UM por garantia. O pedido de 02/09/2026 pede os dois: uma por
     * fiador casado, nas duas telas.
     *
     * `fiadorOrdem` é `i + 1` sobre o MESMO array que `fiadoresPayload` percorre
     * (aqui sem filtro: o ticket exige nome e documento antes de submeter), então
     * a posição que o backend atribui é exatamente esta.
     */
    if (needsFiador) {
      fiadores.forEach((f, i) => {
        if (!f.certidaoFile) return;
        anexos.push({
          file: f.certidaoFile,
          type: TIPO_DOCUMENTO_CASAMENTO,
          fiadorOrdem: i + 1,
        });
      });
    }

    /*
     * GER-01 — os complementares, SEM ordem nenhuma: a área pertence à garantia,
     * não a uma matrícula nem a um fiador. Mandar `matriculaOrdem` aqui escoparia
     * o `single` do catálogo a um registro e faria o segundo arquivo voltar 409.
     *
     * Fora de qualquer `if` de tipo: a área vale para TODAS as modalidades.
     */
    for (const complementar of garFields.complementares) {
      anexos.push({ file: complementar, type: TIPO_DOCUMENTO_COMPLEMENTAR });
    }

    return {
      payload,
      anexos,
      resumo: resumirGarantia(payload),
      // O snapshot que o modal reabre — ver `GarantiaEmLote.campos`.
      campos: garFields,
      camposFiadores: fiadores,
      camposMinuta: minutaFiancaState,
    };
  }

  /** Zera o formulário — usado ao abrir para uma garantia NOVA e ao fechar. */
  function limparFormularioGarantia() {
    setGarFields(GARANTIA_FORM_EMPTY);
    setFiadores([{ ...FIADOR_EMPTY }]);
    setMinutaFiancaState({ status: "idle" });
  }

  /**
   * Abre o modal para editar uma garantia JÁ PERSISTIDA.
   *
   * Reabre a EDIÇÃO PENDENTE quando existe — senão o segundo clique descartaria
   * em silêncio o que o LT já tinha ajustado, e ele só descobriria ao salvar.
   *
   * Os fiadores vêm do item porque o update é **replace-all**: um bloco em
   * branco faria o save apagar o banco cadastrado (mesma razão pela qual o card
   * hidrata). `certidaoAnexada` diz que a certidão de casamento já existe no
   * backend — o slot mostra "anexado" em vez de pedir o arquivo de novo.
   */
  function abrirModalGarantiaPersistida(g: GarantiaIndicacaoItem) {
    const pendente = edicoes.get(g.id);
    setGarFields(pendente?.campos ?? itemParaFormularioDoTicket(g));
    setFiadores(
      pendente?.camposFiadores ??
        ((g.fiadores ?? []).length > 0
          ? (g.fiadores ?? []).map((f) => ({
              nome: f.nome,
              documento: f.documento,
              estadoCivil: (f.estadoCivil ?? '') as FiadorField['estadoCivil'],
              conjugeNome: f.conjugeNome ?? '',
              conjugeDocumento: f.conjugeDocumento ?? '',
              email: f.email ?? '',
              profissao: f.profissao ?? '',
              endereco: f.endereco ?? { ...ENDERECO_VAZIO },
              conjugeEmail: f.conjugeEmail ?? '',
              conjugeProfissao: f.conjugeProfissao ?? '',
              conjugeEndereco: f.conjugeEndereco ?? { ...ENDERECO_VAZIO },
              certidaoFile: null,
              certidaoAnexada: f.certidaoCasamentoAnexada === true,
            }))
          : [{ ...FIADOR_EMPTY }]),
    );
    /*
     * ⚠️ **A minuta JÁ ANEXADA volta como `uploaded`** (relato do stage,
     * 04/09/2026). `garMissing` a cobra enquanto o estado não for `pendente` nem
     * `uploaded`, e a edição a devolvia `idle`: o "Salvar" ficava desabilitado
     * numa garantia cujo documento já está no backend — ou seja, editar
     * QUALQUER campo de uma fiança bancária (o nome do banco, o CNPJ, o valor)
     * era impossível.
     *
     * `uploaded` não é um estado inventado para isto: `montarGarantiaAtual` só
     * empacota o anexo quando ele está `pendente`, então o documento que já
     * existe não sobe de novo — e escolher outro arquivo o torna `pendente`, com
     * o backend substituindo (o tipo é `single`).
     */
    const minutaAnexada = (g.documentos ?? []).find(
      (d) => d.type === TIPO_DOCUMENTO_MINUTA_FIANCA,
    );
    setMinutaFiancaState(
      pendente?.camposMinuta ??
        (minutaAnexada
          ? {
              status: "uploaded",
              docId: minutaAnexada.id,
              fileName: minutaAnexada.fileName,
            }
          : { status: "idle" }),
    );
    setGarEditandoIndex(null);
    setGarEditandoId(g.id);
    setGarModalOpen(true);
  }

  /**
   * Os "Documentos complementares" que a garantia em edição JÁ tem.
   *
   * Filtra pelo `type` do catálogo em vez de listar tudo: os demais têm slot
   * próprio no formulário (certidão por matrícula, laudo, minuta, certidão de
   * casamento) e apareceriam duas vezes. Vazio fora da edição de persistida —
   * garantia nova não tem anexo no backend.
   */
  const complementaresAnexados =
    garEditandoId === null
      ? []
      : (persistidas
          .find((g) => g.id === garEditandoId)
          ?.documentos.filter((d) => d.type === TIPO_DOCUMENTO_COMPLEMENTAR) ?? []);

  /** Marca/desmarca a exclusão — controle de tela, nada de rede. */
  function alternarExclusao(id: string, marcar: boolean) {
    setExcluidas((prev) => {
      const proximo = new Set(prev);
      if (marcar) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  /**
   * Abre o modal para uma garantia NOVA.
   *
   * ⚠️ **Não limpa o formulário**, e isso é load-bearing: numa RE-indicação (o
   * ticket aberto depois de a CCOB reprovar) o `useEffect` de hidratação
   * pré-preenche `garFields` com os dados da garantia reprovada — VBR-630, para
   * o LT corrigir em vez de redigitar. Limpar aqui apagaria exatamente aquilo.
   *
   * Quem limpa é `salvarGarantiaNoLote`, para a garantia SEGUINTE nascer em
   * branco.
   */
  function abrirModalGarantia() {
    setGarEditandoIndex(null);
    setGarModalOpen(true);
  }

  /** Reabre o modal com o que foi digitado naquela garantia do lote. */
  function abrirModalGarantiaParaEditar(index: number) {
    const entrada = garantiasEmLote[index];
    if (!entrada) return;
    setGarFields(entrada.campos);
    setFiadores(entrada.camposFiadores);
    setMinutaFiancaState(entrada.camposMinuta);
    setGarEditandoIndex(index);
    setGarModalOpen(true);
  }

  /**
   * Fecha sem guardar (Cancelar / clique fora).
   *
   * Limpa SÓ quando estava editando uma entrada do lote: ali os campos são os
   * daquela garantia, e deixá-los faria o "+ Adicionar garantia" seguinte abrir
   * com os dados de outra. Num cancelamento de garantia NOVA o rascunho fica —
   * inclusive a hidratação da re-indicação, que ninguém digitou e não se deve
   * descartar por um clique fora.
   */
  function fecharModalGarantia() {
    setGarModalOpen(false);
    // Editar (lote OU persistida) deixa no formulário os campos DAQUELA
    // garantia; sem limpar, o "+ Adicionar garantia" seguinte abriria com eles.
    if (garEditandoIndex !== null || garEditandoId !== null) {
      limparFormularioGarantia();
    }
    setGarEditandoIndex(null);
    setGarEditandoId(null);
  }

  /**
   * Guarda a garantia do formulário no lote e fecha o modal.
   *
   * ⚠️ **Nada vai ao backend aqui** — é o ponto inteiro. Gravar uma a uma faria a
   * primeira apta promover o subprocesso e auto-resolver a pendência, e o
   * `indicar` seguinte viria 400. Ver {@link GarantiaEmLote}.
   */
  function salvarGarantiaNoLote() {
    const atual = montarGarantiaAtual();
    if (!atual) return;

    if (garEditandoId !== null) {
      // Edição de PERSISTIDA — vai para o rascunho de edições, não para o lote:
      // ela já existe no backend, e criá-la de novo duplicaria a garantia.
      const id = garEditandoId;
      setEdicoes((prev) => new Map(prev).set(id, atual));
    } else {
      setGarantiasEmLote((prev) =>
        garEditandoIndex === null
          ? [...prev, atual]
          : prev.map((g, i) => (i === garEditandoIndex ? atual : g)),
      );
    }
    setGarModalOpen(false);
    setGarEditandoIndex(null);
    setGarEditandoId(null);
    // A garantia SEGUINTE nasce em branco: preservar campos é como o ticket
    // duplicava antes da spec de 28/08/2026.
    limparFormularioGarantia();
  }

  /**
   * Uma garantia DO LOTE na forma que `GarantiasLista` mostra.
   *
   * Os dados vêm do PAYLOAD já montado, não do formulário: é ele que diz o que
   * vai ser enviado, e é isso que a linha deve exibir.
   *
   * ⚠️ Os documentos aqui são arquivos ESCOLHIDOS, sem `href`: nada subiu ainda.
   * No card da 01b a mesma lista mostra links de download — é a diferença que o
   * slot `documentos` de `GarantiaLinhaVM` existe para acomodar.
   */
  function linhaDoLote(
    entrada: GarantiaEmLote,
    index: number,
    /**
     * A chave da linha quando ela NÃO é uma entrada do lote — o uuid da garantia
     * persistida que está sendo editada.
     *
     * Existe para o `data-testid` do bloco de anexos não colidir: com `index`
     * fixo em 0, uma persistida editada e a primeira garantia do lote teriam o
     * MESMO testid na mesma tela.
     */
    chaveExplicita?: string,
  ): GarantiaLinhaVM {
    const { payload, anexos, campos } = entrada;
    const tipo =
      TIPO_GARANTIA_LABEL[payload.tipo as TipoGarantia] ?? payload.tipo;

    const meta = [
      // O banco entra ANTES dos campos do bem, como no card: numa bancária ele é
      // o único conteúdo, e nos outros tipos `fiadores` não tem banco a mostrar.
      [payload.fiadores?.[0]?.nome, payload.fiadores?.[0]?.documento]
        .filter(Boolean)
        .join(' · '),
      payload.imovelEndereco,
      [campos.imovelCidade, campos.imovelUf].filter(Boolean).join('/'),
      (payload.matriculas ?? []).length > 0
        ? `${(payload.matriculas ?? []).length} matrícula(s)`
        : '',
      payload.categoria
        ? (CATEGORIA_GARANTIA_OPTIONS.find((c) => c.value === payload.categoria)
            ?.label ?? payload.categoria)
        : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      /*
       * Prefixo `lote-` (ADO 68110): esta lista passou a conviver com a das
       * garantias PERSISTIDAS, cuja `chave` é o uuid da linha. Hoje os dois
       * espaços de key são separados (são dois `<ul>`), mas a `chave` também é
       * sufixo de `data-testid` — e fundir as listas, a "simplificação" óbvia
       * de amanhã, colidiria keys do React e testids de uma vez.
       */
      chave: chaveExplicita ?? `lote-${index}`,
      tipo,
      origem:
        ORIGEM_GARANTIA_OPTIONS.find((o) => o.value === payload.origem)?.label ??
        payload.origem,
      valorLabel:
        typeof payload.valorAvaliadoBRL === 'number'
          ? payload.valorAvaliadoBRL.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })
          : '',
      meta,
      compartilhamento:
        payload.compartilhadaComOutrasOportunidades === true ? (
          <>
            Compartilhada com outras oportunidades
            {payload.detalhesCompartilhamento && (
              <span className="text-(--color-text)">
                {' '}
                · {payload.detalhesCompartilhamento}
              </span>
            )}
          </>
        ) : null,
      observacoes: payload.observacoes ?? null,
      documentos:
        anexos.length === 0 ? null : (
          <div
            data-testid={`gar-lote-documentos-${chaveExplicita ?? index}`}
            className="mt-2 flex flex-col gap-1.5"
          >
            <div className="text-(length:--t-small) uppercase tracking-[.3px] text-(--color-text-muted)">
              Documentos a enviar
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-(length:--t-caption) text-(--color-text-muted)">
              {anexos.map((a, i) => (
                <span key={`${a.type}-${i}`}>
                  {a.type} · {a.file.name}
                </span>
              ))}
            </div>
          </div>
        ),
      /*
       * LOCAIS os dois: nada foi enviado. Editar reabre o modal com o que foi
       * digitado; remover tira a garantia do que vai ser enviado. Sem
       * `useConfirm` — a regra do repo o reserva para o que apaga dado, move
       * máquina de estado ou notifica alguém, e nada disso acontece aqui.
       */
      /*
       * Sem o qualificador as duas listas dariam o MESMO nome acessível às
       * ações ("Remover garantia Garantia real"), e uma consulta por nome
       * estouraria em vez de escolher.
       */
      qualificadorAcessivel: 'a enviar',
      ...(canIndicar && !isSaving
        ? {
            onEditar: () => abrirModalGarantiaParaEditar(index),
            onRemover: () =>
              setGarantiasEmLote((prev) => prev.filter((_, j) => j !== index)),
          }
        : {}),
    };
  }

  /*
   * ---- O submit tem efeito que RESOLVE a pendência?
   *
   * Um lugar só, lido pelos três consumidores: a visibilidade do "Resolver
   * pendência", o aviso que explica a ausência dele, e o early-return deste
   * submit. Eram duas transcrições da mesma regra (o botão e o `return` abaixo),
   * e elas já divergiam em uma condição.
   *
   * ⚠️ As contagens saem de `persistidas`, nunca de `excluidas.size`: a lista é
   * relida em background, e um id marcado que saiu dela não pode contar como
   * exclusão nem descontar de `restantes`.
   *
   * ⚠️ `edicoesEfetivas` desconta a edição ANULADA por exclusão — a exclusão
   * vence a edição no submit, então uma garantia editada e depois marcada não
   * deixa mudança nenhuma que resolva.
   */
  const persistidasMarcadas = persistidas.filter((g) => excluidas.has(g.id)).length;
  const persistidasRestantes = persistidas.length - persistidasMarcadas;
  const edicoesEfetivas = [...edicoes.keys()].filter((id) => !excluidas.has(id));
  const temMudancaQueResolve = indicacaoTemMudancaQueResolve({
    novas: garantiasEmLote.length,
    edicoesEfetivas: edicoesEfetivas.length,
    exclusoes: persistidasMarcadas,
    restantes: persistidasRestantes,
  });

  function handleSubmitGarantia() {
    if (!canIndicar) return;

    /*
     * O LOTE, e só ele: com o modal não existe "garantia corrente" fora dele. O
     * `montarGarantiaAtual` daqui foi removido junto com o formulário sempre
     * aberto — somar o formulário (vazio) ao lote não fazia mais sentido.
     */
    const rascunho: RascunhoDeGarantias = {
      novas: garantiasEmLote,
      edicoes: [...edicoes.entries()]
        // Exclusão VENCE edição: mandar o PATCH de uma linha que a chamada
        // seguinte apaga é trabalho jogado fora — e, se o DELETE falhar, deixa
        // gravada uma alteração que o LT pediu para sumir.
        .filter(([id]) => !excluidas.has(id))
        .map(([indicacaoId, entrada]) => ({ indicacaoId, entrada })),
      exclusoes: [...excluidas],
    };
    // O MESMO veredito que decide o botão — ver `temMudancaQueResolve`.
    if (!temMudancaQueResolve) return;

    const total =
      rascunho.novas.length + rascunho.edicoes.length + rascunho.exclusoes.length;
    confirm.ask({
      title: "Resolver a pendência e encaminhar ao CCOB?",
      description:
        `${descreverRascunho(rascunho)} A CCOB analisa o conjunto resultante.` +
        (rascunho.exclusoes.length > 0
          ? " As garantias marcadas para exclusão serão removidas agora."
          : ""),
      // "Salvar indicação" só quando a única mudança é uma garantia NOVA:
      // numa exclusão pura nada está sendo indicado.
      confirmLabel:
        total === 1 && rascunho.novas.length === 1
          ? "Salvar indicação"
          : "Salvar alterações",
      onConfirm: () => void aplicarRascunho(rascunho),
    });
  }

  /**
   * Submete o rascunho e PODA da tela o que foi aplicado.
   *
   * A poda usa o que o pai devolve, não o que foi enviado: num erro parcial as
   * duas listas diferem, e é justamente aí que manter tudo no rascunho
   * duplicaria a garantia já criada no retry.
   */
  async function aplicarRascunho(rascunho: RascunhoDeGarantias) {
    const aplicado = await onIndicar(rascunho);

    setGarantiasEmLote((prev) => prev.filter((g) => !aplicado.novas.includes(g)));
    setEdicoes((prev) => {
      const proximo = new Map(prev);
      for (const id of aplicado.edicoes) proximo.delete(id);
      return proximo;
    });
    setExcluidas((prev) => {
      const proximo = new Set(prev);
      for (const id of aplicado.exclusoes) proximo.delete(id);
      return proximo;
    });
  }

  /**
   * What the garantia form still needs, in pt-BR — NOT a boolean.
   *
   * The submit button is disabled by any of ~10 conditions and the screen said
   * nothing about which one. Measured on 20/08/2026: a garantia real with every
   * visible field filled left the button grey because the certidão and the
   * laudo had not been uploaded — two requirements with no on-screen mention.
   * This ticket is the ONLY surface that submits the indication (PRD §7.2), so
   * a control that refuses without saying why is the same dead end the garantia
   * worker exists to prevent.
   *
   * Same shape as the sendbar's `motivoBloqueio`: state what is missing, never
   * where to click.
   */
  const garMissing: string[] = (() => {
    const missing: string[] = [];
    if (!garFields.tipo) missing.push('Tipo de garantia');
    if (!garFields.origem) missing.push('Garantia existente × nova');

    // Property fields — mirror of the backend @ValidateIf rules (garantia real
    // nova); without this the user hit the confirm modal only to get a 400.
    if (needsImóvel) {
      if (!garFields.imovelEndereco.trim()) missing.push('Endereço do imóvel');
      // HIP-01 — ao menos UMA matrícula com número.
      if (!garFields.matriculas.some((m) => m.numero.trim()))
        missing.push("Matrícula");
      if (!garFields.imovelCidade.trim()) missing.push("Cidade");
      if (!garFields.imovelUf.trim()) missing.push("UF");
    }
    // O VALOR é cobrado em TODO tipo (ADO 68002), fora do `needsBem`: não é o
    // laudo do bem, é o `Valor` do org — numa fiança bancária, o da carta do
    // banco. `R$ 0,00` não satisfaz.
    if (parseValorBrl(garFields.valorAvaliadoBRL) === undefined) {
      missing.push('Valor');
    }

    /*
     * GER-03: "Sim" sem o detalhe não carrega a informação que a pergunta existe
     * para carregar. O backend recusa com 400; validar aqui é o que põe o campo na
     * lista de faltantes em vez de um erro genérico depois do submit.
     */
    if (garFields.compartilhada && !garFields.detalhesCompartilhamento.trim()) {
      missing.push('Quais oportunidades / detalhes do compartilhamento');
    }
    if (needsBem) {
      if (!garFields.categoria) missing.push('Categoria');
      /*
       * PRD F1 doc gate (espelho da regra do backend): certidão é exigida em
       * qualquer prévia; laudo só em garantia NOVA.
       *
       * O condicional `checklistDocsKnown` saiu junto com o prefill: os slots
       * agora refletem só o que o usuário escolheu nesta sessão, então a
       * exigência é sempre verificável — não há leitura que possa falhar.
       */
      /*
       * HIP-03 — a certidão é cobrada POR MATRÍCULA, e a frase nomeia qual
       * falta: com três matrículas, "falta a certidão" não diria em qual anexar.
       * Só as linhas COM número entram (a linha em branco do repetidor não é uma
       * matrícula ainda), e a numeração é a do payload.
       */
      garFields.matriculas
        .filter((m) => m.numero.trim() !== '')
        .forEach((m, i) => {
          if (!m.certidaoFile && !m.certidaoAnexada) {
            missing.push(
              `Certidão de Inteiro Teor da matrícula ${i + 1} (anexar)`,
            );
          }
        });

      /*
       * HIP-02 — um laudo por bloco, e só em garantia NOVA (a existente mantém a
       * avaliação mastered no SAP — o mesmo filtro que `garantiaApta` aplica).
       */
      if (garOrigem === ORIGEM_GARANTIA.NOVA) {
        garFields.laudos.forEach((l, i) => {
          if (!l.file && !l.anexado) {
            missing.push(
              garFields.laudos.length === 1
                ? 'Laudo de Avaliação (anexar)'
                : `Laudo de Avaliação ${i + 1} (anexar)`,
            );
          }
        });
      }
    }
    if (needsExistente && !garFields.sapGarantiaExternaId) {
      missing.push('Id da garantia no SAP');
    }
    if (needsFiador) {
      if (fiadores.length === 0) {
        missing.push('Ao menos um fiador');
      }
      for (const [i, f] of fiadores.entries()) {
        const quem = fiadores.length > 1 ? ` (fiador ${i + 1})` : '';
        if (!f.nome.trim()) missing.push(`Nome do fiador${quem}`);
        if (!f.documento.trim()) missing.push(`CPF/CNPJ do fiador${quem}`);
        // Marital status (and the cônjuge behind it) only applies to a natural
        // person — same predicate the field's visibility and the DTO use.
        if (!fiadorEhPessoaJuridica(f.documento)) {
          if (!f.estadoCivil) missing.push(`Estado civil do fiador${quem}`);
          if (!f.email.trim()) missing.push(`E-mail do fiador${quem}`);
          if (!f.profissao.trim()) missing.push(`Profissão do fiador${quem}`);
          if (!enderecoCompleto(f.endereco))
            missing.push(`Endereço completo do fiador${quem}`);
          if (exigeConjuge(f.estadoCivil)) {
            if (!f.conjugeNome.trim()) missing.push(`Nome do cônjuge${quem}`);
            if (!f.conjugeDocumento.trim())
              missing.push(`CPF/CNPJ do cônjuge${quem}`);
            if (!f.conjugeEmail.trim())
              missing.push(`E-mail do cônjuge${quem}`);
            if (!f.conjugeProfissao.trim())
              missing.push(`Profissão do cônjuge${quem}`);
            if (!enderecoCompleto(f.conjugeEndereco))
              missing.push(`Endereço completo do cônjuge${quem}`);
          }
        }
      }
    }
    if (
      needsMinutaFianca &&
      minutaFiancaState.status !== 'uploaded' &&
      minutaFiancaState.status !== 'pendente'
    ) {
      /*
       * ⚠️ Dizia "Estatuto do banco" — documento RETIRADO em 02/09/2026, quando
       * a minuta passou a ser a obrigatória da bancária. A lista de faltantes
       * existe para nomear o que anexar, e nomeava um slot que a tela já não
       * tem: quem lesse iria procurar um campo inexistente.
       */
      missing.push('Minuta do Contrato de Fiança Bancária (anexar)');
    }
    return missing;
  })();

  /**
   * `true` while an upload is in flight — avoids a submit/upload race.
   *
   * Só o estatuto: a certidão e o laudo deixaram de ter upload em voo próprio em
   * 01/09/2026 — eles são escolha do formulário e sobem no submit, junto com o
   * resto (`handleIndicar`), que já bloqueia por `isSaving`.
   */
  const garUploading = minutaFiancaState.status === 'uploading';

  const garCanSubmit = !isSaving && garMissing.length === 0 && !garUploading;

  /*
   * The DDI parecer comes BEFORE the resolved banner on purpose.
   *
   * Resolving this pendência does not end the analysis: Integridade may attach
   * documents, re-analyse and change the verdict (a rejection is reversible).
   * Behind the banner, the only way back was the DDI panel on another screen —
   * the ticket, which is where the conversation happens, offered no way to act
   * on what had just been said in it.
   */
  if (isDdi) {
    return (
      <DdiParecerBlock
        pendencia={pendencia}
        carregarDdi={carregarDdiFn}
        emitirParecer={emitirParecerFn}
        solicitarDocumento={solicitarDocumentoFn}
        onDone={onDdiDone}
      />
    );
  }

  /*
   * A DDI reprovada, DEPOIS da faixa de resolvida — ao contrário do parecer.
   *
   * O parecer vem antes porque a Integridade pode voltar a agir sobre uma
   * pendência já resolvida (a reprovação é reversível, e o ticket é onde a
   * conversa acontece). Aqui é o oposto: resolver esta pendência significa que
   * o pedido FOI enviado e a análise já voltou para a Integridade — oferecer o
   * formulário de novo só poderia terminar no 400 do backend ("a análise não
   * está reprovada"). Reprovada outra vez, a devolução nasce como pendência
   * NOVA (o índice único é parcial), com o ticket ativo dela.
   */
  if (isDdiRevisao && !isResolved) {
    return (
      <DdiRevisaoBlock
        pendencia={pendencia}
        carregarDdi={carregarDdiFn}
        solicitarRevisao={solicitarRevisaoFn}
        onDone={onDdiDone}
      />
    );
  }

  // ---- Resolved banner
  if (isResolved) {
    return (
      <div
        className="flex items-center gap-2 rounded-[var(--radius-md)] bg-(--color-success-bg) px-4 py-3 text-(--color-success)"
        role="status"
        aria-label="Pendência resolvida"
      >
        <CheckCircleIcon className="size-4" />
        <span className="font-bold">Pendência resolvida</span>
        {pendencia.resolvidaEm && (
          <span className="text-(length:--t-small) opacity-80">
            em {formatDate(pendencia.resolvidaEm)}
          </span>
        )}
      </div>
    );
  }

  if (isAutomatica) {
    return (
      <div
        role="status"
        aria-label="Resolução automática"
        className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-bold">Resolução automática</p>
          {/*
            Sentence from the backend catalog, per trigger: the SAP check
            confirms the bank data, the SAP registration confirms the franchise
            code. One hardcoded sentence here named the bank-data check on every
            one of them, sending the reader to a system with nothing to do with
            the pendência in front of them.
          */}
          <p>
            {pendencia.acaoResolucaoDetalhe ??
              'Esta pendência é encerrada por uma verificação automática, não por um usuário.'}
          </p>
        </div>
      </div>
    );
  }

  /*
   * ---- Hub (documento da minuta) -----------------------------------------
   *
   * NAVIGATES, never uploads. This pendência is opened per checklist CATEGORY
   * and its discriminator carries only the category, so a ticket upload had no
   * slot to write to: it closed the pendência, left the checklist untouched, and
   * the reconciler reopened an identical one about a minute later — measured
   * twice (PN-0012 → PN-0014, PN-0013 → PN-0015), with the minuta permanently
   * ungenerable (VBR-628).
   *
   * The Hub attaches into the real slot and the worker then closes the pendência
   * on its own, which is how the measured run was actually unblocked. A CTA must
   * not promise a resolution it cannot produce.
   */
  if (isHub) {
    return (
      <div
        role="status"
        aria-label="Resolução no hub de documentos"
        data-testid="resolucao-hub"
        className="space-y-3 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <div className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Anexe no hub de documentos</p>
            <p>
              Este documento precisa ser anexado no slot correspondente do hub
              da oportunidade. Ao anexar lá, esta pendência é encerrada
              automaticamente.
            </p>
          </div>
        </div>
        {oportunidadeId && (
          <Link
            href={`/oportunidades/${encodeURIComponent(oportunidadeId)}/documentos`}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 font-bold text-(--secondary-500) no-underline transition hover:bg-(--neutral-50)"
          >
            Abrir hub de documentos →
          </Link>
        )}
      </div>
    );
  }

  /*
   * ---- Franquia (FAP / fotos do ponto) ------------------------------------
   *
   * NAVEGA, nunca anexa. O anexo tem de chegar à PRÓPRIA PROPOSTA
   * (`franchise_fap_documents` / `station_photos`), que é o que o
   * `FranquiaGateService` lê no GATE 1.
   *
   * ⚠️ **Ramo HISTÓRICO desde 14/09/2026:** o negócio retirou a cobrança por
   * pendência (a FAP é obrigatória no checklist de documentos e no cadastro da
   * proposta, e não deve aparecer no card da oportunidade). Nenhuma pendência
   * nova nasce com esta origem; este ramo serve as já gravadas, e é o que as
   * mantém legíveis em vez de cair no `upload`.
   *
   * Nem `upload` (a dropzone daqui escreve no repositório da OPORTUNIDADE) nem
   * `hub` (anexar lá satisfaz a linha do checklist, não o gate): os dois
   * seriam um anexo que não conta em lugar nenhum — o loop medido na VBR-628.
   * Um CTA não pode prometer uma resolução que ele não produz.
   */
  if (isFranquia) {
    return (
      <div
        role="status"
        aria-label="Resolução na proposta de franquia"
        data-testid="resolucao-franquia"
        className="space-y-3 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <div className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Anexe na proposta de franquia</p>
            {/* Frase do backend (`acaoResolucaoDetalhe`) — a tela não escreve
                texto de negócio. O fallback cobre uma resposta anterior à
                mudança, nunca uma wording paralela. */}
            <p>
              {pendencia.acaoResolucaoDetalhe ??
                'Esta pendência é encerrada quando o documento for anexado na proposta de franquia da oportunidade.'}
            </p>
          </div>
        </div>
        {oportunidadeId && (
          <Link
            href={`/oportunidades/${encodeURIComponent(oportunidadeId)}`}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 font-bold text-(--secondary-500) no-underline transition hover:bg-(--neutral-50)"
          >
            Abrir a oportunidade →
          </Link>
        )}
      </div>
    );
  }

  /*
   * ---- Análise prévia da garantia (CCOB) ----------------------------------
   *
   * NAVEGA, nunca fecha. A decisão vive na tela de Garantia da oportunidade, e
   * é ela que auto-resolve a pendência — `POST .../resolver` recusa esta origem
   * com 400.
   *
   * Nem `marcar` (o `tipo` é `ANALISE`, então era esse o fallback): um clique
   * fecharia a cobrança sem parecer e sem veredito, com a garantia presa em
   * `EM_ANALISE_PREVIA` e o `INICIAR_MINUTA` travado sem nada explicando o
   * motivo. Nem `automatica`: ninguém a fecha sozinho.
   */
  if (isPreviaGarantia) {
    return (
      <div
        role="status"
        aria-label="Resolução na análise prévia da garantia"
        data-testid="resolucao-previa-garantia"
        className="space-y-3 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <div className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Decida na tela de Garantia</p>
            {/* Frase do backend (`acaoResolucaoDetalhe`) — a tela não escreve
                texto de negócio. O fallback cobre uma resposta anterior à
                mudança, nunca uma wording paralela. */}
            <p>
              {pendencia.acaoResolucaoDetalhe ??
                'Esta pendência é encerrada quando a análise prévia for concluída — registre o parecer da CCOB e aprove ou reprove a garantia.'}
            </p>
          </div>
        </div>
        {oportunidadeId && (
          <Link
            href={`/oportunidades/${encodeURIComponent(oportunidadeId)}/garantia`}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 font-bold text-(--secondary-500) no-underline transition hover:bg-(--neutral-50)"
          >
            Abrir a tela de Garantia →
          </Link>
        )}
      </div>
    );
  }

  /*
   * ---- Parecer antecipado do time de franquias ----------------------------
   *
   * NAVEGA, nunca fecha. O parecer vive no bloco "Parecer antecipado" da
   * proposta de franquia, e é a submissão dele que auto-resolve a pendência —
   * `POST .../resolver` recusa esta origem com 400.
   *
   * Nem `marcar` (o `tipo` é `ANALISE`, então era esse o fallback): um clique
   * fechava a cobrança sem parecer, o `FranquiaContratoGateGuard` seguia
   * travando o `INICIAR_MINUTA` (RN-F6-05) e o consumer reabria a mesma
   * pendência — o par `PN-0215`/`PN-0216` do ADO 68191.
   */
  if (isFranquiaParecer) {
    return (
      <div
        role="status"
        aria-label="Resolução pelo parecer antecipado do time de franquias"
        data-testid="resolucao-franquia-parecer"
        className="space-y-3 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <div className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Emita o parecer na proposta de franquia</p>
            {/* Frase do backend (`acaoResolucaoDetalhe`) — a tela não escreve
                texto de negócio. O fallback cobre uma resposta anterior à
                mudança, nunca uma wording paralela. */}
            <p>
              {pendencia.acaoResolucaoDetalhe ??
                'Esta pendência é encerrada quando o parecer antecipado for emitido na proposta de franquia da oportunidade.'}
            </p>
          </div>
        </div>
        {oportunidadeId && (
          <Link
            href={`/oportunidades/${encodeURIComponent(oportunidadeId)}`}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 font-bold text-(--secondary-500) no-underline transition hover:bg-(--neutral-50)"
          >
            Abrir a oportunidade →
          </Link>
        )}
      </div>
    );
  }

  /*
   * ---- Reenvio (proposta devolvida pela SNEG) -----------------------------
   *
   * NAVEGA, nunca fecha. Quem encerra esta pendência é o reenvio da proposta
   * (`POST /v1/proposals/:id/reenviar`), que a auto-resolve pela mesma chave com
   * que a devolução a abriu — e `POST .../resolver` recusa esta origem com 400.
   *
   * Enquanto o backend a derivava como `marcar`, o ticket oferecia "Marcar como
   * resolvida": a pendência obrigatória fechava com a proposta ainda DEVOLVIDA,
   * saía da trava do GATE 2 e nada voltava para a SNEG analisar. Um CTA não pode
   * prometer uma resolução que ele não produz.
   */
  if (isReenvio) {
    return (
      <div
        role="status"
        aria-label="Resolução pelo reenvio da proposta"
        data-testid="resolucao-reenvio"
        className="space-y-3 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <div className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Resolvida no reenvio da proposta</p>
            {/* Frase do backend (`acaoResolucaoDetalhe`) — a tela não escreve
                texto de negócio. O fallback cobre uma resposta anterior à
                mudança, nunca uma wording paralela. */}
            <p>
              {pendencia.acaoResolucaoDetalhe ??
                'Esta pendência é encerrada quando a proposta for reenviada para análise.'}
            </p>
          </div>
        </div>
        {oportunidadeId && (
          <Link
            href={`/oportunidades/${encodeURIComponent(oportunidadeId)}`}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 font-bold text-(--secondary-500) no-underline transition hover:bg-(--neutral-50)"
          >
            Abrir a oportunidade →
          </Link>
        )}
      </div>
    );
  }

  // ---- Garantia form -------------------------------------------------------
  if (isGar) {
    /*
     * As linhas das garantias JÁ PERSISTIDAS (ADO 68110).
     *
     * A forma vem do módulo compartilhado com o card (`linhaGarantiaPersistida`)
     * — meta, dossiê e compartilhamento; o que é deste host é a AÇÃO.
     *
     * ⚠️ **Só `Remover`, nunca `Editar`.** `GarantiaSubprocessoService.reconciliar`
     * retorna cedo fora de `AGUARDANDO_INDICACAO`, então uma edição em lugar
     * **não** reenviaria o conjunto à CCOB a partir de `PREVIA_REPROVADA`: o
     * botão prometeria uma correção que nenhum backend aplica. O laço que
     * funciona é retirar a recusada e cadastrar a corrigida — `garantia:indicar`
     * aceita `PREVIA_REPROVADA`, promove o subprocesso e resolve a pendência.
     */
    const linhasPersistidas = persistidas.map((g) => {
      const editada = edicoes.get(g.id);
      const marcada = excluidas.has(g.id);

      /*
       * Com edição pendente a linha mostra os dados EDITADOS, não os do backend:
       * senão o LT salva no modal, a lista não muda, e o rascunho lê como se o
       * clique não tivesse feito nada. A `chave` continua sendo o id da
       * persistida — é ela que a linha representa, e é por ele que o submit a
       * atualiza.
       */
      const persistida = linhaGarantiaPersistida(g, undefined, previaReprovadaEm);
      /*
       * Com edição pendente, os CAMPOS vêm do rascunho e os DOCUMENTOS do
       * backend.
       *
       * ⚠️ `linhaDoLote` sozinha renderiza só os anexos PENDENTES — e numa
       * edição de campo não há nenhum, então o dossiê inteiro sumia da linha
       * (relato do stage, 04/09/2026). O documento continuava lá; sumia só da
       * tela, o que sugere que a edição o apagou.
       *
       * Os dois blocos convivem: o que JÁ existe no backend e, abaixo, o que
       * está escolhido e sobe no salvar.
       */
      const doLote = editada ? linhaDoLote(editada, 0, g.id) : null;
      const base = doLote
        ? {
            ...doLote,
            documentos:
              persistida.documentos || doLote.documentos ? (
                <>
                  {persistida.documentos}
                  {doLote.documentos}
                </>
              ) : null,
          }
        : persistida;

      const acoes =
        canIndicar && pendenciaAtiva && !isSaving
          ? {
              onEditar: () => abrirModalGarantiaPersistida(g),
              onRemover: () => alternarExclusao(g.id, true),
              onDesfazer: () => alternarExclusao(g.id, false),
            }
          : {};

      return {
        ...base,
        ...acoes,
        editada: editada !== undefined,
        marcadaParaExclusao: marcada,
        qualificadorAcessivel: 'já cadastrada',
      };
    });

    /*
     * O bloco de LEITURA do conjunto — o mesmo para quem indica e para quem só
     * acompanha. Carregando, falha, e a lista.
     *
     * ⚠️ Ele é montado ANTES do gate de permissão de propósito (ADO 68110): a
     * lista não é controle, é o conteúdo que o ticket existe para mostrar, e a
     * SNEG/CCOB que abre a pendência precisa ver o que a CCOB analisou tanto
     * quanto o LT. Antes o `!canIndicar` trocava o bloco INTEIRO pela nota de
     * leitura, e esses perfis não viam garantia nenhuma.
     */
    /*
     * ---- A recusa da CCOB, acima do conjunto que ela recusou (04/09/2026)
     *
     * Duas frases com audiências diferentes: o FATO é para todo mundo que abre o
     * ticket; a ORIENTAÇÃO só para quem indica — SNEG e CCOB não têm o "Remover"
     * nem o "+ Adicionar garantia" (`garantia.indicacao.submit` é `[LT, ADMIN]`),
     * e mandá-los agir apontaria para controle que a tela não lhes oferece.
     *
     * ⚠️ A frase NÃO afirma que cada linha listada foi reprovada. A prévia é do
     * CONJUNTO (VBR-500), e depois de um submit parcial pode haver ali uma linha
     * nova que ninguém recusou — dizer "estas garantias foram reprovadas" seria
     * falso justamente no caso em que o LT já começou a corrigir.
     *
     * ⚠️ O parecer NÃO é citado aqui (decisão de 04/09/2026): ele já entra no
     * histórico como comentário do thread, com autor e data, e repeti-lo daria
     * dois donos ao mesmo texto. A caixa aponta para lá.
     *
     * ⚠️ **"Retire … e cadastre a corrigida" CADUCOU no mesmo dia**: a garantia
     * recusada passou a ser EDITÁVEL, então mandar retirá-la prescrevia o
     * caminho mais caro como se fosse o único. O texto encolheu junto — a
     * primeira versão tinha três frases acima de uma lista que o LT precisa
     * ler.
     *
     * ⚠️ `role="status"`, NUNCA `role="alert"`: esta seção reserva o alert para o
     * erro do submit, e um segundo faz `getByRole('alert')` estourar em vez de
     * escolher — defeito já medido nesta suíte. E a caixa é a `AvisoGarantia`, a
     * MESMA dos avisos de fiança logo abaixo neste formulário: ela nasceu com a
     * paleta da faixa de erro (`--yellow-700` na borda, `--neutral-25` de fundo),
     * que parecia da família e não era.
     */
    const avisoPreviaReprovada = previaReprovada ? (
      <AvisoGarantia testId="aviso-previa-reprovada" role="status">
        A CCOB reprovou a análise prévia — o parecer está no histórico.
        {canIndicar && ' Edite ou exclua a(s) recusada(s), ou cadastre outras.'}
      </AvisoGarantia>
    ) : null;

    const leituraDoConjunto = (
      <>
        {avisoPreviaReprovada}
        {persistidasStatus === 'loading' && persistidas.length === 0 && (
          <div role="status" aria-busy="true" className="space-y-2">
            <span className="sr-only">Carregando as garantias já cadastradas…</span>
            <div className="h-9 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)" />
            <div className="h-16 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)" />
          </div>
        )}

        {persistidasErro && (
          /*
           * `role="status"`, NUNCA `role="alert"`: esta seção já tem um alert (o
           * `actionError` do submit), e um segundo faz `getByRole('alert')`
           * estourar em vez de escolher — defeito já medido nesta suíte.
           *
           * O texto diz o que continua de pé: perder o lote digitado por causa de
           * um GET seria pior que a lacuna que ele reporta.
           */
          <div
            role="status"
            data-testid="garantias-persistidas-erro"
            className="rounded-[var(--radius-xs)] border border-(--yellow-700) bg-(--neutral-25) px-3 py-2.5 text-(length:--t-caption) text-(--color-text)"
          >
            {persistidasErro} As garantias que você preencheu continuam abaixo.{' '}
            {/*
              "Recarregar as garantias", e não "Tentar novamente": o bloco de
              garantias EXISTENTES no SAP (`carregarExistentes`) já tem um botão
              com aquele texto, e os dois podem estar na tela ao mesmo tempo —
              dois controles com o mesmo nome acessível não se distinguem, nem
              para quem lê a tela nem para quem a consulta por nome.
            */}
            <button
              type="button"
              onClick={() => setRecarregarPersistidas((n) => n + 1)}
              className="font-bold text-(--secondary-600) underline"
            >
              Recarregar as garantias
            </button>
          </div>
        )}
      </>
    );

    /*
     * Quem NÃO indica (SNEG/CCOB — `garantia.indicacao.submit` é `[LT, ADMIN]`)
     * recebe a lista em leitura e a nota, nunca o formulário: um formulário
     * editável sem submit é controle morto (esconder controle é UX; o 403 do
     * backend continua sendo a garantia).
     */
    if (!canIndicar) {
      return (
        <div className="space-y-4">
          {leituraDoConjunto}
          {linhasPersistidas.length > 0 ? (
            <GarantiasLista
              testId="garantias-persistidas"
              linhas={linhasPersistidas}
            />
          ) : (
            persistidasStatus !== 'loading' && <GarantiasVazio />
          )}
          <div
            role="status"
            aria-label="Indicação restrita ao LT"
            className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
          >
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              A indicação da garantia é preenchida pelo LT responsável por esta
              pendência. Os dados enviados ficam disponíveis na página da garantia
              da oportunidade.
            </p>
          </div>
        </div>
      );
    }

    const fieldClass =
      'w-full rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit] placeholder:text-(--color-text-muted) focus:outline-none focus:ring-2 focus:ring-(--secondary-500) disabled:opacity-50';

    /*
     * O modal está EDITANDO — uma entrada do lote OU uma garantia persistida.
     *
     * ⚠️ Os rótulos liam só `garEditandoIndex` (a posição no LOTE) e, na edição
     * de uma PERSISTIDA, o modal se anunciava "Adicionar garantia" com o botão
     * dizendo o mesmo — sobre uma garantia que já existe. O comportamento
     * sempre esteve certo (`salvarGarantiaNoLote` manda a persistida para
     * `edicoes`, nunca para o lote); era o texto que prometia uma duplicata.
     * Os dois estados são distintos de propósito (posição × identidade), então
     * quem lê "estou editando?" tem de olhar os dois.
     */
    const garEditando = garEditandoIndex !== null || garEditandoId !== null;
    const garEditandoLabel = garEditando ? 'Editar garantia' : 'Adicionar garantia';

    // ⚠️ Arrow, nunca `map(linhaDoLote)`: o terceiro argumento do `map` é o
    // ARRAY, e ele cairia em `chaveExplicita`.
    const linhasDoLote = garantiasEmLote.map((g, i) => linhaDoLote(g, i));
    const temAsDuasListas =
      linhasPersistidas.length > 0 && linhasDoLote.length > 0;

    return (
      <div className="space-y-4">
        {confirm.dialog}

        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Cadastre as garantias desta oportunidade. Ao salvar a indicação, elas
          seguem juntas para a análise prévia do CCOB.
        </p>

        {/*
          DUAS listas, no MESMO molde do card da 01b (`GarantiasLista`) — pedido
          do negócio em 02/09/2026: *"tem que ser no mesmo estilo de
          oportunidades, mostrando que não tem garantias… e com a opção de clicar
          em + Adicionar garantia"*.

          ⚠️ **As PERSISTIDAS entraram no ADO 68110.** O ticket listava só o lote,
          e o lote é o que ainda NÃO foi enviado — então uma pendência reaberta
          depois de a prévia ser reprovada dizia "Nenhuma garantia cadastrada
          ainda." com o conjunto inteiro no banco. Era o retrato exato do bug: o
          LT não via o que a CCOB recusou, e a única ação possível era acrescentar
          uma segunda ao lado.

          ⚠️ Sem a pill de estado do conjunto que o card exibe: ela é dele
          (VBR-500 — o subprocesso é 1:1 com a oportunidade e a pill descreve o
          CONJUNTO), e aqui a própria pendência já diz o que está sendo pedido.
          Retirada a pedido do negócio no mesmo relato.

          ⚠️ Os títulos só aparecem quando as DUAS listas têm linha. O protótipo
          `01b` tem uma lista só e nenhum título; com uma lista só a tela continua
          idêntica a ele, e o rótulo entra apenas quando há ambiguidade real sobre
          o que já foi à CCOB e o que está prestes a ir.
        */}
        {leituraDoConjunto}

        {linhasPersistidas.length > 0 && (
          <div className="space-y-1.5">
            {temAsDuasListas && (
              <div className="text-(length:--t-small) uppercase tracking-[.3px] text-(--color-text-muted)">
                Garantias desta oportunidade
              </div>
            )}
            <GarantiasLista
              testId="garantias-persistidas"
              linhas={linhasPersistidas}
            />
          </div>
        )}

        {linhasDoLote.length > 0 && (
          <div className="space-y-1.5">
            {temAsDuasListas && (
              <div className="text-(length:--t-small) uppercase tracking-[.3px] text-(--color-text-muted)">
                A enviar
              </div>
            )}
            <GarantiasLista testId="garantias-em-lote" linhas={linhasDoLote} />
          </div>
        )}

        {/*
          A caixa vazia UMA vez, e só quando não há nem persistida nem lote.
          `persistidasStatus === 'loading'` a suprime: entre o submit do lote e a
          releitura chegar, "Nenhuma garantia cadastrada ainda." apareceria sobre
          garantias que acabaram de ser criadas — a mentira do ADO 68110
          reintroduzida por 200 ms.
        */}
        {linhasPersistidas.length === 0 &&
          linhasDoLote.length === 0 &&
          persistidasStatus !== 'loading' && <GarantiasVazio />}

        {canIndicar && (
          <AdicionarGarantiaBotao onClick={abrirModalGarantia} disabled={isSaving} />
        )}
        {actionError && (
          <p
            className="text-(length:--t-small) text-(--color-danger)"
            role="alert"
          >
            {actionError}
          </p>
        )}

        {/*
          GER-05 — o que já foi cadastrado NESTA sessão, e o convite para a
          próxima.

          Sem isto o formulário voltava em branco depois do submit e nada dizia
          que a garantia tinha sido registrada — o usuário não sabia se podia
          cadastrar outra, nem se a primeira havia entrado. A frase é o único
          sinal de que o gesto funcionou.

          `role="status"` e não `alert`: é confirmação, não problema.
        */}
        {garantiasNestaSessao > 0 && (
          <p
            role="status"
            data-testid="garantias-nesta-sessao"
            className="rounded-[var(--radius-xs)] border border-(--color-success) bg-(--color-success-bg) px-3 py-2.5 text-(length:--t-caption) text-(--color-success)"
          >
            <b>
              {garantiasNestaSessao === 1
                ? '1 garantia cadastrada'
                : `${garantiasNestaSessao} garantias cadastradas`}
            </b>{' '}
            nesta pendência. Use &quot;+ Adicionar garantia&quot; para cadastrar
            outra, ou deixe como está — a CCOB analisa o conjunto.
          </p>
        )}

        {/*
          O submit ÚNICO do lote.
          
          ⚠️ Ele não olha mais o formulário: com o modal, não existe "garantia
          corrente" fora dele — o que existe é o LOTE. Antes o botão somava a
          garantia do formulário aberto (`garCanSubmit`), e manter isso aqui faria
          um lote vazio parecer submetível enquanto o modal estivesse fechado.
        */}
        {canIndicar && temMudancaQueResolve && (
          <button
            type="button"
            data-testid="gar-salvar-lote"
            disabled={isSaving}
            onClick={handleSubmitGarantia}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Salvando…' : 'Resolver pendência'}
          </button>
        )}

        {/*
          ⚠️ **Exclusão que ESVAZIA o conjunto não habilita o botão** — a regra
          de 04/09/2026 depois da revisão do mesmo dia: retirar uma de várias
          resolve (as intactas voltam ao CCOB), retirar a última não, porque não
          sobra conjunto para analisar e `reconciliar` reabriria a pendência.

          A frase é obrigatória, não decoração: sem ela o LT marca, não vê botão
          nenhum e conclui que a tela quebrou. Só aparece no estado exato em que
          isso acontece — com o botão visível ela seria ruído.

          E ela não diz "a única garantia": o mesmo estado é alcançável marcando
          TODAS as garantias de um conjunto de várias.
        */}
        {canIndicar && !temMudancaQueResolve && persistidasMarcadas > 0 && (
          <p
            data-testid="gar-so-exclusao-aviso"
            role="status"
            className="text-(length:--t-caption) text-(--color-text-muted)"
          >
            Não é possível resolver a pendência sem nenhuma garantia — cadastre a
            corrigida ou ajuste uma existente para poder resolver.
          </p>
        )}

        {/* ── Modal: adicionar / editar garantia ────────────────────────────
            Fiel ao modal do card da 01b, que é o molde que o negócio pediu. O
            formulário que ficava aberto na página inteira vive aqui dentro. */}
        {garModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={fecharModalGarantia}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={garEditandoLabel}
              className="max-h-[90vh] w-full max-w-[880px] overflow-y-auto rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-lg"
              /*
               * ⚠️ Load-bearing: o modal do "Documento de Suporte" (GER-04) vive
               * num PORTAL, e evento de portal sobe pela árvore do REACT — sem
               * este `stopPropagation` um clique fora dele fecharia OS DOIS.
               */
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-1.5 flex items-center text-(length:--t-h4) font-bold text-(--neutral-900)">
                {garEditandoLabel}
                {oportunidadeId && (
                  <DocumentoSuporteCcob opportunityId={oportunidadeId} />
                )}
              </h3>

              <div className="space-y-4">

        {/* Row 1: Tipo de garantia + Origem */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="gar-tipo"
              className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
            >
              Tipo de garantia{" "}
              <span aria-hidden="true" className="text-(--color-danger)">
                *
              </span>
            </label>
            <Select
              id="gar-tipo"
              value={garFields.tipo}
              onChange={(v) => {
                const nextTipo = v as TipoGarantia | '';
                setGarFields((f) => ({ ...f, tipo: nextTipo, categoria: '' }));
                // Reset fiadores list when switching between types that require/don't require them
                if (!nextTipo || !exigeFiador(nextTipo)) {
                  setFiadores([{ ...FIADOR_EMPTY }]);
                }
                // Descarta a minuta da fiança ao sair de FIANCA_BANCARIA — é o
                // único tipo que a pede, e mantê-la escolhida faria o anexo
                // subir vinculado a uma garantia que não o admite.
                if (nextTipo !== TIPO_GARANTIA.FIANCA_BANCARIA) {
                  setMinutaFiancaState({ status: 'idle' });
                }
              }}
              options={TIPO_GARANTIA_OPTIONS}
              placeholder="Selecione..."
              disabled={isSaving}
              variant="boxed"
            />
          </div>

          <div>
            <label
              htmlFor="gar-origem"
              className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
            >
              Garantia existente × nova{" "}
              <span aria-hidden="true" className="text-(--color-danger)">
                *
              </span>
            </label>
            <Select
              id="gar-origem"
              value={garFields.origem}
              onChange={(v) =>
                setGarFields((f) => ({
                  ...f,
                  origem: v as OrigemGarantia,
                  sapGarantiaExternaId: '',
                }))
              }
              options={ORIGEM_GARANTIA_OPTIONS}
              disabled={isSaving}
              variant="boxed"
            />
          </div>
        </div>

        {/* O rito do Comitê de Crédito na fiança SEM LASTRO (03/09/2026).

            Abaixo da LINHA do tipo, não dentro da célula: a grid é de duas
            colunas e o aviso ali sairia estreito, com o "Garantia existente ×
            nova" ao lado. É o "abaixo do tipo de garantia" que o negócio pediu.

            Esta caixa nunca existiu neste formulário — ela vivia só no card da
            01b. Entra aqui porque desde 02/09/2026 as duas telas são o MESMO
            formulário: um disclaimer em uma e não na outra é a divergência por
            cópia que o FL-01 já custou uma vez. */}
        {garTipo === TIPO_GARANTIA.FIANCA_SEM_LASTRO && (
          <AvisoGarantia testId="aviso-fianca-sem-lastro">
            {AVISO_FIANCA_SEM_LASTRO}
          </AvisoGarantia>
        )}

        {/*
         * Utilização — o que esta garantia lastreia.
         *
         * O card inline da 01b pergunta desde ADO 67858; este formulário não,
         * e a diferença era um beco sem saída: `garantia:indicar` move o
         * subprocesso para `EM_ANALISE_PREVIA`, o que FECHA o card, então a
         * garantia ficava com utilização vazia sem correção possível — e o
         * Salesforce recusa a sincronização da cotação (e portanto a alçada
         * inteira) quando há mútuo/antecipação sem uma garantia de "Concessão
         * Financeira". Mesmo controle, mesma picklist, mesmo "Nenhum" como
         * ausência.
         */}
        <div>
          <label
            htmlFor="gar-utilizacao"
            className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Utilização
          </label>
          <PicklistSelect
            id="gar-utilizacao"
            data-testid="gar-utilizacao"
            field={PicklistField.GarantiaUtilizacao}
            value={garFields.utilizacao}
            onChange={(v) => setGarFields((f) => ({ ...f, utilizacao: v }))}
            placeholder="Selecione..."
            emptyOptionLabel="Nenhum"
            disabled={isSaving}
          />
        </div>

        {/* Garantia existente seletor (quando origem = EXISTENTE) */}
        {needsExistente && (
          <div>
            <label
              htmlFor="gar-existente"
              className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
            >
              Garantia existente no SAP{" "}
              <span aria-hidden="true" className="text-(--color-danger)">
                *
              </span>
            </label>
            {existentesStatus === 'loading' && (
              <p className="text-(length:--t-caption) text-(--color-text-muted) animate-pulse">
                Consultando garantias no SAP…
              </p>
            )}
            {existentesStatus === 'lacuna' && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-[var(--radius-xs)] border border-(--color-info) bg-(--color-info-bg) px-3 py-2 text-(length:--t-caption) text-(--color-info)"
              >
                <InfoIcon className="size-4 shrink-0" />
                <span>
                  Aguardando integração SAP — a consulta de garantias existentes
                  estará disponível em breve.
                </span>
              </div>
            )}
            {existentesStatus === 'error' && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-[var(--radius-xs)] border border-(--color-danger) bg-(--color-danger-bg) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
              >
                <span>
                  {existentesError ||
                    "Erro ao carregar as garantias existentes."}
                </span>
                <button
                  type="button"
                  onClick={() => setExistentesStatus('idle')}
                  className="ml-auto shrink-0 underline"
                >
                  Tentar novamente
                </button>
              </div>
            )}
            {existentesStatus === 'loaded' && (
              <>
                {existentes.length === 0 ? (
                  <p className="text-(length:--t-caption) text-(--color-text-muted)">
                    Nenhuma garantia cadastrada para o cliente desta
                    oportunidade.
                  </p>
                ) : (
                  <Select
                    id="gar-existente"
                    value={garFields.sapGarantiaExternaId}
                    onChange={(v) =>
                      setGarFields((f) => ({ ...f, sapGarantiaExternaId: v }))
                    }
                    options={existentes.map((g) => ({
                      value: g.sapId,
                      // Rótulo composto no cliente (tipo + valor avaliado): a
                      // fonte não carrega descrição do bem, e o antigo
                      // `${descricao} — ${tipoLabel}` leria " — undefined".
                      label: garantiaExistenteLabel(g),
                    }))}
                    placeholder="Selecione a garantia…"
                    disabled={isSaving}
                    variant="boxed"
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Imóvel fields (quando exigeImovel && origem === NOVA) */}
        {needsImóvel && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="gar-imovel-endereco"
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Endereço do imóvel{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <input
                id="gar-imovel-endereco"
                type="text"
                value={garFields.imovelEndereco}
                onChange={(e) =>
                  setGarFields((f) => ({
                    ...f,
                    imovelEndereco: e.target.value,
                  }))
                }
                disabled={isSaving}
                placeholder="Ex.: Av. Paulista, 1000"
                className={fieldClass}
              />
            </div>

            {/* HIP-01/HIP-03 — as matrículas, um BLOCO FECHADO por registro
                (número + a certidão de inteiro teor DAQUELA matrícula). O número
                multiplica com a quantidade; endereço, cidade, UF e categoria não.
                Componente compartilhado com o card da 01b. */}
            <div className="sm:col-span-2">
              <MatriculasBlocos
                blocos={garFields.matriculas}
                onChange={(matriculas) =>
                  setGarFields((f) => ({ ...f, matriculas }))
                }
                disabled={isSaving}
                idPrefix="tk-gar"
                // O MESMO estilo dos demais campos DESTE formulário — que não é
                // o do card (ADO · 02/09/2026).
                inputClassName={fieldClass}
              />
            </div>

            <div>
              <label
                htmlFor="gar-cidade"
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Cidade{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <input
                id="gar-cidade"
                type="text"
                value={garFields.imovelCidade}
                onChange={(e) =>
                  setGarFields((f) => ({ ...f, imovelCidade: e.target.value }))
                }
                disabled={isSaving}
                placeholder="Ex.: São Paulo"
                className={fieldClass}
              />
            </div>

            <div>
              <label
                htmlFor="gar-uf"
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Estado (UF){" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <input
                id="gar-uf"
                type="text"
                value={garFields.imovelUf}
                onChange={(e) =>
                  setGarFields((f) => ({
                    ...f,
                    imovelUf: e.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                disabled={isSaving}
                placeholder="SP"
                maxLength={2}
                className={fieldClass}
              />
            </div>
          </div>
        )}

        {/* Categoria — grupo "Imóvel / bem" (exigeImovel) */}
        {needsBem && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="gar-categoria"
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Categoria{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <Select
                id="gar-categoria"
                value={garFields.categoria}
                onChange={(v) =>
                  setGarFields((f) => ({
                    ...f,
                    categoria: v as CategoriaBem | "",
                  }))
                }
                options={CATEGORIA_GARANTIA_OPTIONS}
                placeholder="Selecione..."
                disabled={isSaving}
                variant="boxed"
              />
            </div>

            {/* HIP-02 — os laudos, um BLOCO por laudo (01/09/2026). O campo
                numérico "Quantidade de laudos" saiu: ele declarava 3 e o
                formulário tinha onde anexar 1. A quantidade agora é a contagem de
                blocos, e cada bloco tem o anexo dele. */}
            <div className="sm:col-span-2">
              <LaudosBlocos
                blocos={garFields.laudos}
                onChange={(laudos) => setGarFields((f) => ({ ...f, laudos }))}
                disabled={isSaving}
                idPrefix="tk-gar"
              />
            </div>
          </div>
        )}

        {/* Valor — `Valor_Avaliado__c`, rotulado "Valor" no org.

            ADO 68002: FORA do grupo "Imóvel / bem" e obrigatório em TODO tipo,
            como já era no card da 01b desde o ADO 67858. Enquanto vivia dentro
            de `needsBem`, o campo nem era renderizado numa fiança bancária — em
            que o valor é o da carta do banco —, e o payload o descartava: o org
            recebia `Valor_Avaliado__c` nulo e recusava a sincronização da
            cotação em silêncio (VR ativa `Valor_Proposto_Obrigatorio`). Era
            também o que fazia a trava da Concessão Financeira preencher um campo
            invisível que nunca viajava.

            O campo é DIGITÁVEL em toda utilização (decisão do negócio,
            02/09/2026 — reverte o ADO 68003): sem trava e sem preenchimento
            automático a partir das concessões financeiras. */}
        <div>
          <label
            htmlFor="gar-valor"
            className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Valor{" "}
            <span aria-hidden="true" className="text-(--color-danger)">
              *
            </span>
          </label>
          {/* Money mask (pt-BR, cents) — same pattern as every other money field. */}
          <input
            id="gar-valor"
            type="text"
            inputMode="numeric"
            value={garFields.valorAvaliadoBRL}
            onChange={(e) =>
              setGarFields((f) => ({
                ...f,
                valorAvaliadoBRL: maskMoneyInput(e.target.value),
              }))
            }
            disabled={isSaving}
            placeholder="R$ 1.200.000,00"
            className={fieldClass}
          />
        </div>

        {/* Fiadores (quando exigeFiador) */}
        {needsFiador && (
          <div className="space-y-2">
            {/* FL-01 — quem são os fiadores numa fiança COM lastro. Some nas
                outras duas: na bancária o garantidor é o banco, e na sem lastro não
                há imóvel a que a frase se refira. */}
            {garTipo === TIPO_GARANTIA.FIANCA_COM_LASTRO && (
              <AvisoGarantia testId="aviso-fianca-com-lastro">
                {AVISO_FIANCA_COM_LASTRO}
              </AvisoGarantia>
            )}
            <div className="flex items-center justify-between">
              <p className="text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
                {garTipo === TIPO_GARANTIA.FIANCA_BANCARIA
                  ? "Banco"
                  : "Fiadores"}{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </p>
            </div>
            <FiadoresRepetidor
              fiadores={fiadores}
              onChange={setFiadores}
              disabled={isSaving}
              ehBanco={garTipo === TIPO_GARANTIA.FIANCA_BANCARIA}
              inputClassName={fieldClass}
            />
          </div>
        )}

        {/* Minuta do Contrato de Fiança Bancária — o ÚNICO obrigatório da
            bancária desde 02/09/2026, no lugar do estatuto do banco, que foi
            retirado. Sobe pela rota TIPADA, como os demais anexos de garantia.

            `.doc`/`.docx` além do PDF: o instrumento circula em Word até ser
            assinado, e a parametrização (`pdf,word`) aceita os dois. */}
        {needsMinutaFianca && (
          <div className="space-y-1">
            <p className="text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
              Minuta do contrato{' '}
              <span aria-hidden="true" className="text-(--color-danger)">
                *
              </span>
            </p>
            <FileAttachWidget
              label="Minuta do Contrato de Fiança Bancária"
              required
              uploadState={minutaFiancaState}
              disabled={isSaving}
              accept={ACEITOS_DOCUMENTO_GARANTIA}
              testId="minuta-fianca-upload"
              onFile={(file) =>
                handleGarantiaUpload(
                  file,
                  MINUTA_FIANCA_DOC_ID,
                  setMinutaFiancaState,
                )
              }
              onRetry={() => setMinutaFiancaState({ status: 'idle' })}
            />
          </div>
        )}

        {/*
          A certidão de inteiro teor e o laudo tinham um `FileAttachWidget` FIXO
          cada e saíram daqui em 01/09/2026: cada um deles é N por garantia, e
          agora sobe dentro do bloco da matrícula (HIP-03) e do bloco do laudo
          (HIP-02), acima. Um slot fixo aceita UM — com três matrículas, o gate
          cobrava três certidões e o formulário oferecia um anexo.

          O estatuto do banco CONTINUA com widget próprio: ele é um só por
          garantia, e não pertence a matrícula nenhuma.
        */}

        {/* GER-03 — a pergunta obrigatória, em TODOS os tipos de garantia.
            Pré-marcada em "Não": o padrão vive aqui, onde a pessoa o vê e pode
            contradizê-lo, nunca no DTO (que exige a resposta). */}
        <fieldset>
          <legend className="mb-1 text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
            {PERGUNTA_COMPARTILHAMENTO}{' '}
            <span aria-hidden="true" className="text-(--color-danger)">
              *
            </span>
          </legend>
          <div className="flex gap-4">
            {[
              { valor: false, rotulo: 'Não' },
              { valor: true, rotulo: 'Sim' },
            ].map((opcao) => (
              <label
                key={opcao.rotulo}
                className="flex items-center gap-1.5 text-(length:--t-caption)"
              >
                <input
                  type="radio"
                  name="gar-compartilhada"
                  checked={garFields.compartilhada === opcao.valor}
                  disabled={isSaving}
                  onChange={() =>
                    setGarFields((f) => ({
                      ...f,
                      compartilhada: opcao.valor,
                      // Limpa o detalhe ao voltar para "Não": ele não é aceito com
                      // essa resposta (400 no backend, CHECK no banco).
                      detalhesCompartilhamento: opcao.valor
                        ? f.detalhesCompartilhamento
                        : '',
                    }))
                  }
                />
                {opcao.rotulo}
              </label>
            ))}
          </div>

          {garFields.compartilhada && (
            <div className="mt-2.5">
              <label
                htmlFor="gar-compart-detalhes"
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Quais oportunidades / detalhes{' '}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <textarea
                id="gar-compart-detalhes"
                rows={2}
                value={garFields.detalhesCompartilhamento}
                onChange={(e) =>
                  setGarFields((f) => ({
                    ...f,
                    detalhesCompartilhamento: e.target.value,
                  }))
                }
                disabled={isSaving}
                placeholder="Ex.: OPP-2026-000010 e OPP-2026-000031"
                className={fieldClass}
              />
            </div>
          )}
        </fieldset>

        {/*
          GER-01 — "Documentos complementares", a MESMA área do card da 01b.

          ⚠️ Não existia neste formulário (retest 03/09/2026), e a falta era
          funcional, não cosmética: o card fica somente leitura fora da fase de
          preenchimento (`indicacaoMutavel`), então durante a ANÁLISE — que é
          exatamente quando esta pendência vive — não havia nenhuma superfície
          capaz de anexar documento complementar a uma garantia.

          Sem gate de tipo, de propósito: a área vale para todas as modalidades.
          Só as escolhas PENDENTES são listadas — no ticket a garantia ainda não
          existe (o lote sobe no submit), então não há anexado a exibir.
        */}
        <div data-testid="gar-complementares">
          <span className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
            Documentos complementares
          </span>
          <p className="mb-2 text-(length:--t-small) text-(--color-text-muted)">
            Opcional, e válido para qualquer tipo de garantia. As exigências por
            banco e por bem estão no{' '}
            <DocumentoSuporteCcob opportunityId={oportunidadeId} variant="link" />.
          </p>

          {/*
            Os JÁ ANEXADOS — somente leitura, com link. Sem eles o LT não via o
            que a garantia tem ao editá-la, e reanexar duplicaria: o tipo é
            `single: false`, então cada arquivo é um documento a mais.

            Sem "✕": o ticket não oferece remover documento de garantia em lugar
            nenhum, e o botão prometeria uma ação que não existe. Mesma decisão
            (e mesmo desenho) do card da 01b.
          */}
          {complementaresAnexados.length > 0 && (
            <ul
              data-testid="gar-complementares-anexados"
              className="mb-2 list-none space-y-1.5 p-0"
            >
              {complementaresAnexados.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3 py-2 text-(length:--t-caption)"
                >
                  <a
                    href={urlDeMidiaSegura(doc.url) ?? undefined}
                    download={nomeDeArquivoSeguro(doc.fileName) ?? true}
                    className="min-w-0 truncate font-bold text-(--secondary-600) hover:underline"
                  >
                    {doc.fileName || doc.type}
                  </a>
                  <span className="shrink-0 text-(--color-text-muted)">Anexado</span>
                </li>
              ))}
            </ul>
          )}

          {garFields.complementares.length > 0 && (
            <ul className="mb-2 list-none space-y-1.5 p-0">
              {garFields.complementares.map((arquivo, i) => (
                <li
                  key={`${arquivo.name}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption)"
                >
                  <span className="min-w-0 truncate">{arquivo.name}</span>
                  {/* Remoção da ESCOLHA, não do documento: o arquivo ainda não
                      subiu. Sem isto, escolher o arquivo errado obrigaria a
                      refazer o formulário inteiro. */}
                  <button
                    type="button"
                    aria-label={`Remover ${arquivo.name}`}
                    disabled={isSaving}
                    onClick={() =>
                      setGarFields((f) => ({
                        ...f,
                        complementares: f.complementares.filter((_, j) => j !== i),
                      }))
                    }
                    className="shrink-0 px-1 text-(--color-text-muted) hover:text-(--color-danger) disabled:opacity-50"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className={`${SECONDARY_OUTLINE_BTN} inline-flex cursor-pointer`}>
            + Adicionar documento
            <input
              type="file"
              /* `multiple`: é uma área, e escolher vários de uma vez é o gesto
                 natural. O `accept` é o da área complementar — o único slot de
                 garantia que aceita planilha. */
              accept={ACEITOS_DOCUMENTO_COMPLEMENTAR}
              multiple
              disabled={isSaving}
              className="sr-only"
              onChange={(e) => {
                const escolhidos = Array.from(e.target.files ?? []);
                if (escolhidos.length > 0) {
                  setGarFields((f) => ({
                    ...f,
                    complementares: [...f.complementares, ...escolhidos],
                  }));
                }
                // Reescolher o MESMO arquivo depois de um erro não dispara
                // `change` sem isto.
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* Observações */}
        <div>
          <label
            htmlFor="gar-obs"
            className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Observações
          </label>
          <textarea
            id="gar-obs"
            rows={3}
            value={garFields.observacoes}
            onChange={(e) =>
              setGarFields((f) => ({ ...f, observacoes: e.target.value }))
            }
            disabled={isSaving}
            placeholder="Ex.: outras oportunidades que utilizarão a mesma garantia..."
            className="w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit] placeholder:text-(--color-text-muted) focus:outline-none focus:ring-2 focus:ring-(--secondary-500) disabled:opacity-50"
          />
        </div>

              </div>

              {/*
                Por que o "Salvar" está cinza — dentro do modal, ao lado do botão,
                e não na página: é aqui que estão os campos que faltam.
              */}
              {!garCanSubmit && (
                <p
                  data-testid="garantia-missing"
                  className="mt-3 text-(length:--t-caption) text-(--color-text-muted)"
                >
                  {garUploading
                    ? 'Aguarde o envio do arquivo terminar.'
                    : `Falta preencher: ${garMissing.join(', ')}.`}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={fecharModalGarantia}
                  className="rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-white px-3 py-1.5 text-(length:--t-caption) font-bold text-(--color-text) hover:bg-(--neutral-40)"
                >
                  Cancelar
                </button>
                {/*
                  ⚠️ "Salvar" aqui NÃO vai ao backend: guarda a garantia no lote e
                  fecha o modal. É o que permite cadastrar N na mesma pendência —
                  ver o comentário da lista acima.
                */}
                <button
                  type="button"
                  data-testid="gar-salvar-no-lote"
                  disabled={!garCanSubmit}
                  onClick={salvarGarantiaNoLote}
                  className="rounded-[var(--radius-xxs)] bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {garEditando ? 'Salvar garantia' : 'Adicionar garantia'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Upload (documento) / Marcar como resolvida -------------------------

  // Same rule the garantia branch above already applies: a profile that cannot
  // write gets a read hint, never the controls. The dropzone was live and the
  // "Anexar e resolver" permanently disabled — a dead control sitting directly
  // under the sentence saying this profile does not attach files. Hiding it is
  // UX; the backend 403 (`ReadOnlyProfileGuard`) stays the guarantee.
  /*
   * ADO 68190 — a pendência é de OUTRA ÁREA.
   *
   * `resolucaoPermitida` é o veredito do backend, o MESMO que a linha da lista
   * lê (`podeResolverPendencia`) e o mesmo que `POST .../resolver` aplica com
   * 403. Sem ele o ticket ainda oferecia "Marcar como resolvida" a quem a lista
   * já mandava só "Abrir" — e o clique, na base medida, DE FATO encerrava a
   * cobrança da Integridade (é o print do ticket, com "Michelle · SNEG ·
   * Resolvida manualmente" no histórico de uma pendência do Time de Franquias).
   *
   * Ausente ⇒ oferece (backend anterior ao campo): esconder por leitura
   * incompleta tiraria o controle de quem de fato o tem.
   */
  const naoEhDoLeitor = pendencia.resolucaoPermitida === false;

  if (naoEhDoLeitor || !canWrite || (isUpload && !podeAnexar)) {
    return (
      <div
        role="status"
        aria-label="Resolução restrita ao responsável"
        className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--color-info) bg-(--color-info-bg) px-4 py-3 text-(length:--t-caption) text-(--color-info)"
      >
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p data-testid="resolucao-restrita">
          {naoEhDoLeitor
            ? /* Nomeia a ÁREA dona, que é a informação acionável (a quem
                 pedir) — a mesma que a recusa da API devolve. Os dois campos já
                 vêm em pt-BR do backend; a tela NÃO traduz.

                 ⚠️ `responsavel` é a reserva porque as linhas legadas de
                 `ddi:parecer` têm `area = NULL` e carregam a área só no token
                 de caixa do responsável — nelas o cabeçalho já lê
                 "Responsável: Integridade" e "Área responsável: —", e sem a
                 reserva a frase saía genérica ("da área responsável") ao lado
                 do nome que ela deveria ter dito. São justamente as linhas do
                 print do ticket. */
              `A resolução desta pendência é da área ${
                pendencia.areaResponsavel ?? pendencia.responsavel ?? 'responsável'
              }. Seu perfil acompanha o andamento, comenta no ticket e vê os anexos.`
            : isUpload && canWrite
              ? /* Names WHO attaches, instead of "the responsible area": the
                   phase may well be this profile's (Minuta is the SNEG's) while
                   the blocking pendência is the LT's, and the old sentence left
                   the analyst waiting without knowing on whom. */
                'O anexo deste documento é feito pelo LT (ou pela SNEG e pelas equipes de expansão/franquias). Seu perfil acompanha o andamento e os anexos.'
              : 'A resolução desta pendência é feita pela área responsável. Seu perfil acompanha o andamento e os anexos.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {confirm.dialog}
      {isUpload ? (
        <>
          <div
            role="region"
            aria-label="Área de upload de documento"
            data-testid="dropzone"
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed p-[22px] text-center transition-colors ${
              dragActive
                ? 'border-(--secondary-500) bg-(--color-info-bg)'
                : 'border-(--color-border) bg-(--neutral-25) hover:border-(--secondary-500)'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <DocumentIcon className="size-8 text-(--neutral-400)" />
            {fileInfo ? (
              <div className="space-y-1">
                <p className="font-bold text-(--color-text)">{fileInfo.name}</p>
                <p className="text-(length:--t-small) text-(--color-text-muted)">
                  Clique para trocar o arquivo
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-bold text-(--color-text)">
                  Arraste o documento aqui ou clique para selecionar
                </p>
                <p className="text-(length:--t-small) text-(--color-text-muted)">
                  PDF, PNG, JPG — máx. 20 MB
                </p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Selecionar documento"
            accept=".pdf,.png,.jpg,.jpeg"
            className="sr-only"
            onChange={handleInputChange}
          />

          {fileUploadStatus === 'uploading' && (
            <p
              className="text-(length:--t-small) text-(--color-text-muted) animate-pulse"
              role="status"
            >
              Enviando arquivo…
            </p>
          )}

          {fileUploadStatus === 'error' && (
            <div className="space-y-1.5" role="alert">
              <p className="text-(length:--t-small) text-(--color-danger)">
                {fileUploadError}
              </p>
              {/* The selection survives the failure, so the retry is one click
                  instead of "find that file again" (VBR-633). */}
              {pendingFile && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-(length:--t-small) text-(--color-text-muted)">
                    {pendingFile.name}
                  </span>
                  <button
                    type="button"
                    data-testid="upload-retry"
                    onClick={() => void handleFile(pendingFile)}
                    className="rounded-[var(--radius-xxs)] border border-(--secondary-500) px-3 py-1 text-(length:--t-small) font-bold text-(--secondary-500) hover:bg-(--neutral-40)"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>
          )}

          {actionError && (
            <p
              className="text-(length:--t-small) text-(--color-danger)"
              role="alert"
            >
              {actionError}
            </p>
          )}

          {!ENABLE_PENDENCIA_FILE_UPLOAD && (
            <p
              className="text-(length:--t-small) text-(--color-text-muted)"
              role="note"
            >
              Upload ao serviço de arquivos ainda não disponível — integração em
              andamento.
            </p>
          )}

          <button
            type="button"
            disabled={
              !fileInfo ||
              isSaving ||
              fileUploadStatus === 'uploading' ||
              fileUploadStatus === 'error' ||
              !ENABLE_PENDENCIA_FILE_UPLOAD
            }
            title={
              !ENABLE_PENDENCIA_FILE_UPLOAD
                ? 'Upload indisponível — integração em andamento'
                : undefined
            }
            onClick={handleSubmitUpload}
            className={PRIMARY_ACTION_BTN}
          >
            {isSaving ? 'Enviando…' : 'Anexar e resolver'}
          </button>
        </>
      ) : (
        <>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Confirme que a pendência foi tratada para marcá-la como resolvida.
          </p>

          {actionError && (
            <p
              className="text-(length:--t-small) text-(--color-danger)"
              role="alert"
            >
              {actionError}
            </p>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={handleMarkResolved}
            className={PRIMARY_ACTION_BTN}
          >
            {isSaving ? 'Salvando…' : 'Marcar como resolvida'}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment compose
// ---------------------------------------------------------------------------

function CommentCompose({
  onSend,
  disabled,
  pendenciaId,
  uploadAnexoFn,
}: {
  onSend: (payload: {
    texto: string;
    anexoId?: string;
    anexoNome?: string;
  }) => void;
  disabled: boolean;
  pendenciaId: string;
  /**
   * Thread attachment — its OWN endpoint, not the opportunity checklist. The
   * checklist upload is gated to the profiles that own it, so the people who
   * actually converse here (Integridade pedindo uma certidão, a CCOB
   * respondendo) got a 403 rendered as "Falha ao executar a ação".
   */
  uploadAnexoFn: (
    pendenciaId: string,
    file: File,
  ) => Promise<{ anexoId: string; anexoNome: string }>;
}) {
  const [texto, setTexto] = useState('');
  const [anexo, setAnexo] = useState<{ id: string; nome: string } | null>(null);
  const [anexoStatus, setAnexoStatus] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [anexoError, setAnexoError] = useState("");
  /**
   * `true` when the upload error is a permanent domain/validation failure
   * (HTTP 4xx — `ApiValidationError`). In that case the "selecione o arquivo
   * novamente para tentar" affordance is suppressed because retrying the same
   * file against the same pendência will always fail (CA-3).
   */
  const [anexoErrorPermanent, setAnexoErrorPermanent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const podeAnexar = ENABLE_PENDENCIA_FILE_UPLOAD;

  async function handleFile(file: File) {
    setAnexoStatus('uploading');
    setAnexoError('');
    setAnexoErrorPermanent(false);
    setAnexo(null);
    try {
      const { anexoId, anexoNome } = await uploadAnexoFn(pendenciaId, file);
      setAnexo({ id: anexoId, nome: anexoNome });
      setAnexoStatus('idle');
    } catch (err) {
      // `anexo` stays null: the compose box must not look "attached" on error,
      // or the comment goes out claiming a file that was never stored.
      setAnexoError(
        err instanceof Error ? err.message : "Erro ao enviar o arquivo.",
      );
      // Distinguish permanent domain failures (4xx) from transient ones (5xx /
      // network). For permanent errors the user cannot fix by re-selecting the
      // same file — suppress the retry prompt (CA-3).
      setAnexoErrorPermanent(err instanceof ApiValidationError);
      setAnexoStatus('error');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = texto.trim();
    if (!trimmed) return;
    onSend(
      anexo
        ? { texto: trimmed, anexoId: anexo.id, anexoNome: anexo.nome }
        : { texto: trimmed },
    );
    setTexto('');
    setAnexo(null);
    setAnexoStatus('idle');
    setAnexoError('');
    setAnexoErrorPermanent(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <label htmlFor="comment-textarea" className="sr-only">
        Adicionar comentário
      </label>
      <textarea
        id="comment-textarea"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva um comentário para as áreas envolvidas..."
        rows={3}
        disabled={disabled}
        className="w-full rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-3 text-(length:--t-body) placeholder:text-(--color-text-muted) focus:outline-none focus:ring-2 focus:ring-(--secondary-500) disabled:opacity-50"
      />

      {anexoError && (
        <p
          className="text-(length:--t-small) text-(--color-danger)"
          role="alert"
        >
          {anexoError}
          {/* Permanent domain/validation errors (4xx) never succeed on retry —
              omit the "try again" cue so the user does not waste time (CA-3). */}
          {!anexoErrorPermanent &&
            " — selecione o arquivo novamente para tentar."}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {podeAnexar && (
            <>
              <button
                type="button"
                disabled={disabled || anexoStatus === 'uploading'}
                onClick={() => inputRef.current?.click()}
                className={SECONDARY_OUTLINE_BTN}
              >
                <AttachmentIcon className="size-4" />
                {anexoStatus === 'uploading' ? 'Enviando…' : 'Anexar arquivo'}
              </button>
              <input
                ref={inputRef}
                type="file"
                aria-label="Anexar arquivo ao comentário"
                accept=".pdf,.png,.jpg,.jpeg"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </>
          )}
          {anexo && (
            <span className="truncate text-(length:--t-small) text-(--color-text-muted)">
              {anexo.nome}
              <button
                type="button"
                onClick={() => setAnexo(null)}
                className="ml-2 underline"
              >
                remover
              </button>
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!texto.trim() || disabled || anexoStatus === 'uploading'}
          className={`${PRIMARY_ACTION_BTN} shrink-0`}
        >
          Enviar comentário
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * `reclassifyDdi` still carries the legacy `_userRoles` argument (unused —
 * enforcement is server-side). Adapting it here keeps that historical parameter
 * out of the prop type every caller and test would otherwise have to satisfy.
 */
function defaultEmitirParecer(
  opportunityId: string,
  payload: DdiReclassifyPayload,
): Promise<DdiResult> {
  return reclassifyDdi(opportunityId, payload, []);
}

/**
 * Pendency ticket screen — F3 (12a-pendencia-ticket.html).
 *
 * Covers HU-F3-02 (history/comments/status/reassign), HU-F3-03
 * (notification link opens the correct ticket), and GAR-F1 (garantia
 * indication form — acaoResolucao === 'garantia').
 */
export function PendenciaTicket({
  pendenciaId,
  currentUserId = null,
  load = getPendenciaDetalhe,
  comentar = adicionarComentario,
  resolver = resolverPendencia,
  indicar = indicarGarantia,
  anexarDoc = anexarDocumentoGarantia,
  carregarGarantias = loadGarantiasIndicadas,
  carregarGarantiaView = getGarantia,
  atualizarGarantia = atualizarGarantiaIndicadaDoTicket,
  reconciliarGarantia = reconciliarGarantiaCliente,
  removerGarantia = deleteGarantiaIndicada,
  carregarExistentes = getGarantiasExistentes,
  uploadDoc = attachDoc,
  uploadAnexo = uploadPendenciaAnexo,
  listarAnexos = listPendenciaAnexos,
  carregarDdi = getDdiResult,
  emitirParecer = defaultEmitirParecer,
  solicitarDocumento = requestDdiDocument,
  solicitarRevisao = solicitarRevisaoDdi,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { canWrite, can } = usePermissions();
  /** Confirmation for the state-changing controls of this screen. */
  const ticketConfirm = useConfirm();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [pendencia, setPendencia] = useState<PendenciaDetalhe | null>(null);

  const [actionStatus, setActionStatus] = useState<ActionStatus>('idle');
  const [actionError, setActionError] = useState('');
  const [commentStatus, setCommentStatus] = useState<ActionStatus>('idle');
  const [commentError, setCommentError] = useState('');

  // Anexos panel — CA-1: all files accessible without scrolling the thread.
  const [anexosStatus, setAnexosStatus] = useState<AnexoLoadStatus>('loading');
  const [anexos, setAnexos] = useState<PendenciaAnexo[]>([]);
  const [anexosError, setAnexosError] = useState('');

  // ---- Load -----------------------------------------------------------

  const doLoad = useCallback(async () => {
    setLoadStatus('loading');
    setLoadError('');
    setAnexosStatus('loading');
    setAnexosError('');
    try {
      // Load ticket detail and attachment index in parallel (CA-1).
      // A store hiccup must not block the main ticket render (CA-5):
      // the attachment load errors independently.
      const [data, items] = await Promise.all([
        load(pendenciaId),
        listarAnexos(pendenciaId).catch((err: unknown) => {
          setAnexosError(
            err instanceof Error ? err.message : "Erro ao carregar os anexos.",
          );
          setAnexosStatus("error");
          return null as PendenciaAnexo[] | null;
        }),
      ]);
      setPendencia(data);
      setLoadStatus('loaded');
      if (items !== null) {
        setAnexos(items);
        setAnexosStatus('loaded');
      }
    } catch (err) {
      if (err instanceof PendenciaNotFoundError) {
        setLoadStatus('not-found');
      } else {
        setLoadError(err instanceof Error ? err.message : 'Erro desconhecido.');
        setLoadStatus('error');
      }
      setAnexosStatus('error');
    }
  }, [load, listarAnexos, pendenciaId]);

  /**
   * Quietly re-fetches only the attachment index without touching the main
   * ticket loading state — avoids blanking the screen (CA-4 VBR-536).
   * Called after a comment is posted so that a newly-uploaded file appears
   * in the Anexos panel immediately (CA-3 VBR-536).
   */
  const doLoadAnexosQuiet = useCallback(async () => {
    try {
      const items = await listarAnexos(pendenciaId);
      setAnexos(items);
      setAnexosStatus('loaded');
    } catch {
      // Silent failure: the panel keeps its last state and the user can reload.
    }
  }, [listarAnexos, pendenciaId]);

  useEffect(() => {
    void doLoad();
  }, [doLoad]);

  // ---- Resolve --------------------------------------------------------

  const handleResolver = useCallback(
    async (payload: ResolverPendenciaPayload) => {
      /*
       * Read-only profile: the API answers 403, and a form still submits on Enter
       * even with the button hidden — so the guard lives in the handler too.
       */
      if (!canWrite) return;
      if (!pendencia) return;
      setActionStatus('saving');
      setActionError('');
      try {
        const updated = await resolver(pendencia.id, payload);
        setPendencia(updated);
        setActionStatus('idle');
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Erro ao resolver.",
        );
        setActionStatus("error");
      }
    },
    [pendencia, resolver, canWrite],
  );

  // ---- Indicar garantia -----------------------------------------------

  const handleIndicar = useCallback(
    async (rascunho: RascunhoDeGarantias) => {
      /*
       * GarantiaIndicar permission guard: the form submits on Enter even with the
       * button hidden for unpermissioned profiles — the guard must live here too,
       * not only in the button's `disabled` attribute (write-controls.test.tsx
       * enforces this pattern).
       */
      const NADA_APLICADO: RascunhoAplicado = { novas: [], edicoes: [], exclusoes: [] };
      if (!canWrite || !can(Permission.GarantiaIndicar)) return NADA_APLICADO;
      if (!pendencia?.oportunidadeId) return NADA_APLICADO;
      const oportunidadeId = pendencia.oportunidadeId;
      setActionStatus('saving');
      setActionError('');

      /*
       * ---- A ORDEM É A REGRA: editar → excluir → criar → ANEXAR → RECONCILIAR
       *
       * Quem promove o subprocesso é `GarantiaSubprocessoService.reconciliar`,
       * que o backend chama **a cada anexo** — e a promoção auto-resolve a
       * pendência, fechando a janela de `indicacaoMutavel`. Depois do primeiro
       * anexo, portanto, `indicar`, `PATCH` e `DELETE` são todos recusados. Por
       * isso TUDO o que não é anexo acontece antes do primeiro.
       *
       * ⚠️ A CRIAÇÃO vem DEPOIS das mutações sobre o que já existe, e não antes:
       * `garantia:indicar` também promove o subprocesso e auto-resolve a
       * pendência, então criar primeiro fecha a janela e faz o `PATCH`/`DELETE`
       * seguintes voltarem 409, com o rascunho pela metade. A primeira versão
       * desta ordem punha `criar` na frente e só o retest no stage mostrou o
       * erro — com as chamadas mockadas, o teste de ordem não podia acusar.
       * Dentro desse bloco a exclusão vem depois da edição: se algo falhar
       * antes, a garantia que a CCOB recusou ainda está lá — perdê-la e não
       * conseguir cadastrar a substituta seria o pior desfecho possível.
       *
       * Sequencial e não `Promise.all`: as três tocam o mesmo subprocesso 1:1, e
       * chamadas concorrentes disputariam a linha.
       *
       * ⚠️ **Falha no meio não desfaz o que passou** — não há transação. O que
       * mudou em 04/09/2026 é que o rascunho aplicado SAI da tela antes de o erro
       * subir: antes o lote ficava intacto, então a garantia já criada aparecia
       * duas vezes (na lista relida e no rascunho) e o retry a duplicava de
       * verdade. `PATCH` e `DELETE` são idempotentes, então repeti-los é seguro.
       */
      const anexosPendentes: Array<{
        indicacaoId: string;
        anexos: GarantiaEmLote["anexos"];
      }> = [];
      const novasAplicadas: GarantiaEmLote[] = [];
      const edicoesAplicadas: string[] = [];
      const exclusoesAplicadas: string[] = [];

      try {
        /*
         * ⚠️ As mutações sobre o que JÁ EXISTE vêm ANTES da criação, e isto não é
         * estilo: a janela de escrita de `/indicacoes` é
         * `escritaDeIndicacaoPermitida` — fase de preenchimento OU **pendência de
         * indicação aberta** —, e `garantia:indicar` promove o subprocesso e
         * AUTO-RESOLVE essa pendência. Criar primeiro fecharia a janela e faria
         * o `PATCH`/`DELETE` seguintes voltarem 409, com o rascunho pela metade.
         */
        for (const { indicacaoId, entrada } of rascunho.edicoes) {
          await atualizarGarantia(oportunidadeId, indicacaoId, entrada.payload);
          edicoesAplicadas.push(indicacaoId);
          if (entrada.anexos.length > 0) {
            anexosPendentes.push({ indicacaoId, anexos: entrada.anexos });
          }
        }

        /*
         * A exclusão depois das edições e antes da criação: se algo falhar, a
         * garantia que a CCOB recusou ainda está lá — perdê-la sem conseguir
         * cadastrar a substituta é o pior desfecho.
         */
        for (const indicacaoId of rascunho.exclusoes) {
          await removerGarantia(oportunidadeId, indicacaoId);
          exclusoesAplicadas.push(indicacaoId);
        }

        for (const nova of rascunho.novas) {
          const criada = await indicar(oportunidadeId, nova.payload);
          novasAplicadas.push(nova);
          if (nova.anexos.length > 0) {
            /*
             * Recusa aqui, e não na passada de anexos: sem o id não há a quem
             * anexar, e a frase manda ao card, que é o único lugar de onde se
             * anexa a uma garantia existente.
             */
            if (!criada.indicacaoId) {
              throw new Error(
                "A garantia foi registrada, mas não foi possível anexar os documentos. Recarregue a página e anexe pelo card de garantias.",
              );
            }
            anexosPendentes.push({
              indicacaoId: criada.indicacaoId,
              anexos: nova.anexos,
            });
          }
        }

        for (const { indicacaoId, anexos } of anexosPendentes) {
          for (const anexo of anexos) {
            await anexarDoc(
              oportunidadeId,
              indicacaoId,
              anexo.type,
              anexo.file,
              // HIP-03 — a posição da matrícula que a certidão lastreia. Ausente em
              // tudo que não pertence a uma (laudo, minuta, complementares).
              anexo.matriculaOrdem,
              anexo.fiadorOrdem,
            );
          }
        }

        /*
         * ⚠️ **O passo que FECHA a pendência**, e o único que a fecha quando a
         * mudança foi só uma EDIÇÃO: nem `PATCH` nem `DELETE` reconciliam, e sem
         * isto o ticket ficava aberto até o ciclo do worker, 60 s depois — o
         * defeito relatado no stage em 04/09/2026.
         *
         * UMA vez, no fim, nunca por operação: promover fecha a janela de
         * escrita, então reconciliar no meio faria a operação seguinte vir 409.
         * Idempotente — quando `indicar` ou um anexo já promoveu, é no-op.
         */
        try {
          await reconciliarGarantia(oportunidadeId);
        } catch {
          /*
           * ⚠️ Engolida DE PROPÓSITO, e pelo mesmo motivo que o backend engole a
           * dele: neste ponto as escritas do rascunho já foram aplicadas, e
           * propagar faria o LT ver "erro ao resolver" sobre garantias que foram
           * gravadas com sucesso — o pior dos dois mundos, porque ele tentaria
           * de novo. O worker promove no ciclo seguinte; o custo é a pendência
           * fechar até 60 s depois, não o trabalho se perder.
           */
        }

        // Reload the pendência to reflect the new resolved state and thread entry.
        await doLoad();
        setActionStatus('idle');
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Erro ao indicar a garantia.",
        );
        // Keep actionStatus as 'error' so the modal stays open and the user
        // can correct the issue — the form must NOT appear saved on error.
        setActionStatus('error');
      }

      /*
       * O que JÁ foi aplicado sai do rascunho — inclusive no erro. Sem isso a
       * releitura mostraria a garantia recém-criada na lista E no rascunho, e o
       * retry a criaria de novo.
       */
      return {
        novas: novasAplicadas,
        edicoes: edicoesAplicadas,
        exclusoes: exclusoesAplicadas,
      };
    },
    [pendencia, indicar, anexarDoc, canWrite, can, doLoad],
  );

  // ---- Comment --------------------------------------------------------

  const handleComentar = useCallback(
    async (payload: AdicionarComentarioPayload) => {
      if (!canWrite) return;
      if (!pendencia) return;
      setCommentStatus('saving');
      setCommentError('');
      try {
        const updated = await comentar(pendencia.id, payload);
        setPendencia(updated);
        setCommentStatus('idle');
        // Re-fetch the attachment index so any file uploaded with the comment
        // appears in the Anexos panel without a full-page reload (CA-3 VBR-536).
        // Quiet: does not touch loadStatus, so the screen never blanks (CA-4).
        void doLoadAnexosQuiet();
      } catch (err) {
        setCommentError(
          err instanceof Error ? err.message : "Erro ao comentar.",
        );
        setCommentStatus("error");
      }
    },
    [pendencia, comentar, canWrite, doLoadAnexosQuiet],
  );

  // ---- Reassign -------------------------------------------------------

  /*
   * Área de cada autor, vinda dos participantes: o evento do thread guarda
   * autor (id/nome), nunca lotação, e o protótipo escreve "Nome · ÁREA" no
   * cabeçalho de cada mensagem. Resolver aqui mantém a fonte única — a mesma
   * área que o card de participantes mostra.
   */
  const areaPorAutor = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of pendencia?.participantes ?? []) map.set(p.id, p.area);
    return map;
  }, [pendencia]);

  // ---- Render states --------------------------------------------------

  if (loadStatus === 'loading') {
    return (
      <div
        role="status"
        aria-label="Carregando pendência"
        className="flex items-center justify-center py-16 text-(--color-text-muted)"
      >
        <span className="animate-pulse text-(length:--t-h4)">
          Carregando pendência…
        </span>
      </div>
    );
  }

  if (loadStatus === 'not-found') {
    return (
      <div
        role="alert"
        className="mt-8 flex flex-col items-center gap-3 py-12 text-center"
      >
        <SearchIcon className="text-5xl text-(--neutral-400)" />
        <h2 className="text-(length:--t-h3) font-bold">
          Pendência não encontrada
        </h2>
        <p className="text-(--color-text-muted)">
          O ticket <span className="font-mono font-bold">{pendenciaId}</span>{" "}
          não foi encontrado ou você não tem acesso a ele.
        </p>
        <Link
          href="/pendencias"
          className="mt-2 inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white"
        >
          Voltar ao painel de pendências
        </Link>
      </div>
    );
  }

  if (loadStatus === 'error') {
    return (
      <div
        role="alert"
        className="mt-8 rounded-[var(--radius-md)] border border-(--color-danger-bg) bg-(--color-danger-bg) p-6 text-center"
      >
        <p className="mb-3 font-bold text-(--color-danger)">
          {loadError || 'Não foi possível carregar a pendência.'}
        </p>
        <button
          type="button"
          onClick={() => void doLoad()}
          className="rounded-[var(--radius-md)] border border-(--color-danger) px-4 py-2 text-(length:--t-caption) font-bold text-(--color-danger) hover:bg-(--color-danger-bg)"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!pendencia) return null;

  const isResolved = pendencia.status === 'resolvida';
  /** Whether the signed-in user may submit the garantia indication. */
  const canIndicar = canWrite && can(Permission.GarantiaIndicar);
  /**
   * Does this ticket hang off a DDI analysis? Read from the MACHINE origin
   * (`ddi:parecer`, `ddi:documento`, `ddi:decisao`), never from `origem`, which
   * is pt-BR prose the backend composes — matching on it would tie the screen to
   * wording. `acaoResolucao` is not enough either: the LT's document request
   * resolves as `upload`, and it is a DDI ticket all the same.
   */
  const isDdiPendencia = pendencia.origemCodigo?.startsWith('ddi:') ?? false;

  // ---- Full render (loaded) ------------------------------------------

  return (
    <div className="mx-auto max-w-(--grid-max) pb-12">
      {ticketConfirm.dialog}
      <div
        data-testid="ticket-head"
        className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-[22px] py-5"
      >
        {/*
          Prototype `.head .top`: status pill, code and — pushed to the right of
          the SAME row — the ghost button back to the opportunity. Ours was a
          muted text link floating ABOVE the card, which read as breadcrumb
          debris instead of the way out of the ticket.

          An orphan pendência (no opportunity) renders no button:
          `/oportunidades/null` is a 404 (CA-2, VBR-463).
        */}
        <div className="flex flex-wrap items-center gap-2.5 text-(length:--t-caption)">
          <StatusPill variant={STATUS_VARIANT[pendencia.status]}>
            {STATUS_LABEL[pendencia.status]}
          </StatusPill>
          <span className="font-mono text-(--color-text-muted)">
            {pendencia.codigo}
          </span>
          {pendencia.oportunidadeId && (
            <Link
              href={`/oportunidades/${pendencia.oportunidadeId}`}
              className={`${SECONDARY_OUTLINE_BTN} ml-auto`}
              data-testid="back-to-opportunity"
            >
              <span aria-hidden="true">←</span>
              Voltar à oportunidade
            </Link>
          )}
        </div>
        <h1 className="mb-0.5 mt-2 text-(length:--t-h3) font-bold">
          {pendencia.titulo}
        </h1>

        <div
          data-testid="ticket-meta"
          className="mt-4 flex flex-wrap gap-4 border-t border-(--color-border) pt-4 min-[961px]:gap-[30px]"
        >
          {/*
            Protótipo: `Posto Vibra Centro-SP · OPP-0428`. O rótulo sempre
            prometeu os dois e o campo entregava só o cliente, então o número da
            oportunidade — a informação com que o analista referencia o caso —
            não existia em tela nenhuma do ticket (ADO 67964). Composição pelo
            predicado único, compartilhado com a linha de meta do painel: duas
            implementações divergiriam justamente na pendência órfã.
          */}
          <DataField
            label="Cliente / OPP"
            value={clienteOppLine(
              pendencia.oportunidadeNome,
              pendencia.oportunidadeCodigo,
            )}
          />
          <DataField label="Fase" value={pendencia.fase} />
          <DataField label="Responsável" value={pendencia.responsavel} />
          <DataField
            label="Área responsável"
            value={pendencia.areaResponsavel}
          />
          <DataField
            label="Aberta em"
            value={pendencia.abertaEm ? formatDate(pendencia.abertaEm) : '—'}
          />
          <DataField
            label="Prazo (SLA)"
            value={pendencia.prazo ? formatDate(pendencia.prazo) : '—'}
          />
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-1 items-start gap-[22px] min-[961px]:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-4">
          {pendencia.descricao && (
            <Section title="O que foi solicitado">
              <p className="whitespace-pre-line text-(length:--t-body) text-(--color-text)">
                {pendencia.descricao}
              </p>
            </Section>
          )}

          {/*
           * DDI (F10) — the analysis this ticket exists because of, right under
           * the request that quotes it. It used to live on the opportunity
           * screen, where it was shown to everyone looking at the opportunity
           * and to nobody who had been asked for anything; the risk, the score,
           * the racional and the achados are what the assignee needs in order
           * to answer, so they belong next to the answer.
           *
           * Mounted for EVERY `ddi:*` origin, not only the parecer: the LT
           * asked for a document needs the finding that motivated it just as
           * much. `readOnly` keeps the panel's own "Reclassificar" out — that
           * write is the "Resolver pendência" form below.
           *
           * Own card chrome (no `Section` wrapper): the panel already renders
           * its "DDI · Integridade" header and its own loading/error states.
           */}
          {isDdiPendencia && pendencia.oportunidadeId && can(Permission.DdiView) && (
            <DdiPanel
              opportunityId={pendencia.oportunidadeId}
              readOnly
              load={carregarDdi}
            />
          )}

          <Section
            title={
              isResolved || pendencia.acaoResolucao === 'automatica'
                ? 'Resolução'
                : 'Resolver pendência'
            }
          >
            <ResolveSection
              pendencia={pendencia}
              actionStatus={actionStatus}
              actionError={actionError}
              onResolver={handleResolver}
              onIndicar={handleIndicar}
              uploadDocFn={uploadDoc}
              carregarExistentesFn={carregarExistentes}
              carregarGarantiasFn={carregarGarantias}
              carregarGarantiaViewFn={carregarGarantiaView}
              canIndicar={canIndicar}
              carregarDdiFn={carregarDdi}
              emitirParecerFn={emitirParecer}
              solicitarDocumentoFn={solicitarDocumento}
              solicitarRevisaoFn={solicitarRevisao}
              onDdiDone={doLoad}
            />
          </Section>

          <Section
            title="Histórico e comunicação"
            action={
              pendencia.historico.length > 0 ? (
                <span className="text-(length:--t-small) text-(--color-text-muted)">
                  {pendencia.historico.length} evento
                  {pendencia.historico.length !== 1 ? 's' : ''}
                </span>
              ) : undefined
            }
          >
            {pendencia.historico.length === 0 ? (
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                Nenhum evento registrado ainda.
              </p>
            ) : (
              <div
                className="flex flex-col gap-3"
                role="log"
                aria-label="Histórico"
              >
                {pendencia.historico.map((entry) => (
                  <ThreadEntry
                    key={entry.id}
                    entry={entry}
                    areaResponsavel={pendencia.areaResponsavel}
                    currentUserId={currentUserId}
                    autorArea={areaPorAutor.get(entry.autorId) ?? null}
                  />
                ))}
              </div>
            )}

            {commentError && (
              <p
                className="mt-2 text-(length:--t-small) text-(--color-danger)"
                role="alert"
              >
                {commentError}
              </p>
            )}

            {/*
              Read-only profiles (Visualizador, Expansão) get no compose box.
              The handler already refused to send and the API answers 403, so
              the buttons were dead controls: the user typed a comment, pressed
              "Enviar" and nothing happened, with no reason given.
            */}
            {canWrite ? (
              <CommentCompose
                onSend={handleComentar}
                disabled={commentStatus === 'saving'}
                pendenciaId={pendencia.id}
                uploadAnexoFn={uploadAnexo}
              />
            ) : (
              <p className="mt-4 text-(length:--t-caption) text-(--color-text-muted)">
                Seu perfil acompanha o ticket, mas não comenta nem anexa
                arquivos.
              </p>
            )}
          </Section>

          {/*
            Painel Anexos — CA-1: todo arquivo enviado acessível sem rolar o thread.
            Divergência deliberada do protótipo: 12a-pendencia-ticket.html não tem
            este painel (só o dropzone na linha :85 e um guard de demo na :190).
            Registrado como divergência do protótipo (épico VBR-489).
          */}
          <Section
            title="Anexos"
            action={
              anexosStatus === 'loaded' && anexos.length > 0 ? (
                <span className="text-(length:--t-small) text-(--color-text-muted)">
                  {anexos.length} arquivo{anexos.length !== 1 ? 's' : ''}
                </span>
              ) : undefined
            }
          >
            {anexosStatus === 'loading' && (
              <p
                role="status"
                className="text-(length:--t-caption) text-(--color-text-muted) animate-pulse"
              >
                Carregando arquivos…
              </p>
            )}

            {/* CA-5: load failure is a visible error, never the empty state */}
            {anexosStatus === 'error' && (
              <div role="alert" className="space-y-2">
                <p className="text-(length:--t-caption) text-(--color-danger)">
                  {anexosError || 'Não foi possível carregar os anexos.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAnexosStatus('loading');
                    setAnexosError('');
                    listarAnexos(pendenciaId)
                      .then((items) => {
                        setAnexos(items);
                        setAnexosStatus("loaded");
                      })
                      .catch((err: unknown) => {
                        setAnexosError(
                          err instanceof Error
                            ? err.message
                            : "Erro ao carregar os anexos.",
                        );
                        setAnexosStatus("error");
                      });
                  }}
                  className={SECONDARY_OUTLINE_BTN}
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* CA-5: empty state is clearly "no files sent" — never ambiguous */}
            {anexosStatus === 'loaded' && anexos.length === 0 && (
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                Nenhum arquivo enviado nesta pendência.
              </p>
            )}

            {anexosStatus === 'loaded' && anexos.length > 0 && (
              <ul className="space-y-1" aria-label="Arquivos anexados">
                {anexos.map((anexo) => (
                  <li key={anexo.id} className="flex items-center gap-2">
                    {/*
                      CA-6: download goes through the BFF view stream — the
                      signed URL stays server-side, never reaches the browser.
                    */}
                    <a
                      href={withBasePath(
                        `/api/pendencias/${encodeURIComponent(pendenciaId)}/anexos/${encodeURIComponent(anexo.id)}/view`,
                      )}
                      download={nomeDeArquivoSeguro(anexo.fileName) ?? true}
                      className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-xxs)] bg-(--neutral-50) px-2 py-1.5 text-(length:--t-caption) text-(--neutral-700) underline decoration-dotted underline-offset-2 transition hover:bg-(--neutral-100) hover:text-(--neutral-900)"
                    >
                      <AttachmentIcon />
                      <span className="truncate font-bold">
                        {anexo.fileName}
                      </span>
                    </a>
                    {anexo.uploadedByName && (
                      <span className="shrink-0 text-(length:--t-small) text-(--color-text-muted)">
                        {anexo.uploadedByName}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Right aside */}
        <aside className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
            <h2 className="mb-3 text-(length:--t-h4) font-bold">
              Detalhes do ticket
            </h2>
            <div className="space-y-3">
              <DataField label="Nº" value={pendencia.codigo} />
              <DataField
                label="Status"
                value={
                  <StatusPill variant={STATUS_VARIANT[pendencia.status]}>
                    {STATUS_LABEL[pendencia.status]}
                  </StatusPill>
                }
              />
              <DataField label="Tipo" value={pendencia.tipo} />
              <DataField label="Origem" value={pendencia.origem} />
              <DataField label="Canal" value={pendencia.canal} />
              <DataField
                label="Prioridade"
                value={
                  <StatusPill
                    variant={PRIORIDADE_VARIANT[pendencia.prioridade]}
                  >
                    {PRIORIDADE_LABEL[pendencia.prioridade]}
                  </StatusPill>
                }
              />
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
            <h2 className="text-(length:--t-h4) font-bold">Participantes</h2>
            <p className="mb-3 text-(length:--t-small) text-(--color-text-muted)">
              Quem responde ou já atuou neste ticket.
            </p>
            {pendencia.participantes.length === 0 ? (
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                Ninguém atuou neste ticket ainda.
              </p>
            ) : (
              /*
               * Chips "AR Ana Ribeiro · LT", exactly the prototype's card — a
               * NAME with the area beside it. The previous list stacked the
               * papel under the name ("Integridade / Responsável"), so the card
               * answered "which role" when the question is "which person".
               */
              <ul className="flex flex-wrap gap-2" aria-label="Participantes">
                {pendencia.participantes.map((p) => (
                  <li
                    key={p.id}
                    title={p.papel}
                    className="inline-flex max-w-full items-center gap-2 rounded-full bg-(--neutral-50) py-1 pl-1 pr-3"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: avatarColorForParticipante(p) }}
                    >
                      {p.id.startsWith('area:') ? (
                        <UserIcon className="size-3" />
                      ) : (
                        initials(p.nome)
                      )}
                    </span>
                    {/*
                      The area is a separate, non-shrinking span: inside the
                      truncated name it was the first thing the ellipsis ate, so
                      a long name ("Pedro Henrique Pimenta Rubinger") lost the
                      very half that says which side of the conversation it is.
                    */}
                    <span className="flex min-w-0 items-baseline gap-1 text-(length:--t-caption)">
                      <span className="truncate font-bold">{p.nome}</span>
                      {p.area && p.area !== p.nome && (
                        <span className="shrink-0 text-(--color-text-muted)">
                          · {p.area}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
