'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import { StatusPill } from '@/components/status-pill';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';
import {
  deleteFromRepository as defaultDelete,
  getRepository as defaultLoad,
  replaceInRepository as defaultReplace,
  uploadToRepository as defaultUpload,
} from '@/lib/documents/documents.data';
import type {
  RepositoryDoc,
  RepositoryResult,
  SituacaoDocumento,
} from '@/lib/documents/types';
import { RepositoryNotFoundError } from '@/lib/documents/types';
import { useConfirm } from '@/components/confirm-dialog';
import { fileAcceptAttribute } from '@/lib/documents/accepted-file-types';
import { FieldLabel } from '@/components/ui/field-label';
import { IN_FIELD } from '@/components/ui/field-classes';
import { Select } from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error' | 'not-found';

type Props = {
  clientId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  load?: (id: string) => Promise<RepositoryResult>;
  upload?: (
    clientId: string,
    docTypeId: string,
    file: File,
    expiresAt?: string,
  ) => Promise<RepositoryDoc>;
  replace?: (
    clientId: string,
    docId: string,
    file: File,
    expiresAt?: string,
  ) => Promise<RepositoryDoc>;
  remove?: (clientId: string, docId: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats an ISO date string as "dd/mm/aaaa". */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Rótulo e variante da pill de SITUAÇÃO (ADO 67993).
 *
 * Vocabulário do CHECKLIST — o mesmo documento não pode ler diferente em duas
 * telas. `vencido` é o único `danger`: ali o documento deixou de valer e alguém
 * precisa reenviá-lo; os outros três descrevem estados saudáveis.
 *
 * ⚠️ `no_repositorio` é suprimido SÓ quando a procedência já o diz — ver
 * {@link situacaoRedundante}.
 */
const SITUACAO_PILL: Record<
  SituacaoDocumento,
  { label: string; variant: 'success' | 'info' | 'danger' | 'neutral' }
> = {
  vencido: { label: 'Vencido', variant: 'danger' },
  validado: { label: 'Validado', variant: 'success' },
  anexado: { label: 'Anexado', variant: 'info' },
  /*
   * Neutro: o documento existe e está íntegro — o que ele não tem é vínculo com
   * oportunidade nenhuma. Não é estado melhor nem pior, é ausência de uso.
   */
  no_repositorio: { label: 'No repositório', variant: 'neutral' },
};

/**
 * A pill de SITUAÇÃO diria o mesmo que a de PROCEDÊNCIA ao lado?
 *
 * A decisão do ADO 68083 — não repetir "No repositório" duas vezes na mesma
 * linha — vale só quando a procedência de fato escreve essa palavra, ou seja
 * quando `origem !== 'oportunidade'`. Medido em staging em 05/09/2026: três
 * linhas com procedência **"Da oportunidade"** e situação `no_repositorio`
 * (documento gravado com a oportunidade e sem linha em
 * `opportunity_document_links`) ficavam **sem etiqueta de situação nenhuma**,
 * ao lado de linhas idênticas marcadas "Anexado" — na tela isso lê como dado
 * que faltou carregar, não como um estado.
 */
function situacaoRedundante(doc: {
  // `| null` porque é assim que os dois campos chegam do backend: `RepositoryDoc`
  // os declara nullable, e um parâmetro só com `undefined` obriga o call site a
  // um cast — que é exatamente onde um `null` passaria a ser lido como ausente.
  situacao?: SituacaoDocumento | null;
  origem?: string | null;
}): boolean {
  return doc.situacao === 'no_repositorio' && doc.origem !== 'oportunidade';
}

/**
 * Frase da validade na linha de metadados (TC UAT-032 — *"tipo, validade e
 * status"*).
 *
 * ⚠️ `null` vira "sem validade", nunca um traço mudo nem uma data inventada:
 * "não tem prazo" e "o prazo não foi informado" são o mesmo fato aqui (o campo
 * é opcional no upload), e o que a tela não pode fazer é sugerir vencimento
 * onde ninguém declarou um.
 */
function validadeLabel(expiresAt: string | null): string {
  if (!expiresAt) return 'sem validade';
  return `válido até ${formatCalendarDate(expiresAt)}`;
}

/**
 * Formata uma data de CALENDÁRIO (a validade), em UTC.
 *
 * ⚠️ Distinto de {@link formatDate}, que formata um INSTANTE (o envio) no fuso
 * local. A validade é gravada como meia-noite UTC (`2027-03-31T00:00:00Z`), e
 * no fuso de Brasília a mesma string vira **30/03/2027** — um dia a menos que o
 * usuário digitou, na tela e no e-mail que ele mandaria ao cliente.
 */
function formatCalendarDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Returns ordered unique categories from the doc list. */
function uniqueCategories(docs: RepositoryDoc[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const d of docs) {
    if (!seen.has(d.category)) {
      seen.add(d.category);
      result.push(d.category);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Document icon
// ---------------------------------------------------------------------------

function DocIcon() {
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[var(--radius-xxs)] bg-(--neutral-60) text-(--neutral-600)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          d="M10 2v4h4"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3000);
    return () => clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-50 max-w-[80%] -translate-x-1/2 rounded-[var(--radius-xs)] bg-(--neutral-900) px-4 py-2.5 text-center text-[13px] text-white shadow-lg"
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doc actions menu (Exibir / Novo upload / Excluir)
// ---------------------------------------------------------------------------

function DocActions({
  doc,
  busy,
  canWrite,
  onView,
  onReupload,
  onDelete,
}: {
  doc: RepositoryDoc;
  busy: boolean;
  /** Read-only profiles only get the non-mutating "Exibir" action. */
  canWrite: boolean;
  onView: () => void;
  onReupload: () => void;
  onDelete: () => void;
}) {
  /** Confirmação das ações destrutivas deste menu. */
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  type MenuAction = { label: string; handler: () => void; danger?: boolean };
  /*
   * ADO 68083 — documento vindo de uma OPORTUNIDADE é leitura aqui.
   *
   * Ele está vinculado ao checklist daquela oportunidade
   * (`opportunity_document_links`); excluí-lo ou substituí-lo por esta tela
   * quebraria o checklist de lá sem que quem clicou tivesse como saber, e a
   * API o recusa (`replace`/`delete` seguem escopados ao repositório do
   * cliente). Oferecer o item de menu seria controle morto — o clique só podia
   * terminar em 404. "Exibir" continua, porque baixar acompanha a
   * visibilidade.
   */
  const podeMutar = canWrite && doc.origem !== 'oportunidade';
  const actions: MenuAction[] = [
    { label: 'Exibir', handler: onView },
    // Mutating actions only for profiles that can write — no dead controls that
    // silently no-op for a read-only user (the handler guard would swallow them).
    ...(podeMutar
      ? [
          { label: 'Novo upload', handler: onReupload },
          {
            label: 'Excluir',
            handler: () =>
              confirm.ask({
                title: 'Excluir documento do repositório?',
                description: `"${doc.name}" sai do repositório do cliente. Oportunidades que o reutilizam perdem o vínculo.`,
                confirmLabel: 'Excluir',
                tone: 'danger',
                onConfirm: onDelete,
              }),
            danger: true,
          },
        ]
      : []),
  ];

  // Prevent doc.downloadUrl lint warning — it's used by the caller via onView
  void doc;

  return (
    <div ref={ref} className="relative inline-block">
      {confirm.dialog}
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ações do documento"
        className={SECONDARY_OUTLINE_BTN}
      >
        {busy ? '…' : 'Ações ▾'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[150px] overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border) bg-white shadow-md"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.handler();
              }}
              className={`block w-full px-3.5 py-2.5 text-left text-[13px] font-bold transition hover:bg-(--neutral-40) ${action.danger ? 'text-(--color-danger)' : 'text-(--color-text)'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClientRepository({
  clientId,
  load = defaultLoad,
  upload = defaultUpload,
  replace = defaultReplace,
  remove = defaultDelete,
}: Props) {
  // Upload/substituição/remoção no repositório espelha
  // `CUSTOMER_DOCUMENT_WRITE_ROLES` — lista própria desde a Matriz RBAC v2.1
  // (28/09/2026), que dá "Documentos do cliente" como só leitura aos perfis que
  // ganharam a autoridade do LT. Leitura/download abertos.
  const { can } = usePermissions();
  const canWrite = can(Permission.CustomerDocumentManage);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [result, setResult] = useState<RepositoryResult | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('todas');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // "Anexar documento" modal: pick a type + a file, then confirm.
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [modalTypeId, setModalTypeId] = useState<string | null>(null);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState('');
  /**
   * Validade informada no modal (ADO 67993) — `''` = "sem validade".
   *
   * É ela que torna a situação `Vencido` alcançável: a coluna `expires_at`
   * existe desde sempre e nenhuma tela a preenchia, então a etiqueta era ramo
   * morto no motor do checklist e o TC UAT-032 não tinha validade para exibir.
   */
  const [modalValidade, setModalValidade] = useState('');
  /**
   * Id do documento sendo SUBSTITUÍDO ("Novo upload"), ou `null` num upload
   * novo.
   *
   * O "Novo upload" passou a abrir ESTE modal em vez de um input escondido
   * (ADO 67993). Sem isso a substituição não teria onde informar a validade
   * nova — e a linha `Vencido` viraria um beco sem saída: trocar o arquivo
   * deixaria a data velha no passado e o documento seguiria vencido para
   * sempre, com a tela mandando reenviar o que já foi reenviado.
   */
  const [modalReplaceDocId, setModalReplaceDocId] = useState<string | null>(null);


  const showToast = useCallback((msg: string) => setToast(msg), []);
  const clearToast = useCallback(() => setToast(''), []);

  // Load repository
  useEffect(() => {
    let active = true;
    setLoadStatus('loading');
    setResult(null);
    setActiveCategory('todas');

    load(clientId)
      .then((data) => {
        if (!active) return;
        setResult(data);
        setLoadStatus('loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof RepositoryNotFoundError) {
          setLoadStatus('not-found');
        } else {
          setLoadStatus('error');
        }
      });

    return () => {
      active = false;
    };
  }, [clientId, load]);

  // ── Upload modal (fresh document) ─────────────────────────────────────────

  const closeUploadModal = useCallback(() => {
    setUploadModalOpen(false);
    setModalFile(null);
    setModalError('');
    setModalValidade('');
    setModalReplaceDocId(null);
  }, []);

  // Esc closes the modal (same convention as the other modals in the app).
  useEffect(() => {
    if (!uploadModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeUploadModal();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [uploadModalOpen, closeUploadModal]);

  /**
   * Confirms the modal — upload novo, ou substituição em lugar ("Novo upload").
   *
   * Um handler só para os dois: o formulário é o mesmo (tipo + arquivo +
   * validade), e duas cópias divergiriam justamente no campo novo — a
   * substituição voltaria a perder a validade, que é o beco sem saída que este
   * modal veio fechar.
   */
  const doUpload = useCallback(async () => {
    // Read-only profile: the API answers 403; guard here mirrors the hidden button.
    if (!canWrite) return;
    if (!modalTypeId) {
      setModalError('Selecione o tipo do documento.');
      return;
    }
    if (!modalFile) {
      setModalError('Escolha um arquivo.');
      return;
    }

    setUploadBusy(true);
    setModalError('');
    try {
      if (modalReplaceDocId) {
        setBusyDocId(modalReplaceDocId);
        const updated = await replace(
          clientId,
          modalReplaceDocId,
          modalFile,
          modalValidade,
        );
        setResult((prev) =>
          prev
            ? {
                ...prev,
                docs: prev.docs.map((d) => (d.id === modalReplaceDocId ? updated : d)),
              }
            : prev,
        );
        showToast(`"${updated.name}" substituído.`);
      } else {
        const newDoc = await upload(clientId, modalTypeId, modalFile, modalValidade);
        setResult((prev) => (prev ? { ...prev, docs: [...prev.docs, newDoc] } : prev));
        showToast(`"${newDoc.name}" enviado — disponível para reuso em propostas. (HU-17.2)`);
      }
      closeUploadModal();
    } catch (err: unknown) {
      // Keep the modal open with the picked file so the user can retry.
      setModalError(err instanceof Error ? err.message : 'Falha ao enviar o documento.');
    } finally {
      setUploadBusy(false);
      setBusyDocId(null);
    }
  }, [
    canWrite,
    modalTypeId,
    modalFile,
    modalValidade,
    modalReplaceDocId,
    clientId,
    upload,
    replace,
    showToast,
    closeUploadModal,
  ]);

  /**
   * Abre o modal em modo SUBSTITUIÇÃO, com o tipo travado no da linha e a
   * validade pré-preenchida com a atual — quem só quer trocar o arquivo não
   * precisa redigitar a data, e quem está consertando um `Vencido` a vê ali
   * para corrigir.
   */
  const openReplaceModal = useCallback((doc: RepositoryDoc) => {
    setModalReplaceDocId(doc.id);
    setModalTypeId(`${doc.category}::${doc.name}`);
    setModalFile(null);
    setModalError('');
    // `expiresAt` é ISO-8601 completo; o `<input type="date">` só aceita
    // `yyyy-mm-dd`, e um valor mais longo o deixa VAZIO sem avisar.
    setModalValidade(doc.expiresAt ? doc.expiresAt.slice(0, 10) : '');
    setUploadModalOpen(true);
  }, []);

  // Handle document deletion
  const handleDelete = useCallback(
    async (docId: string) => {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
      if (busyDocId) return;
      setBusyDocId(docId);
      try {
        await remove(clientId, docId);
        const name = result?.docs.find((d) => d.id === docId)?.name ?? '';
        setResult((prev) =>
          prev ? { ...prev, docs: prev.docs.filter((d) => d.id !== docId) } : prev,
        );
        showToast(`"${name}" removido do repositório.`);
      } catch {
        showToast('Falha ao excluir o documento. Tente novamente.');
      } finally {
        setBusyDocId(null);
      }
    },
    [clientId, remove, busyDocId, result, showToast, canWrite],
  );

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loadStatus === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando repositório de documentos…</span>
        <div className="h-16 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        <div className="h-10 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Not-found state
  // ---------------------------------------------------------------------------

  if (loadStatus === 'not-found') {
    return (
      <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center">
        <h1 className="text-(length:--t-h3) font-bold text-(--neutral-900)">
          Cliente não encontrado
        </h1>
        <p className="mx-auto mt-2 max-w-md text-(length:--t-caption) text-(--color-text-muted)">
          Verifique o código do cliente ou volte à listagem.
        </p>
        <Link
          href="/clientes"
          className="mt-5 inline-block font-bold text-(--secondary-600) hover:underline"
        >
          ‹ Voltar para Clientes
        </Link>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (loadStatus === 'error' || !result) {
    return (
      <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center">
        <h1 className="text-(length:--t-h3) font-bold text-(--neutral-900)">
          Falha ao carregar o repositório
        </h1>
        <p className="mx-auto mt-2 max-w-md text-(length:--t-caption) text-(--color-text-muted)">
          Não foi possível obter os documentos deste cliente. Tente novamente em instantes.
        </p>
        <Link
          href="/clientes"
          className="mt-5 inline-block font-bold text-(--secondary-600) hover:underline"
        >
          ‹ Voltar para Clientes
        </Link>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Loaded state
  // ---------------------------------------------------------------------------

  const { clientName, docs, documentTypes } = result;

  // Apply category filter
  const filteredDocs =
    activeCategory === 'todas' ? docs : docs.filter((d) => d.category === activeCategory);

  const allCategories = uniqueCategories(docs);
  const isEmpty = docs.length === 0;
  const isFilteredEmpty = filteredDocs.length === 0 && !isEmpty;
  const filteredCategories = uniqueCategories(filteredDocs);

  return (
    <div>
      {/* Page header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-(length:--t-h2) font-bold text-(--neutral-900)">
            Documentos &amp; anexos
          </h1>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Repositório do cliente
            {clientName ? (
              <>
                {' · '}
                <strong>{clientName}</strong>
              </>
            ) : null}
          </p>
        </div>
        <Link
          href={`/clientes/${clientId}`}
          className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--color-surface) px-4 py-2 text-[13px] font-bold text-(--secondary-500) transition hover:bg-(--neutral-40)"
        >
          ← Voltar
        </Link>
      </div>

      {/* Upload drop zone — write controls only for profiles that can write
          (read-only sees the list + "Exibir", never a control that no-ops). */}
      {canWrite && (
        <div className="mb-4 rounded-[var(--radius-md)] border-2 border-dashed border-(--color-border-strong) bg-(--color-surface) p-5 text-center">
          <p className="text-(length:--t-body) font-bold">
            Anexe um documento ao repositório do cliente
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={uploadBusy || documentTypes.length === 0}
              onClick={() => {
                setModalTypeId(null);
                setModalFile(null);
                setModalError('');
                setUploadModalOpen(true);
              }}
              className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anexar documento
            </button>
          </div>
        </div>
      )}

      {/* Empty state (13b) */}
      {isEmpty ? (
        <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center">
          {/* Folder icon */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--neutral-60) text-(--neutral-400)">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-(length:--t-h4) font-bold text-(--neutral-700)">
            Nenhum documento no repositório deste cliente
          </h2>
          {/*
            A instrução só aparece para quem PODE anexar. Um perfil somente
            leitura (Visualizador, Expansão) não tem a zona de upload acima, e
            mandá-lo "anexar o primeiro documento" descrevia uma ação que a tela
            não oferece e que a API recusaria (ADO 67855).
          */}
          {canWrite ? (
            <p className="mx-auto mt-1 max-w-sm text-(length:--t-caption) text-(--color-text-muted)">
              Anexe o primeiro documento.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          {/* Category filter chips */}
          <div
            className="mb-3 flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filtrar por categoria"
          >
            <button
              type="button"
              onClick={() => setActiveCategory('todas')}
              aria-pressed={activeCategory === 'todas'}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
                activeCategory === 'todas'
                  ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                  : 'border-(--color-border) bg-white text-(--color-text) hover:bg-(--neutral-40)'
              }`}
            >
              Todas
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
                  activeCategory === cat
                    ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                    : 'border-(--color-border) bg-white text-(--color-text) hover:bg-(--neutral-40)'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Empty filter state */}
          {isFilteredEmpty ? (
            <p className="py-8 text-center text-(length:--t-caption) text-(--color-text-muted)">
              Nenhum documento nesta categoria.
            </p>
          ) : (
            /* Document list grouped by category */
            filteredCategories.map((cat) => {
              const catDocs = filteredDocs.filter((d) => d.category === cat);
              return (
                <div key={cat}>
                  {/* Category heading */}
                  <div className="mt-4 mb-1.5 text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
                    {cat}
                  </div>

                  {catDocs.map((doc) => {
                    const isBusy = busyDocId === doc.id;

                    return (
                      <div
                        key={doc.id}
                        className="mb-2 flex items-center gap-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--color-surface) px-3.5 py-3"
                      >
                        <DocIcon />

                        {/* Doc metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-bold">{doc.name}</div>
                          {/*
                            * ADO 67993 / TC UAT-032 — *"os documentos são
                            * listados com tipo, validade e status"*. O tipo já
                            * estava aqui; a VALIDADE entra ao lado dele e o
                            * STATUS vira pill à direita.
                            */}
                          <div className="mt-0.5 text-[12px] text-(--color-text-muted)">
                            {doc.category} · {doc.acceptedTypes} · enviado em{' '}
                            {formatDate(doc.uploadedAt)} · {validadeLabel(doc.expiresAt)}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-(--color-text-muted)">
                            {doc.fileName}
                            {/*
                              * Sem o código a frase nomeia a origem assim
                              * mesmo: `opportunities.code` é nullable, e um
                              * marcador inventado no lugar dele seria pior que
                              * a ausência.
                              */}
                            {doc.origem === 'oportunidade' ? (
                              <>
                                {' · '}
                                <span className="text-(--color-info)">
                                  {doc.opportunityCode
                                    ? `anexado na oportunidade ${doc.opportunityCode}`
                                    : 'anexado em uma oportunidade deste cliente'}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-none items-center gap-2">
                          {/*
                            * ADO 68083 — a pill diz de ONDE o documento veio.
                            *
                            * "No repositório" sobre uma linha anexada numa
                            * oportunidade afirmaria um escopo que ela não tem
                            * (e cujas ações a API recusa). Variante `info`,
                            * nunca `success`: não é um estado melhor nem pior,
                            * é outra procedência — mesma disciplina da pill de
                            * garantia, em que `d` fica reservado para falha
                            * real.
                            */}
                          {/*
                            * ADO 67993 — a SITUAÇÃO, ao lado (nunca no lugar) da
                            * procedência: são perguntas diferentes, e sobrepor
                            * uma na outra apagaria a decisão do ADO 68083.
                            *
                            * `no_repositorio` é suprimido só quando a pill de
                            * procedência ao lado já escreve essa palavra — ver
                            * `situacaoRedundante`. Situação desconhecida (skew
                            * de deploy) não renderiza nada: a tela não afirma um
                            * estado que ninguém apurou.
                            */}
                          {doc.situacao && !situacaoRedundante(doc) && (
                            <StatusPill
                              variant={SITUACAO_PILL[doc.situacao].variant}
                              size="sm"
                            >
                              {SITUACAO_PILL[doc.situacao].label}
                            </StatusPill>
                          )}
                          {doc.origem === 'oportunidade' ? (
                            <StatusPill variant="info" size="sm">
                              Da oportunidade
                            </StatusPill>
                          ) : (
                            <StatusPill variant="success" size="sm">
                              No repositório
                            </StatusPill>
                          )}
                          {/*
                            * `isBusy` é da LINHA e nada mais (ADO 67547).
                            * `uploadBusy` é o envio do MODAL, global: com ele
                            * aqui, anexar um documento trocava o "Ações ▾" de
                            * TODAS as linhas por "…", como se cada uma
                            * estivesse subindo um arquivo. Ele já governa os
                            * controles do modal e da dropzone, que é onde o
                            * envio de fato acontece.
                            */}
                          <DocActions
                            doc={doc}
                            busy={isBusy}
                            canWrite={canWrite}
                            onView={() => {
                              /*
                               * `downloadUrl` vem de payload e aqui vira
                               * NAVEGAÇÃO — `urlDeMidiaSegura` é o ponto em que
                               * ela deixa de ser string qualquer (CWE-73).
                               * Recusada, o clique não faz nada: abrir uma aba
                               * para destino que ninguém escolheu é pior.
                               *
                               * O `withBasePath` saiu junto: `downloadUrl` já
                               * chega prefixado do mapper (`apiUrl`), e a
                               * segunda aplicação só não quebrava porque o
                               * helper é idempotente (VBR-638).
                               */
                              const alvo = urlDeMidiaSegura(doc.downloadUrl);
                              if (alvo !== null) {
                                window.open(alvo, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            /*
                             * "Novo upload" abre o MESMO modal do anexo, em
                             * modo substituição (ADO 67993): é ali que a
                             * validade nova é informada. Com o input escondido
                             * de antes, trocar o arquivo de um documento
                             * `Vencido` mantinha a data velha no passado e ele
                             * seguia vencido para sempre.
                             *
                             * O filtro de tipos continua vindo do CATÁLOGO
                             * (o modal o deriva do tipo escolhido), não do
                             * `acceptedTypes` da linha — ali o mapper guarda o
                             * mime do arquivo já enviado, e filtrar por ele
                             * proibiria trocar um PNG por um PDF que a
                             * parametrização aceita.
                             */
                            onReupload={() => openReplaceModal(doc)}
                            onDelete={() => void handleDelete(doc.id)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </>
      )}

      {/* Upload modal — pick a document type + a file, then confirm */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeUploadModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modalReplaceDocId ? 'Novo upload' : 'Anexar documento'}
            className="w-full max-w-[480px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-(length:--t-h4) font-bold text-(--neutral-900)">
              {modalReplaceDocId ? 'Novo upload' : 'Anexar documento'}
            </h3>

            {/*
              * `FieldLabel size="caption"` + `Select` na variante PADRÃO
              * (`bottom-border`) — o `.in` do protótipo, o mesmo par que os
              * modais de franquia usam. O `variant="boxed"` que estava aqui
              * desenhava a caixa arredondada com borda inteira, controle que
              * não existe no design system e que só este modal (e o gêmeo do
              * checklist) renderizava: a deviação que VBR-649/VBR-650
              * documentam ao criar `field-classes.ts`.
              */}
            <FieldLabel htmlFor="modal-doc-type" size="caption">
              Tipo do documento
            </FieldLabel>
            <Select
              id="modal-doc-type"
              value={modalTypeId ?? ''}
              /*
               * Numa substituição o tipo é do REGISTRO que está sendo trocado —
               * a rota `PUT` não o aceita, e oferecê-lo prometeria uma mudança
               * que a API descarta em silêncio.
               */
              disabled={
                uploadBusy || documentTypes.length === 0 || modalReplaceDocId !== null
              }
              onChange={(v) => setModalTypeId(v)}
              options={documentTypes.map((t) => ({
                value: t.id,
                label: `${t.category} · ${t.name}`,
              }))}
            />

            {/* `div`, não `FieldLabel`: o controle do arquivo é o `<label>`
                logo abaixo, e um segundo `<label>` sem `for` acima dele
                anunciaria um rótulo que não endereça campo nenhum. */}
            <div className="mt-4 mb-1 block text-(length:--t-caption) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
              Arquivo
            </div>
            <label className={`${SECONDARY_OUTLINE_BTN} cursor-pointer`}>
              {modalFile ? 'Trocar arquivo' : 'Escolher arquivo'}
              <input
                type="file"
                className="sr-only"
                aria-label="Arquivo do documento"
                /* Filtro do tipo ESCOLHIDO no select acima (ADO 67547) — o
                   `Contrato social` aceita só PDF, e o picker oferecia imagem. */
                accept={fileAcceptAttribute(
                  documentTypes.find((t) => t.id === modalTypeId)?.acceptedTypes,
                )}
                onChange={(e) => {
                  setModalFile(e.target.files?.[0] ?? null);
                  setModalError('');
                }}
              />
            </label>
            {modalFile && (
              <span className="ml-2 text-[13px] text-(--color-text-muted)">{modalFile.name}</span>
            )}

            {/*
              * Validade (ADO 67993 / TC UAT-032) — OPCIONAL: nem todo documento
              * tem prazo, e campo vazio é "sem validade", nunca "vencido".
              *
              * É este campo que torna a situação `Vencido` alcançável: a coluna
              * `expires_at` existia e nenhuma tela a preenchia, então a etiqueta
              * era ramo morto no motor do checklist.
              */}
            <div className="mt-4">
              <FieldLabel htmlFor="modal-doc-validade" size="caption">
                Validade (opcional)
              </FieldLabel>
            </div>
            <input
              id="modal-doc-validade"
              type="date"
              className={IN_FIELD}
              value={modalValidade}
              disabled={uploadBusy}
              onChange={(e) => {
                setModalValidade(e.target.value);
                setModalError('');
              }}
            />
            <p className="mt-1 text-[12px] text-(--color-text-muted)">
              Deixe em branco quando o documento não tem prazo. Passada a data, ele
              aparece como <strong>Vencido</strong> aqui e no checklist da oportunidade.
            </p>

            {modalError && (
              <p className="mt-3 text-[13px] font-bold text-(--color-danger)">{modalError}</p>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" onClick={closeUploadModal} className={SECONDARY_OUTLINE_BTN}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={uploadBusy || !modalTypeId || !modalFile}
                onClick={() => void doUpload()}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadBusy
                  ? 'Enviando…'
                  : modalReplaceDocId
                    ? 'Substituir'
                    : 'Anexar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && <Toast message={toast} onDismiss={clearToast} />}
    </div>
  );
}
