'use client';

import { useCallback, useEffect, useState } from 'react';

import { PRIMARY_ACTION_BTN } from '@/components/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { Select } from '@/components/ui/select';
import type { CampoCatalogoItem } from '@/lib/sneg-admin/sneg-admin.types';
import {
  getCamposObrigatorios as defaultGetCampos,
  putCamposObrigatorios as defaultPutCampos,
} from '@/lib/sneg-admin/sneg-admin.data';
import {
  type CamposObrigatoriosResult,
  type TipoPropostaSneg,
} from '@/lib/sneg-admin/sneg-admin.types';

type Props = {
  getCampos?: (tipo: TipoPropostaSneg) => Promise<CamposObrigatoriosResult>;
  putCampos?: (
    tipo: TipoPropostaSneg,
    campos: string[],
  ) => Promise<CamposObrigatoriosResult>;
};

type Feedback = { tom: 'ok' | 'erro'; texto: string } | null;

const TIPOS: { value: TipoPropostaSneg; label: string }[] = [
  { value: 'POSTO', label: 'Posto' },
  { value: 'FRANQUIA', label: 'Franquia' },
];

/**
 * Governança → **Campos obrigatórios** (21/09/2026).
 *
 * > *"Puxar Parametrização → Parametrização SNEG → Campos obrigatórios para a
 * > raiz de Governança. Apenas TI Administrador deve acessar e editar."*
 *
 * Quais campos da proposta a **conferência do analista** cobra, por tipo de
 * proposta (RN-F1-03 / CA-F1-02). Lê e escreve `sneg_campos_obrigatorios` pelas
 * mesmas rotas de sempre — `GET /v1/sneg/campos-obrigatorios?tipoProposta=` e
 * `PUT /v1/sneg/campos-obrigatorios/:tipo`.
 *
 * ## ⚠️ Mudou de casa; não foi copiado
 *
 * O bloco saiu de `/sneg/parametrizacao`. A tabela é a mesma, e duas superfícies
 * sobre ela divergiriam na primeira alteração — a mesma razão pela qual a aba
 * "Franquias" monta o MESMO componente da tela de origem em vez de repetir as
 * tabelas de royalty aqui.
 *
 * ⚠️ **A tela de origem não existe mais.** Horas depois deste bloco, o último
 * que restava nela (padrões de BP) também virou aba, e ela foi REMOVIDA por ter
 * ficado sem nenhuma seção.
 *
 * ## ⚠️ O card se defende sozinho, e não confia na aba
 *
 * `Permission.SnegCamposObrigatoriosGovernanca` é `[TI Administrador]` e gateia a
 * ABA **e** a edição — "acessar e editar" é uma lista só no pedido, e hoje o
 * estado de leitura não chega a renderizar. Ele existe assim mesmo porque a ROTA
 * que hospeda esta aba é mais larga (`GovernancaAccess` = três perfis): confiar
 * no gate da aba faria uma aba mal cabeada oferecer "Salvar" a quem a API
 * responde 403.
 *
 * ⚠️ E o estado de leitura **mostra a tabela** — esconder o CTA nunca pode
 * esconder o FATO. Quem não edita quase sempre precisa saber o que está exigido:
 * é a mesma regra dos painéis de análise.
 *
 * ## ⚠️ A escrita é REPLACE do conjunto inteiro daquele tipo
 *
 * `PUT` substitui o conjunto vigente de `tipoProposta` — não é patch. Por isso o
 * seletor de tipo vem junto: sem ele a aba mostraria um dos dois conjuntos sem
 * dizer qual, e salvaria sobre ele.
 *
 * ⚠️ **Análises já em curso não são reavaliadas** — o conjunto novo vale da
 * próxima conferência em diante, e a frase de sucesso diz isso.
 */
