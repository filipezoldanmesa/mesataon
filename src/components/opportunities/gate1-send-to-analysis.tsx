'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getGate1Readiness as defaultCheckReadiness,
  sendToAnalysis as defaultSendToAnalysis,
} from '@/lib/opportunities/gate1.data';
import type {
  Gate1MissingCode,
  Gate1MissingItem,
  Gate1Readiness,
  TriggerTransitionResult,
} from '@/lib/opportunities/types';
import {
  GateNotReadyError,
  TransitionConflictError,
  TransitionForbiddenError,
  TransitionRefusedError,
} from '@/lib/opportunities/types';
import { Permission } from '@/lib/auth-permissions';
import { usePermissions } from '@/hooks/use-permissions';
import { Spinner } from '@/components/spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The 4 required UI states plus the initial pre-flight check. */
type Gate1UiStatus = 'checking' | 'ready' | 'blocked' | 'sending' | 'error';

type Props = {
  opportunityId: string;
  /**
   * Exact backend state of the opportunity, used as the transition's
   * optimistic-lock token. Omit only when unavailable — the fallback is a
   * guess and can 422/409.
   */
  currentState?: string;
  /** Bump to force re-checking readiness after proposals/documents change elsewhere on the page. */
  refreshSignal?: number;
  /** Called after a successful `ENVIAR_PARA_ANALISE` transition (HU-14.2). */
  onTransitioned: (result: TriggerTransitionResult) => void;
  /** Called on 409 (stale state) so the parent can reload the full detail. */
  onNeedsRefresh: () => void;
  /** Injectable for tests; defaults to the real BFF client. */
  checkReadiness?: (id: string) => Promise<Gate1Readiness>;
  triggerTransition?: (id: string, currentState?: string) => Promise<TriggerTransitionResult>;
};

// ---------------------------------------------------------------------------
// Missing-criterion presentation (deep-links, HU-14.1)
// ---------------------------------------------------------------------------

const MISSING_LABEL: Record<Gate1MissingCode, string> = {
  propostas_selecionadas: 'Nenhuma proposta eleita para compor a oportunidade',
  indicadores_calculados: 'Indicadores consolidados (TIR/VPL) ainda não calculados',
  documentos_obrigatorios: 'Documentos obrigatórios pendentes',
  ddi_finalizado: 'Análise de Integridade (DDI) ainda não finalizada',
  /*
   * ADO 68233 — a frase nomeia QUEM tem a bola, porque não é o LT.
   *
   * A análise TERMINOU (risco MÉDIO/ALTO) e o que falta é o parecer da
   * Integridade. Reusar aqui o texto de `ddi_finalizado` ("ainda não
   * finalizada") diria ao LT para esperar uma ferramenta que já respondeu — e
   * o botão "Tentar novamente" da DDI, que é o conserto daquele outro código,
   * não move nada neste estado.
   */
  ddi_parecer_integridade:
    'Análise de Integridade (DDI) aguardando o parecer da Integridade',
  /*
   * ADO 68233, reaberto em 09/09/2026 — *"pendente do DDI"*, e não só "pendente
   * do parecer". Cada frase nomeia QUEM tem a bola, porque o conserto é outro:
   * aqui é o **próprio LT** que está sendo barrado (a decisão de seguir com
   * cláusulas ou cancelar), e abaixo é a Integridade revendo a reprovação.
   */
  ddi_decisao_lt:
    'Análise de Integridade (DDI) aguardando a sua decisão sobre o risco',
  ddi_reprovada:
    'Análise de Integridade (DDI) reprovada — trate os apontamentos e peça nova avaliação',
  /*
   * 09/09/2026 — o único código da DDI que NÃO sai do status: a Integridade
   * pediu um documento (`ddi:documento`) e ele ainda não foi anexado.
   *
   * A frase manda ANEXAR, e não esperar, porque aqui quem age é o próprio LT
   * que está sendo barrado — a mesma propriedade que torna o bloqueio seguro.
   */
  ddi_documento_pendente:
    'Documento solicitado pela Integridade ainda não anexado',
  /*
   * 19/09/2026 — a alçada acionada com sucesso.
   *
   * Cada frase nomeia um gesto DIFERENTE, pela mesma razão dos cinco códigos da
   * DDI acima: "acione" para quem nunca acionou, "aguarde" para quem já acionou
   * e espera o Salesforce, e "acione novamente" para quem acionou ANTES de a
   * oportunidade voltar para ajuste. Colapsá-las mandaria o LT clicar num CTA
   * que a saga recusa com 409 enquanto a simulação anterior está em voo.
   */
  alcada_nao_acionada:
    'Alçada ainda não acionada com sucesso — acione a alçada antes de enviar',
  alcada_em_simulacao:
    'Simulação da alçada em andamento no Salesforce — aguarde o resultado',
  alcada_nao_reacionada:
    'A alçada foi acionada antes da devolução — acione novamente após os ajustes',
};

