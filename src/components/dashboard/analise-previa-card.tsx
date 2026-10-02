'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Paginacao } from '@/components/ui/paginacao';
import { Select } from '@/components/ui/select';
import { formatCurrencyBRL } from '@/lib/clients/format';
import {
  getDashboardAnalisePrevia,
  type AnalisePreviaParams,
} from '@/lib/dashboard/analise-previa.api';
import type {
  AnalisePreviaData,
  AnalisePreviaItem,
} from '@/lib/dashboard/analise-previa-mapping';

import { DashboardCard, SectionHead } from './dashboard-card';

// ---------------------------------------------------------------------------
// Sub-estados
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando análise prévia…"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-(--radius-xs) bg-(--neutral-100)" />
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <p
      role="alert"
      className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)"
    >
      Não foi possível carregar a análise prévia. Tente novamente mais tarde.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Linha
// ---------------------------------------------------------------------------

const CELL = 'px-3 py-2.5 align-middle';
/** Colunas de moeda são tabulares e alinhadas à direita — números se comparam na vertical. */
const MONEY_CELL = `${CELL} text-right tabular-nums whitespace-nowrap`;

function Linha({ item }: { item: AnalisePreviaItem }) {
  return (
    <tr className="border-t border-(--color-border)">
      <td className={CELL}>
        <span className="block font-bold">
          {/*
            Código ausente vira rótulo de lacuna, NUNCA o UUID: id de máquina não
            é texto de tela, e o código é o que circula entre as áreas.
          */}
          {item.codigo ?? 'Sem código'}
        </span>
        {item.clienteNome && (
          <span className="block text-(length:--t-small) text-(--color-text-muted)">
            {item.clienteNome}
          </span>
        )}
      </td>
      <td className={CELL}>
        {/*
          Sem analista é a resposta honesta e é o que o filtro isola — nunca
          "CCOB" nem um nome derivado de outra fonte, que seriam indistinguíveis
          de uma atribuição real.
        */}
        {item.analistaNome ?? (
          <span className="text-(--color-text-muted)">Sem analista</span>
        )}
      </td>
      <td className={MONEY_CELL}>{formatCurrencyBRL(item.bonificacaoAntecipadaBRL)}</td>
      <td className={MONEY_CELL}>{formatCurrencyBRL(item.novoMutuoBRL)}</td>
      <td className={MONEY_CELL}>{formatCurrencyBRL(item.mutuoBRL)}</td>
      <td className={`${MONEY_CELL} font-bold`}>{formatCurrencyBRL(item.totalBRL)}</td>
      <td className={`${CELL} text-right whitespace-nowrap`}>
        {/*
          `<Link>`, nunca `<a href>`: o Next prefixa o basePath em `Link` e não
          numa âncora crua, então a âncora funciona no laptop e responde 404 em
          todos os ambientes (ADO 68246). O destino vem do backend.
        */}
        <Link
          href={item.href}
          aria-label={`Analisar garantia de ${item.codigo ?? item.clienteNome ?? 'oportunidade'}`}
          className="font-bold text-(--secondary-600) hover:underline"
        >
          Analisar →
        </Link>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /**
   * Fonte de dados injetável para os testes. O padrão é o cliente da BFF.
   *
   * ```tsx
   * render(<AnalisePreviaCard fetchData={() => Promise.resolve(mock)} />);
   * ```
   */
  fetchData?: (params: AnalisePreviaParams) => Promise<AnalisePreviaData>;
};

/**
 * Linhas por página.
 *
 * Dez é o que cabe na faixa sem empurrar o resto da visão geral para fora da
 * primeira dobra — a fila da CCOB é trabalho do dia, não relatório. O valor vive
 * aqui (e não no backend) porque é decisão de LAYOUT: o backend aceita qualquer
 * `limit` e continua devolvendo a fila inteira quando ele não vem.
 */
const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Tabela "Análise Prévia" — a visão geral da CCOB (widget `GARANTIAS`).
 *
 * Uma linha por oportunidade cuja garantia está em análise prévia, com o
 * analista SNEG e os três valores de concessão financeira que aquela garantia
 * lastreia, mais o total.
 *
 * ## Decisões
 *
 * - **Tudo vem pronto do backend.** Os valores, o vocabulário do filtro e o
 *   `href` do CTA. A tela não soma, não classifica recurso financeiro e não
 *   re-deriva rota a partir do tipo (ADR-0030 §5).
 * - **O filtro é server-side.** Recortar no cliente exigiria manter as opções e
 *   as linhas em sincronia, e `total` precisa descrever o que está na tela.
 * - **As opções NÃO são derivadas das linhas.** Elas vêm de `analistas[]`,
 *   calculado sobre o universo não filtrado — derivá-las do que está visível
 *   colapsaria o seletor na opção ativa (ADO 67912).
 * - **Nada aqui é veredito.** São medidas: sem pill, sem semáforo (ADR-0018).
 * - **`itens` vazio COM `gaps` não é "nada pendente".** As duas frases são
 *   diferentes, porque "a fila está vazia" é notícia boa e "não deu para ler" é
 *   convite a tentar de novo.
 */
export function AnalisePreviaCard({ fetchData = getDashboardAnalisePrevia }: Props) {
  type FetchStatus = 'loading' | 'ok' | 'error';

  const [status, setStatus] = useState<FetchStatus>('loading');
  const [data, setData] = useState<AnalisePreviaData | null>(null);
  const [analistaId, setAnalistaId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    /*
     * ⚠️ Troca de filtro volta ao esqueleto, e isso é deliberado: preservar as
     * linhas durante o refetch deixaria a tabela mostrando o recorte ANTERIOR
     * com o novo analista já selecionado no seletor — os dois controles da mesma
     * tela afirmando coisas diferentes, que é o defeito que o ADO 67880 corrigiu
     * entre a aba e o strip. O `cleanup` abaixo também roda na troca de
     * `analistaId`, então uma resposta atrasada do filtro anterior é descartada.
     */
    setStatus('loading');

    fetchData({ analistaId: analistaId || undefined, page, limit: PAGE_SIZE })
      .then((d) => {
        if (!active) return;
        setData(d);
        setStatus('ok');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [fetchData, analistaId, page]);

  const handleAnalistaChange = useCallback((value: string) => {
    setAnalistaId(value);
    /*
     * ⚠️ Trocar o filtro volta para a primeira página. Sem isto, filtrar a
     * partir da página 3 pediria a página 3 de um conjunto que pode ter uma
     * única linha — e a tabela apareceria vazia com o filtro recém-escolhido,
     * que se lê como "este analista não tem nada".
     */
    setPage(1);
  }, []);

  const itens = data?.itens ?? [];
  const degradado = (data?.gaps.length ?? 0) > 0;

  return (
    <DashboardCard data-testid="analise-previa-card">
      <SectionHead
        title="Análise Prévia"
        // O contador vive no `meta` porque não há para onde linkar: esta É a
        // tela que lista a fila. `meta` é ignorado quando há link, então o slot
        // não some se um destino aparecer depois.
        meta={
          status === 'ok' && data?.total !== null && data?.total !== undefined
            ? `${data.total} ${data.total === 1 ? 'oportunidade' : 'oportunidades'}`
            : undefined
        }
      />

      {status !== 'error' && (data?.analistas.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="filtro-analista-previa">
            Filtrar por analista
          </label>
          <Select
            id="filtro-analista-previa"
            data-testid="filtro-analista-previa"
            value={analistaId}
            onChange={handleAnalistaChange}
            options={(data?.analistas ?? []).map((a) => ({
              value: a.id,
              label: `${a.nome} (${a.total})`,
            }))}
            placeholder="Todos os analistas"
            clearable
            variant="boxed"
            // ⚠️ `w-auto` é obrigatório: o wrapper do `Select` chumba `w-full`.
            className="w-auto min-w-[200px]"
          />
        </div>
      )}

      {status === 'loading' && <Loading />}
      {status === 'error' && <ErrorState />}

      {status === 'ok' && itens.length === 0 && (
        <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
          {degradado
            ? 'Não foi possível ler a fila de análise prévia agora.'
            : analistaId
              ? 'Nenhuma oportunidade neste filtro.'
              : 'Nenhuma oportunidade com análise prévia pendente.'}
        </p>
      )}

      {status === 'ok' && itens.length > 0 && (
        <>
          {/* Tabela larga: rolagem horizontal própria, para a página nunca rolar. */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-(length:--t-caption)">
              <thead>
                <tr className="bg-(--neutral-50) text-left">
                  <th className={`${CELL} font-bold`}>Oportunidade</th>
                  <th className={`${CELL} font-bold`}>Analista</th>
                  <th className={`${CELL} text-right font-bold`}>Bonificação Antecipada</th>
                  <th className={`${CELL} text-right font-bold`}>Novo Mútuo</th>
                  <th className={`${CELL} text-right font-bold`}>Mútuo</th>
                  <th className={`${CELL} text-right font-bold`}>Total</th>
                  <th className={`${CELL} text-right font-bold`}>
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <Linha key={item.oportunidadeId} item={item} />
                ))}
              </tbody>
            </table>
          </div>

          {degradado && (
            <p
              role="status"
              className="mt-2 text-(length:--t-small) text-(--color-text-muted)"
            >
              Alguns valores não puderam ser lidos agora e aparecem zerados.
            </p>
          )}

          <Paginacao
            page={data?.page ?? page}
            limit={data?.limit ?? PAGE_SIZE}
            total={data?.total ?? null}
            hasMore={data?.hasMore ?? false}
            onPageChange={setPage}
            label="análise prévia"
          />
        </>
      )}
    </DashboardCard>
  );
}
