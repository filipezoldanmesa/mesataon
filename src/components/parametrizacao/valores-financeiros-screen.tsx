'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  LINK_ACTION,
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { ToastContainer, useToast } from '@/components/toast';
import { Select } from '@/components/ui/select';
import { maskMoneyInput, parseMoneyInput } from '@/lib/franquia/format';
import {
  listValoresParametrizados as defaultList,
  updateValorParametrizado as defaultUpdate,
} from '@/lib/parametrizacao/financial-item-types.data';
import type {
  ColunaValor,
  ValorParametrizadoPayload,
  ValorParametrizadoRow,
  ValoresParametrizadosPage,
} from '@/lib/parametrizacao/financial-item-types.types';
import { COLUNAS_VALOR } from '@/lib/parametrizacao/financial-item-types.types';
import { VoltarParaGovernanca } from '@/components/governanca/voltar-para-governanca';

type Props = {
  listValoresParametrizados?: (tipoProposta?: string) => Promise<ValoresParametrizadosPage>;
  updateValorParametrizado?: (
    id: string,
    payload: ValorParametrizadoPayload,
  ) => Promise<ValorParametrizadoRow>;
};

type LoadStatus = 'loading' | 'loaded' | 'error';

/** Families the catalogue is seeded for. Empty = todas. */
const FAMILIAS = [
  { value: '', label: 'Todas' },
  { value: 'PCR', label: 'PCR — posto' },
  { value: 'ZBRM', label: 'ZBRM — BR Mania' },
  { value: 'ZLUB', label: 'ZLUB — Lubrax+' },
];

const CATEGORIA_LABEL: Record<string, string> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
};

const inputCls =
  'w-full rounded-[var(--radius-xs)] border border-(--color-border) px-2 py-1.5 text-(length:--t-caption) font-[inherit] disabled:opacity-60';
/*
 * ⚠️ Os botões vêm de `components/button`, NUNCA escritos à mão aqui.
 *
 * Esta tela tinha duas constantes próprias, e elas divergiam do protótipo em
 * cinco pontos de uma vez (`vibra-ui.css`, `.btn` / `.btn-ghost` /
 * `.btn-primary`): borda e texto CINZA onde o `.btn-ghost` é **verde**
 * (`#418020` = `--secondary-500`), fundo branco onde ele é `#f9f9f9`
 * (`--neutral-25`), padding 12/6px onde ele é **16/9px**, `hover` em
 * `--secondary-600` (`#326517`) onde o `.btn-primary:hover` é `#3c781e`
 * (`--secondary-hover`) — e **sem `focus-visible` nenhum**, que é acessibilidade
 * e não estética. Reportado por print em 08/09/2026: *"Fontes, cor (botão) etc
 * está de acordo com protótipo e design system? Não parece."*
 *
 * `SECONDARY_OUTLINE_BTN` e `PRIMARY_ACTION_BTN` existem exatamente para isto —
 * o docblock delas diz "so screens stop hand-rolling".
 */
const ghostBtnCls = SECONDARY_OUTLINE_BTN;
const primaryBtnCls = PRIMARY_ACTION_BTN;

/** O "Editar" de cada linha — o `.lnk` do protótipo. Ver `LINK_ACTION`. */
const linkActionCls = LINK_ACTION;
const thCls =
  'border-b border-(--color-border) px-2 py-[7px] text-left text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)';
const tdCls = 'border-b border-(--color-border) p-2 align-top';

/** The six amount fields, as the form holds them: masked pt-BR strings. */
type FormValues = Record<ColunaValor, string> & { descricao: string };

/** `1234.5` → `"1.234,50"`; `null` → `""`. */
function toMasked(value: number | null): string {
  if (value === null) return '';
  return maskMoneyInput(value.toFixed(2).replace('.', ''));
}

function formValuesFor(row: ValorParametrizadoRow): FormValues {
  return {
    defaultValor: toMasked(row.defaultValor),
    defaultValorVrod: toMasked(row.defaultValorVrod),
    defaultValorVreg1: toMasked(row.defaultValorVreg1),
    defaultValorVreg2: toMasked(row.defaultValorVreg2),
    defaultValorVreg3: toMasked(row.defaultValorVreg3),
    defaultValorVreg4: toMasked(row.defaultValorVreg4),
    descricao: row.descricao ?? '',
  };
}

