/**
 * Default data source for the "Situação do posto e do imóvel" block (F4 —
 * RN-F4-01/02/03/04).
 *
 * ## Decision — 3-arg wrapper removal (B7)
 *
 * The old wrapper accepted `finalidade` as a 3rd argument so the in-memory
 * mock could enforce RN-F4-04/HU-06.1 client-side. That logic has always
 * lived on the backend (`posto-situation.service.ts → assertPostoActivable`)
 * and is the authoritative enforcement point. Now that the mock is removed
 * and the real API is always used, the 3rd argument is dead weight — callers
 * simply use the 2-arg API signature and the backend resolves `finalidade`
 * server-side from the proposal record.
 */
export {
  getBandeiraAnp,
  getPostoSituation,
  upsertPostoSituation,
} from './posto-situation.api';
