'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConfirm } from '@/components/confirm-dialog';
import { usePhotoViewer } from '@/components/photo-viewer';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  AddRowButton,
  Alert,
  DField,
  DGrid,
  FieldLabel,
  SectionUnavailable,
  SubBox,
} from '@/components/franquia/franquia-ui';
import { FapPotencialModal } from '@/components/franquia/proposta-franquia-modais';
import {
  deleteFap as defaultDeleteFap,
  fapStreamUrl as defaultFapStreamUrl,
  setPotencial as defaultSetPotencial,
  uploadFap as defaultUploadFap,
  FapUploadError,
  type FapDocumentoUploaded,
  type SetPotencialResult,
} from '@/lib/franquia/proposta-franquia.data';
import {
  deletePostoPhoto as defaultDeletePhoto,
  listPostoPhotos as defaultListPhotos,
  uploadPostoPhoto as defaultUploadPhoto,
} from '@/lib/proposals/posto-photos.data';
import { PostoPhotoUploadError, ehAnexoPdf } from '@/lib/proposals/posto-photos.types';
import { PdfThumb } from '@/components/pdf-thumb';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';
import type { PostoPhoto } from '@/lib/proposals/posto-photos.types';
import type {
  FapPotencialData,
  FrqSectionResult,
} from '@/lib/franquia/proposta-franquia-mapping';
import {
  formatBrlString,
  formatFileSize,
  maskMoneyInput,
  parseMoneyInput,
} from '@/lib/franquia/format';

type Props = {
  opportunityId: string;
  proposalId: string;
  fap: FrqSectionResult<FapPotencialData>;
  /** `vereditos.editavelPorFranquia.fapPotencialFotos` — the backend's verdict. */
  editavel: boolean;
  /** `vereditos.parecerExigidoAlerta` — pt-BR sentence composed by the backend. */
  parecerExigido: boolean | null;
  parecerExigidoAlerta: string | null;
  /** Called after a successful mutation so the screen reloads the read model. */
  onChanged: () => void;

  // Injectable for tests.
  uploadFap?: typeof defaultUploadFap;
  deleteFap?: typeof defaultDeleteFap;
  setPotencial?: typeof defaultSetPotencial;
  fapStreamUrl?: typeof defaultFapStreamUrl;
  listPhotos?: (proposalId: string) => Promise<PostoPhoto[]>;
  uploadPhoto?: (proposalId: string, file: File) => Promise<PostoPhoto>;
  deletePhoto?: (proposalId: string, photoId: string) => Promise<void>;
};

/**
 * "FAP e potencial do ponto" sub-section (FRQ-11).
 *
 * Three write paths, each backed by a real endpoint:
 *  - FAP PDF   → `POST/DELETE .../franquia/:proposalId/fap`, previewed through
 *                the BFF stream route (no presigned URL in the browser).
 *  - Potencial → `PATCH .../franquia/:proposalId/potencial`.
 *  - Fotos     → the existing `proposals/:id/posto-photos` routes; a franchise
 *                proposal is a Proposal, so no parallel endpoint is needed.
 *
 * The J10 limit verdict is NOT computed here: `parecerExigido` and its pt-BR
 * sentence arrive ready from the read model (RN-F4-02). The screen must never
 * compare the potential against a threshold of its own.
 */
