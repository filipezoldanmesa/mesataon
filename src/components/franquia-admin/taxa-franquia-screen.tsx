'use client';

import { useCallback, useEffect, useState } from 'react';

import { ToastContainer, useToast } from '@/components/toast';
import { SomenteLeituraHint } from '@/components/franquia-admin/somente-leitura-hint';
import { Select } from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  listTaxaParametrizacao as defaultList,
  upsertTaxaParametrizacao as defaultUpsert,
} from '@/lib/franquia-admin/franquia-admin.data';
import type {
  TaxaParametrizacao,
  TaxaParametrizacaoList,
  UpsertTaxaParametrizacaoPayload,
} from '@/lib/franquia-admin/franquia-admin.types';
import { FORMATO_LOJA_LABEL } from '@/lib/franquia-admin/franquia-admin.types';
import {
  BANDEIRA_FRANQUIA_LABEL,
  BandeiraFranquia,
  FormatoLoja,
} from '@/lib/franquia/types';
import { formatBrlString, maskMoneyInput, parseMoneyInput } from '@/lib/franquia/format';
import {
  LINK_ACTION,
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { IN_FIELD } from '@/components/ui/field-classes';
import { FieldLabel } from '@/components/ui/field-label';

type Props = {
  listTaxaParametrizacao?: () => Promise<TaxaParametrizacaoList>;
  upsertTaxaParametrizacao?: (
    payload: UpsertTaxaParametrizacaoPayload,
  ) => Promise<TaxaParametrizacao>;
};

type LoadStatus = 'loading' | 'loaded' | 'error';

const EMPTY_FORM = {
  bandeira: '' as BandeiraFranquia | '',
  formatoLoja: '' as FormatoLoja | '',
  taxa: '',
  maxParcelas: '',
  descricao: '',
};

type TaxaForm = typeof EMPTY_FORM;

/**
 * O diálogo está aberto? E veio de onde?
 *
 * ⚠️ **`editando` é a PROCEDÊNCIA, não um id** (22/09/2026) — e essa diferença é
 * própria desta tela. As irmãs (Anexo A, Padrões de BP, Documentos) têm `create`
 * e `update` separados, com id; aqui a rota é **UPSERT por chave**
 * (`bandeira × formatoLoja`), e não existe id nenhum: "Editar" apenas
 * pré-preenche a mesma escrita. O flag serve ao TÍTULO e ao aviso — não a
 * escolher endpoint.
 */
type ModalState = { editando: boolean } | null;

/*
 * Campos e botões saem das constantes compartilhadas do design system, nunca de
 * uma string local: o protótipo (`vibra-ui.css`) define `.in` com fundo
 * `--neutral-40` e SÓ a borda de baixo, e `.btn-ghost` com fundo, borda e texto
 * verdes. Estas telas nasceram com o `<input>` retangular padrão do navegador e
 * o ghost branco de borda cinza — a mesma divergência que `field-classes.ts`
 * existe para encerrar ("New form or modal: import from here, never retype the
 * string").
 */
const inputCls = IN_FIELD;
const ghostBtnCls = SECONDARY_OUTLINE_BTN;
const primaryBtnCls = PRIMARY_ACTION_BTN;
const thCls =
  'border-b border-(--color-border) px-2 py-[7px] text-left text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)';
const tdCls = 'border-b border-(--color-border) p-2';


function SectionLoading() {
  return (
    <div className="space-y-2" data-testid="taxa-loading">
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
    </div>
  );
}

/**
 * Admin screen for the franchise-fee table — default fee and instalment ceiling
 * per **bandeira × formato de loja** (Bugs 67575 / 67594).
 *
 * The numbers here are the single source for the proposal: the fee is pre-filled
 * from this table when the store format is answered, and the ceiling is both the
 * "Máximo pela política" hint and the refusal on save. Before this existed the
 * ceiling was one global constant (10 for every band and format) and the fee had
 * no default at all.
 *
 * Access: `RequirePermission(FranquiaTaxaParametrizacaoManage)` in the parent —
 * BP Financeiro, Gestor de Franquias and TI Administrador, the three profiles the
 * business named. That is a DIFFERENT set from the Anexo A / roteamento cards on
 * the same page, so the gate lives per card, not per route.
 *
 * A row is never deleted: the matrix is a closed key domain, and removing a line
 * would not clear a policy — it would leave the combination with no ceiling,
 * which is exactly the state that let `25000` parcelas be persisted. Clearing the
 * *fee* (leaving the field empty) is supported and means "not priced".
 *
 * ## ⚠️ O formulário NÃO está mais na página (22/09/2026)
 *
 * > *"para Taxa de Franquia e Parcelas deve existir um botão de adicionar e ao
 * > clicar, deve ser aberto um dialog. O editar também deve utilizar esse
 * > dialog. Não deve existir o formulário na página."*
 *
 * Adicionar e editar passam pelo MESMO diálogo ({@link TaxaFranquiaModal}) —
 * como já passavam pelo mesmo formulário, porque a rota é um UPSERT por chave.
 * **Não devolva o formulário para a página:** ele ficava depois da tabela, e
 * clicar em "Editar" numa linha não movia nada, só repreenchia o bloco lá
 * embaixo.
 */
/**
 * Título da seção — também é o rótulo da aba que a abre.
 *
 * Exportado (e não escrito duas vezes) porque os dois nomeiam a MESMA coisa na
 * MESMA página: eles haviam derivado em caixa e em pontuação ("Estrutura de
 * Royalties · Limites" na aba contra "Estrutura de royalties · limites" no
 * título; "Catálogo de Royalties (Anexo A)" contra "— Anexo A"), e clicar numa
 * aba para chegar a um título com outro nome lê como se a aba tivesse levado
 * para outro lugar.
 */
export const TAXA_FRANQUIA_TITULO = 'Taxa de Franquia e Parcelas';

export function TaxaFranquiaScreen({
  listTaxaParametrizacao = defaultList,
  upsertTaxaParametrizacao = defaultUpsert,
}: Props) {
  const { toasts, addToast, removeToast } = useToast();
  /* Matriz RBAC v2.1 (28/09/2026): o SPCOM só LÊ esta tabela. */
  const { can } = usePermissions();
  const podeEditar = can(Permission.FranquiaTaxaParametrizacaoManage);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<TaxaParametrizacao[]>([]);
  const [form, setForm] = useState<TaxaForm>(EMPTY_FORM);
  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setStatus('loading');
    listTaxaParametrizacao()
      .then((data) => {
        setItems(data.items);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listTaxaParametrizacao]);

  useEffect(() => {
    reload();
  }, [reload]);

  function validateForm(): UpsertTaxaParametrizacaoPayload | null {
    if (form.bandeira === '') {
      setFormError('Bandeira é obrigatória.');
      return null;
    }
    if (form.formatoLoja === '') {
      setFormError('Formato de loja é obrigatório.');
      return null;
    }
    const maxParcelas = Number(form.maxParcelas);
    if (!Number.isInteger(maxParcelas) || maxParcelas < 1) {
      setFormError('Número máximo de parcelas deve ser um inteiro ≥ 1.');
      return null;
    }
    return {
      bandeira: form.bandeira,
      formatoLoja: form.formatoLoja,
      // An empty field means "this combination is not priced" — sent as an
      // explicit null so the backend clears any default entered by mistake.
      taxaFranquiaDefaultBrl: parseMoneyInput(form.taxa),
      maxParcelasTaxa: maxParcelas,
      // Blank clears the note (explicit null), same present-vs-absent contract as
      // the fee — otherwise a wrong note could never be removed from the screen.
      descricao: form.descricao.trim() === '' ? null : form.descricao.trim(),
    };
  }

  async function handleUpsert() {
    setFormError(null);
    const payload = validateForm();
    if (payload === null) return;
    setBusy(true);
    try {
      await upsertTaxaParametrizacao(payload);
      addToast(
        'Parametrização salva — vale imediatamente para as próximas propostas.',
        'success',
      );
      fecharModal();
      reload();
    } catch (err) {
      // The backend's sentence is shown verbatim: it names the limit it refused.
      if (err instanceof Error) setFormError(err.message);
      else addToast('Falha ao salvar a parametrização.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function abrirCriacao() {
    /*
     * ⚠️ Limpa sempre. Antes havia o botão "Limpar" ao lado do formulário fixo,
     * e quem o esquecia seguia com os valores da linha que abriu por último —
     * aqui isso é especialmente perigoso, porque a rota é UPSERT por chave:
     * salvar com a chave herdada sobrescreveria OUTRA combinação em silêncio.
     */
    setForm(EMPTY_FORM);
    setFormError(null);
    setModal({ editando: false });
  }

  function fecharModal() {
    setModal(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function fillFormFromRow(item: TaxaParametrizacao) {
    setForm({
      bandeira: item.bandeira,
      formatoLoja: item.formatoLoja,
      taxa:
        item.taxaFranquiaDefaultBrl === null
          ? ''
          : maskMoneyInput(String(Math.round(Number(item.taxaFranquiaDefaultBrl) * 100))),
      maxParcelas: String(item.maxParcelasTaxa),
      descricao: item.descricao ?? '',
    });
    setFormError(null);
    setModal({ editando: true });
  }

  return (
    <>
      <h2 className="mt-2 text-(length:--t-h3) font-bold">
        {TAXA_FRANQUIA_TITULO}
      </h2>
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        Taxa de franquia sugerida e número máximo de parcelas, por bandeira e
        formato de loja. A taxa chega pré-preenchida na proposta, e o número de
        parcelas definido aqui é o limite que a proposta aceita. Toda alteração
        fica registrada com autor e data.
      </p>

      <div className="mt-6">
        {status === 'loading' && <SectionLoading />}
        {status === 'error' && (
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-6">
            <p className="text-(length:--t-caption) text-(--color-danger)">
              Falha ao carregar a parametrização de taxa de franquia.
            </p>
            <button type="button" onClick={reload} className={`${ghostBtnCls} mt-3`}>
              Tentar novamente
            </button>
          </div>
        )}

        {status === 'loaded' && (
          <>
            {/*
              ⚠️ **ANTES da tabela, e fora do ramo do estado vazio**
              (22/09/2026): com o formulário fixo, cadastrar a primeira
              combinação era possível mesmo sem nenhuma linha. Com o diálogo, um
              botão que só existisse ao lado de uma linha deixaria a tabela vazia
              sem saída — e tabela vazia faz a proposta recusar o número de
              parcelas e abrir a taxa sem default (é o que o texto abaixo diz).
            */}
            {podeEditar ? (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={abrirCriacao}
                  disabled={busy}
                  data-testid="add-taxa"
                  className={primaryBtnCls}
                >
                  + Adicionar combinação
                </button>
              </div>
            ) : (
              <SomenteLeituraHint />
            )}

            {items.length === 0 ? (
              <p
                className="text-(length:--t-caption) text-(--color-text-muted)"
                data-testid="taxa-empty"
              >
                Tabela vazia — enquanto ela estiver assim, a proposta recusa o número
                de parcelas em vez de aceitar um valor sem teto, e a taxa abre sem
                default.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-(length:--t-caption)"
                  data-testid="taxa-table"
                >
                  <thead>
                    <tr>
                      {[
                        'Bandeira',
                        'Formato de loja',
                        'Taxa default',
                        'Máx. parcelas',
                        'Observação',
                        ...(podeEditar ? [''] : []),
                      ].map((h, i) => (
                        <th key={i} className={thCls}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={`${item.bandeira}-${item.formatoLoja}`}>
                        <td className={`${tdCls} font-bold`}>
                          {BANDEIRA_FRANQUIA_LABEL[item.bandeira]}
                        </td>
                        <td className={tdCls}>{FORMATO_LOJA_LABEL[item.formatoLoja]}</td>
                        <td className={tdCls}>
                          {/* An em dash means "not priced" — never `R$ 0,00`, which
                              on a money column reads as a real figure. */}
                          {formatBrlString(item.taxaFranquiaDefaultBrl) ?? '—'}
                        </td>
                        <td className={tdCls}>{item.maxParcelasTaxa}</td>
                        <td className={tdCls}>{item.descricao ?? '—'}</td>
                        {podeEditar && (
                          <td className={`${tdCls} text-right whitespace-nowrap`}>
                            <button
                              type="button"
                              onClick={() => fillFormFromRow(item)}
                              disabled={busy}
                              data-testid={`edit-taxa-${item.bandeira}-${item.formatoLoja}`}
                              className={LINK_ACTION}
                            >
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </>
        )}
      </div>

      {/*
        O formulário — em DIÁLOGO desde 22/09/2026. Ver o docblock de
        {@link TaxaFranquiaModal}.
      */}
      {modal && (
        <TaxaFranquiaModal
          form={form}
          editando={modal.editando}
          busy={busy}
          erro={formError}
          onChange={setForm}
          onCancelar={fecharModal}
          onSalvar={() => void handleUpsert()}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
}

/**
 * O formulário da taxa de franquia, em **diálogo** (22/09/2026).
 *
 * > *"para Taxa de Franquia e Parcelas deve existir um botão de adicionar e ao
 * > clicar, deve ser aberto um dialog. O editar também deve utilizar esse
 * > dialog. Não deve existir o formulário na página."*
 *
 * ## ⚠️ Esta tela é UPSERT, e por isso o diálogo tem um aviso que as irmãs não têm
 *
 * As outras três superfícies de parametrização (Anexo A, Padrões de BP,
 * Documentos) têm `create` e `update` separados, e travam a chave na edição.
 * Aqui existe **uma** rota, `upsert` por `bandeira × formatoLoja`: "Editar"
 * sempre foi só um pré-preenchimento do MESMO formulário, e trocar a chave nele
 * grava em outra combinação. Isso já era verdade com o formulário fixo, mas
 * passava despercebido porque o bloco se chamava "Adicionar / atualizar
 * combinação" — um diálogo intitulado "Editar" promete um alvo único, então a
 * frase abaixo dos campos passou a dizer isso em voz alta.
 *
 * ⚠️ **A chave NÃO foi travada na edição.** Travá-la mudaria comportamento (a
 * tela deixaria de permitir o que permite hoje) e removeria o único caminho de
 * "copiar esta combinação para outra" — que a ausência de `DELETE` nesta tabela
 * torna a operação mais próxima de um "mover". Se o negócio pedir a trava, é
 * mudança de regra, não ajuste de diálogo.
 *
 * ## As convenções são as dos outros diálogos da plataforma
 *
 * Fundo `role="presentation"` que fecha no clique fora, `role="dialog"` +
 * `aria-modal` + `aria-labelledby`, Escape fecha.
 *
 * ⚠️ **Falha ao salvar MANTÉM o diálogo aberto, com o que foi digitado** — a
 * frase do backend nomeia o limite que ele recusou, e fechar apagaria a
 * explicação junto com o formulário.
 *
 * ⚠️ **A casca do diálogo é local, e é a norma deste repositório:**
 * `analysis-window-modal`, `analista-picker-modal`, `nova-proposta-modal` e ~10
 * outros também a declaram. Ver a pendência de extração registrada na skill
 * `governanca-parametrizacao` — quando as quatro superfícies tiverem entrado,
 * extrai-se para TODAS de uma vez.
 */
function TaxaFranquiaModal({
  form,
  editando,
  busy,
  erro,
  onChange,
  onCancelar,
  onSalvar,
}: {
  form: TaxaForm;
  editando: boolean;
  busy: boolean;
  erro: string | null;
  onChange: (f: TaxaForm) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  /*
   * Escape fecha. O listener é do DOCUMENTO (e não do contêiner) porque o foco
   * pode estar em qualquer campo — ou em nenhum, logo depois da abertura.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancelar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancelar, busy]);

  /*
   * ⚠️ Mesma ASSINATURA do `setState` que os cinco campos já usavam
   * (`setForm((prev) => ({ ...prev, campo }))`), de propósito: o estado subiu
   * para o componente pai, e manter a forma deixa o diff desta mudança ser o que
   * ela de fato é — estrutural —, em vez de cinco reescritas de `onChange` onde
   * um campo trocado passaria despercebido na revisão.
   */
  const setForm = (updater: (f: TaxaForm) => TaxaForm) => onChange(updater(form));

  return (
    <div
      role="presentation"
      data-testid="taxa-form-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-black/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="taxa-form-title"
        data-testid="taxa-form"
        className="relative m-auto w-full max-w-[720px] rounded-[var(--radius-md)] bg-(--color-surface) px-7 py-[26px] shadow-[0_8px_30px_rgba(0,0,0,.2)]"
      >
              <h3
                id="taxa-form-title"
                className="mb-3 text-(length:--t-h4) font-bold"
              >
                {editando ? 'Editar combinação' : 'Nova combinação'}
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="taxa-form-bandeira" required>
                    Bandeira
                  </FieldLabel>
                  <Select
                    id="taxa-form-bandeira"
                    required
                    data-testid="taxa-form-bandeira"
                    value={form.bandeira}
                    onChange={(v) =>
                      setForm((prev) => ({ ...prev, bandeira: v as BandeiraFranquia }))
                    }
                    options={Object.entries(BANDEIRA_FRANQUIA_LABEL).map(
                      ([value, label]) => ({ value, label }),
                    )}
                    placeholder="Selecione…"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="taxa-form-formato" required>
                    Formato de loja
                  </FieldLabel>
                  <Select
                    id="taxa-form-formato"
                    required
                    data-testid="taxa-form-formato"
                    value={form.formatoLoja}
                    onChange={(v) =>
                      setForm((prev) => ({ ...prev, formatoLoja: v as FormatoLoja }))
                    }
                    options={Object.entries(FORMATO_LOJA_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    placeholder="Selecione…"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="taxa-form-taxa">
                    Taxa default (R$)
                  </FieldLabel>
                  <input
                    id="taxa-form-taxa"
                    data-testid="taxa-form-taxa"
                    className={inputCls}
                    type="text"
                    inputMode="numeric"
                    placeholder="deixe vazio para não precificar"
                    value={form.taxa}
                    disabled={busy}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, taxa: maskMoneyInput(e.target.value) }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="taxa-form-parcelas">
                    Máx. parcelas
                  </FieldLabel>
                  <input
                    id="taxa-form-parcelas"
                    data-testid="taxa-form-parcelas"
                    className={inputCls}
                    type="number"
                    min={1}
                    value={form.maxParcelas}
                    disabled={busy}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, maxParcelas: e.target.value }))
                    }
                  />
                </div>

                <div className="lg:col-span-2">
                  <FieldLabel htmlFor="taxa-form-descricao">
                    Observação
                  </FieldLabel>
                  <input
                    id="taxa-form-descricao"
                    data-testid="taxa-form-descricao"
                    className={inputCls}
                    type="text"
                    placeholder="ex.: valor confirmado pelo time de franquia"
                    value={form.descricao}
                    disabled={busy}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, descricao: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/*
                ⚠️ O aviso do UPSERT, só na edição. Ele não descreve
                comportamento novo — trocar a chave sempre gravou noutra
                combinação —, mas o diálogo intitulado "Editar" promete um alvo
                único, e sem a frase a promessa seria falsa. Com o formulário
                fixo o título do bloco ("Adicionar / atualizar combinação") já
                dizia isso o tempo todo.
              */}
              {editando && (
                <p
                  data-testid="taxa-form-upsert-hint"
                  className="mt-3 text-(length:--t-caption) text-(--color-text-muted)"
                >
                  A gravação é pela chave <strong>bandeira + formato de loja</strong>:
                  trocar um dos dois aqui salva em outra combinação, em vez de
                  renomear esta.
                </p>
              )}

              {erro !== null && (
                <p
                  className="mt-3 rounded-[var(--radius-xs)] bg-(--red-100) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
                  role="alert"
                  data-testid="taxa-form-error"
                >
                  {erro}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                {/*
                  ⚠️ "Cancelar" substitui o "Limpar" do formulário fixo. Ali
                  limpar era o único jeito de sair de uma edição, porque não
                  havia o que fechar; no diálogo, esvaziar os campos e continuar
                  aberto seria um estado sem propósito — quem quer outro registro
                  fecha e abre pelo "+ Adicionar combinação", que já limpa.
                */}
                <button
                  type="button"
                  onClick={onCancelar}
                  disabled={busy}
                  data-testid="taxa-form-cancel"
                  className={ghostBtnCls}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSalvar}
                  disabled={busy}
                  className={primaryBtnCls}
                  data-testid="taxa-form-save"
                >
                  {busy ? 'Salvando…' : 'Salvar combinação'}
                </button>
              </div>
      </div>
    </div>
  );
}
