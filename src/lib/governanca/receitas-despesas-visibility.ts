/**
 * O cartão **Receitas e Despesas** da Governança e a tela por trás dele —
 * **ocultos** (pedido do negócio, 21/09/2026).
 *
 * > *"Ocultar Receitas e Despesas de Governança, pois se for preciso ajustar,
 * > faremos pelo banco de dados."*
 *
 * ## ⚠️ Switch, e não remoção — mas fecha a PORTA, não só o caminho
 *
 * Nada foi apagado: a tela (`components/parametrizacao/valores-financeiros-screen.tsx`),
 * a BFF e as rotas `/v1/financial-item-types` continuam onde estavam, com o
 * mesmo `@Roles(ADMIN)`. Desligado, este switch tira o cartão da aba
 * "Parametrização" **e** faz `/parametrizacao/receitas-despesas` responder
 * `NotFoundScreen`.
 *
 * ⚠️ **Esconder o cartão e deixar a rota aberta seria a metade que já voltou
 * como bug** (`/sneg/parametrizacao`, 20→21/09/2026): o único link para esta
 * tela era o cartão, então escondê-lo a torna alcançável só por URL salva — uma
 * superfície que o negócio acredita não existir mais, escrevendo a mesma tabela
 * que ele passou a ajustar pelo banco. As duas metades andam juntas, e é por
 * isso que elas leem o MESMO switch.
 *
 * ⚠️ **`NotFoundScreen`, e não redirecionamento para `/governanca`.** O
 * precedente do redirect (`/franquia/parametrizacao`) existe porque aquele
 * conteúdo MUDOU de lugar — está na aba "Franquias". Este não foi para lugar
 * nenhum: mandar o usuário para a Governança prometeria uma seção que ele não
 * vai encontrar lá.
 *
 * **COMO REVERTER:** ligue esta constante. Nada mais — o cartão volta ao
 * catálogo (`GOVERNANCA_SURFACES`) e a rota volta a montar a tela, com o gate
 * `FinancialItemTypeParametrizacaoManage` que ela sempre teve.
 *
 * **GATILHO DE REVISÃO:** o negócio pedir a manutenção da tabela pela interface
 * de novo — hoje o combinado é ajuste direto no banco.
 */
export const SHOW_RECEITAS_DESPESAS_SURFACE = false;
