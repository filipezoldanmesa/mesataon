import {
  OPPORTUNITY_PHASE_STATE_LABELS,
  opportunityPhaseIndex,
} from '@/components/opportunities/opportunity-phase-stepper';

import { PROPOSAL_STATUS_LABEL, ProposalStatus, type OpportunityStatus } from './types';

/**
 * Fase da oportunidade em que a proposta é exibida, para as telas que a listam
 * DEPOIS da análise (aprovação e contrato).
 *
 * ## Por que a regra existe
 *
 * `ProposalStatus` tem TRÊS membros — `EM_PREENCHIMENTO`, `EM_ANALISE` e
 * `DEVOLVIDA` — e o ciclo de vida da proposta termina aí: nenhuma transição do
 * workflow move a proposta depois que a oportunidade sai da análise. O card
 * "Propostas" da tela de aprovação renderizava esse valor cru, então uma
 * oportunidade **Em aprovação** exibia a proposta como **"Em análise"** — e
 * seguia exibindo em minuta, assinatura e cadastro. Não era um valor
 * desatualizado: era o último estado que a proposta chega a ter.
 *
 * Da aprovação em diante a proposta não tem ciclo próprio — ela é a proposta
 * eleita daquela oportunidade, e o estado dela **é** a fase da oportunidade.
 * Por isso o rótulo é DERIVADO da fase, e não um enum novo: acrescentar
 * membros a `ProposalStatus` criaria uma segunda máquina de estados a manter em
 * sincronia com a do workflow, que é justamente o que produz divergência.
 *
 * ⚠️ **Não é tradução de enum.** `ProposalStatus` continua atravessando o BFF
 * 1:1 e nenhum call site de regra o consulta por aqui — isto resolve TEXTO DE
 * TELA. Colapsar os enums no mapper perderia `DEVOLVIDA` silenciosamente (o
 * defeito que o docblock de `ProposalStatus` já registra).
 *
 * ## O rótulo é LEITURA DE ESTADO, não nome de passo
 *
 * Vem de {@link OPPORTUNITY_PHASE_STATE_LABELS} pelo índice de
 * {@link opportunityPhaseIndex} — o mesmo resolvedor que pinta a trilha no topo
 * da mesma tela, então não há caminho em que a pill e a trilha discordem sobre
 * QUAL é a fase corrente.
 *
 * ⚠️ **Não é `OPPORTUNITY_PHASE_STEPS`.** Aquela é a régua de PASSOS do stepper
 * do protótipo, e numa pill o nome do passo lê como outra coisa: a proposta
 * aparecia como **"Minuta"** ao lado de um header que o backend rotula
 * **"Em minuta"** (`OPPORTUNITY_STATE_LABEL`) — duas grafias da mesma fase na
 * mesma tela. Numa lista cujos outros valores são "Em análise" e "Devolvida",
 * "Minuta" nem se lê como estado.
 *
 * @param proposalStatus status da própria proposta, como veio do backend.
 * @param fase fase da oportunidade — os mesmos três sinais que o stepper aceita.
 *   `etapa` é o que separa "Cadastro / Ativação" de "Em pagamento" (VBR-636);
 *   a tela que não tem contrato simplesmente não a passa.
 * @returns o rótulo a exibir. Nunca `null`: fase que não resolve cai no status
 *   da própria proposta, e status fora do catálogo volta CRU — a lacuna fica
 *   visível em vez de virar um rótulo plausível.
 */
export function statusPropostaExibido(
  proposalStatus: ProposalStatus | string,
  fase: {
    backendState?: string;
    status?: OpportunityStatus;
    etapa?: string;
  },
): string {
  /*
   * DEVOLVIDA sobrevive à fase porque CONTRADIZ a fase: é o único estado que a
   * proposta tem por si, e ele diz que aquela proposta voltou ao LT. Exibi-la
   * como "Em aprovação" afirmaria na tela o contrário do que aconteceu.
   */
  if (proposalStatus === ProposalStatus.Devolvida) {
    return PROPOSAL_STATUS_LABEL[ProposalStatus.Devolvida];
  }

  const index = opportunityPhaseIndex(fase.backendState, fase.status, fase.etapa);
  const faseLabel = index >= 0 ? OPPORTUNITY_PHASE_STATE_LABELS[index] : undefined;

  return (
    faseLabel ??
    PROPOSAL_STATUS_LABEL[proposalStatus as ProposalStatus] ??
    proposalStatus
  );
}
