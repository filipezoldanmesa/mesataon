/**
 * Frontend types for the garantia track read model (GAR-16 / VBR-342).
 *
 * The backend exposes `GET /v1/opportunities/:id/garantia/trilha` and
 * pre-computes every field — the frontend never derives `naoSeAplica` from
 * `TipoGarantia`, step indices from state names, or step 4–5 availability
 * from the contracts module state.
 *
 * Same pattern as CLAUDE.md §"Regra derivada é do backend": the front only
 * reacts to what the payload contains.
 */

import type { PillVariant } from '@/components/status-pill';

export type GarantiaPassoEstado = 'done' | 'active' | 'pending';

export interface GarantiaPasso {
  /** 1-based position — the number in the step circle. */
  ordem: number;
  /**
   * pt-BR name of the step, from the backend. The screen used to hold its own
   * 5-item list, whose docstring cited a prototype file that does not exist.
   */
  label: string;
  /** Responsible party (`gresp` in the prototype). `null` on the final step. */
  responsavel: string | null;
  estado: GarantiaPassoEstado;
  /**
   * True when the upstream source for this step is temporarily unavailable.
   * "Concluído" comes from the contracts module; when that source is down the
   * backend returns `pending` + this flag so the stepper shows the gap rather
   * than a permanently-greyed step.
   *
   * The frontend renders these steps as `pending` and adds a small
   * "Indisponível" label below them — it never invents an `active` state.
   */
  secaoIndisponivel?: boolean;
  /**
   * True when NOTHING in the domain records this step (validação da área de
   * crédito, lavratura da hipoteca, checklist da área de crédito). It stays
   * `pending` forever and the strip says so.
   *
   * Distinct from {@link secaoIndisponivel}, which is a source that exists and
   * is momentarily down: that one may resolve on a refresh, this one will not.
   */
  semFonte?: boolean;
  /**
   * True when this step STOPPED without concluding — today only "Análise de
   * Perfil", whose survey was closed.
   *
   * `estado` stays `pending` (closing is not concluding — VBR-585). This flag
   * exists because without it a closed step renders exactly like one that never
   * started: the grey circle reads as "waiting on the CCOB" when in fact nobody
   * is coming.
   *
   * ⚠️ Rendered NEUTRAL, never as a failure: the same closure covers the benign
   * RN-F0-06 case (the concession stopped requiring the survey). What separates
   * the two is {@link detalhe}, not the styling — the same call VBR-500 made for
   * the pill.
   */
  encerrado?: boolean;
  /**
   * pt-BR line under the step, composed by the backend (ADR-0018) and rendered
   * verbatim.
   *
   * ⚠️ **Independente de {@link encerrado}.** Hoje só o passo "Análise de
   * Perfil" a emite, em três situações: o RESULTADO quando o levantamento
   * concluiu (`"Risco altíssimo"` — passo verde, SEM `encerrado`), o motivo
   * quando ele parou, e `"Não exigida"` quando a concessão nunca exigiu
   * levantamento. Até 28/08/2026 o mapper descartava a frase sem a marca, e o
   * passo concluído ficava verde sem dizer o que concluiu (ADO 67880).
   */
  detalhe?: string;
}

