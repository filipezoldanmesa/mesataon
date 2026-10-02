/**
 * Data source for the SNEG parametrization admin (VBR-289). Always delegates
 * to the real BFF endpoints — no flag, no mock re-export. Tests inject their
 * own stub functions via prop.
 */
export {
  createBpPadrao,
  deleteBpPadrao,
  getCamposObrigatorios,
  listBpPadroes,
  putCamposObrigatorios,
  updateBpPadrao,
  upsertDistribuicao,
} from './sneg-admin.api';
