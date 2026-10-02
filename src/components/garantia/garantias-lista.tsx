/**
 * A lista de garantias — vazio, linha e ações. Dono único das DUAS telas que
 * cadastram garantia (02/09/2026).
 *
 * ## Por que existe
 *
 * O card da 01b (`GarantiasIndicadasCard`) sempre teve esta forma: caixa vazia
 * com "Nenhuma garantia cadastrada ainda.", "+ Adicionar garantia", modal, e uma
 * linha por garantia com tipo, origem, valor, meta e ações. O ticket de pendência
 * tinha um formulário SEMPRE ABERTO — outra experiência para a mesma tarefa.
 * Pedido do negócio: *"tem que ser no mesmo estilo de oportunidades"*.
 *
 * Escrever a linha de novo no ticket seria a QUARTA divergência por cópia desta
 * família em uma semana (as modais de franquia, os repetidores de matrícula/laudo,
 * o de fiador) — e as três anteriores custaram defeito em produção, não revisão
 * de código. O que os dois hosts compartilham é a forma; o que difere é o dado, e
 * é isso que o view-model abaixo isola.
 *
 * ## O que NÃO mora aqui
 *
 * - **O bloco de documentos** entra por `documentos` (`ReactNode`), porque os
 *   dois hosts têm dados diferentes: no card são documentos PERSISTIDOS, com
 *   `href` de download e agrupados por matrícula/laudo
 *   (`organizarDocumentosDaGarantia`); no ticket são arquivos ESCOLHIDOS que
 *   ainda não subiram, e um `href` ali seria link para lugar nenhum.
 * - **A confirmação de remoção.** No card ela apaga registro no servidor e pede
 *   `useConfirm`; no ticket tira uma linha que ainda não foi enviada — nada é
 *   destruído, e a regra do repo reserva a confirmação para o que apaga dado,
 *   move máquina de estado ou notifica alguém. Quem decide é o host.
 * - **A pill de estado do conjunto.** É do card (VBR-500): o subprocesso é 1:1
 *   com a oportunidade e a pill descreve o CONJUNTO. No ticket ela é ruído — a
 *   pendência já diz o que está sendo pedido —, e o negócio pediu para tirá-la.
 */
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { StatusPill } from '@/components/status-pill';

/** Uma linha da lista, já na forma que a tela mostra. */
export interface GarantiaLinhaVM {
  /** Chave do React e sufixo dos `data-testid` — o id no card, o índice no ticket. */
  chave: string;
  tipo: string;
  origem: string;
  /**
   * Esta garantia estava no conjunto que a CCOB recusou? (04/09/2026)
   *
   * Opcional porque só o ticket de pendência sabe responder — ele lê o veredito
   * da prévia; o card da 01b não o busca e simplesmente não passa o campo.
   * Ausente ⇒ sem rótulo, que é o estado honesto de "não perguntei".
   */
  recusada?: boolean;
  /**
   * Tem edição PENDENTE no rascunho do ticket (04/09/2026) — ainda não salva.
   *
   * A linha passa a mostrar os dados EDITADOS: sem isso o LT não vê o que
   * acabou de mudar, e o rascunho lê como se o clique não tivesse feito nada.
   */
  editada?: boolean;
  /**
   * Está marcada para excluir quando a pendência for resolvida.
   *
   * Nada foi apagado ainda — é controle de tela. Por isso a linha esmaece em vez
   * de sumir: ela ainda existe no backend, e o `onDesfazer` ao lado é o caminho
   * de volta.
   */
  marcadaParaExclusao?: boolean;
  /** Tira a marca de exclusão. Substitui as ações enquanto ela está posta. */
  onDesfazer?: () => void;
  /** Já formatado ("R$ 1.000.000,00"); `''` cai no travessão. */
  valorLabel: string;
  /** Uma linha só, composta pelo host: banco · imóvel · matrículas · categoria · laudos. */
  meta: string;
  /** GER-03 — a frase pronta, ou `null` quando não há compartilhamento a exibir. */
  compartilhamento: ReactNode | null;
  observacoes: string | null;
  /** O dossiê da garantia. Ver o docblock: a forma é do host. */
  documentos: ReactNode | null;
  /**
   * Modo SELEÇÃO — o CABEÇALHO da linha (tipo, pills, meta e o "Abrir →") vira
   * uma porta para a página daquela garantia (TW-01).
   *
   * ## Por que ele vive AQUI, e não num renderizador paralelo
   *
   * A tela dedicada `/garantia` tinha uma linha própria (`LinhaSelecao`, no
   * card), e foi por isso que ela divergiu das outras duas telas: o banco da
   * fiança bancária, a cidade/UF, a contagem de laudos e o dossiê inteiro não
   * apareciam — dois renderizadores para o mesmo fato, exatamente a divergência
   * que esta lista existe para impedir. O negócio pediu a linha de seleção COM
   * esses dados (04/09/2026), então a porta virou um modo desta linha.
   *
   * ⚠️ **É o CABEÇALHO que é a porta, nunca a linha inteira** — e isso não é
   * preferência: o dossiê contém os `<a>` de download, e `<a>` dentro de `<a>` é
   * HTML inválido (o browser fecha o primeiro antes do segundo e reparenta os
   * nós, e o download para de funcionar). Compartilhamento, dossiê e observações
   * ficam FORA da porta, como irmãos dela.
   */
  href?: string;
  onEditar?: () => void;
  onRemover?: () => void;
  /** `true` enquanto uma remoção desta linha está em voo. */
  removendo?: boolean;
  /**
   * Qualificador do NOME ACESSÍVEL das ações — existe só para distinguir DUAS
   * listas na MESMA tela (o ticket de pendência: as garantias já persistidas e o
   * lote a enviar).
   *
   * Sem ele, "Remover garantia Fiança bancária" nomeia dois botões e
   * `getByRole('button', { name })` estoura em vez de escolher. Ausente ⇒ o
   * rótulo é o de sempre, e o card (lista única) não o usa — é o que mantém a
   * suíte dele intacta.
   */
  qualificadorAcessivel?: string;
}

