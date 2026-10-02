import { Permission } from '@/lib/auth-permissions';
import { SHOW_RECEITAS_DESPESAS_SURFACE } from '@/lib/governanca/receitas-despesas-visibility';

/**
 * Uma superfície de parametrização alcançável pela Governança.
 *
 * `permissoes` é "qualquer uma destas" e espelha o gate da PRÓPRIA rota de
 * destino — nunca uma lista escrita à mão em paralelo. Oferecer um cartão que
 * o destino responde com `NotFoundScreen` é pior que não oferecer nada: o
 * usuário clica e a tela some.
 */
export type GovernancaSurface = {
  /**
   * A rota da TELA, quando a superfície é uma página fora da Governança.
   *
   * Ausente quando a superfície vive DENTRO da Governança (`aba`): ali não há
   * para onde navegar, o conteúdo já está na página.
   */
  href?: string;
  titulo: string;
  descricao: string;
  permissoes: readonly Permission[];
  /**
   * Quando presente, a superfície é uma ABA da Governança com este rótulo, em
   * vez de um cartão dentro de "Parametrização" (08/09/2026), e o conteúdo dela
   * é renderizado INLINE (21/09/2026).
   *
   * ⚠️ **A aba era um ATALHO, e deixou de ser em 21/09/2026** — o negócio pediu
   * *"levar Parametrização de Franquias (renomear para Franquias) para raiz de
   * governança, substituindo o item Franquia"*. Até ali, a aba "Franquia"
   * continha um cartão que levava a `/franquia/parametrizacao`: dois cliques, e
   * DUAS superfícies (aba + página) para a mesma coisa. O medo registrado aqui
   * era o de duplicar uma tela mantida — ele se resolve renderizando **o mesmo
   * componente**, não mantendo uma cópia: `CONTEUDO_DA_ABA`, na
   * `GovernancaScreen`, é o único ponto de montagem, e a rota antiga
   * redireciona para cá.
   *
   * ⚠️ **Superfície com `aba` PRECISA de conteúdo registrado em
   * `CONTEUDO_DA_ABA`** — senão a aba aparece e o painel fica vazio. Há spec
   * aferindo a correspondência nos dois sentidos.
   */
  aba?: { id: string; label: string };
};

/**
 * As telas de parametrização, na ordem em que aparecem na Governança.
 *
 * ## Por que este catálogo existe (ADO 67867, reaberto em 26/08/2026)
 *
 * As três telas nasceram **sem link nenhum** — "an admin surface reached by
 * URL", diz o docblock de cada uma. Enquanto SNEG e Admin eram os únicos perfis
 * administrativos isso passou; quando a estrutura de royalties saiu da proposta
 * de franquia e virou parametrização dos QUATRO perfis do ticket (BP
 * Financeiro, SNEG, TI Administrador e Gestor de Franquias), o cadastro ficou
 * inalcançável pela interface para dois deles:
 *
 * - **BP Financeiro e Gestor de Franquias não viam sequer o item "Governança"**
 *   no menu (ele era gateado por `AuditTrailView` = SNEG + Admin) — os dois
 *   prints do comentário mostram a barra sem o item;
 * - **a SNEG via "Governança", e a página só linkava `/sneg/parametrizacao`**,
 *   que tem três abas e nenhuma delas é royalty — daí o "não encontrei sobre
 *   Royalties para as FRANQUIAS" do outro par de prints.
 *
 * O protótipo concorda com o destino: `01-visao-geral.html:160` descreve a
 * Governança como "painel de governança da regional (tipos de documento,
 * políticas e **parametrizações**) reaproveitado da visão BP financeiro" — ou
 * seja, é ali que a parametrização mora.
 *
 * ⚠️ **A segunda metade daquela leitura caducou em 21/09/2026**, e fica
 * registrada para não voltar por analogia com o protótipo: o BP Financeiro era a
 * "audiência de referência" destes cartões, e o negócio pediu *"remover as
 * seções documentos, franquia, parametrização e auditoria do perfil de BP
 * Financeiro"*. Hoje ele **não alcança nenhuma das três superfícies** — a aba
 * "Parametrização" nem aparece para ele. O protótipo é desenho; o pedido é a
 * decisão.
 */
