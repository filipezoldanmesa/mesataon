import {
  PicklistField as CampoDoFront,
  PicklistFilterOutcome,
  type PicklistOption,
  type PicklistOptions,
} from '@/lib/picklists/picklists.types';

import { DOCUMENTO_TIPO } from './documento.catalog';
import { GARANTIA_TIPO, GARANTIA_UTILIZACAO } from './garantia.catalog';
import { INVESTIMENTO_ELEMENTO_IMAGEM, INVESTIMENTO_EQUIPAMENTO } from './investimento.catalog';
import {
  AREA_USUARIO,
  OPPORTUNITY_ALTERACAO_MINUTA_PADRAO,
  OPPORTUNITY_PIM_ADESAO,
  OPPORTUNITY_TIPO_NEGOCIACAO,
} from './opportunity.catalog';
import { POSTO_BANDEIRA, POSTO_PROPRIEDADE, POSTO_SITUACAO, POSTO_TIPO } from './posto.catalog';
import { PRODUCT_LINE_INCOTERM, PRODUCT_LINE_PRAZO_PAGAMENTO } from './quote-line-item.catalog';
import {
  QUOTE_ALTERACAO_MINUTA_PADRAO,
  QUOTE_FINALIDADE,
  QUOTE_LICENCA_ONEROSA,
  QUOTE_PRAZO_CONTRATO,
  QUOTE_RESPONSAVEL_MANUTENCAO,
  QUOTE_RESPONSAVEL_MANUTENCAO_IMAGEM,
  QUOTE_TIPO_CONTRATO,
  QUOTE_TIPO_PROPOSTA,
} from './quote.catalog';
import {
  RECURSO_ETAPA_LIBERACAO,
  RECURSO_FINALIDADE,
  RECURSO_INDICE_CORRECAO,
  RECURSO_PERIODICIDADE,
  RECURSO_TIPO,
} from './recurso-financeiro.catalog';
import { isActive, picklistLabel, type PicklistDefinition, type PicklistValue } from './definicao';

const DEFINICOES: readonly PicklistDefinition[] = [
  OPPORTUNITY_TIPO_NEGOCIACAO,
  OPPORTUNITY_PIM_ADESAO,
  OPPORTUNITY_ALTERACAO_MINUTA_PADRAO,
  AREA_USUARIO,
  QUOTE_TIPO_PROPOSTA,
  QUOTE_TIPO_CONTRATO,
  QUOTE_FINALIDADE,
  QUOTE_PRAZO_CONTRATO,
  QUOTE_RESPONSAVEL_MANUTENCAO,
  QUOTE_RESPONSAVEL_MANUTENCAO_IMAGEM,
  QUOTE_ALTERACAO_MINUTA_PADRAO,
  QUOTE_LICENCA_ONEROSA,
  PRODUCT_LINE_INCOTERM,
  PRODUCT_LINE_PRAZO_PAGAMENTO,
  RECURSO_TIPO,
  RECURSO_FINALIDADE,
  RECURSO_ETAPA_LIBERACAO,
  RECURSO_PERIODICIDADE,
  RECURSO_INDICE_CORRECAO,
  GARANTIA_TIPO,
  GARANTIA_UTILIZACAO,
  POSTO_TIPO,
  POSTO_SITUACAO,
  POSTO_BANDEIRA,
  POSTO_PROPRIEDADE,
  INVESTIMENTO_EQUIPAMENTO,
  INVESTIMENTO_ELEMENTO_IMAGEM,
  DOCUMENTO_TIPO,
];

/** Campo no vocabulário do FRONT — `null` para o que a BFF não cataloga (ela responde 404). */
export function campoDoFront(valor: string | null | undefined): CampoDoFront | null {
  return Object.values(CampoDoFront).find((f) => f === valor) ?? null;
}

function paraOpcao(v: PicklistValue): PicklistOption {
  return { value: v.apiName, label: picklistLabel(v), isDefault: v.isDefault === true };
}

/** Mesma regra de `PicklistCatalogService.options` do backend. */
export function opcoesDaPicklist(
  campo: CampoDoFront,
  controllingValue: string | null,
): PicklistOptions | null {
  const def = DEFINICOES.find((d) => String(d.field) === campo);
  if (!def) return null;
  const ativos = def.values.filter(isActive);
  const base = {
    field: campo,
    salesforceField: def.salesforceField,
    controlledBy: campoDoFront(def.controlledBy),
    controllingValue,
  };

  if (!def.controlledBy) {
    return { ...base, outcome: PicklistFilterOutcome.NaoDependente, options: ativos.map(paraOpcao) };
  }
  if (def.valueSettingsComplete === false) {
    return { ...base, outcome: PicklistFilterOutcome.DependenciaNaoMapeada, options: ativos.map(paraOpcao) };
  }
  if (!controllingValue) {
    return { ...base, outcome: PicklistFilterOutcome.ControladorAusente, options: [] };
  }
  const settings = def.valueSettings ?? {};
  const filtrados = ativos.filter((v) => (settings[v.apiName] ?? []).includes(controllingValue));
  if (filtrados.length === 0 && def.offerAllWhenControllerEnablesNone === true) {
    return { ...base, outcome: PicklistFilterOutcome.SemValorPublicado, options: ativos.map(paraOpcao) };
  }
  return { ...base, outcome: PicklistFilterOutcome.Filtrada, options: filtrados.map(paraOpcao) };
}

/** Só os valores (`apiName`) — o que `financial-resources/domains` devolve. */
export function valoresDaPicklist(campo: CampoDoFront, controllingValue?: string | null): string[] {
  return (opcoesDaPicklist(campo, controllingValue ?? null)?.options ?? []).map((o) => o.value);
}
