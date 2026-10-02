import type { MockUser } from './session';

/**
 * Roteador do mock da BFF.
 *
 * Em produção cada `src/app/api/<rota>/route.ts` é um Route Handler que lê o
 * cookie de sessão, chama o backend e mapeia a resposta para o TIPO DO FRONT
 * (`src/lib/<dominio>/types.ts`). No protótipo nada disso existe: uma única
 * rota coringa (`src/app/api/[...path]/route.ts`) entrega cada requisição a
 * este roteador, que responde com dados mockados **no mesmo tipo do front**.
 *
 * É esse o contrato que o port para produção preserva: a tela, o `*.api.ts` e
 * o tipo vão para produção como estão; o que muda é quem responde a rota.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface MockContext {
  /** Parâmetros nomeados do padrão (`/opportunities/:id` ⇒ `params.id`). */
  params: Record<string, string>;
  query: URLSearchParams;
  /** Corpo já interpretado: JSON, `FormData` (upload) ou texto. */
  body: unknown;
  /** Usuário do perfil escolhido no login, ou `null` sem sessão. */
  user: MockUser | null;
  request: Request;
}

export type MockHandler = (ctx: MockContext) => Response | Promise<Response>;

export interface MockRoute {
  method: HttpMethod;
  /** Caminho RELATIVO a `/api`, com `:param` — ex.: `/opportunities/:id/analise`. */
  pattern: string;
  handler: MockHandler;
  /** Rota pública (login): responde mesmo sem sessão. */
  publica?: boolean;
}

interface CompiledRoute extends MockRoute {
  regex: RegExp;
  keys: string[];
  /** Quantos segmentos literais — desempata `/x/novo` sobre `/x/:id`. */
  literais: number;
  dominio: string;
}

// Em `globalThis` pelo mesmo motivo do store: o `next dev` reavalia módulos.
const g = globalThis as typeof globalThis & { __prototipoRotas?: CompiledRoute[] };
const registry: CompiledRoute[] = (g.__prototipoRotas ??= []);

function compile(route: MockRoute, dominio: string): CompiledRoute {
  const keys: string[] = [];
  const segments = route.pattern.split('/').filter(Boolean);
  let literais = 0;
  const source = segments
    .map((seg) => {
      // `:id` inteiro, ou o padrão de ação `recurso\:acao` / `:id:acao` não é
      // usado na BFF (só no backend), então aqui todo `:` inicial é parâmetro.
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      literais += 1;
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { ...route, dominio, keys, literais, regex: new RegExp(`^/${source}/?$`) };
}

/**
 * Registra as rotas de um domínio. Chamado uma vez no topo de cada
 * `src/mocks/handlers/<dominio>.ts`, com o nome do arquivo como `dominio`.
 *
 * Re-registrar o MESMO domínio substitui as rotas dele (é o que acontece quando
 * o `next dev` recompila o arquivo). A mesma rota em DOIS domínios é erro: a
 * segunda definição venceria em silêncio e ninguém saberia qual responde.
 */
export function rotas(dominio: string, lista: MockRoute[]): MockRoute[] {
  for (let i = registry.length - 1; i >= 0; i -= 1) {
    if (registry[i].dominio === dominio) registry.splice(i, 1);
  }
  for (const r of lista) {
    const dup = registry.find((x) => x.method === r.method && x.pattern === r.pattern);
    if (dup) {
      throw new Error(
        `[mock] rota duplicada: ${r.method} /api${r.pattern} (em "${dup.dominio}" e em "${dominio}")`,
      );
    }
    registry.push(compile(r, dominio));
  }
  registry.sort((a, b) => b.literais - a.literais);
  return lista;
}

export function resolve(
  method: HttpMethod,
  path: string,
): { route: CompiledRoute; params: Record<string, string> } | null {
  for (const route of registry) {
    if (route.method !== method) continue;
    const m = route.regex.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1]);
    });
    return { route, params };
  }
  return null;
}

/** Todas as rotas registradas — usado pela página `/prototipo`. */
export function listarRotas(): Array<Pick<MockRoute, 'method' | 'pattern'> & { dominio: string }> {
  return registry
    .map(({ method, pattern, dominio }) => ({ method, pattern, dominio }))
    .sort((a, b) => a.pattern.localeCompare(b.pattern) || a.method.localeCompare(b.method));
}
