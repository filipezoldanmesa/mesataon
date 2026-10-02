'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { IN_FIELD, IN_LABEL } from '@/components/ui/field-classes';
import { useDirectorySearch } from '@/hooks/use-directory-search';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';

const DEBOUNCE_MS = 300;

/** Derive 2-letter initials from a full name. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

type Props = {
  /** Directory search function — a module function or memoized callback. */
  search: (query: string) => Promise<DirectoryUser[]>;
  /** Called when the user picks a collaborator. */
  onPick: (user: DirectoryUser) => void;
  /** Ids already taken (excluded from results). */
  excludedUserIds?: string[];
  /**
   * Lists on mount, without requiring a term.
   *
   * `true` for a scoped population (a team bucket, an access-profile group):
   * it is small, governed by IAM, and listing it whole is the useful answer.
   * `false` for the general population, where an empty box means "nothing yet".
   */
  autoLoad?: boolean;
  /** Action label rendered at the end of each row. */
  ctaLabel?: string;
  /**
   * Row currently chosen — highlights it and keeps it visible while the user
   * fills in whatever else the action needs (the reatribuição's motivo).
   *
   * Absent ⇒ no selected state at all: the picker acts on click and there is
   * nothing to remember (the "Adicionar à equipe" case).
   */
  selectedId?: string | null;
  placeholder?: string;
  inputAriaLabel?: string;
  /** Sentence for "the scope resolved and holds nobody". */
  emptyScopeMessage?: string;
  /** Test ids, so a call site can keep the hooks its own suite already uses. */
  listTestId?: string;
  emptyTestId?: string;
  /** Focus the search box on mount (a modal does; an inline picker may not). */
  autoFocus?: boolean;
};

/**
 * The collaborator picker — search box, the four async states, and the result
 * list — shared by every screen that chooses a person from the directory.
 *
 * ## Por que é um componente só (ADO 67877)
 *
 * O modal "Adicionar à equipe" / "Trocar LT principal" já tinha este desenho
 * (protótipo `01a-nova-oportunidade.html:219-227` — `modal-search` + lista com
 * avatar, nome e subtítulo), e a **reatribuição do analista SNEG** tinha uma
 * caixa de busca escrita à mão, com botão "Buscar" e nenhum estado de carga:
 * na mesma jornada, duas maneiras diferentes de escolher uma pessoa. O relator
 * do bug pediu literalmente *"uma lista das pessoas disponíveis para seleção"*.
 *
 * Extraído em vez de copiado porque as duas listas divergiriam — foi assim que
 * a de reatribuição ficou sem debounce, sem estado de carregamento e sem
 * distinguir "grupo vazio" de "fonte caiu".
 *
 * Nada aqui sabe QUAL população está sendo lida: o recorte é propriedade da
 * função `search` que o chamador injeta (`searchTeamCandidates`,
 * `searchLtCandidates`, `searchSnegAnalysts`), e é ela que fixa o eixo de
 * driver correto.
 */
