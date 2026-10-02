/**
 * Reduz um nome de arquivo ao que pode ser oferecido ao usuário — **fonte única
 * dos dois lados**.
 *
 * ## O defeito que isto existe para impedir (CWE-73)
 *
 * O nome vem do upload, ou seja de fora, e chega à tela em dois lugares que o
 * tratam como estrutura:
 *
 * - o `Content-Disposition` da resposta (BFF e backend), onde um `../` viraria
 *   caminho no "Salvar como" do browser;
 * - o atributo `download` de um `<a>`, que é literalmente o nome sugerido no
 *   "Salvar como" — e que **não passava por saneamento nenhum**: seis telas
 *   interpolavam `doc.fileName` cru, então o basename que o servidor já
 *   garantia no header era desfeito pelo atributo ao lado.
 *
 * O Veracode reporta esta família como *External Control of File Name or Path*.
 *
 * ## Por que um módulo, e não uma função privada de `arquivo-response.ts`
 *
 * Ela nasceu privada lá. Enquanto só o header a usava, isso bastava; com o
 * `download` do cliente precisando da MESMA regra, manter privada obrigaria a
 * uma segunda implementação — e duas implementações do mesmo saneamento
 * divergem exatamente no caractere que ninguém lembra (foi assim que treze
 * rotas escreveram treze variações do `Content-Disposition`). Aqui não há
 * paridade a manter: há uma função só, que o header e a tela importam.
 *
 * ⚠️ Vive fora de `lib/server/` porque é consumida por componente de cliente.
 * Nada aqui toca rede, `fs` ou `process` — é string in, string out.
 *
 * ⚠️ A regex usa escape explícito (`\u0000-\u001f`) e nunca o byte literal: já
 * houve caractere de controle invisível no fonte deste repositório, e num
 * módulo cujo assunto É remover caractere de controle isso seria especialmente
 * difícil de enxergar.
 */
export function nomeDeArquivoSeguro(
  fileName: string | null | undefined,
): string | null {
  if (!fileName) return null;

  // Só o basename: as duas barras, porque o upload pode vir de Windows.
  const base = fileName.split(/[/\\]/).pop() ?? '';

  /*
   * Fora o controle, a ASPA sai também. Ela é o que fecha o `filename="…"` do
   * header antes da hora; no atributo `download` seria inofensiva, mas manter a
   * MESMA saída nos dois lados é o ponto — o nome que a tela sugere e o que o
   * servidor manda no header precisam coincidir, senão o arquivo baixado tem um
   * nome e a tela promete outro.
   */
  const limpo = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();

  /*
   * `null`, nunca `''`: "não sobrou nome" é resposta.
   *
   * ⚠️ E no `download` o call site o traduz para `?? true`, **nunca para um
   * RÓTULO de catálogo**. Três telas caíam em `doc.type` / `rotulo` quando não
   * havia `fileName`, e o tipo é texto de negócio que pode ter barra
   * (`CPF / RG dos sócios` existe no catálogo): passá-lo por um redutor de
   * basename o truncaria em `RG dos sócios`. `true` deixa o browser usar o nome
   * do `Content-Disposition` — que vem do nosso backend e é o nome REAL do
   * arquivo, melhor que o rótulo de qualquer forma.
   */
  return limpo === '' ? null : limpo;
}
