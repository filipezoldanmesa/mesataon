'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Paginacao } from '@/components/ui/paginacao';
import { Select } from '@/components/ui/select';
import { formatInstantDateBR } from '@/lib/date-format';
import {
  getDashboardOportunidadesAtribuidas,
  type OportunidadesAtribuidasParams,
} from '@/lib/dashboard/oportunidades-atribuidas.api';
import {
  ContagemAtribuidas,
  type OportunidadeAtribuidaItem,
  type OportunidadesAtribuidasData,
} from '@/lib/dashboard/oportunidades-atribuidas-mapping';

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
      aria-label="Carregando oportunidades atribuídas…"
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
      Não foi possível carregar as oportunidades atribuídas. Tente novamente mais tarde.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Linha
// ---------------------------------------------------------------------------

const CELL = 'px-3 py-2.5 align-middle';

function Linha({ item }: { item: OportunidadeAtribuidaItem }) {
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
      {/*
        A atribuição é uma MEDIDA (que trabalho é este), não um veredito: texto
        neutro, sem pill nem semáforo — colorir faria "Garantia" parecer alerta
        (ADR-0018).
      */}
      <td className={CELL}>{item.atribuicaoLabel}</td>
      <td className={CELL}>
        {/*
          ⚠️ DUAS lacunas diferentes, e a tela não pode colapsá-las:
          `semAnalista` é "ninguém responde por isto" (a gerência não está
          parametrizada na etapa de `sneg_assignments` — quem conserta é a
          Governança); `analistaNome` nulo com analista é só o snapshot do nome
          que faltou. Escrever "Sem nome" na primeira esconderia justamente o
          fato que o BP Financeiro pediu para ver.
        */}
        {item.semAnalista ? (
          <span data-testid="atribuicao-sem-analista" className="text-(--color-text-muted)">
            Sem analista
          </span>
        ) : (
          (item.analistaNome ?? (
            <span className="text-(--color-text-muted)">Sem nome</span>
          ))
        )}
      </td>
      <td className={`${CELL} whitespace-nowrap tabular-nums`}>
        {/*
          `dataCadastro` é um INSTANTE (`timestamptz`), então vai por
          `formatInstantDateBR` — fatiar os dez primeiros caracteres mostraria
          o dia seguinte para tudo que foi cadastrado depois das 21h (VBR-635).
        */}
        {formatInstantDateBR(item.dataCadastro)}
      </td>
      <td className={`${CELL} text-right whitespace-nowrap`}>
        {/*
          `<Link>`, nunca `<a href>`: o Next prefixa o basePath em `Link` e não
          numa âncora crua, então a âncora funciona no laptop e responde 404 em
          todos os ambientes (ADO 68246). O destino vem do backend.
        */}
        <Link
          href={item.href}
          aria-label={`Analisar ${item.atribuicaoLabel.toLowerCase()} de ${
            item.codigo ?? item.clienteNome ?? 'oportunidade'
          }`}
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
  /** Fonte de dados injetável para os testes. O padrão é o cliente da BFF. */
  fetchData?: (params: OportunidadesAtribuidasParams) => Promise<OportunidadesAtribuidasData>;
};

/**
 * Linhas por página — mesma razão (e mesmo valor) do card de Análise Prévia: é
 * decisão de LAYOUT, não de contrato. O backend aceita qualquer `limit` e
 * devolve o quadro inteiro quando ele não vem.
 */
