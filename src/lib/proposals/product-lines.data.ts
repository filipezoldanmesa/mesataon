/**
 * Data-source barrel for the "Produtos e simulação comercial" block (F5 —
 * RN-F5-01/02/03/04, épico VBR-100/VBR-102).
 *
 * Re-exports the real BFF client unconditionally. The in-memory mock
 * (`product-lines.mock.ts`) has been removed as part of the NAT-B
 * mock→backend migration (DE-PARA §2 — B9). Tests inject their own stubs
 * via component props and are never affected by this module.
 */
export {
  createProductLine,
  deleteProductLine,
  listEligibleProducts,
  listProductLines,
  resolveCommercialTerms,
  resolveProductDefaults,
  updateProductLine,
} from './product-lines.api';
