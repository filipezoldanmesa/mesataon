'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  LINK_ACTION,
  LINK_ACTION_DANGER,
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { ToastContainer, useToast } from '@/components/toast';
import { IN_FIELD } from '@/components/ui/field-classes';
import { FieldLabel } from '@/components/ui/field-label';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiValidationError } from '@/lib/api-errors';
import { Permission } from '@/lib/auth-permissions';
import {
  BP_PADRAO_VALIDATION_MESSAGE,
  parseBpPadraoForm,
} from '@/lib/sneg-admin/bp-padrao-form';
import {
  createBpPadrao as defaultCreateBpPadrao,
  deleteBpPadrao as defaultDeleteBpPadrao,
  listBpPadroes as defaultListBpPadroes,
  updateBpPadrao as defaultUpdateBpPadrao,
} from '@/lib/sneg-admin/sneg-admin.data';
import type {
  BpPadrao,
  BpPadraoList,
  BpPadraoPayload,
  BpPadraoUpdatePayload,
} from '@/lib/sneg-admin/sneg-admin.types';
import { BpPadraoConflictError } from '@/lib/sneg-admin/sneg-admin.types';

type Props = {
  listBpPadroes?: () => Promise<BpPadraoList>;
  createBpPadrao?: (payload: BpPadraoPayload) => Promise<BpPadrao>;
  updateBpPadrao?: (id: string, payload: BpPadraoUpdatePayload) => Promise<BpPadrao>;
  deleteBpPadrao?: (id: string) => Promise<void>;
};

type LoadStatus = 'loading' | 'loaded' | 'error';

const EMPTY_BP_FORM = {
  negocio: '',
  metaPercentualAntecipacao: '',
  metaPercentualPostecipacao: '',
  metaCustoVinculacaoUnitario: '',
};

type BpForm = typeof EMPTY_BP_FORM;

/**
 * O diálogo está aberto? E em qual modo?
 *
 * ⚠️ **`editingId` vive AQUI dentro, e não num estado paralelo** (22/09/2026).
 * Enquanto o formulário era fixo na página, "estar editando" e "o formulário
 * estar visível" eram a mesma coisa e um `string | null` bastava. Com o diálogo
 * elas se separam — existe "aberto para criar" —, e dois estados soltos
 * (`modalAberto` + `editingId`) admitiriam as duas combinações impossíveis:
 * diálogo fechado com edição pendente, e diálogo de edição sem id.
 */
type ModalState = { editingId: string | null } | null;

/**
 * Governança → **Padrões de BP** (21/09/2026).
 *
 * > *"Trazer Padrões de BP para a raiz de Governança e remover a seção
 * > Parametrizações SNEG, que não terá mais nenhuma seção. Deve ficar ao lado de
 * > Política comercial."*
 *
 * As metas por negócio (centro de lucro) que a análise compara — `%` de
 * antecipação, `%` de postecipação e custo de vinculação unitário (RN-F4-01).
 * Lê e escreve `sneg_bp_standards` pelas mesmas rotas de sempre
 * (`GET/POST /v1/sneg/bp-padroes`, `PUT`/`DELETE`/`:remover` por id).
 *
 * ## ⚠️ Mudou de casa, e fechou a tela atrás de si
 *
 * Era o ÚLTIMO bloco de `/sneg/parametrizacao`: "Campos obrigatórios" virou aba
 * própria e "Distribuição gerência → analista" foi removido, os dois em
 * 21/09/2026. Com este aqui, a tela ficou sem nenhuma seção — e por isso ela foi
 * removida junto, em vez de continuar publicada vazia. **Não recrie
 * `/sneg/parametrizacao` para "devolver" o bloco:** a tabela é a mesma, e duas
 * superfícies sobre ela divergem na primeira alteração (é a razão de cada um dos
 * três recortes acima).
 *
 * ## ⚠️ Fica AO LADO de Política comercial, e não por estética
 *
 * A aba vizinha LÊ estes dois números (`target_advance_pct` e
 * `target_unit_binding_cost` alimentam o card "Parâmetros de referência para
 * aderência"); aqui é onde eles são escritos. Quem estranha o valor exibido lá
 * tem o lugar de corrigi-lo na aba do lado — e a frase de fonte daquele card
 * aponta para cá, com este nome.
 *
 * ## ⚠️ O card se defende sozinho, com `usePermissions()`
 *
 * `Permission.SnegPadroesBpGovernanca` (`[TI Administrador]`) gateia a ABA e as
 * escritas, espelhando `SNEG_PADROES_BP_WRITE_ROLES` no backend. O gate próprio
 * existe mesmo assim porque a ROTA que hospeda a Governança é mais larga
 * (`GovernancaAccess` = três perfis): uma aba mal cabeada ofereceria "Criar" e
 * "Remover" a quem a API responde 403 — e há gate do repo cobrando isso
 * (`components/auth/write-controls.test.ts`).
 *
 * ⚠️ E o estado de leitura **mostra a tabela** — esconder o CTA nunca pode
 * esconder o FATO: as metas são o que explica a aderência reportada na análise,
 * e quem não as mantém costuma ser justamente quem precisa lê-las.
 *
 * ## ⚠️ O formulário NÃO está mais na página (22/09/2026)
 *
 * > *"deve existir um botão de adicionar e ao clicar, deve ser aberto um dialog.
 * > O editar também deve utilizar esse dialog. Não deve existir o formulário na
 * > página"*
 *
 * Criar e editar passam pelo MESMO diálogo ({@link PadraoBpModal}), aberto pelo
 * "+ Adicionar padrão" e pelo "Editar" de cada linha. **Não devolva o formulário
 * para a página**: ele ficava abaixo da tabela e servia aos dois modos, então
 * clicar em "Editar" não movia nada — só trocava um título lá embaixo — e quem
 * não reparasse seguia digitando achando que criava um padrão novo.
 */
