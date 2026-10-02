'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import { StatusPill } from '@/components/status-pill';
import { Select } from '@/components/ui/select';
import { useConsultorSoFranquia } from '@/hooks/use-consultor-so-franquia';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import type { MinutaItem } from '@/lib/contratos/contrato-mapping';
import type { ContratoReadModel } from '@/lib/contratos/contrato-mapping';
import { contratoPillVariant } from '@/lib/contratos/pill-variant';
import {
  anexarMinuta,
  listarTiposAnexaveis,
  minutaDownloadUrl,
  substituirMinuta,
} from '@/lib/contratos/minutas.api';
import type { MinutaTipoAnexavel } from '@/lib/contratos/minutas.api';
import { nomeDeArquivoSeguro } from '@/lib/arquivo/nome-de-arquivo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * File picker filter, mirroring what the backend accepts.
 *
 * `.doc`/`.docx` are here because that is what the Netlex robot produces — the
 * document the user downloads there and brings back. Offering PDF alone would
 * hide the only format they have.
 */
const MINUTA_ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type ReadinessMinuta = ContratoReadModel['readiness']['minuta'];

export type MinutaSectionProps = {
  minutas: MinutaItem[];
  readiness: ReadinessMinuta;
  opportunityId: string;
  /** Called after a successful mutation to re-fetch the read model. */
  onRevalidate: () => void;
  /** Injected in tests. Defaults to the BFF client. */
  loadTipos?: typeof listarTiposAnexaveis;
  /** Injected in tests. Defaults to the BFF client. */
  anexar?: typeof anexarMinuta;
};

// ---------------------------------------------------------------------------
// Justificativa modal (custom — needs textarea + text input beyond ConfirmDialog)
// ---------------------------------------------------------------------------

type SubstituirModalState = {
  minutaId: string;
  file: File;
};

type SubstituirModalProps = {
  state: SubstituirModalState | null;
  opportunityId: string;
  onClose: () => void;
  onSuccess: () => void;
};

