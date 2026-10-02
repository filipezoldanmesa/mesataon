'use client';

import { useCallback, useState } from 'react';

import { useConfirm } from '@/components/confirm-dialog';
import { StatusPill } from '@/components/status-pill';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  AddRowButton,
  Block,
  LockChip,
  SectionUnavailable,
} from '@/components/franquia/franquia-ui';
import { ExcecaoModal } from '@/components/franquia/proposta-franquia-modais';
import {
  createExcecao as defaultCreateExcecao,
  updateExcecao as defaultUpdateExcecao,
  deleteExcecao as defaultDeleteExcecao,
} from '@/lib/franquia/parametros.data';
import type {
  EstruturaExcecoesData,
  ExcecaoRoyaltyItem,
  FrqSectionResult,
} from '@/lib/franquia/proposta-franquia-mapping';
import {
  formatBrlString,
  formatDateBR,
  maskMoneyInput,
  parseMoneyInput,
} from '@/lib/franquia/format';
import { BlocoFranquia } from '@/lib/franquia/ajuste';
import {
  EXCECAO_TIPOS_OFERECIDOS,
  ExcecaoTipo,
  excecaoTemValor,
  excecaoTiposParaBandeira,
  type ExcecaoRascunho,
} from '@/lib/franquia/nova-proposta-franquia';
import { BandeiraFranquia } from '@/lib/franquia/types';

/*
 * The local list that used to live here is gone. Its own docstring warned that
 * "two lists for one domain was the stale pattern" and it then became the
 * second list: `excecaoTiposParaBandeira` and this fallback drifted apart, so
 * dropping `CESSAO` from the band filter would have left it still on offer
 * whenever the band had not resolved. Both paths now read
 * `EXCECAO_TIPOS_OFERECIDOS`.
 */

type Props = {
  opportunityId: string;
  proposalId: string;
  estrutura: FrqSectionResult<EstruturaExcecoesData>;
  /**
   * `vereditos.editavelPorFranquia.excecoesProgramadas` (RN-F2-06 · ADO 67802).
   *
   * ⚠️ **Não** é `estruturaExcecoes`, que apesar do nome governa só os LIMITES
   * do royalty. Este veredito é o único que conhece a FASE da proposta: ele é
   * `true` para o LT enquanto ela está em preenchimento ou devolvida, e para o
   * time de franquia em qualquer fase.
   */
  editavel: boolean;
  /**
   * Band of the proposal — Lubrax+ has no "Teto máximo" (the prototype drops
   * it from the list when `?t=lubrax`). `undefined` while the read model has
   * not resolved: then every type is offered and the backend stays the
   * authority, because hiding an option because of an incomplete read is worse
   * than letting the API refuse.
   */
  bandeira?: BandeiraFranquia;
  onChanged: () => void;
  createExcecao?: typeof defaultCreateExcecao;
  updateExcecao?: typeof defaultUpdateExcecao;
  deleteExcecao?: typeof defaultDeleteExcecao;
};

/**
 * "Exceções Programadas" block (FRQ-12).
 *
 * A lista é dado; criar e alterar passam pelo `ExcecaoModal`, o MESMO da tela
 * de criação — o tipo é escolhido numa picklist recortada por bandeira
 * (Lubrax+ não tem "Teto máximo") via `excecaoTiposParaBandeira`, um predicado
 * para as duas telas.
 *
 * ## Quem pode escrever (ADO 67802)
 *
 * Dois gates, e os dois são necessários:
 *
 * - `Permission.FranquiaExcecaoManage` é o **piso** — o perfil. Espelha o
 *   `@Roles(LT, GestorFranquias, ConsultorExpansao, ADMIN)` das rotas.
 * - `editavel` (`vereditos.editavelPorFranquia.excecoesProgramadas`) é o
 *   **teto** — ele conhece a FASE da proposta, que a permissão não enxerga: o
 *   LT deixa de alterar quando a proposta entra em análise, e o time de
 *   franquia mantém o acesso.
 *
 * ⚠️ Até 26/08/2026 o gate era `Permission.FranquiaRoyaltyOverride` +
 * `estruturaExcecoes`, e o LT ficava de fora dos dois: o card renderizava com
 * o `LockChip` "Time de franquia", sem Adicionar, sem Editar e sem Remover —
 * exatamente o que o ADO 67802 relatou.
 */
