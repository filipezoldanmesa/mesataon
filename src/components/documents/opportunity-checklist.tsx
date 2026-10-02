'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import { fileAcceptAttribute } from '@/lib/documents/accepted-file-types';
import { FieldLabel } from '@/components/ui/field-label';
import { Select } from '@/components/ui/select';
import { StatusPill } from '@/components/status-pill';
import {
  attachDoc as defaultAttach,
  getChecklist as defaultLoad,
  removeDoc as defaultRemove,
  reuseDoc as defaultReuse,
  setDocValidation as defaultSetValidation,
  solicitarReenvioDocumento as defaultSolicitarReenvio,
  tituloReenvioDocumento,
} from '@/lib/documents/documents.data';
import { listPendencias as defaultListPendencias } from '@/lib/pendencias/pendencias.data';
import { isPendenciaAtiva } from '@/lib/pendencias/types';
import type {
  ChecklistDoc,
  ChecklistResult,
  DocumentoDeOutraOrigem,
  GrupoDocumentosDeOutraOrigem,
} from '@/lib/documents/types';
import { ChecklistNotFoundError, MotivoDaDispensaDeObrigatoriedade } from '@/lib/documents/types';
import { shortProposalCode } from '@/lib/proposals/proposal-code';
import { useConfirm } from '@/components/confirm-dialog';
import { apiUrl } from '@/lib/base-path';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error' | 'not-found';

type Props = {
  opportunityId: string;
  /** Injectable for tests; defaults to the real API. */
  load?: (id: string) => Promise<ChecklistResult>;
  /**
   * Upload a new file and attach it to a checklist item (HU-17.2).
   * `docId` is the `category::type` synthetic key for an empty line, or the
   * repository document UUID once the line has a file; `target` names the line
   * so the caller never has to parse it back out of the id.
   */
  attach?: (
    oppId: string,
    docId: string,
    file: File,
    target?: { category: string; type: string },
    /** Substituir o arquivo atual de uma categoria `single` (VBR-641). */
    replace?: boolean,
  ) => Promise<ChecklistDoc>;
  /** Link a repository document to the opportunity without a new upload (HU-17.1). */
  reuse?: (oppId: string, docId: string) => Promise<ChecklistDoc>;
  /**
   * Unlink a document from this opportunity (keeps it in the repository).
   * Returns void; the component reloads the checklist after removal to reflect
   * the updated state (e.g. status reverting to 'pendente' or 'repo').
   */
  remove?: (oppId: string, docId: string) => Promise<void>;
  /** Conferência do documento (RN-F9-03 — SNEG/CCOB). Injetável nos testes. */
  setValidation?: (
    oppId: string,
    docId: string,
    validado: boolean,
  ) => Promise<ChecklistDoc>;
  /** Abre a pendência de reenvio ao LT. Injetável nos testes. */
  solicitarReenvio?: (oppId: string, docName: string) => Promise<void>;
  /** Lista as pendências — usada só para reconhecer os reenvios já pedidos. */
  listPendencias?: typeof defaultListPendencias;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps a DocStatus to the design-system StatusPill variant. */
function statusVariant(
  status: ChecklistDoc['status'],
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'validado':
      return 'success';
    case 'anexado':
      return 'info';
    case 'repo':
      return 'info';
    case 'vencido':
      return 'danger';
    default:
      return 'warning';
  }
}

/** Maps a DocStatus to the label shown in the pill. */
function statusLabel(status: ChecklistDoc['status']): string {
  switch (status) {
    case 'validado':
      return 'Validado';
    case 'anexado':
      return 'Anexado';
    case 'repo':
      return 'No repositório';
    case 'vencido':
      return 'Vencido';
    default:
      return 'Pendente';
  }
}

/**
 * Returns the Tailwind classes for the required-this-phase highlight
 * (left border + badge) based on the document status:
 * - green  → anexado / validado / repo (current behaviour preserved)
 * - orange → pendente  (matches the "Pendente" StatusPill)
 * - red    → vencido   (matches the "Vencido" StatusPill)
 * Only CSS variable tokens from globals.css are used — no hard-coded colours.
 */
function requiredHighlightClasses(status: ChecklistDoc['status']): {
  border: string;
  badge: string;
} {
  switch (status) {
    case 'vencido':
      return {
        border: 'border-(--color-danger-bg) border-l-4 border-l-(--color-danger)',
        badge: 'bg-(--color-danger-bg) text-(--color-danger)',
      };
    case 'pendente':
      return {
        border: 'border-(--color-warning-bg) border-l-4 border-l-(--color-warning)',
        badge: 'bg-(--color-warning-bg) text-(--color-warning)',
      };
    default: // anexado, validado, repo
      return {
        border: 'border-(--secondary-300) border-l-4 border-l-(--secondary-500)',
        badge: 'bg-(--secondary-100) text-(--secondary-700)',
      };
  }
}

/** Returns the unique ordered categories present in a doc list. */
function uniqueCategories(docs: ChecklistDoc[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const d of docs) {
    if (!seen.has(d.category)) {
      seen.add(d.category);
      result.push(d.category);
    }
  }
  return result;
}

// Document stages (Anexo A `stageLimit`) that become "due" — cumulatively — by
// each opportunity phase (backend `OpportunityState`). As the opportunity
// advances, more required documents count toward the checklist completude, so
// the "X de Y" is recomputed per phase. Gate 1 (leaving "preenchimento" →
// SNEG) is the baseline; an unknown/absent phase falls back to it.
const GATE1_STAGES = ['CALCULO_DA_ALCADA', 'ENVIO_PARA_ANALISE_SNEG'];
const ANALISE_STAGES = [...GATE1_STAGES, 'ANALISE_SNEG', 'ANALISE_PREVIA_GARANTIA'];
const ALL_STAGES = [
  ...ANALISE_STAGES,
  'EMISSAO_DE_CONTRATO',
  'CONFECCAO_DA_MINUTA_DE_GARANTIA',
];
/*
 * ⚠️ `EM_APROVACAO` NÃO recebe `ALL_STAGES` — nada novo vence enquanto a
 * oportunidade espera a alçada.
 *
 * Era `ALL_STAGES`, e isso fazia a MESMA linha da tela afirmar duas coisas
 * contraditórias sobre `Comprovante de residência` (`required: true`,
 * `stageLimit: EMISSAO_DE_CONTRATO` — migration `…005`): o badge
 * "Obrigatório nesta fase" (de `isRequiredThisPhase`) ao lado do texto
 * "Exigido até: Emissão de contrato" (de `doc.stage`). O card somava
 * "Obrigatórios · Aprovação 7/8" para um conjunto completo para a fase, então o
 * analista enviava para aprovação com sucesso e concluía que o gate vazou.
 *
 * O mapa tem de refletir o que o backend COBRA, senão a tela mente numa direção
 * ou na outra. Quem cobra `EMISSAO_DE_CONTRATO` é `reconcileDocumentPendencias`
 * (escopado em `DocumentStage.EmissaoDeContrato`), que roda ao ENTRAR em
 * `EM_MINUTA` e abre `DOCUMENTO_MINUTA_AUSENTE` com `obrigatoria: true` — e é
 * ela que trava `ENVIAR_PARA_ASSINATURA` pelo `MINUTA_READINESS_GUARD`. Nem o
 * GATE 1 (recorta em `CALCULO_DA_ALCADA`/`ENVIO_PARA_ANALISE_SNEG`) nem o
 * GATE 2 (só bloqueia `anexado` aguardando conferência) exigem essa etapa, de
 * propósito. `CONFECCAO_DA_MINUTA_DE_GARANTIA` vence junto, na fase de minuta.
 *
 * Mesma classe do defeito que o VBR-645 corrigiu no eixo `required` (ver o
 * comentário de `deadlineLabel`): duas afirmações incompatíveis na mesma linha.
 *
 * `EM_APROVACAO` era o ÚNICO balde que puxava obrigatório de etapa futura —
 * medido no catálogo em 08/09/2026, e é por isso que a correção é de uma linha:
 *   - `ANALISE_SNEG` tinha um obrigatório (`Posto · Fotos do posto`), movido
 *     para `CALCULO_DA_ALCADA` pela migration `…133` (ADO 68000) ⇒ hoje a etapa
 *     não tem nenhum, então incluí-la em `EM_ANALISE` não afirma nada;
 *   - `ANALISE_PREVIA_GARANTIA` tem dois, mas as linhas de garantia são
 *     RETIRADAS do checklist da oportunidade pelo `OportunidadeChecklistScopeAdapter`
 *     (VBR-641), então também não entram na conta.
 * ⚠️ Se um obrigatório novo nascer numa dessas duas etapas, reveja o balde de
 * `EM_ANALISE` pelo mesmo critério: quem o cobra, e em que fase.
 *
 * ⚠️ Se o negócio quiser o documento ANTES da aprovação, o conserto é mover o
 * `stage_limit` dele no catálogo (migration) — nunca reabrir este mapa, que
 * passaria a cobrar na tela uma etapa em que a oportunidade não está.
 */
