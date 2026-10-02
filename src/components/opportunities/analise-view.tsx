'use client';

import { SnegAnaliseShell } from '@/components/opportunities/sneg-analise-shell';
import { Spinner } from '@/components/spinner';
import { usePermissions } from '@/hooks/use-permissions';

type Props = {
  opportunityId: string;
  /** Forwarded to the shell when this view IS the opportunity screen. */
  hideBackToOpportunity?: boolean;
  /**
   * A oportunidade saiu de `EM_ANALISE` — quem montou esta view precisa reler.
   *
   * Existe porque as duas SAÍDAS de `EM_ANALISE` — a devolução
   * (`DEVOLVER_AO_LT`) e o GATE 2 (`ENVIAR_PARA_APROVACAO`) — acontecem DENTRO
   * do shell, enquanto quem escolhe a tela da fase é o pai: `OpportunityDetail`
   * guarda a oportunidade em estado de Client Component e ramifica por
   * `backendState`. Sem este aviso o estado local continuava `EM_ANALISE` e o
   * workspace da SNEG seguia na tela até o usuário recarregar à mão — medido no
   * stage em 27/08/2026 (devolução) e em `PCR-RODSUL-000094/2026` em 08/09/2026
   * (envio para aprovação, com a sendbar ainda oferecendo o botão).
   *
   * ⚠️ Os dois recursos que o shell já tinha NÃO cobrem este caso: o
   * `router.push` é no-op (o shell É o que `/oportunidades/[id]` renderiza
   * nessa fase, então nada desmonta) e o `router.refresh()` revalida Server
   * Components, não o `useEffect` de um Client Component que não remonta.
   *
   * Opcional porque a rota dedicada `/oportunidades/[id]/analise/sneg` não tem
   * pai para reler — ali o `push` é navegação de verdade e já resolve.
   */
  onNeedsRefresh?: () => void;
};

/**
 * A oportunidade em análise — UMA tela, para todos os perfis.
 *
 * Até 25/08/2026 esta view escolhia entre DUAS composições pelo perfil: o
 * analista recebia o workspace `04-analise-sneg.html` e todo o resto recebia a
 * visão do LT `01c-oportunidade-analise-lt.html`. As duas divergiram, e a do LT
 * ficou estritamente mais pobre — faltavam nela o painel da alçada, o conteúdo
 * do parecer e as linhas "Alçada sugerida" e "Recomendação" do painel lateral.
 *
 * O painel da alçada era o pior caso: `alcada:acionar` é `@Roles(LT, SNEG,
 * ADMIN)`, `Permission.AlcadaSimular` é `[LT, Sneg, Admin]` e o gate do backend
 * libera `EM_ANALISE` — o BPMN põe o ciclo `simular → ajustar → simular` na mão
 * de quem ajusta a proposta, que é o LT. Ainda assim o painel estava montado na
 * fase de preenchimento e no workspace SNEG, e sumia da tela do LT exatamente
 * na fase em que esse ciclo acontece: uma ação autorizada sem superfície.
 *
 * Agora o shell é a única tela, e o que varia é o que ela deixa EDITAR — decisão
 * que vive dentro dele (`canEdit`, a partir de `Permission.SnegAnalysis`), e não
 * aqui. Uma segunda composição para o mesmo processo volta a divergir; é a mesma
 * razão pela qual o painel da alçada é reusado em vez de reescrito por tela.
 *
 * O protótipo cruzava as duas telas com um link "Ver como SNEG →" porque não
 * tinha sessão: uma página estática precisava alcançar a outra. Com perfis reais
 * o link é sempre errado — a única pessoa a quem apareceria é o analista, que já
 * deveria estar olhando o próprio workspace. Nenhuma tela pede persona.
 *
 * Espera a sessão resolver: renderizar o shell antes disso o mostraria em modo
 * leitura e o destravaria um tick depois, fazendo os controles do analista
 * piscarem.
 */
export function AnaliseView({
  opportunityId,
  hideBackToOpportunity = false,
  onNeedsRefresh,
}: Props) {
  const { isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando a análise…" />
      </div>
    );
  }

  return (
    <SnegAnaliseShell
      opportunityId={opportunityId}
      hideBackToOpportunity={hideBackToOpportunity}
      onNeedsRefresh={onNeedsRefresh}
    />
  );
}
