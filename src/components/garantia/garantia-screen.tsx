'use client';

import Link from 'next/link';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  LINK_ACTION,
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { StatusPill } from '@/components/status-pill';
import { ToastContainer, useToast } from '@/components/toast';
import { WriteOnly } from '@/components/auth/write-only';
import { usePermissions } from '@/hooks/use-permissions';
import { confirmarPrevia as defaultConfirmarPrevia } from '@/lib/garantia/garantia.api';
import { getGarantia as defaultGetGarantia } from '@/lib/garantia/garantia.api';
import { salvarMinuta as defaultSalvarMinuta } from '@/lib/garantia/garantia.api';
import { reatribuirAnalisePrevia as defaultReatribuirPrevia } from '@/lib/garantia/garantia.data';
import { reatribuirAnalistaSnegGarantia as defaultReatribuirSneg } from '@/lib/garantia/garantia.data';
import { AnalistaPickerModal } from '@/components/governanca/analista-picker-modal';
import { searchCcobAnalysts as defaultSearchCcobAnalysts } from '@/lib/opportunities/directory.data';
import { searchSnegAnalysts as defaultSearchSnegAnalysts } from '@/lib/opportunities/directory.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';
import { GarantiasIndicadasCard } from '@/components/opportunities/garantias-indicadas-card';
import { PerfilCreditoDetalhesTrigger } from '@/components/perfil-credito/perfil-credito-detalhes-trigger';
import type { GarantiaView } from '@/lib/garantia/garantia-mapping';
import type { GarantiaIndicacaoItem } from '@/lib/garantia/indicacoes.types';
import { EstadoGarantia, ResultadoPrevia } from '@/lib/garantia/types';
import { taxIdLabel } from '@/lib/clients/format';
import { formatInstantDateTimeBR } from '@/lib/date-format';
import { Permission } from '@/lib/auth-permissions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  opportunityId: string;
  /** Injected in tests to drive each UI state without a network call. */
  getGarantia?: (id: string) => Promise<GarantiaView>;
  confirmarPrevia?: (
    id: string,
    payload: { parecer: string; resultado: ResultadoPrevia },
  ) => Promise<GarantiaView>;
  salvarMinuta?: (id: string, payload: { netlexId: string }) => Promise<GarantiaView>;
  /**
   * Repassada ao `GarantiasIndicadasCard`, que busca a própria lista.
   *
   * Existe pelo mesmo motivo das outras: sem ela um teste desta tela não
   * controla o card, e ele renderiza o estado de erro por falta de rede.
   */
  loadIndicacoes?: (opportunityId: string) => Promise<GarantiaIndicacaoItem[]>;
  /**
   * Reatribuição da análise prévia (roteamento da CCOB — 04/09/2026).
   *
   * Injetável como as demais: sem ela um teste desta tela não controla o
   * desfecho da ação e cairia na rede.
   */
  reatribuirPrevia?: (
    id: string,
    payload: { analistaId: string; motivo?: string },
  ) => Promise<unknown>;
  /** Busca de analistas da CCOB para o seletor de reatribuição. */
  searchCcobAnalysts?: (query: string) => Promise<DirectoryUser[]>;
  /**
   * Reatribuição do FLUXO DE GARANTIA (roteamento da SNEG — 20/09/2026).
   *
   * Injetável pela mesma razão das demais: sem ela um teste desta tela não
   * controla o desfecho da ação e cairia na rede.
   */
  reatribuirSneg?: (
    id: string,
    payload: { analistaId: string; motivo?: string },
  ) => Promise<unknown>;
  /** Busca de analistas da SNEG para o seletor de reatribuição do fluxo. */
  searchSnegAnalysts?: (query: string) => Promise<DirectoryUser[]>;
};

type LoadStatus = 'loading' | 'loaded' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns `true` when the estado means the prévia block is editable. */
function isEmAnalisePrevia(estado: string): boolean {
  return estado === EstadoGarantia.EM_ANALISE_PREVIA;
}

