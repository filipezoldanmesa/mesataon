import { Permission } from '@/lib/auth-permissions';
import type { AcaoResolucao } from '@/lib/pendencias/types';

/**
 * Pode ESTE perfil encerrar a pendência a partir da lista?
 *
 * Existe porque as duas listas — o painel `/pendencias` e o card de pendências
 * do workspace SNEG — pintavam um CTA verde "Resolver" em toda linha aberta,
 * sem olhar para quem estava lendo. Reportado no ADO 67911: a SNEG via
 * "Resolver" na pendência `DDI: emitir parecer (risco MÉDIO/ALTO)", cujo
 * parecer é da Integridade — o ticket já recusa (`Permission.DdiReclassify`) e
 * o backend responde 400 no `POST .../resolver`, então o botão prometia uma
 * ação que nenhuma das duas camadas deixa concluir.
 *
 * O veredito do FLUXO vem do backend (`acaoResolucao`, o mesmo campo que o
 * ticket recebe); o que se decide aqui é só a autoridade do perfil sobre ele —
 * espelho do gate que a API já aplica. Esconder o controle é UX; o 403/400
 * continua sendo a garantia.
 *
 * ## Os fluxos que NINGUÉM encerra à mão (04/09/2026)
 *
 * O docblock anterior os deixava de fora e apontava para cá: *"o CTA errado
 * deles é um defeito próprio, de outra causa… Ao corrigi-los, este é o lugar —
 * não uma segunda regra numa das telas."* É o que {@link FLUXOS_SEM_RESOLUCAO_MANUAL}
 * faz.
 *
 * Nos seis, o `POST .../resolver` do backend **recusa** (400) ou não existe
 * caminho manual nenhum: quem encerra é uma verificação automática, o reenvio da
 * proposta, o anexo no hub, o anexo na proposta de franquia, ou a decisão da
 * CCOB na tela de Garantia. Um CTA chamado "Resolver" ali promete uma resolução
 * que ele não produz — a linha continua sendo um `<Link>` para o ticket (a
 * pendência é legitimamente visível), só deixa de se chamar "Resolver".
 *
 * O gatilho foi o roteamento da CCOB: `previa_garantia` nasceria com o mesmo
 * rótulo otimista, e corrigi-lo só para ele deixaria a lista dizendo "Abrir" na
 * análise prévia e "Resolver" no hub — dois fluxos que navegam igual.
 *
 * ## A POSSE — o terceiro eixo (ADO 68190 · 04/09/2026)
 *
 * Os dois eixos acima respondem sobre o FLUXO e sobre o PERFIL, e nenhum deles
 * responde **de quem é a pendência**. É a queixa do ADO 68190: *"No perfil do LT
 * está conseguindo resolver as pendências nas franquias… O perfil do LT tem que
 * ficar somente a opção Abrir"*, com o comentário *"LT nao resolve pendencias"*.
 *
 * Ver {@link pendenciaEhDoLeitor} — o veredito vem do BACKEND
 * (`resolucaoPermitida`), que é quem aplica a recusa.
 *
 * ⚠️ **A leitura literal do comentário — "o LT nunca resolve" — foi RECUSADA, e
 * a divergência fica registrada aqui em vez de reconciliada em silêncio.** O LT
 * é quem fecha 12 dos 15 gatilhos do Anexo B (`AREA_RESPONSAVEL` roteia para
 * `area:LT_EV`): anexar o documento, indicar a garantia, corrigir o bloco. Um
 * banimento geral tiraria dele a única superfície que essas pendências têm, e a
 * pendência obrigatória travaria o GATE 2 sem saída. O que a descrição do
 * ticket de fato descreve — e o que o print mostra — é uma pendência de OUTRA
 * ÁREA ("Time de Franquias", "Integridade"), e é isso que passa a bloquear.
 *
 * ## O eixo do PERFIL estava pela metade (ADO 68335 · 10/09/2026)
 *
 * > *"Resolver Pendencia x Pendencia do LT"* — o anexo circula a `PN-0414`
 * > "Cadastrar garantia", área `LT/EV`, com o CTA verde **"Resolver"** no card
 * > de pendências da oportunidade e, do outro lado do clique, um ticket **sem
 * > formulário nenhum**, dizendo *"A indicação da garantia é preenchida pelo LT
 * > responsável por esta pendência"*.
 *
 * O eixo do PERFIL existia para **um** fluxo — o `ddi` —, e o ticket gateia
 * **três**. As outras duas nunca chegaram aqui, então a lista prometia o que a
 * tela seguinte recusa:
 *
 * | Fluxo      | Gate do ticket                                 | Quem via "Resolver" à toa |
 * |------------|------------------------------------------------|---------------------------|
 * | `garantia` | `canIndicar = Write && GarantiaIndicar`        | tudo fora de LT/Admin     |
 * | `upload`   | `podeAnexar = Write && DocumentManage`         | SPCOM, CCOB, Integridade… |
 * | (todos)    | o piso `canWrite` do `ReadOnlyProfileGuard`    | Visualizador, Expansão    |
 *
 * ⚠️ **A POSSE não alcança este caso, e é por isso que ele sobreviveu ao ADO
 * 68190.** `podeEncerrarPendencia` degrada para PERMITIR quando não conhece a
 * área do perfil — e SPCOM, Gerente Varejo, BP Financeiro, TI Sustentação e
 * Visualizador **não estão** em `AREAS_ENCERRADAS_POR_ROLE`. O backend responde
 * `resolucaoPermitida: true` para eles (medido em staging na própria `PN-0414`),
 * ou seja o eixo de posse diz "pode" exatamente onde o eixo de perfil precisa
 * dizer "não". Os dois são necessários; nenhum substitui o outro.
 *
 * ⚠️ **O conserto é o RÓTULO, nunca esconder a linha.** A pendência continua
 * legitimamente visível para quem não a resolve (é a regra do ADO 67911), e a
 * linha continua sendo um `<Link>` para o ticket — que explica quem age.
 *
 * ⚠️ **Nada disto é autorização.** Quem recusa é a API (403 do
 * `ReadOnlyProfileGuard` e dos `@Roles`); aqui só se evita prometer.
 */