export function FapPotencialSection({
  opportunityId,
  proposalId,
  fap,
  editavel,
  parecerExigido,
  parecerExigidoAlerta,
  onChanged,
  uploadFap = defaultUploadFap,
  deleteFap = defaultDeleteFap,
  setPotencial = defaultSetPotencial,
  fapStreamUrl = defaultFapStreamUrl,
  listPhotos = defaultListPhotos,
  uploadPhoto = defaultUploadPhoto,
  deletePhoto = defaultDeletePhoto,
}: Props) {
  const { can, canWrite } = usePermissions();
  const confirm = useConfirm();

  // Write is allowed only when the profile holds the permission mirroring the
  // route's `@Roles(...)` AND the read model says this block is editable.
  const podeEditar =
    canWrite && can(Permission.FranquiaPropostaManage) && editavel;

  const data = fap.status === 'ok' ? fap.data : null;

  /*
   * As fotos vivem numa lista própria (`GET .../posto-photos`), fora do read
   * model — então `onChanged` sozinho não as recarrega. Um contador é o sinal
   * "releia agora", e não um booleano: dois envios seguidos são dois eventos.
   */
  const [recarregarFotosEm, setRecarregarFotosEm] = useState(0);

  return (
    <>
      {/* No inner SubHeading: this sub-section lives in its own card, whose
          Block title already reads "FAP e potencial do ponto" — repeating it
          right below rendered a duplicated heading. */}
      {fap.status === 'unavailable' ? (
        <SectionUnavailable
          testId="fap-unavailable"
          message={
            fap.error
              ? `FAP e potencial indisponíveis (${fap.error}).`
              : undefined
          }
        />
      ) : (
        <SubBox>
          {/*
           * Modelo do protótipo: a grade é DADO e a edição acontece no modal
           * (`.addrow` → "FAP e potencial do ponto"). Na tela de criação estes
           * mesmos campos vivem dentro do `#dadModal`; aqui eles têm card
           * próprio (FRQ-14), mas o jeito de responder é o mesmo.
           */}
          <DGrid>
            <DField
              label="Potencial de franquia"
              value={formatBrlString(data?.potencialBrl)}
              testId="potencial-valor"
            />
            <DField
              label="FAP (valor de referência)"
              value={formatBrlString(data?.fapBrl)}
              testId="fap-valor"
            />
            <DField
              label="Share tabaco"
              value={data?.shareTabacoPerc ?? null}
              testId="fap-share-tabaco"
            />
          </DGrid>

          <div className="mt-3.5">
            <FapField
              opportunityId={opportunityId}
              proposalId={proposalId}
              documento={data?.fapDocumento ?? null}
              podeEditar={podeEditar}
              onChanged={onChanged}
              deleteFap={deleteFap}
              fapStreamUrl={fapStreamUrl}
              confirm={confirm}
            />
          </div>

          <FotosDoPonto
            proposalId={proposalId}
            podeEditar={podeEditar}
            listPhotos={listPhotos}
            deletePhoto={deletePhoto}
            confirm={confirm}
            recarregarEm={recarregarFotosEm}
            onChanged={onChanged}
          />

          {podeEditar && (
            <FapEdicao
              opportunityId={opportunityId}
              proposalId={proposalId}
              potencialBrl={data?.potencialBrl ?? null}
              temFap={(data?.fapDocumento ?? null) !== null}
              onChanged={() => {
                setRecarregarFotosEm((n) => n + 1);
                onChanged();
              }}
              uploadFap={uploadFap}
              setPotencial={setPotencial}
              uploadPhoto={uploadPhoto}
            />
          )}
        </SubBox>
      )}

      {/* J10 verdict — composed by the backend, rendered verbatim (RN-F4-02). */}
      {parecerExigidoAlerta !== null ? (
        <Alert tone={parecerExigido ? 'warn' : 'ok'} testId="parecer-exigido-alerta">
          {parecerExigidoAlerta}
        </Alert>
      ) : (
        <Alert tone="info" testId="parecer-exigido-pendente">
          O limite de potencial é parametrizado (J10) e define se o parecer do
          coordenador de franquia é exigido — informe o potencial para avaliar.
        </Alert>
      )}

      {confirm.dialog}
    </>
  );
}

// ---------------------------------------------------------------------------
// FAP (PDF)
// ---------------------------------------------------------------------------

type ConfirmApi = ReturnType<typeof useConfirm>;