/**
 * Only what the user actually moved.
 *
 * Two reasons this is a diff and not a full body. The contract says an omitted
 * key preserves the stored value, so sending everything would rewrite untouched
 * columns for no reason. And the mask carries two decimals while the column is
 * `numeric(14,4)` — a value that ever gets a third decimal would be silently
 * rounded on save by a field nobody edited.
 */
export function buildPayload(row: ValorParametrizadoRow, values: FormValues): ValorParametrizadoPayload {
  const original = formValuesFor(row);
  const payload: ValorParametrizadoPayload = {};

  for (const { key } of COLUNAS_VALOR) {
    if (values[key] !== original[key]) {
      // Empty field clears the amount: "esta região não é precificada".
      // Never `0` — a zero on a money field reads as a price.
      payload[key] = parseMoneyInput(values[key]);
    }
  }

  if (values.descricao !== original.descricao) {
    payload.descricao = values.descricao.trim() === '' ? null : values.descricao.trim();
  }

  return payload;
}

function Flags({ row }: { row: ValorParametrizadoRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {row.cataloguePriced && (
        <span
          className="rounded-full bg-(--neutral-50) px-2 py-[2px] text-[11px] font-bold text-(--color-text-muted)"
          title="O valor abre somente leitura na proposta."
        >
          Valor parametrizado
        </span>
      )}
      {row.obrigatoria && (
        <span
          className="rounded-full bg-(--neutral-50) px-2 py-[2px] text-[11px] font-bold text-(--color-text-muted)"
          title="Criado automaticamente em toda proposta."
        >
          Obrigatório
        </span>
      )}
      {!row.selectable && (
        <span
          className="rounded-full bg-(--neutral-50) px-2 py-[2px] text-[11px] font-bold text-(--color-text-muted)"
          title="Não é oferecido no seletor de novo item, mas segue referenciado por itens já lançados."
        >
          Oculto
        </span>
      )}
    </span>
  );
}

/**
 * Parametrization of the "Parâmetros da Oportunidade" amounts — Receitas &
 * Despesas (PRD F9 §7.9 / RN-F9-02; Bug ADO 67585 / VBR-595).
 *
 * These six columns are the single source of the amount the proposal quotes:
 * `resolveValorRegional` picks one of them from the account's sales office, and
 * for a type flagged "Valor parametrizado" the proposal renders it read-only.
 * Until this screen existed, changing any of them meant a migration — which is
 * what the bug is named after ("Atualização dos Valores_Parametrizado").
 *
 * Access: `RequirePermission(FinancialItemTypeParametrizacaoManage)` in the
 * parent — BP Financeiro and TI Administrador, the two profiles the business
 * named. Reading is gated too, by the API, and the 403 passes through.
 *
 * A row is never created or deleted here: the type domain mirrors
 * `Parametros_Da_Oportunidade__c` and comes from the catalogue seed. What this
 * screen owns is the price.
 */
