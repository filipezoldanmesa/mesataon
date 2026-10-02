'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { GarantiaDetalhes } from '@/components/garantia/garantia-detalhes';
import { NotFoundScreen } from '@/components/not-found-screen';
import { getGarantia as defaultGetView } from '@/lib/garantia/garantia.api';
import { loadGarantiasIndicadas as defaultLoad } from '@/lib/garantia/indicacoes.data';
import type { GarantiaIndicacaoItem } from '@/lib/garantia/indicacoes.types';

/**
 * A página de UMA garantia — TW-01.
 *
 * *"Na tela de garantias, a ação 'Abrir' deve abrir o detalhamento da garantia em
 * nova página."*
 *
 * ## Navegação, não aba nova
 *
 * "Nova página" é rota, não `target="_blank"`: é o que o protótipo faz
 * (`garantias.html` → `garantia.html`) e é o que preserva o botão voltar do
 * navegador. Uma aba nova para cada garantia deixaria o analista com cinco abas
 * ao revisar cinco garantias.
 *
 * ## Duas leituras, e a razão de serem duas
 *
 * - `loadGarantiasIndicadas` traz a garantia com os DOCUMENTOS resolvidos (é a
 *   rota dedicada de indicações, que carrega o vínculo e assina o download).
 * - `getGarantia` (o read model) traz `valoresPorFinalidadeTexto`, que é fato do CONJUNTO
 *   (subprocesso 1:1) e não existe na linha.
 *
 * A segunda é **opcional para a página**: se ela falhar, o campo do conjunto sai
 * `null` (e renderiza "—") em vez de a página não abrir. Já a primeira é o
 * conteúdo — sem ela não há o que mostrar.
 *
 * ## Garantia inexistente responde NÃO ENCONTRADA
 *
 * Um `garantiaId` que não está na lista é URL velha (a garantia foi removida) ou
 * digitada — `NotFoundScreen`, o mesmo tratamento da rota da oportunidade. Nunca
 * uma página vazia com os rótulos e todos os valores em "—", que leria como
 * garantia cadastrada sem dados.
 */
export function GarantiaDetalhesScreen({
  opportunityId,
  garantiaId,
  load = defaultLoad,
  getView = defaultGetView,
}: {
  opportunityId: string;
  garantiaId: string;
  /** Injetável para teste. */
  load?: (opportunityId: string) => Promise<GarantiaIndicacaoItem[]>;
  /** Injetável para teste. Só o texto do conjunto vem daqui. */
  getView?: typeof defaultGetView;
}) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'nao-encontrada' | 'erro'>(
    'loading',
  );
  const [garantia, setGarantia] = useState<GarantiaIndicacaoItem | null>(null);
  const [valoresTexto, setValoresTexto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setStatus('loading');
    try {
      const itens = await load(opportunityId);
      const encontrada = itens.find((g) => g.id === garantiaId);
      if (!encontrada) {
        setStatus('nao-encontrada');
        return;
      }
      setGarantia(encontrada);
      setStatus('ok');
    } catch {
      setStatus('erro');
      return;
    }

    /*
     * DEPOIS de a página já ter conteúdo, e num `try` próprio: o texto do
     * conjunto é complemento, e uma falha nele não pode impedir a leitura da
     * garantia — que é o que o analista veio ver.
     */
    try {
      const view = await getView(opportunityId);
      setValoresTexto(view.valoresPorFinalidadeTexto);
    } catch {
      setValoresTexto(null);
    }
  }, [load, getView, opportunityId, garantiaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /*
   * ⚠️ **Sem `withBasePath`** — este valor vai para o `href` de um `next/link`,
   * que já prefixa o `basePath` sozinho. Ver o comentário gêmeo em
   * `garantia-screen.tsx` (`linkDaGarantia`): o mesmo defeito estava nas duas
   * pontas da navegação de TW-01, então o "Abrir →" levava a um 404 e o
   * "← Garantias" da página de detalhe levava a outro.
   */
  const voltar = `/oportunidades/${encodeURIComponent(opportunityId)}/garantia`;

  if (status === 'loading') {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Carregando a garantia…</span>
        <div className="h-8 w-1/3 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)" />
        <div className="h-40 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
      </div>
    );
  }

  if (status === 'nao-encontrada') return <NotFoundScreen />;

  if (status === 'erro' || !garantia) {
    return (
      <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]">
        <p className="text-(length:--t-caption)">
          Não foi possível carregar esta garantia.
        </p>
        <button
          type="button"
          onClick={() => void carregar()}
          className="mt-2 text-(length:--t-caption) font-bold text-(--secondary-600)"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-(length:--t-h3) font-bold">{garantia.tipo}</h2>
        {/* O caminho de volta é a LISTA, não a oportunidade: é de lá que o
            analista veio, e é lá que estão as outras garantias que ele revisa. */}
        <Link
          href={voltar}
          className="text-(length:--t-caption) font-bold text-(--secondary-600) no-underline"
        >
          ← Garantias
        </Link>
      </div>

      <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]">
        <GarantiaDetalhes garantia={garantia} valoresPorFinalidadeTexto={valoresTexto} />
      </div>
    </>
  );
}
