import type { MarketIntelligence, MarketshareEntry } from './types';

/** A marketshare entry as returned by the backend (`bandeira`/`sharePercent`). */
export type BackendMarketShareEntry = {
  bandeira: string;
  sharePercent: number;
};

/**
 * `MarketIntelligenceDto` returned by the backend
 * (`proposal-market-intelligence.controller.ts`, F4 — RN-F4-05). Field names
 * diverge from the frontend `MarketIntelligence` shape (e.g.
 * `vmmNeighborhoodM3` vs `vmmMedioBairro`), so the BFF maps between them —
 * same pattern as `customer-mapping.ts` for the clients domain.
 */
export type BackendMarketIntelligence = {
  id: string;
  proposalId: string;
  postoRef: string;
  vmmNeighborhoodM3: number;
  vmmCityM3: number;
  vmmPostoM3: number;
  marketShareByBandeiraNeighborhood: BackendMarketShareEntry[];
  marketShareByBandeiraCity: BackendMarketShareEntry[];
  urbanPostoCount: number;
  highwayPostoCount: number;
  /** Serialized as an ISO-8601 string over the wire (backend column is `timestamptz`). */
  consultadoEm: string;
};

/** Static data-source label shown in the block's metadata line (backend has no such field). */
const FONTE = 'Tableau · Simulador de Volume de Postos';

function mapMarketShare(entries: BackendMarketShareEntry[]): MarketshareEntry[] {
  return entries.map((entry) => ({
    bandeira: entry.bandeira,
    percentual: entry.sharePercent,
  }));
}

/**
 * Maps the backend `MarketIntelligenceDto` to the frontend `MarketIntelligence`
 * shape consumed by `MarketIntelligenceBlock`.
 */
export function mapMarketIntelligenceDto(dto: BackendMarketIntelligence): MarketIntelligence {
  return {
    consultadoEm: dto.consultadoEm,
    fonte: FONTE,
    vmmMedioBairro: dto.vmmNeighborhoodM3,
    vmmMedioCidade: dto.vmmCityM3,
    vmmPosto: dto.vmmPostoM3,
    postosUrbanos: dto.urbanPostoCount,
    postosRodoviarios: dto.highwayPostoCount,
    marketshareBairro: mapMarketShare(dto.marketShareByBandeiraNeighborhood),
    marketshareCidade: mapMarketShare(dto.marketShareByBandeiraCity),
  };
}
