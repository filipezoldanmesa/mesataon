'use client';

import { Select } from '@/components/ui/select';
import { usePicklist, type UsePicklistOptions } from '@/hooks/use-picklist';
import type { PicklistField } from '@/lib/picklists/picklists.types';

export interface PicklistSelectProps extends UsePicklistOptions {
  id?: string;
  /** The picklist to render. */
  field: PicklistField;
  /**
   * Value currently selected in the CONTROLLING picklist, for a dependent field.
   * Changing it reloads the options.
   */
  controllingValue?: string | null;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Applied to the outer wrapper — use for layout/width overrides only. */
  className?: string;
  'data-testid'?: string;
  /** Placeholder for the empty option. */
  placeholder?: string;
  /**
   * Label of the controlling field, used in the hint shown while it is
   * unanswered ("Selecione Tipo de proposta primeiro"). Without it the disabled
   * select gives the user nothing to act on.
   */
  controllingLabel?: string;
  /**
   * Narrows the catalog's options to this set of API names — for a business rule
   * that is STRICTER than the CRM's own dependency matrix (e.g. RN-F3-02, which
   * allows only two of the six contract types Salesforce enables for a `PCR`
   * proposal).
   *
   * It filters what is OFFERED; it never adds a value the catalog did not
   * return, so a rule can only ever be tightened here, never loosened past what
   * the CRM would accept. Trimming the catalog itself is not an option: it is a
   * verbatim transcription of Vibra's picklist document (the parity spec fails
   * the build on divergence) and the other values stay valid for API writes.
   *
   * A value ALREADY CHOSEN survives this list — see the filtering below.
   *
   * Omit it — do NOT pass `[]` — when there is no extra restriction.
   */
  allow?: readonly string[];
  /**
   * Predicate form of the same narrowing, for a subset that is COMPUTED rather
   * than enumerable — e.g. the SAP payment-term codes whose day-count is
   * derivable, which are matched by family (`Z\d{3}`, `ZB\d{2}`, `V\d{3}`, …)
   * across a 316-value set:
   *
   *   `filter={(value) => deriveDaysFromSapCode(value) !== null}`
   *
   * Listing those by hand would materialise hundreds of codes and re-drift every
   * time Vibra edits the value set — exactly what reading the catalog prevents.
   *
   * ⚠️ It differs from `allow` in more than shape, so they are NOT
   * interchangeable: `filter` is ABSOLUTE — a value that fails it is never
   * offered, not even one already persisted. That is deliberate where the stored
   * value would otherwise be unusable: with the manual "Prazo pgto (dias)" field
   * gone, a legacy non-derivable code left selected would leave the form with no
   * day-count at all, so the user must re-pick (VBR-480, Opção B). Use `allow`
   * when a persisted value must stay VISIBLE (dropping it reads as "não
   * respondido" while the saved answer is something else); use `filter` when it
   * must stay UNSELECTABLE.
   */
  filter?: (value: string) => boolean;
  /**
   * Sentence shown under the select when the CRM publishes no dependent value
   * for the chosen controlling value (`SEM_VALOR_PUBLICADO`). The full list is
   * offered in that case, so without this note the user cannot tell a filtered
   * list from an unfiltered one. Omit it and the gap is silent.
   */
  noPublishedValuesNote?: string;
  /**
   * Rótulo de uma opção explícita de AUSÊNCIA — ex. `"Nenhum"` na Utilização da
   * garantia (26/08/2026).
   *
   * ⚠️ **Não é exceção à regra de nunca acrescentar valor ao catálogo.** O que
   * ela acrescenta é o vazio (`value: ''`), que é a ausência de escolha, não um
   * API name novo — a picklist do org continua sendo a única fonte dos valores.
   * Só use quando o campo for `nillable` LÁ: oferecer "Nenhum" num campo
   * obrigatório do CRM produziria uma escolha que a escrita recusa depois.
   *
   * Diferente do `clearable` do {@link Select}, que rotula o vazio com o
   * PLACEHOLDER e mantém o gatilho no tom de "não respondido" — certo para um
   * filtro ("sem filtro" ≠ "filtro ativo"), errado aqui: "Nenhum" é resposta, e
   * o gatilho precisa dizê-la em vez de continuar lendo "Selecione…". Por isso
   * entra em `options`, onde `selectedOption` a encontra.
   *
   * Vem PRIMEIRO na lista, antes dos valores do catálogo: é a escolha que zera,
   * e enterrá-la no fim de um value set longo a esconderia.
   */
  emptyOptionLabel?: string;
}

