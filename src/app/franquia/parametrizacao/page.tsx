import { redirect } from 'next/navigation';

/**
 * `/franquia/parametrizacao` — redirecionamento para a Governança (21/09/2026).
 *
 * ## Por que a página deixou de existir
 *
 * O negócio pediu, verbatim:
 *
 * > *"Remover a tabela de roteamento J10 da parametrização de franquias
 * > (distribuição franquias que deve ter esse papel) e levar Parametrização de
 * > Franquias (renomear para Franquias) para raiz de governança, substituindo o
 * > item Franquia."*
 *
 * As tabelas de franquia agora são a aba **Franquias** de `/governanca`, com o
 * conteúdo renderizado ali (`CONTEUDO_DA_ABA` em `governanca-screen.tsx`) — o
 * mesmo componente de antes, montado em um lugar só. Até aqui eram DUAS
 * superfícies para a mesma coisa: a aba "Franquia" com um cartão-atalho e esta
 * página.
 *
 * ## Por que sobra um redirecionamento, e não um 404
 *
 * A rota era a única alcançável por link salvo, breadcrumb e histórico do
 * navegador. Um `NotFoundScreen` diria que a parametrização sumiu do produto,
 * que é falso — ela mudou de endereço. O gate fica onde o conteúdo está:
 * `/governanca` exige `GovernancaAccess`, e a aba exige a união dos três gates
 * das tabelas. Mandar para cá não concede nada a ninguém — quem não entra na
 * Governança encontra o `NotFoundScreen` dela, como encontrava o desta página.
 *
 * ⚠️ **Não acrescente `RequirePermission` aqui.** Ele renderizaria o
 * `NotFoundScreen` desta rota em vez de levar ao destino, e o destino já responde
 * a mesma coisa para quem não pode entrar — com a diferença de que o usuário
 * passa a ver a URL onde a tela realmente mora.
 */
export default function FranquiaParametrizacaoPage() {
  redirect('/governanca');
}
