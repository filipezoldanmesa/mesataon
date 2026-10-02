/**
 * Data source for the GATE 1 "Enviar para análise" action (F8,
 * `/oportunidades/[id]`). Always the real API via the BFF (which calls the
 * `gate1-readiness` and `transitions` endpoints) — the in-memory mock was
 * removed as part of moving all mock data to the backend. Components import
 * from here; tests inject their own functions via prop.
 */
export {
  GATE1_SOURCE_STATE,
  getGate1Readiness,
  sendToAnalysis,
} from './gate1.api';
