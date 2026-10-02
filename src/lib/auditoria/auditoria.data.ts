/**
 * Audit log data source (journey F14 — `/governanca`).
 *
 * Re-exports the real API client (`GET /api/auditoria` BFF → `GET
 * /v1/auditoria`). Components import from here — never from `.api` directly —
 * so tests can inject their own `load` prop without touching the wiring.
 */
export { listAuditoria, exportAuditoria } from './auditoria.api';
