import {
  TIPO_DOCUMENTO_CASAMENTO,
  TIPO_DOCUMENTO_CERTIDAO,
  TIPO_DOCUMENTO_COMPLEMENTAR,
  TIPO_DOCUMENTO_ESTATUTO,
  TIPO_DOCUMENTO_LAUDO,
  TIPO_DOCUMENTO_MINUTA_FIANCA,
} from './constants';
import type { GarantiaDocumentoItem, GarantiaMatriculaItem } from './indicacoes.types';

/** Um documento com o rótulo que o identifica DENTRO da sua seção. */
export interface DocumentoRotulado {
  rotulo: string;
  doc: GarantiaDocumentoItem;
}

export interface SecaoDocumentos {
  titulo: string;
  documentos: DocumentoRotulado[];
}

const TITULO_CERTIDOES = 'Certidões de inteiro teor';
const TITULO_LAUDOS = 'Laudos de avaliação';
const TITULO_FIANCA_BANCARIA = 'Fiança bancária';
const TITULO_CASAMENTO = 'Certidão de casamento do fiador';
const TITULO_COMPLEMENTARES = 'Documentos complementares';
const TITULO_OUTROS = 'Outros documentos';

/**
 * Os tipos que ganham seção NOMEADA — a negação de `TITULO_OUTROS`.
 *
 * Um `Set` e não uma cadeia de `!==`: a lista negada tinha de crescer a cada
 * seção nova, e esquecer um termo põe o documento em DUAS seções ao mesmo tempo
 * (na dele e no balde), sem nada quebrando.
 */
const TIPOS_COM_SECAO = new Set<string>([
  TIPO_DOCUMENTO_CERTIDAO,
  TIPO_DOCUMENTO_LAUDO,
  TIPO_DOCUMENTO_MINUTA_FIANCA,
  TIPO_DOCUMENTO_ESTATUTO,
  TIPO_DOCUMENTO_CASAMENTO,
  TIPO_DOCUMENTO_COMPLEMENTAR,
]);

/**
 * Agrupa e ROTULA os documentos anexados a uma garantia, para a linha do card
 * (ADO — 01/09/2026).
 *
 * ## O que ela conserta
 *
 * A linha listava `documentos` numa faixa única, com o `type` do catálogo como
 * texto do link. Com três matrículas saíam **três links idênticos** ("Certidão
 * de Inteiro Teor atualizada"), e nada dizia qual matrícula cada um lastreia —
 * a informação existia no payload (`garantiaMatriculaId`) e era descartada pela
 * BFF. O mesmo valia para N laudos e para os complementares de GER-01.
 *
 * ## O pareamento certidão ↔ matrícula é APRESENTAÇÃO; o veredito é do backend
 *
 * Quem responde "esta matrícula está coberta?" é `certidaoAnexada`
 * (`certidaoDaMatricula`, no backend), e a regra dele inclui um caso que o
 * vínculo sozinho não expressa: a certidão anexada **antes de HIP-03** subiu
 * pelo slot fixo, sem vínculo, e conta para a matrícula quando ela é a **única**.
 * Esta função por isso **segue o veredito** em vez de reimplementá-lo — só
 * atribui uma certidão sem vínculo a uma matrícula que o backend já declarou
 * coberta. Com duas matrículas e uma certidão solta, nenhuma é coberta, e a
 * certidão aparece como "Matrícula não identificada": a tela nunca é mais
 * confiante que o gate.
 *
 * ## Nada é descartado
 *
 * Tipo acrescentado ao catálogo depois desta linha ser escrita cai em
 * {@link TITULO_OUTROS}. Filtrar pelos tipos conhecidos faria um documento que
 * EXISTE desaparecer da tela — o modo de falha que nenhuma tela pode ter.
 *
 * ⚠️ A minuta e o estatuto da fiança bancária CAÍAM ali (04/09/2026) e passaram
 * a ter seção própria: a minuta é o documento obrigatório daquele tipo, e pô-la
 * no balde do que a tela não reconhece era a razão de o dossiê de uma bancária
 * parecer não ter os dados dela.
 *
 * ## O que ela NÃO faz
 *
 * Não lista o que falta. A pendência ("faltam 2 certidões") é veredito do gate
 * da prévia e do formulário — repeti-la aqui, derivada, criaria uma segunda
 * fonte para uma pergunta que já tem dono.
 *
 * Seção vazia é omitida; a ordem das seções é fixa e não depende da ordem de
 * chegada dos documentos.
 */
