/**
 * Converte a URL do Tableau Cloud que uma pessoa copia da barra de endereços na
 * URL que um `<iframe>` consegue carregar.
 *
 * ⚠️ **A reescrita NÃO é cosmética — sem ela o iframe fica em branco, sem erro
 * nenhum.** Medido contra o tenant da Vibra em 27/08/2026, os três formatos:
 *
 * | URL | Resposta |
 * |---|---|
 * | `…/#/site/<site>/views/<wb>/<view>` (o que o servidor vê é `GET /`) | `200` com **`x-frame-options: SAMEORIGIN`** |
 * | `…/t/<site>/views/<wb>/<view>` sem `:embed=y` | **`302`** de volta para o `#/site/` acima |
 * | `…/t/<site>/views/<wb>/<view>?:embed=y` | `200`, **sem** `X-Frame-Options` |
 *
 * Ou seja: as duas metades da conversão — o caminho `/t/` **e** o `:embed=y` —
 * carregam peso. Tirar qualquer uma delas devolve o usuário ao shell do portal,
 * que o navegador recusa a emoldurar; e a recusa por `X-Frame-Options` **não
 * dispara `onError` no iframe**, então o sintoma é um retângulo vazio que nada
 * na tela explica. É por isso que a conversão acontece aqui, e não é pedida
 * como "cole a URL de embed" a quem provisiona a variável: a URL que o Tableau
 * oferece para compartilhar é a bloqueada.
 *
 * O fragmento (`#/site/…`) **nunca chega ao servidor** — é resolvido pelo SPA
 * dentro do navegador —, e é por isso que emoldurar a URL compartilhável carrega
 * o shell do portal em vez da visualização.
 *
 * O que a função deliberadamente NÃO faz: adivinhar. URL de forma não
 * reconhecida atravessa intacta, só ganhando os parâmetros de embed — inventar
 * um `site` a partir dela emolduraria a visualização errada, que é pior que
 * emoldurar o que foi configurado e deixar o "Abrir em nova aba" resolver.
 */

/**
 * Parâmetros de embed do Tableau. Só entram quando a URL configurada ainda não
 * os traz — uma escolha explícita de quem provisionou a variável vence o nosso
 * default (mesmo critério do `PRICE_SIMULATION_AUART`: parâmetro de negócio,
 * não constante nossa).
 *
 * `:toolbar=top` mantém os controles de filtro e "voltar" do próprio Tableau
 * dentro do quadro — sem eles o usuário fica preso na primeira visão.
 */
const EMBED_PARAMS: ReadonlyArray<readonly [string, string]> = [
  [':embed', 'y'],
  [':showVizHome', 'no'],
  [':toolbar', 'top'],
];

/**
 * `#/site/<site>/views/<resto>` — a forma que o Tableau Cloud oferece copiar.
 *
 * ⚠️ O `<resto>` pode trazer a PRÓPRIA query (`…/ENTRADA?UF=RJ`): num
 * `https://host/#/site/…?UF=RJ` o `?` vem DEPOIS do `#`, então aquilo é
 * fragmento, e `url.search` está vazio. Sem separar as duas partes, a query
 * entrava no `pathname` e virava `%3FUF=RJ` — um caminho que o Tableau não
 * resolve, com o filtro que alguém configurou silenciosamente perdido.
 */
const SHARE_FRAGMENT = /^#\/site\/([^/?]+)\/(views\/[^?]+)(?:\?(.*))?$/;

export function toTableauEmbedUrl(configured: string | undefined | null): string | null {
  if (!configured || configured.trim() === '') return null;

  let url: URL;
  try {
    url = new URL(configured.trim());
  } catch {
    // Valor que não é URL absoluta é erro de configuração. Devolver `null` faz a
    // tela dizer isso; resolver contra a nossa origem emolduraria ESTE app
    // dentro dele mesmo.
    return null;
  }

  // Só http(s) é emoldurado: `javascript:` num `src` de iframe executa na nossa
  // origem, e o valor vem de uma variável de build que o app não controla.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const shared = SHARE_FRAGMENT.exec(url.hash);
  if (shared) {
    const [, site, viewPath, fragmentQuery = ''] = shared;
    url.pathname = `/t/${site}/${viewPath}`;
    url.hash = '';

    // Filtros e parâmetros que a pessoa deixou na URL viajam no fragmento;
    // promovê-los à query é o que os preserva na forma `/t/`.
    for (const [name, value] of new URLSearchParams(fragmentQuery)) {
      if (!url.searchParams.has(name)) url.searchParams.set(name, value);
    }
  }

  for (const [name, value] of EMBED_PARAMS) {
    if (!url.searchParams.has(name)) url.searchParams.set(name, value);
  }

  return url.toString();
}
