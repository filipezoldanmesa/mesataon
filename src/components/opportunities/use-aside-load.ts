'use client';

import { useEffect, useState } from 'react';

/**
 * Uma leitura por fonte — cada linha do painel lateral degrada isolada.
 *
 * Uma fonte fora do ar derruba UMA linha, nunca o card. Extraído do
 * `sneg-analise-shell` (onde nasceu como `useLoad`) quando o card "Análises"
 * passou a ser o mesmo em todas as fases: duplicá-lo faria as telas divergirem
 * no comportamento de re-leitura, que é justamente o que a extração corrige.
 */
export type AsideSlice<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'error' };

/**
 * Leitura única com gatilho opcional de re-leitura.
 *
 * `refreshSignal` é um CONTADOR, não um booleano: dois saves são dois eventos e
 * uma flag os coalesceria. `0` é o valor de montagem, então não passar nada
 * preserva o comportamento de uma leitura só.
 *
 * A re-leitura é QUIETA — não volta para `loading`. Apagar a linha esconderia
 * justamente o valor que o usuário está olhando mudar.
 *
 * `enabled = false` deixa a slice parada em `loading` e NÃO chama a função: é
 * como o card evita pedir o que o perfil não pode ler (o 403 renderizado como
 * "Não foi possível ler" diz ao usuário que o sistema quebrou) e como ele
 * desliga a leitura própria quando a tela já lhe passou a slice pronta.
 */
export function useAsideLoad<T>(
  fn: (id: string) => Promise<T>,
  id: string,
  refreshSignal = 0,
  enabled = true,
): AsideSlice<T> {
  const [state, setState] = useState<AsideSlice<T>>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState((prev) => (refreshSignal === 0 ? { status: 'loading' } : prev));
    fn(id)
      .then((value) => {
        if (active) setState({ status: 'loaded', value });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [fn, id, refreshSignal, enabled]);

  return state;
}
