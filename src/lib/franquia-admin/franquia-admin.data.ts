/**
 * Data source for the franquia J10 parametrization admin (FRQ-16). Always
 * delegates to the real BFF endpoints — no flag, no mock re-export. Tests
 * inject their own stub functions via prop.
 */
export {
  cofTemplateDownloadHref,
  createCatalogoRoyalty,
  criarCofTemplate,
  deleteCatalogoRoyalty,
  listCatalogoRoyalties,
  listCofTemplates,
  listLimitesRoyalty,
  listTaxaParametrizacao,
  updateCatalogoRoyalty,
  upsertLimiteRoyalty,
  upsertTaxaParametrizacao,
} from './franquia-admin.api';
