/**
 * Data source for the Receitas & Despesas parametrization (Bug ADO 67585).
 * Always delegates to the real BFF endpoints — no flag, no mock re-export.
 * Tests inject their own stub functions via prop.
 */
export {
  listValoresParametrizados,
  updateValorParametrizado,
} from './financial-item-types.api';
