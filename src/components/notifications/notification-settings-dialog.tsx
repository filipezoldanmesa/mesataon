'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { NotificationChannelsSection } from '@/components/notifications/notification-channels-section';
import { usePermissions } from '@/hooks/use-permissions';
import {
  getNotificationPreferences as defaultGetPreferences,
  updateNotificationPreferences as defaultUpdatePreferences,
} from '@/lib/notifications/notifications.data';
import type {
  NotificationChannel,
  NotificationChannelSetting,
  NotificationPreferencesResponse,
  UpdateNotificationPreferencesPayload,
} from '@/lib/notifications/notifications.types';

type Props = {
  open: boolean;
  onClose: () => void;
  getPreferences?: () => Promise<NotificationPreferencesResponse>;
  updatePreferences?: (
    payload: UpdateNotificationPreferencesPayload,
  ) => Promise<NotificationPreferencesResponse>;
};

/**
 * Diálogo **Notificações** do sino (21/09/2026).
 *
 * > *"Ao clicar no sininho, deve existir uma engrenagem no lado direito de
 * > Marcar todas como lidas. Ao clicar nesse item, devemos abrir um dialog com
 * > o título de Notificações e com uma seção chamada Canais (…)"*
 *
 * Decisões:
 *
 * - **Grava SÓ `canais`.** Mandar a grade evento × canal daqui exigiria que um
 *   diálogo de dois interruptores conhecesse o catálogo inteiro, e religar um
 *   canal voltaria com tudo ligado — apagando em silêncio o que a pessoa
 *   configurou item a item na antiga tela completa (o backend ainda honra
 *   essa grade para quem a gravou).
 * - **Carrega ao ABRIR, não ao montar.** O sino vive no cabeçalho de toda rota
 *   autenticada; buscar preferências em cada página seria uma requisição por
 *   navegação para uma tela que quase nunca é aberta.
 * - **Falha mantém o diálogo aberto com o que foi editado** — a frase do
 *   backend é o que explica a recusa, e fechar levaria a edição junto (mesma
 *   disciplina do modal de ajuste e do `ConfirmDialog`).
 * - **Não existe tela completa.** O rodapé trazia um link "Configurações
 *   avançadas" para `/notificacoes/preferencias`, retirado a pedido do negócio
 *   em 21/09/2026; a rota em si, que só abria por URL direta, saiu em
 *   29/09/2026. O diálogo é a superfície de preferência do produto — os dois
 *   interruptores de canal. A grade evento × canal segue no backend
 *   (`GET/PUT /v1/notifications/preferencias`), sem tela que a edite.
 * - **Perfil somente-leitura vê, mas não salva:** o `ReadOnlyProfileGuard`
 *   recusa todo `PUT` para Visualizador/Expansão. O diálogo esconde o "Salvar"
 *   e trava os interruptores, em vez de oferecer um controle que a API responde
 *   com 403. (Abrir a exceção no guard para
 *   preferência self-scoped é decisão de produto, fora desta entrega.)
 */
export function NotificationSettingsDialog({
  open,
  onClose,
  getPreferences = defaultGetPreferences,
  updatePreferences = defaultUpdatePreferences,
}: Props) {
  const { canWrite } = usePermissions();

  const [canais, setCanais] = useState<NotificationChannelSetting[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const prefs = await getPreferences();
      setCanais(prefs.canais ?? []);
      setStatus('ok');
    } catch (e) {
      setError(messageOf(e, 'Não foi possível carregar as preferências.'));
      setStatus('error');
    }
  }, [getPreferences]);

  // Load on OPEN (and reload on each open — another tab may have changed it).
  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  // Focus inside the dialog on open — keyed only on [open] so a parent re-render
  // that produces a new onClose reference does NOT yank keyboard focus away from
  // wherever the user has navigated inside the dialog.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // Esc closes — keyed on [open, onClose].
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleToggle(canal: NotificationChannel, next: boolean) {
    setCanais((prev) =>
      prev.map((c) => (c.canal === canal ? { ...c, habilitado: next } : c)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // The form submits on Enter even with the button hidden — guard here too.
    if (!canWrite || canais.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await updatePreferences({ canais });
      setCanais(updated.canais ?? canais);
      onClose();
    } catch (e) {
      setError(messageOf(e, 'Falha ao salvar as preferências de notificação.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-settings-title"
        data-testid="notification-settings-dialog"
        className="w-full max-w-[460px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-5 text-(--neutral-800) shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="notification-settings-title"
          className="text-(length:--t-h4) font-bold text-(--neutral-900)"
        >
          Notificações
        </h2>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="mt-4">
            {status === 'loading' && (
              <p className="py-6 text-center text-(length:--t-caption) text-(--neutral-500)">
                Carregando…
              </p>
            )}

            {status === 'error' && (
              <p
                role="alert"
                className="py-6 text-center text-(length:--t-caption) text-(--color-danger)"
              >
                {error ?? 'Não foi possível carregar as preferências.'}
              </p>
            )}

            {status === 'ok' && (
              <NotificationChannelsSection
                canais={canais}
                canSave={canWrite}
                onToggle={handleToggle}
                headingId="notification-settings-canais"
              />
            )}
          </div>

          {/* A save that fails keeps the dialog open — its message is inside it. */}
          {status === 'ok' && error && (
            <p
              role="alert"
              data-testid="notification-settings-error"
              className="mt-3 text-(length:--t-caption) text-(--color-danger)"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <div className="flex gap-2">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                disabled={saving}
                data-testid="notification-settings-cancel"
                className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-60"
              >
                {canWrite ? 'Cancelar' : 'Fechar'}
              </button>
              {/*
                `canais` vazio é resposta possível do backend (canal novo ainda
                não materializado, payload inesperado). Renderizar "Salvar"
                sobre lista vazia daria um botão que o guard de `handleSubmit`
                ignora em silêncio — clique sem efeito e sem explicação.
              */}
              {canWrite && status === 'ok' && canais.length > 0 && (
                <button
                  type="submit"
                  disabled={saving}
                  data-testid="notification-settings-save"
                  className="inline-flex items-center rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2.25 text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Frase exibível de um motivo de rejeição — nunca `String(cause)`, que
 * renderizaria `[object Object]`.
 */
function messageOf(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim() !== '') return cause.message;
  return fallback;
}
