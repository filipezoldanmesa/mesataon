'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { FieldLabel } from '@/components/ui/field-label';
import { Select } from '@/components/ui/select';

import {
  editarParecer as defaultEditarParecer,
  emitirParecer as defaultEmitirParecer,
  gerarParecer as defaultGerarParecer,
  getParecer as defaultGetParecer,
  parecerPdfUrl as defaultParecerPdfUrl,
} from '@/lib/opportunities/parecer.data';
import type {
  EditarParecerPayload,
  IndicadorSituacao,
  MarcacaoAderencia,
  Parecer,
  ParecerIndicador,
  ParecerRecomendacaoNota,
} from '@/lib/opportunities/parecer.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Four UI states (DoD): `loading`, `not-generated` (404 from GET — CA-F5-01's
 * empty state), `loaded` and `error` (generic load failure, distinct from
 * "not generated").
 */
type LoadStatus = 'loading' | 'not-generated' | 'loaded' | 'error';
type SaveStatus = 'idle' | 'saving' | 'error';
type GenerateStatus = 'idle' | 'generating' | 'error';
type EmitStatus = 'idle' | 'emitting' | 'error';

type Props = {
  opportunityId: string;
  /**
   * Modo leitura — o parecer é o veredito da SNEG, e desde 25/08/2026 esta
   * mesma tela é a que o LT vê quando a oportunidade já está em análise.
   *
   * ⚠️ Suprime também a AUTO-GERAÇÃO do rascunho. O painel cria o parecer
   * sozinho ao abrir quando ainda não existe (o protótipo não tem passo
   * "gerar"), o que para um visitante em leitura seria uma ESCRITA silenciosa:
   * abrir a tela criaria um rascunho de parecer em nome da SNEG.
   */
  readOnly?: boolean;
  /** Injectable for tests; defaults to the real BFF API. */
  getParecer?: typeof defaultGetParecer;
  gerarParecer?: typeof defaultGerarParecer;
  editarParecer?: typeof defaultEditarParecer;
  emitirParecer?: typeof defaultEmitirParecer;
  /**
   * Called after a successful emission so the surrounding screen can refresh
   * the F7 travas — emitting the parecer clears the `parecer_nao_emitido`
   * blocker (RN-F7-01 / A06) and must unlock the sendbar without a reload.
   */
  onEmitted?: () => void;
  /**
   * Called after every successful field save (PATCH), not only on emission.
   *
   * The parecer feeds two rows of the surrounding "Análises" card —
   * "Recomendação" and "Alçada sugerida" (`alcadaSugerida` is derived from the
   * parecer). Those loaded once on mount, so choosing "Aprovar" left the card
   * reading `Recomendação —` until the next navigation: the screen contradicted
   * the value the analyst had just saved (VBR-635 §4).
   *
   * Deliberately separate from {@link onEmitted}: emission also refreshes the
   * travas and the sendbar, which a field save must NOT touch.
   */
  onSaved?: () => void;
  /**
   * How many mandatory pendências are still open, as counted by the backend
   * readiness (`pendenciasObrigatoriasAbertas`). Purely informative: the PRD
   * puts the trava on **F7** (RN-F7-02 — "o avanço para aprovação é bloqueado
   * enquanto existirem dependências/pendências obrigatórias não concluídas"),
   * and F7's own pré-condição is "parecer gerado (F5)", so gating the
   * generation here would deadlock the documented sequence. The card just says
   * what is still open, so the analyst is not surprised at the sendbar.
   */
  pendenciasObrigatoriasAbertas?: number;
  parecerPdfUrl?: typeof defaultParecerPdfUrl;
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtCurrencyMasked(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Unit declared by a backend indicator name, or `null` when it declares none.
 *
 * The backend names every indicator with its unit in a trailing parenthesis —
 * `Volume global bruto (m³)`, `VMM (m³/mês)`, `Investimento total (R$)`,
 * `Tempo de contrato (meses)`, `Mix postecipada (%)` — so the unit has exactly
 * one owner (`buildIndicadorRowSpecs`) and the screen must READ it, never
 * restate it.
 *
 * A handful of names carry no unit (`TIR`, `TMA`, `VPL`, `Margem EBITDA`,
 * `% Antecipação`); those return `null` and keep the explicit scale conventions
 * in {@link fmtIndicadorValor}.
 */
export function unidadeDoIndicador(nome: string): string | null {
  const match = /\(([^)]+)\)\s*$/.exec(nome);
  return match ? match[1].trim() : null;
}

/**
 * Formats an indicator's value, deriving the unit from its backend `nome`.
 *
 * ## Why the unit is read and never restated
 *
 * The volume rows used to go through a `fmtVolume` that appended a hardcoded
 * `m³/mês`, while the backend names those very indicators `(m³)`. They are
 * TOTALS over the contract horizon, so the parecer contradicted itself by a
 * factor of the HV — it showed `2.880 m³/mês` in this card and `VMM 60` in the
 * indicators table of the same document, and this is the document the alçada
 * decision rests on (VBR-632).
 *
 * `buildIndicadorRowSpecs` is the single owner of the unit; the screen reads it
 * through {@link unidadeDoIndicador}. Any indicator added there arrives here
 * correctly labelled with no change to this file.
 *
 * ## Scale conventions (unchanged — these are NOT derivable from the name)
 *
 * `TIR`, `% Antecipação`, `Margem EBITDA` and `Mix postecipada (%)` are stored
 * as decimal FRACTIONS and are multiplied by 100; `TMA` is already a
 * percentage; `VPL` is currency. Same convention as
 * `OpportunityIndicatorsPanel`/`ProposalIndicatorsBlock`. Guessing any of these
 * from the name would be a 100× error inside a decision document.
 *
 * `Mix postecipada (%)` is a fraction because the backend derives it as
 * `1 - percentualAntecipacao` (`parecer.service.ts`), and `% Antecipação` is
 * itself a fraction.
 *
 * @param withUnit appends a plain unit suffix (`m³`, `m³/mês`, `meses`). The
 *   "Volume e equalização" card sets it because ITS labels carry no unit
 *   ("Volume bruto contratado"); the indicators table leaves it off because its
 *   `rotulo` column is the prototype's wording and adding a suffix there would
 *   change a fidelity-controlled table. Currency and percentage are number
 *   FORMATS, not suffixes, so they always apply.
 */
export function fmtIndicadorValor(
  nome: string,
  value: number | null,
  { withUnit = false }: { withUnit?: boolean } = {},
): string {
  if (value === null) return '—';

  // Names with no declared unit keep their explicit scale handling.
  const unidade = unidadeDoIndicador(nome);
  if (unidade === null) {
    switch (nome) {
      case 'TIR':
      case '% Antecipação':
      case 'Margem EBITDA':
        return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
      case 'TMA':
        return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
      case 'VPL':
        return fmtCurrencyMasked(value);
      default:
        return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    }
  }

  // Percentage: stored as a fraction (see docstring).
  if (unidade === '%') {
    return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  }

  // Currency, including the per-m³ variants. `R$/m³` is currency PLUS a
  // denominator, and the denominator is part of the reading — dropping it turns
  // a unit price into a total.
  if (unidade === 'R$') return fmtCurrencyMasked(value);
  if (unidade.startsWith('R$/')) {
    return `${fmtCurrencyMasked(value)}/${unidade.slice('R$/'.length)}`;
  }

  const numero = value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return withUnit ? `${numero} ${unidade}` : numero;
}

/**
 * Date only — "Data de emissão" in the Identificação card.
 *
 * Mirrors what the PDF prints for the same field
 * (`toLocaleDateString("pt-BR")`), so the screen and the document do not
 * disagree on the emission date.
 */
function fmtDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** `null`/`''` renders the em dash: the field exists, it just was not captured. */
function ouTraco(value: string | null | undefined): string {
  return value == null || value.trim() === '' ? '—' : value;
}

// ---------------------------------------------------------------------------
// Indicadores table — the prototype's eight rows
// ---------------------------------------------------------------------------

/**
 * The rows the "Indicadores · negociado × referência × situação" table shows,
 * in the prototype's order (`01c-oportunidade-analise.html` §parecer).
 *
 * The backend emits FOURTEEN indicators; the prototype's table has eight. The
 * difference is not noise:
 *
 *  - `Volume global bruto`, `(−) Saldo devedor volumétrico`,
 *    `Volume líquido considerado` and `Investimento total` are the fields the
 *    prototype puts in the **"Volume e equalização"** card — they are read
 *    there now, so nothing is dropped, it is shown where the design puts it.
 *  - `Margem EBITDA` and `Mix postecipada (%)` have no row in this recorte.
 *    They stay in `parecer.indicadores` and the PDF prints EVERY indicator
 *    (`ParecerPdfService.buildSection2` maps the array unfiltered), so the
 *    emitted document — the actual deliverable — keeps them.
 *
 * `rotulo` is the prototype's wording, which is shorter than the backend's
 * `nome` (it carries the unit) — e.g. "Tempo de contrato (HV)" for
 * "Tempo de contrato (meses)".
 */
const INDICADORES_DO_PROTOTIPO: ReadonlyArray<{ nome: string; rotulo: string }> = [
  { nome: 'VMM (m³/mês)', rotulo: 'VMM' },
  { nome: 'Margem média (R$/m³)', rotulo: 'Margem média' },
  { nome: 'Tempo de contrato (meses)', rotulo: 'Tempo de contrato (HV)' },
  { nome: 'Custo de vinculação líquido (R$/m³)', rotulo: 'Custo de vinculação líq.' },
  { nome: '% Antecipação', rotulo: 'Mix antecipada' },
  { nome: 'TIR', rotulo: 'TIR' },
  { nome: 'VPL', rotulo: 'VPL' },
  { nome: 'TMA', rotulo: 'TMA aplicável' },
];

/** Indicator by backend `nome` — `undefined` when the parecer does not carry it. */
function acharIndicador(
  indicadores: ParecerIndicador[],
  nome: string,
): ParecerIndicador | undefined {
  return indicadores.find((row) => row.nome === nome);
}

// ---------------------------------------------------------------------------
// "Exceção" color decision (fidelity spec §Escopo item 3 + registered épico
// desvio #1): `.exc`/situação use `--yellow-700` on a `--yellow-100` chip;
// `--color-warning` (#9d6500) is NOT used here so the table (item 3) and the
// aderência pill (item 5) share one single "exception" color, on-screen and
// in the future PDF (BE-5). "Padrão" mirrors it with the secondary (green)
// palette already used for "success/ok" states elsewhere in the app.
// ---------------------------------------------------------------------------

const PADRAO_TEXT = 'text-(--secondary-700)';
const EXCECAO_TEXT = 'text-(--yellow-700)';

function SituacaoLabel({ situacao }: { situacao: IndicadorSituacao | null }) {
  if (situacao === null) {
    return <span className="text-(--color-text-muted)">—</span>;
  }
  if (situacao === 'padrao') {
    return <span className={`font-bold ${PADRAO_TEXT}`}>Padrão</span>;
  }
  return <span className={`font-bold ${EXCECAO_TEXT}`}>Exceção</span>;
}

function AderenciaPill({ aderente }: { aderente: boolean }) {
  return aderente ? (
    <span className="inline-flex items-center rounded-full bg-(--secondary-100) px-2.5 py-0.5 text-(length:--t-small) font-bold text-(--secondary-700)">
      Sem exceções
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-(--yellow-100) px-2.5 py-0.5 text-(length:--t-small) font-bold text-(--yellow-700)">
      Com exceções
    </span>
  );
}

// ---------------------------------------------------------------------------
// "Marcações de aderência" — the analyst's three answers inside card 6
// ---------------------------------------------------------------------------

/**
 * The three rows, in the prototype's order and wording.
 *
 * A list (not three hand-written blocks) because the backend stores them as one
 * `jsonb` object precisely so the set can grow — a fourth mark should be one
 * entry here, not another copy of the row markup.
 */
const MARCACOES_ADERENCIA: ReadonlyArray<{
  campo: 'padraoComercial' | 'politicaComercial' | 'orcamentoVpFin';
  rotulo: string;
}> = [
  { campo: 'padraoComercial', rotulo: 'Atende padrão comercial' },
  { campo: 'politicaComercial', rotulo: 'Atende política comercial' },
  { campo: 'orcamentoVpFin', rotulo: 'Atende orçamento VP FIN' },
];

/** Local form state: `''` is the unanswered (`null`) case the Select shows as placeholder. */
type MarcacoesLocal = Record<(typeof MARCACOES_ADERENCIA)[number]['campo'], '' | 'sim' | 'nao'>;

const MARCACOES_VAZIAS: MarcacoesLocal = {
  padraoComercial: '',
  politicaComercial: '',
  orcamentoVpFin: '',
};

/**
 * Reading is defensive because the column is `jsonb` validated only as
 * `@IsObject()` on the backend — no per-key, per-value check. Anything that is
 * not literally `'sim'`/`'nao'` reads as unanswered, which is the safe end: the
 * mark corrects the alçada, so inventing an answer is worse than asking again.
 */
function marcacaoParaSelect(value: unknown): '' | 'sim' | 'nao' {
  return value === 'sim' || value === 'nao' ? value : '';
}

function selectParaMarcacao(value: '' | 'sim' | 'nao'): MarcacaoAderencia {
  return value === '' ? null : value;
}

/**
 * `placeholder` names the state instead of prompting ("Selecione…"): `null` and
 * "Não" are different facts here, so the empty option has to read as *not
 * answered*, never as a negative answer.
 */
const MARCACAO_OPCOES = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
] as const;

