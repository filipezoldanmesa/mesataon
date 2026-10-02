/**
 * Feature flags
 * =============
 * Compile-time constants that gate incomplete or experimental UI.
 *
 * HOW TO USE
 * ----------
 * Import the flag where needed and wrap the gated code in a conditional:
 *
 *   import { ENABLE_CREATE_PROSPECT } from '@/lib/feature-flags';
 *   {ENABLE_CREATE_PROSPECT && <ProspectOption />}
 *
 * HOW TO ENABLE
 * -------------
 * Flip the constant to `true` here and restart the dev server (or redeploy).
 * Tests that cover both states should mock this module:
 *
 *   vi.mock('@/lib/feature-flags', () => ({ ENABLE_CREATE_PROSPECT: true }));
 */

/**
 * Controls the "Criar prospect (sem CNPJ)" option inside the client-search
 * dropdown on the Nova Oportunidade form, and the accompanying
 * "⚠ Prospect sem CNPJ" warning card.
 *
 * Set to `false` (off by default) — the feature is not yet wired to the
 * backend prospect-creation flow and must not be shown in production until
 * that integration is complete.
 */
export const ENABLE_CREATE_PROSPECT = false;

/**
 * Controls the "Anexar e resolver" submit button on a pendência de documento
 * (F3 ticket screen).
 *
 * Set to `true` (enabled) — the upload to the file service (S3/MinIO) is now
 * wired in the frontend (GAR-18). The dropzone calls `attachDoc` directly and
 * only marks the pendência resolved after a successful upload. The placeholder
 * flow (local-only id) has been replaced with the real document store flow.
 */
export const ENABLE_PENDENCIA_FILE_UPLOAD = true;
