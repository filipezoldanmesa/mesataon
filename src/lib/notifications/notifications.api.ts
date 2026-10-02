/**
 * BFF client for the notification domain (DASH-F5).
 *
 * Delegates to the BFF routes at `/api/notifications/*`, which proxy to the
 * backend injecting the httpOnly session cookie as a Bearer token — no token
 * handling here.
 */

import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  InboxResult,
  NotificationPreferencesResponse,
  UpdateNotificationPreferencesPayload,
} from './notifications.types';

async function ensureOk(res: Response, action: string): Promise<Response> {
  if (!res.ok) await throwApiError(res, action);
  return res;
}

/* -------------------------------------------------------------------------- */
/* Inbox (bell)                                                               */
/* -------------------------------------------------------------------------- */

/**
 * BFF: GET /api/notifications/inbox
 *
 * Fetches the authenticated user's notification inbox.
 */
export async function getInboxNotifications(): Promise<InboxResult> {
  const res = await fetch(withBasePath('/api/notifications/inbox'), {
    // Always fresh — stale notification counts break the badge.
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Falha ao carregar as notificações (${res.status}).`);
  }

  return (await res.json()) as InboxResult;
}

/**
 * BFF: POST /api/notifications/inbox/:id/ler
 *
 * Marks a single notification as read. Self-scoped (each user marks their own
 * inbox entries) — no additional permission gate on the FE.
 */
export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(
    withBasePath(`/api/notifications/inbox/${encodeURIComponent(id)}/ler`),
    { method: 'POST' },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao marcar a notificação como lida');
  }
}

/**
 * BFF: POST /api/notifications/inbox/ler-todas
 *
 * Marks all of the authenticated user's notifications as read.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(withBasePath('/api/notifications/inbox/ler-todas'), {
    method: 'POST',
  });

  if (!res.ok) {
    await throwApiError(res, 'Falha ao marcar todas as notificações como lidas');
  }
}

/* -------------------------------------------------------------------------- */
/* Preferences panel (RN-F5-02/04)                                            */
/* -------------------------------------------------------------------------- */

/**
 * `GET /api/notifications/preferencias`
 *
 * Returns the authenticated user's preferences, defaulting to the catalog
 * defaults for combinations that have not been saved yet.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferencesResponse> {
  const res = await fetch(withBasePath('/api/notifications/preferencias'));
  await ensureOk(res, 'Falha ao carregar as preferências de notificação');
  return (await res.json()) as NotificationPreferencesResponse;
}

/**
 * `PUT /api/notifications/preferencias`
 *
 * Saves the user's preferences. Throws {@link ApiValidationError} for 400
 * (event not in catalog, channel not supported, opt-out of mandatory event,
 * cadenciaDias < 1).
 */
export async function updateNotificationPreferences(
  payload: UpdateNotificationPreferencesPayload,
): Promise<NotificationPreferencesResponse> {
  const res = await fetch(withBasePath('/api/notifications/preferencias'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await ensureOk(res, 'Falha ao salvar as preferências de notificação');
  return (await res.json()) as NotificationPreferencesResponse;
}
