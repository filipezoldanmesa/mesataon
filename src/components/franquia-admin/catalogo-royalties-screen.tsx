'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConfirm } from '@/components/confirm-dialog';
import { SomenteLeituraHint } from '@/components/franquia-admin/somente-leitura-hint';
import { ToastContainer, useToast } from '@/components/toast';
import {
  createCatalogoRoyalty as defaultCreate,
  deleteCatalogoRoyalty as defaultDelete,
  listCatalogoRoyalties as defaultList,
  updateCatalogoRoyalty as defaultUpdate,
} from '@/lib/franquia-admin/franquia-admin.data';
import type {
  CatalogoRoyalty,
  CatalogoRoyaltyList,
  CreateCatalogoRoyaltyPayload,
  FormatoLoja,
  ModeloRoyalty,
  UpdateCatalogoRoyaltyPayload,
} from '@/lib/franquia-admin/franquia-admin.types';
import {
  CatalogoRoyaltyConflictError,
  FORMATO_LOJA_LABEL,
  MODELO_ROYALTY_LABEL,
} from '@/lib/franquia-admin/franquia-admin.types';
import { Select } from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  LINK_ACTION,
  LINK_ACTION_DANGER,
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { IN_FIELD } from '@/components/ui/field-classes';
import { FieldLabel } from '@/components/ui/field-label';

// ---------------------------------------------------------------------------
// Props — every data function injectable for tests
// ---------------------------------------------------------------------------

type Props = {
  listCatalogoRoyalties?: () => Promise<CatalogoRoyaltyList>;
  createCatalogoRoyalty?: (payload: CreateCatalogoRoyaltyPayload) => Promise<CatalogoRoyalty>;
  updateCatalogoRoyalty?: (id: string, payload: UpdateCatalogoRoyaltyPayload) => Promise<CatalogoRoyalty>;
  deleteCatalogoRoyalty?: (id: string) => Promise<void>;
};

type LoadStatus = 'loading' | 'loaded' | 'error';

const EMPTY_FORM = {
  politica: '' as ModeloRoyalty | '',
  formatoLoja: '' as FormatoLoja | '',
  registroSequencial: '1',
  inicioFaixaFaturamento: '',
  fimFaixaFaturamento: '',
  percRoyalty: '',
  percRoyaltyTabaco: '',
  percFundoDeMkt: '',
  percFundoDeMktTabaco: '',
  valorFixoRoyalty: '',
  valorFixoFundoMkt: '',
};

type CatalogoForm = typeof EMPTY_FORM;

/**
 * O diálogo está aberto? E em qual modo?
 *
 * ⚠️ **`editingId` vive AQUI dentro, e não num estado paralelo** (22/09/2026).
 * Enquanto o formulário era fixo na página, "estar editando" e "o formulário
 * estar visível" eram a mesma coisa. Com o diálogo elas se separam — existe
 * "aberto para criar" —, e dois estados soltos (`modalAberto` + `editingId`)
 * admitiriam as duas combinações impossíveis: diálogo fechado com edição
 * pendente, e diálogo de edição sem id.
 */
type ModalState = { editingId: string | null } | null;

// ---------------------------------------------------------------------------
// Shared UI bits
// ---------------------------------------------------------------------------

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
// selectCls removed — selects use the DS <Select> component, default
// (bottom-border) variant: same `.in` surface as the inputs beside them.
const ghostBtnCls = SECONDARY_OUTLINE_BTN;
const primaryBtnCls = PRIMARY_ACTION_BTN;
const thCls =
  'border-b border-(--color-border) px-2 py-[7px] text-left text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)';
const tdCls = 'border-b border-(--color-border) p-2';

function SectionLoading() {
  return (
    <div className="space-y-2" data-testid="section-loading">
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
    </div>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-6">
      <p className="text-(length:--t-caption) text-(--color-danger)">
        Falha ao carregar o catálogo de royalties.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`${ghostBtnCls} mt-3`}
      >
        Tentar novamente
      </button>
    </div>
  );
}

function fmtPct(v: string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isNaN(n) ? v : `${(n * 100).toFixed(2)}%`;
}

