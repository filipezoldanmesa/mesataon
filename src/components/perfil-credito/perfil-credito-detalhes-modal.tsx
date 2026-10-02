'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

import { StatusPill } from '@/components/status-pill';
import { formatInstantDateBR } from '@/lib/date-format';
import {
  CLASSIFICACAO_RISCO_LABEL,
  STATUS_LEVANTAMENTO_LABEL,
  StatusLevantamento,
} from '@/lib/perfil-credito/types';
import type { PerfilCredito, PerfilCreditoGap } from '@/lib/perfil-credito/types';

// ---------------------------------------------------------------------------
// Detalhes da análise de perfil (ADO 67948 · ADR-0052)
// ---------------------------------------------------------------------------
//
// *"Ao clicar no detalhamento da analise de perfil, o sistema não está trazendo
// os detalhes da analise."*
//
// Desde 16/09/2026 o conteúdo inteiro vem do `textoEstruturado` que o robô do
// Brax devolve: uma seção por linha, no formato `Rótulo: valor`, mais uma
// ressalva final sem rótulo. No envelope acordado as seções são **Risco**,
// **POC**, **Restrições**, **Histórico com a VIBRA** e **Média de atraso de
// pagamento** — exatamente os blocos que este modal já tinha.
//
// ⚠️ **Os blocos NÃO são fixos, e isso é a decisão.** Filtrar pelos cinco
// rótulos conhecidos faria uma sexta seção sumir da tela em silêncio no dia em
// que o Brax a acrescentasse — e ninguém descobriria, porque o modal
// continuaria plausível e incompleto. Aqui se renderiza o que veio, na ordem em
// que veio.
//
// ⚠️ **`valor` é renderizado VERBATIM.** É prosa do fornecedor (`"Sem débitos
// vencidos"`, `"0 apontamentos no valor de R$ 0,00"`), não número: formatá-lo
// como moeda, parseá-lo como data ou compará-lo produziria um dado
// indistinguível de medição na tela de quem decide crédito. Foi por isso que o
// motor OutSystems e as leituras do SAP saíram — duas fontes para o mesmo
// veredito divergem exatamente no caso ambíguo.

/**
 * Uma seção do detalhamento.
 *
 * A separação é o `border-t` do bloco: com divisória por linha as seções viravam
 * uma lista corrida de traços e os títulos deixavam de separar coisa nenhuma.
 * É o `.kv`/`.block` do protótipo — grupo com título e conteúdo dentro.
 */
function Bloco({
  titulo,
  children,
  testId,
}: {
  titulo: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      className="border-t border-(--color-border) pt-3 pb-1 first:border-t-0 first:pt-0"
      data-testid={testId}
    >
      <h5 className="mb-1 text-[11px] font-bold uppercase tracking-[.6px] text-(--color-text-muted)">
        {titulo}
      </h5>
      {children}
    </section>
  );
}

/**
 * A frase da lacuna, subordinada ao dado que estiver ao lado.
 *
 * Nunca `--color-danger`: não falhou nada do lado do usuário, e vermelho aqui
 * leria como reprovação de crédito. Mesma decisão do `pending` da 360º
 * (VBR-493) e da pill neutra de encerramento (VBR-500).
 */
function Lacuna({ children }: { children: ReactNode }) {
  return (
    <p
      className="py-1 text-(length:--t-small) leading-[1.45] text-(--color-text-muted)"
      data-testid="perfil-lacuna"
    >
      {children}
    </p>
  );
}

/** Acha a lacuna que cobre um campo do DTO. */
function lacunaDe(gaps: PerfilCreditoGap[], campo: string): string | null {
  return gaps.find((g) => g.fields.includes(campo))?.message ?? null;
}


type Props = {
  perfil: PerfilCredito;
  /** Cabeçalho — o cliente a que a análise se refere, quando conhecido. */
  subtitulo?: string | null;
  onClose: () => void;
};

/**
 * Modal com o detalhamento do levantamento de perfil/risco/crédito.
 *
 * Puramente apresentacional: recebe o `PerfilCredito` já carregado e não busca
 * nada. Quem busca é o {@link PerfilCreditoDetalhesTrigger}, para que as duas
 * telas que abrem este detalhe (a da CCOB e o workspace da SNEG) compartilhem um
 * caminho de leitura só.
 *
 * ## ⚠️ Renderiza em PORTAL no `<body>`, e isso é obrigatório
 *
 * O protótipo põe o `.modal-ov` como filho direto do `<body>`
 * (`01a-nova-oportunidade.html:219`), fora de qualquer card — é isso que faz o
 * `z-index: 200` dele valer. Renderizado no lugar do gatilho, o modal quebra de
 * duas formas, e as duas foram MEDIDAS em 01/09/2026 no workspace SNEG:
 *
 * 1. **Empilhamento.** O `<aside>` do painel é `sticky`, e `position: sticky`
 *    CRIA stacking context — então o `z-[200]` do modal fica preso dentro dele e
 *    os círculos do stepper (`relative z-[1]`, no contexto raiz) pintavam por
 *    cima do card, cruzando o texto.
 * 2. **Herança de estilo.** O valor do `AnRow` é `text-right`, e o card inteiro
 *    saía alinhado à direita.
 *
 * A tela da garantia não mostrava nenhum dos dois, porque o `MetaItem` dela não
 * alinha nada e não tem ancestral posicionado — uma superfície só não teria
 * pego. O portal resolve os dois na raiz, em vez de remendar cada sintoma.
 */
