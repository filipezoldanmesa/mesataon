/**
 * Data module for the alçada saga — components import from HERE, never from
 * `.api`/`.mock` directly (repo convention). The backend is live, so this is
 * a direct re-export of the API client.
 */
export { acionarAlcada, enviarAlcada, getAlcadaStatus } from './alcada.api';
