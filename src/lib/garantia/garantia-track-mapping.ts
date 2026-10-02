import { mapPillVariant } from './garantia-mapping';
import type { GarantiaPasso, GarantiaPassoEstado, GarantiaTrackResult } from './garantia-track.types';

/**
 * Anti-corruption mapping for the garantia track read model (GAR-16 / VBR-342).
 *
 * The backend delivers `estado` values as plain strings — the mapping guards
 * against unknown values (falls back to `pending`) so a new backend state
 * never throws downstream. All other fields are already frontend-shaped; this
 * module makes that assumption explicit and type-checked (CLAUDE.md §"Mapping").
 */

// ---------------------------------------------------------------------------
// Backend contract (GET /v1/opportunities/:id/garantia/trilha)
// ---------------------------------------------------------------------------

export interface BackendGarantiaPassso {
  ordem: number;
  /** pt-BR name — composed in the backend (ADR-0018), never held here. */
  label: string;
  /** The `gresp` line of the prototype. `null` on the final step. */
  responsavel: string | null;
  estado: string;
  secaoIndisponivel?: boolean;
  /** No entity in the domain records this step — see the type doc. */
  semFonte?: boolean;
  /** The step stopped without concluding — see the type doc. */
  encerrado?: boolean;
  /** pt-BR reason it stopped, composed by the backend. */
  detalhe?: string;
}

export interface BackendGarantiaTrack {
  naoSeAplica: boolean;
  subLabel: string;
  /**
   * Optional: builds of the API before 24/09/2026 do not send them. Absence
   * falls back to `naoSeAplica`/`subLabel` — the tab keeps the behaviour it
   * had, never a verdict invented here.
   */
  abaDesabilitada?: boolean;
  abaSemPrevia?: boolean;
  abaSubLabel?: string;
  passos: BackendGarantiaPassso[];
  analiseEstadoLabel: string | null;
  /** Optional: older builds of the API do not send it (VBR-500). */
  estadoConjuntoLabel?: string | null;
  estadoConjuntoPill?: string | null;
  /**
   * Optional: older builds of the API do not send it. Absence maps to
   * `false` — the same "never assume writable when we don't know" rule as
   * the initial state in the card (Task 7).
   */
  indicacoesEditaveis?: boolean;
  /**
   * Optional: older builds of the API do not send it (ADO 67997). Absence maps
   * to `null` — no note, never an invented one.
   */
  avisoNaoObrigatoria?: string | null;
  /**
   * Optional: older builds of the API do not send it (ADO 67920). Absence maps
   * to `null` — nenhum botão. Oferecer o controle por ausência de informação
   * faria o LT clicar num envio que a API recusa.
   */
  envioPreviaGate?: {
    disponivel?: boolean;
    habilitado?: boolean;
    codigo?: string | null;
    motivo?: string | null;
    motivos?: string[];
  } | null;
}

// ---------------------------------------------------------------------------
// Response mapping (backend → frontend)
// ---------------------------------------------------------------------------

const ESTADO_MAP: Record<string, GarantiaPassoEstado> = {
  done: 'done',
  active: 'active',
  pending: 'pending',
};

function mapPasso(b: BackendGarantiaPassso): GarantiaPasso {
  return {
    ordem: b.ordem,
    label: b.label,
    responsavel: b.responsavel ?? null,
    estado: ESTADO_MAP[b.estado] ?? 'pending',
    ...(b.secaoIndisponivel ? { secaoIndisponivel: true } : {}),
    ...(b.semFonte ? { semFonte: true } : {}),
    /*
     * `encerrado` e `detalhe` são INDEPENDENTES.
     *
     * Até 28/08/2026 o detalhe só era mapeado junto do encerramento
     * (`b.encerrado && b.detalhe`), com o raciocínio de que uma frase sem a
     * marca renderizaria uma linha órfã. O backend passou a usar o mesmo slot
     * para o RESULTADO do levantamento concluído (ADO 67880 — "qual o resultado
     * da análise de perfil? precisa ser apresentado"), que é justamente um
     * detalhe SEM encerramento: concluir não é parar. Com a condição antiga a
     * frase era descartada aqui e o passo verde continuava mudo.
     *
     * A marca sozinha continua permitida — um build que mande `encerrado` sem
     * frase ainda deve trocar o glifo do círculo.
     */
    ...(b.encerrado ? { encerrado: true } : {}),
    ...(b.detalhe ? { detalhe: b.detalhe } : {}),
  };
}

/**
 * Maps the backend garantia track payload to the frontend {@link GarantiaTrackResult}.
 *
 * `estado` values are explicitly coerced through `ESTADO_MAP` — an unknown
 * state falls back to `pending` rather than crashing the stepper (RN-F6-01:
 * never lie about where in the process the oportunidade is).
 */
export function mapGarantiaTrack(b: BackendGarantiaTrack): GarantiaTrackResult {
  /*
   * The label is the gate for BOTH fields: the backend nulls it when the
   * subprocess does not apply or when the state is unknown to it, and a variant
   * with no label is a pill with nothing in it. `?? null` (not a default
   * variant) keeps "no state to report" distinguishable from a state.
   */
  const estadoConjuntoLabel = b.estadoConjuntoLabel ?? null;

  return {
    naoSeAplica: b.naoSeAplica,
    subLabel: b.subLabel,
    abaDesabilitada: b.abaDesabilitada ?? b.naoSeAplica,
    // Ausente ⇒ `false`: uma API anterior sempre manda a trilha inteira.
    abaSemPrevia: b.abaSemPrevia ?? false,
    abaSubLabel: b.abaSubLabel ?? b.subLabel,
    passos: (b.passos ?? []).map(mapPasso),
    analiseEstadoLabel: b.analiseEstadoLabel,
    estadoConjuntoLabel,
    estadoConjuntoPill:
      estadoConjuntoLabel === null || b.estadoConjuntoPill == null
        ? null
        : mapPillVariant(b.estadoConjuntoPill),
    indicacoesEditaveis: b.indicacoesEditaveis ?? false,
    /*
     * ADO 67997 — a frase é do backend; aqui só o default de ausência.
     *
     * `?? null` e nunca uma frase local: um texto composto aqui seria a segunda
     * fonte da mesma afirmação, e ela apareceria justamente contra um build da
     * API que decidiu NÃO avisar (encerramento, fiança sem lastro).
     */
    avisoNaoObrigatoria: b.avisoNaoObrigatoria ?? null,
    /*
     * ADO 67920 — o veredito do botão "Enviar para análise prévia".
     *
     * `disponivel !== true` ⇒ `null` (nenhum botão): o backend já nula o campo
     * quando o controle não deve existir, e o flag explícito é a segunda
     * guarda para um build que mande o objeto sem ele. Nunca inventar
     * `habilitado: true` — a degradação segura é não oferecer o clique.
     */
    envioPreviaGate:
      b.envioPreviaGate && b.envioPreviaGate.disponivel !== false
        ? {
            habilitado: b.envioPreviaGate.habilitado ?? false,
            codigo: b.envioPreviaGate.codigo ?? null,
            motivo: b.envioPreviaGate.motivo ?? null,
            motivos: b.envioPreviaGate.motivos ?? [],
          }
        : null,
  };
}
