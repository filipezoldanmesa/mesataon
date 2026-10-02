/**
 * Public data façade for the "Receitas e Despesas" block (PRD F9 §7.9).
 *
 * Re-exports the real BFF client unconditionally. The in-memory mock
 * (`financial-items.mock.ts`) has been removed as part of the NAT-B
 * mock→backend migration (DE-PARA §2, #8). Tests inject their own functions
 * via component props and are not affected by this module.
 */
export {
  createFinancialItem,
  deleteFinancialItem,
  listFinancialItemTypes,
  listFinancialItems,
  seedRequiredFinancialItems,
  updateFinancialItem,
} from './financial-items.api';
