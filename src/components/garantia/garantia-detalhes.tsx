'use client';

import { organizarDocumentosDaGarantia } from '@/lib/garantia/documentos-organizados';
import { StatusPill } from '@/components/status-pill';
import {
  ESTADO_CIVIL_LABEL,
  TIPO_GARANTIA,
  exigeConjuge,
  exigeFiador,
  exigeImovel,
  type EstadoCivil,
} from '@/lib/garantia/constants';
import { TIPO_LABEL_TO_CODE } from '@/lib/garantia/indicacoes-mapping';
import type { EnderecoPessoa, GarantiaIndicacaoItem } from '@/lib/garantia/indicacoes.types';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';

/**
 * Os dados de UMA garantia, em somente leitura.
 *
 * ## Por que virou componente próprio (TW-01)
 *
 * Era o corpo do `GarantiaDetalhesModal` de `garantia-screen.tsx`. TW-01 pede que
 * a ação "Abrir" leve a uma **página** — *"Na tela de garantias, a ação 'Abrir'
 * deve abrir o detalhamento da garantia em nova página"* — então o conteúdo saiu
 * do modal e passou a ser montado pela rota
 * `/oportunidades/[id]/garantia/[garantiaId]`.
 *
 * O modal foi REMOVIDO, não mantido em paralelo: duas superfícies para o mesmo
 * detalhe divergiriam, e é exactamente a divergência que a spec de 28/08/2026
 * veio consertar ("a tela dedicada mostra uma coisa e a da oportunidade mostra
 * outra").
 *
 * ## Somente leitura, e o que fica de fora
 *
 * A escrita é do card (pelo LT, na fase em que ele pode) e do ticket de
 * pendência. Aqui a CCOB lê o que vai analisar.
 *
 * A **cobertura** e o veredito "cobre / não cobre" NÃO estão aqui, de propósito:
 * são fato do CONJUNTO e vivem abaixo da lista, na tela de garantias. Repeti-los
 * por garantia faria três páginas dizerem "não cobre" numa oportunidade cuja
 * soma cobre.
 */
