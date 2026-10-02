'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getInboxNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications/notifications.api';
import type { Notification } from '@/lib/notifications/notifications.types';

export type InboxStatus = 'loading' | 'ok' | 'error';

export interface UseInboxNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  status: InboxStatus;
  /** Re-fetches the inbox from the BFF. */
  reload: () => void;
  /**
   * Optimistically marks a single notification as read and calls the BFF.
   * Rolls back the UI state if the call fails.
   */
  markAsRead: (id: string) => Promise<void>;
  /**
   * Optimistically marks all notifications as read and calls the BFF.
   * Rolls back the UI state if the call fails.
   */
  markAllAsRead: () => Promise<void>;
}

/**
 * Manages the in-app notification inbox state (DASH-F5).
 *
 * - Fetches on mount.
 * - Revalidates when the tab regains focus (visibilitychange → visible).
 * - No continuous polling — cadence from the issue: tab-focus revalidation only.
 * - Optimistic mark-as-read with rollback on failure.
 */
export function useInboxNotifications(): UseInboxNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<InboxStatus>('loading');

  // Stable ref so the visibility listener always calls the latest version.
  const loadRef = useRef<() => void>(() => undefined);

  /**
   * Mirror of the rendered state, so the optimistic handlers can read what is on
   * screen *synchronously*, at the call site.
   *
   * Why not read it from the updater's `prev`: React invokes a
   * `setState(prev => …)` callback during render, not where it is called (it only
   * evaluates it eagerly while the hook queue is empty). A flag assigned inside
   * the updater is therefore read as `false` by the very next line, but as `true`
   * later, in the `catch` — which made the rollback asymmetric: it added back an
   * unread that had never been subtracted and left the badge one above the truth.
   */
  const snapshot = useRef({ notifications, unreadCount });
  snapshot.current = { notifications, unreadCount };

  const load = useCallback(async () => {
    try {
      const result = await getInboxNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);

  loadRef.current = load;

  useEffect(() => {
    void load();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadRef.current();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  const markAsRead = useCallback(async (id: string) => {
    // Decided BEFORE touching state, so the rollback undoes exactly what the
    // optimistic update did — never more.
    const wasUnread = snapshot.current.notifications.some(
      (n) => n.id === id && !n.read,
    );

    // Optimistic: flip the specific notification to read and decrement count.
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await markNotificationRead(id);
    } catch {
      // Rollback: only restore state that was actually changed.
      if (wasUnread) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
        );
        setUnreadCount((prev) => prev + 1);
      }
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Captured at the call site, for the same reason as `wasUnread` above.
    const previous = snapshot.current;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      // Rollback on failure.
      setNotifications(previous.notifications);
      setUnreadCount(previous.unreadCount);
    }
  }, []);

  return { notifications, unreadCount, status, reload: load, markAsRead, markAllAsRead };
}