export function organizarDocumentosDaGarantia(
  documentos: readonly GarantiaDocumentoItem[],
  matriculas: readonly GarantiaMatriculaItem[],
): SecaoDocumentos[] {
  const certidoes = documentos.filter((d) => d.type === TIPO_DOCUMENTO_CERTIDAO);
  const laudos = documentos.filter((d) => d.type === TIPO_DOCUMENTO_LAUDO);
  const fiancaBancaria = documentos.filter(
    (d) =>
      d.type === TIPO_DOCUMENTO_MINUTA_FIANCA || d.type === TIPO_DOCUMENTO_ESTATUTO,
  );
  const casamento = documentos.filter((d) => d.type === TIPO_DOCUMENTO_CASAMENTO);
  const complementares = documentos.filter((d) => d.type === TIPO_DOCUMENTO_COMPLEMENTAR);
  const outros = documentos.filter((d) => !TIPOS_COM_SECAO.has(d.type));

  const secoes: SecaoDocumentos[] = [];

  const certidoesRotuladas = rotularCertidoes(certidoes, matriculas);
  if (certidoesRotuladas.length > 0) {
    secoes.push({ titulo: TITULO_CERTIDOES, documentos: certidoesRotuladas });
  }

  if (laudos.length > 0) {
    secoes.push({
      titulo: TITULO_LAUDOS,
      /*
       * Numerado por POSIÇÃO: o laudo não tem identidade própria no backend (é
       * uma contagem mais N documentos `single: false`), então "Laudo 2" é o
       * segundo da lista, não um id. Mesma correspondência posicional que
       * `blocosDeLaudos` usa no formulário.
       *
       * ⚠️ A numeração é ESTÁVEL porque a ordem vem do backend, que lista os
       * vínculos com `ORDER BY linked_at` — ou seja, ordem de anexação. Sem essa
       * garantia, "Laudo 1" poderia trocar de arquivo entre dois renders.
       */
      documentos: laudos.map((doc, i) => ({ rotulo: `Laudo ${i + 1}`, doc })),
    });
  }

  if (fiancaBancaria.length > 0) {
    secoes.push({
      titulo: TITULO_FIANCA_BANCARIA,
      /*
       * Rótulo = TIPO, como em `TITULO_OUTROS` e diferente das demais seções: a
       * desta mistura DOIS tipos (a minuta obrigatória desde 02/09/2026 e o
       * estatuto que ela substituiu), e é o tipo que distingue um do outro. O
       * nome do arquivo não distinguiria nada.
       */
      documentos: fiancaBancaria.map((doc) => ({ rotulo: doc.type, doc })),
    });
  }

  if (casamento.length > 0) {
    /*
     * ⚠️ Rotulada pelo ARQUIVO, nunca pelo FIADOR — e a certidão é por fiador
     * desde a migration `…139`. O item de documento não carrega
     * `garantiaFiadorId` (só `garantiaMatriculaId`), então emparelhar aqui seria
     * DEDUÇÃO — e é exatamente o que o backend recusa fazer, porque poria a
     * certidão de uma pessoa no nome de outra. Quem responde "de quem?" é o
     * `certidaoCasamentoAnexada` dentro do bloco do fiador.
     */
    secoes.push({ titulo: TITULO_CASAMENTO, documentos: rotuladosPeloArquivo(casamento) });
  }

  if (complementares.length > 0) {
    secoes.push({
      titulo: TITULO_COMPLEMENTARES,
      documentos: rotuladosPeloArquivo(complementares),
    });
  }

  if (outros.length > 0) {
    // Aqui o rótulo é o TIPO: é a única informação que distingue um documento do
    // outro numa seção que mistura tipos, e o nome do arquivo vai ao lado dele
    // na tela.
    secoes.push({ titulo: TITULO_OUTROS, documentos: outros.map((doc) => ({ rotulo: doc.type, doc })) });
  }

  return secoes;
}

/**
 * Cada certidão sob o número da matrícula que ela lastreia — na ordem das
 * MATRÍCULAS, não na de chegada dos documentos.
 */
function rotularCertidoes(
  certidoes: readonly GarantiaDocumentoItem[],
  matriculas: readonly GarantiaMatriculaItem[],
): DocumentoRotulado[] {
  const consumidos = new Set<string>();
  const rotulados: DocumentoRotulado[] = [];

  const ordenadas = matriculas.slice().sort((a, b) => a.ordem - b.ordem);
  for (const m of ordenadas) {
    let doc = certidoes.find((d) => d.garantiaMatriculaId === m.id && !consumidos.has(d.id));
    /*
     * Sem vínculo, só com o aval do backend — ver o docblock. A primeira sem
     * vínculo é a candidata; `certidaoAnexada` é o que autoriza atribuí-la.
     */
    if (!doc && m.certidaoAnexada) {
      doc = certidoes.find((d) => d.garantiaMatriculaId === null && !consumidos.has(d.id));
    }
    if (!doc) continue;
    consumidos.add(doc.id);
    rotulados.push({ rotulo: `Matrícula ${m.numero}`, doc });
  }

  // Sobra: certidão que nenhuma matrícula reivindicou. Renderizada assim mesmo —
  // é um documento que existe, e omiti-lo o esconderia da tela.
  for (const doc of certidoes) {
    if (consumidos.has(doc.id)) continue;
    rotulados.push({ rotulo: 'Matrícula não identificada', doc });
  }

  return rotulados;
}

/**
 * Rótulo = nome do arquivo. É o que identifica o documento numa seção cujo
 * título já diz o tipo — repetir o tipo em cada linha seria ruído, e nos
 * complementares (N arquivos do MESMO tipo) o tipo não distingue nada.
 */
function rotuladosPeloArquivo(docs: readonly GarantiaDocumentoItem[]): DocumentoRotulado[] {
  return docs.map((doc) => ({ rotulo: doc.fileName || doc.type, doc }));
}
