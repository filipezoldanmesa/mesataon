import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A varredura de fonte que os guards estáticos compartilham.
 *
 * ## Por que existe
 *
 * `base-path-coverage.test.ts` e `arquivo/arquivo-coverage.test.ts` faziam a
 * MESMA caminhada e o MESMO `stripComments`, copiados. Numa base cuja doutrina é
 * "fonte única, não paridade", duplicar a infraestrutura dos guards era irônico
 * — e é o tipo de cópia que diverge sem ninguém notar (uma passa a varrer `.ts`,
 * a outra não, e o furo aparece anos depois).
 *
 * ⚠️ Vive em `lib/guards/` e é importado só por arquivo de teste. Nada de
 * produção depende dele.
 */

/** Arquivos de fonte (não-teste) sob `dir`, recursivamente. */
export function varrerFontes(
  dir: string,
  opcoes?: { extensoes?: RegExp },
  acumulador: string[] = [],
): string[] {
  const extensoes = opcoes?.extensoes ?? /\.tsx?$/;

  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      varrerFontes(completo, opcoes, acumulador);
    } else if (extensoes.test(entrada) && !/\.(test|spec)\.tsx?$/.test(entrada)) {
      acumulador.push(completo);
    }
  }
  return acumulador;
}

/**
 * Apaga comentários antes de varrer.
 *
 * Esta base documenta pesado e as docstrings citam path de API o tempo todo
 * (`GET /api/opportunities/:id/…`), então varrer o texto cru acusa dezenas de
 * comentários e o guard vira ruído que ninguém confia.
 *
 * ⚠️ **Substitui por espaço, não por nada** — assim o número da linha reportado
 * continua verdadeiro.
 *
 * ⚠️ **Limitação conhecida:** `//` dentro de string literal (`'https://x'`)
 * também é tratado como início de comentário, então o resto daquela linha some
 * da varredura. Herdado do guard original; na prática nenhuma ofensa real
 * convive com uma URL absoluta na mesma linha, e um parser de verdade seria
 * caro para o que este mecanismo entrega.
 */
export function apagarComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
}

/** Uma ofensa `caminho-relativo:linha`, no formato que os guards reportam. */
export function localizar(raiz: string, arquivo: string, fonte: string, indice: number): string {
  const linha = fonte.slice(0, indice).split('\n').length;
  return `${relative(raiz, arquivo)}:${linha}`;
}

/** Todas as ocorrências de `padroes` nos arquivos de `raiz`, já localizadas. */
export function ofensas(
  raiz: string,
  padroes: RegExp[],
  opcoes?: { extensoes?: RegExp; isento?: (relativo: string) => boolean },
): string[] {
  const encontradas: string[] = [];

  for (const arquivo of varrerFontes(raiz, { extensoes: opcoes?.extensoes })) {
    if (opcoes?.isento?.(relative(raiz, arquivo))) continue;

    const fonte = apagarComentarios(readFileSync(arquivo, 'utf8'));
    for (const padrao of padroes) {
      for (const achado of fonte.matchAll(padrao)) {
        encontradas.push(localizar(raiz, arquivo, fonte, achado.index));
      }
    }
  }

  return encontradas;
}
