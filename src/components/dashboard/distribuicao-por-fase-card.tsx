'use client';

import { useState } from 'react';

import { Spinner } from '@/components/spinner';
import { Select } from '@/components/ui/select';
import { getDistribuicaoPorFase } from '@/lib/dashboard/sneg-quadros.api';
import type { DistribuicaoPorFaseData } from '@/lib/dashboard/sneg-quadros-mapping';

import { DashboardCard, SectionHead } from './dashboard-card';
import { BarRow } from './distribuicao-por-analista-card';
import { useQuadroFetch } from './use-quadro-fetch';

type Props = {
  /** Fonte injetável para os testes. O padrão é o cliente da BFF. */
  fetchData?: (params: { analistaId?: string }) => Promise<DistribuicaoPorFaseData>;
};

/**
 * Quadro "Distribuição por fase" (Evolução do Dashboard SNEG, §3.1 — BP
 * Financeiro).
 *
 * Mesmo estilo de "Distribuição por analista": contagem e barra horizontal por
 * fase, nas oito fases e na ordem do backend. Cada oportunidade conta uma vez,
 * na fase atual — veredito do backend, a tela só desenha.
 *
 * O filtro fica ABAIXO do título, à esquerda, com o mesmo `Select` do quadro
 * "Oportunidades atribuídas". "Todos os analistas" é o estado vazio do seletor.
 */
export function DistribuicaoPorFaseCard({ fetchData = getDistribuicaoPorFase }: Props) {
  const [analistaId, setAnalistaId] = useState('');
  const { status, data } = useQuadroFetch(
    () => fetchData({ analistaId: analistaId || undefined }),
    analistaId,
  );
  const degradado = (data?.gaps.length ?? 0) > 0 && data?.total === null;

  return (
    <DashboardCard data-testid="distribuicao-por-fase-card" className="h-full">
      <SectionHead title="Distribuição por fase" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="filtro-analista-fase">
          Filtrar por analista
        </label>
        <Select
          id="filtro-analista-fase"
          data-testid="filtro-analista-fase"
          value={analistaId}
          onChange={setAnalistaId}
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

      {status === 'loading' && (
        <div className="flex items-center justify-center py-10">
          <Spinner label="Carregando distribuição por fase…" />
        </div>
      )}

      {(status === 'error' || (status === 'ok' && degradado)) && (
        <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
          Não foi possível carregar a distribuição por fase. Tente novamente mais tarde.
        </p>
      )}

      {status === 'ok' && !degradado && data && (
        <div>
          {data.itens.map((item) => (
            <BarRow
              key={item.fase}
              label={item.label}
              percentual={item.percentual}
              quantidade={item.quantidade}
            />
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
