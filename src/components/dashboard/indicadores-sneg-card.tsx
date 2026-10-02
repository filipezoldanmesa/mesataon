'use client';

import { useState } from 'react';

import { Select } from '@/components/ui/select';
import { getIndicadoresSneg } from '@/lib/dashboard/sneg-quadros.api';
import type {
  CartaoIndicador,
  IndicadoresSnegData,
} from '@/lib/dashboard/sneg-quadros-mapping';

import { DashboardCard, SectionHead } from './dashboard-card';
import { useQuadroFetch } from './use-quadro-fetch';

/** Padrão do seletor de atribuição (§4: *"obrigatória, padrão 'Análise'"*). */
const ATRIBUICAO_PADRAO = 'ANALISE';

/**
 * As opções do seletor antes da primeira resposta — o backend manda o
 * vocabulário, mas um seletor OBRIGATÓRIO não pode nascer vazio.
 */
const ATRIBUICOES_INICIAIS = [
  { atribuicao: 'ANALISE', label: 'Análise' },
  { atribuicao: 'GARANTIA', label: 'Garantia' },
  { atribuicao: 'MINUTA', label: 'Minuta' },
];

/**
 * Um cartão. `h-full` + `flex-col` com o rodapé em `mt-auto`: dentro da grade
 * de colunas iguais, os três cartões ficam com a MESMA altura e largura mesmo
 * com rótulos de comprimentos diferentes (§4), e o rodapé de SLA alinha na base.
 *
 * ADR-0018: é uma MEDIDA — texto neutro, sem semáforo contra o SLA.
 */
function MiniCard({ cartao }: { cartao: CartaoIndicador }) {
  return (
    <div
      data-testid="indicador-sneg"
      className="flex h-full flex-col rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-[14px_16px]"
    >
      <b className="block text-(length:--t-h3) font-bold leading-tight">{cartao.valorTexto}</b>
      <span className="mt-1 block text-(length:--t-caption) text-(--color-text-muted)">
        {cartao.label}
      </span>
      {cartao.slaTexto && (
        <span className="mt-auto block pt-2 text-(length:--t-small) text-(--color-text-muted)">
          {cartao.slaTexto}
        </span>
      )}
    </div>
  );
}

type Props = {
  /** Fonte injetável para os testes. O padrão é o cliente da BFF. */
  fetchData?: (params: {
    analistaId?: string;
    atribuicao?: string;
  }) => Promise<IndicadoresSnegData>;
};

/**
 * Quadro "Indicadores da SNEG" (Evolução do Dashboard SNEG, §4 — BP
 * Financeiro). Substitui "Qualidade das devolutivas" nesta visão.
 *
 * Filtros abaixo do título: Analista ("Todos os analistas") e Atribuição
 * (obrigatória, "Análise"). QUAIS cartões aparecem é veredito do backend —
 * Análise traz três, Garantia/Minuta traz um —, e a grade se ajusta ao número
 * recebido: com um cartão só não sobra coluna vazia.
 *
 * Sem "sobre X propostas" (§4): a amostra saiu de todos os cartões.
 */
export function IndicadoresSnegCard({ fetchData = getIndicadoresSneg }: Props) {
  const [analistaId, setAnalistaId] = useState('');
  const [atribuicao, setAtribuicao] = useState(ATRIBUICAO_PADRAO);
  const { status, data } = useQuadroFetch(
    () => fetchData({ analistaId: analistaId || undefined, atribuicao }),
    `${atribuicao}|${analistaId}`,
  );

  const cartoes = data?.cartoes ?? [];
  const degradado = (data?.gaps.length ?? 0) > 0 || (status === 'ok' && cartoes.length === 0);
  const atribuicoes = data?.atribuicoes.length ? data.atribuicoes : ATRIBUICOES_INICIAIS;
  const colunas = cartoes.length >= 3 ? 'min-[640px]:grid-cols-3' : '';

  return (
    <DashboardCard data-testid="indicadores-sneg-card" className="h-full">
      <SectionHead title="Indicadores da SNEG" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="filtro-analista-indicadores">
          Filtrar por analista
        </label>
        <Select
          id="filtro-analista-indicadores"
          data-testid="filtro-analista-indicadores"
          value={analistaId}
          onChange={setAnalistaId}
          options={(data?.analistas ?? []).map((a) => ({ value: a.id, label: a.nome }))}
          placeholder="Todos os analistas"
          clearable
          variant="boxed"
          // ⚠️ `w-auto` é obrigatório: o wrapper do `Select` chumba `w-full`.
          className="w-auto min-w-[200px]"
        />
        <label className="sr-only" htmlFor="filtro-atribuicao-indicadores">
          Atribuição
        </label>
        <Select
          id="filtro-atribuicao-indicadores"
          data-testid="filtro-atribuicao-indicadores"
          value={atribuicao}
          onChange={(v) => {
            // Obrigatório: sem `clearable`, e um valor vazio nunca é aceito.
            setAtribuicao(v || ATRIBUICAO_PADRAO);
            /*
             * O vocabulário de analistas é POR atribuição (o responsável daquele
             * trabalho). Manter um analista que não existe na lista nova deixaria
             * o seletor mostrando "Todos" com um filtro oculto aplicado.
             */
            setAnalistaId('');
          }}
          options={atribuicoes.map((a) => ({ value: a.atribuicao, label: a.label }))}
          variant="boxed"
          className="w-auto min-w-[160px]"
        />
      </div>

      {status === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Carregando indicadores da SNEG…"
          className={`grid grid-cols-1 gap-3 ${atribuicao === ATRIBUICAO_PADRAO ? 'min-[640px]:grid-cols-3' : ''}`}
        >
          {Array.from({ length: atribuicao === ATRIBUICAO_PADRAO ? 3 : 1 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-(--radius-md) bg-(--neutral-100)" />
          ))}
        </div>
      )}

      {(status === 'error' || (status === 'ok' && degradado)) && (
        <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
          Não foi possível carregar os indicadores da SNEG. Tente novamente mais tarde.
        </p>
      )}

      {status === 'ok' && !degradado && (
        <div data-testid="indicadores-sneg-grade" className={`grid grid-cols-1 gap-3 ${colunas}`}>
          {cartoes.map((c) => (
            <MiniCard key={c.indicador} cartao={c} />
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
