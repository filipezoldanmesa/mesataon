/**
 * Real directory search client — calls the BFF routes under `/api/directory/*`
 * (`users`, `team-candidates`, `profile-candidates`), which inject the httpOnly
 * session Bearer server-side. Components never import this directly — use
 * directory.data.ts.
 *
 * ⚠️ As rotas NÃO são interpermutáveis: `users` é servida pelo `UserDirectory`
 * (`ENTRA_DIRECTORY_DRIVER`) e as outras duas pelo `TeamCandidateDirectory`
 * (`ENTRA_TEAM_DIRECTORY_DRIVER`). Os dois drivers estão em modos diferentes nos
 * ambientes, e escolher a rota errada foi o defeito do seletor de LT principal
 * (ADO 67910) e do de analista SNEG (ADO 67877).
 */

import { withBasePath } from '@/lib/base-path';

import type { DirectoryUser } from './directory.types';
import { DirectoryGapError, DirectoryReauthError } from './directory.types';
import type { TeamMemberRole } from './team.types';

/**
 * Minimum query length for the UNSCOPED population (mirrors the BFF).
 *
 * ⚠️ Não se aplica quando há recorte por papel. O mínimo existe porque a
 * população geral é o tenant atrás do Graph, onde uma letra devolve ruído; um
 * grupo é pequeno e listá-lo inteiro é a resposta útil — o mesmo princípio que
 * {@link searchTeamCandidates} e {@link searchProfileCandidates} aplicam.
 */
const MIN_QUERY_LENGTH = 2;

export async function searchDirectory(
  query: string,
  /**
   * Recorte por papel (RBAC), repassado ao backend como `?role=`.
   *
   * ⚠️ Omitir devolve o diretório INTEIRO, e nem todo consumidor pode usá-lo.
   *
   * **Nenhum seletor de tela passa este parâmetro hoje**: os de analista SNEG e
   * de LT principal migraram para {@link searchProfileCandidates}, que lê o
   * grupo do Entra do perfil pelo eixo `ENTRA_TEAM_DIRECTORY_DRIVER` (ADO
   * 67877 / ADO 67910 — os dois drivers estão em modos diferentes, e este lia o
   * seed). O parâmetro fica porque o backend o aceita e é o recorte correto
   * para um consumidor que precise da população dos 13 grupos de perfil.
   */
  role?: string,
): Promise<DirectoryUser[]> {
  const q = query.trim();
  if (!role && q.length < MIN_QUERY_LENGTH) return [];

  const params = new URLSearchParams();
  if (q !== '') params.set('q', q);
  if (role) params.set('role', role);

  const res = await fetch(withBasePath(`/api/directory/users?${params}`));

  if (!res.ok) {
    // A frase do 409 (`DIRECTORY_REAUTH_REQUIRED`) é a que o usuário precisa
    // ler — "faça login novamente" —, e ela chega no corpo. Vai numa classe
    // própria para que só motivo CONHECIDO chegue à tela: a mensagem de um erro
    // qualquer é técnica e não diz o que fazer.
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new DirectoryReauthError(
        body?.error ?? 'Faça login novamente para carregar a lista de colaboradores.',
      );
    }
    throw new Error(`Falha ao buscar colaboradores (${res.status}).`);
  }

  // The BFF already maps BackendDirectoryUser → DirectoryUser.
  const data = (await res.json()) as { items: DirectoryUser[] };
  return data.items;
}

