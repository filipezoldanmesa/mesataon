/**
 * Single-shot automatic retry for transient API failures.
 *
 * Calls `fn` once. If it throws a retryable error (network failure or 5xx),
 * waits `delayMs` milliseconds then calls `fn` exactly one more time.
 * Non-retryable errors (4xx, business domain errors) are rethrown immediately
 * without a second attempt — they will not improve with repetition.
 *
 * The retry is intentionally capped at **one** attempt so the block can never
 * enter an infinite loop (CA-4).
 *
 * @see {@link isRetryableError} in `@/lib/api-errors` for the classification.
 */

import { isRetryableError } from '@/lib/api-errors';

export async function withOneRetry<T>(fn: () => Promise<T>, delayMs = 800): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryableError(err)) throw err;
    // Short backoff before the single retry attempt.
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return fn(); // one retry only — no loop
  }
}