export function CamposObrigatoriosCard({
  getCampos = defaultGetCampos,
  putCampos = defaultPutCampos,
}: Props) {
  const { can } = usePermissions();
  const podeEditar = can(Permission.SnegCamposObrigatoriosGovernanca);

  const [tipo, setTipo] = useState<TipoPropostaSneg>('POSTO');
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [catalogo, setCatalogo] = useState<CampoCatalogoItem[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    getCampos(tipo)
      .then((data) => {
        setSelecionados(new Set(data.campos.map((c) => c.campo)));
        setCatalogo(data.catalogo ?? []);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [getCampos, tipo]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSalvar(): Promise<void> {
    setSalvando(true);
    setFeedback(null);
    try {
      const result = await putCampos(tipo, [...selecionados].sort());
      /*
       * O servidor é a fonte do que ficou gravado: um campo recusado pelo
       * catálogo fechado sumiria da resposta, e manter a marcação local faria a
       * tela afirmar uma exigência que a conferência não aplica.
       */
      setSelecionados(new Set(result.campos.map((c) => c.campo)));
      setCatalogo(result.catalogo ?? catalogo);
      setFeedback({
        tom: 'ok',
        texto:
          'Campos obrigatórios salvos. Valem na hora: o próximo salvamento da proposta ' +
          'passa a cobrá-los, e a próxima conferência também. As análises já em curso ' +
          'seguem com o conjunto anterior.',
      });
    } catch {
      /*
       * ⚠️ A marcação do usuário NÃO é revertida: ele acabou de montar o
       * conjunto, e limpar a tela num erro o obrigaria a refazer o trabalho para
       * tentar de novo.
       */
      setFeedback({
        tom: 'erro',
        texto: 'Não foi possível salvar os campos obrigatórios. Tente novamente.',
      });
    } finally {
      setSalvando(false);
    }
  }

  const nomeDoTipo = tipo === 'POSTO' ? 'Posto' : 'Franquia';

  return (
    <section
      data-testid="campos-obrigatorios-card"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
    >
      <header className="mb-3">
        <h2 className="text-(length:--t-h4) font-bold">
          Campos obrigatórios por tipo de proposta
        </h2>
        <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
          O que a proposta precisa ter preenchido, por tipo. Vale ao salvar a
          proposta e na conferência do analista. O que for salvo passa a valer na
          hora, e fica registrado com autor e data.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label
          htmlFor="tipo-proposta"
          className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
        >
          Tipo de proposta
        </label>
        <Select
          id="tipo-proposta"
          value={tipo}
          onChange={(v) => setTipo(v as TipoPropostaSneg)}
          options={TIPOS}
        />
      </div>

      {feedback && (
        <p
          role="status"
          data-testid="campos-feedback"
          className={`mb-3 rounded-[var(--radius-xs)] px-3 py-2 text-(length:--t-caption) ${
            feedback.tom === 'ok'
              ? 'bg-(--secondary-100) text-(--secondary-700)'
              : 'bg-(--red-100) text-(--color-danger)'
          }`}
        >
          {feedback.texto}
        </p>
      )}

      {status === 'loading' && (
        <p className="py-4 text-(length:--t-caption) text-(--color-text-muted)">
          Carregando os campos obrigatórios…
        </p>
      )}

      {status === 'error' && (
        <div data-testid="campos-erro" className="py-4">
          <p className="text-(length:--t-caption) text-(--color-danger)">
            Não foi possível carregar os campos obrigatórios.
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

      {/*
        * ⚠️ O catálogo vem do backend desde 22/09/2026. Num skew de deploy (web
        * novo contra API anterior) ele chega vazio, e uma `<ul>` sem itens se lê
        * como "os campos sumiram" — a mesma classe do cabeçalho de tabela sem
        * linha na 360º. Aqui a ausência é NOMEADA.
        */}
      {status === 'loaded' && catalogo.length === 0 && (
        <p
          data-testid="campos-catalogo-vazio"
          className="py-4 text-(length:--t-caption) text-(--color-text-muted)"
        >
          O catálogo de campos não veio da API. Recarregue a página; se persistir,
          é sinal de versões diferentes entre o site e o serviço.
        </p>
      )}

      {status === 'loaded' && catalogo.length > 0 && (
        <>
          <ul
            className="grid grid-cols-1 gap-1 sm:grid-cols-2"
            data-testid="campos-list"
          >
            {catalogo.map((item) => (
              <li key={item.campo}>
                <label className="flex items-start gap-2 py-1 text-(length:--t-caption)">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={item.travado || selecionados.has(item.campo)}
                    /*
                     * ⚠️ O travado é desabilitado AQUI e recusado pela API — a
                     * tela sozinha não é a trava. Ver `validarConjuntoParametrizado`.
                     */
                    disabled={!podeEditar || item.travado}
                    data-testid={`campo-${item.campo}`}
                    onChange={(e) =>
                      setSelecionados((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(item.campo);
                        else next.delete(item.campo);
                        return next;
                      })
                    }
                  />
                  <span>
                    {item.label}
                    {item.travado && (
                      <span
                        className="ml-1 text-(--color-text-muted)"
                        title={item.motivoTrava ?? undefined}
                        data-testid={`trava-${item.campo}`}
                      >
                        · sempre obrigatório
                      </span>
                    )}
                    {/*
                      * O campo sem superfície de cobrança não tem formulário que
                      * o produza (vem do ARP, do checklist, ou é derivado). Sem
                      * esta linha a tela prometeria um gate que não existe —
                      * que foi exatamente como este pedido chegou.
                      */}
                    {!item.travado && item.cobranca.length === 0 && (
                      <span
                        className="ml-1 text-(--color-text-muted)"
                        data-testid={`so-conferencia-${item.campo}`}
                      >
                        · só na conferência
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-(length:--t-small) text-(--color-text-muted)">
              {selecionados.size} campo(s) obrigatório(s) para {nomeDoTipo}
            </span>
            {podeEditar ? (
              <button
                type="button"
                onClick={() => void handleSalvar()}
                disabled={salvando}
                data-testid="save-campos"
                className={PRIMARY_ACTION_BTN}
              >
                {salvando ? 'Salvando…' : 'Salvar campos'}
              </button>
            ) : (
              <span
                data-testid="campos-somente-leitura"
                className="text-(length:--t-small) text-(--color-text-muted)"
              >
                Somente leitura — seu perfil consulta esta tabela, mas não a altera.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