const DUE_STAGES_BY_PHASE: Record<string, string[]> = {
  NOVOS: GATE1_STAGES,
  EM_PREENCHIMENTO: GATE1_STAGES,
  EM_ANALISE: ANALISE_STAGES,
  EM_APROVACAO: ANALISE_STAGES,
  EM_MINUTA: ALL_STAGES,
  EM_ASSINATURA: ALL_STAGES,
  EM_PAGAMENTO: ALL_STAGES,
  CONCLUIDA: ALL_STAGES,
};

function dueStages(opportunityState: string): Set<string> {
  return new Set(DUE_STAGES_BY_PHASE[opportunityState] ?? GATE1_STAGES);
}

/** pt-BR label for the opportunity phase, shown in the completude card. */
const PHASE_LABEL: Record<string, string> = {
  NOVOS: 'Preenchimento',
  EM_PREENCHIMENTO: 'Preenchimento',
  EM_ANALISE: 'Em análise',
  EM_APROVACAO: 'Aprovação',
  EM_MINUTA: 'Minuta',
  EM_ASSINATURA: 'Assinatura',
  EM_PAGAMENTO: 'Pagamento',
  CONCLUIDA: 'Concluída',
};

function phaseLabel(opportunityState: string): string {
  return PHASE_LABEL[opportunityState] ?? 'fase atual';
}

/** True while there are still stages that become due in later phases. */
function hasLaterStages(opportunityState: string): boolean {
  return dueStages(opportunityState).size < ALL_STAGES.length;
}

/**
 * Completude counters scoped to the opportunity's CURRENT phase: only the
 * required documents due by the phases reached so far count (cumulative). A
 * required doc is satisfied once present — attached (anexado) or validated by
 * the CCOB (validado).
 */
function completude(
  docs: ChecklistDoc[],
  opportunityState: string,
): { validated: number; total: number } {
  const due = dueStages(opportunityState);
  const required = docs.filter(
    (d) => d.required && d.stageLimit != null && due.has(d.stageLimit),
  );
  return {
    validated: required.filter((d) => d.status === 'anexado' || d.status === 'validado')
      .length,
    total: required.length,
  };
}

// ---------------------------------------------------------------------------
// Action menu sub-component
// ---------------------------------------------------------------------------