/** `Editar garantia Hipoteca (já cadastrada)` — o nome acessível de uma ação. */
function nomeDaAcao(verbo: string, linha: GarantiaLinhaVM): string {
  const qualificador = linha.qualificadorAcessivel
    ? ` (${linha.qualificadorAcessivel})`
    : '';
  return `${verbo} garantia ${linha.tipo}${qualificador}`;
}

function EditIcon(): ReactNode {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 6.5l3 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon(): ReactNode {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Prototype `.gar-empty` — 24px/20px, radius-md, chão `--neutral-25`. */
export function GarantiasVazio({ children }: { children?: ReactNode }): ReactNode {
  return (
    <p className="rounded-[var(--radius-md)] border border-dashed border-(--color-border-strong) bg-(--neutral-25) px-5 py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
      {children ?? 'Nenhuma garantia cadastrada ainda.'}
    </p>
  );
}

/** O CTA que abre o modal — mesma forma nas duas telas. */
export function AdicionarGarantiaBotao({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-white px-3 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-40) disabled:opacity-50"
      >
        + Adicionar garantia
      </button>
    </div>
  );
}

/**
 * Compartilhamento, dossiê e observações — o que vem DEPOIS da meta.
 *
 * Componente, e não JSX repetido, porque os dois modos o montam em lugares
 * diferentes: dentro da coluna do cabeçalho na linha padrão, e FORA da porta no
 * modo seleção (`<a>` dentro de `<a>` é HTML inválido — ver `href` no VM). Duas
 * cópias divergiriam, e a primeira versão desta mudança de fato perdeu os três
 * na linha padrão porque só os reescreveu no modo seleção.
 *
 * `null` quando não há nenhum dos três: no modo seleção isso evita um bloco
 * vazio abaixo da porta, que leria como conteúdo faltando.
 */
function temCauda(linha: GarantiaLinhaVM): boolean {
  return (
    linha.compartilhamento !== null ||
    linha.documentos !== null ||
    Boolean(linha.observacoes)
  );
}

function Cauda({ linha }: { linha: GarantiaLinhaVM }): ReactNode {
  if (!temCauda(linha)) return null;
  return (
    <>
      {linha.compartilhamento !== null && (
        <div
          data-testid={`gar-compartilhamento-${linha.chave}`}
          className="mt-1.5 text-(length:--t-caption) leading-[1.6] text-(--color-text-muted)"
        >
          {linha.compartilhamento}
        </div>
      )}
      {linha.documentos}
      {linha.observacoes && (
        <div className="mt-1.5 text-[13px] text-(--color-text)">
          {linha.observacoes}
        </div>
      )}
    </>
  );
}

/**
 * O cabeçalho da linha: uma PORTA (`<Link>`) no modo seleção, um fragmento fora
 * dele.
 *
 * ⚠️ O hover pinta só o fundo da porta, e não a borda do `li` — ela envolve
 * também a cauda (dossiê, observações), e destacá-la inteira sugeriria que a
 * cauda faz parte do link. Foi o que a linha antiga fazia, quando a linha inteira
 * era o `<a>` e não havia cauda.
 */
function Cabecalho({
  linha,
  children,
}: {
  linha: GarantiaLinhaVM;
  children: ReactNode;
}): ReactNode {
  if (linha.href === undefined) return <>{children}</>;
  return (
    <Link
      href={linha.href}
      /*
       * Nome acessível PRÓPRIO: o conteúdo do link é o tipo, as pills, a meta e
       * o "Abrir →" — lido inteiro, um leitor de tela anunciaria a linha toda
       * como o rótulo da ação.
       */
      aria-label={`Detalhes da garantia ${linha.tipo}`}
      /*
       * Sem `hover:` próprio e sem `rounded`: quem pinta é o `li` (ver o
       * `:has(> a:hover)` lá), e um fundo arredondado aqui dentro deixaria uma
       * segunda caixa visível por cima da do card.
       */
      className="flex items-start gap-3.5 p-3.5 text-left text-(--color-text) no-underline"
    >
      {children}
    </Link>
  );
}

/**
 * A lista. Vazia, renderiza a caixa tracejada; com linhas, o `.gar-item` do
 * protótipo `01b`.
 */
export function GarantiasLista({
  linhas,
  vazio,
  testId,
}: {
  linhas: GarantiaLinhaVM[];
  /** Texto da caixa vazia — o default serve as duas telas. */
  vazio?: ReactNode;
  /** `data-testid` da lista. O ticket o usa para endereçar o LOTE. */
  testId?: string;
}): ReactNode {
  if (linhas.length === 0) return <GarantiasVazio>{vazio}</GarantiasVazio>;

  return (
    <ul data-testid={testId} className="space-y-2">
      {linhas.map((linha) => (
        <li
          key={linha.chave}
          /*
           * Prototype `.gar-item` — `padding:14px` nos quatro lados. No modo
           * SELEÇÃO o padding desce para a porta e para a cauda: a porta precisa
           * de área clicável até a borda, e um padding no `li` deixaria uma
           * moldura morta em volta dela.
           */
          className={`rounded-[var(--radius-xs)] border border-(--color-border) bg-(--color-surface)${
            linha.href === undefined
              ? ' flex items-start gap-3.5 p-3.5'
              : /*
                 * O CARD INTEIRO fica verde no hover, e não só a porta — pedido
                 * do negócio em 04/09/2026: *"o card todo precisa ficar verde
                 * para sinalizar que é aquele card inteiro que vai ser
                 * clicado"*. Isto REVISA a decisão do commit anterior, que
                 * pintava só o fundo da porta com o argumento de que destacar a
                 * caixa sugeriria que o dossiê faz parte do link — o sinal
                 * pedido é o oposto, e a chamada é do produto.
                 *
                 * ⚠️ `:has(> a:hover)` com o combinador de FILHO DIRETO, nunca
                 * `:has(a:hover)`: o dossiê da cauda também tem `<a>` (os
                 * downloads), e acender o card ao passar sobre eles prometeria
                 * que clicar ali abre a garantia — quando ali o clique baixa um
                 * arquivo. A porta é o único `<a>` filho direto do `li`.
                 *
                 * Variante arbitrária com `&` em vez do atalho `has-[...]`: o
                 * seletor fica literal no fonte, e é ele que o leitor precisa
                 * ver para entender por que o `>` está ali.
                 */
                ' transition-colors [&:has(>a:hover)]:border-(--secondary-600) [&:has(>a:hover)]:bg-(--secondary-100)'
          }`}
        >
          <Cabecalho linha={linha}>
          <div
            className={`min-w-0 flex-1${linha.marcadaParaExclusao === true ? ' opacity-60' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-(length:--t-caption) font-bold">
              {linha.tipo}
              <StatusPill variant="neutral" size="sm">
                {linha.origem}
              </StatusPill>
              {/*
                AO LADO da origem, nunca no lugar dela: "Nova"/"Existente" diz de
                ONDE vem a garantia (a ser registrada × já no SAP) e este diz o
                STATUS dela nesta rodada — substituir perderia um fato que a
                CCOB usa na análise.

                `danger` é o mapa do próprio catálogo para `PREVIA_REPROVADA`
                (VBR-500: reprovação ⇒ pill `d`). Aqui o veredito É o conteúdo do
                rótulo — diferente da caixa amarela acima da lista, que é
                orientação e por isso fica em "Exceção/Atenção".
              */}
              {linha.recusada === true && (
                <StatusPill variant="danger" size="sm">
                  Recusada
                </StatusPill>
              )}
              {linha.editada === true && (
                <StatusPill variant="info" size="sm">
                  Editada
                </StatusPill>
              )}
              {/*
                `warning`, nunca `danger`: nada falhou e nada foi apagado — é uma
                intenção pendente, e o Desfazer ao lado é a prova de que ela é
                reversível.
              */}
              {linha.marcadaParaExclusao === true && (
                <StatusPill variant="warning" size="sm">
                  Será excluída
                </StatusPill>
              )}
            </div>
            {/*
             * Prototype `.gi-meta` — `font-size:14px; line-height:1.6`. Era 13px
             * com o line-height default, e a linha inteira lia menor que o design.
             */}
            {/*
             * Prototype `.gi-meta` — `font-size:14px; line-height:1.6`. Era 13px
             * com o line-height default, e a linha inteira lia menor que o design.
             *
             * ⚠️ No modo SELEÇÃO o VALOR entra aqui, porque a direita é do
             * "Abrir →". Quem o põe é a LISTA, não o host: deixar isso como
             * contrato a lembrar faria o valor desaparecer no dia em que uma
             * quarta tela montasse a linha.
             */}
            <div className="mt-1.5 text-(length:--t-caption) leading-[1.6] text-(--color-text-muted)">
              {[linha.meta, linha.href !== undefined ? linha.valorLabel : '']
                .filter(Boolean)
                .join(' · ') || '—'}
            </div>
            {/* Na linha padrão a cauda vive AQUI, na coluna do cabeçalho, onde
                sempre esteve. No modo seleção ela desce para fora da porta. */}
            {linha.href === undefined && <Cauda linha={linha} />}
          </div>

          {/* No modo seleção a direita é a própria porta; fora dele, o valor e as
              ações. */}
          {linha.href !== undefined ? (
            <span className="flex flex-none items-center text-(length:--t-caption) font-bold text-(--secondary-600)">
              Abrir →
            </span>
          ) : (
          <div className="flex flex-none items-center gap-2">
            <span className="text-(length:--t-caption) font-bold">
              {linha.valorLabel || '—'}
            </span>
            {/*
              Marcada para exclusão: o Desfazer SUBSTITUI as ações. Editar uma
              linha que vai sumir não leva a lugar nenhum, e um segundo clique
              no lixo não teria efeito — controle morto nos dois casos.
            */}
            {linha.marcadaParaExclusao === true && linha.onDesfazer && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  linha.onDesfazer?.();
                }}
                className="text-(length:--t-caption) font-bold text-(--secondary-600) underline"
              >
                Desfazer
              </button>
            )}
            {linha.marcadaParaExclusao !== true && linha.onEditar && (
              <button
                type="button"
                aria-label={nomeDaAcao('Editar', linha)}
                onClick={(event) => {
                  event.stopPropagation();
                  linha.onEditar?.();
                }}
                className="inline-flex items-center justify-center rounded-[var(--radius-xs)] p-1 text-(--color-text-muted) transition hover:bg-(--neutral-40) hover:text-(--secondary-600)"
              >
                <EditIcon />
              </button>
            )}
            {linha.marcadaParaExclusao !== true && linha.onRemover && (
              <button
                type="button"
                aria-label={nomeDaAcao('Remover', linha)}
                disabled={linha.removendo === true}
                onClick={(event) => {
                  event.stopPropagation();
                  linha.onRemover?.();
                }}
                className="inline-flex items-center justify-center rounded-[var(--radius-xs)] p-1 text-(--color-text-muted) transition hover:bg-(--neutral-40) hover:text-(--color-danger) disabled:cursor-not-allowed disabled:opacity-50"
              >
                <TrashIcon />
              </button>
            )}
          </div>
          )}
          </Cabecalho>

          {/*
            A CAUDA — fora da porta, por obrigação de HTML (ver `href` no VM).

            Só existe no modo seleção: fora dele os três já vivem dentro da
            coluna do cabeçalho, onde sempre estiveram. Nada renderiza quando não
            há nenhum dos três — um bloco vazio abaixo da porta leria como
            conteúdo faltando.
          */}
          {linha.href !== undefined && temCauda(linha) && (
            <div className="px-3.5 pb-3.5">
              <Cauda linha={linha} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
