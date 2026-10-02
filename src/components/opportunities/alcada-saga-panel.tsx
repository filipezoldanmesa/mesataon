'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { FieldHint } from '@/components/field-hint';
import { StatusPill } from '@/components/status-pill';
import type { PillVariant } from '@/components/status-pill';
import { useCalculationPolling } from '@/hooks/use-calculation-polling';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  acionarAlcada as defaultAcionar,
  getAlcadaStatus as defaultGetStatus,
} from '@/lib/alcada/alcada.data';
import { patchOpportunityDetail as defaultPatchDetail } from '@/lib/opportunities/opportunity-detail.api';
import {
  AlcadaAcionamentoConcorrenteError,
  AlcadaEmAndamentoError,
  AlcadaPreCondicaoError,
  CrmLinkStatus,
  QuoteSyncStatus,
  SimulacaoAlcadaBloqueio,
  type AlcadaSagaStatus,
} from '@/lib/alcada/alcada.types';

/**
 * Por quanto tempo o painel insiste antes de devolver o "↻ Atualizar".
 *
 * DERIVADO do backend, não escolhido aqui (regra do
 * {@link useCalculationPolling}). O que se espera é o **acionamento**, e o pior
 * caso dele é: o `AlcadaRetryWorker` varre a cada 60 s (a rede de segurança do
 * atalho no callback do ARP) e `ACIONAMENTO_MIN_INTERVALO_MS` segura um
 * re-acionamento por 5 min. 6 min cobre os dois com margem.
 *
 * ⚠️ **Não cobre — de propósito — o caso patológico da SIMULAÇÃO expirar.** Ali
 * o backend leva até ~10 min para decidir (`EXPIRY_TIMEOUT_MS` de 5 min + a
 * varredura de 5 min do `AlcadaReconciliationWorker`) e ainda retenta depois;
 * polir por todo esse tempo seriam dezenas de leituras da prontidão inteira por
 * painel aberto, para um desfecho que o próprio painel já anuncia como
 * "repetindo automaticamente". Passado o orçamento, o refresh explícito assume.
 */
const ORCAMENTO_POLLING_MS = 6 * 60_000;

type Props = {
  opportunityId: string;
  /**
   * Counter the parent bumps to make the panel re-read `GET .../alcada`.
   *
   * The saga's vereditos depend on data this panel does not own: saving the
   * opportunity's dados changes what the gate allows, and the GATE 2 transition
   * submits the alçada as a pre-commit effect. Neither of those goes through
   * `reload()`, so the panel kept showing the previous verdict until someone
   * pressed "↻ Atualizar" or reloaded the page — after a 200 (VBR-645).
   *
   * A **counter**, not a boolean: two consecutive saves are two events, and a
   * flag that is already `true` would not fire the second one. Same pattern as
   * `gate1RefreshSignal` / `indicatorsRefreshSignal` in `opportunity-detail`.
   *
   * The re-read is **quiet** — it never drops back to the loading state, because
   * blanking the panel hides the very values the user is watching for a change.
   */
  refreshSignal?: number;
  /**
   * Somente leitura por CONTEXTO, independente do papel de quem olha.
   *
   * Existe porque este painel é montado em dois lugares com regras diferentes:
   * na tela de preenchimento, onde o LT legitimamente aciona a alçada
   * (`Permission.AlcadaSimular` é `[LT, Sneg, Admin]`), e na tela da
   * oportunidade JÁ em análise, que para quem não é analista é de leitura.
   * Restringir a permissão resolveria o segundo caso quebrando o primeiro.
   *
   * Só suprime AÇÃO — os vereditos, a cadeia de níveis e o `↻ Atualizar`
   * continuam, porque reler não é editar.
   */
  readOnly?: boolean;
  /**
   * Avisa o pai que a prontidão do ENVIO mudou — ele releia o que depende dela.
   *
   * ⚠️ Este painel relê sozinho (polling, ADO 67941) e a sendbar do GATE 2 não:
   * a prontidão dela é estado do `SnegAnaliseShell`, relido só nas ações que o
   * próprio shell executa. Quando a sincronização da cotação concluía com a
   * tela aberta, o quadro passava a dizer "Sincronizada · Simulação concluída"
   * e a barra continuava afirmando que a alçada não foi acionada, com "Enviar
   * para aprovação" desabilitado — até alguém recarregar a página. O backend
   * estava certo dos dois lados (`avaliarAlcadaSimuladaGate` é o predicado
   * único); o que faltava era o sinal de VOLTA, o par do {@link refreshSignal}.
   *
   * Disparado só quando {@link assinaturaDeProntidaoDeEnvio} MUDA, e nunca na
   * primeira leitura — ver o docblock daquela função.
   */
  onProntidaoMudou?: () => void;
  /** Injectable for tests; defaults to the real BFF clients. */
  getStatus?: typeof defaultGetStatus;
  acionar?: typeof defaultAcionar;
  /**
   * Grava a resposta de "Possui nova imagem de pista" quando é ELA que trava o
   * gate. Injetável para teste; default é o `PATCH` da BFF.
   */
  patchDetail?: typeof defaultPatchDetail;
};

/**
 * Código de gate cuja recusa este painel sabe consertar por conta própria.
 *
 * ⚠️ **Um só, e não uma lista.** As outras recusas de
 * `avaliarSimulacaoAlcadaGate` mandam a outros lugares — anexar documento,
 * recalcular TIR, indicar garantia, eleger proposta — e nenhuma delas cabe num
 * par de botões aqui. Esta cabe porque a pergunta é binária e a única superfície
 * que a oferecia (o modal de edição da tela de preenchimento) não existe na tela
 * onde a recusa aparece.
 *
 * Medido no stage em 02/09/2026 (OPP-2026-000051 e OPP-2026-000046): o painel
 * dizia "informe nos dados da oportunidade" no workspace SNEG, onde o campo não
 * estava em lugar nenhum — alçada travada sem saída pela interface.
 */
const GATE_IMAGEM_PISTA = 'IMAGEM_PISTA_NAO_RESPONDIDA';

/**
 * O que o card faz — texto do ⓘ ao lado do título.
 *
 * Era um parágrafo no rodapé. É contexto de leitura única ("o que este processo
 * faz"), e vivia ocupando quatro linhas embaixo do CTA, entre o leitor e as
 * frases que pedem ação.
 *
 * O `ATUALIZANDO` em caixa alta saiu: ele existia para destacar, dentro de um
 * parágrafo corrido, a metade do acoplamento que a entrega de 20/08/2026
 * consertou (criar no primeiro acionamento, atualizar nos seguintes). Num
 * tooltip curto o destaque não tem função, e caixa alta lê como grito.
 */
