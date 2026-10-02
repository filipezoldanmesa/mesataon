/**
 * Navegação interna segura — defesa contra **open redirect** (CWE-601).
 *
 * ## O defeito que isto substitui, medido
 *
 * `isSameOriginPath` recusava `//` e esquecia que o WHATWG URL trata a **barra
 * invertida** como `/` em esquema especial. Medido contra o parser antes de
 * existir código:
 *
 * ```
 * guarda-antiga=true   browser-resolve=https://evil.com/    <-  "/\evil.com"
 * guarda-antiga=true   browser-resolve=https://evil.com/    <-  "/\/evil.com"
 * ```
 *
 * A cadeia era completa e terminava num sink que o Veracode apontou:
 * `/login?next=/\evil.com` -> `login/page.tsx` aceita -> `sessionStorage` ->
 * `auth/callback/page.tsx` `window.location.replace(...)`.
 *
 * ⚠️ Em dev/stage/prod o `basePath` neutraliza por acidente — o prefixo entra
 * ANTES da barra invertida, então o resultado fica dentro da origem. É sorte,
 * não desenho: localmente não há prefixo, e um `basePath` vazio volta a expor.
 *
 * ## Por que VALIDA-E-RECONSTRÓI
 *
 * Cada caractere devolvido sai de {@link ALFABETO}, uma constante literal deste
 * módulo — o valor de saída **não descende do valor de entrada**. Não é rodeio:
 * é allowlist (caractere não previsto derruba a chamada em vez de atravessar),
 * e rastreamento de taint perde o rastro ali sem precisar conhecer a função.
 * Mesma técnica — e mesma razão — de `soqlId` em `scripts/lib/soql.js`.
 * **Não "simplifique" para `return alvo.pathname + alvo.search`.**
 */

import { withBasePath } from './base-path';

/**
 * Origem sentinela para resolver o candidato. `.invalid` é reservado pela
 * RFC 2606, então nunca colide com um host real do produto.
 */
const BASE_SENTINELA = 'https://interno.invalid';

/**
 * Os caracteres que o `URL` de fato produz em `pathname` + `search`,
 * DERIVADOS por medição — nunca escritos de cabeça.
 *
 * ⚠️ A primeira versão foi escrita à mão (unreserved + sub-delims + `:@/%?`) e
 * **recusava query legítima**: `[ ] ^ | { }` e a crase atravessam a
 * normalização intactos e teriam derrubado a chamada. Varrido todo o ASCII
 * imprimível mais amostra não-ASCII nos dois contextos, sobrevivem 90
 * caracteres; nenhum de controle, e `#` não está entre eles (o fragmento sai do
 * `pathname`/`search`).
 *
 * ⚠️ A BARRA INVERTIDA sobrevive na QUERY e está deliberadamente FORA daqui.
 * {@link REINTERPRETADOS} já recusa a entrada que a contenha; mantê-la fora faz
 * da reconstrução uma SEGUNDA barreira, para o dia em que alguém relaxe a
 * primeira.
 */
const ALFABETO =
  "!$%&\'()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";

/**
 * Caracteres que o parser de URL **remove ou reinterpreta** antes de resolver,
 * e que por isso têm de ser recusados ANTES de `new URL` — depois dela a
 * evidência já não existe.
 *
 * - `\` vira `/` em esquema especial, então `/\evil.com` sai da origem.
 * - Tab, LF e CR são **removidos**, então o caminho resolvido não é o que a
 *   tela mostrou a quem inspecionou o link.
 *
 * ⚠️ Escrito com escapes explícitos, nunca com o byte literal: caractere de
 * controle invisível no fonte é a armadilha que este repositório já pagou três
 * vezes (a mais recente em `sanear-para-log.ts`).
 */
const REINTERPRETADOS = /[\\\u0000-\u001f\u007f]/;

/**
 * Devolve o caminho interno validado e reconstruído, ou `null`.
 *
 * Aceita **apenas** caminho absoluto same-origin; devolve `pathname + search`.
 *
 * O **fragmento é descartado**: ele não viaja na requisição, e o `?next=` do
 * pós-login nunca o carrega — preservá-lo só alargaria a superfície.
 */
export function caminhoInternoSeguro(valor: string): string | null {
  if (typeof valor !== 'string' || valor.length === 0) return null;
  if (!valor.startsWith('/')) return null;
  // Protocol-relative: `//evil.com` resolve para outra origem.
  if (valor.startsWith('//')) return null;
  if (REINTERPRETADOS.test(valor)) return null;

  let alvo: URL;
  try {
    alvo = new URL(valor, BASE_SENTINELA);
  } catch {
    return null;
  }

  if (alvo.origin !== BASE_SENTINELA) return null;

  return reconstruir(`${alvo.pathname}${alvo.search}`);
}

/**
 * Reemite `valor` a partir de `alfabeto`. Caractere fora dele derruba a
 * chamada — allowlist, nunca escape.
 */