export const GOVERNANCA_SURFACES: readonly GovernancaSurface[] = [
  {
    /*
     * Sem `href`: desde 21/09/2026 esta superfície é renderizada DENTRO da
     * Governança (ver `aba`). `/franquia/parametrizacao` sobrevive só como
     * redirecionamento, para não quebrar link salvo.
     */
    titulo: 'Franquias',
    descricao:
      'Estrutura de royalties (limites) por bandeira, catálogo do Anexo A, taxa de franquia e COF por bandeira.',
    /*
     * A união das TRÊS listas que as seções admitem — o mesmo `TAB_PERMISSION`
     * de `FranquiaParametrizacaoScreen`. Ficar só com
     * `FranquiaParametrizacaoManage` esconderia a aba de quem mantém apenas uma
     * das outras duas tabelas, que é o defeito que o ADO 67867 reabriu.
     *
     * ⚠️ **As três coincidem hoje** (`[Gestor de Franquias, TI Administrador]`):
     * a SNEG e o BP Financeiro saíram de todas em 21/09/2026, por dois pedidos
     * independentes. A união continua sendo a forma certa — ela é que deixa cada
     * seção ter a sua audiência —, mas **não é mais ela que alcança esses dois
     * perfis**. Colapsar para uma permissão só por causa da coincidência de
     * valor quebraria a aba na primeira seção que voltasse a divergir.
     */
    permissoes: [
      /*
       * Matriz RBAC v2.1 (28/09/2026): o SPCOM VISUALIZA as tabelas de
       * franquia — cada seção cai em modo leitura sem a permissão de escrita.
       */
      Permission.GovernancaView,
      Permission.FranquiaParametrizacaoManage,
      Permission.FranquiaTaxaParametrizacaoManage,
      Permission.FranquiaLimiteRoyaltyManage,
    ],
    /*
     * O protótipo tem "Franquia" como aba própria (F5); o negócio pediu o plural
     * em 21/09/2026, junto com a promoção do conteúdo para a raiz. O `id` é
     * `franquias` porque ele nasceu junto com o rótulo novo — não há trilha, rota
     * nem permissão pendurada nele (ao contrário de `roteamento-franquia`, cujo
     * `id` é contrato e por isso NÃO acompanhou o rótulo).
     */
    aba: { id: 'franquias', label: 'Franquias' },
  },
  /*
   * ⚠️ **Receitas e Despesas está OCULTA** (21/09/2026) — *"ocultar Receitas e
   * Despesas de Governança, pois se for preciso ajustar, faremos pelo banco de
   * dados"*. A entrada continua declarada aqui, e não apagada, porque reverter
   * tem de ser um flip: `SHOW_RECEITAS_DESPESAS_SURFACE`, que a rota
   * `/parametrizacao/receitas-despesas` lê no mesmo instante para responder
   * `NotFoundScreen` — cartão escondido com a porta aberta é a metade que já
   * voltou como bug.
   */
  ...(SHOW_RECEITAS_DESPESAS_SURFACE
    ? [
        {
          href: '/parametrizacao/receitas-despesas',
          titulo: 'Receitas e Despesas',
          descricao:
            'Valores do catálogo de itens padrão de receita e despesa da proposta, por região.',
          permissoes: [Permission.FinancialItemTypeParametrizacaoManage],
        },
      ]
    : []),
];

/*
 * Entrar na Governança é `Permission.GovernancaAccess` — uma permissão PRÓPRIA,
 * e não mais a UNIÃO derivada deste catálogo (20/09/2026).
 *
 * ## Por que a união morreu
 *
 * `GOVERNANCA_PERMISSIONS` era a união das permissões das abas e dos cartões, e
 * a virtude dela era ser derivada: ninguém escrevia uma segunda lista, então
 * quem tinha cartão lá dentro sempre via o menu (o defeito que o ADO 67867
 * corrigiu). Só que ela responde *"este perfil tem alguma coisa aqui dentro?"* —
 * e o pedido de 20/09/2026 separou essa pergunta da que importa agora: *"O
 * perfil SNEG não deve ter acesso a governança. Apenas BP Financeiro, Gestor
 * Franquias e TI Administrador devem ter acesso."*
 *
 * Naquele dia a SNEG **continuava** com a permissão da tela `/sneg/parametrizacao`
 * (hoje `SnegPadroesBpGovernanca`, da aba que herdou o último bloco dela) e com
 * `FranquiaLimiteRoyaltyManage` (os quatro perfis do ADO 67867). Pela união, só
 * haveria um jeito de tirá-la da Governança: revogar autoridade que ninguém
 * pediu e que outro ticket concedeu. Então a entrada virou decisão explícita.
 *
 * ## O que faltava, e voltou como bug em 21/09/2026
 *
 * A entrada explícita tirou o MENU e a página, e não as TELAS: com o cartão
 * escondido e a permissão mantida, a SNEG seguia abrindo `/sneg/parametrizacao` e
 * `/franquia/parametrizacao` digitando a URL. O negócio devolveu isso como
 * defeito — *"Remover o acesso de SNEG à tela /sneg/parametrizacao por URL
 * direta. SNEG não deve ter acesso a nada de governança."* — e as duas permissões
 * perderam a SNEG, junto do `@Roles` das rotas correspondentes.
 *
 * ⚠️ **O invariante que fecha a CLASSE, e não o caso** (`auth-permissions.test.ts`):
 * *nenhum perfil tem permissão de uma superfície deste catálogo sem ter
 * `GovernancaAccess`*. A varredura é sobre `GOVERNANCA_SURFACES`, então
 * **superfície nova que nasça com um perfil sem entrada reprova no dia em que for
 * acrescentada** — que é o que faltou aqui.
 *
 * ⚠️ **A recíproca também é aferida** (`voltar-para-governanca.test.ts`): ao
 * acrescentar uma superfície, confira que algum perfil de
 * `PERMISSION_ROLES[Permission.GovernancaAccess]` a mantém — senão o cartão
 * existe para ninguém. As duas asserções juntas dizem que o conjunto "quem entra"
 * e o conjunto "quem mantém cada tela" não podem divergir em nenhuma direção.
 *
 * ⚠️ E é por isso que a crumb "Governança" e o `VoltarParaGovernanca` da tela de
 * parametrização que ainda é PÁGINA (`/parametrizacao/receitas-despesas`, hoje
 * oculta por `SHOW_RECEITAS_DESPESAS_SURFACE`) são GATEADOS por esta permissão:
 * quem a abrisse sem entrada na Governança veria dois caminhos para uma página
 * que responde `NotFoundScreen`. Hoje esse par não existe — o gate fica como
 * rede.
 *
 * ⚠️ **As outras duas viraram conteúdo da própria Governança:**
 * `/franquia/parametrizacao` é a aba "Franquias" (e a rota redireciona), e
 * `/sneg/parametrizacao` foi REMOVIDA em 21/09/2026 — o último bloco dela virou
 * a aba "Padrões de BP" (*"remover a seção Parametrizações SNEG, que não terá
 * mais nenhuma seção"*).
 */