/**
 * Fluxos cuja resolução NÃO é um clique nesta lista nem no ticket.
 *
 * Derivado do que o backend faz, não de estética: `automatica` é fechada por
 * worker; `reenvio`, `franquia`, `previa_garantia` e `franquia_parecer` são recusadas pelo
 * `resolver` com 400; `hub` fecha quando o documento chega ao slot do checklist.
 */
const FLUXOS_SEM_RESOLUCAO_MANUAL: ReadonlySet<AcaoResolucao> = new Set([
  'automatica',
  'reenvio',
  'hub',
  'franquia',
  'previa_garantia',
  'franquia_parecer',
]);

/**
 * A permissão que o TICKET exige para agir em cada fluxo — espelho, não regra
 * nova (ADO 68335).
 *
 * Cada entrada tem um par exato em `pendencia-ticket.tsx`, e é isso que a torna
 * verificável:
 *
 * - `ddi` ⇄ `podeEmitir = canWrite && can(DdiReclassify)` (ADO 67911);
 * - `garantia` ⇄ `canIndicar = canWrite && can(GarantiaIndicar)`, o gate que
 *   troca o formulário pela nota *"A indicação da garantia é preenchida pelo LT
 *   responsável por esta pendência"*;
 * - `upload` ⇄ `podeAnexar = canWrite && can(DocumentManage)` (VBR-633).
 *
 * ⚠️ **Um MAPA, e não mais um `if` por fluxo.** O eixo do perfil nasceu como um
 * `if (acaoResolucao === 'ddi')` solto, e os dois gates que o ticket ganhou
 * depois simplesmente não foram acrescentados — o defeito não é o valor de
 * nenhuma linha, é a forma que não pedia a linha seguinte. Fluxo que o ticket
 * gateie e que não esteja aqui volta a prometer "Resolver"; o teste de paridade
 * ao lado é a rede.
 *
 * ⚠️ Fluxo AUSENTE do mapa é "sem exigência própria" (`marcar`, e o payload
 * antigo sem `acaoResolucao`) — o piso de escrita continua valendo para ele.
 * Nunca use `?? Permission.Write` aqui: o piso é aplicado uma vez, antes, para
 * todos.
 */
const PERMISSAO_POR_FLUXO: Partial<Record<AcaoResolucao, Permission>> = {
  ddi: Permission.DdiReclassify,
  /*
   * A DDI reprovada devolvida ao LT (14/09/2026) ⇄ `podePedirRevisao = canWrite
   * && can(DdiDecide)` no ticket, espelho do `@Roles(LT, ADMIN)` do
   * `POST .../ddi/solicitar-revisao`.
   *
   * ⚠️ `DdiDecide`, **nunca** `DdiReclassify`: a permissão do parecer é da
   * Integridade, e usá-la aqui esconderia o CTA justamente de quem tem a
   * tarefa — e o prometeria a quem a API recusa. É o mesmo par invertido.
   */
  ddi_revisao: Permission.DdiDecide,
  garantia: Permission.GarantiaIndicar,
  upload: Permission.DocumentManage,
};

