'use client';

import { useEffect, useState } from 'react';

export type QuadroStatus = 'loading' | 'ok' | 'error';

/**
 * Busca de um quadro do dashboard que refaz a leitura a cada troca de filtro.
 *
 * - **Troca de filtro volta ao esqueleto** — preservar as barras durante o
 *   refetch mostraria o recorte ANTERIOR com o filtro novo já selecionado.
 * - **`data` sobrevive ao refetch**, para o vocabulário dos seletores (que vem
 *   no payload) não sumir enquanto a próxima resposta chega.
 * - Resposta atrasada é descartada pelo `cleanup`.
 *
 * `key` é a identidade do filtro (ex.: `JSON.stringify(params)`): o hook não
 * compara `fetcher` por referência, então o chamador não precisa de `useCallback`.
 */
export function useQuadroFetch<T>(fetcher: () => Promise<T>, key: string) {
  const [status, setStatus] = useState<QuadroStatus>('loading');
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    fetcher()
      .then((d) => {
        if (!active) return;
        setData(d);
        setStatus('ok');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
    // `fetcher` fica fora das dependências de propósito — ver o docblock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { status, data };
}