/**
 * Texto da linha para um item de `missing[]` (ADO 68189).
 *
 * ⚠️ Código desconhecido cai no VALOR CRU, nunca num genérico. A lista é
 * heterogênea por contrato (ver {@link Gate1MissingItem}): o guard de franquia
 * escreve frases pt-BR já compostas ("Franquia BR Mania: FAP não anexada"), e o
 * `?? 'Requisito pendente'` anterior trocava justamente a linha que diz o que
 * consertar por uma que não diz nada. Mesma convenção do `origemDisplay` da
 * pendência.
 */
function missingLabel(item: Gate1MissingItem): string {
  return MISSING_LABEL[item as Gate1MissingCode] ?? item;
}

/**
 * Deep link do item, quando ele é um dos quatro critérios de completude.
 *
 * `null` para as frases do guard de franquia: elas já nomeiam a proposta e o
 * campo, e o destino seria a própria tela em que o usuário está — um link que
 * não leva a lugar nenhum é pior que nenhum link.
 *
 * ⚠️ **`kind` separa LER de AGIR, e não é cosmético (ADO 68233 · 11/09/2026).**
 * A barra passou a ser renderizada também para quem NÃO pode disparar o GATE 1
 * desta oportunidade (ver {@link Gate1SendToAnalysis}), e ali "Eleger proposta
 * →" / "Gerenciar documentos →" convidariam a um gesto que a pessoa não tem —
 * a queixa literal do ADO 68191. Os links de `leitura` continuam: eles levam a
 * telas que qualquer leitor abre, e são justamente o que a Integridade, a SNEG
 * e o Gestor de Franquias precisam para entender por que a oportunidade parou.
 */
type MissingDeepLink = {
  href: string;
  label: string;
  kind: 'leitura' | 'acao';
};

function missingDeepLink(
  opportunityId: string,
  item: Gate1MissingItem,
): MissingDeepLink | null {
  switch (item) {
    case 'propostas_selecionadas':
      return {
        href: `/oportunidades/${opportunityId}#propostas`,
        label: 'Eleger proposta →',
        kind: 'acao',
      };
    case 'indicadores_calculados':
      return {
        href: `/oportunidades/${opportunityId}#financeiro`,
        label: 'Ver indicadores →',
        kind: 'leitura',
      };
    case 'documentos_obrigatorios':
      return {
        href: `/oportunidades/${opportunityId}/documentos`,
        label: 'Gerenciar documentos →',
        kind: 'acao',
      };
    case 'ddi_finalizado':
    /*
     * ADO 68233 — o mesmo destino: o card "Análises" da própria tela, onde a
     * pill da DDI abre o detalhamento (`DdiDetalhesTrigger`). O LT não age
     * sobre este item, mas precisa VER em que pé a análise está — e é o único
     * endereço que existe: `/oportunidades/:id/analise` só responde depois do
     * GATE 1, que é justamente o que este critério está segurando.
     */
    case 'ddi_parecer_integridade':
    /*
     * ADO 68233 (09/09/2026) — o MESMO destino para os quatro. A pill da DDI no
     * card "Análises" é o único endereço que existe antes do GATE 1, e é dela
     * que sai o detalhamento (`DdiDetalhesTrigger`) com risco, racional e
     * parecer. Em `ddi_decisao_lt` o LT age pelo painel da DDI, e em
     * `ddi_reprovada` ele lê ali o que a Integridade apontou antes de pedir a
     * revisão.
     */
    case 'ddi_decisao_lt':
    case 'ddi_reprovada':
      return {
        href: `/oportunidades/${opportunityId}#ddi`,
        label: 'Ver análise (DDI) →',
        kind: 'leitura',
      };
    /*
     * Destino DIFERENTE dos outros quatro, de propósito: o conserto deste não é
     * ler a análise, é anexar o documento — e isso acontece no TICKET da
     * pendência, alcançado pelo card de pendências da própria tela
     * (`#pendencias`). Mandar o LT ao painel da DDI o deixaria a um clique do
     * lugar onde ele de fato age.
     */
    case 'ddi_documento_pendente':
      return {
        href: `/oportunidades/${opportunityId}#pendencias`,
        label: 'Ver pendências →',
        kind: 'leitura',
      };
    /*
     * 19/09/2026 — o MESMO destino para os três: o `AlcadaSagaPanel` da própria
     * tela de preenchimento (`#alcada`), que é onde o veredito da simulação é
     * exibido E onde o CTA "Acionar alçada" vive.
     *
     * `kind: 'leitura'` mesmo nos dois códigos cujo conserto é uma AÇÃO: o
     * painel é antes de tudo a superfície que diz POR QUE a alçada não passou
     * (o `simulacaoGate` nomeia a pré-condição que falta), e é isso que a SNEG,
     * a Integridade e o Gestor de Franquias precisam ler para entender a parada
     * — a lição do ADO 68233. Quem não pode acionar não vê CTA nenhum lá
     * dentro: o painel já é gateado por `Permission.AlcadaSimular`.
     */
    case 'alcada_nao_acionada':
    case 'alcada_em_simulacao':
    case 'alcada_nao_reacionada':
      return {
        href: `/oportunidades/${opportunityId}#alcada`,
        label: 'Ver alçada →',
        kind: 'leitura',
      };
    default:
      return null;
  }
}

