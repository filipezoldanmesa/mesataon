/**
 * A linha de uma garantia JÁ PERSISTIDA, na forma que `GarantiasLista` mostra.
 * Dono único das DUAS telas que a exibem (ADO 68110 · 02/09/2026).
 *
 * ## Por que existe
 *
 * O card da 01b (`GarantiasIndicadasCard`) montava esta linha inline. Quando o
 * ticket de pendência passou a listar as garantias que a oportunidade já tem —
 * o defeito que o ADO 68110 reporta —, escrevê-la de novo lá seria a QUARTA
 * divergência-por-cópia desta família em uma semana (as modais de franquia, os
 * repetidores de matrícula/laudo, o de fiador), e as três anteriores custaram
 * defeito em produção, não revisão de código. O `garantias-lista.tsx` já
 * argumenta isso para a CASCA da lista; este módulo faz o mesmo pelo CONTEÚDO
 * de uma linha persistida.
 *
 * ## O que é do HOST, e por isso entra por `acoes`
 *
 * As ações. No card, `Editar` reabre o modal daquela garantia e `Remover` chama
 * o backend sob `useConfirm`; no ticket **não há `Editar`** — `reconciliar` não
 * promove a partir de `PREVIA_REPROVADA`, então uma edição em lugar nunca
 * reenviaria o conjunto à CCOB e o botão seria controle morto. Quem decide é o
 * host; a linha só sabe desenhar o que recebe.
 *
 * ## O que NÃO é do host
 *
 * A composição da meta e o dossiê de documentos. São função pura do dado, e é
 * justamente onde duas cópias divergiriam sem ninguém notar — a ordem
 * `banco · imóvel · cidade/UF · matrículas · categoria · laudos` é decisão
 * registrada (ADO 68106), não acidente.
 */
'use client';

import type { ReactNode } from 'react';

import type { GarantiaLinhaVM } from '@/components/garantia/garantias-lista';
import { foiRecusadaNaPrevia } from '@/lib/garantia/garantia-recusada';
import { organizarDocumentosDaGarantia } from '@/lib/garantia/documentos-organizados';
import { QUANTIDADE_LAUDOS_PADRAO } from '@/lib/garantia/constants';
import type { GarantiaIndicacaoItem } from '@/lib/garantia/indicacoes.types';
import { nomeDeArquivoSeguro } from '@/lib/arquivo/nome-de-arquivo';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';

// ── Ícone (inline SVG — currentColor, caixa 1em) ────────────────────────────

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Os pedaços da linha de meta ─────────────────────────────────────────────

/**
 * O BANCO na linha de meta — o detalhe que a fiança bancária não tinha
 * (reportado em 02/09/2026: *"devemos mostrar os dados da fiança bancária (banco
 * e cnpj do banco) no detalhamento da listagem"*).
 *
 * A linha compõe a meta com imóvel · matrículas · categoria · laudos — todos
 * campos do BEM, e a bancária não tem nenhum: ela renderizava `—`, sem nada que
 * distinguisse uma bancária de outra. Na bancária o garantidor É o banco
 * (FB-01/FB-02), e é ele o equivalente ao "imóvel" das demais.
 *
 * `fiadores[0]` porque a bancária tem um banco; `''` quando não houver, para o
 * `.filter(Boolean)` da meta descartar sem deixar separador solto.
 */
export function resumoBanco(g: GarantiaIndicacaoItem): string {
  const banco = g.fiadores?.[0];
  if (!banco) return '';

  const nome = banco.nome?.trim() ?? '';
  const documento = banco.documento?.trim() ?? '';
  return [nome, documento].filter(Boolean).join(' · ');
}

/**
 * Cidade/UF do bem na linha de meta (ADO 68106).
 *
 * Vem logo DEPOIS de `imovel` porque é o mesmo bem: o endereço diz qual, a
 * cidade/UF dizem onde. `''` quando não houver nenhuma das duas, para o
 * `.filter(Boolean)` da meta descartar sem deixar separador solto — mesma forma
 * de `resumoBanco`/`resumoMatriculas`/`resumoLaudos`.
 *
 * Só uma das duas informada continua sendo resposta legítima (o card salva
 * parcialmente por desenho, e o DTO aceita cada uma sozinha): aí sai só a parte
 * que existe, nunca "São Paulo/" nem "/SP".
 */
