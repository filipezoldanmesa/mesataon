'use client';

import { useCallback, useEffect, useState } from 'react';

import { ToastContainer, useToast } from '@/components/toast';
import { SomenteLeituraHint } from '@/components/franquia-admin/somente-leitura-hint';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  listLimitesRoyalty as defaultList,
  upsertLimiteRoyalty as defaultUpsert,
} from '@/lib/franquia-admin/franquia-admin.data';
import type {
  LimiteRoyaltyParametrizacao,
  LimiteRoyaltyParametrizacaoList,
  UpsertLimiteRoyaltyParametrizacaoPayload,
} from '@/lib/franquia-admin/franquia-admin.types';
import {
  BANDEIRA_FRANQUIA_LABEL,
  BandeiraFranquia,
} from '@/lib/franquia/types';
import { bandeiraTemTeto } from '@/lib/franquia/nova-proposta-franquia';
import { formatBrlString, maskMoneyInput, parseMoneyInput } from '@/lib/franquia/format';
import { PRIMARY_ACTION_BTN, SECONDARY_OUTLINE_BTN } from '@/components/button';
import { IN_FIELD } from '@/components/ui/field-classes';
import { FieldLabel } from '@/components/ui/field-label';

type Props = {
  listLimitesRoyalty?: () => Promise<LimiteRoyaltyParametrizacaoList>;
  upsertLimiteRoyalty?: (
    payload: UpsertLimiteRoyaltyParametrizacaoPayload,
  ) => Promise<LimiteRoyaltyParametrizacao>;
};

type LoadStatus = 'loading' | 'loaded' | 'error';

/** Formulário de UMA bandeira — tudo string, como todo formulário do repo. */
type FormBandeira = {
  royaltyMinimoPerc: string;
  fundoMktMinimoPerc: string;
  valorFixo: string;
  fundoMktValorFixo: string;
  piso: string;
  teto: string;
  valorMinimoMensal: string;
  descricao: string;
};

const FORM_VAZIO: FormBandeira = {
  royaltyMinimoPerc: '',
  fundoMktMinimoPerc: '',
  valorFixo: '',
  fundoMktValorFixo: '',
  piso: '',
  teto: '',
  valorMinimoMensal: '',
  descricao: '',
};

/** As duas bandeiras, na ordem em que o ticket as nomeia. */
const BANDEIRAS: readonly BandeiraFranquia[] = [
  BandeiraFranquia.BrMania,
  BandeiraFranquia.LubraxMais,
];

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

/** `350` bps → `"3,50"`. `null` ⇒ campo vazio, nunca `"0"`. */
function bpsParaPercentual(bps: number | null): string {
  return bps === null ? '' : (bps / 100).toFixed(2).replace('.', ',');
}

/**
 * `"3,50"` → `350` bps. Devolve `undefined` quando o texto não é número — o
 * chamador recusa nomeando o campo em vez de gravar um patamar silenciosamente
 * errado.
 */
function percentualParaBps(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (limpo === '') return null;
  const valor = Number(limpo.replace(',', '.'));
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) return undefined;
  return Math.round(valor * 100);
}

/** `"20000.00"` → o texto mascarado que o input de moeda espera. */
function decimalParaMascara(valor: string | null): string {
  if (valor === null) return '';
  return maskMoneyInput(String(Math.round(Number(valor) * 100)));
}

function SectionLoading() {
  return (
    <div className="space-y-2" data-testid="limites-royalty-loading">
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
    </div>
  );
}

