import type { PillVariant } from '@/components/status-pill';

import type { DdiSituacao } from './ddi.types';

/**
 * Rótulo pt-BR + cor por SITUAÇÃO da DDI — o veredito, ao lado do risco.
 *
 * ## Por que existe (ADO 67882 · 09/09/2026)
 *
 * O card "Análises" da oportunidade renderizava **só a pílula de risco**, então
 * uma DDI que a Integridade já tinha liberado com cláusulas aparecia para o LT
 * como um `Médio` âmbar e nada mais — *"na oportunidade ainda não tá como
 * aprovado"*, verbatim. O veredito existia (`status = LIBERADA`) e não tinha
 * superfície.
 *
 * O protótipo concorda: em `01c-oportunidade-analise.html:481` a linha é
 * `DDI · Integridade → pill "Aprovado · 85"` — **veredito**, não risco cru.
 * (`01b:253` mostra `pill s Baixo`, que é o caso sem parecer, coberto por
 * {@link situacaoTemVeredito} devolver `false` para `CONCLUIDA`.)
 *
 * ## Duas pílulas, não uma composta
 *
 * Risco e situação são **dois vereditos diferentes** (o do motor e o da
 * Integridade), e fundi-los num `Liberada · Médio` de cor única pintaria um
 * risco médio de verde. O card mostra as duas, lado a lado.
 *
 * ⚠️ Fonte ÚNICA dos rótulos, compartilhada com o `SituacaoBadge` do
 * `DdiPanel`: as duas superfícies falam da mesma linha, e um "Liberada" aqui ao
 * lado de um "Concluída" lá é a divergência que este módulo existe para
 * impedir. O painel mantém as próprias classes (o `neutral` dele é
 * `--neutral-100`, não o `--neutral-60` do `StatusPill`), mas o TEXTO e a
 * VARIANTE vêm daqui.
 */
export const DDI_SITUACAO_PILL: Record<
  DdiSituacao,
  { variant: PillVariant; label: string }
> = {
  PENDENTE: { variant: 'info', label: 'Pendente' },
  EM_ANDAMENTO: { variant: 'info', label: 'Em andamento' },
  CONCLUIDA: { variant: 'success', label: 'Concluída' },
  PENDENTE_PARECER: { variant: 'warning', label: 'Aguardando parecer' },
  AGUARDANDO_LT: { variant: 'warning', label: 'Aguardando decisão do LT' },
  LIBERADA: { variant: 'success', label: 'Liberada' },
  // Danger, não warning: esta bloqueia o GATE 2 por VEREDITO, não por passo
  // faltando.
  REPROVADA: { variant: 'danger', label: 'Reprovada' },
  CANCELADA: { variant: 'neutral', label: 'Cancelada' },
  ERRO: { variant: 'danger', label: 'Erro' },
  NAO_ELEGIVEL: { variant: 'neutral', label: 'Não elegível' },
};

/**
 * A situação acrescenta informação ao card "Análises", ao lado do risco?
 *
 * `false` para as situações em que a pílula de situação seria ruído ou mentira:
 *
 * - **`CONCLUIDA`** — é o risco BAIXO auto-concluído (RN-F10-07). Não houve
 *   parecer, então não há veredito da Integridade a anunciar, e o protótipo
 *   `01b` mostra exatamente uma pílula. Um "Concluída" verde ao lado de "Baixo"
 *   é a mesma informação duas vezes.
 * - **`PENDENTE` / `EM_ANDAMENTO` / `ERRO` / `NAO_ELEGIVEL`** — o card já tem
 *   ramo próprio para cada um (`Em análise`, `Erro` + racional + retry, `Não
 *   aplicável` + motivo) e nunca chega ao ramo de risco.
 *
 * Situação fora do vocabulário nunca chega aqui: `mapSituacao` degrada para
 * `EM_ANDAMENTO`, que este predicado recusa — ou seja, backend em skew nunca
 * faz a tela afirmar um veredito que ninguém emitiu.
 */
export function situacaoTemVeredito(situacao: DdiSituacao): boolean {
  return (
    situacao === 'PENDENTE_PARECER' ||
    situacao === 'AGUARDANDO_LT' ||
    situacao === 'LIBERADA' ||
    situacao === 'REPROVADA' ||
    situacao === 'CANCELADA'
  );
}