export interface GarantiaTrackResult {
  /**
   * True when the opportunity has no garantia (e.g. fiança sem lastro) or
   * no concessão financeira. Decided entirely by the backend — the frontend
   * never branches on `TipoGarantia` to derive this flag.
   */
  naoSeAplica: boolean;
  /**
   * Dynamic sub-label for the Garantia tab button — the name of the current
   * active step ("Análise prévia", "Minuta", …) or "Não se aplica" when
   * `naoSeAplica`. Delivered by the backend, never derived on the front.
   */
  subLabel: string;
  /**
   * Veredito da ABA "Garantia" da timeline (decisão de produto · 24/09/2026):
   * `true` ⇒ a aba fica desabilitada. Sem antecipação nem mútuo não há análise
   * de perfil nem prévia, então não há fluxo — mesmo com garantia voluntária
   * cadastrada.
   *
   * ⚠️ Não é `naoSeAplica`: aquele segue com o veredito anterior porque tem
   * outros leitores (o quadro de análises da SNEG), e a mudança foi pedida só
   * para a aba. Quem desenha a aba lê ESTE.
   */
  abaDesabilitada: boolean;
  /**
   * `true` ⇒ `passos` traz só "Em preenchimento" e "Análise de Perfil" (não há
   * análise prévia). O último passo NÃO é o fim do processo: um `active` ali é
   * levantamento em execução, e a faixa não pode aplicar a regra de desenho do
   * último degrau (`trackStepDisplayState`), que o pintaria de concluído.
   */
  abaSemPrevia: boolean;
  /**
   * Sub-rótulo da ABA "Garantia" da timeline — igual a `subLabel`, exceto
   * quando a aba está desabilitada ou quando não há análise prévia (aí nomeia
   * um dos dois passos que existem). Do backend, nunca derivado aqui.
   */
  abaSubLabel: string;
  /**
   * The 10 steps of the prototype (`01c-oportunidade-analise.html:276-292`), in
   * order, each carrying its own label and responsible party.
   */
  passos: GarantiaPasso[];
  /**
   * State label for the "Andamento da análise" panel link,
   * e.g. "Em análise prévia →". Null when `naoSeAplica` or no state yet.
   */
  analiseEstadoLabel: string | null;
  /**
   * SET-level state label for the head pill of the "Garantias" card on the 01b
   * (prototype `garantias.html:51` — `Garantias · análise prévia`, and
   * `:104-107` — `Garantias · aprovadas`).
   *
   * Plural because the subprocess is 1:1 with the opportunity (ADR-0023) while
   * the card lists N indications: the state belongs to the SET, not to a row.
   * That is also what the prototype does — its approved variant flips the head
   * pill and every row pill in the same pass.
   *
   * Null when the subprocess does not apply, or when the backend sends a state
   * this build does not know. Composed by the backend from the single catalog
   * map — never derived here (VBR-500 CA-5).
   */
  estadoConjuntoLabel: string | null;
  /** Pill variant for {@link estadoConjuntoLabel}; null together with it. */
  estadoConjuntoPill: PillVariant | null;
  /**
   * Whether the indicated guarantees may be created/edited/removed from the
   * OPPORTUNITY CARD right now — the same predicate the write routes apply
   * (`indicacaoMutavel`). The frontend reads this verdict and never recomputes
   * it: a second implementation would diverge exactly in the opportunity that
   * just entered analysis, and the card would offer a control the API answers
   * with 409.
   *
   * ⚠️ Since 02/09/2026 the input is the OPPORTUNITY PHASE — only `NOVOS` and
   * `EM_PREENCHIMENTO` allow it. Past the filling phase the only path is the
   * pendência ticket (ADR-0023 §D4).
   *
   * Used to compose `canWrite` alongside the `GarantiaIndicar` permission in
   * `GarantiasIndicadasCard` — the permission says WHO (LT/SNEG), this says
   * WHEN (only while the opportunity is still being filled).
   */
  indicacoesEditaveis: boolean;
  /**
   * Frase pt-BR dizendo que a garantia NÃO é obrigatória nesta oportunidade
   * (ADO 67997), composta pelo backend e renderizada **verbatim** no card
   * "Garantias" — que continua oferecendo "+ Adicionar garantia".
   *
   * `null` quando não há aviso a dar. ⚠️ **Não derive isto de
   * {@link naoSeAplica}:** aquele flag também é `true` no encerramento e no caso
   * "todas as indicações são fiança sem lastro", e neste último a concessão
   * EXIGE garantia — a frase seria falsa. Quem sabe distinguir é o backend.
   */
  avisoNaoObrigatoria: string | null;
  /**
   * Veredito do botão *Enviar para análise prévia* (ADO 67920).
   *
   * `null` quando o controle NÃO deve existir — a tela não renderiza botão
   * algum, em vez de um permanentemente desabilitado (a mesma regra que a
   * sendbar do contrato aplica com `acaoLabel: null`).
   *
   * ⚠️ Lido, nunca recalculado: é o mesmo `avaliarEnvioPreviaGate` que
   * `POST .../garantia:enviar-analise-previa` aplica. Uma segunda implementação
   * divergiria exatamente na garantia que acabou de receber o último laudo, e
   * aí o card ofereceria o clique que a API recusa.
   */
  envioPreviaGate: GarantiaEnvioPreviaGate | null;
}

/** Ver {@link GarantiaTrackResult.envioPreviaGate}. */
export interface GarantiaEnvioPreviaGate {
  /** O clique vai passar? */
  habilitado: boolean;
  /**
   * Código de máquina do primeiro bloqueio — `null` quando habilitado.
   *
   * Mantido como `string` de propósito: a tela não ramifica por ele (quem
   * decide o texto é o backend), e uma união literal aqui seria a segunda lista
   * a apodrecer quando o vocabulário crescer.
   */
  codigo: string | null;
  /** Frase-manchete pt-BR. `null` quando habilitado. */
  motivo: string | null;
  /** O que falta, item a item. Vazio quando habilitado. */
  motivos: string[];
}
