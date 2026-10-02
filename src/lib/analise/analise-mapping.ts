import type {
  ApprovalReadiness,
  DependenciaObrigatoria,
  PadraoBPResult,
  PendenciasPanelResult,
  TravaBP,
  TravaBPStatus,
} from './analise.types';
import type { AcaoResolucao } from '@/lib/pendencias/types';

/**
 * Anti-corruption mapping for the SNEG analysis screen (`04-analise-sneg.html`),
 * mirroring `pendencia-mapping.ts` / `customer-mapping.ts`.
 *
 * The backend DTOs are domain-shaped (`PadraoAnaliseDto`, `ApprovalReadinessDto`,
 * `PendenciaListItemDto`); the screen consumes view-shaped data (the three
 * `.trava` rows of the side panel, human-readable `bloqueios`, `titulo`). Passing
 * the backend payload straight through compiles — the BFF response is untyped —
 * and then fails in the browser: reading `padraoBP.travas.length` off a payload
 * with no `travas` threw a TypeError that took the WHOLE screen down with
 * "Application error: a client-side exception has occurred".
 *
 * Every function here is total: a missing or unknown field degrades to a
 * rendered "—"/empty state, never to a throw.
 */

// ---------------------------------------------------------------------------
// GET /v1/opportunities/:id/analise/padrao-bp → PadraoBPResult
// ---------------------------------------------------------------------------

/** `BpPadraoDto` — the configured reference for the opportunity's negócio. */
export interface BackendBpPadrao {
  id: string;
  negocio: string;
  metaPercentualAntecipacao: number;
  metaPercentualPostecipacao: number;
  metaCustoVinculacaoUnitario: number;
}

export interface BackendPadraoAnalise {
  negocio: string | null;
  custoVinculacaoUnitario: number | null;
  percentualAntecipacao: number | null;
  referencia: BackendBpPadrao | null;
  aderencia: 'padrao' | 'com_desvio' | null;
  aderenciaIndeterminadaMotivo: string | null;
  desvios: Array<{
    indicador: string;
    valorObservado: number;
    valorReferencia: number;
    diferenca: number;
  }>;
  camposEconomicos: Record<string, unknown>;
}

