import type { BackendInboxResponse, BackendNotification, InboxResult, Notification } from './notifications.types';

/**
 * Maps a single backend notification (Portuguese fields) to the FE shape.
 *
 * `href` is passed through verbatim — the backend owns URL resolution.
 * Constructing the destination from the event type here would diverge the
 * moment the backend adds a new event kind.
 */
export function mapNotification(b: BackendNotification): Notification {
  return {
    id: b.id,
    title: b.titulo,
    createdAt: b.createdAt,
    // The API has no `lida` boolean: it sends `lidaEm`, the timestamp of WHEN
    // the user read it (kept for "when did I read this"). Presence is the read
    // state; the instant itself is not shown in the bell.
    read: b.lidaEm !== null,
    href: b.link,
  };
}

/**
 * Maps the inbox envelope to the {@link InboxResult} the FE consumes.
 *
 * `unreadCount` comes from the backend's pre-computed field — the FE uses it
 * as the initial badge value, then tracks its own optimistic state from there.
 *
 * The list arrives in `items` (`InboxResponseDto`). Reading it from
 * `notificacoes` — a field the API never sent — threw on every load and turned
 * the bell into a permanent 500 from the BFF.
 */
export function mapBackendInbox(b: BackendInboxResponse): InboxResult {
  return {
    notifications: b.items.map(mapNotification),
    unreadCount: b.naoLidas,
  };
}