function FapField({
  opportunityId,
  proposalId,
  documento,
  podeEditar,
  onChanged,
  deleteFap,
  fapStreamUrl,
  confirm,
}: {
  opportunityId: string;
  proposalId: string;
  documento: { id: string; fileName: string; sizeBytes: number } | null;
  podeEditar: boolean;
  onChanged: () => void;
  deleteFap: (
    opportunityId: string,
    proposalId: string,
    docId: string,
  ) => Promise<void>;
  fapStreamUrl: (
    opportunityId: string,
    proposalId: string,
    docId: string,
  ) => string;
  confirm: ConfirmApi;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(() => {
    if (!podeEditar || documento === null) return;
    confirm.ask({
      title: 'Remover a FAP?',
      description: `"${documento.fileName}" é excluída do armazenamento de documentos e a proposta volta a ficar sem FAP para o envio à análise.`,
      confirmLabel: 'Remover',
      tone: 'danger',
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          await deleteFap(opportunityId, proposalId, documento.id);
          onChanged();
        } catch (err) {
          // Surfaced on this block; rethrown so the dialog stays open on failure.
          setError('Falha ao remover a FAP. Tente novamente.');
          throw err;
        } finally {
          setBusy(false);
        }
      },
    });
  }, [podeEditar, documento, confirm, deleteFap, opportunityId, proposalId, onChanged]);

  return (
    <div>
      <FieldLabel htmlFor="fap-upload">FAP (Ficha de Avaliação de Ponto)</FieldLabel>

      {/* Anexar é do modal (`.addrow` → "FAP e potencial do ponto"); aqui a FAP
          é DADO, com a remoção ao lado. Duas zonas de anexo para o mesmo
          arquivo — uma no card e outra no modal — deixariam a resposta com dois
          donos na mesma tela. */}
      {documento === null ? (
        <p className="text-[14px] italic text-(--color-text-muted)" data-testid="fap-empty">
          Nenhuma FAP anexada.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={fapStreamUrl(opportunityId, proposalId, documento.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] font-bold text-(--secondary-700) underline"
            data-testid="fap-link"
          >
            ✓ {documento.fileName}
          </a>
          <span className="text-[12px] text-(--color-text-muted)">
            {formatFileSize(documento.sizeBytes)}
          </span>
          {podeEditar && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="text-[12px] font-bold text-(--color-danger) underline disabled:opacity-50"
              data-testid="fap-remover"
            >
              Remover
            </button>
          )}
        </div>
      )}

      {error !== null && (
        <p className="mt-2 text-[14px] text-(--color-danger)" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fotos do ponto
// ---------------------------------------------------------------------------

function FotosDoPonto({
  proposalId,
  podeEditar,
  listPhotos,
  deletePhoto,
  confirm,
  recarregarEm,
  onChanged,
}: {
  proposalId: string;
  podeEditar: boolean;
  listPhotos: (proposalId: string) => Promise<PostoPhoto[]>;
  deletePhoto: (proposalId: string, photoId: string) => Promise<void>;
  confirm: ConfirmApi;
  /** Contador "releia agora" — sobe a cada envio feito pelo modal. */
  recarregarEm: number;
  /**
   * Revalida o read model do host (sendbar e pendências).
   *
   * ⚠️ Faltava: remover a FOTO recarregava só a lista deste bloco, então o
   * contador de pendências da barra continuava o de antes até alguém recarregar
   * a página — enquanto remover a FAP, ao lado, revalidava. Medido em staging
   * em 05/09/2026 (a barra dizia "Ver 2 pendências" com a foto já removida; o
   * reload mostrava 3).
   */
  onChanged: () => void;
}) {
  const [photos, setPhotos] = useState<PostoPhoto[]>([]);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clicking a thumbnail opens the photo full-size. The viewer is fed the
  // CURRENT list, so a photo removed while it is open closes it instead of
  // leaving a stream URL that now 404s on screen.
  const viewer = usePhotoViewer(photos);

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      setPhotos(await listPhotos(proposalId));
      setStatus('loaded');
    } catch {
      // A transport failure must NOT render as "nenhuma foto enviada" — that
      // empty state is a business assertion (CLAUDE.md §"Erro nunca vira vazio").
      setStatus('error');
    }
  }, [listPhotos, proposalId]);

  useEffect(() => {
    void reload();
    // `recarregarEm` é o sinal do modal: um envio novo pede releitura.
  }, [reload, recarregarEm]);

  const handleDelete = useCallback(
    (photo: PostoPhoto) => {
      if (!podeEditar) return;
      confirm.ask({
        title: 'Remover a foto?',
        description: `"${photo.fileName}" é excluída do armazenamento de documentos e sai da composição da proposta de franquia.`,
        confirmLabel: 'Remover',
        tone: 'danger',
        onConfirm: async () => {
          setBusy(true);
          setError(null);
          try {
            await deletePhoto(proposalId, photo.id);
            await reload();
            onChanged();
          } catch (err) {
            setError('Falha ao remover a foto. Tente novamente.');
            throw err;
          } finally {
            setBusy(false);
          }
        },
      });
    },
    [podeEditar, confirm, deletePhoto, proposalId, reload, onChanged],
  );

  return (
    <div className="mt-3.5">
      <FieldLabel>Fotos do ponto</FieldLabel>

      {/* Anexar é do modal; aqui as fotos são DADO, com a remoção por item. */}
      {status === 'loading' && (
        <p className="mt-2 text-[14px] text-(--color-text-muted)" data-testid="fotos-loading">
          Carregando fotos…
        </p>
      )}

      {status === 'error' && (
        <p className="mt-2 text-[14px] text-(--color-danger)" data-testid="fotos-error" role="alert">
          Não foi possível carregar as fotos do ponto. Tente recarregar a página.
        </p>
      )}

      {status === 'loaded' && photos.length === 0 && (
        <p className="mt-2 text-[14px] italic text-(--color-text-muted)" data-testid="fotos-empty">
          Nenhuma foto enviada ainda.
        </p>
      )}

      {status === 'loaded' && photos.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-2.5" data-testid="fotos-grid">
          {photos.map((photo) => {
            /*
             * `photo.url` vem de resposta HTTP, e este é o ponto em que ela
             * deixa de ser string qualquer para virar um caminho same-origin
             * reconstruído (CWE-73).
             */
            const fonte = urlDeMidiaSegura(photo.url);

            return (
              <li
                key={photo.id}
                className="relative h-[86px] w-[118px] overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-50)"
              >
                {/*
                 * A real <button>, not an onClick on the <img>: the thumbnail is
                 * the only way into the full-size photo, so it has to be reachable
                 * by keyboard and announced as an action.
                 *
                 * The remove "×" stays a SIBLING of this button — nesting it would
                 * be invalid HTML and would make it unreachable by keyboard.
                 */}
                <button
                  type="button"
                  onClick={() => viewer.open(photo.id)}
                  aria-label={
                    ehAnexoPdf(photo)
                      ? `Abrir ${photo.fileName}`
                      : `Ver ${photo.fileName} em tamanho real`
                  }
                  data-testid={`foto-abrir-${photo.id}`}
                  className="block h-full w-full cursor-zoom-in"
                >
                  {ehAnexoPdf(photo) ? (
                    /* PDF não tem thumbnail: o <img> cairia no erro de carga. */
                    <PdfThumb fileName={photo.fileName} />
                  ) : (
                    /* Recusada, a miniatura não renderiza — o nome do arquivo
                       abaixo continua, então a foto não some da lista nem vira
                       imagem quebrada. */
                    fonte !== null && (
                      // eslint-disable-next-line @next/next/no-img-element -- BFF stream URL, not a static asset
                      <img
                        src={fonte}
                        alt={photo.fileName}
                        className="h-full w-full object-cover"
                      />
                    )
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[12px] text-white">
                    {photo.fileName}
                  </span>
                </button>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    disabled={busy}
                    aria-label={`Remover ${photo.fileName}`}
                    className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error !== null && (
        <p className="mt-2 text-[14px] text-(--color-danger)" role="alert">
          {error}
        </p>
      )}

      {viewer.viewer}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edição — botão do protótipo (.addrow) + modal com os MESMOS campos da criação
// ---------------------------------------------------------------------------

/**
 * Potencial, FAP e fotos são gravados por TRÊS rotas independentes — é
 * exatamente por isso que este bloco tem card próprio nesta tela (FRQ-14). O
 * modal junta as três perguntas, como o `#dadModal` da criação faz, e cada uma
 * só é chamada quando há o que enviar.
 *
 * ⚠️ Não são atômicas: uma falha no meio deixa o que já subiu gravado. A
 * mensagem nomeia o que falhou em vez de afirmar que nada foi salvo.
 */
function FapEdicao({
  opportunityId,
  proposalId,
  potencialBrl,
  temFap,
  onChanged,
  uploadFap,
  setPotencial,
  uploadPhoto,
}: {
  opportunityId: string;
  proposalId: string;
  potencialBrl: string | null;
  temFap: boolean;
  onChanged: () => void;
  uploadFap: (
    opportunityId: string,
    proposalId: string,
    file: File,
  ) => Promise<FapDocumentoUploaded>;
  setPotencial: (
    opportunityId: string,
    proposalId: string,
    potencialBrl: number,
  ) => Promise<SetPotencialResult>;
  uploadPhoto: (proposalId: string, file: File) => Promise<PostoPhoto>;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const potencialMascarado =
    potencialBrl === null
      ? ''
      : maskMoneyInput(String(Math.round(Number(potencialBrl) * 100)));

  const handleSave = useCallback(
    async (value: { potencial: string; fapFile: File | null; fotos: File[] }) => {
      setSalvando(true);
      setError(null);
      try {
        const parsed = parseMoneyInput(value.potencial);
        if (parsed !== null && value.potencial !== potencialMascarado) {
          await setPotencial(opportunityId, proposalId, parsed);
        }
        if (value.fapFile !== null) {
          await uploadFap(opportunityId, proposalId, value.fapFile);
        }
        for (const foto of value.fotos) {
          await uploadPhoto(proposalId, foto);
        }
        setAberto(false);
        onChanged();
      } catch (err) {
        /* O modal fica ABERTO: os arquivos escolhidos são o payload, e fechá-lo
           obrigaria o usuário a selecioná-los de novo. */
        setError(
          err instanceof FapUploadError || err instanceof PostoPhotoUploadError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Falha ao salvar a FAP e o potencial.',
        );
      } finally {
        setSalvando(false);
      }
    },
    [
      potencialMascarado,
      setPotencial,
      uploadFap,
      uploadPhoto,
      opportunityId,
      proposalId,
      onChanged,
    ],
  );

  return (
    <>
      <AddRowButton onClick={() => setAberto(true)} testId="abrir-fap">
        {temFap || potencialBrl !== null
          ? 'Editar FAP e potencial'
          : '+ Cadastrar FAP e potencial'}
      </AddRowButton>

      {aberto && (
        <FapPotencialModal
          potencial={potencialMascarado}
          salvando={salvando}
          error={error}
          onCancel={() => setAberto(false)}
          onSave={(value) => void handleSave(value)}
        />
      )}
    </>
  );
}
