import {
  PropriedadeImovel,
  SituacaoPosto,
  TipoPosto,
} from '@/lib/picklists/salesforce-values';

import type { TipoContratoUso } from './posto-situation.types';

/**
 * PT-BR labels for the posto picklists.
 *
 * These exist only for DISPLAY of an already-stored value. For a `<select>`, use
 * `usePicklist(PicklistField.Posto*)` instead — the backend returns
 * `{ value, label }` straight from the Salesforce catalog, so a form never needs
 * a local copy that can fall behind.
 *
 * The `TipoPosto` labels genuinely differ from the values Salesforce stores
 * (`Urbano` → "Posto Urbano"), which is why the map is not redundant.
 */
export const TIPO_POSTO_LABELS: Record<TipoPosto, string> = {
  [TipoPosto.Urbano]: 'Posto urbano',
  [TipoPosto.Rodoviario]: 'Posto rodoviário',
  [TipoPosto.Maritimo]: 'Posto marítimo',
  [TipoPosto.PostoEscola]: 'Posto escola',
  [TipoPosto.Servicos]: 'Posto de serviços',
  [TipoPosto.PostoDeServicosRodoviarios]: 'Posto de serviços rodoviários',
  [TipoPosto.PostoDeServicosUrbano]: 'Posto de serviços urbano',
  // Written by this platform before the picklist catalog existed. Kept so an old
  // row renders as text instead of an empty cell.
  [TipoPosto.ServicosUrbanos]: 'Serviços urbanos',
};

export const SITUACAO_POSTO_LABELS: Record<SituacaoPosto, string> = {
  [SituacaoPosto.EmOperacao]: 'Em operação',
  [SituacaoPosto.Paralisado]: 'Paralisado',
  [SituacaoPosto.EmConstrucao]: 'Em construção',
  [SituacaoPosto.AConstruir]: 'A construir',
  // Inactive in Salesforce — never offered, but historical rows may carry it.
  [SituacaoPosto.AConstruirEmConstrucao]: 'A construir / Em construção',
};

export const PROPRIEDADE_IMOVEL_LABELS: Record<PropriedadeImovel, string> = {
  [PropriedadeImovel.DaRazaoSocialQueExploraOPosto]: 'Da razão social que explora o posto',
  [PropriedadeImovel.DosSociosDaRazaoSocial]: 'Dos sócios da razão social',
  [PropriedadeImovel.DeTerceiros]: 'De terceiros',
};

export const TIPO_CONTRATO_USO_LABELS: Record<TipoContratoUso, string> = {
  LOCACAO: 'Locação',
  ARRENDAMENTO: 'Arrendamento',
  CONVENIO: 'Convênio',
};

/**
 * RN-F4-04/HU-06.1: situações aceitas para finalidade `Implantação`.
 *
 * Mirrors the Salesforce dependency (`Situacao_Atual_Posto__c` ← `Implantação`
 * enables only these two). The backend is authoritative — it answers 409 — and
 * this copy exists only to disable the impossible options before submitting.
 */
export const SITUACOES_ACEITAS_IMPLANTACAO: readonly SituacaoPosto[] = [
  SituacaoPosto.AConstruir,
  SituacaoPosto.EmConstrucao,
];

/**
 * The posto values a user may still CHOOSE — a strict subset of the label maps
 * above.
 *
 * The maps must keep inactive and legacy members so a stored value renders as
 * text instead of a blank cell. Rendering those same maps as `<option>`s offered
 * `SERVICOS_URBANOS` (this platform's pre-catalog spelling) and
 * `A Construir / Em Construção` (inactive in Salesforce) — both now rejected by
 * the API with 400. Display and selection are different questions, so they get
 * different lists.
 *
 * All three are declared locally rather than fetched: this modal is a leaf form
 * with no controlling field to react to, and keeping it network-free is what lets
 * the Playwright specs drive it without stubbing the picklist endpoint. The
 * catalog remains the authority — `enum-catalog-parity.spec.ts` keeps the mirror
 * these lists are built from in step with it.
 */
/**
 * Os QUATRO `Tipo_De_Posto__c` que os RecordTypes do objeto de fato expõem
 * (ADO 68153).
 *
 * ⚠️ O describe **global** do Salesforce lista 7 e engana quem o consulta: os
 * três RecordTypes de `Situacao_Atual_Posto_Imovel_Cotacao__c` expõem 4 —
 * medido pela UI API (`object-info/.../picklist-values/{recordTypeId}`), que é
 * a autoridade. `Urbano`, `Rodoviário` e `Serviços` são recusados no write com
 * `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST`, e nas duas populações do org
 * (28.161 + 11.823 linhas) aparecem **zero vezes**.
 *
 * Oferecer os três seria controle morto — o LT escolhe, salva aqui, e o campo
 * nunca chega ao CRM. O de/para dos valores já gravados vive no backend
 * (`integrations/quote/domain/quote-situacao-posto.ts`); `TIPO_POSTO_LABELS`
 * mantém os 8 para EXIBIÇÃO. Display e seleção são perguntas diferentes.
 */
export const SELECTABLE_TIPOS_POSTO: readonly TipoPosto[] = [
  TipoPosto.Maritimo,
  TipoPosto.PostoEscola,
  TipoPosto.PostoDeServicosRodoviarios,
  TipoPosto.PostoDeServicosUrbano,
];

export const SELECTABLE_SITUACOES_POSTO: readonly SituacaoPosto[] = [
  SituacaoPosto.EmOperacao,
  SituacaoPosto.Paralisado,
  SituacaoPosto.EmConstrucao,
  SituacaoPosto.AConstruir,
];

export const SELECTABLE_PROPRIEDADES: readonly PropriedadeImovel[] = [
  PropriedadeImovel.DaRazaoSocialQueExploraOPosto,
  PropriedadeImovel.DosSociosDaRazaoSocial,
  PropriedadeImovel.DeTerceiros,
];
