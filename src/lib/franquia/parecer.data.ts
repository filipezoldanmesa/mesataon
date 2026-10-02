/**
 * Data module for the franchise anticipated-opinion decisions (FRQ-8).
 *
 * Re-exports the BFF client directly — no flag, no mock. Components import from
 * here; tests inject stubs via prop (CLAUDE.md §"Módulo de dados").
 */
export { decidirParecerAntecipado } from './parecer.api';
export type { ParecerAcao, ParecerAntecipadoResult } from './parecer.api';