export function ExcecoesSection({
  opportunityId,
  proposalId,
  estrutura,
  editavel,
  bandeira,
  onChanged,
  createExcecao = defaultCreateExcecao,
  updateExcecao = defaultUpdateExcecao,
  deleteExcecao = defaultDeleteExcecao,
}: Props) {
  const { can, canWrite } = usePermissions();
  const confirm = useConfirm();

  const temPerfil = canWrite && can(Permission.FranquiaExcecaoManage);
  const podeEditar = temPerfil && editavel;

  // Same band recorte the creation screen applies (`excecaoTiposParaBandeira`) —
  // one rule, two screens. An unresolved band offers every OFFERABLE type: the
  // backend remains the authority and a refusal there is better than an option
  // hidden because a read was incomplete. What is not offerable at all
  // (`CESSAO`) is excluded on both paths, because that is not a band rule.
  const tiposPermitidos: readonly ExcecaoTipo[] = bandeira
    ? excecaoTiposParaBandeira(bandeira)
    : EXCECAO_TIPOS_OFERECIDOS;

  const excecoes = estrutura.status === 'ok' ? (estrutura.data?.excecoes ?? []) : [];

  /*
   * Um estado só para as duas aberturas do modal: `null` fechado, `'novo'`
   * adicionando, e o item quando editando. Dois booleanos independentes
   * permitiriam o estado impossível "adicionando E editando".
   */
  const [editorAlvo, setEditorAlvo] = useState<ExcecaoRoyaltyItem | 'novo' | null>(
    null,
  );

  const handleDelete = useCallback(
    (item: ExcecaoRoyaltyItem) => {
      if (!podeEditar) return;
      confirm.ask({
        title: 'Remover a exceção?',
        description: `A exceção "${item.tipoExcecaoLabel}" deixa de valer para esta proposta e o cálculo de royalties é refeito sem ela.`,
        confirmLabel: 'Remover',
        tone: 'danger',
        onConfirm: async () => {
          await deleteExcecao(opportunityId, proposalId, item.id);
          onChanged();
        },
      });
    },
    [podeEditar, confirm, deleteExcecao, opportunityId, proposalId, onChanged],
  );

  return (
    <Block
      title="Exceções Programadas"
      bloco={BlocoFranquia.EstruturaExcecoes}
      headerExtra={
        podeEditar ? undefined : (
          /*
           * O rótulo diz o MOTIVO, e são dois diferentes com consertos
           * diferentes: quem tem o perfil mas perdeu a janela precisa saber que
           * a proposta saiu do preenchimento, não que o card é de outra equipe.
           */
          <LockChip>
            {temPerfil ? 'Somente o time de franquia' : 'Time de franquia'}
          </LockChip>
        )
      }
    >
      {estrutura.status === 'unavailable' ? (
        <SectionUnavailable
          testId="excecoes-unavailable"
          message={
            estrutura.error
              ? `Exceções programadas indisponíveis (${estrutura.error}).`
              : undefined
          }
        />
      ) : (
        <>
          <ExcecoesList
            excecoes={excecoes}
            podeEditar={podeEditar}
            onEdit={setEditorAlvo}
            onDelete={handleDelete}
          />

          {/*
           * O modelo é o do protótipo (`#excModal` + `.addrow`), o MESMO da tela
           * de criação: a lista é dado e a exceção nova entra pelo modal. Até
           * 26/08/2026 este card trazia um formulário inline dentro de uma
           * `SubBox`, e a mesma exceção era cadastrada de dois jeitos diferentes
           * conforme a tela.
           */}
          {podeEditar && tiposPermitidos.length > 0 && (
            <AddRowButton onClick={() => setEditorAlvo('novo')} testId="abrir-excecao">
              + Adicionar exceção
            </AddRowButton>
          )}

          {podeEditar && editorAlvo !== null && (
            <ExcecaoEditor
              alvo={editorAlvo}
              bandeira={bandeira ?? null}
              opportunityId={opportunityId}
              proposalId={proposalId}
              createExcecao={createExcecao}
              updateExcecao={updateExcecao}
              onClose={() => setEditorAlvo(null)}
              onChanged={onChanged}
            />
          )}
        </>
      )}
      {confirm.dialog}
    </Block>
  );
}