export function resumoLocalizacao(g: GarantiaIndicacaoItem): string {
  // `?? ''` pela mesma razão do `?? []` de `resumoMatriculas`: o payload vem da
  // rede, e um build anterior da BFF entrega `undefined` — que viraria
  // "undefined/SP" na tela.
  const cidade = (g.imovelCidade ?? '').trim();
  const uf = (g.imovelUf ?? '').trim();
  if (cidade && uf) return `${cidade}/${uf}`;
  return cidade || uf;
}

export function resumoMatriculas(g: GarantiaIndicacaoItem): string {
  /*
   * `?? []` e não `g.matriculas.length`: campo ausente degrada para "nenhuma", e
   * a linha cai no legado. O tipo diz que ele existe, mas o payload vem da rede —
   * um build anterior da BFF, ou uma projeção que não carregou as matrículas,
   * entrega `undefined`, e um `.length` ali BRANQUEIA O CARD INTEIRO (um throw no
   * render). Foi um fixture de teste que denunciou isso, não uma revisão.
   */
  const matriculas = g.matriculas ?? [];
  if (matriculas.length === 0) {
    return g.matricula ? `Matrícula ${g.matricula}` : '';
  }
  if (matriculas.length === 1) return `Matrícula ${matriculas[0].numero}`;

  const comCertidao = matriculas.filter((m) => m.certidaoAnexada).length;
  return `${matriculas.length} matrículas (${comCertidao} com certidão)`;
}

/**
 * A linha de meta dos laudos (HIP-02) — só quando há mais de um declarado.
 *
 * Com um laudo (o padrão) a informação não acrescenta nada: o documento aparece
 * na própria lista de anexos. Com N, "2 de 3 laudos" é o que diz se falta algo —
 * e os dois números vêm do backend, nunca contados aqui.
 */
export function resumoLaudos(g: GarantiaIndicacaoItem): string {
  const exigidos = g.quantidadeLaudos ?? QUANTIDADE_LAUDOS_PADRAO;
  if (exigidos <= 1) return '';
  // `?? 0` pela mesma razão do `?? []` acima: campo ausente não pode virar
  // "undefined de 3 laudos" na tela nem um throw no render.
  return `${g.laudosAnexados ?? 0} de ${exigidos} laudos`;
}

/** As ações que o HOST oferece nesta linha. Ausente ⇒ linha somente leitura. */
export interface AcoesDaGarantiaPersistida {
  onEditar?: () => void;
  onRemover?: () => void;
  /** `true` enquanto uma remoção desta linha está em voo. */
  removendo?: boolean;
  /**
   * Qualificador do NOME ACESSÍVEL das ações — existe só para distinguir DUAS
   * listas na MESMA tela (o ticket: as persistidas e o lote).
   *
   * Sem ele, "Remover garantia Fiança bancária" nomeia dois botões e
   * `getByRole('button', { name })` estoura. Ausente ⇒ o rótulo é o de sempre,
   * e o card (lista única) não o usa.
   */
  qualificadorAcessivel?: string;
}

/**
 * Uma garantia PERSISTIDA na forma que `GarantiasLista` mostra.
 *
 * Aqui os documentos têm `href` de download e vêm agrupados por matrícula e
 * laudo; no LOTE do ticket são arquivos que ainda não subiram, e por isso aquele
 * host monta a própria linha (`linhaDoLote`) — a diferença é o DADO, não a forma.
 */