function SubstituirModal({
  state,
  opportunityId,
  onClose,
  onSuccess,
}: SubstituirModalProps) {
  const justificativaRef = useRef<HTMLTextAreaElement>(null);
  const [justificativa, setJustificativa] = useState('');
  const [netlexCodigo, setNetlexCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset the fields and focus the mandatory one on open; Esc cancels.
  // Focus lands on the textarea, not on the confirm button: the user always has
  // to type the justificativa, and a deferred focus() on another element steals
  // the caret mid-typing (it made the modal suites order-dependent).
  useEffect(() => {
    if (!state) return;
    setJustificativa('');
    setNetlexCodigo('');
    setError(null);
    setBusy(false);
    justificativaRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [state, busy, onClose]);

  if (!state) return null;

  async function handleConfirm() {
    if (!state) return;

    const trimmed = justificativa.trim();
    if (!trimmed) {
      setError('Justificativa é obrigatória.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await substituirMinuta(opportunityId, state.minutaId, {
        file: state.file,
        justificativa: trimmed,
        // Em branco não viaja: o campo deixou de ser obrigatório em
        // 13/09/2026 e uma string vazia gravaria `""` na linha, que é
        // indistinguível de um código de verdade em branco.
        netlexConsultaCodigo: netlexCodigo.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao substituir a minuta. Tente novamente.',
      );
      // Modal stays open — the failure is visible via the error message.
    } finally {
      setBusy(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={() => { if (!busy) onClose(); }}
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subst-modal-title"
        data-testid="subst-modal"
        className="w-full max-w-[460px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="subst-modal-title"
          className="text-(length:--t-h4) font-bold"
        >
          Justificar substituição da minuta
        </h3>

        <p className="mt-2 text-(length:--t-caption) text-(--color-text-muted)">
          Você está substituindo a minuta gerada. Informe a justificativa da
          alteração.
        </p>

        {/* Justificativa */}
        <div className="mt-4">
          <label
            htmlFor="subst-justificativa"
            className="block text-(length:--t-caption) font-bold"
          >
            Justificativa <span aria-hidden="true" className="text-(--color-danger)">*</span>
          </label>
          <textarea
            ref={justificativaRef}
            id="subst-justificativa"
            value={justificativa}
            onChange={(e) => { setJustificativa(e.target.value); setError(null); }}
            placeholder="Ex.: ajuste após consulta ao jurídico (código Netlex NTX-JUR-2026-0428)."
            disabled={busy}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-2 text-(length:--t-caption) focus:outline-none focus:ring-1 focus:ring-(--secondary-500) disabled:opacity-60"
            style={{ minHeight: '90px' }}
          />
        </div>

        {/* Código Netlex */}
        <div className="mt-3">
          <label
            htmlFor="subst-netlex-codigo"
            className="block text-(length:--t-caption) font-bold"
          >
            Código da consulta Netlex{' '}
            <span className="font-normal text-(--color-text-muted)">(opcional)</span>
          </label>
          <input
            id="subst-netlex-codigo"
            type="text"
            value={netlexCodigo}
            onChange={(e) => setNetlexCodigo(e.target.value)}
            placeholder="NTX-JUR-AAAA-XXXX"
            disabled={busy}
            className="mt-1.5 w-full rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-2 text-(length:--t-caption) focus:outline-none focus:ring-1 focus:ring-(--secondary-500) disabled:opacity-60"
          />
        </div>

        {/* Inline error */}
        {error && (
          <p
            role="alert"
            data-testid="subst-modal-error"
            className="mt-2.5 text-(length:--t-caption) text-(--color-danger)"
          >
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            data-testid="subst-modal-cancel"
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            data-testid="subst-modal-confirm"
            className="inline-flex items-center rounded-[var(--radius-xxs)] border-transparent bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minuta row (.mrow)
// ---------------------------------------------------------------------------

function MinutaRow({
  minuta,
  opportunityId,
  canManage,
  onSubstituir,
}: {
  minuta: MinutaItem;
  opportunityId: string;
  canManage: boolean;
  onSubstituir: (minutaId: string, file: File) => void;
}) {
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onSubstituir(minuta.id, file);
      // Reset so the same file can be re-selected
      e.target.value = '';
    }
  }

  /**
   * Quem decide se dá para substituir é o BACKEND (`podeSubstituir`), e mais
   * nada.
   *
   * ## ⚠️ A escapatória `|| !minuta.minutaPadrao` FOI REMOVIDA (22/09/2026)
   *
   * Reportado: *"depois que um documento é assinado, ele não pode mais ser
   * substituído"* — com o print de três minutas `Assinada`, duas delas
   * oferecendo "Substituir".
   *
   * A linha anterior passava por cima do veredito do backend em toda linha de
   * exceção (`minutaPadrao: false`), que é justamente o que TODA minuta anexada
   * à mão é — `minutas:anexar` cria o contrato com `minutaPadrao: false`, e a
   * flag não volta a `true` quando o envelope conclui. Resultado: minuta
   * assinada seguia com o botão.
   *
   * ⚠️ **E o botão NUNCA funcionou nesses casos.** `POST .../minutas/:id:substituir`
   * exige `StatusMinuta.GERADA` e responde **400** (*"Apenas minutas com status
   * GERADA podem ser substituídas"*) para qualquer outro estado — exatamente o
   * predicado de `canSubstituir`, que é o que `podeSubstituir` publica. Ou seja
   * a escapatória só acrescentava um controle que termina em erro: quando a
   * linha É substituível, `podeSubstituir` já é `true` sozinho.
   *
   * ## O que a RN-F1-05 queria, e por onde ela passa hoje
   *
   * O comentário removido dizia *"allows Substituir even before generation"* —
   * a linha de exceção nunca recebe minuta do Netlex, então sem isso ela ficaria
   * sem caminho para ganhar documento. Esse caminho existe desde 25/08/2026 e é
   * outro: **"+ Adicionar documento"** (`minutas:anexar`), que é a perna manual
   * de retorno e preenche slot vazio. Substituir passou a ser o que o nome diz —
   * trocar um documento que já está no pacote.
   */
  const showSubstituir = canManage && minuta.podeSubstituir;

  return (
    <div
      data-testid={`mrow-${minuta.id}`}
      className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-[14px] py-3"
    >
      {/* Left: type label + description */}
      <div className="min-w-0 flex-1">
        <div className="text-(length:--t-caption) font-bold">{minuta.tipoLabel}</div>
        <div className="mt-[3px] text-(length:--t-caption) text-(--color-text-muted)">{minuta.descricao}</div>
      </div>

      {/* Right: pill + actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-[14px]">
        <StatusPill variant={contratoPillVariant(minuta.statusPill)}>
          {minuta.statusLabel}
        </StatusPill>

        {minuta.podeBaixar && (
          <a
            href={minutaDownloadUrl(opportunityId, minuta.id)}
            // Backend `Content-Disposition` wins when present; the fileName is
            // the fallback so the browser never saves the file as "download"
            // with no extension.
            download={nomeDeArquivoSeguro(minuta.fileName) ?? true}
            data-testid={`baixar-${minuta.id}`}
            className="whitespace-nowrap text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
          >
            Baixar
          </a>
        )}

        {showSubstituir && (
          <>
            <label
              htmlFor={`subst-file-${minuta.id}`}
              data-testid={`substituir-label-${minuta.id}`}
              className="cursor-pointer whitespace-nowrap text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
            >
              Substituir
            </label>
            <input
              id={`subst-file-${minuta.id}`}
              type="file"
              className="sr-only"
              onChange={handleFileChange}
              // Mirrors what the backend accepts (`minuta-file-types.ts`).
              // `.doc` is what the Netlex robot produces, so leaving it out
              // would hide the format the user actually has.
              accept={MINUTA_ACCEPT}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anexar documento (tipo + arquivo)
// ---------------------------------------------------------------------------

type AnexarModalProps = {
  open: boolean;
  opportunityId: string;
  loadTipos: typeof listarTiposAnexaveis;
  anexar: typeof anexarMinuta;
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * "Anexar documento" modal — TYPE first, then file.
 *
 * Same shape as the opportunity checklist's upload modal, and for the same
 * reason the alignment of 25/08/2026 asked for it here: the Netlex robot breaks
 * when the type is encoded in the FILE NAME, which is what people do today in
 * the Salesforce opportunity (vendor, 05/08/2026). Choosing the type explicitly
 * removes the guess.
 *
 * The option list is loaded LAZILY, when the modal opens: it is a live read of
 * the negotiation package, and paying for it on every render of the contract
 * screen buys nothing.
 */
function AnexarModal({
  open,
  opportunityId,
  loadTipos,
  anexar,
  onClose,
  onSuccess,
}: AnexarModalProps) {
  const [tipos, setTipos] = useState<MinutaTipoAnexavel[] | null>(null);
  const [tipo, setTipo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo('');
    setFile(null);
    setError('');
    setBusy(false);
    setTipos(null);

    let cancelled = false;
    void loadTipos(opportunityId)
      .then((result) => {
        if (!cancelled) setTipos(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // An empty select would read as "this opportunity accepts no
        // documents" — a business claim. The failure is named instead.
        setTipos([]);
        setError(
          err instanceof Error ? err.message : 'Falha ao carregar os tipos de documento.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, opportunityId, loadTipos]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function handleConfirm() {
    if (!tipo || !file) return;
    setBusy(true);
    setError('');
    try {
      await anexar(opportunityId, { tipo, file });
      onSuccess();
    } catch (err) {
      // Modal stays open with the file still selected — the backend sentence
      // (the 409 pointing at "Substituir", the PDF rule) is the actionable part.
      setError(err instanceof Error ? err.message : 'Falha ao anexar o documento.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="anexar-modal-title"
        data-testid="anexar-modal"
        className="w-full max-w-[480px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="anexar-modal-title"
          className="mb-4 text-(length:--t-h4) font-bold text-(--neutral-900)"
        >
          Anexar documento
        </h3>

        <label
          htmlFor="anexar-modal-tipo"
          className="mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
        >
          Tipo do documento
        </label>
        <Select
          id="anexar-modal-tipo"
          data-testid="anexar-modal-tipo"
          value={tipo}
          disabled={busy || tipos === null}
          onChange={(v) => {
            setTipo(v);
            setError('');
          }}
          options={(tipos ?? []).map((t) => ({
            value: t.tipo,
            // `jaAnexado` stays visible instead of being filtered out: the line
            // names what the package already covers, and the action for it is
            // "Substituir" on the row — the API answers 409 either way.
            label: t.jaAnexado ? `${t.tipoLabel} (já anexado)` : t.tipoLabel,
          }))}
          variant="boxed"
        />

        <div className="mt-4 mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
          Arquivo
        </div>
        <label className={`${SECONDARY_OUTLINE_BTN} cursor-pointer`}>
          {file ? 'Trocar arquivo' : 'Escolher arquivo'}
          <input
            type="file"
            data-testid="anexar-modal-arquivo"
            className="sr-only"
            aria-label="Arquivo do documento"
            accept={MINUTA_ACCEPT}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError('');
            }}
          />
        </label>
        {file && (
          <span className="ml-2 text-(length:--t-caption) text-(--color-text-muted)">
            {file.name}
          </span>
        )}

        <p className="mt-3 text-(length:--t-caption) text-(--color-text-muted)">
          Baixe a minuta gerada no Netlex e anexe aqui (PDF, DOC ou DOCX).
        </p>

        {error && (
          <p
            role="alert"
            data-testid="anexar-modal-erro"
            className="mt-3 text-(length:--t-caption) font-bold text-(--color-danger)"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_OUTLINE_BTN}>
            Cancelar
          </button>
          <button
            type="button"
            data-testid="anexar-modal-confirmar"
            disabled={busy || !tipo || !file}
            onClick={() => void handleConfirm()}
            className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Enviando…' : 'Anexar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Faixa (.att)
// ---------------------------------------------------------------------------

function Faixa({
  ready,
  motivoBloqueio,
  mensagemSucesso,
}: {
  ready: boolean;
  motivoBloqueio: string | null;
  mensagemSucesso: string | null;
}) {
  if (!ready && motivoBloqueio) {
    return (
      <div
        // `id` fixo: é o texto que descreve o "+ Adicionar documento" quando ele
        // está desabilitado (`aria-describedby`), então a associação tem de
        // sobreviver a quem reordenar a seção.
        id="minuta-faixa-bloqueio"
        role="note"
        data-testid="minuta-faixa-warn"
        className="mt-2 rounded-[var(--radius-xs)] bg-(--yellow-100) px-3 py-[9px] text-(length:--t-caption) text-(--yellow-700)"
      >
        ⚠ {motivoBloqueio}
      </div>
    );
  }

  if (ready && mensagemSucesso) {
    return (
      <div
        role="note"
        data-testid="minuta-faixa-ok"
        className="mt-2 rounded-[var(--radius-xs)] bg-(--secondary-100) px-3 py-[9px] text-(length:--t-caption) text-(--secondary-700)"
      >
        ✓ {mensagemSucesso}
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// MinutaSection (main export)
// ---------------------------------------------------------------------------

/**
 * Renders the Minuta section body inside the `#minuta` CollapsibleSection.
 *
 * Responsibilities:
 * - List of minuta rows with tipoLabel / descricao / statusPill from the backend.
 * - Baixar action: same-origin BFF link; S3 URL never reaches the browser.
 * - Substituir action: file picker → justificativa modal → BFF upload.
 * - Faixa: warn when readiness blocked, ok when all generated.
 *
 * CTA "Gerar minutas" lives in the Sendbar (contrato-view.tsx), not here.
 */
export function MinutaSection({
  minutas,
  readiness,
  opportunityId,
  onRevalidate,
  loadTipos = listarTiposAnexaveis,
  anexar = anexarMinuta,
}: MinutaSectionProps) {
  const { can } = usePermissions();
  // Consultor de Expansão: só em oportunidade com franquia (ConsultorSoFranquiaGuard).
  const consultorLiberado = useConsultorSoFranquia(opportunityId);
  const canManage = can(Permission.ContractDraftManage) && consultorLiberado;

  const [substModal, setSubstModal] = useState<SubstituirModalState | null>(null);
  const [anexarOpen, setAnexarOpen] = useState(false);

  // Permission guard inside the handler — form submit on Enter could bypass
  // the hidden label.
  const handleSubstituir = useCallback(
    (minutaId: string, file: File) => {
      if (!canManage) return; // guard: API will also reject with 403
      setSubstModal({ minutaId, file });
    },
    [canManage],
  );

  const handleModalClose = useCallback(() => setSubstModal(null), []);
  const handleModalSuccess = useCallback(() => {
    setSubstModal(null);
    onRevalidate();
  }, [onRevalidate]);

  /*
   * Veredito do backend sobre poder anexar (19/09/2026).
   *
   * ⚠️ **Não é `!readiness.ready`.** Aquele fica falso também quando o backend
   * não CONSEGUIU apurar o gate, e a rota de anexo aceitaria a chamada nesse
   * caso — a tela não pode fechar a única porta de entrada da minuta por causa
   * de uma consulta que não respondeu. Quem decide é `podeAnexar`.
   */
  const podeAnexar = readiness.podeAnexar;

  /*
   * A faixa de bloqueio só existe quando `Faixa` a renderiza (mesma condição
   * dela). Apontar `aria-describedby` para um id ausente é referência pendurada:
   * o leitor de tela não anuncia nada e some a única explicação que ele teria —
   * pior do que não ter o atributo, que ao menos deixa o `title` falar.
   */
  const faixaDeBloqueioVisivel = !readiness.ready && readiness.motivoBloqueio !== null;

  // Permission guard inside the handler too — the button is hidden without the
  // permission, but a keyboard submit must not reach the API either. O gate
  // entra na MESMA guarda pela mesma razão: o `disabled` é da tela, a recusa é
  // do servidor (422 GATE_NOT_READY), e o clique não pode escapar por teclado.
  const handleAbrirAnexar = useCallback(() => {
    if (!canManage || !podeAnexar) return;
    setAnexarOpen(true);
  }, [canManage, podeAnexar]);

  const handleAnexarSuccess = useCallback(() => {
    setAnexarOpen(false);
    onRevalidate();
  }, [onRevalidate]);

  return (
    <>
      {/* Minuta rows — or the empty message. The faixa renders in both cases:
          the blocking reason matters most while nothing has been generated. */}
      {minutas.length === 0 ? (
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Nenhuma minuta gerada ainda.
        </p>
      ) : (
        <div>
          {minutas.map((m) => (
            <MinutaRow
              key={m.id}
              minuta={m}
              opportunityId={opportunityId}
              canManage={canManage}
              onSubstituir={handleSubstituir}
            />
          ))}
        </div>
      )}

      {/*
        "+ Adicionar documento" — prototype `01f-oportunidade-minuta.html:380`.
        It renders regardless of how many minutas exist: the empty package is
        exactly when a manually downloaded document has to get in.

        ⚠️ Com o gate fechado ele fica DESABILITADO, nunca escondido: quem tem
        a permissão precisa saber que o caminho existe e por que está trancado —
        esconder o CTA esconderia o fato. O motivo vem do backend e é o mesmo
        texto do 422 da rota; a faixa logo abaixo o carrega, e o botão aponta
        para ela por `aria-describedby`.
      */}
      {canManage && (
        <div className="mt-3">
          <button
            type="button"
            data-testid="anexar-documento"
            onClick={handleAbrirAnexar}
            disabled={!podeAnexar}
            aria-describedby={
              !podeAnexar && faixaDeBloqueioVisivel ? 'minuta-faixa-bloqueio' : undefined
            }
            title={podeAnexar ? undefined : (readiness.motivoBloqueioAnexo ?? undefined)}
            className={`${SECONDARY_OUTLINE_BTN} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            + Adicionar documento
          </button>
        </div>
      )}

      {/* Readiness faixa */}
      <Faixa
        ready={readiness.ready}
        motivoBloqueio={readiness.motivoBloqueio}
        mensagemSucesso={readiness.mensagemSucesso}
      />

      {/* Justificativa modal */}
      <SubstituirModal
        state={substModal}
        opportunityId={opportunityId}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />

      {/* Anexar documento modal (tipo + arquivo) */}
      <AnexarModal
        open={anexarOpen}
        opportunityId={opportunityId}
        loadTipos={loadTipos}
        anexar={anexar}
        onClose={() => setAnexarOpen(false)}
        onSuccess={handleAnexarSuccess}
      />
    </>
  );
}
