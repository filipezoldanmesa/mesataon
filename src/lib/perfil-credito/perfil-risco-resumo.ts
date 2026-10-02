import type { PillVariant } from '@/components/status-pill';

import {
  CLASSIFICACAO_RISCO_LABEL,
  STATUS_LEVANTAMENTO_LABEL,
  StatusLevantamento,
} from './types';
import type { PerfilCredito } from './types';

/**
 * A linha "Perfil / Risco" — UM predicado para as três telas que a exibem
 * (ADO 67983 / TC 67624 GAR-F0-B-002).
 *
 * ## O que isto conserta
 *
 * O bug foi aberto como *"Ajustes sistêmicos para retorno dos parâmetros da
 * análise de perfil"*, com o comentário do pai: *"O sistema não está retornando
 * as informações pertinentes à análise de perfil financeiro."* Os dados
 * **estavam sendo retornados** — quem os descartava era a TELA:
 *
 * 1. **A pontuação sumia.** O Test Case pai é literal — *"a etiqueta exibe
 *    'Alto' **com a pontuação**, apenas como informação"* — e o protótipo
 *    escreve `Baixo · 812` (`01c-oportunidade-analise.html:482`). A linha
 *    renderizava só `CLASSIFICACAO_RISCO_LABEL[classificacao]`. Medido em
 *    04/09/2026 na `OPP-2026-000041`: o payload trazia `score: 392` e a tela
 *    dizia **"Alto"**, uma linha abaixo de `DDI · Integridade` dizendo
 *    **"Médio · 44"** — a mesma tela exibindo a pontuação de uma análise e
 *    escondendo a da outra.
 *
 * 2. **O motivo do encerramento sumia.** Na `OPP-2026-000043` o payload traz
 *    `motivoEncerramentoLabel: "CNPJ não encontrado no bureau (SERASA)"` e a
 *    linha dizia apenas **"Encerrado"** — uma pill muda, sem dizer se o
 *    levantamento parou por falta de registro no bureau, por recusa do motor ou
 *    porque a concessão deixou de exigi-lo. São consertos diferentes. A trilha
 *    da garantia já mostrava o motivo (é o print do próprio ticket); o painel,
 *    não.
 *
 * ## Por que UM módulo
 *
 * A derivação existia **três vezes** — `defaultLoadCreditRisk`
 * (`sneg-analise-shell.tsx`), `aprovacao/analises-card.tsx` e
 * `defaultGetCreditRisk` (`sneg/analises-consumidas-block.tsx`) —, todas
 * jogando fora os dois campos, cada uma com um fallback diferente para o pill
 * (`'neutral'`, `'info'`, um mapa local). Três cópias da mesma regra é o formato
 * que este repo persegue: consertar uma deixaria as outras duas contando a
 * mesma análise de outro jeito.
 *
 * Duas dessas superfícies são hoje UMA: o card "Análises" da análise e o da
 * aprovação viraram `components/opportunities/analises-card.tsx`, o mesmo
 * componente em todas as fases a partir da análise.
 *
 * ⚠️ **Isto NÃO muda gate nenhum.** `classificacao` é informativa por
 * construção (RN-F0-03: risco ALTO não bloqueia nada — é o que o TC 67624
 * afere), e quem autoriza continua sendo `perfilCreditoGate`/`perfilConcluido`
 * no backend.
 */

/** O que a linha "Perfil / Risco" exibe. */
export type PerfilRiscoResumo = {
  /** Texto da pill: "Alto · 392", "Encerrado", "Em execução"… */
  label: string;
  variant: PillVariant;
  /**
   * Frase auxiliar sob a linha — hoje só o motivo do encerramento.
   *
   * Fica FORA da pill de propósito: "Encerrado · CNPJ não encontrado no bureau
   * (SERASA)" tem 45 caracteres numa coluna estreita e alinhada à direita, e
   * empurraria os valores das linhas vizinhas para fora. É o mesmo tratamento
   * que o card "Análises" da 01b já dá ao racional da DDI não aplicável
   * (`ddi-nao-aplicavel-motivo`).
   *
   * `null` quando não há nada a explicar — a tela não renderiza a linha.
   */
  detalhe: string | null;
};

/**
 * O resumo da linha, a partir do perfil corrente.
 *
 * `null` (o 204 da BFF — a concessão não exige levantamento) devolve `null`:
 * cada tela já tem a própria palavra para isso ("—" no workspace, "Não exigido"
 * na aprovação), e escolher uma aqui mudaria o texto das outras duas.
 */
export function resumoPerfilRisco(
  perfil: PerfilCredito | null,
): PerfilRiscoResumo | null {
  if (!perfil) return null;

  if (perfil.classificacao) {
    /*
     * ⚠️ **A pontuação saiu da etiqueta em 16/09/2026 (ADR-0052).** O TC 67624
     * pedia "classificação · pontuação", e a pontuação vinha do `score` do
     * motor OutSystems. O Brax não publica score nenhum: ele entrega a análise
     * como texto, e a única coisa de máquina que dá para derivar dela é a
     * faixa de risco. Inventar um número aqui — ou reaproveitar o `score` de um
     * levantamento antigo — poria na etiqueta uma pontuação que nenhum sistema
     * publica hoje, indistinguível de uma medida real.
     *
     * A linha `DDI · Integridade` logo acima CONTINUA com o score dela, que é
     * do NeoWay e segue existindo. As duas análises deixaram de escrever a
     * etiqueta do mesmo jeito porque deixaram de ter o mesmo dado.
     */
    return {
      label: CLASSIFICACAO_RISCO_LABEL[perfil.classificacao],
      /*
       * A cor é do BACKEND (`classificacaoPill`), nunca derivada da
       * classificação: RN-F0-03 põe o veredito de cor no read model, e derivar
       * aqui reabriria a porta para a tela pintar de vermelho um risco que o
       * domínio trata como informativo. Ausente ⇒ neutro, jamais um palpite.
       */
      variant: perfil.classificacaoPill ?? 'neutral',
      detalhe: null,
    };
  }

  /*
   * Sem classificação: o que existe é o ESTADO do levantamento. Os quatro são
   * respostas distintas ("Aguardando", "Em execução", "Concluído", "Encerrado")
   * e a pill é neutra em todos — nenhum deles é falha nem veredito.
   */
  const label =
    STATUS_LEVANTAMENTO_LABEL[perfil.status] ??
    // Status fora do vocabulário (skew de deploy): o valor cru é mais honesto
    // que um rótulo vizinho, e é a convenção do `origemDisplay` da pendência.
    String(perfil.status);

  return {
    label,
    variant: 'neutral',
    /*
     * O motivo acompanha SÓ o encerramento. Nos outros três estados não há
     * motivo a dar — e o backend garante o par
     * (`status = ENCERRADO ⟺ motivo_encerramento IS NOT NULL`), então exigir os
     * dois aqui impede que uma linha com dado inconsistente escreva na tela um
     * encerramento que não houve.
     */
    detalhe:
      perfil.status === StatusLevantamento.Encerrado
        ? perfil.motivoEncerramentoLabel
        : null,
  };
}
