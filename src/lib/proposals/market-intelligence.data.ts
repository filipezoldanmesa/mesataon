/**
 * Data-source barrel for the market intelligence block (F4 — RN-F4-05).
 *
 * The backend endpoint is available (ANP/pricing/posto-network — Natureza A),
 * so this module unconditionally delegates to the real BFF API.
 */
export { getMarketIntelligence, refreshMarketIntelligence } from './market-intelligence.api';