/**
 * A dropdown whose options come from the backend's Salesforce picklist catalog.
 *
 * Wraps the DS `Select` component (vibra-dropdown.js fidelity) and adds three
 * states the caller does not have to handle:
 *   - **loading** — disabled with a "Carregando…" placeholder.
 *   - **awaiting controller** — disabled, naming the field to answer first.
 *   - **error** — disabled select + a "Tentar novamente" retry button.
 */
export function PicklistSelect({
  id,
  field,
  controllingValue,
  value,
  onChange,
  required,
  disabled,
  className,
  placeholder = 'Selecione…',
  controllingLabel,
  allow,
  fetchOptions,
  filter,
  noPublishedValuesNote,
  emptyOptionLabel,
  ...rest
}: PicklistSelectProps) {
  const {
    status,
    options: catalogOptions,
    awaitingController,
    noPublishedValues,
    reload,
  } = usePicklist(field, controllingValue, { fetchOptions });

  /*
   * One narrowing stage for both props — neither can ever add a value the
   * catalog did not return.
   *
   * `filter` is absolute: whatever fails it is unselectable, including a value
   * already persisted (VBR-480 — a legacy payment-term code with no derivable
   * day-count must be re-picked, not silently kept).
   *
   * `allow`, in contrast, spares the value already chosen. A saved draft (or a
   * row written before the rule tightened) can carry a value the rule no longer
   * offers; dropping it would leave the select on the placeholder, which reads
   * as "não respondido" while the persisted answer is something else entirely.
   * It is spared only if the CATALOG still returns it — never resurrected from
   * thin air.
   */
  const narrowed = catalogOptions.filter((option) => {
    if (filter && !filter(option.value)) return false;
    if (!allow) return true;
    return allow.includes(option.value) || option.value === value;
  });

  /*
   * A persisted value the CATALOG no longer returns is still shown. This is the
   * dependency case: a row written before a `valueSettings` matrix was measured
   * can hold a controller→dependent pair the filtered list now excludes (the
   * `Etapa_Da_Liberacao__c` rows written while the matrix was unmapped are
   * exactly that). Dropping it leaves the select on the placeholder, which reads
   * as "não respondido" while the stored answer is something else.
   *
   * `filter` still wins — it is absolute by contract (VBR-480): a value it
   * rejects must be re-picked, not preserved. Nothing is invented while the
   * options are still loading, or the value would flash and disappear. The
   * label falls back to the API name: the catalog did not return this value, so
   * its Salesforce label is not available on this path.
   */
  const keepsPersisted =
    status === 'loaded' &&
    value !== '' &&
    !narrowed.some((option) => option.value === value) &&
    (!filter || filter(value));

  const withPersisted = keepsPersisted
    ? [...narrowed, { value, label: value, isDefault: false }]
    : narrowed;

  /*
   * A opção de ausência só entra DEPOIS de o catálogo carregar: durante o
   * `loading` o select está desabilitado com "Carregando…", e oferecer "Nenhum"
   * ali deixaria escolher enquanto as outras opções ainda não existem.
   */
  const options =
    emptyOptionLabel !== undefined && status === 'loaded'
      ? [{ value: '', label: emptyOptionLabel, isDefault: false }, ...withPersisted]
      : withPersisted;

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <Select
          id={id}
          value=""
          onChange={() => {}}
          options={[]}
          placeholder="Opções indisponíveis"
          disabled
          data-testid={rest['data-testid']}
          className="flex-1"
        />
        <button
          type="button"
          onClick={reload}
          className="text-(length:--t-caption) font-bold text-(--color-info) underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const isLoading = status === 'loading';
  const emptyLabel = isLoading
    ? 'Carregando…'
    : awaitingController
      ? `Selecione ${controllingLabel ?? 'o campo anterior'} primeiro`
      : placeholder;

  const select = (
    <Select
      id={id}
      data-testid={rest['data-testid']}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={emptyLabel}
      required={required}
      disabled={disabled || isLoading || awaitingController}
      className={className}
    />
  );

  if (!noPublishedValues || !noPublishedValuesNote) return select;

  return (
    <>
      {select}
      {/* Attention, not danger: nothing failed — the CRM simply maps no value
          to this controlling value, and the user can still pick. */}
      <p
        data-testid={rest['data-testid'] ? `${rest['data-testid']}-sem-valor` : undefined}
        className="mt-1 text-(length:--t-small) text-(--yellow-700)"
      >
        {noPublishedValuesNote}
      </p>
    </>
  );
}
