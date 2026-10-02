/**
 * Default data source for the "Recursos financeiros" block (F6 — RN-F6-01/02/03/05).
 *
 * Re-exports the real API functions directly so that all callers always hit
 * the backend via the BFF.  Tests inject their own stubs via component props
 * and are never affected by this module.
 */
export {
  createFinancialResource,
  deleteFinancialResource,
  getFinancialResourceDomains,
  getFinancialResources,
  updateFinancialResource,
} from './financial-resources.api';