export function ValoresFinanceirosScreen({
  listValoresParametrizados = defaultList,
  updateValorParametrizado = defaultUpdate,
}: Props) {
  const { toasts, addToast, removeToast } = useToast();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<ValorParametrizadoRow[]>([]);
  const [familia, setFamilia] = useState('PCR');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setStatus('loading');
    listValoresParametrizados(familia === '' ? undefined : familia)
      .then((data) => {
        setItems(data.items);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listValoresParametrizados, familia]);

  useEffect(() => {
    reload();
  }, [reload]);

  const editing = useMemo(
    () => items.find((i) => i.id === editingId) ?? null,
    [items, editingId],
  );

  function startEdit(row: ValorParametrizadoRow) {
    setEditingId(row.id);
    setValues(formValuesFor(row));
  }

  function cancelEdit() {
    setEditingId(null);
    setValues(null);
  }

  async function save() {
    if (!editing || !values) return;

    const payload = buildPayload(editing, values);
    if (Object.keys(payload).length === 0) {
      cancelEdit();
      return;
    }

    setBusy(true);
    try {
      const saved = await updateValorParametrizado(editing.id, payload);
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
      addToast(`Valores de "${saved.descricao ?? saved.nome}" atualizados.`, 'success');
      cancelEdit();
    } catch (err) {
      // The API message is the one that names what went wrong — keep the row in
      // edit mode so the typed numbers are not lost.
      addToast(err instanceof Error ? err.message : 'Falha ao salvar.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1">
        <VoltarParaGovernanca />
      </div>
      <h1 className="text-(length:--t-h2) font-bold">Parametrização de Receitas e Despesas</h1>
      <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
        Valores da tabela de Parâmetros da Oportunidade. O valor aplicado à proposta é escolhido
        pelo escritório de vendas da conta — VROD / VREG1-4, com o valor <b>Geral</b> para os
        escritórios sem coluna própria (EXES, FRAN e vazios). Campo em branco significa{' '}
        <b>não precificado</b>; não use 0.
      </p>

      <div className="mt-4 max-w-[280px]">
        <label
          htmlFor="familia"
          className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[.2px] text-(--color-text-muted)"
        >
          Tipo de proposta
        </label>
        <Select
          id="familia"
          value={familia}
          onChange={(v) => {
            cancelEdit();
            setFamilia(v);
          }}
          options={FAMILIAS}
        />
      </div>

      <div className="mt-5">
        {status === 'loading' && (
          <div className="space-y-2" data-testid="valores-loading">
            <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
            <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
            <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-6">
            <p className="text-(length:--t-caption) text-(--color-danger)">
              Falha ao carregar a parametrização de valores.
            </p>
            <button type="button" onClick={reload} className={`mt-3 ${ghostBtnCls}`}>
              Tentar novamente
            </button>
          </div>
        )}

        {status === 'loaded' && items.length === 0 && (
          <p
            data-testid="valores-vazio"
            className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-6 text-(length:--t-caption) text-(--color-text-muted)"
          >
            Nenhum tipo de item financeiro parametrizado para este tipo de proposta.
          </p>
        )}

        {status === 'loaded' && items.length > 0 && (
          // Wide table: scrolls inside its own container so the page never
          // scrolls horizontally.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse">
              <thead>
                <tr>
                  <th className={thCls}>Tipo</th>
                  <th className={thCls}>Categoria</th>
                  {COLUNAS_VALOR.map((c) => (
                    <th key={c.key} className={`${thCls} text-right`}>
                      {c.label}
                    </th>
                  ))}
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const isEditing = editingId === row.id;
                  return (
                    <tr key={row.id} data-testid={`valor-row-${row.id}`}>
                      <td className={tdCls}>
                        <div className="font-bold">{row.descricao ?? row.nome}</div>
                        <div className="mt-[2px] text-(length:--t-small) text-(--color-text-muted)">
                          {row.nome}
                        </div>
                        <div className="mt-1">
                          <Flags row={row} />
                        </div>
                        {isEditing && values && (
                          <input
                            aria-label="Descrição"
                            value={values.descricao}
                            onChange={(e) =>
                              setValues((v) => (v ? { ...v, descricao: e.target.value } : v))
                            }
                            className={`mt-2 ${inputCls}`}
                          />
                        )}
                      </td>
                      <td className={tdCls}>{CATEGORIA_LABEL[row.categoria] ?? row.categoria}</td>
                      {COLUNAS_VALOR.map((c) => (
                        <td key={c.key} className={`${tdCls} text-right`}>
                          {isEditing && values ? (
                            <input
                              aria-label={`${c.label} — ${row.nome}`}
                              inputMode="numeric"
                              placeholder="—"
                              value={values[c.key]}
                              onChange={(e) =>
                                setValues((v) =>
                                  v ? { ...v, [c.key]: maskMoneyInput(e.target.value) } : v,
                                )
                              }
                              className={`${inputCls} text-right`}
                            />
                          ) : (
                            <span className={row[c.key] === null ? 'text-(--color-text-muted)' : ''}>
                              {row[c.key] === null ? '—' : toMasked(row[c.key])}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className={`${tdCls} whitespace-nowrap text-right`}>
                        {isEditing ? (
                          <span className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={busy}
                              className={ghostBtnCls}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={save}
                              disabled={busy}
                              className={primaryBtnCls}
                            >
                              Salvar
                            </button>
                          </span>
                        ) : (
                          /*
                           * ⚠️ LINK de texto, não botão — é o `.lnk` do
                           * protótipo (`15-governanca.html`:
                           * `.lnk{color:var(--secondary-600);font-weight:700}`),
                           * que é como ele renderiza o "Editar" de linha nas
                           * tabelas de parametrização. Mesma forma do
                           * "Editar · Reatribuir" das abas de Distribuição, e
                           * das outras ~10 telas do app.
                           *
                           * `hover:underline` é acréscimo nosso: sem ele a cor
                           * sozinha é a única afordância.
                           */
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            disabled={editingId !== null}
                            className={linkActionCls}
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