/**
 * Tela de parametrização da **estrutura de royalties (limites)** — ADO 67867.
 *
 * ## Por que esta tela existe
 *
 * Os seis patamares (royalty mínimo, fundo de marketing mínimo, valor fixo,
 * piso, teto e valor mínimo mensal) eram digitados **na proposta de franquia**,
 * atrás de um "Editar como time de franquia". Foi assim que um Consultor de
 * Expansão gravou `1111` em "Royalty mínimo (%)" e `200` em "Fundo de marketing
 * mínimo (%)" na UAT: campo aberto, sem teto de sanidade e sem dono.
 *
 * O PRD sempre disse que o dono é a política: o dicionário "estrutura de
 * royalties (limites)" do PRD de Franquias marca **Origem/Master = Política**
 * nos cinco campos, e a RN-F2-04 / RN-F11-01 pedem essa política "mantida por
 * perfil autorizado na seção administrativa e aplicada automaticamente aos
 * campos da proposta".
 *
 * ## Duas bandeiras, dois cartões
 *
 * "Essa tabela precisa ser separada com separação para BR Mania e Lubrax+" — e a
 * separação é visual **e** de chave: cada bandeira é uma linha própria da tabela,
 * e não há fallback de uma para a outra (as políticas comerciais são distintas).
 * Renderizar as duas em cartões separados em vez de uma tabela com coluna
 * "Bandeira" é o que o ticket pede, e resolve o caso mais comum: só uma das duas
 * parametrizada.
 *
 * ⚠️ **Lubrax+ não tem "Teto máximo"** — o protótipo esconde o `#tetoWrap` para
 * `?t=lubrax`, a API recusa com 400 e o schema tem CHECK. O campo simplesmente
 * não é oferecido ali.
 *
 * Acesso: `RequirePermission(FranquiaLimiteRoyaltyManage)` no pai — BP
 * Financeiro, TI Administrador e Gestor de Franquias. Eram os QUATRO perfis do
 * ADO 67867; a SNEG saiu em 21/09/2026 porque esta página é cartão da Governança
 * e o negócio tirou a SNEG de toda superfície de governança. O gate segue por
 * CARTÃO e não pela rota: as listas dos cartões vizinhos continuam diferentes.
 *
 * Linha não se apaga: o domínio de chaves é fechado (duas bandeiras) e remover
 * não zeraria uma política — deixaria a bandeira sem patamar nenhum. Limpar um
 * **campo** (deixá-lo vazio) é suportado e significa "esta bandeira não tem esse
 * patamar".
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
export const LIMITES_ROYALTY_TITULO = 'Estrutura de Royalties · Limites';

export function LimitesRoyaltyScreen({
  listLimitesRoyalty = defaultList,
  upsertLimiteRoyalty = defaultUpsert,
}: Props) {
  const { toasts, addToast, removeToast } = useToast();
  /*
   * Matriz RBAC v2.1 (28/09/2026): o SPCOM só LÊ esta tabela — os
   * campos ficam travados (mostram o valor vigente) e o "Salvar" some.
   */
  const { can } = usePermissions();
  const podeEditar = can(Permission.FranquiaLimiteRoyaltyManage);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<LimiteRoyaltyParametrizacao[]>([]);
  const [forms, setForms] = useState<Record<string, FormBandeira>>({});
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [salvando, setSalvando] = useState<BandeiraFranquia | null>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    listLimitesRoyalty()
      .then((data) => {
        setItems(data.items);
        const proximos: Record<string, FormBandeira> = {};
        for (const bandeira of BANDEIRAS) {
          const linha = data.items.find((i) => i.bandeira === bandeira);
          proximos[bandeira] =
            linha === undefined
              ? { ...FORM_VAZIO }
              : {
                  royaltyMinimoPerc: bpsParaPercentual(linha.royaltyMinimoBps),
                  fundoMktMinimoPerc: bpsParaPercentual(linha.fundoMktMinimoBps),
                  valorFixo: decimalParaMascara(linha.valorFixoBrl),
                  fundoMktValorFixo: decimalParaMascara(linha.fundoMktValorFixoBrl),
                  piso: decimalParaMascara(linha.pisoBrl),
                  teto: decimalParaMascara(linha.tetoBrl),
                  valorMinimoMensal: decimalParaMascara(linha.valorMinimoMensalBrl),
                  descricao: linha.descricao ?? '',
                };
        }
        setForms(proximos);
        setErros({});
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listLimitesRoyalty]);

  useEffect(() => {
    reload();
  }, [reload]);

  function set(bandeira: BandeiraFranquia, patch: Partial<FormBandeira>) {
    setForms((prev) => ({
      ...prev,
      [bandeira]: { ...(prev[bandeira] ?? FORM_VAZIO), ...patch },
    }));
  }

  async function salvar(bandeira: BandeiraFranquia) {
    const form = forms[bandeira] ?? FORM_VAZIO;
    setErros((prev) => ({ ...prev, [bandeira]: null }));

    const royaltyMinimoBps = percentualParaBps(form.royaltyMinimoPerc);
    if (royaltyMinimoBps === undefined) {
      setErros((prev) => ({
        ...prev,
        [bandeira]: 'Royalty mínimo deve ser um percentual entre 0 e 100.',
      }));
      return;
    }
    const fundoMktMinimoBps = percentualParaBps(form.fundoMktMinimoPerc);
    if (fundoMktMinimoBps === undefined) {
      setErros((prev) => ({
        ...prev,
        [bandeira]: 'Fundo de marketing mínimo deve ser um percentual entre 0 e 100.',
      }));
      return;
    }

    /*
     * Substituição completa, nunca merge: um campo vazio vira `null` explícito e
     * limpa o patamar. Sem isso, um valor digitado por engano ficaria impossível
     * de desfazer pela tela — que é exatamente o estado que este ticket veio
     * consertar.
     */
    const payload: UpsertLimiteRoyaltyParametrizacaoPayload = {
      bandeira,
      royaltyMinimoBps,
      fundoMktMinimoBps,
      valorFixoBrl: parseMoneyInput(form.valorFixo),
      fundoMktValorFixoBrl: parseMoneyInput(form.fundoMktValorFixo),
      pisoBrl: parseMoneyInput(form.piso),
      // Lubrax+ não tem teto — nunca envia o campo, mesmo que algo o tenha
      // preenchido: a API recusaria com 400 e a recusa não seria acionável.
      tetoBrl: bandeiraTemTeto(bandeira) ? parseMoneyInput(form.teto) : null,
      valorMinimoMensalBrl: parseMoneyInput(form.valorMinimoMensal),
      descricao: form.descricao.trim() === '' ? null : form.descricao.trim(),
    };

    setSalvando(bandeira);
    try {
      await upsertLimiteRoyalty(payload);
      addToast(
        `Limites de ${BANDEIRA_FRANQUIA_LABEL[bandeira]} salvos — valem imediatamente ` +
          'para as próximas propostas.',
        'success',
      );
      reload();
    } catch (err) {
      // A frase do backend vai verbatim: é ela que nomeia o limite recusado.
      if (err instanceof Error) {
        setErros((prev) => ({ ...prev, [bandeira]: err.message }));
      } else {
        addToast('Falha ao salvar os limites de royalty.', 'error');
      }
    } finally {
      setSalvando(null);
    }
  }

  return (
    <>
      <h2 className="mt-2 text-(length:--t-h3) font-bold">
        {LIMITES_ROYALTY_TITULO}
      </h2>
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        Os limites de royalty de cada bandeira são definidos aqui. Na proposta de
        franquia eles aparecem somente para leitura, e o piso, o teto e o valor
        mínimo mensal são preenchidos sozinhos assim que o modelo de loja é
        cadastrado. Toda alteração fica registrada com autor e data.
      </p>

      <div className="mt-6">
        {status === 'loading' && <SectionLoading />}
        {status === 'error' && (
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-6">
            <p className="text-(length:--t-caption) text-(--color-danger)">
              Falha ao carregar a parametrização de limites de royalty.
            </p>
            <button type="button" onClick={reload} className={`${ghostBtnCls} mt-3`}>
              Tentar novamente
            </button>
          </div>
        )}

        {status === 'loaded' && !podeEditar && <SomenteLeituraHint />}
        {status === 'loaded' && (
          <div className="space-y-5">
            {BANDEIRAS.map((bandeira) => {
              const form = forms[bandeira] ?? FORM_VAZIO;
              const linha = items.find((i) => i.bandeira === bandeira);
              const erro = erros[bandeira] ?? null;
              const ocupado = salvando !== null;

              return (
                <section
                  key={bandeira}
                  data-testid={`limites-royalty-card-${bandeira}`}
                  className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4"
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-(length:--t-caption) font-bold">
                      {BANDEIRA_FRANQUIA_LABEL[bandeira]}
                    </h3>
                    {/*
                     * "Não parametrizado" é informação, não um cartão vazio: sem
                     * essa frase a bandeira sem linha lê igual a uma com todos os
                     * patamares zerados, que é outra política.
                     */}
                    <span
                      className="text-(length:--t-small) text-(--color-text-muted)"
                      data-testid={`limites-royalty-estado-${bandeira}`}
                    >
                      {linha === undefined
                        ? 'Ainda não parametrizada.'
                        : `Piso ${formatBrlString(linha.pisoBrl) ?? '—'} · Teto ${
                            formatBrlString(linha.tetoBrl) ?? '—'
                          }`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <FieldLabel htmlFor={`lr-${bandeira}-royalty-minimo`}>
                        Royalty mínimo (%)
                      </FieldLabel>
                      <input
                        id={`lr-${bandeira}-royalty-minimo`}
                        data-testid={`lr-${bandeira}-royalty-minimo`}
                        className={inputCls}
                        type="text"
                        inputMode="decimal"
                        placeholder="—"
                        value={form.royaltyMinimoPerc}
                        disabled={ocupado || !podeEditar}
                        onChange={(e) =>
                          set(bandeira, { royaltyMinimoPerc: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor={`lr-${bandeira}-fundo-minimo`}>
                        Fundo de marketing mínimo (%)
                      </FieldLabel>
                      <input
                        id={`lr-${bandeira}-fundo-minimo`}
                        data-testid={`lr-${bandeira}-fundo-minimo`}
                        className={inputCls}
                        type="text"
                        inputMode="decimal"
                        placeholder="—"
                        value={form.fundoMktMinimoPerc}
                        disabled={ocupado || !podeEditar}
                        onChange={(e) =>
                          set(bandeira, { fundoMktMinimoPerc: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor={`lr-${bandeira}-valor-fixo`}>
                        Valor fixo
                      </FieldLabel>
                      <input
                        id={`lr-${bandeira}-valor-fixo`}
                        data-testid={`lr-${bandeira}-valor-fixo`}
                        className={inputCls}
                        type="text"
                        inputMode="numeric"
                        placeholder="R$ 0,00"
                        value={form.valorFixo}
                        disabled={ocupado || !podeEditar}
                        onChange={(e) =>
                          set(bandeira, { valorFixo: maskMoneyInput(e.target.value) })
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor={`lr-${bandeira}-fundo-valor-fixo`}>
                        Valor fixo do fundo de MKT
                      </FieldLabel>
                      <input
                        id={`lr-${bandeira}-fundo-valor-fixo`}
                        data-testid={`lr-${bandeira}-fundo-valor-fixo`}
                        className={inputCls}
                        type="text"
                        inputMode="numeric"
                        placeholder="R$ 0,00"
                        value={form.fundoMktValorFixo}
                        disabled={ocupado || !podeEditar}
                        onChange={(e) =>
                          set(bandeira, {
                            fundoMktValorFixo: maskMoneyInput(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor={`lr-${bandeira}-piso`}>
                        Piso mínimo
                      </FieldLabel>
                      <input
                        id={`lr-${bandeira}-piso`}
                        data-testid={`lr-${bandeira}-piso`}
                        className={inputCls}
                        type="text"
                        inputMode="numeric"
                        placeholder="R$ 0,00"
                        value={form.piso}
                        disabled={ocupado || !podeEditar}
                        onChange={(e) =>
                          set(bandeira, { piso: maskMoneyInput(e.target.value) })
                        }
                      />
                    </div>

                    {/* Lubrax+ não tem teto máximo (protótipo `#tetoWrap`). */}
                    {bandeiraTemTeto(bandeira) && (
                      <div>
                        <FieldLabel htmlFor={`lr-${bandeira}-teto`}>
                        Teto máximo
                      </FieldLabel>
                        <input
                          id={`lr-${bandeira}-teto`}
                          data-testid={`lr-${bandeira}-teto`}
                          className={inputCls}
                          type="text"
                          inputMode="numeric"
                          placeholder="R$ 0,00"
                          value={form.teto}
                          disabled={ocupado || !podeEditar}
                          onChange={(e) =>
                            set(bandeira, { teto: maskMoneyInput(e.target.value) })
                          }
                        />
                      </div>
                    )}

                    <div>
                      <FieldLabel htmlFor={`lr-${bandeira}-valor-minimo-mensal`}>
                        Valor mínimo mensal
                      </FieldLabel>
                      <input
                        id={`lr-${bandeira}-valor-minimo-mensal`}
                        data-testid={`lr-${bandeira}-valor-minimo-mensal`}
                        className={inputCls}
                        type="text"
                        inputMode="numeric"
                        placeholder="R$ 0,00"
                        value={form.valorMinimoMensal}
                        disabled={ocupado || !podeEditar}
                        onChange={(e) =>
                          set(bandeira, {
                            valorMinimoMensal: maskMoneyInput(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <FieldLabel htmlFor={`lr-${bandeira}-descricao`}>
                        Observação
                      </FieldLabel>
                      <input
                        id={`lr-${bandeira}-descricao`}
                        data-testid={`lr-${bandeira}-descricao`}
                        className={inputCls}
                        type="text"
                        placeholder="ex.: Padrão Comercial 2026 (PG-1BR-00019)"
                        value={form.descricao}
                        disabled={ocupado || !podeEditar}
                        onChange={(e) => set(bandeira, { descricao: e.target.value })}
                      />
                    </div>
                  </div>

                  {erro !== null && (
                    <p
                      className="mt-3 text-(length:--t-caption) text-(--color-danger)"
                      data-testid={`limites-royalty-erro-${bandeira}`}
                    >
                      {erro}
                    </p>
                  )}

                  {podeEditar && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => void salvar(bandeira)}
                        disabled={ocupado || !podeEditar}
                        className={primaryBtnCls}
                        data-testid={`limites-royalty-salvar-${bandeira}`}
                      >
                        {salvando === bandeira
                          ? 'Salvando…'
                          : `Salvar limites de ${BANDEIRA_FRANQUIA_LABEL[bandeira]}`}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
}