function fmtBrl(v: string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isNaN(n) ? v : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Admin screen for the royalty catalog / Anexo A (HU-13 / RN-F2-04 — FRQ-16).
 *
 * Access: entire screen is under RequirePermission(FranquiaParametrizacaoManage)
 * in the parent page — all mutations are safe without individual WriteOnly wrappers
 * (same pattern as parametrizacao-screen.tsx for SNEG).
 *
 * Error messages are forwarded from the backend — the frontend does not
 * replicate backend validation rules (principle: backend is source of truth).
 *
 * ## ⚠️ O formulário NÃO está mais na página (22/09/2026)
 *
 * > *"para Catálogo de Royalties, deve existir um botão de adicionar e ao
 * > clicar, deve ser aberto um dialog. O editar também deve utilizar esse
 * > dialog. Não deve existir o formulário na página."*
 *
 * Criar e editar passam pelo MESMO diálogo ({@link CatalogoRoyaltyModal}),
 * aberto pelo "+ Adicionar entrada" e pelo "Editar" de cada linha. **Não
 * devolva o formulário para a página**: com onze campos depois de uma tabela de
 * doze colunas, clicar em "Editar" não movia nada — só trocava um título lá
 * embaixo — e quem não reparasse seguia digitando achando que criava uma entrada
 * nova, que é o caminho direto para o 409 de chave repetida.
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
export const CATALOGO_ROYALTIES_TITULO = 'Catálogo de Royalties (Anexo A)';

export function CatalogoRoyaltiesScreen({
  listCatalogoRoyalties = defaultList,
  createCatalogoRoyalty = defaultCreate,
  updateCatalogoRoyalty = defaultUpdate,
  deleteCatalogoRoyalty = defaultDelete,
}: Props) {
  const confirm = useConfirm();
  /*
   * Matriz RBAC v2.1 (28/09/2026): o SPCOM LÊ esta tabela pela aba
   * Franquias da Governança; só quem executa escreve (o 403 da rota é a
   * garantia, esconder o controle é o que evita oferecê-lo).
   */
  const { can } = usePermissions();
  const podeEditar = can(Permission.FranquiaParametrizacaoManage);
  const { toasts, addToast, removeToast } = useToast();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<CatalogoRoyalty[]>([]);
  const [form, setForm] = useState<CatalogoForm>(EMPTY_FORM);
  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editingId = modal?.editingId ?? null;

  const reload = useCallback(() => {
    setStatus('loading');
    listCatalogoRoyalties()
      .then((data) => {
        setItems(data.items);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listCatalogoRoyalties]);

  useEffect(() => {
    reload();
  }, [reload]);

  function parseNumField(v: string): number | null {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  function buildPayload(): CreateCatalogoRoyaltyPayload | null {
    if (!form.politica || !form.formatoLoja) {
      setFormError('Política e formato de loja são obrigatórios.');
      return null;
    }
    const seq = Number(form.registroSequencial);
    if (!Number.isInteger(seq) || seq < 1) {
      setFormError('Seq. deve ser um inteiro ≥ 1.');
      return null;
    }
    return {
      politica: form.politica as ModeloRoyalty,
      formatoLoja: form.formatoLoja as FormatoLoja,
      registroSequencial: seq,
      inicioFaixaFaturamento: parseNumField(form.inicioFaixaFaturamento),
      fimFaixaFaturamento: parseNumField(form.fimFaixaFaturamento),
      percRoyalty: parseNumField(form.percRoyalty),
      percRoyaltyTabaco: parseNumField(form.percRoyaltyTabaco),
      percFundoDeMkt: parseNumField(form.percFundoDeMkt),
      percFundoDeMktTabaco: parseNumField(form.percFundoDeMktTabaco),
      valorFixoRoyalty: parseNumField(form.valorFixoRoyalty),
      valorFixoFundoMkt: parseNumField(form.valorFixoFundoMkt),
    };
  }

  function buildUpdatePayload(): UpdateCatalogoRoyaltyPayload {
    return {
      inicioFaixaFaturamento: parseNumField(form.inicioFaixaFaturamento),
      fimFaixaFaturamento: parseNumField(form.fimFaixaFaturamento),
      percRoyalty: parseNumField(form.percRoyalty),
      percRoyaltyTabaco: parseNumField(form.percRoyaltyTabaco),
      percFundoDeMkt: parseNumField(form.percFundoDeMkt),
      percFundoDeMktTabaco: parseNumField(form.percFundoDeMktTabaco),
      valorFixoRoyalty: parseNumField(form.valorFixoRoyalty),
      valorFixoFundoMkt: parseNumField(form.valorFixoFundoMkt),
    };
  }

  async function handleSubmit() {
    setFormError(null);
    setBusy(true);
    try {
      if (editingId) {
        await updateCatalogoRoyalty(editingId, buildUpdatePayload());
        addToast('Entrada do catálogo atualizada.', 'success');
      } else {
        const payload = buildPayload();
        if (!payload) return;
        await createCatalogoRoyalty(payload);
        addToast('Entrada do catálogo criada.', 'success');
      }
      fecharModal();
      reload();
    } catch (err) {
      if (err instanceof CatalogoRoyaltyConflictError) {
        setFormError(err.message);
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        addToast('Falha ao salvar a entrada do catálogo.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    setBusy(true);
    try {
      await deleteCatalogoRoyalty(id);
      addToast(`Entrada "${label}" removida do catálogo.`, 'success');
      reload();
    } catch {
      addToast('Falha ao remover a entrada do catálogo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function abrirCriacao() {
    /*
     * ⚠️ O formulário é LIMPO ao abrir, sempre. Com o formulário fixo, quem
     * esquecia o "Cancelar edição" seguia vendo os valores da linha anterior;
     * no diálogo isso é pior, porque Política, Formato de loja e Seq. voltam a
     * ficar DESTRAVADOS na criação — reabrir sem limpar traria a chave de OUTRA
     * entrada pronta para ser salva, e o backend responderia 409 sobre um
     * conteúdo que ninguém digitou.
     */
    setForm(EMPTY_FORM);
    setFormError(null);
    setModal({ editingId: null });
  }

  function startEdit(item: CatalogoRoyalty) {
    setForm({
      politica: item.politica,
      formatoLoja: item.formatoLoja,
      registroSequencial: String(item.registroSequencial),
      inicioFaixaFaturamento: item.inicioFaixaFaturamento ?? '',
      fimFaixaFaturamento: item.fimFaixaFaturamento ?? '',
      percRoyalty: item.percRoyalty ?? '',
      percRoyaltyTabaco: item.percRoyaltyTabaco ?? '',
      percFundoDeMkt: item.percFundoDeMkt ?? '',
      percFundoDeMktTabaco: item.percFundoDeMktTabaco ?? '',
      valorFixoRoyalty: item.valorFixoRoyalty ?? '',
      valorFixoFundoMkt: item.valorFixoFundoMkt ?? '',
    });
    setFormError(null);
    setModal({ editingId: item.id });
  }

  function fecharModal() {
    setModal(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  return (
    <>
      {confirm.dialog}
      <h2 className="mt-2 text-(length:--t-h3) font-bold">
        {CATALOGO_ROYALTIES_TITULO}
      </h2>
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        Políticas de royalty por formato de loja e faixa de faturamento. O que for
        salvo aqui passa a valer na hora, nas propostas seguintes. Toda alteração
        fica registrada com autor e data.
      </p>

      <div className="mt-6">
        {status === 'loading' && <SectionLoading />}
        {status === 'error' && <SectionError onRetry={reload} />}
        {status === 'loaded' && (
          <>
            {/*
              ⚠️ **ANTES da tabela, e fora do ramo do estado vazio** (22/09/2026):
              com o formulário fixo, cadastrar a primeira entrada era possível
              mesmo sem nenhuma linha porque o formulário estava sempre lá. Com
              o diálogo, um botão que só existisse ao lado de uma linha deixaria
              o catálogo vazio sem nenhum caminho para sair dele — e catálogo
              vazio trava o cálculo de royalty de toda proposta de franquia.
            */}
            {podeEditar ? (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={abrirCriacao}
                  disabled={busy}
                  data-testid="add-catalogo"
                  className={primaryBtnCls}
                >
                  + Adicionar entrada
                </button>
              </div>
            ) : (
              <SomenteLeituraHint />
            )}

            {items.length === 0 ? (
              <p
                className="text-(length:--t-caption) text-(--color-text-muted)"
                data-testid="catalogo-empty"
              >
                {/*
                  ⚠️ Dizia "Cadastre a primeira entrada **abaixo**" — e o
                  formulário deixou de estar abaixo em 22/09/2026. Texto que
                  aponta para um elemento que saiu da tela é pior que texto
                  genérico (mesma regra que corrigiu a frase de fonte do card de
                  política comercial quando a tela de origem foi removida).
                */}
                {podeEditar
                  ? 'Catálogo vazio. Use “+ Adicionar entrada” para cadastrar a primeira — '
                  : 'Catálogo vazio — '}
                enquanto não houver política cadastrada, a proposta não consegue calcular
                o royalty (catálogo vazio nunca é lido como “sem cobrança”).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-(length:--t-caption)"
                  data-testid="catalogo-table"
                >
                  <thead>
                    <tr>
                      {[
                        'Política',
                        'Formato loja',
                        'Seq.',
                        'Faixa início',
                        'Faixa fim',
                        '% Roy.',
                        '% Roy. Tab.',
                        '% Fundo MKT',
                        '% Fundo Tab.',
                        'Vl. Fixo Roy.',
                        'Vl. Fixo MKT',
                        ...(podeEditar ? [''] : []),
                      ].map((h, i) => (
                        <th key={i} className={thCls}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const label = `${MODELO_ROYALTY_LABEL[item.politica]} · ${FORMATO_LOJA_LABEL[item.formatoLoja]} · seq ${item.registroSequencial}`;
                      return (
                        <tr key={item.id}>
                          <td className={`${tdCls} font-bold`}>
                            {MODELO_ROYALTY_LABEL[item.politica]}
                          </td>
                          <td className={tdCls}>{FORMATO_LOJA_LABEL[item.formatoLoja]}</td>
                          <td className={tdCls}>{item.registroSequencial}</td>
                          <td className={tdCls}>{fmtBrl(item.inicioFaixaFaturamento)}</td>
                          <td className={tdCls}>{fmtBrl(item.fimFaixaFaturamento)}</td>
                          <td className={tdCls}>{fmtPct(item.percRoyalty)}</td>
                          <td className={tdCls}>{fmtPct(item.percRoyaltyTabaco)}</td>
                          <td className={tdCls}>{fmtPct(item.percFundoDeMkt)}</td>
                          <td className={tdCls}>{fmtPct(item.percFundoDeMktTabaco)}</td>
                          <td className={tdCls}>{fmtBrl(item.valorFixoRoyalty)}</td>
                          <td className={tdCls}>{fmtBrl(item.valorFixoFundoMkt)}</td>
                          {podeEditar && (
                            <td className={`${tdCls} text-right whitespace-nowrap`}>
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                disabled={busy}
                                data-testid={`edit-catalogo-${item.id}`}
                                className={`mr-3 ${LINK_ACTION}`}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  confirm.ask({
                                    title: 'Remover entrada do catálogo de royalties?',
                                    description: `"${label}" será removida permanentemente. Propostas que referenciam esta política podem perder o vínculo.`,
                                    confirmLabel: 'Remover',
                                    tone: 'danger',
                                    onConfirm: () => handleDelete(item.id, label),
                                  })
                                }
                                disabled={busy}
                                data-testid={`remove-catalogo-${item.id}`}
                                className={LINK_ACTION_DANGER}
                              >
                                Remover
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </>
        )}
      </div>

      {/*
        O formulário — em DIÁLOGO desde 22/09/2026. Ver o docblock de
        {@link CatalogoRoyaltyModal}.
      */}
      {modal && (
        <CatalogoRoyaltyModal
          form={form}
          editando={editingId !== null}
          busy={busy}
          erro={formError}
          onChange={setForm}
          onCancelar={fecharModal}
          onSalvar={() => void handleSubmit()}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
}

/**
 * O formulário de criar/editar uma entrada do Anexo A, em **diálogo**
 * (22/09/2026).
 *
 * > *"para Catálogo de Royalties, deve existir um botão de adicionar e ao
 * > clicar, deve ser aberto um dialog. O editar também deve utilizar esse
 * > dialog. Não deve existir o formulário na página."*
 *
 * ## ⚠️ O que o diálogo conserta, além do pedido
 *
 * Esta é a tela com o formulário MAIS LONGO da Governança — onze campos — e a
 * tabela tem doze colunas. O formulário ficava depois dela e servia aos dois
 * modos: clicar em "Editar" numa linha não movia a página, só trocava um título
 * lá embaixo e travava Política/Formato/Seq. Com o catálogo cheio, o clique não
 * parecia ter efeito, e quem não reparasse seguia digitando achando que criava
 * uma entrada nova — que é justamente o caminho para o 409 de chave repetida.
 *
 * ## Um componente para os dois modos
 *
 * Os campos são os mesmos; o que muda é se a CHAVE (política, formato de loja e
 * sequencial) está travada — ela não é editável, e é por isso que o `update`
 * manda só os oito valores. Dois formulários divergiriam exatamente no campo que
 * alguém acrescentasse depois em um só deles.
 *
 * ## As convenções são as dos outros diálogos da plataforma
 *
 * Fundo `role="presentation"` que fecha no clique fora, `role="dialog"` +
 * `aria-modal` + `aria-labelledby`, Escape fecha.
 *
 * ⚠️ **Falha ao salvar MANTÉM o diálogo aberto, com o que foi digitado.** A frase
 * do backend vai INLINE (nunca no toast, que some sozinho) — o 409 de chave
 * repetida é o que nomeia o conserto, e fechar apagaria a explicação junto com
 * onze campos preenchidos.
 *
 * ⚠️ **A casca do diálogo é local, e é a norma deste repositório:**
 * `analysis-window-modal`, `analista-picker-modal`, `nova-proposta-modal` e ~10
 * outros também a declaram. Se uma for extraída um dia, extraia para TODOS.
 */
function CatalogoRoyaltyModal({
  form,
  editando,
  busy,
  erro,
  onChange,
  onCancelar,
  onSalvar,
}: {
  form: CatalogoForm;
  editando: boolean;
  busy: boolean;
  erro: string | null;
  onChange: (f: CatalogoForm) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  /*
   * Escape fecha. O listener é do DOCUMENTO (e não do contêiner) porque o foco
   * pode estar em qualquer um dos onze campos — ou em nenhum, logo depois da
   * abertura.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancelar]);

  /*
   * ⚠️ Mesma ASSINATURA do `setState` que os onze campos já usavam
   * (`setForm((f) => ({ ...f, campo }))`), de propósito: o estado subiu para o
   * componente pai, e manter a forma deixa o diff desta mudança ser o que ela
   * de fato é — estrutural —, em vez de onze reescritas de `onChange` onde um
   * campo trocado passaria despercebido na revisão.
   */
  const setForm = (updater: (f: CatalogoForm) => CatalogoForm) =>
    onChange(updater(form));

  return (
    <div
      role="presentation"
      data-testid="catalogo-form-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-black/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogo-form-title"
        data-testid="catalogo-form"
        className="relative m-auto w-full max-w-[860px] rounded-[var(--radius-md)] bg-(--color-surface) px-7 py-[26px] shadow-[0_8px_30px_rgba(0,0,0,.2)]"
      >
              <h3
                id="catalogo-form-title"
                className="mb-3 text-(length:--t-h4) font-bold"
              >
                {editando ? 'Editar entrada do catálogo' : 'Nova entrada do catálogo'}
              </h3>

              {/*
                Três colunas, não quatro: onze campos em quatro colunas dentro do
                diálogo dariam ~180px cada, e os rótulos ("% Fundo MKT Tab.
                (0–1)") quebram em três linhas nessa largura.
              */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Política */}
                <div>
                  <FieldLabel htmlFor="form-politica" required>
                    Política
                  </FieldLabel>
                  <Select
                    id="form-politica"
                    required
                    value={form.politica}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, politica: v as ModeloRoyalty }))
                    }
                    disabled={busy || editando}
                    data-testid="form-politica"
                    options={(Object.keys(MODELO_ROYALTY_LABEL) as ModeloRoyalty[]).map((k) => ({
                      value: k,
                      label: MODELO_ROYALTY_LABEL[k],
                    }))}
                    placeholder="Selecione…"
                  />
                </div>

                {/* Formato de loja */}
                <div>
                  <FieldLabel htmlFor="form-formato-loja" required>
                    Formato de loja
                  </FieldLabel>
                  <Select
                    id="form-formato-loja"
                    required
                    value={form.formatoLoja}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, formatoLoja: v as FormatoLoja }))
                    }
                    disabled={busy || editando}
                    options={(Object.keys(FORMATO_LOJA_LABEL) as FormatoLoja[]).map((k) => ({
                      value: k,
                      label: FORMATO_LOJA_LABEL[k],
                    }))}
                    placeholder="Selecione…"
                  />
                </div>

                {/* Seq. */}
                <div>
                  <FieldLabel>
                    Seq. (faixa)
                  </FieldLabel>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.registroSequencial}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, registroSequencial: e.target.value }))
                    }
                    disabled={busy || editando}
                    aria-label="Número sequencial da faixa"
                    className={inputCls}
                  />
                </div>

                {/* Faixas de faturamento */}
                <div>
                  <FieldLabel>
                    Início faixa (R$)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={form.inicioFaixaFaturamento}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, inicioFaixaFaturamento: e.target.value }))
                    }
                    disabled={busy}
                    placeholder="Ex.: 0"
                    aria-label="Início da faixa de faturamento"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>
                    Fim faixa (R$)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={form.fimFaixaFaturamento}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fimFaixaFaturamento: e.target.value }))
                    }
                    disabled={busy}
                    placeholder="Deixe vazio = aberta"
                    aria-label="Fim da faixa de faturamento"
                    className={inputCls}
                  />
                </div>

                {/* Percentuais */}
                <div>
                  <FieldLabel>
                    % Royalty (0–1)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.001"
                    value={form.percRoyalty}
                    onChange={(e) => setForm((f) => ({ ...f, percRoyalty: e.target.value }))}
                    disabled={busy}
                    placeholder="Ex.: 0.05"
                    aria-label="Percentual de royalty"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>
                    % Roy. Tabaco (0–1)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.001"
                    value={form.percRoyaltyTabaco}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, percRoyaltyTabaco: e.target.value }))
                    }
                    disabled={busy}
                    placeholder="Ex.: 0.02"
                    aria-label="Percentual de royalty sobre tabaco"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>
                    % Fundo MKT (0–1)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.001"
                    value={form.percFundoDeMkt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, percFundoDeMkt: e.target.value }))
                    }
                    disabled={busy}
                    placeholder="Ex.: 0.02"
                    aria-label="Percentual de fundo de marketing"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>
                    % Fundo MKT Tab. (0–1)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.001"
                    value={form.percFundoDeMktTabaco}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, percFundoDeMktTabaco: e.target.value }))
                    }
                    disabled={busy}
                    placeholder="Ex.: 0.02"
                    aria-label="Percentual de fundo de marketing sobre tabaco"
                    className={inputCls}
                  />
                </div>

                {/* Valores fixos */}
                <div>
                  <FieldLabel>
                    Vl. Fixo Royalty (R$)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={form.valorFixoRoyalty}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, valorFixoRoyalty: e.target.value }))
                    }
                    disabled={busy}
                    placeholder="Ex.: 5000"
                    aria-label="Valor fixo de royalty"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>
                    Vl. Fixo Fundo MKT (R$)
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={form.valorFixoFundoMkt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, valorFixoFundoMkt: e.target.value }))
                    }
                    disabled={busy}
                    placeholder="Ex.: 2000"
                    aria-label="Valor fixo de fundo de marketing"
                    className={inputCls}
                  />
                </div>
              </div>

              {/*
                ⚠️ O erro vem ANTES dos botões, como já vinha — e no diálogo
                isso deixa de ser detalhe: o rodapé é o fim da caixa, e uma
                frase depois dele nasceria fora da área visível num formulário
                de onze campos.
              */}
              {erro && (
                <p
                  className="mt-3 rounded-[var(--radius-xs)] bg-(--red-100) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
                  role="alert"
                  data-testid="form-error"
                >
                  {erro}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                {/*
                  ⚠️ "Cancelar", e não "Cancelar edição": no diálogo ele existe
                  nos DOIS modos (antes só aparecia na edição, porque na criação
                  não havia de onde sair). O `data-testid` fica —
                  `cancel-edit-catalogo` é o que os testes já endereçam, e
                  renomeá-lo não mudaria comportamento nenhum.
                */}
                <button
                  type="button"
                  onClick={onCancelar}
                  disabled={busy}
                  data-testid="cancel-edit-catalogo"
                  className={ghostBtnCls}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSalvar}
                  disabled={busy}
                  data-testid="save-catalogo"
                  className={primaryBtnCls}
                >
                  {busy ? 'Salvando…' : editando ? 'Atualizar' : 'Criar'}
                </button>
              </div>
      </div>
    </div>
  );
}