const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Quadro "Oportunidades atribuídas" (ADO 68531) — faixa de largura cheia nas
 * visões da SNEG e do BP Financeiro.
 *
 * Uma linha por **atribuição**: a mesma oportunidade aparece mais de uma vez
 * quando tem análise, garantia e minuta atribuídas. Colapsá-las esconderia
 * justamente a que ainda não foi trabalhada.
 *
 * ## Decisões
 *
 * - **O recorte é do backend.** A SNEG recebe só as próprias atribuições e o BP
 *   Financeiro recebe todas; a tela é a MESMA e não pergunta a persona. O que
 *   ela vê é o payload — inclusive o vocabulário do seletor, que vem vazio para
 *   quem não tem o que filtrar.
 * - **O `href` do CTA vem pronto** (ADR-0030 §5): a tela não deriva rota a
 *   partir do tipo de atribuição.
 * - **Nada aqui é veredito** — sem pill, sem semáforo (ADR-0018).
 * - **`itens` vazio COM `gaps` não é "nada atribuído".** "Você está em dia" e
 *   "não deu para ler" são frases diferentes.
 */
export function OportunidadesAtribuidasCard({
  fetchData = getDashboardOportunidadesAtribuidas,
}: Props) {
  type FetchStatus = 'loading' | 'ok' | 'error';

  const [status, setStatus] = useState<FetchStatus>('loading');
  const [data, setData] = useState<OportunidadesAtribuidasData | null>(null);
  const [analistaId, setAnalistaId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    /*
     * Troca de filtro ou de página volta ao esqueleto: preservar as linhas
     * durante o refetch deixaria a tabela mostrando o recorte ANTERIOR com o
     * novo filtro já selecionado — dois controles da mesma tela afirmando
     * coisas diferentes. O `cleanup` descarta resposta atrasada.
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
    // Trocar o filtro volta à primeira página — senão a tabela apareceria vazia
    // com o filtro recém-escolhido, que se lê como "este analista não tem nada".
    setPage(1);
  }, []);

  const itens = data?.itens ?? [];
  const degradado = (data?.gaps.length ?? 0) > 0;

  return (
    <DashboardCard data-testid="oportunidades-atribuidas-card">
      <SectionHead
        title="Oportunidades atribuídas"
        meta={
          status === 'ok' && data?.total !== null && data?.total !== undefined
            ? `${data.total} ${
                data.contagem === ContagemAtribuidas.Oportunidades
                  ? data.total === 1
                    ? 'oportunidade'
                    : 'oportunidades'
                  : data.total === 1
                    ? 'atribuição'
                    : 'atribuições'
              }`
            : undefined
        }
      />

      {/*
        O seletor só existe quando o backend manda vocabulário — é assim que a
        SNEG (que vê só as próprias atribuições) não recebe um filtro inútil, sem
        a tela precisar saber de que persona é o usuário.
      */}
      {status !== 'error' && (data?.analistas.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="filtro-analista-atribuidas">
            Filtrar por analista
          </label>
          <Select
            id="filtro-analista-atribuidas"
            data-testid="filtro-analista-atribuidas"
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
            ? 'Não foi possível ler as oportunidades atribuídas agora.'
            : analistaId
              ? /*
                 ⚠️ A frase NÃO nomeia "este analista": uma das opções do
                 seletor é o balde `Sem analista`, e ali não há analista
                 nenhum a quem a ausência pudesse ser atribuída. Mesma redação
                 do card de Análise Prévia, que tem o mesmo balde.
                */
                'Nenhuma oportunidade neste filtro.'
              : 'Nenhuma oportunidade atribuída.'}
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
                  <th className={`${CELL} font-bold`}>Atribuição</th>
                  <th className={`${CELL} font-bold`}>Analista</th>
                  <th className={`${CELL} font-bold`}>Data de cadastro</th>
                  <th className={`${CELL} text-right font-bold`}>
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  // A chave é o PAR (oportunidade, atribuição): a mesma
                  // oportunidade aparece em mais de uma linha.
                  <Linha
                    key={`${item.oportunidadeId}:${item.atribuicaoLabel}`}
                    item={item}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao
            page={data?.page ?? page}
            limit={data?.limit ?? PAGE_SIZE}
            total={data?.total ?? null}
            hasMore={data?.hasMore ?? false}
            onPageChange={setPage}
            label="oportunidades atribuídas"
          />
        </>
      )}
    </DashboardCard>
  );
}
