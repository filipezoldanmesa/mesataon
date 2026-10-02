import { teamMemberQualifier, type TeamMember } from './team.types';

/**
 * O "Responsável" da linha meta do cabeçalho — `Responsável · Cliente ·
 * Oportunidade · Tipo de proposta` (protótipos `03-proposta-*`).
 *
 * ## Por que existe
 *
 * A MESMA linha é renderizada em quatro telas, e três delas estavam vazias
 * porque cada uma resolvia o campo de um jeito:
 *
 *  - **proposta de posto** (`ProposalOpportunityHeader`) — LT principal da
 *    equipe. É a única que funcionava, e é a fonte que este helper generaliza;
 *  - **proposta de franquia** — `dados.evNome`, o executivo que o roteamento
 *    J10 designava. Ele nunca resolveu: o consumer da tabela J10 a consultava
 *    com região e UF **vazias**, então nenhuma linha casava e a coluna ficava
 *    nula. Em 21/09/2026 a tabela J10 saiu do produto (quem roteia executivo de
 *    franquia é a Distribuição Franquias, que o põe na EQUIPE da oportunidade),
 *    então `evNome` é nulo por construção. E o EV já tem rótulo PRÓPRIO no card
 *    "Dados da franquia" ("Executivo de franquia"), então usá-lo aqui duplicava
 *    o card — exatamente o que o comentário do cabeçalho de lá diz ter removido
 *    para situação da loja e tipo de implantação;
 *  - **nova proposta de franquia** — `value={null}` chumbado;
 *  - **nova proposta de posto** — `opportunity.owner`, que é o `oid` cru do
 *    Entra; um guard (`looksLikeRawId`) o troca por `—` para não imprimir id na
 *    tela, o que estava certo e deixava o campo permanentemente vazio.
 *
 * A linha meta fala da OPORTUNIDADE (cliente, código, tipo), então o
 * responsável dela é o LT principal — não uma pessoa da proposta.
 *
 * ## O qualificador vem do perfil, nunca de um literal
 *
 * `teamMemberQualifier` é o mesmo que qualifica a pessoa no chip da equipe e no
 * header (perfil → cargo → balde). O cabeçalho da proposta de posto escrevia
 * `· LT` **fixo**, e criar oportunidade é aberto a seis perfis
 * (`OpportunitiesController.create`): uma oportunidade criada pela SNEG
 * afirmava "Fulana · LT". É o mesmo defeito que o `"LT"` chumbado em
 * `deriveParticipantes` já custou no thread da pendência — rótulo plausível,
 * indistinguível de um correto, sem nada na tela contradizendo.
 *
 * Qualificador desconhecido ⇒ o trecho é **omitido**, e a composição é uma
 * junção só: concatenar pedaços deixaria " · " pendurado quando o segundo falta.
 *
 * `null` quando não há principal ou ele não tem nome — o chamador renderiza o
 * traço, que é a resposta honesta para "a equipe ainda não foi estabelecida".
 */
export function responsavelDaOportunidade(
  members: readonly TeamMember[] | null | undefined,
): string | null {
  const principal = members?.find((member) => member.isPrincipal);
  if (!principal) return null;

  const nome = principal.name?.trim();
  if (!nome) return null;

  /*
   * Perfil → cargo, e PARA AÍ: o terceiro degrau de `teamMemberQualifier` é o
   * balde de franquia, que não diz nada sobre o principal. `mapTeamMember` faz
   * `role: funcao ?? 'outros'` e o criador nasce com `funcao: null`
   * (`OpportunitiesService.create`), então deixar o degrau ligado rotularia todo
   * principal sem perfil e sem cargo como **"Demais membros"** — o mesmo defeito
   * que o chip da equipe já teve.
   */
  const qualificador = teamMemberQualifier({
    roles: principal.roles,
    jobTitle: principal.jobTitle,
  });

  return [nome, qualificador]
    .filter((parte): parte is string => Boolean(parte))
    .join(' · ');
}