function reconstruirCom(alfabeto: string, valor: string): string | null {
  let saida = '';
  for (const caractere of valor) {
    const i = alfabeto.indexOf(caractere);
    if (i < 0) return null;
    // Sai da CONSTANTE, não da entrada.
    saida += alfabeto[i];
  }
  return saida;
}

/** Atalho para o alfabeto de caminho — o caso de longe mais comum. */
function reconstruir(valor: string): string | null {
  return reconstruirCom(ALFABETO, valor);
}

/**
 * Alfabeto de `URL.host` (hostname + porta), DERIVADO do que o parser de fato
 * emite: o WHATWG normaliza o hostname para minúsculas e recusa antes de
 * chegar aqui qualquer coisa fora de letra, dígito, `-` e `.`; `[` `]` e `:`
 * cobrem IPv6 e porta.
 *
 * ⚠️ Sem `@`, sem `/` e sem `\` — são justamente os caracteres com que se
 * escreve `https://real.example.com@evil.com/` e `//evil.com`.
 */
const ALFABETO_HOST = 'abcdefghijklmnopqrstuvwxyz0123456789-.[]:';

/** Os dois únicos esquemas que o produto serve. Constantes literais. */
const ESQUEMAS = ['http:', 'https:'] as const;

/**
 * Devolve `<esquema>//<host>` validado e reconstruído, ou `null`.
 *
 * ## Por que a origem do PEDIDO chega aqui — e por que isto não é rodeio
 *
 * ⚠️ **`Location` relativo é impossível no Next 15 — medido, não presumido.**
 * O adapter de edge pós-processa a resposta do middleware com
 * `new NextURL(location, { forceLocale, headers, nextConfig })` — **sem base**
 * (`next/dist/esm/server/web/adapter.js`, bloco `const redirect = …`), e
 * `NextURL` resolve com `new URL(input, base ?? options.base)`. Sem base, um
 * `Location: /login` levanta `TypeError: Invalid URL` **em toda requisição que
 * o gate de sessão redireciona** — inclusive `/` deslogado, que é o que o
 * Playwright pinga para saber se o servidor subiu. Foi assim que o `smoke-e2e`
 * ficou 120 s em `Timed out waiting from config.webServer`.
 *
 * Então a origem tem de sair do pedido (é a única que existe naquele ponto), e
 * o que resta é não deixá-la atravessar crua: esquema sai de {@link ESQUEMAS} e
 * host é reemitido caractere a caractere a partir de {@link ALFABETO_HOST}.
 * Userinfo derruba a chamada. O que isso de fato impede — e que o `Location`
 * montado à mão permitiria — é `//evil.com`, `https://real@evil.com`, `/\evil`
 * e CRLF no header. O que **não** impede é um `Host` forjado ser ecoado; para
 * isso a defesa é a allowlist de host do ALB/edge, fora deste repositório.
 */
export function origemInternaSegura(valor: string): string | null {
  let alvo: URL;
  try {
    alvo = new URL(valor);
  } catch {
    return null;
  }

  const esquema = ESQUEMAS.find((candidato) => candidato === alvo.protocol);
  if (!esquema) return null;
  // `user:senha@` no meio da origem é o truque clássico de open redirect.
  if (alvo.username !== '' || alvo.password !== '') return null;

  const host = reconstruirCom(ALFABETO_HOST, alvo.host);
  if (host === null || host.length === 0) return null;

  // Sai das CONSTANTES, não da entrada.
  return `${esquema}//${host}`;
}

/**
 * Monta o caminho de uma tela a partir de segmentos, encodando cada um —
 * espelho de `apiUrl` (`base-path.ts`), que faz o mesmo para a BFF.
 *
 * ⚠️ **Não aplica `withBasePath`**, ao contrário do `apiUrl`: `<Link>` e
 * `useRouter` do Next já prefixam sozinhos, e prefixar aqui duplicaria o
 * segmento (o defeito da VBR-638).
 *
 * @example rotaDoApp('oportunidades', id)  // -> /oportunidades/<id encodado>
 */
export function rotaDoApp(...segmentos: Array<string | number>): string {
  const caminho = segmentos
    .map((segmento) => encodeURIComponent(String(segmento)))
    .join('/');
  return `/${caminho}`;
}

/**
 * Ponto ÚNICO que escreve em `window.location` para navegação interna.
 *
 * Caminho recusado cai na **raiz** — nunca navega para fora, e nunca fica
 * parado sem dizer nada.
 *
 * @param opcoes.substituir usa `location.replace`, que não deixa a URL atual no
 *   histórico. Obrigatório no callback do OAuth: o `code` viaja na query e o
 *   botão voltar o reapresentaria (e ele é de uso único).
 */
export function redirecionarNoApp(
  caminho: string,
  opcoes?: { substituir?: boolean },
): void {
  const destino = withBasePath(caminhoInternoSeguro(caminho) ?? '/');
  if (opcoes?.substituir) {
    window.location.replace(destino);
    return;
  }
  window.location.href = destino;
}
