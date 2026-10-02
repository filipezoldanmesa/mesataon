'use client';

import { useState } from 'react';

import { Spinner } from '@/components/spinner';
import { Select } from '@/components/ui/select';
import { getDistribuicaoPorAnalista } from '@/lib/dashboard/sneg-quadros.api';
import type { DistribuicaoPorAnalistaData } from '@/lib/dashboard/sneg-quadros-mapping';

import { DashboardCard, SectionHead } from './dashboard-card';
import { BarRow } from './distribuicao-por-analista-card';
import { useQuadroFetch } from './use-quadro-fetch';

type Props = {
  /** Fonte injetável para os testes. O padrão é o cliente da BFF. */
  fetchData?: (params: { fase?: string }) => Promise<DistribuicaoPorAnalistaData>;
};

/**
 * "Distribuição por analista" com filtro por status (Evolução do Dashboard
 * SNEG, §3.2 — BP Financeiro).
 *
 * Mantém a lista, as barras, os totais e o destaque vermelho de "Sem analista"
 * do card original ({@link BarRow} é o mesmo); acrescenta o filtro de status,
 * com "Todos os status" como padrão. O vocabulário do seletor vem do backend
 * (as fases da listagem) — a tela não mantém uma segunda lista.
 *
 * ⚠️ Não substitui `DistribuicaoPorAnalistaCard` para todo mundo: o Gerente
 * Varejo segue com aquele, que conta só `EM_ANALISE` e vem no resumo.
 */
export function DistribuicaoPorAnalistaStatusCard({
  fetchData = getDistribuicaoPorAnalista,
}: Props) {
  const [fase, setFase] = useState('');
  const { status, data } = useQuadroFetch(() => fetchData({ fase: fase || undefined }), fase);
  const degradado = (data?.gaps.length ?? 0) > 0;

  return (
    <DashboardCard data-testid="distribuicao-por-analista-status-card" className="h-full">
      <SectionHead title="Distribuição por analista" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="filtro-status-analista">
          Filtrar por status
        </label>
        <Select
          id="filtro-status-analista"
          data-testid="filtro-status-analista"
          value={fase}
          onChange={setFase}
          options={(data?.fases ?? []).map((f) => ({ value: f.fase, label: f.label }))}
          placeholder="Todos os status"
          clearable
          variant="boxed"
          // ⚠️ `w-auto` é obrigatório: o wrapper do `Select` chumba `w-full`.
          className="w-auto min-w-[200px]"
        />
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-10">
          <Spinner label="Carregando distribuição por analista…" />
        </div>
      )}

      {(status === 'error' || (status === 'ok' && degradado)) && (
        <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
          Não foi possível carregar a distribuição por analista. Tente novamente mais tarde.
        </p>
      )}

      {status === 'ok' && !degradado && data?.itens.length === 0 && (
        <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
          {fase ? 'Nenhuma oportunidade neste status.' : 'Nenhum dado disponível.'}
        </p>
      )}

      {status === 'ok' && !degradado && (data?.itens.length ?? 0) > 0 && (
        <div>
          {data!.itens.map((item) => (
            <BarRow
              key={item.analistaId ?? '__sem_analista__'}
              label={item.label}
              percentual={item.percentual}
              quantidade={item.quantidade}
              isUnassigned={item.semAnalista}
            />
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
