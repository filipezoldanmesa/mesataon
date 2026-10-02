'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { BellIcon, GearIcon } from '@/components/icons';
import { NotificationSettingsDialog } from '@/components/notifications/notification-settings-dialog';
import { useInboxNotifications } from '@/hooks/use-inbox-notifications';
import { formatRelativeTime } from '@/lib/notifications/format-relative-time';
import type { Notification } from '@/lib/notifications/notifications.types';

/**
 * One inbox row.
 *
 * The backend resolves the destination at creation time and sends `link: null`
 * for events with no navigable aggregate. Such a row is rendered as plain text,
 * not as a link: `<Link href={null}>` crashes the router, and substituting `#`
 * or a path assembled here would offer navigation that goes nowhere. Marking as
 * read still works, because that is inbox state, not navigation.
 */
function NotificationRow({
  notification: n,
  onActivate,
}: {
  notification: Notification;
  onActivate: () => void;
}) {
  const body = (
    <div className="flex items-start gap-2">
      {!n.read && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-(--secondary-500)" />
      )}
      <div className={!n.read ? '' : 'pl-4'}>
        <p className="text-sm font-medium leading-snug">{n.title}</p>
        <p className="mt-0.5 text-xs text-(--neutral-500)">
          {formatRelativeTime(n.createdAt)}
        </p>
      </div>
    </div>
  );

  if (n.href === null) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="block w-full px-4 py-3 text-left hover:bg-(--neutral-40)"
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      href={n.href}
      onClick={onActivate}
      className="block px-4 py-3 hover:bg-(--neutral-40)"
    >
      {body}
    </Link>
  );
}

/**
 * In-app notification bell for the `HeaderNav` (DASH-F5).
 *
 * - Shows a badge with the number of unread notifications (hidden when 0).
 * - Clicking opens a dropdown listing the inbox.
 * - Clicking an item navigates to its `href` and marks it as read (optimistic).
 * - "Marcar todas como lidas" marks all optimistically with rollback on failure.
 * - The gear to its right opens the "Notificações" dialog (channel switches).
 * - Dropdown closes on outside click or Escape.
 * - Inbox is revalidated whenever the tab regains focus — no continuous polling.
 *
 * Mutation (markNotificationRead / markAllNotificationsRead) is inbox-scoped:
 * every authenticated user may mark their own entries. No permission gate on
 * the FE; the API enforces ownership server-side.
 */
export function NotificationBell() {
  const { notifications, unreadCount, status, markAsRead, markAllAsRead } =
    useInboxNotifications();

  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Close on outside click or Escape (same pattern as the user menu in HeaderNav).
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const el = detailsRef.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && detailsRef.current) detailsRef.current.open = false;
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const ariaLabel =
    unreadCount > 0
      ? `Notificações — ${unreadCount} não lida${unreadCount === 1 ? '' : 's'}`
      : 'Notificações';

  return (
    <>
      <details ref={detailsRef} className="group relative shrink-0">
        <summary
          aria-label={ariaLabel}
          className="relative flex cursor-pointer list-none items-center justify-center rounded-full p-2 text-white transition-colors hover:bg-white/20 [&::-webkit-details-marker]:hidden"
        >
          <BellIcon className="size-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-(--secondary-500) px-1 py-0 text-[10px] font-bold leading-[1.125rem] text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </summary>

        {/* Dropdown panel */}
        <div
          /* `w-80` is 320px and the panel is anchored to its trigger's right edge,
             so on a narrow screen it grew leftwards past the viewport and widened
             the document. The clamp keeps it inside the screen; `w-80` still wins
             wherever there is room. */
          className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-black/10 bg-white text-(--neutral-800) shadow-lg"
          role="menu"
          aria-label="Notificações"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-(--neutral-100) px-4 py-2.5">
            <span className="text-sm font-semibold">Notificações</span>
            <div className="flex items-center gap-2">
              {notifications.some((n) => !n.read) && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="text-xs text-(--primary-500) hover:underline"
                >
                  Marcar todas como lidas
                </button>
              )}
              {/*
                The gear sits to the RIGHT of "Marcar todas como lidas" and is
                rendered UNCONDITIONALLY — that link only exists while something is
                unread, and a settings entry that disappears once the inbox is
                clean is missing exactly when the user goes looking for it.

                Opening the dialog closes the dropdown: the dialog is a sibling of
                the <details> (inside it, closing the details would unmount the
                dialog mid-edit), so leaving the panel open would layer it over the
                modal.
              */}
              <button
                type="button"
                aria-label="Configurações de notificação"
                title="Configurações de notificação"
                onClick={() => {
                  if (detailsRef.current) detailsRef.current.open = false;
                  setSettingsOpen(true);
                }}
                className="flex items-center justify-center rounded p-1 text-(--neutral-500) transition-colors hover:bg-(--neutral-40) hover:text-(--neutral-800)"
              >
                <GearIcon className="size-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <ul className="max-h-96 overflow-y-auto" role="list">
            {status === 'error' && (
              <li className="px-4 py-6 text-center text-sm text-(--neutral-500)">
                Não foi possível carregar as notificações.
              </li>
            )}

            {status === 'loading' && (
              <li className="px-4 py-6 text-center text-sm text-(--neutral-500)">
                Carregando…
              </li>
            )}

            {status === 'ok' && notifications.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-(--neutral-500)">
                Você está em dia
              </li>
            )}

            {status === 'ok' &&
              notifications.map((n) => (
                <li
                  key={n.id}
                  role="menuitem"
                  className={`border-b border-(--neutral-100) last:border-0 transition-opacity ${
                    n.read ? 'opacity-60' : 'opacity-100'
                  }`}
                >
                  <NotificationRow
                    notification={n}
                    onActivate={() => {
                      void markAsRead(n.id);
                      if (detailsRef.current) detailsRef.current.open = false;
                    }}
                  />
                </li>
              ))}
          </ul>
        </div>
      </details>

      <NotificationSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