/**
 * O aviso de que o **de acordo do Diretor** levantou um bloqueio (ADO 68233).
 *
 * ⚠️ **Renderizado nos DOIS estados da barra — `ready` E `blocked` — e é por
 * isso que ele é um componente, não JSX repetido.** Ele nasceu só no `ready`,
 * e o retest em staging (10/09/2026, `OPP-2026-000023`) mostrou o buraco: com
 * a oportunidade ainda barrada por OUTRO critério (proposta, indicadores,
 * documentos), o `ddi_parecer_integridade` sumia da lista e **nada** na tela
 * dizia por quê — exatamente o override silencioso que este aviso existe para
 * impedir. O caso é o COMUM, não a exceção: quem anexa o de acordo em geral
 * ainda está terminando o preenchimento.
 *
 * Sem esta linha um bloqueio de integridade que estava de pé some da barra sem
 * explicação, e nem o LT nem uma auditoria conseguem dizer pela tela por que a
 * oportunidade passou — um controle de compliance que se levanta sem deixar
 * rastro é pior que um que não existe.
 *
 * Tom `--yellow-700` (o "atenção" das telas SNEG), nunca `--color-danger`:
 * nada falhou, e vermelho aqui leria como recusa.
 */
function DeAcordoDiretorNota(): React.JSX.Element {
  return (
    <p className="mt-1 text-[12px] text-(--yellow-700)">
      Pendência de integridade liberada pelo de acordo do Diretor (Parecer - DE)
      anexado à oportunidade.
    </p>
  );
}

/**
 * Rótulo em negrito do estado bloqueado (ADO 68189).
 *
 * Era a constante "Eleja as propostas", e o protótipo NÃO faz isso: em
 * `01b-oportunidade.html:261` o `<b>` é fixo mas a frase ao lado é o `<span
 * id="enviarMsg">` que o script troca conforme o que falta. Com as propostas já
 * eleitas — o caso do ticket, com três `★ Eleita` na tela — a barra mandava
 * eleger o que já estava eleito.
 *
 * Agora o rótulo nomeia a ação SÓ quando ela é de fato o que falta; nos demais
 * casos ele descreve o estado, sem mandar fazer nada que já foi feito.
 */