export function PerfilCreditoDetalhesModal({ perfil, subtitulo, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const concluido = perfil.status === StatusLevantamento.Concluido;
  const encerrado = perfil.status === StatusLevantamento.Encerrado;
  const emCurso = !concluido && !encerrado;

  /*
   * A lacuna do backend, quando o levantamento concluiu sem texto (linha
   * anterior ao Brax). A frase vem de lá — duas telas abrem este modal, e uma
   * escrita aqui divergiria do catálogo na única palavra que o usuário
   * repetiria ao suporte.
   */
  const lacunaDetalhamento = lacunaDe(perfil.gaps, 'secoes');

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes da análise de perfil"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100vh-40px)] w-full max-w-[460px] flex-col overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)]">
        {/* `.modal-h` */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--color-border) px-5 py-[18px]">
          <div>
            <h4 className="text-(length:--t-h4) font-bold">
              Detalhes da análise de perfil
            </h4>
            {subtitulo && (
              <p className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">
                {subtitulo}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            &times;
          </button>
        </div>

        {/* `.modal-b` */}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {/*
            * O estado do levantamento vem PRIMEIRO, porque ele explica os
            * blocos vazios abaixo. "Em execução" não é lacuna de integração:
            * os números ainda vão chegar, e chamá-los de ausentes mandaria o
            * leitor procurar defeito onde só há espera.
            */}
          {emCurso && (
            <p
              className="mb-3 rounded-[var(--radius-xs)] bg-(--neutral-40) px-3 py-2 text-(length:--t-small) leading-[1.45] text-(--color-text-muted)"
              data-testid="perfil-em-curso"
            >
              Levantamento {STATUS_LEVANTAMENTO_LABEL[perfil.status].toLowerCase()} — os
              dados abaixo são preenchidos quando ele concluir.
            </p>
          )}
          {encerrado && (
            <p
              className="mb-3 rounded-[var(--radius-xs)] bg-(--neutral-40) px-3 py-2 text-(length:--t-small) leading-[1.45] text-(--color-text-muted)"
              data-testid="perfil-encerrado"
            >
              Levantamento encerrado
              {perfil.motivoEncerramentoLabel
                ? ` — ${perfil.motivoEncerramentoLabel}.`
                : ' — motivo não registrado.'}
            </p>
          )}

          {/*
            * ── Faixa de metadados ────────────────────────────────────────
            *
            * Classificação e data ficam FORA da lista de seções, e sem título
            * próprio. Um bloco intitulado "Risco" aqui colidiria com a seção
            * `Risco` do próprio texto — dois cabeçalhos iguais na mesma tela,
            * um com a nossa leitura e outro com a frase do emissor. A pill é
            * metadado sobre a análise; as seções SÃO a análise.
            */}
          <div
            className="mb-3 flex items-center justify-between gap-4 rounded-[var(--radius-xs)] bg-(--neutral-40) px-3 py-2"
            data-testid="perfil-meta"
          >
            <span className="text-(length:--t-caption) text-(--color-text-muted)">
              {formatInstantDateBR(perfil.dataLevantamento)}
            </span>
            {perfil.classificacao ? (
              <StatusPill variant={perfil.classificacaoPill ?? 'neutral'}>
                {CLASSIFICACAO_RISCO_LABEL[perfil.classificacao]}
              </StatusPill>
            ) : (
              <span className="text-(length:--t-caption) text-(--color-text-muted)">
                Não classificado
              </span>
            )}
          </div>

          {/*
            * ── As seções do `textoEstruturado`, na ordem do emissor ──────
            *
            * ⚠️ A seção `Risco` NÃO é filtrada, embora a pill acima saia dela:
            * a pill é a nossa LEITURA (de/para para o vocabulário do domínio) e
            * a linha é o que o Brax ESCREVEU. Esconder o texto faria a tela
            * afirmar uma classificação sem mostrar a frase que a sustenta — e,
            * quando o de/para não casa, a pill diz "Não classificado" enquanto
            * o motivo fica invisível.
            */}
          {perfil.secoes.map((secao, indice) => (
            <Bloco
              key={`${secao.rotulo}-${indice}`}
              titulo={secao.rotulo}
              testId={`bloco-secao-${indice}`}
            >
              <p className="py-2 text-(length:--t-caption) leading-[1.5] whitespace-pre-line">
                {secao.valor}
              </p>
            </Bloco>
          ))}

          {/*
            * A ressalva final do texto, ao pé — é onde o Brax a escreve, e ela
            * qualifica TODAS as seções acima ("dados obtidos em …, passível de
            * variações"). Movê-la para o topo mudaria o que ela qualifica.
            */}
          {perfil.observacao !== null && (
            <p
              className="mt-3 border-t border-(--color-border) pt-3 text-(length:--t-small) leading-[1.45] whitespace-pre-line text-(--color-text-muted)"
              data-testid="perfil-observacao"
            >
              {perfil.observacao}
            </p>
          )}

          {/*
            * Levantamento concluído SEM texto: é a linha anterior ao Brax, e
            * ela nunca vai ter detalhamento (sem backfill). A frase diz isso —
            * um modal vazio faria o dado parecer perdido.
            */}
          {concluido && perfil.secoes.length === 0 && (
            <Lacuna>
              {lacunaDetalhamento ??
                'Detalhamento não registrado neste levantamento.'}
            </Lacuna>
          )}
        </div>
      </div>
    </div>
  );

  /*
   * `document` não existe no SSR. O modal só monta depois de um clique, então na
   * prática o guard nunca dispara — mas sem ele um render de servidor futuro
   * (ou um teste que renderize fora do jsdom) quebraria.
   */
  if (typeof document === 'undefined') return null;
  return createPortal(conteudo, document.body);
}