export function GarantiaDetalhes({
  garantia,
  valoresPorFinalidadeTexto,
}: {
  garantia: GarantiaIndicacaoItem;
  /**
   * Fato do CONJUNTO, não desta garantia — vem do subprocesso (1:1) e é o mesmo
   * em toda garantia da oportunidade. Rotulado como tal, senão o leitor o tomaria
   * como valor deste bem.
   */
  valoresPorFinalidadeTexto: string | null;
}) {
  /*
   * `tipo` chega como RÓTULO (é o que a lista mostra); o predicado é sobre o
   * código do enum. `TIPO_LABEL_TO_CODE` é o mesmo mapa que a BFF usa nos dois
   * sentidos — traduzir à mão aqui seria a segunda tabela a divergir.
   *
   * Rótulo desconhecido ⇒ `undefined` ⇒ `exigeImovel` falso: o grupo some. É a
   * degradação certa — afirmar um imóvel para um tipo que não se sabe qual é
   * inventaria campo, e o cadastro é quem tem a resposta.
   */
  const codigoTipo = TIPO_LABEL_TO_CODE[garantia.tipo] ?? '';
  const temBem = exigeImovel(codigoTipo);
  const matriculas = garantia.matriculas ?? [];

  /*
   * ---- O GARANTIDOR (04/09/2026)
   *
   * `fiadores` chegava no payload e nenhuma linha deste dossiê o renderizava.
   * Na fiança BANCÁRIA o fiador é o banco (FB-01/FB-02 — nome + CNPJ nos mesmos
   * dois campos do fiador pessoa física), então "não aparecem os dados do banco"
   * era literal: a página que a CCOB abre pela análise prévia não tinha o
   * garantidor em lugar nenhum. Nas outras duas fianças faltava mais: estado
   * civil, cônjuge co-obrigado (RN-F1-03) e a certidão de casamento por fiador.
   *
   * `?? []` e não `.length` direto: o payload vem da rede, e um build anterior
   * da BFF entrega `undefined` — um `.length` ali branquearia a página inteira
   * (throw no render). Mesma razão do `?? []` de `resumoMatriculas`.
   *
   * ⚠️ **PII na tela, deliberado.** Nome, documento e os dados do cônjuge são o
   * que a CCOB analisa, a página é gateada por `garantia.view`
   * (`LT/SNEG/CCOB/ADMIN`) e a linha do card já os exibe (`resumoBanco`). A
   * proibição de PII deste módulo é sobre LOG, URL e trilha de auditoria — não
   * sobre o dossiê. Nada aqui vai para `data-testid`, `href` nem `aria-label`.
   */
  const fiadores = garantia.fiadores ?? [];
  const ehBancaria = codigoTipo === TIPO_GARANTIA.FIANCA_BANCARIA;
  /*
   * Bloco também quando o tipo não pede fiador mas a linha TEM um: dado que
   * existe nunca é escondido (a mesma regra que manda o tipo desconhecido de
   * documento para "Outros"). O backend recusa esse payload hoje, então é
   * defesa, não caminho.
   */
  const mostrarGarantidor = exigeFiador(codigoTipo) || fiadores.length > 0;

  /*
   * O estado civil de nível de INDICAÇÃO é legado: o card o coletava até
   * 02/09/2026, quando a pergunta passou a ser POR fiador, e a coluna ficou. Só
   * aparece quando nenhum fiador carrega um — senão a mesma resposta sairia duas
   * vezes, e a que tem dono é a do fiador. Sem isto, a única resposta que existe
   * numa linha antiga não apareceria em superfície nenhuma.
   */
  const estadoCivilDaIndicacao = fiadores.some((f) => f.estadoCivil)
    ? null
    : rotuloEstadoCivil(garantia.estadoCivil);

  return (
    <div data-testid="garantia-detalhes">
      <div className="grid grid-cols-2 gap-x-7 gap-y-3.5 max-sm:grid-cols-1">
        <KvItem label="Garantia existente × nova" value={garantia.origem} />
        <KvItem label="Utilização" value={garantia.utilizacao || null} />
        {/*
          Grupo "Imóvel / bem" — só quando `exigeImovel(tipo)`, exatamente os
          campos que o CADASTRO oferece para aquele tipo.

          Numa fiança bancária o garantidor é o BANCO: não há imóvel, matrícula,
          categoria nem laudo, e o formulário nunca pergunta — então exibi-los
          aqui mostraria "Imóvel / bem: —" como se fosse campo que alguém deixou
          em branco. `exigeImovel`, nunca `exigePrevia` (que inclui a bancária).

          O "Valor" fica FORA do grupo, como no cadastro: numa fiança bancária
          ele é o valor da carta do banco (ADO 67858), e é obrigatório em todo
          tipo desde o ADO 68002. Rotulado "Valor", como no org e nos dois
          formulários — "Valor avaliado (laudo)" dava dois nomes ao mesmo campo.
        */}
        {temBem && <KvItem label="Imóvel / bem" value={garantia.imovel || null} />}
        {temBem && <KvItem label="Categoria" value={garantia.categoria} />}
        {/*
          ADO 68106 — Cidade e UF do bem.

          O card as coleta desde 02/09/2026 e o backend as persiste, mas nenhuma
          superfície de leitura as devolvia: este dossiê — que é onde a CCOB lê o
          que vai analisar na prévia — mostrava só "Imóvel / bem" e "Categoria",
          e a resposta do LT só reaparecia reabrindo o modal de edição, que ela
          não usa. Onde o imóvel ESTÁ é insumo da análise, não decoração.

          Sob `temBem` como os dois acima, e pela razão que o comentário deles já
          dá: numa fiança bancária o garantidor é o banco, o formulário nunca
          pergunta cidade nem UF (o DTO as recusa com 400), e renderizar
          "Cidade: —" ali inventaria campo que alguém teria deixado em branco.

          Dois `KvItem` e não um "São Paulo/SP": a grade é de rótulo + valor, e
          juntá-los daria um rótulo composto ("Cidade / UF") que não existe em
          nenhum dos dois formulários. Na LINHA do card eles viajam juntos —
          lá o espaço é uma frase de meta, não uma grade.
        */}
        {temBem && <KvItem label="Cidade" value={garantia.imovelCidade || null} />}
        {temBem && <KvItem label="Estado (UF)" value={garantia.imovelUf || null} />}
        <KvItem label="Valor" value={garantia.valor || null} />
        {/*
          Os dois abaixo são fatos DESTA garantia: o percentual vem da categoria
          dela, o aproveitável do laudo dela — sem o veredito, que é do conjunto.
        */}
        {temBem && (
          <>
            <KvItem
              label="% de aproveitamento (categoria)"
              value={garantia.percentualAproveitamentoLabel}
            />
            <KvItem label="Valor aproveitado" value={garantia.valorAproveitadoLabel} />
          </>
        )}
        <KvItem
          label="Valores reservado / utilizado (do conjunto)"
          value={valoresPorFinalidadeTexto}
        />
        {estadoCivilDaIndicacao && (
          <KvItem label="Estado civil do fiador" value={estadoCivilDaIndicacao} />
        )}
        <KvItem label="Compartilhada com outras oportunidades" value={textoCompartilhamento(garantia)} />
      </div>

      {/* HIP-01/HIP-03 — as matrículas, cada uma com o sinal da SUA certidão.
          Bloco próprio e não uma linha de `kv`: com três matrículas, juntá-las
          numa string esconderia justamente qual está sem certidão. */}
      {temBem && (
        <div className="mt-4">
          <div className="mb-1 text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)">
            Matrículas
          </div>
          {matriculas.length === 0 ? (
            /*
              A coluna legada é a resposta quando a coleção está vazia — uma
              garantia anterior a HIP-01 tem a matrícula em texto livre, e dizer
              "nenhuma informada" ali seria falso.
            */
            <p className="text-(length:--t-caption)">
              {garantia.matricula || 'Nenhuma matrícula informada.'}
            </p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {matriculas.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption)"
                >
                  <span className="min-w-0">Matrícula {m.numero}</span>
                  {/*
                    Veredito do BACKEND (`certidaoAnexada`), nunca derivado aqui:
                    a regra inclui a certidão sem vínculo contando para a
                    matrícula única (garantias documentadas antes de HIP-03).
                  */}
                  {m.certidaoAnexada ? (
                    <StatusPill variant="success" size="sm">
                      Certidão anexada
                    </StatusPill>
                  ) : (
                    <StatusPill variant="warning" size="sm">
                      Certidão pendente
                    </StatusPill>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* HIP-02 — só quando há mais de um laudo declarado. Com um (o padrão) a
          informação não acrescenta nada: o documento aparece na lista abaixo. */}
      {temBem && (garantia.quantidadeLaudos ?? 1) > 1 && (
        <div className="mt-4">
          <div className="mb-1 text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)">
            Laudos de avaliação
          </div>
          <p className="text-(length:--t-caption)">
            {garantia.laudosAnexados ?? 0} de {garantia.quantidadeLaudos} anexados
          </p>
        </div>
      )}

      {/* O GARANTIDOR — ver o comentário da derivação `mostrarGarantidor`.
          Depois do bem e antes dos documentos, a ordem dos dois formulários. */}
      {mostrarGarantidor && (
        <div className="mt-4" data-testid="gar-detalhe-garantidor">
          <div className="mb-1 text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)">
            {/*
              O título segue o TIPO, nunca o documento do fiador: numa fiança com
              ou sem lastro o garantidor é pessoa, e "Banco garantidor" ali
              afirmaria uma modalidade que não é a daquela garantia.
            */}
            {ehBancaria ? 'Banco garantidor' : 'Fiadores'}
          </div>
          {fiadores.length === 0 ? (
            /*
              `exigeFiador(tipo)` com lista vazia é LACUNA DE CADASTRO — sem
              fiador a garantia não fica apta (RN-F1-03) —, não campo N/A. Dizer
              isso é diferente de esconder o bloco, que é o que o grupo de imóvel
              faz num tipo que não tem bem.
            */
            <p className="text-(length:--t-caption)">Nenhum garantidor informado.</p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {fiadores.map((f) => {
                const estadoCivil = rotuloEstadoCivil(f.estadoCivil);
                /*
                 * A certidão de casamento só é devida por quem tem cônjuge
                 * co-obrigado — o MESMO `exigeConjuge` que governa o slot no
                 * formulário. Uma pill "pendente" sobre um solteiro (ou sobre o
                 * banco, que não casa) cobraria documento que ninguém deve.
                 */
                const cobraCertidao = exigeConjuge(f.estadoCivil ?? '');
                return (
                  <li
                    key={f.id}
                    data-testid="gar-detalhe-fiador"
                    className="rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0 text-(length:--t-caption) font-bold">
                        {f.nome || '—'}
                      </span>
                      {cobraCertidao && (
                        /*
                         * Veredito do backend (`certidaoCasamentoAnexada`,
                         * migration `…139`), e é aqui que ele responde a pergunta
                         * que a seção de documentos NÃO pode: de quem é esta
                         * certidão? O item de documento não carrega o vínculo com
                         * o fiador, e deduzi-lo poria a certidão de uma pessoa no
                         * nome de outra.
                         */
                        <StatusPill
                          variant={f.certidaoCasamentoAnexada ? 'success' : 'warning'}
                          size="sm"
                        >
                          {f.certidaoCasamentoAnexada
                            ? 'Certidão de casamento anexada'
                            : 'Certidão de casamento pendente'}
                        </StatusPill>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-7 gap-y-3.5 max-sm:grid-cols-1">
                      {/* O rótulo do documento é o dos dois formulários: na
                          bancária é o CNPJ do banco; nas outras o fiador pode ser
                          pessoa física ou jurídica. */}
                      <KvItem
                        label={ehBancaria ? 'CNPJ' : 'CPF / CNPJ'}
                        value={f.documento || null}
                      />
                      {/* Os três abaixo só quando existem: renderizá-los como
                          "—" num banco inventaria campo que o formulário não
                          pergunta a pessoa jurídica. */}
                      {estadoCivil && <KvItem label="Estado civil" value={estadoCivil} />}
                      {f.conjugeNome && (
                        <KvItem label="Cônjuge co-obrigado" value={f.conjugeNome} />
                      )}
                      {f.conjugeDocumento && (
                        <KvItem label="Documento do cônjuge" value={f.conjugeDocumento} />
                      )}
                      {f.email && <KvItem label="E-mail" value={f.email} />}
                      {f.profissao && <KvItem label="Profissão" value={f.profissao} />}
                      {f.endereco && (
                        <KvItem label="Endereço" value={formatarEndereco(f.endereco)} />
                      )}
                      {f.conjugeEmail && (
                        <KvItem label="E-mail do cônjuge" value={f.conjugeEmail} />
                      )}
                      {f.conjugeProfissao && (
                        <KvItem label="Profissão do cônjuge" value={f.conjugeProfissao} />
                      )}
                      {f.conjugeEndereco && (
                        <KvItem
                          label="Endereço do cônjuge"
                          value={formatarEndereco(f.conjugeEndereco)}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)">
          Documentos desta garantia
        </div>
        {garantia.documentos.length === 0 ? (
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Nenhum documento anexado a esta garantia.
          </p>
        ) : (
          /*
           * Agrupado e rotulado pelo MESMO `organizarDocumentosDaGarantia` que a
           * linha do card da 01b consome (ADO · 01/09/2026). A lista era plana e
           * rotulada pelo `type` do catálogo: com duas matrículas saíam duas
           * linhas de texto IDÊNTICO, e nada dizia qual matrícula cada certidão
           * lastreia. Duas organizações do mesmo dossiê divergiriam.
           */
          organizarDocumentosDaGarantia(garantia.documentos, garantia.matriculas ?? []).map(
            (secao) => (
              <div key={secao.titulo} className="mb-2 last:mb-0">
                <div
                  data-testid="gar-detalhe-doc-secao"
                  className="mb-1 text-(length:--t-small) text-(--color-text-muted)"
                >
                  {secao.titulo}
                </div>
                {secao.documentos.map(({ rotulo, doc }) => (
                  <a
                    key={`${doc.legado ? 'legado' : 'repo'}-${doc.id}`}
                    href={urlDeMidiaSegura(doc.url) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption) text-(--color-text) no-underline hover:bg-(--neutral-25)"
                  >
                    {/*
                      `.doc` do protótipo `garantia.html:86-87`: o documento à
                      esquerda, `pill s` "Anexado" à direita. O rótulo é o PAPEL
                      dele na garantia (a matrícula que lastreia, a posição do
                      laudo) — antes era o `type`, que não distingue dois
                      documentos do mesmo tipo. O nome do arquivo segue fora: ele
                      é detalhe de armazenamento e ocupava o lugar do sinal que o
                      leitor procura. O clique continua baixando.
                    */}
                    <span className="min-w-0">{rotulo}</span>
                    <StatusPill variant="success" size="sm">
                      Anexado
                    </StatusPill>
                  </a>
                ))}
              </div>
            ),
          )
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)">
          Observações
        </div>
        <p className="text-(length:--t-caption) whitespace-pre-line">
          {garantia.observacoes || '—'}
        </p>
      </div>
    </div>
  );
}

/**
 * GER-03 na leitura — três respostas, não duas.
 *
 * ⚠️ `null` é **não respondida** (linha anterior a 31/08/2026), e renderizá-la
 * como "Não" afirmaria uma resposta que ninguém deu. "Sim" sem detalhe não
 * acontece (o DTO o exige), mas o `||` cobre a linha que o backend já tivesse.
 */
function textoCompartilhamento(garantia: GarantiaIndicacaoItem): string | null {
  if (garantia.compartilhada === null) return null;
  if (!garantia.compartilhada) return 'Não';
  return `Sim — ${garantia.detalhesCompartilhamento || 'sem detalhes informados'}`;
}

/**
 * O rótulo pt-BR do estado civil — `null` quando não informado.
 *
 * ⚠️ Código fora do catálogo cai no valor CRU, nunca em branco nem num vizinho
 * plausível: a coluna é `text`, e um estado civil que esta tela não conhece é
 * dado que EXISTE. Mesma convenção do `origemDisplay` da pendência.
 */
/** "Rua, 100 · Compl. — Bairro, Cidade/UF · CEP". */
function formatarEndereco(e: EnderecoPessoa): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
  const rua2 = e.complemento ? `${rua} · ${e.complemento}` : rua;
  return `${rua2} — ${e.bairro}, ${e.cidade}/${e.uf} · CEP ${e.cep}`;
}

function rotuloEstadoCivil(codigo: string | null): string | null {
  if (!codigo) return null;
  return ESTADO_CIVIL_LABEL[codigo as EstadoCivil] ?? codigo;
}

function KvItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{value ?? '—'}</div>
    </div>
  );
}
