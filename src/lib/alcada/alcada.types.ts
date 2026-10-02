/**
 * Front-end mirror of the alçada saga status (ADR-0037 — BPMN SF01–SF08).
 *
 * Every verdict here is computed by the BACKEND (`GET /v1/opportunities/:id/alcada`);
 * the screen only renders. Enum values are declared `as const` for named-member
 * comparisons — never compare against a loose string literal.
 */

export const QuoteSyncStatus = {
  NaoSincronizada: 'NAO_SINCRONIZADA',
  Sincronizando: 'SINCRONIZANDO',
  Sincronizada: 'SINCRONIZADA',
  FalhaSincronizacao: 'FALHA_SINCRONIZACAO',
} as const;
export type QuoteSyncStatus = (typeof QuoteSyncStatus)[keyof typeof QuoteSyncStatus];

export const CrmLinkStatus = {
  Pendente: 'PENDENTE',
  Aceito: 'ACEITO',
  Criado: 'CRIADO',
  Falha: 'FALHA',
} as const;
export type CrmLinkStatus = (typeof CrmLinkStatus)[keyof typeof CrmLinkStatus];

export interface AlcadaQuoteStatus {
  proposalId: string;
  status: CrmLinkStatus;
  salesforceQuoteId: string | null;
  /**
   * Deep link para a cotação no org, montado pelo BACKEND.
   *
   * Nunca derive daqui: a base é `SALESFORCE_INSTANCE_URL`, variável de runtime
   * do backend. Montá-la na tela exigiria uma `NEXT_PUBLIC_*` — build-time, com
   * modo de falha silencioso (bundle sai sem o valor, o link aponta para lugar
   * nenhum e nada acusa).
   *
   * `null` quando não há cotação no org ou o ambiente roda com `CRM_DRIVER=fake`
   * ⇒ a tela renderiza o texto sem link. Um `href` quebrado ensina o usuário que
   * o controle não funciona, o que é pior que não oferecer controle nenhum.
   */
  crmUrl: string | null;
  syncStatus: QuoteSyncStatus;
  /** ISO datetime of the last successful synchronization; null when never. */
  synchronizedAt: string | null;
  /**
   * Motivo da falha de sincronização, em pt-BR e composto pelo BACKEND — a
   * tela renderiza, nunca deriva.
   *
   * `null` fora de `FALHA_SINCRONIZACAO`. Sem ele a linha dizia "Falha na
   * sincronização" e mais nada: o analista via que deu errado e não tinha o
   * que fazer com a informação.
   */
  lastError: string | null;
  /**
   * A plataforma vai repetir esta sincronização sozinha?
   *
   * Veredito do BACKEND, pelo mesmo predicado que o `AlcadaRetryWorker` aplica —
   * a tela renderiza, nunca deriva. Sem ele a caixa de erro dizia o que falhou e
   * não dizia se cabia esperar ou agir, que são consertos opostos.
   *
   * `null` fora de `FALHA_SINCRONIZACAO`.
   */
  retentativa: AlcadaRetentativa | null;
}

/** Orçamento de retentativas automáticas de uma etapa da alçada. */
export interface AlcadaRetentativa {
  automatica: boolean;
  tentativas: number;
  maximo: number;
}

export interface AlcadaSimulacaoResultado {
  isValid: boolean;
  message: string | null;
  /**
   * Cadeia de alçada como o org a resolveu, na ordem de avaliação.
   *
   * Era `unknown` porque nada a exibia. Agora é tipada porque a tela mostra a
   * cadeia — o motivo de cada nível é justamente o que explica por que a alçada
   * subiu, e "Simulação válida" sem a cadeia não diz quem precisa aprovar.
   *
   * `null` = simulação sem resultado ainda; `[]` = o org respondeu sem nível
   * nenhum, que é diferente de "não sei" e a tela precisa distinguir.
   */
  levels: AlcadaNivel[] | null;
}

/** Um nível da cadeia de alçada (`AlcadaSimulateService.StepResult` do org). */
export interface AlcadaNivel {
  /** Nome do grupo de alçada — ex. `SNEG`, `Gerência`, `VPCVIM`. */
  competenceLevelName: string;
  /** Ordem de avaliação, 1-based. */
  step: number;
  /** Posição na hierarquia; fracionária desempata alçadas paralelas (`3.1`). */
  hierarchyLevel: number;
  /** Motivos que fizeram a alçada passar por este nível. */
  reasons: string[];
}

export interface AlcadaSimulacaoStatus {
  /** ENVIADA | RESPONDIDA | EXPIRADA | APLICADA | IGNORADA (backend-owned). */
  status: string;
  sentAt: string | null;
  /**
   * Mesma pergunta para o ciclo de simulação — `false` fora de `EXPIRADA`.
   *
   * É o que faz o rótulo deixar de ser sempre "Expirada — acione novamente"
   * quando a plataforma já vai repetir sozinha.
   */
  retentativaAutomatica: boolean;
  resultado: AlcadaSimulacaoResultado | null;
}

export interface AlcadaEnvioStatus {
  /** ENVIADA | RESPONDIDA | EXPIRADA (backend-owned). */
  status: string;
  sentAt: string | null;
  sendVerdict: string | null;
}

/**
 * Códigos de máquina do bloqueio. A tela ramifica por ELES, nunca pelo texto
 * de `motivoBloqueio` — que é copy e muda.
 */
