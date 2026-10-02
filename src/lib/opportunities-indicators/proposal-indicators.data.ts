/**
 * Default data source for the per-proposal economic indicators — consumed by
 * the scenario comparison screen (`/oportunidades/[id]/comparacao`, OPP-F5)
 * and by the "Painel ao vivo" of the proposal shell (`ProposalIndicatorsBlock`,
 * OPP-F7).
 *
 * Re-exports the real BFF client unconditionally. The in-memory mock
 * (`proposal-indicators.mock.ts`) has been removed as part of the NAT-B
 * mock→backend migration (DE-PARA §2, #5 — B9). Tests inject their own
 * functions via component props and are not affected by this module.
 */
export {
  getProposalIndicators,
  recalculateProposalIndicators,
} from './proposal-indicators.api';