export function linhaGarantiaPersistida(
  g: GarantiaIndicacaoItem,
  acoes?: AcoesDaGarantiaPersistida,
  /**
   * Quando a CCOB concluiu a última prévia REPROVADA — `null` quando não houve
   * nenhuma, que é o caso de toda tela fora do ticket de revisão.
   *
   * Parâmetro, e não um campo de `GarantiaIndicacaoItem`: "foi recusada" é fato
   * sobre a RODADA (o conjunto que a prévia analisou), não sobre a garantia.
   * Guardá-lo no item faria cada produtor do payload ter de resolvê-lo.
   */
  previaReprovadaEm?: string | null,
): GarantiaLinhaVM {
  /*
   * O banco entra ANTES dos campos do bem: numa bancária ele é o único conteúdo,
   * e nas demais `resumoBanco` devolve `''` (não há fiador bancário) — então a
   * ordem não desloca nada nos outros tipos.
   */
  const meta = [
    resumoBanco(g),
    g.imovel,
    // ADO 68106 — logo depois do endereço: os dois descrevem o MESMO bem, e
    // separá-los poria a cidade depois da contagem de laudos.
    resumoLocalizacao(g),
    resumoMatriculas(g),
    g.categoria,
    resumoLaudos(g),
  ]
    .filter(Boolean)
    .join(' · ');

  /*
   * O dossiê DESTA garantia, agrupado por seção e rotulado pelo que identifica
   * cada documento dentro dela — a certidão pela MATRÍCULA que lastreia, o laudo
   * pela posição, o complementar pelo arquivo (ADO · 01/09/2026).
   *
   * Era uma faixa única com o `type` do catálogo como texto do link: com três
   * matrículas saíam três links de texto IDÊNTICO, e o vínculo que os distingue
   * (`garantiaMatriculaId`) existia no payload e era descartado pela BFF.
   *
   * `organizarDocumentosDaGarantia` é puro e testado à parte, e ele **segue** o
   * veredito do backend (`certidaoAnexada`) para a certidão sem vínculo em vez de
   * reimplementar a regra. Tipo desconhecido cai em "Outros documentos": nada
   * desaparece da tela.
   */
  /*
   * `?? []` nos dois, pela mesma razão do `?? []` de `resumoMatriculas`: o payload
   * vem da REDE, e `organizarDocumentosDaGarantia` faz `.slice()` na coleção de
   * matrículas — um build anterior da BFF, ou uma projeção que não as carregou,
   * branquearia a tela inteira com um throw no render. O card carregava essa
   * exposição desde sempre; ela morre na extração.
   */
  const secoes = organizarDocumentosDaGarantia(g.documentos ?? [], g.matriculas ?? []);

  const documentos: ReactNode =
    secoes.length === 0 ? null : (
      <div data-testid={`gar-documentos-${g.id}`} className="mt-2 flex flex-col gap-1.5">
        {secoes.map((secao) => (
          <div key={secao.titulo}>
            <div
              data-testid="gar-doc-secao-titulo"
              className="text-(length:--t-small) uppercase tracking-[.3px] text-(--color-text-muted)"
            >
              {secao.titulo}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
              {secao.documentos.map(({ rotulo, doc }) => (
                <a
                  key={doc.id}
                  href={urlDeMidiaSegura(doc.url) ?? undefined}
                  download={nomeDeArquivoSeguro(doc.fileName) ?? true}
                  title={doc.fileName || undefined}
                  className="inline-flex items-center gap-1.5 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
                >
                  <DownloadIcon /> {rotulo}
                  {/* O arquivo ao lado do rótulo — e não em vez dele:
                      "Matrícula 4354" diz o PAPEL, o nome do arquivo diz QUAL
                      arquivo. Omitido quando o rótulo já é o próprio nome. */}
                  {doc.fileName && doc.fileName !== rotulo && (
                    <span className="font-normal text-(--color-text-muted)">
                      · {doc.fileName}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return {
    chave: g.id,
    tipo: g.tipo,
    origem: g.origem,
    recusada: foiRecusadaNaPrevia(g.criadaEm, previaReprovadaEm),
    valorLabel: g.valor,
    meta,
    /*
     * GER-03 — o compartilhamento na LINHA (ADO · 01/09/2026).
     *
     * ⚠️ `=== true`, nunca truthy: `null` é **não respondida** (linha anterior a
     * GER-03) e `false` é "não compartilhada". Nos dois casos não existe
     * oportunidade relacionada a exibir, e renderizar `null` como "Não"
     * afirmaria uma resposta que ninguém deu.
     */
    compartilhamento:
      g.compartilhada === true ? (
        <>
          Compartilhada com outras oportunidades
          {g.detalhesCompartilhamento && (
            <span className="text-(--color-text)"> · {g.detalhesCompartilhamento}</span>
          )}
        </>
      ) : null,
    observacoes: g.observacoes,
    documentos,
    /*
     * Espalhado, e não campo a campo: `GarantiasLista` decide se renderiza cada
     * botão pela PRESENÇA da chave, então um `onEditar: undefined` explícito
     * seria indistinguível de ausência para o leitor humano e idêntico para o
     * componente. Sem ações ⇒ nenhuma das chaves existe.
     */
    ...(acoes ?? {}),
  };
}
