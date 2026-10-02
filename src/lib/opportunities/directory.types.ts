/**
 * Types for the user directory search (HU-01 — Busca de colaborador).
 *
 * API contract (FE-owns, establishes §"Busca de colaborador" in epic VBR-70):
 *
 *   GET /v1/directory/users?q=<term>
 *       → { items: DirectoryUser[] }
 */

export interface DirectoryUser {
  id: string;
  name: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  /**
   * Formatted detail line shown under the name in search results,
   * e.g. "Exec. expansão/otimização · SP Interior · Ger. Campinas".
   * Backend may pre-format; BFF falls back to composing from jobTitle/department.
   */
  detail: string;
}

/** Backend wire shape returned by GET /v1/directory/users */
export interface BackendDirectoryUser {
  id: string;
  name: string;
  email?: string;
  jobTitle?: string;
  /** Backend field for the location (city/UF) — the prototype's "região" slot. */
  region?: string | null;
  /** Área/gerência (Graph `department`) — e.g. "Suporte à Negociação". */
  department?: string | null;
  roles?: string[];
}

export interface BackendDirectoryResponse {
  items: BackendDirectoryUser[];
}

/**
 * A directory read that failed for a reason retrying cannot fix — today: the
 * Entra group behind a team bucket has no object id yet
 * (`TEAM_GROUP_NOT_CONFIGURED`, ADR-0043 §6).
 *
 * A distinct class, not a plain `Error`, so the modal renders the sentence
 * WITHOUT a "Tentar novamente" button. A control that can never succeed is a
 * dead control, and the sentence already names what has to be created.
 */
export class DirectoryGapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectoryGapError';
  }
}

/**
 * A leitura do diretório precisa de um login novo — o backend responde **409**
 * `DIRECTORY_REAUTH_REQUIRED` quando a sessão não carrega grant delegado do
 * Graph (ADR-0031).
 *
 * Classe própria, e não `Error` puro, pela mesma razão do
 * {@link DirectoryGapError}: só a frase de um motivo CONHECIDO pode ir à tela.
 * A mensagem de um `Error` qualquer é técnica ("Failed to fetch") e não diz ao
 * usuário o que fazer — enquanto esta diz exatamente ("faça login novamente"),
 * e é um dos motivos reais de a lista de analistas vir vazia (ADO 67877), ao
 * lado do grupo do Entra sem gente.
 */
export class DirectoryReauthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectoryReauthError';
  }
}
