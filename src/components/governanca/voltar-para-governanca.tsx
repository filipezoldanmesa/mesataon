'use client';

import Link from 'next/link';

import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';

/**
 * "← Voltar para Governança" — a saída das telas de parametrização que ainda
 * são página.
 *
 * ## Por que existe
 *
 * As três (`/sneg/parametrizacao`, `/franquia/parametrizacao`,
 * `/parametrizacao/receitas-despesas`) nasceram como superfícies alcançadas por
 * URL, sem link nenhum apontando para elas — **hoje é UMA**: a de Franquias
 * virou a aba "Franquias" da própria Governança em 21/09/2026 (a rota antiga
 * redireciona para lá), e a da SNEG foi REMOVIDA no mesmo dia, sem nenhuma
 * seção sobrando — o último bloco dela é a aba "Padrões de BP". Sobrou Receitas
 * e Despesas, hoje oculta por `SHOW_RECEITAS_DESPESAS_SURFACE`; o componente
 * fica porque reverter aquele switch é um flip, e não a reconstrução da saída.
 * Quando a Governança passou a
 * oferecê-las em cartões (ADO 67867), a ida ganhou caminho e **a volta não**:
 * nenhuma delas está no menu global, então quem clicava no cartão ficava sem
 * rota de retorno a não ser o botão do navegador. O breadcrumb dizia
 * `🏠 » Parametrização de Franquias`, pulando o passo de onde a pessoa veio.
 *
 * O conserto é nas duas superfícies, e elas não se substituem: o breadcrumb
 * (com a crumb "Governança" clicável) diz ONDE a página fica na hierarquia, e
 * este link é a afordância de saída ao lado do título — a mesma dupla que
 * `/oportunidades/[id]/documentos` e a análise SNEG já usam.
 *
 * ## Link de texto verde, não botão contornado
 *
 * Navegar não é agir: o CTA de cada card destas telas ("Salvar limites de BR
 * Mania") é o que escreve, e um botão contornado ao lado do título disputa
 * peso visual com ele. O tratamento é o do `← Voltar para oportunidades` do
 * detalhe da oportunidade — `--secondary-600` em negrito com sublinhado no
 * hover —, que é como este repositório escreve navegação secundária.
 *
 * ## Gateado por `GovernancaAccess` (20/09/2026)
 *
 * Até aqui o link não tinha gate, e era uma dedução correta: `GOVERNANCA_PERMISSIONS`
 * era a UNIÃO das permissões das superfícies, então quem abria uma destas telas
 * tinha, por construção, entrada na Governança. **O pedido de 20/09/2026 quebrou
 * a dedução:** a SNEG perdeu o acesso à Governança e **manteve**
 * a permissão daquela tela, ou seja, ela abria `/sneg/parametrizacao` (por URL
 * direta — o cartão era o único link) e a Governança respondia `NotFoundScreen`.
 * Sem o gate, aquela tela ofereceria à SNEG **dois** caminhos para uma página que
 * não existe para ela: este link e a crumb "Governança" do breadcrumb (que ganhou
 * `permission` por crumb no mesmo commit).
 *
 * ⚠️ **Em 21/09/2026 o caso que motivou o gate deixou de existir** — o negócio
 * devolveu a URL direta como defeito (*"SNEG não deve ter acesso a nada de
 * governança"*) e a SNEG perdeu também a permissão daquela tela e
 * `FranquiaLimiteRoyaltyManage`. Hoje ninguém abre uma tela de parametrização sem
 * entrar na Governança. **O gate FICA**: ele custa um `can()` e é a rede para o
 * próximo perfil que ganhar uma superfície sem ganhar a área — foi essa
 * combinação, e não uma lista errada, que produziu o bug.
 */
export function VoltarParaGovernanca() {
  const { can } = usePermissions();

  if (!can(Permission.GovernancaAccess)) return null;

  return (
    <Link
      href="/governanca"
      data-testid="voltar-para-governanca"
      className="inline-flex items-center text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
    >
      ← Voltar para Governança
    </Link>
  );
}
