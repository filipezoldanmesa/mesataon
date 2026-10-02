/**
 * Shared error parsing for the franchise BFF clients.
 *
 * `extractErrorMessage` and `ApiValidationError` now live in `lib/api-errors.ts`
 * and are the canonical helpers across all domains. This file re-exports
 * `extractErrorMessage` for backward compatibility and keeps the
 * franchise-domain `FranquiaValidationError` / `throwFranquiaError`.
 *
 * The backend answers business rejections in two shapes:
 *  - `AppException` → `{ statusCode, code, message }` (or `{ error }` from the BFF);
 *  - `ValidationPipe` → `{ statusCode, code: 'VALIDATION_ERROR', errors: [{ field, code, message }] }`.
 *
 * The screen must show the violated rule's own sentence — losing the
 * `errors[]` array rendered a mute "Falha (400)." next to the field.
 */

import { extractErrorMessage } from '@/lib/api-errors';

export { extractErrorMessage, type FieldError } from '@/lib/api-errors';

/**
 * A mutation the backend rejected with a business rule (400/409/422) in
 * the franchise domain. Typed apart from a transport failure because the
 * UI renders it INLINE next to the offending field instead of as a generic
 * "tente novamente".
 */
export class FranquiaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FranquiaValidationError';
  }
}

/**
 * Reads the error body once and throws {@link FranquiaValidationError} for
 * business rejections (400/409/422), a plain `Error` otherwise — always
 * carrying the backend's own sentence.
 */
export async function throwFranquiaError(
  res: Response,
  fallback: string,
): Promise<never> {
  // Body items may have optional `message`; cast to the looser shape accepted
  // by extractErrorMessage (which already guards against missing messages).
  const body = (await res.json().catch(() => ({}))) as Parameters<
    typeof extractErrorMessage
  >[0];
  const message = extractErrorMessage(body, `${fallback} (${res.status}).`);

  if (res.status === 400 || res.status === 409 || res.status === 422) {
    throw new FranquiaValidationError(message);
  }
  throw new Error(message);
}