function ActionMenu({
  doc,
  busy,
  emAnalise,
  podeConferir,
  podeGerenciar,
  podeGerenciarFranquia,
  onAttach,
  onReuse,
  onRemove,
  onUndo,
  onReplace,
  onView,
  onValidar,
  onDesfazerValidacao,
  onSolicitarReenvio,
}: {
  doc: ChecklistDoc;
  busy: boolean;
  /** A oportunidade está em análise ⇒ a conferência da CCOB cabe neste menu. */
  emAnalise: boolean;
  /**
   * O perfil tem `DocumentValidate` (SNEG/CCOB/Admin — 31/08/2026). Esconder é
   * UX — a garantia é o 403 do backend —, mas oferecer um item que a API vai
   * recusar é pior que não oferecer nada.
   */
  podeConferir: boolean;
  /**
   * O perfil tem `DocumentManage` (LT/Admin) — anexar/desvincular é do LT
   * (PRD Análise SNEG).
   *
   * Sem isso, "Anexar" era oferecido a QUALQUER perfil e o clique não fazia
   * nada: `handleFileChange` sai cedo em `!canWrite`, sem toast e sem erro.
   * Medido em 20/08/2026 logado como SNEG — o pior dos três desfechos, porque
   * um controle que não faz nada nem avisa parece defeito do sistema. Esconder
   * é UX; a garantia continua sendo o 403 do backend.
   */
  podeGerenciar: boolean;
  /**
   * O perfil tem `FranquiaPropostaManage` — a autoridade da linha de PROPOSTA,
   * cujo anexo vai para `POST .../franquia/:proposalId/fap` e não para o hub
   * (ADO — 14/09/2026).
   *
   * Conjunto **mais estreito** que `DocumentManage`: Gerente Varejo e Gestor de
   * Franquias anexam documento e NÃO enviam FAP. Sem esta segunda pergunta, os
   * dois veriam "Anexar" numa linha que a API recusa com 403.
   */
  podeGerenciarFranquia: boolean;
  onAttach: () => void;
  onReuse: () => void;
  onRemove: () => void;
  onUndo: () => void;
  /** Substitui o arquivo atual de uma categoria `single` (VBR-641). */
  onReplace: () => void;
  onView: () => void;
  onValidar: () => void;
  onDesfazerValidacao: () => void;
  onSolicitarReenvio: () => void;
}) {
  /** Confirmação das ações destrutivas deste menu. */
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Build action list based on doc state (mirrors prototype `actionsFor`)
  /**
   * `view` marca a ação de LEITURA ("Exibir"). Ela não é ação primária da linha:
   * o colapso de um item só em botão sólido, logo abaixo, a promoveria a CTA
   * verde em toda linha — e para um perfil que só lê (a SNEG, depois do ADO
   * 67906) isso é a tela inteira coberta de botões primários onde o pedido era
   * "no menu Ações aparecer somente Exibir".
   */
  type Action = { label: string; handler: () => void; danger?: boolean; view?: true };
  const actions: Action[] = [];

  // "Exibir" whenever a real file is attached/available (has a download URL).
  if (doc.downloadUrl) {
    actions.push({ label: 'Exibir', handler: onView, view: true });
  }

  /*
   * Conferência do documento (RN-F9-03) — o "Validar" / "Solicitar reenvio" /
   * "Desfazer validação" do menu de cada linha. Esta tela é a que lista TODOS os
   * documentos da oportunidade (o card da análise mostra só os primeiros seis).
   *
   * `podeConferir` espelha `DOCUMENT_VALIDATE_ROLES` do backend — `[SNEG, CCOB,
   * ADMIN]` desde 31/08/2026, a união da RN-F9-03 (SNEG) com o ADO 67906 (CCOB).
   * ⚠️ Entre 26 e 31/08 a SNEG ficava só com "Exibir" aqui, e foi assim que o
   * fluxo pareceu ter sido removido do produto: ele estava inteiro no código,
   * atrás de uma permissão que o perfil que mais o usa tinha perdido.
   *
   * O LT segue FORA: ele anexa (`podeGerenciar`) e não confere o próprio anexo.
   *
   * Só enquanto a oportunidade está EM ANÁLISE: é a janela em que a conferência
   * acontece. Fora dela o menu volta a ter apenas a gestão do arquivo.
   *
   * Uma linha sem arquivo (`pendente`/`repo`) não entra: não há o que conferir,
   * e o que resolve é o LT anexar.
   */
  if (
    emAnalise &&
    podeConferir &&
    (doc.status === 'anexado' || doc.status === 'validado' || doc.status === 'vencido')
  ) {
    if (doc.status === 'validado') {
      actions.push({ label: 'Desfazer validação', handler: onDesfazerValidacao });
    } else {
      actions.push({ label: 'Validar', handler: onValidar });
      actions.push({ label: 'Solicitar reenvio', handler: onSolicitarReenvio });
    }
  }

  /*
   * Tipo aposentado (`selectable: false`) não recebe anexo NOVO — o backend
   * recusa (VBR-645). Então nada aqui pode oferecer "Anexar" / "Novo upload" /
   * "Reutilizar" / "Revalidar" / "Trocar": o clique só produziria uma recusa,
   * que é o mesmo critério já aplicado ao "Exibir" sem `downloadUrl` e às
   * desvinculações sem `repositoryDocumentId`.
   *
   * As ações que operam no que JÁ existe continuam (Exibir, Excluir/Desfazer,
   * Validar, Solicitar reenvio): o motivo de a linha sobreviver é exatamente
   * manter o documento legado acessível.
   */
  /*
   * ⚠️ Linha de PROPOSTA tem OUTRA autoridade, e ela é mais estreita
   * (ADO — 14/09/2026).
   *
   * O anexo dela não vai para o hub: vai para `POST .../franquia/:id/fap`, que
   * é `@Roles(...FRANQUIA_PROPOSTA_WRITE_ROLES)` — LT, SNEG, Consultor de
   * Expansão e Admin. `DocumentManage` é mais largo (inclui Gerente Varejo e
   * Gestor de Franquias), então gatear só por ele ofereceria "Anexar" a dois
   * perfis que a API responde 403: botão morto, o defeito que esta tela já
   * paga caro para não ter.
   *
   * Esconder o CTA aqui **não esconde o fato**: a linha continua listada, com o
   * código da proposta, o selo de obrigatoriedade e o status. Quem não pode
   * anexar continua lendo o que falta e em qual ponto.
   */
  const podeAnexar =
    podeGerenciar && doc.selectable && (!doc.proposalId || podeGerenciarFranquia);

  /*
   * Linha atendida por evidência de fora do hub (VBR-642): a foto vive em
   * `station_photos`, enviada pela dropzone da proposta. Não há arquivo AQUI para
   * excluir, desfazer ou substituir — oferecer isso apontaria as ações para um
   * `repositoryDocumentId` que não existe, e o clique só produziria recusa. A
   * linha explica onde a evidência está (selo abaixo); gerenciá-la é na proposta.
   */
  if (doc.satisfiedExternally) {
    return null;
  }

  if (!podeGerenciar) {
    // Só leitura/conferência: nenhuma ação de arquivo. Menu vazio ⇒ nada é
    // renderizado (ver o retorno abaixo), em vez de um botão morto.
  } else if (doc.status === 'repo') {
    if (podeAnexar) {
      actions.push({ label: 'Reutilizar', handler: onReuse });
      actions.push({ label: 'Novo upload', handler: onAttach });
    }
  } else if (doc.status === 'anexado' || doc.status === 'validado') {
    // Attached (awaiting the CCOB's validation) or validated: same management actions.
    //
    // As duas desvinculam pelo `repositoryDocumentId`, então sem ele não há o
    // que oferecer: o clique só produziria uma recusa. Mesmo precedente do
    // "Exibir", condicionado a `downloadUrl` logo acima (VBR-583).
    if (doc.repositoryDocumentId) {
      if (doc.reused) {
        actions.push({ label: 'Desfazer', handler: onUndo });
      } else {
        actions.push({
          label: 'Excluir',
          handler: () =>
            confirm.ask({
              title: 'Excluir documento anexado?',
              description: `"${doc.name}" é desvinculado da oportunidade (permanece no repositório do cliente para reuso).`,
              confirmLabel: 'Excluir',
              tone: 'danger',
              onConfirm: onRemove,
            }),
          danger: true,
        });
      }
    }
    if (podeAnexar) {
      actions.push({ label: 'Novo upload', handler: onAttach });
      if (doc.single) {
        /*
         * "Trocar", não "+ arquivo" (VBR-641).
         *
         * O controle antigo existia para EXPLICAR uma recusa: clicar num
         * `single` mostrava um toast "consolide em um único arquivo" e nada
         * acontecia — controle morto com aparência de ação. E a frase descrevia
         * outro problema (juntar dois documentos num PDF) quando o que o usuário
         * quer é substituir o que está lá. Agora o clique abre o seletor de
         * arquivo com a intenção de substituição, que o backend suporta: o
         * anterior é desvinculado e permanece no repositório para reuso.
         */
        actions.push({ label: 'Trocar', handler: onReplace });
      }
    }
  } else if (doc.status === 'vencido') {
    if (podeAnexar) {
      actions.push({ label: 'Revalidar', handler: onAttach });
    }
  } else if (podeAnexar) {
    // pendente
    actions.push({ label: 'Anexar', handler: onAttach });
  }

  // Nenhuma ação disponível para este perfil ⇒ não renderiza controle nenhum.
  if (actions.length === 0) {
    return null;
  }

  /*
   * Uma única ação PRIMÁRIA (anexar, revalidar, trocar) → botão sólido, como o
   * "+ Anexar" do protótipo.
   *
   * A leitura fica de fora: com só "Exibir" disponível o controle continua sendo
   * o menu "Ações ▾", que é o que o ADO 67906 pede ("Ao entrar em Ações é para
   * aparecer somente o campo Exibir") e o que a linha já mostrava antes de a
   * conferência sair da SNEG.
   */
  if (actions.length === 1 && !actions[0].view) {
    const [primary] = actions;
    return (
      <button
        type="button"
        disabled={busy}
        onClick={primary.handler}
        className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '…' : primary.label}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      {confirm.dialog}
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={SECONDARY_OUTLINE_BTN}
      >
        {busy ? '…' : 'Ações ▾'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[150px] overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border) bg-white shadow-md"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.handler();
              }}
              className={`block w-full px-3.5 py-2.5 text-left text-[13px] font-bold transition hover:bg-(--neutral-40) ${action.danger ? 'text-(--color-danger)' : 'text-(--color-text)'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast sub-component
// ---------------------------------------------------------------------------

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 2800);
    return () => clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-50 max-w-[80%] -translate-x-1/2 rounded-[var(--radius-xs)] bg-(--neutral-900) px-4 py-2.5 text-center text-[13px] text-white shadow-lg"
    >
      {message}
    </div>
  );
}

/**
 * Documentos que EXISTEM nesta oportunidade e foram anexados por OUTRA tela —
 * garantia e FAP de franquia (ADO · 02/09/2026).
 *
 * ## Por que existe
 *
 * O protótipo `13-documentos.html` lista `Garantia`,
 * `Garantidor / Fiador / Cônjuge`, `Outros (garantia)` e `BR Mania / Lubrax+`
 * nesta aba. Nenhuma aparecia: a spec de 28/08 §4 tirou toda linha de garantia
 * do checklist (o documento pertence à indicação e é gerido na tela da
 * garantia), e a FAP nem vive no hub — ela é `franchise_fap_documents`, e o
 * checklist só a marcava `Anexado · enviado no bloco da proposta`, **sem link**.
 * O arquivo existia e era baixável; faltava a superfície.
 *
 * ## Somente leitura, e sem menu de ações
 *
 * Anexar, substituir, excluir e validar continuam nas telas DONAS. Um menu aqui
 * ou repetiria ações que já existem lá, ou ofereceria as que a API recusa nestes
 * ids — controle morto, que é o defeito que o "Validar" de uma linha
 * `satisfiedExternally` já custou.
 *
 * Nada aqui move o checklist acima: nenhuma linha volta a ser exigida e o
 * contador de obrigatórios não muda.
 *
 * ## Fora do filtro de etapa
 *
 * Os chips recortam o CHECKLIST por etapa de exigência. Estes documentos não têm
 * etapa — não são exigências —, então filtrá-los por um chip os faria sumir sem
 * explicação.
 */
function OutrasOrigensBlock({
  opportunityId,
  grupos,
}: {
  opportunityId: string;
  grupos: GrupoDocumentosDeOutraOrigem[];
}) {
  if (grupos.length === 0) return null;

  return (
    <section data-testid="documentos-outras-origens" className="mt-6">
      <h2 className="text-[15px] font-bold">Documentos de outras origens</h2>
      <p className="mt-1 mb-3 text-(length:--t-caption) text-(--color-text-muted)">
        Anexados nas telas de garantia, de franquia e de obra. Aparecem aqui para
        consulta; para alterá-los, use a tela de origem.
      </p>

      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="mb-3">
          <div className="cat mb-1.5 flex items-center gap-2 text-(length:--t-small) font-bold tracking-[.3px] text-(--color-text-muted) uppercase">
            {grupo.titulo}
          </div>
          <ul className="flex list-none flex-col gap-1.5 p-0">
            {grupo.documentos.map((doc) => (
              <li
                key={`${doc.origem}:${doc.documentoId}`}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-(length:--t-caption) font-bold">{doc.tipo}</div>
                  <div className="truncate text-(length:--t-caption) text-(--color-text-muted)">
                    {doc.fileName}
                    {doc.anexadoEm ? ` · ${formatUploadDate(doc.anexadoEm)}` : ''}
                  </div>
                </div>
                {/*
                  `<a>` e não botão: é navegação para um arquivo, então "abrir em
                  nova aba" e copiar link funcionam de graça. O prefixo do
                  basePath é aplicado DENTRO de `downloadHrefDeOutraOrigem` —
                  sem ele o link é 404 em todo ambiente com
                  `NEXT_PUBLIC_BASE_PATH`, e funciona só no laptop, onde é vazio.
                */}
                <a
                  href={downloadHrefDeOutraOrigem(opportunityId, doc)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${SECONDARY_OUTLINE_BTN} shrink-0`}
                >
                  Exibir
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * A rota de download de cada origem.
 *
 * Composta AQUI, e não no backend: o backend devolve identificadores, e path de
 * tela é assunto do front (é o que permite o `basePath` e o proxy da BFF).
 *
 * - `GARANTIA` ⇒ a rota do repositório da oportunidade, que resolve qualquer
 *   documento escopado a ela e nunca olha o vínculo da garantia;
 * - `FRANQUIA_FAP` ⇒ a rota da FAP, escopada pela PROPOSTA;
 * - `FRANQUIA_FOTOS` ⇒ a rota da foto do ponto, também escopada pela PROPOSTA
 *   (`station_photos`), e que **não** é a mesma da FAP — duas origens porque são
 *   dois endpoints;
 * - `CONTRATO_ASSINADO` / `CONTRATO_CERTIFICADO` ⇒ as duas rotas de stream do
 *   módulo de contratos, escopadas pela OPORTUNIDADE.
 *
 * ⚠️ Sem `proposalId` as duas origens de franquia caem na rota do repositório,
 * que responderia 404 para um id que não vive lá. É caminho inalcançável hoje (o
 * adapter sempre o preenche para franquia), e a alternativa — não renderizar —
 * esconderia um arquivo que existe; o fallback fica, deliberado, com o `null`
 * chegando só de um backend anterior a este contrato.
 */
