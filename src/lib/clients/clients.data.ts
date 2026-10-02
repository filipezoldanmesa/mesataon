/**
 * Data sources for the client screens (search, portfolio list, 360º detail).
 * All three endpoints are wired via the BFF (`/api/clients`, `/api/clients/portfolio`,
 * `/api/clients/[id]`) which proxies the real backend.
 * Tests always inject their own function by prop, so this module is never
 * executed in unit tests.
 */
export { searchClients, getPortfolio, getClient } from './clients.api';
