/**
 * Public data façade for the "Fotos do posto e do imóvel" block (PRD F4 §7.4).
 *
 * Re-exports the real BFF client unconditionally. The backend endpoint
 * (VBR-89 BE) is confirmed and stable; all callers go directly to the real
 * BFF route. Tests inject their own functions via component props and are not
 * affected by this module.
 */
export {
  deletePostoPhoto,
  listPostoPhotos,
  uploadPostoPhoto,
} from './posto-photos.api';
