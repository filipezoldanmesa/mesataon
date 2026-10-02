/**
 * Data source for the notification settings dialog (DASH-F5 — RN-F5-02/04).
 *
 * Always delegates to the real BFF endpoints. Tests inject their own stub
 * functions via prop injection on the dialog component.
 */
export {
  getNotificationPreferences,
  updateNotificationPreferences,
} from './notifications.api';