/** Returns `true` when the estado means the minuta block must be shown. */
function showMinuta(estado: string): boolean {
  return (
    estado === EstadoGarantia.PREVIA_APROVADA ||
    estado === EstadoGarantia.MINUTA_EM_ANDAMENTO
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * @param value - `ReactNode` e não `string`: a linha "Análise de perfil
 *   (pré-condição)" passou a ser o gatilho do detalhamento (ADO 67948), e ela é
 *   um dos quatro itens desta mesma faixa. Um componente à parte só para ela
 *   duplicaria o rótulo e o espaçamento.
 */
function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[14px] uppercase tracking-[.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="text-(length:--t-caption) font-bold mt-0.5">
        {value ?? '—'}
      </div>
    </div>
  );
}

function PanelRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex justify-between gap-2.5 text-(length:--t-caption) py-2 border-b border-(--color-border) last:border-b-0">
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-right">{value ?? '—'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PreviaBlock — editable or read-only depending on estado
// ---------------------------------------------------------------------------

function PreviaBlock({
  estado,
  previa,
  naoSeAplica,
  naoSeAplicaMotivo,
  onSubmit,
  canDecide,
  busy = false,
}: {
  estado: string;
  previa: GarantiaView['previa'];
  naoSeAplica: boolean;
  naoSeAplicaMotivo: string | null;
  onSubmit: (payload: { parecer: string; resultado: ResultadoPrevia }) => void;
  canDecide: boolean;
  busy?: boolean;
}) {
  const [parecer, setParecer] = useState('');
  const [resultado, setResultado] = useState<ResultadoPrevia | ''>('');

  // Sync textarea/radio when previa data arrives (e.g. after loading).
  useEffect(() => {
    if (previa?.parecer) setParecer(previa.parecer);
  }, [previa?.parecer]);

  const editable = isEmAnalisePrevia(estado);
  const locked = !editable && !naoSeAplica && !previa;

  if (naoSeAplica) {
    // Reason is composed by the backend (three distinct cases) — verbatim.
    return (
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        {naoSeAplicaMotivo ??
          'Não se aplica — esta oportunidade não requer análise prévia de garantia.'}
      </p>
    );
  }

  if (locked) {
    return (
      <>
        <p className="text-[14px] text-(--color-text-muted) mb-3">
          Disponível após a indicação do LT.
        </p>
        <div className="opacity-55 pointer-events-none">
          <label className="block text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1">
            Parecer da CCOB
          </label>
          <textarea
            disabled
            rows={7}
            className="w-full box-sizing-border-box font-[inherit] text-(length:--t-caption) border border-(--color-border-strong) rounded-[var(--radius-xs)] p-[9px_11px] min-h-16 resize-y"
            placeholder="Disponível após a indicação do LT."
          />
          <div className="mt-3.5">
            <span className="block text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1">
              Resultado da análise prévia
            </span>
            <label className="flex gap-2.5 items-start border border-(--color-border) rounded-[var(--radius-xs)] px-3.5 py-3 text-(length:--t-caption) mb-2">
              <input type="radio" disabled className="mt-0.5 accent-(--secondary-600)" />
              <div className="font-bold">Aprovar</div>
            </label>
            <label className="flex gap-2.5 items-start border border-(--color-border) rounded-[var(--radius-xs)] px-3.5 py-3 text-(length:--t-caption) mb-2">
              <input type="radio" disabled className="mt-0.5 accent-(--secondary-600)" />
              <div className="font-bold">Reprovar</div>
            </label>
          </div>
        </div>
      </>
    );
  }

  if (previa && !editable) {
    // Terminal states (Aprovada / Reprovada) — read-only parecer + resultado.
    return (
      <>
        <span className="block text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1">
          Parecer da CCOB
        </span>
        <p className="text-(length:--t-caption) whitespace-pre-wrap">
          {previa.parecer ?? '—'}
        </p>
        <span className="block text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mt-3.5 mb-1">
          Resultado da análise prévia
        </span>
        <div>
          <StatusPill
            variant={
              previa.resultado === ResultadoPrevia.REPROVADA ? 'danger' : 'success'
            }
          >
            {previa.resultadoLabel ?? 'Aprovada'}
          </StatusPill>
        </div>
      </>
    );
  }

  // Editable mode (EM_ANALISE_PREVIA) — only who decides (CCOB/Admin —
  // garantia.previa.decide) gets the form. Other profiles would see an
  // editable textarea with a permanently disabled button (dead control).
  if (!canDecide) {
    return (
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        Aguardando o parecer da CCOB. O resultado da análise prévia aparece
        aqui assim que for registrado.
      </p>
    );
  }

  /*
   * O gate da prévia é do BACKEND (`GarantiaService.getPreviaHabilitada`), o
   * mesmo que `garantia:aprovar-previa` aplica. A tela não o recalcula.
   *
   * Sem isto o CTA nascia habilitado com a pré-condição fechada: medido em
   * 25/08/2026 na OPP-2026-000063, perfil de crédito `ENCERRADO`, o analista
   * escreveu o parecer inteiro, clicou, confirmou no modal — e só então leu
   * "Aguardando a conclusão da análise de perfil de crédito". Trabalho gasto
   * antes de descobrir, e o motivo chegando pelo erro da mutação em vez de
   * pelo veredito.
   *
   * Campo ausente ⇒ BLOQUEADO, nunca liberado.
   */
  const podeConfirmar = previa?.podeConfirmar === true;
  const motivoBloqueio = podeConfirmar ? null : (previa?.motivoBloqueio ?? null);
  const canSubmit =
    !busy && podeConfirmar && parecer.trim().length > 0 && resultado !== '';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Guarda TAMBÉM no handler: um form envia no Enter mesmo com o botão
    // desabilitado por estado derivado.
    if (!resultado || busy || !podeConfirmar) return;
    onSubmit({ parecer: parecer.trim(), resultado });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor="parecer-ccob"
        className="block text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1"
      >
        Parecer da CCOB
      </label>
      <textarea
        id="parecer-ccob"
        rows={7}
        value={parecer}
        onChange={(e) => setParecer(e.target.value)}
        className="w-full box-sizing-border-box font-[inherit] text-(length:--t-caption) border border-(--color-border-strong) rounded-[var(--radius-xs)] p-[9px_11px] min-h-40 resize-y"
        placeholder="Descreva a análise prévia da garantia…"
        aria-label="Parecer da análise prévia"
      />

      <div className="mt-3.5">
        <span className="block text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1">
          Resultado da análise prévia
        </span>
        {([
          { value: ResultadoPrevia.APROVADA, label: 'Aprovar' },
          { value: ResultadoPrevia.REPROVADA, label: 'Reprovar' },
        ] as const).map(({ value, label }) => (
          <label
            key={value}
            className={`flex gap-2.5 items-start border rounded-[var(--radius-xs)] px-3.5 py-3 text-(length:--t-caption) mb-2 cursor-pointer ${
              resultado === value
                ? 'border-(--secondary-600) bg-(--secondary-100)'
                : 'border-(--color-border)'
            }`}
          >
            <input
              type="radio"
              name="resultado"
              value={value}
              checked={resultado === value}
              onChange={() => setResultado(value)}
              className="mt-0.5 accent-(--secondary-600)"
            />
            <div className="font-bold">{label}</div>
          </label>
        ))}
      </div>

      {/*
        O motivo vem ANTES do CTA, não dentro do modal de confirmação: quem lê
        precisa saber o que falta antes de escrever o parecer, não depois.
      */}
      {motivoBloqueio !== null && (
        <p
          data-testid="previa-bloqueio"
          className="mt-4 text-(length:--t-caption) text-(--yellow-700)"
        >
          {motivoBloqueio}
        </p>
      )}

      <WriteOnly>
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 inline-flex items-center rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2.25 text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--neutral-40) disabled:text-(--neutral-500)"
        >
          Confirmar análise prévia →
        </button>
      </WriteOnly>
    </form>
  );
}

// ---------------------------------------------------------------------------
// MinutaBlock — only shown when PREVIA_APROVADA or MINUTA_EM_ANDAMENTO
// ---------------------------------------------------------------------------

