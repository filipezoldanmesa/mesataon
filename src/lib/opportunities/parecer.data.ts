/**
 * Data source for the Parecer Técnico SNEG block (F5 — VBR-170). The backend
 * module is already delivered (VBR-168/VBR-169), so this re-exports the real
 * API client directly — no mock. Components import from here; tests inject
 * their own functions via prop.
 */
export {
  getParecer,
  gerarParecer,
  editarParecer,
  emitirParecer,
  listParecerVersoes,
  getParecerVersao,
  parecerPdfUrl,
} from './parecer.api';