function downloadHrefDeOutraOrigem(
  opportunityId: string,
  doc: DocumentoDeOutraOrigem,
): string {
  /*
   * O Anexo J vem ANTES da guarda de `proposalId` de propósito: ele traz a
   * proposta (é o que sustenta o "documento anexado na proposta" do pedido),
   * mas a rota dele é escopada pela OPORTUNIDADE e endereçada pelo
   * `estimateId` do Converge, não pela proposta.
   */
  if (doc.origem === 'OBRA_ANEXO_J') {
    return apiUrl(
      'opportunities',
      opportunityId,
      'obra',
      'anexo-j',
      doc.documentoId,
      'stream',
    );
  }
  /*
   * As duas origens de CONTRATO também são escopadas pela oportunidade, e por
   * isso vêm antes da guarda de `proposalId` — o contrato é da negociação
   * inteira, não de uma proposta.
   *
   * ⚠️ Duas rotas porque são dois recursos: `CONTRATO_ASSINADO` endereça a
   * linha de assinatura (contrato × envelope, que é o que distingue o Termo
   * assinado no pacote principal do assinado pela homologada) e
   * `CONTRATO_CERTIFICADO` endereça o ENVELOPE. Colapsá-las daria uma linha
   * clicável que não abre.
   */
  if (doc.origem === 'CONTRATO_ASSINADO') {
    return apiUrl(
      'opportunities',
      opportunityId,
      'contrato',
      'assinatura',
      'documentos',
      doc.documentoId,
      'stream',
    );
  }
  if (doc.origem === 'CONTRATO_CERTIFICADO') {
    return apiUrl(
      'opportunities',
      opportunityId,
      'contrato',
      'assinatura',
      'envelopes',
      doc.documentoId,
      'certificado',
      'stream',
    );
  }
  if (doc.proposalId) {
    if (doc.origem === 'FRANQUIA_FAP') {
      return apiUrl(
        'opportunities',
        opportunityId,
        'franquia',
        doc.proposalId,
        'fap',
        doc.documentoId,
        'stream',
      );
    }
    if (doc.origem === 'FRANQUIA_FOTOS') {
      return apiUrl(
        'proposals',
        doc.proposalId,
        'posto-photos',
        doc.documentoId,
        'view',
      );
    }
    /*
     * A COF entregue àquela franquia (17/09/2026). O `documentoId` é a VERSÃO
     * congelada em `franchises.cof_template_id`, e o backend confere que ela é
     * de fato a daquela proposta — a rota não é um leitor arbitrário do
     * catálogo da Governança.
     */
    if (doc.origem === 'FRANQUIA_COF') {
      return apiUrl(
        'opportunities',
        opportunityId,
        'franquia',
        doc.proposalId,
        'cof',
        doc.documentoId,
        'stream',
      );
    }
  }
  return apiUrl('opportunities', opportunityId, 'documents', doc.documentoId, 'download');
}

/**
 * Formata a VALIDADE — data de calendário, portanto em UTC (ADO 67993).
 *
 * ⚠️ Distinta de {@link formatUploadDate}, que formata um INSTANTE no fuso de
 * Brasília. A validade é gravada como meia-noite UTC (`2027-03-31T00:00:00Z`) e
 * ali vira **30/03/2027** — um dia a menos que o usuário digitou.
 */
function formatValidade(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
}

