'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  abrirJanelaDocusign,
  ehMensagemDeRetornoDocusign,
  type JanelaDocusign,
} from '@/lib/contratos/janela-docusign';

/** Intervalo do poll de `closed`. Duas comparações por segundo não custam nada. */
const INTERVALO_POLL_MS = 500;

/**
 * Ciclo de vida da janela do DocuSign.
 *
 * Dono do handle, do listener de `message`, do poll de fechamento e da limpeza.
 * Os chamadores só pedem `abrir()` no clique e recebem `onEncerrada()` quando a
 * sessão na janela acabou — **por qualquer caminho**.
 *
 * ## Por que DOIS detectores para a mesma coisa
 *
 * - **`postMessage`** é o caminho rápido: a página de retorno avisa assim que o
 *   DocuSign redireciona, e a tela atualiza antes mesmo de a janela sumir.
 * - **Poll de `window.closed`** é a rede: cobre quem fecha a janela na mão, quem
 *   nunca chega à página de retorno (sessão expirada dentro do popup, erro do
 *   fornecedor) e o dia em que um `Cross-Origin-Opener-Policy` zerar o
 *   `window.opener` — aí o `postMessage` morre e só este sobra.
 *
 * ⚠️ **Não remova o poll por achá-lo redundante com a mensagem.** Ele é o que
 * faz o desenho degradar em vez de quebrar. Os dois convergem no mesmo
 * `encerrar()`, que roda **uma vez só** por janela.
 *
 * ## Por que sincronizar mesmo quando fecharam na mão
 *
 * O fechamento diz que a sessão acabou, não o que aconteceu nela: a pessoa pode
 * ter clicado Send e fechado a confirmação, ou abandonado deixando rascunho. O
 * guia do fornecedor (§6) é explícito em não confiar no retorno do browser —
 * quem decide é a API. Sem isso a tela fica mostrando o estado de antes até o
 * worker de reconciliação passar, que foi o atraso de 7 s medido em 14/09/2026.
 */
export function useJanelaDocusign({
  oportunidadeId,
  onEncerrada,
}: {
  oportunidadeId: string;
  onEncerrada: () => void;
}): { abrir: () => JanelaDocusign; aguardando: boolean } {
  const [aguardando, setAguardando] = useState(false);

  const janelaRef = useRef<JanelaDocusign | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const encerradaRef = useRef(false);
  /*
   * O callback muda de identidade a cada render (depende de `fetchData`), e o
   * listener não pode ser reinstalado por isso — ele viveria e morreria a cada
   * render enquanto a janela está aberta. O ref segura sempre a versão atual.
   */
  const onEncerradaRef = useRef(onEncerrada);
  useEffect(() => {
    onEncerradaRef.current = onEncerrada;
  }, [onEncerrada]);

  const limpar = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Encerra a sessão da janela — no máximo uma vez. */
  const encerrar = useCallback(() => {
    if (encerradaRef.current) return;
    encerradaRef.current = true;
    limpar();
    janelaRef.current = null;
    setAguardando(false);
    onEncerradaRef.current();
  }, [limpar]);

  const abrir = useCallback((): JanelaDocusign => {
    // Uma janela de cada vez: a anterior já não interessa, e dois Taggers sobre
    // o mesmo envelope é o que se quer evitar.
    limpar();
    janelaRef.current?.fechar();

    const janela = abrirJanelaDocusign();
    janelaRef.current = janela;
    encerradaRef.current = false;

    if (janela.bloqueada) {
      /*
       * Popup bloqueado: `apontar` vai navegar a página inteira, então esta
       * janela-mãe morre. Não há o que observar, e marcar `aguardando`
       * deixaria a barra informativa no frame que ainda resta antes da
       * navegação.
       */
      return janela;
    }

    setAguardando(true);
    janela.focar();

    timerRef.current = setInterval(() => {
      if (janelaRef.current?.janela?.closed) encerrar();
    }, INTERVALO_POLL_MS);

    return janela;
  }, [encerrar, limpar]);

  useEffect(() => {
    function aoReceber(evento: MessageEvent) {
      const atual = janelaRef.current;
      if (!atual) return;
      if (
        !ehMensagemDeRetornoDocusign(evento, {
          janela: atual.janela,
          origem: window.location.origin,
          oportunidadeId,
        })
      ) {
        return;
      }
      // A janela se fecha sozinha; fechar aqui também é inofensivo e cobre o
      // caso em que o `window.close()` dela foi recusado pelo navegador.
      atual.fechar();
      encerrar();
    }

    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, [oportunidadeId, encerrar]);

  // Desmontagem (ou troca de oportunidade): mata o timer. A janela em si
  // sobrevive de propósito — a pessoa pode estar no meio da marcação, e fechá-la
  // por baixo perderia o trabalho.
  useEffect(() => limpar, [limpar]);

  return { abrir, aguardando };
}