// ---------------------------------------------------------------------------
// Registered exceptions
// ---------------------------------------------------------------------------

function ExcecoesList({
  excecoes,
  podeEditar,
  onEdit,
  onDelete,
}: {
  excecoes: ExcecaoRoyaltyItem[];
  podeEditar: boolean;
  onEdit: (item: ExcecaoRoyaltyItem) => void;
  onDelete: (item: ExcecaoRoyaltyItem) => void;
}) {
  if (excecoes.length === 0) {
    return (
      <p
        className="text-[14px] italic text-(--color-text-muted)"
        data-testid="excecoes-vazia"
      >
        Nenhuma exceção programada registrada nesta proposta.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5" data-testid="excecoes-lista">
      {excecoes.map((item) => (
        <li
          key={item.id}
          className="rounded-[var(--radius-xs)] border border-(--color-border) px-3.5 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-(length:--t-caption)">{item.tipoExcecaoLabel}</b>
            {/* Verdict — the only pill in this block (ADR-0018). */}
            <StatusPill variant={item.ativo ? 'success' : 'neutral'}>
              {item.ativo ? 'Vigente' : 'Fora de vigência'}
            </StatusPill>
            {podeEditar && (
              /*
               * Editar + Remover por linha, como no protótipo (`.ei-ed` e o
               * `.ei-rm`, o "✕"). O rótulo aqui é textual porque o resto deste
               * card já é texto — a caixa de ações do protótipo não tem
               * equivalente nesta lista.
               */
              <span className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="text-[12px] font-bold text-(--secondary-600) underline"
                  data-testid={`excecao-editar-${item.id}`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="text-[12px] font-bold text-(--color-danger) underline"
                  data-testid={`excecao-remover-${item.id}`}
                >
                  Remover exceção
                </button>
              </span>
            )}
          </div>
          <p className="mt-1 text-[14px] text-(--color-text-muted)">
            {/* Absent end date is the backend's "por todo o contrato". */}
            {formatDateBR(item.vigenciaInicio) ?? 'Retroativa'} —{' '}
            {item.vigenciaFim === null
              ? 'por todo o contrato'
              : (formatDateBR(item.vigenciaFim) ?? '—')}
            {item.valorOverrideBrl !== null && (
              <> · {formatBrlString(item.valorOverrideBrl)}</>
            )}
            {item.politicaExcecao !== null && <> · {item.politicaExcecao}</>}
          </p>
          <p className="mt-1 text-[14px]">{item.motivo}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Editor — o MESMO modal da criação, para adicionar E para alterar
// ---------------------------------------------------------------------------

/**
 * Converte a exceção gravada no rascunho que o `ExcecaoModal` edita.
 *
 * `maskMoneyInput` recebe a string decimal do backend (`"5000.00"`): ela
 * descarta o que não é dígito e divide por 100, então `"5000.00"` → `"500000"`
 * → `"5.000,00"`, que é a máscara pt-BR que o campo espera. Passar o valor cru
 * mostraria `5000.00` num campo mascarado e o `parseMoneyInput` da volta o
 * leria como R$ 5.000,00 mesmo assim — coincidência, não contrato.
 *
 * As datas são cortadas em 10 caracteres porque o `<input type="date">` só
 * aceita `YYYY-MM-DD`; um timestamp completo deixaria o campo em branco, e o
 * save seguinte apagaria a vigência sem ninguém ter pedido.
 *
 * `vigenciaFim` nula é "por todo o contrato" — é assim que o backend a modela,
 * e é o que marca a caixa no modal.
 */
function paraRascunho(item: ExcecaoRoyaltyItem): ExcecaoRascunho {
  return {
    tipo: item.tipoExcecao as ExcecaoTipo,
    motivo: item.motivo,
    todoContrato: item.vigenciaFim === null,
    inicio: item.vigenciaInicio?.slice(0, 10) ?? '',
    fim: item.vigenciaFim?.slice(0, 10) ?? '',
    valor:
      item.valorOverrideBrl !== null ? maskMoneyInput(item.valorOverrideBrl) : '',
  };
}

/**
 * Adiciona ou altera uma exceção pelo `ExcecaoModal`, compartilhado com
 * `nova-proposta-franquia-screen`.
 *
 * O modal não sabe persistir: ele devolve um `ExcecaoRascunho` e é aqui que
 * vira `POST .../excecoes` ou `PATCH .../excecoes/:id`. Ele já rotula sozinho
 * ("Adicionar exceção" × "Editar exceção", "Adicionar" × "Salvar") a partir do
 * `excecao` receber `null` ou um rascunho — nada a decidir aqui.
 *
 * ⚠️ A alteração é `PATCH`, e não remover-e-recriar: recriar troca o `id` da
 * exceção, gera duas linhas de auditoria para um fato só e perde o valor
 * anterior, que é o que a trilha SOX de uma alteração precisa guardar.
 *
 * "Por todo o contrato" continua sendo uma vigência ABERTA (data fim nula), e
 * não um flag que o backend não modela.
 */
function ExcecaoEditor({
  alvo,
  bandeira,
  opportunityId,
  proposalId,
  createExcecao,
  updateExcecao,
  onClose,
  onChanged,
}: {
  alvo: ExcecaoRoyaltyItem | 'novo';
  bandeira: BandeiraFranquia | null;
  opportunityId: string;
  proposalId: string;
  createExcecao: typeof defaultCreateExcecao;
  updateExcecao: typeof defaultUpdateExcecao;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editando = alvo !== 'novo';

  const handleSave = useCallback(
    async (value: ExcecaoRascunho) => {
      setSalvando(true);
      setError(null);
      const payload = {
        tipoExcecao: value.tipo,
        vigenciaInicio: value.inicio === '' ? null : value.inicio,
        vigenciaFim: value.todoContrato || value.fim === '' ? null : value.fim,
        valorOverrideBrl: excecaoTemValor(value.tipo)
          ? parseMoneyInput(value.valor)
          : null,
        motivo: value.motivo.trim(),
      };
      try {
        if (alvo === 'novo') {
          await createExcecao(opportunityId, proposalId, payload);
        } else {
          await updateExcecao(opportunityId, proposalId, alvo.id, payload);
        }
        onClose();
        onChanged();
      } catch (err) {
        /* Modal aberto no erro: o motivo digitado é o payload inteiro. */
        setError(
          err instanceof Error
            ? err.message
            : editando
              ? 'Falha ao alterar a exceção.'
              : 'Falha ao registrar a exceção.',
        );
      } finally {
        setSalvando(false);
      }
    },
    [
      alvo,
      editando,
      createExcecao,
      updateExcecao,
      opportunityId,
      proposalId,
      onClose,
      onChanged,
    ],
  );

  return (
    <ExcecaoModal
      bandeira={bandeira}
      excecao={alvo === 'novo' ? null : paraRascunho(alvo)}
      salvando={salvando}
      error={error}
      onCancel={onClose}
      onSave={(value) => void handleSave(value)}
    />
  );
}
