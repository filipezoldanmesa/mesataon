/**
 * Cabeçalhos de uma resposta que serve bytes — **fonte única da BFF**.
 *
 * Até 08/09/2026 as 9 rotas da BFF que servem arquivo (mais 4 controllers do
 * backend) montavam `Content-Type`, `Content-Disposition` e nada mais, cada uma
 * à sua maneira: 3 interpolavam o nome do arquivo cru, 3 escapavam só a aspa,
 * 4 já usavam RFC 5987, e **nenhuma** mandava `nosniff`. Uma regra sem dono,
 * escrita treze vezes — o mesmo formato do escape de SOQL (`lib/soql`).
 *
 * O gêmeo do backend é `apps/api/src/common/http/arquivo-response.ts`. Os dois
 * apps não compartilham pacote, então as duas cópias são inevitáveis; o que não
 * pode é divergirem, e há um spec de paridade comparando as duas.
 *
 * ⚠️ **Dimensionamento honesto:** o Veracode reporta estes sítios como CWE-80
 * (XSS), e nenhum é explorável hoje — o runtime recusa CRLF em header
 * (`ERR_INVALID_CHAR`) e o catálogo de upload não admite `text/html` nem
 * `image/svg+xml`. O que este módulo entrega é o controle que faltava
 * (`nosniff`, allowlist de MIME, nome codificado), não a contenção de um ataque
 * em curso.
 */

import { nomeDeArquivoSeguro } from '@/lib/arquivo/nome-de-arquivo';

/**
 * MIME que o browser pode **renderizar embutido** com segurança.
 *
 * Fechada de propósito, e a invariante é: nada aqui pode executar script. Um
 * `text/html` ou `image/svg+xml` nesta lista anularia o módulo inteiro, porque
 * o conteúdo servido vem de upload de usuário e roda na origem da aplicação.
 *
 * Duas telas dependem disto: `<img src>` das fotos do posto e o `<iframe>` do
 * documento de suporte da CCOB (PDF).
 */
export const MIME_RENDERIZAVEIS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
] as const;

/**
 * MIME que pode ser **servido** (renderizável ou não). Fora desta lista o valor
 * é descartado em favor de `application/octet-stream`: um upstream que responda
 * um tipo inesperado não decide como o browser trata o conteúdo.
 *
 * Word, Excel e CSV entram porque são produzidos ou aceitos pelo produto (o
 * catálogo de upload admite os dois primeiros; o export da trilha de auditoria
 * gera o terceiro) — mas nenhum é renderizável, então todos vão de `attachment`.
 */
const MIME_SERVIVEIS: readonly string[] = [
  ...MIME_RENDERIZAVEIS,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/octet-stream',
];

const PADRAO = 'application/octet-stream';

/**
 * Normaliza e valida o MIME contra a allowlist.
 *
 * Tira parâmetros (`; charset=utf-8`) e caixa antes de comparar — sem isso
 * `Application/PDF` cairia no padrão e um PDF legítimo viraria download opaco.
 */
export function contentTypeSeguro(mimeType: string | null | undefined): string {
  if (!mimeType) return PADRAO;
  const base = mimeType.split(';')[0]!.trim().toLowerCase();
  return MIME_SERVIVEIS.includes(base) ? base : PADRAO;
}

/**
 * Reduz o nome ao que pode viajar num header.
 *
 * ⚠️ Delega a {@link nomeDeArquivoSeguro} e **não** reimplementa a regra: o
 * atributo `download` de um `<a>` precisa do mesmo saneamento (é o mesmo nome,
 * oferecido ao mesmo usuário, no mesmo "Salvar como"), e duas implementações
 * divergiriam no caractere que ninguém lembra. O alias existe só para o resto
 * deste módulo continuar lendo como antes.
 *
 * ⚠️ O basename não é preciosismo — o nome vem do upload, e um `../` nele viraria
 * caminho no "Salvar como" do browser. E o CRLF precisa sair porque o runtime
 * **recusa** um header que o contenha (`ERR_INVALID_CHAR`): sem sanear, um nome
 * hostil não injetaria cabeçalho nenhum, derrubaria a resposta inteira — um
 * download legítimo viraria erro 500.
 */