const AJUDA_PROCESSO =
  'Integra a oportunidade e as cotações no CRM (criando no primeiro ' +
  'acionamento e atualizando nos seguintes), sincroniza e simula a alçada ' +
  'sobre os valores atuais. Os resultados chegam automaticamente.';

/**
 * Retrato do que o GATE 2 lê da saga — a chave que decide se vale avisar o pai.
 *
 * Cobre exatamente as entradas dos dois predicados do backend que a sendbar
 * espelha: `avaliarCrmIntegradoGate` (a oportunidade e as cotações existem no
 * org) e `avaliarAlcadaSimuladaGate` (a simulação respondeu e a sincronização é
 * de hoje). Nada além disso entra: a cadeia de níveis, os motivos e os
 * contadores de retentativa mudam a CADA leitura sem mover o veredito do envio,
 * e incluí-los faria o shell re-buscar o `approval-readiness` — que agrega
 * pendências, parecer, DDI, perfil de crédito e documentos — a cada tique do
 * polling, sem fato novo.
 *
 * As cotações são ordenadas por `proposalId`: a ordem do array é do backend e
 * uma permutação não é mudança de prontidão.
 */
export function assinaturaDeProntidaoDeEnvio(status: AlcadaSagaStatus): string {
  const quotes = [...status.quotes]
    .sort((a, b) => a.proposalId.localeCompare(b.proposalId))
    .map(
      (q) =>
        `${q.proposalId}:${q.status}:${q.syncStatus}:${q.synchronizedAt ?? '-'}`,
    )
    .join(',');
  return [
    status.opportunityIntegrada ? 'int' : 'nao-int',
    status.simulacao?.status ?? '-',
    quotes,
  ].join('|');
}

/**
 * BPMN "Processo de Alçada" — painel do workspace SNEG (ADR-0037).
 *
 * Rende os quatro marcos da saga (integração, sincronização, simulação,
 * envio) e o único CTA de processo, `Acionar alçada` — o ENVIO não tem botão
 * aqui: ele é pre-commit effect do GATE 2 (`AlcadaSubmitGate2Effect`), então o
 * painel só reporta a prontidão em texto. Todos os
 * vereditos vêm do backend (`GET .../alcada`) — este componente nunca
 * re-deriva regra; ele apenas pinta o que recebeu.
 *
 * ## Estados que NÃO são falha
 *
 * - `AGUARDANDO_SINCRONIZACAO` / simulação `ENVIADA`: o Salesforce está
 *   processando e o resultado chega por Platform Event — pill de atenção,
 *   nunca `--color-danger` (mesma decisão do ciclo assíncrono do ARP).
 * - 409 nas ações: "já em andamento" ou pré-condição faltando. A frase do
 *   backend é acionável e aparece VERBATIM — nunca "falha ao processar".
 */
