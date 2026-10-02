import { caminhoInternoSeguro } from '@/lib/navegacao-segura';

/**
 * Valida — e reconstrói — a URL de um ARQUIVO antes de ela virar `src`/`href`.
 *
 * ## O defeito que isto existe para impedir (CWE-73)
 *
 * As telas renderizavam `photo.url` / `doc.url` **crus**, e esses valores vêm de
 * resposta HTTP. O Veracode reporta essa expressão em três famílias ao mesmo
 * tempo — *External Control of File Name or Path* (CWE-73), XSS (CWE-80) e open
 * redirect (CWE-601) —, porque um caminho de recurso montado com dado de fora é
 * as três coisas conforme o atributo em que aterrissa.
 *
 * Hoje quem monta essas URLs é a própria BFF, com `apiUrl`, então o valor é
 * sempre um caminho same-origin. Só que o TIPO não diz isso: `PostoPhoto.url` é
 * `string` e o docblock dele ainda promete "URL assinada". Uma fonte nova, um
 * mapper esquecido ou um payload adulterado põem `javascript:…` num `<a href>`
 * — que executa — sem que nada no caminho recuse.
 *
 * ## Por que NÃO é uma segunda implementação
 *
 * O trabalho pesado é de {@link caminhoInternoSeguro} (CWE-601): esquema, host,
 * forma relativa a protocolo, barra invertida, caractere de controle, e a
 * reconstrução caractere a caractere a partir de um alfabeto medido. Escrever
 * isso de novo aqui seria a duplicação que este repositório persegue — e as duas
 * cópias divergiriam exatamente no caractere que ninguém lembra.
 *
 * ## A ÚNICA regra própria: travessia é recusada, não normalizada
 *
 * `caminhoInternoSeguro` **normaliza** `..` de propósito, e há teste afirmando
 * isso (`/a/b/../c` → `/a/c`): lá o valor é o `?next=` do pós-login, digitado
 * por gente, e o browser normalizaria de qualquer forma — o que importa é não
 * sair da origem.
 *
 * Aqui o valor **não é escolha de ninguém**: é o caminho que a BFF montou para
 * um arquivo. Qualquer desvio dele é anomalia, e normalizar em silêncio
 * entregaria uma rota que ninguém escolheu.
 *
 * ⚠️ A guarda é a COMPARAÇÃO do caminho reconstruído com o de entrada, e não um
 * `includes('..')` — medido: o parser **decodifica antes de resolver**, então
 * `/api/x/%2e%2e/%2e%2e/auth` vira `/auth` e atravessa uma guarda que só procura
 * a forma literal. Comparar pega as duas formas, o `.` e qualquer normalização
 * futura do parser. Nada legítimo é recusado: o que `apiUrl` produz já é
 * percent-encoding canônico (`%2F`, `%20`, acento), que atravessa inalterado.
 *
 * @returns o caminho reconstruído, ou `null` — e `null` significa "não
 * renderize", nunca uma URL de reserva.
 */
export function urlDeMidiaSegura(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;

  const caminho = caminhoInternoSeguro(url);
  if (caminho === null) return null;

  /*
   * O caminho de ENTRADA, sem query nem fragmento — é o que o parser pode ter
   * reescrito. `caminhoInternoSeguro` já descartou o fragmento na saída, então
   * a comparação é entre pathnames.
   */
  const entrada = url.split(/[?#]/)[0];
  if (caminho.split('?')[0] !== entrada) return null;

  return caminho;
}
