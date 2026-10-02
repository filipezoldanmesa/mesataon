/**
 * BFF client for the contract read model and mutations.
 *
 * Calls the Next.js Route Handlers — never the backend directly. The BFF reads
 * the httpOnly `vibra_session` cookie server-side and passes the Bearer, so no
 * access token is ever exposed to page JavaScript.
 */
import { extractErrorMessage } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';
import type { ContratoReadModel, SolicitarRitmResult } from './contrato-mapping';

export class ContratoNotFoundError extends Error {
  constructor(readonly opportunityId: string) {
    super(`Contrato não encontrado para oportunidade: ${opportunityId}`);
    this.name = 'ContratoNotFoundError';
  }
}

/**
 * The profile is not allowed to read this contract (403).
 *
 * Typed separately from a generic failure because the two need OPPOSITE screens:
 * a transient failure gets an error box with "Tentar novamente"; a 403 must
 * render the plain "página não encontrada" screen (CLAUDE.md) — retrying a 403
 * can never succeed, and saying "acesso não autorizado" confirms the
 * opportunity exists, letting any logged-in user map the restricted surface.
 */
export class ContratoForbiddenError extends Error {
  constructor(readonly opportunityId: string) {
    super(`Sem permissão para ler o contrato: ${opportunityId}`);
    this.name = 'ContratoForbiddenError';
  }
}

/**
 * Loads the composite contract read model for the given opportunity.
 *
 * @throws {ContratoNotFoundError} when the opportunity does not exist (404).
 * @throws {ContratoForbiddenError} when the profile may not read it (403).
 * @throws {Error} on network/5xx failures — never on 404 (that is empty).
 */
export async function getContratoReadModel(
  opportunityId: string,
): Promise<ContratoReadModel> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/contrato`),
    { cache: 'no-store' },
  );

  if (res.status === 404) {
    throw new ContratoNotFoundError(opportunityId);
  }

  if (res.status === 403) {
    throw new ContratoForbiddenError(opportunityId);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(
      extractErrorMessage(body, `Falha ao carregar o contrato (${res.status}).`),
    );
  }

  return res.json() as Promise<ContratoReadModel>;
}

// ---------------------------------------------------------------------------
// solicitar-ritm
// ---------------------------------------------------------------------------

export interface SolicitarRitmBody {
  banco?: string;
  agencia?: string;
  conta?: string;
}

/**
 * Opens a Service Now RITM ticket for bank data / vendor registration.
 *
 * @throws {Error} on network/5xx/403/404 failures.
 */
export async function solicitarRitm(
  opportunityId: string,
  body: SolicitarRitmBody = {},
): Promise<SolicitarRitmResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/dados-bancarios/solicitar-ritm`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );

  if (res.status === 403) {
    throw new Error('Sem permissão para solicitar RITM.');
  }

  if (res.status === 409) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Solicitação já aberta ou estado incompatível.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(extractErrorMessage(data, `Falha ao abrir a solicitação RITM (${res.status}).`));
  }

  return res.json() as Promise<SolicitarRitmResult>;
}

// ---------------------------------------------------------------------------
// DocuSign — Embedded Sender View (13/09/2026)
// ---------------------------------------------------------------------------

/**
 * Abre a tela de posicionamento de campos do DocuSign e devolve a URL.
 *
 * ⚠️ **Uso único e vida curta (~5 min).** Navegue imediatamente para ela e
 * nunca a guarde: reusá-la responde erro de autenticação, e um link salvo leria
 * como um "continue aqui" permanente que não funciona.
 *
 * @param sequencia 1 = pacote principal, 2 = Termo de Cessão.
 * @throws {Error} com a frase do backend em 4xx/5xx.
 */
export async function abrirPosicionamentoDocusign(
  opportunityId: string,
  sequencia: 1 | 2 = 1,
): Promise<{ url: string }> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/assinatura/posicionar`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequencia }),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(
        data,
        `Falha ao abrir a tela de posicionamento do DocuSign (${res.status}).`,
      ),
    );
  }

  return res.json() as Promise<{ url: string }>;
}

/**
 * Relê no DocuSign a situação dos pacotes e aplica o que mudou.
 *
 * Chamada no retorno da tela de posicionamento: o redirect do browser diz
 * apenas que a pessoa saiu, e o estado real é o que a API do fornecedor
 * responde.
 *
 * @throws {Error} com a frase do backend em 4xx/5xx.
 */
export async function sincronizarAssinatura(opportunityId: string): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/assinatura/sincronizar`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(data, `Falha ao atualizar a situação do envelope (${res.status}).`),
    );
  }
}

// ---------------------------------------------------------------------------
// Termo de Cessão → empresa homologada (13/09/2026)
// ---------------------------------------------------------------------------

export interface SignatarioHomologada {
  nome: string;
  email: string;
}

/**
 * Envia o Termo de Cessão assinado para a assinatura da empresa homologada.
 *
 * @throws {Error} com a frase do backend em 4xx/5xx — inclusive o 409 que diz
 *   que o pacote principal ainda não concluiu, que é a recusa mais provável.
 */
export async function enviarTermoParaHomologada(
  opportunityId: string,
  signatarios: SignatarioHomologada[],
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/assinatura/homologada/enviar`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatarios }),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(
        data,
        `Falha ao enviar o Termo de Cessão à empresa homologada (${res.status}).`,
      ),
    );
  }
}

/**
 * Anula APENAS o envio do Termo de Cessão à homologada, liberando o reenvio.
 *
 * @throws {Error} com a frase do backend em 4xx/5xx.
 */
export async function anularEnvioHomologada(
  opportunityId: string,
  motivo: string,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/assinatura/homologada/anular`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(data, `Falha ao anular o envio do Termo de Cessão (${res.status}).`),
    );
  }
}
