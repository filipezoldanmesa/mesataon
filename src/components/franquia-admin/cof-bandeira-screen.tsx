'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PRIMARY_ACTION_BTN, SECONDARY_OUTLINE_BTN } from '@/components/button';
import { ToastContainer, useToast } from '@/components/toast';
import { SomenteLeituraHint } from '@/components/franquia-admin/somente-leitura-hint';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { Select } from '@/components/ui/select';
import { IN_FIELD } from '@/components/ui/field-classes';
import { FieldLabel } from '@/components/ui/field-label';
import {
  cofTemplateDownloadHref as defaultDownloadHref,
  criarCofTemplate as defaultCriar,
  listCofTemplates as defaultList,
} from '@/lib/franquia-admin/franquia-admin.data';
import type {
  CofTemplate,
  CofTemplateList,
} from '@/lib/franquia-admin/franquia-admin.types';
import { nomeDeArquivoSeguro } from '@/lib/arquivo/nome-de-arquivo';

type Props = {
  listCofTemplates?: () => Promise<CofTemplateList>;
  criarCofTemplate?: (input: {
    bandeira: string;
    observacoes?: string;
    file: File;
  }) => Promise<CofTemplateList>;
  cofTemplateDownloadHref?: (templateId: string) => string;
};

type LoadStatus = 'loading' | 'loaded' | 'error';

const thCls =
  'border-b border-(--color-border) px-2 py-[7px] text-left text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)';
const tdCls = 'border-b border-(--color-border) p-2';

/**
 * Título da seção — também é o rótulo da aba, importado dela pela mesma razão
 * das irmãs: dois literais para a mesma coisa na mesma página já derivaram uma
 * vez, e clicar numa aba para chegar a um título com outro nome lê como se ela
 * tivesse levado para outro lugar.
 */
export const COF_BANDEIRA_TITULO = 'COF por Bandeira';

function SectionLoading() {
  return (
    <div className="space-y-2" data-testid="cof-loading">
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
      <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
    </div>
  );
}

function formatTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

/**
 * Cadastro da COF (Circular de Oferta de Franquia) por bandeira — a aba que a
 * Governança usa (17/09/2026).
 *
 * > *"Em contratos Lubrax+ e BR Mania temos que anexar um documento no contrato
 * > deles que é a COF. Aí em governança, a gente precisa ter o cadastro da COF,
 * > pra cada uma das franquias."* — e, na confirmação: *"Padrão por bandeira. […]
 * > O upload do arquivo da COF por bandeira. Se existir uma seção de franquias,
 * > br mania ou lubrax, deve ficar nessas seções."*
 *
 * ## O que a tela NÃO oferece, e por quê
 *
 * Não há **editar** nem **remover**. A COF entregue a um franqueado é a prova do
 * cumprimento do prazo da Lei 13.966/2019, e a oportunidade dele aponta para
 * aquela versão: reescrever o arquivo no lugar trocaria, em silêncio, o
 * documento de todo mundo que já a recebeu, e o novo é indistinguível do antigo
 * a olho nu. Errou o arquivo? Sobe a versão seguinte. A errada fica na lista,
 * com autor e data — que é o que a trilha SOX pede.
 *
 * ## A bandeira SEM COF aparece, e é o ponto
 *
 * Bandeira sem nenhuma versão é renderizada com a lacuna nomeada: naquele
 * estado, nenhuma oportunidade daquela bandeira recebe COF nenhuma. Omitir o
 * bloco esconderia justamente o que a tela existe para mostrar.
 */
