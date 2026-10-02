/**
 * Default data source for the "Investimentos" block.
 *
 * Re-exports the real API functions so every caller reaches the backend through
 * the BFF. Tests inject stubs via component props and never touch this module.
 */
export {
  createInvestment,
  deleteInvestment,
  getInvestments,
  updateInvestment,
} from './investments.api';