function MarcacaoRow({
  id,
  rotulo,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  rotulo: string;
  value: '' | 'sim' | 'nao';
  onChange: (value: '' | 'sim' | 'nao') => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-(--color-border) py-2.5">
      <label htmlFor={id} className="text-(length:--t-caption) font-bold">
        {rotulo}
        {/* Mesmo critério do `PCard` e do `FieldLabel`: em leitura não há o que
            preencher, e o marcador descreveria uma trava de outra pessoa. */}
        {!disabled && (
          <span className="ml-0.5 text-(--color-danger)" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {/* Fixed-width wrapper, not `className` on the Select: its root is
          `w-full`, so a width utility passed in would collide with it. */}
      <div className="w-[200px] shrink-0 max-sm:w-[132px]">
        <Select
          id={id}
          value={value}
          placeholder="Não respondido"
          options={MARCACAO_OPCOES}
          required={!disabled}
          disabled={disabled}
          onChange={(v) => onChange(v as '' | 'sim' | 'nao')}
        />
      </div>
    </div>
  );
}

/**
 * Muted "what is still open" note, NOT a blocker (CLAUDE.md: "falta o próximo
 * passo" is a hint, never `--color-danger`). Generating and emitting the
 * parecer stay enabled — the mandatory-pendência trava lives on F7, and
 * emitting the parecer is itself F7's pré-condição.
 */
function PendenciasObrigatoriasHint({ total }: { total: number }) {
  if (total <= 0) return null;
  const plural = total > 1;
  return (
    <p
      data-testid="parecer-pendencias-hint"
      className="mb-3 text-(length:--t-caption) text-(--yellow-700)"
    >
      {plural
        ? `Há ${total} pendências obrigatórias em aberto.`
        : 'Há 1 pendência obrigatória em aberto.'}{' '}
      <span className="text-(--color-text-muted)">
        O parecer pode ser gerado e emitido normalmente; o envio para aprovação
        é que só libera depois {plural ? 'de resolvidas' : 'de resolvida'}.
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Prototype primitives — .pcard / .pcard-t / .kv / .f / textarea.in
// ---------------------------------------------------------------------------

/**
 * `required` marca o CARD inteiro porque três dos blocos obrigatórios não têm
 * rótulo próprio — o título do card É o rótulo do único textarea que ele
 * contém (Resumo da negociação, Pontos de atenção, Outras informações). O
 * asterisco é `aria-hidden`: quem anuncia a obrigatoriedade ao leitor de tela é
 * o `required` do próprio controle, como em {@link FieldLabel}.
 */
function PCard({
  title,
  first,
  required,
  children,
  testId,
}: {
  title: string;
  first?: boolean;
  required?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-[18px] py-4 ${first ? 'mt-3' : 'mt-4'}`}
    >
      <div className="mb-3.5 text-(length:--t-caption) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
        {title}
        {required && (
          <span className="ml-0.5 text-(--color-danger)" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function KvItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="text-(length:--t-caption) font-bold">{value}</div>
    </div>
  );
}

/** Autosize textarea — height tracks `scrollHeight + 2`, per fidelity spec. */
function AutosizeTextarea({
  id,
  value,
  disabled,
  readOnly,
  required,
  placeholder,
  onChange,
  onBlurCommit,
}: {
  id?: string;
  value: string;
  disabled?: boolean;
  /**
   * Obrigatoriedade anunciada ao leitor de tela — o asterisco do rótulo é
   * `aria-hidden`. Quem chama passa `!readOnly`: em leitura não há o que
   * preencher, e marcar o campo como exigido descreveria uma trava de outra
   * pessoa.
   */
  required?: boolean;
  /**
   * `readOnly`, e NÃO `disabled`, para o modo leitura: um textarea desabilitado
   * esmaece o próprio texto e o tira da ordem de foco — exatamente o conteúdo
   * que quem está só lendo veio ler, e que precisa poder selecionar e copiar.
   */
  readOnly?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlurCommit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  return (
    <textarea
      id={id}
      ref={ref}
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      placeholder={readOnly ? undefined : placeholder}
      onChange={(e) => onChange(e.target.value)}
      // Sem commit em leitura: o valor não muda, mas um PATCH no-op ainda
      // assim seria uma escrita disparada por quem só abriu a tela.
      onBlur={readOnly ? undefined : onBlurCommit}
      rows={3}
      /*
       * Prototype `textarea.in`.
       *
       * ⚠️ The recipe is the one in `vibra-ui.css`, NOT the `input.in` rule
       * inside the page: the stylesheet declares every property with
       * `!important`, so it wins — `--neutral-40` fill, NO border except a 2px
       * `--neutral-600` bottom one, square corners, `11px 12px` padding and
       * `line-height: 1.5`. Reading only the page's inline rule produced the
       * full rounded box this used to render.
       *
       * Same recipe as `controlClass()` in `franquia-ui.tsx`; kept inline here
       * rather than imported, so an opportunities component does not depend on a
       * franquia primitive.
       */
      className="min-h-[70px] w-full resize-none overflow-hidden rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] text-(length:--t-caption) leading-[1.5] text-(--neutral-800) transition-[border-color] duration-150 placeholder:text-(--neutral-500) focus:border-(--secondary-500) focus:outline-none disabled:cursor-not-allowed disabled:border-(--neutral-200) disabled:bg-(--disabled-bg) disabled:text-(--disabled-text)"
    />
  );
}

// ---------------------------------------------------------------------------
// Emit confirmation modal
// ---------------------------------------------------------------------------

/**
 * Emitting is irreversible from the UI: it moves the parecer to `concluido`,
 * freezes every editable field and clears the F7 `parecer_nao_emitido` blocker
 * (RN-F7-01 / A06). A confirmation step keeps it from happening on a stray click.
 */
function EmitConfirmModal({
  onConfirm,
  onClose,
  submitting,
}: {
  onConfirm: () => void;
  onClose: () => void;
  submitting: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emit-confirm-title"
      data-testid="parecer-emit-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)]">
        <div className="border-b border-(--color-border) px-5 py-4">
          <h4 id="emit-confirm-title" className="text-(length:--t-h4) font-bold">
            Salvar o parecer técnico?
          </h4>
        </div>
        {/*
         * The trigger reads "Salvar" (the prototype's wording), so the modal is
         * where the consequence gets named: field edits already persist on blur —
         * what this adds is releasing the parecer for approval.
         *
         * It deliberately does NOT promise irreversibility any more: the parecer
         * stays editable while the opportunity is under analysis, and saying
         * otherwise was the reason an analyst would avoid pressing the button.
         */}
        <div className="px-5 py-4 text-(length:--t-caption)">
          <p>
            Salvar registra a versão atual como parecer definitivo, libera a
            exportação em PDF e libera a trava de aprovação da análise.
          </p>
          <p className="mt-2">
            Você ainda pode ajustar e salvar de novo enquanto a oportunidade
            estiver em análise — cada versão fica registrada no histórico.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-(--color-border) px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-white px-4 py-2 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="parecer-emit-confirm-submit"
            onClick={onConfirm}
            disabled={submitting}
            className="cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:opacity-40"
          >
            {submitting ? 'Salvando…' : 'Salvar parecer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * "Parecer técnico — SNEG" block (F5 — VBR-170, `04-analise-sneg.html`).
 *
 * Consumes the parecer backend already delivered (VBR-168/VBR-169): GET
 * (current), POST :gerar, PATCH (edits + versioning), GET versoes[/:v]. The
 * PDF export (BE-5) is wired to its BFF route as a dependency — the endpoint
 * itself lands separately.
 *
 * Covers the four UI states (loading / not-generated / loaded / error) and
 * RN-F5-02 edit + versioning: every editable field commits via `onBlur`
 * (selects via `onChange`) — never per keystroke — and only when the value
 * actually changed, so a field visited-but-untouched creates no PATCH/version.
 */
export function ParecerPanel({
  opportunityId,
  readOnly = false,
  getParecer = defaultGetParecer,
  gerarParecer = defaultGerarParecer,
  editarParecer = defaultEditarParecer,
  emitirParecer = defaultEmitirParecer,
  onEmitted,
  onSaved,
  pendenciasObrigatoriasAbertas = 0,
  parecerPdfUrl = defaultParecerPdfUrl,
}: Props) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [parecer, setParecer] = useState<Parecer | null>(null);

  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>('idle');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [emitStatus, setEmitStatus] = useState<EmitStatus>('idle');
  /**
   * A frase da recusa, **do backend**. Desde 22/09/2026 o 400 do `:emitir` é,
   * quase sempre, "faltam preencher: X, Y, Z" — e é a única coisa que diz ao
   * analista onde ir. `null` cai na frase genérica, que continua sendo a certa
   * para a falha de rede.
   */
  const [emitError, setEmitError] = useState<string | null>(null);
  const [confirmEmitOpen, setConfirmEmitOpen] = useState(false);

  // Editable local field state — synced from `parecer` whenever it (re)loads.
  const [resumoBriefing, setResumoBriefing] = useState('');
  const [marcacoes, setMarcacoes] = useState<MarcacoesLocal>(MARCACOES_VAZIAS);
  const [analiseAderencia, setAnaliseAderencia] = useState('');
  const [justificativaAlcada, setJustificativaAlcada] = useState('');
  const [recomendacaoNota, setRecomendacaoNota] = useState<ParecerRecomendacaoNota>('aprovar');
  const [parecerExecutivo, setParecerExecutivo] = useState('');
  const [pontosAtencao, setPontosAtencao] = useState('');
  const [outrasInformacoes, setOutrasInformacoes] = useState('');

  // Last-saved baselines — a blur that didn't change the value never PATCHes.
  const savedRef = useRef({
    resumoBriefing: '',
    marcacoes: MARCACOES_VAZIAS,
    analiseAderencia: '',
    justificativaAlcada: '',
    recomendacaoNota: 'aprovar' as ParecerRecomendacaoNota,
    parecerExecutivo: '',
    pontosAtencao: '',
    outrasInformacoes: '',
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function syncEditableState(p: Parecer) {
    const next = {
      resumoBriefing: p.resumoNegociacao?.briefing ?? '',
      marcacoes: {
        padraoComercial: marcacaoParaSelect(p.marcacoesAderencia?.padraoComercial),
        politicaComercial: marcacaoParaSelect(p.marcacoesAderencia?.politicaComercial),
        orcamentoVpFin: marcacaoParaSelect(p.marcacoesAderencia?.orcamentoVpFin),
      },
      analiseAderencia: p.analiseAderencia ?? '',
      justificativaAlcada: p.justificativaAlcada ?? '',
      recomendacaoNota: p.recomendacao?.nota ?? ('aprovar' as ParecerRecomendacaoNota),
      parecerExecutivo: p.recomendacao?.parecerExecutivo ?? '',
      pontosAtencao: p.pontosAtencao ?? '',
      outrasInformacoes: p.outrasInformacoes ?? '',
    };
    setResumoBriefing(next.resumoBriefing);
    setMarcacoes(next.marcacoes);
    setAnaliseAderencia(next.analiseAderencia);
    setJustificativaAlcada(next.justificativaAlcada);
    setRecomendacaoNota(next.recomendacaoNota);
    setParecerExecutivo(next.parecerExecutivo);
    setPontosAtencao(next.pontosAtencao);
    setOutrasInformacoes(next.outrasInformacoes);
    savedRef.current = next;
  }

  const fetchParecer = useCallback(() => {
    setLoadStatus('loading');
    getParecer(opportunityId)
      .then((result) => {
        if (!mountedRef.current) return;
        if (result === null) {
          setParecer(null);
          setLoadStatus('not-generated');
          return;
        }
        setParecer(result);
        syncEditableState(result);
        setLoadStatus('loaded');
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadStatus('error');
      });
  }, [opportunityId, getParecer]);

  useEffect(() => {
    fetchParecer();
  }, [fetchParecer]);

  /**
   * Whether the parecer has already been saved at least once (status
   * `concluido`) — which unlocks the PDF export and shows the pill.
   *
   * It does NOT lock anything. The parecer stays editable while the OPPORTUNITY
   * is still under analysis: saving used to freeze every field, so an analyst
   * who spotted a typo right after saving had no way out — could not edit, could
   * not save again. The backend enforces the real window (400 once the
   * opportunity leaves EM_ANALISE), and the analyst can save as many times as
   * needed, each pass appending a version to the history.
   */
  const isSaved = parecer?.status === 'concluido';

  /**
   * The prototype (`01c-oportunidade-analise.html`) has NO "generate" step: the
   * parecer is simply there, filled from the analysis, and the only actions are
   * Salvar and Exportar PDF. So when none exists yet we create the draft on
   * open, instead of parking the analyst on an empty card whose sole affordance
   * is a button the design never had.
   *
   * The ref guards against a loop: a failed generation must surface its error
   * once, not retry forever on every re-render.
   */
  const autoGenerateTriedRef = useRef(false);
  useEffect(() => {
    // ⚠️ `readOnly` PRIMEIRO: abrir a tela não pode criar um rascunho de
    // parecer em nome da SNEG. Sem esta guarda o LT, só por visitar a
    // oportunidade em análise, dispararia `POST .../parecer:gerar`.
    if (readOnly) return;
    if (loadStatus !== 'not-generated' || autoGenerateTriedRef.current) return;
    autoGenerateTriedRef.current = true;
    void runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus, readOnly]);

  // ---------------------------------------------------------------------------
  // Generate (CA-F5-01)
  //
  // Only reached by the auto-generation on open and by its retry: the prototype
  // has no "Gerar parecer" control, so there is no path that regenerates an
  // existing parecer over the analyst's edits.
  // ---------------------------------------------------------------------------

  async function runGenerate() {
    setGenerateStatus('generating');
    try {
      const result = await gerarParecer(opportunityId);
      if (!mountedRef.current) return;
      setParecer(result);
      syncEditableState(result);
      setLoadStatus('loaded');
      setGenerateStatus('idle');
    } catch {
      if (!mountedRef.current) return;
      setGenerateStatus('error');
    }
  }

  /**
   * CA-F5-02 / RN-F7-01 (A06): emits the parecer, freezing it at `concluido`
   * and clearing the F7 blocker. `onEmitted` lets the shell refetch the travas
   * so the sendbar unlocks without a reload.
   */
  async function runEmit() {
    setEmitStatus('emitting');
    setEmitError(null);
    try {
      const result = await emitirParecer(opportunityId);
      if (!mountedRef.current) return;
      setParecer(result);
      syncEditableState(result);
      setEmitStatus('idle');
      setConfirmEmitOpen(false);
      onEmitted?.();
    } catch (err) {
      if (!mountedRef.current) return;
      setEmitError(err instanceof Error && err.message ? err.message : null);
      setEmitStatus('error');
      /*
       * O modal FECHA na falha — ele é um overlay em cima da página, e a frase
       * da recusa (que nomeia os campos que faltam) é renderizada embaixo dele.
       * Mantê-lo aberto punha a resposta atrás do próprio diálogo que a
       * provocou, e ainda deixava o analista a um clique de repetir o mesmo
       * envio sem ter lido nada.
       */
      setConfirmEmitOpen(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save (PATCH) — RN-F5-02 / CA-F5-02
  // ---------------------------------------------------------------------------

  async function commitPatch(payload: EditarParecerPayload) {
    setSaveStatus('saving');
    try {
      const result = await editarParecer(opportunityId, payload);
      if (!mountedRef.current) return;
      setParecer(result);
      syncEditableState(result);
      setSaveStatus('idle');
      // Let the surrounding screen re-read the rows this parecer feeds.
      onSaved?.();
    } catch {
      if (!mountedRef.current) return;
      setSaveStatus('error');
    }
  }

  function commitResumo() {
    if (resumoBriefing === savedRef.current.resumoBriefing) return;
    void commitPatch({ resumoNegociacao: { briefing: resumoBriefing } });
  }

  /**
   * A select has no blur-to-commit affordance, so the answer is saved on change
   * — same as `handleNotaChange`.
   *
   * ALL THREE marks always go in the payload: the backend replaces the whole
   * `jsonb` column (`parecer.marcacoesAderencia = dto.marcacoesAderencia`), so
   * sending only the one that changed would erase the other two.
   */
  function handleMarcacaoChange(
    campo: keyof MarcacoesLocal,
    value: '' | 'sim' | 'nao',
  ) {
    const next = { ...marcacoes, [campo]: value };
    setMarcacoes(next);
    if (value === savedRef.current.marcacoes[campo]) return;
    void commitPatch({
      marcacoesAderencia: {
        padraoComercial: selectParaMarcacao(next.padraoComercial),
        politicaComercial: selectParaMarcacao(next.politicaComercial),
        orcamentoVpFin: selectParaMarcacao(next.orcamentoVpFin),
      },
    });
  }

  function commitAnaliseAderencia() {
    if (analiseAderencia === savedRef.current.analiseAderencia) return;
    void commitPatch({ analiseAderencia });
  }

  function commitJustificativaAlcada() {
    if (justificativaAlcada === savedRef.current.justificativaAlcada) return;
    void commitPatch({ justificativaAlcada });
  }

  function commitRecomendacao(nextNota: ParecerRecomendacaoNota, nextExecutivo: string) {
    if (
      nextNota === savedRef.current.recomendacaoNota &&
      nextExecutivo === savedRef.current.parecerExecutivo
    ) {
      return;
    }
    void commitPatch({ recomendacao: { nota: nextNota, parecerExecutivo: nextExecutivo } });
  }

  function handleNotaChange(nextNota: ParecerRecomendacaoNota) {
    setRecomendacaoNota(nextNota);
    commitRecomendacao(nextNota, parecerExecutivo);
  }

  function commitPontosAtencao() {
    if (pontosAtencao === savedRef.current.pontosAtencao) return;
    void commitPatch({ pontosAtencao });
  }

  function commitOutrasInformacoes() {
    if (outrasInformacoes === savedRef.current.outrasInformacoes) return;
    void commitPatch({ outrasInformacoes });
  }

  // ---------------------------------------------------------------------------
  // Render — loading
  // ---------------------------------------------------------------------------

  if (loadStatus === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="parecer-loading"
        className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        <span className="sr-only">Carregando parecer técnico…</span>
        <div className="mb-3 h-5 w-56 animate-pulse rounded bg-(--neutral-100)" />
        <div className="space-y-2">
          <div className="h-4 animate-pulse rounded bg-(--neutral-100)" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-(--neutral-100)" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-(--neutral-100)" />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — error (generic load failure, not "not generated")
  // ---------------------------------------------------------------------------

  if (loadStatus === 'error') {
    return (
      <div
        role="alert"
        data-testid="parecer-error"
        className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        <h2 className="mb-2 text-(length:--t-h4) font-bold">Parecer técnico — SNEG</h2>
        <p className="text-(length:--t-caption) text-(--color-danger)">
          Falha ao carregar o parecer técnico.
        </p>
        <button
          type="button"
          onClick={() => fetchParecer()}
          className="mt-2 cursor-pointer text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — parecer ainda inexistente
  //
  // Transitório: o efeito acima já está criando o rascunho. A tela mostra que
  // está preparando, não um convite a gerar — o protótipo não tem essa etapa.
  // O botão só reaparece se a criação FALHAR, aí como retry nomeado.
  // ---------------------------------------------------------------------------

  if (loadStatus === 'not-generated') {
    return (
      <div
        data-testid="parecer-not-generated"
        className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        <h2 className="mb-2 text-(length:--t-h4) font-bold">Parecer técnico — SNEG</h2>
        {/*
         * Em leitura não há nada sendo preparado (a auto-geração está
         * suprimida), então "Preparando o parecer…" seria falso: descreveria
         * um trabalho em curso que ninguém está fazendo. O estado real é que
         * a SNEG ainda não elaborou o parecer.
         */}
        {readOnly ? (
          <p
            data-testid="parecer-readonly-ausente"
            className="text-(length:--t-caption) text-(--color-text-muted)"
          >
            A SNEG ainda não elaborou o parecer técnico desta oportunidade.
          </p>
        ) : (
          <>
        <PendenciasObrigatoriasHint total={pendenciasObrigatoriasAbertas} />
        {generateStatus === 'error' ? (
          <>
            <p role="alert" className="mb-3 text-(length:--t-caption) text-(--color-danger)">
              Falha ao preparar o parecer técnico.
            </p>
            {/*
             * Retry of the AUTO-generation, reachable only from this failure
             * state — there is nothing to overwrite here, so it generates
             * straight away with no confirmation step.
             */}
            <button
              type="button"
              onClick={() => void runGenerate()}
              className="cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600)"
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <p className="text-(length:--t-caption) italic text-(--color-text-muted)">
            Preparando o parecer a partir da análise…
          </p>
        )}
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — loaded (the eight pcards)
  // ---------------------------------------------------------------------------

  if (!parecer) return null;

  const indicadores = parecer.indicadores ?? [];

  /*
   * "Base de cálculo TIR/VPL" — decisão de produto de 08/09/2026 (ADO): o
   * negócio pediu que "o valor que consta no 'Análises' esteja também" aqui,
   * porque o campo estava chumbado em "—" e era o único vazio do card.
   *
   * ⚠️ DIVERGÊNCIA DELIBERADA DO PROTÓTIPO, registrada e não reconciliada em
   * silêncio: em `01c-oportunidade-analise.html:405` o valor deste campo é
   * "Volume líquido" — o rótulo pergunta QUAL volume serviu de base, não QUANTO
   * deu. O campo passa a nomear uma base e a mostrar o resultado; trocar o
   * rótulo para "TIR / VPL" é o conserto se o negócio quiser a leitura honesta.
   *
   * ⚠️ A fonte é `parecer.indicadores`, NUNCA a leitura ao vivo do snapshot que
   * alimenta a linha "TIR / VPL (oportunidade)" do painel Análises. O parecer é
   * um documento: os indicadores dele são congelados em `POST :gerar` e não há
   * caminho de regeneração, então um valor ao vivo aqui poderia divergir da
   * TABELA quatro linhas abaixo — dois números para o mesmo fato no mesmo card,
   * que é o defeito que `sneg-analise-shell.tsx` já corrigiu uma vez ao fazer o
   * painel e o card "Análise financeira" compartilharem UMA leitura. Lendo o
   * mesmo retrato da tabela, campo e tabela não têm como discordar.
   *
   * Medido no stage em 08/09/2026 (`PCR-RODNORD-000078/2026`): os dois valores
   * congelados coincidem com o painel (`0.8418` / `2963854.75`).
   *
   * Ausente é "—" e nunca um valor fabricado: `TIR` sozinha ou `VPL` sozinho
   * renderizam o que existe, porque perder o lado presente por causa do
   * ausente esconderia número que o parecer tem.
   */
  const baseCalculoTirVpl =
    [
      acharIndicador(indicadores, 'TIR')?.valorNegociado ?? null,
      acharIndicador(indicadores, 'VPL')?.valorNegociado ?? null,
    ]
      .map((valor, i) =>
        valor === null ? null : fmtIndicadorValor(i === 0 ? 'TIR' : 'VPL', valor),
      )
      .filter((parte): parte is string => parte !== null)
      .join(' · ') || '—';

  /*
   * The prototype's eight rows, in its order. A row the parecer does not carry
   * still renders — with "—" — because the table is the fixed set of indicators
   * the analyst reads, not a list of whatever happened to be computed.
   *
   * Empty only when the parecer has no indicator at all, which is what the
   * "Nenhum indicador consolidado disponível" state is for.
   */
  const linhasIndicadores =
    indicadores.length === 0
      ? []
      : INDICADORES_DO_PROTOTIPO.map(({ nome, rotulo }) => ({
          nome,
          rotulo,
          row: acharIndicador(indicadores, nome),
        }));

  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5" data-testid="parecer-loaded">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-(length:--t-h4) font-bold">Parecer técnico — SNEG</h2>
        <div className="flex items-center gap-3">
          {isSaved && (
            <span
              data-testid="parecer-emitido-pill"
              className="inline-flex items-center rounded-full bg-(--secondary-100) px-2.5 py-0.5 text-(length:--t-small) font-bold text-(--secondary-700)"
            >
              Emitido
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="text-(length:--t-small) text-(--color-text-muted)">Salvando…</span>
          )}
        </div>
      </div>

      {saveStatus === 'error' && (
        <p role="alert" className="mt-2 text-(length:--t-caption) text-(--color-danger)">
          Falha ao salvar a alteração. Tente novamente.
        </p>
      )}

      {/*
       * 1 — Identificação (protótipo `01c-oportunidade-analise.html` §parecer,
       * o primeiro `.pcard`).
       *
       * Somente leitura: é o snapshot que o backend congela em
       * `parecer.cabecalho` ao gerar o parecer, o mesmo que alimenta o cabeçalho
       * do PDF — nada aqui é editável, senão a tela e o documento divergiriam.
       *
       * Seis campos, os do protótipo. `cabecalho.gerenteVendas` existe e NÃO é
       * mostrado aqui de propósito: o `ParecerPdfService.buildHeader` o imprime
       * como linha própria, então o dado continua no documento emitido — mesmo
       * critério da tabela de indicadores, que também fica no recorte do desenho.
       */}
      <PCard title="Identificação" first testId="parecer-card-identificacao">
        <div className="grid grid-cols-2 gap-x-8 gap-y-[18px] max-sm:grid-cols-1">
          <KvItem
            label="Oportunidade nº"
            value={ouTraco(parecer.cabecalho?.oportunidadeNumero)}
          />
          <KvItem
            label="Tipo de negociação"
            value={ouTraco(parecer.cabecalho?.tipoNegociacao)}
          />
          <KvItem label="Posto / Rede" value={ouTraco(parecer.cabecalho?.posto)} />
          <KvItem label="Localização" value={ouTraco(parecer.cabecalho?.localizacao)} />
          <KvItem label="Regional / GV" value={ouTraco(parecer.cabecalho?.regional)} />
          <KvItem
            label="Data de emissão"
            value={
              parecer.cabecalho?.dataGeracao
                ? fmtDateOnly(parecer.cabecalho.dataGeracao)
                : '—'
            }
          />
        </div>
      </PCard>

      {/* 2 — Resumo da negociação */}
      <PCard title="Resumo da negociação" required={!readOnly} testId="parecer-card-resumo">
        <AutosizeTextarea
          id="parecer-resumo"
          value={resumoBriefing}
          placeholder="Resumo da negociação…"
          readOnly={readOnly}
          required={!readOnly}

          onChange={setResumoBriefing}
          onBlurCommit={commitResumo}
        />
      </PCard>

      {/* 3 — Volume e equalização */}
      <PCard title="Volume e equalização" testId="parecer-card-volume">
        {/*
         * Read from `parecer.indicadores`, not from `volumeEqualizacao`.
         *
         * The previous "—" placeholders claimed the backend had no saldo devedor
         * and no investimento total — it does, as indicators
         * (`Volume global bruto`, `(−) Saldo devedor volumétrico`,
         * `Volume líquido considerado`, `Investimento total`). They are the same
         * four the prototype puts in THIS card, which is why they left the
         * indicators table.
         *
         * "Base de cálculo TIR/VPL" também vem de `parecer.indicadores` desde
         * 08/09/2026 — ver o docblock de `baseCalculoTirVpl`, que registra a
         * divergência de rótulo com o protótipo.
         */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-[18px] max-sm:grid-cols-1">
          {/*
           * `withUnit` because THESE labels carry no unit, and the unit comes
           * from the backend name — never from this file. The volumes are
           * totals over the contract horizon (`m³`); the hardcoded `m³/mês`
           * that used to be appended here made the parecer contradict its own
           * indicators table by a factor of the HV (VBR-632).
           *
           * ⚠️ The fallbacks are per-row and NOT interchangeable:
           * `resumoNegociacao.volume` and `volumeEqualizacao.volumeNegociado`
           * are both the VMM (m³/MÊS), so they may only back a row whose
           * indicator is missing — and when they do, the row would be labelled
           * `m³`. Reaching them means the parecer has no volume indicators at
           * all; the name passed stays the indicator's so the unit shown is the
           * one the row is about.
           */}
          <KvItem
            label="Volume bruto contratado"
            value={fmtIndicadorValor(
              'Volume global bruto (m³)',
              acharIndicador(indicadores, 'Volume global bruto (m³)')?.valorNegociado ??
                parecer.resumoNegociacao?.volume ??
                null,
              { withUnit: true },
            )}
          />
          <KvItem
            label="Saldo devedor volumétrico"
            value={fmtIndicadorValor(
              '(−) Saldo devedor volumétrico (m³)',
              acharIndicador(indicadores, '(−) Saldo devedor volumétrico (m³)')
                ?.valorNegociado ?? null,
              { withUnit: true },
            )}
          />
          <KvItem
            label="Volume líquido considerado"
            value={fmtIndicadorValor(
              'Volume líquido considerado (m³)',
              acharIndicador(indicadores, 'Volume líquido considerado (m³)')
                ?.valorNegociado ??
                parecer.volumeEqualizacao?.volumeNegociado ??
                null,
              { withUnit: true },
            )}
          />
          <KvItem
            label="Investimento total"
            value={fmtIndicadorValor(
              'Investimento total (R$)',
              acharIndicador(indicadores, 'Investimento total (R$)')?.valorNegociado ??
                null,
              { withUnit: true },
            )}
          />
          {/* Ver `baseCalculoTirVpl` acima: rótulo do protótipo, conteúdo pedido
              pelo negócio, fonte no retrato congelado do próprio parecer. */}
          <KvItem
            label="Base de cálculo TIR/VPL"
            value={
              <span data-testid="parecer-base-calculo-tir-vpl">{baseCalculoTirVpl}</span>
            }
          />
        </div>
      </PCard>

      {/* 4 — Indicadores · negociado × referência × situação */}
      <PCard title="Indicadores · negociado × referência × situação" testId="parecer-card-indicadores">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-(--color-border) p-[7px_8px] text-left text-(length:--t-caption) font-bold uppercase text-(--color-text-muted)">
                  Indicador
                </th>
                <th className="border-b border-(--color-border) p-[7px_8px] text-left text-(length:--t-caption) font-bold uppercase text-(--color-text-muted)">
                  Negociado
                </th>
                <th className="border-b border-(--color-border) p-[7px_8px] text-left text-(length:--t-caption) font-bold uppercase text-(--color-text-muted)">
                  Referência
                </th>
                <th className="border-b border-(--color-border) p-[7px_8px] text-left text-(length:--t-caption) font-bold uppercase text-(--color-text-muted)">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {linhasIndicadores.map(({ nome, rotulo, row }, idx) => (
                <tr key={nome} data-testid={`indicador-row-${nome}`}>
                  <td
                    className={`p-2 text-(length:--t-caption) ${idx < linhasIndicadores.length - 1 ? 'border-b border-(--color-border)' : ''}`}
                  >
                    {rotulo}
                  </td>
                  <td
                    className={`p-2 text-(length:--t-caption) ${idx < linhasIndicadores.length - 1 ? 'border-b border-(--color-border)' : ''}`}
                  >
                    {fmtIndicadorValor(nome, row?.valorNegociado ?? null)}
                  </td>
                  <td
                    className={`p-2 text-(length:--t-caption) ${idx < linhasIndicadores.length - 1 ? 'border-b border-(--color-border)' : ''}`}
                  >
                    {fmtIndicadorValor(nome, row?.valorReferencia ?? null)}
                  </td>
                  <td
                    className={`p-2 text-(length:--t-caption) ${idx < linhasIndicadores.length - 1 ? 'border-b border-(--color-border)' : ''}`}
                  >
                    <SituacaoLabel situacao={row?.situacao ?? null} />
                  </td>
                </tr>
              ))}
              {linhasIndicadores.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-2 text-(length:--t-caption) italic text-(--color-text-muted)">
                    Nenhum indicador consolidado disponível.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PCard>

      {/* 5 — Franquias e garantias */}
      <PCard title="Franquias e garantias" testId="parecer-card-franquias">
        <div className="grid grid-cols-2 gap-x-8 gap-y-[18px] max-sm:grid-cols-1">
          <KvItem label="Franquia" value={parecer.franquiasGarantias?.franquia ?? '—'} />
          <KvItem label="Garantia" value={parecer.franquiasGarantias?.garantia ?? '—'} />
        </div>
      </PCard>

      {/* 6 — Aderência à política e alçada */}
      <PCard title="Aderência à política e alçada" testId="parecer-card-aderencia">
        <div className="grid grid-cols-2 gap-x-8 gap-y-[18px] max-sm:grid-cols-1">
          <KvItem
            label="Aderência"
            value={<AderenciaPill aderente={parecer.aderenciaPolitica?.aderente ?? true} />}
          />
          <KvItem
            label="Alçada sugerida"
            value={
              parecer.alcadaSugerida
                ? `${parecer.alcadaSugerida.nivel}${parecer.alcadaSugerida.descricao ? ` — ${parecer.alcadaSugerida.descricao}` : ''}`
                : '—'
            }
          />
        </div>
        {/*
         * "Marcações de aderência" — the analyst's answers.
         *
         * The trailing sentence is part of the prototype's label, in normal case:
         * it says WHY the three selects exist (they correct the alçada before the
         * opportunity reaches the Salesforce approval chain), which is the only
         * thing that distinguishes them from the read-only pill above.
         */}
        <div className="mt-3.5">
          <FieldLabel>
            Marcações de aderência
            <span className="ml-1 font-normal normal-case tracking-normal">
              · preenchidas pelo analista; corrigem a alçada antes do envio ao Salesforce
            </span>
          </FieldLabel>
          <div data-testid="parecer-marcacoes-aderencia">
            {MARCACOES_ADERENCIA.map(({ campo, rotulo }) => (
              <MarcacaoRow
                key={campo}
                id={`parecer-marcacao-${campo}`}
                rotulo={rotulo}
                value={marcacoes[campo]}
                disabled={readOnly}
                onChange={(value) => handleMarcacaoChange(campo, value)}
              />
            ))}
          </div>
        </div>

        <div className="mt-3.5">
          <FieldLabel htmlFor="parecer-analise-aderencia" required={!readOnly}>
            Análise de aderência à política comercial
          </FieldLabel>
          <AutosizeTextarea
            id="parecer-analise-aderencia"
            value={analiseAderencia}
            placeholder="Análise de aderência à política comercial…"
            readOnly={readOnly}
            required={!readOnly}

            onChange={setAnaliseAderencia}
            onBlurCommit={commitAnaliseAderencia}
          />
        </div>

        <div className="mt-3.5">
          <FieldLabel htmlFor="parecer-justificativa-alcada" required={!readOnly}>
            Justificativa da alçada / exceções
          </FieldLabel>
          <AutosizeTextarea
            id="parecer-justificativa-alcada"
            value={justificativaAlcada}
            placeholder="Justificativa da alçada / exceções…"
            readOnly={readOnly}
            required={!readOnly}

            onChange={setJustificativaAlcada}
            onBlurCommit={commitJustificativaAlcada}
          />
        </div>
      </PCard>

      {/* 7 — Recomendação */}
      <PCard title="Recomendação" testId="parecer-card-recomendacao">
        <FieldLabel htmlFor="parecer-nota" required={!readOnly}>
          Nota do analista
        </FieldLabel>
        <Select
          id="parecer-nota"
          value={recomendacaoNota}
          required={!readOnly}
          disabled={readOnly}
          onChange={(v) => handleNotaChange(v as ParecerRecomendacaoNota)}
          options={[
            { value: 'aprovar', label: 'Aprovar' },
            { value: 'ajustar', label: 'Ajustar' },
            { value: 'devolver', label: 'Devolver' },
          ]}
          /*
           * `bottom-border` (the default) is the prototype's `.in`: `--neutral-40`
           * fill, no border except a 2px `--neutral-600` bottom one, square
           * corners. `boxed` drew the full rounded white box — the same mismatch
           * the textareas in this panel had.
           */
          className="mb-3.5 max-w-[280px]"
        />

        <FieldLabel htmlFor="parecer-executivo" required={!readOnly}>
          Parecer executivo
        </FieldLabel>
        <AutosizeTextarea
          id="parecer-executivo"
          value={parecerExecutivo}
          placeholder="Parecer executivo…"
          readOnly={readOnly}
          required={!readOnly}

          onChange={setParecerExecutivo}
          onBlurCommit={() => commitRecomendacao(recomendacaoNota, parecerExecutivo)}
        />
      </PCard>

      {/* 8 — Pontos de atenção */}
      <PCard title="Pontos de atenção" required={!readOnly} testId="parecer-card-pontos-atencao">
        <AutosizeTextarea
          id="parecer-pontos-atencao"
          value={pontosAtencao}
          placeholder="Pontos de atenção…"
          readOnly={readOnly}
          required={!readOnly}

          onChange={setPontosAtencao}
          onBlurCommit={commitPontosAtencao}
        />
      </PCard>

      {/*
       * 9 — Outras informações.
       *
       * Bloco separado de "Pontos de atenção" de propósito: aquele sinaliza
       * RISCO ao aprovador, este é contexto. O PDF os imprime em linhas
       * distintas pela mesma razão — juntá-los faria uma observação neutra
       * chegar ao aprovador com o peso de um alerta.
       */}
      <PCard
        title="Outras informações"
        required={!readOnly}
        testId="parecer-card-outras-informacoes"
      >
        <AutosizeTextarea
          id="parecer-outras-informacoes"
          value={outrasInformacoes}
          placeholder="Observações complementares do analista…"
          readOnly={readOnly}
          required={!readOnly}

          onChange={setOutrasInformacoes}
          onBlurCommit={commitOutrasInformacoes}
        />
      </PCard>

      {/*
       * Ações + rodapé. A dica de pendências obrigatórias é dirigida a quem vai
       * salvar o parecer — em leitura ela descreveria uma trava que não é de
       * quem está olhando.
       */}
      {!readOnly && (
        <div className="mt-4">
          <PendenciasObrigatoriasHint total={pendenciasObrigatoriasAbertas} />
        </div>
      )}
      {/*
       * ⚠️ O `mt-4` é da LINHA DE AÇÕES, não do bloco da dica (16/09/2026). A
       * dica só aparece fora do modo leitura, então ela não pode ser a fonte do
       * respiro: em leitura — o estado do print do chamado — sobrava só
       * "Exportar PDF", colado na borda do card "OUTRAS INFORMAÇÕES". Com a
       * margem aqui os dois casos ficam certos (card → dica → botões).
       */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/*
         * "Salvar" — the prototype's action, which is our EMISSION
         * (`POST .../parecer/emitir`). Field edits already persist on blur, so
         * this button is not an autosave: it registers the current version as
         * definitive and releases the approval trava (RN-F7-01 / A06) — the rule
         * "só depois de salvar libera para aprovação".
         *
         * It stays ENABLED after the save, and the fields stay editable: the
         * window is the OPPORTUNITY still being under analysis, not the parecer's
         * own status. Locking on the first save left an analyst who spotted a
         * typo with no way out — could not edit, could not save again. Each save
         * appends a version to the history (RN-F5-02); the backend closes the
         * window with a 400 once the opportunity leaves EM_ANALISE.
         */}
        {/*
         * Em leitura o botão SOME — não fica desabilitado. Um "Salvar" inerte
         * é controle morto e ainda sugeriria que a pessoa poderia salvar se
         * algo mudasse, quando o que falta é autoridade, não pré-condição.
         */}
        {!readOnly && (
          <button
            type="button"
            data-testid="parecer-emitir"
            onClick={() => setConfirmEmitOpen(true)}
            disabled={emitStatus === 'emitting' || generateStatus === 'generating'}
            className="cursor-pointer rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {emitStatus === 'emitting' ? 'Salvando…' : 'Salvar'}
          </button>
        )}

        {/*
         * Exportar PDF is gated on the save. Rendered as a disabled <button>
         * (not an <a>) while the parecer is a draft: an anchor cannot be
         * disabled, and one that looks inert but still navigates would export a
         * document the analyst has not committed to. The `title` says WHAT IS
         * MISSING, never "go do it elsewhere".
         */}
        {isSaved ? (
          <a
            href={parecerPdfUrl(opportunityId)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="parecer-export-pdf"
            className="cursor-pointer rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50)"
          >
            Exportar PDF
          </a>
        ) : (
          <button
            type="button"
            disabled
            data-testid="parecer-export-pdf"
            title="Salve o parecer para liberar a exportação em PDF."
            className="cursor-not-allowed rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--color-text-muted) opacity-60"
          >
            Exportar PDF
          </button>
        )}
      </div>

      {generateStatus === 'error' && (
        <p role="alert" className="mt-2 text-(length:--t-caption) text-(--color-danger)">
          Falha ao gerar o parecer técnico. Tente novamente.
        </p>
      )}

      {emitStatus === 'error' && (
        <p
          role="alert"
          data-testid="parecer-emit-error"
          className="mt-2 text-(length:--t-caption) text-(--color-danger)"
        >
          {emitError ?? 'Falha ao salvar o parecer técnico. Tente novamente.'}
        </p>
      )}

      {confirmEmitOpen && (
        <EmitConfirmModal
          submitting={emitStatus === 'emitting'}
          onConfirm={() => void runEmit()}
          onClose={() => setConfirmEmitOpen(false)}
        />
      )}
    </div>
  );
}
