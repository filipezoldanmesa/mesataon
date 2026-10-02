"use client";

import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FieldLabel } from "@/components/ui/field-label";
import { PicklistSelect } from "@/components/picklists/picklist-select";
import { Select } from "@/components/ui/select";
import { PicklistField } from "@/lib/picklists/picklists.types";
import { getProposal as defaultGetProposal } from "@/lib/proposals/proposal.data";
import type { ProposalSummary } from "@/lib/proposals/proposal.types";
import { isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import { withOneRetry } from "@/lib/with-retry";
import {
  deletePostoPhoto as defaultDeletePhoto,
  listPostoPhotos as defaultListPhotos,
  uploadPostoPhoto as defaultUploadPhoto,
} from "@/lib/proposals/posto-photos.data";
import { usePermissions } from "@/hooks/use-permissions";
import { usePhotoViewer } from "@/components/photo-viewer";
import { Permission } from "@/lib/auth-permissions";
import {
  BlocoAjusteAction,
  useProposalViewMode,
} from "@/components/proposals/proposal-view-mode";
import { BlocoProposta } from "@/lib/proposals/ajuste";
import type { PostoPhoto } from "@/lib/proposals/posto-photos.types";
import {
  ACCEPT_POSTO_PHOTO,
  PostoPhotoUploadError,
} from "@/lib/proposals/posto-photos.types";
import {
  PROPRIEDADE_IMOVEL_LABELS,
  SELECTABLE_PROPRIEDADES,
  SELECTABLE_TIPOS_POSTO,
  SITUACAO_POSTO_LABELS,
  TIPO_CONTRATO_USO_LABELS,
  TIPO_POSTO_LABELS,
} from "@/lib/proposals/posto-situation.labels";
import {
  getBandeiraAnp as defaultGetBandeiraAnp,
  getPostoSituation as defaultGetSituation,
  upsertPostoSituation as defaultUpsertSituation,
} from "@/lib/proposals/posto-situation.data";
// `PropriedadeImovel`/`SituacaoPosto`/`TipoPosto` are imported as VALUES, not
// just types: comparisons must be against a named member so a Salesforce rename
// breaks the build instead of silently never matching.
import {
  BandeiraAnpSource,
  BandeiraAnpStatus,
  PropriedadeImovel,
  SituacaoPosto,
  TipoPosto,
} from "@/lib/proposals/posto-situation.types";
import type {
  PostoSituation,
  TipoContratoUso,
  UpsertPostoSituationInput,
} from "@/lib/proposals/posto-situation.types";
import {
  PostoActivationConflictError,
  PostoSituationValidationError,
} from "@/lib/proposals/posto-situation.types";
import { computeContractDuration } from "@/lib/proposals/posto-situation.utils";
import { useConfirm } from "@/components/confirm-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * There is no `error-anp` here on purpose. The GET no longer fails for the ANP
 * — it serves the persisted situação with `bandeiraAnpStatus: INDISPONIVEL`,
 * and the gap is named inside the "Bandeira ANP" field. A card-level banner
 * would hide the very data the fix exists to keep visible.
 */
type LoadStatus = "loading" | "loaded" | "error";

interface FormState {
  tipoPosto: TipoPosto | "";
  situacaoPosto: SituacaoPosto | "";
  bandeiraFisica: string;
  propriedadeImovel: PropriedadeImovel | "";
  tipoContratoUso: TipoContratoUso | "";
  contratoRenovavel: "" | "true" | "false";
  prorrogacaoMeses: string;
  dataInicioUso: string;
  dataFimUso: string;
}

const EMPTY_FORM: FormState = {
  tipoPosto: "",
  situacaoPosto: "",
  bandeiraFisica: "",
  propriedadeImovel: "",
  tipoContratoUso: "",
  contratoRenovavel: "",
  prorrogacaoMeses: "",
  dataInicioUso: "",
  dataFimUso: "",
};

function situationToForm(situation: PostoSituation): FormState {
  return {
    tipoPosto: situation.tipoPosto,
    situacaoPosto: situation.situacaoPosto,
    bandeiraFisica: situation.bandeiraFisica,
    propriedadeImovel: situation.propriedadeImovel,
    tipoContratoUso: situation.tipoContratoUso ?? "",
    contratoRenovavel:
      situation.contratoRenovavel === null
        ? ""
        : situation.contratoRenovavel
          ? "true"
          : "false",
    prorrogacaoMeses:
      situation.prorrogacaoMeses != null
        ? String(situation.prorrogacaoMeses)
        : "",
    dataInicioUso: situation.dataInicioUso ?? "",
    dataFimUso: situation.dataFimUso ?? "",
  };
}

type Props = {
  proposalId: string;
  /** Reference instant for the "meses restantes" derivation; defaults to `new Date()`. Injectable for tests. */
  now?: Date;
  /** Injectable for tests; defaults to the API selector. */
  getSituation?: (id: string) => Promise<PostoSituation | null>;
  /**
   * Injectable for tests; defaults to the API selector. Resolves the ANP flag
   * BEFORE any situação exists, so the modal shows the consulta result on the
   * first register instead of a "resolved after save" placeholder.
   */
  getBandeiraAnp?: (id: string) => Promise<string | null>;
  /**
   * Proposal summary provided by the parent (`ProposalDetailPanel`) as part of
   * the shared single-fetch pattern (CA-5 / VBR-548). Supplies the proposal's
   * `finalidade` (CONTROLLING value of `Situacao_Atual_Posto__c` —
   * picklist doc: `A Construir`/`Em Construção` ← `Implantação`;
   * `Em Operação`/`Paralisado` ← the other 27 values).
   *
   * When absent, `getProposal` is used as a fallback (backward compat / tests).
   */
  proposalSummary?: ProposalSummary | null;
  /**
   * Injectable for tests; only called when `proposalSummary` is not passed.
   * Supplies the proposal's `finalidade` for the dependent picklist.
   */
  getProposal?: (id: string) => Promise<ProposalSummary>;
  /**
   * Injectable for tests; defaults to the API selector.
   * RN-F4-04/HU-06.1 is enforced server-side — `finalidade` is resolved
   * from the proposal record in `posto-situation.service.ts`.
   */
  upsertSituation?: (
    proposalId: string,
    input: UpsertPostoSituationInput,
  ) => Promise<PostoSituation>;
  /**
   * Injectable for tests; defaults to the API selector.
   *
   * The photos already stored for this proposal. Without this read the block
   * accumulated uploads only in component state, so every reload rendered
   * "Nenhuma foto anexada ainda" over photos that were persisted — the upload
   * reported success and looked undone.
   */
  listPhotos?: (proposalId: string) => Promise<PostoPhoto[]>;
  /** Injectable for tests; defaults to the API selector. */
  uploadPhoto?: (proposalId: string, file: File) => Promise<PostoPhoto>;
  /** Injectable for tests; defaults to the API selector. */
  deletePhoto?: (proposalId: string, photoId: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Prototype `.in` field style (03-proposta-nova.html) — same classes as
 * `DS_INPUT` in `product-lines-block.tsx`: flat surface, bottom border only,
 * green focus. Never the rounded-bordered style.
 */
/**
 * Bottom-border input style — prototype `.in` (03-proposta-nova.html).
 * Used for `<input>` elements. `<select>` → `<Select>` DS component (no className).
 * Disabled tokens: --disabled-bg (#f4f5f5), --disabled-text (#767676) from globals.css.
 */
const INPUT_CLASS =
  "w-full min-w-0 bg-(--neutral-40) border-0 border-b-2 border-(--neutral-600) rounded-none px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800) placeholder:text-(--neutral-500) focus:outline-none focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:bg-(--disabled-bg) disabled:border-(--neutral-200) disabled:text-(--disabled-text)";

function DetailField({
  label,
  value,
  testId,
  /**
   * The text is a NAMED GAP, not data — rendered muted and unbolded so it
   * cannot be mistaken for a value read from the source.
   */
  gap = false,
  /**
   * Qualifies the value without competing with it — used to say the data came
   * from a dated snapshot rather than a live read.
   */
  note,
}: {
  label: string;
  value: string;
  testId?: string;
  gap?: boolean;
  note?: string | null;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-[12px] uppercase tracking-wide text-(--color-text-muted)">
        {label}
      </div>
      <div
        className={
          gap
            ? "break-words text-(length:--t-caption) text-(--color-text-muted)"
            : "break-words text-(length:--t-caption) font-bold"
        }
      >
        {value}
      </div>
      {note ? (
        <div className="break-words text-[11px] text-(--color-text-muted)">
          {note}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the "Bandeira ANP" field says when there is no bandeira to show.
 *
 * `SEM_REGISTRO` and `INDISPONIVEL` both arrive with `bandeiraAnp: null`, and
 * printing the same `—` for both makes the screen assert "consultamos e não
 * há registro" while the ANP is actually unreachable — the exact confusion the
 * backend's `bandeiraAnpStatus` exists to remove.
 */
function bandeiraAnpDisplay(situation: PostoSituation): {
  value: string;
  gap: boolean;
  note?: string | null;
} {
  if (situation.bandeiraAnp) {
    return {
      value: situation.bandeiraAnp,
      gap: false,
      note: mirroredAnpNote(situation),
    };
  }
  return situation.bandeiraAnpStatus === BandeiraAnpStatus.SemRegistro
    ? { value: "Sem registro na ANP", gap: true }
    : { value: "Não foi possível consultar a ANP", gap: true };
}

/**
 * When the bandeira came from the local copy of the ANP register (ADR-0041),
 * it is real data — so it renders as data — but it may be a few days old, and
 * only the screen can tell the user that.
 *
 * The date is formatted by string surgery, not `new Date()`: parsing
 * `YYYY-MM-DD` as a Date treats it as UTC midnight and can print the previous
 * day in Brazil.
 */
function mirroredAnpNote(situation: PostoSituation): string | null {
  if (situation.bandeiraAnpSource !== BandeiraAnpSource.CadastroAnp)
    return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    situation.bandeiraAnpAsOf ?? "",
  );
  // An unusable date is dropped rather than rendered as "Invalid Date": the
  // useful half of the sentence is that this came from the register copy.
  return match
    ? `Cadastro ANP de ${match[3]}/${match[2]}/${match[1]}`
    : "Cadastro ANP (consulta ao vivo indisponível)";
}

function CriticasAlert({ criticas }: { criticas: string[] }) {
  if (criticas.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="criticas-alert"
      className="mt-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-(length:--t-caption) text-(--yellow-700)"
    >
      <ul className="list-inside list-disc">
        {criticas.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

function PhotoGrid({
  photos,
  onDelete,
  onOpenPhoto,
  deletingId,
  showDelete = true,
  status = "loaded",
  onRetry,
}: {
  photos: PostoPhoto[];
  onDelete: (photoId: string) => void;
  /**
   * Abre a foto no {@link PhotoViewer} do chamador.
   *
   * O grid lista NOMES, não miniaturas — e sem esta ação o arquivo enviado era
   * evidência write-only: o LT anexava e não tinha como conferir se subiu o
   * certo (relato do stage, 10/09/2026). Vale mais desde que a dropzone aceita
   * PDF, em que o nome do arquivo diz ainda menos sobre o conteúdo.
   */
  onOpenPhoto: (photoId: string) => void;
  deletingId: string | null;
  /** false while the proposal is under analysis — edits are closed. */
  showDelete?: boolean;
  /**
   * Load state of the list. A failed read must NOT render the empty message:
   * "nenhuma foto anexada" is an assertion about the proposal, and making it
   * over a failed read is what told the LT the upload had been undone.
   */
  status?: LoadStatus;
  onRetry?: () => void;
}) {
  if (status === "loading") {
    return (
      <p
        role="status"
        aria-label="Carregando fotos do posto…"
        className="text-[14px] italic text-(--color-text-muted)"
        data-testid="photos-loading"
      >
        Carregando fotos…
      </p>
    );
  }

  if (status === "error") {
    return (
      <p
        role="alert"
        className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
        data-testid="photos-error"
      >
        Falha ao carregar as fotos do posto.
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 font-bold underline"
          >
            Tentar novamente
          </button>
        )}
      </p>
    );
  }

  if (photos.length === 0) {
    return (
      <p
        className="text-[14px] italic text-(--color-text-muted)"
        data-testid="photos-empty"
      >
        Nenhuma foto anexada ainda.
      </p>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-3 gap-2" data-testid="photo-grid">
      {photos.map((photo) => (
        <div
          key={photo.id}
          data-testid="photo-item"
          className="flex items-center justify-between gap-2 rounded-[var(--radius-xs)] border border-(--color-border) p-2 text-[14px]"
        >
          {/*
           * O nome É o controle de abrir — um <button> de verdade, não um
           * onClick no <span>: é a única rota até o arquivo, então tem de ser
           * alcançável por teclado e anunciada como ação.
           */}
          <button
            type="button"
            onClick={() => onOpenPhoto(photo.id)}
            title={photo.fileName}
            aria-label={`Ver ${photo.fileName}`}
            data-testid={`foto-abrir-${photo.id}`}
            className="min-w-0 flex-1 truncate text-left font-bold text-(--secondary-700) hover:underline"
          >
            {photo.fileName}
          </button>
          {showDelete && (
            <button
              type="button"
              onClick={() => onDelete(photo.id)}
              disabled={deletingId === photo.id}
              aria-label={`Remover foto ${photo.fileName}`}
              className="shrink-0 font-bold text-(--red-700) hover:underline disabled:opacity-50"
            >
              {deletingId === photo.id ? "Removendo…" : "Remover"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function SituationModal({
  initial,
  bandeiraAnp,
  anpPlaceholder,
  finalidade,
  onSave,
  onClose,
  isSaving,
  errorMessage,
  photos,
  photosStatus,
  onRetryPhotos,
  onUploadPhoto,
  onDeletePhoto,
  uploadingPhoto,
  deletingPhotoId,
  photoError,
}: {
  initial: FormState;
  /** ANP-sourced flag, display-only (prototype: disabled input). `null` until the first save resolves it. */
  bandeiraAnp: string | null;
  /**
   * Placeholder shown while `bandeiraAnp` is null — distinguishes "consultando",
   * "sem registro na ANP" and "ANP indisponível", which must not collapse.
   */
  anpPlaceholder: string;
  /** Proposal `finalidade` — controlling value for `Situacao_Atual_Posto__c`. */
  finalidade: string | null;
  onSave: (input: UpsertPostoSituationInput) => void;
  onClose: () => void;
  isSaving: boolean;
  errorMessage: string | null;
  photos: PostoPhoto[];
  photosStatus: LoadStatus;
  onRetryPhotos: () => void;
  onUploadPhoto: (file: File) => void;
  onDeletePhoto: (photoId: string) => void;
  uploadingPhoto: boolean;
  deletingPhotoId: string | null;
  photoError: string | null;
}) {
  /** Read-only profiles cannot submit (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  const [form, setForm] = useState<FormState>(initial);
  const [validationError, setValidationError] = useState<string | null>(null);

  /*
   * O valor JÁ GRAVADO que a lista selecionável não contém mais é acrescentado
   * às opções — a lista foi estreitada de 7 para 4 (ADO 68153: só quatro
   * `Tipo_De_Posto__c` são expostos pelos RecordTypes do objeto). Sem isto o
   * `<select>` cairia no placeholder e o save seguinte APAGARIA a resposta.
   * Mesma disciplina do `keepsPersisted` do `PicklistSelect`.
   */
  const tiposPostoOferecidos = useMemo<readonly TipoPosto[]>(
    () =>
      form.tipoPosto && !SELECTABLE_TIPOS_POSTO.includes(form.tipoPosto)
        ? [...SELECTABLE_TIPOS_POSTO, form.tipoPosto]
        : SELECTABLE_TIPOS_POSTO,
    [form.tipoPosto],
  );

  /*
   * O visualizador vive AQUI DENTRO, e não no bloco: os dois overlays são
   * `z-[200]`, então quem vem depois no DOM pinta por cima — um viewer
   * renderizado no bloco (antes do modal) abriria ATRÁS dele.
   */
  const photoViewer = usePhotoViewer(photos);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      /*
       * O visualizador escuta o mesmo `Escape` no `document`. Sem esta guarda um
       * único Esc fecharia os dois, e o formulário meio preenchido iria junto —
       * o usuário só queria fechar a foto.
       */
      if (photoViewer.isOpen) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, photoViewer.isOpen]);

  const isTerceiro = form.propriedadeImovel === PropriedadeImovel.DeTerceiros;
  const isRenovavel = form.contratoRenovavel === "true";
  /*
   * Prototype parity (03-proposta-nova `toggleImovel`): the imóvel fields are
   * on screen from the start — the prototype pre-selects "De terceiro", and a
   * picklist value must never be born selected here, so the fields render
   * DISABLED until "De terceiros" is the answer. They disappear only on an
   * explicit non-terceiro answer, exactly like the prototype.
   */
  const showImovelFields = form.propriedadeImovel === "" || isTerceiro;
  const imovelDisabled = !isTerceiro;

  function handleSubmit(e: React.FormEvent) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    e.preventDefault();
    setValidationError(null);

    /*
     * Name the fields that are missing, never "preencha todos os campos" — same
     * fix and same reason as `financial-resources-block`: the branch right below
     * already names its own missing fields, so the generic sentence was the one
     * path that made the user hunt for which control was empty.
     */
    const faltando = [
      !form.tipoPosto && "Tipo de posto",
      !form.situacaoPosto && "Situação do posto",
      !form.bandeiraFisica.trim() && "Bandeira física",
      !form.propriedadeImovel && "Propriedade do imóvel",
    ].filter((label): label is string => typeof label === "string");

    if (faltando.length > 0) {
      setValidationError(
        faltando.length === 1
          ? `Informe ${faltando[0]}.`
          : `Informe: ${faltando.join(", ")}.`,
      );
      return;
    }

    if (isTerceiro) {
      if (
        !form.tipoContratoUso ||
        !form.contratoRenovavel ||
        !form.dataInicioUso ||
        !form.dataFimUso
      ) {
        setValidationError(
          "Tipo de contrato de uso, contrato renovável, início e fim são obrigatórios quando o imóvel é de terceiro (RN-F4-02).",
        );
        return;
      }

      if (new Date(form.dataFimUso) < new Date(form.dataInicioUso)) {
        setValidationError(
          "Fim do contrato de uso não pode ser anterior ao início.",
        );
        return;
      }

      if (isRenovavel && !form.prorrogacaoMeses.trim()) {
        setValidationError(
          "Prorrogação (meses) é obrigatória quando o contrato é renovável.",
        );
        return;
      }
    }

    const input: UpsertPostoSituationInput = {
      tipoPosto: form.tipoPosto as TipoPosto,
      situacaoPosto: form.situacaoPosto as SituacaoPosto,
      bandeiraFisica: form.bandeiraFisica.trim(),
      propriedadeImovel: form.propriedadeImovel as PropriedadeImovel,
      ...(isTerceiro
        ? {
            tipoContratoUso: form.tipoContratoUso as TipoContratoUso,
            contratoRenovavel: isRenovavel,
            dataInicioUso: form.dataInicioUso,
            dataFimUso: form.dataFimUso,
            ...(isRenovavel
              ? { prorrogacaoMeses: Number(form.prorrogacaoMeses) }
              : {}),
          }
        : {}),
    };

    onSave(input);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => onUploadPhoto(file));
    e.target.value = "";
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Situação do posto e do imóvel"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-[var(--radius-md)] bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,.3)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h4 className="text-(length:--t-h4) font-bold">
            Situação do posto e do imóvel
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            &times;
          </button>
        </div>

        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-(--color-text-muted)">
          Característica do posto
        </div>
        <div className="mb-3 grid grid-cols-2 items-end gap-3">
          <div className="min-w-0">
            <FieldLabel htmlFor="ps-tipo-posto" required>
              Tipo de posto
            </FieldLabel>
            {/*
              Rendered from the SELECTABLE list, not from the label map. The label
              map deliberately keeps inactive and legacy members so a stored value
              still displays (`SERVICOS_URBANOS`, `A Construir / Em Construção`) —
              offering those for selection produced options the API rejects with
              400. Display and selection are different questions.

              O valor JÁ GRAVADO que não está mais na lista é acrescentado às
              opções (ADO 68153 estreitou-a de 7 para 4): sem isso o `<select>`
              cairia no placeholder e o próximo save APAGARIA a resposta do LT.
              Mesma regra do seletor de área de venda.
            */}
            <Select
              id="ps-tipo-posto"
              value={form.tipoPosto}
              onChange={(v) =>
                setForm((f) => ({ ...f, tipoPosto: v as TipoPosto }))
              }
              options={tiposPostoOferecidos.map((v) => ({
                value: v,
                label: TIPO_POSTO_LABELS[v],
              }))}
            />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="ps-situacao" required>
              Situação atual do posto
            </FieldLabel>
            {/*
              `Situacao_Atual_Posto__c` is dependent on `Finalidade_Cotacao__c`
              (picklist doc + prototype `toggleSituacao`): `Implantação` enables
              `A Construir`/`Em Construção`; the other finalidades enable
              `Em Operação`/`Paralisado`. The block fetches the proposal's
              finalidade and the catalog filters — RN-F4-04 remains enforced
              server-side (409) as the backstop.
            */}
            <PicklistSelect
              id="ps-situacao"
              field={PicklistField.PostoSituacao}
              controllingValue={finalidade}
              controllingLabel="a finalidade da proposta"
              value={form.situacaoPosto}
              onChange={(value) =>
                setForm((f) => ({
                  ...f,
                  situacaoPosto: value as SituacaoPosto,
                }))
              }
            />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 items-end gap-3">
          <div className="min-w-0">
            <FieldLabel htmlFor="ps-bandeira-anp">
              Bandeira ANP (site ANP)
            </FieldLabel>
            {/*
              Display-only (prototype: disabled `.in` input). The value is
              resolved server-side from the ANP by `postoRef` on save — the
              user never types it, so it is NOT part of FormState.
            */}
            <input
              id="ps-bandeira-anp"
              className={INPUT_CLASS}
              value={bandeiraAnp ?? ""}
              placeholder={anpPlaceholder}
              disabled
            />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="ps-bandeira-fisica" required>
              Bandeira do posto (física)
            </FieldLabel>
            {/*
              Divergência deliberada do protótipo (`03-proposta-nova.html:333`,
              um `<input>` livre): o destino é
              `Situacao_Atual_Posto_Imovel_Cotacao__c.Bandeira_Posto__c`, uma
              picklist **restrita** de 7 valores — texto fora dela é omitido no
              PATCH e o campo fica vazio no CRM, que é o ADO 68153. Um `<input>`
              alimentando picklist restrita é a mesma classe de defeito do
              "2 de 51" do incoterm.

              Valor livre já gravado continua visível: o `PicklistSelect`
              preserva o valor persistido que o catálogo não devolve
              (`keepsPersisted`), então o próximo save não apaga a resposta
              anterior do LT.
            */}
            <PicklistSelect
              id="ps-bandeira-fisica"
              field={PicklistField.PostoBandeira}
              value={form.bandeiraFisica}
              onChange={(value) =>
                setForm((f) => ({ ...f, bandeiraFisica: value }))
              }
            />
          </div>
        </div>

        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-(--color-text-muted)">
          Situação atual do imóvel
        </div>
        <div className="mb-3 grid grid-cols-2 items-end gap-3">
          <div className="min-w-0">
            <FieldLabel htmlFor="ps-propriedade" required>
              Propriedade do imóvel
            </FieldLabel>
            <Select
              id="ps-propriedade"
              value={form.propriedadeImovel}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  propriedadeImovel: v as PropriedadeImovel,
                  // RN-F4-02: clear contrato de uso fields when leaving TERCEIRO.
                  // Named member, never a literal — the old 'TERCEIRO' string
                  // predates the picklist catalog's API names.
                  ...(v !== PropriedadeImovel.DeTerceiros
                    ? {
                        tipoContratoUso: "",
                        contratoRenovavel: "",
                        prorrogacaoMeses: "",
                        dataInicioUso: "",
                        dataFimUso: "",
                      }
                    : {}),
                }))
              }
              options={SELECTABLE_PROPRIEDADES.map((v) => ({
                value: v,
                label: PROPRIEDADE_IMOVEL_LABELS[v],
              }))}
            />
          </div>

          {showImovelFields && (
            <div className="min-w-0">
              <FieldLabel htmlFor="ps-tcu" required>
                Tipo de contrato de uso
              </FieldLabel>
              <Select
                id="ps-tcu"
                value={form.tipoContratoUso}
                disabled={imovelDisabled}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    tipoContratoUso: v as TipoContratoUso,
                  }))
                }
                options={(
                  Object.keys(TIPO_CONTRATO_USO_LABELS) as TipoContratoUso[]
                ).map((v) => ({
                  value: v,
                  label: TIPO_CONTRATO_USO_LABELS[v],
                }))}
              />
            </div>
          )}
        </div>

        {showImovelFields && (
          <>
            <div className="mb-3 grid grid-cols-2 items-end gap-3">
              <div className="min-w-0">
                <FieldLabel htmlFor="ps-renovavel" required>
                  Contrato renovável?
                </FieldLabel>
                <Select
                  id="ps-renovavel"
                  value={form.contratoRenovavel}
                  disabled={imovelDisabled}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      contratoRenovavel: v as FormState["contratoRenovavel"],
                      ...(v !== "true" ? { prorrogacaoMeses: "" } : {}),
                    }))
                  }
                  options={[
                    { value: "true", label: "Sim" },
                    { value: "false", label: "Não" },
                  ]}
                />
              </div>

              {/* Hidden until renovável = Sim — the grid slot is preserved
                  (prototype uses visibility:hidden on prorrWrap). Inline style,
                  not the Tailwind `invisible` class: jsdom computes no CSS, so
                  the visibility assertion in tests only sees inline styles. */}
              <div
                className="min-w-0"
                style={{
                  visibility: isTerceiro && isRenovavel ? "visible" : "hidden",
                }}
              >
                <FieldLabel htmlFor="ps-prorrogacao" required>
                  Prorrogação (meses)
                </FieldLabel>
                <input
                  id="ps-prorrogacao"
                  type="number"
                  min={1}
                  step={1}
                  className={INPUT_CLASS}
                  value={form.prorrogacaoMeses}
                  disabled={imovelDisabled || !isRenovavel}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, prorrogacaoMeses: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 items-end gap-3">
              <div className="min-w-0">
                <FieldLabel htmlFor="ps-ini" required>
                  Início (contrato de uso)
                </FieldLabel>
                <input
                  id="ps-ini"
                  type="date"
                  className={INPUT_CLASS}
                  value={form.dataInicioUso}
                  disabled={imovelDisabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dataInicioUso: e.target.value }))
                  }
                />
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor="ps-fim" required>
                  Fim (contrato de uso)
                </FieldLabel>
                <input
                  id="ps-fim"
                  type="date"
                  className={INPUT_CLASS}
                  value={form.dataFimUso}
                  disabled={imovelDisabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dataFimUso: e.target.value }))
                  }
                />
              </div>
            </div>
          </>
        )}

        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-(--color-text-muted)">
          Fotos do posto e do imóvel{" "}
          <span className="font-normal normal-case tracking-normal text-(--color-text-muted)">
            · obrigatórias na análise
          </span>
        </div>
        <label className="mb-2 block cursor-pointer rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-4 text-center text-(--color-text-muted) hover:bg-(--neutral-25)">
          <span className="block text-(length:--t-caption) font-bold">
            {uploadingPhoto
              ? "Enviando…"
              : "Arraste as fotos aqui ou clique para selecionar"}
          </span>
          <span className="mt-1 block text-(length:--t-small)">
            Fachada, pista, loja de conveniência e terreno · PDF, PNG ou JPEG
          </span>
          <input
            type="file"
            accept={ACCEPT_POSTO_PHOTO}
            multiple
            className="hidden"
            disabled={uploadingPhoto}
            onChange={handleFileChange}
            aria-label="Selecionar fotos do posto e do imóvel"
          />
        </label>
        {photoError && (
          <div
            role="alert"
            data-testid="photo-error"
            className="mb-2 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-(length:--t-small) text-(--red-700)"
          >
            {photoError}
          </div>
        )}
        <PhotoGrid
          photos={photos}
          onDelete={onDeletePhoto}
          onOpenPhoto={photoViewer.open}
          deletingId={deletingPhotoId}
          status={photosStatus}
          onRetry={onRetryPhotos}
        />
        {photoViewer.viewer}

        {(validationError || errorMessage) && (
          <div
            role="alert"
            data-testid="modal-error"
            className="mt-3 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-(length:--t-small) text-(--red-700)"
          >
            {validationError ?? errorMessage}
          </div>
        )}

        {/* Prototype footer has a single "Concluir" CTA — closing without saving is the × / Esc / backdrop. */}
        <div className="mt-4 flex justify-end gap-3 border-t border-(--color-border) pt-3.5">
          {/* Also disabled mid-photo-upload: submitting while the upload is in
              flight can close the modal before the upload settles (or save a
              situação whose photo then fails silently). */}
          <button
            type="submit"
            disabled={isSaving || uploadingPhoto}
            className="rounded-[var(--radius-xxs)] bg-(--secondary-600) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-700) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "Salvando…"
              : uploadingPhoto
                ? "Enviando foto…"
                : "Concluir"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PostoSituationBlock({
  proposalId,
  now,
  getSituation = defaultGetSituation,
  getBandeiraAnp = defaultGetBandeiraAnp,
  proposalSummary,
  getProposal = defaultGetProposal,
  upsertSituation = defaultUpsertSituation,
  listPhotos = defaultListPhotos,
  uploadPhoto = defaultUploadPhoto,
  deletePhoto = defaultDeletePhoto,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  /** Confirmação das ações destrutivas desta tela. */
  const confirm = useConfirm();

  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [situation, setSituation] = useState<PostoSituation | null>(null);
  /**
   * Controlling value for `Situacao_Atual_Posto__c` (dependent picklist).
   * `null` until the proposal loads — the modal's select stays disabled with a
   * hint rather than offering pairs the CRM's own UI forbids.
   */
  const [finalidade, setFinalidade] = useState<string | null>(null);
  /**
   * ANP lookup for the FIRST register (no situação yet): the modal shows the
   * consulta result live. Once a situação exists, `situation.bandeiraAnp`
   * (resolved by the GET) is the source instead.
   */
  const [anpLookup, setAnpLookup] = useState<{
    status: "loading" | "loaded" | "error";
    value: string | null;
  }>({ status: "loading", value: null });

  const [modalOpen, setModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<PostoPhoto[]>([]);
  /**
   * Load state of the photo list, kept apart from `photos` because an empty
   * array is a business statement ("nenhuma foto anexada") and a failed read is
   * not — flattening the two is what made a stored photo read as detached.
   */
  const [photosStatus, setPhotosStatus] = useState<LoadStatus>("loading");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  /*
   * Instância PRÓPRIA do visualizador, separada da do modal: os dois overlays
   * são `z-[200]` e quem vem depois no DOM pinta por cima, então uma instância
   * só, renderizada aqui, abriria ATRÁS do modal quando ele estivesse aberto.
   */
  const blocoPhotoViewer = usePhotoViewer(photos);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Incremented on each fetchSituation call; lets in-flight .then callbacks
  // detect that a newer fetch has superseded them (e.g. proposalId changed
  // while the component stayed mounted).
  const fetchGenRef = useRef(0);

  const fetchSituation = useCallback(() => {
    setLoadStatus("loading");
    const gen = ++fetchGenRef.current;

    withOneRetry(() => getSituation(proposalId))
      .then((situationResult) => {
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setSituation(situationResult);
        setLoadStatus("loaded");

        // First register: resolve the ANP flag live so the modal shows the
        // consulta result, not a "resolved after save" placeholder. When a
        // situação exists, its GET already resolved the flag.
        if (situationResult === null) {
          withOneRetry(() => getBandeiraAnp(proposalId))
            .then((bandeira) => {
              if (!mountedRef.current || fetchGenRef.current !== gen) return;
              setAnpLookup({ status: "loaded", value: bandeira });
            })
            .catch(() => {
              if (!mountedRef.current || fetchGenRef.current !== gen) return;
              setAnpLookup({ status: "error", value: null });
            });
        }
      })
      .catch((err: unknown) => {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setLoadStatus("error");
      });

    // Independent of the situation load: only feeds the dependent picklist.
    // On failure the modal's situação select stays disabled (deny-safe) — the
    // block itself still renders.
    //
    // CA-5 (VBR-548): when `proposalSummary` is provided by the parent
    // (ProposalDetailPanel), use it directly — no additional fetch needed.
    if (proposalSummary !== undefined) {
      if (mountedRef.current && fetchGenRef.current === gen) {
        setFinalidade(proposalSummary?.finalidade ?? null);
      }
    } else {
      withOneRetry(() => getProposal(proposalId))
        .then((proposal) => {
          if (!mountedRef.current || fetchGenRef.current !== gen) return;
          setFinalidade(proposal.finalidade);
        })
        .catch(() => {
          if (!mountedRef.current || fetchGenRef.current !== gen) return;
          setFinalidade(null);
        });
    }
  }, [proposalId, getSituation, getBandeiraAnp, proposalSummary, getProposal]);

  useEffect(() => {
    fetchSituation();
  }, [fetchSituation]);

  /**
   * Photos already stored for this proposal.
   *
   * Separate from {@link fetchSituation} on purpose: the two reads hit
   * different endpoints and degrade independently — a photo-listing failure
   * must not blank the situação card, and vice versa.
   */
  const photosGenRef = useRef(0);

  const fetchPhotos = useCallback(() => {
    setPhotosStatus("loading");
    const gen = ++photosGenRef.current;

    withOneRetry(() => listPhotos(proposalId))
      .then((result) => {
        if (!mountedRef.current || photosGenRef.current !== gen) return;
        setPhotos(result);
        setPhotosStatus("loaded");
      })
      .catch((err: unknown) => {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        if (!mountedRef.current || photosGenRef.current !== gen) return;
        setPhotosStatus("error");
      });
  }, [proposalId, listPhotos]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleSave = useCallback(
    async (input: UpsertPostoSituationInput) => {
      setIsSaving(true);
      setModalError(null);
      try {
        const result = await upsertSituation(proposalId, input);
        if (!mountedRef.current) return;
        setSituation(result);
        setModalOpen(false);
      } catch (err) {
        if (!mountedRef.current) return;
        if (
          err instanceof PostoActivationConflictError ||
          err instanceof PostoSituationValidationError
        ) {
          setModalError(err.message);
        } else {
          setModalError(
            "Falha ao salvar a situação do posto. Tente novamente.",
          );
        }
      } finally {
        if (mountedRef.current) setIsSaving(false);
      }
    },
    [proposalId, upsertSituation],
  );

  const handleUploadPhoto = useCallback(
    async (file: File) => {
      setUploadingPhoto(true);
      setPhotoError(null);
      try {
        const photo = await uploadPhoto(proposalId, file);
        if (!mountedRef.current) return;
        // Invalidate any list read still in flight: its response predates this
        // upload and would drop the photo that was just added.
        photosGenRef.current += 1;
        setPhotos((prev) => [...prev, photo]);
        setPhotosStatus("loaded");
      } catch (err) {
        if (!mountedRef.current) return;
        setPhotoError(
          err instanceof PostoPhotoUploadError
            ? err.message
            : "Falha ao enviar a foto. Tente novamente.",
        );
      } finally {
        if (mountedRef.current) setUploadingPhoto(false);
      }
    },
    [proposalId, uploadPhoto],
  );

  const handleDeletePhoto = useCallback(
    async (photoId: string) => {
      setDeletingPhotoId(photoId);
      try {
        await deletePhoto(proposalId, photoId);
        if (!mountedRef.current) return;
        photosGenRef.current += 1;
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      } finally {
        if (mountedRef.current) setDeletingPhotoId(null);
      }
    },
    [proposalId, deletePhoto],
  );

  const initialForm = useMemo<FormState>(
    () => (situation ? situationToForm(situation) : EMPTY_FORM),
    [situation],
  );

  const duration = useMemo(
    () =>
      situation
        ? computeContractDuration(
            situation.dataInicioUso,
            situation.dataFimUso,
            now,
          )
        : null,
    [situation, now],
  );

  function maskValue(value: string): string {
    return value;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Prototype: every `.block` card collapses from its own header (ciclo1.js
  // `initCollapse`), starting expanded.
  const collapse = useCardCollapse();
  return (
    <section
      aria-labelledby="posto-situation-title"
      {...collapse.sectionProps}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      {confirm.dialog}
      <div {...collapse.headProps} className="mb-1 flex items-center gap-2.5">
        <h3
          id="posto-situation-title"
          className="text-(length:--t-h4) font-bold"
        >
          Situação do posto e do imóvel
        </h3>
        <BlocoAjusteAction bloco={BlocoProposta.Situacao} />
        <CardCollapseToggle {...collapse.toggleProps} />
      </div>

      {loadStatus === "loading" && (
        <div
          role="status"
          aria-label="Carregando situação do posto…"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="loading-state"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando…
        </div>
      )}

      {loadStatus === "error" && (
        <div
          role="alert"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          data-testid="load-error-state"
        >
          Falha ao carregar a situação do posto. Verifique sua conexão e tente
          novamente.
          <button
            type="button"
            onClick={fetchSituation}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loadStatus === "loaded" && situation === null && (
        <div data-testid="empty-state-wrapper">
          <div
            className="mb-3 rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
            data-testid="empty-state"
          >
            Nenhuma situação cadastrada ainda.
          </div>
          {/* Write control: hidden for a read-only profile (the API answers 403). */}
          {canWrite && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
            >
              + Cadastrar situação do posto e imóvel
            </button>
          )}
        </div>
      )}

      {loadStatus === "loaded" && situation !== null && (
        <div data-testid="filled-state">
          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-(--color-text-muted)">
            Característica do posto
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <DetailField
              label="Tipo de posto"
              value={TIPO_POSTO_LABELS[situation.tipoPosto]}
            />
            <DetailField
              label="Situação atual"
              value={SITUACAO_POSTO_LABELS[situation.situacaoPosto]}
            />
            <DetailField
              label="Bandeira ANP"
              testId="bandeira-anp-field"
              {...bandeiraAnpDisplay(situation)}
            />
            <DetailField
              label="Bandeira física"
              value={maskValue(situation.bandeiraFisica)}
            />
          </div>

          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-(--color-text-muted)">
            Situação atual do imóvel
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <DetailField
              label="Propriedade"
              value={PROPRIEDADE_IMOVEL_LABELS[situation.propriedadeImovel]}
            />
            {situation.propriedadeImovel === PropriedadeImovel.DeTerceiros && (
              <>
                <DetailField
                  label="Tipo de contrato de uso"
                  value={
                    situation.tipoContratoUso
                      ? TIPO_CONTRATO_USO_LABELS[situation.tipoContratoUso]
                      : "—"
                  }
                />
                <DetailField
                  label="Renovável?"
                  value={situation.contratoRenovavel ? "Sim" : "Não"}
                />
              </>
            )}
          </div>

          {duration && (
            <p
              className="mb-2 text-(length:--t-small) text-(--color-text-muted)"
              data-testid="contract-duration"
            >
              Duração do contrato de uso: <b>{duration.totalMeses}</b> meses ·
              Restantes: <b>{duration.restantesMeses}</b> meses
            </p>
          )}

          <CriticasAlert criticas={situation.criticas} />

          <div className="mt-3.5 mb-1.5 flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-wide text-(--color-text-muted)">
            <span>
              Fotos do posto e do imóvel{" "}
              <span className="font-normal normal-case tracking-normal">
                · obrigatórias na análise
              </span>
            </span>
            <BlocoAjusteAction bloco={BlocoProposta.Fotos} />
          </div>
          <PhotoGrid
            photos={photos}
            onDelete={(id) =>
              confirm.ask({
                title: "Remover foto do posto?",
                description: `"${photos.find((p) => p.id === id)?.fileName ?? "A foto"}" é excluída do armazenamento de documentos e sai da conferência da SNEG.`,
                confirmLabel: "Remover",
                tone: "danger",
                onConfirm: () => handleDeletePhoto(id),
              })
            }
            onOpenPhoto={blocoPhotoViewer.open}
            deletingId={deletingPhotoId}
            showDelete={canWrite}
            status={photosStatus}
            onRetry={fetchPhotos}
          />
          {blocoPhotoViewer.viewer}

          {canWrite && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3.5 rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
            >
              Editar situação do posto e imóvel
            </button>
          )}
        </div>
      )}

      {modalOpen && (
        <SituationModal
          initial={initialForm}
          bandeiraAnp={(() => {
            const value = situation ? situation.bandeiraAnp : anpLookup.value;
            return value ? maskValue(value) : null;
          })()}
          anpPlaceholder={
            situation || anpLookup.status === "loaded"
              ? "Não encontrada na ANP"
              : anpLookup.status === "loading"
                ? "Consultando ANP…"
                : "ANP indisponível"
          }
          finalidade={finalidade}
          onSave={(input) => void handleSave(input)}
          onClose={() => {
            setModalOpen(false);
            setModalError(null);
            setPhotoError(null);
          }}
          isSaving={isSaving}
          errorMessage={modalError}
          photos={photos}
          photosStatus={photosStatus}
          onRetryPhotos={fetchPhotos}
          onUploadPhoto={(file) => void handleUploadPhoto(file)}
          onDeletePhoto={(id) => void handleDeletePhoto(id)}
          uploadingPhoto={uploadingPhoto}
          deletingPhotoId={deletingPhotoId}
          photoError={photoError}
        />
      )}
    </section>
  );
}
