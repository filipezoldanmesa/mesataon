/**
 * Helpers for carrying the post-login redirect target (the `?next=` path)
 * across the OAuth round-trip.
 *
 * The path is stored in `sessionStorage` by the login page when it receives
 * `?next=<path>`, and consumed by the OAuth callback page after a successful
 * login. Using `sessionStorage` (rather than the OAuth `state`) avoids
 * increasing the URL length and works equally for the mock (no-Entra) flow.
 *
 * A validacao same-origin e a de `navegacao-segura.ts` — ponto unico do
 * produto para CWE-601.
 */

import { caminhoInternoSeguro } from './navegacao-segura';

const STORAGE_KEY = 'vibra:auth-next';

/**
 * Caminho seguro para o pos-login, ou `null`.
 *
 * ⚠️ Delega a {@link caminhoInternoSeguro}. A versao anterior (`isSameOriginPath`)
 * recusava so `//` e ACEITAVA `/` + barra invertida, que o WHATWG resolve para
 * outra origem — a cadeia `?next=` -> sessionStorage -> `location.replace` do
 * callback era um open redirect completo. Ver `navegacao-segura.ts`.
 */
function caminhoDoNext(valor: string): string | null {
  return caminhoInternoSeguro(valor);
}

/** Saves the post-login redirect path to sessionStorage. No-ops on error. */
export function saveNextPath(path: string): void {
  const seguro = caminhoDoNext(path);
  if (seguro === null) return;
  try {
    // Guarda a forma RECONSTRUIDA, nunca a crua: o que volta do storage ja
    // atravessou a validacao uma vez.
    sessionStorage.setItem(STORAGE_KEY, seguro);
  } catch {
    // sessionStorage may be blocked by privacy settings.
  }
}

/**
 * Reads and clears the saved post-login redirect path.
 * Returns `null` when no path was saved or it fails validation.
 */
export function consumeNextPath(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    // Revalida na leitura: `sessionStorage` e gravavel por qualquer script da
    // origem, entao o que saiu daqui nao e necessariamente o que entrou.
    if (!raw) return null;
    return caminhoDoNext(raw);
  } catch {
    return null;
  }
}