function fmtCurrencyPerM3(value: number | null): string | undefined {
  if (value === null) return undefined;
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} R$/m³`;
}

function fmtPercent(value: number | null): string | undefined {
  if (value === null) return undefined;
  // The domain stores fractions (0.4 = 40%).
  return `${(value * 100).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })}%`;
}

const ADERENCIA_LABEL: Record<'padrao' | 'com_desvio', string> = {
  padrao: 'Dentro do padrão',
  com_desvio: 'Com desvio',
};

/**
 * Builds the three rows of the prototype's "Padrão de BP & filtro econômico"
 * card: custo de vinculação unitário, % antecipada vs. orçado, and the overall
 * adherence verdict.
 */
export function mapPadraoBP(b: BackendPadraoAnalise): PadraoBPResult {
  const travas: TravaBP[] = [];

  const custoDesvio = (b.desvios ?? []).some(
    (d) => d.indicador === 'custoVinculacaoUnitario',
  );
  travas.push({
    descricao: 'Custo de vinculação (unit.)',
    status: custoDesvio ? 'alerta' : b.custoVinculacaoUnitario === null ? 'pendente' : 'ok',
    // A measurement, not a verdict — rendered as plain bold text (prototype `<b>`).
    display: 'medida',
    ...(fmtCurrencyPerM3(b.custoVinculacaoUnitario) !== undefined
      ? { valor: fmtCurrencyPerM3(b.custoVinculacaoUnitario) as string }
      : {}),
  });

  const antecipDesvio = (b.desvios ?? []).some(
    (d) => d.indicador === 'percentualAntecipacao',
  );
  const antecipValor = fmtPercent(b.percentualAntecipacao);
  travas.push({
    descricao: '% antecipada vs. orçado',
    status: antecipDesvio ? 'alerta' : b.percentualAntecipacao === null ? 'pendente' : 'ok',
    display: 'medida',
    ...(antecipValor !== undefined
      ? { valor: antecipDesvio ? `${antecipValor} · acima` : antecipValor }
      : {}),
  });

  // Adherence: `null` is "indeterminada" (no padrão configured for the negócio) —
  // it must NEVER render as "dentro do padrão", which would hide a real deviation.
  const aderenciaStatus: TravaBPStatus =
    b.aderencia === 'com_desvio'
      ? 'alerta'
      : b.aderencia === 'padrao'
        ? 'ok'
        : 'pendente';
  travas.push({
    descricao: 'Aderência ao padrão de BP',
    status: aderenciaStatus,
    // The verdict of the card — the prototype's `pill w` ("Com desvio").
    display: 'veredito',
    valor: b.aderencia
      ? ADERENCIA_LABEL[b.aderencia]
      : 'Indeterminada',
  });

  return { travas };
}

// ---------------------------------------------------------------------------
// GET /v1/opportunities/:id/analise/approval-readiness → ApprovalReadiness
// ---------------------------------------------------------------------------

export interface BackendApprovalReadiness {
  ready: boolean;
  missing: string[];
  pendenciasObrigatoriasAbertas: number;
  documentosAguardandoValidacao: number;
  /**
   * Os tipos que aguardam conferência, nomeados pelo backend (ADO 01/09/2026).
   *
   * Opcional na LEITURA porque um backend anterior a esta entrega não o manda —
   * e aí a frase degrada para a forma genérica, em vez de a barra quebrar.
   */
  documentosAguardandoValidacaoTipos?: string[];
  /**
   * As bandeiras que devem o parecer antecipado do time de franquias
   * (ADO 68478).
   *
   * Opcional na LEITURA pela mesma razão dos tipos acima: backend anterior a
   * esta entrega não o manda, e a frase degrada para a forma genérica em vez de
   * a barra quebrar.
   */
  franquiaParecerPendenteBandeiras?: string[];
  analiseConcluida: boolean;
  analiseFase: string | null;
  alcadaSugerida: { nivel?: string | null; descricao?: string | null } | null;
  /**
   * O de acordo do Diretor levantou um bloqueio de análise (ADO 68233).
   *
   * Opcional na LEITURA: backend anterior a esta entrega não o manda, e aí a
   * barra apenas não nomeia nada — nunca afirma um override que não houve.
   */
  liberadoPorDeAcordoDiretor?: boolean;
}

/**
 * Quantos tipos a frase nomeia antes de resumir o resto.
 *
 * Três porque a barra é de UMA linha e a frase divide espaço com o rótulo da
 * fase; com o checklist inteiro pendente (17 tipos na oportunidade medida) a
 * enumeração completa viraria um parágrafo sobre o conteúdo da tela — que é o
 * mesmo motivo pelo qual a lista de pendências da franquia é colapsável.
 */
const MAX_TIPOS_NOMEADOS = 3;

/**
 * A frase de `documentos_nao_validados`, NOMEANDO o que falta conferir.
 *
 * ⚠️ Ela existia sem nomear nada — "Há documento anexado aguardando conferência
 * — valide os itens do checklist para liberar o envio." — e na tela do analista
 * isso não era suficiente para achar o documento: o card mostra **6 de N** linhas
 * (o resto é um `+ N outros documentos` que não expande), a ordem é a da tabela
 * de parametrização, e o pill de `anexado` era **verde**, o mesmo de `validado`.
 * Relatado em 01/09/2026 como "não conseguimos identificar qual o documento".
 *
 * Sem os tipos (backend anterior à entrega, ou lista vazia por incoerência de
 * leitura) volta a frase genérica: melhor uma frase larga que uma frase que
 * afirma nomes que não temos.
 */
function frasearDocumentosNaoValidados(tipos: readonly string[]): string {
  if (tipos.length === 0) {
    return 'Há documento anexado aguardando conferência — valide os itens do checklist para liberar o envio.';
  }

  const nomeados = tipos.slice(0, MAX_TIPOS_NOMEADOS).join(', ');
  const restantes = tipos.length - MAX_TIPOS_NOMEADOS;
  const lista = restantes > 0 ? `${nomeados} e mais ${restantes}` : nomeados;
  const abertura =
    tipos.length === 1
      ? 'Há 1 documento anexado aguardando conferência'
      : `Há ${tipos.length} documentos anexados aguardando conferência`;

  // "Valide" no fim, com os nomes no meio: o conserto continua nomeado, e agora o
  // analista sabe em qual linha do checklist clicar.
  return `${abertura}: ${lista}. Valide os itens para liberar o envio.`;
}

/**
 * A frase de `franquia_parecer_pendente`, NOMEANDO a bandeira (ADO 68478).
 *
 * A oportunidade pode ter BR Mania e Lubrax+, e o conserto é por PROPOSTA — o
 * analista precisa saber em qual bloco "Parecer antecipado" o time de franquias
 * ainda deve responder. A frase manda **aguardar o time**, não agir: quem emite
 * é o Gestor de Franquias / Consultor de Expansão, e a SNEG não tem controle de
 * tela que resolva (`POST .../pendencias/:id/resolver` recusa esta origem com
 * 400 de propósito).
 *
 * Sem a lista (backend anterior à entrega) volta a forma genérica — melhor uma
 * frase larga que uma frase que afirma bandeiras que não temos.
 */
function frasearFranquiaParecerPendente(bandeiras: readonly string[]): string {
  const fecho =
    ' — o time de franquias precisa emitir o parecer antecipado para liberar o envio.';

  if (bandeiras.length === 0) {
    return `Há proposta de franquia aguardando parecer antecipado${fecho}`;
  }

  return `${bandeiras.map((b) => `Franquia ${b}`).join(' e ')}${fecho}`;
}

/** `LiberacaoMissingCode` → the sentence the sendbar shows the analyst. */
const BLOQUEIO_LABEL: Record<string, string> = {
  pendencias_obrigatorias_abertas:
    'Há pendência obrigatória em aberto — resolva antes de liberar.',
  /*
   * PRD SNEG v1.0 §7 F7 — pré-condição "checklist e pendências resolvidos".
   *
   * A frase nomeia o CONSERTO, não o perfil. Ela já apontou para os dois lados
   * errados: primeiro mandava o analista "conferir os documentos" quando o ADO
   * 67906 tinha acabado de tirar dele o botão, e depois dizia "validado pela
   * CCOB" — o que, com a SNEG conferindo de novo (31/08/2026), manda o analista
   * esperar outra área para fazer o que ele mesmo pode.
   *
   * Nomear a ação e o lugar funciona para os dois perfis, e continua correta se
   * a autoridade mudar de novo.
   */
  documentos_nao_validados: frasearDocumentosNaoValidados([]),
  parecer_nao_emitido: 'Parecer técnico ainda não emitido.',
  analise_com_pendencia:
    'A análise está com pendência — resolva para concluí-la.',
  analise_devolvida:
    'A proposta foi devolvida ao LT — aguarde o reenvio para liberar.',
  // RN-F10-03/06. The backend already sends a per-status sentence in the 422;
  // here the readiness only carries the code, so this is the short form for the
  // blocked-CTA reason.
  ddi_pendente:
    'A due diligence de integridade ainda não liberou — registre o parecer da Integridade.',
  /*
   * ADO 68233 (reaberto em 09/09/2026) — o par que o ticket nomeia: *"não pode
   * ter pendência da integridade ou da análise de perfil"*.
   *
   * A frase manda AGUARDAR, e isso é verdade verificada, não conforto: os três
   * estados que bloqueiam (`PENDENTE`, `EM_EXECUCAO` e linha ausente com
   * concessão elegível) são todos curados sozinhos pelo
   * `PerfilCreditoCatchUpWorker` — linha ausente é aberta em até 60 s, linha
   * travada é retentada depois de 10 min. `ENCERRADO` LIBERA, então não existe
   * desfecho em que a espera seja infinita.
   *
   * ⚠️ Não manda o analista fazer nada porque **não há ação de tela** que mova
   * o levantamento: ele é disparado e retentado por consumer e worker. Uma
   * frase do tipo "solicite a análise" apontaria para um controle inexistente.
   */
  perfil_credito_pendente:
    'A análise de perfil de crédito ainda não concluiu — o levantamento é automático; aguarde e recarregue.',
  /*
   * ADR-0055 — cliente PROSPECT (conta sem Código SAP).
   *
   * Substitui `perfil_credito_pendente` quando é o caso, e a frase é outra de
   * propósito: aquela manda aguardar, e aqui esperar não resolve — o
   * levantamento não inicia sem cadastro, e a alçada escreve no Salesforce por
   * Código SAP. Nomeia o conserto (o cadastro) e diz o que JÁ pode ser feito,
   * porque a análise em si não está bloqueada.
   */
  cliente_prospect:
    'Cliente ainda sem cadastro no SAP (prospect) — a análise pode ser feita, mas a liberação para aprovação só após o cadastro.',
  /*
   * ADO 68478. O código nasceu com o bug relatado em UAT: o card "Pendências"
   * ao lado mostrava *"Franquia BR Mania: emitir parecer antecipado · Time de
   * Franquias"* e o CTA seguia habilitado. A entrada aqui é a forma GENÉRICA —
   * a frase real nomeia as bandeiras (`frasearFranquiaParecerPendente`).
   */
  franquia_parecer_pendente: frasearFranquiaParecerPendente([]),
  /*
   * ADR-0037. Antes de 25/08/2026 este código não existia: a barra respondia
   * `ready: true`, habilitava o CTA com a alçada nunca acionada, e a recusa da
   * transição — correta — não aparecia em lugar nenhum da tela. A frase nomeia
   * a ação que conserta, que é o painel "Processo de alçada" logo acima.
   */
  crm_nao_integrado:
    'A alçada ainda não foi acionada — integre a oportunidade e as cotações no Salesforce pelo painel Processo de alçada.',
  /*
   * ADR-0037. O `crm_nao_integrado` cobre só a EXISTÊNCIA dos vínculos: medido
   * em 02/09/2026 na `OPP-2026-000066`, a cotação estava em
   * `FALHA_SINCRONIZACAO` e a simulação era `null`, e o critério "Alçada
   * acionada" voltava OK — a barra habilitaria o envio e o pre-commit effect
   * recusaria (ADO 67941). A frase manda ler o painel, que é onde o motivo da
   * falha de sincronização está escrito por extenso.
   */
  alcada_nao_simulada:
    'A alçada ainda não tem resultado — acompanhe a sincronização e a simulação no painel Processo de alçada.',
};

/** pt-BR label of the análise sub-phase, for the "Status da análise" row. */
const FASE_LABEL: Record<string, string> = {
  em_analise: 'Em análise',
  com_pendencia: 'Com pendência',
  devolvida: 'Devolvida ao LT',
  concluida: 'Concluída',
  liberada: 'Liberada para aprovação',
};

export function mapApprovalReadiness(
  b: BackendApprovalReadiness,
): ApprovalReadiness {
  const missing = b.missing ?? [];

  // One row per criterion the analyst has to satisfy, each with its verdict —
  // derived from `missing`, so the UI never re-implements the gate rule.
  const dependenciasObrigatorias: DependenciaObrigatoria[] = [
    {
      descricao: 'Pendências obrigatórias resolvidas',
      ok: !missing.includes('pendencias_obrigatorias_abertas'),
    },
    {
      // Sem nomear perfil: conferem a SNEG e a CCOB (31/08/2026), e a linha é
      // lida pelos dois.
      descricao: 'Documentos do checklist validados',
      ok: !missing.includes('documentos_nao_validados'),
    },
    {
      descricao: 'Parecer técnico emitido',
      ok: !missing.includes('parecer_nao_emitido'),
    },
    {
      /*
       * UMA linha para os DOIS códigos, de propósito.
       *
       * O rótulo é o que o analista lê como "a alçada está pronta?", e essa
       * pergunta tem duas metades no backend: os vínculos existem
       * (`crm_nao_integrado`) e a alçada chegou a resultado
       * (`alcada_nao_simulada`). Uma linha por código poria duas afirmações
       * sobre alçada no mesmo card, com a primeira em ✓ e a segunda em ✗ — foi
       * a primeira metade sozinha que fez a linha dizer "acionada" com a
       * simulação nula (ADO 67941). Qual das duas falta está em `bloqueios[]`,
       * que é onde a frase nomeia o conserto.
       */
      descricao: 'Alçada acionada (oportunidade e cotações no Salesforce)',
      ok:
        !missing.includes('crm_nao_integrado') &&
        !missing.includes('alcada_nao_simulada'),
    },
  ];

  return {
    ready: b.ready,
    liberadoPorDeAcordoDiretor: b.liberadoPorDeAcordoDiretor ?? false,
    statusAnalise: b.analiseFase
      ? (FASE_LABEL[b.analiseFase] ?? b.analiseFase)
      : b.analiseConcluida
        ? 'Análise concluída'
        : 'Em análise',
    dependenciasObrigatorias,
    nivelAlcada: b.alcadaSugerida?.nivel ?? null,
    // Unknown codes are surfaced raw instead of dropped: a silent empty
    // `bloqueios` next to a disabled button gives the analyst no reason.
    //
    // `documentos_nao_validados` é o único código cuja frase é COMPOSTA em vez de
    // constante: ela nomeia os tipos que o backend mandou (ver
    // `frasearDocumentosNaoValidados`). O mapa continua sendo a fonte do texto —
    // a entrada dele é a forma genérica, e é para ela que se degrada.
    bloqueios: missing.map((code) => {
      if (code === 'documentos_nao_validados') {
        return frasearDocumentosNaoValidados(
          b.documentosAguardandoValidacaoTipos ?? [],
        );
      }
      if (code === 'franquia_parecer_pendente') {
        return frasearFranquiaParecerPendente(
          b.franquiaParecerPendenteBandeiras ?? [],
        );
      }
      return BLOQUEIO_LABEL[code] ?? code;
    }),
    pendenciasObrigatoriasAbertas: b.pendenciasObrigatoriasAbertas ?? 0,
    documentosAguardandoValidacao: b.documentosAguardandoValidacao ?? 0,
    documentosAguardandoValidacaoTipos: b.documentosAguardandoValidacaoTipos ?? [],
    franquiaParecerPendenteBandeiras: b.franquiaParecerPendenteBandeiras ?? [],
  };
}

// ---------------------------------------------------------------------------
// GET /v1/pendencias?opportunityId=… → PendenciasPanelResult (side panel card)
// ---------------------------------------------------------------------------

/** Already-mapped list item as returned by the `/api/pendencias` BFF route. */
export interface MappedPendenciaListItem {
  id: string;
  title: string;
  responsavel: string | null;
  canal: string | null;
  status: string;
  obrigatoria?: boolean;
  acaoResolucao?: AcaoResolucao;
  /** POSSE — ver `PendenciaResumoItem.resolucaoPermitida` (ADO 68190). */
  resolucaoPermitida?: boolean;
}

export interface MappedPendenciaList {
  items: MappedPendenciaListItem[];
  total: number;
  /** Opcional só para tolerar backend anterior ao ADO 68150 — ver o mapper. */
  totalAtivas?: number;
}

/**
 * Projects the pendências list onto the side-panel card. `/api/pendencias`
 * already translates enums, so this only renames `title → titulo` and defaults
 * `obrigatoria` (absent on older payloads) to `false` — never `undefined`, which
 * would render the "Obrigatória" badge as a blank chip.
 */
export function mapPendenciasResumo(
  b: MappedPendenciaList,
): PendenciasPanelResult {
  return {
    total: b.total ?? 0,
    /*
     * ADO 68150 — o contador do card é este, não `total` (que soma os quatro
     * status). Mesmo fallback do `/api/pendencias`: ausente ⇒ o comportamento
     * antigo (superconta), porque subcontar esconderia trabalho aberto.
     */
    totalAtivas: b.totalAtivas ?? b.total ?? 0,
    items: (b.items ?? []).map((i) => ({
      id: i.id,
      titulo: i.title,
      responsavel: i.responsavel ?? null,
      canal: i.canal ?? null,
      status: i.status,
      obrigatoria: i.obrigatoria ?? false,
      // Kept as-is (including absent): `podeResolverPendencia` reads the
      // absence as "can", which is the recoverable side (ADO 67911).
      acaoResolucao: i.acaoResolucao,
      // Idem para a POSSE (ADO 68190): ausente = backend anterior ao campo.
      resolucaoPermitida: i.resolucaoPermitida,
    })),
  };
}
