import {
  sectionGapMessage,
  type BackendSectionSourceGap,
} from '@/lib/section-gaps/gap-message';

import {
  isClassificacaoRisco,
  isStatusLevantamento,
  StatusLevantamento,
} from './types';
import type { PerfilCredito, PerfilCreditoGap, SecaoAnalise } from './types';

// ---------------------------------------------------------------------------
// Backend contract (GAR-4 · VBR-329)
// ---------------------------------------------------------------------------

/** `SecaoAnaliseDto` do backend, VERBATIM. */
interface BackendSecao {
  rotulo?: string;
  valor?: string;
}

/**
 * O backend serve `SectionSourceGapDto` — `source` + `sourceLabel` + `reason` +
 * `detail` + `fields`. **`message` não existe lá.**
 *
 * Esta interface declarava `message`, então a frase chegava `undefined` e a
 * caixa de lacuna renderizava só a lista de campos entre parênteses
 * (`(limiteAtualGrupo, pontualidade, …)`), sem dizer qual integração falta nem
 * por quê — que é a única coisa que a caixa existe para dizer.
 */
type BackendGap = BackendSectionSourceGap;

/**
 * Shape of the JSON produced by the backend `GET /v1/opportunities/:id/perfil-credito`.
 * Portuguese field names and short pill codes (`s`/`w`/`d`) are normalised by
 * {@link mapPerfilCredito} before they reach any component.
 */
/**
 * ⚠️ Os nomes abaixo são os do `PerfilCreditoDto` do backend, VERBATIM
 * (`apps/api/src/perfil-credito/dto/perfil-credito.dto.ts`) — não os nomes da
 * UI. Três deles não coincidem, e é por isso que a checagem importa:
 * `apontamentosMercadoBrl`, `debitoVencidoVibraBrl` e `levantadoEm` (a UI os
 * chama `apontamentosNoMercado`, `debitoVencido` e `dataLevantamento`).
 *
 * Esta interface já esteve escrita com os nomes da UI. O `as
 * BackendPerfilCredito` da rota BFF é uma afirmação sobre a forma em runtime
 * que o compilador não verifica, então os três campos chegavam `undefined`:
 * `debitoVencido` derrubava o painel inteiro em `fmtCurrency` ("Cannot read
 * properties of undefined (reading 'toLocaleString')"), e os outros dois
 * sumiam CALADOS — o dado existia no backend e a linha não renderizava.
 * Ao mexer aqui, leia o DTO, nunca o tipo da UI.
 */
export interface BackendPerfilCredito {
  status: string;
  classificacao: string | null;
  /** Backend short code: 's' = success, 'w' = warning, 'd' = danger. */
  classificacaoPill: string | null;
  /**
   * Seções do detalhamento, derivadas do `textoEstruturado` do Brax.
   *
   * Opcional no tipo porque um payload anterior ao ADR-0052 não o traz — skew
   * de deploy não pode quebrar a tela.
   */
  secoes?: BackendSecao[] | null;
  /** Linhas sem rótulo do texto — a ressalva final. */
  observacao?: string | null;
  /** `Date` no DTO — chega como ISO string no JSON. */
  levantadoEm: string | null;
  motivoEncerramentoLabel: string | null;
  gaps: BackendGap[] | null;
  bloqueiaFluxo: boolean;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const PILL_CODE_MAP: Record<string, 'success' | 'warning' | 'danger'> = {
  s: 'success',
  w: 'warning',
  d: 'danger',
};

// ---------------------------------------------------------------------------
// mapPerfilCredito
// ---------------------------------------------------------------------------

/**
 * Maps the raw backend payload to the typed {@link PerfilCredito} shape.
 *
 * Rules:
 * - Unknown `status` values fall back to `PENDENTE` (safest state) — never
 *   silently omit the row or pick a random first value.
 * - Unknown `classificacao` values become `null` — the component then omits
 *   the risk label rather than displaying a stale/incorrect one.
 * - `null` scalars are preserved as `null`; no default values are injected
 *   (a `0` or `'Baixo'` default would be indistinguishable from real data).
 * - `secoes` and `gaps` default to empty arrays when absent.
 */
export function mapPerfilCredito(b: BackendPerfilCredito): PerfilCredito {
  const status = isStatusLevantamento(b.status)
    ? b.status
    : StatusLevantamento.Pendente;

  const classificacao = isClassificacaoRisco(b.classificacao)
    ? b.classificacao
    : null;

  const classificacaoPill =
    b.classificacaoPill !== null && b.classificacaoPill !== undefined
      ? (PILL_CODE_MAP[b.classificacaoPill] ?? null)
      : null;

  /*
   * Seção sem rótulo ou sem valor é DESCARTADA, não renderizada vazia: uma
   * linha "…: —" afirmaria que o Brax respondeu algo que ele não respondeu. O
   * backend já garante que nenhuma chega assim; isto cobre o skew de payload.
   */
  const secoes: SecaoAnalise[] = (b.secoes ?? [])
    .map((secao) => ({ rotulo: secao.rotulo ?? '', valor: secao.valor ?? '' }))
    .filter((secao) => secao.rotulo !== '' && secao.valor !== '');

  const gaps: PerfilCreditoGap[] = (b.gaps ?? []).map((g) => ({
    fields: g.fields ?? [],
    // Frase composta no ponto único (`sourceLabel` + `reason` + `detail`) —
    // nunca escrita à mão aqui.
    message: sectionGapMessage(g),
  }));

  return {
    status,
    classificacao,
    classificacaoPill,
    secoes,
    // `?? null` fecha a porta para `undefined`: o tipo diz `| null`, e um
    // `undefined` atravessa todo guard escrito como `!== null`.
    observacao: b.observacao ?? null,
    dataLevantamento: b.levantadoEm ?? null,
    motivoEncerramentoLabel: b.motivoEncerramentoLabel ?? null,
    gaps,
    bloqueiaFluxo: b.bloqueiaFluxo,
  };
}
