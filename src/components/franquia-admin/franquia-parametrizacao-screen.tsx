'use client';

import { useMemo, useState } from 'react';

import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';

import {
  CATALOGO_ROYALTIES_TITULO,
  CatalogoRoyaltiesScreen,
} from './catalogo-royalties-screen';
import { COF_BANDEIRA_TITULO, CofBandeiraScreen } from './cof-bandeira-screen';
import { LIMITES_ROYALTY_TITULO, LimitesRoyaltyScreen } from './limites-royalty-screen';
import { TAXA_FRANQUIA_TITULO, TaxaFranquiaScreen } from './taxa-franquia-screen';

type Tab = 'catalogo' | 'taxa' | 'limites' | 'cof';

/**
 * O rótulo da aba é o TÍTULO da própria seção, importado dela — nunca uma
 * segunda string escrita aqui. Eram duas, e derivaram: a aba dizia "Estrutura de
 * Royalties · Limites" e a seção "Estrutura de royalties · limites"; a aba dizia
 * "Catálogo de Royalties (Anexo A)" e a seção "Catálogo de Royalties — Anexo A".
 */
const TAB_LABEL: Record<Tab, string> = {
  catalogo: CATALOGO_ROYALTIES_TITULO,
  taxa: TAXA_FRANQUIA_TITULO,
  limites: LIMITES_ROYALTY_TITULO,
  cof: COF_BANDEIRA_TITULO,
};

/**
 * Which permission each card requires. They are NOT the same set, and that is
 * the reason the gate lives per tab instead of only on the aba da Governança:
 * the franchise-fee table admits BP Financeiro (alignment of 21/08/2026, Bugs
 * 67575 / 67594), the Anexo A catalogue does not. Gating the whole surface on
 * either one alone would hide the aba from a profile the API lets in, or render
 * cards whose every save answers 403.
 */
const TAB_PERMISSION: Record<Tab, Permission> = {
  catalogo: Permission.FranquiaParametrizacaoManage,
  taxa: Permission.FranquiaTaxaParametrizacaoManage,
  /*
   * ADO 67867 — BP Financeiro, TI Administrador e Gestor de Franquias (a SNEG
   * saiu em 21/09/2026: página de Governança). Continua lista PRÓPRIA, embora
   * hoje coincida com a da taxa — são dois `@Roles` diferentes no backend.
   */
  limites: Permission.FranquiaLimiteRoyaltyManage,
  /*
   * A COF (17/09/2026) é o mesmo gate do Anexo A — *"quem tiver
   * acesso a área de governança relativo a BR Mania e Lubrax"*. Deliberadamente
   * NÃO o da taxa, que admite BP Financeiro: aquela é parametrização financeira
   * e esta é o documento legal da oferta de franquia.
   */
  cof: Permission.FranquiaParametrizacaoManage,
};

/**
 * As tabelas de franquia — a aba **Franquias** da Governança (FRQ-16).
 *
 * Quatro seções, cada uma com o gate da sua própria escrita:
 *   1. Catálogo de royalties / Anexo A (HU-13)
 *   2. Taxa de franquia e parcelas por bandeira × formato (67575 / 67594)
 *   3. Estrutura de royalties · limites por bandeira (ADO 67867) — o cadastro
 *      que saiu da proposta de franquia
 *   4. COF por bandeira (17/09/2026) — o PDF da Circular de Oferta de Franquia
 *      que é anexado à oportunidade no GATE 1 e ao contrato após a assinatura
 *
 * ## Duas mudanças de 21/09/2026, pedidas juntas pelo negócio
 *
 * > *"Remover a tabela de roteamento J10 da parametrização de franquias
 * > (distribuição franquias que deve ter esse papel) e levar Parametrização de
 * > Franquias (renomear para Franquias) para raiz de governança, substituindo o
 * > item Franquia."*
 *
 * 1. **A tabela de roteamento J10 saiu** (`tipo de posto × região × UF → EV`).
 *    Quem roteia o executivo de franquia é a aba **Distribuição Franquias**
 *    (`(bandeira, gerência) → executivo`, ADR-0053), que o põe na EQUIPE da
 *    oportunidade na criação. A J10 nunca chegou a rotear ninguém: o consumer
 *    dela consultava a tabela com região/UF **vazias**, então toda proposta de
 *    franquia caía no ramo "atribuição pendente". Backend, BFF e tela foram
 *    removidos no mesmo passe — a TABELA fica no banco, porque migration é
 *    história.
 * 2. **Esta tela deixou de ser uma página.** Ela era `/franquia/parametrizacao`,
 *    alcançada por um cartão-atalho dentro da aba "Franquia" da Governança —
 *    dois cliques e duas superfícies para a mesma coisa. Agora ela É o conteúdo
 *    da aba, e a rota antiga redireciona para `/governanca`.
 *
 * ⚠️ **Sem `<h1>` e sem `← Voltar para Governança`.** Os dois existiam porque
 * isto era uma página fora da Governança; renderizada DENTRO dela, o `<h1>` seria
 * o segundo da página (a Governança já tem o dela) e o link de volta apontaria
 * para a página em que o usuário já está. O nome "Franquias" é o rótulo da aba,
 * e cada seção abaixo traz o seu próprio `<h2>`.
 */
export function FranquiaParametrizacaoScreen() {
  const { can } = usePermissions();

  /*
   * Matriz RBAC v2.1 (28/09/2026): quem VISUALIZA a Governança (SPCOM) vê as
   * quatro seções — cada uma em modo leitura quando falta a permissão de
   * escrita dela (`TAB_PERMISSION`), que cada tela confere sozinha.
   */
  const tabs = useMemo(
    () =>
      (Object.keys(TAB_LABEL) as Tab[]).filter(
        (key) => can(Permission.GovernancaView) || can(TAB_PERMISSION[key]),
      ),
    [can],
  );

  // The first tab this profile may actually open — a fixed default would land
  // BP Financeiro on the Anexo A card, whose every save the API refuses.
  const [tabEscolhida, setTabEscolhida] = useState<Tab | null>(null);
  const tab = tabEscolhida !== null && tabs.includes(tabEscolhida) ? tabEscolhida : tabs[0];

  return (
    <>
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        Tabelas mantidas pelo time de gestão de franquias. O que for salvo aqui
        passa a valer na hora, nas propostas seguintes. Toda alteração fica
        registrada com autor e data.
      </p>

      {/* Section tabs */}
      <div
        className="mt-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Tabelas de franquia"
      >
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTabEscolhida(key)}
            className={`rounded-full border px-3 py-1.5 text-(length:--t-small) font-bold ${
              tab === key
                ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                : 'border-(--color-border) bg-(--color-surface)'
            }`}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'catalogo' && <CatalogoRoyaltiesScreen />}
        {tab === 'taxa' && <TaxaFranquiaScreen />}
        {tab === 'limites' && <LimitesRoyaltyScreen />}
        {tab === 'cof' && <CofBandeiraScreen />}
      </div>
    </>
  );
}