export function PadroesBpCard({
  listBpPadroes = defaultListBpPadroes,
  createBpPadrao = defaultCreateBpPadrao,
  updateBpPadrao = defaultUpdateBpPadrao,
  deleteBpPadrao = defaultDeleteBpPadrao,
}: Props) {
  const { can } = usePermissions();
  const podeEditar = can(Permission.SnegPadroesBpGovernanca);

  const { toasts, addToast, removeToast } = useToast();
  /** Confirmação das ações destrutivas desta seção. */
  const confirm = useConfirm();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<BpPadrao[]>([]);
  const [form, setForm] = useState<BpForm>(EMPTY_BP_FORM);
  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editingId = modal?.editingId ?? null;

  const reload = useCallback(() => {
    setStatus('loading');
    listBpPadroes()
      .then((data) => {
        setItems(data.items);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listBpPadroes]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSubmit() {
    // Predicado único em `lib/sneg-admin/bp-padrao-form.ts`: a frase que a tela
    // mostra e o payload que ela manda saem do mesmo lugar. Campo numérico em
    // branco volta `null` — nunca `0` —, que é o que fazia a validação nunca
    // disparar (`Number('') === 0`, ADO 67952).
    const parsed = parseBpPadraoForm(form);
    if (!parsed) {
      setFormError(BP_PADRAO_VALIDATION_MESSAGE);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (editingId) {
        // Só as metas. `negocio` não existe no `UpdateBpPadraoDto` e o backend
        // recusa campo desconhecido com 400 — era o que derrubava TODA edição.
        await updateBpPadrao(editingId, parsed.metas);
        addToast('Padrão de BP atualizado.', 'success');
      } else {
        await createBpPadrao({ negocio: parsed.negocio, ...parsed.metas });
        addToast('Padrão de BP criado.', 'success');
      }
      fecharModal();
      reload();
    } catch (err) {
      // A frase do backend vai INLINE, nunca no toast fixo — mesma forma do
      // `catalogo-royalties-screen`. Ela nomeia o conserto, e o toast a
      // descartava: o 400 de `UNKNOWN_FIELD`, o 403 "Sem permissão para esta
      // parametrização." e o 502 (que carrega o `correlationId` da BFF —
      // VBR-583) chegavam todos como a mesma sentença opaca. Inline o usuário
      // consegue ler e printar; o toast some sozinho.
      if (err instanceof BpPadraoConflictError || err instanceof ApiValidationError) {
        setFormError(err.message);
      } else if (err instanceof Error && err.message) {
        setFormError(err.message);
      } else {
        addToast('Falha ao salvar o padrão de BP.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await deleteBpPadrao(id);
      addToast('Padrão de BP removido.', 'success');
      reload();
    } catch {
      addToast('Falha ao remover o padrão de BP.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: BpPadrao) {
    setForm({
      negocio: p.negocio,
      metaPercentualAntecipacao: String(p.metaPercentualAntecipacao),
      metaPercentualPostecipacao: String(p.metaPercentualPostecipacao),
      metaCustoVinculacaoUnitario: String(p.metaCustoVinculacaoUnitario),
    });
    setFormError(null);
    setModal({ editingId: p.id });
  }

  function abrirCriacao() {
    /*
     * ⚠️ O formulário é LIMPO ao abrir, sempre. Enquanto ele era fixo na página,
     * "Cancelar edição" era o único caminho de volta e quem esquecia dele
     * continuava vendo os valores da linha anterior; com o diálogo, reabrir sem
     * limpar traria de volta o que a última edição deixou — e o campo "Negócio",
     * destravado no modo de criação, viria preenchido com o negócio de OUTRO
     * padrão, pronto para ser salvo por engano.
     */
    setForm(EMPTY_BP_FORM);
    setFormError(null);
    setModal({ editingId: null });
  }

  function fecharModal() {
    setModal(null);
    setForm(EMPTY_BP_FORM);
    setFormError(null);
  }

  return (
    <section
      data-testid="padroes-bp-card"
      aria-label="Padrões de BP por negócio"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
    >
      {confirm.dialog}

      <header className="mb-3">
        <h2 className="text-(length:--t-h4) font-bold">Padrões de BP por negócio</h2>
        <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
          As metas com que a análise compara a proposta — mix antecipado,
          postecipado e custo de vinculação. O que for salvo passa a valer na
          hora, e fica registrado com autor e data.
        </p>
      </header>

      {status === 'loading' && (
        <div className="space-y-2" data-testid="section-loading">
          <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
          <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
          <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
        </div>
      )}

      {status === 'error' && (
        <div className="py-4" data-testid="bp-erro">
          <p className="text-(length:--t-caption) text-(--color-danger)">
            Falha ao carregar os padrões de BP.
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {status === 'loaded' && (
        <>
          {/*
            ⚠️ **ANTES da tabela, e fora do ramo do estado vazio** (22/09/2026):
            com o formulário fixo, cadastrar o primeiro padrão era possível
            mesmo sem nenhuma linha porque o formulário estava sempre lá. Com o
            diálogo, um botão que só existisse ao lado de uma linha deixaria a
            tabela vazia sem nenhum caminho para sair dela.
          */}
          {podeEditar && (
            <div className="mb-3">
              <button
                type="button"
                onClick={abrirCriacao}
                disabled={busy}
                data-testid="add-bp"
                className={PRIMARY_ACTION_BTN}
              >
                + Adicionar padrão
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-(length:--t-caption) text-(--color-text-muted)" data-testid="bp-empty">
              Nenhum padrão cadastrado — a aderência das análises ficará
              indeterminada até o primeiro cadastro.
            </p>
          ) : (
            <table className="w-full text-(length:--t-caption)" data-testid="bp-table">
              <thead>
                <tr>
                  {['Negócio', '% Antecipação', '% Postecipação', 'Custo vinculação (R$/m³)', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="border-b border-(--color-border) px-2 py-[7px] text-left text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="border-b border-(--color-border) p-2 font-bold">{p.negocio}</td>
                    <td className="border-b border-(--color-border) p-2">
                      {(p.metaPercentualAntecipacao * 100).toFixed(0)}%
                    </td>
                    <td className="border-b border-(--color-border) p-2">
                      {(p.metaPercentualPostecipacao * 100).toFixed(0)}%
                    </td>
                    <td className="border-b border-(--color-border) p-2">
                      {p.metaCustoVinculacaoUnitario.toLocaleString('pt-BR')}
                    </td>
                    <td className="border-b border-(--color-border) p-2 text-right">
                      {podeEditar && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            disabled={busy}
                            className={`mr-3 ${LINK_ACTION}`}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              confirm.ask({
                                title: 'Excluir padrão de BP?',
                                description: 'O negócio deixa de ter padrão cadastrado e a aderência passa a ser reportada como indeterminada.',
                                confirmLabel: 'Excluir',
                                tone: 'danger',
                                onConfirm: () => handleDelete(p.id),
                              })
                            }
                            disabled={busy}
                            data-testid={`remove-bp-${p.negocio}`}
                            className={LINK_ACTION_DANGER}
                          >
                            Remover
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!podeEditar && (
            <p
              data-testid="bp-somente-leitura"
              className="mt-3 text-(length:--t-small) text-(--color-text-muted)"
            >
              Somente leitura — seu perfil consulta esta tabela, mas não a altera.
            </p>
          )}
        </>
      )}

      {/*
        O formulário — em DIÁLOGO desde 22/09/2026. Ver o docblock de
        {@link PadraoBpModal}.
      */}
      {modal && (
        <PadraoBpModal
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
    </section>
  );
}

/**
 * O formulário de criar/editar um padrão de BP, em **diálogo** (22/09/2026).
 *
 * > *"deve existir um botão de adicionar e ao clicar, deve ser aberto um dialog.
 * > O editar também deve utilizar esse dialog. Não deve existir o formulário na
 * > página"*
 *
 * ## Um componente para os dois modos, como o irmão do catálogo de documentos
 *
 * Os campos são os mesmos; o que muda é se o **Negócio** está travado. Dois
 * formulários divergiriam exatamente no campo que alguém acrescentasse depois em
 * um só deles — e aqui isso seria pior que de costume, porque `parseBpPadraoForm`
 * exige os quatro.
 *
 * ## ⚠️ O que o diálogo conserta, além do pedido
 *
 * O formulário ficava **abaixo** da tabela e era o mesmo para criar e editar.
 * Clicar em "Editar" numa linha não movia a página: ele só trocava o título do
 * bloco lá embaixo e travava o "Negócio". Com a tabela crescendo, o clique não
 * parecia ter efeito — e, pior, quem não reparasse seguia digitando achando que
 * criava um padrão novo.
 *
 * ## As convenções são as dos outros diálogos da plataforma
 *
 * Fundo `role="presentation"` que fecha no clique fora, `role="dialog"` +
 * `aria-modal` + `aria-labelledby`, Escape fecha.
 *
 * ⚠️ **Falha ao salvar MANTÉM o diálogo aberto, com o que foi digitado.** A frase
 * do backend vai INLINE aqui (nunca no toast, que some sozinho): o 409 do negócio
 * duplicado, o 403 e o 502 com o `correlationId` da BFF (VBR-583) são o que nomeia
 * o conserto, e fechar o diálogo apagaria a explicação junto com o formulário.
 *
 * ⚠️ **A casca do diálogo é local, e isso é a norma deste repositório, não
 * descuido.** `analysis-window-modal`, `analista-picker-modal`, `nova-proposta-modal`
 * e ~10 outros também a declaram; não existe casca compartilhada. Se uma for
 * extraída um dia, extraia para TODOS — uma casca com um consumidor é abstração
 * antes da hora.
 */
function PadraoBpModal({
  form,
  editando,
  busy,
  erro,
  onChange,
  onCancelar,
  onSalvar,
}: {
  form: BpForm;
  editando: boolean;
  busy: boolean;
  erro: string | null;
  onChange: (f: BpForm) => void;
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

  return (
    <div
      role="presentation"
      data-testid="bp-form-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-black/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bp-form-title"
        data-testid="bp-form"
        className="relative m-auto w-full max-w-[640px] rounded-[var(--radius-md)] bg-(--color-surface) px-7 py-[26px] shadow-[0_8px_30px_rgba(0,0,0,.2)]"
      >
        <h3 id="bp-form-title" className="mb-3 text-(length:--t-h4) font-bold">
          {editando ? `Editar padrão · ${form.negocio}` : 'Novo padrão de BP'}
        </h3>

        {/*
                Rótulo VISÍVEL, não só `placeholder` + `aria-label`: o placeholder
                some no primeiro caractere digitado, então quem volta ao formulário
                para conferir não tem como saber qual campo é qual. Os quatro são
                exigidos por `parseBpPadraoForm`, daí o asterisco.
              */}
              {/*
                Grid, e não `flex flex-wrap items-start`: em flex o wrapper de cada
                campo é shrink-to-fit, então a largura do input saía do tamanho
                intrínseco dele (medido: 145px, 153px, 183px — três larguras
                diferentes para campos irmãos) e o botão, sem label acima, subia
                para a LINHA DO RÓTULO. As quatro colunas dão a mesma largura aos
                quatro campos, e os botões passam a ter linha própria. Mesmo
                formato do `limites-royalty-screen`.
              */}
              {/*
                ⚠️ Duas colunas, não quatro (22/09/2026): dentro do diálogo os
                quatro campos lado a lado ficariam com ~130px cada. A razão
                original da GRADE — dar a mesma largura aos irmãos, que em flex
                saíam com três larguras diferentes — continua valendo; o que
                mudou foi o contêiner.
              */}
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="bp-negocio" required>
                    Negócio (centro de lucro)
                  </FieldLabel>
                  <input
                    id="bp-negocio"
                    type="text"
                    required
                    value={form.negocio}
                    onChange={(e) => onChange({ ...form, negocio: e.target.value })}
                    disabled={busy || editando}
                    aria-describedby={editando ? 'bp-negocio-hint' : undefined}
                    className={IN_FIELD}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="bp-antecipacao" required>
                    % antecipação (0–1)
                  </FieldLabel>
                  {/*
                    `type="text" inputMode="decimal"`, e não `type="number"`:
                    com o input numérico o browser recusa o separador que o
                    usuário digita quando ele não é o do locale, e devolve
                    `value === ''` — o campo esvazia sozinho e a vírgula nunca
                    chega ao parser. Precedente: `limites-royalty-screen`.
                    `required`/`min`/`max` saíram porque eram inertes (não há
                    `<form>` e os botões são `type="button"`); quem valida é o
                    `parseBpPadraoForm`.
                  */}
                  <input
                    id="bp-antecipacao"
                    type="text"
                    inputMode="decimal"
                    value={form.metaPercentualAntecipacao}
                    onChange={(e) =>
                      onChange({ ...form, metaPercentualAntecipacao: e.target.value })
                    }
                    disabled={busy}
                    className={IN_FIELD}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="bp-postecipacao" required>
                    % postecipação (0–1)
                  </FieldLabel>
                  <input
                    id="bp-postecipacao"
                    type="text"
                    inputMode="decimal"
                    value={form.metaPercentualPostecipacao}
                    onChange={(e) =>
                      onChange({ ...form, metaPercentualPostecipacao: e.target.value })
                    }
                    disabled={busy}
                    className={IN_FIELD}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="bp-custo" required>
                    Custo vinculação (R$/m³)
                  </FieldLabel>
                  <input
                    id="bp-custo"
                    type="text"
                    inputMode="decimal"
                    value={form.metaCustoVinculacaoUnitario}
                    onChange={(e) =>
                      onChange({ ...form, metaCustoVinculacaoUnitario: e.target.value })
                    }
                    disabled={busy}
                    className={IN_FIELD}
                  />
                </div>
              </div>
              {/*
                Linha inteira, fora da grade. Diz POR QUE o negócio está travado —
                sem a frase, o campo cinza convida a "consertar" tornando-o
                editável, e ele é a chave do padrão (UNIQUE em
                `sneg_bp_standards.business`), que o `UpdateBpPadraoDto`
                deliberadamente não aceita. Dentro da célula do campo a frase
                quebrava em três linhas e espremia a primeira coluna.
              */}
              {editando && (
                <p
                  id="bp-negocio-hint"
                  className="mt-2 text-(length:--t-caption) text-(--color-text-muted)"
                >
                  O negócio é a chave do padrão e não muda na edição — para
                  trocá-lo, remova e cadastre de novo.
                </p>
              )}

              {/*
                ⚠️ O erro vem ANTES dos botões no diálogo, e depois deles no
                formulário antigo. Ali a página rolava e a frase ficava logo
                abaixo do que o usuário acabou de clicar; aqui o rodapé é o fim
                da caixa, e uma frase depois dele nasceria fora da área visível
                num diálogo cheio.
              */}
              {erro && (
                <p
                  className="mt-3 rounded-[var(--radius-xs)] bg-(--red-100) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
                  role="alert"
                >
                  {erro}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                {/*
                  ⚠️ "Cancelar", e não "Cancelar edição": no diálogo ele existe
                  nos DOIS modos (antes só aparecia na edição, porque na criação
                  não havia nada de que sair). E ele vem ANTES do primário, como
                  nos outros diálogos da plataforma.
                */}
                <button
                  type="button"
                  onClick={onCancelar}
                  disabled={busy}
                  className={SECONDARY_OUTLINE_BTN}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSalvar}
                  disabled={busy}
                  data-testid="save-bp"
                  className={PRIMARY_ACTION_BTN}
                >
                  {busy ? 'Salvando…' : editando ? 'Atualizar' : 'Criar'}
                </button>
              </div>
      </div>
    </div>
  );
}