/**
 * Busca restrita a quem pode ser **analista SNEG** (ADO 67877).
 *
 * É o recorte que a escrita já aplica: `AnaliseSnegService.reatribuir` e
 * `SnegDistribuicaoService.upsert` resolvem o analista no grupo do Entra do
 * perfil SNEG e recusam qualquer outro id (422 / 400). Os dois seletores —
 * parametrização (gerência → analista) e reatribuição — ofereciam a população
 * inteira, então a tela convidava a escolher quem a API recusaria.
 *
 * ⚠️ **NÃO é `searchDirectory(q, Role.Sneg)`** — foi, e o recorte por papel
 * estava certo, mas a ROTA errada, exatamente como no seletor de LT principal:
 * `GET /v1/directory/users` é servida pelo `UserDirectory` e portanto pelo
 * driver `ENTRA_DIRECTORY_DRIVER`, enquanto os seletores de equipe vêm do
 * `ENTRA_TEAM_DIRECTORY_DRIVER`. Medido ao vivo em 27/08/2026, `GET /health`
 * responde `entraDirectory: fake` e `entraTeamDirectory: real` em **dev e em
 * stage** — então o modal "Reatribuir analista SNEG" listava o SEED sintético
 * (`Ana Beatriz Souza`, `seed-2`) enquanto o "Adicionar membro" da mesma tela
 * listava gente do Entra. A analista relatou duas vezes que não havia
 * colaborador utilizável na lista.
 *
 * Agora vai pelo grupo do Entra do perfil "SNEG", pelo MESMO eixo da equipe.
 * Um termo vazio é repassado: um grupo de perfil é pequeno e listá-lo inteiro é
 * a resposta útil — a mesma razão de {@link searchTeamCandidates}.
 *
 * Existe como função nomeada, e não como argumento nos call sites, porque o
 * perfil é propriedade de QUEM PERGUNTA ("preciso de um analista SNEG"), não de
 * cada chamada — e assim os dois seletores não podem divergir.
 */
export function searchSnegAnalysts(query: string): Promise<DirectoryUser[]> {
  return searchProfileCandidates(SNEG_PROFILE_KEY, query);
}

/**
 * Chave do catálogo `ACCESS_PROFILES` do backend para o perfil SNEG.
 *
 * Mesma razão de {@link LT_PROFILE_KEY} para viver aqui e não em
 * `auth-roles.ts`: é chave do catálogo de PERFIS (`AccessProfileKey`), não um
 * membro do enum `Role` que aquele arquivo espelha — o backend mantém os dois
 * vocabulários separados de propósito.
 */
const SNEG_PROFILE_KEY = 'SNEG';

/**
 * Busca restrita a quem pode ser **analista da CCOB** — quem faz a análise
 * prévia da garantia (04/09/2026).
 *
 * É o recorte que a escrita já aplica: `CcobDistribuicaoService.upsert` e
 * `GarantiaCcobAtribuicaoService.reatribuir` resolvem o analista no grupo do
 * Entra do perfil CCOB e recusam qualquer outro id (400 / 422). Lista e gate
 * saem da mesma fonte.
 *
 * ⚠️ **`profile-candidates`, nunca `users`.** A rota `users` é servida pelo
 * `UserDirectory` (`ENTRA_DIRECTORY_DRIVER`); esta pelo
 * `TeamCandidateDirectory` (`ENTRA_TEAM_DIRECTORY_DRIVER`). Os dois drivers
 * estão em modos diferentes nos ambientes (medido no stage: `fake` × `real`), e
 * escolher a errada já custou dois tickets — o seletor de analista SNEG
 * (ADO 67877) e o de LT principal (ADO 67910), que ofereciam nomes do seed que a
 * escrita não conseguia resolver.
 */
export function searchCcobAnalysts(query: string): Promise<DirectoryUser[]> {
  return searchProfileCandidates(CCOB_PROFILE_KEY, query);
}

/**
 * Chave do catálogo `ACCESS_PROFILES` do backend para o perfil CCOB.
 *
 * Mesma razão de {@link SNEG_PROFILE_KEY} para viver aqui: é chave do catálogo
 * de PERFIS (`AccessProfileKey`), não um membro do enum `Role`.
 */
const CCOB_PROFILE_KEY = 'CCOB';

/**
 * Busca restrita a quem pode ser **LT principal** da oportunidade (ADO 67910).
 *
 * O card "LT principal" oferecia como candidatos apenas os membros que já
 * estavam na equipe (`members.filter(m => m.id !== principal.id)`). Numa
 * oportunidade recém-criada o único membro é o próprio LT, então o seletor
 * abria com nada além de "Selecionar…" — controle morto, e foi exatamente o
 * relato: *"Perfil SNEG não altera o LT"*.
 *
 * ⚠️ **NÃO é `searchDirectory(q, Role.LT)`** — foi, e o recorte por papel estava
 * certo, mas a ROTA errada: `GET /v1/directory/users` é servida pelo
 * `UserDirectory` e portanto pelo driver `ENTRA_DIRECTORY_DRIVER`, enquanto o
 * resto da equipe vem do `ENTRA_TEAM_DIRECTORY_DRIVER`. Medido no stage em
 * 26/08/2026, os dois estavam em modos DIFERENTES (`fake` × `real`): na mesma
 * tela, "Adicionar membro" listava pessoas do Entra e a troca do LT listava três
 * nomes do seed — indistinguíveis de reais, e ids que o `changePrincipal` nem
 * conseguia resolver (o `UserDirectory` de `opportunities` é o mock do seed).
 *
 * Agora vai pelo grupo do Entra do perfil "Líder de Território", pelo MESMO eixo
 * da equipe. Um termo vazio é repassado: um grupo de perfil é pequeno e listá-lo
 * inteiro é a resposta útil — a mesma razão de {@link searchTeamCandidates}.
 *
 * Existe como função nomeada — e não como argumento no call site — pela mesma
 * razão de {@link searchSnegAnalysts}: o papel é propriedade de QUEM pergunta
 * ("preciso de um Líder de Território"), não de cada chamada.
 */
