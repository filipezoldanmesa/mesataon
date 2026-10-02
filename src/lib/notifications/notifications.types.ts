/**
 * Types for the notification domain (DASH-F5).
 *
 * Two slices share this file:
 * - the inbox/bell (`GET /v1/notifications/inbox`, VBR-442);
 * - the preferences panel (RN-F5-02/04), mirroring the backend DTOs
 *   (`notification-event.dto.ts` / `notification-preference.dto.ts`).
 *
 * No value is hardcoded here — the catalog and supported channels come from
 * the API.
 */

/* -------------------------------------------------------------------------- */
/* Inbox (bell)                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Backend `GET /v1/notifications/inbox` item shape — `InboxItemDto`.
 *
 * Transcribed from `apps/api/src/notifications/dto/notification-inbox.dto.ts`
 * and the `InboxItemDto` schema in `apps/api/openapi.yaml`, NOT invented here.
 * The previous version of this interface described fields the API never sends
 * (`criadaEm`, `lida`, `href`), which made the whole inbox unreadable — see the
 * note on {@link BackendInboxResponse}.
 */
export interface BackendNotification {
  id: string;
  /** Stable catalog event code (e.g. `PENDENCIA_ABERTA`). */
  evento: string;
  titulo: string;
  /** Body text, PII-free. Not rendered by the bell today. */
  mensagem: string;
  /**
   * Destination URL resolved by the backend at creation time — never built on
   * the FE. `null` for events with no navigable aggregate.
   */
  link: string | null;
  referenciaTipo: string | null;
  referenciaId: string | null;
  /** ISO-8601 timestamp of when the user read it. `null` = unread. */
  lidaEm: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * Backend inbox envelope returned by `GET /v1/notifications/inbox` —
 * `InboxResponseDto`.
 *
 * ⚠️ The list field is `items`, not `notificacoes`, and read state is the
 * `lidaEm` TIMESTAMP, not a `lida` boolean. The earlier shape here was
 * fabricated, and because the mapper's own test used the same fabricated
 * fixture, it stayed green while `GET /api/notifications/inbox` answered **500**
 * on every page load (`b.notificacoes.map` on `undefined`). Mirror the DTO and
 * the openapi schema — never guess.
 */
export interface BackendInboxResponse {
  items: BackendNotification[];
  /** Total matching the filter, before pagination. */
  total: number;
  /** Current page, `null` when not paginated. */
  page: number | null;
  /** Page size, `null` when not paginated. */
  limit: number | null;
  hasMore: boolean;
  /**
   * Global unread total for the user — always global, regardless of the
   * `?naoLidas=true` filter. Feeds the bell badge.
   */
  naoLidas: number;
}

/**
 * Frontend notification shape (English, camelCase).
 */
export interface Notification {
  id: string;
  title: string;
  /** ISO-8601 creation timestamp — relative time is derived in the FE. */
  createdAt: string;
  read: boolean;
  /**
   * Destination URL resolved by the backend. `null` when the originating event
   * has no navigable aggregate — the row is then plain text, never a link to
   * `#` or to a path assembled here.
   */
  href: string | null;
}

/**
 * Result of the inbox fetch as consumed by the FE.
 */
export interface InboxResult {
  notifications: Notification[];
  unreadCount: number;
}

/* -------------------------------------------------------------------------- */
/* Preferences panel                                                          */
/* -------------------------------------------------------------------------- */

/** Canais de entrega suportados (RN-F5-01). */
export type NotificationChannel = 'CHAT' | 'EMAIL';

/**
 * Ordem e rótulo dos interruptores da seção "Canais" (21/09/2026).
 *
 * Espelha `NOTIFICATION_CHANNELS` do backend. A lista renderizada vem SEMPRE da
 * resposta (`canais`) — esta constante só decide rótulo e ordem, para que um
 * canal novo no backend apareça na tela como o código dele em vez de sumir.
 */
export const NOTIFICATION_CHANNEL_ORDER: readonly NotificationChannel[] = [
  'EMAIL',
  'CHAT',
];

/** Rótulo pt-BR de cada canal. */
export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
  EMAIL: 'E-mail',
  CHAT: 'Teams',
};

/** Uma entrada de preferência (evento × canal) retornada pelo GET. */
export interface NotificationPreferenceEntry {
  evento: string;
  canal: NotificationChannel;
  habilitado: boolean;
  obrigatorio: boolean;
}

/**
 * Interruptor geral de um CANAL — a seção "Canais" (21/09/2026).
 *
 * Eixo próprio, ao lado da grade evento × canal: esta responde *"quero ser
 * avisado por este meio?"*, aquela *"quero este aviso?"*. A entrega exige as
 * duas verdadeiras, e quem conjuga é o backend.
 */
export interface NotificationChannelSetting {
  canal: NotificationChannel;
  habilitado: boolean;
}

/** Resposta do `GET /api/notifications/preferencias`. */
export interface NotificationPreferencesResponse {
  preferencias: NotificationPreferenceEntry[];
  /**
   * Sempre materializado para todos os canais da plataforma, ligados por
   * default. A tela renderiza o que vier aqui — nunca uma lista própria.
   */
  canais: NotificationChannelSetting[];
  cadenciaDias: number;
}

/** Uma entrada de preferência para o `PUT /api/notifications/preferencias`. */
export interface NotificationPreferenceInput {
  evento: string;
  canal: NotificationChannel;
  habilitado: boolean;
}

/**
 * Corpo do `PUT /api/notifications/preferencias`.
 *
 * ⚠️ Os três campos são opcionais e o backend recusa o corpo sem nenhum deles:
 * o diálogo do sino manda só `canais`. A grade evento × canal segue aceita
 * pelo backend (a tela que a editava saiu em 29/09/2026, mas o que já foi
 * gravado continua valendo); enviá-la a partir do diálogo apagaria essa
 * granularidade.
 */
export interface UpdateNotificationPreferencesPayload {
  preferencias?: NotificationPreferenceInput[];
  canais?: NotificationChannelSetting[];
  cadenciaDias?: number;
}
