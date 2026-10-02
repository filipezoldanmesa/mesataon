'use client';

import { useState } from 'react';

type Props = {
  /**
   * O que ainda falta, listado pelo BACKEND (`vereditos.pendenciasEnvio`,
   * HU-07.2). Nunca uma lista derivada aqui: o predicado é
   * `obrigatoriedadesFranquiaPendentes`, e uma segunda implementação divergiria
   * do gate que de fato recusa.
   */
  pendencias: readonly string[];
  /**
   * Estado inicial do colapso.
   *
   * `false` na tela da proposta salva (chega-se ali para ler a tela inteira, e a
   * lista aberta era uma parede sobre o conteúdo); `true` na CRIAÇÃO, onde a
   * lista é a resposta ao bloco que a pessoa acabou de salvar. Ver o comentário
   * de cada call site.
   */
  abertaPorPadrao?: boolean;
};

/**
 * A lista de pendências dentro da sendbar da proposta de franquia.
 *
 * ## Por que é colapsável
 *
 * A lista É o conteúdo da barra — é ela que responde "o que falta?". Mas com 7
 * itens ela levava a sendbar a **197px medidos**: quase um quarto de uma tela de
 * 900px. Colapsada, a barra volta a uma linha, e o rótulo do toggle **nomeia a
 * quantidade** — é isso que impede que colapsar equivalha a esconder.
 *
 * ## Por que um componente compartilhado
 *
 * Ele existia inline na `PropostaFranquiaScreen`. Quando a tela de CRIAÇÃO passou
 * a mostrar as mesmas pendências (ADO — 01/09/2026), copiar o bloco daria duas
 * listas com o mesmo propósito, os mesmos `data-testid` e comportamentos que
 * derivariam com o tempo. Os testids são preservados
 * (`sendbar-pendencias-toggle`, `sendbar-pendencias`), então a cobertura da tela
 * da proposta continua valendo sem edição.
 *
 * `hidden` em vez de desmontar: o conteúdo segue no DOM para o `aria-controls`
 * apontar para algo real, e a lista permanece encontrável pela busca do
 * navegador. `max-h` + scroll próprio: aberta, ela deixa de crescer sem limite —
 * uma proposta com 15 pendências não pode transformar a barra na tela inteira. A
 * reserva de espaço abaixo acompanha a altura resultante (`useSendbarReserve`),
 * então abrir nunca volta a cobrir conteúdo.
 */
export function SendbarPendencias({ pendencias, abertaPorPadrao = false }: Props) {
  const [aberta, setAberta] = useState(abertaPorPadrao);

  if (pendencias.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        aria-expanded={aberta}
        aria-controls="sendbar-pendencias"
        data-testid="sendbar-pendencias-toggle"
        className="mt-0.5 flex items-center gap-1 text-[14px] font-bold text-(--secondary-600) hover:underline"
      >
        <span
          aria-hidden="true"
          className={`inline-block transition-transform ${aberta ? '' : '-rotate-90'}`}
        >
          ▾
        </span>
        {aberta
          ? 'Ocultar pendências'
          : `Ver ${pendencias.length} ${pendencias.length === 1 ? 'pendência' : 'pendências'}`}
      </button>
      <ul
        id="sendbar-pendencias"
        hidden={!aberta}
        className="mt-1 max-h-[22vh] list-inside list-disc overflow-y-auto text-[14px] text-(--color-text-muted)"
        data-testid="sendbar-pendencias"
      >
        {pendencias.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