function MinutaBlock({
  minuta,
  onSave,
  canRegister,
}: {
  minuta: GarantiaView['minuta'];
  onSave: (netlexId: string) => void;
  canRegister: boolean;
}) {
  const [netlexId, setNetlexId] = useState(minuta?.netlexId ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canRegister || !netlexId.trim()) return;
    onSave(netlexId.trim());
  }

  // Only who registers the minuta (SNEG/Admin — garantia.minuta.register)
  // gets the editable form. Other profiles (CCOB/LT) read the same fields —
  // a permanently disabled "Salvar" would be a dead control.
  if (!canRegister) {
    return (
      <div className="grid grid-cols-2 gap-y-3.5 gap-x-5">
        <div>
          <div className="text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1">
            Número do Netlex
          </div>
          <p className="text-(length:--t-caption) font-bold">
            {minuta?.netlexId ?? '—'}
          </p>
        </div>
        <div>
          <div className="text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1">
            Status
          </div>
          <p className="text-(length:--t-caption) font-bold">
            {minuta?.statusLabel ?? '—'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-y-3.5 gap-x-5">
        <div>
          <label
            htmlFor="netlex-id"
            className="block text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1"
          >
            Número do Netlex
          </label>
          <input
            id="netlex-id"
            type="text"
            value={netlexId}
            onChange={(e) => setNetlexId(e.target.value)}
            placeholder="Ex.: NTX-2026-0428"
            className="w-full box-sizing-border-box font-[inherit] text-(length:--t-caption) border border-(--color-border-strong) rounded-[var(--radius-xs)] p-[9px_11px]"
          />
        </div>
        <div>
          <div className="text-[14px] uppercase tracking-[.3px] text-(--color-text-muted) mb-1">
            Status
          </div>
          <input
            type="text"
            disabled
            value={minuta?.statusLabel ?? '—'}
            className="w-full box-sizing-border-box font-[inherit] text-(length:--t-caption) border border-(--color-border-strong) rounded-[var(--radius-xs)] p-[9px_11px] opacity-55"
          />
        </div>
      </div>

      <WriteOnly>
        <button
          type="submit"
          disabled={!netlexId.trim()}
          className="mt-4 inline-flex items-center rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2.25 text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--neutral-40) disabled:text-(--neutral-500)"
        >
          Salvar
        </button>
      </WriteOnly>
    </form>
  );
}

// ---------------------------------------------------------------------------
// GarantiaScreen — main component
// ---------------------------------------------------------------------------

/**
 * Garantia screen — CCOB view (GAR-17).
 *
 * A single component with 3 states driven by `estado` from the backend:
 *  - AGUARDANDO_INDICACAO: waiting block; prévia locked.
 *  - EM_ANALISE_PREVIA: read-only indicação kv; editable prévia.
 *  - PREVIA_APROVADA / MINUTA_EM_ANDAMENTO: static indicação + prévia; minuta block.
 *
 * `naoSeAplica` (FIANCA_SEM_LASTRO) renders as "não se aplica", not as locked.
 *
 * All data functions are injectable via props so tests control each UI state
 * without a real network (standard repo pattern — see sneg-analise-shell.tsx).
 */
export function GarantiaScreen({
  opportunityId,
  getGarantia = defaultGetGarantia,
  confirmarPrevia: confirmarPreviaFn = defaultConfirmarPrevia,
  salvarMinuta: salvarMinutaFn = defaultSalvarMinuta,
  loadIndicacoes,
  reatribuirPrevia: reatribuirPreviaFn = defaultReatribuirPrevia,
  searchCcobAnalysts = defaultSearchCcobAnalysts,
  reatribuirSneg: reatribuirSnegFn = defaultReatribuirSneg,
  searchSnegAnalysts = defaultSearchSnegAnalysts,
}: Props) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [garantia, setGarantia] = useState<GarantiaView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const previaFormRef = useRef<HTMLDivElement>(null);

  const { toasts, addToast, removeToast } = useToast();
  const confirm = useConfirm();
  const { can } = usePermissions();

  const canDecide = can(Permission.GarantiaPreviaDecidir);
  /*
   * Roteamento da CCOB (04/09/2026): o mesmo gate das três ações de decisão da
   * prévia (`@Roles(CCOB, ADMIN)` — é o `@Roles` da rota de reatribuição
   * também). Quem responde pela fila é quem a redistribui, e um gate mais largo
   * ofereceria um CTA que a API recusa.
   */
  const [reatribuindo, setReatribuindo] = useState(false);
  const [reatribuindoBusy, setReatribuindoBusy] = useState(false);
  const canRegister = can(Permission.GarantiaMinutaRegistrar);
  /*
   * Roteamento da SNEG (20/09/2026): gate PRÓPRIO, espelhando
   * `@Roles(SNEG, ADMIN)` de `garantia:reatribuir-sneg` — o mesmo de
   * `salvar-minuta`. Reusar `canDecide` (CCOB) daria à CCOB um CTA que a API
   * recusa com 403, e tiraria da SNEG o único conserto da própria atribuição.
   */
  const canReatribuirSneg = can(Permission.GarantiaSnegReatribuir);
  const [reatribuindoSneg, setReatribuindoSneg] = useState(false);
  const [reatribuindoSnegBusy, setReatribuindoSnegBusy] = useState(false);

  // Fetch
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setLoadError(null);

    getGarantia(opportunityId)
      .then((data) => {
        if (cancelled) return;
        setGarantia(data);
        setStatus('loaded');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Falha ao carregar a garantia.';
        setLoadError(msg);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId, getGarantia]);

  // Action: confirmar prévia
  const handleConfirmarPrevia = useCallback(
    (payload: { parecer: string; resultado: ResultadoPrevia }) => {
      // Guard: handler rejects even when button is hidden (form submits on Enter)
      if (!canDecide) return;

      const doConfirm = async () => {
        setActionBusy(true);
        try {
          const updated = await confirmarPreviaFn(opportunityId, payload);
          setGarantia(updated);
          addToast('Análise prévia registrada com sucesso.', 'success');
        } catch (err: unknown) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Falha ao registrar a análise prévia.';
          addToast(msg, 'error');
          // Re-throw so the confirm dialog keeps the modal open on failure
          throw err;
        } finally {
          setActionBusy(false);
        }
      };

      /*
       * BOTH outcomes confirm. The repo criterion is "writes AND (moves state
       * or notifies)", and approving does both: it transitions the guarantee to
       * `PREVIA_APROVADA` and hands the subprocess to the SNEG. Only reproving
       * asked, so the irreversible half of the decision was the unguarded one.
       *
       * `tone: 'danger'` stays exclusive to the reprovação — it opens a
       * pendência against the LT; approval is the ordinary path forward.
       */
      const reprovando = payload.resultado === ResultadoPrevia.REPROVADA;

      confirm.ask({
        title: reprovando
          ? 'Reprovar a análise prévia?'
          : 'Aprovar a análise prévia?',
        description: reprovando
          ? 'Será aberta uma pendência para o LT corrigir os dados da garantia.'
          : 'A garantia segue para a minuta e a SNEG é notificada. O parecer registrado não pode ser reeditado nesta tela.',
        confirmLabel: reprovando ? 'Reprovar' : 'Aprovar',
        cancelLabel: 'Cancelar',
        ...(reprovando ? { tone: 'danger' as const } : {}),
        onConfirm: doConfirm,
      });
    },
    [canDecide, confirmarPreviaFn, opportunityId, addToast, confirm],
  );

  /**
   * Reatribuição da análise prévia (roteamento da CCOB — 04/09/2026).
   *
   * ⚠️ **Relê a garantia, e não faz flip otimista.** A resposta do backend é a
   * atribuição, mas o TEXTO que a meta escreve (`responsavelPrevia`) é composto
   * no read model — remontá-lo aqui seria uma segunda cópia da regra, e ela
   * divergiria no dia em que o backend mudar o formato ("Nome · CCOB").
   */
  const handleReatribuir = useCallback(
    async (analista: DirectoryUser, motivo: string) => {
      // Guarda no handler, não só no botão: o gate tem de valer mesmo se o
      // controle for alcançado por outro caminho.
      if (!canDecide) return;

      setReatribuindoBusy(true);
      try {
        await reatribuirPreviaFn(opportunityId, {
          analistaId: analista.id,
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        });
        setReatribuindo(false);
        addToast(
          `Análise prévia reatribuída para ${analista.name}.`,
          'success',
        );
        const atualizada = await getGarantia(opportunityId);
        setGarantia(atualizada);
      } catch (err: unknown) {
        // A frase do backend é a que nomeia o conserto (o 422 "esse id não é um
        // analista CCOB"); o modal FICA aberto para a pessoa corrigir.
        addToast(
          err instanceof Error
            ? err.message
            : 'Falha ao reatribuir a análise prévia.',
          'error',
        );
      } finally {
        setReatribuindoBusy(false);
      }
    },
    [canDecide, reatribuirPreviaFn, opportunityId, addToast, getGarantia],
  );

  /**
   * Reatribuição do fluxo de garantia (roteamento da SNEG — 20/09/2026).
   *
   * ⚠️ **Relê a garantia, e não faz flip otimista**, pela mesma razão da irmã: o
   * TEXTO que a meta escreve (`responsavelGarantia`) é composto no read model, e
   * remontá-lo aqui seria uma segunda cópia da regra.
   */
  const handleReatribuirSneg = useCallback(
    async (analista: DirectoryUser, motivo: string) => {
      // Guarda no handler, não só no botão: o gate tem de valer mesmo se o
      // controle for alcançado por outro caminho.
      if (!canReatribuirSneg) return;

      setReatribuindoSnegBusy(true);
      try {
        await reatribuirSnegFn(opportunityId, {
          analistaId: analista.id,
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        });
        setReatribuindoSneg(false);
        addToast(
          `Fluxo de garantia reatribuído para ${analista.name}.`,
          'success',
        );
        const atualizada = await getGarantia(opportunityId);
        setGarantia(atualizada);
      } catch (err: unknown) {
        // A frase do backend nomeia o conserto (o 422 "esse id não é um analista
        // SNEG", ou "o fluxo ainda não começou"); o modal FICA aberto.
        addToast(
          err instanceof Error
            ? err.message
            : 'Falha ao reatribuir o fluxo de garantia.',
          'error',
        );
      } finally {
        setReatribuindoSnegBusy(false);
      }
    },
    [canReatribuirSneg, reatribuirSnegFn, opportunityId, addToast, getGarantia],
  );

  // Action: salvar minuta
  const handleSalvarMinuta = useCallback(
    (netlexId: string) => {
      // Guard: handler rejects even when button is hidden (form submits on Enter)
      if (!canRegister) return;

      setActionBusy(true);
      salvarMinutaFn(opportunityId, { netlexId })
        .then((updated) => {
          setGarantia(updated);
          addToast('Número do Netlex salvo com sucesso.', 'success');
        })
        .catch((err: unknown) => {
          const msg =
            err instanceof Error ? err.message : 'Falha ao salvar a minuta.';
          addToast(msg, 'error');
        })
        .finally(() => setActionBusy(false));
    },
    [canRegister, salvarMinutaFn, opportunityId, addToast],
  );

  // ── Render states ──────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="py-10 text-center text-(length:--t-caption) text-(--color-text-muted)">
        Carregando garantia…
      </div>
    );
  }

  // Error state — never shows as empty; always names the failure.
  if (status === 'error' || !garantia) {
    return (
      <div
        role="alert"
        className="mt-2 rounded-[var(--radius-md)] border border-(--color-danger-bg) bg-(--color-danger-bg) px-5 py-4 text-(length:--t-caption) text-(--color-danger)"
      >
        {loadError ?? 'Não foi possível carregar a garantia. Recarregue a página.'}
      </div>
    );
  }

  const {
    estado,
    previa,
    minuta,
    oportunidade,
    naoSeAplica,
    indicacoes,
    /*
     * ⚠️ `valoresPorFinalidadeTexto` saiu deste destructure com o modal (TW-01):
     * ele é fato do CONJUNTO e agora é consumido pela PÁGINA da garantia, que o lê
     * do mesmo read model. Ele continua no `GarantiaView` — o que saiu foi o
     * consumidor aqui.
     */
  } = garantia;
  const garantiaPendenciaId = garantia.pendenciaIndicacaoId;
  const isWaiting = estado === EstadoGarantia.AGUARDANDO_INDICACAO;

  /*
   * `AGUARDANDO_INDICACAO` means two different things, and the screen used to
   * say only the first one.
   *
   * `reprovarPrevia` transitions
   * `EM_ANALISE_PREVIA → PREVIA_REPROVADA → AGUARDANDO_INDICACAO` on purpose
   * (the PRD returns the guarantee to the LT's ticket), so a REPROVED guarantee
   * lands back in the same state as one that was never indicated. The screen
   * then told the reader "O LT ainda não indicou a garantia" — false: the LT
   * indicated, the CCOB analysed and refused — and it dropped both the previous
   * indication and the reprovação parecer, which is the reason the guarantee
   * came back at all (VBR-630).
   *
   * ⚠️ O sinal é o HISTÓRICO DE VEREDITOS, não a contagem de indicações.
   * Até 01/09/2026 isto era `indicacoes.length > 0`, e a inferência estava
   * errada: o card da 01b grava indicação **sem** mover o subprocesso (quem
   * abre a prévia é o `garantia:indicar` do ticket), então toda garantia
   * cadastrada pelo card — o caminho normal do LT — abria a tela afirmando
   * "A CCOB reprovou a análise prévia" sobre uma oportunidade que a CCOB nunca
   * viu. Medido no stage em 01/09/2026, numa oportunidade criada minutos antes.
   *
   * `previaHistorico` é a evidência de que houve veredito: o backend só a
   * preenche com prévias CONCLUÍDAS (`resultado != null`), e a linha
   * `REPROVADA` sobrevive à dupla transição. Afirmar reprovação exige o fato,
   * nunca uma contagem que também é verdadeira sem ela.
   */
  const previaHistorico = garantia.previaHistorico ?? [];
  const houveReprovacao = previaHistorico.some(
    (h) => h.resultado === ResultadoPrevia.REPROVADA,
  );
  const isReindicacao = isWaiting && !naoSeAplica && houveReprovacao;
  /*
   * O terceiro estado, que não existia: há indicação registrada (pelo card) e
   * nenhuma reprovação. Não é reindicação, e também não é "o LT ainda não
   * indicou" — o que falta é ENVIAR a indicação pelo ticket, que é o gesto que
   * confere os documentos de etapa e abre a prévia.
   */
  const isIndicacaoNaoEnviada =
    isWaiting && !naoSeAplica && !houveReprovacao && indicacoes.length > 0;
  const isPrimeiraIndicacao = isWaiting && !naoSeAplica && indicacoes.length === 0;

  return (
    <>
      {/* ── Head ──────────────────────────────────────────────────────── */}
      <div className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5.5 py-5">
        <div className="flex flex-wrap items-center gap-2.5 text-[14px]">
          <StatusPill variant={garantia.estadoPill}>{garantia.estadoLabel}</StatusPill>
          <Link
            href={`/oportunidades/${encodeURIComponent(opportunityId)}`}
            className="ml-auto text-(--secondary-600) font-bold text-[14px] no-underline hover:underline"
          >
            ← Oportunidade
          </Link>
        </div>

        <h1 className="text-(length:--t-h2) font-bold mt-1.5 mb-0.5">
          Garantia · {oportunidade.clienteNome}
        </h1>

        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          {oportunidade.code} · {oportunidade.clienteCnpj} · {oportunidade.localizacao}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap gap-9 mt-4 pt-4 border-t border-(--color-border)">
          <MetaItem label="Concessão financeira" value={garantia.concessaoFinanceira} />
          {/*
            * O resumo da análise de perfil é CLICÁVEL e abre o detalhamento
            * (ADO 67948): esta linha dizia só "Concluído" (e, desde o ADO
            * 67880, "Concluído · Risco altíssimo"), e não havia superfície
            * nenhuma para os detalhes que a CCOB precisa ler antes de aprovar a
            * prévia.
            *
            * Valor ausente NÃO recebe gatilho: um botão sobre "—" abriria um
            * modal para dizer que não há análise, quando a própria linha já o
            * diz. Sem a permissão de leitura do perfil, o `Trigger` devolve o
            * texto puro (ver o docblock dele).
            */}
          <MetaItem
            label="Análise de perfil (pré-condição)"
            value={
              garantia.analisePerfilPrecondicao ? (
                <PerfilCreditoDetalhesTrigger
                  opportunityId={opportunityId}
                  subtitulo={`${oportunidade.code} · ${oportunidade.clienteNome}`}
                >
                  {garantia.analisePerfilPrecondicao}
                </PerfilCreditoDetalhesTrigger>
              ) : null
            }
          />
          <MetaItem
            label="Tipo de garantia"
            /* Only "a indicar" when nothing was ever indicated — after a
               reprovação the tipo IS known and is what the LT will correct. */
            value={isPrimeiraIndicacao ? 'A indicar pelo LT' : garantia.tipoLabel}
          />
          {/*
            * Quem faz a análise prévia — o analista da CCOB (04/09/2026;
            * renomeada e reescrita em 21/09/2026).
            *
            * > *"devemos renomear RESPONSÁVEL (PRÉVIA) por ANALISTA CCOB e
            * > devemos mostrar o nome do analista da CCOB atribuído àquela
            * > análise prévia. Caso não haja nenhum analista atribuído, devemos
            * > mostrar 'Aguardando distribuição' com o botão de reatribuir ao
            * > lado. Só deve ser possível reatribuir enquanto a análise prévia
            * > não tiver sido realizada."*
            *
            * ⚠️ **O valor era a ÁREA, não a pessoa.** O backend compunha
            * `Nome · CCOB` e caía no literal `CCOB` quando ninguém fora
            * designado — ou seja a linha respondia "quem?" com o nome de um
            * departamento, e a falta de analista virava um sufixo muted ao lado
            * dele. Agora o nome vem sozinho (o rótulo já diz a área) e a
            * ausência é o SELO, que substitui o valor em vez de acompanhá-lo.
            *
            * ⚠️ **Selo NEUTRO, nunca `danger`:** gerência sem analista
            * parametrizado é estado do processo, não falha — e não bloqueia
            * nada, a garantia segue em análise prévia. Mesmo rótulo e mesma
            * pill do analista da minuta, para o mesmo estado não ter dois nomes
            * no produto.
            */}
          <MetaItem
            label="Analista CCOB"
            value={
              <span className="inline-flex flex-wrap items-baseline gap-x-2">
                {garantia.responsavelPrevia ? (
                  <span data-testid="garantia-analista-ccob">
                    {garantia.responsavelPrevia}
                  </span>
                ) : (
                  <StatusPill
                    variant="neutral"
                    data-testid="garantia-atribuicao-pendente"
                  >
                    Aguardando distribuição
                  </StatusPill>
                )}
                {/*
                  * ⚠️ `podeReatribuirPrevia` é VEREDITO DO BACKEND — o mesmo
                  * predicado que a rota aplica (422 depois da prévia
                  * realizada). Aqui havia um `isEmAnalisePrevia(estado)`
                  * recalculado, ou seja uma segunda cópia da regra; a linha da
                  * SNEG logo abaixo já lia o veredito (`fluxoGarantiaIniciado`)
                  * pela mesma razão.
                  *
                  * ⚠️ Fechar o CTA não fecha o FATO: o nome — ou o selo — fica
                  * na tela depois da decisão. É quem analisou a prévia, e é
                  * registro.
                  */}
                {canDecide && garantia.podeReatribuirPrevia && (
                  <button
                    type="button"
                    data-testid="garantia-reatribuir-previa"
                    onClick={() => setReatribuindo(true)}
                    className={LINK_ACTION}
                  >
                    Reatribuir
                  </button>
                )}
              </span>
            }
          />
          {/*
            * Roteamento da SNEG (20/09/2026) — *"no topo da tela de garantias,
            * devemos mostrar qual Analista SNEG está atribuído àquele processo
            * de garantia, com a opção de reatribuir"*.
            *
            * ⚠️ A linha só EXISTE depois da aprovação da prévia, e quem decide é
            * `fluxoGarantiaIniciado` — **veredito do backend**, nunca um
            * `estado === 'PREVIA_APROVADA'` recalculado aqui: uma segunda cópia
            * da regra ofereceria o CTA onde a API responde 422. Antes disso não
            * há responsável, e renderizar "SNEG" afirmaria que a área assumiu um
            * processo que nem começou (a classe de defeito do `naoSeAplica` lido
            * como conclusão).
            *
            * ⚠️ Vai AO LADO de "Responsável (prévia)", nunca no lugar dela: quem
            * analisou a prévia e quem toca a garantia agora são perguntas
            * distintas, e colapsá-las apagaria a primeira.
            */}
          {garantia.fluxoGarantiaIniciado && (
            <MetaItem
              label="Analista SNEG (garantia)"
              value={
                <span
                  data-testid="garantia-responsavel-sneg"
                  className="inline-flex flex-wrap items-baseline gap-x-2"
                >
                  <span>{garantia.responsavelGarantia ?? '—'}</span>
                  {garantia.atribuicaoSneg.atribuicaoPendente && (
                    <span
                      data-testid="garantia-atribuicao-sneg-pendente"
                      className="text-(length:--t-small) font-normal text-(--color-text-muted)"
                    >
                      aguardando distribuição
                    </span>
                  )}
                  {canReatribuirSneg && (
                    <button
                      type="button"
                      data-testid="garantia-reatribuir-sneg"
                      onClick={() => setReatribuindoSneg(true)}
                      className={LINK_ACTION}
                    >
                      Reatribuir
                    </button>
                  )}
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div className="mt-[18px] min-[961px]:grid min-[961px]:grid-cols-[1fr_320px] min-[961px]:gap-[22px] min-[961px]:items-start">

        {/* Left column */}
        <div className="min-w-0">

          {/*
            Bloco: aguardando o LT.

            Sobreviveu ao fim do bloco "Indicação e tipo de garantia" (spec
            28/08/2026 §8.1): a faixa e o "Exibir pendência" são o caminho do
            usuário, e a indicação que a CCOB reprovou continua logo abaixo, no
            card — era ele que o bloco antigo repetia inline.

            `AGUARDANDO_INDICACAO` significa TRÊS coisas: nunca indicada;
            indicada no card e ainda não enviada pelo ticket; e reprovada e
            devolvida (`reprovarPrevia` faz a dupla transição de propósito).
            Dizer só a primeira afirmava "o LT ainda não indicou" para quem
            indicou e foi recusado (VBR-630); derivar a terceira da CONTAGEM de
            indicações afirmava reprovação sobre garantia que a CCOB nunca viu
            (medido no stage em 01/09/2026) — ver `houveReprovacao`.
          */}
          {isWaiting && !naoSeAplica && (
            <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] mb-4">
              <div
                data-testid={
                  isReindicacao
                    ? 'garantia-aguardando-reindicacao'
                    : isIndicacaoNaoEnviada
                      ? 'garantia-aguardando-envio-indicacao'
                      : 'garantia-aguardando-indicacao'
                }
                className="flex gap-3.5 items-start bg-(--yellow-100) border border-(--yellow-300) rounded-[var(--radius-xs)] px-[18px] py-4"
              >
                <div>
                  <div className="font-bold text-(length:--t-caption) text-(--yellow-700)">
                    {isReindicacao
                      ? 'Análise prévia reprovada — aguardando correção do LT'
                      : isIndicacaoNaoEnviada
                        ? 'Aguardando o envio da indicação pelo LT'
                        : 'Aguardando preenchimento do LT'}
                  </div>
                  <div className="text-[14px] text-(--color-text-muted) mt-1">
                    {isReindicacao
                      ? 'A CCOB reprovou a análise prévia e a indicação voltou ao LT para correção. As garantias abaixo são as da última indicação; o parecer da reprovação está no bloco "Análise Prévia".'
                      : isIndicacaoNaoEnviada
                        ? 'As garantias abaixo já foram cadastradas, mas a indicação ainda não foi enviada pelo ticket de pendência. A análise prévia começa após o envio.'
                        : 'O LT ainda não indicou a garantia (tipo, imóvel, categoria e valor) nem anexou os documentos. A análise prévia só começa após a indicação.'}
                  </div>
                </div>
              </div>
              {/* Navegação para o ticket — leitura, não é ação gateada. */}
              {garantiaPendenciaId && (
                <Link
                  href={`/pendencias/${encodeURIComponent(garantiaPendenciaId)}`}
                  className="mt-3.5 inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) no-underline transition hover:bg-(--neutral-50)"
                >
                  Exibir pendência
                </Link>
              )}
            </div>
          )}

          {/*
            Bloco: "não se aplica" — o subprocesso nunca incide (sem
            antecipação/mútuo, ou encerrado antes da indicação). A faixa de
            espera prometeria uma indicação que ninguém vai pedir.
          */}
          {isWaiting && naoSeAplica && (
            <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] mb-4">
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                {garantia.naoSeAplicaMotivo ??
                  'Não se aplica — esta oportunidade não exige garantia.'}
              </p>
            </div>
          )}

          {/*
            Bloco: Garantias indicadas — o MESMO card da tela da oportunidade
            (spec 28/08/2026 §8.1).

            Antes esta tela tinha uma lista própria, mais pobre: tipo e uma linha
            de meta, sem documentos, sem utilização e sem ação. A mesma
            informação aparecia de dois jeitos em duas telas, e foi essa
            divergência que o cliente relatou.

            Somente leitura para a CCOB por dois caminhos que já existem —
            `GarantiaIndicar` não a inclui, e `indicacoesEditaveis` é falso em
            `EM_ANALISE_PREVIA`. O card resolve os dois sozinho.
          */}
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] mb-4">
            <h3 className="text-(length:--t-h4) font-bold mb-3.5">Garantias indicadas</h3>

            <GarantiasIndicadasCard
              opportunityId={opportunityId}
              {...(loadIndicacoes ? { load: loadIndicacoes } : {})}
              /*
               * TW-01 — a linha é uma PORTA para a página da garantia, não um
               * modal. Quem monta a rota é esta tela, dona dela; o card só a
               * recebe.
               *
               * ⚠️ **Sem `withBasePath`.** O card entrega este valor a um
               * `next/link`, e o Next já prefixa o `basePath` sozinho (é o que
               * o docstring de `lib/base-path.ts` diz na primeira linha).
               * Aplicá-lo aqui duplicava o prefixo DEPOIS do helper — a
               * idempotência dele não alcança o que o Next acrescenta —, e o
               * "Abrir →" caía em "Página não encontrada":
               * `/stage/gestor-oportunidades-web/stage/gestor-oportunidades-web/…`.
               * Invisível no laptop (`NEXT_PUBLIC_BASE_PATH` vazio) e em teste
               * de componente; medido no stage em 01/09/2026.
               */
              linkDaGarantia={(g) =>
                `/oportunidades/${encodeURIComponent(opportunityId)}/garantia/${encodeURIComponent(g.id)}`
              }
            />
          </div>

          {/* Block: Análise Prévia — prototype has no "who" line here.
              Omitted entirely when the subprocess never applies (no garantia
              row) — the indicação block already carries the reason. */}
          {!(isWaiting && naoSeAplica) && (
            <div
              ref={previaFormRef}
              className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] mb-4"
            >
              <h3 className="text-(length:--t-h4) font-bold mb-1">
                Análise prévia do imóvel
              </h3>

              <PreviaBlock
                estado={estado}
                previa={previa}
                naoSeAplica={naoSeAplica}
                naoSeAplicaMotivo={garantia.naoSeAplicaMotivo}
                onSubmit={handleConfirmarPrevia}
                canDecide={canDecide}
                busy={actionBusy}
              />
            </div>
          )}

          {/* Block: Histórico de análises prévias.
              Only when there is more than nothing to show. A reprovação sends
              the guarantee back and the CCOB opens a NEW prévia on the next
              round, so the table accumulates one row per round and the screen
              used to read only the newest — every earlier verdict, including
              the one that caused the current round, was invisible (VBR-630). */}
          {previaHistorico.length > 0 && (
            <div
              data-testid="garantia-previa-historico"
              className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] mb-4"
            >
              <h3 className="text-(length:--t-h4) font-bold mb-1">
                Histórico de análises prévias
              </h3>
              <p className="text-[12px] font-bold uppercase tracking-[.3px] text-(--color-text-muted) mb-3">
                CCOB · mais recente primeiro
              </p>

              <ol className="list-none p-0 m-0 flex flex-col gap-3">
                {previaHistorico.map((entrada, idx) => (
                  <li
                    key={`${entrada.concluidaEm ?? 'sem-data'}-${idx}`}
                    className="rounded-[var(--radius-xs)] border border-(--color-border) px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* The pill comes from the backend catalogue
                          (`RESULTADO_PREVIA_PILL`); a resultado this build does
                          not know keeps the label and loses the colour, rather
                          than being painted a guessed one. */}
                      {entrada.resultadoPill ? (
                        <StatusPill variant={entrada.resultadoPill}>
                          {entrada.resultadoLabel}
                        </StatusPill>
                      ) : (
                        <span className="text-(length:--t-caption) font-bold">
                          {entrada.resultadoLabel}
                        </span>
                      )}
                      {entrada.concluidaEm && (
                        <span className="text-[13px] text-(--color-text-muted)">
                          {formatInstantDateTimeBR(entrada.concluidaEm)}
                        </span>
                      )}
                    </div>
                    <p className="text-(length:--t-caption) mt-2 whitespace-pre-line">
                      {entrada.parecer}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Block: Minuta (only PREVIA_APROVADA / MINUTA_EM_ANDAMENTO) */}
          {showMinuta(estado) && (
            <div
              id="minutaBlock"
              className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] mb-4"
            >
              <h3 className="text-(length:--t-h4) font-bold mb-1">
                Minuta de garantia
              </h3>
              <p className="text-[12px] font-bold uppercase tracking-[.3px] text-(--color-text-muted) mb-3">
                SNEG · CCOB (validação) · Amaral Maia
              </p>

              {/* actionBusy is covered by the full-screen overlay — swapping
                  canRegister off during busy would flip the form to read-only */}
              <MinutaBlock
                minuta={minuta}
                onSave={handleSalvarMinuta}
                canRegister={canRegister}
              />
            </div>
          )}
        </div>

        {/* Right column — sticky panel */}
        <aside className="min-w-0 min-[961px]:sticky min-[961px]:top-4 flex flex-col gap-3.5">
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
            <div className="text-(length:--t-caption) font-bold mb-2.5">
              Oportunidade
            </div>

            <PanelRow label="Cliente" value={oportunidade.clienteNome} />
            {/*
              Mesmo defeito da 360º: o cliente pode ser pessoa física, e
              `garantia-mapping` já mascara o valor por contagem de dígitos
              (`formatTaxId`) — só o rótulo era fixo. `taxIdLabel` conta os
              dígitos do valor JÁ mascarado, que são os mesmos, e devolve o
              rótulo neutro quando não há nenhum (o mapper deixa passar "—").
            */}
            <PanelRow
              label={taxIdLabel(oportunidade.clienteCnpj)}
              value={oportunidade.clienteCnpj}
            />
            <PanelRow label="Código" value={oportunidade.codigoDisplay} />
            <PanelRow label="Localização" value={oportunidade.localizacao} />
            <PanelRow label="Valor" value={oportunidade.valorBrl} />
            {/* Prototype renders the fase as a pill (`.pill.i`), not plain text */}
            <div className="flex justify-between gap-2.5 text-(length:--t-caption) py-2 border-b border-(--color-border)">
              <span className="text-(--color-text-muted)">Fase</span>
              <StatusPill variant="info">{oportunidade.faseLabel}</StatusPill>
            </div>
            <PanelRow label="LT responsável" value={oportunidade.ltResponsavel} />

            <Link
              href={`/oportunidades/${encodeURIComponent(opportunityId)}`}
              className="mt-3 block w-full rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-center text-(length:--t-caption) font-bold text-(--secondary-500) no-underline transition hover:bg-(--neutral-50)"
            >
              Exibir oportunidade
            </Link>
          </div>
        </aside>
      </div>

      {/* Detalhes de uma garantia (spec 28/08/2026 §8.1) */}

      {/*
        Seletor de reatribuição da análise prévia (roteamento da CCOB —
        04/09/2026).

        Reusa o `AnalistaPickerModal` da Governança: é o MESMO gesto ("escolha
        alguém do grupo do Entra deste perfil"), com o recorte trocado para
        `CCOB` — uma segunda lista escrita à mão divergiria dela, e o seletor
        acabaria oferecendo ids que a escrita recusa (o defeito medido no ADO
        67877 e no 67910).
      */}
      {reatribuindo && garantia && (
        <ReatribuirPreviaModal
          gerencia={garantia.atribuicao.gerencia}
          analistaAtualId={garantia.atribuicao.analistaId}
          busy={reatribuindoBusy}
          search={searchCcobAnalysts}
          onClose={() => setReatribuindo(false)}
          onConfirm={(analista, motivo) => void handleReatribuir(analista, motivo)}
        />
      )}

      {/*
        * Reatribuição do FLUXO DE GARANTIA (20/09/2026) — modal IRMÃO do de
        * cima. Dois modais, e não um com um seletor de área: cada um lê um
        * diretório diferente (grupo do Entra do perfil) e chama uma rota com
        * `@Roles` próprio.
        */}
      {reatribuindoSneg && (
        <ReatribuirSnegModal
          gerencia={garantia.atribuicaoSneg.gerencia}
          analistaAtualId={garantia.atribuicaoSneg.analistaId}
          busy={reatribuindoSnegBusy}
          searchAnalistas={searchSnegAnalysts}
          onClose={() => setReatribuindoSneg(false)}
          onConfirm={(analista, motivo) =>
            void handleReatribuirSneg(analista, motivo)
          }
        />
      )}

      {/* Confirm dialog */}
      {confirm.dialog}

      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Loading overlay for actions */}
      {actionBusy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20" />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Reatribuição da análise prévia (roteamento da CCOB — 04/09/2026)
// ---------------------------------------------------------------------------

/**
 * Escolhe o analista da CCOB que assume a análise prévia desta garantia.
 *
 * Existe porque a parametrização da Governança vale **daí em diante**: quem
 * distribui lê `ccob_assignments` no momento em que a garantia é promovida à
 * prévia, então garantia já em curso não se move quando a tabela muda. Sem esta
 * ação, uma atribuição pendente — gerência sem analista quando a prévia abriu —
 * não teria conserto pela tela, e a automação nova criaria um beco sem saída.
 *
 * O motivo é OPCIONAL (vai para a trilha SOX quando informado), como na
 * reatribuição da SNEG: exigi-lo tornaria a correção de uma atribuição pendente
 * mais burocrática que o problema que ela conserta.
 */
function ReatribuirPreviaModal({
  gerencia,
  analistaAtualId,
  busy,
  search,
  onClose,
  onConfirm,
}: {
  gerencia: string | null;
  analistaAtualId: string | null;
  busy: boolean;
  search: (query: string) => Promise<DirectoryUser[]>;
  onClose: () => void;
  onConfirm: (analista: DirectoryUser, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <AnalistaPickerModal
      title="Reatribuir a análise prévia"
      subtitle={
        gerencia
          ? `${gerencia} · perfil CCOB`
          : 'Perfil CCOB · gerência não identificada nesta oportunidade'
      }
      initialSelectedId={analistaAtualId}
      search={search}
      onClose={onClose}
      footer={(selected) => (
        <>
          <label
            htmlFor="garantia-reatribuir-motivo"
            className="mb-1 block text-(length:--t-caption) font-bold"
          >
            Motivo (opcional)
          </label>
          <input
            id="garantia-reatribuir-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: analista de férias"
            className="mb-3 w-full rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption)"
          />
          <p className="mb-3 text-(length:--t-caption) text-(--color-text-muted)">
            A pendência da análise prévia passa para o analista escolhido, e a
            troca é registrada no log da oportunidade. A parametrização da
            gerência não muda — para isso, use a Governança.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="confirmar-reatribuir-previa"
              onClick={() => {
                if (selected) onConfirm(selected, motivo);
              }}
              disabled={busy || !selected}
              className="rounded-[var(--radius-xs)] border border-transparent bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Reatribuindo…' : 'Reatribuir'}
            </button>
          </div>
        </>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Reatribuição do fluxo de garantia (roteamento da SNEG — 20/09/2026)
// ---------------------------------------------------------------------------

/**
 * Escolhe o analista da SNEG que assume o fluxo de garantia desta oportunidade.
 *
 * Existe pela mesma razão do irmão da CCOB: a parametrização da Governança vale
 * **daí em diante** — quem distribui lê `sneg_assignments` (etapa `GARANTIA`) no
 * momento em que a CCOB aprova a prévia, então processo já atribuído não se move
 * quando a tabela muda. Sem esta ação, uma atribuição pendente (gerência sem
 * analista naquele balde quando a prévia foi aprovada) não teria conserto pela
 * tela, e a automação nova criaria um beco sem saída.
 *
 * ⚠️ **Modal SEPARADO, e não um parâmetro do outro.** O diretório é o grupo do
 * Entra do perfil **SNEG** e a rota tem `@Roles` próprio; um modal só com um
 * seletor de área ofereceria a lista errada para metade dos casos.
 *
 * ⚠️ **Os botões vêm de `components/button`**, não de classes locais: o par
 * escrito à mão no modal vizinho é o desvio registrado do `.btn-ghost`/
 * `.btn-primary` do protótipo (borda cinza em vez de verde, sem `focus-visible`)
 * — copiá-lo aqui criaria a terceira cópia do mesmo defeito.
 */
function ReatribuirSnegModal({
  gerencia,
  analistaAtualId,
  busy,
  searchAnalistas,
  onClose,
  onConfirm,
}: {
  gerencia: string | null;
  analistaAtualId: string | null;
  busy: boolean;
  searchAnalistas: (query: string) => Promise<DirectoryUser[]>;
  onClose: () => void;
  onConfirm: (analista: DirectoryUser, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <AnalistaPickerModal
      title="Reatribuir o fluxo de garantia"
      subtitle={
        gerencia
          ? `${gerencia} · perfil SNEG`
          : 'Perfil SNEG · gerência não identificada nesta oportunidade'
      }
      initialSelectedId={analistaAtualId}
      search={searchAnalistas}
      onClose={onClose}
      footer={(selected) => (
        <>
          <label
            htmlFor="garantia-reatribuir-sneg-motivo"
            className="mb-1 block text-(length:--t-caption) font-bold"
          >
            Motivo (opcional)
          </label>
          <input
            id="garantia-reatribuir-sneg-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: analista de férias"
            className="mb-3 w-full rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption)"
          />
          <p className="mb-3 text-(length:--t-caption) text-(--color-text-muted)">
            O fluxo de garantia desta oportunidade passa para o analista
            escolhido, e a troca é registrada no log da oportunidade. A
            parametrização da gerência não muda — para isso, use a Governança.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={SECONDARY_OUTLINE_BTN}
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="confirmar-reatribuir-sneg"
              onClick={() => {
                if (selected) onConfirm(selected, motivo);
              }}
              disabled={busy || !selected}
              className={PRIMARY_ACTION_BTN}
            >
              {busy ? 'Reatribuindo…' : 'Reatribuir'}
            </button>
          </div>
        </>
      )}
    />
  );
}