export function AlcadaSagaPanel({
  opportunityId,
  refreshSignal = 0,
  readOnly = false,
  onProntidaoMudou,
  getStatus = defaultGetStatus,
  acionar = defaultAcionar,
  patchDetail = defaultPatchDetail,
}: Props) {
  const { can } = usePermissions();
  const [status, setStatus] = useState<AlcadaSagaStatus | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [actionBusy, setActionBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionNotice, setActionNotice] = useState<{
    kind: 'info' | 'error';
    text: string;
  } | null>(null);
  /**
   * Trava o CTA depois de uma falha que pode ter deixado trabalho feito no org.
   *
   * `actionBusy` volta a `false` no `finally`, então sem isto o botão fica
   * clicável no mesmo instante em que a tela diz "falha" — e um segundo clique
   * refaz a saga, criando uma SEGUNDA Opportunity no Salesforce (registros que
   * o org não deixa apagar). Só o "↻ Atualizar" explícito libera de novo: quem
   * releu o status sabe o que já existe lá.
   */
  const [holdAposFalha, setHoldAposFalha] = useState(false);
  /**
   * Ligado por um 409 de acionamento CONCORRENTE (ADO 68253).
   *
   * Sem ele o painel para na nota informativa e pede um clique em "↻ Atualizar":
   * o outro acionamento pode estar num passo que nenhum campo do status acusa
   * (movendo a etapa, gravando a TIR, criando garantias), então `sagaEmVoo` é
   * falso e `acionamentoPendente` também — a trava por assinatura já foi
   * consumida por quem está acionando. O flag mantém a releitura viva até o
   * trabalho do outro aparecer, e é ele que transforma "informar quando o
   * acionamento concorrente concluir" em algo que acontece sozinho.
   *
   * Auto-limitado: o orçamento de {@link useCalculationPolling} encerra a
   * cadência, e a releitura o desliga assim que a saga aparece em voo (aí o
   * `emCurso` normal assume) ou a simulação responde.
   */
  const [aguardandoConcorrente, setAguardandoConcorrente] = useState(false);
  /**
   * Resposta em digitação de "Possui nova imagem de pista" / "Será colocada".
   *
   * `''` = nada escolhido. Não pré-seleciona nada: valor de picklist que nasce
   * escolhido é indistinguível de uma resposta do usuário, e é justamente esse
   * campo que decide o ramo de Apex da alçada no org.
   */
  const [imagemPossui, setImagemPossui] = useState<'' | 'sim' | 'nao'>('');
  const [imagemSera, setImagemSera] = useState<'' | 'sim' | 'nao'>('');
  const [imagemBusy, setImagemBusy] = useState(false);

  /**
   * @param opts.silencioso - Não troca o painel pelo estado de erro se a leitura
   *   falhar. É o modo da releitura automática: um blip de rede no meio do
   *   polling substituiria por "Erro ao carregar" um painel que estava correto,
   *   e o usuário não pediu nada. O último status bom permanece na tela; a
   *   leitura seguinte corrige. O refresh explícito e o `refreshSignal` seguem
   *   reportando a falha — ali alguém está esperando uma resposta.
   */
  /**
   * Última assinatura lida — `null` enquanto nenhuma leitura concluiu.
   *
   * Ref, e não estado: ela não pinta nada e um `setState` aqui redisparia o
   * render a cada tique do polling.
   */
  const assinaturaAnterior = useRef<string | null>(null);
  /*
   * O callback do pai vive numa ref para manter a IDENTIDADE de `reload`
   * estável: o efeito de mount depende dela, e um `reload` novo a cada render
   * do pai refaria a leitura inicial em laço.
   */
  const onProntidaoMudouRef = useRef(onProntidaoMudou);
  onProntidaoMudouRef.current = onProntidaoMudou;

  const reload = useCallback(
    async (opts?: { silencioso?: boolean }): Promise<AlcadaSagaStatus | null> => {
      try {
        const fresh = await getStatus(opportunityId);
        setStatus(fresh);
        setLoadState('loaded');
        /*
         * Sinal de VOLTA ao pai (ver {@link Props.onProntidaoMudou}).
         *
         * Comparado contra a leitura ANTERIOR, e não contra `null`: na primeira
         * o pai acabou de carregar a prontidão por conta própria, e avisá-lo ali
         * seria um segundo `approval-readiness` em todo mount do painel.
         */
        const assinatura = assinaturaDeProntidaoDeEnvio(fresh);
        const anterior = assinaturaAnterior.current;
        assinaturaAnterior.current = assinatura;
        if (anterior !== null && anterior !== assinatura) {
          onProntidaoMudouRef.current?.();
        }
        // O acionamento concorrente já aparece no status (ou já terminou): a
        // releitura artificial deixou de ser necessária, e o `emCurso` normal —
        // que é veredito do backend — assume daqui.
        if (sagaEmVoo(fresh) || fresh.simulacao?.status === 'RESPONDIDA') {
          setAguardandoConcorrente(false);
        }
        return fresh;
      } catch {
        if (!opts?.silencioso) setLoadState('error');
        return null;
      }
    },
    [getStatus, opportunityId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  // Externally-triggered re-read (see {@link Props.refreshSignal}). Skips the
  // initial render — the effect above already loaded — and clears the stale
  // action banner, whose text describes a status that has just been superseded.
  const initialSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === initialSignal.current) return;
    setActionNotice(null);
    setHoldAposFalha(false);
    void reload();
  }, [refreshSignal, reload]);

  /*
   * Releitura automática enquanto há algo em curso (ADO 67941, reaberto).
   *
   * O painel carregava UMA vez no mount e só relia por `refreshSignal` — e
   * nenhum dos bumps existentes cobre "o ARP respondeu". Resultado: o LT
   * recalculava, a plataforma acionava a alçada sozinha, e a tela seguia
   * dizendo que os indicadores estavam em cálculo até ele SAIR da tela e
   * VOLTAR (o que remonta o componente). É literalmente o relato do ticket.
   *
   * Três situações mantêm a leitura viva, e nenhuma é dispensável:
   *
   * 1. **Indicadores em cálculo.** É a janela cega: com o gate fechado
   *    `acionamentoPendente` é `false`, então sem este termo o painel congelaria
   *    exatamente no intervalo em que o desfecho está sendo decidido.
   * 2. **Acionamento a caminho** — veredito do backend, o MESMO predicado que o
   *    worker aplica.
   * 3. **Saga em voo** — acionada, sincronizando ou com a simulação enviada; é
   *    o que falta para a cadeia de níveis aparecer.
   *
   * Fora disso não relê: não há o que esperar, e o `GET .../alcada` coleta a
   * prontidão inteira a cada chamada.
   *
   * Vive AQUI, e não nas telas que montam o painel (`opportunity-detail` e
   * `sneg-analise-shell`): uma implementação, as duas superfícies — e nenhuma
   * chance de uma ficar para trás da outra.
   */
  const emCurso =
    aguardandoConcorrente ||
    (status !== null &&
      (status.acionamentoPendente ||
        status.simulacaoGate.codigo === SimulacaoAlcadaBloqueio.IndicadoresEmCalculo ||
        sagaEmVoo(status)));

  const revalidar = useCallback(() => {
    void reload({ silencioso: true });
  }, [reload]);

  useCalculationPolling(emCurso, revalidar, ORCAMENTO_POLLING_MS);

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActionBusy(true);
    setActionNotice(null);
    setHoldAposFalha(false);
    setAguardandoConcorrente(false);
    try {
      await action();
      await reload();
    } catch (err) {
      if (err instanceof AlcadaPreCondicaoError || err instanceof AlcadaEmAndamentoError) {
        // Pré-condição/em andamento: informação acionável, não falha do sistema.
        setActionNotice({ kind: 'info', text: err.message });
        /*
         * Acionamento concorrente (ADO 68253): o mesmo trabalho está em curso em
         * outro lugar — o acionamento automático, outra aba, outra réplica.
         * Manter a releitura viva é o que faz o resultado aparecer sozinho, em
         * vez de a nota pedir um clique em "↻ Atualizar". A ordem importa: o
         * flag vem ANTES do `reload`, senão a primeira releitura poderia
         * desligá-lo antes de ele existir.
         */
        if (err instanceof AlcadaAcionamentoConcorrenteError) {
          setAguardandoConcorrente(true);
        }
        await reload();
      } else {
        const texto =
          err instanceof Error ? err.message : 'Falha na operação de alçada.';
        // Recarrega mesmo em falha genérica: o 503 aqui é TIMEOUT de integração
        // no meio da saga (medido em dev — os passos anteriores já comitaram e o
        // `QuoteSyncPollWorker` reconcilia depois), não "nada aconteceu".
        const fresh = await reload();
        // A saga deixou rastro no org? Então a falha é PARCIAL, e o pior
        // conselho possível é deixar o usuário clicar de novo: foi assim que
        // apareceram duas Opportunity para a mesma oportunidade (VBR-639).
        const deixouRastro =
          Boolean(fresh?.opportunityIntegrada) || fresh?.simulacao != null;
        if (deixouRastro) {
          setActionNotice({
            kind: 'info',
            text: `${texto} A integração pode ter concluído em parte — confira o status acima antes de acionar de novo. Use "↻ Atualizar" para reler.`,
          });
          setHoldAposFalha(true);
        } else {
          // Nada foi gravado: o retry é seguro e é o conserto.
          setActionNotice({ kind: 'error', text: texto });
        }
      }
    } finally {
      setActionBusy(false);
    }
  }

  /**
   * Grava a nova imagem de pista e relê o gate.
   *
   * Um `PATCH` só com o que foi respondido: `Será colocada` viaja apenas quando
   * `Possui = Não`, a única combinação que o picklist dependente do org habilita
   * — mandá-lo com `Possui = Sim` enviaria ao Salesforce um par que a UI dele
   * recusa.
   *
   * Depois do 200, `reload()` traz o gate novo — que é o que destrava (ou não) o
   * CTA. Não fazemos flip otimista: o veredito é do backend, e a próxima recusa
   * pode ser outra (na OPP-2026-000046 medida hoje, resolver a foto do posto
   * revelou justamente esta).
   */
  async function salvarImagemPista() {
    if (imagemPossui === '') return;
    if (imagemPossui === 'nao' && imagemSera === '') return;

    setImagemBusy(true);
    setActionNotice(null);
    try {
      await patchDetail(opportunityId, {
        possuiNovaImagemPista: imagemPossui === 'sim',
        ...(imagemPossui === 'nao'
          ? { seraColocadaNovaImagemPista: imagemSera === 'sim' }
          : {}),
      });
      await reload();
    } catch (err) {
      setActionNotice({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Falha ao salvar a resposta de nova imagem de pista.',
      });
    } finally {
      setImagemBusy(false);
    }
  }

  // Esconder o controle é UX; a garantia é o 403 do backend.
  //
  // `AlcadaSimular` inclui o LT — o BPMN modela `simular → ajustar → simular`
  // em ciclo, e quem ajusta a proposta é ele. `SnegAnalysis` é `[Sneg, Admin]`
  // e esconderia o botão exatamente de quem mais precisa dele.
  //
  // `readOnly` é o eixo do CONTEXTO, e os dois se somam: o papel diz se aquela
  // pessoa PODE acionar, a tela diz se ALI se aciona.
  const canAct = can(Permission.AlcadaSimular) && !readOnly;

  const gate = status?.simulacaoGate ?? {
    liberado: false,
    motivoBloqueio: null,
    codigo: null,
  };
  const simulacaoRespondida = status?.simulacao?.status === 'RESPONDIDA';
  const sincronizadaEm = status ? ultimaSincronizacao(status) : null;
  const todasSincronizadas =
    (status?.quotes.length ?? 0) > 0 &&
    (status?.quotes ?? []).every((q) => q.syncStatus === QuoteSyncStatus.Sincronizada);

  return (
    <section
      data-testid="alcada-saga-panel"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        {/*
          * Mesmo nível dos demais cards da coluna (`h2` em `--t-h4`): este
          * estava em `h3`/`--t-caption`, 14px contra 18px, e lia como
          * subtítulo de outro bloco em vez de card próprio.
          *
          * O título não nomeia o CRM. Qual sistema executa a alçada é detalhe
          * de integração — se ele mudar, o nome do processo não muda, e a tela
          * não deveria precisar de reescrita.
          */}
        {/*
          * O ⓘ carrega o que era um parágrafo no RODAPÉ do card.
          *
          * O texto descreve o que o processo faz — contexto que se lê uma vez e
          * não se consulta de novo —, e ocupava quatro linhas logo abaixo do
          * CTA, empurrando para longe as frases que de fato pedem ação (o
          * motivo da falha e a recusa do gate). Pedido do negócio em
          * 17/09/2026: "muito texto, muito exagerado quando dá algum erro".
          *
          * No TÍTULO, e não ao lado do botão: o texto é sobre o card inteiro,
          * não sobre o clique. `FieldHint` usa `title` nativo — acessível por
          * teclado e por leitor de tela; a limitação conhecida é o toque, que
          * não o abre.
          */}
        <h2 className="text-(length:--t-h4) font-bold">
          Processo de alçada
          <FieldHint text={AJUDA_PROCESSO} label="Processo de alçada" />
        </h2>

      </div>

      {loadState === 'loading' && (
        <div data-testid="alcada-loading" className="space-y-2">
          <div className="h-6 animate-pulse rounded bg-(--neutral-100)" />
          <div className="h-6 animate-pulse rounded bg-(--neutral-100)" />
        </div>
      )}

      {loadState === 'error' && (
        <p className="text-(length:--t-caption) text-(--color-danger)">
          Erro ao carregar o status da alçada.
        </p>
      )}

      {loadState === 'loaded' && status && (
        <div data-testid="alcada-status" className="space-y-1">
          <Row label="Oportunidade integrada" busy={refreshing}>
            <StatusPill variant={status.opportunityIntegrada ? 'success' : 'warning'}>
              {status.opportunityIntegrada ? 'Integrada' : 'Não integrada'}
            </StatusPill>
          </Row>

          <Row label="Cotações integradas" busy={refreshing}>
            {status.quotes.length === 0 ? (
              <span className="text-(length:--t-caption) text-(--color-text-muted)">—</span>
            ) : (
              <StatusPill
                variant={
                  status.quotes.every((q) => q.status === CrmLinkStatus.Criado)
                    ? 'success'
                    : 'warning'
                }
              >
                {status.quotes.filter((q) => q.status === CrmLinkStatus.Criado).length}/
                {status.quotes.length}
              </StatusPill>
            )}
          </Row>

          <Row
            label="Sincronização da cotação"
            busy={refreshing}
            /*
             * QUANDO foi a última integração VIBRAGO × Salesforce.
             *
             * Pedido do negócio (15/09/2026): o marco dizia apenas SE
             * sincronizou, e "Sincronizada" sem data não responde a pergunta
             * que o analista faz na mesa — se o que está no org é de antes ou
             * depois do ajuste que ele acabou de salvar. A janela de validade
             * do Salesforce é de UM DIA (`enviar` recusa sincronização que não
             * seja de hoje), então a data é operacional, não decorativa.
             *
             * ⚠️ **"Última integração" é rótulo OBRIGATÓRIO, não enfeite.** O
             * carimbo é o da última sincronização BEM-SUCEDIDA, e ele continua
             * existindo quando a pill diz "Falha na sincronização": sem o
             * rótulo, uma data logo abaixo daquela pill leria como a hora da
             * FALHA — o oposto do que ela é.
             *
             * Some quando nunca houve sincronização: ver `ultimaSincronizacao`.
             */
            hint={
              sincronizadaEm ? (
                <p
                  data-testid="alcada-sincronizada-em"
                  className="mt-0.5 text-[11px] leading-tight text-(--color-text-muted)"
                >
                  Última integração: {formatTimestamp(sincronizadaEm)}
                </p>
              ) : undefined
            }
          >
            {status.quotes.length === 0 ? (
              <span className="text-(length:--t-caption) text-(--color-text-muted)">—</span>
            ) : (
              <StatusPill variant={syncVariant(status)}>
                {syncLabel(status)}
              </StatusPill>
            )}
          </Row>

          {/*
            * O motivo da falha, quando existe.
            *
            * "Falha na sincronização" sozinho não diz o que fazer — e antes de
            * 28/08/2026 nem esse rótulo aparecia: uma recusa do Salesforce
            * deixava o link em `SINCRONIZANDO` para sempre, então a linha
            * acima dizia "Sincronizando…" indefinidamente. A frase é composta
            * pelo BACKEND (nunca derivada aqui) e nomeia o conserto.
            *
            * `warning`, nunca `danger`: a saga é retomável — corrigir a
            * pendência e acionar de novo é o caminho, não um incidente.
            */}
          {!refreshing && syncErrors(status).length > 0 && (
            <div
              data-testid="alcada-sync-erro"
              className="mt-2 rounded-[var(--radius-xs)] bg-(--color-warning-bg) px-3 py-2 text-(length:--t-caption) text-(--yellow-700)"
            >
              {syncErrors(status).map((motivo) => (
                <p key={motivo}>{motivo}</p>
              ))}
              {/*
                * O link é elemento PRÓPRIO, não uma expressão sublinhada dentro
                * da frase: `motivo` é composto pelo backend e renderizado
                * verbatim (é o que mantém tela e gate falando igual), então
                * embutir um `<a>` exigiria marcador na string ou recomposição
                * aqui. Solto, ele também é mais descoberto que um sublinhado no
                * fim de um parágrafo.
                *
                * `rel="noreferrer"` junto do `target="_blank"` — sem ele a aba
                * aberta recebe `window.opener`.
                */}
              {syncErrorLinks(status).map((url, i, todas) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`alcada-sync-erro-link-${i}`}
                  /*
                   * `block w-fit`, não `inline-block`: com duas cotações
                   * falhando, os links são irmãos sem separador e ficariam
                   * colados na mesma linha. `w-fit` mantém a área clicável do
                   * tamanho do texto, em vez da largura do card.
                   */
                  className="mt-1 block w-fit font-semibold underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--yellow-700)"
                >
                  {todas.length > 1
                    ? `Abrir a cotação ${i + 1} no Salesforce ↗`
                    : 'Abrir a cotação no Salesforce ↗'}
                </a>
              ))}
              {/*
                * Esperar ou agir? São consertos opostos, e a frase acima sozinha
                * não distingue — o motivo do org e o "não deu para perguntar"
                * liam idênticos. O veredito é do BACKEND (mesmo predicado que o
                * worker aplica); a tela renderiza.
                */}
              {syncRetryHint(status) && (
                <p data-testid="alcada-sync-retentativa" className="mt-1 font-semibold">
                  {syncRetryHint(status)}
                </p>
              )}
            </div>
          )}

          <Row label="Simulação" busy={refreshing}>
            {status.simulacao ? (
              <StatusPill variant={simulacaoVariant(status.simulacao.status)}>
                {simulacaoLabel(status.simulacao)}
              </StatusPill>
            ) : (
              <span className="text-(length:--t-caption) text-(--color-text-muted)">
                Não solicitada
              </span>
            )}
          </Row>

          {!refreshing && status.simulacao?.resultado && (
            <div
              data-testid="alcada-simulacao-resultado"
              className={`mt-2 rounded-[var(--radius-xs)] px-3 py-2 text-(length:--t-caption) ${
                status.simulacao.resultado.isValid
                  ? 'bg-(--color-success-bg) text-(--color-success)'
                  : 'bg-(--color-warning-bg) text-(--yellow-700)'
              }`}
            >
              {/*
                * ⚠️ NÃO reponha o "— a oportunidade pode ser enviada para
                * aprovação" que esta frase tinha até 15/09/2026. Ele era FALSO
                * no caso comum: simulação válida não libera o envio sozinha —
                * pendência obrigatória, documento faltando e a própria análise
                * da SNEG continuam bloqueando o GATE 2. Quem diz se a
                * oportunidade pode avançar é a SENDBAR do rodapé, que lê o
                * `approval-readiness` e nomeia o que falta; duas superfícies
                * afirmando prontidão divergiriam exatamente no caso ambíguo.
                *
                * Este marco responde uma pergunta só: a SIMULAÇÃO da alçada
                * está válida?
                */}
              {status.simulacao.resultado.isValid
                ? 'Simulação válida.'
                : 'A simulação apontou impedimentos. Ajuste a proposta e acione a alçada novamente.'}
            </div>
          )}

          {/*
            * A cadeia de alçada, com o motivo de cada nível.
            *
            * "Simulação válida" sozinho não responde a pergunta do analista —
            * QUEM precisa aprovar, e por quê. O motivo é o que explica a
            * subida: `Valor da TIR` num nível de diretoria é a informação que
            * ele leva para o parecer.
            *
            * `[]` (o org respondeu sem nível) é distinguido de `null` (sem
            * resultado ainda): o primeiro é um fato e ganha frase própria, o
            * segundo simplesmente não renderiza.
            */}
          {!refreshing && status.simulacao?.resultado?.levels && (
            <div data-testid="alcada-niveis" className="mt-2">
              <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
                Cadeia de alçada
              </p>
              {status.simulacao.resultado.levels.length === 0 ? (
                <p className="text-(length:--t-caption) text-(--color-text-muted)">
                  O Salesforce não indicou nenhum nível de alçada para esta
                  oportunidade.
                </p>
              ) : (
                <ol className="space-y-1">
                  {status.simulacao.resultado.levels.map((nivel) => (
                    <li
                      key={`${nivel.step}-${nivel.competenceLevelName}`}
                      className="flex items-baseline justify-between gap-3 border-b border-(--color-border) py-1 last:border-b-0"
                    >
                      <span className="text-(length:--t-caption) font-bold">
                        {nivel.step}. {nivel.competenceLevelName}
                      </span>
                      <span className="text-right text-(length:--t-caption) text-(--color-text-muted)">
                        {nivel.reasons.join(' · ')}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <Row label="Envio para aprovação" busy={refreshing}>
            {status.envio ? (
              <StatusPill variant={envioVariant(status.envio.status)}>
                {ENVIO_LABEL[status.envio.status] ?? status.envio.status}
              </StatusPill>
            ) : (
              <span className="text-(length:--t-caption) text-(--color-text-muted)">
                Não enviado
              </span>
            )}
          </Row>

          {/*
            * Prontidão do envio, informativa.
            *
            * O envio virou pré-commit effect do GATE 2, então quem aperta o
            * botão do fim precisa saber ANTES se ele vai passar: são as duas
            * pré-condições que `AlcadaSagaService.enviar` cobra (simulação
            * `RESPONDIDA` e sincronização de HOJE — janela de 1 dia do
            * Salesforce). Sem esta linha, a recusa só apareceria depois do
            * clique, num toast, e o conserto ("re-acionar") fica logo abaixo.
            *
            * Não é `--color-danger`: nada falhou — falta etapa.
            */}
          {!status.envio && (
            <p
              data-testid="alcada-envio-prontidao"
              className="mt-2 text-(length:--t-caption) text-(--color-text-muted)"
            >
              {simulacaoRespondida && todasSincronizadas
                ? 'Alçada pronta: o envio para aprovação acontece ao avançar a oportunidade.'
                : !simulacaoRespondida
                  ? 'Aguardando o resultado da simulação para poder enviar.'
                  : 'A sincronização da cotação não é de hoje — re-acione a alçada antes de avançar.'}
            </p>
          )}

          {actionNotice && (
            <p
              role={actionNotice.kind === 'error' ? 'alert' : 'note'}
              data-testid="alcada-action-notice"
              className={`mt-2 rounded-[var(--radius-xs)] px-3 py-2 text-(length:--t-caption) ${
                actionNotice.kind === 'error'
                  ? 'bg-(--color-danger-bg) text-(--color-danger)'
                  : 'bg-(--color-info-bg) text-(--color-info)'
              }`}
            >
              {actionNotice.text}
            </p>
          )}

          {/*
            * Uma linha só para os controles do card: as duas ações do processo à
            * esquerda e o refresh empurrado para a direita por `ml-auto`.
            *
            * A linha renderiza mesmo sem permissão de ação (`canAct`), porque o
            * refresh não é ação de processo — quem só acompanha também precisa
            * reler o status sem recarregar a tela.
            */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/*
              * SÓ o "Acionar", de propósito.
              *
              * No BPMN de 01/07/2026 o lane do GO tem duas tarefas humanas nesta
              * faixa — `Acionar Processo da Alçada` e `Revisar alçada` — e o
              * `Enviar Alçada` (SF05) é *service task* ligada à saída "Enviar"
              * do gateway de revisão: não é um botão próprio, e não existe ali
              * nenhuma ação separada de "enviar para aprovação".
              *
              * Este painel tinha o CTA de envio ao lado do de acionar, então
              * havia DOIS cliques onde o processo tem um: parar no primeiro
              * deixava a alçada submetida com a oportunidade ainda em
              * `EM_ANALISE`; fazer só a transição avançava o estado local sem o
              * org saber. Agora o envio é pré-commit effect do GATE 2 — o botão
              * do fim da tela submete e o estado só muda se o org aceitar
              * (`AlcadaSubmitGate2Effect`).
              *
              * O painel continua sendo a etapa `Revisar alçada`: mostra a cadeia
              * de níveis e os vereditos que decidem entre enviar, re-simular e
              * ajustar a proposta.
              */}
            {canAct && (
              <button
                type="button"
                data-testid="alcada-acionar-btn"
                disabled={actionBusy || !gate.liberado || holdAposFalha}
                aria-describedby={
                  holdAposFalha
                    ? 'alcada-action-notice'
                    : gate.liberado
                      ? undefined
                      : 'alcada-acionar-bloqueio'
                }
                onClick={() => void runAction(() => acionar(opportunityId))}
                className="inline-flex items-center gap-2 rounded-[var(--radius-xs)] border border-(--secondary-600) px-3 py-1.5 text-[13px] font-bold text-(--secondary-600) hover:bg-(--secondary-100) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/*
                  * The click fires the whole saga (CRM → cotação →
                  * sincronização → simulação) and takes seconds. The button was
                  * already disabled while it ran, but nothing on screen SAID so
                  * — `opacity-50` alone reads as "blocked", not "working", and
                  * the natural reaction is to click again (VBR-635 §15).
                  */}
                {actionBusy && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--secondary-600) border-t-transparent"
                  />
                )}
                {actionBusy
                  ? 'Acionando alçada…'
                  : status.opportunityIntegrada
                    ? '↻ Re-acionar alçada'
                    : 'Acionar alçada'}
              </button>
            )}

            {/*
              * Refresh no fim da linha. A simulação é assíncrona e o painel não
              * faz polling; antes a frase mandava recarregar a página, o que
              * descartava scroll e o parecer em digitação.
              *
              * QUIETO de propósito: não volta ao estado de carregamento, porque
              * branquear o painel esconderia justamente os valores que a pessoa
              * está esperando ver mudar.
              */}
            <button
              type="button"
              data-testid="alcada-refresh-btn"
              onClick={() => {
                setRefreshing(true);
                // Reler é o ato que resolve a dúvida da falha parcial: limpa o
                // aviso e devolve o CTA. Sem isto o banner de erro ficava na
                // tela ao lado de "Simulação Concluída" — duas afirmações
                // contraditórias, e nenhuma ação capaz de remover a primeira.
                setActionNotice(null);
                setHoldAposFalha(false);
                void reload().finally(() => setRefreshing(false));
              }}
              disabled={refreshing || actionBusy}
              className="ml-auto text-[13px] font-bold text-(--secondary-600) underline-offset-2 hover:underline disabled:opacity-40 disabled:hover:no-underline"
            >
              {refreshing ? 'Atualizando…' : '↻ Atualizar'}
            </button>
          </div>

          {/*
            * Motivo do bloqueio, logo abaixo do CTA desabilitado.
            *
            * O veredito vem do backend (`simulacaoGate`) e é o MESMO que a ação
            * aplica — a tela não re-deriva nada. Antes o usuário clicava,
            * esperava a integração inteira e só então recebia o 409/422 num
            * toast; agora ele lê o conserto antes de gastar o clique.
            *
            * Não é `--color-danger`: nada falhou — falta pré-condição.
            */}
          {canAct && !gate.liberado && (
            <p
              id="alcada-acionar-bloqueio"
              role="note"
              data-testid="alcada-gate-bloqueio"
              className="mt-2 text-(length:--t-caption) text-(--yellow-700)"
            >
              {gate.motivoBloqueio
                ? `Não é possível simular a alçada: ${gate.motivoBloqueio}.`
                : 'Não é possível simular a alçada no momento.'}
            </p>
          )}

          {/*
            * "A plataforma está acionando sozinha" — o que faltava dizer.
            *
            * A única frase sobre automatismo que existia é montada a partir das
            * cotações que FALHARAM (`syncRetryHint`). No caminho do ticket — a
            * alçada nunca acionada, gate recém-aberto pelo ARP — não há cotação
            * nenhuma, então o painel ficava MUDO com o CTA habilitado: nada na
            * tela contradizia a leitura de que era preciso clicar.
            *
            * Veredito do BACKEND (`acionamentoPendente`), nunca derivado aqui.
            *
            * O CTA continua HABILITADO de propósito: se por qualquer motivo o
            * automático não acontecer, o LT precisa ter saída manual — e clicar
            * é inofensivo (a trava por assinatura no backend não aciona duas
            * vezes o mesmo retrato). O que sai é o convite mudo.
            *
            * Renderiza mesmo sem `canAct`: é informação sobre o processo, não
            * uma ação. A segunda frase, essa sim, só aparece para quem pode agir.
            *
            * `role="status"`, e não `alert`: nada falhou. Muted, não
            * `--yellow-700` — não é pendência de ninguém.
            */}
          {status.acionamentoPendente && (
            <p
              role="status"
              data-testid="alcada-acionamento-pendente"
              className="mt-2 text-(length:--t-caption) text-(--color-text-muted)"
            >
              A alçada será acionada automaticamente — não é preciso clicar.
              {canAct && ' Se preferir, você pode acionar agora.'}
            </p>
          )}

          {/*
            * A resposta, onde a recusa aparece.
            *
            * Este é o ÚNICO código de gate que o painel resolve por conta
            * própria (ver `GATE_IMAGEM_PISTA`): a pergunta é binária e a única
            * superfície que a oferecia — o modal de edição da tela de
            * preenchimento — não existe no workspace SNEG, que é onde o painel
            * é montado quando a oportunidade está em análise. Medido no stage em
            * 02/09/2026: alçada travada nas OPP-2026-000051 e -000046, com a
            * frase mandando "informe nos dados da oportunidade" e o campo em
            * lugar nenhum daquela tela.
            *
            * Gateado pelo MESMO `canAct` do CTA: quem não aciona a alçada não
            * precisa responder o que só serve para acioná-la.
            */}
          {canAct && !gate.liberado && gate.codigo === GATE_IMAGEM_PISTA && (
            <div
              data-testid="alcada-imagem-pista-form"
              className="mt-2 flex flex-wrap items-end gap-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) p-3"
            >
              <div>
                <label
                  htmlFor="alcada-imagem-possui"
                  className="block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
                >
                  Possui nova imagem de pista
                </label>
                <select
                  id="alcada-imagem-possui"
                  value={imagemPossui}
                  disabled={imagemBusy}
                  onChange={(e) => {
                    const v = e.target.value as '' | 'sim' | 'nao';
                    setImagemPossui(v);
                    // Trocar para "Sim" descarta a segunda resposta: com ela o
                    // campo dependente não existe no org, e mandá-la seria
                    // enviar um par que a UI dele recusa.
                    if (v !== 'nao') setImagemSera('');
                  }}
                  className="mt-1 w-44 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-(length:--t-caption)"
                >
                  <option value="">Selecione…</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>

              {/* Só com "Possui = Não" — o picklist dependente do org. */}
              {imagemPossui === 'nao' && (
                <div>
                  <label
                    htmlFor="alcada-imagem-sera"
                    className="block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
                  >
                    Será colocada nova imagem de pista
                  </label>
                  <select
                    id="alcada-imagem-sera"
                    value={imagemSera}
                    disabled={imagemBusy}
                    onChange={(e) =>
                      setImagemSera(e.target.value as '' | 'sim' | 'nao')
                    }
                    className="mt-1 w-44 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-(length:--t-caption)"
                  >
                    <option value="">Selecione…</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
              )}

              <button
                type="button"
                data-testid="alcada-imagem-pista-salvar"
                onClick={() => void salvarImagemPista()}
                disabled={
                  imagemBusy ||
                  imagemPossui === '' ||
                  (imagemPossui === 'nao' && imagemSera === '')
                }
                className="rounded-[var(--radius-xs)] bg-(--secondary-600) px-3 py-1.5 text-(length:--t-caption) font-bold text-white disabled:opacity-40"
              >
                {imagemBusy ? 'Salvando…' : 'Salvar resposta'}
              </button>
            </div>
          )}

        </div>
      )}
    </section>
  );
}

/**
 * Uma linha do painel.
 *
 * `busy` troca **só o valor** por um skeleton e mantém o rótulo: o leitor
 * continua vendo QUAIS itens estão sendo relidos, e a altura da linha não muda —
 * substituir o bloco inteiro faria o card pular e o botão fugir do cursor.
 */
function Row({
  label,
  busy = false,
  hint,
  children,
}: {
  label: string;
  busy?: boolean;
  /**
   * Legenda do próprio marco — renderizada DENTRO da linha, acima da divisória.
   *
   * Existe porque um `<p>` solto entre dois `Row` cai **abaixo** da borda do
   * marco a que se refere, e passa a ler como uma linha órfã do marco seguinte
   * (medido na tela em 15/09/2026, com a data da integração aparecendo entre a
   * divisória da sincronização e o rótulo "Simulação"). Aqui ela fica presa ao
   * bloco certo, e o tamanho menor a mantém subordinada ao valor.
   *
   * Some junto com o valor quando `busy`: legenda sobrevivendo ao skeleton
   * afirmaria um carimbo que a leitura em curso pode estar mudando.
   */
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-(--color-border) py-1.5 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-(length:--t-caption) text-(--color-text-muted)">{label}</span>
        {busy ? <SkeletonValue /> : children}
      </div>
      {!busy && hint}
    </div>
  );
}

/** Barra de skeleton no lugar do valor de uma linha. */
function SkeletonValue() {
  return (
    <span
      data-testid="alcada-skeleton-value"
      aria-hidden="true"
      className="h-4 w-24 animate-pulse rounded bg-(--neutral-100)"
    />
  );
}

const SIMULACAO_LABEL: Record<string, string> = {
  ENVIADA: 'Em processamento',
  RESPONDIDA: 'Concluída',
  EXPIRADA: 'Expirada — acione novamente',
  APLICADA: 'Concluída',
  IGNORADA: 'Substituída por outra simulação',
};

const ENVIO_LABEL: Record<string, string> = {
  ENVIADA: 'Aguardando resultado da aprovação',
  RESPONDIDA: 'Resultado recebido',
  EXPIRADA: 'Expirado — envie novamente',
};

/** Em processamento é atenção/info, nunca danger — nada falhou (padrão ARP). */
function simulacaoVariant(status: string): PillVariant {
  if (status === 'RESPONDIDA' || status === 'APLICADA') return 'success';
  if (status === 'EXPIRADA') return 'warning';
  return 'info';
}

function envioVariant(status: string): PillVariant {
  if (status === 'RESPONDIDA') return 'success';
  if (status === 'EXPIRADA') return 'warning';
  return 'info';
}

function syncVariant(status: AlcadaSagaStatus): PillVariant {
  const all = status.quotes;
  if (all.every((q) => q.syncStatus === QuoteSyncStatus.Sincronizada)) return 'success';
  if (all.some((q) => q.syncStatus === QuoteSyncStatus.FalhaSincronizacao)) return 'warning';
  return 'info';
}

/**
 * Motivos distintos de falha de sincronização, na ordem em que aparecem.
 *
 * Deduplicado porque N cotações da mesma oportunidade costumam falhar pelo
 * mesmo motivo, e repetir a frase enche a tela sem acrescentar nada.
 */
function syncErrors(status: AlcadaSagaStatus): string[] {
  const motivos = status.quotes
    .filter((q) => q.syncStatus === QuoteSyncStatus.FalhaSincronizacao)
    .map((q) => q.lastError)
    .filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
  return [...new Set(motivos)];
}

/**
 * Deep links das cotações que falharam — o "para onde olhar" da recusa.
 *
 * O motivo exato da recusa fica no ORG: o Apex tem 14 pontos de recusa e a
 * mensagem viaja num Platform Event que nenhum Flow entrega a esta plataforma.
 * A frase do backend nomeia as causas mais comuns; o que resolve o caso fora
 * dessa lista é abrir a cotação lá, onde o motivo aparece.
 *
 * ⚠️ **A cotação EXISTE quando esta caixa aparece.** Ela é criada num passo
 * anterior da saga, e nem o `rollbackRecords` do Apex a apaga (ele varre só os
 * filhos da Oportunidade). O link não é uma aposta.
 *
 * `crmUrl` ausente ⇒ a cotação fica de fora da lista, e com nenhuma delas
 * endereçável a tela não mostra link nenhum — nunca um `href` morto. Acontece
 * com `CRM_DRIVER=fake` (todo ambiente local) e contra um backend anterior a
 * esta entrega.
 */
function syncErrorLinks(status: AlcadaSagaStatus): string[] {
  const urls = status.quotes
    .filter((q) => q.syncStatus === QuoteSyncStatus.FalhaSincronizacao)
    .map((q) => q.crmUrl)
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  // Duas propostas podem apontar para a mesma cotação no org; repetir o link
  // não acrescenta destino nenhum.
  return [...new Set(urls)];
}

/**
 * Frase única sobre a retentativa automática da sincronização.
 *
 * Uma só, e não uma por cotação: o orçamento é por cotação mas o conserto é o
 * mesmo, e repetir a linha N vezes empurra o motivo para fora da tela. Basta
 * uma cotação ainda ser repetida automaticamente para a mensagem ser "aguarde";
 * só quando NENHUMA será é que a tela pede ação.
 *
 * `null` quando o backend não publicou o bloco (build anterior) — a tela não
 * escreve nada, em vez de afirmar sobre um retry que ela não conhece.
 */
function syncRetryHint(status: AlcadaSagaStatus): string | null {
  const falhadas = status.quotes.filter(
    (q) => q.syncStatus === QuoteSyncStatus.FalhaSincronizacao,
  );
  const comVeredito = falhadas.filter((q) => q.retentativa !== null);
  if (comVeredito.length === 0) return null;

  const automatica = comVeredito.find((q) => q.retentativa?.automatica);
  if (automatica?.retentativa) {
    const { tentativas, maximo } = automatica.retentativa;
    return `Repetindo automaticamente (tentativa ${tentativas + 1} de ${maximo}).`;
  }
  /*
   * Recusa do org: repetir IDÊNTICO não adianta, mas desde o ADO 67941 a
   * plataforma volta a acionar sozinha assim que a prontidão muda — garantia
   * indicada, arquivo anexado, TIR recalculada. A frase antiga ("Não será
   * repetida automaticamente — … acione a alçada novamente") passou a ser falsa
   * exatamente aqui, que é o print do ticket.
   *
   * O veredito é do backend; ele só é `true` nas fases que o worker varre.
   */
  if (status.acionamentoAutomatico) {
    return 'Será acionada automaticamente assim que a pendência acima for corrigida — você também pode acionar agora.';
  }
  return 'Não será repetida automaticamente — corrija o que está acima e acione a alçada novamente.';
}

/**
 * A saga já começou e ainda não terminou?
 *
 * `SINCRONIZANDO` é a cotação esperando o veredito do org; `ENVIADA` é a
 * simulação esperando o resultado. Nos dois casos falta um hop assíncrono para a
 * cadeia de níveis aparecer — e é ele que o painel precisa acompanhar sem que
 * ninguém recarregue a tela.
 */
function sagaEmVoo(status: AlcadaSagaStatus): boolean {
  return (
    status.simulacao?.status === 'ENVIADA' ||
    status.quotes.some((q) => q.syncStatus === QuoteSyncStatus.Sincronizando)
  );
}

/**
 * `EXPIRADA` deixou de significar sempre "acione novamente".
 *
 * Enquanto a plataforma vai repetir sozinha, mandar o usuário acionar é pedir um
 * trabalho que já está em curso — e o clique re-roda a saga inteira.
 */
function simulacaoLabel(simulacao: AlcadaSagaStatus['simulacao']): string {
  if (!simulacao) return 'Não solicitada';
  if (simulacao.status === 'EXPIRADA' && simulacao.retentativaAutomatica) {
    return 'Expirada — repetindo automaticamente';
  }
  return SIMULACAO_LABEL[simulacao.status] ?? simulacao.status;
}

function syncLabel(status: AlcadaSagaStatus): string {
  const all = status.quotes;
  if (all.every((q) => q.syncStatus === QuoteSyncStatus.Sincronizada)) return 'Sincronizada';
  if (all.some((q) => q.syncStatus === QuoteSyncStatus.FalhaSincronizacao)) {
    return 'Falha na sincronização';
  }
  if (all.some((q) => q.syncStatus === QuoteSyncStatus.Sincronizando)) {
    return 'Sincronizando…';
  }
  return 'Não sincronizada';
}

/**
 * Quando o Salesforce e esta plataforma trocaram dados pela última vez.
 *
 * É o `synchronizedAt` MAIS RECENTE entre as cotações — o instante em que a
 * última sincronização concluiu com sucesso. Uma oportunidade pode ter mais de
 * uma cotação eleita (PCR + franquia), e a pergunta do negócio ("quando foi a
 * última integração?") é uma só.
 *
 * `null` quando nenhuma cotação jamais sincronizou: o campo simplesmente não
 * aparece, porque um travessão ali seria indistinguível de "não sei dizer".
 * Carimbo ilegível também vira `null` — nunca `Invalid Date` na tela.
 */
function ultimaSincronizacao(status: AlcadaSagaStatus): Date | null {
  const instantes = status.quotes
    .map((q) => (q.synchronizedAt ? new Date(q.synchronizedAt) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
  if (instantes.length === 0) return null;
  return instantes.reduce((mais, atual) => (atual > mais ? atual : mais));
}

/**
 * "15/09/2026, 11:30" — mesmo formato do "Último cálculo" da Análise
 * financeira, que fica na mesma tela. Duas grafias de data lado a lado leriam
 * como dois relógios diferentes.
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