export function DirectoryUserList({
  search,
  onPick,
  excludedUserIds = [],
  autoLoad = false,
  ctaLabel = '+ Adicionar',
  selectedId = null,
  placeholder = 'Buscar colaborador na base...',
  inputAriaLabel = 'Buscar colaborador na base',
  emptyScopeMessage = 'Nenhum colaborador neste grupo.',
  listTestId,
  emptyTestId,
  autoFocus = true,
}: Props) {
  const reactId = useId();
  const listId = `${reactId}-list`;
  const inputId = `${reactId}-input`;
  const [query, setQuery] = useState('');
  const { status, results, error, permanent, runSearch, reset } =
    useDirectorySearch(search, { searchesEmptyTerm: autoLoad });
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input on mount.
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  /*
   * Debounced search — e também a carga inicial: no primeiro render `query` é
   * vazia, então um escopo com `autoLoad` já dispara aqui. Sem debounce nesse
   * caso: esperar 300ms para pintar a lista de abertura seria latência sem
   * motivo (não há tecla a agrupar).
   */
  useEffect(() => {
    const term = query.trim();
    if (term === '' && !autoLoad) {
      reset();
      return;
    }
    const timer = setTimeout(
      () => void runSearch(term),
      term === '' ? 0 : DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query, runSearch, reset, autoLoad]);

  const visible = results.filter((u) => !excludedUserIds.includes(u.id));

  return (
    <>
      {/*
       * Campo `.in` do DS ({@link IN_FIELD}) com rótulo `label.f` — o mesmo par
       * dos modais da proposta de franquia, das telas de parametrização e do
       * seletor de analista da Governança.
       *
       * ⚠️ **Desvio deliberado do protótipo.** `01a-nova-oportunidade.html`
       * tem uma classe só para esta caixa (`.modal-search`: borda de 1px,
       * `radius-xs`, sem preenchimento), e era ela que este componente
       * reproduzia. O negócio pediu o campo do DS nos DOIS seletores de
       * colaborador (27/08/2026), e `field-classes.ts` já registra a caixa
       * arredondada como a deriva que VBR-649/VBR-650 existem para desfazer.
       *
       * O estilo vive AQUI, e não no chamador, porque este componente é o
       * ponto único dos dois seletores (ADO 67877): estilizar um call site
       * devolveria a divergência que a extração acabou de eliminar.
       */}
      <label htmlFor={inputId} className={IN_LABEL}>
        {inputAriaLabel}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={status === 'loaded' && visible.length > 0}
        aria-controls={listId}
        /*
         * `aria-label` PERMANECE ao lado do rótulo visível: o nome acessível do
         * combobox é contrato — várias suítes o consultam por
         * `getByRole('combobox', { name: ... })` — e o texto é o mesmo, então
         * não há divergência entre o que se vê e o que se anuncia.
         */
        aria-label={inputAriaLabel}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={`${IN_FIELD} mb-3`}
      />

      {/* States */}
      {status === 'idle' && (
        <p className="py-3 text-center text-(length:--t-caption) text-(--color-text-muted)">
          Digite para buscar colaboradores.
        </p>
      )}

      {status === 'loading' && (
        <p
          role="status"
          aria-live="polite"
          className="py-3 text-center text-(length:--t-small) text-(--color-text-muted)"
        >
          Buscando…
        </p>
      )}

      {status === 'error' && (
        <div className="py-3 text-center">
          <p className="text-(length:--t-small) text-(--color-danger)">{error}</p>
          {/*
            A permanent gap (the Entra group behind this scope has no object id
            yet) offers no retry: a button that can never succeed is a dead
            control, and the sentence already names what has to be created.
            ADR-0043 §6.
          */}
          {!permanent && (
            <button
              type="button"
              onClick={() => void runSearch(query)}
              className="mt-1 cursor-pointer text-(length:--t-small) font-bold text-(--secondary-600) hover:underline"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {status === 'loaded' && visible.length === 0 && (
        <p
          data-testid={emptyTestId}
          className="py-3 text-center text-(length:--t-caption) text-(--color-text-muted)"
        >
          {query.trim() === '' ? (
            // Sem termo, a lista É o grupo — interpolar a query vazia
            // renderizaria `encontrado para ""`.
            <>{emptyScopeMessage}</>
          ) : (
            <>Nenhum colaborador encontrado para &ldquo;{query}&rdquo;.</>
          )}
        </p>
      )}

      {status === 'loaded' && visible.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Resultados"
          data-testid={listTestId}
        >
          {visible.map((user) => {
            const selected = selectedId === user.id;

            return (
              <li key={user.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onPick(user)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2.5 text-left ${
                    selected
                      ? 'bg-(--secondary-100)'
                      : 'hover:bg-(--secondary-100)'
                  }`}
                >
                  {/* Avatar */}
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--secondary-300) text-[12px] font-bold text-(--secondary-800)"
                  >
                    {initials(user.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
                      {user.name}
                    </div>
                    <div className="text-(length:--t-small) text-(--color-text-muted)">
                      {user.detail}
                    </div>
                  </div>
                  <span className="shrink-0 text-(length:--t-caption) font-bold text-(--secondary-600)">
                    {selected ? '✓ Selecionado' : ctaLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