export const SimulacaoAlcadaBloqueio = {
  FaseInvalida: 'FASE_INVALIDA',
  SemPropostaEleita: 'SEM_PROPOSTA_ELEITA',
  SoFranquiaEleita: 'SO_FRANQUIA_ELEITA',
  IndicadoresDesatualizados: 'INDICADORES_DESATUALIZADOS',
  IndicadoresEmCalculo: 'INDICADORES_EM_CALCULO',
  IndicadoresIndisponiveis: 'INDICADORES_INDISPONIVEIS',
  IndicadoresAusentes: 'INDICADORES_AUSENTES',
  FotosDoPostoAusentes: 'FOTOS_DO_POSTO_AUSENTES',
  GarantiaConcessaoAusente: 'GARANTIA_CONCESSAO_AUSENTE',
  GarantiaFornecimentoAusente: 'GARANTIA_FORNECIMENTO_AUSENTE',
  ImplantacaoFranquiaAusente: 'IMPLANTACAO_FRANQUIA_AUSENTE',
  PimNaoRespondido: 'PIM_NAO_RESPONDIDO',
  ImagemPistaNaoRespondida: 'IMAGEM_PISTA_NAO_RESPONDIDA',
} as const;
export type SimulacaoAlcadaBloqueio =
  (typeof SimulacaoAlcadaBloqueio)[keyof typeof SimulacaoAlcadaBloqueio];

/**
 * Veredito de "dá para simular a alçada agora?" — o MESMO predicado que a
 * ação aplica (`avaliarSimulacaoAlcadaGate` no backend).
 *
 * Nunca re-derive isto na tela: duas implementações do mesmo veredito divergem
 * exatamente no estado em que uma diz "pronto" e a outra recusa.
 */
export interface SimulacaoAlcadaGate {
  liberado: boolean;
  /** Frase pt-BR pronta. `null` quando liberado. */
  motivoBloqueio: string | null;
  codigo: SimulacaoAlcadaBloqueio | null;
}

export interface AlcadaSagaStatus {
  opportunityIntegrada: boolean;
  salesforceOpportunityId: string | null;
  quotes: AlcadaQuoteStatus[];
  simulacao: AlcadaSimulacaoStatus | null;
  envio: AlcadaEnvioStatus | null;
  simulacaoGate: SimulacaoAlcadaGate;
  /**
   * A plataforma aciona a alçada sozinha assim que a pendência for corrigida?
   *
   * Veredito do BACKEND (ADO 67941) — nunca derivado aqui. Campo ausente ⇒
   * `false`: um backend mais antigo não tem o acionamento automático, e
   * prometê-lo faria a tela dizer que basta corrigir quando na verdade o
   * usuário ainda precisa clicar.
   */
  acionamentoAutomatico: boolean;
  /**
   * Há um acionamento automático A CAMINHO **agora**?
   *
   * Não confundir com {@link acionamentoAutomatico}, logo acima: aquele é uma
   * promessa condicional ("*se* a prontidão mudar, o worker age"), verdadeira em
   * praticamente toda oportunidade nas fases varridas. Este é o veredito
   * pontual, o MESMO predicado que o worker aplica para decidir se aciona.
   *
   * O painel o usa para duas coisas — dizer que a alçada está sendo acionada
   * sozinha (antes ele ficava MUDO nesse caminho, com o CTA habilitado
   * convidando ao clique manual que o ADO 67941 reaberto manda eliminar) e
   * continuar relendo até o acionamento acontecer.
   *
   * Campo ausente ⇒ `false`, pela mesma razão do vizinho: a tela nunca promete
   * um automatismo que o backend não vai executar — e, aqui, também não fica
   * repolindo contra um backend que não sabe responder.
   */
  acionamentoPendente: boolean;
}

export type AcionarAlcadaFase = 'SIMULACAO_SOLICITADA' | 'AGUARDANDO_SINCRONIZACAO';

/** 409: saga step already in flight (never rendered as a generic failure). */
export class AlcadaEmAndamentoError extends Error {
  constructor(message = 'Já existe uma etapa da alçada em andamento.') {
    super(message);
    this.name = 'AlcadaEmAndamentoError';
  }
}

/** 422/409 with an actionable backend sentence (rendered verbatim). */
export class AlcadaPreCondicaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlcadaPreCondicaoError';
  }
}

/**
 * `code` do backend para "outro acionamento desta oportunidade está em curso"
 * (ADO 68253).
 *
 * O front comuta no CÓDIGO, nunca na frase: a mensagem é texto de tela e vai
 * mudar; o código é contrato.
 */
export const ALCADA_ACIONAMENTO_EM_ANDAMENTO = 'ALCADA_ACIONAMENTO_EM_ANDAMENTO';

/**
 * 409 — outro acionamento da MESMA oportunidade está em curso (ADO 68253).
 *
 * Subclasse de {@link AlcadaPreCondicaoError} de propósito: o painel já
 * renderiza aquela família como INFORMAÇÃO (nota azul + releitura), que é
 * exatamente o tratamento certo — nada falhou, o mesmo trabalho está
 * acontecendo em outro lugar. O tipo próprio existe só para o painel poder
 * CONTINUAR relendo até o outro acionamento aparecer, em vez de parar numa nota
 * pedindo um clique em "↻ Atualizar".
 */
export class AlcadaAcionamentoConcorrenteError extends AlcadaPreCondicaoError {
  constructor(message: string) {
    super(message);
    this.name = 'AlcadaAcionamentoConcorrenteError';
  }
}
