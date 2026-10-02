/**
 * Traduz os tokens de "tipos aceitos" do Anexo A (`pdf, png, jpeg`) para o
 * atributo `accept` de um `<input type="file">`.
 *
 * Existe porque o seletor de arquivo não filtrava nada: o `Contrato social`
 * passou a aceitar só PDF (ADO 67547) e o picker continuava oferecendo imagens,
 * então o usuário escolhia um PNG, esperava o upload e recebia um 400 no fim —
 * a recusa é do backend e continua sendo (é ela que vale), mas fazê-la ser a
 * PRIMEIRA notícia é desperdiçar o clique.
 *
 * ⚠️ O mapa espelha `apps/api/src/documents/domain/accepted-file-type.ts`, e
 * **só** os tokens que o backend de fato expande entram aqui: o catálogo carrega
 * `docx`/`xlsx` na linha `Pendência · Documento de pendência`, e o validador os
 * recusa — oferecê-los no picker prometeria um formato que o servidor rejeita,
 * que é o mesmo defeito na direção oposta.
 *
 * Token desconhecido é ignorado; **nenhum** token conhecido devolve `undefined`
 * e o input fica sem `accept`, aberto. Um `accept` vazio (`accept=""`) não é
 * inerte no Chrome — travaria a escolha em nada.
 */
const ACCEPT_BY_TOKEN: Record<string, readonly string[]> = {
  pdf: ['application/pdf', '.pdf'],
  png: ['image/png', '.png'],
  jpeg: ['image/jpeg', '.jpg', '.jpeg'],
  excel: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls',
    '.xlsx',
  ],
  word: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc',
    '.docx',
  ],
};

/**
 * @param acceptedTypes lista do checklist/parametrização — o backend serve um
 *   array e a BFF o entrega já juntado (`'pdf, png, jpeg'`), então aceitamos as
 *   duas formas em vez de obrigar cada call site a normalizar.
 */
export function fileAcceptAttribute(
  acceptedTypes: string | readonly string[] | null | undefined,
): string | undefined {
  if (!acceptedTypes) return undefined;

  const tokens = (
    Array.isArray(acceptedTypes) ? acceptedTypes : String(acceptedTypes).split(',')
  ).map((token) => token.trim().toLowerCase());

  const accept = [...new Set(tokens.flatMap((token) => ACCEPT_BY_TOKEN[token] ?? []))];

  return accept.length > 0 ? accept.join(',') : undefined;
}