export function CofBandeiraScreen({
  listCofTemplates = defaultList,
  criarCofTemplate = defaultCriar,
  cofTemplateDownloadHref = defaultDownloadHref,
}: Props) {
  const { toasts, addToast, removeToast } = useToast();
  /*
   * Mesmo gate da aba (`TAB_PERMISSION.cof`). Matriz RBAC v2.1 (28/09/2026):
   * o SPCOM LÊ e BAIXAM as versões; publicar é de quem executa.
   */
  const { can } = usePermissions();
  const podePublicar = can(Permission.FranquiaParametrizacaoManage);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [lista, setLista] = useState<CofTemplateList>({ bandeiras: [] });
  const [bandeira, setBandeira] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    listCofTemplates()
      .then((data) => {
        setLista(data);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listCofTemplates]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCriar() {
    setFormError(null);
    if (bandeira === '') {
      setFormError('Bandeira é obrigatória.');
      return;
    }
    if (arquivo === null) {
      setFormError('Selecione o PDF da COF.');
      return;
    }

    setBusy(true);
    try {
      const atualizada = await criarCofTemplate({
        bandeira,
        observacoes: observacoes.trim() === '' ? undefined : observacoes.trim(),
        file: arquivo,
      });
      setLista(atualizada);
      setStatus('loaded');
      addToast(
        'COF cadastrada — passa a valer nas próximas oportunidades desta bandeira.',
        'success',
      );
      setBandeira('');
      setObservacoes('');
      setArquivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      // A frase do backend é exibida verbatim: é ela que nomeia o que recusou
      // (tipo de arquivo, tamanho, bandeira).
      if (err instanceof Error) setFormError(err.message);
      else addToast('Falha ao cadastrar a COF.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mt-2 text-(length:--t-h3) font-bold">{COF_BANDEIRA_TITULO}</h2>
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        A Circular de Oferta de Franquia é um documento padrão por bandeira. Ao
        enviar a oportunidade para análise, a versão vigente da bandeira da
        proposta é anexada aos documentos da oportunidade — e é ela que segue para
        o contrato depois da assinatura. Publicar uma versão nova não altera o que
        já foi entregue.
      </p>

      <div className="mt-6">
        {status === 'loading' && <SectionLoading />}
        {status === 'error' && (
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-6">
            <p className="text-(length:--t-caption) text-(--color-danger)">
              Falha ao carregar o catálogo da COF.
            </p>
            <button
              type="button"
              onClick={reload}
              className={`${SECONDARY_OUTLINE_BTN} mt-3`}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {status === 'loaded' && (
          <>
            {lista.bandeiras.map((grupo) => (
              <section key={grupo.bandeira} className="mb-8" data-testid={`cof-${grupo.bandeira}`}>
                <h3 className="text-(length:--t-body) font-bold">{grupo.bandeiraLabel}</h3>

                {grupo.versoes.length === 0 ? (
                  <p
                    className="mt-1 text-(length:--t-caption) text-(--yellow-700)"
                    data-testid={`cof-vazia-${grupo.bandeira}`}
                  >
                    Nenhuma COF cadastrada para esta bandeira — enquanto estiver
                    assim, as oportunidades dela seguem para análise sem a Circular
                    anexada.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table
                      className="w-full text-(length:--t-caption)"
                      data-testid={`cof-table-${grupo.bandeira}`}
                    >
                      <thead>
                        <tr>
                          {['Versão', 'Arquivo', 'Tamanho', 'Observação', 'Cadastrada por', 'Em', ''].map(
                            (h, i) => (
                              <th key={i} className={thCls}>
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.versoes.map((versao: CofTemplate) => (
                          <tr key={versao.id}>
                            <td className={`${tdCls} font-bold whitespace-nowrap`}>
                              v{versao.versao}
                              {versao.vigente && (
                                <span
                                  className="ml-2 rounded-full bg-(--secondary-500) px-2 py-[2px] text-[11px] font-bold text-white"
                                  data-testid={`cof-vigente-${grupo.bandeira}`}
                                >
                                  Vigente
                                </span>
                              )}
                            </td>
                            <td className={tdCls}>{versao.fileName}</td>
                            <td className={tdCls}>{formatTamanho(versao.sizeBytes)}</td>
                            <td className={tdCls}>{versao.observacoes ?? '—'}</td>
                            <td className={tdCls}>{versao.cadastradaPor ?? '—'}</td>
                            <td className={tdCls}>{formatData(versao.cadastradaEm)}</td>
                            <td className={`${tdCls} text-right whitespace-nowrap`}>
                              {/*
                                `withBasePath` é aplicado DENTRO de
                                `cofTemplateDownloadHref` — string crua aqui
                                funciona no laptop e responde 404 em todos os
                                ambientes. E o `download` leva o nome saneado,
                                nunca o `fileName` cru: ele é o nome sugerido no
                                "Salvar como".
                              */}
                              <a
                                href={cofTemplateDownloadHref(versao.id)}
                                download={nomeDeArquivoSeguro(versao.fileName) ?? true}
                                className="font-bold text-(--secondary-600) hover:underline"
                                data-testid={`cof-baixar-${versao.id}`}
                              >
                                Baixar
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}

            {podePublicar ? (
              <div className="mt-6 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) p-4">
                <p className="mb-3 text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
                  Publicar nova versão
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <FieldLabel htmlFor="cof-form-bandeira" required>
                      Bandeira
                    </FieldLabel>
                    {/*
                      Valor de picklist nunca nasce escolhido: a bandeira decide
                      qual franqueado recebe este documento, e um default
                      plausível seria indistinguível de uma escolha.
                    */}
                    <Select
                      id="cof-form-bandeira"
                      required
                      data-testid="cof-form-bandeira"
                      value={bandeira}
                      onChange={(v) => setBandeira(v)}
                      options={lista.bandeiras.map((g) => ({
                        value: g.bandeira,
                        label: g.bandeiraLabel,
                      }))}
                      placeholder="Selecione…"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="cof-form-file" required>
                      Arquivo (PDF)
                    </FieldLabel>
                    <input
                      id="cof-form-file"
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      data-testid="cof-form-file"
                      onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                      className={IN_FIELD}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="cof-form-observacoes">Observação</FieldLabel>
                    <input
                      id="cof-form-observacoes"
                      type="text"
                      data-testid="cof-form-observacoes"
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="ex.: revisão jurídica de set/2026"
                      className={IN_FIELD}
                    />
                  </div>
                </div>

                {formError !== null && (
                  <p
                    className="mt-3 text-(length:--t-caption) text-(--color-danger)"
                    data-testid="cof-form-error"
                  >
                    {formError}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCriar}
                    disabled={busy}
                    data-testid="cof-form-salvar"
                    className={PRIMARY_ACTION_BTN}
                  >
                    {busy ? 'Enviando…' : 'Publicar versão'}
                  </button>
                </div>
              </div>
            ) : (
              <SomenteLeituraHint />
            )}
          </>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
}