export function searchLtCandidates(query: string): Promise<DirectoryUser[]> {
  return searchProfileCandidates(LT_PROFILE_KEY, query);
}

/**
 * Chave do catálogo `ACCESS_PROFILES` do backend para o perfil de LT.
 *
 * Vive aqui, e não em `auth-roles.ts`, porque é a chave do catálogo de PERFIS
 * (`AccessProfileKey`), não um membro do enum `Role` que aquele arquivo espelha
 * — colapsar os dois vocabulários é o que o backend evita em três enums homônimos.
 */
const LT_PROFILE_KEY = 'LIDER_TERRITORIO';

/**
 * Colaboradores no grupo do Entra ID de um perfil de acesso, via a BFF.
 *
 * Mesmo tratamento de erro de {@link searchTeamCandidates}, e pela mesma razão:
 * o 422 é a lacuna NOMEADA ("o grupo desse perfil não tem object id no
 * catálogo") e é permanente, então o modal não pode oferecer uma nova tentativa.
 */
export async function searchProfileCandidates(
  perfil: string,
  query: string,
): Promise<DirectoryUser[]> {
  const params = new URLSearchParams({ perfil });
  const q = query.trim();
  if (q !== '') params.set('q', q);

  const res = await fetch(
    withBasePath(`/api/directory/profile-candidates?${params}`),
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { code?: string; message?: string; error?: string }
      | null;
    const message =
      body?.message ?? body?.error ?? `Falha ao buscar colaboradores (${res.status}).`;

    throw res.status === 422
      ? new DirectoryGapError(message)
      : new Error(message);
  }

  const data = (await res.json()) as { items: DirectoryUser[] };
  return data.items;
}

/**
 * Buckets served by Entra groups (ADR-0043) — since 2026-08-21 that is **all
 * four**, `outros` included: it used to be the general population and now is the
 * Visualizador + Gerente Varejo slice, so it goes through the same route.
 *
 * The predicate stays instead of being inlined as `true`: {@link searchDirectory}
 * still serves the LT signer and the SNEG parametrização, and a bucket added
 * later may legitimately have no group.
 */
const TEAM_SCOPED_ROLES = [
  'exec_expansao',
  'exec_br_mania',
  'exec_lubrax',
  'outros',
] as const;

export function isTeamScopedRole(
  role: TeamMemberRole,
): role is (typeof TEAM_SCOPED_ROLES)[number] {
  return (TEAM_SCOPED_ROLES as readonly string[]).includes(role);
}

/**
 * Candidates for one team bucket, from its Entra group (ADR-0043), via the BFF.
 *
 * An empty term IS forwarded: these groups are small and listing one whole is
 * useful — unlike the general population, which needs a term to be meaningful.
 */
export async function searchTeamCandidates(
  funcao: TeamMemberRole,
  query: string,
): Promise<DirectoryUser[]> {
  const params = new URLSearchParams({ funcao });
  const q = query.trim();
  if (q !== '') params.set('q', q);

  const res = await fetch(
    withBasePath(`/api/directory/team-candidates?${params}`),
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { code?: string; message?: string; error?: string }
      | null;
    const message =
      body?.message ?? body?.error ?? `Falha ao buscar colaboradores (${res.status}).`;

    // 422 is the named gap ("this bucket's group is not configured yet"):
    // permanent, so the modal must not offer a retry. Everything else may
    // succeed on a second attempt.
    throw res.status === 422
      ? new DirectoryGapError(message)
      : new Error(message);
  }

  const data = (await res.json()) as { items: DirectoryUser[] };
  return data.items;
}