function blockedHeadline(missing: Gate1MissingItem[]): string {
  return missing.includes('propostas_selecionadas')
    ? 'Eleja as propostas'
    : 'Oportunidade incompleta';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GATE 1 "Enviar para análise" action (F8 — HU-14.1/HU-14.2).
 *
 * Runs a pre-flight completeness check (`GET .../gate1-readiness`) and shows
 * one of 4 states: pronto (ready), bloqueado-com-lista (blocked), enviando
 * (sending) or erro (error) — plus a brief "checking" state while the
 * pre-flight check is in flight.
 *
 * On click, triggers `POST .../transitions {event: "ENVIAR_PARA_ANALISE"}`.
 * A 422 GATE_NOT_READY (completeness regressed between the check and the
 * click) falls back to the blocked state with the fresh `missing[]` list.
 */
export function Gate1SendToAnalysis({
  opportunityId,
  currentState,
  refreshSignal = 0,
  onTransitioned,
  onNeedsRefresh,
  checkReadiness = defaultCheckReadiness,
  triggerTransition = defaultSendToAnalysis,
}: Props) {
  /*
   * O gate do CTA (POST .../transitions). Perfil sem autoridade nunca vê o
   * botão — a API responde 403, e um botão cujo único desfecho é erro é a
   * divergência tela × gate que um predicado único existe para impedir.
   *
   * ⚠️ **Ele NÃO esconde mais o componente inteiro (ADO 68233 · 11/09/2026).**
   * A afirmação anterior — *"the whole component IS the write action"* — passou
   * a valer só para o CTA: o estado BLOQUEADO é fato sobre a oportunidade e
   * chega a todo leitor. Ver o bloco de `somenteLeitura` abaixo.
   *
   * ⚠️ Reads `OpportunitySubmitForAnalysis`, NOT `canWrite`. Until 26/08/2026
   * the gate here was `Permission.Write` ("everyone except Visualizador and
   * Expansão"), which was harmless only because the backend accepted the same
   * wide list. With per-transition authority in place
   * (`TRANSITION_AUTHORITY[ENVIAR_PARA_ANALISE]`), SPCOM, CCOB, BP Financeiro
   * and Integridade would keep seeing a button the API now refuses — the
   * screen × gate divergence that a single predicate exists to prevent.
   */
  const { can } = usePermissions();
  const canSubmit = can(Permission.OpportunitySubmitForAnalysis);
  /*
   * Os itens `ddi_*` apontam para `#ddi`, o card que só existe com `DdiView`
   * (Matriz RBAC v2.1). Sem ela o item continua listado — é o FATO que diz por
   * que o envio está parado —, só perde o link para um lugar que não existe.
   */
  const canSeeDdi = can(Permission.DdiView);
  const [status, setStatus] = useState<Gate1UiStatus>('checking');
  const [missing, setMissing] = useState<Gate1MissingItem[]>([]);
  /*
   * ADO 68233 — o de acordo do Diretor levantou um bloqueio de DDI?
   *
   * ⚠️ **Rótulo, nunca veredito.** Quem libera é o `missing[]` vazio; isto só
   * permite a barra DIZER por quê. Deriva-lo aqui (ex.: "não tem código de DDI
   * ⇒ foi o de acordo") reimplementaria no front uma regra de liberação — o
   * defeito que este repositório nomeia como tela × gate divergindo.
   */
  const [liberadoPorDeAcordo, setLiberadoPorDeAcordo] = useState(false);
  /*
   * ADO 68191 — o ator participa DESTA oportunidade?
   *
   * ⚠️ **VEREDITO do backend, ao contrário do rótulo acima.** `canSubmit`
   * responde "meu PERFIL move o GATE 1" e nada mais; como quatro dos seis
   * perfis daquela linha têm visão ampla de oportunidade, esta barra aparecia
   * em QUALQUER oportunidade em preenchimento da base — medido em 10/09/2026 na
   * `OPP-2026-000008` (responsável Ana Ribeiro) logado como Gestor de
   * Franquias. É a primeira queixa do ticket: *"o perfil é o mesmo do Líder de
   * Território. Aparece no rodapé a informação que pode enviar a oportunidade
   * para análise"*.
   *
   * Nasce `true` e só é derrubado pela resposta: o mesmo `?? true` da BFF, e
   * pela mesma razão — "não sei" degrada para o comportamento anterior (barra
   * visível), nunca para esconder o CTA de quem pode enviar.
   */
  const [podeEnviar, setPodeEnviar] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  /**
   * @param opts.quiet - Revalida SEM branquear a barra e sem reportar falha de
   *   leitura. É o modo de toda releitura por `refreshSignal`: o conteúdo já
   *   está na tela e ninguém pediu nada agora.
   *
   *   ⚠️ **Os dois efeitos colaterais do modo barulhento são consequentes aqui,
   *   não cosméticos.** `setStatus('checking')` substitui a LISTA do que falta
   *   pela frase "Verificando completude…" — e desde 20/09/2026 esta barra é
   *   revalidada em segundo plano (a conclusão da alçada e a borda `em_calculo
   *   →` dos indicadores), então ela apagaria sozinha, várias vezes durante uma
   *   rodada, exatamente o texto que o usuário está lendo. E o `catch` cai em
   *   `error`: um blip de rede trocaria a lista correta por uma mensagem
   *   vermelha que ninguém provocou — e, para quem só LÊ (`somenteLeitura`, que
   *   só renderiza no estado `blocked`), faria a barra inteira **desaparecer**.
   *
   *   Mesma regra — e mesma razão — do `reload({ silencioso })` do
   *   `AlcadaSagaPanel` e do `fetchDetail({ quiet })` do `OpportunityDetail`: o
   *   último payload bom permanece e a leitura seguinte corrige.
   *
   *   O que NÃO é silenciado: a contradição `ready: false` com `missing: []`. A
   *   leitura funcionou e o veredito é que está partido — é determinístico, vai
   *   se repetir, e deixar a barra afirmando o estado anterior seria pior.
   */
  const runCheck = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setStatus('checking');
      setErrorMsg('');
    }
    try {
      const result = await checkReadiness(opportunityId);
      const pendentes = result.missing ?? [];
      setMissing(pendentes);
      setLiberadoPorDeAcordo(result.liberadoPorDeAcordoDiretor ?? false);
      setPodeEnviar(result.podeEnviar ?? true);
      /*
       * ADO 68189 — o estado "bloqueado" existe para LISTAR o que falta, então
       * ele nunca é assumido com lista vazia.
       *
       * `ready: false` com `missing: []` é contradição do backend (o serviço
       * deriva um do outro), mas a barra é a superfície onde ela vira a frase
       * "complete os itens abaixo:" seguida de nada. Sem item nomeável a tela
       * cai no estado de ERRO, que ao menos oferece "Tentar novamente".
       */
      if (!result.ready && pendentes.length === 0) {
        setErrorMsg(
          'Não foi possível determinar o que falta para enviar a oportunidade ' +
            'para análise. Atualize e tente novamente.',
        );
        setStatus('error');
        return;
      }
      setStatus(result.ready ? 'ready' : 'blocked');
    } catch (err) {
      // Releitura de fundo que falha NÃO derruba o que está na tela — ver
      // `opts.quiet` acima. A próxima tenta de novo.
      if (opts?.quiet) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Erro ao verificar a completude da oportunidade.',
      );
      setStatus('error');
    }
  }, [checkReadiness, opportunityId]);

  /*
   * ⚠️ A pré-checagem sai para TODO leitor, e não só para quem pode enviar
   * (ADO 68233, 3ª reabertura — ver abaixo). Ela é um `GET` de leitura, aberto
   * a qualquer usuário autenticado por decisão do `WorkflowController`
   * (*"read-only pre-check, not a state-changing action"*), e é dela que sai a
   * única frase da tela que diz por que a oportunidade está parada.
   */
  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  /*
   * Releitura pedida pelo pai — sempre QUIETA, e a razão é o gatilho, não a
   * origem: `refreshSignal` revalida o que já está na tela, enquanto os dois
   * estados barulhentos existem para o mount (não há o que mostrar) e para o
   * "Tentar novamente" (alguém está esperando aquele clique). Os bumps que
   * partem de um gesto do usuário — eleger proposta, retentar a DDI — já dão
   * retorno ao lado do controle que ele tocou; os de fundo (a alçada concluir,
   * a borda `em_calculo →`) não têm gesto nenhum a que se referir.
   *
   * Pula o primeiro render — o efeito acima já carregou —, no mesmo molde do
   * `initialSignal` do `AlcadaSagaPanel`.
   */
  const initialSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === initialSignal.current) return;
    initialSignal.current = refreshSignal;
    void runCheck({ quiet: true });
  }, [refreshSignal, runCheck]);

  /*
   * ADO 68191 → ADO 68233 (3ª reabertura · 11/09/2026) — LER o bloqueio e
   * PODER enviar deixaram de ser a mesma pergunta.
   *
   * ## O que mudou, e por quê
   *
   * Até aqui a barra inteira sumia por DOIS caminhos: `canSubmit` (o perfil não
   * move o GATE 1) e `podeEnviar` (o perfil move, mas esta oportunidade não é
   * dele — ADO 68191). A razão escrita era que *"a barra é um CONVITE a agir e
   * quem só está lendo não tem o que completar"* — e ela vale para o CONVITE,
   * não para o FATO. Ao esconder a barra inteira, escondeu junto a única frase
   * da tela que diz **por que a oportunidade está parada**.
   *
   * É a queixa do retest de 11/09/2026, reproduzida no stage no mesmo dia, na
   * `PCR-PERN-000105/2026` (responsável Aline Bastos), logado como Gerente
   * Varejo: `GET .../gate1-readiness` responde
   * `{ready:false, missing:["ddi_parecer_integridade"], podeEnviar:false}` e o
   * rodapé não escreve **uma palavra** —
   *
   * > *"ao entrar na mesma oportunidade no momento não está constando nenhuma
   * > informação."*
   *
   * ⚠️ **Quem valida a regra NUNCA é o dono da oportunidade** — e o LT de outra
   * carteira nem chega à tela (o detalhe responde "Oportunidade não
   * encontrada"). Quem abre a oportunidade alheia é perfil de visão ampla
   * (`BROAD_OPPORTUNITY_VISIBILITY_ROLES`), e esse conjunto **não** coincide com
   * o de autoridade sobre o GATE 1: CCOB, SPCOM, BP Financeiro e Expansão leem
   * a base inteira e não movem a transição. Por isso o conserto não pode ser só
   * no `podeEnviar` — com o `canSubmit` de pé, quatro perfis seguiriam sem ver o
   * bloqueio, e o ticket reabriria pela quarta vez.
   *
   * ## O recorte
   *
   * Estado BLOQUEADO é fato sobre a oportunidade, e todo leitor o vê. Os demais
   * estados seguem ocultos para quem não envia:
   *
   *  - `ready` — a frase é *"atende os requisitos mínimos para seguir"*, e ela
   *    ao lado de nenhum botão é o rodapé do ADO 68191 de volta ("aparece no
   *    rodapé a informação que pode enviar a oportunidade"). Não há fato
   *    pendente a informar: nada falta.
   *  - `error`/`checking` — a pré-checagem é instrumento do CTA; oferecer
   *    "Tentar novamente" a quem não age é ruído.
   *
   * E o estado bloqueado é renderizado **sem botão** (nem desabilitado: um
   * botão cinza ainda é uma oferta) e **sem os links de ação** — ver `kind` em
   * {@link missingDeepLink}.
   *
   * ⚠️ **O CTA continua com os DOIS gates**, e nenhum deles foi afrouxado:
   * `canSubmit` é o teto por PERFIL (`TRANSITION_AUTHORITY`) e `podeEnviar` é a
   * participação nesta oportunidade (`Gate1ParticipacaoGuard`). O que deixou de
   * ser gateado por eles é a LEITURA.
   */
  const somenteLeitura = !canSubmit || !podeEnviar;
  if (somenteLeitura && status !== 'blocked') return null;

  async function handleSend() {
    setStatus('sending');
    setErrorMsg('');
    try {
      const result = await triggerTransition(opportunityId, currentState);
      onTransitioned(result);
    } catch (err) {
      if (err instanceof GateNotReadyError && err.missing.length > 0) {
        // Completeness regressed between the pre-check and the click —
        // fall back to the blocked state with the fresh missing[] list.
        setMissing(err.missing);
        setStatus('blocked');
        return;
      }
      if (err instanceof TransitionRefusedError) {
        /*
         * ADO 68189 — recusa de um guard que não produz lista estruturada.
         *
         * A frase vem do backend e NOMEIA o conserto; até aqui ela era
         * descartada e a barra caía em "bloqueado" com lista vazia. Vai para o
         * estado de erro porque é isso que ela é — a transição foi tentada e
         * recusada —, e ali o "Tentar novamente" relê a prontidão.
         */
        setErrorMsg(err.message);
        setStatus('error');
        return;
      }
      if (err instanceof TransitionForbiddenError) {
        setErrorMsg(err.message);
        setStatus('error');
        return;
      }
      if (err instanceof TransitionConflictError) {
        setErrorMsg(err.message);
        setStatus('error');
        onNeedsRefresh();
        return;
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Falha ao enviar a oportunidade para análise.',
      );
      setStatus('error');
    }
  }

  // ---------------------------------------------------------------------------
  // Render — horizontal sendbar row (message on the left, action on the right),
  // matching the prototype `.sendbar` (01b-oportunidade.html): `justify-between`.
  // ---------------------------------------------------------------------------

  if (status === 'checking') {
    return (
      <div className="flex w-full items-center gap-2 text-(length:--t-caption) text-(--color-text-muted)">
        <Spinner size="sm" label="Verificando completude da oportunidade…" />
        <span aria-hidden="true">Verificando completude da oportunidade…</span>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <div className="flex w-full items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          {/*
            O rótulo e a frase mudam com quem lê (ADO 68233 · 11/09/2026): para
            quem age, o imperativo do protótipo ("complete os itens abaixo");
            para quem só lê, a mesma lista DESCRITA, nomeando de quem é o gesto.
            Mandar "complete" alguém que não pode completar é a metade do ADO
            68191 que continua valendo.
          */}
          <p className="text-(length:--t-caption)">
            <b>{somenteLeitura ? 'Oportunidade incompleta' : blockedHeadline(missing)}</b>{' '}
            <span className="text-(--color-text-muted)">
              {somenteLeitura
                ? '· itens pendentes para o responsável (LT) enviar à análise:'
                : '· complete os itens abaixo para enviar à análise:'}
            </span>
          </p>
          <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {missing.map((item) => {
              const link = missingDeepLink(opportunityId, item);
              const mostraLink =
                link !== null &&
                (!somenteLeitura || link.kind === 'leitura') &&
                (canSeeDdi || !link.href.endsWith('#ddi'));
              return (
                <li key={item} className="flex items-center gap-1.5 text-[12px]">
                  <span className="text-(--yellow-700)">{missingLabel(item)}</span>
                  {mostraLink ? (
                    <Link
                      href={link.href}
                      className="font-bold text-(--secondary-600) hover:underline"
                    >
                      {link.label}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {liberadoPorDeAcordo ? <DeAcordoDiretorNota /> : null}
        </div>
        {/*
          Sem botão nenhum para quem não pode enviar — nem o desabilitado. Um
          botão cinza continua sendo uma oferta, e o `title` dele ("Complete os
          itens pendentes para habilitar o envio") atribuiria a essa pessoa um
          gesto que é do responsável pela oportunidade (ADO 68191).
        */}
        {somenteLeitura ? null : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Complete os itens pendentes para habilitar o envio"
            className="shrink-0 cursor-not-allowed rounded-[var(--radius-xxs)] bg-(--neutral-100) px-4 py-2 text-(length:--t-caption) font-bold text-(--color-text-muted)"
          >
            Enviar para análise →
          </button>
        )}
      </div>
    );
  }

  if (status === 'sending') {
    return (
      <div className="flex w-full items-center justify-between gap-6">
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Enviando para análise…
        </p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="shrink-0 cursor-not-allowed rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white opacity-70"
        >
          Enviando…
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex w-full items-center justify-between gap-6">
        <p role="alert" className="text-(length:--t-caption) text-(--color-danger)">
          {errorMsg}
        </p>
        <button
          type="button"
          onClick={() => void runCheck()}
          className="shrink-0 cursor-pointer text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // status === 'ready'

  return (
    <div className="flex w-full items-center justify-between gap-6">
      {/*
        Frase única, sem o rótulo em negrito nem o separador "·": o texto novo
        nomeia o DESTINO ("Em análise" — SNEG) em vez do nome interno do gate, e
        não se divide em rótulo + descrição.
      */}
      <div className="min-w-0 flex-1">
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          A oportunidade atende os requisitos mínimos para seguir para a fase
          &quot;Em análise&quot; - SNEG.
        </p>
        {liberadoPorDeAcordo ? <DeAcordoDiretorNota /> : null}
      </div>
      <button
        type="button"
        onClick={() => void handleSend()}
        className="shrink-0 cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover)"
      >
        Enviar para análise →
      </button>
    </div>
  );
}
