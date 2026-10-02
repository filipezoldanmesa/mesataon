'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { IN_FIELD, IN_LABEL } from '@/components/ui/field-classes';
import { useDirectorySearch } from '@/hooks/use-directory-search';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';

type Props = {
  /** Título do cabeçalho (`h4`). */
  title: string;
  /** Subtítulo — o recorte de onde se escolhe, e/ou a gerência em jogo. */
  subtitle: string;
  /** Id já selecionado ao abrir (o analista atual da gerência), se houver. */
  initialSelectedId?: string | null;
  /** Rodapé abaixo da lista — motivo, avisos e os botões do ato. */
  footer: (selected: DirectoryUser | null) => ReactNode;
  /** Busca de candidatos no recorte da tela (injetável nos testes). */
  search: (query: string) => Promise<DirectoryUser[]>;
  onClose: () => void;
  /**
   * Como a tela CHAMA quem está sendo escolhido.
   *
   * ⚠️ Existe porque o modal não escolhe só analista: o roteamento de franquia
   * escolhe **executivo**, e "Buscar analista" ali contradizia o título do
   * próprio modal ("Editar executivo de franquia"), dentro da mesma caixa. O
   * default mantém as duas telas de Distribuição (SNEG e CCOB) intactas.
   */
  pessoa?: { singular: string; plural: string };
};

/**
 * Seletor de analista SNEG das ações da Governança (Editar / Reatribuir).
 *
 * **Lista, não caixa de busca.** O grupo de perfil é pequeno e é a população
 * inteira que interessa, então a lista carrega ao ABRIR com termo vazio e a
 * digitação só filtra — foi o pedido explícito do ADO 67877 sobre o seletor
 * irmão da reatribuição por oportunidade (*"deveria trazer uma lista das
 * pessoas disponíveis para seleção"*).
 *
 * **Vazio é NOMEADO.** O recorte pode legitimamente não ter ninguém, e aí a
 * lista vem vazia com tudo funcionando — um espaço em branco leria como defeito
 * da tela.
 *
 * O rodapé é responsabilidade do chamador porque os dois atos desta tela não
 * terminam do mesmo jeito: "Editar" confirma direto e "Reatribuir" precisa
 * dizer, antes, quantas oportunidades vai mexer.
 */
export function AnalistaPickerModal({
  title,
  subtitle,
  initialSelectedId = null,
  footer,
  search,
  onClose,
  pessoa = { singular: 'analista', plural: 'analistas' },
}: Props) {
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const { status, results, error, permanent, runSearch } = useDirectorySearch(
    search,
    { searchesEmptyTerm: true },
  );

  // Carrega ao abrir e a cada termo, com debounce — sem botão "Buscar", que era
  // o desenho antigo desta família de seletores.
  useEffect(() => {
    const id = setTimeout(() => void runSearch(term), term === '' ? 0 : 250);
    return () => clearTimeout(id);
  }, [term, runSearch]);

  // Fecha no Escape.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} · ${subtitle}`}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface) shadow-[0_20px_50px_rgba(0,0,0,.3)]">
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-5 py-[18px]">
          <div>
            <h4 className="text-(length:--t-h4) font-bold">{title}</h4>
            <p className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4">
          {/*
           * Campo `.in` do DS ({@link IN_FIELD}), com rótulo `label.f` — o mesmo
           * par dos modais da proposta de franquia e das telas de
           * parametrização.
           *
           * ⚠️ **Desvio deliberado do protótipo.** `01a-nova-oportunidade.html`
           * tem uma classe SÓ para esta caixa (`.modal-search`: borda de 1px,
           * `radius-xs`), e é ela que o "Adicionar membro" reproduz. Aqui vale o
           * pedido do negócio de 27/08/2026 — o campo destoava dos demais
           * inputs de modal —, e o `field-classes.ts` já registra a caixa
           * arredondada como a deriva que VBR-649/VBR-650 existem para desfazer.
           * Se um dia o "Adicionar membro" for alinhado, é para cá que ele vem.
           */}
          <label htmlFor="analista-picker-busca" className={IN_LABEL}>
            Buscar {pessoa.singular}
          </label>
          <input
            id="analista-picker-busca"
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="analista-picker-listbox"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={`Nome ou e-mail do ${pessoa.singular}`}
            className={IN_FIELD}
          />

          <div className="mt-3 max-h-[280px] overflow-y-auto">
            {status === 'loading' && (
              <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
                Carregando {pessoa.plural}…
              </p>
            )}

            {status === 'error' && (
              <div className="py-4 text-center">
                <p className="text-(length:--t-caption) text-(--color-danger)">
                  {error}
                </p>
                {/* Lacuna permanente não ganha "tentar de novo": um controle que
                    não pode dar certo é controle morto. */}
                {!permanent && (
                  <button
                    type="button"
                    onClick={() => void runSearch(term)}
                    className="mt-2 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}

            {status === 'loaded' && results.length === 0 && (
              <p
                data-testid="analista-picker-vazio"
                className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)"
              >
                {/*
                  ⚠️ Sem o "SNEG" que estava chumbado aqui: o mesmo modal serve
                  a CCOB e ao roteamento de franquia, e o recorte é nomeado pelo
                  SUBTÍTULO da caixa, que já diz de qual grupo se trata.
                */}
                Nenhum {pessoa.singular} no grupo de acesso. Verifique com a TI.
              </p>
            )}

            {status === 'loaded' && results.length > 0 && (
              <ul
                id="analista-picker-listbox"
                role="listbox"
                data-testid="analista-picker-lista"
                className="space-y-1"
              >
                {results.map((user) => {
                  const isSelected =
                    selected?.id === user.id ||
                    (selected === null && user.id === initialSelectedId);
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        aria-selected={isSelected}
                        role="option"
                        onClick={() => setSelected(user)}
                        className={`w-full rounded-[var(--radius-xs)] border px-3 py-2 text-left ${
                          isSelected
                            ? 'border-(--secondary-500) bg-(--secondary-100)'
                            : 'border-(--color-border) bg-(--color-surface) hover:bg-(--neutral-25)'
                        }`}
                      >
                        <span className="block text-(length:--t-caption) font-bold">
                          {user.name}
                        </span>
                        <span className="block text-(length:--t-small) text-(--color-text-muted)">
                          {user.email ?? user.detail ?? '—'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-(--color-border) px-5 py-4">
          {footer(selected)}
        </div>
      </div>
    </div>
  );
}