/**
 * A pendência é DESTE leitor? — o terceiro eixo, e o único que vem do backend
 * (ADO 68190).
 *
 * `acaoResolucao` responde "que FLUXO encerra esta pendência" e a permissão
 * responde "este PERFIL pode agir neste fluxo". Faltava "de QUEM é ela".
 *
 * Medido em 04/09/2026 com o LT logado: **6 linhas** `DDI: emitir parecer
 * (risco MÉDIO/ALTO)` — `resp. Integridade` — com o CTA verde "Resolver", ao
 * lado de linhas que corretamente diziam "Abrir". Elas carregam a origem
 * LEGADA `ddi` (anterior à própria `ddi:parecer`), então `deriveAcaoResolucao`
 * cai no fallback por `tipo` e devolve `marcar`: os dois eixos existentes
 * diziam "pode", e nenhum deles jamais alcançaria o caso — origem é sobre
 * fluxo, e a pergunta do ticket é sobre posse.
 *
 * O veredito é do BACKEND (`resolucaoPermitida`), porque é ele que aplica a
 * recusa (403 em `POST .../resolver`): uma cópia da regra aqui divergiria no
 * dia em que o mapa de áreas mudasse, e a tela voltaria a oferecer o que a API
 * recusa. Ausente ⇒ "pode" (backend anterior ao campo), o lado recuperável.
 */
function pendenciaEhDoLeitor(resolucaoPermitida: boolean | undefined): boolean {
  return resolucaoPermitida !== false;
}

/** Ver o docblock do módulo. */
export function podeResolverPendencia(
  acaoResolucao: AcaoResolucao | null | undefined,
  can: (permission: Permission) => boolean,
  /**
   * O veredito de POSSE do backend. Parâmetro próprio — e não um campo dentro
   * de um objeto de pendência — porque os dois call sites (a lista `/pendencias`
   * e o card do workspace SNEG) leem tipos de item diferentes, e um objeto
   * comum obrigaria um deles a fabricar campos que não tem.
   */
  resolucaoPermitida?: boolean,
): boolean {
  /*
   * A POSSE vem PRIMEIRO: uma pendência de outra área não é do leitor,
   * qualquer que seja o fluxo — inclusive nos fluxos que qualquer um poderia
   * fechar (`marcar`, `upload`). Pôr esta checagem depois do fallback
   * permissivo a tornaria inalcançável para o caso reportado, que é justamente
   * um `marcar`.
   */
  if (!pendenciaEhDoLeitor(resolucaoPermitida)) return false;

  /*
   * O PISO DE ESCRITA, antes de qualquer fluxo (ADO 68335).
   *
   * Todo ramo do "Resolver pendência" do ticket começa por `canWrite` — o
   * espelho do `ReadOnlyProfileGuard` —, então para Visualizador e Expansão
   * NENHUM fluxo é acionável: eles recebem a nota de leitura, sempre. Prometer
   * "Resolver" a quem a própria tela seguinte trata como leitor é o mesmo
   * defeito dos fluxos abaixo, um nível acima.
   */
  if (!can(Permission.Write)) return false;

  /*
   * Fluxo que ninguém encerra à mão ⇒ a linha NAVEGA ("Abrir"), nunca promete
   * "Resolver". Vem antes do fallback permissivo abaixo de propósito: aqui não
   * se trata de autoridade do perfil, e sim de o ato não existir.
   */
  if (acaoResolucao && FLUXOS_SEM_RESOLUCAO_MANUAL.has(acaoResolucao)) {
    return false;
  }

  /*
   * O ato existe; falta saber se ESTE perfil o exerce. Ver
   * {@link PERMISSAO_POR_FLUXO} — a entrada do fluxo é a MESMA permissão que o
   * ramo correspondente do ticket consulta.
   */
  const exigida = acaoResolucao ? PERMISSAO_POR_FLUXO[acaoResolucao] : undefined;
  if (exigida) return can(exigida);

  /*
   * Fluxo não informado (payload antigo, antes de a lista publicar o campo)
   * degrada para "pode": a lista abriu com "Resolver" desde sempre, e esconder
   * o CTA por leitura incompleta tiraria a ação de quem de fato a tem. O ticket
   * e a API seguem gateando.
   */
  return true;
}

/**
 * Rótulo do CTA da linha. "Abrir" — nunca "Resolver" desabilitado: um botão que
 * não pode ser apertado é controle morto, e a pendência continua legitimamente
 * visível para quem não a resolve (o ADO pede exatamente isso: "pode
 * visualizar a pendência, só não pode ter o acesso para resolver").
 */
export function rotuloCtaPendencia(podeResolver: boolean): string {
  return podeResolver ? 'Resolver' : 'Abrir';
}
