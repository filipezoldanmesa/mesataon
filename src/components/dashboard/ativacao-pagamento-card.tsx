'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Paginacao } from '@/components/ui/paginacao';
import {
  getDashboardAtivacaoPagamento,
  type AtivacaoPagamentoParams,
} from '@/lib/dashboard/ativacao-pagamento.api';
import type {
  AtivacaoPagamentoData,
  OportunidadeAtivacaoPagamentoItem,
} from '@/lib/dashboard/ativacao-pagamento-mapping';

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
      aria-label="Carregando oportunidades em ativação e em pagamento…"
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
      Não foi possível carregar as oportunidades em ativação e em pagamento. Tente
      novamente mais tarde.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Linha
// ---------------------------------------------------------------------------

const CELL = 'px-3 py-2.5 align-middle';

function Linha({ item }: { item: OportunidadeAtivacaoPagamentoItem }) {
  return (
    <tr className="border-t border-(--color-border)">
      <td className={CELL}>
        <span className="block font-bold">{item.codigo ?? 'Sem código'}</span>
        {item.clienteNome && (
          <span className="block text-(length:--t-small) text-(--color-text-muted)">
            {item.clienteNome}
          </span>
        )}
      </td>
      {/*
        A fase é uma MEDIDA (onde o contrato está), não um veredito: texto
        neutro, sem pill nem semáforo — colorir faria "Ativação" parecer alerta
        (ADR-0018). E o rótulo vem do backend.
      */}
      <td className={CELL}>{item.faseLabel}</td>
      <td className={`${CELL} text-right whitespace-nowrap`}>
        {/*
          `<Link>`, nunca `<a href>`: o Next prefixa o basePath em `Link` e não
          numa âncora crua (ADO 68246). O destino vem do backend.
        */}
        <Link
          href={item.href}
          aria-label={`Analisar ${item.codigo ?? item.clienteNome ?? 'oportunidade'}`}
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
  fetchData?: (params: AtivacaoPagamentoParams) => Promise<AtivacaoPagamentoData>;
};

/** Linhas por página — mesma decisão de layout dos quadros irmãos. */
const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Quadro "Oportunidades em ativação e em pagamento" — a visão da SPCOM.
 *
 * Substitui o bloco "Pendências" naquela persona (pedido de 19/09/2026).
 *
 * ## Decisões
 *
 * - **A fase vem pronta do backend.** Ela é derivada do espelho do
 *   `Contract.Status` do org, não do estado da oportunidade — e a tela não
 *   reimplementa essa regra (ver `domain/ativacao-pagamento.ts`).
 * - **Sem filtro.** O pedido lista três campos (oportunidade, fase, analisar);
 *   um seletor de fase seria controle que ninguém pediu sobre uma fila de duas
 *   linhas de vocabulário.
 * - **`itens` vazio COM `gaps` não é "nada em ativação".**
 */
export function AtivacaoPagamentoCard({
  fetchData = getDashboardAtivacaoPagamento,
}: Props) {
  type FetchStatus = 'loading' | 'ok' | 'error';

  const [status, setStatus] = useState<FetchStatus>('loading');
  const [data, setData] = useState<AtivacaoPagamentoData | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setStatus('loading');

    fetchData({ page, limit: PAGE_SIZE })
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
  }, [fetchData, page]);

  const itens = data?.itens ?? [];
  const degradado = (data?.gaps.length ?? 0) > 0;

  return (
    <DashboardCard data-testid="ativacao-pagamento-card">
      <SectionHead
        title="Oportunidades em ativação e em pagamento"
        meta={
          status === 'ok' && data?.total !== null && data?.total !== undefined
            ? `${data.total} ${data.total === 1 ? 'oportunidade' : 'oportunidades'}`
            : undefined
        }
      />

      {status === 'loading' && <Loading />}
      {status === 'error' && <ErrorState />}

      {status === 'ok' && itens.length === 0 && (
        <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
          {degradado
            ? 'Não foi possível ler as oportunidades em ativação e em pagamento agora.'
            : 'Nenhuma oportunidade em ativação ou em pagamento.'}
        </p>
      )}

      {status === 'ok' && itens.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-(length:--t-caption)">
              <thead>
                <tr className="bg-(--neutral-50) text-left">
                  <th className={`${CELL} font-bold`}>Oportunidade</th>
                  <th className={`${CELL} font-bold`}>Fase</th>
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

          <Paginacao
            page={data?.page ?? page}
            limit={data?.limit ?? PAGE_SIZE}
            total={data?.total ?? null}
            hasMore={data?.hasMore ?? false}
            onPageChange={setPage}
            label="oportunidades em ativação e em pagamento"
          />
        </>
      )}
    </DashboardCard>
  );
}