/** `2026-09-01T12:00:00Z` → `01/09/2026`; valor indecifrável não vira travessão solto. */
function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpportunityChecklist({
  opportunityId,
  load = defaultLoad,
  attach = defaultAttach,
  reuse = defaultReuse,
  remove = defaultRemove,
  setValidation = defaultSetValidation,
  solicitarReenvio = defaultSolicitarReenvio,
  listPendencias = defaultListPendencias,
}: Props) {
  // Anexar/desvincular é do LT (PRD Análise SNEG: tarefa "anexar documentos"
  // → LT) — espelha o @Roles das rotas de escrita; leitura/download abertos.
  const { can } = usePermissions();
  const canWrite = can(Permission.DocumentManage);
  /** Conferir (validar/recusar) é da SNEG — autoridade separada de anexar. */
  const canValidate = can(Permission.DocumentValidate);
  /*
   * A linha de PROPOSTA (a FAP da franquia) não é anexada pelo hub: ela vai
   * para `POST .../franquia/:proposalId/fap`, cuja autoridade é outra e mais
   * estreita que a de documento (ADO — 14/09/2026). Ver `podeGerenciarFranquia`
   * no `ActionMenu`.
   */
  const canManageFranquia = can(Permission.FranquiaPropostaManage);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [result, setResult] = useState<ChecklistResult | null>(null);
  const [activeStage, setActiveStage] = useState<string>('todas');
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>('');

  // Hidden file input used to trigger the OS picker for upload actions.
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks which doc is awaiting file selection so we can call attach() once picked.
  const pendingAttachDocId = useRef<string | null>(null);
  /** Se o upload em curso deve SUBSTITUIR o arquivo atual (VBR-641). */
  const pendingAttachReplace = useRef(false);

  /*
   * Modal "tipo + arquivo" do dropzone — mesmo desenho do repositório do
   * cliente (`client-repository.tsx`). Substituiu o atalho que pegava a
   * PRIMEIRA linha pendente na ordem da tela: anexar o terceiro tipo obrigava a
   * anexar os dois anteriores antes, ou a abrir o menu da linha.
   */
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [modalDocId, setModalDocId] = useState<string>('');
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState('');
  /** Arquivo sobre a zona (só realce visual). */
  const [dragActive, setDragActive] = useState(false);

  const showToast = useCallback((msg: string) => setToast(msg), []);
  const clearToast = useCallback(() => setToast(''), []);

  // Load (or reload) the checklist; extracted so it can be called after remove.
  const loadChecklist = useCallback(
    (id: string) => {
      let active = true;
      setLoadStatus('loading');
      setResult(null);
      setActiveStage('todas');

      load(id)
        .then((data) => {
          if (!active) return;
          setResult(data);
          setLoadStatus('loaded');
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof ChecklistNotFoundError) {
            setLoadStatus('not-found');
          } else {
            setLoadStatus('error');
          }
        });

      return () => {
        active = false;
      };
    },
    [load],
  );

  // Initial load
  useEffect(() => loadChecklist(opportunityId), [opportunityId, loadChecklist]);

  // ── Attach via file picker ───────────────────────────────────────────────

  /**
   * Triggers the file input for a given doc. The actual `attach()` call
   * happens inside the input's `onChange` handler once the user picks a file.
   */
  const triggerFilePicker = useCallback((docId: string, replace = false, accept?: string) => {
    pendingAttachDocId.current = docId;
    /*
     * `accept` da LINHA, aplicado ao input compartilhado antes de abri-lo: o
     * mesmo `<input>` serve todas as linhas, e cada uma tem a sua lista de tipos
     * (ADO 67547). Escrito no DOM em vez de por estado porque o `click()` vem na
     * mesma volta — um `setState` só valeria no render seguinte, e o picker
     * abriria com o filtro da linha ANTERIOR.
     */
    if (fileInputRef.current) fileInputRef.current.accept = accept ?? '';
    // Intenção de SUBSTITUIR (VBR-641), decidida no clique e lida no `onChange`
    // do input — o upload só acontece depois de o usuário escolher o arquivo.
    pendingAttachReplace.current = replace;
    fileInputRef.current?.click();
  }, []);

  /**
   * O upload em si — ponto único das DUAS entradas: o input escondido das ações
   * de linha ("Anexar" / "Novo upload" no menu) e o modal do dropzone.
   *
   * Lança em caso de falha em vez de engolir: o input de linha traduz para
   * toast (não há onde mais mostrar), e o modal precisa da mensagem para
   * mantê-la à vista com o arquivo já escolhido. Duas cópias desta função foi o
   * que fez o `target` divergir uma vez (VBR-582).
   */
  const uploadToDoc = useCallback(
    async (docId: string, file: File, replace: boolean) => {
      /*
       * The line's own category/type, not a split of `docId`: once a document is
       * attached the id IS the repository UUID, so parsing it yields nothing and
       * the request reaches the backend without a target (VBR-582 follow-up).
       */
      const target = result?.docs.find((d) => d.id === docId);

      setBusyDocId(docId);
      try {
        const updated = await attach(
          opportunityId,
          docId,
          file,
          target ? { category: target.category, type: target.name } : undefined,
          replace,
        );
        /*
         * ⚠️ Linha de PROPOSTA tem outro desfecho, e a frase genérica MENTIA
         * sobre ele (ADO — 14/09/2026): a FAP não entra no repositório do
         * cliente nem fica disponível para reuso — ela é gravada no store
         * daquela proposta (`franchise_fap_documents`), que é o mesmo que a tela
         * da proposta e o GATE 1 leem. Prometer reuso faria o LT procurar o
         * arquivo num lugar onde ele nunca vai estar.
         *
         * E a substituição ali é a RN-F4-02 ("uma FAP por ponto"): a anterior é
         * trocada, não desvinculada — dizer que "segue no repositório" seria
         * afirmar um arquivo que deixou de existir.
         */
        showToast(
          target?.proposalId
            ? `FAP enviada para a proposta ${shortProposalCode(
                target.proposalId,
                target.proposalCode,
              )} — ela já aparece no bloco da proposta.`
            : replace
              ? 'Arquivo substituído — o anterior segue no repositório do cliente para reuso. (VBR-641)'
              : 'Arquivo enviado — disponível no repositório do cliente para reuso futuro. (RN-F9-02)',
        );
        setResult((prev) => {
          if (!prev) return prev;
          return { ...prev, docs: prev.docs.map((d) => (d.id === docId ? updated : d)) };
        });
      } finally {
        setBusyDocId(null);
      }
    },
    [opportunityId, attach, showToast, result],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const docId = pendingAttachDocId.current;
      // Reset so the same file can be selected again if needed.
      if (fileInputRef.current) fileInputRef.current.value = '';
      pendingAttachDocId.current = null;
      const replace = pendingAttachReplace.current;
      pendingAttachReplace.current = false;

      if (!file || !docId || busyDocId) return;
      /*
       * Read-only profile: the API answers 403 and the control is hidden — the
       * guard here also covers the file input firing without a visible button.
       */
      if (!canWrite) return;

      try {
        await uploadToDoc(docId, file, replace);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao anexar o documento. Tente novamente.';
        showToast(msg);
      }
    },
    [busyDocId, canWrite, showToast, uploadToDoc],
  );

  // ── Modal do dropzone: escolher o tipo, depois o arquivo ────────────────

  /*
   * Os tipos que podem receber um arquivo NOVO.
   *
   * `repositoryDocumentId === null` é o predicado de "ainda não tem arquivo" —
   * o próprio contrato de `ChecklistDoc` diz para usar este campo, e não `id`,
   * que é a chave sintética `category::type` quando a linha está vazia.
   *
   * Linha que JÁ tem arquivo fica fora de propósito: substituir é o "Novo
   * upload" DA LINHA, que declara a substituição e emite o toast próprio
   * (VBR-641). Oferecê-la aqui trocaria um arquivo em silêncio.
   *
   * `selectable` também filtra (VBR-645): o backend recusa a linha aposentada,
   * e a recusa chegaria depois de o usuário já ter escolhido o arquivo.
   *
   * ORDENADO por categoria e depois por tipo, como no repositório do cliente
   * (`GET /v1/documents/parametrization` já responde `ORDER BY category, type`).
   * Aqui a lista deriva do checklist, cuja ordem é a do protótipo
   * (`13-documentos.html:113-132`) e NÃO pode ser alfabetizada — ela agrupa as
   * linhas na tela. Sem reordenar só aqui, o select herdava a ordem física da
   * tabela e repetia a mesma categoria em posições separadas ("Garantidor /
   * Fiador / Cônjuge" aparecia três vezes), que num seletor de ~15 opções é
   * onde o usuário procura pelo nome da categoria.
   *
   * `localeCompare('pt-BR')` porque as categorias têm acento ("Sócio",
   * "Cônjuge", "Pendência"): a comparação de código põe todas elas depois de
   * "Posto", que é a ordenação errada para quem lê a lista.
   */
  /*
   * ⚠️ Linha de PROPOSTA fica FORA deste seletor (ADO — 14/09/2026).
   *
   * Ele lista TIPOS, e duas propostas BR Mania produzem duas linhas com o mesmo
   * `name` — "FAP BR Mania" apareceria duas vezes, idênticas, e escolher a
   * errada mandaria a FAP para o ponto errado sem nada na tela contradizendo.
   * O discriminador é o código da proposta, que só existe na LINHA.
   *
   * Não esconde nada: cada linha da lista oferece o seu "Anexar", com o código
   * ao lado. O que sai é a porta ambígua, não a exigência.
   */
  const tiposDisponiveis = useMemo(
    () =>
      (result?.docs ?? [])
        .filter((d) => d.repositoryDocumentId === null && d.selectable && !d.proposalId)
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category, 'pt-BR') ||
            a.name.localeCompare(b.name, 'pt-BR'),
        ),
    [result],
  );

  const closeUploadModal = useCallback(() => {
    setUploadModalOpen(false);
    setModalFile(null);
    setModalError('');
  }, []);

  // Esc fecha — mesma convenção dos outros modais do app.
  useEffect(() => {
    if (!uploadModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUploadModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [uploadModalOpen, closeUploadModal]);

  /**
   * Abre o modal. `file` vem preenchido quando o usuário ARRASTOU o arquivo —
   * soltar não diz qual é o tipo, então o modal abre com o arquivo pronto e o
   * tipo por responder. Mesmo problema do botão, mesma resposta.
   */
  const openUploadModal = useCallback(
    (file: File | null = null) => {
      if (tiposDisponiveis.length === 0) {
        // Avisar em vez de abrir um seletor vazio — controle morto.
        showToast('Nenhum tipo de documento disponível para novo upload.');
        return;
      }
      setModalDocId('');
      setModalFile(file);
      setModalError('');
      setUploadModalOpen(true);
    },
    [tiposDisponiveis, showToast],
  );

  // ── Arrastar e soltar ────────────────────────────────────────────────────

  /*
   * A zona anuncia "Arraste um arquivo" desde sempre e não tinha handler
   * nenhum — a promessa não funcionava. Mesmo desenho do único drag-and-drop
   * que já existia no app (`pendencia-ticket.tsx`): `preventDefault` no
   * dragOver E no drop, realce enquanto o arquivo está sobre a zona, e o
   * primeiro arquivo da lista.
   *
   * ⚠️ Sem o `preventDefault` no dragOver o `drop` nem dispara; sem ele no
   * drop, o navegador ABRE o arquivo e a aplicação sai da tela.
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      // Arrastar texto/link também dispara `drop`: sem arquivo não há o que abrir.
      if (!file) return;
      openUploadModal(file);
    },
    [openUploadModal],
  );

  const confirmUploadModal = useCallback(async () => {
    if (!canWrite || busyDocId) return;
    if (!modalDocId) {
      setModalError('Selecione o tipo do documento.');
      return;
    }
    if (!modalFile) {
      setModalError('Escolha um arquivo.');
      return;
    }
    setModalError('');
    try {
      // `replace = false`: aqui só entra linha sem arquivo, então não há o que
      // substituir — e o toast de substituição diria algo que não aconteceu.
      await uploadToDoc(modalDocId, modalFile, false);
      closeUploadModal();
    } catch (err: unknown) {
      /*
       * Modal fica ABERTO com o arquivo escolhido: a mensagem do backend é o que
       * diz o que consertar (tipo não aceito, tamanho), e fechar descartaria o
       * arquivo junto com a explicação.
       */
      setModalError(
        err instanceof Error ? err.message : 'Falha ao anexar o documento. Tente novamente.',
      );
    }
  }, [canWrite, busyDocId, modalDocId, modalFile, uploadToDoc, closeUploadModal]);

  // ── Reuse / Remove mutations ─────────────────────────────────────────────

  const runMutation = useCallback(
    async (docId: string, action: 'reuse' | 'remove') => {
      if (busyDocId) return;
      // Read-only profile: the API answers 403; nothing to run.
      if (!canWrite) return;
      setBusyDocId(docId);

      try {
        if (action === 'reuse') {
          const updated = await reuse(opportunityId, docId);
          const name = result?.docs.find((d) => d.id === docId)?.name ?? '';
          showToast(`"${name}" vinculado do repositório sem novo upload. (HU-17.1)`);
          setResult((prev) => {
            if (!prev) return prev;
            return { ...prev, docs: prev.docs.map((d) => (d.id === docId ? updated : d)) };
          });
        } else {
          const wasReused = result?.docs.find((d) => d.id === docId)?.reused;
          await remove(opportunityId, docId);
          showToast(
            wasReused
              ? 'Reutilização desfeita — documento voltou ao repositório.'
              : 'Documento removido da proposta.',
          );
          // Reload the full checklist: the doc ID can change after unlinking
          // (UUID → category::type) and the status reverts server-side.
          loadChecklist(opportunityId);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao executar a ação. Tente novamente.';
        showToast(msg);
      } finally {
        setBusyDocId(null);
      }
    },
    [opportunityId, reuse, remove, busyDocId, result, showToast, loadChecklist, canWrite],
  );

  // ── Conferência SNEG (RN-F9-03) ──────────────────────────────────────────

  const runValidation = useCallback(
    async (docId: string, validado: boolean) => {
      if (busyDocId) return;
      // `canValidate`, NÃO `canWrite`: conferir é da SNEG e anexar é do LT.
      // Barrar aqui pelo guard de anexar era o bug — o menu mostrava os itens e
      // o clique não fazia nada, porque a função voltava nesta linha.
      if (!canValidate) return;
      setBusyDocId(docId);

      try {
        // O item volta RECALCULADO pelo backend, pelo mesmo engine que monta o
        // checklist — a tela nunca vira o status por conta própria (`vencido`
        // vence a validação, e só o engine sabe disso).
        const updated = await setValidation(opportunityId, docId, validado);
        const name = result?.docs.find((d) => d.id === docId)?.name ?? '';
        showToast(
          validado ? `"${name}" validado.` : `Validação de "${name}" desfeita.`,
        );
        setResult((prev) => {
          if (!prev) return prev;
          return { ...prev, docs: prev.docs.map((d) => (d.id === docId ? updated : d)) };
        });
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Falha ao atualizar o documento.';
        showToast(msg);
      } finally {
        setBusyDocId(null);
      }
    },
    [opportunityId, setValidation, busyDocId, result, showToast, canValidate],
  );

  /*
   * Documentos com pedido de reenvio EM ABERTO.
   *
   * Vem das pendências reais, não de estado só de sessão: um selo que sumisse
   * no reload afirmaria "nenhum reenvio pedido" sobre um pedido que existe — e
   * é justamente depois de recarregar que o analista volta para conferir.
   *
   * A leitura é do frontend porque `pendencias` já importa entities de
   * `documents`; um checklist que lesse pendências fecharia o ciclo que o gate
   * de fronteiras recusa. A correlação é pelo título, montado por
   * `tituloReenvioDocumento` — fonte única usada por quem cria e por quem
   * procura.
   *
   * Falha ao listar ⇒ nenhum selo, e o checklist continua. É degradação
   * conhecida: o pedido existe e não aparece. O contrário — inventar o selo —
   * seria pior.
   */
  const [reenviosAbertos, setReenviosAbertos] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useEffect(() => {
    let active = true;
    // Sem `status` na query, filtrando pelo predicado: o parâmetro do backend
    // aceita UM valor, e `status: 'Aberta'` — o que estava aqui — perdia a
    // pendência que alguém pôs `Em tratativa`, apagando o selo de um reenvio
    // que segue pendente. As duas são ativas (ver PENDENCIA_STATUS_ATIVOS).
    listPendencias({ opportunityRef: opportunityId })
      .then((res) => {
        if (!active) return;
        const titulos = new Set(
          res.items
            .filter(
              (item) =>
                item.opportunityId === opportunityId && isPendenciaAtiva(item.status),
            )
            .map((item) => item.title),
        );
        setReenviosAbertos(titulos);
      })
      .catch(() => {
        /* sem selo; o checklist é o que importa nesta tela */
      });
    return () => {
      active = false;
    };
  }, [opportunityId, listPendencias]);

  const runSolicitarReenvio = useCallback(
    async (doc: ChecklistDoc) => {
      if (busyDocId) return;
      // Recusar o documento é o outro lado da conferência — mesma autoridade.
      if (!canValidate) return;
      setBusyDocId(doc.id);

      try {
        await solicitarReenvio(opportunityId, doc.name);
        // Marca a linha na hora; a próxima carga confirma pela pendência real.
        setReenviosAbertos((prev) =>
          new Set(prev).add(tituloReenvioDocumento(doc.name)),
        );
        showToast(`Reenvio de "${doc.name}" solicitado ao LT.`);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Falha ao solicitar o reenvio.';
        showToast(msg);
      } finally {
        setBusyDocId(null);
      }
    },
    [opportunityId, solicitarReenvio, busyDocId, showToast, canValidate],
  );

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loadStatus === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando documentos…</span>
        <div className="h-16 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Not-found state
  // ---------------------------------------------------------------------------

  if (loadStatus === 'not-found') {
    return (
      <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center">
        <h1 className="text-(length:--t-h3) font-bold text-(--neutral-900)">
          Oportunidade não encontrada
        </h1>
        <p className="mx-auto mt-2 max-w-md text-(length:--t-caption) text-(--color-text-muted)">
          Verifique o código da oportunidade ou volte à listagem.
        </p>
        <Link
          href="/oportunidades"
          className="mt-5 inline-block font-bold text-(--secondary-600) hover:underline"
        >
          ‹ Voltar para Oportunidades
        </Link>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (loadStatus === 'error' || !result) {
    return (
      <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center">
        <h1 className="text-(length:--t-h3) font-bold text-(--neutral-900)">
          Falha ao carregar documentos
        </h1>
        <p className="mx-auto mt-2 max-w-md text-(length:--t-caption) text-(--color-text-muted)">
          Não foi possível obter o checklist desta oportunidade. Tente novamente em instantes.
        </p>
        <Link
          href="/oportunidades"
          className="mt-5 inline-block font-bold text-(--secondary-600) hover:underline"
        >
          ‹ Voltar para Oportunidades
        </Link>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Loaded state
  // ---------------------------------------------------------------------------

  const { opportunityCode, opportunityName, opportunityState, docs, stages } = result;

  /*
   * A conferência só cabe enquanto a oportunidade está EM ANÁLISE: é a janela em
   * que o parecer é montado, em que o GATE 2 cobra `documentos_nao_validados` e
   * em que o backend aceita a escrita. Comparação contra o valor do enum do
   * backend, que é o que o read model carrega.
   */
  const emAnalise = opportunityState === 'EM_ANALISE';

  const dispensaProspect =
    result.obrigatoriedadeDispensada === MotivoDaDispensaDeObrigatoriedade.ClienteProspect;

  // Apply stage filter
  const filteredDocs =
    activeStage === 'todas' ? docs : docs.filter((d) => d.stage === activeStage);

  const categories = uniqueCategories(filteredDocs);
  const { validated, total } = completude(docs, opportunityState);
  const completenessPercent = total > 0 ? Math.round((validated / total) * 100) : 0;

  // Document stages required by the opportunity's CURRENT phase — used to
  // highlight, in the list, which documents make up the "X/Y" above.
  const currentDue = dueStages(opportunityState);
  const isRequiredThisPhase = (doc: ChecklistDoc): boolean =>
    doc.required && doc.stageLimit != null && currentDue.has(doc.stageLimit);

  // Empty state (no docs for selected stage)
  const isEmpty = filteredDocs.length === 0;

  return (
    <div>
      {/* Page header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-(length:--t-h2) font-bold text-(--neutral-900)">
            Documentos &amp; anexos
          </h1>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Oportunidade
            {opportunityCode ? (
              <>
                {' '}
                <strong>{opportunityCode}</strong>
              </>
            ) : null}
            {opportunityName ? ` · ${opportunityName}` : null}
          </p>
        </div>
        <Link
          href={`/oportunidades/${opportunityId}`}
          className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--color-surface) px-4 py-2 text-[13px] font-bold text-(--secondary-500) transition hover:bg-(--neutral-40)"
        >
          ← Voltar
        </Link>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* Left column: upload area + filters + doc list */}
        <div>
          {/* Hidden file input — triggered by the Anexar / Novo upload buttons */}
          <input
            ref={fileInputRef}
            type="file"
            data-testid="file-input"
            className="sr-only"
            onChange={(e) => void handleFileChange(e)}
          />

          {/* Upload drop zone — só para quem pode anexar. A zona não oferece
              mais nada, então para a SNEG (que confere, não anexa) ela era
              controle morto: clicar abria um modal cujo "Anexar" nada fazia. */}
          {canWrite && (
          <div
            data-testid="dropzone"
            role="region"
            aria-label="Área de upload de documento"
            data-drag-active={dragActive}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`mb-3 rounded-[var(--radius-md)] border-2 border-dashed p-5 text-center transition-colors ${
              dragActive
                ? 'border-(--secondary-500) bg-(--color-info-bg)'
                : 'border-(--color-border-strong) bg-(--color-surface)'
            }`}
          >
            {/*
              Divergência DELIBERADA do protótipo (`13-documentos.html:79`, que
              diz "…ou anexe a partir do repositório do cliente") — pedido do
              negócio, 24/08/2026.

              O texto do protótipo aponta para a ação erRADA: reusar do
              repositório do cliente é o item "Reusar" DA LINHA, não desta zona.
              Aqui as duas entradas são arrastar e o botão ao lado, e agora a
              frase nomeia exatamente essas duas.
            */}
            <p className="text-(length:--t-body) font-bold">
              Arraste um arquivo ou anexe a partir do botão.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                data-testid="dropzone-novo-upload"
                /*
                 * Abre o modal "tipo + arquivo". Antes o atalho pegava
                 * `docs.find(status === 'pendente' && selectable)` — a PRIMEIRA
                 * linha pendente na ORDEM DA TELA —, então anexar o terceiro
                 * tipo exigia anexar os dois anteriores antes ou abrir o menu da
                 * linha. Quem escolhe o tipo agora é o usuário, como no
                 * repositório do cliente.
                 */
                /* Sem argumento: o clique não traz arquivo, ao contrário do
                   drop. `onClick={openUploadModal}` passaria o evento como
                   `file`. */
                onClick={() => openUploadModal()}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-hover)"
              >
                Novo upload
              </button>
            </div>
          </div>
          )}

          {/* Stage filter chips */}
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por etapa">
            <button
              type="button"
              onClick={() => setActiveStage('todas')}
              aria-pressed={activeStage === 'todas'}
              className={`rounded-full border px-3 py-1.5 text-(length:--t-small) font-bold transition ${
                activeStage === 'todas'
                  ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                  : 'border-(--color-border) bg-white text-(--color-text) hover:bg-(--neutral-40)'
              }`}
            >
              Todas
            </button>
            {stages.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => setActiveStage(stage)}
                aria-pressed={activeStage === stage}
                className={`rounded-full border px-3 py-1.5 text-(length:--t-small) font-bold transition ${
                  activeStage === stage
                    ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                    : 'border-(--color-border) bg-white text-(--color-text) hover:bg-(--neutral-40)'
                }`}
              >
                {stage}
              </button>
            ))}
          </div>

          {/* Empty state for filtered view */}
          {isEmpty ? (
            <p className="py-8 text-center text-(length:--t-caption) text-(--color-text-muted)">
              Nenhum documento para esta etapa.
            </p>
          ) : (
            /* Document list by category */
            categories.map((cat) => {
              const catDocs = filteredDocs.filter((d) => d.category === cat);
              const isOutOfScope = catDocs.some((d) => d.outOfScope);

              return (
                <div key={cat}>
                  {/* Category heading */}
                  <div className="mt-3.5 mb-1.5 flex items-center gap-2 text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
                    {cat}
                    {isOutOfScope && (
                      <span className="rounded-full bg-(--neutral-60) px-1.5 py-0.5 text-[11px] font-bold text-(--neutral-600)">
                        fora do recorte
                      </span>
                    )}
                  </div>

                  {catDocs.map((doc) => {
                    const isBusy = busyDocId === doc.id;
                    const requiredThisPhase = isRequiredThisPhase(doc);
                    /*
                     * Uma frase por linha, derivada de `required` — não duas
                     * (VBR-645). Antes o rótulo saía de `stage` e o sufixo
                     * `· não obrigatório` era acrescentado adiante, produzindo
                     * duas leituras erradas ao mesmo tempo:
                     *
                     * - "Não obrigatório · pdf · não obrigatório" — a mesma
                     *   informação duas vezes na mesma linha.
                     * - "Exigido até: Cálculo da alçada · não obrigatório" — uma
                     *   contradição direta. `stage` é o LIMITE da fase (até
                     *   quando faria sentido cobrar, se fosse cobrado) e
                     *   `required` é se é cobrado; um documento opcional tem
                     *   limite de fase e não tem exigência, então anunciar
                     *   "Exigido até" para ele afirma o que `required` nega.
                     *
                     * `required` vence porque é o campo que o gate honra.
                     */
                    const deadlineLabel = !doc.required
                      ? 'Não obrigatório'
                      : `Exigido até: ${doc.stage}`;

                    return (
                      <div
                        key={doc.id}
                        className={`mb-2 flex items-center gap-3 rounded-[var(--radius-xs)] border bg-(--color-surface) px-3.5 py-3 ${
                          requiredThisPhase
                            ? requiredHighlightClasses(doc.status).border
                            : 'border-(--color-border)'
                        }`}
                      >
                        {/* Doc icon */}
                        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[var(--radius-xxs)] bg-(--neutral-60) text-(--neutral-600)">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
                              stroke="currentColor"
                              strokeWidth="1.25"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M10 2v4h4"
                              stroke="currentColor"
                              strokeWidth="1.25"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>

                        {/* Doc metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-(length:--t-caption) font-bold">
                            {doc.name}
                            {/*
                             * ADO — 14/09/2026. A FAP é exigida POR PONTO
                             * (RN-F4-02) e o GATE 1 a cobra proposta a proposta,
                             * então duas propostas BR Mania rendem DUAS linhas
                             * `FAP BR Mania`. Sem o código ao lado elas ficam
                             * byte a byte idênticas, e a queixa que originou
                             * isto foi justamente não conseguir distinguir —
                             * *"criei as duas e vi só uma"*.
                             *
                             * Vem logo após o nome, antes de qualquer outro
                             * selo: é o que responde "qual delas é esta?", e um
                             * discriminador no fim da fila de badges some no
                             * wrap.
                             *
                             * `shortProposalCode` é o MESMO fallback do resto do
                             * app (`P-` + primeiro segmento do uuid) — proposta
                             * sem código é rara e legível, nunca um código
                             * inventado que pareça de negócio.
                             */}
                            {doc.proposalId && (
                              <span
                                data-testid={`proposta-badge-${doc.id}`}
                                className="rounded-full bg-(--neutral-60) px-1.5 py-0.5 text-[11px] font-bold text-(--neutral-600)"
                              >
                                {shortProposalCode(doc.proposalId, doc.proposalCode)}
                              </span>
                            )}
                            {requiredThisPhase && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${requiredHighlightClasses(doc.status).badge}`}>
                                Obrigatório nesta fase
                              </span>
                            )}
                            {/*
                             * Este slot dizia "● no repositório" para
                             * `validado` — vocabulário de OUTRO status (`repo`
                             * é o que significa "está no repositório, não
                             * vinculado"), então um documento conferido se
                             * anunciava como não vinculado.
                             *
                             * ⚠️ O selo NOMEAVA o perfil, e nomeou os dois
                             * errados em sequência: "Validado pela SNEG" até
                             * 26/08/2026 e "Validado pela CCOB" depois do ADO
                             * 67906. Desde 31/08/2026 a conferência é da SNEG
                             * **e** da CCOB (`DOCUMENT_VALIDATE_ROLES`), então
                             * qualquer nome ali afirma quem fez o trabalho sem
                             * saber. Rótulo NEUTRO: quem validou está em
                             * `validated_by_id`, que é onde a pergunta "quem?"
                             * tem resposta.
                             */}
                            {doc.status === 'validado' && (
                              <span
                                data-testid={`validado-badge-${doc.id}`}
                                className="rounded-full bg-(--secondary-100) px-1.5 py-0.5 text-[11px] font-bold text-(--secondary-700)"
                              >
                                ✓ Validado
                              </span>
                            )}
                            {doc.status === 'repo' && (
                              <span className="rounded-full bg-(--secondary-100) px-1.5 py-0.5 text-[11px] font-bold text-(--secondary-700)">
                                ● no repositório
                              </span>
                            )}
                            {/*
                             * Atenção (amarelo), não erro: existe um pedido em
                             * aberto e o que falta é o LT reenviar — nada
                             * quebrou. Some sozinho quando a pendência é
                             * resolvida, porque a lista só traz as ABERTAS.
                             */}
                            {reenviosAbertos.has(tituloReenvioDocumento(doc.name)) && (
                              <span
                                data-testid={`reenvio-badge-${doc.id}`}
                                className="rounded-full bg-(--yellow-100) px-1.5 py-0.5 text-[11px] font-bold text-(--yellow-700)"
                              >
                                ⏳ Reenvio solicitado
                              </span>
                            )}
                            {/*
                              * Só o fato que ESTE selo conhece: a linha aceita um
                              * arquivo só (RN-F9-05). Os tipos aceitos ficam na
                              * linha de baixo, vindos de `doc.acceptedTypes` — em
                              * um lugar só.
                              *
                              * O protótipo escreve `1 arquivo · pdf` literal
                              * (13-documentos.html:171) e ali era verdade por
                              * coincidência: no dataset dele toda linha `unico`
                              * era `tipos:'pdf'`. Reproduzir a string depois que o
                              * catálogo mudou faz o selo CONTRADIZER a linha logo
                              * abaixo — e o selo é o elemento mais forte dos dois,
                              * então ele é o que o leitor acredita. Já era falso
                              * para `Documento complementar da garantia`
                              * (pdf, excel, word, png, jpeg) antes de VBR-582, e
                              * a migration `…093` o tornaria falso em mais seis
                              * linhas: exatamente o defeito deste bug — a tela
                              * informando ao LT um tipo aceito que não é o real.
                              */}
                            {/*
                              * "máx. 1 arquivo", não "1 arquivo": é LIMITE, não
                              * contagem. Numa linha sem nenhum anexo — o estado
                              * inicial de toda linha — o selo antigo afirmava um
                              * arquivo que não existe, ao lado do status
                              * "Pendente" (VBR-645). O selo é o elemento mais
                              * forte dos dois, então é nele que o leitor acredita.
                              */}
                            {doc.single && (
                              <span className="rounded-full bg-(--yellow-100) px-1.5 py-0.5 text-[11px] font-bold text-(--yellow-700)">
                                máx. 1 arquivo
                              </span>
                            )}
                            {/*
                              * A linha perde as ações de anexar (`selectable:
                              * false`), então precisa dizer por quê — um menu que
                              * some sem explicação lê como falta de permissão.
                              *
                              * ⚠️ São DOIS motivos, e o selo distingue: linha
                              * APOSENTADA (`required: false` — VBR-645, mantida
                              * só para o anexo antigo continuar legível) × linha
                              * com OUTRO DONO (`required: true`, ADO 09/09/2026 —
                              * as fotos do ponto da franquia, cuja única rota é o
                              * bloco da proposta). "Não recebe novos anexos" seria
                              * falso na segunda: ela recebe, em outra tela.
                              *
                              * A derivação é honesta porque um obrigatório que o
                              * hub não aceita SÓ pode ser satisfeito por fora —
                              * senão seria exigência inalcançável.
                              *
                              * Já satisfeita, o selo azul logo abaixo diz o mesmo
                              * no passado; dois selos ali seriam ruído.
                              */}
                            {!doc.selectable &&
                              (doc.required ? (
                                !doc.satisfiedExternally && (
                                  <span className="rounded-full bg-(--blue-100) px-1.5 py-0.5 text-[11px] font-bold text-(--blue-700)">
                                    envie no bloco da proposta
                                  </span>
                                )
                              ) : (
                                <span className="rounded-full bg-(--neutral-60) px-1.5 py-0.5 text-[11px] font-bold text-(--neutral-600)">
                                  não recebe novos anexos
                                </span>
                              ))}
                            {/*
                              * VBR-642: a exigência foi cumprida noutra tela. Sem
                              * dizer ONDE, a linha marcada como atendida sem
                              * nome de arquivo parece um bug — e o LT não
                              * saberia por onde trocar a foto.
                              */}
                            {doc.satisfiedExternally && (
                              <span className="rounded-full bg-(--blue-100) px-1.5 py-0.5 text-[11px] font-bold text-(--blue-700)">
                                enviado no bloco da proposta
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">
                            {deadlineLabel} · {doc.acceptedTypes}
                            {/*
                              * ADO 67993 — a validade do arquivo anexado, quando
                              * declarada no upload pelo repositório do cliente.
                              *
                              * Só quando EXISTE: escrever "sem validade" em toda
                              * linha pendente do checklist encheria a lista de
                              * ruído sobre um arquivo que nem foi enviado. É a
                              * data que torna a etiqueta "Vencido" legível — sem
                              * ela, a pill vermelha não diz desde quando.
                              */}
                            {doc.expiresAt
                              ? ` · válido até ${formatValidade(doc.expiresAt)}`
                              : ''}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-none items-center gap-2">
                          {/*
                           * A pill é o status da linha — MENOS quando o
                           * documento está validado: aí o selo "✓ Validado", ao
                           * lado do nome, já diz exatamente isso, e a pill
                           * virava um segundo "Validado" na mesma linha.
                           * Um fato, um lugar.
                           */}
                          {doc.status !== 'validado' && (
                            <StatusPill variant={statusVariant(doc.status)} size="sm">
                              {statusLabel(doc.status)}
                            </StatusPill>
                          )}
                          <ActionMenu
                            doc={doc}
                            busy={isBusy}
                            emAnalise={emAnalise}
                            podeConferir={canValidate}
                            podeGerenciar={canWrite}
                            podeGerenciarFranquia={canManageFranquia}
                            onValidar={() => void runValidation(doc.id, true)}
                            onDesfazerValidacao={() => void runValidation(doc.id, false)}
                            onSolicitarReenvio={() => void runSolicitarReenvio(doc)}
                            onAttach={() =>
                              triggerFilePicker(
                                doc.id,
                                false,
                                fileAcceptAttribute(doc.acceptedTypes),
                              )
                            }
                            onReuse={() => void runMutation(doc.id, 'reuse')}
                            onRemove={() => void runMutation(doc.id, 'remove')}
                            onUndo={() => void runMutation(doc.id, 'remove')}
                            onReplace={() =>
                              triggerFilePicker(
                                doc.id,
                                true,
                                fileAcceptAttribute(doc.acceptedTypes),
                              )
                            }
                            onView={() => {
                              /*
                               * `downloadUrl` vem de payload e aqui vira
                               * NAVEGAÇÃO — `urlDeMidiaSegura` é o ponto em que
                               * ela deixa de ser string qualquer (CWE-73).
                               * Recusada, o clique não faz nada: abrir uma aba
                               * para destino que ninguém escolheu é pior.
                               *
                               * O `withBasePath` saiu junto: `downloadUrl` já
                               * chega prefixado do mapper (`apiUrl`), e a
                               * segunda aplicação só não quebrava porque o
                               * helper é idempotente (VBR-638).
                               */
                              const alvo = urlDeMidiaSegura(doc.downloadUrl);
                              if (alvo !== null) {
                                window.open(alvo, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}

          <OutrasOrigensBlock
            opportunityId={opportunityId}
            grupos={result?.outrasOrigens ?? []}
          />
        </div>

        {/* Right column: completude panel */}
        <aside className="lg:sticky lg:top-4">
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
            <div className="flex items-center justify-between text-(length:--t-caption) font-bold">
              <span>
                Obrigatórios ·{' '}
                <span className="text-(--secondary-600)">{phaseLabel(opportunityState)}</span>
              </span>
              <span aria-label={`${validated} de ${total}`}>
                {validated}/{total}
              </span>
            </div>

            {/* Gauge bar */}
            <div
              className="my-2 h-2.5 overflow-hidden rounded-full bg-(--neutral-100)"
              role="progressbar"
              aria-valuenow={completenessPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso de completude dos documentos obrigatórios"
            >
              <div
                className="h-full rounded-full bg-(--secondary-500) transition-[width] duration-300"
                style={{ width: `${completenessPercent}%` }}
              />
            </div>

            {dispensaProspect ? (
              /*
               * Veredito do backend (23/09/2026): cliente prospect não tem
               * documento obrigatório. Dito aqui porque, sem o motivo, uma lista
               * inteira de "Não obrigatório" lê como catálogo quebrado.
               */
              <p
                className="text-(length:--t-small) text-(--color-text-muted)"
                data-testid="checklist-dispensa-prospect"
              >
                Cliente <b className="font-bold">prospect</b> (ainda sem Código SAP): nenhum
                documento é obrigatório nesta oportunidade. Anexe o que já tiver — os
                documentos seguem disponíveis para conferência.
              </p>
            ) : (
              <p className="text-(length:--t-small) text-(--color-text-muted)">
                {validated} de {total} documentos obrigatórios da fase{' '}
                <b className="font-bold">{phaseLabel(opportunityState)}</b> anexados.
              </p>
            )}
            {!dispensaProspect && hasLaterStages(opportunityState) && (
              <p className="mt-1 text-(length:--t-small) text-(--color-text-muted)">
                Outros documentos passam a ser exigidos conforme a oportunidade avança de
                fase.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/*
        Modal do dropzone — escolher o TIPO e depois o arquivo. Espelha o
        "Anexar documento" do repositório do cliente (`client-repository.tsx`),
        que é o desenho que o negócio pediu: mesmo rótulo de opção
        ("categoria · nome"), mesmas duas validações e mesmo par Cancelar/Anexar.
      */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeUploadModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Anexar documento"
            data-testid="upload-modal"
            className="w-full max-w-[480px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-(length:--t-h4) font-bold text-(--neutral-900)">
              Anexar documento
            </h3>

            {/*
              * `FieldLabel size="caption"` + `Select` na variante PADRÃO
              * (`bottom-border`) — o `.in` do protótipo, o mesmo par dos modais
              * de franquia. Ver o gêmeo em `client-repository.tsx`.
              */}
            <FieldLabel htmlFor="upload-modal-tipo" size="caption">
              Tipo do documento
            </FieldLabel>
            <Select
              id="upload-modal-tipo"
              data-testid="upload-modal-tipo"
              value={modalDocId}
              disabled={busyDocId !== null}
              onChange={(v) => {
                setModalDocId(v);
                setModalError('');
              }}
              /* `d.id` como valor: para linha sem arquivo é a chave sintética
                 `category::type`, que é exatamente o que `attach` endereça. */
              options={tiposDisponiveis.map((d) => ({
                value: d.id,
                label: `${d.category} · ${d.name}`,
              }))}
            />

            {/* `div`, não `FieldLabel`: o controle do arquivo é o `<label>`
                logo abaixo. */}
            <div className="mt-4 mb-1 block text-(length:--t-caption) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
              Arquivo
            </div>
            <label className={`${SECONDARY_OUTLINE_BTN} cursor-pointer`}>
              {modalFile ? 'Trocar arquivo' : 'Escolher arquivo'}
              <input
                type="file"
                data-testid="upload-modal-arquivo"
                className="sr-only"
                aria-label="Arquivo do documento"
                /* Filtro do tipo ESCOLHIDO no select acima (ADO 67547). Sem
                   tipo escolhido não há o que filtrar. */
                accept={fileAcceptAttribute(
                  tiposDisponiveis.find((d) => d.id === modalDocId)?.acceptedTypes,
                )}
                onChange={(e) => {
                  setModalFile(e.target.files?.[0] ?? null);
                  setModalError('');
                }}
              />
            </label>
            {modalFile && (
              <span className="ml-2 text-[13px] text-(--color-text-muted)">
                {modalFile.name}
              </span>
            )}

            {modalError && (
              <p
                role="alert"
                className="mt-3 text-[13px] font-bold text-(--color-danger)"
              >
                {modalError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" onClick={closeUploadModal} className={SECONDARY_OUTLINE_BTN}>
                Cancelar
              </button>
              <button
                type="button"
                data-testid="upload-modal-confirmar"
                disabled={busyDocId !== null || !modalDocId || !modalFile}
                onClick={() => void confirmUploadModal()}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyDocId !== null ? 'Enviando…' : 'Anexar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && <Toast message={toast} onDismiss={clearToast} />}
    </div>
  );
}