function nomeSaneado(fileName: string | null | undefined): string | null {
  return nomeDeArquivoSeguro(fileName);
}

/**
 * Monta o `Content-Disposition`: `inline` só para o que
 * {@link MIME_RENDERIZAVEIS} admite, `attachment` para o resto.
 *
 * O nome viaja duas vezes, e as duas são necessárias: `filename*=UTF-8''…`
 * (RFC 5987) é o que preserva acento — sem ele "Certidão de Inteiro Teor.pdf"
 * chega truncada — e `filename="…"` em ASCII é a reserva para quem não
 * implementa a extensão.
 */
export function contentDisposition(
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): string {
  const tipo = contentTypeSeguro(mimeType);
  const disposicao = (MIME_RENDERIZAVEIS as readonly string[]).includes(tipo)
    ? 'inline'
    : 'attachment';

  const nome = nomeSaneado(fileName);
  if (!nome) return disposicao;

  const ascii = nome.replace(/[^\x20-\x7e]/g, '');
  const rfc5987 = `filename*=UTF-8''${encodeURIComponent(nome)}`;
  return ascii === ''
    ? `${disposicao}; ${rfc5987}`
    : `${disposicao}; filename="${ascii}"; ${rfc5987}`;
}

export type CabecalhosDeArquivo = {
  mimeType: string | null | undefined;
  fileName?: string | null;
  /** Omitido de propósito quando ausente — documento privado não ganha cache por omissão. */
  cacheControl?: string;
};

/** Os cabeçalhos de uma resposta de arquivo, prontos para `new Response(...)`. */
export function cabecalhosDeArquivo({
  mimeType,
  fileName,
  cacheControl,
}: CabecalhosDeArquivo): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentTypeSeguro(mimeType),
    'Content-Disposition': contentDisposition(mimeType, fileName),
    // Impede o browser de adivinhar um tipo diferente do declarado. Nenhuma das
    // 13 rotas mandava este cabeçalho.
    'X-Content-Type-Options': 'nosniff',
  };
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  return headers;
}

/**
 * Extrai o nome de um `Content-Disposition` recebido de upstream.
 *
 * Prefere a forma estendida (`filename*=UTF-8''…`), que é a que preserva acento
 * — a ASCII é reserva e chega com os caracteres removidos. Percent-encoding
 * inválido devolve o valor cru: ele vem de upstream, e um `%` solto não pode
 * derrubar a rota.
 */
export function nomeDoContentDisposition(
  contentDisposition: string | null | undefined,
): string | null {
  if (!contentDisposition) return null;

  const estendido = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (estendido?.[1]) {
    try {
      return decodeURIComponent(estendido[1].trim());
    } catch {
      return estendido[1].trim();
    }
  }

  const ascii = /filename="([^"]*)"/i.exec(contentDisposition);
  return ascii?.[1]?.trim() || null;
}

/**
 * Os cabeçalhos de arquivo derivados da resposta de upstream — **saneados**,
 * nunca repassados.
 *
 * Seis das nove rotas da BFF faziam
 * `'Content-Type': res.headers.get('content-type') ?? '…'`, ou seja deixavam o
 * upstream decidir como o browser trata o conteúdo. Aqui o que vem de fora é
 * insumo (nome e tipo pretendidos), e a decisão continua sendo deste módulo.
 *
 * `reserva` cobre o upstream que não informa nada — o valor dele nunca vence o
 * que o upstream de fato mandou.
 */
export function cabecalhosDeArquivoDoUpstream(
  upstream: Headers,
  reserva: Partial<CabecalhosDeArquivo> = {},
): Record<string, string> {
  return cabecalhosDeArquivo({
    mimeType: upstream.get('content-type') ?? reserva.mimeType,
    fileName:
      nomeDoContentDisposition(upstream.get('content-disposition')) ?? reserva.fileName,
    cacheControl: reserva.cacheControl,
  });
}
